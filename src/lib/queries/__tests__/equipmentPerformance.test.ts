import { describe, it, expect } from 'vitest'
import {
  getEquipmentPerformanceSummary,
  EQUIPMENT_METRICS,
  TOP_PERFORMERS,
  WORST_PERFORMERS,
} from '../equipmentPerformance'

describe('equipmentPerformance queries', () => {
  it('returns valid equipment performance metrics and performers', async () => {
    const summary = await getEquipmentPerformanceSummary()
    expect(summary).toBeDefined()
    expect(Number(summary.revenue)).toBeGreaterThan(0)
    expect(Number(summary.idleCost)).toBeGreaterThan(0)
    expect(summary.topPerformers.length).toBeGreaterThan(0)
    expect(summary.worstPerformers.length).toBeGreaterThan(0)
  })

  it('exposes baseline fixtures correctly', () => {
    expect(Number(EQUIPMENT_METRICS.revenue)).toBeGreaterThan(0)
    expect(TOP_PERFORMERS.length).toBe(3)
    expect(WORST_PERFORMERS.length).toBe(2)
  })
})
