import { supabase } from '../supabase'
import { INVENTORY_METRICS, ASSET_HEALTH, TOP_CATEGORIES } from '../../data/inventoryReports'

export { INVENTORY_METRICS, ASSET_HEALTH, TOP_CATEGORIES }

export interface InventoryReportSummary {
  totalAssets: number
  utilization: number
  available: number
  inventoryAccuracy: number
  assetHealth: typeof ASSET_HEALTH
  topCategories: typeof TOP_CATEGORIES
}

export async function getInventoryReportSummary(): Promise<InventoryReportSummary> {
  try {
    const [itemsRes, productsRes] = await Promise.all([
      supabase.from('inventory_items').select('id, status, is_rentable'),
      supabase.from('products_v').select('id, name, category, daily_rate'),
    ])

    const items = itemsRes.data ?? []
    const products = productsRes.data ?? []

    if (items.length === 0 && products.length === 0) {
      return {
        ...INVENTORY_METRICS,
        assetHealth: ASSET_HEALTH,
        topCategories: TOP_CATEGORIES,
      }
    }

    const totalAssets = items.length || INVENTORY_METRICS.totalAssets
    const available = items.filter((i) => i.status === 'Available').length || INVENTORY_METRICS.available
    const onRent = items.filter((i) => i.status === 'On Rent').length
    const utilization = totalAssets > 0 ? Math.round((onRent / totalAssets) * 1000) / 10 : INVENTORY_METRICS.utilization

    return {
      totalAssets,
      utilization,
      available,
      inventoryAccuracy: INVENTORY_METRICS.inventoryAccuracy,
      assetHealth: ASSET_HEALTH,
      topCategories: TOP_CATEGORIES,
    }
  } catch {
    return {
      ...INVENTORY_METRICS,
      assetHealth: ASSET_HEALTH,
      topCategories: TOP_CATEGORIES,
    }
  }
}
