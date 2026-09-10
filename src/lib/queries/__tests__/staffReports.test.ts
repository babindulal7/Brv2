import { describe, it, expect } from 'vitest'
import {
  getStaffReportsSummary,
  STAFF_METRICS,
  STAFF_LIST,
} from '../staffReports'

describe('staffReports queries', () => {
  it('returns valid staff report summary with positive staff counts', async () => {
    const summary = await getStaffReportsSummary()
    expect(summary).toBeDefined()
    expect(summary.staffCount).toBeGreaterThan(0)
    expect(summary.staffList.length).toBeGreaterThan(0)
    expect(Number(summary.metrics.revenueHandled)).toBeGreaterThan(0)
  })

  it('exposes baseline fixtures correctly', () => {
    expect(STAFF_METRICS.collectionRate).toBe(94.2)
    expect(STAFF_LIST.length).toBeGreaterThan(0)
  })
})
