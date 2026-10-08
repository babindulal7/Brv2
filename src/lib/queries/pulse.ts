import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import {
  PERIODS,
  DEFAULT_PERIOD,
  DEFINITIONS,
  PERIOD_BASIS,
  RECONCILIATION,
  SCHEDULES,
  UPCOMING,
  LEDGER_ASSERTION_ERRORS,
  FLEET_RECONCILIATION_ERRORS,
  MODEL_DISCLOSURE,
  figuresFor,
  previousPeriod,
  rangeLabel,
  dueStatus,
  exportHeader,
  type ChartView,
  type PeriodFigures,
  type EquipmentRow,
  type ScheduleRow,
} from '../../data/pulse'

export {
  PERIODS,
  DEFAULT_PERIOD,
  DEFINITIONS,
  PERIOD_BASIS,
  RECONCILIATION,
  SCHEDULES,
  UPCOMING,
  LEDGER_ASSERTION_ERRORS,
  FLEET_RECONCILIATION_ERRORS,
  MODEL_DISCLOSURE,
  figuresFor,
  previousPeriod,
  rangeLabel,
  dueStatus,
  exportHeader,
}

export type { ChartView, PeriodFigures, EquipmentRow, ScheduleRow }

export interface PulseLiveSummary {
  bookingCount: number
  activeBookings: number
  invoicedTotal: Paisa
  collectedTotal: Paisa
  inventoryUnitsCount: number
}

/**
 * Queries PostgreSQL database for live operational and financial aggregates
 * behind the executive Pulse dashboard.
 */
export async function getPulseLiveSummary(): Promise<PulseLiveSummary> {
  try {
    const [bookingsRes, invoicesRes, paymentsRes, unitsRes] = await Promise.all([
      supabase.from('bookings').select('id, stage'),
      supabase.from('invoices').select('id, total_amount, status'),
      supabase.from('payments').select('id, amount, status').eq('status', 'Completed'),
      supabase.from('product_units').select('id, status'),
    ])

    const bookings = bookingsRes.data ?? []
    const invoices = invoicesRes.data ?? []
    const payments = paymentsRes.data ?? []
    const units = unitsRes.data ?? []

    const activeBookings = bookings.filter((b) =>
      ['Confirmed', 'Packed', 'On Rent'].includes(b.stage),
    ).length

    const invoicedTotal = rupees(
      invoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0),
    )

    const collectedTotal = rupees(
      payments.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0),
    )

    return {
      bookingCount: bookings.length,
      activeBookings,
      invoicedTotal,
      collectedTotal,
      inventoryUnitsCount: units.length,
    }
  } catch {
    return {
      bookingCount: 0,
      activeBookings: 0,
      invoicedTotal: rupees(0),
      collectedTotal: rupees(0),
      inventoryUnitsCount: 0,
    }
  }
}
