// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../supabase', () => ({ IS_MOCK: false }))
import { COUPON_SEED, listCoupons } from '../coupons'

beforeEach(() => localStorage.clear())
describe('live coupon registry', () => {
  it('keeps an empty registry empty', () => { expect(listCoupons()).toEqual([]) })
  it('omits unchanged legacy demo entries without deleting stored data', () => {
    const original = JSON.stringify(COUPON_SEED)
    localStorage.setItem('babin_coupons_v2', original)
    expect(listCoupons()).toEqual([])
    expect(localStorage.getItem('babin_coupons_v2')).toBe(original)
  })
  it('preserves custom or edited entries', () => {
    const custom = { ...COUPON_SEED[0]!, code: 'STAFF10', used: 0 }
    const edited = { ...COUPON_SEED[1]!, value: 650 }
    localStorage.setItem('babin_coupons_v2', JSON.stringify([COUPON_SEED[0], custom, edited]))
    expect(listCoupons()).toEqual([custom, edited])
  })
})
