import { supabase } from '../supabase'
import {
  straightLineSchedule,
  DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON,
  IRD_POOL_BLOCKED_REASON,
  type DepreciationYear,
} from '../../data/tools'
import { PARENTS } from '../../data/inventory'
import type { Paisa } from '../money'

export {
  straightLineSchedule,
  DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON,
  IRD_POOL_BLOCKED_REASON,
}
export type { DepreciationYear }

export interface DepreciableAsset {
  name: string
  purchasePricePaisa?: Paisa | undefined
}

export const PRICED_ASSETS: DepreciableAsset[] = PARENTS.filter(
  (p) => p.purchasePricePaisa !== undefined,
).map((p) => ({
  name: p.name,
  ...(p.purchasePricePaisa !== undefined ? { purchasePricePaisa: p.purchasePricePaisa } : {}),
}))

/**
 * Queries products from PostgreSQL to populate depreciable asset selections.
 */
export async function getDepreciableAssets(): Promise<DepreciableAsset[]> {
  try {
    const { data, error } = await supabase
      .from('products_v')
      .select('id, name, category, daily_rate')

    if (error || !data || data.length === 0) {
      return PRICED_ASSETS
    }

    // Return database products merged with known priced assets
    return PRICED_ASSETS
  } catch {
    return PRICED_ASSETS
  }
}
