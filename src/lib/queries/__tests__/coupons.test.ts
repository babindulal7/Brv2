// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('../../supabase', () => ({ IS_MOCK: true }))
import {
  getCouponStatus,
  listCoupons,
  validateCoupon,
  createCoupon,
  toggleCoupon,
  type Coupon,
} from '../coupons'

describe('coupons query and validation engine', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('getCouponStatus', () => {
    const activeSample: Coupon = {
      code: 'SUMMER',
      type: 'pct',
      value: 10,
      from: '2026-06-01',
      to: '2026-08-31',
      minBooking: 1000,
      capNpr: 5000,
      limit: 10,
      used: 0,
      perClient: 1,
      types: ['All'],
      cats: ['All'],
      stackable: true,
      by: 'Staff',
    }

    it('returns Active when within valid date range and below limit', () => {
      expect(getCouponStatus(activeSample, '2026-07-15')).toBe('Active')
    })

    it('returns Scheduled when today is before the start date', () => {
      expect(getCouponStatus(activeSample, '2026-05-15')).toBe('Scheduled')
    })

    it('returns Expired when today is after the end date', () => {
      expect(getCouponStatus(activeSample, '2026-09-01')).toBe('Expired')
    })

    it('returns Expired when usage has reached redemption limit', () => {
      expect(getCouponStatus({ ...activeSample, used: 10 }, '2026-07-15')).toBe('Expired')
    })

    it('returns Disabled when marked disabled', () => {
      expect(getCouponStatus({ ...activeSample, disabled: true }, '2026-07-15')).toBe('Disabled')
    })
  })

  describe('validateCoupon', () => {
    const mockToday = '2026-08-15'

    it('validates a valid percentage coupon and applies cap', () => {
      const res = validateCoupon('DASHAIN10', {
        today: mockToday,
        preTotal: 50000,
      })

      expect(res.ok).toBe(true)
      expect(res.coupon?.code).toBe('DASHAIN10')
      // 10% of 50000 = 5000, which is below cap 12000
      expect(res.amount).toBe(5000)
    })

    it('refuses invalid code syntax or empty input', () => {
      expect(validateCoupon('', { preTotal: 10000 }).empty).toBe(true)
      expect(validateCoupon('AB', { preTotal: 10000 }).reason).toContain('3 to 20 alphanumeric')
      expect(validateCoupon('NONEXISTENT_CODE_123', { preTotal: 10000 }).reason).toContain('not recognized')
    })

    it('refuses when booking subtotal is below minimum', () => {
      const res = validateCoupon('DASHAIN10', {
        today: mockToday,
        preTotal: 5000, // min is 15000
      })
      expect(res.ok).toBe(false)
      expect(res.reason).toContain('Requires a minimum booking subtotal')
    })

    it('enforces client type restrictions', () => {
      // PRODSTUDIO is restricted to ['Production Company', 'Commercial Agency']
      const res = validateCoupon('PRODSTUDIO', {
        today: mockToday,
        preTotal: 60000,
        clientType: 'Individual / Freelancer',
      })
      expect(res.ok).toBe(false)
      expect(res.reason).toContain('restricted to Production Company, Commercial Agency')
    })
  })

  describe('createCoupon and toggleCoupon', () => {
    it('allows a valid 40% voucher without the retired 25% ceiling', () => {
      createCoupon({ code: 'FORTY', type: 'pct', value: 40, from: '2026-01-01', to: '2026-12-31', minBooking: 0, capNpr: 0, limit: 100, perClient: 1, types: ['All'], cats: ['All'], stackable: true, by: 'Owner' })
      expect(validateCoupon('FORTY', { today: '2026-10-07', preTotal: 10000 }).amount).toBe(4000)
    })
    it('creates a new coupon and updates localStorage', () => {
      const created = createCoupon({
        code: 'NEWCODE',
        type: 'flat',
        value: 1000,
        from: '2026-10-01',
        to: '2026-12-31',
        minBooking: 5000,
        capNpr: 1000,
        limit: 50,
        perClient: 1,
        types: ['All'],
        cats: ['All'],
        stackable: false,
        by: 'Admin',
      })

      expect(created.code).toBe('NEWCODE')
      const all = listCoupons()
      expect(all.some((c) => c.code === 'NEWCODE')).toBe(true)
    })

    it('toggles coupon disabled state', () => {
      toggleCoupon('DASHAIN10')
      const all = listCoupons()
      const d = all.find((c) => c.code === 'DASHAIN10')
      expect(d?.disabled).toBe(true)
    })
  })
})
