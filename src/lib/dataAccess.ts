/**
 * Data Access Layer — Law 8 Idempotency & Mutation Wrapper
 *
 * Enforces:
 *   - Every user-written mutation automatically carries a unique `client_uuid` (UUIDv4)
 *   - Duplicate submissions / network retries are rejected cleanly
 *   - Immutable tables (payments, audit logs, deposit movements) reject UPDATE/DELETE at the API layer
 */

import { supabase } from './supabase'
import type { Database } from '../types/database'
import { enqueueMutation } from './offlineQueue'

/** Generates standard UUIDv4 in browser/node */
export function generateClientUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Inserts a record with mandatory `client_uuid` injection for idempotency */
export async function idempotentInsert<
  TTable extends keyof Database['public']['Tables'],
  TInsert extends Database['public']['Tables'][TTable]['Insert']
>(
  table: TTable,
  payload: Omit<TInsert, 'client_uuid'> & { client_uuid?: string }
) {
  const finalPayload = {
    ...payload,
    client_uuid: payload.client_uuid || generateClientUuid(),
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn(`[DataAccess] Device offline. Queuing insert for ${String(table)}.`)
    await enqueueMutation(String(table), 'insert', finalPayload, finalPayload.client_uuid)
    return { data: finalPayload, error: null, queued: true } // Optimistic response with queued discriminant
  }

  const { data, error } = await (supabase.from(table as string) as any).insert(finalPayload).select().single()

  if (error) {
    // If it's a network error from Supabase, queue it instead
    if (error.message === 'Failed to fetch' || error.code === '408') {
       console.warn(`[DataAccess] Network failure during insert. Queuing ${String(table)}.`)
       await enqueueMutation(String(table), 'insert', finalPayload, finalPayload.client_uuid)
       return { data: finalPayload, error: null, queued: true }
    }

    // Detect duplicate idempotency violation
    if (error.code === '23505' && error.message.includes('client_uuid')) {
      console.warn(`[DataAccess] Idempotent request duplicate detected for table ${String(table)}. Fetching existing record.`)
      const existing = await (supabase.from(table as string) as any).select().eq('client_uuid', finalPayload.client_uuid).single()
      return { ...existing, queued: false }
    }
    throw new Error(`[DataAccess] Insert failed on ${String(table)}: ${error.message}`)
  }

  return { data, error: null, queued: false }
}

/**
 * Updates a record (prohibited on immutable tables).
 *
 * `clientUuid` is Law 8's idempotency key **for this user action**, and must be
 * generated at the point the user acted — `newClientUuid()` in `./supabase`, whose
 * own contract says it plainly: "Generate once at the point the user acts, not at
 * send time — the whole point is that a replay of the SAME action carries the SAME
 * key." It is what the offline queue de-duplicates the envelope on, so a re-submitted
 * save queues once instead of twice.
 *
 * It is deliberately NOT written into the update payload. `<table>.client_uuid` is
 * the ROW's insert-time key and carries a unique constraint (`<table>_client_uuid_key`,
 * e.g. 0002_bookings.sql:31); stamping a new one on every edit would destroy the
 * insert-side dedup that `idempotentInsert` depends on and collide the instant two
 * rows were edited under one action key.
 *
 * Omitting it mints a fresh key, which keeps the envelope well-formed but gives the
 * call NO replay protection — a fallback for callers that have no action key of their
 * own (today: the Booqable pull bridge, `booqable/sync.ts`'s `updateBooqableRow`,
 * which replays are already guarded against by `external_refs`). Screens must always
 * pass one.
 */
export async function safeUpdate<
  TTable extends keyof Database['public']['Tables'],
  TUpdate extends Database['public']['Tables'][TTable]['Update']
>(
  table: TTable,
  id: string,
  payload: TUpdate,
  clientUuid?: string
) {
  // `booking_stage_transitions` joins the list on the same grounds as the other
  // three: `0002_bookings.sql:485` revokes update and delete on it for everyone
  // including Owner — "a wrong transition is corrected by inserting a reversal
  // row". Without this line the API layer would let an edit through and only
  // Postgres would stop it.
  const immutableTables = ['payments', 'deposit_movements', 'audit_events', 'booking_stage_transitions']
  if (immutableTables.includes(String(table))) {
    throw new Error(`[DataAccess] Mutation Law 4 Violation: ${String(table)} is immutable and cannot be updated.`)
  }

  // Resolved ONCE per call, not once per queueing branch: both branches below must
  // enqueue under the caller's stable action key when it supplied one.
  const actionUuid = clientUuid ?? generateClientUuid()
  if (clientUuid === undefined) {
    console.warn(`[DataAccess] safeUpdate('${String(table)}') was called without a client_uuid — this write has no replay protection (Law 8). Pass the action key from the point the user acted.`)
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn(`[DataAccess] Device offline. Queuing update for ${String(table)} id=${id}.`)
    await enqueueMutation(String(table), 'update', { ...payload, id }, actionUuid)
    return { data: { ...payload, id }, error: null, queued: true } // Optimistic response with queued discriminant
  }

  const { data, error } = await (supabase.from(table as string) as any).update(payload).eq('id', id).select().single()

  if (error) {
    if (error.message === 'Failed to fetch' || error.code === '408') {
       console.warn(`[DataAccess] Network failure during update. Queuing ${String(table)}.`)
       await enqueueMutation(String(table), 'update', { ...payload, id }, actionUuid)
       return { data: { ...payload, id }, error: null, queued: true }
    }
    throw new Error(`[DataAccess] Update failed on ${String(table)}: ${error.message}`)
  }

  return { data, error: null, queued: false }
}

/* ═══════════════════════════════════════════════════════════════════════
 * Booqable source switch — spec §4 ("dataAccess.ts gains a source switch")
 * ADDITIVE ONLY. `idempotentInsert`/`safeUpdate` above are NOT modified.
 *
 * Why the switch cannot live inside them: `src/lib/booqable/sync.ts` (the
 * bridge) already calls `idempotentInsert`/`safeUpdate` directly, in BOTH
 * directions —
 *   - pull (Booqable → local mirror): `writeBooqableRow`/`updateBooqableRow`
 *     write `products`/`bundles`/`bundle_items`/`product_units`/
 *     `external_invoices`/`clients`/`bookings`/`booking_lines`/… straight
 *     through these two functions (sync.ts's own header: "Calls the REAL
 *     `idempotentInsert`… so Law 9/offline-queue behaviour is identical,
 *     not reimplemented").
 *   - push (local → Booqable, the 6-op write-back allowlist, sync.ts §11):
 *     `pushClientCreate`/`pushClientContactUpdate`/`pushOrderCreate`/etc.
 *     ALSO call `idempotentInsert`/`safeUpdate` directly for their local
 *     write, then separately enqueue `sync_outbox`.
 * A redirect placed inside `idempotentInsert`/`safeUpdate` themselves would
 * therefore either (a) infinite-loop the instant a push* function's own
 * internal call re-entered the same switch, or (b) break every pull-phase
 * write the instant a read-only table's redirect turned into a guard —
 * `writeBooqableRow('products', …)` calling a guarded `idempotentInsert`
 * would reject the very write that keeps the local mirror in sync. Neither
 * is safe, so the switch lives in NEW, additive, opt-in wrapper functions
 * instead — explicitly permitted by this task's own brief ("or in new thin
 * wrapper functions if that is cleaner"). `idempotentInsert`/`safeUpdate`'s
 * behaviour, and every existing call site (including every one inside
 * `booqable/sync.ts`), is completely untouched — screens and engines do not
 * need to change.
 *
 * A screen or engine NOT yet using the dedicated bridge functions can call
 * `insertViaSourceSwitch`/`updateViaSourceSwitch` below instead of the raw
 * functions above, to get a clear, fail-fast error — instead of a silent
 * local write that never reaches Booqable and is quietly overwritten by the
 * next pull — whenever the table it targets is Booqable-mastered.
 *
 * Deletion at month 7: everything below this comment is self-contained;
 * deleting it (and `src/lib/booqable/`) leaves `idempotentInsert`/
 * `safeUpdate` and every other export above completely unaffected.
 * ═══════════════════════════════════════════════════════════════════════ */

export type DataSource = 'os-native' | 'booqable'

/**
 * Spec §5.1 — Booqable-mastered local tables the OS never writes to
 * directly; `booqable/sync.ts`'s pull phases (§3-§9) are the ONLY
 * legitimate writer, via the untouched `idempotentInsert`/`safeUpdate`
 * above. Table names here are the REAL local tables `booqable/sync.ts`
 * writes (its own header: the conceptual spec names like
 * "equipment"/"equipment_models" do not match `database.ts` — documented
 * drift, not this file's to fix).
 *
 * Deliberately excludes the spec's "payments mirror" / "settings mirror"
 * entities (locations/tax_rates/coupons/employees/payment_methods) — no
 * confirmed local table name for any of them exists anywhere in this
 * codebase yet; guessing one would be exactly the invented product decision
 * CLAUDE.md forbids. Also excludes `payments`/`deposit_movements` — already
 * governed by the `immutableTables` guard above, and their Booqable-vs-OS
 * ownership is a live, unresolved tension `booqable/sync.ts`'s own header
 * flags (TODO(decision)), not settled here.
 */
const BOOQABLE_READ_ONLY_TABLES: ReadonlySet<string> = new Set([
  'products', // Booqable products/product_groups
  'bundles', // Booqable bundles/collections
  'bundle_items',
  'product_units', // Booqable stock_items/barcodes
  'external_invoices', // Booqable documents — Booqable is sole issuer, spec §5.3
  /*
   * ⚠ `inventory_reservations` WAS here, and was REMOVED 16 Aug 2026 by an
   * explicit ruling — PLAN.md §4.30(a). Do not restore it without re-reading
   * that section; its absence is a decision, not an omission.
   *
   * Spec §5.1 called it Booqable-mastered, writable "indirectly via order
   * writes only". Holding to that made Confirm-time serial assignment
   * unbuildable, and that in turn blocked Packing, Handover, Return, Reset and
   * Evidence equally — nothing in the app could write an assignment anywhere
   * safe. The two candidate tables, measured live:
   *
   *   - `inventory_reservations` — carries the ONLY double-booking defence in
   *     the schema, `exclude using gist (asset_id with =, period with &&)
   *     where (released_at is null and asset_id is not null)` — but was refused
   *     to the OS by this very set;
   *   - `booking_line_units` — writable, and has NO overlap protection at all.
   *
   * So the protected table could not be written and the writable one was not
   * protected. The ruling took the option where the DATABASE refuses a
   * double-booking rather than the app trying not to make one.
   *
   * The OS schema was plainly designed for this all along:
   * `inventory_reservations.reserved_at` is documented as *"Written by the
   * Confirm transaction, never earlier"* (`0003:1483`), and the table carries
   * four `TRIGGER REQUIRED` comments describing Confirm-time behaviour. RLS was
   * already open to it too — `inventory_reservations_all` is the booking-desk
   * five, the same set as `rental.confirm`.
   *
   * This DOES override a written spec, and that is the point of recording it
   * here rather than quietly deleting a line. If the Booqable bridge is ever
   * switched on, §5.1 and §4.30(a) must be reconciled deliberately.
   */
])

/**
 * Spec §5.1 — Booqable-mastered local tables the OS MAY write to, but only
 * through the six guarded, allowlisted functions `booqable/sync.ts` §11
 * already exports (`pushClientCreate`, `pushClientContactUpdate`,
 * `pushOrderCreate`, `pushOrderReserve`, `pushOrderStart`, `pushOrderStop`)
 * — each carries a guard (duplicate check, discount gate, availability,
 * workspace sign-off) that a generic `(table, payload)` call has no way to
 * evaluate itself, so this switch never attempts to synthesize one; it only
 * refuses the generic call and names the real function to use instead.
 */
const BOOQABLE_BRIDGE_WRITABLE_TABLES: ReadonlySet<string> = new Set([
  'clients', // Booqable customers
  'bookings', // Booqable orders
  'booking_lines', // Booqable order_lines
])

/** Looks up which system owns `table`, per the spec §5 ownership map. Any table not named in either set above is `'os-native'` — the default, and the overwhelming majority of `Database['public']['Tables']`. */
export function resolveDataSource(table: string): DataSource {
  return BOOQABLE_READ_ONLY_TABLES.has(table) || BOOQABLE_BRIDGE_WRITABLE_TABLES.has(table) ? 'booqable' : 'os-native'
}

function booqableRedirectMessage(table: string): string {
  if (BOOQABLE_BRIDGE_WRITABLE_TABLES.has(table)) {
    return `[DataAccess] Booqable Ownership: '${table}' is Booqable-mastered (spec §5.1) and OS writes to it are only allowed through the guarded push functions in src/lib/booqable/sync.ts (pushClientCreate / pushClientContactUpdate / pushOrderCreate / pushOrderReserve / pushOrderStart / pushOrderStop) — call one of those instead of a generic write.`
  }
  return `[DataAccess] Booqable Ownership Violation: '${table}' is Booqable-mastered and read-only from the OS (spec §5.1/§5.3) — only src/lib/booqable/sync.ts's pull phases may write it.`
}

/**
 * Source-switched insert: an `os-native` table behaves EXACTLY like
 * `idempotentInsert` (it IS `idempotentInsert`, called unchanged, so Law
 * 8/9 and the offline queue behave identically); a Booqable-mastered table
 * throws immediately, naming the correct bridge function, instead of
 * silently writing a row that never reaches Booqable and gets overwritten
 * on the next pull.
 */
export async function insertViaSourceSwitch<
  TTable extends keyof Database['public']['Tables'],
  TInsert extends Database['public']['Tables'][TTable]['Insert']
>(
  table: TTable,
  payload: Omit<TInsert, 'client_uuid'> & { client_uuid?: string }
) {
  if (resolveDataSource(String(table)) === 'os-native') {
    return idempotentInsert(table, payload)
  }
  throw new Error(booqableRedirectMessage(String(table)))
}

/**
 * Source-switched update: an `os-native` table behaves EXACTLY like
 * `safeUpdate` (it IS `safeUpdate`, called unchanged — including its
 * `immutableTables` guard); a Booqable-mastered table throws immediately,
 * naming the correct bridge function.
 */
export async function updateViaSourceSwitch<
  TTable extends keyof Database['public']['Tables'],
  TUpdate extends Database['public']['Tables'][TTable]['Update']
>(
  table: TTable,
  id: string,
  payload: TUpdate,
  clientUuid?: string
) {
  if (resolveDataSource(String(table)) === 'os-native') {
    return safeUpdate(table, id, payload, clientUuid)
  }
  throw new Error(booqableRedirectMessage(String(table)))
}
