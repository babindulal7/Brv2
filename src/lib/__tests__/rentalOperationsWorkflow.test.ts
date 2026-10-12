import { describe, it, expect } from 'vitest'
import {
  resolveOperationalStage,
  getRentalHeaderOperations,
} from '../rentalOperationsWorkflow'

describe('rentalOperationsWorkflow engine', () => {
  describe('resolveOperationalStage', () => {
    it('resolves Confirmed vs Packing', () => {
      expect(resolveOperationalStage('Booked', { isPackingInProgress: false })).toBe('confirmed')
      expect(resolveOperationalStage('Confirmed', { isPackingInProgress: false })).toBe('confirmed')
      expect(resolveOperationalStage('Booked', { isPackingInProgress: true })).toBe('packing')
      expect(resolveOperationalStage('Packing')).toBe('packing')
    })

    it('resolves Packed / Ready', () => {
      expect(resolveOperationalStage('Packed')).toBe('packed')
      expect(resolveOperationalStage('Ready')).toBe('packed')
    })

    it('resolves On Rent, Partially Returned, and Overdue', () => {
      expect(resolveOperationalStage('On Rent')).toBe('on_rent')
      expect(resolveOperationalStage('Picked Up')).toBe('on_rent')
      expect(resolveOperationalStage('On Rent', { isPartial: true })).toBe('partially_returned')
      expect(resolveOperationalStage('Partial Return')).toBe('partially_returned')
      expect(resolveOperationalStage('On Rent', { isOverdue: true })).toBe('overdue')
    })

    it('resolves Returned, Inspection Pending, Inspection Completed, and Reset Completed', () => {
      expect(resolveOperationalStage('Returned', { isInspectionPending: true })).toBe('inspection_pending')
      expect(resolveOperationalStage('Returned', { isInspectionCompleted: true })).toBe('inspection_completed')
      expect(resolveOperationalStage('Returned', { isResetComplete: true })).toBe('reset_completed')
      expect(resolveOperationalStage('Reset Completed')).toBe('reset_completed')
    })

    it('resolves Cancelled, Closed, Quote', () => {
      expect(resolveOperationalStage('Quote')).toBe('quote')
      expect(resolveOperationalStage('Draft')).toBe('quote')
      expect(resolveOperationalStage('Closed')).toBe('closed')
      expect(resolveOperationalStage('Cancelled')).toBe('cancelled')
      expect(resolveOperationalStage('Booked', { isCancelled: true })).toBe('cancelled')
      expect(resolveOperationalStage('Returned', { isClosed: true })).toBe('closed')
    })
  })

  describe('Specification Table: Automatic Header Actions by Rental Status', () => {
    it('1. Confirmed -> Start Packing', () => {
      const res = getRentalHeaderOperations('Confirmed')
      expect(res.stageKey).toBe('confirmed')
      expect(res.primaryAction.label).toBe('Start Packing')
      expect(res.primaryAction.job).toBe('Pack')
      expect(res.stageHint).toBe('Ready to pack')
      expect(res.operationsMenu[0]?.state).toBe('current') // Packing
      expect(res.operationsMenu[1]?.state).toBe('locked') // Handover
    })

    it('2. Packing -> Confirm Packed', () => {
      const res = getRentalHeaderOperations('Booked', { isPackingInProgress: true })
      expect(res.stageKey).toBe('packing')
      expect(res.primaryAction.label).toBe('Confirm Packed')
      expect(res.primaryAction.job).toBe('Pack')
      expect(res.stageHint).toBe('Packing in progress')
      expect(res.operationsMenu[0]?.state).toBe('current')
      expect(res.operationsMenu[1]?.state).toBe('locked')
    })

    it('3. Packed / Ready -> Confirm Handover', () => {
      const res = getRentalHeaderOperations('Packed')
      expect(res.stageKey).toBe('packed')
      expect(res.primaryAction.label).toBe('Confirm Handover')
      expect(res.primaryAction.job).toBe('Handover')
      expect(res.stageHint).toBe('Ready for handover')
      expect(res.operationsMenu[0]?.state).toBe('completed') // Pack done
      expect(res.operationsMenu[1]?.state).toBe('current') // Handover active
      expect(res.operationsMenu[2]?.state).toBe('locked') // Return locked
    })

    it('4. Picked Up / On Rent -> Return & Inspect', () => {
      const res = getRentalHeaderOperations('On Rent')
      expect(res.stageKey).toBe('on_rent')
      expect(res.primaryAction.label).toBe('Return & Inspect')
      expect(res.primaryAction.job).toBe('Return')
      expect(res.stageHint).toBe('With client · On rent')
      expect(res.operationsMenu[0]?.state).toBe('completed')
      expect(res.operationsMenu[1]?.state).toBe('completed')
      expect(res.operationsMenu[2]?.state).toBe('current')
      expect(res.operationsMenu[3]?.state).toBe('locked')
    })

    it('5. Partially Returned -> Continue Return', () => {
      const res = getRentalHeaderOperations('On Rent', { isPartial: true })
      expect(res.stageKey).toBe('partially_returned')
      expect(res.primaryAction.label).toBe('Continue Return')
      expect(res.primaryAction.job).toBe('Return')
      expect(res.stageHint).toBe('Partially returned · Awaiting items')
      expect(res.operationsMenu[2]?.state).toBe('current')
    })

    it('6. Inspection Pending -> Continue Inspection', () => {
      const res = getRentalHeaderOperations('Returned', { isInspectionPending: true })
      expect(res.stageKey).toBe('inspection_pending')
      expect(res.primaryAction.label).toBe('Continue Inspection')
      expect(res.primaryAction.job).toBe('Return')
      expect(res.stageHint).toBe('Return received · Inspection pending')
      expect(res.operationsMenu[2]?.state).toBe('current')
    })

    it('7. Inspection Completed -> Cleaning & Reset', () => {
      const res = getRentalHeaderOperations('Returned', { isInspectionCompleted: true })
      expect(res.stageKey).toBe('inspection_completed')
      expect(res.primaryAction.label).toBe('Cleaning & Reset')
      expect(res.primaryAction.job).toBe('Reset')
      expect(res.stageHint).toBe('Inspection completed · Ready for reset')
      expect(res.operationsMenu[0]?.state).toBe('completed')
      expect(res.operationsMenu[1]?.state).toBe('completed')
      expect(res.operationsMenu[2]?.state).toBe('completed')
      expect(res.operationsMenu[3]?.state).toBe('current') // Reset active
    })

    it('8. Reset Completed -> View Summary', () => {
      const res = getRentalHeaderOperations('Returned', { isResetComplete: true, canCloseRental: false })
      expect(res.stageKey).toBe('reset_completed')
      expect(res.primaryAction.label).toBe('View Summary')
      expect(res.primaryAction.job).toBeNull()
      expect(res.stageHint).toBe('Reset completed · All gear available')
      expect(res.operationsMenu[3]?.state).toBe('completed')
    })

    it('8b. Reset Completed with Close Permission -> Close Rental', () => {
      const res = getRentalHeaderOperations('Returned', { isResetComplete: true, canCloseRental: true })
      expect(res.stageKey).toBe('reset_completed')
      expect(res.primaryAction.label).toBe('Close Rental')
      expect(res.primaryAction.job).toBeNull()
    })

    it('9. Overdue -> Return & Inspect', () => {
      const res = getRentalHeaderOperations('On Rent', { isOverdue: true })
      expect(res.stageKey).toBe('overdue')
      expect(res.primaryAction.label).toBe('Return & Inspect')
      expect(res.primaryAction.job).toBe('Return')
      expect(res.stageHint).toBe('Overdue for return')
      expect(res.operationsMenu[2]?.state).toBe('current')
    })

    it('handles cancelled and closed states cleanly', () => {
      const cancelled = getRentalHeaderOperations('Booked', { isCancelled: true, cancelledReason: 'Client called off' })
      expect(cancelled.stageKey).toBe('cancelled')
      expect(cancelled.primaryAction.label).toBe('View Details')
      expect(cancelled.canRunOperations).toBe(false)
      expect(cancelled.operationsMenu.every((item) => item.state === 'locked')).toBe(true)

      const closed = getRentalHeaderOperations('Closed')
      expect(closed.stageKey).toBe('closed')
      expect(closed.primaryAction.label).toBe('View Summary')
      expect(closed.canRunOperations).toBe(false)
    })
  })
})
