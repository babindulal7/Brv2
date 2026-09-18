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
import { captureError } from './monitoring'
import { IS_MOCK } from './supabase'

/**
 * Whether a write should be diverted into the Dexie outbox instead of being
 * sent now.
 *
 * ⛔ This used to be a bare `!navigator.onLine`, which was wrong the moment the
 * product went local-first (16 Aug 2026). The local corpus in `lib/mock/` is
 * **always reachable** — it is an in-memory store plus a localStorage overlay,
 * with no network between the caller and the data. Diverting a write into the
 * outbox because the laptop's wifi dropped would strand it in a queue destined
 * for a Supabase that is not currently the source of truth, and hand the caller
 * an optimistic success for a row the store never received.
 *
 * That is not theoretical. `BUG_SWEEP_ENGINES_v1.1` E-P1-1 records that
 * `enqueueMutation` dedupes on `table+action+clientUuid` and returns `false`,
 * which `safeUpdate` discards — so one action writing five booking lines
 * enqueues the first and silently drops four. E-P1-2 records that a mutation
 * left in `'syncing'` when a tab closes is never selected by any drain again.
 *
 * Those findings are still open, and this guard does not fix them. It takes the
 * queue **off the write path entirely** while the store is local, which is
 * cheaper and safer than fixing a mechanism nothing currently needs. When
 * Supabase becomes the writer again, `IS_MOCK` goes false, the queue comes back
 * onto the path, and E-P1-1/2/3 must be closed **before** that happens.
 */
function shouldQueueOffline(): boolean {
  if (IS_MOCK) return false
  return typeof navigator !== 'undefined' && !navigator.onLine
}

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

export interface InsertOptions {
  /**
   * Read the inserted row back and return it. Defaults to `true`.
   *
   * ⛔ Pass `false` when the caller has INSERT on the table but not SELECT.
   * `.insert().select().single()` is **two permissions, not one**: PostgREST
   * runs the `RETURNING` clause as the same role, so a table that grants INSERT
   * broadly and SELECT narrowly makes every write by a narrow role *look* like
   * a failure — the row commits, the read-back is denied, and the error that
   * comes back describes the read.
   *
   * That is live on `audit_events`: INSERT is granted to all staff, SELECT to
   * Owner/Admin/Manager only, so a **Warehouse** actor's audit write threw on
   * the read-back and was swallowed (`PLAN.md` §4.36 / `BUG_SWEEP_ENGINES`
   * `R3-5`). The row is append-only and its id is never used by the caller, so
   * reading it back bought nothing and cost the audit trail.
   *
   * Not the default, because every other caller genuinely wants the row: the
   * DB assigns ids, record numbers and defaults the client cannot compute.
   */
  returnRow?: boolean
  /**
   * Column list for the read-back (`RETURNING`), e.g. `'id, asset_code'`.
   * Omitted = `*`, which is fine on most tables but a landmine on the four
   * 0062 locks down (`bookings`, `booking_lines`, `products`, `product_units`):
   * once table-level SELECT is revoked and only non-money columns are granted,
   * a `RETURNING *` names ungranted money columns and the echo throws 42501
   * AFTER the row commits — a phantom write dressed as a failure
   * (`AUDIT_0062.md`). Every caller writing those four tables must pass an
   * explicit granted list. The masking `_v` views stay definer-rights + row
   * predicate (0048 pattern) — do not "fix" the linter warning on them.
   */
  returningColumns?: string
}

/** Read-back options for {@link safeUpdate} — same 0062 rationale as `InsertOptions`. */
export interface UpdateOptions {
  /** `false` skips the echo entirely; `data` comes back `null`. Defaults to `true`. */
  returnRow?: boolean
  /** Column list for the echo when `returnRow` is on. Omitted = `*` — see `InsertOptions.returningColumns`. */
  returningColumns?: string
}

/** Inserts a record with mandatory `client_uuid` injection for idempotency */
export async function idempotentInsert<
  TTable extends keyof Database['public']['Tables'],
  TInsert extends Database['public']['Tables'][TTable]['Insert'] = Database['public']['Tables'][TTable]['Insert']
>(
  table: TTable,
  payload: Omit<TInsert, 'client_uuid'> & { client_uuid?: string },
  options: InsertOptions = {}
) {
  const returnRow = options.returnRow !== false
  const finalPayload = {
    ...payload,
    client_uuid: payload.client_uuid || generateClientUuid(),
  }

  if (shouldQueueOffline()) {
    console.warn(`[DataAccess] Device offline. Queuing insert for ${String(table)}.`)
    await enqueueMutation(String(table), 'insert', finalPayload, finalPayload.client_uuid)
    return { data: finalPayload, error: null } // Optimistic response
  }

  const insert = supabase.from(table as string).insert(finalPayload)
  const { data, error } = returnRow
    ? await insert.select(options.returningColumns).single()
    : await insert

  if (error) {
    // If it's a network error from Supabase, queue it instead
    if (error.message === 'Failed to fetch' || error.code === '408') {
       console.warn(`[DataAccess] Network failure during insert. Queuing ${String(table)}.`)
       await enqueueMutation(String(table), 'insert', finalPayload, finalPayload.client_uuid)
       return { data: finalPayload, error: null }
    }

    // Detect duplicate idempotency violation
    if (error.code === '23505' && error.message.includes('client_uuid')) {
      console.warn(`[DataAccess] Idempotent request duplicate detected for table ${String(table)}. Fetching existing record.`)
      /* A duplicate means the row is already committed — which, for a caller
         that never wanted the row, is success and nothing more. Re-reading it
         would reintroduce the exact SELECT this option exists to avoid, and
         turn a satisfied idempotency guarantee back into a swallowed error. */
      if (!returnRow) return { data: null, error: null }
      return await supabase.from(table as string)
        .select(options.returningColumns)
        .eq('client_uuid', finalPayload.client_uuid)
        .single()
    }
    throw new Error(`[DataAccess] Insert failed on ${String(table)}: ${error.message}`)
  }

  return { data: returnRow ? data : null, error: null }
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
  clientUuid?: string,
  options: UpdateOptions = {}
) {
  const returnRow = options.returnRow !== false
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
    captureError(new Error('safeUpdate without client_uuid'), { where: 'dataAccess.safeUpdate', table: String(table) })
  }

  if (shouldQueueOffline()) {
    console.warn(`[DataAccess] Device offline. Queuing update for ${String(table)} id=${id}.`)
    await enqueueMutation(String(table), 'update', { ...payload, id }, actionUuid)
    return { data: { ...payload, id }, error: null } // Optimistic response
  }

  const update = supabase.from(table as string).update(payload).eq('id', id)
  const { data, error } = returnRow
    ? await update.select(options.returningColumns).single()
    : await update

  if (error) {
    if (error.message === 'Failed to fetch' || error.code === '408') {
       console.warn(`[DataAccess] Network failure during update. Queuing ${String(table)}.`)
       await enqueueMutation(String(table), 'update', { ...payload, id }, actionUuid)
       return { data: { ...payload, id }, error: null }
    }
    throw new Error(`[DataAccess] Update failed on ${String(table)}: ${error.message}`)
  }

  return { data: returnRow ? data : null, error: null }
}

/* ═══════════════════════════════════════════════════════════════════════
 * The Booqable source switch USED TO LIVE HERE. Removed 9 Sep 2026, R-36.
 *
 * It classified eight tables as Booqable-owned — `products`, `bundles`,
 * `bundle_items`, `product_units`, `external_invoices` read-only, and
 * `clients`, `bookings`, `booking_lines` writable only through six push
 * functions in `src/lib/booqable/sync.ts` — and `insertViaSourceSwitch` /
 * `updateViaSourceSwitch` THREW for all eight, naming a bridge function to
 * call instead.
 *
 * Babin ruled the Booqable integration out entirely (R-36): this is a
 * standalone system, there is no bridge, and no table has a second owner. The
 * switch's own comment anticipated exactly this removal — *"Deletion at month
 * 7: everything below this comment is self-contained; deleting it (and
 * `src/lib/booqable/`) leaves `idempotentInsert`/`safeUpdate` and every other
 * export above completely unaffected."* That held: nothing in `src/` imported
 * either function, so this deletion changed no behaviour anywhere.
 *
 * **Every table is now os-native.** `idempotentInsert` and `safeUpdate` above
 * are the write path, for every table, with no exceptions and no second
 * system to defer to. Their own guards are unchanged — `immutableTables`
 * still refuses `payments`, `deposit_movements`, `audit_events` and
 * `booking_stage_transitions` (Law 4), and that has nothing to do with
 * Booqable.
 *
 * `external_refs` and `external_invoices` keep their rows: `external_refs`
 * records which Booqable order each of the 200 imported bookings came from,
 * and Law 3 does not delete history. Nothing writes them any more.
 * ═══════════════════════════════════════════════════════════════════════ */
