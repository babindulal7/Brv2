import { describe, it, expect } from 'vitest'
import {
  getProductReportsSummary,
  KPIS,
  SALES_TREND,
  TOP_REVENUE,
  PRODUCTS,
} from '../productReports'

describe('productReports queries', () => {
  it('returns valid product reports summary with positive counts', async () => {
    const summary = await getProductReportsSummary()
    expect(summary).toBeDefined()
    expect(summary.productCount).toBeGreaterThan(0)
    expect(summary.kpis.length).toBeGreaterThan(0)
    expect(summary.topRevenue.rows.length).toBeGreaterThan(0)
  })

  it('exposes baseline fixtures correctly', () => {
    expect(KPIS.length).toBe(4)
    expect(SALES_TREND.series.length).toBe(2)
    expect(PRODUCTS.length).toBeGreaterThan(0)
    expect(TOP_REVENUE.rows.length).toBeGreaterThan(0)
  })
})
