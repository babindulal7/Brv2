import type { Kpi } from '../components/ui/Page'
import type { StatusKey, BrandKey } from '../lib/status'
import { statusToken } from '../lib/workflow'
import type { BookingStatus, Flag } from '../lib/workflow'
import { rupees, formatMoney } from '../lib/money'
import type { Paisa } from '../lib/money'

/**
 * Rentals List seed data — transcribed from render `77B52333` / `Rentals.PNG`.
 *
 * Booking IDs use the `BK-YYYY-NNNN` form the renders show. (`BR-` is the
 * branch prefix and never an ID — see the note in `App.tsx`.)
 *
 * Three engine rules shape the shapes below rather than the render:
 *   - **Money is `Paisa`**, never a pre-formatted string. `lib/money.ts` owns
 *     the lakh grouping and the half-up rounding; a hand-written `'Rs 86,400'`
 *     would drift from it the first time a figure changed.
 *   - **Dates are `Date`**, never a pre-formatted string. `lib/bs.ts` owns
 *     rendering *and* the fixed operating day (`TODAY` = 31 Jul 2026), which is
 *     what lets the quick-filter chips genuinely filter instead of decorating.
 *   - **Avatar tints are `StatusKey`**, never a hex. The render tints one client
 *     avatar violet (`#4c1d95`); Foundation §4.2 bans the hue outright, and no
 *     screen may hardcode a colour in either theme.
 *
 * NOT wired to Supabase.
 */

/* ── the fixed operating day, re-exported for the chip predicates ───────── */

const DAY_MS = 86_400_000

/** Midnight-UTC key for a date, so comparisons never trip over a time-of-day. */
export function dayKey(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Shorthand for the seed's AD dates — every one is a whole day, UTC. */
function ad(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(d: Date, n: number): Date {
  return new Date(dayKey(d) + n * DAY_MS)
}

/* ── KPI band ──────────────────────────────────────────────────────────── */

/**
 * §4.2 — the render tints Utilization **purple**. Purple, violet, cyan, teal and
 * indigo are banned, so it takes `primary` like the other neutral-good figures.
 */
export const KPIS: Kpi[] = [
  { label: 'Active Rentals', value: '52', icon: 'briefcase', accent: 'primary', delta: { direction: 'up', text: '6 since yesterday', good: true } },
  { label: 'Today Pickups', value: '14', icon: 'truck', accent: 'primary', note: '8 Pending • 6 Completed' },
  { label: 'Today Returns', value: '11', icon: 'return_arrow', accent: 'progress', note: '4 Overdue • 7 Expected' },
  { label: 'Payment Due', value: formatMoney(rupees(142_000)), icon: 'dollar', accent: 'success', note: '8 Invoices' },
  { label: 'Utilization', value: '84%', icon: 'chart', accent: 'primary', note: 'Top 10 assets' },
  { label: 'Overdue', value: '5', icon: 'alert_triangle', accent: 'danger', note: 'Requires attention' },
]

/** KPI cards whose *value is a monetary figure*. Foundation §8.3 omits them. */
const MONEY_KPI_LABELS = new Set(['Payment Due'])

/**
 * §8.3 — Warehouse sees no money **anywhere**, and forbidden figures are absent
 * from the DOM rather than masked, blurred or dashed out. Filtering the array
 * before it reaches `KpiStrip` is what makes that structural.
 */
export function kpisFor(canSeeMoney: boolean): Kpi[] {
  return canSeeMoney ? KPIS : KPIS.filter((k) => !MONEY_KPI_LABELS.has(k.label))
}

/* ── quick-filter chips ────────────────────────────────────────────────── */

export type ChipKey =
  | 'Today'
  | 'Tomorrow'
  | 'Next 7 Days'
  | 'Upcoming'
  | 'On Rent'
  | 'Returning'
  | 'Inspection'
  | 'Completed'
  | 'Overdue'
  | 'Payment Due'
  | 'Cancelled'
  | 'Custom'

/** `tone` colours the two exception chips, as in the render. */
export const CHIPS: Array<{ label: ChipKey; tone?: 'danger' | 'progress' }> = [
  { label: 'Today' },
  { label: 'Tomorrow' },
  { label: 'Next 7 Days' },
  { label: 'Upcoming' },
  { label: 'On Rent' },
  { label: 'Returning' },
  { label: 'Inspection' },
  { label: 'Completed' },
  { label: 'Overdue', tone: 'danger' },
  { label: 'Payment Due', tone: 'progress' },
  { label: 'Cancelled' },
  { label: 'Custom' },
]

/** "Payment Due" names an outstanding balance — §8.3 removes it for Warehouse. */
export function chipsFor(canSeeMoney: boolean) {
  return canSeeMoney ? CHIPS : CHIPS.filter((c) => c.label !== 'Payment Due')
}

export const VIEWS = ['Table', 'Cards', 'Timeline'] as const

/* ── left filter rail ──────────────────────────────────────────────────── */

export const FILTER_GROUPS = [
  { label: 'Status', icon: 'queues' as const },
  { label: 'Rental Type', icon: 'checklist' as const },
  { label: 'Client Type', icon: 'users' as const },
  { label: 'Equipment Category', icon: 'box' as const },
  { label: 'Staff', icon: 'crew' as const },
  { label: 'Location', icon: 'home' as const },
  { label: 'Payment', icon: 'card' as const },
  { label: 'Deposit', icon: 'receipt' as const },
  { label: 'Tags', icon: 'flag' as const },
  { label: 'Date', icon: 'calendar' as const },
  { label: 'Amount', icon: 'dollar' as const },
]

/**
 * Payment, Deposit and Amount are money *filters* — narrowing by them is money
 * access even though the control shows no figure — so §8.3 removes them too.
 */
const MONEY_FILTER_GROUPS = new Set(['Payment', 'Deposit', 'Amount'])

export function filterGroupsFor(canSeeMoney: boolean) {
  return canSeeMoney ? FILTER_GROUPS : FILTER_GROUPS.filter((g) => !MONEY_FILTER_GROUPS.has(g.label))
}

/* ── rows ──────────────────────────────────────────────────────────────── */

/** A row's flag chip — VIP, Priority, and the exception states. */
export interface RowTag {
  text: string
  status: StatusKey
}

export interface RentalRow {
  bookingNo: string
  /** Display label only ("Booked 12 Jul") — no arithmetic is done on it. */
  bookedOn: string
  tag?: RowTag
  client: string
  avatar: string[]
  /** §4.2 token pair, not a hex. Resolved through `STATUS` at the call site. */
  avatarTone: StatusKey
  project: string
  location: string
  crew: string
  kit: string
  items: number
  pickup: { ad: Date; time: string; who: string }
  ret: { ad: Date; time: string; who: string }
  /** Foundation §01 stage. The union makes an invented status unrepresentable. */
  status: BookingStatus
  /** §1.9 — flags coexist with status and never replace it. */
  flags: Flag[]
  statusKey: StatusKey
  /** How the row deviates from the plain stage — "Overdue", "Returning today". */
  statusNote?: string
  /** How far along the 4-step pipeline this booking is, 0–4. */
  progress: number
  progressTone: BrandKey
  /** Rental total. Absent on a cancelled booking — there is nothing to bill. */
  amount?: Paisa
  /** Outstanding balance. `0` renders as "Paid". */
  due?: Paisa
  /** §2.7 — a liability, never part of the total. Shown as its own line. */
  deposit?: Paisa
}

export const ROWS: RentalRow[] = [
  {
    bookingNo: 'BK-2026-0715',
    bookedOn: 'Booked 12 Jul',
    tag: { text: 'VIP', status: 'progress' },
    client: 'ABC Films',
    avatar: ['ABC', 'FILMS'],
    avatarTone: 'neutral',
    project: 'Commercial Shoot',
    location: 'Kathmandu',
    crew: 'Crew 8',
    kit: 'RED Komodo X Package',
    items: 18,
    pickup: { ad: ad(2026, 7, 31), time: '09:00 AM', who: 'Ramesh' },
    ret: { ad: ad(2026, 8, 2), time: '06:00 AM', who: 'Hari' },
    status: 'Booked',
    flags: [],
    statusKey: statusToken('Booked'),
    statusNote: 'Preparing',
    progress: 1,
    progressTone: 'primary',
    amount: rupees(86_400),
    due: rupees(0),
    deposit: rupees(50_000),
  },
  {
    bookingNo: 'BK-2026-0716',
    bookedOn: 'Booked 11 Jul',
    tag: { text: 'Priority', status: 'progress' },
    client: 'Creative Studio',
    avatar: ['CS'],
    avatarTone: 'primary',
    project: 'Music Video',
    location: 'Lalitpur',
    crew: 'Crew 5',
    kit: 'Sony FX6 Kit',
    items: 16,
    pickup: { ad: ad(2026, 7, 31), time: '10:30 AM', who: 'Hari' },
    ret: { ad: ad(2026, 8, 1), time: '06:00 AM', who: 'Sanu' },
    status: 'Packed',
    flags: [],
    statusKey: statusToken('Packed'),
    statusNote: 'Ready for pickup',
    progress: 2,
    progressTone: 'primary',
    amount: rupees(52_000),
    due: rupees(0),
    deposit: rupees(30_000),
  },
  {
    bookingNo: 'BK-2026-0709',
    bookedOn: 'Booked 8 Jul',
    tag: { text: 'Return Today', status: 'in' },
    client: 'Mountain Stories',
    avatar: ['MS', 'FILMS'],
    avatarTone: 'in',
    project: 'Documentary',
    location: 'Pokhara',
    crew: 'Crew 6',
    kit: 'Sony FX6 Package',
    items: 12,
    pickup: { ad: ad(2026, 7, 19), time: '11:30 AM', who: 'Ramesh' },
    ret: { ad: ad(2026, 7, 31), time: '06:00 AM', who: 'Hari' },
    // "Returning" is not a Foundation stage; the stage is On Rent, due back.
    status: 'On Rent',
    flags: ['Due Soon'],
    statusKey: statusToken('On Rent'),
    statusNote: 'Returning today',
    progress: 3,
    progressTone: 'progress',
    amount: rupees(44_500),
    due: rupees(14_500),
    deposit: rupees(30_000),
  },
  {
    bookingNo: 'BK-2026-0710',
    bookedOn: 'Booked 7 Jul',
    client: 'Vision Production',
    avatar: ['VP', 'PROD'],
    avatarTone: 'primary',
    project: 'TV Show',
    location: 'Kathmandu',
    crew: 'Crew 12',
    kit: 'NISI Athena Set',
    items: 10,
    pickup: { ad: ad(2026, 7, 18), time: '01:00 PM', who: 'Sanu' },
    ret: { ad: ad(2026, 8, 1), time: '06:00 AM', who: 'Hari' },
    status: 'On Rent',
    flags: [],
    statusKey: statusToken('On Rent'),
    progress: 3,
    progressTone: 'primary',
    amount: rupees(61_000),
    due: rupees(0),
    deposit: rupees(40_000),
  },
  {
    bookingNo: 'BK-2026-0711',
    bookedOn: 'Booked 6 Jul',
    tag: { text: 'Overdue', status: 'danger' },
    client: 'Inside Out Films',
    avatar: ['IO', 'FILMS'],
    // Render tints this avatar violet (#4c1d95) — §4.2 bans the hue.
    avatarTone: 'danger',
    project: 'Short Film',
    location: 'Bhaktapur',
    crew: 'Crew 4',
    kit: 'Aputure 600D Pro Kit',
    items: 14,
    pickup: { ad: ad(2026, 7, 8), time: '02:30 PM', who: 'Hari' },
    ret: { ad: ad(2026, 7, 29), time: '06:00 AM', who: 'Ramesh' },
    // "Overdue" is not a stage — it is On Rent, past its return date. §1.9's
    // registry separates the two: `Due Soon` is "≤24h to return", and this row
    // is two days past 31 Jul, so the flag it carries is `Overdue`.
    status: 'On Rent',
    flags: ['Overdue'],
    statusKey: statusToken('On Rent'),
    statusNote: 'Overdue',
    progress: 4,
    progressTone: 'danger',
    amount: rupees(61_000),
    due: rupees(21_000),
    deposit: rupees(20_000),
  },
  {
    bookingNo: 'BK-2026-0712',
    bookedOn: 'Booked 5 Jul',
    client: 'White Peak Docs',
    avatar: ['WPD'],
    avatarTone: 'in',
    project: 'Adventure Film',
    location: 'Kathmandu',
    crew: 'Crew 7',
    kit: 'Glacier Lines Package',
    items: 18,
    pickup: { ad: ad(2026, 7, 2), time: '09:00 AM', who: 'Ramesh' },
    ret: { ad: ad(2026, 7, 9), time: '06:00 AM', who: 'Hari' },
    // Render pill reads "Completed" — §1.2's stage for that is Closed:
    // "money settled, deposit resolved, nothing open".
    status: 'Closed',
    flags: [],
    statusKey: statusToken('Closed'),
    progress: 4,
    progressTone: 'success',
    amount: rupees(132_000),
    due: rupees(0),
    deposit: rupees(50_000),
  },
  {
    bookingNo: 'BK-2026-0713',
    bookedOn: 'Booked 3 Jul',
    client: 'Mirage Weddings',
    avatar: ['MW'],
    avatarTone: 'progress',
    project: 'Wedding Shoot',
    location: 'Chitwan',
    crew: 'Crew 10',
    kit: 'Rato Tika Package',
    items: 20,
    pickup: { ad: ad(2026, 7, 10), time: '11:00 AM', who: 'Sanu' },
    ret: { ad: ad(2026, 7, 13), time: '06:00 AM', who: 'Hari' },
    // Render pill reads "Inspection". §1.2 has no such stage: the gear is back
    // (Returned) and Reset has not run, so inspection is what is outstanding.
    status: 'Returned',
    flags: [],
    statusKey: statusToken('Returned'),
    statusNote: 'Awaiting inspection',
    progress: 3,
    progressTone: 'primary',
    amount: rupees(44_000),
    due: rupees(4_000),
    deposit: rupees(20_000),
  },
  {
    bookingNo: 'BK-2026-0714',
    bookedOn: 'Booked 1 Jul',
    tag: { text: 'Cancelled', status: 'neutral' },
    client: 'City Motion',
    avatar: ['CITY', 'MOTION'],
    avatarTone: 'neutral',
    project: 'Corporate Video',
    location: 'Kathmandu',
    crew: 'Crew 6',
    kit: 'DJI Drone Package',
    items: 6,
    pickup: { ad: ad(2026, 7, 5), time: '09:00 AM', who: 'Ramesh' },
    ret: { ad: ad(2026, 7, 6), time: '06:00 AM', who: 'Hari' },
    status: 'Quote',
    flags: ['Cancelled'],
    statusKey: statusToken('Quote'),
    progress: 0,
    progressTone: 'neutral',
  },
]

/* ── chip predicates ───────────────────────────────────────────────────── */

/**
 * Every chip in the render is a real predicate over the rows above — except
 * `Today` and `Custom`, which are handled by the page:
 *
 *   - `Today` is the **default scope**, not a date filter. The render itself
 *     shows rows dated 2 Jul – 2 Aug under a selected `Today`, so the chip is
 *     the reset-to-everything state rather than "moving today".
 *     TODO(decision): confirm — if `Today` must hard-filter to movements dated
 *     `TODAY`, the render's own row set contradicts its own screenshot.
 *   - `Custom` opens the inline date range beneath the chip row.
 */
export function matchesChip(r: RentalRow, chip: ChipKey, today: Date): boolean {
  const t = dayKey(today)
  const pick = dayKey(r.pickup.ad)
  const ret = dayKey(r.ret.ad)
  const cancelled = r.flags.includes('Cancelled')

  switch (chip) {
    case 'Today':
      return true
    case 'Tomorrow':
      return !cancelled && (pick === t + DAY_MS || ret === t + DAY_MS)
    case 'Next 7 Days':
      return !cancelled && ((pick >= t && pick <= t + 7 * DAY_MS) || (ret >= t && ret <= t + 7 * DAY_MS))
    case 'Upcoming':
      // Not yet handed over.
      return !cancelled && (r.status === 'Quote' || r.status === 'Booked' || r.status === 'Packed')
    case 'On Rent':
      return r.status === 'On Rent'
    case 'Returning':
      return r.status === 'On Rent' && ret <= t + DAY_MS
    case 'Inspection':
      // §1.2 — gear physically back, Reset not yet run.
      return r.status === 'Returned'
    case 'Completed':
      return r.status === 'Closed'
    case 'Overdue':
      return r.status === 'On Rent' && ret < t
    case 'Payment Due':
      return r.due !== undefined && r.due > 0
    case 'Cancelled':
      return cancelled
    case 'Custom':
      return true
  }
}

/** Inclusive AD window, used by the `Custom` chip's inline range. */
export function withinRange(r: RentalRow, from: Date | null, to: Date | null): boolean {
  const pick = dayKey(r.pickup.ad)
  const ret = dayKey(r.ret.ad)
  const lo = from ? dayKey(from) : -Infinity
  const hi = to ? dayKey(to) : Infinity
  return (pick >= lo && pick <= hi) || (ret >= lo && ret <= hi)
}

/* ── table furniture ───────────────────────────────────────────────────── */

/**
 * Columns the gear in the table header can hide. Booking, Client / Project and
 * Status are structural and always render; Payment is additionally gated by
 * §8.3 before it ever reaches this list.
 */
export const OPTIONAL_COLUMNS = ['Package / Items', 'Pickup', 'Return', 'Payment'] as const
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]

export const ROWS_PER_PAGE = [5, 10, 20, 50] as const
