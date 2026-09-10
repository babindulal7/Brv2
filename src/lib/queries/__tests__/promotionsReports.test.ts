import { describe, it, expect } from 'vitest'
import {
  getPromotionsReportsSummary,
  METRICS,
  RETURN_ON_PROMOTION,
  TOP_COUPONS,
  BUNDLE_ANALYSIS,
} from '../promotionsReports'

describe('promotionsReports queries', () => {
  it('returns valid promotions report summary with positive metrics', async () => {
    const summary = await getPromotionsReportsSummary()
    expect(summary).toBeDefined()
    expect(summary.couponCount).toBeGreaterThan(0)
    expect(summary.redemptionCount).toBeGreaterThan(0)
    expect(Number(summary.promotionRevenue)).toBeGreaterThan(0)
    expect(Number(summary.discountsGiven)).toBeGreaterThan(0)
  })

  it('exposes baseline fixtures correctly', () => {
    expect(RETURN_ON_PROMOTION).toBe(7.14)
    expect(TOP_COUPONS.length).toBe(3)
    expect(BUNDLE_ANALYSIS.length).toBe(3)
    expect(METRICS.redemptionRate).toBe(55.4)
  })
})
