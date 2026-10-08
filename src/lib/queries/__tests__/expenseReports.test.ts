import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getExpenseReportsSummary,
  EXPENSES,
  CATEGORIES,
  BRANCHES,
  totalsOf,
} from '../expenseReports'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('expenseReports queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('re-exports canonical categories and branches', () => {
    expect(CATEGORIES.length).toBeGreaterThan(0)
    expect(BRANCHES.length).toBeGreaterThan(0)
    expect(EXPENSES.length).toBeGreaterThan(0)
  })

  it('calculates totals of canonical expenses correctly', () => {
    const totals = totalsOf(EXPENSES)
    expect(totals.paid).toBeGreaterThan(0)
    expect(totals.pending).toBeGreaterThanOrEqual(0)
    expect(totals.total).toBe(totals.paid + totals.pending)
  })

  it('loads empty expense reports summary with 0 spend when empty or error', async () => {
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

    const summary = await getExpenseReportsSummary()
    expect(summary.rows).toEqual([])
    expect(summary.categories).toEqual(CATEGORIES)
    expect(summary.branches).toEqual(BRANCHES)
    expect(summary.totalSpent).toBe(0)
    expect(summary.pendingApproval).toBe(0)
  })

  it('maps expenses and computes totals when rows present', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'exp-1',
          expense_no: 'EXP-2026-0001',
          amount: 5000,
          status: 'Paid',
          expense_date: '2026-08-01',
          description: 'Office supplies',
          vendor_name: 'Stationery Hub',
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

    const summary = await getExpenseReportsSummary()
    expect(summary.rows.length).toBe(1)
    expect(summary.rows[0]?.id).toBe('EXP-2026-0001')
    expect(summary.totalSpent).toBe(500000)
  })
})
