import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import type { PromoCodeDefinition } from '../pricingPipeline'

/**
 * Resolve a promo code typed at checkout against the `coupons` table.
 *
 * RULING 2026-10-07: checkout reads the database only. The old in-code PROMO_CODES table
 * (NEPALFILM, MONSOON26 …) was demo data that applied discounts no coupon row backed.
 * RLS (0037) lets money-visible roles read `coupons`; anyone else gets "not found" — stricter wins.
 */
export type CouponLookupResult =
  | { ok: true; promo: PromoCodeDefinition }
  | { ok: false; reason: string }

interface CouponRow {
  id: string
  code: string
  description: string | null
  discount_percent: number | string
  min_booking_amount: number | string | null
  valid_from: string
  valid_until: string
  max_redemptions: number | null
  current_redemptions: number
  is_active: boolean
}

export function couponRowToResult(row: CouponRow, todayIso: string): CouponLookupResult {
  const code = row.code
  if (!row.is_active) return { ok: false, reason: `Promo code "${code}" is no longer active.` }
  if (row.valid_from > todayIso) return { ok: false, reason: `Promo code "${code}" is not valid until ${row.valid_from}.` }
  if (row.valid_until < todayIso) return { ok: false, reason: `Promo code "${code}" expired on ${row.valid_until}.` }
  if (row.max_redemptions != null && row.current_redemptions >= row.max_redemptions) {
    return { ok: false, reason: `Promo code "${code}" has reached its redemption limit.` }
  }
  const minRupees = Number(row.min_booking_amount ?? 0)
  const promo: PromoCodeDefinition = {
    code,
    couponId: row.id,
    discountPercent: Number(row.discount_percent),
    active: true,
    validFrom: row.valid_from,
    validTo: row.valid_until,
    ...(row.description ? { description: row.description } : {}),
    ...(minRupees > 0 ? { minSpendPaisa: rupees(minRupees) as Paisa } : {}),
  }
  return { ok: true, promo }
}

export async function lookupCouponByCode(rawCode: string, todayIso: string): Promise<CouponLookupResult> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { ok: false, reason: 'Enter a promo code.' }
  const { data, error } = await supabase
    .from('coupons')
    .select(
      'id, code, description, discount_percent, min_booking_amount, valid_from, valid_until, max_redemptions, current_redemptions, is_active',
    )
    .eq('code', code)
    .maybeSingle()
  if (error) return { ok: false, reason: 'Could not check the promo code. Try again.' }
  if (!data) return { ok: false, reason: `Promo code "${code}" is invalid or expired.` }
  return couponRowToResult(data as unknown as CouponRow, todayIso)
}
