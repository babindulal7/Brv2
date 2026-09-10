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
    const [bookingsRes, invoicesRes, paymentsRes, itemsRes] = await Promise.all([
      supabase.from('bookings').select('id, status'),
      supabase.from('invoices').select('id, total, status'),
      supabase.from('payments').select('id, amount, status').eq('status', 'Completed'),
      supabase.from('inventory_items').select('id, status'),
    ])

    const bookings = bookingsRes.data ?? []
    const invoices = invoicesRes.data ?? []
    const payments = paymentsRes.data ?? []
    const items = itemsRes.data ?? []

    const activeBookings = bookings.filter((b) =>
      ['Confirmed', 'Packed', 'On Rent'].includes(b.status),
    ).length

    const invoicedTotal = rupees(
      invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0),
    )

    const collectedTotal = rupees(
      payments.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0),
    )

    return {
      bookingCount: bookings.length,
      activeBookings,
      invoicedTotal,
      collectedTotal,
      inventoryUnitsCount: items.length,
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
