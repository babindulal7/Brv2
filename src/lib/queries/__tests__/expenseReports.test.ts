import { describe, it, expect } from 'vitest'
import {
  getExpenseReportsSummary,
  EXPENSES,
  CATEGORIES,
  BRANCHES,
  totalsOf,
} from '../expenseReports'

describe('expenseReports queries', () => {
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

  it('loads expense reports summary with non-negative spend', async () => {
    const summary = await getExpenseReportsSummary()
    expect(summary.rows.length).toBeGreaterThan(0)
    expect(summary.categories).toEqual(CATEGORIES)
    expect(summary.branches).toEqual(BRANCHES)
    expect(summary.totalSpent).toBeGreaterThan(0)
    expect(summary.pendingApproval).toBeGreaterThanOrEqual(0)
  })
})
