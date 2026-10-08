import { describe, expect, it } from 'vitest'
import { rentalDaysBetween, formatRentalDays } from '../../../lib/rentalDays'
import { bookingDays } from '../../../modules/rentals/booking/newRentalUtils'
import {
  calculatePricingPipeline,
  calculateAdvanceRequired,
  evaluateDiscounts,
  DISCOUNT_STACKING_CAP_PERCENT,
  WOMEN_DOP_DISCOUNT_PERCENT,
} from '../../../lib/pricingPipeline'
import { type Paisa } from '../../../lib/money'
import { addBundleToBooking } from '../../../modules/rentals/booking/itemCatalogue'
import { BUNDLES } from '../../../data/bundles'

describe('Task 6 — New Rental Business Logic & Validation', () => {
  /* ── 1. Operational Rental Day (06:00 → 06:00 Kathmandu Time) ── */
  describe('1. Rental Day Calculation (06:00 → 06:00 Kathmandu Boundary)', () => {
    it('bills standard 24h operational span as 1 rental day', () => {
      const pickup = '2026-09-10T06:00:00+05:45'
      const ret = '2026-09-11T06:00:00+05:45'
      expect(rentalDaysBetween(pickup, ret)).toBe(1)
      expect(formatRentalDays(1)).toBe('1 Day')
    })

    it('bills multi-day operational spans correctly', () => {
      const pickup = '2026-09-10T06:00:00+05:45'
      const ret = '2026-09-13T06:00:00+05:45'
      expect(rentalDaysBetween(pickup, ret)).toBe(3)
      expect(formatRentalDays(3)).toBe('3 Days')
    })

    it('floors minimum rental day to 1 day per Law 9', () => {
      const pickup = '2026-09-10T09:00:00+05:45'
      const ret = '2026-09-10T18:00:00+05:45' // 9 hours
      expect(rentalDaysBetween(pickup, ret)).toBe(1)
    })

    it('refuses reverse or zero-duration date spans with 0 days at bookingDays gate', () => {
      const pickup = new Date('2026-09-10T10:00:00+05:45')
      const ret = new Date('2026-09-10T09:00:00+05:45')
      expect(bookingDays(pickup, ret)).toBe(0)

      const sameInstant = new Date('2026-09-10T10:00:00+05:45')
      expect(bookingDays(sameInstant, sameInstant)).toBe(0)
    })
  })

  /* ── 2. Pricing Pipeline: Standalone & Bundle Non-Double Charging ── */
  describe('2. Bundle Architecture & Non-Double Charging', () => {
    it('expands bundle into parent line at bundle rate and child components at rate 0', () => {
      const bundle = BUNDLES[0]! // Sony FX3 Documentary Kit
      const days = 2
      const window = {
        pickupAd: new Date('2026-09-10T06:00:00+05:45'),
        returnAd: new Date('2026-09-12T06:00:00+05:45'),
      }
      expect(bundle).toBeDefined()
      const res = addBundleToBooking(bundle, window, { days })

      expect(res.lines.length).toBeGreaterThan(1)

      const parent = res.lines.find((l) => l.lineType === 'Bundle')
      expect(parent).toBeDefined()
      expect(parent?.ratePaisa).toBe(bundle.bundleRatePaisa)
      expect(parent?.days).toBe(days)
      expect(Boolean(parent?.isIncluded)).toBe(false)
      expect(parent?.clientUuid).toBeDefined()

      const children = res.lines.filter((l) => l.isIncluded)
      expect(children.length).toBeGreaterThan(0)

      for (const child of children) {
        // Enforce DB CHECK `booking_lines_bundle_child_is_free`
        expect(child.ratePaisa).toBe(0)
        expect(child.isIncluded).toBe(true)
        expect(child.parentClientUuid).toBe(parent?.clientUuid)
        expect(child.lineType).toBe('Equipment')
      }
    })

    it('prices bundle correctly in pipeline without double-charging included components', () => {
      const days = 3
      const bundleRate = 1200000 // 12,000 Rs per day = 1,200,000 paisa
      const bundleSubtotal = (bundleRate * days) as Paisa // 36,000 Rs

      // Standalone wireless mic kit added alongside bundle
      const standaloneRate = 200000 // 2,000 Rs per day = 200,000 paisa
      const standaloneEquipmentSubtotal = (standaloneRate * days) as Paisa // 6,000 Rs

      const result = calculatePricingPipeline({
        equipmentSubtotalPaisa: standaloneEquipmentSubtotal,
        bundleSubtotalPaisa: bundleSubtotal,
        servicesSubtotalPaisa: 0 as Paisa,
        crewSubtotalPaisa: 0 as Paisa,
        deliveryChargePaisa: 0 as Paisa,
        fuelChargePaisa: 0 as Paisa,
        vatEnabled: true,
        vatRatePercent: 13,
      })

      // Gross subtotal = standalone equipment (6,000) + bundle (36,000) = 42,000 Rs (4,200,000 paisa)
      expect(result.equipmentSubtotalPaisa).toBe(600000)
      expect(result.bundleSubtotalPaisa).toBe(3600000)
      expect(result.grossSubtotalPaisa).toBe(4200000)

      // 13% VAT on 42,000 Rs = 5,460 Rs
      expect(result.vatPaisa).toBe(546000)
      expect(result.rentalTotalPaisa).toBe(4746000)
    })
  })

  /* ── 3. Discount Stacking & Policy Protections ── */
  describe('3. Discount Policy: Stacking Cap (25%) & Protections', () => {
    it('strictly enforces the 25% maximum stacking cap on multiple discounts', () => {
      const subtotal = 10000000 as Paisa // NPR 100,000
      const discounts = evaluateDiscounts(
        {
          manualDiscountPercent: 15,
          manualDiscountReason: 'Corporate director relationship',
          manualDiscountAuthorizedBy: 'Babin',
          womenDopEligible: true, // +5%
          promoCode: {
            code: 'NEPALFILM',
            discountPercent: 10,
            active: true,
            minSpendPaisa: 2000000 as Paisa,
          },
        },
        subtotal,
      )

      // Raw total = 15% + 5% + 10% = 30%
      expect(discounts.rawTotalPercent).toBe(30)
      // Capped at 25%
      expect(discounts.capped).toBe(true)
      expect(discounts.appliedPercent).toBe(DISCOUNT_STACKING_CAP_PERCENT)
      // 25% of 100,000 = 25,000 Rs = 2,500,000 paisa
      expect(discounts.discountPaisa).toBe(2500000)
    })

    it('protects student/college bundles from additional discount stacking', () => {
      const subtotal = 5000000 as Paisa // NPR 50,000
      const discounts = evaluateDiscounts(
        {
          isStudentBundle: true,
          bundleSavingPercent: 20,
          membershipPercent: 10,
          durationPercent: 5,
          promoCode: {
            code: 'KATHMANDU',
            discountPercent: 5,
            active: true,
          },
        },
        subtotal,
      )

      // Membership, duration, and promo are excluded
      const membership = discounts.sources.find((s) => s.name === 'Membership Discount')
      expect(membership?.applied).toBe(false)
      expect(membership?.exclusionReason).toContain('Student bundles do not stack')

      const promo = discounts.sources.find((s) => s.name.includes('Promo'))
      expect(promo?.applied).toBe(false)
      expect(promo?.exclusionReason).toContain('Student bundles do not stack')

      expect(discounts.appliedPercent).toBe(20)
    })

    it('requires reason and authorizing approver when manual discount is granted', () => {
      const subtotal = 5000000 as Paisa
      const discounts = evaluateDiscounts(
        {
          manualDiscountPercent: 10,
          manualDiscountReason: '', // missing
          manualDiscountAuthorizedBy: '', // missing
        },
        subtotal,
      )

      expect(discounts.validationErrors).toHaveLength(2)
      expect(discounts.validationErrors[0]).toContain('reason')
      expect(discounts.validationErrors[1]).toContain('approver')
    })

    it('applies women DoP / Director 5% initiative', () => {
      const subtotal = 2000000 as Paisa // NPR 20,000
      const discounts = evaluateDiscounts(
        {
          womenDopEligible: true,
        },
        subtotal,
      )

      expect(discounts.appliedPercent).toBe(WOMEN_DOP_DISCOUNT_PERCENT)
      expect(discounts.discountPaisa).toBe(100000) // NPR 1,000
    })
  })

  /* ── 4. Security Deposit Liability Separation ── */
  describe('4. Security Deposit Liability Separation', () => {
    it('treats security deposit strictly as a liability guarantee, never taxable or revenue', () => {
      const equipmentSubtotal = 5000000 as Paisa // 50,000 Rs
      const recommendedDeposit = 3000000 as Paisa // 30,000 Rs

      const result = calculatePricingPipeline({
        equipmentSubtotalPaisa: equipmentSubtotal,
        bundleSubtotalPaisa: 0 as Paisa,
        servicesSubtotalPaisa: 0 as Paisa,
        crewSubtotalPaisa: 0 as Paisa,
        deliveryChargePaisa: 0 as Paisa,
        fuelChargePaisa: 0 as Paisa,
        recommendedDepositPaisa: recommendedDeposit,
        vatEnabled: true,
        vatRatePercent: 13,
      })

      // 1. Taxable subtotal is rental subtotal alone (50,000 Rs)
      expect(result.taxableSubtotalPaisa).toBe(5000000)

      // 2. 13% VAT is on rental charges alone (6,500 Rs), NOT on deposit
      expect(result.vatPaisa).toBe(650000)

      // 3. Rental Total is 56,500 Rs, strictly excluding security deposit
      expect(result.rentalTotalPaisa).toBe(5650000)

      // 4. Security deposit is stored separately
      expect(result.securityDeposit.requiredPaisa).toBe(recommendedDeposit)
      expect(result.securityDeposit.overridden).toBe(false)

      // 5. Grand requirement = Rental Total (56,500) + Deposit (30,000) = 86,500 Rs
      expect(result.grandTotalRequirementPaisa).toBe(8650000)
    })

    it('requires justification and authorized manager when deposit is manually overridden', () => {
      const result = calculatePricingPipeline({
        equipmentSubtotalPaisa: 2000000 as Paisa,
        bundleSubtotalPaisa: 0 as Paisa,
        servicesSubtotalPaisa: 0 as Paisa,
        crewSubtotalPaisa: 0 as Paisa,
        deliveryChargePaisa: 0 as Paisa,
        fuelChargePaisa: 0 as Paisa,
        manualDepositOverridePaisa: 0 as Paisa, // Waiving deposit
        depositOverrideReason: '', // Missing
        depositAuthorizedBy: '', // Missing
        vatEnabled: true,
      })

      expect(result.securityDeposit.overridden).toBe(true)
      expect(result.securityDeposit.requiredPaisa).toBe(0)
      expect(result.securityDeposit.validationErrors).toHaveLength(2)
      expect(result.securityDeposit.validationErrors[0]).toContain('reason')
      expect(result.securityDeposit.validationErrors[1]).toContain('manager')
    })
  })

  /* ── 5. Advance Payment Tiers ── */
  describe('5. Advance Payment Tiers', () => {
    it('requires 100% advance for bookings <= NPR 5,000', () => {
      const total = 450000 as Paisa // NPR 4,500
      expect(calculateAdvanceRequired(total)).toBe(450000)
    })

    it('requires flat NPR 5,000 advance for bookings between NPR 5,001 and NPR 10,000', () => {
      const total = 800000 as Paisa // NPR 8,000
      expect(calculateAdvanceRequired(total)).toBe(500000) // NPR 5,000
    })

    it('requires 50% advance for bookings > NPR 10,000', () => {
      const total = 4000000 as Paisa // NPR 40,000
      expect(calculateAdvanceRequired(total)).toBe(2000000) // NPR 20,000 (50%)
    })
  })
})
