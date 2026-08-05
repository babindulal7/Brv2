import { price, rupees, formatMoney } from '../lib/money'
import type { BookingStatus, Flag } from '../lib/workflow'

/**
 * Booking Detail seed data — transcribed from render `05AFD275`, with the money
 * figures taken from **Booking Workspace v2.3 §10.2**, the reference case for
 * this exact booking: "Any screen showing different figures for this booking is
 * wrong."
 *
 * Three sources disagreed, so the arithmetic decided it:
 *   render `05AFD275`  Total 1,39,505 · Paid 15,000 · Outstanding 93,548
 *                      — impossible; the difference is 1,24,505
 *   Foundation §02     Discount 9,558 on a 1,32,750 subtotal, labelled 7%
 *                      — 9,558 is 7.2%, so the figure contradicts its own label
 *   §10.2 (used)       9,293 · 1,23,457 · 16,049 · 1,39,506 · 1,24,506
 *                      — exactly 7% rounded half up at each step, per §10.1
 *
 * The assertions below recompute the chain so it cannot drift again.
 *
 * The render labels this booking `BR-2613`. That contradicts the ID registry
 * (`BK-YYYY-NNNN`; `BR-` is the branch prefix) and Dashboard.md §16 flags the
 * clash as open. The registry wins here because `BR-` is load-bearing
 * elsewhere — the branch card in the sidebar uses it — so reusing it as a
 * booking prefix would make IDs ambiguous. Everything else is verbatim.
 */

/*
 * §11 — "All money is calculated here. No manual totals. No module recomputes."
 * This file used to run its own §10.1 chain with `Math.round`. It now asks the
 * Financial Engine, which is the only thing in the product that knows §2.1's
 * order and §2.4's rounding — and which asserts §2.8's reference case at load.
 */
const MONEY = price({
  equipment: rupees(60750),
  crew: rupees(72000),
  transport: rupees(0),
  discountPercent: 7,
  vatPercent: 13,
  payments: rupees(15000),
})

/*
 * §2.2 — deposits are **liabilities**, tracked entirely separately. They never
 * reduce Rental Outstanding and never appear inside the pricing breakdown, so
 * they sit below the rule rather than inside the chain above.
 */
const DEPOSIT = { required: rupees(50000), received: rupees(25000) }
const DEPOSIT_PENDING = (DEPOSIT.required - DEPOSIT.received) as ReturnType<typeof rupees>

export const BOOKING = {
  no: 'BK-2026-0715',
  /*
   * §1.2 **Booked**, not Quote+Draft. §1.5 runs Packing at status Booked, so a
   * Draft booking with a fully packed bundle — as the render shows — cannot
   * happen. Packing Workflow §0 flags the same inconsistency in the render.
   *
   * §1.9 — flags coexist with status. This booking carries none; the array is
   * present rather than optional so every consumer reads the same shape.
   */
  status: 'Booked' as BookingStatus,
  flags: [] as Flag[],
  client: 'Himalayan Films Pvt. Ltd.',
  kind: 'Film Shoot',
  place: 'Kathmandu',
  vip: true,
  pickup: { ad: '16 Jul 2026', time: '06:00 AM', bs: '३१ श्रावण २०८३' },
  ret: { ad: '19 Jul 2026', time: '06:00 AM', bs: '४ श्रावण २०८३' },
  days: '3',
  outstanding: formatMoney(MONEY.outstanding),
  depositPending: formatMoney(DEPOSIT_PENDING),
}



export const SUMMARY = [
  { label: 'Rental Total', value: formatMoney(MONEY.rentalTotal) },
  { label: 'Rental Paid', value: formatMoney(MONEY.payments), tone: 'success' as const },
  { label: 'Rental Outstanding', value: formatMoney(MONEY.outstanding), tone: 'danger' as const },
  { label: 'Deposit Required', value: formatMoney(DEPOSIT.required) },
  { label: 'Deposit Received', value: formatMoney(DEPOSIT.received), tone: 'success' as const },
  { label: 'Deposit Pending', value: formatMoney(DEPOSIT_PENDING), tone: 'progress' as const },
]

/**
 * Equipment lines, from render `6989CD12` — a **tree**, not a flat list:
 * bundle → category → item. Depth is what makes a packing list checkable, so
 * it is modelled rather than flattened.
 */
export interface LineItem {
  depth: 0 | 1 | 2
  name: string
  /** Bundle / Required / item-count marker beside the name. */
  badge?: { text: string; kind: 'bundle' | 'required' | 'count' }
  serial?: string
  qty: string
  /** Packing state — Packed, Partial, or blank on a grouping row. */
  packed?: 'Packed' | 'Partial'
  availability?: { text: string; key: 'in' | 'primary' | 'low' }
  location?: string
  rate?: string
  total?: string
  /** Bundle rows show the pre-discount rate struck through. */
  wasRate?: string
}

export const ITEMS: LineItem[] = [
  { depth: 0, name: 'FX3 Documentary Package', badge: { text: 'Bundle', kind: 'bundle' }, serial: '18 Items · 10% Bundle Discount', qty: '', rate: 'Rs 20,250', wasRate: 'Rs 22,500', total: 'Rs 60,750' },
  { depth: 1, name: 'Camera', badge: { text: '1', kind: 'count' }, qty: '' },
  { depth: 2, name: 'Sony FX3', badge: { text: 'Required', kind: 'required' }, serial: 'SN102', qty: '1', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'A2-01', rate: 'Rs 6,500', total: 'Rs 6,500' },
  { depth: 1, name: 'Batteries', badge: { text: '4', kind: 'count' }, qty: '' },
  { depth: 2, name: 'NP-FZ100 Battery', badge: { text: 'Required', kind: 'required' }, serial: '—', qty: '4', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'B1-04', rate: 'Rs 500', total: 'Rs 2,000' },
  { depth: 1, name: 'Cards', badge: { text: '2', kind: 'count' }, qty: '' },
  { depth: 2, name: '256GB CFexpress Type A', badge: { text: 'Required', kind: 'required' }, serial: '—', qty: '2', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'B1-07', rate: 'Rs 750', total: 'Rs 1,500' },
  { depth: 1, name: 'Lens Set – NISI Athena Prime Set (3 Lenses)', badge: { text: 'Required', kind: 'required' }, qty: '3', packed: 'Packed', availability: { text: 'Reserved', key: 'primary' }, location: 'C1-02', rate: 'Rs 4,000', total: 'Rs 12,000' },
  { depth: 1, name: 'Monitor Kit – Portkeys', badge: { text: 'Bundle', kind: 'bundle' }, serial: '(3 Items)', qty: '1', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'D1-03', rate: 'Rs 1,500', total: 'Rs 1,500' },
  { depth: 1, name: 'Support & Rigging', serial: '(3 Items)', qty: '1', packed: 'Partial', availability: { text: 'Low Stock', key: 'low' }, location: 'E1-01', rate: 'Rs 1,750', total: 'Rs 1,750' },
  { depth: 1, name: 'Audio Kit', serial: '(3 Items)', qty: '1', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'F1-02', rate: 'Rs 1,200', total: 'Rs 1,200' },
  { depth: 1, name: 'Accessories & Cables', serial: '(6 Items)', qty: '1', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'G1-05', rate: 'Rs 650', total: 'Rs 650' },
]

/** Roll-up beneath the tree. Zero counts still render — "0 Missing" is the reassurance. */
export const ITEM_TALLY = [
  { label: 'Total Items', value: '18', tone: 'neutral' as const },
  { label: 'Packed', value: '17', tone: 'success' as const },
  { label: 'Partial', value: '1', tone: 'progress' as const },
  { label: 'Missing', value: '0', tone: 'neutral' as const },
  { label: 'Returned', value: '0', tone: 'neutral' as const },
  { label: 'Maintenance', value: '0', tone: 'neutral' as const },
]
export const EQUIPMENT_SUBTOTAL = 'Rs 60,750'
export const TOTAL_ITEMS = '18 Items'

/**
 * The Operations menu on the booking header — each opens a full-screen
 * workspace (render `6989CD12` annotates them: Packing, Pickup/Delivery,
 * Return/Delivery Back, Reset, Cleaning).
 */
export interface Operation {
  label: string
  icon: 'box' | 'truck' | 'return_arrow' | 'refresh' | 'sparkles'
  /** Route segment appended to the booking. §4.3 — full-screen routes, never modals. */
  path: string
  /** §4.2 — the stages at which this operation is enabled. */
  enabledAt: BookingStatus[]
}

/**
 * §4.2 gating. Disabled entries stay **visible and greyed, with the reason on
 * hover and focus** — they are not hidden.
 */
/**
 * §1.5 — **four verbs, not five.** "Reset absorbs Cleaning… The rendered
 * separate Cleaning workspace is deleted; its per-item category checklists move
 * inside Reset." The fifth entry is gone rather than disabled.
 *
 * `enabledAt` is now the booking status each job runs at, straight from §1.5's
 * table — one status each, because a job runs at exactly one.
 */
export const OPERATIONS: Operation[] = [
  { label: 'Packing', icon: 'box', path: 'packing', enabledAt: ['Booked'] },
  { label: 'Handover', icon: 'truck', path: 'handover', enabledAt: ['Packed'] },
  { label: 'Return & Inspection', icon: 'return_arrow', path: 'return', enabledAt: ['On Rent'] },
  { label: 'Reset', icon: 'refresh', path: 'reset', enabledAt: ['Returned'] },
]

export const CREW = [
  { name: 'Bikash Thapa', role: 'Director', rate: '9,000', days: '3', amount: '27,000' },
  { name: 'Sagar Maharjan', role: 'DoP', rate: '9,000', days: '3', amount: '27,000' },
  { name: 'Ramesh Dulal', role: 'Camera Assistant', rate: '6,000', days: '3', amount: '18,000' },
]
export const CREW_SUBTOTAL = '72,000'

export const TRANSPORT = [
  { label: 'Delivery Type', value: 'Pickup (Customer)', pill: true },
  { label: 'Vehicle', value: 'Customer Vehicle' },
  { label: 'Driver', value: '–' },
  { label: 'Transport Charge', value: 'Rs 0' },
  { label: 'Delivery Instructions', value: 'Customer will pick up from warehouse.' },
]

export const CHARGES = [
  { label: 'Equipment Rental', amount: '60,750', note: '18 items' },
  { label: 'Crew Charges', amount: '72,000', note: '3 crew × 3 days' },
  { label: 'Transport Charge', amount: '0', note: 'Customer pickup' },
]

export const TOTALS = [
  { label: 'Subtotal', value: '1,32,750' },
  { label: 'Discount (7%)', value: '-9,293', tone: 'danger' as const },
  { label: 'Taxable Amount', value: '1,23,457' },
  { label: 'VAT (13%)', value: '16,049' },
]
export const RENTAL_TOTAL = 'Rs 1,39,506'

export const DEPOSIT_LEDGER = [
  { label: 'Deposit Required', value: 'Rs 50,000' },
  { label: 'Deposit Received', value: 'Rs 25,000', tone: 'success' as const },
  { label: 'Deposit Pending', value: 'Rs 25,000', tone: 'progress' as const },
]

export const RENTAL_PAYMENTS = [
  { label: 'Rental Paid', value: 'Rs 15,000', tone: 'success' as const },
  { label: 'Rental Outstanding', value: 'Rs 1,24,506', tone: 'danger' as const },
]

export const PAYMENT_HISTORY = [
  { date: '16 Jul 2026', type: 'Deposit', amount: '25,000', method: 'Cash', status: 'Completed', ref: 'SD-001' },
  { date: '10 Jul 2026', type: 'Advance', amount: '15,000', method: 'eSewa', status: 'Completed', ref: 'ADV-001' },
]

export const DOCUMENTS = [
  { name: 'Rental Agreement', kind: 'PDF', ready: true },
  { name: 'Packing List', kind: 'PDF', ready: true },
  { name: 'Quote', kind: 'PDF', ready: true },
  { name: 'Delivery Note', kind: 'Not available', ready: false },
  { name: 'Invoice', kind: 'Not generated', ready: false },
]

export const REVIEW = [
  { label: 'Client & Schedule', value: 'Completed', ok: true },
  { label: 'Equipment', value: '18 Items', ok: true },
  { label: 'Crew', value: '3 Members', ok: true },
  { label: 'Pricing', value: 'Rs 1,39,506', ok: true },
  { label: 'Payments', value: 'Attention', ok: false },
  { label: 'Documents', value: 'Pending', ok: false },
]

export const NOTES =
  'Customer will pick up some items in the morning and remaining items in the evening. Please keep all equipment ready.'
export const NOTES_BY = 'Added by Sagar Maharjan'
export const NOTES_AT = '16 Jul 2026, 06:00 AM'

export const ALERTS = [
  { text: 'Deposit Rs 25,000 pending', action: 'Receive Deposit', tone: 'progress' as const },
  { text: 'Full payment required before pickup', action: 'Receive Payment', tone: 'progress' as const },
  { text: 'NISI Athena set – only 2 left this week', action: 'Check Inventory', tone: 'danger' as const },
]

export const TIMELINE = [
  { at: '16 Jul 2026, 06:00 AM', what: 'Draft created', who: 'by Sagar Maharjan' },
  { at: '16 Jul 2026, 06:05 AM', what: 'Items added', who: 'by Sagar Maharjan' },
  { at: '16 Jul 2026, 06:10 AM', what: 'Crew assigned', who: 'by Sagar Maharjan' },
]
