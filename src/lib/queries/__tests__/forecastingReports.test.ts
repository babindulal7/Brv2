import { describe, it, expect } from 'vitest'
import {
  getForecastingReportsSummary,
  FORECAST_METRICS,
  PURCHASE_FORECAST,
  MAINTENANCE_FORECAST,
  SEASONAL_DEMAND,
} from '../forecastingReports'

describe('forecastingReports queries', () => {
  it('returns valid forecasting report summary with positive counts', async () => {
    const summary = await getForecastingReportsSummary()
    expect(summary).toBeDefined()
    expect(summary.expectedBookings).toBeGreaterThan(0)
    expect(summary.predictedShortages).toBeGreaterThanOrEqual(0)
    expect(Number(summary.forecastRevenue)).toBeGreaterThan(0)
  })

  it('exposes baseline fixtures correctly', () => {
    expect(FORECAST_METRICS.forecastAccuracy).toBe(92.4)
    expect(PURCHASE_FORECAST.length).toBe(3)
    expect(MAINTENANCE_FORECAST.length).toBe(3)
    expect(SEASONAL_DEMAND.length).toBe(3)
  })
})
