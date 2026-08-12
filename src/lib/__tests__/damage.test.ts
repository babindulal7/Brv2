/**
 * The damage engine. Every rule in the locked flow, pinned where it lives —
 * the screens read these answers rather than computing their own.
 */
import { describe, it, expect } from 'vitest'
import {
  OWNER_APPROVAL_THRESHOLD,
  MIN_PHOTOS,
  approverFor,
  validateDamageReport,
  settleDeposit,
  approvalEffect,
  submitState,
} from '../damage'
import { rupees, toRupees } from '../money'

const GOOD = {
  description: 'Lens mount cracked on the left side, visible on the return photos',
  photos: 2,
  chargePaisa: rupees(8000),
  replacementPaisa: rupees(420000),
}

describe('approverFor — the Rs 25,000 boundary', () => {
  it('sends anything below the threshold to a Manager', () => {
    expect(approverFor(rupees(0))).toBe('Manager')
    expect(approverFor(rupees(24999))).toBe('Manager')
  })

  it('sends exactly the threshold to the Owner — the boundary is inclusive at the top', () => {
    // "< Rs 25,000 → Manager · ≥ Rs 25,000 → Owner" leaves no gap, and a
    // threshold both roles could claim is the kind that gets argued about.
    expect(approverFor(OWNER_APPROVAL_THRESHOLD)).toBe('Owner')
    expect(toRupees(OWNER_APPROVAL_THRESHOLD)).toBe(25000)
  })

  it('sends anything above it to the Owner', () => {
    expect(approverFor(rupees(25001))).toBe('Owner')
    expect(approverFor(rupees(400000))).toBe('Owner')
  })
})

describe('validateDamageReport — the photo is the point', () => {
  it('accepts a complete report', () => {
    const v = validateDamageReport(GOOD)
    expect(v.valid).toBe(true)
    expect(v.errors).toEqual({})
  })

  it(`refuses a report with fewer than ${MIN_PHOTOS} photo`, () => {
    const v = validateDamageReport({ ...GOOD, photos: 0 })
    expect(v.valid).toBe(false)
    expect(v.errors.photos).toMatch(/evidence the charge rests on/)
  })

  it('refuses a description that is not a finding', () => {
    const v = validateDamageReport({ ...GOOD, description: 'Broken' })
    expect(v.valid).toBe(false)
    expect(v.errors.description).toMatch(/at least 10 characters/)
  })

  it('refuses a negative charge, and says how to charge nothing', () => {
    const v = validateDamageReport({ ...GOOD, chargePaisa: rupees(-100) })
    expect(v.valid).toBe(false)
    expect(v.errors.charge).toMatch(/enter 0 and say why/)
  })

  it('carries the approver so the form can name them before submit', () => {
    expect(validateDamageReport({ ...GOOD, chargePaisa: rupees(8000) }).approver).toBe('Manager')
    expect(validateDamageReport({ ...GOOD, chargePaisa: rupees(90000) }).approver).toBe('Owner')
  })
})

describe('validateDamageReport — warnings are not blocks', () => {
  it('warns about a zero charge without refusing it', () => {
    const v = validateDamageReport({ ...GOOD, chargePaisa: rupees(0) })
    expect(v.valid).toBe(true)
    expect(v.warnings.join(' ')).toMatch(/still moves to Maintenance/)
  })

  it('warns when the charge exceeds replacement value, but allows it', () => {
    // Repair can genuinely cost more than replacement; the engine does not get
    // to overrule the person holding the item.
    const v = validateDamageReport({ ...GOOD, chargePaisa: rupees(500000), replacementPaisa: rupees(420000) })
    expect(v.valid).toBe(true)
    expect(v.warnings.join(' ')).toMatch(/above the asset's replacement value/)
  })

  it('never derives the charge from the replacement value', () => {
    // The charge is case-by-case. Nothing in the result should echo the
    // replacement figure back as a proposed charge.
    const v = validateDamageReport({ ...GOOD, chargePaisa: rupees(1) })
    expect(v.valid).toBe(true)
    expect(v.warnings.join(' ')).not.toMatch(/420,?000/)
  })
})

describe('settleDeposit — a deposit is a liability, and cannot owe', () => {
  it('refunds the remainder when the deposit covers the damage', () => {
    const s = settleDeposit(rupees(50000), rupees(8000))
    expect(toRupees(s.refundPaisa)).toBe(42000)
    expect(toRupees(s.shortfallPaisa)).toBe(0)
    expect(s.fullyConsumed).toBe(false)
  })

  it('floors the refund at zero and reports the shortfall separately', () => {
    // A damage charge larger than the deposit must not produce a negative
    // refund — that number would get added to a total and break the law.
    const s = settleDeposit(rupees(50000), rupees(80000))
    expect(toRupees(s.refundPaisa)).toBe(0)
    expect(toRupees(s.shortfallPaisa)).toBe(30000)
    expect(s.fullyConsumed).toBe(true)
  })

  it('handles the exact-consumption case', () => {
    const s = settleDeposit(rupees(50000), rupees(50000))
    expect(toRupees(s.refundPaisa)).toBe(0)
    expect(toRupees(s.shortfallPaisa)).toBe(0)
    expect(s.fullyConsumed).toBe(true)
  })

  it('returns the whole deposit when there is no damage charge', () => {
    const s = settleDeposit(rupees(50000), rupees(0))
    expect(toRupees(s.refundPaisa)).toBe(50000)
    expect(s.fullyConsumed).toBe(false)
  })

  it('does not report full consumption when there was no deposit to consume', () => {
    const s = settleDeposit(rupees(0), rupees(8000))
    expect(toRupees(s.refundPaisa)).toBe(0)
    expect(toRupees(s.shortfallPaisa)).toBe(8000)
    expect(s.fullyConsumed).toBe(false)
  })
})

describe('approvalEffect — the move and the unavailability are one fact', () => {
  it('moves the unit to Maintenance and takes it out of booking together', () => {
    const e = approvalEffect(GOOD, 'Babin Shrestha')
    expect(e.nextUnitStatus).toBe('Maintenance')
    expect(e.availableForBooking).toBe(false)
  })

  it('records who approved it and what for', () => {
    const e = approvalEffect(GOOD, 'Babin Shrestha')
    expect(e.reason).toContain('Babin Shrestha')
    expect(e.reason).toContain('Lens mount cracked')
  })
})

describe('submitState', () => {
  it('moves a complete report to Awaiting Approval', () => {
    expect(submitState(validateDamageReport(GOOD))).toBe('Awaiting Approval')
  })

  it('keeps an incomplete report in Draft', () => {
    expect(submitState(validateDamageReport({ ...GOOD, photos: 0 }))).toBe('Draft')
  })
})
