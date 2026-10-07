import { describe, expect, it, vi } from 'vitest'

vi.mock('../../supabase', () => ({ supabase: {} }))

import { couponRowToResult } from '../couponLookup'

const row = {
  id: 'c1',
  code: 'THUNDER25',
  description: null,
  discount_percent: '25.00',
  min_booking_amount: '5000',
  valid_from: '2026-10-01',
  valid_until: '2026-10-31',
  max_redemptions: 10,
  current_redemptions: 3,
  is_active: true,
}

describe('couponRowToResult', () => {
  it('maps a live coupon row to a promo definition carrying the coupon id', () => {
    const r = couponRowToResult(row, '2026-10-07')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.promo.couponId).toBe('c1')
      expect(r.promo.discountPercent).toBe(25)
      expect(r.promo.minSpendPaisa).toBe(500000)
    }
  })
  it.each([
    ['inactive', { is_active: false }, '2026-10-07'],
    ['not yet valid', {}, '2026-09-30'],
    ['expired', {}, '2026-11-01'],
    ['redemption limit reached', { current_redemptions: 10 }, '2026-10-07'],
  ])('refuses %s', (_n, patch, today) => {
    expect(couponRowToResult({ ...row, ...patch }, today).ok).toBe(false)
  })
})
