import { describe, it, expect } from 'vitest'
import { INVENTORY_STATES, sharePercent, summariseStatusCounts, type StatusCount } from '../inventoryReports'

const counts = (m: Partial<Record<(typeof INVENTORY_STATES)[number], number>>): StatusCount[] =>
  INVENTORY_STATES.map((status) => ({ status, count: m[status] ?? 0 }))

describe('inventoryReports', () => {
  it('derives totals from per-status counts, excluding Retired from active', () => {
    const s = summariseStatusCounts(counts({ 'In Stock': 7, 'On Rent': 2, Retired: 1 }))
    expect(s.totalUnits).toBe(10)
    expect(s.activeUnits).toBe(9)
    expect(s.inStock).toBe(7)
  })

  it('covers all ten locked inventory states', () => {
    expect(INVENTORY_STATES).toHaveLength(10)
  })

  it('sharePercent is null, not 0, when there is nothing to divide', () => {
    expect(sharePercent(0, 0)).toBeNull()
    expect(sharePercent(1, 4)).toBe(25)
  })
})
