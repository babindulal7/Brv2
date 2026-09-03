import { supabase } from '../supabase'
import { insertViaSourceSwitch } from '../dataAccess'
import { newClientUuid } from '../supabase'
import { getSetting } from '../settingsStore'
import { captureError } from '../monitoring'
import {
  selectUnitsForLine,
  explainShortfall,
  rankLeastUsed,
  unitStatesForRule,
  boundsForTurnaround,
  type BoundConvention,
  type RentalWindow,
  type UnitCandidate,
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

/** A booking line that needs physical units. */
export interface AssignableLine {
  readonly lineId: string
  readonly productId: string
  /** `booking_lines.description` — what the operator sees in a conflict message. */
  readonly label: string
  readonly qty: number
}

export interface AssignmentPlanLine {
  readonly line: AssignableLine
  readonly outcome: AssignmentOutcome
  /** Law 12: the inline, specific sentence. `null` when the line is fully covered. */
  readonly problem: string | null
}

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
function availabilityRules(): { disqualifyingStates: ReadonlySet<string>; bounds: BoundConvention } {
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
 * Live lines only — Law 3. A removed line is `voided_at`, never deleted, and a
 * voided line reserves nothing.
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
        reason: `${row.line_type} lines name no product, so no serial can be assigned to them here.`,
      })
      continue
    }
    assignable.push({ lineId: row.id, productId: row.product_id, label, qty: row.qty })
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
async function readCandidates(productIds: readonly string[]): Promise<Map<string, UnitCandidate[]>> {
  const byProduct = new Map<string, UnitCandidate[]>()
  if (productIds.length === 0) return byProduct

  const { data, error } = await supabase
    .from('product_units_v')
    .select('id, asset_tag, serial_no, product_id, status, retired_at')
    .in('product_id', [...new Set(productIds)])
    .order('asset_tag', { ascending: true })

  if (error) throw new Error(`Could not read the equipment units, so nothing was assigned: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{
    id: string
    asset_tag: string
    serial_no: string | null
    product_id: string
    status: string
    retired_at: string | null
  }>) {
    const list = byProduct.get(row.product_id) ?? []
    list.push({
      unitId: row.id,
      assetTag: row.asset_tag,
      serialNo: row.serial_no,
      productId: row.product_id,
      state: row.status,
      retiredAt: row.retired_at,
    })
    byProduct.set(row.product_id, list)
  }

  return byProduct
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
async function readHolds(bookingIdToExclude: string | null): Promise<UnitHold[]> {
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
export async function planAssignment(bookingRef: string): Promise<AssignmentPlan> {
  const booking = await readWindow(bookingRef)
  const window: RentalWindow = { fromAd: booking.pickup_at, toAd: booking.return_at }

  const { assignable, skipped } = await readLines(booking.id)
  const [candidatesByProduct, holds] = await Promise.all([
    readCandidates(assignable.map((line) => line.productId)),
    readHolds(booking.id),
  ])

  /* Units taken by an earlier line in THIS plan are not available to a later
     one. Two lines for the same product on one booking must not both be handed
     the same camera — and nothing in the database would catch that until the
     second reservation hit the exclusion. */
  const claimed = new Set<string>()
  const lines: AssignmentPlanLine[] = []

  /* Read ONCE per plan, not once per line: a rule that changed mid-loop would
     assign the first two lines under one policy and the rest under another, and
     the resulting booking would be explicable by nothing. */
  const rules = availabilityRules()

  for (const line of assignable) {
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
    lines.push({ line, outcome, problem: explainShortfall(outcome, line.label) })
  }

  return {
    bookingId: booking.id,
    bookingNo: booking.booking_no,
    window,
    bounds: rules.bounds,
    lines,
    complete: lines.every((entry) => entry.outcome.shortfall === 0),
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
      `${plan.bookingNo} cannot be confirmed: not every line has units free for these dates. ${problems.join(' ')}`,
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

export interface ReservationResult {
  readonly reservationIds: readonly string[]
  readonly units: number
}

/**
 * Writes the plan as `inventory_reservations` rows.
 *
 * **Refuses an incomplete plan outright.** `0003:1478` states the rule this
 * implements: *"If reservation fails on any line, Confirm is rejected with the
 * conflicting line named."* Reserving three of four units and letting Confirm
 * proceed would put a booking into Booked — *"Committed. Gear reserved,
 * calendar held, serials assigned"* — while a line has no gear behind it.
 *
 * ## ⚠ This is not one transaction, and cannot be from a browser
 *
 * PostgREST gives a client no transaction, so the rows go in one at a time. If
 * the exclusion rejects one — another operator reserving the same unit in the
 * seconds since the plan was read, which the plan *cannot* prevent and is
 * exactly why the constraint is the arbiter — the rows already written are
 * **released** (`released_at` + reason, never deleted: Law 3) and the whole
 * assignment is reported as not made.
 *
 * That compensation is honest but it is not atomicity: a failure *during* the
 * release leaves live holds behind. `released_reason` names them so they are
 * findable rather than mysterious. The real fix is the same one PLAN.md already
 * records for booking creation — a Postgres function doing this server-side in
 * one transaction. TODO(decision) is not the right marker here: nothing is
 * unruled, it is simply unbuilt.
 */
export async function reserveAssignedUnits(
  plan: AssignmentPlan,
  ctx: { userId: string },
): Promise<ReservationResult> {
  if (!plan.complete) throw new AssignmentIncompleteError(plan)

  /* The plan's own convention, not a fresh settings read — see `AssignmentPlan.bounds`. */
  const period = toTstzRangeLiteral(plan.window, plan.bounds)
  const written: string[] = []

  try {
    for (const entry of plan.lines) {
      for (const unit of entry.outcome.assigned) {
        const { data, error } = await insertViaSourceSwitch('inventory_reservations', {
          client_uuid: newClientUuid(),
          booking_id: plan.bookingId,
          booking_line_id: entry.line.lineId,
          asset_id: unit.unitId,
          qty: 1,
          period,
          created_by: ctx.userId,
        } as never)

        if (error) {
          throw new Error(
            `${unit.assetTag} could not be reserved for ${plan.bookingNo}: ${error.message}. ` +
              'Another booking may have taken it since this plan was read.',
          )
        }
        const id = (data as { id?: unknown } | null)?.id
        if (typeof id === 'string') written.push(id)
      }
    }
  } catch (failure) {
    await releaseReservations(written, `Rolled back: ${plan.bookingNo} assignment failed part-way.`)
    throw failure
  }

  return { reservationIds: written, units: written.length }
}

/**
 * Law 3 — a reservation is released, never deleted. `0003:1485`: *"Set by
 * Cancel. The row remains — released, never deleted."*
 *
 * Best-effort by construction: it is called from a failure path, and throwing
 * here would replace the real error with a second one. Each failure is logged
 * with the row id so a live hold left behind is findable.
 */
export async function releaseReservations(reservationIds: readonly string[], reason: string): Promise<void> {
  for (const id of reservationIds) {
    const { error } = await supabase
      .from('inventory_reservations')
      .update({ released_at: new Date().toISOString(), released_reason: reason })
      .eq('id', id)

    if (error) {
      captureError(error, { where: 'availability.releaseReservation', id })
    }
  }
}
