import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getDepreciableAssets,
  straightLineSchedule,
  PRICED_ASSETS,
} from '../depreciation'
import { rupees } from '../../money'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('depreciation queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when products table is empty or errors', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const assets = await getDepreciableAssets()
    expect(assets).toEqual([])
  })

  it('maps products with purchase price when present', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'p1', name: 'Sony FX3', purchase_price: 350000 }],
      error: null,
    })
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const assets = await getDepreciableAssets()
    expect(assets.length).toBe(1)
    expect(assets[0]?.name).toBe('Sony FX3')
    expect(assets[0]?.purchasePricePaisa).toBe(35000000)
  })

  it('computes straight line schedule correctly', () => {
    const schedule = straightLineSchedule({
      costPaisa: rupees(100000),
      salvagePaisa: rupees(10000),
      lifeYears: 5,
    })
    expect(schedule.length).toBe(5)
    expect(schedule[0]?.year).toBe(1)
  })

  it('exposes PRICED_ASSETS with valid prices', () => {
    expect(PRICED_ASSETS.length).toBeGreaterThan(0)
    expect(PRICED_ASSETS[0]?.purchasePricePaisa).toBeDefined()
  })
})
