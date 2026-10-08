import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDamageFindings } from '../damage'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  }
})

describe('damage query module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getDamageFindings returns empty array when empty or error', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })
    const mockIs = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ is: mockIs })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const result = await getDamageFindings()
    expect(result).toEqual([])
  })

  it('getDamageFindings returns mapped cases when damage cases exist', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'DMG-2026-0001',
          description: 'Cracked filter thread',
          estimated_cost: 15000,
          approval_state: 'Pending',
          created_at: '2026-08-01T10:00:00Z',
          approved_by_user: null,
          creator: { name: 'Staff' },
          unit: {
            serial_number: 'SN-001',
            product: { name: 'Sony FX3', replacement_value: 450000 },
          },
          return_line: {
            booking_line: {
              booking: {
                booking_no: 'B-2026-001',
                client: { name: 'Apex Studios' },
              },
            },
          },
        },
      ],
      error: null,
    })
    const mockIs = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ is: mockIs })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const result = await getDamageFindings()
    expect(result.length).toBe(1)
    expect(result[0]?.id).toBe('DMG-2026-0001')
    expect(result[0]?.client).toBe('Apex Studios')
    expect(result[0]?.state).toBe('Awaiting Approval')
  })
})
