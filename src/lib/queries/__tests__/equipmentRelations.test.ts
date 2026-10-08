import { describe, it, expect, vi, beforeEach } from 'vitest'
import { equipmentBookingRelations } from '../equipmentRelations'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('equipmentBookingRelations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps raw relations into EquipmentBookingRelation objects', async () => {
    const rawData = [
      {
        id: 'line-1',
        qty: 2,
        booking_id: 'b-1',
        bookings: {
          id: 'b-1',
          booking_no: 'B-715',
          stage: 'Booked',
          pickup_at: '2026-07-16T00:15:00.000Z',
          return_at: '2026-07-19T00:15:00.000Z',
          clients: { name: 'Himalayan Films Pvt. Ltd.' },
        },
      },
    ]

    const rangeMock = vi.fn().mockResolvedValue({ data: rawData, error: null })
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock })
    const isMock = vi.fn().mockReturnValue({ order: orderMock })
    const eqMock = vi.fn().mockReturnValue({ is: isMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any)

    const relations = await equipmentBookingRelations('prod-123')

    expect(relations).toHaveLength(1)
    expect(relations[0]).toEqual({
      bookingId: 'b-1',
      bookingNo: 'B-715',
      clientName: 'Himalayan Films Pvt. Ltd.',
      stage: 'Booked',
      pickupAtAd: '2026-07-16T00:15:00.000Z',
      returnAtAd: '2026-07-19T00:15:00.000Z',
      qty: 2,
      lineId: 'line-1',
    })
  })

  it('handles null client gracefully', async () => {
    const rawData = [
      {
        id: 'line-2',
        qty: 1,
        booking_id: 'b-2',
        bookings: {
          id: 'b-2',
          booking_no: 'B-716',
          stage: 'Packed',
          pickup_at: '2026-07-20T00:15:00.000Z',
          return_at: '2026-07-22T00:15:00.000Z',
          clients: null,
        },
      },
    ]

    const rangeMock = vi.fn().mockResolvedValue({ data: rawData, error: null })
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock })
    const isMock = vi.fn().mockReturnValue({ order: orderMock })
    const eqMock = vi.fn().mockReturnValue({ is: isMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any)

    const relations = await equipmentBookingRelations('prod-123')

    expect(relations).toHaveLength(1)
    expect(relations[0]?.clientName).toBe('Client not joined')
  })

  it('filters out rows where bookings join returned null', async () => {
    const rawData = [
      {
        id: 'line-orphan',
        qty: 1,
        booking_id: 'b-orphan',
        bookings: null,
      },
    ]

    const rangeMock = vi.fn().mockResolvedValue({ data: rawData, error: null })
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock })
    const isMock = vi.fn().mockReturnValue({ order: orderMock })
    const eqMock = vi.fn().mockReturnValue({ is: isMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any)

    const relations = await equipmentBookingRelations('prod-123')
    expect(relations).toHaveLength(0)
  })

  it('throws an informative error when supabase query fails', async () => {
    const rangeMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'Network error' } })
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock })
    const isMock = vi.fn().mockReturnValue({ order: orderMock })
    const eqMock = vi.fn().mockReturnValue({ is: isMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any)

    await expect(equipmentBookingRelations('prod-123')).rejects.toThrow(
      'Equipment booking relationships unavailable: Network error',
    )
  })
})
