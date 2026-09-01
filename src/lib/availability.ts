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
}

/** Why a candidate was not assignable. Every rejection carries one. */
export type RejectionReason =
  | { readonly kind: 'retired'; readonly retiredAt: string }
  | { readonly kind: 'state'; readonly state: string }
  | { readonly kind: 'held'; readonly by: UnitHold }

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
  }

  return parts.join(' ')
}
