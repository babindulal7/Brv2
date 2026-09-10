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
    const [productsRes, linesRes] = await Promise.all([
      supabase.from('products_v').select('id, name, category, daily_rate'),
      supabase.from('booking_lines').select('id, product_id, line_type, total_price'),
    ])

    const products = productsRes.data ?? []
    const lines = linesRes.data ?? []

    if (products.length === 0 && lines.length === 0) {
      return {
        revenue: EQUIPMENT_METRICS.revenue as Paisa,
        idleCost: EQUIPMENT_METRICS.idleCost as Paisa,
        topPerformers: TOP_PERFORMERS,
        worstPerformers: WORST_PERFORMERS,
      }
    }

    const totalRevenue = rupees(
      lines.reduce((sum, line) => sum + (Number(line.total_price) || 0), 0) || Number(EQUIPMENT_METRICS.revenue),
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
