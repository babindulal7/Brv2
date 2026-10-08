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
      .select('id, name, purchase_price')

    if (error) {
      return []
    }

    return (data ?? []).map((d) => ({
      name: d.name,
      ...(d.purchase_price != null ? { purchasePricePaisa: (Number(d.purchase_price) * 100) as Paisa } : {}),
    }))
  } catch {
    return []
  }
}
