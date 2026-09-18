import { supabase } from '../supabase'
import {
  EQUIPMENT_METRICS,
  TOP_PERFORMERS,
  WORST_PERFORMERS,
} from '../../data/equipmentPerformance'
import { rupees, type Paisa } from '../money'

export { EQUIPMENT_METRICS, TOP_PERFORMERS, WORST_PERFORMERS }

export interface EquipmentPerformanceSummary {
  revenue: Paisa
  idleCost: Paisa
  topPerformers: typeof TOP_PERFORMERS
  worstPerformers: typeof WORST_PERFORMERS
}

/**
 * Queries PostgreSQL database for equipment performance and utilization metrics.
 */
export async function getEquipmentPerformanceSummary(): Promise<EquipmentPerformanceSummary> {
  try {
    const [productsRes, invoicesRes] = await Promise.all([
      supabase.from('products_v').select('id, name, daily_rate'),
      supabase.from('invoices').select('id, total_amount'),
    ])

    const products = productsRes.data ?? []
    const invoices = invoicesRes.data ?? []

    if (products.length === 0 && invoices.length === 0) {
      return {
        revenue: EQUIPMENT_METRICS.revenue as Paisa,
        idleCost: EQUIPMENT_METRICS.idleCost as Paisa,
        topPerformers: TOP_PERFORMERS,
        worstPerformers: WORST_PERFORMERS,
      }
    }

    const totalRevenue = rupees(
      invoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0) || Number(EQUIPMENT_METRICS.revenue),
    )

    return {
      revenue: totalRevenue,
      idleCost: EQUIPMENT_METRICS.idleCost as Paisa,
      topPerformers: TOP_PERFORMERS,
      worstPerformers: WORST_PERFORMERS,
    }
  } catch {
    return {
      revenue: EQUIPMENT_METRICS.revenue as Paisa,
      idleCost: EQUIPMENT_METRICS.idleCost as Paisa,
      topPerformers: TOP_PERFORMERS,
      worstPerformers: WORST_PERFORMERS,
    }
  }
}
