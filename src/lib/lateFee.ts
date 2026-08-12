/**
 * # Late fees — the policy around the calculation
 *
 * **The calculation already exists.** `lib/money.ts:289` has `lateFee()`, with
 * the locked bands (≤30 min grace = 0 · <2h = half day · ≥2h = full day, plus
 * full days beyond) and `lib/__tests__/money.test.ts:399` already pins its three
 * boundaries. The 12 Aug spec said *"there is no `lateFee.ts` — the calculation
 * has no home yet"*; that was true when it was written and is not true now.
 * Duplicating the arithmetic here to satisfy the filename would create a second
 * source for a figure that goes on an invoice, so the calculation is
 * **re-exported**, not rewritten.
 *
 * What genuinely had no home is everything below: **the fee is a suggestion,
 * and a suggestion needs a decision.**
 *
 * ## Suggested, never applied
 *
 * Nothing here charges anybody. `lateFee()` returns a figure; a human then
 * either applies it or waives it, and this module is the gate that decision
 * passes through. An automatic charge would be the same class of mistake as a
 * success toast for a write that did not happen — the operator would discover
 * the money moved only when the client complained.
 *
 * ## Who may waive
 *
 * **Any staff member may raise a waiver; a Manager or Owner must approve it.**
 *
 * The first draft implemented "any staff, reason logged" on the 21 Jul
 * precedent, and flagged the asymmetry with Law 10 as PLAN.md §4.23 — a
 * discount above 10% needed a named approver while a waiver of the same rupee
 * value did not, and both give money away. **Ruled 12 Aug: not intended.** The
 * approver is now required, with no threshold; see `WAIVER_NEEDS_APPROVER`.
 */

import { lateFee, rupees, toRupees } from './money'
import type { LateFeeInput, LateFeeResult, Paisa } from './money'

export { lateFee }
export type { LateFeeInput, LateFeeResult }

/* ── what "one day's rate" means ───────────────────────────────────────── */

/**
 * How transport was sold on this booking.
 *
 * Both modes are real and a booking may use either — ruled 12 Aug 2026, closing
 * PLAN.md §4.24. A delivery run quoted once is `flat`; a vehicle held for the
 * duration is `per-day`.
 */
export type TransportBilling =
  | { kind: 'flat'; amountPaisa: Paisa }
  | { kind: 'per-day'; amountPaisa: Paisa }

export interface BookingDayRateInput {
  /** Booking total for equipment, across all rental days. */
  equipmentPaisa: Paisa
  /** Booking total for crew, across all rental days. */
  crewPaisa: Paisa
  transport: TransportBilling
  /** Rental days the totals above are spread over. At least 1. */
  rentalDays: number
}

export interface BookingDayRate {
  dayRatePaisa: Paisa
  /** Rendered under the figure so the operator sees which reading produced it. */
  basis: string
}

/**
 * One day of a booking's value — **the whole booking**, ruled 12 Aug 2026.
 *
 * `money.ts`'s `LateFeeInput` note said no function anywhere in `src/`
 * aggregated this, and that the scope was unruled. This is that function, and
 * the ruling is: equipment **and** crew **and** transport. A client who keeps
 * the kit an extra day keeps the crew and, if the vehicle was billed daily, the
 * vehicle too.
 *
 * ## Why a flat transport charge contributes nothing
 *
 * That is what *flat* means. A delivery quoted once as a single run does not
 * happen a second time because the return was late — nothing was dispatched
 * again. Billing a third of it as part of an extra day would be charging a
 * fraction of a journey nobody made.
 *
 * A `per-day` transport charge is the opposite case and passes straight
 * through: the vehicle was held, and it was held one day longer.
 *
 * Equipment and crew are booking **totals**, so they divide by the rental days
 * to get a daily share. Transport per-day is **already** daily, so it does not.
 */
export function bookingDayRate(i: BookingDayRateInput): BookingDayRate {
  const days = Math.max(1, Math.floor(i.rentalDays))
  const perDayEquipment = toRupees(i.equipmentPaisa) / days
  const perDayCrew = toRupees(i.crewPaisa) / days
  const perDayTransport = i.transport.kind === 'per-day' ? toRupees(i.transport.amountPaisa) : 0

  const parts = [`equipment ÷ ${days}`, `crew ÷ ${days}`]
  parts.push(
    i.transport.kind === 'per-day'
      ? 'transport (billed per day, so it recurs)'
      : 'transport excluded — billed flat, and a flat run does not happen twice',
  )

  return {
    dayRatePaisa: rupees(perDayEquipment + perDayCrew + perDayTransport),
    basis: parts.join(' · '),
  }
}

/* ── the waiver ────────────────────────────────────────────────────────── */

/** The floor a waiver reason has to clear. Same length Law 10 uses for a discount reason. */
export const WAIVER_REASON_MIN = 10

/**
 * A waiver needs a named approver — ruled 12 Aug 2026, closing PLAN.md §4.23.
 *
 * The earlier rule was "any staff, reason logged", on the 21 Jul precedent that
 * any staff may release gear after an unpaid-advance warning. §4.23 asked
 * whether that asymmetry with Law 10 was intended, given a discount above 10%
 * needs a named approver and a waiver of the same rupee value did not.
 *
 * **It was not.** Both give money away, so both need a name against the
 * decision. The symmetry is now exact in kind:
 *
 * | | Reason ≥10 chars | Named approver |
 * |---|---|---|
 * | Discount > 10% | yes | yes |
 * | Late-fee waiver | yes | **yes** |
 *
 * Deliberately **no threshold**. Law 10's gate is a *percentage*, and a waiver
 * has no base to take a percentage of — the only non-arbitrary line is "all of
 * them". Picking a rupee figure here would be inventing the decision that §4.23
 * was asked to settle.
 */
export const WAIVER_NEEDS_APPROVER = true

export type LateFeeDecision = 'Apply' | 'Waive'

export interface LateFeeWaiverInput {
  /** Who is waiving. The name is what makes the log worth keeping. */
  staffName: string
  reason: string
  /**
   * The Manager or Owner who authorised it. Required — see
   * `WAIVER_NEEDS_APPROVER` below.
   */
  approverName?: string
}

export interface LateFeeOutcome {
  decision: LateFeeDecision
  /** What is actually charged. Zero on a waiver — the suggestion is not a debt. */
  chargedPaisa: Paisa
  /** The figure that was suggested, kept whatever the decision. A waiver of Rs 6,000 is not the same event as a Rs 0 fee. */
  suggestedPaisa: Paisa
  waiver?: { staffName: string; reason: string; approverName: string }
}

export interface WaiverValidation {
  valid: boolean
  error: string | null
}

/**
 * A waiver needs a name and a reason of at least ten characters.
 *
 * The length is not bureaucracy: "ok", "fine" and "waived" are the reasons that
 * make an audit trail useless six months later, when somebody is asking why
 * this client was not charged and that one was.
 */
export function validateWaiver(i: LateFeeWaiverInput): WaiverValidation {
  if (!i.staffName.trim()) {
    return { valid: false, error: 'A waiver is recorded against a name. Sign in before waiving.' }
  }
  const reason = i.reason.trim()
  if (reason.length < WAIVER_REASON_MIN) {
    return {
      valid: false,
      error: `Say why this fee is being waived — at least ${WAIVER_REASON_MIN} characters. It is read months later by someone asking why this client was not charged.`,
    }
  }
  if (WAIVER_NEEDS_APPROVER && !(i.approverName ?? '').trim()) {
    return {
      valid: false,
      error: 'Name the Manager or Owner who authorised this waiver. Giving money away needs the same approval whichever direction it goes.',
    }
  }
  return { valid: true, error: null }
}

/**
 * Turns a computed fee plus a human decision into what is actually charged.
 *
 * Throws on an invalid waiver rather than silently charging or silently
 * waiving — a caller that ignores `validateWaiver` should fail loudly, not pick
 * one of the two outcomes on the operator's behalf.
 */
export function settleLateFee(result: LateFeeResult, decision: LateFeeDecision, waiver?: LateFeeWaiverInput): LateFeeOutcome {
  if (decision === 'Apply') {
    return { decision, chargedPaisa: result.feePaisa, suggestedPaisa: result.feePaisa }
  }

  if (!waiver) {
    throw new Error('A waiver needs a name and a written reason — call validateWaiver first.')
  }
  const check = validateWaiver(waiver)
  if (!check.valid) throw new Error(check.error ?? 'Invalid waiver.')

  return {
    decision,
    chargedPaisa: rupees(0),
    suggestedPaisa: result.feePaisa,
    waiver: {
      staffName: waiver.staffName,
      reason: waiver.reason.trim(),
      approverName: (waiver.approverName ?? '').trim(),
    },
  }
}

export interface LateBand {
  overageMinutes: number
  band: LateFeeResult['band']
  fullDaysCharged: number
}

/**
 * The band and the overage, **with no monetary value anywhere in the result**.
 *
 * This exists for `ReturnWorkspace.tsx`, which is the Warehouse's screen and
 * whose header states the constraint plainly: *"No money, anywhere. Foundation
 * §8.3 … `lib/money.ts` is not imported; no Rs figure appears."* The floor still
 * needs to know a return ran four hours over and that a full day is chargeable
 * — that is operational, and a band name is a unit of rental time rather than a
 * monetary value.
 *
 * It delegates to `lateFee` with a zero rate rather than restating the
 * thresholds, so the boundaries cannot drift from the ones `money.test.ts`
 * pins.
 */
export function lateBand(scheduledReturnAt: Date, actualReturnAt: Date): LateBand {
  const { overageMinutes, band, fullDaysCharged } = lateFee({
    scheduledReturnAt,
    actualReturnAt,
    dayRatePaisa: rupees(0),
  })
  return { overageMinutes, band, fullDaysCharged }
}

/** The chargeable consequence in words, still without a figure. For money-blind screens. */
export function bandConsequence(b: LateBand): string {
  switch (b.band) {
    case 'None':
      return 'Within the 30-minute grace period — nothing chargeable.'
    case 'Half Day':
      return 'Half a rental day is chargeable. Finance decides whether to apply it.'
    case 'Full Day':
      return b.fullDaysCharged === 1
        ? 'A full rental day is chargeable. Finance decides whether to apply it.'
        : `${b.fullDaysCharged} full rental days are chargeable. Finance decides whether to apply them.`
  }
}

/**
 * "3h 20m late" — the phrasing the Return panel leads with.
 *
 * Deliberately not a date. The operator is deciding about a duration, and a
 * timestamp makes them do the subtraction the screen should have done.
 */
export function formatOverage(minutes: number): string {
  const whole = Math.floor(minutes)
  if (whole <= 0) return 'On time'
  const days = Math.floor(whole / 1440)
  const hours = Math.floor((whole % 1440) / 60)
  const mins = whole % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  /* Minutes are dropped once days are involved: "2d 3h 14m" is precision
     nobody acts on, and the bands are hours-wide anyway. */
  if (mins > 0 && days === 0) parts.push(`${mins}m`)
  return parts.length > 0 ? parts.join(' ') : `${whole}m`
}

/** The rule, in the words the panel shows under the figure. */
export function bandExplanation(result: LateFeeResult): string {
  switch (result.band) {
    case 'None':
      return 'Within the 30-minute grace period — no fee.'
    case 'Half Day':
      return 'Rule: under 2 hours late = half day.'
    case 'Full Day':
      return result.fullDaysCharged === 1
        ? 'Rule: 2 hours or more = full day.'
        : `Rule: 2 hours or more = full day, plus each further day. ${result.fullDaysCharged} days charged.`
  }
}
