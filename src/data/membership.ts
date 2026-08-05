import type { Kpi } from '../components/ui/Page'
import type { StatusKey, BrandKey } from '../lib/status'
import { formatMoney, rupees, type Paisa } from '../lib/money'
import { TIER_TONE, type MembershipTier } from './clients'

/**
 * Clients → **Membership** seed data, transcribed from renders
 * `Clients - Memberships.PNG` and `Clients - Memberships Tab.PNG`.
 *
 * Two corrections against the renders:
 *   - the first tab reads **Clients**, never "Customers" (CLAUDE.md hard rule);
 *   - member avatars carry a status token, not a per-row hex. One of the
 *     render's avatars is violet, which Foundation §4.2 bans outright.
 */

export const TABS = ['Clients', 'Membership', 'Referral', 'Credit'] as const
export type MembershipTab = (typeof TABS)[number]

/* ── members ───────────────────────────────────────────────────────────── */

/**
 * The four buckets are **disjoint** — the render's chip counts add up to the
 * total, so a member expiring inside 30 days is counted under Expiring and not
 * also under Active.
 */
export type MemberBucket = 'Active' | 'Expiring' | 'Grace' | 'Lapsed'

export const BUCKETS: readonly MemberBucket[] = ['Active', 'Expiring', 'Grace', 'Lapsed']

export const BUCKET_TONE: Record<MemberBucket, BrandKey> = {
  Active: 'success',
  Expiring: 'progress',
  Grace: 'primary',
  Lapsed: 'danger',
}

/** A cap and how much of it is used. `suspended` means withdrawn, not merely full. */
export interface Usage {
  text: string
  pct: number
  capped?: boolean
  suspended?: boolean
}

export interface MemberRow {
  id: string
  name: string
  kind: string
  initials: string
  /** §4.2 — a status token, so the theme decides the tint. Never a hex. */
  avatarTone: StatusKey
  level: MembershipTier
  bucket: MemberBucket
  /** The parenthetical under the status pill, e.g. "(Expiring in 23d)". */
  statusNote: string
  joinAd: string
  joinBs: string
  renewAd: string
  renewBs: string
  /** Negative once the renewal date has passed. */
  daysLeft: number
  feePaisa: Paisa
  savingsPaisa: Paisa
  /** "14.8% of Rs 4.2L" — the comparison the render prints under the saving. */
  savingsNote: string
  lifetimePaisa: Paisa
  bookings: Usage
  rentals: Usage
  creditPaisa: Paisa
  /** The plan default, shown when the approved limit differs from it. */
  creditDefaultPaisa?: Paisa
  /** Lapsed members keep the figure struck through, not deleted. */
  creditWithdrawn?: boolean
}

export const MEMBERS: MemberRow[] = [
  {
    id: 'MB-2083-001',
    name: 'ABC Films Pvt. Ltd.', kind: 'Production Company', initials: 'AB', avatarTone: 'neutral',
    level: 'Production Alliance', bucket: 'Expiring', statusNote: 'Expiring in 23d',
    joinAd: '15 Jan 2025', joinBs: '2081-10-02 BS', renewAd: '05 Jan 2027', renewBs: '2083-09-21 BS',
    daysLeft: 23, feePaisa: rupees(80000), savingsPaisa: rupees(62000), savingsNote: '14.8% of Rs 4.2L',
    lifetimePaisa: rupees(420000), bookings: { text: '18 / 20', pct: 90 }, rentals: { text: '2 / 7', pct: 29 },
    creditPaisa: rupees(200000), creditDefaultPaisa: rupees(250000),
  },
  {
    id: 'MB-2083-002',
    name: 'Hari KC', kind: 'Filmmaker', initials: 'HK', avatarTone: 'primary',
    level: 'Cinematographer', bucket: 'Expiring', statusNote: 'Expiring in 23d',
    joinAd: '10 Feb 2024', joinBs: '2080-10-28 BS', renewAd: '05 Jan 2027', renewBs: '2083-09-21 BS',
    daysLeft: 23, feePaisa: rupees(35000), savingsPaisa: rupees(62000), savingsNote: '14.8% of Rs 4.2L',
    lifetimePaisa: rupees(420000), bookings: { text: '7 / 10', pct: 70 }, rentals: { text: '2 / 3', pct: 67 },
    creditPaisa: rupees(50000), creditDefaultPaisa: rupees(100000),
  },
  {
    id: 'MB-2083-003',
    name: 'Mountain Stories', kind: 'Production Company', initials: 'MS', avatarTone: 'in',
    level: 'Creator', bucket: 'Expiring', statusNote: 'Expiring in 19d',
    joinAd: '18 Mar 2024', joinBs: '2080-12-05 BS', renewAd: '18 Mar 2027', renewBs: '2083-12-04 BS',
    daysLeft: 19, feePaisa: rupees(15000), savingsPaisa: rupees(18000), savingsNote: '10.0% of Rs 1.8L',
    lifetimePaisa: rupees(180000), bookings: { text: '7 / 7', pct: 100, capped: true }, rentals: { text: '2 / 2', pct: 100, capped: true },
    creditPaisa: rupees(0),
  },
  {
    id: 'MB-2083-004',
    name: 'Oscar College', kind: 'Educational Institution', initials: 'OC', avatarTone: 'neutral',
    level: 'Academy', bucket: 'Active', statusNote: 'Renews in 157d',
    joinAd: '05 Jan 2026', joinBs: '2082-09-21 BS', renewAd: '05 Jan 2027', renewBs: '2083-09-21 BS',
    daysLeft: 157, feePaisa: rupees(6000), savingsPaisa: rupees(4200), savingsNote: '10.0% of Rs 42K',
    lifetimePaisa: rupees(42000), bookings: { text: '2 / 3', pct: 67 }, rentals: { text: '1 / 1', pct: 100, capped: true },
    creditPaisa: rupees(0),
  },
  {
    id: 'MB-2083-005',
    name: 'Vision Production House', kind: 'Production Company', initials: 'VP', avatarTone: 'danger',
    level: 'Production Alliance', bucket: 'Lapsed', statusNote: '181 days overdue',
    joinAd: '01 Feb 2025', joinBs: '2081-10-19 BS', renewAd: '01 Feb 2026', renewBs: '2082-10-19 BS',
    daysLeft: -181, feePaisa: rupees(80000), savingsPaisa: rupees(165000), savingsNote: '16.8% of Rs 9.8L',
    lifetimePaisa: rupees(980000), bookings: { text: '0 / 20', pct: 0, suspended: true }, rentals: { text: '0 / 7', pct: 0, suspended: true },
    creditPaisa: rupees(0), creditDefaultPaisa: rupees(200000), creditWithdrawn: true,
  },
  {
    id: 'MB-2083-006',
    name: 'Kathmandu Cinema Works', kind: 'Production Company', initials: 'KC', avatarTone: 'progress',
    level: 'Production Alliance', bucket: 'Active', statusNote: 'Renews in 211d',
    joinAd: '02 Sep 2024', joinBs: '2081-05-17 BS', renewAd: '26 Feb 2027', renewBs: '2083-11-14 BS',
    daysLeft: 211, feePaisa: rupees(80000), savingsPaisa: rupees(212000), savingsNote: '16.9% of Rs 12.5L',
    lifetimePaisa: rupees(1250000), bookings: { text: '12 / 20', pct: 60 }, rentals: { text: '2 / 7', pct: 29 },
    creditPaisa: rupees(500000), creditDefaultPaisa: rupees(250000),
  },
  {
    id: 'MB-2083-007',
    name: 'Himalayan Mountain Media', kind: 'Broadcaster', initials: 'HM', avatarTone: 'out',
    level: 'Elite', bucket: 'Active', statusNote: 'Renews in 289d',
    joinAd: '14 May 2023', joinBs: '2080-01-31 BS', renewAd: '15 May 2027', renewBs: '2084-02-01 BS',
    daysLeft: 289, feePaisa: rupees(150000), savingsPaisa: rupees(486000), savingsNote: '18.0% of Rs 27L',
    lifetimePaisa: rupees(2700000), bookings: { text: '9 / ∞', pct: 30 }, rentals: { text: '3 / ∞', pct: 22 },
    creditPaisa: rupees(1000000), creditDefaultPaisa: rupees(500000),
  },
  {
    id: 'MB-2083-008',
    name: 'Red Dot Films', kind: 'Production Company', initials: 'RD', avatarTone: 'out',
    level: 'Elite', bucket: 'Active', statusNote: 'Renews in 96d',
    joinAd: '04 Nov 2023', joinBs: '2080-07-18 BS', renewAd: '04 Nov 2026', renewBs: '2083-07-18 BS',
    daysLeft: 96, feePaisa: rupees(150000), savingsPaisa: rupees(392000), savingsNote: '17.4% of Rs 22.5L',
    lifetimePaisa: rupees(2250000), bookings: { text: '7 / ∞', pct: 24 }, rentals: { text: '2 / ∞', pct: 15 },
    creditPaisa: rupees(800000), creditDefaultPaisa: rupees(500000),
  },
  {
    id: 'MB-2083-009',
    name: 'ICIMOD Communications', kind: 'NGO', initials: 'IC', avatarTone: 'primary',
    level: 'Production Alliance', bucket: 'Grace', statusNote: 'In grace — 12d left',
    joinAd: '20 Jul 2022', joinBs: '2079-04-04 BS', renewAd: '08 Jul 2026', renewBs: '2083-03-24 BS',
    daysLeft: -12, feePaisa: rupees(80000), savingsPaisa: rupees(96000), savingsNote: '14.2% of Rs 6.8L',
    lifetimePaisa: rupees(680000), bookings: { text: '5 / 20', pct: 25 }, rentals: { text: '1 / 7', pct: 14 },
    creditPaisa: rupees(250000),
  },
  {
    id: 'MB-2083-010',
    name: 'Nepal Tourism Board', kind: 'Government', initials: 'NT', avatarTone: 'progress',
    level: 'Production Alliance', bucket: 'Active', statusNote: 'Renews in 134d',
    joinAd: '12 Dec 2024', joinBs: '2081-08-27 BS', renewAd: '12 Dec 2026', renewBs: '2083-08-27 BS',
    daysLeft: 134, feePaisa: rupees(80000), savingsPaisa: rupees(74000), savingsNote: '13.1% of Rs 5.6L',
    lifetimePaisa: rupees(560000), bookings: { text: '3 / 20', pct: 15 }, rentals: { text: '0 / 7', pct: 0 },
    creditPaisa: rupees(800000), creditDefaultPaisa: rupees(250000),
  },
  {
    id: 'MB-2083-011',
    name: 'Bikram Rai', kind: 'Freelance DoP', initials: 'BR', avatarTone: 'primary',
    level: 'Cinematographer', bucket: 'Active', statusNote: 'Renews in 178d',
    joinAd: '25 Jan 2024', joinBs: '2080-10-11 BS', renewAd: '25 Jan 2027', renewBs: '2083-10-11 BS',
    daysLeft: 178, feePaisa: rupees(35000), savingsPaisa: rupees(41000), savingsNote: '12.4% of Rs 3.3L',
    lifetimePaisa: rupees(330000), bookings: { text: '6 / 10', pct: 60 }, rentals: { text: '1 / 3', pct: 33 },
    creditPaisa: rupees(150000), creditDefaultPaisa: rupees(100000),
  },
  {
    id: 'MB-2083-012',
    name: 'Sushil Lama Visuals', kind: 'Freelancer', initials: 'SL', avatarTone: 'in',
    level: 'Creator', bucket: 'Grace', statusNote: 'In grace — 4d left',
    joinAd: '16 Jun 2023', joinBs: '2080-03-01 BS', renewAd: '16 Jun 2026', renewBs: '2083-03-01 BS',
    daysLeft: -26, feePaisa: rupees(15000), savingsPaisa: rupees(11000), savingsNote: '10.2% of Rs 1.1L',
    lifetimePaisa: rupees(108000), bookings: { text: '4 / 7', pct: 57 }, rentals: { text: '1 / 2', pct: 50 },
    creditPaisa: rupees(0),
  },
  {
    id: 'MB-2083-013',
    name: 'Apex College Media Club', kind: 'Educational Institution', initials: 'AC', avatarTone: 'neutral',
    level: 'Academy', bucket: 'Active', statusNote: 'Renews in 243d',
    joinAd: '01 Apr 2026', joinBs: '2082-12-19 BS', renewAd: '01 Apr 2027', renewBs: '2083-12-18 BS',
    daysLeft: 243, feePaisa: rupees(6000), savingsPaisa: rupees(3100), savingsNote: '10.0% of Rs 31K',
    lifetimePaisa: rupees(31000), bookings: { text: '1 / 3', pct: 33 }, rentals: { text: '0 / 1', pct: 0 },
    creditPaisa: rupees(0),
  },
  {
    id: 'MB-2083-014',
    name: 'Kathmandu University', kind: 'Educational Institution', initials: 'KU', avatarTone: 'neutral',
    level: 'Academy', bucket: 'Active', statusNote: 'Renews in 61d',
    joinAd: '30 Sep 2025', joinBs: '2082-06-14 BS', renewAd: '30 Sep 2026', renewBs: '2083-06-14 BS',
    daysLeft: 61, feePaisa: rupees(6000), savingsPaisa: rupees(9200), savingsNote: '10.0% of Rs 92K',
    lifetimePaisa: rupees(92000), bookings: { text: '3 / 3', pct: 100, capped: true }, rentals: { text: '1 / 1', pct: 100, capped: true },
    creditPaisa: rupees(0),
  },
]

/* ── derived counters ──────────────────────────────────────────────────── */

export function countByBucket(rows: MemberRow[], bucket: MemberBucket): number {
  return rows.filter((m) => m.bucket === bucket).length
}

/** Paisa are integers, so a plain sum is exact — no rounding decision is taken here. */
export function totalFeesPaisa(rows: MemberRow[]): Paisa {
  return rows.reduce((sum, m) => (sum + m.feePaisa) as Paisa, rupees(0))
}

/**
 * Six cards with money, five without. Foundation §8.3 — Warehouse never sees a
 * rupee figure, so the revenue card is **absent**, not blanked.
 */
export function kpisFor(rows: MemberRow[], canSeeMoney: boolean): Kpi[] {
  const cards: Kpi[] = [
    { label: 'Total Members', value: String(rows.length), icon: 'users', accent: 'primary', note: 'All members (all statuses)' },
    { label: 'Active', value: String(countByBucket(rows, 'Active')), icon: 'checklist', accent: 'success', note: 'Currently valid memberships' },
    { label: 'Expiring (≤30 days)', value: String(countByBucket(rows, 'Expiring')), icon: 'calendar_due', accent: 'progress', note: 'Renewal action required' },
    { label: 'Grace (≤30 days)', value: String(countByBucket(rows, 'Grace')), icon: 'timer', accent: 'primary', note: 'Benefits active in grace' },
    { label: 'Lapsed', value: String(countByBucket(rows, 'Lapsed')), icon: 'error', accent: 'danger', note: 'Benefits suspended' },
  ]
  if (!canSeeMoney) return cards
  return [
    ...cards,
    {
      label: 'Membership Revenue',
      value: formatMoney(totalFeesPaisa(rows)),
      icon: 'dollar',
      accent: 'success',
      note: 'FY 2083/84 — based on fees paid',
    },
  ]
}

/* ── quick-filter chips ────────────────────────────────────────────────── */

export interface MemberChip {
  label: string
  /** `null` is the "All" chip. */
  bucket: MemberBucket | null
  count: number
}

export function chipsFor(rows: MemberRow[]): MemberChip[] {
  return [
    { label: 'All', bucket: null, count: rows.length },
    { label: 'Active', bucket: 'Active', count: countByBucket(rows, 'Active') },
    { label: 'Expiring (≤30 days)', bucket: 'Expiring', count: countByBucket(rows, 'Expiring') },
    { label: 'Grace (≤30 days)', bucket: 'Grace', count: countByBucket(rows, 'Grace') },
    { label: 'Lapsed', bucket: 'Lapsed', count: countByBucket(rows, 'Lapsed') },
  ]
}

/* ── plans ─────────────────────────────────────────────────────────────── */

export interface Plan {
  name: MembershipTier
  badge: string
  badgeKey: StatusKey
  icon: 'crew' | 'eye' | 'users' | 'briefcase' | 'sparkles'
  price: string
  per?: string
  discounts: string[]
  limits: Array<{ label: string; value: string; money?: boolean }>
  features: Array<{ text: string; kind: 'on' | 'off' | 'neutral' | 'pending' }>
}

export const PLANS: Plan[] = [
  {
    name: 'Academy',
    badge: 'Access Member',
    badgeKey: TIER_TONE.Academy,
    icon: 'crew',
    price: 'Rs 6,000',
    per: '/ year',
    discounts: ['10% Individual discount (max cap 25%)', '5% Bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: '3' },
      { label: 'Simultaneous Rental Limit', value: '1' },
      { label: 'Authorized Users', value: '1' },
      { label: 'Default Credit Limit', value: 'Rs 0', money: true },
    ],
    features: [
      { text: 'Priority Support', kind: 'on' },
      { text: 'Standard Insurance Cover', kind: 'on' },
    ],
  },
  {
    name: 'Creator',
    badge: 'Access Member',
    badgeKey: TIER_TONE.Creator,
    icon: 'eye',
    price: 'Rs 15,000',
    per: '/ year',
    discounts: ['15% Individual discount (max cap 25%)', '7% Bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: '7' },
      { label: 'Simultaneous Rental Limit', value: '2' },
      { label: 'Authorized Users', value: '1' },
      { label: 'Default Credit Limit', value: 'Rs 0', money: true },
    ],
    features: [
      { text: 'Priority Support', kind: 'off' },
      { text: 'Standard Insurance Cover', kind: 'on' },
    ],
  },
  {
    name: 'Cinematographer',
    badge: 'Access Member',
    badgeKey: TIER_TONE.Cinematographer,
    icon: 'users',
    price: 'Rs 35,000',
    per: '/ year',
    discounts: ['20% Individual discount (max cap 25%)', '10% Bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: '10' },
      { label: 'Simultaneous Rental Limit', value: '3' },
      { label: 'Authorized Users', value: '2' },
      { label: 'Default Credit Limit', value: 'Rs 1,00,000', money: true },
    ],
    features: [
      { text: 'Priority Support', kind: 'off' },
      { text: 'Standard Insurance Cover', kind: 'off' },
    ],
  },
  {
    name: 'Production Alliance',
    badge: 'Partner',
    badgeKey: TIER_TONE['Production Alliance'],
    icon: 'briefcase',
    price: 'Rs 80,000',
    per: '/ year',
    discounts: ['20% Individual discount (max cap 25%)', '12% Bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: '20' },
      { label: 'Simultaneous Rental Limit', value: '7' },
      { label: 'Authorized Users', value: '5' },
      { label: 'Default Credit Limit', value: 'Rs 2,50,000', money: true },
    ],
    features: [
      { text: 'Priority Booking', kind: 'neutral' },
      { text: 'Dedicated Manager', kind: 'neutral' },
      { text: 'Company Billing', kind: 'neutral' },
      { text: 'Credit Terms Available', kind: 'neutral' },
    ],
  },
  {
    name: 'Elite',
    badge: 'Elite Member',
    badgeKey: TIER_TONE.Elite,
    icon: 'sparkles',
    price: 'Custom pricing',
    discounts: ['20% Individual discount (max cap 25%)', 'Custom bundle discount'],
    limits: [
      { label: 'Monthly Booking Limit', value: 'Unlimited' },
      { label: 'Simultaneous Rental Limit', value: 'Unlimited' },
      { label: 'Authorized Users', value: 'Unlimited' },
      { label: 'Default Credit Limit', value: 'Rs 5,00,000', money: true },
    ],
    features: [
      { text: 'Dedicated Manager', kind: 'neutral' },
      { text: 'VIP Support', kind: 'neutral' },
      { text: 'Custom Solutions', kind: 'neutral' },
      { text: 'Company Billing & Credit Terms', kind: 'neutral' },
    ],
  },
]

/** Row labels for the Comparison Table view of the same five plans. */
export interface ComparisonRow {
  label: string
  pick: (p: Plan) => string
  /** Rupee-shaped rows drop out entirely for Warehouse (§8.3). */
  money?: boolean
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  { label: 'Annual Fee', pick: (p) => `${p.price}${p.per ? ' ' + p.per : ''}`, money: true },
  { label: 'Individual Discount', pick: (p) => p.discounts[0]?.split(' Individual')[0] ?? '—' },
  { label: 'Bundle Discount', pick: (p) => p.discounts[1]?.replace(' Bundle discount', '') ?? '—' },
  { label: 'Monthly Booking Limit', pick: (p) => p.limits[0]?.value ?? '—' },
  { label: 'Simultaneous Rental Limit', pick: (p) => p.limits[1]?.value ?? '—' },
  { label: 'Authorized Users', pick: (p) => p.limits[2]?.value ?? '—' },
  { label: 'Default Credit Limit', pick: (p) => p.limits[3]?.value ?? '—', money: true },
]

export const PLAN_VIEWS = ['Cards', 'Comparison Table'] as const
export type PlanView = (typeof PLAN_VIEWS)[number]

export const STACK_NOTE =
  'Individual + promotional discount stacking is capped at 25%. (e.g. Women DoP 5% + plan discount max 20%).'

export const GRACE_NOTE =
  'Grace period: 30 days after the renewal date. After that the membership becomes Lapsed and benefits are suspended.'

export const LEGEND = [
  { text: 'Active', tone: 'success' as const },
  { text: 'Expiring (≤30 days)', tone: 'progress' as const },
  { text: 'Grace (≤30 days)', tone: 'primary' as const },
  { text: 'Lapsed (>30 days overdue)', tone: 'danger' as const },
]

export const MEMBER_ROWS_PER_PAGE = [5, 10, 25] as const
