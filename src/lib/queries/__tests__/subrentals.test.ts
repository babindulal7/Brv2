import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listSubRentals, mapStageToSubRentalStatus } from '../subrentals'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  }
})

describe('subrentals query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mapStageToSubRentalStatus maps booking stages accurately', () => {
    expect(mapStageToSubRentalStatus('Booked')).toBe('Reserved')
    expect(mapStageToSubRentalStatus('Packed')).toBe('Picked Up')
    expect(mapStageToSubRentalStatus('On Rent')).toBe('On Rent')
    expect(mapStageToSubRentalStatus('Returned')).toBe('Returned')
    expect(mapStageToSubRentalStatus('Closed')).toBe('Checked In')
  })

  it('listSubRentals returns database rows when present', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'line-1',
          booking_id: 'b-12345678',
          description: 'ARRI Alexa Mini',
          rate: 50000,
          supplier_cost: 35000,
          qty: 1,
          days: 3,
          line_type: 'Sub-rental',
          created_at: '2026-08-01T10:00:00Z',
        },
      ],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
    })

    const result = await listSubRentals()
    expect(result.rows.length).toBe(1)
    expect(result.rows[0]?.id).toBe('SR-2026-0001')
    expect(result.rows[0]?.equipment).toBe('ARRI Alexa Mini')
    expect(result.rows[0]?.revenuePaisa).toBe(5000000)
    expect(result.rows[0]?.costPaisa).toBe(3500000)
  })

  it('listSubRentals returns empty array when empty or error', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
    })

    const result = await listSubRentals()
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })
})
