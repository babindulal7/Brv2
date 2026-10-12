// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useNewRentalSubmit } from '../useNewRentalSubmit'
import type { ClientRecord } from '../../../../lib/queries/clients'
import type { PricingPipelineResult } from '../../../../lib/pricingPipeline'
import type { Paisa } from '../../../../lib/money'

vi.mock('../../../../actions/rentals/createRental', () => ({
  createRental: vi.fn().mockResolvedValue({
    bookingId: 'test-booking-id-123',
    bookingNo: '6',
    stage: 'Quote',
  }),
  deliveryTypeFromLabel: vi.fn().mockReturnValue('Pickup'),
}))

vi.mock('../../../../actions/rentals/confirmRental', () => ({
  confirmRental: vi.fn().mockResolvedValue({
    bookingId: 'test-booking-id-123',
    bookingNo: '6',
    stage: { from: 'Quote', to: 'Booked' },
  }),
}))

vi.mock('../../../../actions/rentals/saveDraft', () => ({
  convertDraft: vi.fn().mockResolvedValue({}),
  saveDraft: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('../../../../lib/queries/availability', () => ({
  planCreationUnits: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { branch_id: 'branch-1' }, error: null }),
        }),
      }),
    }),
  },
  newClientUuid: vi.fn().mockReturnValue('uuid-mock-123'),
}))

describe('useNewRentalSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('triggers showSuccessToast with Booking Confirmed and booking number when confirmBooking succeeds', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const showSuccessToast = vi.fn()
    const setConfirmedSuccess = vi.fn()
    const setSaveState = vi.fn()
    const setActionError = vi.fn()
    const setSavedDraftFingerprint = vi.fn()

    const confirmKey = { current: null }
    const draftBookingKey = { current: null }

    let submitHook!: ReturnType<typeof useNewRentalSubmit>

    const dummyClient = {
      dbId: 'client-db-1',
      id: 'CL-001',
      name: 'Test Client',
      phone: '9841000000',
      email: 'test@example.com',
      company: 'Test Co',
      address: 'Kathmandu',
      pan: '123456789',
      creditLimitPaisa: 0 as Paisa,
      active_rentals_count: 0,
      risk_tier: 'Low',
      health_score: 95,
      flags: [],
      notes: '',
      has_signed_agreement: true,
      requires_deposit: false,
      is_flagged: false,
    } as unknown as ClientRecord

    const dummyPricing = {
      securityDeposit: { requiredPaisa: 0 },
      discounts: { discountPaisa: 0, appliedPercent: 0 },
    } as unknown as PricingPipelineResult

    function TestComponent() {
      submitHook = useNewRentalSubmit({
        confirmBlocked: false,
        saveState: 'saved',
        setSaveState,
        dispatchContext: () => ({ userId: 'user-1', role: 'Coordinator' }),
        setActionError,
        setConfirmedSuccess,
        showSuccessToast,
        client: dummyClient,
        lines: [],
        equipmentLines: [],
        project: 'Feature Film A',
        pickupAt: new Date('2026-11-01T09:00:00Z'),
        returnAt: new Date('2026-11-03T18:00:00Z'),
        deliveryType: 'Client Pickup',
        pricing: dummyPricing,
        manualDiscountReason: '',
        manualDiscountAuthorizedBy: '',
        womenDopEligible: false,
        crew: [],
        clientPickup: true,
        deliveryChargePaisa: 0 as any,
        fuelChargePaisa: 0 as any,
        returnPickupType: 'Client Return',
        returnPickupAddress: '',
        returnPickupTime: '18:00',
        returnPickupChargePaisa: 0,
        returnTransportPaisa: 0,
        vehicle: '',
        numberPlate: '',
        driverContact: '',
        pickupLocation: '',
        returnLocation: '',
        specialInstructions: '',
        days: 2,
        draftId: null,
        draftBookingNo: null,
        draftHasUnsavedChanges: false,
        draftData: {} as any,
        setSavedDraftFingerprint,
        kind: 'Feature Film',
        kindOther: '',
        confirmKey,
        draftBookingKey,
      })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      await act(async () => {
        await submitHook.confirmBooking()
      })

      // Toast must be dispatched per Law 12
      expect(showSuccessToast).toHaveBeenCalledTimes(1)
      expect(showSuccessToast).toHaveBeenCalledWith('Booking Confirmed', 'Rental 6 is now Booked')

      // Modal state and save state must be updated
      expect(setSaveState).toHaveBeenCalledWith('saved')
      expect(setConfirmedSuccess).toHaveBeenCalledWith({
        bookingId: 'test-booking-id-123',
        bookingNo: '6',
      })
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })
})
