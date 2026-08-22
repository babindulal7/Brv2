/**
 * Booqable sync orchestrator — pull coordination (Booqable → local) and push
 * coordination (local → `sync_outbox`, per the write-back allowlist).
 *
 * ## Law 1 / Law 2 — this file coordinates, it does not map
 *
 * Every field-shape decision (Booqable wire attribute → local column, unit
 * conversion, classification, forward-only stage planning, …) lives in the
 * seven files under `map/` and NOWHERE else. This file's job is narrower and
 * entirely different in kind: fetch from Booqable (via `client.ts`, which is
 * the only thing allowed to talk to the proxy), read the local rows/refs a
 * mapper needs as context, call the mapper, then perform the writes and
 * `external_refs`/`sync_conflicts` bookkeeping the mapper's pure output
 * describes. Nothing below inspects a Booqable attribute and decides what
 * local column it becomes — that would be exactly the Law 1 violation the
 * seven mapper files' own headers all warn against.
 *
 * The one place this rule gets a visible asterisk is the six write-back
 * allowlist push functions (§6 below): they build a `sync_outbox.payload`
 * out of the SAME local-shaped fields a local write already used — copying
 * a local object into a jsonb column, not translating Booqable's wire shape
 * into anything. Translating that local shape INTO Booqable's wire shape
 * (what an eventual outbox drainer sends as the actual POST/PATCH body) is
 * still mapping logic and is deliberately NOT done here — see §6's header
 * for exactly where that responsibility is left.
 *
 * ## Law 17 — "client" only
 *
 * No identifier in this file names the Booqable client resource; its API
 * name is imported as the opaque `BOOQABLE_CLIENT_ENTITY` constant (and its
 * wire attributes as the `BooqableClientAttributes` type) from `types.ts` —
 * the one file whose own header names the exception this section is about.
 *
 * ## Dependency order (spec §5's ownership graph)
 *
 * `runFullPull` calls the seven pull phases in the order their FOREIGN KEYS
 * require, not the order `map/*.ts` happens to be filed in:
 *
 *   1. catalogue   (product_groups, products, bundles, bundle_items) — no
 *      dependency on anything else this integration pulls.
 *   2. stock_items  — needs `products` (product_id FK).
 *   3. clients      (Booqable's client resource) — independent, like catalogue.
 *   4. orders (+ order_lines, one composed call — Law 2) — needs `products`/
 *      `bundles` (line item FKs) and `clients` (client_id FK).
 *   5. payments     — needs `orders` (booking_id, via each order's already-
 *      synced local id).
 *   6. documents    — needs `orders` (booking_id, nullable — never blocks).
 *   7. reservations (plannings; availabilities is a documented no-op) —
 *      needs `orders` AND the order_lines synced in step 4 (booking_line_id
 *      resolution — see `makeResolveBookingLine` below).
 *
 * ## Execution context — flagged, not resolved
 *
 * TODO(decision): this file is written against the SAME `supabase` client
 * `dataAccess.ts`/`client.ts` already use — the browser, anon-key client,
 * matching the brief's own "reads from `dataAccess.ts`'s existing … path."
 * But `0040_booqable_sync.sql`'s own RLS grants `external_refs`,
 * `sync_state`, `sync_inbox`, `sync_outbox`, `sync_conflicts` a SELECT
 * policy for Owner/Admin and NOTHING ELSE — no INSERT/UPDATE policy for any
 * `authenticated` role at all; only `service_role` (which bypasses RLS
 * entirely) can write them, and `service_role` never belongs in browser
 * code. Literally as written, a browser session running `runFullPull` would
 * have every Booqable fetch succeed and then have every `external_refs`/
 * `sync_conflicts`/`sync_outbox` write REJECTED by Postgres. This is a real,
 * unresolved architecture question — not papered over here with a policy
 * change this pass has no approval to make (CLAUDE.md: "never apply a
 * migration … without explicit approval") and not silently assumed away.
 * Either (a) this file's pull/push functions are meant to be invoked from a
 * privileged context (an Edge Function using a service-role client) despite
 * living under `src/lib/booqable/` alongside the browser-only `client.ts`,
 * or (b) a future migration adds scoped INSERT policies for these five
 * tables. Flagged for PLAN.md §4, per CLAUDE.md's "never invent a product
 * decision to unblock yourself."
 *
 * ## `database.ts` cannot be trusted for ANY table this file writes to
 *
 * Every mapper file under `map/` independently found and documented real,
 * specific drift in `src/types/database.ts` (wrong table names, wrong enum
 * value sets, missing tables entirely — see `map/stock.ts` and
 * `map/products.ts` headers for the clearest examples: `BookingStage` there
 * still carries the RETIRED 13-value enum `0015_canonical_six_stages.sql`
 * replaced, and `product_units`/`bundles`/`bundle_items`/
 * `booking_stage_transitions`/`inventory_reservations`/`payment_reversals`/
 * `external_invoices` do not appear in it at all). `idempotentInsert`/
 * `safeUpdate` (`dataAccess.ts`) are generic over `keyof
 * Database['public']['Tables']`, and this pass is explicitly forbidden from
 * changing that file's signatures. Given the DEMONSTRATED severity and
 * breadth of the drift, this file does not try to guess which of the
 * PRESENT table keys happen to still be accurate — it routes every write to
 * a Booqable-synced local table through `writeBooqableRow`/`updateBooqableRow`
 * below, which call the REAL `idempotentInsert`/`safeUpdate` functions (so
 * Law 9 / offline-queue behaviour is identical, not reimplemented) with the
 * table name cast past the compile-time-only generic constraint. Delete
 * that indirection and call `idempotentInsert`/`safeUpdate` directly the
 * moment `npm run db:types` is regenerated against the live migrations.
 *
 * ## Booqable fulfillment endpoints (push ops 4-6) — UNCONFIRMED
 *
 * Same shape of gap as `UNCONFIRMED_BOOQABLE_FACTS` in `types.ts`: the exact
 * v4 path/verb for "book"/"start"/"stop" a fulfillment is not confirmed
 * against live docs anywhere in this codebase. `FULFILLMENT_ACTION_PATHS`
 * below names the spec's own plausible guess for each, quoted at the one
 * place it is used, so a later engineer confirming the real endpoint only
 * has one constant to fix.
 *
 * ## TODO(decision) — alerting on stale conflicts / dead-lettered outbox rows
 *
 * Spec §7 rule 5 (unresolved `sync_conflicts` > 20 for 24h) and the
 * write-back allowlist's own "status=failed plus an Owner alert" are both
 * NOT built here — no scheduled query, no notification. This file only
 * produces the rows those future alerts would count (`sync_conflicts.
 * resolution is null`, `sync_outbox.status = 'failed'`). See also
 * `conflicts.ts`'s identical TODO(decision) note.
 */

import { supabase, newClientUuid } from '../supabase'
import { idempotentInsert, safeUpdate, generateClientUuid } from '../dataAccess'
import { discountGate } from '../money'
import type { BookingStatus } from '../workflow'
import {
  booqableListPage,
  type BooqableFlatResource,
} from './client'
import {
  type BooqableId,
  type BooqableIncludedResource,
  type BooqableClientAttributes,
  type BooqableClientEntity,
  BOOQABLE_CLIENT_ENTITY,
  type BooqablePropertyAttributes,
  type BooqablePropertyEntity,
  type BooqableProductGroupAttributes,
  type BooqableProductAttributes,
  type BooqableBundleAttributes,
  type BooqableBundleItemAttributes,
  type BooqableStockItemAttributes,
  type BooqableOrderAttributes,
  type BooqableOrderLineAttributes,
  type BooqablePaymentAttributes,
  type BooqablePaymentResourceType,
  type BooqablePaymentMethodAttributes,
  type BooqableDocumentAttributes,
  type BooqablePlanningAttributes,
} from './types'

import * as clientsMap from './map/clients'
import * as productsMap from './map/products'
import * as stockMap from './map/stock'
import * as ordersMap from './map/orders'
import * as paymentsMap from './map/payments'
import * as documentsMap from './map/documents'
import * as availabilityMap from './map/availability'

import {
  buildConflict,
  heldPaymentToConflict,
  type SyncConflictInsert,
} from './conflicts'

/* ═══════════════════════════════════════════════════════════════════════
 * §1 · Caller-supplied configuration
 *
 * Everything below is a genuine business-policy answer NO mapper file (and
 * nothing in this file either) may invent — every one of the seven mapper
 * files documents, in its own header, exactly why it refuses to guess the
 * matching field. This file resolves what it CAN from real queries
 * (existing refs, minted document numbers, current booking stages) and
 * takes the rest as required input, same as every mapper already demands
 * from "the caller" (this file). No default is supplied for a field a
 * mapper's own header calls un-guessable; a sync run cannot start without
 * one, by design — see each field's comment for which mapper file names it.
 * ═══════════════════════════════════════════════════════════════════════ */

export interface BooqableSyncConfig {
  /** `inventory_categories.id` for the row named 'Other' — map/products.ts header, "never invents a UUID." */
  fallbackCategoryId: string
  /** map/products.ts header — no Booqable field distinguishes a brand. */
  fallbackBrand: string
  /** map/orders.ts header — no Booqable field distinguishes delivery mode. */
  defaultDeliveryType: ordersMap.DeliveryType
  /** `users.id` — the "no sync-actor convention exists" gap every mapper file names identically. Required for every insert across every entity. */
  systemActorUserId: string
  /** Role text snapshotted onto `booking_stage_transitions.actor_role`. */
  systemActorRole: string
  /** Asserted against `'NPR'` for payments/documents batches — spec §8.2, map/payments.ts + map/documents.ts headers. */
  accountCurrency: string
  /** `users.id` for `payment_reversals.approved_by` — deliberately separate from `systemActorUserId`, OPTIONAL (map/payments.ts header: absent ⇒ a Law-4 correction is logged and skipped, never auto-approved). */
  systemReversalApproverUserId?: string
  /**
   * `users.id` for `bookings.cancelled_by`. Deliberately separate from
   * `systemActorUserId` — the column is scoped "Owner and Manager only — the
   * Terminal capability" (`0002_bookings.sql`), so who stamps a terminal
   * action is a configuration choice, not whoever happens to run the pull.
   * OPTIONAL: if this is absent AND `resolveCancellationActorUserId` below
   * cannot resolve one by role, map/orders.ts §1b HOLDS every canceled order
   * as a `sync_conflicts` row and writes nothing — the correct loud failure,
   * since `bookings_cancelled_requires_actor_and_reason`
   * (`0015_canonical_six_stages.sql`) rejects `cancelled_at` without an actor.
   */
  cancellationActorUserId?: string
  /** Decimal rupees, defaults to `0` (the column's own default) — map/payments.ts header, never inferred from Booqable. */
  defaultRequiredDepositAmount?: number
  /** map/orders.ts + map/stock.ts headers — no confirmed location→branch/warehouse rule. Defaults to "unresolved for everything", the safe default both files themselves name. */
  resolveBranch?: (externalLocationId: BooqableId | null) => string | undefined
  resolveLocation?: (externalLocationId: BooqableId | null) => stockMap.ResolvedLocation | undefined
  /** map/availability.ts header. Defaults to "always a quantity hold" (the file's own stated safe default) by always returning `undefined`. */
  resolveAssetLocalId?: (itemExternalId: BooqableId | null, itemType: string) => string | undefined
  /** `booking_stage_transitions.source` / outbox tag. Defaults to `'booqable-sync'`. */
  transitionSource?: string
  /** Page size for every paginated Booqable list call. Defaults to 100. */
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 100
const DEFAULT_TRANSITION_SOURCE = 'booqable-sync'
/** Hard safety bound on pagination loops — not a business rule, just a guard against an infinite loop if Booqable's pagination shape (UNCONFIRMED_BOOQABLE_FACTS[5], types.ts) never terminates the way this file expects. */
const MAX_PAGES_PER_ENTITY = 500
/**
 * `external_refs.entity` for the TRUST half of a Law-5 split (`'mixed'`)
 * payment. One Booqable payment id becomes TWO local rows — one in `payments`
 * (revenue portion) and one in `deposit_movements` (deposit portion) — and
 * `0040_booqable_sync.sql` declares `unique (provider, entity, external_id)`,
 * so a single entity value cannot hold two `local_id`s for one wire id: the
 * second upsert would silently overwrite the first and orphan one of the two
 * rows. The revenue half keeps the plain `'payments'` entity; the trust half
 * is entitled here. Bridge-internal identifier, not a product decision — but
 * it MUST match between `loadExternalRefs` and `upsertExternalRef` below, and
 * any environment that already recorded deposit refs under `'payments'` must
 * be re-entitled or the mapper will read them as revenue refs.
 */
const PAYMENTS_DEPOSIT_ENTITY = 'payments_deposit'

/* ═══════════════════════════════════════════════════════════════════════
 * §2 · Generic Booqable-fetch + Supabase-bookkeeping helpers
 * ═══════════════════════════════════════════════════════════════════════ */

interface FetchAllResult<TType extends string, TAttributes> {
  records: BooqableFlatResource<TType, TAttributes>[]
  included: BooqableIncludedResource[]
}

/**
 * Pages through a Booqable list endpoint until a short or empty page is
 * returned. CONFIRMED 10 Aug 2026 (UNCONFIRMED_BOOQABLE_FACTS[5],
 * `types.ts`): v4 has NO `links.next` — responses carry self/first/last
 * only — so a short/empty page IS the documented-compatible stop condition
 * (totals would need the opt-in `?stats[total]=count`, not used here).
 */
async function fetchAllPages<TType extends string, TAttributes>(
  path: string,
  pageSize: number,
  extraQuery?: Record<string, string>,
): Promise<FetchAllResult<TType, TAttributes>> {
  const records: BooqableFlatResource<TType, TAttributes>[] = []
  const included: BooqableIncludedResource[] = []
  for (let page = 1; page <= MAX_PAGES_PER_ENTITY; page++) {
    const parsed = await booqableListPage<TType, TAttributes>(path, page, pageSize, extraQuery)
    if (parsed.records.length === 0) break
    records.push(...parsed.records)
    included.push(...parsed.included.values())
    // Short page ⇒ last page (no links.next exists in v4 — see above);
    // saves the trailing empty-page request.
    if (parsed.records.length < pageSize) break
  }
  return { records, included }
}

/** Flattens `included` entries of one specific type into the same `BooqableFlatResource` shape `fetchAllPages` produces for top-level records — used to pull `order_lines` out of `orders?include=order_lines`'s `included` array (Law 2 — one request, not a second round trip). */
function flattenIncludedByType<TType extends string, TAttributes>(
  included: readonly BooqableIncludedResource[],
  type: TType,
): BooqableFlatResource<TType, TAttributes>[] {
  return included
    .filter((r) => r.type === type)
    .map((r) => ({ id: r.id, type, ...(r.attributes as TAttributes) }) as BooqableFlatResource<TType, TAttributes>)
}

/** `external_refs` rows for one or more entities, merged into one pair of maps. Loading MULTIPLE entities into one map is required for `orders`: `map/orders.ts`'s `OrderSyncContext.existingRefs`/`.existingPayloadHashes` are looked up by BOTH order ids (`mapOrdersToBookings`) and order-LINE ids (`mapOrderLines`) against the exact same map — passing a union of `external_refs` rows for `entity in ('orders','order_lines')` is what makes that mapper's own (already-written) lookup pattern resolve correctly for both, without this file rewriting `map/orders.ts`'s types. */
async function loadExternalRefs(entities: readonly string[]): Promise<{ refs: Map<string, string>; hashes: Map<string, string> }> {
  const refs = new Map<string, string>()
  const hashes = new Map<string, string>()
  const { data, error } = await supabase
    .from('external_refs')
    .select('entity, external_id, local_id, payload_hash')
    .eq('provider', 'booqable')
    .in('entity', entities as string[])
  if (error) throw new Error(`[booqable/sync] Failed to load external_refs for ${entities.join(',')}: ${error.message}`)
  for (const row of (data ?? []) as { external_id: string; local_id: string; payload_hash: string | null }[]) {
    refs.set(row.external_id, row.local_id)
    if (row.payload_hash !== null) hashes.set(row.external_id, row.payload_hash)
  }
  return { refs, hashes }
}

/** Upserts one `external_refs` row, keyed on `(provider, entity, external_id)` — the same unique constraint `0040_booqable_sync.sql` declares. */
async function upsertExternalRef(entity: string, externalId: string, localId: string, payloadHash: string | null): Promise<void> {
  const { error } = await supabase.from('external_refs').upsert(
    {
      provider: 'booqable',
      entity,
      external_id: externalId,
      local_id: localId,
      payload_hash: payloadHash,
      last_pulled_at: new Date().toISOString(),
    },
    { onConflict: 'provider,entity,external_id' },
  )
  if (error) throw new Error(`[booqable/sync] Failed to upsert external_refs for ${entity}/${externalId}: ${error.message}`)
}

async function insertSyncConflicts(conflicts: readonly SyncConflictInsert[]): Promise<void> {
  if (conflicts.length === 0) return
  const { error } = await supabase.from('sync_conflicts').insert(conflicts as unknown as Record<string, unknown>[])
  if (error) throw new Error(`[booqable/sync] Failed to insert sync_conflicts: ${error.message}`)
}

/** `next_document_number('CL'|'BK'|'EQ'|'PAY'|'DEP')` — the atomic sequence generator (`0007_admin_security.sql`). Called once per NEW record needing a number; the function itself is the atomicity boundary (`select … for update`), so this file makes no attempt to batch the RPC calls. */
async function mintDocumentNumber(sequenceKey: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_document_number', { p_sequence_key: sequenceKey })
  if (error) throw new Error(`[booqable/sync] next_document_number('${sequenceKey}') failed: ${error.message}`)
  return data as string
}

/**
 * `payment_reversals.reversal_no` / `deposit_movements.movement_no` — NOT
 * registered in `number_sequences` (`0007_admin_security.sql` only
 * registers BK/CL/INV/PAY/DEP/EXP/EQ; see `map/payments.ts` header). Calling
 * `next_document_number` for either would raise "Number sequence % does not
 * exist". A deterministic, collision-safe placeholder — same shape of
 * stopgap `map/products.ts`'s own `mintPlaceholderBundleCode` already uses
 * for `bundle_code` — not a numbering policy; replace once a real sequence
 * key is registered by a future migration.
 */
function mintPlaceholderNumber(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

/**
 * Same stopgap as `mintPlaceholderNumber`, but DERIVED rather than random —
 * the same `key` always produces the same number.
 *
 * Used for `payment_reversals.reversal_no`, where randomness actively costs
 * something: that column's `payment_reversals_no_key` unique constraint is the
 * only natural key the table has, and a fresh random value on every run makes
 * it structurally incapable of catching a replayed reversal (the row carries
 * no `external_refs` entry either — see the reversals loop). Deriving it from
 * the Booqable payment id + that record's payload hash turns the constraint
 * into a real second line of defence behind the deterministic `client_uuid`,
 * while still giving two SUCCESSIVE corrections of the same payment two
 * different numbers (their payload hashes differ). Still not a numbering
 * policy — replace the moment a real `REV` sequence key is registered.
 */
async function deterministicPlaceholderNumber(prefix: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`booqable:${prefix}:${key}`))
  return `${prefix}-${Array.from(new Uint8Array(digest).slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/**
 * Law 9 `client_uuid` for EVERY pull-side insert in this file.
 *
 * It used to seed only the three finance writes (`payments`,
 * `deposit_movements`, `security_deposits`) on the grounds that the others
 * are idempotent via `external_refs` — but that ref is written by a SECOND
 * round trip AFTER the insert, so it protects nothing in the window between
 * the two: a crash there (or an offline-queue replay) leaves no ref, the next
 * `runFullPull` reads the record as new, and a duplicate row lands.
 * `bookings` was the worst instance — it also mints a fresh
 * `next_document_number('BK')` for anything absent from `orderOnlyRefs`, so
 * the duplicate carries a DIFFERENT `booking_no` and even that unique
 * constraint could not catch it. Every insert below now seeds from the stable
 * Booqable-side key for its row, so the window closes.
 *
 * `idempotentInsert` (`dataAccess.ts`) mints a FRESH `crypto.randomUUID()`
 * whenever a payload omits `client_uuid`, so a retry of the same write (the
 * offline queue replaying it, or a later `runFullPull` re-attempting a row
 * whose paired `upsertExternalRef` failed or never ran) would otherwise
 * insert a second row instead of hitting `idempotentInsert`'s own existing
 * 23505-on-`client_uuid` dedup path. Hashing a stable seed
 * (`booqable:<table>:<key>`) into a UUIDv5-shaped value — RFC 4122 version/
 * variant nibbles set, so it is a valid `uuid` column value, not an ad hoc
 * string — makes the SAME Booqable-side fact always resolve to the SAME
 * `client_uuid`, on this run and on every future one.
 */
async function deterministicClientUuid(table: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`booqable:${table}:${key}`))
  const hash = new Uint8Array(digest)
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50 // version 5
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80 // variant RFC 4122
  const hex = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Every write to a Booqable-synced local table goes through here or
 * `updateBooqableRow` — see file header, "`database.ts` cannot be trusted
 * for ANY table this file writes to." Calls the REAL `idempotentInsert` (so
 * Law 9 / offline-queue behaviour is exactly what every other write in this
 * codebase gets — nothing duplicated), with the table name cast past the
 * compile-time-only generic constraint that `database.ts`'s drift makes
 * unusable here.
 */
async function writeBooqableRow<T extends object>(table: string, payload: T): Promise<{ id: string } | null> {
  /* `returningColumns: 'id'` — this helper only ever consumes `data.id`, and a
     bare echo is RETURNING *, which 42501s on the four 0062-locked tables the
     pull phase writes (bookings, booking_lines, products, product_units) the
     moment the mask is armed — with the failure misread as a sync conflict
     (AUDIT_0062.md). `id` is granted on every table this file writes. */
  const result = await idempotentInsert(table as never, payload as never, { returningColumns: 'id' })
  const data = result.data as { id?: unknown } | null
  if (!data || typeof data.id !== 'string') {
    // Either an offline-queued optimistic response (no DB-generated id yet —
    // see file header's execution-context note: reaching this file at all
    // already required a live Booqable round trip, so this branch is
    // expected to be rare, not the common case) or an unexpected shape.
    // Never invent an id — the caller treats this as "not written yet",
    // never writes external_refs for it, and it is picked up again on the
    // next pull once the queued mutation lands and acquires a real row.
    return null
  }
  return { id: data.id }
}

async function updateBooqableRow<T extends object>(table: string, id: string, payload: T): Promise<void> {
  /* `returnRow: false` — the echo was always discarded here, and under 0062 a
     bare RETURNING * on the locked tables would turn every pull-phase update
     into a phantom failure (AUDIT_0062.md). */
  await safeUpdate(table as never, id, payload as never, undefined, { returnRow: false })
}

/** Plain `supabase.from(table)` insert for the sync-bridge/mirror tables that carry NO `client_uuid` at all (`external_invoices`, and — separately — `sync_conflicts`/`external_refs` via their own dedicated helpers above) — these are not "user-written" mutation rows Law 9 targets, so routing them through `idempotentInsert`'s Law-9 machinery would be attaching an idempotency key to a table that has no column for one. */
async function insertMirrorRow<T extends object>(table: string, payload: T): Promise<{ id: string } | null> {
  const { data, error } = await supabase.from(table).insert(payload as never).select('id').single()
  if (error) throw new Error(`[booqable/sync] Failed to insert ${table}: ${error.message}`)
  return data ? { id: (data as { id: string }).id } : null
}

/* ═══════════════════════════════════════════════════════════════════════
 * §3 · Pull phase 1 — catalogue (product_groups, products, bundles, bundle_items)
 * ═══════════════════════════════════════════════════════════════════════ */

export interface CataloguePullResult {
  productRefs: Map<BooqableId, string>
  bundleRefs: Map<BooqableId, string>
  conflicts: SyncConflictInsert[]
}

async function pullCatalogue(config: BooqableSyncConfig): Promise<CataloguePullResult> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const conflicts: SyncConflictInsert[] = []

  // product_groups — mapProductGroups is a documented no-op (map/products.ts
  // §1); fetched only so a future reader sees the entity was considered, not
  // silently skipped. No refs/writes result from it.
  await fetchAllPages<'product_groups', BooqableProductGroupAttributes>('/product_groups', pageSize)

  const { refs: productExistingRefs, hashes: productHashes } = await loadExternalRefs(['products'])
  const productsFetch = await fetchAllPages<'products', BooqableProductAttributes>('/products', pageSize)

  const mintedAssetCodes = new Map<BooqableId, string>()
  for (const record of productsFetch.records) {
    if (!productExistingRefs.has(record.id)) {
      mintedAssetCodes.set(record.id, await mintDocumentNumber('EQ'))
    }
  }
  // Duplicate-SKU guard (map/products.ts): SKUs already claimed by an
  // external_id OTHER than the one being processed, drawn from the current
  // full fetch — the local `products` table has no sku column to check
  // against at all (see that file's header). TODO(decision): this can only
  // ever catch a collision between two products visible in THIS fetch; it
  // cannot see a SKU claimed by a product outside the current page/run. A
  // durable answer needs either a local sku column or a dedicated lookup
  // table, neither of which exists yet.
  const skuOwner = new Map<string, BooqableId>()
  for (const record of productsFetch.records) {
    if (record.sku !== null && productExistingRefs.has(record.id)) skuOwner.set(record.sku, record.id)
  }

  const productCtx: productsMap.ProductCatalogueContext = {
    existingRefs: productExistingRefs,
    existingPayloadHashes: productHashes,
    knownSkus: new Set(skuOwner.keys()),
    fallbackCategoryId: config.fallbackCategoryId,
    fallbackBrand: config.fallbackBrand,
    mintedAssetCodes,
  }

  const productsResult = productsMap.mapProducts(productsFetch.records, productCtx)
  conflicts.push(...(productsResult.conflicts as SyncConflictInsert[]))

  const productRefs = new Map<BooqableId, string>(productExistingRefs)
  for (const insert of productsResult.toInsert) {
    const externalId = [...mintedAssetCodes.entries()].find(([, code]) => code === insert.asset_code)?.[0]
    // Law 9 — seeded off the Booqable product id (see `deterministicClientUuid`).
    // Omitted, not guessed, when the external id could not be recovered from
    // the minted-code map: a random uuid is what this did before, and an
    // arbitrary seed would be worse than no seed.
    const clientUuid = externalId === undefined ? undefined : await deterministicClientUuid('products', externalId)
    const written = await writeBooqableRow('products', { ...insert, ...(clientUuid !== undefined ? { client_uuid: clientUuid } : {}) })
    if (written && externalId !== undefined) {
      const hash = productsMap.computePayloadHash(insert)
      await upsertExternalRef('products', externalId, written.id, hash)
      productRefs.set(externalId, written.id)
    }
  }
  for (const update of productsResult.toUpdate) {
    await updateBooqableRow('products', update.id, update.fields)
    const externalId = [...productExistingRefs.entries()].find(([, localId]) => localId === update.id)?.[0]
    if (externalId !== undefined) await upsertExternalRef('products', externalId, update.id, productsMap.computePayloadHash(update.fields))
  }

  // bundles — same existingRefs/knownSkus shape (ProductCatalogueContext is
  // shared across all four catalogue entities per map/products.ts §5), but
  // bundles have no sku concept, so knownSkus is empty here.
  const { refs: bundleExistingRefs, hashes: bundleHashes } = await loadExternalRefs(['bundles'])
  const bundlesFetch = await fetchAllPages<'bundles', BooqableBundleAttributes>('/bundles', pageSize)
  const bundleCtx: productsMap.ProductCatalogueContext = {
    existingRefs: bundleExistingRefs,
    existingPayloadHashes: bundleHashes,
    knownSkus: new Set(),
    fallbackCategoryId: config.fallbackCategoryId,
    fallbackBrand: config.fallbackBrand,
    mintedAssetCodes: new Map(),
  }
  const bundlesResult = productsMap.mapBundles(bundlesFetch.records, bundleCtx)
  conflicts.push(...(bundlesResult.conflicts as SyncConflictInsert[]))

  const bundleRefs = new Map<BooqableId, string>(bundleExistingRefs)
  const bundleExternalIdByCode = new Map<string, BooqableId>()
  for (const record of bundlesFetch.records) {
    if (!bundleExistingRefs.has(record.id)) bundleExternalIdByCode.set(`BQ-${record.id.slice(0, 8).toUpperCase()}`, record.id)
  }
  for (const insert of bundlesResult.toInsert) {
    const externalId = bundleExternalIdByCode.get(insert.bundle_code)
    const clientUuid = externalId === undefined ? undefined : await deterministicClientUuid('bundles', externalId)
    const written = await writeBooqableRow('bundles', { ...insert, ...(clientUuid !== undefined ? { client_uuid: clientUuid } : {}) })
    if (written && externalId !== undefined) {
      await upsertExternalRef('bundles', externalId, written.id, productsMap.computePayloadHash(insert))
      bundleRefs.set(externalId, written.id)
    }
  }
  for (const update of bundlesResult.toUpdate) {
    await updateBooqableRow('bundles', update.id, update.fields)
    const externalId = [...bundleExistingRefs.entries()].find(([, localId]) => localId === update.id)?.[0]
    if (externalId !== undefined) await upsertExternalRef('bundles', externalId, update.id, productsMap.computePayloadHash(update.fields))
  }

  // bundle_items — ProductCatalogueContext.existingRefs is reused (per
  // map/products.ts §4) to resolve BOTH bundle_id and product_id, keyed by
  // their respective Booqable ids — a union of the products and bundles ref
  // maps just built above satisfies that.
  const { refs: bundleItemExistingRefs, hashes: bundleItemHashes } = await loadExternalRefs(['bundle_items'])
  const bundleItemsFetch = await fetchAllPages<'bundle_items', BooqableBundleItemAttributes>('/bundle_items', pageSize)
  const unionRefs = new Map<BooqableId, string>([...productRefs, ...bundleRefs, ...bundleItemExistingRefs])
  const bundleItemCtx: productsMap.ProductCatalogueContext = {
    existingRefs: unionRefs,
    existingPayloadHashes: bundleItemHashes,
    knownSkus: new Set(),
    fallbackCategoryId: config.fallbackCategoryId,
    fallbackBrand: config.fallbackBrand,
    mintedAssetCodes: new Map(),
  }
  const bundleItemsResult = productsMap.mapBundleItems(bundleItemsFetch.records, bundleItemCtx)
  conflicts.push(...(bundleItemsResult.conflicts as SyncConflictInsert[]))
  for (let i = 0; i < bundleItemsResult.toInsert.length; i++) {
    const insert = bundleItemsResult.toInsert[i]
    const record = bundleItemsFetch.records[i]
    if (!insert || !record) continue
    const written = await writeBooqableRow('bundle_items', { ...insert, client_uuid: await deterministicClientUuid('bundle_items', record.id) })
    if (written) await upsertExternalRef('bundle_items', record.id, written.id, productsMap.computePayloadHash(insert))
  }
  for (const update of bundleItemsResult.toUpdate) {
    await updateBooqableRow('bundle_items', update.id, update.fields)
  }

  return { productRefs, bundleRefs, conflicts }
}

/* ═══════════════════════════════════════════════════════════════════════
 * §4 · Pull phase 2 — stock_items → product_units
 * ═══════════════════════════════════════════════════════════════════════ */

async function pullStock(config: BooqableSyncConfig, productRefs: ReadonlyMap<BooqableId, string>): Promise<SyncConflictInsert[]> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const { refs, hashes } = await loadExternalRefs([stockMap.STOCK_ITEM_ENTITY])
  const fetch = await fetchAllPages<'stock_items', BooqableStockItemAttributes>('/stock_items', pageSize)

  const existingRefs = new Map<BooqableId, stockMap.ExistingStockItemRef>()
  for (const [externalId, localId] of refs) {
    existingRefs.set(externalId, { localId, payloadHash: hashes.get(externalId) ?? null })
  }

  const ctx: stockMap.StockItemPullContext = {
    existingRefs,
    resolveProductLocalId: (externalProductId) => productRefs.get(externalProductId),
    resolveLocation: config.resolveLocation ?? (() => undefined),
    ...(config.systemActorUserId !== undefined ? { systemActorUserId: config.systemActorUserId } : {}),
  }

  const result = stockMap.pullStockItems(fetch.records, ctx)
  const conflicts: SyncConflictInsert[] = [...(result.conflicts as SyncConflictInsert[])]
  for (const skipped of result.skipped) {
    conflicts.push(buildConflict('product_units', null, skipped.externalId, 'skipped', null, skipped.reason))
  }

  for (const op of result.toInsert) {
    const written = await writeBooqableRow('product_units', { ...op.payload, client_uuid: await deterministicClientUuid('product_units', op.externalId) })
    if (written) await upsertExternalRef(stockMap.STOCK_ITEM_ENTITY, op.externalId, written.id, op.payloadHash)
  }
  for (const op of result.toUpdate) {
    await updateBooqableRow('product_units', op.localId, op.changes)
    await upsertExternalRef(stockMap.STOCK_ITEM_ENTITY, op.externalId, op.localId, op.payloadHash)
  }

  return conflicts
}

/* ═══════════════════════════════════════════════════════════════════════
 * §5 · Pull phase 3 — Booqable clients → clients
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Correlation token handed to `mapClients` in place of a real
 * `C-N`, so no atomic sequence number is consumed for a record the
 * mapper is about to reject. Never written to the database: `pullClients`
 * substitutes a freshly minted code before every insert and refuses to write
 * a row still carrying the token. Deliberately unlike a real client code
 * (still format-locked to the retired `^CL-[0-9]{4}-[0-9]{4}$`), so a leak is loud.
 */
const CLIENT_CODE_PENDING_PREFIX = 'booqable-pending-client-code:'

/**
 * `clients_phone_key` (`0005_clients.sql`) — the ONE unique constraint on
 * `clients` that a mapped Booqable record can still violate after the mapper's
 * own collision check has passed (`NOT NULL` and the `+977` format CHECK are
 * unreachable: `mapClients` returns before building `fields` unless the phone
 * normalised into that exact shape). Matched narrowly by constraint name —
 * same posture as the `security_deposits_booking_key` adoption in §7 — so
 * every other failure still propagates untouched. The message is the one
 * `dataAccess.ts` wraps Postgres's own text in.
 */
function isClientPhoneUniqueViolation(err: unknown): boolean {
  return (err instanceof Error ? err.message : String(err)).includes('clients_phone_key')
}

async function pullClients(config: BooqableSyncConfig): Promise<{ clientRefs: Map<BooqableId, string>; conflicts: SyncConflictInsert[] }> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const { refs: existingRefs, hashes: existingPayloadHashes } = await loadExternalRefs([BOOQABLE_CLIENT_ENTITY])
  // `?include=properties` — Law 2, one request. The Booqable client resource
  // has NO phone/address columns of its own; both live on separate Property
  // resources (types.ts §3b) which this sideloads into the SAME response's
  // `included` array. Without it map/clients.ts degrades to its last-resort
  // path (the readonly `properties` hash, keyed by account-configured
  // identifiers) — the ~0%-import blocker. The value is the mapper's own
  // exported constant, not a string literal, so the fetch and the resolvers
  // cannot drift apart.
  //
  // The proxy allowlist matches on PATH only and forwards `url.search`
  // unmodified — but that is only half the wire path, and the other half
  // used to drop this query on the floor: `booqableFetch` sent the whole
  // request inside a JSON POST body, so nothing ever reached `url.search`
  // and `included` came back empty on every call. Fixed 10 Aug 2026 —
  // `buildProxyInvokePath` (client.ts) now puts path + query in the invoked
  // URL. No migration change is needed; the proxy DID need a change (its
  // response envelope), see BooqableProxyEnvelope in client.ts.
  //
  // PATH VOCABULARY vs WIRE VOCABULARY — do not "unify" these two.
  //
  // The literal below is the PROXY's own path vocabulary, which is this
  // integration's Law 17 vocabulary: `booqable-proxy`'s READ_ALLOWLIST
  // registers this resource as `clients`, and `toBooqablePath` (that file, and
  // ONLY that file) translates it into Booqable's wire spelling on the way
  // out. `BOOQABLE_CLIENT_ENTITY` is the WIRE name and stays reserved for the
  // three places the wire is genuinely what is being named:
  // `external_refs.entity`, `groupClientProperties`'s `included[].owner_type`
  // comparison, and the response `type` generic on this very call. Sending the
  // wire name as the PATH matched no allowlist pattern, so `matchAllowlist`
  // returned null and every page of the client import 403'd — the whole phase
  // could not read a single record.
  //
  // STILL OPEN (separate ticket, NOT this call site): '/bundle_items',
  // '/payment_methods' and '/availabilities' below appear in READ_ALLOWLIST
  // under NEITHER vocabulary, so those three fetches still 403. Adding them is
  // a proxy-side change, out of scope here.
  const fetch = await fetchAllPages<BooqableClientEntity, BooqableClientAttributes>(
    '/clients',
    pageSize,
    { include: clientsMap.CLIENT_PROPERTIES_INCLUDE },
  )
  // Grouped via the mapper's own exported helper rather than inline: it
  // filters `owner_type` (polymorphic across five Booqable resources — an
  // order's phone property must never become a client's phone) and applies
  // the documented `position` sort with deterministic tie-breaks. Do not
  // re-sort or dedupe the result; `fetchAllPages` concatenating each page's
  // `included` is already tolerated by the helper.
  const propertyRecords = flattenIncludedByType<BooqablePropertyEntity, BooqablePropertyAttributes>(
    fetch.included,
    clientsMap.CLIENT_PROPERTIES_INCLUDE,
  )
  const clientProperties = clientsMap.groupClientProperties(propertyRecords)

  // Phone each record RESOLVES to, computed with the mapper's OWN exported
  // resolver — the very function `mapClients` calls, so this pre-pass can only
  // ever agree with the mapper's own decision, never invent a second rule
  // (Law 1; same posture as §7's payments pre-pass, which reuses
  // `classifyBooqablePayment`/`computePaymentPayloadHash` for the same reason).
  // Only entries that normalise into a `clients_phone_format`-valid value are
  // recorded — an unresolvable phone is exactly the record the mapper is about
  // to conflict and skip.
  const resolvedPhoneByExternalId = new Map<BooqableId, string>()
  for (const record of fetch.records) {
    const resolved = clientsMap.resolveClientPhone(clientProperties.get(record.id) ?? [], record.properties)
    if (resolved.normalized !== null) resolvedPhoneByExternalId.set(record.id, resolved.normalized)
  }

  // knownPhones — ClientSyncContext's contract is "normalised phones already
  // claimed locally by a DIFFERENT external_id". The exclusion is therefore
  // per-RECORD ("its own phone"), and used to be applied per-RUN: every local
  // row reachable from this run's `external_refs` was dropped wholesale. That
  // avoided the fatal case (an already-synced client colliding with its OWN
  // phone, conflicted and never updated again) but over-shot, blinding the
  // check to every OTHER already-synced client — so a phone Booqable had moved
  // onto a different client sailed past the mapper and hit
  // `clients_phone_key` at the database instead of becoming a conflict row.
  //
  // Narrowed to exactly the own-phone case: a locally-held phone is dropped
  // only when the local row holding it is the very row this run's ref maps its
  // record to AND that record still resolves to that same phone. `phone` is
  // UNIQUE, so at most one local row can hold a given value and this cannot
  // drop someone else's claim by accident. Everything else — another synced
  // client's phone, a phone whose owner is archived/filtered/paged out of this
  // fetch — stays foreign, which is what it is.
  //
  // Detection is still not total (a collision can be introduced between this
  // snapshot and the write, and `phonesSeenThisBatch` inside the mapper is
  // order-dependent), which is why the write loops below ALSO survive a
  // `clients_phone_key` violation rather than letting it abort the run.
  const { data: existingClientPhones, error: phoneErr } = await supabase.from('clients').select('id, phone')
  if (phoneErr) throw new Error(`[booqable/sync] Failed to load client phones: ${phoneErr.message}`)
  const phoneByLocalId = new Map<string, string>(
    (existingClientPhones ?? []).map((r) => [(r as { id: string }).id, (r as { phone: string }).phone]),
  )
  const ownPhones = new Set<string>()
  for (const [externalId, localId] of existingRefs) {
    const heldPhone = phoneByLocalId.get(localId)
    if (heldPhone !== undefined && resolvedPhoneByExternalId.get(externalId) === heldPhone) ownPhones.add(heldPhone)
  }
  const knownPhones = new Set<string>(
    (existingClientPhones ?? [])
      .map((r) => (r as { phone: string }).phone)
      .filter((phone) => !ownPhones.has(phone)),
  )

  // client_code — minted LAZILY, after mapping, never before it.
  //
  // `next_document_number('CL')` is an atomic sequence: a number handed out is
  // consumed whether or not it is used. Minting one per not-yet-synced record
  // UP FRONT burned a number for every client the mapper then rejected
  // (unresolvable phone, phone collision) — once per unimportable client per
  // run, forever, permanently gapping the CL series. But the mapper needs SOME
  // code before it will emit an insert at all, so it is called with a
  // per-record placeholder token instead: `mapClients` only ever copies this
  // value through to `LocalClientInsert.client_code`, never parses or
  // validates it, and nothing carrying a placeholder is ever written — the
  // insert loop below mints the real client code and substitutes it
  // immediately before the write. The token doubles as an EXACT reverse key
  // back to the Booqable id, replacing a fragile scan over the minted-code map.
  const pendingClientCodes = new Map<BooqableId, string>()
  for (const record of fetch.records) {
    if (!existingRefs.has(record.id)) pendingClientCodes.set(record.id, `${CLIENT_CODE_PENDING_PREFIX}${record.id}`)
  }

  // `panVatPropertyIdentifier` is deliberately OMITTED (not set to
  // `undefined` — exactOptionalPropertyTypes). It is a live TODO(decision):
  // PAN/VAT lives in a `text_field` property, `text_field` is the catch-all
  // type, so only the account-configured identifier could find it and nobody
  // has confirmed what that identifier is. Absent ⇒ `pan_vat` is never
  // written, exactly as before. A guessed value that resolves a non-9-digit
  // string would produce one conflict row per client, every run.
  const ctx: clientsMap.ClientSyncContext = { existingRefs, existingPayloadHashes, knownPhones, mintedClientCodes: pendingClientCodes, clientProperties }
  const result = clientsMap.mapClients(fetch.records, ctx)
  const conflicts: SyncConflictInsert[] = [...(result.conflicts as SyncConflictInsert[])]

  const clientRefs = new Map<BooqableId, string>(existingRefs)
  for (const insert of result.toInsert) {
    // Exact reverse lookup off the placeholder token this record was mapped
    // with (see `pendingClientCodes`), not a scan for a matching minted code.
    const externalId = insert.client_code.startsWith(CLIENT_CODE_PENDING_PREFIX)
      ? insert.client_code.slice(CLIENT_CODE_PENDING_PREFIX.length)
      : undefined
    if (externalId === undefined) {
      // Cannot resolve the Booqable id ⇒ cannot write the Law 9 seed or the
      // paired `external_refs` row, so the record is skipped rather than
      // inserted un-linked (it would import again as new on the next pull).
      conflicts.push(buildConflict('clients', null, null, 'client_code', insert.client_code, 'insert carries no pending client_code token — Booqable id unresolvable, not written'))
      continue
    }
    // Real CL number minted HERE — only for a record that actually survived
    // mapping, so a rejected client never consumes one.
    const insertFields = { ...insert, client_code: await mintDocumentNumber('CL') }
    // Law 9 — the Booqable client id is the stable seed (see
    // `deterministicClientUuid`): if this insert lands but the
    // `upsertExternalRef` two lines down does not, the next `runFullPull` sees
    // the record as new and re-attempts the SAME write, which then dedups on
    // `idempotentInsert`'s 23505-on-`client_uuid` path instead of minting a
    // second client and violating `clients_phone_key`.
    const clientUuid = await deterministicClientUuid('clients', externalId)
    let written: { id: string } | null
    try {
      written = await writeBooqableRow('clients', { ...insertFields, client_uuid: clientUuid })
    } catch (err) {
      // A phone collision the pre-pass could not see (its owner archived,
      // filtered or paged out of this fetch; or claimed between the snapshot
      // and now) reaches the database as `clients_phone_key`.
      // `idempotentInsert` only recovers a 23505 naming `client_uuid`, so this
      // one throws — and nothing above `pullClients` catches it, which would
      // kill the whole run and every later phase over ONE bad record. Recorded
      // as the conflict row it should have been and skipped; anything else
      // still propagates.
      if (!isClientPhoneUniqueViolation(err)) throw err
      conflicts.push(buildConflict('clients', null, externalId, 'phone', null, insertFields.phone))
      continue
    }
    if (written) {
      await upsertExternalRef(BOOQABLE_CLIENT_ENTITY, externalId, written.id, clientsMap.computeClientPayloadHash(insertFields))
      clientRefs.set(externalId, written.id)
    }
  }
  for (const update of result.toUpdate) {
    // Resolved BEFORE the write so a failed update can name the record it was
    // for. `safeUpdate` throws on ANY error, so the same collision guard as the
    // insert loop applies here — Booqable moving a phone onto an
    // already-synced client is exactly an UPDATE-shaped collision.
    const externalId = [...existingRefs.entries()].find(([, localId]) => localId === update.id)?.[0]
    try {
      await updateBooqableRow('clients', update.id, update.fields)
    } catch (err) {
      if (!isClientPhoneUniqueViolation(err)) throw err
      conflicts.push(buildConflict('clients', update.id, externalId ?? null, 'phone', null, update.fields.phone))
      continue
    }
    if (externalId !== undefined) await upsertExternalRef(BOOQABLE_CLIENT_ENTITY, externalId, update.id, clientsMap.computeClientPayloadHash(update.fields))
  }

  return { clientRefs, conflicts }
}

/* ═══════════════════════════════════════════════════════════════════════
 * §6 · Pull phase 4 — orders (+ order_lines, one composed call — Law 2)
 * ═══════════════════════════════════════════════════════════════════════ */

interface OrdersPullOutput {
  bookingRefs: Map<BooqableId, string>
  orderLineRefs: Map<BooqableId, string>
  branchByLocalBookingId: Map<string, string>
  currentStageByLocalId: Map<string, BookingStatus>
  orderLineRecordsByOrder: Map<BooqableId, BooqableFlatResource<'order_lines', BooqableOrderLineAttributes>[]>
  conflicts: SyncConflictInsert[]
}

/**
 * `bookings.cancelled_by` for canceled Booqable orders (map/orders.ts §1b).
 *
 * Booqable's API carries no "which local user cancelled this" in any form, so
 * nothing can be derived from the wire and NO uuid literal is hardcoded here —
 * `0012_seed_data.sql`'s Owner id is environment-specific seed data, and
 * pasting it would silently write the wrong actor (or a nonexistent FK) in any
 * project not seeded from it.
 *
 * Resolution order: (1) `BooqableSyncConfig.cancellationActorUserId`, the
 * preferred path — supplied from Settings / the bridge's own configuration
 * exactly like `defaultDeliveryType`/`systemActorUserId` already are; (2) a
 * runtime lookup by ROLE, which encodes the column's own rule ("Owner and
 * Manager only — the Terminal capability", `0002_bookings.sql`), taking the
 * oldest active Owner. A failed/empty lookup returns `undefined` and is NOT
 * thrown: the mapper then holds every canceled order as a conflict and writes
 * nothing, which is the correct loud failure — aborting the whole pull because
 * one optional actor could not be resolved would be worse.
 *
 * TODO(decision) — whether the terminal actor should be the seeded Owner, a
 * dedicated non-login 'Booqable Sync' service user, or a configured branch
 * Manager is an open product/security question (map/orders.ts's own open
 * questions). This resolves what it can; it does not settle that.
 */
async function resolveCancellationActorUserId(config: BooqableSyncConfig): Promise<string | undefined> {
  if (config.cancellationActorUserId !== undefined) return config.cancellationActorUserId
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('primary_role', 'Owner')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) return undefined
  return (data as { id: string } | null)?.id
}

async function pullOrders(
  config: BooqableSyncConfig,
  productRefs: ReadonlyMap<BooqableId, string>,
  bundleRefs: ReadonlyMap<BooqableId, string>,
  clientRefs: ReadonlyMap<BooqableId, string>,
): Promise<OrdersPullOutput> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const conflicts: SyncConflictInsert[] = []

  // One request per page, `include=order_lines` — Law 2: order_lines come
  // out of THIS SAME response's `included` array, never a second call.
  const fetch = await fetchAllPages<'orders', BooqableOrderAttributes>('/orders', pageSize, { include: 'order_lines' })
  const orderLineRecords = flattenIncludedByType<'order_lines', BooqableOrderLineAttributes>(fetch.included, 'order_lines')

  const orderLineRecordsByOrder = new Map<BooqableId, BooqableFlatResource<'order_lines', BooqableOrderLineAttributes>[]>()
  for (const line of orderLineRecords) {
    const bucket = orderLineRecordsByOrder.get(line.order_id)
    if (bucket) bucket.push(line)
    else orderLineRecordsByOrder.set(line.order_id, [line])
  }

  // Union map — see file header §2 note on why orders + order_lines share
  // one existingRefs/existingPayloadHashes pair.
  const { refs: unionRefs, hashes: unionHashes } = await loadExternalRefs(['orders', 'order_lines'])
  const { refs: orderOnlyRefs } = await loadExternalRefs(['orders'])

  const mintedBookingNumbers = new Map<BooqableId, string>()
  for (const record of fetch.records) {
    if (!orderOnlyRefs.has(record.id)) mintedBookingNumbers.set(record.id, await mintDocumentNumber('BK'))
  }

  // Current stage of every already-synced booking — needed by
  // planStageAdvance for both the orders pull AND (later) the reservations
  // pull, which is required per file header to reuse this SAME map, not a
  // second independently-built one.
  const localBookingIds = [...orderOnlyRefs.values()]
  const currentStageByLocalId = new Map<string, BookingStatus>()
  const branchByLocalBookingId = new Map<string, string>()
  // Local bookings that ALREADY carry a recorded cancellation. `cancelled_at`
  // is derived by the mapper from the order's `updated_at` (the v4 order
  // resource has no cancellation timestamp of its own), so without this set
  // any later unrelated Booqable edit would move `updated_at` and drag a
  // recorded TERMINAL action's timestamp forward — rewriting history on a
  // Law 3 terminal action. One extra column on the query that already runs;
  // no extra round trip.
  const alreadyCancelledLocalIds = new Set<string>()
  if (localBookingIds.length > 0) {
    const { data, error } = await supabase.from('bookings').select('id, stage, branch_id, cancelled_at').in('id', localBookingIds)
    if (error) throw new Error(`[booqable/sync] Failed to load current booking stages: ${error.message}`)
    for (const row of (data ?? []) as { id: string; stage: BookingStatus; branch_id: string; cancelled_at: string | null }[]) {
      currentStageByLocalId.set(row.id, row.stage)
      branchByLocalBookingId.set(row.id, row.branch_id)
      if (row.cancelled_at !== null) alreadyCancelledLocalIds.add(row.id)
    }
  }

  // Resolved once per pull, never per record. Absent ⇒ map/orders.ts holds
  // every canceled order as a `cancelled_by` conflict and writes neither the
  // insert nor the update — never a CHECK-violating row.
  const cancellationActorUserId = await resolveCancellationActorUserId(config)

  const ctx: ordersMap.OrderSyncContext = {
    existingRefs: unionRefs,
    existingPayloadHashes: unionHashes,
    currentStageByLocalId,
    clientRefs,
    productRefs,
    bundleRefs,
    mintedBookingNumbers,
    alreadyCancelledLocalIds,
    ...(cancellationActorUserId !== undefined ? { cancellationActorUserId } : {}),
    resolveBranch: config.resolveBranch ?? (() => undefined),
    defaultDeliveryType: config.defaultDeliveryType,
    systemActorUserId: config.systemActorUserId,
    systemActorRole: config.systemActorRole,
    transitionSource: config.transitionSource ?? DEFAULT_TRANSITION_SOURCE,
  }

  const result = ordersMap.mapOrders(fetch.records, orderLineRecords, ctx)
  conflicts.push(...(result.conflicts as SyncConflictInsert[]))

  const bookingRefs = new Map<BooqableId, string>(orderOnlyRefs)

  for (const op of result.bookings.toInsert) {
    const payload = {
      ...op.fields,
      created_by: config.systemActorUserId,
      updated_by: config.systemActorUserId,
      // Law 9 — the highest-value seed in this file: without it a crash
      // between this insert and its `upsertExternalRef` two lines down leaves
      // the order looking new next run, and the duplicate booking carries a
      // freshly minted `booking_no`, so `bookings_booking_no_key` cannot catch
      // it either. See `deterministicClientUuid`.
      client_uuid: await deterministicClientUuid('bookings', op.externalId),
    }
    const written = await writeBooqableRow('bookings', payload)
    if (written) {
      await upsertExternalRef('orders', op.externalId, written.id, ordersMap.computeOrderPayloadHash(op.fields))
      bookingRefs.set(op.externalId, written.id)
      branchByLocalBookingId.set(written.id, op.fields.branch_id)
      currentStageByLocalId.set(written.id, 'Quote')
    } else {
      conflicts.push(buildConflict('bookings', null, op.externalId, 'insert', null, 'writeBooqableRow returned no id (offline-queued or unexpected shape)'))
    }
  }
  for (const op of result.bookings.toUpdate) {
    const payload = { ...op.fields, updated_by: config.systemActorUserId }
    await updateBooqableRow('bookings', op.localId, payload)
    await upsertExternalRef('orders', op.externalId, op.localId, ordersMap.computeOrderPayloadHash(op.fields))
    bookingRefs.set(op.externalId, op.localId)
  }

  // Stage transitions — the ONLY writer of bookings.stage (0021). Applied
  // strictly in order (they are a causal chain: Quote -> Booked -> …), one
  // INSERT at a time, never batched, since a later transition's `from_stage`
  // depends on the previous one having actually landed.
  for (const transition of result.stageTransitions) {
    const localId = bookingRefs.get(transition.orderExternalId)
    if (localId === undefined) continue // booking itself failed to write above — already logged.
    const branchId = branchByLocalBookingId.get(localId)
    if (branchId === undefined) {
      conflicts.push(buildConflict('booking_stage_transitions', localId, transition.orderExternalId, 'branch_id', null, null))
      continue
    }
    await writeBooqableRow('booking_stage_transitions', {
      // Law 9 — the Booqable order id ALONE is not unique per row here: one
      // order can emit several transitions in a single causal chain. Seeded
      // with the chain step instead, which is both unique within the chain and
      // stable across re-pulls. Safe against a legitimate re-entry of the same
      // stage because `planStageAdvance` is forward-only and NEVER emits
      // `is_reversal` (map/orders.ts §2), so a given (from → to) step can
      // occur at most once in a booking's life.
      client_uuid: await deterministicClientUuid(
        'booking_stage_transitions',
        `${transition.orderExternalId}:${transition.fromStage ?? 'genesis'}:${transition.toStage}`,
      ),
      booking_id: localId,
      branch_id: branchId,
      from_stage: transition.fromStage,
      to_stage: transition.toStage,
      is_reversal: transition.isReversal,
      occurred_at: transition.occurredAt,
      actor_id: transition.actorId,
      actor_role: transition.actorRole,
      source: transition.source,
    })
    currentStageByLocalId.set(localId, transition.toStage)
  }

  const orderLineRefs = new Map<BooqableId, string>()
  for (const [externalId, localId] of unionRefs) {
    if (!orderOnlyRefs.has(externalId)) orderLineRefs.set(externalId, localId) // whatever's left in the union after removing order ids is order_line ids.
  }

  for (const op of result.bookingLines.toInsert) {
    const bookingId = bookingRefs.get(op.orderExternalId)
    if (bookingId === undefined) {
      conflicts.push(buildConflict('booking_lines', null, op.externalId, 'booking_id', null, op.orderExternalId))
      continue
    }
    const written = await writeBooqableRow('booking_lines', {
      ...op.fields,
      booking_id: bookingId,
      created_by: config.systemActorUserId,
      client_uuid: await deterministicClientUuid('booking_lines', op.externalId),
    })
    if (written) {
      await upsertExternalRef('order_lines', op.externalId, written.id, ordersMap.computeOrderPayloadHash(op.fields))
      orderLineRefs.set(op.externalId, written.id)
    }
  }
  for (const op of result.bookingLines.toUpdate) {
    // Defence in depth behind map/orders.ts's `heldExternalIds` (which already
    // suppresses BOTH line lists for a held order): an update whose parent
    // order has no resolvable booking must not refresh a line either. The
    // insert loop above has always had this guard; this one had none, so a
    // held order's already-synced lines could still be refreshed against a
    // booking the mapper deliberately left untouched.
    if (bookingRefs.get(op.orderExternalId) === undefined) {
      conflicts.push(buildConflict('booking_lines', op.localId, op.externalId, 'booking_id', null, op.orderExternalId))
      continue
    }
    await updateBooqableRow('booking_lines', op.localId, op.fields)
    await upsertExternalRef('order_lines', op.externalId, op.localId, ordersMap.computeOrderPayloadHash(op.fields))
  }

  return { bookingRefs, orderLineRefs, branchByLocalBookingId, currentStageByLocalId, orderLineRecordsByOrder, conflicts }
}

/* ═══════════════════════════════════════════════════════════════════════
 * §7 · Pull phase 5 — payments → payments / security_deposits / deposit_movements / payment_reversals
 * ═══════════════════════════════════════════════════════════════════════ */

async function pullPayments(
  config: BooqableSyncConfig,
  bookingRefs: ReadonlyMap<BooqableId, string>,
  branchByLocalBookingId: ReadonlyMap<string, string>,
): Promise<SyncConflictInsert[]> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const conflicts: SyncConflictInsert[] = []

  const methodsFetch = await fetchAllPages<'payment_methods', BooqablePaymentMethodAttributes>('/payment_methods', pageSize)
  const paymentMethodNames = new Map<BooqableId, string>(methodsFetch.records.map((m) => [m.id, m.name]))

  // The two halves a Booqable payment id can occupy, told apart by
  // `external_refs.entity` — NOT (as this used to do) by probing which local
  // table each single `local_id` happens to live in. That probe could not
  // represent a Law-5 split at all: it assigned every external id to exactly
  // ONE map, whereas map/payments.ts now requires a split id to appear in
  // BOTH (`hasBothRefs` is how it recognises an already-split record, and how
  // its partial-import repair path spots which half is missing). Entity-keyed
  // refs make that disambiguation free and exact. See PAYMENTS_DEPOSIT_ENTITY.
  const { refs: existingPaymentRefs, hashes: paymentHashes } = await loadExternalRefs(['payments'])
  const { refs: existingDepositMovementRefs, hashes: depositHashes } = await loadExternalRefs([PAYMENTS_DEPOSIT_ENTITY])
  // Both ref rows of a split carry the IDENTICAL payload_hash — the same
  // `computePaymentPayloadHash(record)` over the same single wire record — so
  // the merge order of the two maps is irrelevant.
  const existingPayloadHashes = new Map<BooqableId, string>([...depositHashes, ...paymentHashes])

  // Pre-correction amounts (Law 4 reversals) come only from rows the
  // `'payments'` entity points at — the trust half is a deposit_movements row
  // and has no `payments.amount` to read.
  const existingPaymentAmounts = new Map<BooqableId, number>()
  const paymentLocalIds = [...existingPaymentRefs.values()]
  if (paymentLocalIds.length > 0) {
    const { data, error } = await supabase.from('payments').select('id, amount').in('id', paymentLocalIds)
    if (error) throw new Error(`[booqable/sync] Failed to load payments amounts: ${error.message}`)
    const amountById = new Map(((data ?? []) as { id: string; amount: number }[]).map((r) => [r.id, r.amount]))
    for (const [externalId, localId] of existingPaymentRefs) {
      const amount = amountById.get(localId)
      if (amount !== undefined) existingPaymentAmounts.set(externalId, amount)
    }
  }

  const { data: depositRows, error: depErr } = await supabase.from('security_deposits').select('id, booking_id')
  if (depErr) throw new Error(`[booqable/sync] Failed to load security_deposits: ${depErr.message}`)
  const existingSecurityDepositByBookingId = new Map<string, string>(
    ((depositRows ?? []) as { id: string; booking_id: string }[]).map((r) => [r.booking_id, r.id]),
  )

  // The type parameter is the documented polymorphic discriminator — the
  // /payments list returns a MIX of payment_charges / payment_authorizations
  // / payment_refunds records (types.ts §12, CONFIRMED 10 Aug 2026).
  const fetch = await fetchAllPages<BooqablePaymentResourceType, BooqablePaymentAttributes>('/payments', pageSize)

  const resolveOrder = (orderExternalId: BooqableId): paymentsMap.ResolvedOrder | undefined => {
    const bookingLocalId = bookingRefs.get(orderExternalId)
    if (bookingLocalId === undefined) return undefined
    const branchLocalId = branchByLocalBookingId.get(bookingLocalId)
    // clientLocalId is resolved from the booking's own client, not a second
    // Booqable order_id lookup — the booking row already carries client_id.
    return branchLocalId === undefined ? undefined : { bookingLocalId, clientLocalId: '', branchLocalId }
  }

  // clientLocalId above is intentionally deferred: `payments.ts` needs it,
  // but a payment record carries no client id of its own (only order_id) —
  // resolve it once per booking via a single batched query rather than one
  // query per payment (Law 2's spirit, even outside a mapper).
  // order_id is nullable on the wire (cart payments — types.ts §12).
  const bookingIdsNeeded = [...new Set(fetch.records.map((r) => (r.order_id === null ? undefined : bookingRefs.get(r.order_id))).filter((v): v is string => v !== undefined))]
  const clientIdByBookingId = new Map<string, string>()
  if (bookingIdsNeeded.length > 0) {
    const { data, error } = await supabase.from('bookings').select('id, client_id').in('id', bookingIdsNeeded)
    if (error) throw new Error(`[booqable/sync] Failed to load booking client_ids: ${error.message}`)
    for (const row of (data ?? []) as { id: string; client_id: string }[]) clientIdByBookingId.set(row.id, row.client_id)
  }
  const resolveOrderWithClient = (orderExternalId: BooqableId): paymentsMap.ResolvedOrder | undefined => {
    const resolved = resolveOrder(orderExternalId)
    if (!resolved) return undefined
    const clientLocalId = clientIdByBookingId.get(resolved.bookingLocalId)
    return clientLocalId === undefined ? undefined : { ...resolved, clientLocalId }
  }

  // Pre-pass — classify + hash each record via the mapper's OWN exported
  // pure functions (reused, not reimplemented — Law 1) purely to know how
  // many document numbers of each kind to mint. Minting a number for a
  // record that later turns out `held`/unresolvable is an accepted,
  // harmless gap in an atomic sequence (padding tolerates gaps by design,
  // 0007_admin_security.sql) — never the reverse (a record silently skipped
  // for lack of a number that a more precise pre-pass would have minted).
  //
  // "A harmless gap" means a gap per SKIPPED RECORD, though — not a gap per
  // record per PULL. `next_document_number` is an atomic `select … for
  // update` sequence, so an unconditional mint here advanced PAY by (number
  // of payments) on EVERY pull, forever, for records the mapper then skipped
  // as unchanged (map/payments.ts's spec-§7-rule-3 early `continue`). Each
  // arm below is therefore gated on the record actually being able to consume
  // the number — using the SAME facts the mapper's own decision uses
  // (`existingPayloadHashes` + its exported `computePaymentPayloadHash`), so
  // the gate can only ever match it, never under-mint behind it.
  const mintedPaymentNumbers = new Map<BooqableId, string>()
  const mintedDepositMovementNumbers = new Map<BooqableId, string>()
  const mintedSecurityDepositNumbers = new Map<string, string>()
  const mintedReversalNumbers = new Map<BooqableId, string>()
  const depositBookingsQueued = new Set<string>()

  for (const record of fetch.records) {
    const paymentMethodName = record.payment_method_id !== null ? (paymentMethodNames.get(record.payment_method_id) ?? null) : null
    const classification = paymentsMap.classifyBooqablePayment(record, paymentMethodName)
    const existingPaymentLocalId = existingPaymentRefs.get(record.id)
    const existingDepositLocalId = existingDepositMovementRefs.get(record.id)
    const isKnown = existingPaymentLocalId !== undefined || existingDepositLocalId !== undefined
    // Same hash the mapper computes for this record, compared against the same
    // ref-derived baseline — this is the mapper's own "did anything change"
    // test, not a second rule invented here.
    const payloadHash = paymentsMap.computePaymentPayloadHash(record)
    const hashChanged = existingPayloadHashes.get(record.id) !== payloadHash

    if (classification === 'ordinary_payment') {
      // The mapper consumes a PAY number on exactly two paths for this
      // classification: a brand-new import (`!isKnown`) and a Law-4 correction
      // (already imported AND the wire state moved). Anything else takes the
      // unchanged early-`continue` or a conflict, and would burn the number.
      if (!isKnown || hashChanged) {
        mintedPaymentNumbers.set(record.id, await mintDocumentNumber('PAY'))
      }
      if (existingPaymentLocalId !== undefined && hashChanged) {
        // Derived, not random — see `deterministicPlaceholderNumber`. Keyed on
        // the same (payment id + payload hash) pair the correction's
        // `client_uuid` uses, so a replay of the SAME correction reproduces the
        // SAME reversal_no and trips `payment_reversals_no_key`.
        mintedReversalNumbers.set(record.id, await deterministicPlaceholderNumber('REV', `${record.id}:${payloadHash}`))
      }
    } else if (classification === 'mixed' && !(existingPaymentLocalId !== undefined && existingDepositLocalId !== undefined)) {
      // A 'mixed' record needs BOTH numbers, and — unlike the 'deposit' arm —
      // is minted whenever the split is NOT yet complete, never gated on the
      // narrower `!isKnown`: the mapper's partial-import repair path re-emits
      // whichever half is missing from a record that IS already known, and
      // abandons the record whole if the number it needs is absent. Unused
      // numbers are the tolerated sequence gap this loop's own comment above
      // already accepts; a silently unimported split is not. What the guard on
      // this arm excludes is only the FULLY imported split (both refs present)
      // — the repair path can emit nothing for it, and a changed hash sends it
      // to `mixed_payment_changed` with nothing written, so every number minted
      // for it was pure sequence burn, once per pull, forever. Note this arm
      // cannot be caught by tsc — `classifyBooqablePayment` widening to a
      // fourth member still compiles against an if/else-if chain, it just
      // fails at runtime.
      mintedPaymentNumbers.set(record.id, await mintDocumentNumber('PAY'))
      mintedDepositMovementNumbers.set(record.id, mintPlaceholderNumber('DMOV'))
      const bookingLocalId = record.order_id === null ? undefined : bookingRefs.get(record.order_id)
      if (bookingLocalId !== undefined && !existingSecurityDepositByBookingId.has(bookingLocalId) && !depositBookingsQueued.has(bookingLocalId)) {
        mintedSecurityDepositNumbers.set(bookingLocalId, await mintDocumentNumber('DEP'))
        depositBookingsQueued.add(bookingLocalId)
      }
    } else if (classification === 'deposit' && !isKnown) {
      mintedDepositMovementNumbers.set(record.id, mintPlaceholderNumber('DMOV'))
      const bookingLocalId = record.order_id === null ? undefined : bookingRefs.get(record.order_id)
      if (bookingLocalId !== undefined && !existingSecurityDepositByBookingId.has(bookingLocalId) && !depositBookingsQueued.has(bookingLocalId)) {
        mintedSecurityDepositNumbers.set(bookingLocalId, await mintDocumentNumber('DEP'))
        depositBookingsQueued.add(bookingLocalId)
      }
    }
  }

  const ctx: paymentsMap.PaymentSyncContext = {
    resolveOrder: resolveOrderWithClient,
    existingPaymentRefs,
    existingPaymentAmounts,
    existingDepositMovementRefs,
    existingPayloadHashes,
    existingSecurityDepositByBookingId,
    paymentMethodNames,
    accountCurrency: config.accountCurrency,
    mintedPaymentNumbers,
    mintedDepositMovementNumbers,
    mintedSecurityDepositNumbers,
    mintedReversalNumbers,
    systemActorUserId: config.systemActorUserId,
    ...(config.systemReversalApproverUserId !== undefined ? { systemReversalApproverUserId: config.systemReversalApproverUserId } : {}),
    ...(config.defaultRequiredDepositAmount !== undefined ? { defaultRequiredDepositAmount: config.defaultRequiredDepositAmount } : {}),
  }

  const result = paymentsMap.mapPayments(fetch.records, ctx)
  conflicts.push(...(result.conflicts as SyncConflictInsert[]))
  for (const held of result.held) conflicts.push(heldPaymentToConflict(held))

  // Write ORDER below is load-bearing and must not be reordered:
  //   security_deposits → deposit_movements → payments → payment_reversals.
  // (a) the parent security_deposits row must exist before its
  //     deposit_movements child (the parent loop hands its id down via
  //     `securityDepositIdByBookingId`; the child's `?? select().single()`
  //     fallback remains for a parent neither map knows about); (b)
  //     trust-before-revenue is the correct Law 5 bias — if the process dies
  //     mid-split the surviving half is the LIABILITY, never a revenue row
  //     overstating cash with no matching liability. Each row's
  //     `upsertExternalRef` stays immediately after that row's own insert,
  //     which is what makes the mapper's repair path able to see exactly which
  //     half landed — with ONE deliberate exception, the Law-4 correction,
  //     whose ref move waits for its paired reversal (see `correctionRefPending`).
  //
  // The mapper guarantees atomicity of what it EMITS but cannot guarantee
  // what LANDS: the trust loop can still fail at write time (parent lookup
  // returns undefined, or writeBooqableRow returns null on an offline-queued
  // insert). Because trust runs first, the revenue half would otherwise be
  // written anyway — a payments row booking the rental portion as cash with no
  // deposit_movements row for the trust portion, i.e. a corrupted cash
  // position from a mapper-level-correct split. The two ops carry the same
  // `externalId`, so the failed ones are recorded here and skipped there.
  const trustHalfFailed = new Set<BooqableId>()
  /**
   * The Law-4 mirror image of `trustHalfFailed`, one loop further down: a
   * correction is a PAIR (replacement `payments` row + `payment_reversals`
   * row) emitted together by the mapper and written by two separate loops
   * here. If the replacement did not land, the reversal must not either —
   * a payment reversed to zero with no replacement understates cash by the
   * full amount, and Law 4 forbids repairing it with an UPDATE.
   */
  const revenueHalfFailed = new Set<BooqableId>()
  /** Correction ops whose replacement row landed but whose `external_refs` move is deliberately held back until the paired reversal lands too. */
  const correctionRefPending = new Map<BooqableId, { localId: string; payloadHash: string }>()
  /** `security_deposits.id` for every parent this run resolved or opened, so the movements loop never re-queries one this loop just wrote. */
  const securityDepositIdByBookingId = new Map<string, string>()

  for (const op of result.securityDepositsToInsert) {
    // No external_refs entry for security_deposits itself — it has no
    // Booqable-side natural key of its own (it is opened implicitly by the
    // FIRST deposit movement against a booking); the deposit_movements ref
    // below is what makes this idempotent on resync. The `client_uuid` is
    // still keyed deterministically off `bookingLocalId` (see
    // `deterministicClientUuid` above) so a retry of THIS insert — before the
    // deposit_movements row that would otherwise make it findable again ever
    // lands — hits idempotentInsert's 23505 dedup path instead of opening a
    // second security_deposits row for the same booking.
    //
    // That dedup path only covers a repeat of THIS insert, though. The other
    // way this row can already exist is a race: `security_deposits` also
    // carries `security_deposits_booking_key unique (booking_id)`, and another
    // session (or an OS-native deposit flow) can open the booking's deposit
    // between the snapshot `existingSecurityDepositByBookingId` was taken from
    // and this write. That 23505 names the BOOKING key, not `client_uuid`, so
    // `idempotentInsert`'s dedup branch does not match it and it throws —
    // aborting this phase and every later one over a condition that is fully
    // recoverable, because an existing parent is exactly what this loop wanted.
    // Adopted instead of rethrown; anything else still propagates.
    const clientUuid = await deterministicClientUuid('security_deposits', op.bookingLocalId)
    let depositId: string | undefined
    try {
      depositId = (await writeBooqableRow('security_deposits', { ...op.fields, client_uuid: clientUuid }))?.id
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('security_deposits_booking_key')) throw err
      const { data } = await supabase.from('security_deposits').select('id').eq('booking_id', op.bookingLocalId).maybeSingle()
      depositId = (data as { id: string } | null)?.id
      if (depositId === undefined) throw err
      conflicts.push(buildConflict('security_deposits', depositId, null, 'booking_id', op.bookingLocalId, 'deposit opened concurrently by another writer — adopted, not duplicated'))
    }
    // Stop discarding the result: the movements loop below can then attach the
    // parent it just created without a per-op round trip.
    if (depositId !== undefined) securityDepositIdByBookingId.set(op.bookingLocalId, depositId)
  }
  for (const op of result.depositMovementsToInsert) {
    const securityDepositId =
      securityDepositIdByBookingId.get(op.bookingLocalId) ??
      existingSecurityDepositByBookingId.get(op.bookingLocalId) ??
      (await (async () => {
        const { data } = await supabase.from('security_deposits').select('id').eq('booking_id', op.bookingLocalId).single()
        return (data as { id: string } | null)?.id
      })())
    if (securityDepositId === undefined) {
      conflicts.push(buildConflict('deposit_movements', null, op.externalId, 'security_deposit_id', null, op.bookingLocalId))
      trustHalfFailed.add(op.externalId)
      continue
    }
    // `client_uuid` keyed off the Booqable payment id (op.externalId, stable
    // across retries and resyncs — see `deterministicClientUuid` above) so a
    // retry of this exact insert hits idempotentInsert's 23505 dedup path
    // and returns the row already written, instead of the random UUID
    // idempotentInsert would otherwise mint and inserting a duplicate
    // deposit_movements row that upsertExternalRef never got to claim.
    const depositMovementClientUuid = await deterministicClientUuid('deposit_movements', op.externalId)
    const written = await writeBooqableRow('deposit_movements', { ...op.fields, security_deposit_id: securityDepositId, client_uuid: depositMovementClientUuid })
    if (written) {
      // Entity PAYMENTS_DEPOSIT_ENTITY, not 'payments' — see that constant.
      // Both halves of a split MUST carry the identical payload_hash (they are
      // one wire record), which is why this is the same expression the
      // revenue loop below uses.
      const record = fetch.records.find((r) => r.id === op.externalId)
      await upsertExternalRef(PAYMENTS_DEPOSIT_ENTITY, op.externalId, written.id, record ? paymentsMap.computePaymentPayloadHash(record) : '')
    } else {
      conflicts.push(buildConflict('deposit_movements', null, op.externalId, 'insert', null, 'writeBooqableRow returned no id (offline-queued or unexpected shape)'))
      trustHalfFailed.add(op.externalId)
    }
  }
  for (const op of result.paymentsToInsert) {
    if (trustHalfFailed.has(op.externalId)) {
      conflicts.push(buildConflict('payments', null, op.externalId, 'split_half_failed', null, 'trust half not written — revenue half withheld to keep the split atomic (Law 5)'))
      // A withheld payments row withholds any paired reversal too, whatever
      // withheld it. (A split and a correction cannot both apply to one
      // record — one classification per record — so this is belt-and-braces.)
      revenueHalfFailed.add(op.externalId)
      continue
    }
    // Same reasoning as deposit_movements above — client_uuid keyed off the
    // Booqable payment id, so a retry before upsertExternalRef lands dedupes
    // instead of minting a second payments row (Law 4 makes this doubly
    // important: payments are insert-only, so a duplicate can never be
    // corrected by a later UPDATE, only by a reversal row).
    //
    // EXCEPT on the Law-4 correction path, where that seed is fatal: the
    // correction insert (`op.correctionOfLocalId`, map/payments.ts §4) is a
    // SECOND payments row for an external id that already owns one, so the
    // bare-id seed reproduces the ORIGINAL row's client_uuid, idempotentInsert
    // catches the 23505 and RETURNS THE ORIGINAL, and the replacement is never
    // written — while the reversal below still lands. The suffix is the
    // record's payload hash: a pure function of the wire state, so a retry of
    // the same correction still dedups onto the replacement it wrote last time,
    // and a genuinely different Booqable state derives a genuinely new row.
    const record = fetch.records.find((r) => r.id === op.externalId)
    const payloadHash = record ? paymentsMap.computePaymentPayloadHash(record) : ''
    const isCorrection = op.correctionOfLocalId !== undefined
    const paymentClientUuid = await deterministicClientUuid('payments', isCorrection ? `${op.externalId}:${payloadHash}` : op.externalId)
    const written = await writeBooqableRow('payments', { ...op.fields, client_uuid: paymentClientUuid })
    if (written === null) {
      conflicts.push(buildConflict('payments', null, op.externalId, 'insert', null, 'writeBooqableRow returned no id (offline-queued or unexpected shape)'))
      revenueHalfFailed.add(op.externalId)
      continue
    }
    // Seed-regression tripwire. If the row this insert "wrote" is the very row
    // `external_refs` already points at for this external id, nothing new was
    // inserted — the write deduped into its own predecessor. Advancing the ref
    // then would stamp the NEW payload hash onto the OLD row and the record
    // would read as fully synced forever, which for a correction means a
    // payment reversed to zero with no replacement. Fail loudly instead.
    if (written.id === existingPaymentRefs.get(op.externalId)) {
      conflicts.push(
        buildConflict(
          'payments',
          written.id,
          op.externalId,
          'client_uuid',
          written.id,
          'insert deduped into the row it should have replaced — external_refs NOT advanced, reversal withheld',
        ),
      )
      revenueHalfFailed.add(op.externalId)
      continue
    }
    if (isCorrection) {
      // Do NOT advance the ref yet. The correction is a PAIR (replacement +
      // reversal) and the reversal is written in the loop below; stamping the
      // new hash here would make a crash in between read as "fully synced" on
      // the next pull — the original payment left un-reversed alongside its
      // replacement, i.e. the same money counted twice. Deferred to the
      // reversal loop, which upserts it only once both halves have landed.
      correctionRefPending.set(op.externalId, { localId: written.id, payloadHash })
      continue
    }
    await upsertExternalRef('payments', op.externalId, written.id, payloadHash)
  }
  for (const op of result.reversalsToInsert) {
    // payment_reversals — insert-only, no local row is ever updated (Law 4);
    // no external_refs entry either, since Booqable has no reversal-shaped
    // resource of its own (map/payments.ts header) — traced via `externalId`
    // in the row itself for audit purposes only.
    //
    // Which is exactly why this row needs BOTH guards below. With no ref and
    // (previously) no client_uuid, `idempotentInsert` minted a fresh random
    // one every run and the 23505 dedup path could never fire, so any replay
    // reversed the same payment a second time — uncorrectable under Law 4,
    // since `0006_finance.sql` has no sum-vs-original CHECK.
    if (revenueHalfFailed.has(op.externalId)) {
      conflicts.push(
        buildConflict(
          'payment_reversals',
          op.fields.original_payment_id,
          op.externalId,
          'reversal_withheld',
          null,
          'replacement payment not written — reversal withheld so the original is never reversed with nothing to replace it (Law 4)',
        ),
      )
      continue
    }
    const pendingRef = correctionRefPending.get(op.externalId)
    // Seeded with the payment id, the row being corrected AND the wire payload
    // hash: identical across retries of THIS correction (so the replay dedups
    // on `payment_reversals_client_uuid_key`), different for a SECOND, later
    // correction of the same payment (which must produce its own reversal).
    // Read from the wire record rather than from `pendingRef`, so the seed does
    // not depend on the pairing having been observed in this same process.
    const reversalRecord = fetch.records.find((r) => r.id === op.externalId)
    const reversalClientUuid = await deterministicClientUuid(
      'payment_reversals',
      `${op.externalId}:${op.fields.original_payment_id}:${reversalRecord ? paymentsMap.computePaymentPayloadHash(reversalRecord) : ''}`,
    )
    let writtenReversal: { id: string } | null
    try {
      writtenReversal = await writeBooqableRow('payment_reversals', { ...op.fields, client_uuid: reversalClientUuid })
    } catch (err) {
      // Both of this table's unique keys now derive from the same stable
      // (payment id, corrected row, payload hash) triple, so a replay violates
      // BOTH at once and Postgres reports whichever index it reached first.
      // `idempotentInsert` only recognises the `client_uuid` spelling, so
      // without this the `reversal_no` spelling would abort the phase on a
      // replay — the one outcome a second line of defence must never cause.
      // Either message means the identical fact: this exact reversal is
      // already on the ledger. Adopt it; never insert a second (Law 4).
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('payment_reversals_no_key') && !message.includes('payment_reversals_client_uuid_key')) throw err
      const { data } = await supabase.from('payment_reversals').select('id').eq('client_uuid', reversalClientUuid).maybeSingle()
      writtenReversal = data as { id: string } | null
      if (writtenReversal === null) throw err
    }
    if (writtenReversal === null) {
      conflicts.push(buildConflict('payment_reversals', op.fields.original_payment_id, op.externalId, 'insert', null, 'writeBooqableRow returned no id (offline-queued or unexpected shape)'))
      continue
    }
    // Both halves landed — NOW the ref may move to the replacement row.
    if (pendingRef !== undefined) {
      await upsertExternalRef('payments', op.externalId, pendingRef.localId, pendingRef.payloadHash)
      correctionRefPending.delete(op.externalId)
    }
  }

  return conflicts
}

/* ═══════════════════════════════════════════════════════════════════════
 * §8 · Pull phase 6 — documents → external_invoices
 * ═══════════════════════════════════════════════════════════════════════ */

async function pullDocuments(config: BooqableSyncConfig, bookingRefs: ReadonlyMap<BooqableId, string>): Promise<SyncConflictInsert[]> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const { refs: existingRefs, hashes: existingPayloadHashes } = await loadExternalRefs(['documents'])
  const fetch = await fetchAllPages<'documents', BooqableDocumentAttributes>('/documents', pageSize)

  const ctx: documentsMap.DocumentSyncContext = { existingRefs, existingPayloadHashes, orderRefs: bookingRefs, accountCurrency: config.accountCurrency }
  const result = documentsMap.mapDocuments(fetch.records, ctx)
  const conflicts: SyncConflictInsert[] = [...(result.conflicts as SyncConflictInsert[])]

  for (const insert of result.toInsert) {
    const written = await insertMirrorRow('external_invoices', insert)
    if (written) await upsertExternalRef('documents', insert.external_id, written.id, documentsMap.computeDocumentPayloadHash(insert))
  }
  for (const update of result.toUpdate) {
    const { error } = await supabase.from('external_invoices').update(update.fields).eq('id', update.id)
    if (error) throw new Error(`[booqable/sync] Failed to update external_invoices: ${error.message}`)
  }

  return conflicts
}

/* ═══════════════════════════════════════════════════════════════════════
 * §9 · Pull phase 7 — plannings (+ availabilities no-op) → inventory_reservations
 * ═══════════════════════════════════════════════════════════════════════ */

function makeResolveBookingLine(
  orderLineRecordsByOrder: ReadonlyMap<BooqableId, BooqableFlatResource<'order_lines', BooqableOrderLineAttributes>[]>,
  orderLineRefs: ReadonlyMap<BooqableId, string>,
): availabilityMap.ReservationSyncContext['resolveBookingLine'] {
  return (orderExternalId, itemExternalId, itemType, startsAt, stopsAt) => {
    const lines = orderLineRecordsByOrder.get(orderExternalId) ?? []
    const candidates = lines.filter((l) => l.item_id === itemExternalId && l.item_type.toLowerCase() === itemType.toLowerCase())
    // Best-effort disambiguation when a product/bundle appears on more than
    // one line of the same order (booking_lines has no per-line date column
    // of its own — 0002_bookings.sql — so an exact window match can only be
    // checked against the BOOQABLE order_line's own planned window, not a
    // local one). Falls back to the first candidate.
    const exact = candidates.find((l) => l.planned_starts_at === startsAt && l.planned_stops_at === stopsAt)
    const chosen = exact ?? candidates[0]
    return chosen ? orderLineRefs.get(chosen.id) : undefined
  }
}

async function pullReservations(
  config: BooqableSyncConfig,
  productRefs: ReadonlyMap<BooqableId, string>,
  bookingRefs: ReadonlyMap<BooqableId, string>,
  currentStageByLocalId: ReadonlyMap<string, BookingStatus>,
  orderLineRecordsByOrder: ReadonlyMap<BooqableId, BooqableFlatResource<'order_lines', BooqableOrderLineAttributes>[]>,
  orderLineRefs: ReadonlyMap<BooqableId, string>,
): Promise<SyncConflictInsert[]> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const conflicts: SyncConflictInsert[] = []

  // availabilities — documented no-op (map/availability.ts §2); fetched only
  // for parity with the entity's own dispatcher, no writes result.
  await fetchAllPages<'availabilities', never>('/availabilities', pageSize).catch(() => ({ records: [], included: [] }))

  const { refs: existingRefs, hashes: existingPayloadHashes } = await loadExternalRefs(['plannings'])
  const fetch = await fetchAllPages<'plannings', BooqablePlanningAttributes>('/plannings', pageSize)

  const ctx: availabilityMap.ReservationSyncContext = {
    existingRefs,
    existingPayloadHashes,
    bookingRefs,
    currentStageByLocalId,
    productRefs,
    resolveBookingLine: makeResolveBookingLine(orderLineRecordsByOrder, orderLineRefs),
    resolveAssetLocalId: config.resolveAssetLocalId ?? (() => undefined),
    ...(config.systemActorUserId !== undefined ? { systemActorUserId: config.systemActorUserId } : {}),
  }

  const result = availabilityMap.mapPlannings(fetch.records, ctx)
  conflicts.push(...(result.conflicts as SyncConflictInsert[]))

  // Single-row inserts, never batched — the GiST exclusion constraint
  // (`inventory_reservations_no_double_booking`) must be checked ROW BY ROW
  // so one violation never aborts the rest of the batch (map/availability.ts
  // header, "an AUDITOR here, not a blocker").
  for (const op of result.toInsert) {
    try {
      const written = await writeBooqableRow('inventory_reservations', { ...op.fields, client_uuid: await deterministicClientUuid('inventory_reservations', op.externalId) })
      if (written) await upsertExternalRef('plannings', op.externalId, written.id, op.payloadHash)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes(availabilityMap.EXCLUSION_VIOLATION_SQLSTATE)) {
        conflicts.push(availabilityMap.reservationExclusionConflict(op))
      } else {
        throw err
      }
    }
  }
  for (const op of result.toRelease) {
    await updateBooqableRow('inventory_reservations', op.localId, { released_at: op.releasedAt, released_reason: op.releasedReason })
  }

  return conflicts
}

/* ═══════════════════════════════════════════════════════════════════════
 * §10 · Top-level pull entry point
 * ═══════════════════════════════════════════════════════════════════════ */

export interface PullRunSummary {
  conflicts: SyncConflictInsert[]
  countsByEntity: Record<string, number>
}

/** Runs all seven pull phases, in the dependency order the file header names. Not resumable mid-run — a failure partway through leaves whatever was already written committed (each phase's writes are independent rows, never one transaction spanning phases) and the caller re-runs from the top; every phase is itself idempotent (spec §7 rule 3 / external_refs-keyed upserts), so a re-run only re-touches what actually changed. */
export async function runFullPull(config: BooqableSyncConfig): Promise<PullRunSummary> {
  const conflicts: SyncConflictInsert[] = []

  /**
   * Persist a phase's conflicts AS THAT PHASE COMPLETES, not once at the end.
   *
   * A later phase throwing (every one of them can — `loadExternalRefs`,
   * `upsertExternalRef` and `insertMirrorRow` all throw on any Supabase error)
   * used to discard the WHOLE run's accumulated array, including the
   * `split_half_failed` / `security_deposit_id` rows that are the only
   * operator-visible record that a mixed payment's trust half failed and its
   * revenue half was deliberately withheld. The refs-based repair path still
   * recovers the money on the next pull, but the human-facing signal that
   * money was held back vanished exactly when a run was already failing.
   * `PullRunSummary.conflicts` still returns the full run, unchanged.
   */
  const record = async (phaseConflicts: readonly SyncConflictInsert[]): Promise<void> => {
    conflicts.push(...phaseConflicts)
    await insertSyncConflicts(phaseConflicts)
  }

  const catalogue = await pullCatalogue(config)
  await record(catalogue.conflicts)

  const stockConflicts = await pullStock(config, catalogue.productRefs)
  await record(stockConflicts)

  const clients = await pullClients(config)
  await record(clients.conflicts)

  const orders = await pullOrders(config, catalogue.productRefs, catalogue.bundleRefs, clients.clientRefs)
  await record(orders.conflicts)

  const paymentConflicts = await pullPayments(config, orders.bookingRefs, orders.branchByLocalBookingId)
  await record(paymentConflicts)

  const documentConflicts = await pullDocuments(config, orders.bookingRefs)
  await record(documentConflicts)

  const reservationConflicts = await pullReservations(
    config,
    catalogue.productRefs,
    orders.bookingRefs,
    orders.currentStageByLocalId,
    orders.orderLineRecordsByOrder,
    orders.orderLineRefs,
  )
  await record(reservationConflicts)

  return {
    conflicts,
    countsByEntity: conflicts.reduce<Record<string, number>>((acc, c) => {
      acc[c.entity] = (acc[c.entity] ?? 0) + 1
      return acc
    }, {}),
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * §11 · Push — the write-back allowlist (spec §11)
 *
 * The ONLY six operations allowed to reach Booqable; every other local
 * write stays local. Each function below: (a) checks its named guard,
 * (b) performs the local write via `dataAccess.ts` (so Law 8/9's
 * idempotency + offline-queue behaviour applies exactly like any other
 * local write in this codebase — nothing reimplemented), (c) enqueues ONE
 * `sync_outbox` row reusing the SAME `client_uuid` the local write just
 * carried (Law 9 — "never invent a second key"). The `payload` column is
 * the LOCAL-shaped fields, not a Booqable wire body — see file header for
 * why translating local shape → Booqable's wire shape is intentionally left
 * to a not-yet-written piece, never this file (Law 1).
 *
 * Nothing below calls `booqableWrite`/`client.ts` — "nothing calls Booqable
 * directly from a UI component," and this file is not a UI component, but
 * it is also not the outbox drainer; nothing here originates a live
 * Booqable HTTP call at all. That is a separate, not-yet-written piece
 * (likely an Edge Function reading `sync_outbox` — matching the RLS/
 * execution-context note in the file header) which is also where the
 * 5-attempt exponential-backoff retry and the eventual `status='failed'`
 * Owner alert belong; this file only ever writes the INITIAL row
 * (`status='pending'`, `attempts=0`, both column defaults) and leaves it.
 * ═══════════════════════════════════════════════════════════════════════ */

export type WritebackOperation =
  | 'create_client'
  | 'update_client_contact'
  | 'create_order'
  | 'order_reserve'
  | 'order_start'
  | 'order_stop'

/** Named home for the write-back allowlist's field-level answer, per spec §5.1/§11 — the ONE place `conflicts.ts`'s `isOsWritable` input should be computed from, so there is exactly one enumeration of "which fields the OS may push" in the codebase, not a second, drifting one inside `conflicts.ts`. */
export const WRITEBACK_ALLOWLIST: Readonly<Record<WritebackOperation, { entity: BooqableClientEntity | 'orders'; fields: readonly string[] }>> = {
  create_client: { entity: BOOQABLE_CLIENT_ENTITY, fields: ['name', 'email', 'phone', 'address_line', 'city', 'district', 'postal_code', 'country'] },
  update_client_contact: { entity: BOOQABLE_CLIENT_ENTITY, fields: ['email', 'phone', 'address_line', 'city', 'district', 'postal_code', 'country'] },
  create_order: { entity: 'orders', fields: ['client_id', 'branch_id', 'pickup_at', 'return_at', 'delivery_type', 'lines'] },
  order_reserve: { entity: 'orders', fields: ['status'] },
  order_start: { entity: 'orders', fields: ['status'] },
  order_stop: { entity: 'orders', fields: ['status'] },
}

/**
 * TODO(decision) — UNCONFIRMED against live Booqable v4 docs, same posture
 * as `UNCONFIRMED_BOOQABLE_FACTS` in `types.ts`. Not called from this file
 * at all (see §11 header — the drainer that would call these lives
 * elsewhere); named here only so the eventual drainer and this file's own
 * push guards agree on vocabulary rather than each guessing separately.
 */
export const FULFILLMENT_ACTION_PATHS: Readonly<Record<'reserve' | 'start' | 'stop', (orderId: string) => string>> = {
  reserve: (orderId) => `/orders/${orderId}/actions/book`,
  start: (orderId) => `/orders/${orderId}/actions/start`,
  stop: (orderId) => `/orders/${orderId}/actions/stop`,
}

async function enqueueOutbox(entity: string, localId: string, operation: WritebackOperation, payload: Record<string, unknown>, idempotencyKey: string): Promise<void> {
  const { error } = await supabase.from('sync_outbox').insert({
    idempotency_key: idempotencyKey,
    entity,
    local_id: localId,
    operation,
    payload,
  })
  if (error) throw new Error(`[booqable/sync] Failed to enqueue sync_outbox for ${operation}: ${error.message}`)
}

export interface PushResult {
  ok: boolean
  reason?: string
  localId?: string
}

/** Op 1 — create client. Guard: no duplicate already synced under the same email+phone. */
export async function pushClientCreate(fields: {
  name: string
  email: string | null
  phone: string
  address_line: string | null
  city: string | null
  district: string | null
  postal_code: string | null
  country: string
}): Promise<PushResult> {
  const { data: dupes, error } = await supabase.from('clients').select('id').eq('phone', fields.phone)
  if (error) throw new Error(`[booqable/sync] Duplicate-client check failed: ${error.message}`)
  if (dupes && dupes.length > 0) {
    const ids = dupes.map((d) => (d as { id: string }).id)
    const { data: refs } = await supabase.from('external_refs').select('local_id').eq('provider', 'booqable').eq('entity', BOOQABLE_CLIENT_ENTITY).in('local_id', ids)
    if (refs && refs.length > 0) return { ok: false, reason: 'A client with this phone is already linked to Booqable.' }
  }

  const clientUuid = newClientUuid()
  const result = await idempotentInsert('clients' as never, { ...fields, client_uuid: clientUuid } as never)
  const localId = (result.data as { id?: string } | null)?.id
  if (localId === undefined) return { ok: false, reason: 'Local client write did not return an id (likely offline-queued).' }

  await enqueueOutbox(BOOQABLE_CLIENT_ENTITY, localId, 'create_client', { ...fields }, clientUuid)
  return { ok: true, localId }
}

/** Op 2 — update client contact. Guard: only the fields WRITEBACK_ALLOWLIST.update_client_contact names — never membership tier/credit terms/standing discount (which, per map/clients.ts's own header, aren't even columns this integration can reach). */
export async function pushClientContactUpdate(
  localClientId: string,
  fields: Partial<{ email: string | null; phone: string; address_line: string | null; city: string | null; district: string | null; postal_code: string | null; country: string }>,
): Promise<PushResult> {
  const allowedKeys = new Set(WRITEBACK_ALLOWLIST.update_client_contact.fields)
  const disallowed = Object.keys(fields).filter((k) => !allowedKeys.has(k))
  if (disallowed.length > 0) return { ok: false, reason: `Field(s) not on the write-back allowlist: ${disallowed.join(', ')}` }

  const clientUuid = generateClientUuid()
  await safeUpdate('clients' as never, localClientId, fields as never)
  await enqueueOutbox(BOOQABLE_CLIENT_ENTITY, localClientId, 'update_client_contact', fields, clientUuid)
  return { ok: true, localId: localClientId }
}

export interface OrderCreateLine {
  line_type: string
  product_id?: string
  bundle_id?: string
  qty: number
  days: number
  rate: number
}

/** Op 3 — create order. Guards: Law 10 discount gate already passed (reused from `lib/money.ts`, never re-derived), availability already checked locally (trusted from the caller — the actual availability engine is out of scope here), days >= 1 on every line. */
export async function pushOrderCreate(
  fields: { client_id: string; branch_id: string; pickup_at: string; return_at: string; delivery_type: string },
  lines: readonly OrderCreateLine[],
  discount: { percent: number; reason: string; approver: string | null },
  availabilityConfirmed: boolean,
  bookingNo: string,
): Promise<PushResult> {
  const gate = discountGate(discount.percent, discount.reason, discount.approver)
  if (!gate.ok) return { ok: false, reason: gate.why }
  if (!availabilityConfirmed) return { ok: false, reason: 'Availability has not been confirmed locally for this order.' }
  if (lines.some((l) => l.days < 1)) return { ok: false, reason: 'Every line needs days >= 1 (Law 15).' }

  const clientUuid = newClientUuid()
  const result = await idempotentInsert(
    'bookings' as never,
    { ...fields, booking_no: bookingNo, client_uuid: clientUuid } as never,
    { returningColumns: 'id' }, // 0062: bare echo = RETURNING *, names ungranted deposit_required
  )
  const localId = (result.data as { id?: string } | null)?.id
  if (localId === undefined) return { ok: false, reason: 'Local booking write did not return an id (likely offline-queued).' }

  for (const line of lines) {
    // Echo discarded; under 0062 a bare RETURNING * on booking_lines names ungranted rate columns.
    await idempotentInsert('booking_lines' as never, { ...line, booking_id: localId } as never, { returnRow: false })
  }

  await enqueueOutbox('orders', localId, 'create_order', { ...fields, lines }, clientUuid)
  return { ok: true, localId }
}

async function pushOrderStatus(localBookingId: string, operation: 'order_reserve' | 'order_start' | 'order_stop', guardOk: boolean, guardFailureReason: string): Promise<PushResult> {
  if (!guardOk) return { ok: false, reason: guardFailureReason }
  const clientUuid = generateClientUuid()
  await enqueueOutbox('orders', localBookingId, operation, { status: operation }, clientUuid)
  return { ok: true, localId: localBookingId }
}

/** Op 4 — reserved. Guard: booking complete and has lines — trusted from the caller (the booking-completeness rule belongs to the booking workflow engine, out of scope here); this function only enforces "the guard was asserted true", never re-derives it. */
export async function pushOrderReserve(localBookingId: string, bookingCompleteAndHasLines: boolean): Promise<PushResult> {
  return pushOrderStatus(localBookingId, 'order_reserve', bookingCompleteAndHasLines, 'Booking is not complete / has no lines yet.')
}

/** Op 5 — started. Guard: handover workspace signed off. */
export async function pushOrderStart(localBookingId: string, handoverSignedOff: boolean): Promise<PushResult> {
  return pushOrderStatus(localBookingId, 'order_start', handoverSignedOff, 'Handover workspace has not been signed off.')
}

/** Op 6 — stopped. Guard: return workspace signed off. */
export async function pushOrderStop(localBookingId: string, returnSignedOff: boolean): Promise<PushResult> {
  return pushOrderStatus(localBookingId, 'order_stop', returnSignedOff, 'Return workspace has not been signed off.')
}
