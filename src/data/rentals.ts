import type { StatusKey, BrandKey } from '../lib/status'
import { BOOKING_STATUS, statusToken } from '../lib/workflow'
import type { BookingStatus, Flag } from '../lib/workflow'
import { rupees, formatMoney } from '../lib/money'
import type { Paisa } from '../lib/money'
import { formatAd } from '../lib/bs'
import { clockPad } from '../lib/format'
import { canViewMoneyField } from '../lib/fieldGating'
import type { GateContext } from '../lib/fieldGating'
import type { IntelField, IntelGlance, IntelGroup } from '../components/ui/IntelCard'
import { overdue, todaysIncoming, todaysOutgoing, type BookingListRow } from '../lib/queries/bookings'
import type { ListFilters } from '../lib/queries/listQuery'
import {
  ACTIVE_RENTALS_FILTERS,
  NOW_AD,
  TODAY_DAY_AD,
  avatarToneFor,
  civilDaysBetween,
  dotTone,
  kathmanduMinutes,
  monogramOf,
  periodRange,
  type DayRange,
  type LivePeriod,
} from './today'

/**
 * # Rentals List — the query layer, and the seed that is no longer wired to it
 *
 * ⛔ Everything the Rentals list renders now comes from `listBookings`. The
 * screen holds no array and filters no array: the twelve quick-filter chips, the
 * Filters rail's Status accordion and the pager are all `ListFilters` evaluated
 * by Postgres.
 *
 * ## What was removed here, and why
 *
 * - **`KPIS` / `kpisFor`** — six hand-typed strings (52 · 14 · 11 · Rs 142,000 ·
 *   84% · 5) sitting above an eight-row seed, with hand-typed sub-lines ("8
 *   Pending • 6 Completed") nothing derived. Four of the six are real counts and
 *   are now four count queries (`RENTAL_KPI_FILTERS` below, rendered by
 *   `RentalsList.tsx`). **Payment Due** and **Utilization** are gone rather than
 *   dashed: no query in `lib/queries/` produces either, and a card whose value
 *   can only ever be a dash is a promise the screen cannot keep. Both figures
 *   already have a home in Reports ▸ Pulse.
 * - **`matchesChip` / `withinRange` / `dayKey` / `addDays`** — client-side
 *   predicates over `ROWS`. Replaced by `rentalsQuery` below, which returns a
 *   `ListFilters` for every chip that has one and says so for the one that does
 *   not.
 *
 * ## What `ROWS` still is
 *
 * A seed, and **not** what the Rentals list draws. It survives because
 * `modules/clients/ClientDetail.tsx` reads it for a client's booking history and
 * `data/bookingIntel.ts` / `lib/kpiEngine.ts` are typed against `RentalRow` —
 * three files outside this conversion's scope. Deleting it would have broken
 * them to tidy this one. Nothing in `modules/rentals/` imports it any more.
 *
 * ⚠ So `RentalRow` and `RentalListRow` are two different shapes with two
 * different provenances. `RentalRow` carries invented columns (`crew`, `kit`,
 * `pickup.who`, `amount`, `due`); `RentalListRow` carries only `bookings`
 * columns and formattings of them. Do not widen one into the other.
 */

/** Shorthand for the seed's AD dates — every one is a whole day, UTC. */
function ad(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d))
}

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

export const VIEWS = ['Table', 'Cards', 'Timeline'] as const

/* ── rows (seed — see the header) ──────────────────────────────────────── */

/** A seed row's flag chip — VIP, Priority, and the exception states. */
export interface RowTag {
  text: string
  status: StatusKey
}

/**
 * ⚠ **Seed shape.** Read by `ClientDetail.tsx`, `bookingIntel.ts` and
 * `kpiEngine.ts` only. The Rentals list renders `RentalListRow`, below.
 */
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
  /** Quote card only. A pre-formatted "D MMM YYYY" label, not a `Date`. */
  sentAd?: string
  /** When the quoted price stops being honoured. Same label convention as `sentAd`. */
  validUntilAd?: string
}

export const ROWS: RentalRow[] = [
  {
    bookingNo: 'B-715',
    bookedOn: 'Booked 12 Jul',
    tag: { text: 'VIP', status: 'progress' },
    client: 'ABC Films',
    avatar: ['ABC', 'FILMS'],
    avatarTone: 'neutral',
    project: 'Commercial Shoot',
    location: 'Kathmandu',
    crew: 'Crew 8',
    kit: 'FX3 Documentary Package',
    items: 18,
    pickup: { ad: ad(2026, 7, 31), time: '09:00 AM', who: 'Ramesh' },
    ret: { ad: ad(2026, 8, 2), time: '06:00 AM', who: 'Hari' },
    status: 'Booked',
    flags: [],
    statusKey: statusToken('Booked'),
    statusNote: 'Preparing',
    progress: 1,
    progressTone: 'primary',
    // Matches data/booking.ts's engine-computed MONEY.rentalTotal/outstanding
    // for this same booking number (§P0 fix — was a stale, disagreeing figure).
    amount: rupees(139_506),
    due: rupees(124_506),
    deposit: rupees(50_000),
  },
  {
    bookingNo: 'B-716',
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
    bookingNo: 'B-709',
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
    bookingNo: 'B-710',
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
    // Matches Finance.tsx's INV-491 for this booking (amount 312,000,
    // paidPaisa 180,000 -> 132,000 outstanding), not this row's stale figures.
    amount: rupees(312_000),
    due: rupees(132_000),
    deposit: rupees(40_000),
  },
  {
    bookingNo: 'B-711',
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
    // "Overdue" is not a stage — it is On Rent, past its return date.
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
    bookingNo: 'B-712',
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
    // Render pill reads "Completed" — §1.2's stage for that is Closed.
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
    bookingNo: 'B-713',
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
    bookingNo: 'B-714',
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
    sentAd: '2 Jul 2026',
    validUntilAd: '4 Jul 2026',
  },
]

/* ═══════════════════════════════════════════════════════════════════════
 * THE REAL QUERY — everything below this line is what `RentalsList.tsx`
 * renders. Nothing below reads `ROWS`.
 * ═══════════════════════════════════════════════════════════════════════ */

/* ── table furniture ───────────────────────────────────────────────────── */

/**
 * Columns the gear in the table header can hide.
 *
 * ⛔ `'Package / Items'` was renamed to `'Items'` and `'Payment'` to
 * `'Deposit'`, because both used to promise a figure the list does not have:
 * the "Package" was `RentalRow.kit` (a bundle name needing a
 * `booking_lines`→bundle join that `listBookings` does not make) and "Payment"
 * was a rental total plus an outstanding balance, both of which are the
 * Financial Engine's and deliberately absent from the list row
 * (`queries/bookings.ts`, "What is NOT here"). What survives is the item count,
 * which is real, and `deposit_required`, which is real **and money** — see
 * `RENTAL_DEPOSIT_NOTE`.
 */
export const OPTIONAL_COLUMNS = ['Items', 'Pickup', 'Return', 'Deposit'] as const
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]

export const ROWS_PER_PAGE = [5, 10, 20, 50] as const

/**
 * Why the Deposit column is opt-in.
 *
 * `bookings.deposit_required` is **unmasked money on a base table** — there is
 * no `bookings_v`, and `bookings_select` is `auth_is_staff()`, which includes
 * Warehouse, Technician and Driver. `listBookings` therefore only selects it
 * when the caller passes `withDeposit`, and the caller must gate on
 * `useCanViewMoney()`. `RentalsList.tsx` does exactly that; nothing in Postgres
 * would stop it if it did not.
 */
export const RENTAL_DEPOSIT_NOTE =
  'Deposit required, from the booking row. The rental total and the outstanding balance are the Financial Engine’s and are not on a list row.'

/* ── the twelve quick-filter chips ─────────────────────────────────────── */

export type ChipKey =
  /**
   * ⛔ Was `'Today'`, renamed 12 Aug 2026 to match `04_RENTALS.md` §4.1's
   * `(All)` chip.
   *
   * The label was already wrong before the spec said so: `matchesChip('Today')`
   * returned `true` unconditionally, `CHIP_MEANS` described it as "the
   * reset-to-everything scope, not a date filter", and the render showed rows
   * dated 2 Jul – 2 Aug under it. A chip called Today that ignores the date is
   * a lie the operator has to learn; `All` is what it does.
   *
   * This is a CHIP label, not an entity identifier — the §2 rename ruling
   * ("do not rename an identifier") is untouched by it.
   */
  | 'All'
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

export interface RentalChip {
  label: ChipKey
  /** `tone` colours the two exception chips, as in the render. */
  tone?: 'danger' | 'progress'
  /**
   * Present when the chip has **no query behind it**. The chip renders
   * genuinely `disabled` carrying this sentence, rather than selecting and
   * quietly returning the unfiltered list.
   */
  unavailable?: string
}

/**
 * The one chip that cannot be expressed, stated in full.
 *
 * "Payment Due" is a money predicate over an outstanding balance, and no column
 * on `bookings` carries one: `deposit_required` is the deposit REQUIRED (and is
 * a liability, never part of the total — §2.7), `payments` (0006:176) is not
 * joined by `listBookings`, and "rental total − payments" is the Financial
 * Engine's figure. Law 1 keeps it off the list row on purpose —
 * `queries/bookings.ts` states it outright: "Putting a total on the list row
 * would mean two places compute money, which is the drift Law 1 exists to
 * prevent."
 */
export const PAYMENT_DUE_UNAVAILABLE =
  'Payment Due needs an outstanding balance. bookings carries none — deposit_required is the deposit required, payments (0006:176) is not joined by listBookings, and rental total minus payments is the Financial Engine’s figure, deliberately kept off the list row (Law 1).'

/**
 * ## The Sub-Rental chip — drawn by the spec, unbuildable against this schema
 *
 * `04_RENTALS.md` line 3 and §4.1 line 40 make Sub-Rental a **filter chip, not a
 * tab**, so the tab is gone. The chip it becomes is rendered `disabled` carrying
 * this sentence, because nothing in the data model can answer it:
 *
 *  - `bookings` has **no sub-rental column** — verified against
 *    `0002_bookings.sql`'s `create table bookings` and the generated
 *    `types/supabase.ts`;
 *  - the only real backing is `booking_lines.line_type = 'Sub-rental'`
 *    (`0001_enums.sql:301`, `0002_bookings.sql:129`), which is **line-level**;
 *  - selecting bookings by it needs `booking_lines!inner(...)` plus a
 *    `referencedTable`-scoped filter, and `applyListFilters` builds unscoped
 *    `in`/`or` clauses only — the same limitation `queries/bookings.ts:326-334`
 *    already documents for client-name search;
 *  - there is no `sub_rentals` table to read instead (`PLAN.md §6.27` records
 *    that the phantom FK was repointed at `booking_lines` for exactly this
 *    reason).
 *
 * Filtering the fetched page client-side is **not** an acceptable substitute:
 * the list is server-paged with `withCount`, so a client-side narrow would
 * leave "Showing 1 to 8 of 214" over three rows and a pager that walks pages
 * the predicate never saw.
 *
 * TODO(decision) — `WIREFRAME_RULINGS_2026-08-12.md` §9.1, still open: Sub-Rental
 * is specified three incompatible ways (a booking-level chip in §4.1, a
 * line-level gold outline in §4.2's Notes, and a row property in §4.1's table
 * legend). Deriving the booking flag from its lines satisfies both drawings but
 * is an inference, not a ruling, and `/operations/sub-rental` exists as a
 * separate register whose survival is also unruled. Not resolved here.
 */
export const SUB_RENTAL_UNAVAILABLE =
  'Sub-Rental cannot be filtered from this list yet. A sub-rental is a booking_lines row with line_type = ‘Sub-rental’ — line-level, not booking-level — and selecting bookings by it needs an inner join scoped to the embedded table, which ListFilters cannot express. Narrowing the fetched page instead would leave the count and the pager describing a different set. TODO(decision): rulings §9.1.'

/**
 * Twelve chips, and exactly one of them (`On Rent`) is a canonical stage.
 *
 * The labels are the render's and are deliberately unchanged; what changed is
 * what each one asks Postgres for. Two of them — `Inspection` and `Completed` —
 * are **retired stage names** (`0001_enums.sql:261,263`, deleted by
 * `0015_canonical_six_stages.sql`). Sending either literal would match nothing
 * and render a perfectly plausible empty screen, so `rentalsQuery` maps them
 * onto the stages that replaced them: Returned and Closed.
 */
export const CHIPS: RentalChip[] = [
  { label: 'All' },
  { label: 'Tomorrow' },
  { label: 'Next 7 Days' },
  { label: 'Upcoming' },
  { label: 'On Rent' },
  { label: 'Returning' },
  { label: 'Inspection' },
  { label: 'Completed' },
  { label: 'Overdue', tone: 'danger' },
  { label: 'Payment Due', tone: 'progress', unavailable: PAYMENT_DUE_UNAVAILABLE },
  { label: 'Cancelled' },
  { label: 'Custom' },
]

/** "Payment Due" names an outstanding balance — §8.3 removes it for the floor. */
export function chipsFor(canSeeMoney: boolean): RentalChip[] {
  return canSeeMoney ? CHIPS : CHIPS.filter((c) => c.label !== 'Payment Due')
}

/**
 * What a chip explains about itself when it selects nothing.
 *
 * Used for the empty state's sentence, so "no rows" says which question was
 * asked rather than only that the answer was none.
 */
export const CHIP_MEANS: Record<ChipKey, string> = {
  All: 'every booking — the reset-to-everything scope, not a date filter',
  Tomorrow: 'bookings picking up tomorrow',
  'Next 7 Days': 'bookings picking up in the next seven days, today included',
  Upcoming: 'bookings at Quote, Booked or Packed — not yet handed over',
  'On Rent': 'bookings at the On Rent stage',
  Returning: 'bookings out now and due back by the end of tomorrow',
  Inspection: 'bookings at the Returned stage, where inspection is the outstanding work',
  Completed: 'bookings at the Closed stage',
  Overdue: 'bookings out now, past their return time, never actually returned',
  'Payment Due': 'nothing — this chip has no query behind it',
  Cancelled: 'cancelled bookings, which are retained rather than deleted (Law 3)',
  Custom: 'bookings picking up inside the chosen range',
}

/* ── chip → ListFilters ────────────────────────────────────────────────── */

/**
 * ## The one narrowing this screen cannot send to the server
 *
 * The seed's date predicates were `pickup OR return inside the window`.
 * `ListFilters.dateRange` names **one** column and `applyListFilters` turns it
 * into a `gte`/`lte` pair; there is no way to express "either of two columns
 * falls in the range" through it — that needs a PostgREST `or=(and(...),
 * and(...))` group, which `applyListFilters` does not build. So `Tomorrow`,
 * `Next 7 Days` and `Custom` bind **`pickup_at` only**, and the screen says so
 * in words next to the range picker rather than quietly returning half the
 * rows it used to. `Returning` and `Overdue` are return-side by definition and
 * bind `return_at`.
 *
 * Day boundaries are never built here. `startOfDay`/`endOfDay` are private to
 * `queries/bookings.ts` and carry the `+05:45` reasoning that makes the day a
 * screen filters by the day it labels; the bounds below are read back off the
 * named sets that already own them, exactly as `data/today.ts`'s `overDays`
 * does. Re-deriving them is how a second, wrong copy of Nepal's offset gets
 * written — `Calendar.md` §4.2 calls that the highest-priority correctness bug
 * in the product.
 */
type DateRange = NonNullable<ListFilters['dateRange']>

function boundsFrom(namedSet: (dayAd: string) => ListFilters, range: DayRange): DateRange {
  const lo = namedSet(range.from).dateRange
  const hi = namedSet(range.to).dateRange
  if (!lo || !hi) {
    throw new Error('The named set no longer carries a dateRange — day bounds cannot be read off it')
  }
  return { column: lo.column, fromAd: lo.fromAd, toAd: hi.toAd }
}

function dayRangeOf(period: LivePeriod): DayRange {
  const r = periodRange(period, TODAY_DAY_AD)
  if (!r) throw new Error(`periodRange("${period}") has no range; only "All" answers null`)
  return r
}

/** Resolved once, at import, against the app's single operating day (`lib/bs.ts`'s `TODAY`). */
const TOMORROW = dayRangeOf('Tomorrow')
const NEXT_SEVEN = dayRangeOf('Next 7 Days')

const PICKUP_TOMORROW = boundsFrom(todaysOutgoing, TOMORROW)
const PICKUP_NEXT_SEVEN = boundsFrom(todaysOutgoing, NEXT_SEVEN)
/** `return_at <= end of tomorrow`, with no lower bound — anything already due counts. */
const RETURN_BY_TOMORROW: DateRange = {
  column: 'return_at',
  toAd: boundsFrom(todaysIncoming, TOMORROW).toAd,
}

/**
 * Law 3 / 0015 — 'Cancelled' is a flag, not a stage, so every set excludes
 * cancellations by presence rather than by filtering the stage column. The one
 * exception is the `Cancelled` chip itself, which flips the same flag.
 */
const LIVE_ONLY: ListFilters['presence'] = { cancelled_at: false }

function bySortedPickup(extra: ListFilters = {}): ListFilters {
  return { presence: LIVE_ONLY, sort: { column: 'pickup_at', ascending: true }, ...extra }
}

/**
 * A chip's filter set, plus the one thing `ListFilters` cannot say.
 *
 * ⚠ `impossible` is not decoration. `applyListFilters` treats an EMPTY chip
 * array as "no constraint", never as "match nothing" — so a filter set whose
 * stage intersection came out empty would, if sent, return **every** stage,
 * which is the exact opposite of what the operator asked for. The screen must
 * not send it; it renders the empty state instead.
 */
export interface RentalsQuery {
  readonly filters: ListFilters
  readonly impossible: boolean
}

export interface CustomRange {
  /** `YYYY-MM-DD` from `<input type="date">`, or `''` for "not set". */
  readonly from: string
  readonly to: string
}

/** The date bounds a `Custom` range asks for, or `undefined` when neither end is set. */
function customBounds(range: CustomRange): DateRange | undefined {
  if (!range.from && !range.to) return undefined
  const lo = range.from ? todaysOutgoing(range.from).dateRange : undefined
  const hi = range.to ? todaysOutgoing(range.to).dateRange : undefined
  return {
    column: 'pickup_at',
    ...(lo?.fromAd ? { fromAd: lo.fromAd } : {}),
    ...(hi?.toAd ? { toAd: hi.toAd } : {}),
  }
}

function chipFilters(chip: ChipKey, custom: CustomRange, nowAd: string): ListFilters {
  switch (chip) {
    // `All` is the **default scope**, not a date filter: the render shows rows
    // dated 2 Jul – 2 Aug under it, and `matchesChip` returned `true`
    // unconditionally. It stays "no constraint" — and is now named for what it
    // does (`04_RENTALS.md` §4.1 draws it as `(All)`).
    case 'All':
      return bySortedPickup()
    case 'Tomorrow':
      return bySortedPickup({ dateRange: PICKUP_TOMORROW })
    case 'Next 7 Days':
      return bySortedPickup({ dateRange: PICKUP_NEXT_SEVEN })
    // Not yet handed over. A three-stage union, not a stage.
    case 'Upcoming':
      return bySortedPickup({ chips: { stage: ['Quote', 'Booked', 'Packed'] satisfies BookingStatus[] } })
    case 'On Rent':
      return bySortedPickup({ chips: { stage: ['On Rent'] satisfies BookingStatus[] } })
    // Out now and due back by the end of tomorrow. `actual_return_at is null`
    // for the same reason `todaysIncoming` carries it: a booking already handed
    // back is not "returning".
    case 'Returning':
      return {
        chips: { stage: ['On Rent'] satisfies BookingStatus[] },
        presence: { cancelled_at: false, actual_return_at: false },
        dateRange: RETURN_BY_TOMORROW,
        sort: { column: 'return_at', ascending: true },
      }
    // Retired label, live stage. `Inspection` was one of the old thirteen and
    // 0015 deleted it; the gear is physically back and Reset has not run, which
    // is `Returned`.
    case 'Inspection':
      return bySortedPickup({ chips: { stage: ['Returned'] satisfies BookingStatus[] } })
    // Same: `Completed` was retired by 0015. §1.2's stage for it is `Closed`.
    case 'Completed':
      return bySortedPickup({ chips: { stage: ['Closed'] satisfies BookingStatus[] } })
    // Exactly `overdue()` — On Rent, past `return_at`, `actual_return_at` still
    // null. Reused rather than restated so Today's Overdue KPI, Today's Alerts
    // column and this chip cannot disagree about what late means.
    case 'Overdue':
      return overdue(nowAd)
    case 'Cancelled':
      return { presence: { cancelled_at: true }, sort: { column: 'pickup_at', ascending: true } }
    case 'Custom': {
      const bounds = customBounds(custom)
      return bounds ? bySortedPickup({ dateRange: bounds }) : bySortedPickup()
    }
    // Unreachable: the chip renders `disabled` and cannot be selected. If it
    // ever is, the honest answer is no rows — not the unfiltered list.
    case 'Payment Due':
      return bySortedPickup()
  }
}

/**
 * Narrow a chip's structural stage set by the Filters rail's Status accordion.
 *
 * **Intersection, never replacement** — the same rule `data/today.ts`'s
 * `narrowStages` follows. `On Rent` MEANS the On Rent stage; letting a Status
 * checkbox overwrite that would put Quotes under a chip labelled On Rent.
 * Picking a stage the chip does not carry is therefore legitimately empty
 * rather than wrong, and that emptiness is reported through `impossible`
 * because the empty array itself cannot express it.
 */
function narrowStages(base: ListFilters, statuses: readonly BookingStatus[]): RentalsQuery {
  if (statuses.length === 0) return { filters: base, impossible: false }
  const structural = (base.chips?.['stage'] ?? []) as readonly BookingStatus[]
  if (structural.length === 0) {
    return { filters: { ...base, chips: { ...base.chips, stage: [...statuses] } }, impossible: false }
  }
  const kept = structural.filter((s) => statuses.includes(s))
  return { filters: { ...base, chips: { ...base.chips, stage: kept } }, impossible: kept.length === 0 }
}

/**
 * The Rentals list's whole filter set: one chip, the Status accordion, and
 * nothing else. Pagination is added by the screen (`ListFilters.page`).
 *
 * `nowAd` is a parameter rather than a `Date.now()` call so the mapping stays
 * pure and testable; the screen passes `data/today.ts`'s `NOW_AD`, which is
 * `lib/bs.ts`'s single operating instant — the same one Today, the Calendar and
 * Pulse read, so no two screens can disagree about what day it is.
 */
export function rentalsQuery(
  chip: ChipKey,
  custom: CustomRange,
  statuses: readonly BookingStatus[],
  nowAd: string = NOW_AD,
): RentalsQuery {
  return narrowStages(chipFilters(chip, custom, nowAd), statuses)
}

/* ── the KPI strip, as four counts ─────────────────────────────────────── */

/**
 * Four count queries, replacing six hand-typed strings.
 *
 * Each is a named set from `queries/bookings.ts` plus a one-row page: the card
 * wants `total`, not the rows, and `withCount: true` reports the full matching
 * count regardless of the range. `page` is not a narrowing predicate —
 * `useList`'s `narrowingKey` ignores it — so a count query can never make a
 * card read as "filtered".
 *
 * `Payment Due` (Rs 142,000) and `Utilization` (84%) are absent rather than
 * dashed. No query in `lib/queries/` produces either.
 */
const COUNT_PAGE: ListFilters['page'] = { index: 0, size: 1 }

export const RENTAL_KPI_FILTERS = {
  /** Everything currently with a client. Shared verbatim with Today's own card. */
  active: { ...ACTIVE_RENTALS_FILTERS, page: COUNT_PAGE },
  /** Today ▸ Outgoing — pickups on the operating day that have not left yet. */
  pickups: { ...todaysOutgoing(TODAY_DAY_AD), page: COUNT_PAGE },
  /** Today ▸ Incoming — returns due on the operating day, still out. */
  returns: { ...todaysIncoming(TODAY_DAY_AD), page: COUNT_PAGE },
  /** Due back before now and never actually returned. */
  overdue: { ...overdue(NOW_AD), page: COUNT_PAGE },
} as const satisfies Record<string, ListFilters>

/* ── raw row → the shape the table renders ─────────────────────────────── */

/**
 * What the Rentals table draws. Every field is a `bookings` column or a
 * formatting of one.
 *
 * What `RentalRow` carried and this does **not**, because no column exists:
 *
 * | Dropped | Why |
 * |---|---|
 * | `crew` ("Crew 8") | no column and no join; `booking_crew_lines` is priced shoot crew, not a headcount label, and `listBookings` does not embed it |
 * | `kit` ("FX3 Documentary Package") | a bundle name; needs `booking_lines`→bundle, and the embed selects `(id, qty)` only |
 * | `pickup.who` / `ret.who` | assigned staff. No column on `bookings`, no join reaching one |
 * | `tag` (VIP · Priority · Return Today) | `booking_flags`' CHECK permits only 'Returned Early', 'Late Return', 'Missing', 'Damaged' (0015:52-58) — VIP and Priority are unstorable today. Cancelled and Overdue survive because both are real |
 * | `amount` / `due` | engine-owned; `queries/bookings.ts` keeps rental money off the list row on purpose |
 * | `statusNote` ("Preparing", "Ready for pickup", "Awaiting inspection") | restatements of the stage the pill already names. Only the Overdue note survives, because `overdue()` defines it |
 * | `avatarTone` as a stored field | derived from `clientId`, a colour rather than a claim — see `avatarToneFor` |
 */
export interface RentalListRow {
  /** `bookings.id` — the React key. `bookingNo` is what the operator reads. */
  id: string
  bookingNo: string
  clientId: string
  /** `clients.name` through the join. */
  client: string
  /** Initials of `client`. Display formatting of a real field, not a new fact. */
  monogram: string
  /** Identity, not state. Deterministic in `clientId`, shared with Today. */
  avatarTone: StatusKey
  /** `bookings.project`, nullable (0002:28). Renders as an explicit non-value. */
  project: string | null
  /** `bookings.pickup_location`, nullable free text — never the branch name. */
  pickupLocation: string | null
  /** `bookings.return_location`, nullable. */
  returnLocation: string | null
  /** `sum(booking_lines.qty)` over live lines — UNITS, not rows. */
  itemCount: number
  /**
   * `bookings.created_at`, rendered.
   *
   * ⚠ Labelled "Created", **not** "Booked". The seed's `bookedOn` said "Booked
   * 12 Jul"; `created_at` is the row's insert instant and `queries/bookings.ts`
   * is explicit that it is NOT the Booked-stage transition (that lives in
   * `booking_stage_transitions`). A booking opened as a Quote and confirmed a
   * week later would carry the quote's date, so calling it "Booked" would be a
   * wrong figure rather than a missing one.
   */
  createdOn: string
  /** `bookings.stage` — one of the canonical six. */
  status: BookingStatus
  statusKey: StatusKey
  /** Only ever `Overdue` and/or `Cancelled`. Both are real; nothing else is. */
  flags: Flag[]
  /** "2 days late". Present only when the row is overdue. */
  statusNote?: string
  isCancelled: boolean
  isClosed: boolean
  isOverdue: boolean
  /** Position on the four-step pipeline, from the stage's own order. */
  progress: number
  progressTone: BrandKey
  /** `pickup_at`, split into the date and the Kathmandu wall clock. */
  pickup: { date: string; time: string }
  /** `return_at`, same split. */
  ret: { date: string; time: string }
  /** `bookings.delivery_type`. An enum member, not UI copy (Law 17). */
  deliveryType: BookingListRow['deliveryType']
  /** `bookings.quote_expires_at`, rendered. `null` means none was set. */
  quoteExpires: string | null
  /**
   * `bookings.deposit_required`. **`null` means the caller did not ask**, which
   * is what a money-blind session must produce — not "no deposit".
   */
  deposit: Paisa | null
  /**
   * Does this booking carry externally-sourced (sub-rented) gear?
   *
   * **Always `null` today, and `null` means "this query cannot answer" — never
   * "no".** Same convention as `deposit` above.
   *
   * §4.1 draws a gold-outlined row for external gear and §4.2's Notes put the
   * outline on the *line*. `listBookings` embeds `booking_lines ( id, qty )`
   * and nothing else, so the only column that could answer —
   * `booking_lines.line_type` — is not selected, and even selecting it would
   * only narrow the fetched page rather than the query (see
   * `SUB_RENTAL_UNAVAILABLE`). Rendering `false` would be a fabricated figure:
   * the screen would be asserting "no external gear" on every row in the
   * database, which is a claim nobody computed.
   *
   * The row treatment IS built (`ExternalGearMark` in `RentalsList.tsx`: gold
   * outline **plus** `STATUS.ext`'s `external_link` icon **plus** the label
   * "Sub-rented", per Law 11 — colour never alone). It simply has nothing to
   * fire on until the predicate above is ruled.
   *
   * TODO(decision) — rulings §9.1.
   */
  isExternal: boolean | null
}

/** "31 Jul 2026" + "09:00 AM", both rendered in Kathmandu (Law 7). */
function stampOf(instantAd: string): { date: string; time: string } {
  return { date: formatAd(new Date(instantAd)), time: clockPad(kathmanduMinutes(instantAd)) }
}

/**
 * A raw booking row → the row the table renders.
 *
 * `isOverdue` is `overdue()`'s predicate evaluated against the same anchor
 * instant the Overdue chip sends to Postgres — On Rent, past `return_at`,
 * `actual_return_at` still null — so a row cannot be overdue in the chip and on
 * time in the table.
 *
 * `Due Soon` is deliberately NOT derived, even though the seed carried it: it
 * needs a "how soon is soon" window no spec in this repo states, and inventing
 * one puts an amber badge on a booking for a reason nobody chose. `VIP` needs a
 * client attribute the schema does not have at all.
 */
export function toRentalListRow(row: BookingListRow, nowAd: string = NOW_AD): RentalListRow {
  const isOverdue =
    row.stage === 'On Rent' && row.actualReturnAtAd === null && Date.parse(row.returnAtAd) < Date.parse(nowAd)
  const lateDays = isOverdue ? civilDaysBetween(row.returnAtAd, nowAd) : 0
  const flags: Flag[] = [
    ...(isOverdue ? (['Overdue'] as const) : []),
    ...(row.isCancelled ? (['Cancelled'] as const) : []),
  ]

  return {
    id: row.id,
    bookingNo: row.bookingNo,
    clientId: row.clientId,
    client: row.clientName,
    monogram: monogramOf(row.clientName),
    avatarTone: avatarToneFor(row.clientId),
    project: row.project,
    pickupLocation: row.pickupLocation,
    returnLocation: row.returnLocation,
    itemCount: row.itemCount,
    createdOn: formatAd(new Date(row.createdAtAd)),
    status: row.stage,
    statusKey: statusToken(row.stage),
    flags,
    ...(isOverdue
      ? { statusNote: lateDays > 0 ? `${lateDays} day${lateDays === 1 ? '' : 's'} late` : 'Late today' }
      : {}),
    isCancelled: row.isCancelled,
    isClosed: row.isClosed,
    isOverdue,
    // The Track below the status pill has four dots; the six stages carry
    // orders 0–5. Returned and Closed both fill it. Derived from
    // `BOOKING_STATUS[stage].order` rather than stored, so the dots and the
    // pill cannot disagree.
    progress: Math.min(BOOKING_STATUS[row.stage].order, 4),
    // One tone map, shared with Today's Timeline, so the same booking is not a
    // different colour on two screens. §1.9 — Overdue is Critical and outranks
    // the stage wherever it appears.
    progressTone: dotTone({ flags, status: row.stage }),
    pickup: stampOf(row.pickupAtAd),
    ret: stampOf(row.returnAtAd),
    deliveryType: row.deliveryType,
    quoteExpires: row.quoteExpiresAtAd ? formatAd(new Date(row.quoteExpiresAtAd)) : null,
    deposit: row.depositRequired,
    // Not derived, and deliberately not defaulted to `false` — see the field's
    // own doc comment. The list query does not select `booking_lines.line_type`,
    // so there is no answer to give and `null` is the one honest value.
    isExternal: null,
  }
}

/* ── Hover Intel — built from the queried row, not from the seed ───────── */

/**
 * ⛔ The Rentals list used to build its Intel cards through
 * `data/bookingIntel.ts`'s `bookingGlance` / `quoteGlance`, which take a
 * `RentalRow` — a shape whose Schedule group renders `location`, `crew`,
 * `pickup.who` and `ret.who`, and whose Money group renders `amount` and `due`.
 * Not one of those six has a column behind it. Feeding a queried row into that
 * builder would have meant manufacturing all six.
 *
 * These two are the honest replacements.
 *
 * ⚠ Corrected 12 Aug 2026 — both halves of what this used to say are now false.
 * `bookingIntel.ts` is NOT untouched: `bookingGlance`, `bookingDetailGroups`,
 * `quoteGlance` and `quoteDetailGroups` were deleted from it (they had no
 * importers at all; `paymentGlance` / `paymentDetailGroups`, which
 * `BookingDetail.tsx` does use, remain). And `ClientDetail.tsx` no longer
 * renders the seed — it reads `listBookings` and `listInvoices`. A stale
 * pointer in a comment about fabricated fields is the kind of thing that gets
 * a fabricated field re-added, so it is corrected rather than left.
 *
 * Gating is the caller's job (HIS v2.1 §4.5 — "gated blocks are omitted from
 * the payload, not CSS-hidden"), which is why `gctx` is threaded through: the
 * deposit line is money and is built only when `canViewMoneyField` passes, on
 * top of the query having asked for the column at all.
 */
export function rentalGlance(row: RentalListRow, gctx: GateContext): IntelGlance {
  const lines = [
    `Pickup ${row.pickup.date} · ${row.pickup.time}`,
    `Return ${row.ret.date} · ${row.ret.time}`,
    `${row.itemCount} item${row.itemCount === 1 ? '' : 's'}`,
  ]
  if (canViewMoneyField(gctx, 'booking') && row.deposit !== null) {
    lines.push(`Deposit required ${formatMoney(row.deposit)}`)
  }

  return {
    avatarLabel: row.monogram.slice(0, 2),
    avatarTone: row.avatarTone,
    avatarIcon: row.status === 'Quote' ? 'file' : 'briefcase',
    title: row.bookingNo,
    statusDot: row.statusKey,
    subtitle: `${row.client} · ${row.project ?? 'No project recorded'}`,
    badges: [
      { label: row.status, tone: row.statusKey },
      ...(row.isOverdue ? [{ label: 'Overdue', tone: 'danger' as StatusKey }] : []),
      ...(row.isCancelled ? [{ label: 'Cancelled', tone: 'danger' as StatusKey }] : []),
    ],
    lines,
    primaryAction: { label: 'Open booking', to: `/rentals/${row.bookingNo}` },
  }
}

export function rentalDetailGroups(row: RentalListRow, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []

  groups.push({
    title: 'Schedule',
    fields: [
      { label: 'Client', value: row.client, trigger: { label: 'Open', to: `/clients/${row.clientId}` } },
      { label: 'Project', value: row.project ?? '—' },
      { label: 'Pickup', value: `${row.pickup.date} · ${row.pickup.time}` },
      { label: 'Pickup location', value: row.pickupLocation ?? '—' },
      { label: 'Return', value: `${row.ret.date} · ${row.ret.time}` },
      { label: 'Return location', value: row.returnLocation ?? '—' },
      // An enum member, not UI copy — 'Customer Pickup' is the delivery_type
      // value and Law 17's ban on the word is about copy, not about data.
      { label: 'Delivery', value: row.deliveryType },
      { label: 'Items', value: `${row.itemCount} unit${row.itemCount === 1 ? '' : 's'} across live lines` },
      { label: 'Created', value: row.createdOn },
      {
        label: 'Progress',
        value: `Step ${row.progress} of 4 — ${row.status}${row.statusNote ? ` (${row.statusNote})` : ''}`,
      },
    ],
  })

  if (row.status === 'Quote') {
    groups.push({
      title: 'Quote',
      fields: [
        // 0002:37 carries a TODO(decision) recording that whether a quote lapses
        // at all is unspecified, and nothing in the schema acts on the date. So
        // this states the date; it does not render a verdict.
        { label: 'Valid until', value: row.quoteExpires ?? 'No expiry recorded' },
        { label: 'Reserves', value: 'Nothing — a quote does not hold inventory until it converts (§1.2)' },
      ],
    })
  }

  if (canViewMoneyField(gctx, 'booking')) {
    const money: IntelField[] = [
      {
        label: 'Deposit required',
        value: row.deposit === null ? 'Not requested by this screen' : formatMoney(row.deposit),
      },
      // Stated rather than omitted: an operator who sees a Money group with one
      // line should know the other two are absent by design, not missing by
      // accident. Same "Not available" convention `equipmentIntel.ts` uses.
      {
        label: 'Rental total / outstanding',
        value: 'Not on the list row — both are the Financial Engine’s figures and live on the booking (Law 1).',
      },
    ]
    groups.push({ title: 'Money', fields: money })
  }

  if (row.isCancelled) {
    groups.push({
      title: 'Cancelled',
      fields: [
        {
          label: 'Outcome',
          // Law 3: nothing is deleted. `cancelled_at` is the record. The reason
          // and the canceller are columns on `bookings` (0002:41-42) that
          // `listBookings` does not select, so they are named as absent rather
          // than guessed.
          value: 'Cancelled and retained (Law 3). The reason and who cancelled are not selected by this list query.',
        },
      ],
    })
  }

  return groups
}
