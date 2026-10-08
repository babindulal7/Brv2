import { supabase } from '../supabase'
import { getSetting } from '../settingsStore'
import {
  selectUnitsForLine,
  explainShortfall,
  rankLeastUsed,
  unitStatesForRule,
  boundsForTurnaround,
  capacityFor,
  explainCapacityShortfall,
  windowsOverlap,
  type BoundConvention,
  type CapacityOutcome,
  type RentalWindow,
  type QuantityHold,
  type UnitCandidate,
  type OpenCleaning,
  type UnitHold,
  type AssignmentOutcome,
} from '../availability'

/**
 * # Auto Assign Serials — the read, the plan, and the reservation
 *
 * The IO half of `lib/availability.ts`. That module decides; this one fetches
 * what it decides over and writes what it decided. The split is Law 1: the rule
 * is testable by execution without a database, and this file holds no rule.
 *
 * ## Why this exists
 *
 * PROGRESS.md 16 Aug: nothing in the app wrote `booking_line_units` or any
 * assignment at all, so wiring the five floor workspaces to a working read
 * would have turned *"not loaded yet"* into *"loaded — nothing to pack"*.
 * Exactly **1 of 120** corpus bookings had unit rows. The missing piece was a
 * unit-assignment step at confirm time, and it blocked Packing, Handover,
 * Return, Reset and Evidence equally.
 *
 * ## Where it writes, and why that took a ruling
 *
 * `inventory_reservations` — ruled 16 Aug 2026, PLAN.md §4.30(a). It is the only
 * table in the schema carrying a double-booking defence:
 *
 *     exclude using gist (asset_id with =, period with &&)
 *       where (released_at is null and asset_id is not null)
 *
 * `booking_line_units`, which the floor screens read, has **no overlap
 * protection of any kind** — so writing assignments only there would reproduce
 * the lie `seed.ts:762-770` refused to generate, at runtime, where an operator
 * would act on it. The check below is therefore a courtesy that produces a
 * readable sentence; **the database is the arbiter and cannot be talked past**,
 * the same relationship `confirmRental.ts` has with the stage trigger.
 *
 * ## What this file does NOT do
 *
 * It does not write `booking_line_units`. Those rows carry the floor's working
 * state (packed, condition, session ids) and their shape depends on rulings
 * still open — the per-booking `case` and the packing tree `group`. Reserving is
 * the part that is ruled and that the database protects; the floor rows are a
 * projection of it and are built where those questions are answered.
 */

/**
 * A booking line that needs stock held.
 *
 * ⚠ This said "physical units" until 7 Sep 2026, and that was the bug.
 * `products.tracking_mode` (0001:505-509) decides whether a line is covered by
 * NAMED UNITS or by a NUMBER, and nothing on the Confirm path read it — so a
 * `Quantity` line resolved an empty unit pool, `selectUnitsForLine` reported a
 * shortfall equal to its whole qty, and Confirm refused the booking. On the live
 * project that is 204 of 204 products (INV-02).
 *
 * The mode and the ceiling travel WITH the line, read once in `readLines`, so
 * nothing downstream re-derives them and the plan cannot be built under one
 * answer and written under another — the same reasoning `AssignmentPlan.bounds`
 * gives for carrying the bound convention.
 */
export interface AssignableLine {
  readonly lineId: string
  readonly productId: string
  /** `booking_lines.description` — what the operator sees in a conflict message. */
  readonly label: string
  readonly qty: number
  /** `products_v.tracking_mode`, verbatim — `Serialised` | `Quantity` | `Consumable`. */
  readonly trackingMode: string
  /** `products_v.total_quantity` — the ceiling 0045's trigger compares a quantity hold against. */
  readonly totalQuantity: number
}

/**
 * A line covered by NAMED UNITS — `tracking_mode = 'Serialised'`.
 *
 * Unchanged from the original shape, deliberately: this is the path the GiST
 * exclusion protects and nothing about it was wrong.
 */
export interface SerialisedPlanLine {
  readonly kind: 'serialised'
  readonly line: AssignableLine
  readonly outcome: AssignmentOutcome
  /** Law 12: the inline, specific sentence. `null` when the line is fully covered. */
  readonly problem: string | null
}

/**
 * A line covered by a NUMBER — `Quantity` or `Consumable`.
 *
 * One `inventory_reservations` row naming the product, whose peak concurrency
 * the live `enforce_inventory_reservation_capacity()` trigger checks against
 * `products.total_quantity`. `capacity` is the app-side preview of that answer;
 * the trigger is the arbiter.
 */
export interface QuantityPlanLine {
  readonly kind: 'quantity'
  readonly line: AssignableLine
  readonly capacity: CapacityOutcome
  /** Law 12: the inline, specific sentence. `null` when the line is fully covered. */
  readonly problem: string | null
}

export type AssignmentPlanLine = SerialisedPlanLine | QuantityPlanLine

export interface AssignmentPlan {
  readonly bookingId: string
  readonly bookingNo: string
  readonly window: RentalWindow
  /**
   * The bound convention this plan was COMPUTED under, carried so the write
   * uses the same one.
   *
   * Not a cosmetic field. `reserveAssignedUnits` turns the window into a
   * `tstzrange` literal, and the bracket it closes with is what the GiST
   * exclusion will compare future holds against. If the plan were computed as
   * half-open and the row written as closed, the app would have checked a
   * different question from the one the database goes on to enforce — and the
   * disagreement would only ever show up as a back-to-back booking being
   * mysteriously rejected. Reading the setting twice is exactly how that
   * happens, so it is read once and travels with the plan.
   */
  readonly bounds: BoundConvention
  readonly lines: readonly AssignmentPlanLine[]
  /** True when every line found every unit it needs. */
  readonly complete: boolean
  /**
   * Lines carrying no `product_id` — bundles, services, manual items and
   * sub-rentals. Counted and named rather than silently dropped: a plan that
   * says "complete" while having skipped half the booking is the failure this
   * whole module exists to avoid.
   */
  readonly skipped: readonly { readonly lineId: string; readonly label: string; readonly reason: string }[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The two availability rules, read from Settings at the moment they are used.
 *
 * **This is the boundary that keeps `lib/availability.ts` pure.** The engine
 * takes `disqualifyingStates` and `bounds` as required parameters and knows
 * nothing about where they came from; this module — which is already the IO
 * layer — is the only place that reads storage. So the engine stays drivable in
 * a test with no `window` and no stubbing, and the rule stays changeable by the
 * owner without a release.
 *
 * Read **per call**, not captured at module load, matching how
 * `data/clients.ts:readOverdueStopDays()` and every other `getSetting` consumer
 * behaves: a rule changed in Settings must apply to the next confirm, not to
 * the next page refresh. The cost is a `localStorage` read per assignment,
 * which is not measurable next to the four network round trips beside it.
 *
 * Both resolvers fall back to the ruled default on an unrecognised label rather
 * than to something permissive — see their doc comments in `lib/availability`.
 */
export function availabilityRules(): { disqualifyingStates: ReadonlySet<string>; bounds: BoundConvention } {
  return {
    disqualifyingStates: unitStatesForRule(String(getSetting('unitAvailabilityRule'))),
    bounds: boundsForTurnaround(String(getSetting('rentalTurnaround'))),
  }
}

interface BookingWindowRow {
  id: string
  booking_no: string
  pickup_at: string
  return_at: string
}

/**
 * The booking's window. Columns are named and **none of them is money** —
 * `bookings.deposit_required` sits on this table, so a `select('*')` would hand
 * a rupee figure to any session that can confirm a booking, Warehouse included
 * (Law 6, and the same reasoning as `confirmRental.ts`'s `readBooking`).
 */
async function readWindow(ref: string): Promise<BookingWindowRow> {
  const column = UUID_RE.test(ref) ? 'id' : 'booking_no'
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_no, pickup_at, return_at')
    .eq(column, ref)
    .maybeSingle()

  if (error) throw new Error(`Could not read booking ${ref}, so nothing was assigned: ${error.message}`)
  if (!data) throw new Error(`No booking matches ${ref}. Nothing was assigned.`)
  return data as unknown as BookingWindowRow
}

/**
 * Which planning path a line takes.
 *
 * Mirrors the live arbiter exactly — `enforce_inventory_reservation_capacity()`
 * branches `if v_tracking_mode = 'Serialised' … else v_capacity :=
 * v_total_quantity` (0045:176-191) — rather than listing the two quantity modes.
 * Written this way round so that a fourth `product_tracking_mode` member would
 * fall to the NUMBER path here and at the database together, instead of the app
 * and the trigger disagreeing silently about a value neither was told about.
 *
 * ⚠ `Consumable` is therefore planned exactly as `Quantity` is, because that is
 * what the trigger does. Whether returning a consumable should decrement
 * `total_quantity` — *"Quantity, and consumed on return — never comes back"*,
 * Add Equipment §5.1 — is a separate question, unruled, and is NOT answered here.
 */
function isSerialisedMode(trackingMode: string): boolean {
  return trackingMode === 'Serialised'
}

interface ProductMode {
  readonly trackingMode: string
  readonly totalQuantity: number
}

/**
 * `tracking_mode` and `total_quantity` for a set of products, read through
 * **`products_v`** and never the base table — 0062 revokes table-level SELECT on
 * `products`, the same reason `readCandidates` reads `product_units_v`.
 *
 * Neither column is money. `products_v` returns `null` for its nine money
 * columns to a money-blind session (`queries/inventory.ts` MONEY) and these two
 * are not among them — the inventory list read already names both — so this
 * survives Law 6's mask for every role that can confirm a booking.
 *
 * A SEPARATE read rather than a `booking_lines → products_v` embed. The embed
 * would save a round trip, but PostgREST's ability to resolve a base-table →
 * view relationship has been measured here for `products_v →
 * inventory_categories` and `product_units_v → products_v` and NOT for this
 * pair. An embed that silently resolved nothing would send every line down the
 * quantity path with a ceiling of zero, which refuses every booking — so the
 * unmeasured shape is not used on the Confirm path.
 */
export async function readProductModes(productIds: readonly string[]): Promise<Map<string, ProductMode>> {
  const byId = new Map<string, ProductMode>()
  if (productIds.length === 0) return byId

  const { data, error } = await supabase
    .from('products_v')
    .select('id, tracking_mode, total_quantity')
    .in('id', [...new Set(productIds)])

  if (error) {
    throw new Error(`Could not read how these products are tracked, so nothing was assigned: ${error.message}`)
  }

  for (const row of (data ?? []) as unknown as Array<{
    id: string
    tracking_mode: string | null
    total_quantity: number | null
  }>) {
    byId.set(row.id, {
      /* A null mode is not a mode. Falling back to `Serialised` sends the line
         down the unit path, which can only ever REFUSE a booking — the safe
         direction, and the same one `unitStatesForRule` takes on a label it does
         not recognise. Falling back to the number path would need a ceiling
         nobody supplied. */
      trackingMode: row.tracking_mode ?? 'Serialised',
      totalQuantity: typeof row.total_quantity === 'number' ? row.total_quantity : 0,
    })
  }
  return byId
}

/**
 * Live lines only — Law 3. A removed line is `voided_at`, never deleted, and a
 * voided line reserves nothing.
 *
 * Reads each line's tracking mode and hands it on. It splits nothing itself:
 * *which* path a line takes is a rule, and `planAssignment` applies it (Law 1).
 */
async function readLines(bookingId: string): Promise<{
  assignable: AssignableLine[]
  skipped: AssignmentPlan['skipped']
}> {
  const { data, error } = await supabase
    .from('booking_lines')
    .select('id, product_id, qty, line_type, description')
    .eq('booking_id', bookingId)
    .is('voided_at', null)

  if (error) throw new Error(`Could not read the booking's lines, so nothing was assigned: ${error.message}`)

  const rows = (data ?? []) as unknown as Array<{
    id: string
    product_id: string | null
    qty: number
    line_type: string
    description: string | null
  }>

  const modes = await readProductModes(
    rows.map((row) => row.product_id).filter((id): id is string => id !== null),
  )

  const assignable: AssignableLine[] = []
  const skipped: Array<{ lineId: string; label: string; reason: string }> = []

  for (const row of rows) {
    const label = row.description ?? row.line_type
    if (row.product_id === null) {
      /* `product_id` is nullable and a bundle line carries `bundle_id` instead.
         Expanding a bundle into its member products needs the packing tree
         `group` ruling (bundles.name vs inventory_categories.name), which is
         open — so bundles are reported, not guessed at. */
      skipped.push({
        lineId: row.id,
        label,
        reason: `${row.line_type} lines name no product, so no stock can be held for them here.`,
      })
      continue
    }

    const mode = modes.get(row.product_id)
    if (mode === undefined) {
      /*
       * The line names a product `products_v` did not return — deleted, outside
       * this session's reach, or a stale id. It is REFUSED rather than skipped.
       *
       * Skipping would be the unsafe direction and quietly so: `skipped` lines do
       * not count against `complete`, so the booking would reach Booked with a
       * line whose stock was never checked and never held. Guessing a mode is
       * worse — both guesses invent a fact about stock.
       */
      throw new Error(
        `${label} names a product that could not be read from the catalogue, so no hold could be planned ` +
          'for it and nothing was assigned. Confirming past it would commit a line with stock behind it ' +
          'that was never checked.',
      )
    }

    assignable.push({
      lineId: row.id,
      productId: row.product_id,
      label,
      qty: row.qty,
      trackingMode: mode.trackingMode,
      totalQuantity: mode.totalQuantity,
    })
  }

  return { assignable, skipped }
}

/**
 * Candidate units for a set of products, read through **`product_units_v`**
 * rather than the base table.
 *
 * The view is the sanctioned path (`lib/queries/inventory.ts` already reads it)
 * and it is the one that survives `0062_law6_column_grants_arm_the_mask.sql`,
 * which revokes table-level SELECT on `product_units`. None of the columns here
 * is money, but reading the base table would still break the moment that
 * migration lands — see PLAN.md §4.28.
 */
export async function readCandidates(productIds: readonly string[]): Promise<Map<string, UnitCandidate[]>> {
  const byProduct = new Map<string, UnitCandidate[]>()
  if (productIds.length === 0) return byProduct

  const { data, error } = await supabase
    .from('product_units_v')
    .select('id, asset_tag, serial_no, product_id, status, retired_at')
    .in('product_id', [...new Set(productIds)])
    .order('asset_tag', { ascending: true })

  if (error) throw new Error(`Could not read the equipment units, so nothing was assigned: ${error.message}`)

  const units = (data ?? []) as unknown as Array<{
    id: string
    asset_tag: string
    serial_no: string | null
    product_id: string
    status: string
    retired_at: string | null
  }>

  const cleaning = await readOpenCleaning(units.map((u) => u.id))

  for (const row of units) {
    const list = byProduct.get(row.product_id) ?? []
    list.push({
      unitId: row.id,
      assetTag: row.asset_tag,
      serialNo: row.serial_no,
      productId: row.product_id,
      state: row.status,
      retiredAt: row.retired_at,
      openCleaning: cleaning.get(row.id) ?? null,
    })
    byProduct.set(row.product_id, list)
  }

  return byProduct
}

/**
 * The units sitting on the reset bench right now.
 *
 * An entry counts as OPEN when the booking still wants a reset from it and no
 * `reset_completed_at` has been stamped — which is exactly the row `Return`
 * raises and `completeResetQueue` closes. Reading it here is what finally gives
 * `reset_completed_at` a consequence: before this, completing a reset changed a
 * tile and nothing else, and unreset gear stayed assignable
 * (BUG_AUDIT_LIFECYCLE RS-02).
 *
 * Deliberately NOT read from `product_units.status`: that column is
 * Booqable-mastered and the OS may not write it, so an OS-owned fact has to
 * come from an OS-owned table.
 */
async function readOpenCleaning(unitIds: readonly string[]): Promise<Map<string, OpenCleaning>> {
  const out = new Map<string, OpenCleaning>()
  if (unitIds.length === 0) return out

  const { data, error } = await supabase
    .from('cleaning_queue_entries')
    .select('unit_id, requires_clean, bookings ( booking_no )')
    .in('unit_id', [...new Set(unitIds)])
    .eq('requires_reset', true)
    .is('reset_completed_at', null)

  if (error) {
    throw new Error(
      `Could not read the reset queue, so no unit could be shown as free or busy: ${error.message}`,
    )
  }

  for (const row of (data ?? []) as unknown as Array<{
    unit_id: string
    requires_clean: boolean | null
    bookings: { booking_no: string } | { booking_no: string }[] | null
  }>) {
    const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
    /* One open entry per unit is the shape the queue is meant to hold; if a
       second ever exists, the first read wins and the unit is excluded either
       way, so the answer does not change. */
    if (!out.has(row.unit_id)) {
      out.set(row.unit_id, { bookingNo: b?.booking_no ?? null, requiresClean: row.requires_clean === true })
    }
  }

  return out
}

/**
 * Live holds on any of those units.
 *
 * `released_at is null` is the same predicate the GiST exclusion uses in its
 * `where`, so this asks the database the question the constraint will ask —
 * rather than a similar one that could disagree at the edges. `asset_id` is
 * nullable (a quantity hold names a product instead), and a hold with no unit
 * cannot collide with a named one, so those are filtered out here too, again
 * matching the constraint's `asset_id is not null`.
 */
export async function readHolds(bookingIdToExclude: string | null): Promise<UnitHold[]> {
  let query = supabase
    .from('inventory_reservations')
    .select('asset_id, booking_id, period, bookings ( booking_no )')
    .is('released_at', null)
    .not('asset_id', 'is', null)

  /* `null` means "there is no booking of ours to leave out" — the tentative
     plan for a booking that has no row yet. Sending a placeholder uuid to
     `neq` instead would work today and read as a filter nobody can explain
     later; the absence of the filter IS the honest expression of the case. */
  if (bookingIdToExclude !== null) query = query.neq('booking_id', bookingIdToExclude)

  const { data, error } = await query

  if (error) throw new Error(`Could not read existing reservations, so nothing was assigned: ${error.message}`)

  const holds: UnitHold[] = []
  for (const row of (data ?? []) as unknown as Array<{
    asset_id: string | null
    booking_id: string
    period: string
    bookings: { booking_no: string } | null
  }>) {
    const window = parseTstzRange(row.period)
    if (row.asset_id === null || window === null) continue
    holds.push({
      unitId: row.asset_id,
      bookingId: row.booking_id,
      bookingNo: row.bookings?.booking_no ?? row.booking_id,
      window,
    })
  }
  return holds
}

/**
 * Live PRODUCT-LEVEL holds on a set of products — the mirror of `readHolds`,
 * filtered the other way.
 *
 * `readHolds` asks for `asset_id is not null` because that is the GiST
 * exclusion's own `where`. This asks for `product_id is not null` because that is
 * the predicate on `idx_inventory_reservations_product_period` (0045:97-100), the
 * index the capacity trigger's sweep reads through. Between them the two
 * functions cover the whole table and neither silently swallows the other's rows
 * — which `readHolds`'s own comment already anticipated: *"a quantity hold names
 * a product instead"*. Until 7 Sep 2026 nothing called the other half.
 *
 * `released_at is null` is the liveness test the trigger uses. Same predicate,
 * same answer — the app previews the question the database will ask, not a
 * similar one that could disagree at the edges.
 */
export async function readQuantityHolds(
  productIds: readonly string[],
  bookingIdToExclude: string | null,
): Promise<Map<string, QuantityHold[]>> {
  const byProduct = new Map<string, QuantityHold[]>()
  const ids = [...new Set(productIds)]
  if (ids.length === 0) return byProduct

  let query = supabase
    .from('inventory_reservations')
    .select('product_id, qty, booking_id, period, bookings ( booking_no )')
    .is('released_at', null)
    .not('product_id', 'is', null)
    .in('product_id', ids)

  /* `null` means "there is no booking of ours to leave out" — the same tentative
     case `readHolds` documents. */
  if (bookingIdToExclude !== null) query = query.neq('booking_id', bookingIdToExclude)

  const { data, error } = await query

  if (error) throw new Error(`Could not read existing stock holds, so nothing was assigned: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{
    product_id: string | null
    qty: number | null
    booking_id: string
    period: string
    bookings: { booking_no: string } | { booking_no: string }[] | null
  }>) {
    const window = parseTstzRange(row.period)
    if (row.product_id === null || window === null) continue
    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
    const list = byProduct.get(row.product_id) ?? []
    list.push({
      bookingId: row.booking_id,
      bookingNo: booking?.booking_no ?? row.booking_id,
      /* `qty` is `int not null default 1` at the database, so a null is a failed
         read, not a hold of one. It is passed through as NaN rather than
         defaulted: `capacityFor` refuses a hold it cannot count, and defaulting
         to 1 would UNDER-count stock that is already promised. */
      qty: row.qty ?? Number.NaN,
      window,
    })
    byProduct.set(row.product_id, list)
  }

  return byProduct
}

/**
 * PostgREST hands a `tstzrange` back as its text form —
 * `["2026-08-16 03:15:00+00","2026-08-18 12:15:00+00")`. Postgres's text output
 * uses a space rather than `T` and `+00` rather than `Z`, neither of which
 * `Date.parse` accepts reliably across engines, so both are normalised here.
 *
 * An unbounded or unparseable range returns `null` and the caller drops the
 * hold. That is the **unsafe direction** — a dropped hold is a unit that looks
 * free — so it is deliberately narrow: the app is the only writer of this
 * column and always writes both ends. The GiST constraint remains the actual
 * defence, and it sees the real range whatever this function makes of the text.
 */
export function parseTstzRange(text: string): RentalWindow | null {
  const match = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(text.trim())
  const rawFrom = match?.[1]
  const rawTo = match?.[2]
  if (rawFrom === undefined || rawTo === undefined) return null

  const iso = (value: string): string => {
    const withT = value.replace(' ', 'T')
    /* `+00` → `+00:00`; a bare `+0545` → `+05:45`. */
    return withT
      .replace(/([+-]\d{2})$/, '$1:00')
      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  }

  const fromAd = iso(rawFrom)
  const toAd = iso(rawTo)
  if (Number.isNaN(Date.parse(fromAd)) || Number.isNaN(Date.parse(toAd))) return null
  return { fromAd, toAd }
}

/**
 * Postgres literal for the window.
 *
 * ⚠ `bounds` is **required and has no default**, deliberately. It briefly
 * defaulted to `RENTAL_WINDOW_BOUNDS` — the module constant — which was safe
 * only because the one caller happened to pass `plan.bounds` explicitly. Since
 * `rentalTurnaround` became a Settings key that default was one careless call
 * away from a genuine defect: the period would be WRITTEN under the ruled
 * default while the availability check that produced it RAN under the owner's
 * choice, and the two would disagree silently at the bracket.
 *
 * That bracket is not cosmetic. It is stored in `inventory_reservations.period`
 * and the GiST exclusion compares it with `&&`, so it decides whether a
 * back-to-back booking is refused — by the database, hours later, with no way
 * to tell from the UI which convention the row was written under.
 *
 * ⚠ **Nothing in the app writes that column any more** (R-26 / `0100`). Postgres
 * does, as `tstzrange(pickup_at, return_at, '[)')`, hard-coded in the trigger.
 * This function is therefore no longer the writer — it is the app's half of the
 * agreement, kept and still tested because the two halves must say the same
 * thing: `RENTAL_WINDOW_BOUNDS` is `half-open`, `0100` writes `'[)'`, and every
 * overlap question the app asks is answered under the convention the constraint
 * enforces. Change one and you must change the other in the same commit.
 */
export function toTstzRangeLiteral(window: RentalWindow, bounds: BoundConvention): string {
  const close = bounds === 'closed' ? ']' : ')'
  return `[${window.fromAd},${window.toAd}${close}`
}

/**
 * What Confirm *would* reserve. **Reads only — writes nothing.**
 *
 * Also the query behind the booking workspace's inline conflict check (Booking
 * Workflow §8.5), which is why it is a plan rather than a side effect: the same
 * answer has to be showable before anyone commits to it.
 */
/**
 * A product's SERIAL holds, restated as quantity holds of one.
 *
 * 0045's `live` CTE unions BOTH hold shapes before it sweeps, because for a
 * Serialised product they draw on the same finite pool: *"a model-level hold of
 * 3 plus a serial hold on a fourth unit is 4 units claimed"* (0045:120-125). A
 * `Quantity` product has no `product_units` rows at all, so on the live
 * catalogue this contributes nothing — it is written anyway so the preview
 * matches the arbiter for ANY product, rather than only for the mode the
 * catalogue happens to hold today.
 */
function serialHoldsAsQuantity(
  productId: string,
  candidatesByProduct: ReadonlyMap<string, readonly UnitCandidate[]>,
  holds: readonly UnitHold[],
): QuantityHold[] {
  const unitIds = new Set((candidatesByProduct.get(productId) ?? []).map((unit) => unit.unitId))
  if (unitIds.size === 0) return []
  return holds
    .filter((hold) => unitIds.has(hold.unitId))
    .map((hold) => ({ bookingId: hold.bookingId, bookingNo: hold.bookingNo, qty: 1, window: hold.window }))
}

/**
 * What an EARLIER line of this same plan already promised, expressed as a hold.
 *
 * The quantity-mode counterpart of the `claimed` unit set below. Two lines
 * naming the same cable on one booking must not both be told the same five are
 * free — and nothing in the database would catch it until the second row hit
 * 0045's ceiling, at which point the operator gets a Postgres exception instead
 * of a sentence.
 *
 * A hold rather than a reduced ceiling, so `explainCapacityShortfall` can say
 * where the stock went: an operator who listed the same product twice is told
 * exactly that, rather than being told the warehouse is short.
 */
function planClaimAsHold(
  productId: string,
  claimedQty: ReadonlyMap<string, number>,
  window: RentalWindow,
  bookingId: string,
  bookingNo: string,
): QuantityHold[] {
  const claimed = claimedQty.get(productId) ?? 0
  if (claimed < 1) return []
  return [{ bookingId, bookingNo: `${bookingNo} (an earlier line on this booking)`, qty: claimed, window }]
}

export async function planAssignment(bookingRef: string): Promise<AssignmentPlan> {
  const booking = await readWindow(bookingRef)
  const window: RentalWindow = { fromAd: booking.pickup_at, toAd: booking.return_at }

  const { assignable, skipped } = await readLines(booking.id)

  /* Both reads are issued for EVERY line's product, not only its own mode's.
     `readCandidates` is what tells `serialHoldsAsQuantity` which units belong to
     a product, and a Serialised product may legitimately carry a model-level
     hold — 0045 counts both against one ceiling, so both are fetched. */
  const [candidatesByProduct, holds, quantityHoldsByProduct] = await Promise.all([
    readCandidates(assignable.map((line) => line.productId)),
    readHolds(booking.id),
    readQuantityHolds(
      assignable.filter((line) => !isSerialisedMode(line.trackingMode)).map((line) => line.productId),
      booking.id,
    ),
  ])

  /* Units taken by an earlier line in THIS plan are not available to a later
     one. Two lines for the same product on one booking must not both be handed
     the same camera — and nothing in the database would catch that until the
     second reservation hit the exclusion. */
  const claimed = new Set<string>()
  /* The same rule for bulk stock — see `planClaimAsHold`. */
  const claimedQty = new Map<string, number>()
  const lines: AssignmentPlanLine[] = []

  /* Read ONCE per plan, not once per line: a rule that changed mid-loop would
     assign the first two lines under one policy and the rest under another, and
     the resulting booking would be explicable by nothing. */
  const rules = availabilityRules()

  for (const line of assignable) {
    if (isSerialisedMode(line.trackingMode)) {
      const pool = (candidatesByProduct.get(line.productId) ?? []).filter((unit) => !claimed.has(unit.unitId))
      const outcome = selectUnitsForLine({
        needed: line.qty,
        window,
        candidates: pool,
        holds,
        disqualifyingStates: rules.disqualifyingStates,
        bounds: rules.bounds,
      })
      for (const unit of outcome.assigned) claimed.add(unit.unitId)
      lines.push({ kind: 'serialised', line, outcome, problem: explainShortfall(outcome, line.label) })
      continue
    }

    const capacity = capacityFor({
      window,
      holds: [
        ...(quantityHoldsByProduct.get(line.productId) ?? []),
        ...serialHoldsAsQuantity(line.productId, candidatesByProduct, holds),
        ...planClaimAsHold(line.productId, claimedQty, window, booking.id, booking.booking_no),
      ],
      totalQuantity: line.totalQuantity,
      qtyRequested: line.qty,
      bounds: rules.bounds,
    })
    /* Only a covered line claims. An uncovered one already fails the plan, and
       claiming stock it did not get would make the NEXT line's sentence wrong. */
    if (capacity.shortfall === 0) {
      claimedQty.set(line.productId, (claimedQty.get(line.productId) ?? 0) + line.qty)
    }
    lines.push({ kind: 'quantity', line, capacity, problem: explainCapacityShortfall(capacity, line.label) })
  }

  return {
    bookingId: booking.id,
    bookingNo: booking.booking_no,
    window,
    bounds: rules.bounds,
    lines,
    /* `problem` is `null` exactly when a line is covered, under both paths —
       `explainShortfall` and `explainCapacityShortfall` each hold that contract —
       so completeness is asked once rather than branched on the line's kind. */
    complete: lines.every((entry) => entry.problem === null),
    skipped,
  }
}

/**
 * Thrown when a plan cannot cover every line. Carries the plan so a screen can
 * render the per-line detail rather than re-deriving it from a string.
 */
export class AssignmentIncompleteError extends Error {
  readonly plan: AssignmentPlan
  constructor(plan: AssignmentPlan) {
    const problems = plan.lines
      .map((entry) => entry.problem)
      .filter((problem): problem is string => problem !== null)
    super(
      `${plan.bookingNo} cannot be confirmed: not every line has stock free for these dates. ` +
        problems.join(' '),
    )
    this.name = 'AssignmentIncompleteError'
    this.plan = plan
  }
}

/* ── D5 · units at CREATION ───────────────────────────────────────────────
 *
 * Ruled 30 Aug 2026 (REFERENCE_SPEC v2.5 Appendix A0, D5): serials are
 * assigned at booking creation, least-used first — the 27 Jul lock stands.
 * `planAssignment` above serves Confirm, where a booking row already exists;
 * creation has no row yet, so this variant takes the window and the intended
 * lines directly. `readHolds(null)` was built for exactly this tentative case.
 * ----------------------------------------------------------------------- */

/** One intended line of a booking that does not exist yet. */
export interface CreationLineRequest {
  /** Any caller-stable key — the index, or the line's minted client_uuid. */
  readonly key: string
  /** `products.id`, or null for bundle/service/manual lines (skipped). */
  readonly productId: string | null
  readonly qty: number
  /** What the operator sees in a shortfall sentence. */
  readonly label: string
}

export interface CreationUnitPlan {
  /**
   * `key` → the `product_units.id`s to send as the line's `units`. A key may
   * map to FEWER ids than its qty — partial cover is not guessing, the
   * assigned units are genuinely free; Pack fills the rest (D5). Keys for
   * product-less lines are absent.
   */
  readonly unitsByKey: ReadonlyMap<string, readonly string[]>
  /** Law 12 sentences for anything short — rendered inline, never invented. */
  readonly problems: readonly string[]
  /**
   * `'planned'` — the reads succeeded and the map is meaningful (possibly
   * empty). `'unavailable'` — a read failed, so per D5 the caller sends NO
   * units rather than guessing: `inventory_reservations` is Booqable-mastered
   * during the bridge (dataAccess.ts:201), and an unreadable availability
   * source must degrade to the unit-less fallback, never to a wrong green.
   */
  readonly source: 'planned' | 'unavailable'
}

/**
 * How many times each candidate unit has EVER been assigned — the least-used
 * counter. `booking_line_units` rows are never deleted at all — 0044's Law 3
 * backstop rejects DELETE for every role, and §4.39(a) ends an assignment by
 * marking it released (`released_at`, migration 0076), leaving the row — so
 * counting rows per `asset_id` is the usage history the 27 Jul lock asks for.
 * Released rows are counted ON PURPOSE: an assignment that happened is usage
 * even if it later ended (0076's header records this as a §4.37(e)-adjacent
 * tuning question, not a bug). Counted here and ranked in
 * `lib/availability.ts:rankLeastUsed` (Law 1 — the preference is a rule, this
 * is only the read).
 */
async function readUsageCounts(unitIds: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (unitIds.length === 0) return counts

  const { data, error } = await supabase.from('booking_line_units').select('asset_id').in('asset_id', unitIds)

  if (error) throw new Error(`Could not read unit usage history: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{ asset_id: string | null }>) {
    if (row.asset_id === null) continue
    counts.set(row.asset_id, (counts.get(row.asset_id) ?? 0) + 1)
  }
  return counts
}

/**
 * What creation should assign — least-used free units per line, or the honest
 * refusal to guess.
 *
 * **Never throws on a failed read.** `createRental` must not be blocked by an
 * availability outage — D5 names the fallback (unit-less lines, Pack fills),
 * so an unreadable source returns `source: 'unavailable'` with an empty map
 * and the sentence saying why. A thrown error here would turn a sync gap into
 * a floor stoppage, which is exactly what the ruling's fallback clause exists
 * to prevent.
 */
export async function planCreationUnits(
  window: RentalWindow,
  lines: readonly CreationLineRequest[],
): Promise<CreationUnitPlan> {
  const assignable = lines.filter((line) => line.productId !== null && line.qty >= 1)
  if (assignable.length === 0) return { unitsByKey: new Map(), problems: [], source: 'planned' }

  let candidatesByProduct: Map<string, UnitCandidate[]>
  let holds: UnitHold[]
  let usage: Map<string, number>
  try {
    ;[candidatesByProduct, holds] = await Promise.all([
      readCandidates(assignable.map((line) => line.productId as string)),
      readHolds(null),
    ])
    const allUnitIds = [...candidatesByProduct.values()].flat().map((unit) => unit.unitId)
    usage = await readUsageCounts(allUnitIds)
  } catch (err) {
    return {
      unitsByKey: new Map(),
      problems: [
        'Availability could not be read, so no units were assigned at creation — the booking is created ' +
          `with unit-less lines and Packing assigns them. (${err instanceof Error ? err.message : String(err)})`,
      ],
      source: 'unavailable',
    }
  }

  const rules = availabilityRules()
  const claimed = new Set<string>()
  const unitsByKey = new Map<string, readonly string[]>()
  const problems: string[] = []

  for (const line of assignable) {
    const pool = rankLeastUsed(
      (candidatesByProduct.get(line.productId as string) ?? []).filter((unit) => !claimed.has(unit.unitId)),
      usage,
    )
    const outcome = selectUnitsForLine({
      needed: line.qty,
      window,
      candidates: pool,
      holds,
      disqualifyingStates: rules.disqualifyingStates,
      bounds: rules.bounds,
    })
    for (const unit of outcome.assigned) claimed.add(unit.unitId)
    if (outcome.assigned.length > 0) {
      unitsByKey.set(
        line.key,
        outcome.assigned.map((unit) => unit.unitId),
      )
    }
    const problem = explainShortfall(outcome, line.label)
    if (problem !== null) problems.push(problem)
  }

  return { unitsByKey, problems, source: 'planned' }
}
/* ══ RULING 2026-09-08 (R-26) ═══════════════════════════════════════════════
 *
 * **The database writes reservations now. This module only reads them.**
 *
 * What used to sit here — `ReservationResult`, `ReservationNotPersistedError`,
 * `insertHold`, `assertHoldsAreLive`, `explainReservationFailure`,
 * `reserveAssignedUnits`, `releaseReservations` — was the application's write
 * path into `inventory_reservations`, called from exactly one place
 * (`confirmRental.ts`). R-26 moved that write into Postgres, onto the Booked
 * transition (`0100_reservations_written_by_transition.sql`), because a hold the
 * browser places is a hold the browser can skip: two bookings taking the same
 * camera over overlapping dates were both accepted in PGlite on 8 Sep 2026, and
 * `inventory_reservations` stayed at zero rows, so the GiST exclusion that makes
 * double-booking impossible was never offered a row to reject.
 *
 * Deleted rather than left exported and uncalled. An exported writer with no
 * caller is an invitation, and the whole point of the ruling is that there is no
 * second way to place a hold. The revert is `git checkout` of this file and
 * `confirmRental.ts`, plus dropping the trigger — R-26 says so in as many words.
 *
 * What replaces it is below: a read that produces a better sentence than the
 * constraint's, BEFORE the transition is attempted. It decides nothing. If it
 * says the unit is free and the database disagrees, the database wins and the
 * confirm is refused whole — which is the point of moving the write.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** One live hold standing in the way of a confirm. */
export interface ReservationCollision {
  /** `product_units.id` — the unit both bookings want. */
  readonly unitId: string
  /** The booking already holding it, for the operator's sentence. */
  readonly bookingNo: string
}

/**
 * The units in `assetIds` that are already held over `window` by someone else.
 *
 * This is R-26's courtesy check, and it is the exact question the constraint
 * asks:
 *
 *     select 1 from inventory_reservations
 *      where asset_id = any($1) and period && $2 and released_at is null
 *
 * `readHolds` already issues the `released_at is null` / `asset_id is not null`
 * half of that against PostgREST — it is the same read `planAssignment` runs, so
 * asking it again here costs one round trip and no new query shape. The `&&` is
 * evaluated by `windowsOverlap` under the caller's `bounds` rather than by
 * PostgREST, for the reason `readHolds` already states: the app must ask the
 * question the constraint answers, and the bracket convention is what makes
 * those the same question. `RENTAL_WINDOW_BOUNDS` and `0100`'s `tstzrange(…, '[)')`
 * are the two halves of that agreement; changing one without the other makes
 * this check a lie rather than merely wrong.
 *
 * ⚠ **Not a gate.** Between this read and the transition insert another session
 * can take the same unit, and this returning nothing is not permission to
 * proceed. It exists so the operator gets *"#912 already has LAO-10MM-…"*
 * instead of the constraint's `23P01 conflicting key value violates exclusion
 * constraint`. The refusal that counts happens inside the transaction.
 */
export async function findCollidingHolds(
  assetIds: readonly string[],
  window: RentalWindow,
  bounds: BoundConvention,
  bookingIdToExclude: string | null,
): Promise<readonly ReservationCollision[]> {
  if (assetIds.length === 0) return []

  const wanted = new Set(assetIds)
  const holds = await readHolds(bookingIdToExclude)

  const collisions: ReservationCollision[] = []
  for (const hold of holds) {
    if (!wanted.has(hold.unitId)) continue
    if (!windowsOverlap(window, hold.window, bounds)) continue
    collisions.push({ unitId: hold.unitId, bookingNo: hold.bookingNo })
  }
  return collisions
}

/**
 * The collisions as one sentence, or `null` when there are none.
 *
 * Booking numbers first and deduplicated: an operator whose confirm was refused
 * needs to know *which booking to ring*, and one booking holding four of the
 * units they wanted is one phone call, not four.
 */
export function describeCollisions(collisions: readonly ReservationCollision[]): string | null {
  if (collisions.length === 0) return null
  const bookings = [...new Set(collisions.map((c) => c.bookingNo))].sort()
  const units = collisions.length === 1 ? '1 unit is' : `${String(collisions.length)} units are`
  return `${units} already held for these dates by ${bookings.length === 1 ? 'booking' : 'bookings'} ${bookings.join(', ')}.`
}

/** What the database is actually holding for one booking, read back after the fact. */
export interface HeldForBooking {
  /** Serialised holds — one row per physical unit, `qty` 1 each. */
  readonly units: number
  /** Product-level holds — one row per line remainder, whatever its qty. */
  readonly quantityHolds: number
  /** Σ `qty` across those product-level rows — items of bulk stock held. */
  readonly quantityReserved: number
}

/**
 * The live holds `0100`'s trigger wrote for a booking.
 *
 * Confirm used to report what it had written, because it did the writing. It no
 * longer writes anything, so the only honest source for "what is held" is the
 * table — read back after the transition committed, the same way `bookings.stage`
 * is re-read rather than assumed. A plan-derived number would be the app's
 * *intent*, and the trigger reserves from `booking_line_units` and the line
 * remainder, not from the plan: on a booking whose serials were swapped between
 * creation and confirm the two would differ, and the screen would be showing the
 * wrong one.
 *
 * Never throws. A booking that is confirmed is confirmed; failing the whole
 * action because the read-back of a display figure hiccuped would turn a
 * successful confirm into a reported failure, which is the worse error. The
 * zeroes are visible in the result and in the event either way.
 */
export async function readHeldForBooking(bookingId: string): Promise<HeldForBooking> {
  const { data, error } = await supabase
    .from('inventory_reservations')
    .select('asset_id, product_id, qty')
    .eq('booking_id', bookingId)
    .is('released_at', null)

  if (error) return { units: 0, quantityHolds: 0, quantityReserved: 0 }

  let units = 0
  let quantityHolds = 0
  let quantityReserved = 0
  for (const row of (data ?? []) as unknown as Array<{
    asset_id: string | null
    product_id: string | null
    qty: number
  }>) {
    if (row.asset_id !== null) {
      units += 1
      continue
    }
    if (row.product_id !== null) {
      quantityHolds += 1
      quantityReserved += row.qty
    }
  }
  return { units, quantityHolds, quantityReserved }
}
