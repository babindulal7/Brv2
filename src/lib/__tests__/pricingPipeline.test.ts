import { describe, it, expect } from 'vitest'
import {
  calculatePricingPipeline,
  calculateAdvanceRequired,
  evaluateDiscounts,
  DISCOUNT_STACKING_CAP_PERCENT,
  WOMEN_DOP_DISCOUNT_PERCENT,
} from '../pricingPipeline'
import { rupees } from '../money'

describe('pricingPipeline — 13-step calculation order & business logic (Task 6)', () => {
  it('calculates standard rental with equipment, bundle, service, crew and delivery correctly', () => {
    // Sony FX3: 3,500/day * 2 qty * 3 days = 21,000 NPR (2,100,000 paisa)
    const equipment = rupees(21000)
    // RED Komodo X Bundle: 15,000/day * 1 qty * 3 days = 45,000 NPR (4,500,000 paisa)
    const bundle = rupees(45000)
    // Camera Caretaker: 3,000/day * 3 days = 9,000 NPR (900,000 paisa)
    const services = rupees(9000)
    // Assistant: 4,000/day * 3 days = 12,000 NPR (1,200,000 paisa)
    const crew = rupees(12000)
    // Delivery + Fuel: 1,500 + 500 = 2,000 NPR (200,000 paisa)
    const deliveryCharge = rupees(1500)
    const fuelCharge = rupees(500)

    const result = calculatePricingPipeline({
      equipmentSubtotalPaisa: equipment,
      bundleSubtotalPaisa: bundle,
      servicesSubtotalPaisa: services,
      crewSubtotalPaisa: crew,
      deliveryChargePaisa: deliveryCharge,
      fuelChargePaisa: fuelCharge,
      vatEnabled: true,
      vatRatePercent: 13,
    })

    // Subtotal: 21,000 + 45,000 + 9,000 + 12,000 + 2,000 = 89,000 NPR (8,900,000 paisa)
    expect(result.grossSubtotalPaisa).toBe(rupees(89000))
    expect(result.discounts.discountPaisa).toBe(0)
    expect(result.taxableSubtotalPaisa).toBe(rupees(89000))

    // VAT 13% on 89,000 = 11,570 NPR
    expect(result.vatPaisa).toBe(rupees(11570))

    // Rental Total: 89,000 + 11,570 = 100,570 NPR
    expect(result.rentalTotalPaisa).toBe(rupees(100570))

    // Security Deposit is separate and NOT in Rental Total
    expect(result.securityDeposit.requiredPaisa).toBeGreaterThan(0)
    expect(result.rentalTotalPaisa).toBe(result.taxableSubtotalPaisa + result.vatPaisa)

    // Advance required: for > 10,000 NPR, advance is 50%
    expect(result.advanceRequiredPaisa).toBe(rupees(100570 * 0.5))
  })

  it('enforces 25% discount stacking cap when discounts exceed 25%', () => {
    const gross = rupees(100000) // NPR 100,000
    // Membership: 20%, Bundle saving: 10% -> Raw = 30%, but capped at 25%
    const breakdown = evaluateDiscounts(
      {
        membershipPercent: 20,
        bundleSavingPercent: 10,
      },
      gross,
    )

    expect(breakdown.rawTotalPercent).toBe(30)
    expect(breakdown.appliedPercent).toBe(DISCOUNT_STACKING_CAP_PERCENT)
    expect(breakdown.capped).toBe(true)
    // 25% of 100,000 = 25,000 NPR
    expect(breakdown.discountPaisa).toBe(rupees(25000))
  })

  it('enforces Student Bundle protection: excludes extra stacking with membership and promo', () => {
    const gross = rupees(50000)
    const breakdown = evaluateDiscounts(
      {
        isStudentBundle: true,
        bundleSavingPercent: 15,
        membershipPercent: 10,
        durationPercent: 5,
        promoCode: {
          code: 'EXTRA10',
          discountPercent: 10,
          active: true,
        },
      },
      gross,
    )

    // Only the student bundle rate is applied; membership, duration and promo are excluded
    expect(breakdown.appliedPercent).toBe(15)
    const membershipSource = breakdown.sources.find((s) => s.name === 'Membership Discount')
    expect(membershipSource?.applied).toBe(false)
    expect(membershipSource?.exclusionReason).toContain('Student bundles do not stack')

    const promoSource = breakdown.sources.find((s) => s.name.startsWith('Promo'))
    expect(promoSource?.applied).toBe(false)
  })

  it('applies Women DoP / Director discount (+5%) explicitly', () => {
    const gross = rupees(40000)
    const breakdown = evaluateDiscounts(
      {
        womenDopEligible: true,
        membershipPercent: 10,
      },
      gross,
    )

    // 10% membership + 5% Women DoP = 15%
    expect(breakdown.appliedPercent).toBe(15)
    expect(breakdown.sources.some((s) => s.name.includes('Women DoP') && s.percent === WOMEN_DOP_DISCOUNT_PERCENT && s.applied)).toBe(true)
    expect(breakdown.discountPaisa).toBe(rupees(6000))
  })

  it('validates promo codes with active status, dates, and minimum spend', () => {
    const gross = rupees(10000)

    // Expired promo
    const expired = evaluateDiscounts(
      {
        promoCode: {
          code: 'PAST',
          discountPercent: 10,
          active: true,
          validTo: '2026-08-01',
        },
      },
      gross,
      '2026-09-18',
    )
    expect(expired.appliedPercent).toBe(0)
    expect(expired.sources[0]?.applied).toBe(false)
    expect(expired.sources[0]?.exclusionReason).toContain('expired')

    // Inactive promo
    const inactive = evaluateDiscounts(
      {
        promoCode: {
          code: 'OFF',
          discountPercent: 10,
          active: false,
        },
      },
      gross,
    )
    expect(inactive.appliedPercent).toBe(0)

    // Min spend not met (requires 20,000, gross is 10,000)
    const minSpend = evaluateDiscounts(
      {
        promoCode: {
          code: 'BIGSPEND',
          discountPercent: 15,
          active: true,
          minSpendPaisa: rupees(20000),
        },
      },
      gross,
    )
    expect(minSpend.appliedPercent).toBe(0)
    expect(minSpend.sources[0]?.exclusionReason).toContain('Minimum spend')

    // Valid promo
    const valid = evaluateDiscounts(
      {
        promoCode: {
          code: 'FESTIVE10',
          discountPercent: 10,
          active: true,
          validFrom: '2026-09-01',
          validTo: '2026-10-31',
          minSpendPaisa: rupees(5000),
        },
      },
      gross,
      '2026-09-18',
    )
    expect(valid.appliedPercent).toBe(10)
    expect(valid.discountPaisa).toBe(rupees(1000))
  })

  it('keeps Security Deposit completely separate from Rental Total, VAT, and discounts', () => {
    const pipeline = calculatePricingPipeline({
      equipmentSubtotalPaisa: rupees(50000),
      bundleSubtotalPaisa: rupees(0),
      servicesSubtotalPaisa: rupees(0),
      crewSubtotalPaisa: rupees(0),
      deliveryChargePaisa: rupees(0),
      fuelChargePaisa: rupees(0),
      discounts: { membershipPercent: 10 },
      vatEnabled: true,
      vatRatePercent: 13,
      manualDepositOverridePaisa: rupees(30000),
      depositOverrideReason: 'Approved by Manager',
      depositAuthorizedBy: 'USR-MGR-01',
    })

    // Subtotal: 50,000, Discount: 10% (5,000), Taxable: 45,000
    expect(pipeline.grossSubtotalPaisa).toBe(rupees(50000))
    expect(pipeline.taxableSubtotalPaisa).toBe(rupees(45000))
    // VAT 13% of 45,000 = 5,850
    expect(pipeline.vatPaisa).toBe(rupees(5850))
    // Rental Total: 45,000 + 5,850 = 50,850
    expect(pipeline.rentalTotalPaisa).toBe(rupees(50850))

    // Security Deposit: Overridden to 30,000
    expect(pipeline.securityDeposit.requiredPaisa).toBe(rupees(30000))
    expect(pipeline.securityDeposit.overridden).toBe(true)
    expect(pipeline.securityDeposit.overrideReason).toBe('Approved by Manager')

    // Grand requirement: 50,850 + 30,000 = 80,850
    expect(pipeline.grandTotalRequirementPaisa).toBe(rupees(80850))
  })

  it('calculates advance payment tiers correctly', () => {
    // <= 5,000 NPR -> 100% full advance
    expect(calculateAdvanceRequired(rupees(3500))).toBe(rupees(3500))
    expect(calculateAdvanceRequired(rupees(5000))).toBe(rupees(5000))

    // <= 10,000 NPR -> 5,000 NPR flat
    expect(calculateAdvanceRequired(rupees(7500))).toBe(rupees(5000))
    expect(calculateAdvanceRequired(rupees(10000))).toBe(rupees(5000))

    // > 10,000 NPR -> 50%
    expect(calculateAdvanceRequired(rupees(12000))).toBe(rupees(6000))
    expect(calculateAdvanceRequired(rupees(50000))).toBe(rupees(25000))
  })
})
