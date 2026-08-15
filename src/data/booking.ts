import { price, rupees, formatMoney, grouped, toRupees } from '../lib/money'
import { bookingDayRate } from '../lib/lateFee'
import type { TransportBilling } from '../lib/lateFee'
import type { Paisa } from '../lib/money'
import type { BookingStatus, Flag } from '../lib/workflow'
import { toBs, formatBs, formatAd } from '../lib/bs'

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
 * (`B-N` since the 12 Aug ruling; `BR-` is the branch prefix) and Dashboard.md §16 flags the
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
/*
 * Named once, fed into `price()` below and reused by every figure that used
 * to duplicate these as separate hardcoded strings (CHARGES, TOTALS,
 * EQUIPMENT_SUBTOTAL, CREW_SUBTOTAL) — one input, so those can't drift from
 * MONEY or from each other the way RENTAL_PAYMENTS's did.
 */
const EQUIPMENT_PAISA = rupees(60750)
const CREW_PAISA = rupees(72000)
const TRANSPORT_PAISA = rupees(0)
const DISCOUNT_PERCENT = 7
const VAT_PERCENT = 13

const MONEY = price({
  equipment: EQUIPMENT_PAISA,
  crew: CREW_PAISA,
  transport: TRANSPORT_PAISA,
  discountPercent: DISCOUNT_PERCENT,
  vatPercent: VAT_PERCENT,
  payments: rupees(15000),
})

/*
 * §2.2 — deposits are **liabilities**, tracked entirely separately. They never
 * reduce Rental Outstanding and never appear inside the pricing breakdown, so
 * they sit below the rule rather than inside the chain above.
 */
const DEPOSIT = { required: rupees(50000), received: rupees(25000) }
const DEPOSIT_PENDING = (DEPOSIT.required - DEPOSIT.received) as ReturnType<typeof rupees>

/*
 * F2 — the render hand-wrote the BS side (`३१ श्रावण २०८३`, Devanagari, and
 * one BS day short of correct — day 31 of the *previous* month mislabeled
 * with the new month's name). `lib/bs.ts` is the one place that conversion
 * is allowed to happen; these two dates go through it instead.
 */
const PICKUP_AD = new Date(Date.UTC(2026, 6, 16))
const RETURN_AD = new Date(Date.UTC(2026, 6, 19))

/* ── late fee inputs ───────────────────────────────────────────────────────
 *
 * `lib/money.ts`'s `lateFee()` takes **instants**, not the display strings the
 * rest of this file carries — an overage of 4h 15m cannot be computed from
 * `'19 Jul 2026'`. These three are the seed layer's answer to the gap that
 * function's own header names.
 *
 * `bookings.return_at` / `actual_return_at` are the real columns
 * (`bookingQuery.ts:431-435` reads both); this stands in for one booking until
 * this screen reads them.
 */
export const RETURN_AT = new Date(Date.UTC(2026, 6, 19, 0, 15)) // 06:00 NPT
/** 10:15 AM NPT — 4h 15m past. Nothing writes `actual_return_at` yet; see `money.ts`'s TODO(decision). */
export const ACTUAL_RETURN_AT = new Date(Date.UTC(2026, 6, 19, 4, 30))

/**
 * One day's rate — **the whole booking**, ruled 12 Aug 2026 (PLAN.md §4.24).
 *
 * Equipment, crew and transport, aggregated by `lib/lateFee.ts`'s
 * `bookingDayRate()` rather than by a division written here: it is the function
 * `money.ts` said did not exist, and the arithmetic belongs in the engine.
 *
 * This booking's transport is billed **flat** (Rs 0 as it happens), so it
 * contributes nothing to an extra day — a delivery run quoted once does not
 * happen again because the return was late. `TRANSPORT_BILLING` is what a
 * booking with a daily vehicle would set instead.
 */
export const TRANSPORT_BILLING: TransportBilling = { kind: 'flat', amountPaisa: TRANSPORT_PAISA }

const DAY_RATE = bookingDayRate({
  equipmentPaisa: EQUIPMENT_PAISA,
  crewPaisa: CREW_PAISA,
  transport: TRANSPORT_BILLING,
  rentalDays: 3,
})

export const DAY_RATE_PAISA = DAY_RATE.dayRatePaisa
export const DAY_RATE_BASIS = DAY_RATE.basis

export const BOOKING = {
  no: 'B-715',
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
  pickup: { ad: formatAd(PICKUP_AD), time: '06:00 AM', bs: formatBs(toBs(PICKUP_AD)!) },
  ret: { ad: formatAd(RETURN_AD), time: '06:00 AM', bs: formatBs(toBs(RETURN_AD)!) },
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
  /**
   * F3 / Law 9 — days mandatory on every priced line, explicitly, never by
   * omission. Set on every row that carries a `rate`/`total`; blank on pure
   * grouping rows (Camera, Batteries, Cards), which price nothing themselves.
   *
   * Deliberately not multiplied into `total` below: the FX3 package is billed
   * as one flat 3-day bundle (its own row already equals the full Rs 60,750
   * Equipment Subtotal), so its child rows are a reference breakdown of what
   * the bundle contains, not independent per-day lines — re-multiplying them
   * would double-count against the bundle row and break that reconciliation.
   */
  days?: string
  /**
   * §11.1 (rulings, 13 Aug 2026) — **sub-rental is a LINE property.**
   *
   * `true` iff this line is `booking_lines.line_type = 'Sub-rental'`
   * (`0001_enums.sql:301`, `0002_bookings.sql:129`): gear borrowed in from
   * outside for this booking rather than pulled off our own shelf.
   *
   * The booking-level answer is **not** stored anywhere. It is
   * {@link isSubRentalBooking} over these lines — see that function's header
   * for why storing it twice is the failure mode the ruling names.
   *
   * ⚠ **No supplier and no supplier cost are seeded.** The real columns are
   * `booking_lines.supplier_id` and `supplier_cost` (the latter is required by
   * `booking_lines_subrental_needs_cost`), but `supplier_cost` is money — 0019
   * revokes it — and the live corpus holds **no `suppliers` rows at all**
   * (verified 16 Aug 2026). Naming a vendor or a rupee figure here would be a
   * fabricated figure, so the flag carries the fact and nothing else.
   */
  subRental?: boolean
}

/* ── §11.1 — the one place the sub-rental question is answered ────────────
 *
 * A **line** is sub-rented. A **booking** is sub-rental if any of its lines is.
 * That is one rule, written once, and both surfaces read it: Booking Detail's
 * line table and header chip call the two functions directly, and the Rentals
 * list's `(Sub-Rental)` chip narrows on the same vocabulary
 * (`data/rentals.ts`'s `subRentalBookingIds`, which sends
 * {@link SUB_RENTAL_LINE_TYPES} to Postgres and then applies
 * {@link isSubRentalBooking} to what comes back).
 *
 * ⛔ There is deliberately **no `RentalRow.subRental` and no
 * `bookings.is_sub_rental`.** The ruling's own words: "Storing the same fact
 * twice is how the two disagree." A row-level copy would go stale the moment a
 * line is added, voided or converted.
 */

/**
 * The `booking_line_type` members that make a line sub-rented (`0001:296-303`).
 *
 * An array rather than a bare literal because it is BOTH halves of the rule:
 * the predicate below tests membership of it, and `data/rentals.ts` sends the
 * same array to Postgres as an `in (…)`. One vocabulary, so the server filter
 * and the client predicate cannot drift apart.
 */
export const SUB_RENTAL_LINE_TYPES = ['Sub-rental'] as const

/**
 * Either shape a line arrives in — the seeded {@link LineItem} above, or a
 * `booking_lines` row carrying its `line_type`. Both answer the same question.
 */
export interface SubRentedLine {
  /** Seed shape — {@link LineItem.subRental}. */
  subRental?: boolean | undefined
  /** Query shape — `booking_lines.line_type`. */
  lineType?: string | undefined
}

/** Is this line external gear borrowed in for the booking? */
export function isSubRentedLine(line: SubRentedLine): boolean {
  if (line.subRental === true) return true
  return line.lineType !== undefined && (SUB_RENTAL_LINE_TYPES as readonly string[]).includes(line.lineType)
}

/**
 * **The derived booking-level answer.** Never stored, never written, never a
 * column — computed from the lines every time it is asked for.
 */
export function isSubRentalBooking(lines: readonly SubRentedLine[]): boolean {
  return lines.some(isSubRentedLine)
}

export const ITEMS: LineItem[] = [
  { depth: 0, name: 'FX3 Documentary Package', badge: { text: 'Bundle', kind: 'bundle' }, serial: '18 Items · 10% Bundle Discount', qty: '', rate: 'Rs 20,250', wasRate: 'Rs 22,500', total: 'Rs 60,750', days: '3' },
  { depth: 1, name: 'Camera', badge: { text: '1', kind: 'count' }, qty: '' },
  { depth: 2, name: 'Sony FX3', badge: { text: 'Required', kind: 'required' }, serial: 'SN102', qty: '1', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'A2-01', rate: 'Rs 6,500', total: 'Rs 6,500', days: '3' },
  { depth: 1, name: 'Batteries', badge: { text: '4', kind: 'count' }, qty: '' },
  { depth: 2, name: 'NP-FZ100 Battery', badge: { text: 'Required', kind: 'required' }, serial: '—', qty: '4', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'B1-04', rate: 'Rs 500', total: 'Rs 2,000', days: '3' },
  { depth: 1, name: 'Cards', badge: { text: '2', kind: 'count' }, qty: '' },
  { depth: 2, name: '256GB CFexpress Type A', badge: { text: 'Required', kind: 'required' }, serial: '—', qty: '2', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'B1-07', rate: 'Rs 750', total: 'Rs 1,500', days: '3' },
  /*
   * §11.1 seed — a realistic minority, two of the eleven lines, not half the
   * corpus. Both are depth-1 lines whose money is left exactly as it was: a
   * sub-rented line still bills the client the same rate, so marking one
   * changes no figure in `MONEY`, `EQUIPMENT_SUBTOTAL` or `TOTALS`.
   *
   * The lens set is the coherent one: `ALERTS` below already says "NISI Athena
   * set – only 2 left this week", which is precisely why a booking borrows a
   * set in rather than pulling one off the shelf. `availability` keeps meaning
   * "is this unit ready for this booking" — for external gear that is the
   * partner's confirmation, not our stock level.
   */
  { depth: 1, name: 'Lens Set – NISI Athena Prime Set (3 Lenses)', badge: { text: 'Required', kind: 'required' }, qty: '3', packed: 'Packed', availability: { text: 'Reserved', key: 'primary' }, location: 'C1-02', rate: 'Rs 4,000', total: 'Rs 12,000', days: '3', subRental: true },
  { depth: 1, name: 'Monitor Kit – Portkeys', badge: { text: 'Bundle', kind: 'bundle' }, serial: '(3 Items)', qty: '1', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'D1-03', rate: 'Rs 1,500', total: 'Rs 1,500', days: '3' },
  { depth: 1, name: 'Support & Rigging', serial: '(3 Items)', qty: '1', packed: 'Partial', availability: { text: 'Low Stock', key: 'low' }, location: 'E1-01', rate: 'Rs 1,750', total: 'Rs 1,750', days: '3', subRental: true },
  { depth: 1, name: 'Audio Kit', serial: '(3 Items)', qty: '1', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'F1-02', rate: 'Rs 1,200', total: 'Rs 1,200', days: '3' },
  { depth: 1, name: 'Accessories & Cables', serial: '(6 Items)', qty: '1', packed: 'Packed', availability: { text: 'Available', key: 'in' }, location: 'G1-05', rate: 'Rs 650', total: 'Rs 650', days: '3' },
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
export const EQUIPMENT_SUBTOTAL = formatMoney(EQUIPMENT_PAISA)
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
export const CREW_SUBTOTAL = grouped(toRupees(CREW_PAISA))

export const TRANSPORT = [
  { label: 'Delivery Type', value: 'Pickup (Client)', pill: true },
  { label: 'Vehicle', value: 'Client Vehicle' },
  { label: 'Driver', value: '–' },
  { label: 'Transport Charge', value: 'Rs 0' },
  { label: 'Delivery Instructions', value: 'The client will pick up from the warehouse.' },
]

/*
 * F4/§11 — these four blocks used to hand-write numbers MONEY already
 * computed. Wired to MONEY/DEPOSIT/the named paisa constants above so none
 * of them can independently drift, closing the same class of gap
 * RENTAL_PAYMENTS had (fixed earlier). `grouped(toRupees(...))` reproduces
 * the panel's existing bare-number style (no "Rs " prefix); `formatMoney`
 * is used only where the render already carried the prefix.
 */
export const CHARGES = [
  { label: 'Equipment Rental', amount: grouped(toRupees(EQUIPMENT_PAISA)), note: '18 items' },
  { label: 'Crew Charges', amount: grouped(toRupees(CREW_PAISA)), note: '3 crew × 3 days' },
  { label: 'Transport Charge', amount: grouped(toRupees(TRANSPORT_PAISA)), note: 'Client pickup' },
]

export const TOTALS = [
  { label: 'Subtotal', value: grouped(toRupees(MONEY.subtotal)) },
  { label: `Discount (${DISCOUNT_PERCENT}%)`, value: `-${grouped(toRupees(MONEY.discount))}`, tone: 'danger' as const },
  { label: 'Taxable Amount', value: grouped(toRupees(MONEY.taxable)) },
  { label: `VAT (${VAT_PERCENT}%)`, value: grouped(toRupees(MONEY.vat)) },
]
export const RENTAL_TOTAL = formatMoney(MONEY.rentalTotal)

export const DEPOSIT_LEDGER = [
  { label: 'Deposit Required', value: formatMoney(DEPOSIT.required) },
  { label: 'Deposit Received', value: formatMoney(DEPOSIT.received), tone: 'success' as const },
  { label: 'Deposit Pending', value: formatMoney(DEPOSIT_PENDING), tone: 'progress' as const },
]

/*
 * F1 — these two were hardcoded strings that happened to match MONEY today;
 * wired to the engine so they can't independently drift from
 * BOOKING.outstanding / SUMMARY the way this defect's root cause did.
 */
export const RENTAL_PAYMENTS = [
  { label: 'Rental Paid', value: formatMoney(MONEY.payments), tone: 'success' as const },
  { label: 'Rental Outstanding', value: formatMoney(MONEY.outstanding), tone: 'danger' as const },
]

/**
 * `recordedBy`/`adjustments` — new for the Payment Intel card
 * (`data/bookingIntel.ts`). Nothing invented: `recordedBy` is seeded with the
 * same staff member the Timeline below already credits with creating this
 * booking, on both real rows (there are only two). `adjustments` models
 * CLAUDE.md's "Payments are immutable — corrections are reversal rows" law
 * directly — a correction never edits `amount` above, it appends a signed
 * reversal row here instead. Seeded on one row where a real correction makes
 * sense (a gateway-fee reversal on the eSewa advance); the deposit row is
 * left with no adjustments, which is the honest common case, not an
 * oversight.
 */
export interface PaymentAdjustment {
  /** AD label, same "D MMM YYYY" convention as `date` below. */
  ad: string
  amountPaisa: Paisa
  reason: string
}

export interface PaymentHistoryRow {
  date: string
  type: string
  amount: string
  method: string
  status: string
  ref: string
  recordedBy?: string
  adjustments?: PaymentAdjustment[]
}

export const PAYMENT_HISTORY: PaymentHistoryRow[] = [
  { date: '16 Jul 2026', type: 'Deposit', amount: '25,000', method: 'Cash', status: 'Received', ref: 'SD-001', recordedBy: 'Sagar Maharjan' },
  {
    date: '10 Jul 2026',
    type: 'Advance',
    amount: '15,000',
    method: 'eSewa',
    status: 'Received',
    ref: 'ADV-001',
    recordedBy: 'Sagar Maharjan',
    adjustments: [
      {
        ad: '12 Jul 2026',
        amountPaisa: rupees(-500),
        reason: 'eSewa gateway fee corrected — a reversal row, not an edit to the original payment (payments are immutable)',
      },
    ],
  },
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
  { label: 'Pricing', value: formatMoney(MONEY.rentalTotal), ok: true },
  { label: 'Payments', value: 'Attention', ok: false },
  { label: 'Documents', value: 'Pending', ok: false },
]

export const NOTES =
  'The client will pick up some items in the morning and the rest in the evening. Please keep all equipment ready.'
export const NOTES_BY = 'Added by Sagar Maharjan'
export const NOTES_AT = '16 Jul 2026, 06:00 AM'

/*
 * Typed explicitly rather than inferred: `tone` must stay the `'danger' |
 * 'progress'` union BookingDetail.tsx's render branches on, not narrow to
 * whichever single literal happens to appear in today's seed data (all three
 * rows are 'progress' since the F6 fix below) — an inferred narrow type would
 * make the render's `tone === 'danger'` branch a type error.
 */
export const ALERTS: { text: string; action: string; tone: 'danger' | 'progress' }[] = [
  { text: 'Deposit Rs 25,000 pending', action: 'Receive Deposit', tone: 'progress' as const },
  { text: 'Full payment required before pickup', action: 'Receive Payment', tone: 'progress' as const },
  /*
   * F6 — red is reserved for a problem that already happened (Overdue ·
   * Damaged · Missing). Two units still available is attention, not a
   * problem, so it carries the same tone as the other two alerts here.
   */
  { text: 'NISI Athena set – only 2 left this week', action: 'Check Inventory', tone: 'progress' as const },
]

export const TIMELINE = [
  { at: '16 Jul 2026, 06:00 AM', what: 'Draft created', who: 'by Sagar Maharjan' },
  { at: '16 Jul 2026, 06:05 AM', what: 'Items added', who: 'by Sagar Maharjan' },
  { at: '16 Jul 2026, 06:10 AM', what: 'Crew assigned', who: 'by Sagar Maharjan' },
]
