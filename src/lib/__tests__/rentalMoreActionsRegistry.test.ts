import { describe, it, expect } from 'vitest'
import {
  evaluateRentalSecondaryActions,
  type SelectedRentalBookingFacts,
} from '../rentalMoreActionsRegistry'

describe('rentalMoreActionsRegistry — Specification Matrix & Capabilities', () => {
  const baseBooking: SelectedRentalBookingFacts = {
    id: 'b-1028',
    bookingNo: 'BK-1028',
    clientName: 'Nepa Films',
    clientId: 'c-1',
    stage: 'Confirmed',
    isCancelled: false,
    isClosed: false,
    itemCount: 4,
    pickupDate: '2026-10-15T09:00:00Z',
    returnDate: '2026-10-18T18:00:00Z',
    totalAmount: 4500000,
    paidAmount: 2000000,
    outstandingAmount: 2500000,
  }

  describe('Section 1 & 7: 5 Primary Action Groups', () => {
    it('returns all 5 action groups for Owner on a Confirmed booking', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Owner',
        selectedCount: 1,
        canViewMoney: true,
      })
      expect(groups).toHaveLength(5)
      expect(groups.map((g) => g.id)).toEqual(['quote', 'invoice', 'duplicate', 'audit', 'cancel'])
    })

    it('disables actions when no booking is selected (selectedCount = 0)', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: null,
        userRole: 'Owner',
        selectedCount: 0,
        canViewMoney: true,
      })
      expect(groups).toHaveLength(5)
      expect(groups.every((g) => g.disabled)).toBe(true)
      expect(groups.find((g) => g.id === 'cancel')?.disabledReason).toContain('Select a rental')
    })
  })

  describe('Section 2 & Law 6: Quote Submenu & Money-Blind Redactions', () => {
    it('shows Quote submenu for Owner and Manager', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Owner',
        selectedCount: 1,
        canViewMoney: true,
      })
      const quoteGroup = groups.find((g) => g.id === 'quote')
      expect(quoteGroup).toBeDefined()
      expect(quoteGroup?.isSubmenu).toBe(true)
      expect(quoteGroup?.items.length).toBeGreaterThan(0)
    })

    it('hides Quote group when user has no money view permission or desk write access', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Technician',
        selectedCount: 1,
        canViewMoney: false,
      })
      const quoteGroup = groups.find((g) => g.id === 'quote')
      expect(quoteGroup).toBeUndefined()
    })
  })

  describe('Section 3 & Law 6: Invoice Submenu & Financial Permission Gate', () => {
    it('shows Invoice group for Owner with finance capabilities', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Owner',
        selectedCount: 1,
        canViewMoney: true,
      })
      const invoiceGroup = groups.find((g) => g.id === 'invoice')
      expect(invoiceGroup).toBeDefined()
      expect(invoiceGroup?.isSubmenu).toBe(true)
      const itemIds = invoiceGroup?.items.map((i) => i.id)
      expect(itemIds).toContain('invoice.create')
      expect(itemIds).toContain('invoice.payment_status')
    })

    it('strictly hides Invoice group from money-blind Warehouse staff (Law 6)', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Warehouse',
        selectedCount: 1,
        canViewMoney: false,
      })
      const invoiceGroup = groups.find((g) => g.id === 'invoice')
      expect(invoiceGroup).toBeUndefined()
    })

    it('strictly hides Invoice group from Technician and Driver roles', () => {
      const techGroups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Technician',
        selectedCount: 1,
        canViewMoney: false,
      })
      expect(techGroups.find((g) => g.id === 'invoice')).toBeUndefined()

      const driverGroups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Driver',
        selectedCount: 1,
        canViewMoney: false,
      })
      expect(driverGroups.find((g) => g.id === 'invoice')).toBeUndefined()
    })
  })

  describe('Section 4: Duplicate Rental', () => {
    it('provides Duplicate as New Draft for eligible rentals', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Manager',
        selectedCount: 1,
        canViewMoney: true,
      })
      const dupGroup = groups.find((g) => g.id === 'duplicate')
      expect(dupGroup).toBeDefined()
      expect(dupGroup?.disabled).toBe(false)
      expect(dupGroup?.items[0]?.id).toBe('rental.duplicate')
    })
  })

  describe('Section 5: Audit History', () => {
    it('provides Audit History with operational, document, and full history', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Coordinator',
        selectedCount: 1,
        canViewMoney: false,
      })
      const auditGroup = groups.find((g) => g.id === 'audit')
      expect(auditGroup).toBeDefined()
      expect(auditGroup?.disabled).toBe(false)
      const itemIds = auditGroup?.items.map((i) => i.id)
      expect(itemIds).toContain('audit.full')
      expect(itemIds).toContain('audit.operational')
      expect(itemIds).toContain('audit.document')
      // Financial history is omitted for money-blind roles
      expect(itemIds).not.toContain('audit.financial')
    })

    it('includes financial history and export for authorized Owner', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Owner',
        selectedCount: 1,
        canViewMoney: true,
      })
      const auditGroup = groups.find((g) => g.id === 'audit')
      const itemIds = auditGroup?.items.map((i) => i.id)
      expect(itemIds).toContain('audit.financial')
      expect(itemIds).toContain('audit.export')
    })
  })

  describe('Section 6 & 7: Cancellation Lifecycle Rules', () => {
    it('allows cancellation in Confirmed pre-handover stage for desk writers', () => {
      const groups = evaluateRentalSecondaryActions({
        booking: baseBooking,
        userRole: 'Manager',
        selectedCount: 1,
        canViewMoney: true,
      })
      const cancelGroup = groups.find((g) => g.id === 'cancel')
      expect(cancelGroup).toBeDefined()
      expect(cancelGroup?.disabled).toBe(false)
      expect(cancelGroup?.destructive).toBe(true)
    })

    it('requires Manager or above to cancel a Packed rental', () => {
      const packedBooking = { ...baseBooking, stage: 'Packed' }
      const opsGroups = evaluateRentalSecondaryActions({
        booking: packedBooking,
        userRole: 'Coordinator',
        selectedCount: 1,
        canViewMoney: false,
      })
      const opsCancel = opsGroups.find((g) => g.id === 'cancel')
      expect(opsCancel?.disabled).toBe(true)
      expect(opsCancel?.disabledReason).toContain('requires Manager permission')

      const mgrGroups = evaluateRentalSecondaryActions({
        booking: packedBooking,
        userRole: 'Manager',
        selectedCount: 1,
        canViewMoney: true,
      })
      const mgrCancel = mgrGroups.find((g) => g.id === 'cancel')
      expect(mgrCancel?.disabled).toBe(false)
    })

    it('prohibits cancellation for On Rent bookings (post-handover)', () => {
      const onRentBooking = { ...baseBooking, stage: 'On Rent' }
      const groups = evaluateRentalSecondaryActions({
        booking: onRentBooking,
        userRole: 'Owner',
        selectedCount: 1,
        canViewMoney: true,
      })
      const cancelGroup = groups.find((g) => g.id === 'cancel')
      expect(cancelGroup?.disabled).toBe(true)
      expect(cancelGroup?.disabledReason).toContain('equipment has left custody')
    })

    it('prohibits cancellation for Returned or Completed bookings', () => {
      const returnedBooking = { ...baseBooking, stage: 'Returned', isClosed: true }
      const groups = evaluateRentalSecondaryActions({
        booking: returnedBooking,
        userRole: 'Owner',
        selectedCount: 1,
        canViewMoney: true,
      })
      const cancelGroup = groups.find((g) => g.id === 'cancel')
      expect(cancelGroup?.disabled).toBe(true)
    })

    it('prohibits cancellation if rental is already cancelled', () => {
      const cancelledBooking = { ...baseBooking, isCancelled: true }
      const groups = evaluateRentalSecondaryActions({
        booking: cancelledBooking,
        userRole: 'Owner',
        selectedCount: 1,
        canViewMoney: true,
      })
      const cancelGroup = groups.find((g) => g.id === 'cancel')
      expect(cancelGroup?.disabled).toBe(true)
      expect(cancelGroup?.disabledReason).toContain('already cancelled')
    })
  })
})
