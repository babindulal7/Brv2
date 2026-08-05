import type { Kpi } from '../components/ui/Page'
import type { StatusKey, BrandKey } from '../lib/status'
import { statusToken } from '../lib/workflow'
import type { BookingStatus, Flag } from '../lib/workflow'

/**
 * Rentals List seed data — transcribed from render `77B52333`.
 *
 * Booking IDs use the `BK-YYYY-NNNN` form the renders show. (`BR-` is the
 * branch prefix and never an ID — see the note in `App.tsx`.)
 *
 * NOT wired to Supabase.
 */

export const KPIS: Kpi[] = [
  { label: 'Active Rentals', value: '52', icon: 'briefcase', accent: 'primary', delta: { direction: 'up', text: '6 since yesterday', good: true } },
  { label: 'Today Pickups', value: '14', icon: 'truck', accent: 'primary', note: '8 Pending • 6 Completed' },
  { label: 'Today Returns', value: '11', icon: 'return_arrow', accent: 'progress', note: '4 Overdue • 7 Expected' },
  { label: 'Payment Due', value: 'Rs 1,42,000', icon: 'dollar', accent: 'success', note: '8 Invoices' },
  { label: 'Utilization', value: '84%', icon: 'chart', accent: 'primary', note: 'Top 10 assets' },
  { label: 'Overdue', value: '5', icon: 'alert_triangle', accent: 'danger', note: 'Requires attention' },
]

/** Quick-filter chips. `tone` colours the two exception chips, as in the render. */
export const CHIPS: Array<{ label: string; tone?: 'danger' | 'progress' }> = [
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

export const VIEWS = ['Table', 'Cards', 'Timeline'] as const

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

/** A row's flag chip — VIP, Priority, and the exception states. */
export interface RowTag {
  text: string
  status: StatusKey
}

export interface RentalRow {
  bookingNo: string
  bookedOn: string
  tag?: RowTag
  client: string
  avatar: string[]
  avatarBg: string
  project: string
  location: string
  crew: string
  kit: string
  items: string
  pickup: { date: string; time: string; who: string }
  ret: { date: string; time: string; who: string }
  /** Foundation §01 stage. The union makes an invented status unrepresentable. */
  status: BookingStatus
  /** §1.9 — flags coexist with status and never replace it. */
  flags: Flag[]
  statusKey: StatusKey
  /** How the row deviates from the plain stage — "1 day late", "Due today". */
  statusNote?: string
  /** How far along the 4-step pipeline this booking is, 0–4. */
  progress: number
  progressTone: BrandKey
  amount: string
  /** Absent on a cancelled booking — there is nothing to settle. */
  payment?: { text: string; settled: boolean }
  deposit?: string
}

export const ROWS: RentalRow[] = [
  {
    bookingNo: 'BK-2026-0715',
    bookedOn: 'Booked 12 Jul',
    tag: { text: 'VIP', status: 'progress' },
    client: 'ABC Films',
    avatar: ['ABC', 'FILMS'],
    avatarBg: '#1a1a1a',
    project: 'Commercial Shoot',
    location: 'Kathmandu',
    crew: 'Crew 8',
    kit: 'RED Komodo X Package',
    items: '18 items',
    pickup: { date: '31 Jul 2026', time: '09:00 AM', who: 'Ramesh' },
    ret: { date: '2 Aug 2026', time: '06:00 AM', who: 'Hari' },
    status: 'Booked',
    flags: [],
    statusKey: statusToken('Booked'),
    progress: 1,
    progressTone: 'primary',
    amount: 'Rs 86,400',
    payment: { text: 'Paid', settled: true },
    deposit: 'Deposit: Rs 50,000',
  },
  {
    bookingNo: 'BK-2026-0716',
    bookedOn: 'Booked 11 Jul',
    tag: { text: 'Priority', status: 'progress' },
    client: 'Creative Studio',
    avatar: ['CS'],
    avatarBg: '#1e293b',
    project: 'Music Video',
    location: 'Lalitpur',
    crew: 'Crew 5',
    kit: 'Sony FX6 Kit',
    items: '16 items',
    pickup: { date: '31 Jul 2026', time: '10:30 AM', who: 'Hari' },
    ret: { date: '1 Aug 2026', time: '06:00 AM', who: 'Sanu' },
    status: 'Packed',
    flags: [],
    statusKey: statusToken('Packed'),
    progress: 2,
    progressTone: 'primary',
    amount: 'Rs 52,000',
    payment: { text: 'Paid', settled: true },
    deposit: 'Deposit: Rs 30,000',
  },
  {
    bookingNo: 'BK-2026-0709',
    bookedOn: 'Booked 8 Jul',
    tag: { text: 'Return Today', status: 'in' },
    client: 'Mountain Stories',
    avatar: ['MS', 'FILMS'],
    avatarBg: '#0f2942',
    project: 'Documentary',
    location: 'Pokhara',
    crew: 'Crew 6',
    kit: 'Sony FX6 Package',
    items: '12 items',
    pickup: { date: '19 Jul 2026', time: '11:30 AM', who: 'Ramesh' },
    ret: { date: '31 Jul 2026', time: '06:00 AM', who: 'Hari' },
    // "Returning" is not a Foundation stage; the stage is Return Due.
    status: 'On Rent',
    flags: ['Due Soon'],
    statusKey: statusToken('On Rent'),
    statusNote: 'Returning today',
    progress: 3,
    progressTone: 'progress',
    amount: 'Rs 44,500',
    payment: { text: 'Due Rs 14,500', settled: false },
    deposit: 'Deposit: Rs 30,000',
  },
  {
    bookingNo: 'BK-2026-0710',
    bookedOn: 'Booked 7 Jul',
    client: 'Vision Production',
    avatar: ['VP', 'PROD'],
    avatarBg: '#1e3a5f',
    project: 'TV Show',
    location: 'Kathmandu',
    crew: 'Crew 12',
    kit: 'NISI Athena Set',
    items: '10 items',
    pickup: { date: '18 Jul 2026', time: '01:00 PM', who: 'Sanu' },
    ret: { date: '1 Aug 2026', time: '06:00 AM', who: 'Hari' },
    status: 'On Rent',
    flags: [],
    statusKey: statusToken('On Rent'),
    progress: 3,
    progressTone: 'primary',
    amount: 'Rs 61,000',
    payment: { text: 'Paid', settled: true },
    deposit: 'Deposit: Rs 40,000',
  },
  {
    bookingNo: 'BK-2026-0711',
    bookedOn: 'Booked 6 Jul',
    tag: { text: 'Overdue', status: 'danger' },
    client: 'Inside Out Films',
    avatar: ['IO', 'FILMS'],
    avatarBg: '#4c1d95',
    project: 'Short Film',
    location: 'Bhaktapur',
    crew: 'Crew 4',
    kit: 'Aputure 600D Pro Kit',
    items: '14 items',
    pickup: { date: '8 Jul 2026', time: '02:30 PM', who: 'Hari' },
    ret: { date: '29 Jul 2026', time: '06:00 AM', who: 'Ramesh' },
    // "Overdue" is not a stage — it is Return Due, past its date.
    status: 'On Rent',
    flags: ['Due Soon'],
    statusKey: statusToken('On Rent'),
    statusNote: 'Overdue',
    progress: 4,
    progressTone: 'danger',
    amount: 'Rs 61,000',
    payment: { text: 'Due Rs 21,000', settled: false },
    deposit: 'Deposit: Rs 20,000',
  },
  {
    bookingNo: 'BK-2026-0712',
    bookedOn: 'Booked 5 Jul',
    client: 'White Peak Docs',
    avatar: ['WPD'],
    avatarBg: '#0f2942',
    project: 'Adventure Film',
    location: 'Kathmandu',
    crew: 'Crew 7',
    kit: 'Glacier Lines Package',
    items: '18 items',
    pickup: { date: '2 Jul 2026', time: '09:00 AM', who: 'Ramesh' },
    ret: { date: '9 Jul 2026', time: '06:00 AM', who: 'Hari' },
    status: 'Returned',
    flags: [],
    statusKey: statusToken('Returned'),
    progress: 4,
    progressTone: 'success',
    amount: 'Rs 1,32,000',
    payment: { text: 'Paid', settled: true },
    deposit: 'Deposit: Rs 50,000',
  },
  {
    bookingNo: 'BK-2026-0713',
    bookedOn: 'Booked 3 Jul',
    client: 'Mirage Weddings',
    avatar: ['MW'],
    avatarBg: '#1a1a1a',
    project: 'Wedding Shoot',
    location: 'Chitwan',
    crew: 'Crew 10',
    kit: 'Rato Tika Package',
    items: '20 items',
    pickup: { date: '10 Jul 2026', time: '11:00 AM', who: 'Sanu' },
    ret: { date: '13 Jul 2026', time: '06:00 AM', who: 'Hari' },
    status: 'Returned',
    flags: [],
    statusKey: statusToken('Returned'),
    progress: 3,
    progressTone: 'primary',
    amount: 'Rs 44,000',
    payment: { text: 'Due Rs 4,000', settled: false },
    deposit: 'Deposit: Rs 20,000',
  },
  {
    bookingNo: 'BK-2026-0714',
    bookedOn: 'Booked 1 Jul',
    tag: { text: 'Cancelled', status: 'neutral' },
    client: 'City Motion',
    avatar: ['CITY', 'MOTION'],
    avatarBg: '#1e293b',
    project: 'Corporate Video',
    location: 'Kathmandu',
    crew: 'Crew 6',
    kit: 'DJI Drone Package',
    items: '6 items',
    pickup: { date: '5 Jul 2026', time: '09:00 AM', who: 'Ramesh' },
    ret: { date: '6 Jul 2026', time: '06:00 AM', who: 'Hari' },
    status: 'Quote',
    flags: ['Cancelled'],
    statusKey: statusToken('Quote'),
    progress: 0,
    progressTone: 'neutral',
    amount: '—',
  },
]

export const FOUND = '120 Rentals found'
export const SHOWING = 'Showing 1 to 20 of 120 rentals'
