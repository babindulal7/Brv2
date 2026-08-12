import type { Kpi } from '../components/ui/Page'
import type { Slice } from '../components/ui/Charts'
import { formatMoney, rupees } from '../lib/money'

/** Client Reports seed data — transcribed from render `D1353039`. */

export const KPIS: Kpi[] = [
  { label: 'Total Clients', value: '1,248', icon: 'users', accent: 'primary', delta: { direction: 'up', text: '12.6% vs last month' }, spark: [40, 48, 44, 55, 50, 62, 57, 68, 63, 74, 70, 80] },
  { label: 'Active Clients', value: '436', icon: 'checklist', accent: 'primary', delta: { direction: 'up', text: '18.4% vs last month' }, spark: [30, 38, 34, 46, 42, 54, 50, 60, 56, 66, 62, 72] },
  { label: 'Returning Clients', value: '81%', icon: 'refresh', accent: 'progress', delta: { direction: 'up', text: '6.3% vs last month' }, spark: [55, 58, 56, 62, 60, 66, 64, 70, 68, 74, 72, 78] },
  { label: 'Outstanding Receivables', value: formatMoney(rupees(542000)), icon: 'receipt', accent: 'danger', delta: { direction: 'down', text: '4.2% vs last month', good: true }, spark: [70, 66, 68, 62, 64, 58, 60, 54, 56, 50, 52, 47] },
]

export const FILTERS = ['All Client Types', 'All Memberships', 'All Companies', 'All Branches', 'All Staff', 'All Status', 'All Cities', 'All Tags']

export const GROWTH = {
  yTicks: ['1.5K', '1.2K', '900', '600', '300'],
  labels: ['1 May', '6 May', '11 May', '16 May', '21 May', '26 May', '31 May'],
  series: [
    { name: 'New Clients', points: [20, 24, 22, 28, 26, 32, 30, 36, 34, 40, 38, 44, 42, 48, 50] },
    { name: 'Active Clients', points: [42, 46, 44, 52, 50, 58, 56, 62, 60, 68, 66, 72, 70, 76, 80] },
    { name: 'Total Clients', points: [70, 74, 72, 80, 78, 86, 84, 90, 88, 94, 92, 98, 96, 102, 108] },
  ],
}

export const REVENUE_BY_CLIENT = [
  { label: 'Aama Production', value: 485000, display: formatMoney(rupees(485000)) },
  { label: 'Media Hub Pvt. Ltd.', value: 362500, display: formatMoney(rupees(362500)) },
  { label: 'Wide Lens Studio', value: 295000, display: formatMoney(rupees(295000)) },
  { label: 'Creative Frame', value: 248000, display: formatMoney(rupees(248000)) },
  { label: 'Focus Films', value: 210000, display: formatMoney(rupees(210000)) },
  { label: 'Kantipur Film Academy', value: 182000, display: formatMoney(rupees(182000)) },
  { label: 'Everest Pictures', value: 165000, display: formatMoney(rupees(165000)) },
  { label: 'Ferry Tale Studios', value: 128000, display: formatMoney(rupees(128000)) },
  { label: 'Nepal Ad Works', value: 105000, display: formatMoney(rupees(105000)) },
  { label: 'Vision Production', value: 98500, display: formatMoney(rupees(98500)) },
]
export const REVENUE_AXIS = ['0', '1L', '2L', '3L', '4L', '5L']

export const RETENTION: Slice[] = [
  { label: 'Returning Clients', value: 1010, display: '81%', percent: '(1,010)' },
  { label: 'One-Time Clients', value: 150, display: '12%', percent: '(150)' },
  { label: 'Inactive / Churned', value: 88, display: '7%', percent: '(88)' },
]
export const RETENTION_TOTAL = '1,248'

export const FREQUENCY = [
  { value: '3.4', label: 'Avg. Bookings per Client', icon: 'calendar' as const },
  { value: '5.6', label: 'Avg. Rental Days per Booking', icon: 'timer' as const },
  { value: formatMoney(rupees(18250)), label: 'Avg. Booking Value', icon: 'dollar' as const },
]

export const AGEING: Slice[] = [
  { label: 'Current (0–30 Days)', value: 235000, display: formatMoney(rupees(235000)), percent: '(43.4%)' },
  { label: '30–60 Days', value: 128000, display: formatMoney(rupees(128000)), percent: '(23.6%)' },
  { label: '60–90 Days', value: 110000, display: formatMoney(rupees(110000)), percent: '(20.3%)' },
  { label: '90–120 Days', value: 48000, display: formatMoney(rupees(48000)), percent: '(9.0%)' },
  { label: '120+ Days', value: 20000, display: formatMoney(rupees(20000)), percent: '(3.7%)' },
]
export const AGEING_TOTAL = formatMoney(rupees(542000))

export const MEMBERSHIP = {
  members: { value: '356', pct: '28.5%', note: 'of total clients' },
  nonMembers: { value: '892', pct: '71.5%', note: 'of total clients' },
  stats: [
    { label: 'Membership Revenue', value: formatMoney(rupees(428600)) },
    { label: 'Savings Provided', value: formatMoney(rupees(125300)) },
    { label: 'Renewal Rate', value: '81%' },
  ],
}

export const CASES: Array<{ label: string; value: string; tone: 'danger' | 'progress' | 'primary' | 'primary' }> = [
  { label: 'Damage Cases', value: '32', tone: 'danger' },
  { label: 'Missing Cases', value: '8', tone: 'progress' },
  { label: 'Disputes', value: '5', tone: 'primary' },
  { label: 'Insurance Claims', value: '3', tone: 'primary' },
]

export interface ClientRow {
  name: string
  id: string
  membership: string
  membershipKey: 'progress' | 'in' | 'primary' | 'progress' | 'neutral'
  bookings: string
  days: string
  revenue: string
  outstanding: string
  hasOutstanding: boolean
  lifetime: string
  lastAd: string
  lastBs: string
  lateReturns: string
  cases: string
}

/*
 * TODO(decision) — `CLI-` is a second client prefix, which ruling §2.1 forbids
 * (the client sequence is `C-`, `data/numbering.ts`). It is left standing on
 * purpose, and this is the judgement rather than an oversight:
 *
 * None of the six names below exists in `data/clients.ts`, whose register runs
 * `C-1` … `C-45`. Rewriting `CLI-0001` to `C-1` would not collapse a duplicate
 * identifier — it would point `ClientReports.tsx`'s row link at a *different,
 * real* client, replacing a dead link with a wrong one. Choosing which real
 * client each report row means is a data decision this pass does not own
 * (`CLAUDE.md`: never invent a product decision to unblock yourself).
 *
 * The fix is to seed these six rows from `CLIENTS_DATA` — or to accept that
 * this report is not joinable and drop the link — not to rename the prefix.
 */
export const CLIENTS: ClientRow[] = [
  { name: 'Aama Production', id: 'CLI-0001', membership: 'Platinum', membershipKey: 'progress', bookings: '18', days: '96', revenue: '4,85,000', outstanding: '35,000', hasOutstanding: true, lifetime: '12,85,600', lastAd: '2026-05-28', lastBs: '2083-02-15', lateReturns: '4', cases: '2' },
  { name: 'Media Hub Pvt. Ltd.', id: 'CLI-0002', membership: 'Gold', membershipKey: 'progress', bookings: '14', days: '72', revenue: '3,62,500', outstanding: '0', hasOutstanding: false, lifetime: '9,35,200', lastAd: '2026-05-27', lastBs: '2083-02-14', lateReturns: '2', cases: '1' },
  { name: 'Wide Lens Studio', id: 'CLI-0003', membership: 'Silver', membershipKey: 'neutral', bookings: '13', days: '54', revenue: '2,95,000', outstanding: '65,000', hasOutstanding: true, lifetime: '7,22,800', lastAd: '2026-05-25', lastBs: '2083-02-12', lateReturns: '3', cases: '0' },
  { name: 'Creative Frame', id: 'CLI-0004', membership: '-', membershipKey: 'neutral', bookings: '11', days: '48', revenue: '2,48,000', outstanding: '0', hasOutstanding: false, lifetime: '5,32,100', lastAd: '2026-05-20', lastBs: '2083-02-07', lateReturns: '1', cases: '1' },
  { name: 'Focus Films', id: 'CLI-0005', membership: 'Gold', membershipKey: 'progress', bookings: '10', days: '40', revenue: '2,10,000', outstanding: '20,000', hasOutstanding: true, lifetime: '4,85,600', lastAd: '2026-05-18', lastBs: '2083-02-05', lateReturns: '2', cases: '0' },
  { name: 'Kantipur Film Academy', id: 'CLI-0006', membership: 'Student', membershipKey: 'primary', bookings: '9', days: '36', revenue: '1,82,000', outstanding: '0', hasOutstanding: false, lifetime: '3,25,000', lastAd: '2026-05-17', lastBs: '2083-02-04', lateReturns: '0', cases: '0' },
]

export const SUMMARY = [
  { label: 'Total Clients', value: '1,248' },
  { label: 'Active Clients', value: '436' },
  { label: 'Returning Clients', value: '81%' },
  { label: 'Outstanding Receivables', value: formatMoney(rupees(542000)), tone: 'danger' as const },
  { label: 'Average Lifetime Value', value: formatMoney(rupees(142800)) },
  { label: 'New Clients', value: '38' },
]

export const TOP_CLIENTS = [
  { rank: 1, name: 'Aama Production', amount: formatMoney(rupees(1285600)) },
  { rank: 2, name: 'Media Hub Pvt. Ltd.', amount: formatMoney(rupees(935200)) },
  { rank: 3, name: 'Wide Lens Studio', amount: formatMoney(rupees(722800)) },
  { rank: 4, name: 'Creative Frame', amount: formatMoney(rupees(532100)) },
  { rank: 5, name: 'Focus Films', amount: formatMoney(rupees(485600)) },
]

export const HIGH_RISK = [
  { name: 'Everest Pictures', outstanding: '1,28,000', ageing: '90+ Days', severe: true },
  { name: 'Ferry Tale Studios', outstanding: '85,000', ageing: '60 Days', severe: false },
  { name: 'Nepal Ad Works', outstanding: '65,000', ageing: '60 Days', severe: false },
  { name: 'Vision Production', outstanding: '49,000', ageing: '30 Days', severe: false },
  { name: 'Mountain Films', outstanding: '32,000', ageing: '30 Days', severe: false },
]

export const INSIGHTS: Array<{ text: string; tone: 'primary' | 'progress' | 'success' | 'neutral' }> = [
  { text: 'Aama Production is your highest value client.', tone: 'primary' },
  { text: '21 clients are at risk of churn.', tone: 'progress' },
  { text: '38 new clients joined this month.', tone: 'success' },
  { text: 'Outstanding is 12.7% lower than last month.', tone: 'neutral' },
]

export const BS_NOTE = 'BS dates are shown above AD dates'
