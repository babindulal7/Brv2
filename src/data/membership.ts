import type { Kpi } from '../components/ui/Page'
import type { StatusKey } from '../lib/status'

/** Clients → Membership seed data — transcribed from render `4505348F`. */

export const TABS = ['Customers', 'Membership', 'Referral', 'Credit'] as const

export const KPIS: Kpi[] = [
  { label: 'Total Members', value: '23', icon: 'users', accent: 'primary', note: 'All registered tiers' },
  { label: 'Active', value: '17', icon: 'checklist', accent: 'success', note: 'Currently valid memberships' },
  { label: 'Expiring (≤30 days)', value: '3', icon: 'timer', accent: 'progress', note: 'Renewal action required' },
  { label: 'Annual Revenue', value: 'Rs 4,25,000', icon: 'dollar', accent: 'success', note: 'FY 2083/84 collections' },
]

export interface Plan {
  name: string
  badge: string
  badgeKey: StatusKey
  icon: 'crew' | 'eye' | 'users' | 'briefcase' | 'sparkles'
  price: string
  per?: string
  discounts: string[]
  limits: Array<{ label: string; value: string }>
  features: Array<{ text: string; kind: 'on' | 'off' | 'neutral' | 'pending' }>
  members: string
}

export const PLANS: Plan[] = [
  {
    name: 'Academy',
    badge: 'Access Member',
    badgeKey: 'primary',
    icon: 'crew',
    price: 'Rs 6,000',
    per: '/ year',
    discounts: ['10% Individual discount (max cap 25%)', '5% Bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: '3' },
      { label: 'Simultaneous Rental Limit', value: '1' },
      { label: 'Authorized Users', value: '1' },
      { label: 'Default Credit Limit', value: 'Rs 0' },
    ],
    features: [
      { text: 'Priority Support', kind: 'on' },
      { text: 'Standard Insurance Cover', kind: 'on' },
    ],
    members: '9 members',
  },
  {
    name: 'Creator',
    badge: 'Access Member',
    badgeKey: 'primary',
    icon: 'eye',
    price: 'Rs 15,000',
    per: '/ year',
    discounts: ['15% Individual discount (max cap 25%)', '7% Bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: '7' },
      { label: 'Simultaneous Rental Limit', value: '2' },
      { label: 'Authorized Users', value: '1' },
      { label: 'Default Credit Limit', value: 'Rs 0' },
    ],
    features: [
      { text: 'Priority Support', kind: 'off' },
      { text: 'Standard Insurance Cover', kind: 'on' },
    ],
    members: '7 members',
  },
  {
    name: 'Cinematographer',
    badge: 'Access Member',
    badgeKey: 'primary',
    icon: 'users',
    price: 'Rs 35,000',
    per: '/ year',
    discounts: ['20% Individual discount (max cap 25%)', '10% Bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: '10' },
      { label: 'Simultaneous Rental Limit', value: '3' },
      { label: 'Authorized Users', value: '2' },
      { label: 'Default Credit Limit', value: 'Rs 100,000' },
    ],
    features: [
      { text: 'Priority Support', kind: 'off' },
      { text: 'Standard Insurance Cover', kind: 'off' },
    ],
    members: '5 members',
  },
  {
    name: 'Production Alliance',
    badge: 'Partner',
    badgeKey: 'progress',
    icon: 'briefcase',
    price: 'Rs 80,000',
    per: '/ year',
    discounts: ['20% Individual discount (max cap 25%)', '12% Bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: '20' },
      { label: 'Simultaneous Rental Limit', value: '7' },
      { label: 'Authorized Users', value: '5' },
      { label: 'Default Credit Limit', value: 'Rs 250,000' },
    ],
    features: [
      { text: 'Priority Booking', kind: 'neutral' },
      { text: 'Dedicated Manager', kind: 'neutral' },
      { text: 'Company Billing', kind: 'neutral' },
      { text: 'Credit Terms Available', kind: 'neutral' },
    ],
    members: '2 members',
  },
  {
    name: 'Elite',
    badge: 'Elite Member',
    badgeKey: 'progress',
    icon: 'sparkles',
    price: 'Custom pricing',
    discounts: ['20% Individual discount (max cap 25%)', 'Custom bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: 'Unlimited' },
      { label: 'Simultaneous Rental Limit', value: 'Unlimited' },
      { label: 'Authorized Users', value: 'Unlimited' },
      { label: 'Default Credit Limit', value: 'Rs 500,000' },
    ],
    features: [
      { text: 'Dedicated Manager', kind: 'neutral' },
      { text: 'VIP Support', kind: 'neutral' },
      { text: 'Custom Solutions', kind: 'neutral' },
      { text: 'Company Billing & Credit Terms', kind: 'neutral' },
    ],
    members: '0 members',
  },
]

export const STACK_NOTE =
  'Individual + promotional discount stacking is capped at 25%. (e.g. Women DoP 5% + plan discount max 20%).'

export const CHIPS = [
  { label: 'All', count: '23' },
  { label: 'Active', count: '17' },
  { label: 'Expiring (≤30 days)', count: '3' },
  { label: 'Grace (≤30 days)', count: '2' },
  { label: 'Lapsed', count: '1' },
]

export interface MemberRow {
  name: string
  kind: string
  initials: string
  avatarBg: string
  level: string
  levelKey: StatusKey
  status: 'Active' | 'Lapsed'
  statusNote: string
  joinAd: string
  joinBs: string
  renewAd: string
  renewBs: string
  daysLeft: string
  overdue?: boolean
  fee: string
  savings: string
  savingsPct: string
  lifetime: string
  /** Usage against the plan's cap. Suspended means the benefit is withdrawn, not just full. */
  bookings: { text: string; pct: number; capped?: boolean; suspended?: boolean }
  rentals: { text: string; pct: number; capped?: boolean; suspended?: boolean }
  credit: string
  creditNote?: string
  creditStruck?: boolean
}

export const MEMBERS: MemberRow[] = [
  {
    name: 'ABC Films Pvt. Ltd.', kind: 'Production Company', initials: 'ABC', avatarBg: '#1a1a1a',
    level: 'Production Alliance', levelKey: 'progress', status: 'Active', statusNote: '(Expiring in 23d)',
    joinAd: '15 Jan 2025', joinBs: '2081-10-02 BS', renewAd: '05 Jan 2027', renewBs: '2083-09-21 BS',
    daysLeft: '157 days', fee: 'Rs 80,000', savings: 'Rs 62,000', savingsPct: '(14.8% of Rs 4.2L)',
    lifetime: 'Rs 4,20,000', bookings: { text: '18 / 20', pct: 90 }, rentals: { text: '2 / 7', pct: 29 },
    credit: 'Rs 200,000', creditNote: '(Default Rs 250,000)',
  },
  {
    name: 'Hari KC', kind: 'Filmmaker', initials: 'HK', avatarBg: '#7c2d12',
    level: 'Cinematographer', levelKey: 'primary', status: 'Active', statusNote: '(Expiring in 23d)',
    joinAd: '10 Feb 2024', joinBs: '2080-10-28 BS', renewAd: '05 Jan 2027', renewBs: '2083-09-21 BS',
    daysLeft: '157 days', fee: 'Rs 35,000', savings: 'Rs 62,000', savingsPct: '(14.8% of Rs 4.2L)',
    lifetime: 'Rs 4,20,000', bookings: { text: '7 / 10', pct: 70 }, rentals: { text: '2 / 3', pct: 67 },
    credit: 'Rs 50,000', creditNote: '(Default Rs 100,000)',
  },
  {
    name: 'Mountain Stories', kind: 'Production Company', initials: 'MS', avatarBg: '#0f2942',
    level: 'Creator', levelKey: 'in', status: 'Active', statusNote: '(Expiring in 19d)',
    joinAd: '18 Mar 2024', joinBs: '2080-12-05 BS', renewAd: '18 Mar 2027', renewBs: '2083-12-04 BS',
    daysLeft: '229 days', fee: 'Rs 15,000', savings: 'Rs 18,000', savingsPct: '(10.0% of Rs 1.8L)',
    lifetime: 'Rs 1,80,000', bookings: { text: '7 / 7', pct: 100, capped: true }, rentals: { text: '2 / 2', pct: 100, capped: true },
    credit: 'Rs 0',
  },
  {
    name: 'Oscar College', kind: 'Educational Institution', initials: 'OC', avatarBg: '#4c1d95',
    level: 'Academy', levelKey: 'in', status: 'Active', statusNote: '(Expiring in 23d)',
    joinAd: '05 Jan 2026', joinBs: '2082-09-21 BS', renewAd: '05 Jan 2027', renewBs: '2083-09-21 BS',
    daysLeft: '157 days', fee: 'Rs 6,000', savings: 'Rs 4,200', savingsPct: '(10.0% of Rs 42K)',
    lifetime: 'Rs 42,000', bookings: { text: '2 / 3', pct: 67 }, rentals: { text: '1 / 1', pct: 100, capped: true },
    credit: 'Rs 0',
  },
  {
    name: 'Vision Production House', kind: 'Production Company', initials: 'V', avatarBg: '#1e3a5f',
    level: 'Production Alliance', levelKey: 'progress', status: 'Lapsed', statusNote: '(181 days overdue)',
    joinAd: '01 Feb 2025', joinBs: '2081-10-19 BS', renewAd: '01 Feb 2026', renewBs: '2082-10-19 BS',
    daysLeft: '-181 days', overdue: true, fee: 'Rs 80,000', savings: 'Rs 165,000', savingsPct: '(16.8% of Rs 9.8L)',
    lifetime: 'Rs 9,80,000', bookings: { text: '0 / 20', pct: 0, suspended: true }, rentals: { text: '0 / 7', pct: 0, suspended: true },
    credit: 'Rs 0', creditNote: 'Rs 200,000', creditStruck: true,
  },
]

export const LEGEND = [
  { text: 'Active', tone: 'success' as const },
  { text: 'Expiring (≤30 days)', tone: 'progress' as const },
  { text: 'Grace (≤30 days)', tone: 'primary' as const },
  { text: 'Lapsed (>30 days overdue)', tone: 'danger' as const },
]

export const SHOWING = 'Showing 1 to 5 of 23 members'
