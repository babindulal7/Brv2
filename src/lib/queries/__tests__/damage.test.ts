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
    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
    })

    const result = await getDamageFindings()
    expect(result).toEqual([])
  })

  it('getDamageFindings returns mapped cases when damage cases exist', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'case-1',
          case_no: 'DMG-2026-0001',
          title: 'Cracked filter thread',
          status: 'Open',
          priority: 'High',
          created_at: '2026-08-01T10:00:00Z',
          assessed_amount: 15000,
          deposit_held_amount: 20000,
          charged_to_client_amount: 15000,
          counterparty_name: 'Apex Studios',
        },
      ],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
    })

    const result = await getDamageFindings()
    expect(result.length).toBe(1)
    expect(result[0]?.id).toBe('DMG-2026-0001')
    expect(result[0]?.client).toBe('Apex Studios')
    expect(result[0]?.state).toBe('Awaiting Approval')
  })
})
