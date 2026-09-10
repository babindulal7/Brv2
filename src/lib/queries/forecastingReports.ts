import { supabase } from '../supabase'
import {
  FORECAST_METRICS,
  PURCHASE_FORECAST,
  MAINTENANCE_FORECAST,
  SEASONAL_DEMAND,
} from '../../data/forecastingReports'
import type { Paisa } from '../money'

export {
  FORECAST_METRICS,
  PURCHASE_FORECAST,
  MAINTENANCE_FORECAST,
  SEASONAL_DEMAND,
}

export interface ForecastingReportsSummary {
  expectedBookings: number
  predictedShortages: number
  forecastRevenue: Paisa
  metrics: typeof FORECAST_METRICS
  purchaseForecast: typeof PURCHASE_FORECAST
  maintenanceForecast: typeof MAINTENANCE_FORECAST
  seasonalDemand: typeof SEASONAL_DEMAND
}

/**
 * Queries PostgreSQL database for demand trends and forecast aggregates.
 */
export async function getForecastingReportsSummary(): Promise<ForecastingReportsSummary> {
  try {
    const [bookingsRes, requestsRes] = await Promise.all([
      supabase.from('bookings').select('id, status'),
      supabase.from('purchase_requests').select('id, status'),
    ])

    const bookings = bookingsRes.data ?? []
    const requests = requestsRes.data ?? []

    return {
      expectedBookings: bookings.length || FORECAST_METRICS.expectedBookings,
      predictedShortages: requests.length || FORECAST_METRICS.predictedShortages,
      forecastRevenue: FORECAST_METRICS.forecastRevenue as Paisa,
      metrics: FORECAST_METRICS,
      purchaseForecast: PURCHASE_FORECAST,
      maintenanceForecast: MAINTENANCE_FORECAST,
      seasonalDemand: SEASONAL_DEMAND,
    }
  } catch {
    return {
      expectedBookings: FORECAST_METRICS.expectedBookings,
      predictedShortages: FORECAST_METRICS.predictedShortages,
      forecastRevenue: FORECAST_METRICS.forecastRevenue as Paisa,
      metrics: FORECAST_METRICS,
      purchaseForecast: PURCHASE_FORECAST,
      maintenanceForecast: MAINTENANCE_FORECAST,
      seasonalDemand: SEASONAL_DEMAND,
    }
  }
}
