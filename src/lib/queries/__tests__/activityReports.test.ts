import { describe, it, expect } from 'vitest'
import { getActivityReport } from '../activityReports'

describe('activityReports query module', () => {
  it('returns valid report data with aggregations and events', async () => {
    const report = await getActivityReport()
    expect(report).toBeDefined()
    expect(report.metrics).toBeDefined()
    expect(report.metrics.totalEvents).toBeGreaterThanOrEqual(0)
    expect(report.metrics.activeOperators).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(report.eventsByCategory)).toBe(true)
    expect(Array.isArray(report.eventsBySeverity)).toBe(true)
    expect(Array.isArray(report.staffSummaries)).toBe(true)
    expect(Array.isArray(report.recentEvents)).toBe(true)
  })

  it('filters by module when requested', async () => {
    const report = await getActivityReport({ module: 'Rentals' })
    expect(report).toBeDefined()
    if (report.recentEvents.length > 0) {
      expect(report.recentEvents.every((e) => e.module === 'Rentals')).toBe(true)
    }
  })
})
