import { describe, it, expect } from 'vitest'
import {
  getInventoryReportSummary,
  INVENTORY_METRICS,
  ASSET_HEALTH,
  TOP_CATEGORIES,
} from '../inventoryReports'

describe('inventoryReports queries', () => {
  it('returns valid inventory report metrics and categories', async () => {
    const summary = await getInventoryReportSummary()
    expect(summary).toBeDefined()
    expect(summary.totalAssets).toBeGreaterThan(0)
    expect(summary.available).toBeGreaterThanOrEqual(0)
    expect(summary.utilization).toBeGreaterThanOrEqual(0)
    expect(summary.assetHealth.length).toBeGreaterThan(0)
    expect(summary.topCategories.length).toBeGreaterThan(0)
  })

  it('exposes baseline fixtures and metrics correctly', () => {
    expect(INVENTORY_METRICS.totalAssets).toBe(485)
    expect(ASSET_HEALTH.length).toBe(4)
    expect(TOP_CATEGORIES.length).toBe(4)
  })
})
