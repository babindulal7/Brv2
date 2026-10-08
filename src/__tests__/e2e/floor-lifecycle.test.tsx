// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  canAdvance,
  JOBS,
  closeGates,
  planTransition,
  type CloseGateInput,
} from '../../lib/workflow'
import { getRentalPrimaryAction } from '../../lib/rentalActions'
import { rupees } from '../../lib/money'
import { calculatePricingPipeline } from '../../lib/pricingPipeline'

describe('Item 6 Floor Flow: End-to-End Operational Lifecycle & Invariants', () => {
  const BOOKING_NO = 'BK-E2E-FLOOR-001'

  it('progresses through all 6 operational states strictly obeying permissions, jobs, and closing gates', () => {
    // ------------------------------------------------------------------------
    // Step 1: Quote / Draft Stage
    // ------------------------------------------------------------------------
    const quoteAction = getRentalPrimaryAction('Quote', { bookingNo: BOOKING_NO })
    expect(quoteAction.label).toBe('Confirm Booking')
    expect(quoteAction.disabled).toBe(false)
    expect(canAdvance('Quote', 'Booked')).toBe(true)

    // ------------------------------------------------------------------------
    // Step 2: Booked Stage (Warehouse Packing)
    // ------------------------------------------------------------------------
    const bookedAction = getRentalPrimaryAction('Booked', { bookingNo: BOOKING_NO })
    expect(bookedAction.label).toBe('Start Packing')
    expect(bookedAction.job).toBe('Pack')
    expect(bookedAction.route).toBe(`/rentals/${BOOKING_NO}/packing`)
    expect(JOBS.Pack.runsAt).toBe('Booked')
    expect(JOBS.Pack.sets).toBe('Packed')
    expect(canAdvance('Booked', 'Packed')).toBe(true)

    // ------------------------------------------------------------------------
    // Step 3: Packed Stage (Handover to Client / Sign on Glass)
    // ------------------------------------------------------------------------
    const packedAction = getRentalPrimaryAction('Packed', { bookingNo: BOOKING_NO })
    expect(packedAction.label).toBe('Handover')
    expect(packedAction.job).toBe('Handover')
    expect(packedAction.route).toBe(`/rentals/${BOOKING_NO}/handover`)
    expect(JOBS.Handover.runsAt).toBe('Packed')
    expect(JOBS.Handover.sets).toBe('On Rent')
    expect(canAdvance('Packed', 'On Rent')).toBe(true)

    // ------------------------------------------------------------------------
    // Step 4: On Rent Stage (Return & QC Check-in)
    // ------------------------------------------------------------------------
    const onRentAction = getRentalPrimaryAction('On Rent', { bookingNo: BOOKING_NO })
    expect(onRentAction.label).toBe('Return & Inspect')
    expect(onRentAction.job).toBe('Return')
    expect(onRentAction.route).toBe(`/rentals/${BOOKING_NO}/return`)
    expect(JOBS.Return.runsAt).toBe('On Rent')
    expect(JOBS.Return.sets).toBe('Returned')
    expect(canAdvance('On Rent', 'Returned')).toBe(true)

    // ------------------------------------------------------------------------
    // Step 5: Returned Stage (Cleaning & Reset by Warehouse vs Closure by Admin)
    // ------------------------------------------------------------------------
    // Non-closing warehouse staff sees Cleaning & Reset
    const warehouseResetAction = getRentalPrimaryAction('Returned', {
      bookingNo: BOOKING_NO,
      canCloseRental: false,
      isResetComplete: false,
    })
    expect(warehouseResetAction.label).toBe('Cleaning & Reset')
    expect(warehouseResetAction.job).toBe('Reset')
    expect(warehouseResetAction.route).toBe(`/rentals/${BOOKING_NO}/reset`)

    // Once Reset is completed, non-closer sees truth: 'QC Done · Awaiting Close' (G2)
    const warehouseAwaitingCloseAction = getRentalPrimaryAction('Returned', {
      bookingNo: BOOKING_NO,
      canCloseRental: false,
      isResetComplete: true,
    })
    expect(warehouseAwaitingCloseAction.label).toBe('QC Done · Awaiting Close')
    expect(warehouseAwaitingCloseAction.disabled).toBe(true)
    expect(warehouseAwaitingCloseAction.isOperable).toBe(false)

    // Closing role sees 'Close Rental'
    const closerAction = getRentalPrimaryAction('Returned', {
      bookingNo: BOOKING_NO,
      canCloseRental: true,
      isResetComplete: true,
    })
    expect(closerAction.label).toBe('Close Rental')

    // ------------------------------------------------------------------------
    // Step 6: Close Rental Gates Enforcement (Law 4 & Law 5)
    // ------------------------------------------------------------------------
    // Gate Failure: Outstanding invoice or unreleased deposit blocks closure
    const unfinalizedGates: CloseGateInput = {
      rentalInvoiced: true,
      rentalOutstandingPaisa: rupees(15000), // Rs 15,000 unpaid
      depositHeldPaisa: rupees(20000),       // Rs 20,000 deposit not settled
      openCases: 0,
      damageChargesPendingApproval: 0,
    }
    const gateEval = closeGates(unfinalizedGates)
    expect(gateEval[0]?.passing).toBe(false) // Outstanding invoice blocks
    expect(gateEval[1]?.passing).toBe(false) // Deposit held blocks (Law 5)
    expect(planTransition({ from: 'Returned', to: 'Closed', gates: unfinalizedGates }).allowed).toBe(false)

    // After Deposit Settled (0 paisa) & Invoices cleared (0 paisa)
    const finalizedGates: CloseGateInput = {
      rentalInvoiced: true,
      rentalOutstandingPaisa: 0,
      depositHeldPaisa: 0,
      openCases: 0,
      damageChargesPendingApproval: 0,
    }
    const finalPlan = planTransition({ from: 'Returned', to: 'Closed', gates: finalizedGates })
    expect(finalPlan.allowed).toBe(true)
    expect(finalPlan.blockers).toHaveLength(0)

    // Final Closed State is terminal and inoperable
    const closedAction = getRentalPrimaryAction('Closed', { bookingNo: BOOKING_NO })
    expect(closedAction.label).toBe('Rental Closed')
    expect(closedAction.disabled).toBe(true)
    expect(closedAction.isOperable).toBe(false)
  })

  it('correctly calculates half-up rounded pricing and deposit liabilities throughout the flow', () => {
    // Pipeline with equipment, 13% VAT, and security deposit
    const pricing = calculatePricingPipeline({
      equipmentSubtotalPaisa: rupees(30000), // Rs 30,000 subtotal (2 items * 3 days * Rs 5,000)
      bundleSubtotalPaisa: rupees(0),
      servicesSubtotalPaisa: rupees(0),
      crewSubtotalPaisa: rupees(0),
      deliveryChargePaisa: rupees(0),
      fuelChargePaisa: rupees(0),
      vatEnabled: true,
      vatRatePercent: 13,
      recommendedDepositPaisa: rupees(10000), // Rs 10,000 deposit liability
    })

    // Subtotal: Rs 30,000
    expect(pricing.grossSubtotalPaisa).toBe(rupees(30000))
    // VAT (13%): 30,000 * 0.13 = Rs 3,900
    expect(pricing.vatPaisa).toBe(rupees(3900))
    // Rental Total: Rs 33,900
    expect(pricing.rentalTotalPaisa).toBe(rupees(33900))
    // Deposit is kept separate: Rs 10,000 (Law 5)
    expect(pricing.securityDeposit.requiredPaisa).toBe(rupees(10000))
  })
})
