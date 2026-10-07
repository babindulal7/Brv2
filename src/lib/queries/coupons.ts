/**
 * Canonical Coupons & Promotions Engine — Babin Rentals OS
 *
 * Ported from standalone (script_1.js:2310-2360, 2410-2440).
 * Implements arithmetic discount validation (0–100%),
 * code redemption tracking, and lifecycle status.
 */

import { getBusinessToday } from '../bs'
import { IS_MOCK } from '../supabase'
import { formatMoney, rupees } from '../money'

export interface Coupon {
  code: string
  type: 'pct' | 'flat'
  value: number // percentage (e.g. 10) or flat NPR (e.g. 500)
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
  minBooking: number // Minimum booking preTotal in NPR
  capNpr: number // Maximum discount allowed in NPR
  limit: number // Maximum redemptions
  used: number // Current redemptions count
  perClient: number // Limit per client
  types: string[] // Applicable client types, e.g. ['All'] or ['Student', 'College/Institution']
  cats: string[] // Applicable categories, e.g. ['All']
  stackable: boolean // Can combine with tier discounts
  by: string // Author
  disabled?: boolean
}

export type CouponStatus = 'Active' | 'Expired' | 'Scheduled' | 'Disabled'

export interface CouponValidationContext {
  today?: string
  preTotal: number // Booking subtotal in NPR
  clientType?: string
  tiers?: number[] // existing discount percentages applied
}

export interface CouponValidationResult {
  ok: boolean
  empty?: boolean
  code?: string
  amount: number // Calculated discount in NPR
  reason?: string
  status?: CouponStatus
  coupon?: Coupon
}

const STORAGE_KEY = 'babin_coupons_v2'

export const COUPON_SEED: Coupon[] = [
  {
    code: 'DASHAIN10',
    type: 'pct',
    value: 10,
    from: '2026-07-01',
    to: '2026-10-15',
    minBooking: 15000,
    capNpr: 12000,
    limit: 100,
    perClient: 1,
    types: ['All'],
    cats: ['All'],
    stackable: true,
    used: 34,
    by: 'Babin Dulal',
  },
  {
    code: 'STUDENT500',
    type: 'flat',
    value: 500,
    from: '2026-01-01',
    to: '2026-12-31',
    minBooking: 5000,
    capNpr: 500,
    limit: 500,
    perClient: 3,
    types: ['Student', 'Educational Institution', 'College/Institution'],
    cats: ['All'],
    stackable: false,
    used: 112,
    by: 'Rita Manandhar',
  },
  {
    code: 'MONSOON15',
    type: 'pct',
    value: 15,
    from: '2026-06-01',
    to: '2026-09-30',
    minBooking: 25000,
    capNpr: 20000,
    limit: 50,
    perClient: 1,
    types: ['All'],
    cats: ['All'],
    stackable: true,
    used: 39,
    by: 'Babin Dulal',
  },
  {
    code: 'NEWHOUSE',
    type: 'pct',
    value: 8,
    from: '2026-05-01',
    to: '2026-09-30',
    minBooking: 0,
    capNpr: 8000,
    limit: 25,
    perClient: 1,
    types: ['Production Company', 'Production House', 'Rental House'],
    cats: ['All'],
    stackable: true,
    used: 3,
    by: 'Rita Manandhar',
    disabled: true,
  },
  {
    code: 'WELCOME10',
    type: 'pct',
    value: 10,
    from: '2026-01-01',
    to: '2026-12-31',
    minBooking: 10000,
    capNpr: 5000,
    limit: 200,
    perClient: 1,
    types: ['All'],
    cats: ['All'],
    stackable: true,
    used: 78,
    by: 'Babin Dulal',
  },
  {
    code: 'PRODSTUDIO',
    type: 'pct',
    value: 12,
    from: '2026-04-01',
    to: '2026-11-30',
    minBooking: 35000,
    capNpr: 25000,
    limit: 40,
    perClient: 2,
    types: ['Production Company', 'Commercial Agency'],
    cats: ['All'],
    stackable: true,
    used: 18,
    by: 'Bikash Sharma',
  },
]

export function getCouponStatus(c: Coupon, todayIso?: string): CouponStatus {
  const today = todayIso || getBusinessToday().toISOString().slice(0, 10)
  if (c.disabled) return 'Disabled'
  if (c.to < today) return 'Expired'
  if (c.limit && c.used >= c.limit) return 'Expired'
  if (c.from > today) return 'Scheduled'
  return 'Active'
}

export function listCoupons(): Coupon[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return IS_MOCK ? [...COUPON_SEED] : []
      }
      const saved = JSON.parse(raw) as Coupon[]
      // Live reads omit unchanged demo entries left by earlier releases; storage is preserved.
      return IS_MOCK ? saved : saved.filter((coupon) => !COUPON_SEED.some((seed) =>
        Object.keys(seed).length === Object.keys(coupon).length &&
        Object.entries(seed).every(([key, value]) => JSON.stringify(value) === JSON.stringify(coupon[key as keyof Coupon])),
      ))
    }
    return IS_MOCK ? [...COUPON_SEED] : []
  } catch {
    return IS_MOCK ? [...COUPON_SEED] : []
  }
}

export function saveCoupons(coupons: Coupon[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(coupons))
    }
  } catch (err) {
    console.error('Failed to save coupons', err)
  }
}

export function validateCoupon(rawCode: string, ctx: CouponValidationContext): CouponValidationResult {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) return { ok: false, empty: true, amount: 0 }
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
    return { ok: false, amount: 0, reason: 'Codes must be 3 to 20 alphanumeric characters.' }
  }

  const coupons = listCoupons()
  const coupon = coupons.find(c => c.code.toUpperCase() === code)
  if (!coupon) {
    return { ok: false, amount: 0, reason: 'Promo code not recognized or invalid.' }
  }

  const today = ctx.today || getBusinessToday().toISOString().slice(0, 10)
  const status = getCouponStatus(coupon, today)

  if (status === 'Disabled') {
    return { ok: false, amount: 0, reason: 'That code has been deactivated by management.', status, coupon }
  }
  if (coupon.to < today) {
    return { ok: false, amount: 0, reason: `That code expired on ${coupon.to}.`, status: 'Expired', coupon }
  }
  if (coupon.from > today) {
    return { ok: false, amount: 0, reason: `That code is scheduled to activate on ${coupon.from}.`, status: 'Scheduled', coupon }
  }
  if (coupon.limit && coupon.used >= coupon.limit) {
    return { ok: false, amount: 0, reason: 'That code has reached its total redemption limit.', status: 'Expired', coupon }
  }
  if (ctx.preTotal < coupon.minBooking) {
    return {
      ok: false,
      amount: 0,
      reason: `Requires a minimum booking subtotal of ${formatMoney(rupees(coupon.minBooking))}.`,
      status,
      coupon,
    }
  }
  if (coupon.types.indexOf('All') === -1 && ctx.clientType && coupon.types.indexOf(ctx.clientType) === -1) {
    return {
      ok: false,
      amount: 0,
      reason: `Code is restricted to ${coupon.types.join(', ')} clients only.`,
      status,
      coupon,
    }
  }

  if (!coupon.stackable && (ctx.tiers || []).length > 0) {
    return {
      ok: false,
      amount: 0,
      reason: `${coupon.code} cannot be combined with existing tier discounts.`,
      status,
      coupon,
    }
  }

  let rawAmount = 0
  if (coupon.type === 'flat') {
    rawAmount = Math.min(coupon.value, ctx.preTotal)
  } else {
    rawAmount = Math.round((ctx.preTotal * coupon.value) / 100)
  }

  if (coupon.capNpr > 0 && rawAmount > coupon.capNpr) {
    rawAmount = coupon.capNpr
  }

  // Discount cap removed 20 Aug, confirmed 31 Aug. A voucher may retain its own NPR ceiling.
  const finalAmount = Math.min(rawAmount, ctx.preTotal)

  return {
    ok: true,
    code: coupon.code,
    amount: finalAmount,
    status,
    coupon,
  }
}

export function recordCouponUse(code: string): boolean {
  const coupons = listCoupons()
  const idx = coupons.findIndex(c => c.code.toUpperCase() === code.toUpperCase())
  if (idx === -1) return false
  const updated = [...coupons]
  const target = updated[idx]
  if (target) {
    updated[idx] = {
      ...target,
      used: (target.used || 0) + 1,
    }
    saveCoupons(updated)
    return true
  }
  return false
}

export function toggleCoupon(code: string): boolean {
  const coupons = listCoupons()
  const idx = coupons.findIndex(c => c.code.toUpperCase() === code.toUpperCase())
  if (idx === -1) return false
  const updated = [...coupons]
  const target = updated[idx]
  if (target) {
    updated[idx] = {
      ...target,
      disabled: !target.disabled,
    }
    saveCoupons(updated)
    return true
  }
  return false
}

export function createCoupon(newCoupon: Omit<Coupon, 'used'> & { used?: number }): Coupon {
  const coupons = listCoupons()
  const sanitized: Coupon = {
    ...newCoupon,
    code: newCoupon.code.trim().toUpperCase(),
    used: newCoupon.used ?? 0,
  }
  const exists = coupons.some(c => c.code === sanitized.code)
  if (exists) {
    throw new Error(`A coupon with code ${sanitized.code} already exists.`)
  }
  const updated = [sanitized, ...coupons]
  saveCoupons(updated)
  return sanitized
}
