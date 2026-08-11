/**
 * Booqable `plannings` (+ a documented no-op for `availabilities`) → local
 * `inventory_reservations` mapper.
 *
 * ## Law 1
 *
 * This file only maps. It never talks to Supabase and never talks to the
 * Booqable proxy — `sync.ts` (not written in this pass) owns every DB read
 * (existing rows, existing `external_refs`) and every DB write. A screen
 * must never import this file directly.
 *
 * ## Law 17 — "client" only
 *
 * Neither `plannings` nor `availabilities` carries a client-shaped field
 * at all (`types.ts` §9/§10) — there is nothing to rename here, but the rule
 * still holds: no identifier in this file names the banned entity term
 * (see `PLAN.md` §0 Law 17 — only `types.ts` may use Booqable's wire word).
 *
 * ## Spec §10 — Booqable is the reservation authority during the bridge
 *
 * This mapper is PULL-ONLY. Nothing here calls `booqableWrite`/
 * `booqableDelete`; `inventory_reservations` is never pushed OS → Booqable.
 *
 * ## Two Booqable "availability" shapes — only one produces a row here
 *
 * The brief is explicit that the order-subject availability endpoint
 * ("could this order move to this date") is a DIFFERENT question from a
 * stock-count endpoint ("how many units are free"), and that only the
 * latter is meant for stock-count purposes. `types.ts` §10's
 * `BooqableAvailability` models the stock-count shape (`product_id` +
 * `location_id` + a window + `available`/`stock_count`/`planned_count` —
 * no order/booking linkage at all). Neither shape can produce an
 * `inventory_reservations` row: that table's `booking_id`/`booking_line_id`
 * are `NOT NULL` FKs, and an availability record has no order to resolve
 * either from. `mapAvailabilities` below is therefore an intentional no-op —
 * kept only so `pull()` can dispatch both entity names the brief mentions
 * with one uniform call shape. A future stock-count reconciliation feature
 * (comparing Booqable's `available` against locally summed reservations) is
 * out of scope for this file and is not built here.
 *
 * `plannings` (`types.ts` §9) is the one Booqable resource that actually
 * names an order (`order_id`) alongside a quantity and a date window, so it
 * is the only source this file reads to produce reservation rows.
 *
 * ## Law 3 — release, never delete
 *
 * `inventory_reservations` has no generic `deleted_at`; its terminal action
 * is `released_at` + `released_reason` (`0003_operations.sql`, "Set by
 * Cancel. The row remains — released, never deleted."). A Booqable planning
 * that flips `reserved: true → false` on an already-synced hold is mapped to
 * a release op, never a row deletion and never an UPDATE that clears the row
 * in place.
 *
 * `reserved: false` on a planning this mapper has never seen before is NOT
 * a conflict — it simply is not a hold yet (Booqable's own "not reserved"
 * concept, e.g. a Quote-stage plan). Silently skipped, not logged: logging
 * one conflict per not-yet-reserved planning on every pull would be exactly
 * the "log noise" spec §7 rule 3 exists to prevent, for a case that is not
 * actually wrong.
 *
 * ## The GiST exclusion constraint is an AUDITOR here, not a blocker
 *
 * `0003_operations.sql`'s `inventory_reservations_no_double_booking` —
 * `exclude using gist (asset_id with =, period with &&) where (released_at
 * is null and asset_id is not null)` — stays enabled. Per the brief: on a
 * Postgres exclusion-violation error (SQLSTATE 23P01) from an attempted
 * insert, this mapper must NOT disable the constraint and must NOT force the
 * row through. Since this file does no I/O (Law 1), it cannot itself catch
 * that error — `sync.ts` is expected to insert `plannings`-derived rows ONE
 * AT A TIME (not batched), catch a `23P01` failure per row, call
 * `reservationExclusionConflict` below to turn that one failed attempt into
 * a `sync_conflicts` row (`field: 'period_overlap'`), and continue with the
 * next row. `EXCLUSION_VIOLATION_SQLSTATE` is exported so `sync.ts`'s catch
 * clause and this file agree on exactly which Postgres error this handles,
 * rather than a magic string repeated at the call site. These conflicts are
 * real double-bookings Booqable already committed — surfacing them is the
 * point, not a bug to work around.
 *
 * Note the constraint only ever fires for `asset_id`-based (serialised)
 * holds (`where … asset_id is not null`) — a plain `product_id` + `qty`
 * quantity hold, which is what this mapper writes in the ordinary case (see
 * the asset-vs-product note below), is never checked by it at all. The
 * conflict path above is real but is expected to be the rare case in
 * practice, not the common one — it only fires when
 * `ReservationSyncContext.resolveAssetLocalId` resolves a specific unit.
 *
 * ## Asset (serialised) vs product (quantity) — best-effort, never guessed
 *
 * `BooqablePlanningAttributes.item_id`/`item_type` (`types.ts` §9) name a
 * product or bundle, the same vocabulary `order_lines.item_type` uses — the
 * wire shape gives no confirmed way to tell whether a specific planning
 * names one serialised unit (→ `inventory_reservations.asset_id`, `qty`
 * forced to 1 by that table's own CHECK) versus an aggregate quantity hold
 * against the product (→ `product_id` + `qty`). `types.ts` never models a
 * serial/stock-item-shaped field on `BooqablePlanningAttributes` at all.
 * TODO(decision): `ReservationSyncContext.resolveAssetLocalId` is a
 * caller-supplied resolver for the day this is confirmed one way or the
 * other; returning `undefined` (the only implementation this file assumes)
 * makes every planning a quantity-based hold, which is the safe default
 * given the wire shape — never invented here as a guess at serial
 * assignment.
 *
 * ## `booking_line_id` — no source field, resolved via context
 *
 * `BooqablePlanningAttributes` has no `order_line_id`-shaped field (`types.ts`
 * §9) — a planning names an order and an item, not a specific `order_lines`
 * row, and a single order can carry several lines for the same product
 * (e.g. split across two date windows). There is no way to recover which
 * `booking_lines` row a planning belongs to from this wire shape alone.
 * `ReservationSyncContext.resolveBookingLine` is a caller-supplied resolver
 * (e.g. matching `orders.ts`'s already-synced `booking_lines` by product +
 * overlapping window) — exactly the same shape of gap `orders.ts` documents
 * for `bookings.branch_id`/`.delivery_type`. `undefined` ⇒ skipped and
 * reported, never guessed.
 *
 * ## The Quote/Draft gate
 *
 * `0003_operations.sql`'s own `inventory_reservations` header: "Nothing is
 * reserved at Quote or Draft" and its TRIGGER REQUIRED note: "no row may
 * exist for a booking at stage Quote or Draft." This mapper respects that
 * invariant defensively even though (see the write-path note below) no
 * migration has yet implemented it as an enforced trigger: a planning whose
 * local booking is still at `'Quote'`, or whose stage this sync run does not
 * know at all, is logged and skipped rather than inserted. `orders.ts`'s own
 * order-status mapping is expected to have already advanced the booking to
 * `'Booked'` (or later) by the time a `reserved: true` planning is safe to
 * apply — `ReservationSyncContext.currentStageByLocalId` is the same shape
 * of map `orders.ts`'s `OrderSyncContext.currentStageByLocalId` already
 * exposes, and `sync.ts` is expected to supply the SAME map, not a
 * second one built independently.
 *
 * ## Write-path caveat — flagged, not resolved here
 *
 * `0003_operations.sql`'s own TRIGGER REQUIRED note for this table: "insert
 * and release happen only through the Confirm and Cancel transactions, never
 * by direct write." No later migration in this repo has actually implemented
 * that as an enforced trigger/grant revocation yet (unlike, say,
 * `bookings.stage`'s real, enforced `0021_forward_only_stage_transitions.sql`).
 * TODO(decision): if/when it is implemented, `sync.ts` may need to route
 * this file's insert/release ops through whatever RPC that trigger requires,
 * rather than a plain `idempotentInsert('inventory_reservations', …)` /
 * `safeUpdate(…)`. This file only produces the payloads (Law 1) — the actual
 * write mechanism is `sync.ts`'s concern, and is not decided here.
 *
 * ## `state` — set on insert only, never touched after
 *
 * `inventory_reservations.state` defaults `'Reserved'` and is written here
 * only at insert time. Exactly the same reasoning `stock.ts` documents for
 * `product_units.status`: this schema's own operations engines (packing,
 * handover, return, …) are what move a reservation's real-world state
 * forward once a hold exists — this sync mapper never overwrites `state` on
 * an already-synced row.
 *
 * ## Money
 *
 * `inventory_reservations` carries no money column. Nothing here imports
 * `lib/money.ts`.
 *
 * ## `client_uuid` — never generated here
 *
 * Same as every sibling mapper: `dataAccess.ts`'s `idempotentInsert` injects
 * a fresh `client_uuid` automatically when the payload omits one, so none of
 * this file's insert shapes carry that field.
 */

import type { BookingStatus } from '../../workflow'
import type { BooqableAvailabilityAttributes, BooqableId, BooqablePlanningAttributes } from '../types'
import type { BooqableFlatResource } from '../client'

/* ── shared result / context shapes — same pattern as the sibling mappers ── */

/**
 * Mirrors `sync_conflicts` (`0040_booqable_sync.sql`) minus DB-defaulted
 * columns, same shape as every other mapper in this directory. `owner` is
 * always `'booqable'` — reservations are entirely Booqable-authority during
 * the bridge (spec §10); a row here never means "the OS wrote a field it
 * shouldn't have."
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

function conflict(
  entity: string,
  localId: string | null,
  externalId: string | null,
  field: string,
  localValue: string | null,
  externalValue: string | null,
): SyncConflictInsert {
  return { entity, local_id: localId, external_id: externalId, field, local_value: localValue, external_value: externalValue, owner: 'booqable' }
}

/**
 * Everything `sync.ts` must resolve/supply before calling `mapPlannings` —
 * see the file-header TODO(decision)s for why each of these can't be
 * computed in here without inventing an answer.
 */
export interface ReservationSyncContext {
  /** external planning id -> local `inventory_reservations.id`, for rows already synced (from `external_refs`, entity `'plannings'`). Present ⇒ this planning has a live local hold to release/compare against; absent ⇒ candidate for a fresh insert. */
  existingRefs: ReadonlyMap<BooqableId, string>
  /** `external_refs.payload_hash` for rows already synced (spec §7 rule 3). */
  existingPayloadHashes: ReadonlyMap<BooqableId, string>
  /** external order id -> local `bookings.id` (from `orders.ts`'s own `external_refs`, entity `'orders'`). A planning whose order has not synced yet is skipped — `inventory_reservations.booking_id` is a `NOT NULL` FK. */
  bookingRefs: ReadonlyMap<BooqableId, string>
  /** local `bookings.id` -> its current `stage` — the SAME map `orders.ts`'s `OrderSyncContext.currentStageByLocalId` already exposes (see file header's Quote/Draft gate note), not a second one built independently. Absent ⇒ treated as unknown, the safe default that skips the insert. */
  currentStageByLocalId: ReadonlyMap<string, BookingStatus>
  /** external product id -> local `products.id` (from `products.ts`'s own `external_refs`, entity `'products'`). Used only on the quantity-hold path (`resolveAssetLocalId` returns `undefined`) — `inventory_reservations.product_id` has no local fallback. */
  productRefs: ReadonlyMap<BooqableId, string>
  /**
   * Resolves a Booqable (order, item, window) triple to the local
   * `booking_lines.id` this planning belongs to. See file header — plannings
   * carry no order-line-shaped foreign key at all; `undefined` ⇒ skipped and
   * reported, never guessed.
   */
  resolveBookingLine(
    orderExternalId: BooqableId,
    itemExternalId: BooqableId | null,
    itemType: string,
    startsAt: string,
    stopsAt: string,
  ): string | undefined
  /**
   * Resolves a Booqable planning item to a specific local serialised unit
   * (`product_units.id`), when — and only when — the caller can determine
   * this planning names one. See file header's asset-vs-product note.
   * `undefined` (the expected common case) ⇒ a quantity-based hold
   * (`product_id` + `qty`), never a guessed serial assignment.
   */
  resolveAssetLocalId(itemExternalId: BooqableId | null, itemType: string): string | undefined
  /** `users.id` for `created_by` — required, `NOT NULL` FK, no sync-actor convention exists elsewhere (see `stock.ts`'s identical note). Missing ⇒ every insert in this batch is skipped and reported. */
  systemActorUserId?: string
}

/** Cheap, non-cryptographic stable hash for change detection only (spec §7 rule 3) — same FNV-1a-32-over-sorted-JSON approach every sibling mapper uses, duplicated rather than imported so this file stays self-contained. */
export function computeReservationPayloadHash(value: unknown): string {
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

/* ── period — Postgres tstzrange literal ─────────────────────────────────
 * Half-open `[)` bounds, matching `tstzrange`'s own implicit constructor
 * default. Nothing in `0003_operations.sql`'s column comment states an
 * inclusive/exclusive convention explicitly, so the type's own default is
 * used rather than inventing one.
 */
export function buildPeriod(startsAt: string, stopsAt: string): string {
  return `[${startsAt},${stopsAt})`
}

/* ── the GiST exclusion constraint — see file header ─────────────────────── */

/** Postgres SQLSTATE for a GiST exclusion-constraint violation. Named, not inlined, so `sync.ts`'s catch clause and this file agree on exactly which error this handles. */
export const EXCLUSION_VIOLATION_SQLSTATE = '23P01'

/** The real constraint name, from `0003_operations.sql`'s `create table inventory_reservations` — quoted here so a future reader can grep the DDL and this file together. `sync.ts` is expected to key its catch on `EXCLUSION_VIOLATION_SQLSTATE`, not this name — Postgres reports the SQLSTATE reliably; the constraint name is documentation only. */
export const RESERVATIONS_EXCLUSION_CONSTRAINT_NAME = 'inventory_reservations_no_double_booking'

/**
 * Turns one failed insert attempt (a `23P01` caught by `sync.ts` around a
 * single-row insert of this op) into the `sync_conflicts` row the brief
 * calls for (`field: 'period_overlap'`) — this function does no I/O itself
 * (Law 1); `sync.ts` performs the actual insert into `sync_conflicts` and
 * then continues with the next row, never disabling the constraint and never
 * forcing the row through.
 */
export function reservationExclusionConflict(op: ReservationInsertOp): SyncConflictInsert {
  return conflict(
    'inventory_reservations',
    null,
    op.externalId,
    'period_overlap',
    null,
    `asset_id=${op.fields.asset_id ?? ''} product_id=${op.fields.product_id ?? ''} period=${op.fields.period}`,
  )
}

/* ── §1 · plannings -> local `inventory_reservations` rows ──────────────── */

export interface LocalReservationFields {
  booking_id: string
  booking_line_id: string
  qty: number
  /** Postgres `tstzrange` literal — see `buildPeriod`. */
  period: string
  /** Written on insert only — see file header's "state" note. */
  state: 'Reserved'
  created_by: string
  /** Serialised hold only (`resolveAssetLocalId` resolved a unit) — `qty` is forced to 1 whenever this is present, per that table's own CHECK. */
  asset_id?: string
  /** Quantity hold — the ordinary case (see file header). */
  product_id?: string
}

export interface ReservationInsertOp {
  externalId: BooqableId
  fields: LocalReservationFields
  payloadHash: string
}

export interface ReservationReleaseOp {
  localId: string
  externalId: BooqableId
  releasedAt: string
  releasedReason: string
}

export interface ReservationsPullResult {
  toInsert: ReservationInsertOp[]
  toRelease: ReservationReleaseOp[]
  conflicts: SyncConflictInsert[]
}

const SYNC_RELEASE_REASON = 'Released on Booqable side (synced automatically)'

export function mapPlannings(
  records: readonly BooqableFlatResource<'plannings', BooqablePlanningAttributes>[],
  ctx: ReservationSyncContext,
): ReservationsPullResult {
  const toInsert: ReservationInsertOp[] = []
  const toRelease: ReservationReleaseOp[] = []
  const conflicts: SyncConflictInsert[] = []

  for (const record of records) {
    const externalId = record.id
    const localId = ctx.existingRefs.get(externalId) ?? null

    // qty > 0 — matches inventory_reservations_qty_positive.
    if (record.quantity <= 0) {
      conflicts.push(conflict('inventory_reservations', localId, externalId, 'qty', null, String(record.quantity)))
      continue
    }

    // A well-formed window is required for both the release path (nothing
    // physically wrong with releasing on a malformed window) and, more
    // importantly, the insert path (period is NOT NULL and must be a real
    // non-empty range) — checked once, up front, for both.
    if (new Date(record.stops_at).getTime() <= new Date(record.starts_at).getTime()) {
      conflicts.push(conflict('inventory_reservations', localId, externalId, 'period', null, `starts_at=${record.starts_at} stops_at=${record.stops_at}`))
      continue
    }

    const bookingLocalId = ctx.bookingRefs.get(record.order_id)
    if (bookingLocalId === undefined) {
      conflicts.push(conflict('inventory_reservations', localId, externalId, 'booking_id', null, record.order_id))
      continue
    }

    /* ── reserved:false → release path, only if a live local hold exists ── */
    if (!record.reserved) {
      if (localId !== null) {
        toRelease.push({
          localId,
          externalId,
          releasedAt: record.updated_at,
          releasedReason: SYNC_RELEASE_REASON,
        })
      }
      // Not yet synced + not reserved — see file header: this is the
      // ordinary "not a hold yet" case, never logged.
      continue
    }

    // From here: record.reserved === true.

    if (localId !== null) {
      const hash = computeReservationPayloadHash(record)
      if (ctx.existingPayloadHashes.get(externalId) === hash) continue // spec §7 rule 3.
      // A changed-but-still-reserved planning on an already-synced hold has
      // no confirmed local write path — see file header's write-path
      // caveat. Rather than invent an UPDATE this schema does not document
      // (or worse, release-and-reinsert and risk losing the exclusion
      // constraint's protection mid-amendment), it is logged and left alone.
      conflicts.push(
        conflict(
          'inventory_reservations',
          localId,
          externalId,
          'period_or_qty',
          null,
          `starts_at=${record.starts_at} stops_at=${record.stops_at} qty=${record.quantity}`,
        ),
      )
      continue
    }

    // Insert path — see file header's Quote/Draft gate.
    const stage = ctx.currentStageByLocalId.get(bookingLocalId)
    if (stage === undefined || stage === 'Quote') {
      conflicts.push(
        conflict('inventory_reservations', null, externalId, 'stage', stage ?? null, 'planning reserved=true but local booking is at Quote or unknown'),
      )
      continue
    }

    const bookingLineLocalId = ctx.resolveBookingLine(record.order_id, record.item_id, record.item_type, record.starts_at, record.stops_at)
    if (bookingLineLocalId === undefined) {
      conflicts.push(
        conflict('inventory_reservations', null, externalId, 'booking_line_id', null, `order=${record.order_id} item=${record.item_id ?? ''}`),
      )
      continue
    }

    const assetLocalId = ctx.resolveAssetLocalId(record.item_id, record.item_type)

    let productLocalId: string | undefined
    if (assetLocalId === undefined) {
      productLocalId = record.item_id !== null ? ctx.productRefs.get(record.item_id) : undefined
      if (productLocalId === undefined) {
        conflicts.push(conflict('inventory_reservations', null, externalId, 'product_id', null, record.item_id))
        continue
      }
    }

    if (!ctx.systemActorUserId) {
      conflicts.push(conflict('inventory_reservations', null, externalId, 'created_by', null, null))
      continue
    }

    const fields: LocalReservationFields = {
      booking_id: bookingLocalId,
      booking_line_id: bookingLineLocalId,
      qty: assetLocalId !== undefined ? 1 : record.quantity,
      period: buildPeriod(record.starts_at, record.stops_at),
      state: 'Reserved',
      created_by: ctx.systemActorUserId,
      ...(assetLocalId !== undefined ? { asset_id: assetLocalId } : { product_id: productLocalId as string }),
    }

    toInsert.push({ externalId, fields, payloadHash: computeReservationPayloadHash(record) })
  }

  return { toInsert, toRelease, conflicts }
}

/* ── §2 · availabilities — intentional no-op, see file header ───────────── */

export function mapAvailabilities(
  _records: readonly BooqableFlatResource<'availabilities', BooqableAvailabilityAttributes>[],
): ReservationsPullResult {
  return { toInsert: [], toRelease: [], conflicts: [] }
}

/* ── §3 · uniform dispatcher for sync.ts ─────────────────────────────────── */

export type AvailabilityEntity = 'plannings' | 'availabilities'

export function pull(
  entity: 'plannings',
  records: readonly BooqableFlatResource<'plannings', BooqablePlanningAttributes>[],
  ctx: ReservationSyncContext,
): ReservationsPullResult
export function pull(
  entity: 'availabilities',
  records: readonly BooqableFlatResource<'availabilities', BooqableAvailabilityAttributes>[],
): ReservationsPullResult
export function pull(
  entity: AvailabilityEntity,
  records:
    | readonly BooqableFlatResource<'plannings', BooqablePlanningAttributes>[]
    | readonly BooqableFlatResource<'availabilities', BooqableAvailabilityAttributes>[],
  ctx?: ReservationSyncContext,
): ReservationsPullResult {
  switch (entity) {
    case 'plannings':
      if (!ctx) throw new Error('pull("plannings", …) requires a ReservationSyncContext.')
      return mapPlannings(records as readonly BooqableFlatResource<'plannings', BooqablePlanningAttributes>[], ctx)
    case 'availabilities':
      return mapAvailabilities(records as readonly BooqableFlatResource<'availabilities', BooqableAvailabilityAttributes>[])
  }
}
