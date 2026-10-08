/**
 * # Availability Engine — Law 1, Law 7
 *
 * PLAN.md Phase 3 lists this as a named gap: *"no stock/availability validator —
 * nothing checks requested qty against available units for a date window, so the
 * UI cannot warn before the GiST constraint rejects."* This is that module.
 *
 * ## Why it is pure, and what it deliberately does not do
 *
 * No IO, no Supabase, no clock. It takes the rows and answers the question, the
 * same shape as `lib/money.ts` and `lib/workflow.ts` — so it can be driven by
 * execution in a test rather than believed from a reading, and so the same rule
 * serves the inline conflict check on the booking workspace, the Confirm-time
 * assignment, and any later calendar view without three copies drifting apart.
 *
 * It does **not** decide where an assignment is written. `booking_line_units`
 * has no overlap protection of any kind (checked live 16 Aug 2026: its only
 * constraints are `qty > 0`, the Missing-needs-reason CHECK, the packed-needs-
 * time CHECK, and FKs), while `inventory_reservations` carries the real
 * defence — `exclude using gist (asset_id with =, period with &&) where
 * (released_at is null and asset_id is not null)`. Which of those a Confirm may
 * write is an open question, not this file's to settle. See PLAN.md §4.30.
 *
 * ## The two inputs this engine still refuses to default
 *
 * `disqualifyingStates` and `bounds` are **required parameters with no
 * default** on every entry point. Both were `TODO(decision)` when this file was
 * written and **both were ruled on 16 Aug 2026** (PLAN.md §4.30), so the answers
 * now exist as `DISQUALIFYING_UNIT_STATES` and `RENTAL_WINDOW_BOUNDS` below.
 *
 * They stay required anyway. A ruled answer is a fact about *this product*, not
 * about overlap arithmetic, and keeping it at the call site means:
 *
 *  - a test can state the other convention without fighting the module — which
 *    is how both answers to the touching-endpoint case come to be pinned, so
 *    re-ruling §4.30(b) is a one-constant change against a test that already
 *    says what will happen;
 *  - a future caller with a genuinely different rule (a maintenance-planning
 *    view that *wants* to see units in Cleaning, say) does not have to defeat a
 *    default to get an honest answer.
 *
 * The rule is imported, never re-typed. Passing a literal `new Set([...])` from
 * application code is how §4.14 ends up with two answers again.
 *
 * ## Law 7
 *
 * Every instant crossing this boundary is an AD/UTC ISO string, matching
 * `bookings.pickup_at` / `return_at` (`timestamptz not null`). BS is a
 * rendering concern and never reaches this file. Instants are compared as
 * numbers via `Date.parse`, never as strings — `'2026-08-16T00:00:00+05:45'`
 * and `'2026-08-15T18:15:00Z'` are the same moment and sort differently as
 * text.
 */

/**
 * A rental window in AD/UTC. Both ends required: `bookings.pickup_at` and
 * `return_at` are `not null` on the live table, so a window with an open end is
 * not a state the database can produce.
 *
 * ⚠ `actual_return_at` is deliberately not part of this type. Whether gear back
 * early frees its unit early — and whether that should be visible to a booking
 * being confirmed now — is a product question nobody has asked. A caller that
 * wants that behaviour passes the shorter window explicitly and owns the
 * decision at the call site, where it is legible.
 */
export interface RentalWindow {
  /** `bookings.pickup_at` — full ISO instant carrying an offset. */
  readonly fromAd: string
  /** `bookings.return_at` — full ISO instant carrying an offset. */
  readonly toAd: string
}

/**
 * How the ends of a window are treated when two of them touch.
 *
 * - `half-open` — `[from, to)`. A window ending exactly when another begins
 *   does NOT conflict. Postgres's default `tstzrange` convention.
 * - `closed` — `[from, to]`. Touching windows DO conflict. What
 *   `crew_bookings_no_double_booking` chose for people.
 *
 * ✅ Ruled for rentals in PLAN.md §4.30(b) — see `RENTAL_WINDOW_BOUNDS`. Still
 * required at every entry point below, so a caller states which it means.
 */
export type BoundConvention = 'half-open' | 'closed'

/**
 * ✅ **Ruled 16 Aug 2026 — PLAN.md §4.30(b): `half-open`.**
 *
 * A booking ending at 18:00 frees its unit for one starting at 18:00.
 *
 * ⚠ Taken *against* the recommendation put to the ruling, which argued for
 * `closed` on the grounds that `crew_bookings_no_double_booking` and
 * `crew_leaves_no_overlapping_leave` both chose `'[]'` inside this same schema,
 * and that return, inspection and cleaning physically have to happen between two
 * rentals. It was ruled the other way deliberately. **Do not "correct" this to
 * match `crew_bookings` on the assumption it was an oversight** — the
 * disagreement between the two is now intentional: people and gear turn around
 * differently.
 *
 * Every entry point still takes `bounds` explicitly. This constant is what the
 * app passes; it is not a default, so a test can state the other convention
 * without fighting the module, and `availability.test.ts` pins both answers.
 */
export const RENTAL_WINDOW_BOUNDS: BoundConvention = 'half-open'

/**
 * ✅ **Ruled 16 Aug 2026 — PLAN.md §4.30(c), closing §4.14** (open since 11 Aug).
 *
 * The `inventory_state` values that take a unit out of the pool regardless of
 * dates. Three of the locked ten.
 *
 * **Why the booking-lifecycle four are deliberately absent.** `Reserved`,
 * `Packed`, `On Rent` and `Returning` describe where a unit is *today*. The
 * date-overlap check already answers the only question that matters for a
 * future window — is this unit promised to someone else *then* — so listing
 * them here would make a camera that is out on rent this week unassignable for
 * a shoot three months away. `0003:1481` is about the same distinction from the
 * other side: *"an item reserved for Thursday is not available on Thursday"* —
 * on Thursday, not forever.
 *
 * **`Inspection` and `Cleaning` are the soft edge.** They stay assignable on the
 * stated assumption that those queues clear before a future pickup. That is the
 * part of this ruling most likely to need revisiting; revisiting it is one entry
 * in this set.
 *
 * `Retired` is listed for completeness and is belt-and-braces: `isRetired`
 * already refuses on the `retired_at` column, which is the authority.
 */
export const DISQUALIFYING_UNIT_STATES: ReadonlySet<string> = new Set(['Maintenance', 'Missing', 'Retired'])

/* ── Settings-driven rules ───────────────────────────────────────────────────
 *
 * Both rulings above became Settings keys on 16 Aug 2026 (`unitAvailabilityRule`,
 * `rentalTurnaround`), so the owner can change them without a release. The
 * *mapping* from a stored label to what this engine does lives HERE and not in
 * `lib/settingsStore.ts`, because it is business logic and Law 1 keeps that out
 * of a registry as firmly as it keeps it out of a page.
 *
 * This file still imports nothing and touches no storage. It exposes the
 * lookups; `lib/queries/availability.ts` — which is already the IO layer — reads
 * the setting and calls them. That is what lets the engine stay drivable by
 * execution in a test with no `window`, no localStorage and no stubbing.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * What each `unitAvailabilityRule` option means, as a state set.
 *
 * The three presets are the three that were reasoned about when §4.30(c) was
 * ruled, kept in that form so the setting reads as a decision rather than as
 * ten tick-boxes over an enum:
 *
 *  - **Condition only** (ruled default) — a unit is out only if it is broken,
 *    lost or retired. Inspection and Cleaning stay assignable, on the stated
 *    assumption those queues clear before a future pickup.
 *  - **Condition and turnaround** — also holds back units in Inspection or
 *    Cleaning. For a floor where those queues genuinely run long.
 *  - **Only In Stock** — the strictest reading. Note it double-counts the
 *    date-overlap check: a unit On Rent *today* becomes unassignable for a
 *    booking three months out, so utilisation drops sharply. Offered because it
 *    is a defensible choice, not because it is recommended.
 *
 * ⚠ No preset contains `Reserved`, `Packed`, `On Rent` or `Returning` except
 * the strict one, and that is the whole design — see `DISQUALIFYING_UNIT_STATES`.
 */
export const UNIT_AVAILABILITY_PRESETS: Readonly<Record<string, ReadonlySet<string>>> = {
  'Condition only': DISQUALIFYING_UNIT_STATES,
  'Condition and turnaround': new Set(['Maintenance', 'Missing', 'Retired', 'Inspection', 'Cleaning']),
  'Only In Stock': new Set([
    'Reserved',
    'Packed',
    'On Rent',
    'Returning',
    'Inspection',
    'Cleaning',
    'Maintenance',
    'Missing',
    'Retired',
  ]),
}

/**
 * Resolves a stored `unitAvailabilityRule` label to its state set.
 *
 * **Falls back to the ruled default rather than to an empty set.** An unknown
 * label — a spec renamed, a hand-edited localStorage, a setting written by an
 * older build — must not silently mean "nothing disqualifies a unit", which
 * would put gear in Maintenance onto a shoot. Failing to the ruled answer is
 * the safe direction and the honest one.
 */
export function unitStatesForRule(label: string): ReadonlySet<string> {
  return UNIT_AVAILABILITY_PRESETS[label] ?? DISQUALIFYING_UNIT_STATES
}

/**
 * Resolves a stored `rentalTurnaround` label to a bound convention.
 *
 * `'Turnaround required'` is the *cautious* option, so it is the one an unknown
 * label must NOT fall through to silently — but neither may an unknown label
 * quietly tighten availability either. It falls back to `RENTAL_WINDOW_BOUNDS`,
 * the ruled answer, for the same reason `unitStatesForRule` does: the ruling is
 * the defined behaviour, and an unrecognised string is a bug to be surfaced by
 * behaviour matching the spec, not a third silent mode.
 */
export function boundsForTurnaround(label: string): BoundConvention {
  if (label === 'Turnaround required') return 'closed'
  if (label === 'Same-instant handover allowed') return 'half-open'
  return RENTAL_WINDOW_BOUNDS
}

/** An existing hold on one physical unit, for a window. */
export interface UnitHold {
  /** `product_units.id`. */
  readonly unitId: string
  /** The booking holding it — carried so a conflict can be reported by name. */
  readonly bookingId: string
  /** `bookings.booking_no`, for the operator-facing sentence. */
  readonly bookingNo: string
  readonly window: RentalWindow
}

/** A physical unit offered to the picker. */
export interface UnitCandidate {
  /** `product_units.id`. */
  readonly unitId: string
  /** `product_units.asset_tag` — `not null`, and what the floor reads off the case. */
  readonly assetTag: string
  /** `product_units.serial_no` — nullable on the live table. */
  readonly serialNo: string | null
  /** `product_units.product_id`. */
  readonly productId: string
  /** `product_units.status`, an `inventory_state`. */
  readonly state: string
  /** `product_units.retired_at`. Non-null means retired — see `isRetired`. */
  readonly retiredAt: string | null
  /**
   * An OPEN `cleaning_queue_entries` row for this unit — `requires_reset` with
   * no `reset_completed_at` — or `null` when the unit is off the queue.
   *
   * **Why the queue and not `product_units.status`.** The obvious answer would
   * be an `inventory_state` of `'Cleaning'`, but `product_units` is
   * Booqable-mastered (`dataAccess.ts`'s `BOOQABLE_READ_ONLY_TABLES`) and the OS
   * may not write that column at all. `cleaning_queue_entries` is the OS's own
   * table, it is what Return fills and Reset stamps, and until this field
   * existed nothing read `reset_completed_at` — so completing a reset had no
   * consequence anywhere and unreset gear stayed bookable
   * (BUG_AUDIT_LIFECYCLE RS-02).
   */
  readonly openCleaning?: OpenCleaning | null
}

/** The queue entry holding a unit off the shelf, as the picker should say it. */
export interface OpenCleaning {
  /** The booking the gear came back from, for the sentence the picker prints. */
  readonly bookingNo: string | null
  /** True when the entry also still wants a clean — reported, not judged. */
  readonly requiresClean: boolean
}

/** Why a candidate was not assignable. Every rejection carries one. */
export type RejectionReason =
  | { readonly kind: 'retired'; readonly retiredAt: string }
  | { readonly kind: 'state'; readonly state: string }
  | { readonly kind: 'held'; readonly by: UnitHold }
  | { readonly kind: 'cleaning'; readonly by: OpenCleaning }

export interface RejectedCandidate {
  readonly unitId: string
  readonly assetTag: string
  readonly reason: RejectionReason
}

export interface AssignmentOutcome {
  /** Units to assign, in the order the candidates were offered. Length ≤ `needed`. */
  readonly assigned: readonly UnitCandidate[]
  /** `needed − assigned.length`. Zero means the line is fully covered. */
  readonly shortfall: number
  /** Every candidate that was not assigned, each with the reason. */
  readonly rejected: readonly RejectedCandidate[]
}

/**
 * A full ISO instant that CARRIES ITS OFFSET.
 *
 * The same guard, for the same reason, as `actions/rentals/confirmRental.ts`'s
 * `ISO_INSTANT_RE`, and it is here because a test caught this file without it.
 * `Date.parse` alone is not the check, twice over:
 *
 *  - it accepts `'16 Aug'` — returning a valid instant in **2001** — so a
 *    `Number.isNaN` guard passes junk straight through and answers it;
 *  - it reads `'2026-08-16T09:00:00'` (no offset) as the **device's local**
 *    time, which is harmless on a Kathmandu machine and 5h45m out on one set to
 *    Auckland. Availability is decided by comparing instants, so a window
 *    skewed by 5h45m silently frees or blocks units around every boundary.
 *
 * Law 7: AD is stored and compared in UTC. An instant without an offset is not
 * an instant, and this engine will not guess which one was meant.
 */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/

/** Millisecond value of an AD/UTC instant, or `NaN`. */
function instant(iso: string): number {
  return Date.parse(iso)
}

function isInstant(iso: string): boolean {
  return ISO_INSTANT_RE.test(iso) && !Number.isNaN(Date.parse(iso))
}

/**
 * Throws on a window the caller cannot have meant.
 *
 * A silently-inverted window (`to` before `from`) overlaps nothing under either
 * convention, so it would report *everything* available — the failure direction
 * that puts one camera on two shoots. It is refused rather than answered.
 */
function assertWindow(window: RentalWindow, label: string): void {
  if (!isInstant(window.fromAd) || !isInstant(window.toAd)) {
    throw new Error(
      `${label} is not a pair of AD/UTC instants carrying an offset (Law 7): ` +
        `${JSON.stringify(window.fromAd)} → ${JSON.stringify(window.toAd)}. An instant without an offset ` +
        "would be read as the device's local time, which shifts every boundary by the device's zone. " +
        'Nothing was checked.',
    )
  }

  const from = instant(window.fromAd)
  const to = instant(window.toAd)

  if (to < from) {
    throw new Error(
      `${label} ends before it begins (${window.fromAd} → ${window.toAd}). An inverted window overlaps ` +
        'nothing, so answering it would report every unit free. Nothing was checked.',
    )
  }
}

/**
 * Do two rental windows overlap?
 *
 * The one rule the rest of the file is built on. Two windows overlap unless one
 * ends before the other begins — and `bounds` decides whether *exactly at* the
 * boundary counts as "before".
 *
 * A zero-length window (`from === to`) is a real case: a same-instant pickup and
 * return. Under `half-open` it is empty and conflicts with nothing, which is the
 * standard range semantics and is left as-is rather than special-cased, because
 * a booking of no duration is a data defect to surface elsewhere, not a conflict
 * to invent here.
 */
export function windowsOverlap(a: RentalWindow, b: RentalWindow, bounds: BoundConvention): boolean {
  assertWindow(a, 'The requested window')
  assertWindow(b, 'The existing hold window')

  const aFrom = instant(a.fromAd)
  const aTo = instant(a.toAd)
  const bFrom = instant(b.fromAd)
  const bTo = instant(b.toAd)

  return bounds === 'closed' ? aFrom <= bTo && bFrom <= aTo : aFrom < bTo && bFrom < aTo
}

/**
 * `product_units.retired_at` is the terminal fact, and it is a column rather
 * than an enum member, so it needs no §4.14 ruling to act on:
 * `product_units_retirement_requires_reason` makes retirement a deliberate,
 * reasoned, three-column act, and §4.14 itself says a retired unit "is plainly
 * not rentable".
 *
 * The `Retired` *state* is NOT read here. The column is the authority; a state
 * value that disagrees with it is a data defect, and `disqualifyingStates` can
 * name `Retired` as well without changing this outcome.
 */
export function isRetired(unit: UnitCandidate): boolean {
  return unit.retiredAt !== null
}

/** Every hold that would collide with `window` on `unitId`. */
export function conflictingHolds(
  unitId: string,
  window: RentalWindow,
  holds: readonly UnitHold[],
  bounds: BoundConvention,
): readonly UnitHold[] {
  return holds.filter((hold) => hold.unitId === unitId && windowsOverlap(window, hold.window, bounds))
}

export interface SelectUnitsInput {
  /** How many physical units this line needs — `booking_lines.qty`. */
  readonly needed: number
  /** The window to assign for, normally the booking's `pickup_at`…`return_at`. */
  readonly window: RentalWindow
  /**
   * Units of the right product, in the order they should be preferred. Order is
   * the caller's: this engine assigns first-fit and does not rank, because
   * *which* free unit to prefer (least-used? nearest bin? newest?) is a product
   * question nobody has answered, and inventing a ranking here would bury it.
   */
  readonly candidates: readonly UnitCandidate[]
  /** Live holds on any of those units. Released and voided holds must be filtered out by the caller (Law 3). */
  readonly holds: readonly UnitHold[]
  /**
   * The `inventory_state` values that take a unit out of the pool. Required, no
   * default. Application code passes `DISQUALIFYING_UNIT_STATES` — the set ruled
   * in PLAN.md §4.30(c) — and does not re-type its members.
   */
  readonly disqualifyingStates: ReadonlySet<string>
  /**
   * Required, no default. Application code passes `RENTAL_WINDOW_BOUNDS` — ruled
   * `half-open` in PLAN.md §4.30(b). See `BoundConvention`.
   */
  readonly bounds: BoundConvention
}

/**
 * Least-used-first ordering of candidates — **D5, ruled 30 Aug 2026**.
 *
 * The 27 Jul lock ("least-used unit auto-reserved at creation") stands, and
 * this is its one implementation: candidates sorted by how many times each
 * unit has ever been assigned (`booking_line_units` rows carrying its
 * `asset_id`), fewest first. `selectUnitsForLine` deliberately assigns
 * first-fit in the caller's order — its doc note says *which* free unit to
 * prefer "is a product question nobody has answered". D5 answered it; this
 * function is the answer, kept separate so the assignment rule and the
 * preference rule stay individually testable.
 *
 * The sort is STABLE: units with equal usage keep the caller's order, which
 * `queries/availability.ts` supplies as `asset_tag` ascending — so two
 * never-used units are picked in tag order, deterministically.
 *
 * A unit absent from `usageByUnit` counts as never used. That is the honest
 * reading of "no rows found", and it is also the D5-safe direction: an
 * over-counted unit is merely passed over, an under-counted one merely picked
 * — neither double-books anything, because holds are checked separately.
 */
export function rankLeastUsed(
  candidates: readonly UnitCandidate[],
  usageByUnit: ReadonlyMap<string, number>,
): UnitCandidate[] {
  return candidates
    .map((unit, index) => ({ unit, index, used: usageByUnit.get(unit.unitId) ?? 0 }))
    .sort((a, b) => a.used - b.used || a.index - b.index)
    .map((entry) => entry.unit)
}

/**
 * First-fit assignment of physical units to one booking line.
 *
 * **Never partially lies.** A caller asking for 4 and receiving 2 gets
 * `shortfall: 2` and the reason each rejected candidate failed — it does not
 * receive a short list that looks complete. `seed.ts:762-770` refused to
 * generate assignments at all rather than emit ones it could not stand behind;
 * this is the same rule expressed as a return type.
 *
 * A unit already assigned earlier in this same call cannot be picked twice: it
 * is removed from the pool as it is taken, so one free unit never covers a
 * `qty: 2` line.
 */
export function selectUnitsForLine(input: SelectUnitsInput): AssignmentOutcome {
  const { needed, window, candidates, holds, disqualifyingStates, bounds } = input

  if (!Number.isInteger(needed) || needed < 1) {
    throw new Error(
      `A line needs at least one unit; received ${JSON.stringify(needed)}. ` +
        '`booking_lines` carries `qty > 0` at the database (Law 9). Nothing was assigned.',
    )
  }
  assertWindow(window, 'The booking window')

  const assigned: UnitCandidate[] = []
  const rejected: RejectedCandidate[] = []
  const taken = new Set<string>()

  for (const unit of candidates) {
    if (assigned.length === needed) break
    if (taken.has(unit.unitId)) continue

    if (isRetired(unit)) {
      /* `retiredAt` is non-null inside this branch — `isRetired` is exactly that
         test — but the compiler cannot carry that through a function boundary
         under `strict`, so it is re-read rather than asserted. */
      rejected.push({
        unitId: unit.unitId,
        assetTag: unit.assetTag,
        reason: { kind: 'retired', retiredAt: unit.retiredAt ?? '' },
      })
      continue
    }

    if (disqualifyingStates.has(unit.state)) {
      rejected.push({ unitId: unit.unitId, assetTag: unit.assetTag, reason: { kind: 'state', state: unit.state } })
      continue
    }

    /*
     * The gear is physically on the reset bench, so it is not assignable —
     * regardless of the window, and that is the part still to rule.
     *
     * `TODO(decision)`: an open queue entry is a fact about TODAY, and §4.30(c)
     * settled that facts about today belong to the date-overlap check rather
     * than to a hard exclusion (which is why the four booking-lifecycle states
     * are not in `DISQUALIFYING_UNIT_STATES`). A reset has no expected
     * completion date anywhere in the schema, so there is no honest horizon to
     * compare a future window against — inventing one ("clean within a day")
     * would be inventing the rule. Until it is ruled this excludes the unit
     * outright, which is the direction that can only ever refuse a legal
     * booking; the other direction puts unreset gear on a shoot.
     */
    const cleaning = unit.openCleaning
    if (cleaning !== undefined && cleaning !== null) {
      rejected.push({ unitId: unit.unitId, assetTag: unit.assetTag, reason: { kind: 'cleaning', by: cleaning } })
      continue
    }

    const conflicts = conflictingHolds(unit.unitId, window, holds, bounds)
    const blocker = conflicts[0]
    if (blocker !== undefined) {
      rejected.push({ unitId: unit.unitId, assetTag: unit.assetTag, reason: { kind: 'held', by: blocker } })
      continue
    }

    assigned.push(unit)
    taken.add(unit.unitId)
  }

  return { assigned, shortfall: needed - assigned.length, rejected }
}

/**
 * The operator-facing sentence for a shortfall.
 *
 * Law 12 wants an inline, persistent, specific error rather than "no units
 * available". A conflict names the booking holding the unit, because that is
 * the one fact that tells the coordinator what to do next — call that client,
 * or pick different gear.
 */
export function explainShortfall(outcome: AssignmentOutcome, productName: string): string | null {
  if (outcome.shortfall === 0) return null

  const held = outcome.rejected.filter((r) => r.reason.kind === 'held')
  const unavailable = outcome.rejected.filter((r) => r.reason.kind !== 'held')

  const parts = [
    `${productName}: ${outcome.shortfall} more unit${outcome.shortfall === 1 ? '' : 's'} needed than are free ` +
      `for these dates (${outcome.assigned.length} assigned).`,
  ]

  for (const rejection of held) {
    if (rejection.reason.kind !== 'held') continue
    parts.push(`${rejection.assetTag} is held by ${rejection.reason.by.bookingNo}.`)
  }
  for (const rejection of unavailable) {
    if (rejection.reason.kind === 'retired') parts.push(`${rejection.assetTag} is retired.`)
    else if (rejection.reason.kind === 'state') parts.push(`${rejection.assetTag} is ${rejection.reason.state}.`)
    else if (rejection.reason.kind === 'cleaning') {
      const from = rejection.reason.by.bookingNo
      parts.push(
        `${rejection.assetTag} is on the reset bench${from === null ? '' : ` after ${from}`} and has not been ` +
          `${rejection.reason.by.requiresClean ? 'cleaned or ' : ''}reset yet.`,
      )
    }
  }

  return parts.join(' ')
}

/* ── QUANTITY-TRACKED STOCK — the other half of the schema ───────────────────
 *
 * Everything above answers the SERIALISED question: which physical unit goes on
 * which booking. `product_tracking_mode` (0001:505-509) has three values and two
 * of them — `Quantity` and `Consumable` — have no `product_units` rows at all
 * ("Governs whether product_units rows may exist", 0001:504). For those, "is it
 * free" is not a question about units; it is a question about a NUMBER.
 *
 * Until 7 Sep 2026 nothing here asked it, so a booking line naming bulk stock
 * resolved an empty candidate pool and Confirm refused it — on the live project
 * that is 204 of 204 products (INV-02).
 *
 * ## This mirrors a trigger that is already live
 *
 * `enforce_inventory_reservation_capacity()` — `0045_reservation_capacity_ceiling.sql`,
 * applied to the live project — is the arbiter, exactly as the GiST exclusion is
 * the arbiter for serial holds. It takes a `for update` lock on the `products`
 * row and refuses a hold whose PEAK CONCURRENT qty would exceed stock on hand.
 * This function is the app-side preview of that answer, so an operator gets a
 * sentence rather than a 400 — the same relationship `selectUnitsForLine` has
 * with the exclusion, and the same one `confirmRental` has with the stage
 * trigger. **It is not the defence.** Two operators pressing Confirm in the same
 * second are separated by the row lock in the database, never by this file.
 *
 * ## Peak concurrency, not a naive total — and why the arithmetic is copied
 *
 * Two holds of 100 each on a stock of 150 are perfectly legal if they do not
 * overlap, so summing every hold that touches the window would refuse a legal
 * booking. 0045 evaluates occupancy at a set of candidate instants and compares
 * the maximum; the candidates are the lower bounds of the overlapping live
 * holds, clamped to the new row's own period, and the new row is itself one of
 * them so its start is always in the set. The occupancy function only ever steps
 * UP at a hold's lower bound, so its maximum over the window is attained at one
 * of those instants or nowhere.
 *
 * That sweep is restated here, deliberately, rather than approximated. An app
 * preview that disagrees with the arbiter at the edges is worse than no preview:
 * it produces a green screen followed by a database refusal nobody can explain.
 * The one thing that must never drift is therefore written twice and pinned by
 * tests on both sides.
 *
 * ## Law 1
 *
 * Pure. No IO, no clock, no settings read. `bounds` and the numbers arrive from
 * `lib/queries/availability.ts`, which is the only module that touches storage,
 * for the same reasons stated at the top of this file.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * An existing live hold on a product's BULK stock, for a window.
 *
 * The quantity-mode sibling of `UnitHold`: `inventory_reservations` names either
 * an `asset_id` **or** a `product_id`, never both
 * (`inventory_reservations_serialised_xor_quantity`, 0003:1457-1459), and a
 * serial hold is additionally pinned to `qty = 1`
 * (`inventory_reservations_serialised_hold_is_one`). So a hold carrying a `qty`
 * above one is always this shape.
 *
 * `bookingNo` is carried for exactly the reason `UnitHold` carries it — a
 * conflict that names the booking holding the stock tells the coordinator what
 * to do next, which "unavailable" does not.
 */
export interface QuantityHold {
  /** `inventory_reservations.booking_id`. */
  readonly bookingId: string
  /** `bookings.booking_no`, for the operator-facing sentence. */
  readonly bookingNo: string
  /** `inventory_reservations.qty` — `> 0` at the database. */
  readonly qty: number
  readonly window: RentalWindow
}

/**
 * Why a quantity line could not be covered. Every refusal carries one, the same
 * contract `RejectionReason` holds for the serialised path.
 */
export type CapacityProblem =
  /** `products.total_quantity` is 0 — the product records no bulk stock at all. */
  | { readonly kind: 'no-stock' }
  /** More was asked for than the product owns, so no date frees it. */
  | { readonly kind: 'exceeds-stock'; readonly totalQuantity: number }
  /** One hold that was live at the peak instant. */
  | { readonly kind: 'held'; readonly by: QuantityHold }

export interface CapacityOutcome {
  /** `products.total_quantity` — the ceiling 0045 compares against. */
  readonly totalQuantity: number
  /** The largest qty held at any one instant inside the window, by OTHER holds. */
  readonly peakHeld: number
  /** `totalQuantity − peakHeld`, floored at 0. */
  readonly free: number
  readonly qtyRequested: number
  /** `qtyRequested − free`, floored at 0. Zero means the line is covered. */
  readonly shortfall: number
  /**
   * The instant the peak was attained, reported as it was supplied. `null` when
   * the window contains no instant at all — a zero-length window under
   * `half-open` is empty and holds nothing, which is Postgres's own range
   * semantics and is left as-is for the reason `windowsOverlap` gives.
   */
  readonly peakAtAd: string | null
  /** Empty exactly when `shortfall` is 0. */
  readonly problems: readonly CapacityProblem[]
}

export interface CapacityInput {
  /** The window to hold for, normally the booking's `pickup_at`…`return_at`. */
  readonly window: RentalWindow
  /**
   * Live holds drawing on this product's stock. Released holds must be filtered
   * out by the caller (Law 3), matching the trigger's `released_at is null`.
   *
   * For a Serialised product this must ALSO carry that product's serial holds as
   * `qty: 1` entries — 0045's `live` CTE unions both shapes, because a
   * model-level hold of 3 plus a serial hold on a fourth unit is 4 units
   * claimed. Passing only one shape would preview a ceiling the database does
   * not have.
   */
  readonly holds: readonly QuantityHold[]
  /** `products.total_quantity` — `integer not null default 0`, CHECK ≥ 0 (0004:97, :142). */
  readonly totalQuantity: number
  /** `booking_lines.qty` for this line. */
  readonly qtyRequested: number
  /**
   * Required, no default — the same rule every entry point above holds to.
   * Application code passes the value carried on the plan, which came from
   * `boundsForTurnaround`. See `BoundConvention`.
   */
  readonly bounds: BoundConvention
}

/**
 * Is `atAd` inside `window`? Postgres's `range @> timestamptz`.
 *
 * Split out and exported because it is the one place the bound convention
 * decides an INSTANT rather than an overlap, and 0045's sweep asks this question
 * at every candidate. Under `half-open` a window ending at 18:00 does not
 * contain 18:00 — the same ruling (§4.30(b)) that lets a booking ending at 18:00
 * free its stock for one starting at 18:00, seen from the other side.
 */
export function windowContains(window: RentalWindow, atAd: string, bounds: BoundConvention): boolean {
  assertWindow(window, 'The window')
  if (!isInstant(atAd)) {
    throw new Error(
      `${JSON.stringify(atAd)} is not an AD/UTC instant carrying an offset (Law 7). Nothing was checked.`,
    )
  }
  return containsMs(window, instant(atAd), bounds)
}

function containsMs(window: RentalWindow, atMs: number, bounds: BoundConvention): boolean {
  const from = instant(window.fromAd)
  const to = instant(window.toAd)
  return bounds === 'closed' ? from <= atMs && atMs <= to : from <= atMs && atMs < to
}

/**
 * How much of a product's bulk stock is free across `window`, and why not more.
 *
 * The quantity-mode counterpart of `selectUnitsForLine`, and it keeps that
 * function's contract: it **never partially lies**. A caller asking for 4 with 2
 * free receives `shortfall: 2` and the holds standing in the way, not a number
 * that looks like a yes.
 *
 * Refuses rather than answers on input it cannot have meant, for the reason
 * `assertWindow` gives: a wrong answer here is the direction that puts the same
 * cable on two shoots.
 */
export function capacityFor(input: CapacityInput): CapacityOutcome {
  const { window, holds, totalQuantity, qtyRequested, bounds } = input

  if (!Number.isInteger(qtyRequested) || qtyRequested < 1) {
    throw new Error(
      `A line needs at least one of a product; received ${JSON.stringify(qtyRequested)}. ` +
        'booking_lines carries `qty > 0` at the database (Law 9). Nothing was checked.',
    )
  }
  if (!Number.isInteger(totalQuantity) || totalQuantity < 0) {
    throw new Error(
      'Stock on hand must be a whole number of units at or above zero; received ' +
        `${JSON.stringify(totalQuantity)}. products.total_quantity is \`integer not null\` with a CHECK at ` +
        'or above 0 (0004:97, :142), so this is a failed read rather than a real stock level, and ' +
        'answering it would invent capacity. Nothing was checked.',
    )
  }
  assertWindow(window, 'The booking window')

  const overlapping: QuantityHold[] = []
  for (const hold of holds) {
    if (!Number.isInteger(hold.qty) || hold.qty < 1) {
      throw new Error(
        `${hold.bookingNo} holds ${JSON.stringify(hold.qty)} of this product, which is not a whole number ` +
          'above zero. inventory_reservations_qty_positive forbids it at the database, so this is a failed ' +
          'read — and a hold that cannot be counted is stock that would look free. Nothing was checked.',
      )
    }
    if (windowsOverlap(window, hold.window, bounds)) overlapping.push(hold)
  }

  /*
   * 0045's candidate set, restated: the lower bound of every overlapping live
   * hold that falls INSIDE this window, plus this window's own start — which is
   * the trigger's `NEW.period @> lower(l.period)` with NEW itself among `live`.
   * Occupancy only steps up at a lower bound, so the maximum is attained at one
   * of these or nowhere.
   */
  const candidates = new Set<number>()
  const start = instant(window.fromAd)
  if (containsMs(window, start, bounds)) candidates.add(start)
  for (const hold of overlapping) {
    const at = instant(hold.window.fromAd)
    if (containsMs(window, at, bounds)) candidates.add(at)
  }

  let peakHeld = 0
  let peakAt: number | null = null
  let peakHolds: readonly QuantityHold[] = []

  for (const at of candidates) {
    const live = overlapping.filter((hold) => containsMs(hold.window, at, bounds))
    const held = live.reduce((sum, hold) => sum + hold.qty, 0)
    if (peakAt === null || held > peakHeld) {
      peakHeld = held
      peakAt = at
      peakHolds = live
    }
  }

  const free = Math.max(0, totalQuantity - peakHeld)
  const shortfall = Math.max(0, qtyRequested - free)

  const problems: CapacityProblem[] = []
  if (shortfall > 0) {
    if (totalQuantity === 0) problems.push({ kind: 'no-stock' })
    else if (qtyRequested > totalQuantity) problems.push({ kind: 'exceeds-stock', totalQuantity })
    for (const hold of peakHolds) problems.push({ kind: 'held', by: hold })
  }

  return {
    totalQuantity,
    peakHeld,
    free,
    qtyRequested,
    shortfall,
    peakAtAd: peakAt === null ? null : instantSourceOf(peakAt, window, overlapping),
    problems,
  }
}

/**
 * The ISO text the peak instant arrived as, so nothing is re-serialised into a
 * third format — the same text/instant distinction the rest of this file keeps.
 * The fallback can only be reached if a candidate came from neither the window
 * nor a hold, which the construction above forbids.
 */
function instantSourceOf(atMs: number, window: RentalWindow, holds: readonly QuantityHold[]): string {
  if (instant(window.fromAd) === atMs) return window.fromAd
  for (const hold of holds) {
    if (instant(hold.window.fromAd) === atMs) return hold.window.fromAd
  }
  return new Date(atMs).toISOString()
}

/**
 * The operator-facing sentence for a quantity shortfall — Law 12's inline,
 * persistent, specific error, and the sibling of `explainShortfall`.
 *
 * Names the bookings holding the stock for the same reason that one does: it is
 * the fact that tells a coordinator what to do next. It does NOT restate 0045's
 * exception text — that message belongs to the database, arrives only when the
 * database refuses, and quoting it here would suggest the app had been refused
 * when it had not.
 */
export function explainCapacityShortfall(outcome: CapacityOutcome, productName: string): string | null {
  if (outcome.shortfall === 0) return null

  const parts = [
    `${productName}: ${outcome.shortfall} more needed than the stock free for these dates ` +
      `(${outcome.free} of ${outcome.totalQuantity} free, ${outcome.qtyRequested} asked for).`,
  ]

  for (const problem of outcome.problems) {
    if (problem.kind === 'no-stock') {
      parts.push(`${productName} records no stock on hand at all (Total Quantity is 0).`)
    } else if (problem.kind === 'exceeds-stock') {
      parts.push(
        `${outcome.qtyRequested} is more than the ${problem.totalQuantity} this product owns in total, ` +
          'so no date frees it.',
      )
    } else {
      parts.push(`${problem.by.bookingNo} holds ${problem.by.qty} over these dates.`)
    }
  }

  return parts.join(' ')
}

/* ── PREDICTIVE TURNAROUND BUFFERS (Pillar 1) ────────────────────────────────
 *
 * In high-demand rental logistics, gear returned requires turnaround time for
 * QA, sensor cleaning, battery recharging, cable coiling, and repacking before
 * going out again. Consecutive bookings for the same unit with insufficient gap
 * risk dispatching uninspected equipment.
 *
 * Like windowsOverlap, these functions are PURE: they take windows and millisecond
 * buffers and evaluate conflicts/gaps without I/O or database access.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface CategoryTurnaroundBuffer {
  readonly category: string
  readonly bufferMs: number
}

/** Standard category buffers: Heavy AV / LED Wall = 12h, Camera / Drone = 6h, Audio / Lighting = 4h */
export const DEFAULT_CATEGORY_TURNAROUND_BUFFERS: Readonly<Record<string, number>> = {
  'Heavy AV': 12 * 60 * 60 * 1000,
  'LED Wall': 12 * 60 * 60 * 1000,
  'Camera': 6 * 60 * 60 * 1000,
  'Drone': 6 * 60 * 60 * 1000,
  'Lighting': 4 * 60 * 60 * 1000,
  'Audio': 4 * 60 * 60 * 1000,
}

export function turnaroundBufferMsForCategory(category?: string | null): number {
  if (!category) return 0
  return DEFAULT_CATEGORY_TURNAROUND_BUFFERS[category] ?? 0
}

export interface TurnaroundBufferViolation {
  readonly unitId: string
  readonly bookingNo: string
  readonly requiredBufferMs: number
  readonly actualGapMs: number
  readonly priorWindow: RentalWindow
  readonly nextWindow: RentalWindow
}

/**
 * Does the gap between two non-overlapping windows violate a turnaround buffer?
 *
 * Windows that already overlap according to windowsOverlap are direct conflicts.
 * If they do not overlap, this checks whether the non-negative turnaround gap
 * between one ending and the other starting is strictly less than bufferMs.
 */
export function violatesTurnaroundBuffer(
  a: RentalWindow,
  b: RentalWindow,
  bufferMs: number,
): boolean {
  if (bufferMs <= 0) return false
  assertWindow(a, 'Window A')
  assertWindow(b, 'Window B')

  const aFrom = instant(a.fromAd)
  const aTo = instant(a.toAd)
  const bFrom = instant(b.fromAd)
  const bTo = instant(b.toAd)

  // If A finishes before or exactly when B begins
  if (aTo <= bFrom) {
    const gap = bFrom - aTo
    return gap < bufferMs
  }

  // If B finishes before or exactly when A begins
  if (bTo <= aFrom) {
    const gap = aFrom - bTo
    return gap < bufferMs
  }

  // Windows overlap in time — immediate conflict
  return true
}

/**
 * Finds all existing holds on a unit that violate a turnaround buffer when
 * evaluated against a proposed rental window.
 */
export function findTurnaroundBufferViolations(
  unitId: string,
  window: RentalWindow,
  holds: readonly UnitHold[],
  bufferMs: number,
): readonly TurnaroundBufferViolation[] {
  if (bufferMs <= 0) return []
  assertWindow(window, 'The candidate window')

  const violations: TurnaroundBufferViolation[] = []
  const wFrom = instant(window.fromAd)
  const wTo = instant(window.toAd)

  for (const hold of holds) {
    if (hold.unitId !== unitId) continue
    const hFrom = instant(hold.window.fromAd)
    const hTo = instant(hold.window.toAd)

    if (hTo <= wFrom) {
      const gap = wFrom - hTo
      if (gap < bufferMs) {
        violations.push({
          unitId,
          bookingNo: hold.bookingNo,
          requiredBufferMs: bufferMs,
          actualGapMs: gap,
          priorWindow: hold.window,
          nextWindow: window,
        })
      }
    } else if (wTo <= hFrom) {
      const gap = hFrom - wTo
      if (gap < bufferMs) {
        violations.push({
          unitId,
          bookingNo: hold.bookingNo,
          requiredBufferMs: bufferMs,
          actualGapMs: gap,
          priorWindow: window,
          nextWindow: hold.window,
        })
      }
    }
  }

  return violations
}

export function explainTurnaroundViolation(violation: TurnaroundBufferViolation, assetTag: string): string {
  const reqHours = (violation.requiredBufferMs / (3600 * 1000)).toFixed(1).replace(/\.0$/, '')
  const gapHours = (violation.actualGapMs / (3600 * 1000)).toFixed(1).replace(/\.0$/, '')
  return `${assetTag} has only ${gapHours}h turnaround gap with booking ${violation.bookingNo} (minimum recommended: ${reqHours}h).`
}

