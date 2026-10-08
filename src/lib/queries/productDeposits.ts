import { supabase } from '../supabase'
import { captureError } from '../monitoring'
import type { ProductDepositTerms } from '../productDeposit'

/**
 * Deposit terms for the products on a booking (C6, see `lib/productDeposit.ts`).
 *
 * Reads `products_v`, never `products`: `deposit_percent`, `deposit_fixed` and
 * `replacement_value` are money columns and the view masks them to `null` for a
 * money-blind session (Law 6). That `null` means "this session may not see it",
 * never "free" — `unitDepositPaisa` turns it into "asks for nothing", which
 * leaves the existing flat deposit rule standing.
 *
 * A failed read throws to the caller. Swallowing it here would silently weaken a
 * deposit to the flat rule with no one told; the caller decides how to say so.
 */

type Row = {
  id: string
  replacement_value: number | string | null
  deposit_percent: number | string | null
  deposit_fixed: number | string | null
}

const toPaisa = (v: number | string | null): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

const toNumber = (v: number | string | null): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function fetchProductDepositTerms(
  productIds: readonly string[],
): Promise<Map<string, ProductDepositTerms>> {
  const ids = [...new Set(productIds.filter(Boolean))]
  const out = new Map<string, ProductDepositTerms>()
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('products_v')
    .select('id, replacement_value, deposit_percent, deposit_fixed')
    .in('id', ids)

  if (error) {
    captureError(new Error(`product deposit read failed: ${error.message}`), { where: 'productDeposits.fetch' })
    throw new Error(error.message)
  }

  for (const row of (data ?? []) as unknown as Row[]) {
    out.set(row.id, {
      fixedPaisa: toPaisa(row.deposit_fixed),
      percent: toNumber(row.deposit_percent),
      replacementPaisa: toPaisa(row.replacement_value),
    })
  }
  return out
}
