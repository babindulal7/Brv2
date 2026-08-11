/**
 * Booqable `stock_items` → local `product_units` mapper.
 *
 * ## Table name — verified, not assumed
 *
 * The brief for this file names the target table "inventory_units (a.k.a.
 * product_units)" and explicitly warns that a prior pass in this repo
 * (migrations 0011/0019) once wrote the wrong name. Verified directly
 * against the `create table` statement in `supabase/migrations/0004_inventory.sql`
 * (§5, "The individual physical serialized asset instances"): the real table
 * is **`product_units`**. `src/types/database.ts` (the hand-authored,
 * not-yet-regenerated `Database` type — see `PLAN.md`'s open
 * `npm run db:types` item and `PROGRESS.md`'s "database.ts schema drift"
 * notes) only has an `inventory_units` entry, and that entry's columns
 * (`current_state`, `physical_condition`, `health_score`, `asset_code`,
 * `serial_number`, no `branch_id`, no `barcode`, no `container_id`, …) do
 * not match `product_units`' real columns at all — it appears to describe a
 * different, earlier draft of this table. Importing `Database['public']['Tables']['inventory_units']`
 * here would silently type this file against the wrong shape under the
 * wrong name, repeating the exact class of mistake the brief warns about.
 * So this file defines its own `ProductUnit*` row types below, read
 * directly off the migration's `create table product_units` statement, and
 * does NOT import from `types/database.ts`. TODO(decision): once
 * `npm run db:types` is actually run and `database.ts` gets a correct,
 * regenerated `product_units` entry, swap these local types for the
 * generated ones and delete this note.
 *
 * ## Law 17
 *
 * This file has no client-shaped counterpart field to begin with — Booqable's
 * stock item resource carries no such field for this mapper to touch.
 *
 * ## Field ownership (spec §5.1)
 *
 * `stock_items`/`barcodes` → `product_units`, **no OS write**. This mapper
 * is PULL-ONLY — it never produces anything for `sync_outbox`, and nothing
 * in this file calls `booqableWrite`/`booqableDelete` from `client.ts`.
 *
 * ## Law 3 — archive becomes `retired_at`, never a delete
 *
 * `product_units` has no generic `deleted_at` column; its Law-3 equivalent
 * is the existing `retired_at` / `retired_by` / `retirement_reason` trio
 * (`product_units_retirement_requires_reason` — all three null, or all
 * three set with a reason ≥10 chars). A Booqable `stock_item.archived_at`
 * is mapped onto that trio, never onto a row deletion.
 *
 * ## The status/condition ownership gap — deliberately NOT bridged here
 *
 * `product_units.status` is the locked ten-value `inventory_state` lifecycle
 * (`In Stock` → … → `Retired`) that this app's OWN operations workspaces
 * (packing/handover/return/inspection/cleaning/reset — PLAN.md §0 law list,
 * spec §5.2) drive continuously. Booqable's `stock_item.status` is a
 * DIFFERENT, unconfirmed string (`types.ts`: "the exact `status` enum … is
 * not confirmed") describing Booqable's own idea of item availability.
 * Spec §5.1 says the *existence* of the row (`stock_items` → `product_units`)
 * is Booqable-owned, but nothing in the spec resolves whether the STATUS
 * *column* on an already-synced unit is Booqable's or the ops engines'
 * to write — overwriting a unit mid-rental (`On Rent`, `Returning`,
 * `Inspection`, …) with a stale Booqable status on every pull would be a
 * real Law-3/ops-integrity risk if the answer turns out to be "ops owns it".
 * TODO(decision): this ambiguity is NOT resolved by inventing an answer.
 * Instead: `status` is set from Booqable ONLY on first insert (a brand new
 * unit has no ops state to clobber yet), via `translateStockItemStatus`
 * below (itself a best-effort guess, separately flagged), and is NEVER
 * touched on an update to an already-synced unit. `condition` has no
 * modelled source field on `BooqableStockItemAttributes` at all (see
 * `types.ts` §6) and is never written by this mapper in either direction.
 */

import type { BooqableId } from '../types'
import type { BooqableFlatResource } from '../client'
import type { BooqableStockItemAttributes } from '../types'

/* ── Local row shape — mirrors `product_units` per 0004_inventory.sql §5 ──
 * (see file header for why this is not imported from `types/database.ts`).
 * Only the columns this mapper actually touches are given a narrower
 * "known" type; everything else on the real table exists but is out of
 * scope for a `stock_items` pull (purchase price, maintenance schedule,
 * etc. have no Booqable stock-item source field). */

export type ProductUnitStatus =
  | 'In Stock'
  | 'Reserved'
  | 'Packed'
  | 'On Rent'
  | 'Returning'
  | 'Inspection'
  | 'Cleaning'
  | 'Maintenance'
  | 'Missing'
  | 'Retired'

export interface ProductUnitInsert {
  product_id: string
  serial_no?: string | null
  asset_tag: string
  barcode?: string | null
  status?: ProductUnitStatus
  branch_id: string
  warehouse_id: string
  storage_zone_id?: string | null
  container_id?: string | null
  retired_at?: string | null
  retired_by?: string | null
  retirement_reason?: string | null
}

export interface ProductUnitUpdate {
  product_id?: string
  barcode?: string | null
  branch_id?: string
  warehouse_id?: string
  storage_zone_id?: string | null
  container_id?: string | null
  retired_at?: string | null
  retired_by?: string | null
  retirement_reason?: string | null
}

/* ── external_refs — read-only lookups this mapper needs, supplied by the
 * caller (sync.ts), never fetched here (Law 1 — mapping code does not do
 * I/O; that stays in sync.ts / the Edge Functions). "Never a second ad hoc
 * mapping column" — `stock_item.id` is resolved to a local unit only via
 * this `external_refs`-backed lookup, and `stock_item.product_id` only via
 * the equivalent products lookup, never via a parallel column this file
 * invents. ────────────────────────────────────────────────────────────── */

/** One `external_refs` row already known for entity `'stock_items'`, keyed by `external_id`. */
export interface ExistingStockItemRef {
  localId: string
  payloadHash: string | null
}

/** Resolved location — see `resolveLocation` below for why this is a caller-supplied function, not logic in this file. */
export interface ResolvedLocation {
  branchId: string
  warehouseId: string
  storageZoneId?: string
}

export interface StockItemPullContext {
  /** `external_refs` rows for entity `'stock_items'`, keyed by Booqable stock item id. */
  existingRefs: ReadonlyMap<BooqableId, ExistingStockItemRef>

  /**
   * Resolves a Booqable `product_id` to the local `products.id` it was
   * synced to (i.e. an `external_refs` lookup for entity `'products'`,
   * performed by the caller before calling this mapper — Law 2's "one
   * composed object", not a second network round trip issued from inside a
   * mapper). Returns `undefined` if the product itself has not been synced
   * yet — such a stock item is skipped, never inserted with a dangling FK.
   */
  resolveProductLocalId(externalProductId: BooqableId): string | undefined

  /**
   * Resolves a Booqable `location_id` to a local branch/warehouse pair.
   *
   * TODO(decision): spec §5.1 places `locations` in "a settings mirror, no
   * OS write" — it does not say what that mirror's relationship to this
   * schema's `branches`/`warehouses` tables is, or name a rule for turning
   * one Booqable location into a (branch, warehouse) pair (this schema has
   * both; Booqable's API, per `types.ts` §14, has only one flat `locations`
   * resource). `product_units.branch_id` and `.warehouse_id` are both
   * `not null`, so a stock item whose location cannot be resolved is
   * skipped rather than inserted with an invented branch/warehouse — never
   * guessed here. The caller (`sync.ts`) owns building this resolver once
   * that rule is decided; until then it may reasonably return `undefined`
   * for everything, in which case every stock item is skipped and reported
   * via `PullStockItemsResult.skipped`.
   */
  resolveLocation(externalLocationId: BooqableId | null): ResolvedLocation | undefined

  /**
   * `users.id` to record as `retired_by` when a Booqable archive is mapped
   * onto the retirement trio — the constraint requires a real actor, and
   * this sync has no human in the loop. TODO(decision): no "system sync
   * actor" user convention is established anywhere else in this codebase;
   * the caller must supply a real `users.id` (e.g. a dedicated service
   * account row) rather than this file inventing one. If omitted, archived
   * stock items are skipped instead of retired, per the same
   * never-guess-a-constrained-FK reasoning as `resolveLocation`.
   */
  systemActorUserId?: string
}

/* ── status translation ─────────────────────────────────────────────────
 * CONFIRMED 10 Aug 2026 (types.ts §6, https://developers.booqable.com/#stock-items):
 * the real enum is archived | expected | in_stock | started | overdue |
 * expired | in_downtime — the spec's guessed available/out/damaged/lost
 * values never existed. Mapped where the local equivalent is unambiguous:
 * in_stock → 'In Stock'; started/overdue → 'On Rent' (the item is out with
 * a customer — overdue just means past its window). TODO(decision):
 * expected (not yet arrived), expired (temporary item past its window),
 * in_downtime (maintenance) and archived-as-status have no obvious
 * ProductUnitStatus equivalent — they fall through to the safe default
 * `'In Stock'` (and archive handling runs off `archived`/`archived_at`
 * separately) rather than guessing a mapping. */
const STOCK_ITEM_STATUS_MAP: Readonly<Record<string, ProductUnitStatus>> = {
  in_stock: 'In Stock',
  started: 'On Rent',
  overdue: 'On Rent',
}

function translateStockItemStatus(raw: string): ProductUnitStatus {
  return STOCK_ITEM_STATUS_MAP[raw.toLowerCase()] ?? 'In Stock'
}

/* ── asset_tag — product_units.asset_tag is `not null unique` with no
 * format constraint (unlike products.asset_code's locked `EQ[0-9]{6}`
 * regex). Booqable's `identifier` is the nearest source field but is
 * nullable. TODO(decision): no asset-tag convention for Booqable-sourced
 * units is specified anywhere in the spec; this fallback is a deterministic,
 * collision-free placeholder (derived from the immutable Booqable id, never
 * randomised) so the `not null unique` constraint can be satisfied without
 * fabricating a "real" asset tag scheme — replace once one is decided. ── */
function resolveAssetTag(stockItem: BooqableFlatResource<'stock_items', BooqableStockItemAttributes>): string {
  const identifier = stockItem.identifier?.trim()
  return identifier && identifier.length > 0 ? identifier : `BQ-${stockItem.id}`
}

/* ── payload hashing — feeds conflict policy §7.3 ("external_refs.payload_hash
 * decides if anything actually changed — equal hash means no write and no
 * log noise"). Not cryptographic; only needs to be stable and change-sensitive.
 * FNV-1a over a fixed-order field list so the same input always hashes the
 * same, deterministically. ─────────────────────────────────────────────── */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Only the fields this mapper actually syncs feed the hash — a change to a Booqable field this file ignores must not trigger a no-op "update" and log noise. */
export function computeStockItemPayloadHash(stockItem: BooqableFlatResource<'stock_items', BooqableStockItemAttributes>): string {
  const parts = [
    stockItem.identifier ?? '',
    // CONFIRMED 10 Aug 2026 (types.ts §6): stock_items carry NO barcode
    // attribute (Barcode is a separate owned resource, §6b) — the empty
    // slot is kept so existing stored hashes don't all flip to "changed".
    '',
    stockItem.product_id,
    stockItem.location_id ?? '',
    stockItem.status,
    String(stockItem.archived),
    stockItem.archived_at ?? '',
  ]
  return fnv1a(parts.join('|'))
}

/* ── retirement reason — bookkeeping text, not a business-policy decision;
 * the *fact* that Law 3 requires a ≥10-char reason is locked by the DB
 * constraint, this is just that reason's fixed wording for a sync-originated
 * retirement (distinct from a human-entered warehouse retirement reason). */
const SYNC_RETIREMENT_REASON = 'Archived on Booqable side (synced automatically)'

/* ── result shape ──────────────────────────────────────────────────────── */

export interface StockUnitInsertOp {
  externalId: BooqableId
  payload: ProductUnitInsert
  payloadHash: string
}

export interface StockUnitUpdateOp {
  localId: string
  externalId: BooqableId
  changes: ProductUnitUpdate
  payloadHash: string
}

/** A record this pull could not act on — never silently dropped, always reported (mirrors the "never silently drop" clause of conflict policy §2, even though these are not field-ownership conflicts). */
export interface StockUnitSkippedOp {
  externalId: BooqableId
  reason: string
}

/**
 * Shape mirrors `sync_conflicts` (0040_booqable_sync.sql §6) minus the
 * columns the DB assigns itself (`id`, `detected_at`, `resolution`,
 * `resolved_by`, `resolved_at`) — `sync.ts` inserts these as-is.
 * `stock_items` is a no-OS-write entity (spec §5.1), so in practice this
 * mapper has nothing an OS-side edit could conflict with and this array is
 * expected to stay empty; kept in the return shape for parity with the
 * other six mapper files and in case a future OS-writable field is added
 * to `product_units`.
 */
export interface SyncConflictRow {
  entity: string
  local_id: string | null
  external_id: string | null
  field: string
  local_value: string | null
  external_value: string | null
  owner: string
}

export interface PullStockItemsResult {
  toInsert: StockUnitInsertOp[]
  toUpdate: StockUnitUpdateOp[]
  conflicts: SyncConflictRow[]
  skipped: StockUnitSkippedOp[]
}

/** `external_refs.entity` value for this resource — one named constant, not a string literal repeated at every call site. */
export const STOCK_ITEM_ENTITY = 'stock_items' as const

/**
 * Pulls a page of Booqable `stock_items` into `product_units` insert/update
 * operations.
 *
 * NOTE on this file's exported shape vs. a generic `pull(entity, rawRecords)`:
 * every mapper file in `src/lib/booqable/map/` is already scoped to one
 * Booqable resource by its filename and its raw-record type parameter, so a
 * shared `entity` string argument would add nothing type-safe — `sync.ts`
 * dispatches to the right module by import, not by a runtime string switch.
 * What genuinely varies per call here is the lookup context (existing refs,
 * product/location resolution, the sync actor), which a bare two-arg
 * `pull(entity, records)` signature has no place for — so this takes
 * `(records, context)` instead. Kept deliberately pure and synchronous: no
 * Supabase call, no `booqableFetch`, no `Date.now()` — everything it needs
 * is passed in, everything it produces is inert data for `sync.ts` to act on
 * (Law 1 — mapping code never touches I/O or a screen).
 */
export function pullStockItems(
  records: readonly BooqableFlatResource<'stock_items', BooqableStockItemAttributes>[],
  context: StockItemPullContext,
): PullStockItemsResult {
  const toInsert: StockUnitInsertOp[] = []
  const toUpdate: StockUnitUpdateOp[] = []
  const conflicts: SyncConflictRow[] = []
  const skipped: StockUnitSkippedOp[] = []

  for (const stockItem of records) {
    const existing = context.existingRefs.get(stockItem.id)
    const payloadHash = computeStockItemPayloadHash(stockItem)

    if (existing && existing.payloadHash === payloadHash) {
      // Conflict policy §7.3 — identical hash, no write, no log noise.
      continue
    }

    const productLocalId = context.resolveProductLocalId(stockItem.product_id)
    if (!productLocalId) {
      skipped.push({
        externalId: stockItem.id,
        reason: `Product ${stockItem.product_id} has not been synced yet — cannot insert/update product_units.product_id (not null FK).`,
      })
      continue
    }

    const isArchiving = stockItem.archived && stockItem.archived_at

    if (existing) {
      // Update path — Booqable-owned fields only (see file header on the
      // status/condition ownership gap: status/condition are never in this
      // branch).
      const changes: ProductUnitUpdate = {
        product_id: productLocalId,
        // CONFIRMED 10 Aug 2026 (types.ts §6/§6b): barcode is NOT a
        // stock_item attribute — it is a separate Barcode resource reached
        // via the `barcode` relationship. TODO(decision): populating
        // product_units.barcode requires sideloading/fetching Barcode
        // resources (a sync.ts concern); never sourced from a stock_item
        // field that does not exist. Left untouched on update.
      }

      const location = context.resolveLocation(stockItem.location_id)
      if (location) {
        changes.branch_id = location.branchId
        changes.warehouse_id = location.warehouseId
        if (location.storageZoneId !== undefined) changes.storage_zone_id = location.storageZoneId
      }
      // If location cannot be resolved on an update, branch_id/warehouse_id
      // are simply left untouched (they are already set from the original
      // insert) rather than the whole update being skipped — unlike insert,
      // where they are mandatory and there is no prior value to keep.

      if (isArchiving) {
        if (!context.systemActorUserId) {
          skipped.push({
            externalId: stockItem.id,
            reason: 'stock_item is archived on Booqable but no systemActorUserId was supplied — cannot satisfy product_units retired_by not-null constraint without inventing an actor.',
          })
          continue
        }
        changes.retired_at = stockItem.archived_at
        changes.retired_by = context.systemActorUserId
        changes.retirement_reason = SYNC_RETIREMENT_REASON
      }
      // TODO(decision): the reverse transition — Booqable un-archiving a
      // previously-retired unit — is deliberately NOT handled (no `else`
      // branch clearing retired_at/retired_by/retirement_reason here). The
      // spec does not say whether an OS-side retirement decision should
      // ever be silently reversed by an upstream un-archive; resurrecting
      // equipment automatically is a strictly worse default than requiring
      // a human to clear it, so this mapper never does it.

      toUpdate.push({ localId: existing.localId, externalId: stockItem.id, changes, payloadHash })
      continue
    }

    // Insert path.
    const location = context.resolveLocation(stockItem.location_id)
    if (!location) {
      skipped.push({
        externalId: stockItem.id,
        reason: `Location ${stockItem.location_id ?? '(none)'} could not be resolved to a branch/warehouse — cannot insert product_units.branch_id/warehouse_id (not null FKs). See StockItemPullContext.resolveLocation TODO(decision).`,
      })
      continue
    }

    const payload: ProductUnitInsert = {
      product_id: productLocalId,
      asset_tag: resolveAssetTag(stockItem),
      // barcode omitted — not a stock_item attribute (see the update-path
      // comment above; Barcode is a separate resource, types.ts §6b).
      status: translateStockItemStatus(stockItem.status),
      branch_id: location.branchId,
      warehouse_id: location.warehouseId,
    }
    if (location.storageZoneId !== undefined) payload.storage_zone_id = location.storageZoneId

    if (isArchiving) {
      if (!context.systemActorUserId) {
        skipped.push({
          externalId: stockItem.id,
          reason: 'stock_item arrives already archived on Booqable but no systemActorUserId was supplied — cannot satisfy product_units retired_by not-null constraint without inventing an actor.',
        })
        continue
      }
      payload.retired_at = stockItem.archived_at
      payload.retired_by = context.systemActorUserId
      payload.retirement_reason = SYNC_RETIREMENT_REASON
      payload.status = 'Retired'
    }

    toInsert.push({ externalId: stockItem.id, payload, payloadHash })
  }

  return { toInsert, toUpdate, conflicts, skipped }
}
