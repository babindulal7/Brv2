import type { Slice } from '../components/ui/Charts'
import { rupees, formatMoney } from '../lib/money'
import type { Paisa } from '../lib/money'

export const METRICS = {
  promotionRevenue: rupees(2486500),
  discountsGiven: rupees(348200),
  redemptionRate: 55.4, // 842 / 1520
}

// 2486500 / 348200 = 7.14
export const RETURN_ON_PROMOTION = 7.14

// Net Impact
// Given: Rs 3,48,200
// Let's say Gained is Rs 10,00,000
// Net: Rs 6,51,800
export const IMPACT = {
  given: rupees(348200),
  gained: rupees(1000000), // example number, since the spec says "additional bookings × average value"
  net: rupees(651800)
}

export const COUPON_DONUT: Slice[] = [
  { label: 'Redeemed', value: 842, display: '842', percent: '55.4%' },
  { label: 'Expired', value: 512, display: '512', percent: '33.7%' },
  { label: 'Unused', value: 166, display: '166', percent: '10.9%' },
]

export const CLIENT_USAGE = [
  { type: 'Commercial', count: 420 },
  { type: 'Feature', count: 180 },
  { type: 'YouTube / Creator', count: 165 },
  { type: 'Education', count: 77 },
]

export const TOP_COUPONS = [
  { id: 'PRM-2026-0001', code: 'WINTER26', issued: 400, redeemed: 320, expiry: '2026-02-28', rop: 8.2 },
  { id: 'PRM-2026-0002', code: 'FESTIVAL', issued: 300, redeemed: 210, expiry: '2026-10-15', rop: 6.5 },
  { id: 'PRM-2026-0003', code: 'WELCOME10', issued: 500, redeemed: 190, expiry: 'Never', rop: 7.0 },
]

export const BUNDLE_ANALYSIS = [
  { name: 'Red Komodo Starter', bookings: 65, revenue: rupees(210000), discount: rupees(35000), rop: 6.0 },
  { name: 'Lighting Master', bookings: 42, revenue: rupees(125000), discount: rupees(18000), rop: 6.9 },
  { name: 'Podcast Audio', bookings: 21, revenue: rupees(77000), discount: rupees(8500), rop: 9.0 },
]

export const DISCOUNT_TYPES: Slice[] = [
  { label: 'Membership Discount', value: 12500000, display: formatMoney(rupees(125000) as Paisa), percent: '35.9%' },
  { label: 'Volume Discount', value: 9500000, display: formatMoney(rupees(95000) as Paisa), percent: '27.3%' },
  { label: 'Seasonal Coupon', value: 8500000, display: formatMoney(rupees(85000) as Paisa), percent: '24.4%' },
  { label: 'Partner Pricing', value: 4320000, display: formatMoney(rupees(43200) as Paisa), percent: '12.4%' }
]
