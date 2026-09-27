// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  canAdvance,
  JOBS,
  assertOneJobInProgress,
  assertItemCounts,
  closeGates,
  planTransition,
  type ItemCounts,
  type CloseGateInput,
} from '../../lib/workflow'
import {
  calculatePricingPipeline,
  calculateAdvanceRequired,
  type PricingPipelineInput,
} from '../../lib/pricingPipeline'
import {
  settleDeposit,
  validateDamageReport,
} from '../../lib/damage'
import { rupees, toRupees, type Paisa } from '../../lib/money'

describe('Tier 4: Real-World Application Scenarios & Invariants', () => {
  describe('Scenario 1: Canonical Booking Lifecycle Progression (Draft -> Booked -> Packed -> On Rent -> Returned -> Reset -> Closed)', () => {
    it('enforces strictly forward-only stage transitions without skipping', () => {
      // Allowed forward progression (step size = 1)
      expect(canAdvance('Quote', 'Booked')).toBe(true)
      expect(canAdvance('Booked', 'Packed')).toBe(true)
      expect(canAdvance('Packed', 'On Rent')).toBe(true)
      expect(canAdvance('On Rent', 'Returned')).toBe(true)
      expect(canAdvance('Returned', 'Closed')).toBe(true)

      // Backward transitions forbidden
      expect(canAdvance('Booked', 'Quote')).toBe(false)
      expect(canAdvance('Packed', 'Booked')).toBe(false)
      expect(canAdvance('On Rent', 'Packed')).toBe(false)
      expect(canAdvance('Returned', 'On Rent')).toBe(false)
      expect(canAdvance('Closed', 'Returned')).toBe(false)

      // Skipping stages forbidden
      expect(canAdvance('Quote', 'Packed')).toBe(false)
      expect(canAdvance('Quote', 'On Rent')).toBe(false)
      expect(canAdvance('Booked', 'On Rent')).toBe(false)
      expect(canAdvance('Booked', 'Returned')).toBe(false)
      expect(canAdvance('Packed', 'Closed')).toBe(false)
    })

    it('maps operational jobs strictly to canonical stages', () => {
      // Pack runs at Booked and sets Packed
      expect(JOBS.Pack.runsAt).toBe('Booked')
      expect(JOBS.Pack.sets).toBe('Packed')
      expect(JOBS.Pack.sessions).toBe(false)

      // Handover runs at Packed and sets On Rent
      expect(JOBS.Handover.runsAt).toBe('Packed')
      expect(JOBS.Handover.sets).toBe('On Rent')
      expect(JOBS.Handover.sessions).toBe(true)

      // Return runs at On Rent and sets Returned
      expect(JOBS.Return.runsAt).toBe('On Rent')
      expect(JOBS.Return.sets).toBe('Returned')
      expect(JOBS.Return.sessions).toBe(true)

      // Reset runs at Returned, absorbs cleaning, and does not alter booking status
      expect(JOBS.Reset.runsAt).toBe('Returned')
      expect(JOBS.Reset.sets).toBeNull()
      expect(JOBS.Reset.blocksBooking).toBe(false)
    })

    it('enforces operational concurrency invariant: at most one job In Progress per booking', () => {
      // Single job in progress is valid
      expect(() => {
        assertOneJobInProgress({ Pack: 'In Progress', Handover: 'Not Started' })
      }).not.toThrow()

      // Two jobs in progress simultaneously throws invariant error
      expect(() => {
        assertOneJobInProgress({
          Pack: 'In Progress',
          Handover: 'In Progress',
        })
      }).toThrow('§1.5 violated: 2 jobs In Progress at once')
    })

    it('enforces item state conservation invariant and damage constraint', () => {
      const counts: ItemCounts = {
        Ready: 0,
        'Picked Up': 0,
        Returned: 4,
        Missing: 0,
        Damaged: 1, // Damaged is a condition on Returned
      }

      // Valid counts summing to total items
      expect(() => assertItemCounts(counts, 4)).not.toThrow()

      // Broken sum throws invariant error
      expect(() => assertItemCounts(counts, 5)).toThrow('§1.6 invariant violated')

      // Damaged count exceeding Returned count throws
      const invalidDamage: ItemCounts = {
        Ready: 0,
        'Picked Up': 0,
        Returned: 1,
        Missing: 0,
        Damaged: 2,
      }
      expect(() => assertItemCounts(invalidDamage, 1)).toThrow('Damaged 2 exceeds Returned 1')
    })

    it('blocks Handover (transition to On Rent) when payment or deposit is pending', () => {
      // Deposit Pending flag blocks Handover (to On Rent)
      const depositBlockedPlan = planTransition({
        from: 'Packed',
        to: 'On Rent',
        flags: ['Deposit Pending'],
      })
      expect(depositBlockedPlan.allowed).toBe(false)
      expect(depositBlockedPlan.blockers.some((b) => b.blocking === 'Deposit Pending' || b.label.includes('Handover'))).toBe(true)

      // Payment Due flag blocks Handover (to On Rent)
      const paymentBlockedPlan = planTransition({
        from: 'Packed',
        to: 'On Rent',
        flags: ['Payment Due'],
      })
      expect(paymentBlockedPlan.allowed).toBe(false)
      expect(paymentBlockedPlan.blockers.some((b) => b.blocking === 'Payment Due' || b.label.includes('Handover'))).toBe(true)

      // With clean flags, Handover transition is permitted
      const cleanPlan = planTransition({
        from: 'Packed',
        to: 'On Rent',
        flags: [],
      })
      expect(cleanPlan.allowed).toBe(true)
      expect(cleanPlan.blockers).toHaveLength(0)
    })
  })

  describe('Scenario 2: Financial Integrity & Foundation §2.8 Reference Assertion (BK-2026-0715)', () => {
    it('executes canonical 13-step calculation matching reference BK-2026-0715 exactly in integer Paisa', () => {
      // Input matching Foundation §2.8 reference case
      const input: PricingPipelineInput = {
        equipmentSubtotalPaisa: rupees(132750), // Rs 132,750 (13,275,000 paisa)
        bundleSubtotalPaisa: rupees(0),
        servicesSubtotalPaisa: rupees(0),
        crewSubtotalPaisa: rupees(0),
        deliveryChargePaisa: rupees(0),
        fuelChargePaisa: rupees(0),
        vatEnabled: true, // 13% VAT
        discounts: {
          manualDiscountPercent: 7, // 7% discount
          manualDiscountReason: 'Long-term client relationship discount',
          manualDiscountAuthorizedBy: 'Babin Shrestha',
        },
        recommendedDepositPaisa: rupees(50000), // Deposit Rs 50,000 (5,000,000 paisa)
      }

      const result = calculatePricingPipeline(input)

      // 1. Gross Subtotal: Rs 132,750
      expect(result.grossSubtotalPaisa).toBe(rupees(132750))

      // 2. Discount 7% on Rs 132,750: Rs 9,293 (929,250 -> 929,300 paisa half-up)
      expect(result.discounts.discountPaisa).toBe(929300 as Paisa)
      expect(toRupees(result.discounts.discountPaisa)).toBe(9293)

      // 3. Taxable Subtotal: Rs 132,750 - Rs 9,293 = Rs 123,457 (12,345,700 paisa)
      expect(result.taxableSubtotalPaisa).toBe(12345700 as Paisa)
      expect(toRupees(result.taxableSubtotalPaisa)).toBe(123457)

      // 4. 13% VAT on Rs 123,457: Rs 16,049 (1,604,941 -> 1,604,900 paisa half-up)
      expect(result.vatPaisa).toBe(1604900 as Paisa)
      expect(toRupees(result.vatPaisa)).toBe(16049)

      // 5. Rental Total: Rs 123,457 + Rs 16,049 = Rs 139,506 (13,950,600 paisa)
      expect(result.rentalTotalPaisa).toBe(13950600 as Paisa)
      expect(toRupees(result.rentalTotalPaisa)).toBe(139506)

      // 6. Tiered Advance: 50% of Rental Total (> Rs 10,000) = Rs 69,753 (6,975,300 paisa)
      expect(result.advanceRequiredPaisa).toBe(6975300 as Paisa)
      expect(toRupees(result.advanceRequiredPaisa)).toBe(69753)

      // 7. Law 5: Security Deposit is strictly a liability and never part of Rental Total
      expect(result.rentalTotalPaisa).not.toBe(18950600)
      expect(result.securityDeposit.requiredPaisa).toBe(rupees(50000))

      // 8. Grand Total Requirement = Rental Total + Security Deposit = Rs 189,506
      expect(result.grandTotalRequirementPaisa).toBe(18950600 as Paisa)
      expect(toRupees(result.grandTotalRequirementPaisa)).toBe(189506)

      // 9. Outstanding Balance with Advance Payment of Rs 15,000 (1,500,000 paisa)
      const paymentPaisa = rupees(15000)
      const outstandingPaisa = (result.rentalTotalPaisa - paymentPaisa) as Paisa
      expect(outstandingPaisa).toBe(12450600 as Paisa)
      expect(toRupees(outstandingPaisa)).toBe(124506)
    })
  })

  describe('Scenario 3: Return Damage Discovery & Deposit Settlement', () => {
    it('validates damage findings with photo evidence and approval thresholds', () => {
      // 1. Missing photo rejected
      const noPhoto = validateDamageReport({
        photos: 0,
        description: 'Scratched rear glass element',
        chargePaisa: rupees(10000),
        replacementPaisa: rupees(80000),
      })
      expect(noPhoto.valid).toBe(false)
      expect(noPhoto.errors.photos).toBeDefined()

      // 2. Insufficient description rejected (< 10 chars)
      const shortDesc = validateDamageReport({
        photos: 1,
        description: 'Cracked',
        chargePaisa: rupees(10000),
        replacementPaisa: rupees(80000),
      })
      expect(shortDesc.valid).toBe(false)
      expect(shortDesc.errors.description).toBeDefined()

      // 3. Charge under Rs 25,000 approved by Manager
      const managerCharge = validateDamageReport({
        photos: 2,
        description: 'Bent 15mm carbon fiber support rod',
        chargePaisa: rupees(8000),
        replacementPaisa: rupees(15000),
      })
      expect(managerCharge.valid).toBe(true)
      expect(managerCharge.approver).toBe('Manager')

      // 4. Charge >= Rs 25,000 requires Owner approval
      const ownerCharge = validateDamageReport({
        photos: 3,
        description: 'Dropped Ronin 4D pan motor cracked',
        chargePaisa: rupees(65000),
        replacementPaisa: rupees(450000),
      })
      expect(ownerCharge.valid).toBe(true)
      expect(ownerCharge.approver).toBe('Owner')
    })

    it('settles security deposit with damage deduction, ensuring non-negative refund and isolated shortfall', () => {
      const deposit = rupees(50000)

      // Case A: Partial damage (Rs 15,000) -> Refund Rs 35,000, Shortfall Rs 0
      const settlementA = settleDeposit(deposit, rupees(15000))
      expect(settlementA.refundPaisa).toBe(rupees(35000))
      expect(settlementA.shortfallPaisa).toBe(rupees(0))
      expect(settlementA.fullyConsumed).toBe(false)

      // Case B: Full damage (Rs 50,000) -> Refund Rs 0, Shortfall Rs 0
      const settlementB = settleDeposit(deposit, rupees(50000))
      expect(settlementB.refundPaisa).toBe(rupees(0))
      expect(settlementB.shortfallPaisa).toBe(rupees(0))
      expect(settlementB.fullyConsumed).toBe(true)

      // Case C: Catastrophic damage (Rs 75,000) exceeding deposit -> Refund Rs 0, Shortfall Rs 25,000
      const settlementC = settleDeposit(deposit, rupees(75000))
      expect(settlementC.refundPaisa).toBe(rupees(0)) // Law: refund never goes negative
      expect(settlementC.shortfallPaisa).toBe(rupees(25000)) // Shortfall becomes accounts receivable
      expect(settlementC.fullyConsumed).toBe(true)
    })
  })

  describe('Scenario 4: Tiered Advance Payment Policy & Gate Enforcement', () => {
    it('applies tiered advance policy correctly across price brackets', () => {
      // Bracket 1: Total <= NPR 5,000 -> 100% advance required
      const small1 = calculateAdvanceRequired(rupees(2500))
      expect(small1).toBe(rupees(2500))

      const small2 = calculateAdvanceRequired(rupees(5000))
      expect(small2).toBe(rupees(5000))

      // Bracket 2: Total between NPR 5,000 and 10,000 -> flat NPR 5,000 advance
      const mid1 = calculateAdvanceRequired(rupees(7500))
      expect(mid1).toBe(rupees(5000))

      const mid2 = calculateAdvanceRequired(rupees(10000))
      expect(mid2).toBe(rupees(5000))

      // Bracket 3: Total > NPR 10,000 -> 50% advance
      const large1 = calculateAdvanceRequired(rupees(20000))
      expect(large1).toBe(rupees(10000))

      const large2 = calculateAdvanceRequired(rupees(150000))
      expect(large2).toBe(rupees(75000))

      // Zero total -> 0 advance
      const zero = calculateAdvanceRequired(rupees(0))
      expect(zero).toBe(rupees(0))
    })
  })

  describe('Scenario 5: Final Settlement & Close Gates (§1.7)', () => {
    it('blocks transition to Closed until all four gates pass', () => {
      // Gate 1 Fail: Outstanding balance not settled
      const gate1Fail: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: rupees(24500),
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const eval1 = closeGates(gate1Fail)
      expect(eval1[0]?.passing).toBe(false)
      expect(eval1[0]?.blocking).toContain('still outstanding')

      const plan1 = planTransition({ from: 'Returned', to: 'Closed', gates: gate1Fail })
      expect(plan1.allowed).toBe(false)

      // Gate 2 Fail: Deposit still held
      const gate2Fail: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: rupees(50000),
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const eval2 = closeGates(gate2Fail)
      expect(eval2[1]?.passing).toBe(false)
      expect(eval2[1]?.blocking).toContain('still held')

      const plan2 = planTransition({ from: 'Returned', to: 'Closed', gates: gate2Fail })
      expect(plan2.allowed).toBe(false)

      // Gate 3 Fail: Open Case
      const gate3Fail: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 1,
        damageChargesPendingApproval: 0,
      }
      const eval3 = closeGates(gate3Fail)
      expect(eval3[2]?.passing).toBe(false)
      expect(eval3[2]?.blocking).toContain('1 open')

      const plan3 = planTransition({ from: 'Returned', to: 'Closed', gates: gate3Fail })
      expect(plan3.allowed).toBe(false)

      // Gate 4 Fail: Damage charges pending approval
      const gate4Fail: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 2,
      }
      const eval4 = closeGates(gate4Fail)
      expect(eval4[3]?.passing).toBe(false)
      expect(eval4[3]?.blocking).toContain('2 damage findings awaiting approval')

      const plan4 = planTransition({ from: 'Returned', to: 'Closed', gates: gate4Fail })
      expect(plan4.allowed).toBe(false)

      // All Four Gates Passing: Transition to Closed allowed
      const allPass: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const evalPass = closeGates(allPass)
      expect(evalPass.every((g) => g.passing)).toBe(true)

      const planPass = planTransition({ from: 'Returned', to: 'Closed', gates: allPass })
      expect(planPass.allowed).toBe(true)
      expect(planPass.blockers).toHaveLength(0)
    })
  })
})
