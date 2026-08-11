/**
 * Booqable → local catalogue mapper: `product_groups`, `products`, `bundles`,
 * `bundle_items`.
 *
 * Law 1 — this file only maps. It never talks to Supabase and never talks to
 * the Booqable proxy; `sync.ts` (not written in this pass) is the only
 * caller, and it owns every DB read (existing rows, existing
 * `external_refs`) and every DB write (`idempotentInsert` / `safeUpdate`
 * from `dataAccess.ts`). A screen must never import this file directly.
 *
 * Law 17 — "client" only. This file (like every file outside `types.ts`)
 * never touches the client-side resource at all; nothing here concerns
 * client identity, but the rule is repeated per PLAN.md §0 law 17's own
 * instruction to restate it in every mapper.
 *
 * ## Ownership (spec §5.1 / §5.2)
 *
 * `products`, `product_groups`, `bundles` + `bundle_items` are **Booqable
 * is master, OS reads** — this file is pull-only. There is no matching push
 * direction anywhere in this file; do not add one. §5.2 also puts crew
 * margins/day-rates and the deposit ledger firmly on the OS side — nothing
 * below writes to `deposit_movements`, and nothing here computes a margin.
 *
 * ## ⚠ Naming mismatch between the brief and the real schema — READ FIRST
 *
 * The mapping brief this file was written against names target tables
 * `equipment` / `equipment_models` / `inventory_units` / `rate_card` (with a
 * `day_rate_paisa` column). **None of those exist.** Grepped the whole repo
 * (`supabase/migrations/*.sql`, `src/types/database.ts`) before writing a
 * line of this file:
 *
 *   - No `equipment`, `equipment_models`, `inventory_units`, or `rate_card`
 *     table/column exists anywhere. `rate_card.day_rate_paisa` in particular
 *     has zero hits.
 *   - The REAL catalogue-of-record, per `supabase/migrations/0004_inventory.sql`
 *     (cross-checked against its own RLS follow-ups, `0027_product_catalogue_policies.sql`
 *     and `0033_fleet_bundle_and_sequence_policies.sql`, which is what the
 *     brief itself pointed at), is: `products` (the catalogue "model" row —
 *     name, category, brand, day/week/month rates, tracking_mode) and
 *     `product_units` (the individual serialized/physical instance — asset
 *     tag, serial, location). `bundles` / `bundle_items` do exist, verbatim,
 *     with the columns used below.
 *   - `src/types/database.ts` was NOT used as the source of truth for this
 *     file's row shapes — it has its own, DIFFERENT and already-documented
 *     drift from the live SQL (`slug`/`rental_rate_daily`/`inventory_units`
 *     naming that doesn't exist in any migration — see PROGRESS.md's
 *     "database.ts schema drift" entries, e.g. the P1 item at line ~532 and
 *     the `bookingQuery.ts`/`database.ts` mismatch note near line ~2425).
 *     Row shapes below are hand-typed straight from the migration DDL
 *     instead, so this file doesn't import a second, differently-wrong
 *     schema on top of the brief's wrong one. The one exception is
 *     `ProductTrackingMode` from `database.ts` — spot-checked against
 *     `0001_enums.sql`'s `product_tracking_mode` enum and confirmed to
 *     actually match (`'Serialised' | 'Quantity' | 'Consumable'`), so it is
 *     safe to reuse instead of redeclaring a duplicate union here.
 *
 * This file therefore targets `products`, `bundles`, `bundle_items` — the
 * real tables — under the brief's own "verify against the migrations, do
 * not guess" instruction. `product_groups` has no real local counterpart at
 * all (see `mapProductGroups` below). `stock_items` → `product_units` is
 * explicitly out of this brief's scope ("Maps products plus product_groups
 * plus bundles") and belongs in a separate mapper file.
 *
 * ## Money
 *
 * Booqable's `price_in_cents` / `deposit_in_cents` map 1:1 into `Paisa`
 * (`lib/money.ts`) — multiply nothing, per Law 8 / spec §8.2.
 * `products.daily_rate` / `bundles.daily_rate` / `bundles.weekly_rate` are
 * `numeric(14,2)` **decimal rupee** columns in the real DDL (not an integer
 * minor-unit column — there is no `*_paisa` column on either table, despite
 * the brief's `rate_card.day_rate_paisa` name). `toRupees()` is used
 * deliberately at this DB-write boundary to go from the app-wide `Paisa`
 * type to the decimal shape the column actually is — this is the "arithmetic
 * only" use `lib/money.ts` calls out, not a display read.
 *
 * TODO(decision) — spec §8.2 says "assert currency equals NPR on every
 * import; a non-NPR record is skipped and logged, never converted." Booqable
 * v4's product/bundle wire shape (`types.ts` §4/§5/§7) carries no currency
 * field at all — there is nothing here to assert against. Left as a named
 * gap rather than a fabricated always-true check; confirm whether currency
 * is only ever available account-wide (in which case the assertion belongs
 * once, in `sync.ts` or the proxy, not per-record here) before closing this.
 *
 * ## Required-but-unmappable local columns (category_id, brand, asset_code, bundle_code)
 *
 * `products.category_id` and `products.brand` are `NOT NULL` with no
 * Booqable equivalent (Booqable has no category vocabulary matching this
 * schema's closed `product_category` enum, and no brand field on `products`
 * at all). Rather than invent a business answer to "what category/brand
 * does an unmapped Booqable product get" — which PLAN.md/CLAUDE.md's "never
 * invent a product decision" rule forbids doing silently — both are threaded
 * through as `fallbackCategoryId` / `fallbackBrand` on `ProductCatalogueContext`,
 * which `sync.ts` must resolve to real values (e.g. the `inventory_categories`
 * row named `'Other'`) and supply explicitly. This file never guesses a UUID.
 *
 * `products.asset_code` is `NOT NULL UNIQUE` and constrained to
 * `^EQ[0-9]{6}$` (`0004_inventory.sql` line 140) — a generated code, not a
 * free-text field, and normally minted by `next_document_number('EQ')`
 * (`0007_admin_security.sql`). A raw Booqable SKU essentially never matches
 * that regex. TODO(decision): this schema has no free-text column to hold
 * an external SKU verbatim, so `sync.ts` is expected to mint a real
 * `EQ######` code (via `next_document_number`) per new product and pass it
 * in through `ProductCatalogueContext.mintedAssetCodes` (see `mapProducts`
 * below) — this file never writes Booqable's raw SKU string into
 * `asset_code` itself, since doing so would violate the column's own CHECK
 * constraint. The raw SKU is still used for the Law-driven duplicate check
 * described next, and is preserved verbatim only in the returned conflict
 * row's `external_value`, never silently dropped.
 *
 * Same shape of gap on `bundles.bundle_code` (`NOT NULL UNIQUE`, no format
 * regex this time, but also no `number_sequences` prefix registered for
 * bundles — `0007_admin_security.sql`'s comment enumerates BK/CL/INV/PAY/DEP/
 * EXP/EQ only). TODO(decision): until a real bundle-numbering decision
 * exists, this file derives a deterministic placeholder
 * (`BQ-<first 8 chars of the Booqable id, upper-cased>`) — stated here as a
 * placeholder, not a policy, so it's easy to grep and replace later.
 *
 * ## Duplicate SKU (brief requirement, spec §7 conflict policy)
 *
 * "product.sku maps to equipment.code (must be locally unique — a duplicate
 * SKU becomes a `sync_conflicts` row, never a silent merge or overwrite)."
 * Enforced at the mapping layer against `ProductCatalogueContext.knownSkus`
 * (existing Booqable SKUs already claimed by a *different* `external_id`,
 * supplied by `sync.ts`) plus in-batch duplicates within the same pull. A
 * collision never reaches `toInsert`/`toUpdate` — it is routed to
 * `conflicts` with `field: 'sku'`, `owner: 'booqable'`, per spec §7 rule 2
 * ("discard the change, log it — never silently apply, never silently
 * drop").
 *
 * ## Tracking mode (spec brief: trackable/bulk/consumable/service)
 *
 * TODO(decision) — the brief describes a 4-way `product.type` enum
 * (`trackable`/`bulk`/`consumable`/`service`). The actual wire shape in
 * `types.ts` (`BooqableProductAttributes`) has no such field — only a
 * boolean `trackable`. `mapTrackingMode` below can therefore only
 * distinguish `Serialised` (trackable === true) from `Quantity`
 * (trackable === false); it can never produce `'Consumable'` from this raw
 * shape alone, and there is no signal at all for a `service` line. Left
 * unresolved rather than guessing which boolean state should mean
 * consumable.
 *
 * Per the brief: **consumable is a definition-only mirror.** Nothing in
 * this file ever reads or writes a stock quantity/movement for a consumable
 * product — this file never touches `products.total_quantity`, `available_stock`,
 * or any stock-movement table for ANY product, consumable or not, so that
 * rule is upheld structurally, not by a special case. TODO(decision): grepped
 * this repo's migrations for a dedicated "OS-only consumables ledger" table
 * and found none under any obvious name (`consumable`, `consumables_ledger`
 * — zero hits outside `product_category`/`product_tracking_mode` enum
 * *values*). The brief's "existing OS-only consumables ledger" table does
 * not appear to exist yet; noted here rather than invented.
 *
 * ## Law 3 — archive, never delete
 *
 * `products` has no `deleted_at` column; its named terminal action is
 * `status = 'Archived'` (`product_record_state` enum). A Booqable
 * `archived: true` product maps to `status: 'Archived'`, `is_active: false`
 * — the row stays, exactly as Law 3 requires. Same reasoning for
 * `bundles.is_active`, which has no separate status enum.
 */

import type { Paisa } from '../../money'
import { toRupees } from '../../money'
import type {
  BooqableBundleAttributes,
  BooqableBundleItemAttributes,
  BooqableId,
  BooqableProductAttributes,
  BooqableProductGroupAttributes,
} from '../types'
import type { BooqableFlatResource } from '../client'
import type { ProductTrackingMode } from '../../../types/database'

/* ── shared result / context shapes ────────────────────────────────────── */

/** One row this mapper wants updated, paired with the local id it targets — `sync.ts` calls `safeUpdate(table, id, fields)` with these directly. */
export interface LocalRowUpdate<TFields> {
  id: string
  fields: TFields
}

/**
 * Mirrors `sync_conflicts` (`0040_booqable_sync.sql`) minus the columns the
 * DB defaults for itself (`id`, `detected_at`, `resolution`, `resolved_by`,
 * `resolved_at`). `owner` is always `'booqable'` from this file — every
 * entity this mapper handles is Booqable-is-master (§5.1); a conflict here
 * only ever means "the non-owner side (local) cannot silently be
 * overwritten/merged," never a local-wins case.
 */
export interface SyncConflictInsert {
  entity: string
  local_id: string | null
  external_id: string | null
  field: string
  local_value: string | null
  external_value: string | null
  owner: 'booqable'
}

export interface PullResult<TInsert, TUpdate> {
  toInsert: TInsert[]
  toUpdate: LocalRowUpdate<TUpdate>[]
  conflicts: SyncConflictInsert[]
}

/**
 * Everything `sync.ts` must resolve/supply before calling this file — see
 * the file-header TODO(decision)s for why each of these can't be computed
 * in here without inventing an answer.
 */
export interface ProductCatalogueContext {
  /** external_id -> local row id, for rows already synced (from `external_refs`, entity-scoped by the caller). Present ⇒ update; absent ⇒ insert. */
  existingRefs: ReadonlyMap<BooqableId, string>
  /** `external_refs.payload_hash` for rows already synced, so a genuinely-unchanged record can be skipped (spec §7 rule 3) instead of writing a no-op update. */
  existingPayloadHashes: ReadonlyMap<BooqableId, string>
  /** Raw Booqable SKUs already claimed locally by a DIFFERENT external_id — see the file-header duplicate-SKU note. */
  knownSkus: ReadonlySet<string>
  /** TODO(decision) — see file header. A real `inventory_categories.id` (e.g. the row named 'Other'); this file never invents one. */
  fallbackCategoryId: string
  /** TODO(decision) — see file header. */
  fallbackBrand: string
  /** external product id -> a freshly minted `EQ######` code from `next_document_number('EQ')`, one entry per NEW (not-yet-synced) product in this batch. See file header — `asset_code`'s CHECK constraint rules out writing the raw SKU directly. */
  mintedAssetCodes: ReadonlyMap<BooqableId, string>
}

/** Cheap, non-cryptographic stable hash for change detection only (spec §7 rule 3) — not a security control, just "did anything actually change." FNV-1a-32 over a key-sorted JSON stringify so field order never causes a false "changed." */
export function computePayloadHash(value: unknown): string {
  const stable = JSON.stringify(sortKeysDeep(value))
  let hash = 0x811c9dc5
  for (let i = 0; i < stable.length; i++) {
    hash ^= stable.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/* ── §1 · product_groups — no real local counterpart ───────────────────
 *
 * See file header. `product_group.name` has nowhere confirmed to land —
 * `products.name` is already populated from the Booqable `product` resource
 * itself (which carries its own required, non-null `name`), so there is no
 * gap this would fill even informationally. Kept as a real exported mapper
 * (not silently absorbed into `pull()`'s default branch) so `sync.ts` can
 * call all seven entity mappers through the same uniform shape the brief
 * asks for, and so a future reader sees explicitly that this is a
 * deliberate no-op, not a forgotten entity.
 */
export function mapProductGroups(
  _records: BooqableFlatResource<'product_groups', BooqableProductGroupAttributes>[],
): PullResult<never, never> {
  return { toInsert: [], toUpdate: [], conflicts: [] }
}

/* ── §2 · products → local `products` catalogue rows ────────────────────── */

export interface LocalProductFields {
  asset_code: string
  name: string
  category_id: string
  brand: string
  tracking_mode: ProductTrackingMode
  /** Decimal rupees — see file header money note. `null` when Booqable supplied no price. */
  daily_rate: number | null
  /** `null` — Booqable gives an absolute deposit amount, never a percentage; kept explicit so an update never accidentally clobbers a staff-entered percent with silence. */
  deposit_percent: null
  /** Decimal rupees, from `deposit_in_cents`. `null` when Booqable supplied none. */
  deposit_fixed: number | null
  status: 'Active' | 'Archived'
  is_active: boolean
}

export type LocalProductInsert = LocalProductFields
/**
 * `asset_code` is deliberately excluded from the update shape — it is minted
 * once, at insert time, from `next_document_number('EQ')` (see file header)
 * and is not a Booqable-owned field with a live value to resync. Including
 * it in an update payload would either overwrite a real code with an empty
 * placeholder or require re-deriving one from nothing; neither is correct,
 * so `safeUpdate('products', id, fields)` simply never touches the column.
 */
export type LocalProductUpdate = Omit<LocalProductFields, 'asset_code'>

function mapTrackingMode(trackable: boolean): ProductTrackingMode {
  // CONFIRMED 10 Aug 2026 (types.ts §4): the brief's 4-way guess resolved to
  // TWO documented fields — `trackable: boolean` (bulk vs tracked) plus
  // `product_type: rental | sales_item | service` ("sales_item used to be
  // called consumable" — v1-only naming). TODO(decision): whether
  // product_type === 'sales_item' should map to tracking_mode 'Consumable'
  // is an unmade product decision — this function still keys off trackable
  // alone rather than guessing that equivalence.
  return trackable ? 'Serialised' : 'Quantity'
}

function centsToRupeesOrNull(cents: number | null): number | null {
  if (cents === null) return null
  return toRupees(cents as Paisa)
}

export function mapProducts(
  records: BooqableFlatResource<'products', BooqableProductAttributes>[],
  ctx: ProductCatalogueContext,
): PullResult<LocalProductInsert, LocalProductUpdate> {
  const toInsert: LocalProductInsert[] = []
  const toUpdate: LocalRowUpdate<LocalProductUpdate>[] = []
  const conflicts: SyncConflictInsert[] = []
  const skusSeenThisBatch = new Set<string>()

  for (const record of records) {
    const externalId = record.id
    const sku = record.sku

    // Duplicate-SKU check — spec §7 rule 2, brief's explicit "never a
    // silent merge or overwrite." Checked against both previously-synced
    // SKUs (a different external_id already claimed it) and this same
    // batch (two Booqable products sharing a SKU in one pull).
    if (sku !== null) {
      const collidesWithExisting = ctx.knownSkus.has(sku)
      const collidesInBatch = skusSeenThisBatch.has(sku)
      if (collidesWithExisting || collidesInBatch) {
        conflicts.push({
          entity: 'products',
          local_id: ctx.existingRefs.get(externalId) ?? null,
          external_id: externalId,
          field: 'sku',
          local_value: null,
          external_value: sku,
          owner: 'booqable',
        })
        continue
      }
      skusSeenThisBatch.add(sku)
    }

    const localId = ctx.existingRefs.get(externalId)
    const isUpdate = localId !== undefined

    // TODO(decision) — see file header: asset_code cannot hold the raw SKU
    // (CHECK constraint). For a new row, a minted EQ###### code must
    // already exist in ctx.mintedAssetCodes (sync.ts's job, via
    // next_document_number('EQ')) before this function is called; if it
    // doesn't, the record cannot be safely inserted and is logged instead
    // of guessing a code.
    const mintedCode = ctx.mintedAssetCodes.get(externalId)
    if (!isUpdate && mintedCode === undefined) {
      conflicts.push({
        entity: 'products',
        local_id: null,
        external_id: externalId,
        field: 'asset_code',
        local_value: null,
        external_value: sku,
        owner: 'booqable',
      })
      continue
    }

    const archived = record.archived || record.archived_at !== null
    const commonFields: LocalProductUpdate = {
      name: record.name,
      category_id: ctx.fallbackCategoryId,
      brand: ctx.fallbackBrand,
      tracking_mode: mapTrackingMode(record.trackable),
      // CONFIRMED 10 Aug 2026 (types.ts §4, https://developers.booqable.com/#products):
      // the documented price attribute is base_price_in_cents, not price_in_cents.
      daily_rate: centsToRupeesOrNull(record.base_price_in_cents),
      deposit_percent: null,
      deposit_fixed: centsToRupeesOrNull(record.deposit_in_cents),
      status: archived ? 'Archived' : 'Active',
      is_active: !archived,
    }

    // Hash covers only the fields that can actually resync (never
    // asset_code, which is fixed at insert time — see LocalProductUpdate).
    const hash = computePayloadHash(commonFields)
    if (isUpdate && ctx.existingPayloadHashes.get(externalId) === hash) {
      // spec §7 rule 3 — unchanged, no write, no log noise.
      continue
    }

    if (isUpdate) {
      toUpdate.push({ id: localId as string, fields: commonFields })
    } else {
      toInsert.push({ ...commonFields, asset_code: mintedCode as string })
    }
  }

  return { toInsert, toUpdate, conflicts }
}

/* ── §3 · bundles → local `bundles` rows ─────────────────────────────────── */

export interface LocalBundleFields {
  bundle_code: string
  name: string
  /** Decimal rupees. */
  daily_rate: number
  /** `0` — Booqable's bundle resource carries no separate weekly rate (`types.ts` §7); left at the column's own default rather than derived, since deriving one (e.g. daily × 7 × a discount factor) would be inventing a pricing policy. */
  weekly_rate: number
  is_active: boolean
}

export type LocalBundleInsert = LocalBundleFields
/** `bundle_code` excluded from updates for the same reason `asset_code` is excluded from `LocalProductUpdate` — see that type's comment. */
export type LocalBundleUpdate = Omit<LocalBundleFields, 'bundle_code'>

/** TODO(decision) — see file header: no `number_sequences` prefix exists for bundles yet. Deterministic placeholder, not a numbering policy. */
function mintPlaceholderBundleCode(externalId: BooqableId): string {
  return `BQ-${externalId.slice(0, 8).toUpperCase()}`
}

export function mapBundles(
  records: BooqableFlatResource<'bundles', BooqableBundleAttributes>[],
  ctx: ProductCatalogueContext,
): PullResult<LocalBundleInsert, LocalBundleUpdate> {
  const toInsert: LocalBundleInsert[] = []
  const toUpdate: LocalRowUpdate<LocalBundleUpdate>[] = []
  const conflicts: SyncConflictInsert[] = []

  for (const record of records) {
    const externalId = record.id
    const localId = ctx.existingRefs.get(externalId)
    const isUpdate = localId !== undefined
    const archived = record.archived || record.archived_at !== null

    const commonFields: LocalBundleUpdate = {
      name: record.name,
      daily_rate: toRupees(record.price_in_cents as Paisa),
      weekly_rate: 0,
      is_active: !archived,
    }

    const hash = computePayloadHash(commonFields)
    if (isUpdate && ctx.existingPayloadHashes.get(externalId) === hash) continue

    if (isUpdate) {
      toUpdate.push({ id: localId as string, fields: commonFields })
    } else {
      toInsert.push({ ...commonFields, bundle_code: mintPlaceholderBundleCode(externalId) })
    }
  }

  return { toInsert, toUpdate, conflicts }
}

/* ── §4 · bundle_items → local `bundle_items` rows ───────────────────────── */

export interface LocalBundleItemFields {
  bundle_id: string
  product_id: string
  quantity: number
}

export type LocalBundleItemInsert = LocalBundleItemFields
export type LocalBundleItemUpdate = LocalBundleItemFields

/**
 * `bundle_items.bundle_id` / `product_id` are local UUIDs, not Booqable
 * ids — both must already be resolved via `external_refs` (this same
 * `ctx.existingRefs`, keyed by the OTHER two entities' external ids, which
 * `sync.ts` is expected to have merged in before calling this function,
 * since one `ProductCatalogueContext.existingRefs` map is shared across
 * `products`/`bundles`/`bundle_items` in a single pull batch). A bundle
 * item whose parent bundle or referenced product hasn't been synced yet
 * cannot be safely inserted (`bundle_id`/`product_id` are both `NOT NULL`
 * FKs) — logged as a conflict instead of guessing or skipping silently.
 */
export function mapBundleItems(
  records: BooqableFlatResource<'bundle_items', BooqableBundleItemAttributes>[],
  ctx: ProductCatalogueContext,
): PullResult<LocalBundleItemInsert, LocalBundleItemUpdate> {
  const toInsert: LocalBundleItemInsert[] = []
  const toUpdate: LocalRowUpdate<LocalBundleItemUpdate>[] = []
  const conflicts: SyncConflictInsert[] = []

  for (const record of records) {
    const externalId = record.id
    const localBundleId = ctx.existingRefs.get(record.bundle_id)
    const localProductId = ctx.existingRefs.get(record.product_id)

    if (localBundleId === undefined || localProductId === undefined) {
      conflicts.push({
        entity: 'bundle_items',
        local_id: null,
        external_id: externalId,
        field: localBundleId === undefined ? 'bundle_id' : 'product_id',
        local_value: null,
        external_value: localBundleId === undefined ? record.bundle_id : record.product_id,
        owner: 'booqable',
      })
      continue
    }

    const localId = ctx.existingRefs.get(externalId)
    const isUpdate = localId !== undefined
    const fields: LocalBundleItemFields = {
      bundle_id: localBundleId,
      product_id: localProductId,
      quantity: record.quantity,
    }

    const hash = computePayloadHash(fields)
    if (isUpdate && ctx.existingPayloadHashes.get(externalId) === hash) continue

    if (isUpdate) {
      toUpdate.push({ id: localId as string, fields })
    } else {
      toInsert.push(fields)
    }
  }

  return { toInsert, toUpdate, conflicts }
}

/* ── §5 · uniform dispatcher for sync.ts ─────────────────────────────────── */

export type ProductCatalogueEntity = 'product_groups' | 'products' | 'bundles' | 'bundle_items'

/**
 * One call shape for every entity this file handles, so `sync.ts` can drive
 * all seven mapper files (this one plus six siblings) identically per the
 * brief's own request. `product_groups` ignores `ctx` (it never reads it —
 * see `mapProductGroups`) but still takes the parameter so every branch of
 * the switch has the same call shape as its neighbours.
 */
export function pull(
  entity: 'product_groups',
  rawRecords: BooqableFlatResource<'product_groups', BooqableProductGroupAttributes>[],
  ctx: ProductCatalogueContext,
): PullResult<never, never>
export function pull(
  entity: 'products',
  rawRecords: BooqableFlatResource<'products', BooqableProductAttributes>[],
  ctx: ProductCatalogueContext,
): PullResult<LocalProductInsert, LocalProductUpdate>
export function pull(
  entity: 'bundles',
  rawRecords: BooqableFlatResource<'bundles', BooqableBundleAttributes>[],
  ctx: ProductCatalogueContext,
): PullResult<LocalBundleInsert, LocalBundleUpdate>
export function pull(
  entity: 'bundle_items',
  rawRecords: BooqableFlatResource<'bundle_items', BooqableBundleItemAttributes>[],
  ctx: ProductCatalogueContext,
): PullResult<LocalBundleItemInsert, LocalBundleItemUpdate>
export function pull(
  entity: ProductCatalogueEntity,
  rawRecords:
    | BooqableFlatResource<'product_groups', BooqableProductGroupAttributes>[]
    | BooqableFlatResource<'products', BooqableProductAttributes>[]
    | BooqableFlatResource<'bundles', BooqableBundleAttributes>[]
    | BooqableFlatResource<'bundle_items', BooqableBundleItemAttributes>[],
  ctx: ProductCatalogueContext,
): PullResult<unknown, unknown> {
  switch (entity) {
    case 'product_groups':
      return mapProductGroups(rawRecords as BooqableFlatResource<'product_groups', BooqableProductGroupAttributes>[])
    case 'products':
      return mapProducts(rawRecords as BooqableFlatResource<'products', BooqableProductAttributes>[], ctx)
    case 'bundles':
      return mapBundles(rawRecords as BooqableFlatResource<'bundles', BooqableBundleAttributes>[], ctx)
    case 'bundle_items':
      return mapBundleItems(rawRecords as BooqableFlatResource<'bundle_items', BooqableBundleItemAttributes>[], ctx)
  }
}
