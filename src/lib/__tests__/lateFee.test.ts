/**
 * Late-fee **policy**. The arithmetic is `money.test.ts:399`'s job — this file
 * never re-tests the bands, because a second set of boundary assertions is a
 * second thing to update when the rule moves.
 *
 * What is tested here is the part that had no home: a fee is a *suggestion*,
 * and turning one into money is a decision with a gate on it.
 */
import { describe, it, expect } from 'vitest'
import {
  lateFee,
  settleLateFee,
  validateWaiver,
  formatOverage,
  bandExplanation,
  WAIVER_REASON_MIN,
  WAIVER_NEEDS_APPROVER,
  bookingDayRate,
} from '../lateFee'
import { rupees, toRupees } from '../money'

const SCHEDULED = new Date('2026-07-19T04:15:00.000Z')
const DAY_RATE = rupees(6000)

function lateBy(minutes: number) {
  return lateFee({
    scheduledReturnAt: SCHEDULED,
    actualReturnAt: new Date(SCHEDULED.getTime() + minutes * 60_000),
    dayRatePaisa: DAY_RATE,
  })
}

describe('the calculation is re-exported, not reimplemented', () => {
  it('is the same function money.ts already exports', async () => {
    const money = await import('../money')
    expect(lateFee).toBe(money.lateFee)
  })
})

describe('validateWaiver', () => {
  it('refuses an unsigned waiver — the name is what makes the log worth keeping', () => {
    const v = validateWaiver({ staffName: '  ', reason: 'Client called ahead about the flood on the ring road' })
    expect(v.valid).toBe(false)
    expect(v.error).toMatch(/recorded against a name/)
  })

  it(`refuses a reason under ${WAIVER_REASON_MIN} characters`, () => {
    for (const reason of ['', 'ok', 'fine', 'waived']) {
      expect(
        validateWaiver({ staffName: 'Sagar Maharjan', reason, approverName: 'Babin Shrestha' }).valid,
        reason,
      ).toBe(false)
    }
  })

  /* Ruled 12 Aug 2026, closing PLAN.md §4.23. A discount above 10% needs a
     named approver and a waiver of the same rupee value did not — both give
     money away, and the asymmetry was not intended. */
  it('refuses a waiver with no named approver, however good the reason', () => {
    const v = validateWaiver({
      staffName: 'Sagar Maharjan',
      reason: 'Client held up by the Kalanki road closure, called ahead',
    })
    expect(v.valid).toBe(false)
    expect(v.error).toMatch(/Manager or Owner/)
  })

  it('refuses a blank-looking approver name', () => {
    const v = validateWaiver({
      staffName: 'Sagar Maharjan',
      reason: 'Client held up by the Kalanki road closure, called ahead',
      approverName: '   ',
    })
    expect(v.valid).toBe(false)
  })

  it('applies at every amount — no threshold, because a waiver has no base to take a percentage of', () => {
    expect(WAIVER_NEEDS_APPROVER).toBe(true)
    for (const minutes of [45, 200, 3000]) {
      const noApprover = validateWaiver({ staffName: 'S', reason: 'A perfectly good written reason here' })
      expect(noApprover.valid, `${minutes}m`).toBe(false)
    }
  })

  it('accepts a reason that would still mean something in six months', () => {
    const v = validateWaiver({
      staffName: 'Sagar Maharjan',
      reason: 'Client held up by the Kalanki road closure, called ahead',
      approverName: 'Babin Shrestha',
    })
    expect(v.valid).toBe(true)
    expect(v.error).toBeNull()
  })

  it('counts the trimmed reason, so ten spaces are not ten characters', () => {
    expect(validateWaiver({ staffName: 'S', reason: '          ', approverName: 'B' }).valid).toBe(false)
  })
})

describe('bookingDayRate — one day of the WHOLE booking', () => {
  // Ruled 12 Aug 2026, closing PLAN.md §4.24.
  const BASE = { equipmentPaisa: rupees(60750), crewPaisa: rupees(72000), rentalDays: 3 }

  it('divides equipment and crew totals by the rental days', () => {
    const r = bookingDayRate({ ...BASE, transport: { kind: 'flat', amountPaisa: rupees(0) } })
    // 60,750/3 = 20,250 · 72,000/3 = 24,000
    expect(toRupees(r.dayRatePaisa)).toBe(44250)
  })

  it('adds a per-day transport charge without dividing it — it is already daily', () => {
    const r = bookingDayRate({ ...BASE, transport: { kind: 'per-day', amountPaisa: rupees(3000) } })
    expect(toRupees(r.dayRatePaisa)).toBe(47250)
    expect(r.basis).toMatch(/billed per day, so it recurs/)
  })

  it('excludes a flat transport charge — a delivery run does not happen twice', () => {
    // Charging a third of a flat run as part of an extra day would be billing a
    // fraction of a journey nobody made.
    const flat = bookingDayRate({ ...BASE, transport: { kind: 'flat', amountPaisa: rupees(9000) } })
    const none = bookingDayRate({ ...BASE, transport: { kind: 'flat', amountPaisa: rupees(0) } })
    expect(toRupees(flat.dayRatePaisa)).toBe(toRupees(none.dayRatePaisa))
    expect(flat.basis).toMatch(/a flat run does not happen twice/)
  })

  it('never divides by zero', () => {
    const r = bookingDayRate({ ...BASE, rentalDays: 0, transport: { kind: 'flat', amountPaisa: rupees(0) } })
    expect(Number.isFinite(toRupees(r.dayRatePaisa))).toBe(true)
  })

  it('states its basis, so the operator sees which reading produced the figure', () => {
    const r = bookingDayRate({ ...BASE, transport: { kind: 'per-day', amountPaisa: rupees(3000) } })
    expect(r.basis).toContain('equipment ÷ 3')
    expect(r.basis).toContain('crew ÷ 3')
  })
})

describe('settleLateFee — suggested, never applied automatically', () => {
  it('Apply charges the computed figure', () => {
    const result = lateBy(200) // 3h 20m → full day
    const outcome = settleLateFee(result, 'Apply')
    expect(outcome.decision).toBe('Apply')
    expect(toRupees(outcome.chargedPaisa)).toBe(6000)
    expect(outcome.waiver).toBeUndefined()
  })

  it('Waive charges nothing but keeps the figure that was waived', () => {
    const result = lateBy(200)
    const outcome = settleLateFee(result, 'Waive', {
      staffName: 'Sagar Maharjan',
      reason: 'Client held up by the Kalanki road closure, called ahead',
      approverName: 'Babin Shrestha',
    })
    expect(toRupees(outcome.chargedPaisa)).toBe(0)
    /* A waived Rs 6,000 is not the same event as a Rs 0 fee, and the ledger
       has to be able to tell them apart. */
    expect(toRupees(outcome.suggestedPaisa)).toBe(6000)
    expect(outcome.waiver?.staffName).toBe('Sagar Maharjan')
  })

  it('stores the trimmed reason and the trimmed approver', () => {
    const outcome = settleLateFee(lateBy(200), 'Waive', {
      staffName: 'Sagar Maharjan',
      reason: '   Client held up by the Kalanki road closure   ',
      approverName: '  Babin Shrestha  ',
    })
    expect(outcome.waiver?.reason).toBe('Client held up by the Kalanki road closure')
    expect(outcome.waiver?.approverName).toBe('Babin Shrestha')
  })

  it('throws rather than silently waiving when no approver is named', () => {
    expect(() =>
      settleLateFee(lateBy(200), 'Waive', {
        staffName: 'Sagar Maharjan',
        reason: 'Client held up by the Kalanki road closure, called ahead',
      }),
    ).toThrow(/Manager or Owner/)
  })

  it('throws rather than guessing when a waiver has no reason at all', () => {
    expect(() => settleLateFee(lateBy(200), 'Waive')).toThrow(/needs a name and a written reason/)
  })

  it('throws rather than silently charging when the reason is too short', () => {
    expect(() => settleLateFee(lateBy(200), 'Waive', { staffName: 'S', reason: 'ok' })).toThrow(/at least 10/)
  })

  it('a return inside the grace period settles at zero either way', () => {
    const result = lateBy(20)
    expect(toRupees(settleLateFee(result, 'Apply').chargedPaisa)).toBe(0)
  })
})

describe('formatOverage — a duration, not a timestamp', () => {
  it('reads as on time at or below zero', () => {
    expect(formatOverage(0)).toBe('On time')
    expect(formatOverage(-90)).toBe('On time')
  })

  it('renders the spec’s own example', () => {
    expect(formatOverage(200)).toBe('3h 20m')
  })

  it('renders minutes alone under an hour', () => {
    expect(formatOverage(45)).toBe('45m')
  })

  it('drops minutes once days are involved — precision nobody acts on', () => {
    expect(formatOverage(2 * 1440 + 3 * 60 + 14)).toBe('2d 3h')
  })
})

describe('bandExplanation — the rule, in the words under the figure', () => {
  it('names the grace period', () => {
    expect(bandExplanation(lateBy(20))).toMatch(/30-minute grace/)
  })

  it('names the half-day rule', () => {
    expect(bandExplanation(lateBy(90))).toMatch(/under 2 hours late = half day/)
  })

  it('names the full-day rule, and the count once it is more than one', () => {
    expect(bandExplanation(lateBy(200))).toMatch(/2 hours or more = full day\./)
    expect(bandExplanation(lateBy(3000))).toMatch(/3 days charged/)
  })
})
