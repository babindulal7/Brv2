import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSettingsSummary, TABS, isTabKey, DEFAULT_TAB } from '../settings'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('settings queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads empty settings summary when database is empty or errors', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })
    const mockSelect = vi.fn().mockReturnValue({
      order: mockOrder,
    })
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const summary = await getSettingsSummary()
    expect(summary).toBeDefined()
    expect(summary.branches).toEqual([])
    expect(summary.totals.branches).toBe(0)
  })

  it('loads live settings summary when branch data is present', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'br-1',
          branch_code: 'BR-KTM-01',
          name: 'Kathmandu Main HQ',
          address: 'Anamnagar',
          phone: '+977-1-4770000',
          is_active: true,
        },
      ],
      error: null,
    })
    const mockSelect = vi.fn().mockReturnValue({
      order: mockOrder,
    })
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const summary = await getSettingsSummary()
    expect(summary.branches.length).toBe(1)
    expect(summary.branches[0]?.code).toBe('BR-KTM-01')
    expect(summary.totals.branches).toBe(1)
  })

  it('validates tab configurations and keys', () => {
    expect(TABS.length).toBe(4)
    expect(isTabKey('business')).toBe(true)
    expect(isTabKey('people')).toBe(true)
    expect(isTabKey('branches')).toBe(true)
    expect(isTabKey('system')).toBe(true)
    expect(isTabKey('invalid_tab')).toBe(false)
    expect(DEFAULT_TAB).toBe('business')
  })
})
