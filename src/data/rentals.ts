import type { StatusKey, BrandKey } from '../lib/status'
import { BOOKING_STATUS, statusToken } from '../lib/workflow'
import type { BookingStatus, Flag } from '../lib/workflow'
import { rupees, formatMoney } from '../lib/money'
import type { Paisa } from '../lib/money'
import { formatAd } from '../lib/bs'
import { displayProjectType } from '../lib/projectTypes'
import { clockPad, deliveryTypeLabel } from '../lib/format'
import { canViewMoneyField } from '../lib/fieldGating'
import type { GateContext } from '../lib/fieldGating'
import type { IntelField, IntelGlance, IntelGroup } from '../components/ui/IntelCard'
import { overdue, todaysIncoming, todaysOutgoing, type BookingListRow } from '../lib/queries/bookings'
import type { ListFilters } from '../lib/queries/listQuery'
import { supabase } from '../lib/supabase'
/*
 * §11.1 — the sub-rental rule is `data/booking.ts`'s, not a second copy written
 * here. This module only asks it of a LIST; the rule itself stays in one place.
 */
import { SUB_RENTAL_LINE_TYPES, isSubRentalBooking, type SubRentedLine } from './booking'
import {
  ACTIVE_RENTALS_FILTERS,
  businessDayAd,
  businessNowAd,
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
 *   are now four count queries (`rentalKpiFilters()` below, rendered by
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
export const OPTIONAL_COLUMNS = ['Items', 'Pickup', 'Return', 'Total Amount'] as const
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]

export const ROWS_PER_PAGE = [5, 10, 20, 50] as const

export const RENTAL_TOTAL_NOTE =
  'Total Amount from the booking invoices / live calculation.'

export const RENTAL_DEPOSIT_NOTE = RENTAL_TOTAL_NOTE

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
  | 'Pickups Today'
  | 'Returns Today'
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
  /* Payment Due needs an outstanding balance. bookings carries none — deposit_required is the deposit required, payments (0006:176) is not joined by listBookings, and rental total minus payments is the Financial Engine’s figure, deliberately kept off the list row (Law 1). */ "Payment-due filtering is not available on this list. Check the invoice balance in Finance."

/* ═══════════════════════════════════════════════════════════════════════
 * THE SUB-RENTAL CHIP — rulings §11.1, ruled 13 Aug 2026
 *
 * ⛔ This block used to be `SUB_RENTAL_UNAVAILABLE`, a sentence explaining why
 * the chip shipped `disabled`. §11.1 closed the question it was waiting on:
 *
 *   > A line is sub-rented. A booking counts as sub-rental **if any of its
 *   > lines is**. `LineItem` gains the field. `RentalRow` does **not**: the
 *   > booking-level answer is computed from its lines, never written.
 *
 * So the rule now lives in exactly one place — `data/booking.ts`'s
 * {@link isSubRentalBooking} over {@link SUB_RENTAL_LINE_TYPES} — and this
 * module's job is to answer it for a **list** rather than for one booking.
 *
 * ## Why it is a set of ids and not a filter on `bookings`
 *
 * There is no sub-rental column on `bookings` and there must not be one (that
 * is the ruling). The fact lives on `booking_lines.line_type`
 * (`0001_enums.sql:301`, `0002_bookings.sql:129`). Selecting bookings by it in
 * ONE round trip needs `booking_lines!inner(...)` plus a `referencedTable`
 * -scoped filter — `listBookings`' select string does not carry `!inner` and
 * `applyListFilters` builds unscoped clauses only.
 *
 * So the question is asked of `booking_lines_v` directly, and its answer — a
 * set of `bookings.id` — is handed to `listBookings` as an ordinary
 * `chips: { id: [...] }` group, which `applyListFilters` turns into
 * `id in (…)`. That keeps the narrowing **server-side**, which is the property
 * that matters: `withCount` still counts the matching set, and the pager still
 * walks pages the predicate saw. A client-side narrow of the fetched page —
 * the thing the old comment correctly refused — would leave "Showing 1 to 8 of
 * 214" over three rows.
 *
 * ## Two honest limits, stated rather than hidden
 *
 * 1. **It is two round trips, and the id list rides in the URL.** At a few
 *    hundred sub-rental bookings that is fine; at tens of thousands PostgREST
 *    would answer 414. That failure is loud, not silent, and the structural fix
 *    is one column: add `line_type` to `listBookings`' `booking_lines ( id, qty )`
 *    embed and make it `!inner` for this chip. That file is another pass's;
 *    fold this into it when it lands.
 * 2. **The live corpus currently holds zero sub-rental lines** — verified
 *    16 Aug 2026: `select line_type, count(*) from booking_lines` returns
 *    `Equipment 419` and nothing else. So the chip selects and honestly
 *    reports no matches. It is **not** back-filled from a hand-written array
 *    of booking numbers to make the screen look busier: that would paint
 *    "Sub-rented — external gear" on live bookings nobody computed it for,
 *    which is the fabricated-figure rule, not a cosmetic one. Seeding real
 *    lines is a migration (`lib/seed.ts` → `supabase/migrations`) and needs
 *    approval; see the report.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Which bookings carry at least one live sub-rented line.
 *
 * Returns `null` when the question could not be asked — **"cannot answer",
 * never "no"**, the same convention `RentalListRow.deposit` uses. A `null` here
 * leaves every row's `isExternal` at `null` and the gold outline unfired,
 * rather than asserting that no booking carries external gear.
 *
 * Law 6: the select names `booking_id` and `line_type` only. `supplier_cost`
 * and `markup_amount` are the money on this table and 0019 revokes both; the
 * two columns asked for here are not money, so a Warehouse session gets an
 * answer rather than a 403 — and gets no rupee figure with it.
 *
 * Law 3: `voided_at is null`. A removed line is voided, never deleted
 * (`0002:139`), and a voided sub-rental must not keep marking its booking.
 */
/**
 * PostgREST caps an unpaged response — 1000 rows on a default Supabase project,
 * as this repo already records at `modules/finance/Finance.tsx:310`. An unpaged
 * select here would not fail at that ceiling; it would **succeed with fewer rows
 * than exist**, and every booking whose lines fell past the cut would be
 * reported as carrying no external gear.
 *
 * That is precisely the fabricated "no" the doc above forbids — and worse than
 * the error case, because `null` at least says "unknown". So the read is paged
 * to exhaustion: a short page means the end, a full page means there may be more.
 */
const SUB_RENTAL_PAGE = 1000

/**
 * A ceiling on the loop, not on the data. At 1000 rows a page this is 200,000
 * sub-rental lines — far beyond any plausible corpus, so reaching it means a
 * bug (a filter that stopped filtering, a cursor that stopped advancing) rather
 * than a big customer. Returning `null` there keeps the "unknown, never no"
 * convention instead of silently handing back a partial set.
 */
const SUB_RENTAL_MAX_PAGES = 200

export async function subRentalBookingIds(forBookingIds?: readonly string[]): Promise<readonly string[] | null> {
  const data: { booking_id: string | null; line_type: string | null }[] = []

  if (forBookingIds !== undefined) {
    if (forBookingIds.length === 0) return []
    const { data: rows, error } = await supabase
      .from('booking_lines_v')
      .select('booking_id, line_type')
      .in('line_type', [...SUB_RENTAL_LINE_TYPES])
      .in('booking_id', [...forBookingIds])
      .is('voided_at', null)

    if (error || !rows) return null
    data.push(...rows)
  } else {
    for (let page = 0; page < SUB_RENTAL_MAX_PAGES; page++) {
      const from = page * SUB_RENTAL_PAGE
      const { data: rows, error } = await supabase
        .from('booking_lines_v')
        .select('booking_id, line_type')
        .in('line_type', [...SUB_RENTAL_LINE_TYPES])
        .is('voided_at', null)
        .order('booking_id', { ascending: true })
        .range(from, from + SUB_RENTAL_PAGE - 1)

      if (error || !rows) return null
      data.push(...rows)
      /* A short page is the end of the set. A full one is not proof of more, but
         asking again costs one round trip and guessing costs correctness. */
      if (rows.length < SUB_RENTAL_PAGE) break
      if (page === SUB_RENTAL_MAX_PAGES - 1) return null
    }
  }

  /*
   * The `.in()` above is the same vocabulary pushed to the server so the
   * payload stays small; the predicate below is what DECIDES. Both read
   * `SUB_RENTAL_LINE_TYPES`, so widening the rule (a second line type counting
   * as external, say) changes the filter and the verdict together. That is the
   * "one predicate" §11.1 asks for — not two rules that agree today.
   */
  const byBooking = new Map<string, SubRentedLine[]>()
  for (const row of data) {
    if (row.booking_id === null) continue
    const lines = byBooking.get(row.booking_id)
    const line: SubRentedLine = { lineType: row.line_type ?? undefined }
    if (lines) lines.push(line)
    else byBooking.set(row.booking_id, [line])
  }

  return [...byBooking].filter(([, lines]) => isSubRentalBooking(lines)).map(([id]) => id)
}

/** What the footer says about the chip, so the sentence has one home. */
export const SUB_RENTAL_NOTE =
  /* Sub-Rental is a line-level fact (booking_lines.line_type) — a booking counts as sub-rental when any of its lines does, and the chip narrows the query server-side on that derived set */ "Includes rentals with equipment supplied by another rental house."

/** While the derived set is still in flight. Short-lived, but never silent. */
export const SUB_RENTAL_PENDING =
  'Reading which bookings carry sub-rented lines. The chip cannot narrow until that answer arrives — selecting it now would return the unfiltered list under a Sub-Rental label.'

/** Shown instead of a figure when the sub-rental question could not be asked. */
export const SUB_RENTAL_UNANSWERED =
  'Which bookings carry sub-rented lines could not be read from booking_lines. The chip is left unselectable rather than answering “none”, and no row is marked.'

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
  'Pickups Today': 'bookings going out in the current operational day (the Today screen Pickups list, same set)',
  'Returns Today': 'bookings due back in the current operational day (the Today screen Returns list, same set)',
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

function dayRangeOf(period: LivePeriod, dayAd: string): DayRange {
  const r = periodRange(period, dayAd)
  if (!r) throw new Error(`periodRange("${period}") has no range; only "All" answers null`)
  return r
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

/**
 * ⛔ The three day-bounded chips used to read module-scope `PICKUP_TOMORROW` /
 * `PICKUP_NEXT_SEVEN` / `RETURN_BY_TOMORROW`, built once at import from
 * `TODAY_DAY_AD` (X-05). A tablet left on this list across midnight kept the
 * *previous* day's bounds under chips still labelled Tomorrow and Next 7 Days.
 *
 * They are derived per call now, and from `nowAd` itself rather than from a
 * second reading of the clock, so the day these chips bound and the instant the
 * Overdue chip compares against can never be two different days.
 */
function chipFilters(chip: ChipKey, custom: CustomRange, nowAd: string): ListFilters {
  const dayAd = businessDayAd(new Date(nowAd))
  const tomorrow = dayRangeOf('Tomorrow', dayAd)
  const pickupTomorrow = boundsFrom(todaysOutgoing, tomorrow)
  const pickupNextSeven = boundsFrom(todaysOutgoing, dayRangeOf('Next 7 Days', dayAd))
  /** `return_at <= end of tomorrow`, with no lower bound — anything already due counts. */
  const returnByTomorrow: DateRange = {
    column: 'return_at',
    toAd: boundsFrom(todaysIncoming, tomorrow).toAd,
  }

  switch (chip) {
    // `All` is the **default scope**, not a date filter: the render shows rows
    // dated 2 Jul – 2 Aug under it, and `matchesChip` returned `true`
    // unconditionally. It stays "no constraint" — and is now named for what it
    // does (`04_RENTALS.md` §4.1 draws it as `(All)`).
    case 'All':
      return bySortedPickup()
    /* G2 (RULING 2026-10-07): the very named sets Today's Pickups / Returns panels read — a saved view and
       a dashboard card are one definition, so they cannot disagree about what "today" is. */
    case 'Pickups Today':
      return todaysOutgoing(dayAd)
    case 'Returns Today':
      return todaysIncoming(dayAd)
    case 'Tomorrow':
      return bySortedPickup({ dateRange: pickupTomorrow })
    case 'Next 7 Days':
      return bySortedPickup({ dateRange: pickupNextSeven })
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
        dateRange: returnByTomorrow,
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
 * The `(Sub-Rental)` chip's state, as the query layer needs it.
 *
 * `bookingIds` is the answer from {@link subRentalBookingIds}: an array when
 * the question was asked and answered, `null` when it has not been asked yet or
 * could not be. `null` is **never** "no bookings" — see `narrowSubRental`.
 */
export interface SubRentalNarrowing {
  readonly on: boolean
  readonly bookingIds: readonly string[] | null
}

export const SUB_RENTAL_OFF: SubRentalNarrowing = { on: false, bookingIds: null }

/**
 * Narrow to the derived sub-rental set — §11.1's chip, as a server predicate.
 *
 * ⚠ Both the `null` and the empty-array cases report `impossible` rather than
 * sending the group, and for the same reason `narrowStages` does:
 * `applyListFilters` reads an empty `in ()` as **"no constraint"**, so a chip
 * that matched nothing would return the WHOLE list under a label saying
 * "Sub-Rental". The screen renders its empty state instead — and, while the
 * answer is still `null`, keeps its skeleton up rather than claiming a result.
 */
function narrowSubRental(query: RentalsQuery, sub: SubRentalNarrowing): RentalsQuery {
  if (!sub.on) return query
  if (sub.bookingIds === null || sub.bookingIds.length === 0) {
    return { filters: query.filters, impossible: true }
  }
  return {
    filters: { ...query.filters, chips: { ...query.filters.chips, id: [...sub.bookingIds] } },
    impossible: query.impossible,
  }
}

/**
 * The Rentals list's whole filter set: one chip, the Status accordion, the
 * Sub-Rental toggle, and nothing else. Pagination is added by the screen
 * (`ListFilters.page`).
 *
 * The three AND together, which is how the chip row reads: `(Sub-Rental)` sits
 * on its own line beside the view toggle in §4.1's drawing, not inside the
 * twelve quick filters, so it narrows *whatever* they selected rather than
 * replacing it.
 *
 * `nowAd` is a parameter rather than a `Date.now()` call so the mapping stays
 * pure and testable. It is an **INSTANT** — the Overdue chip is exactly
 * `overdue(nowAd)` and that set compares `return_at` against a `timestamptz`.
 *
 * ⛔ The default was `data/today.ts`'s `NOW_AD`, a module-scope constant holding
 * midnight UTC of the operating day (X-06). Two faults in one value: it was a
 * DAY MARKER (05:45 in Kathmandu, so the Overdue chip and KPI silently dropped
 * every booking that fell due earlier the same day, and `toRentalListRow`'s
 * "Late today" state could never be reached), and it was frozen at import. The
 * default now resolves at the call.
 */
export function rentalsQuery(
  chip: ChipKey,
  custom: CustomRange,
  statuses: readonly BookingStatus[],
  nowAd: string = businessNowAd(),
  subRental: SubRentalNarrowing = SUB_RENTAL_OFF,
): RentalsQuery {
  return narrowSubRental(narrowStages(chipFilters(chip, custom, nowAd), statuses), subRental)
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
 *
 * ## ⛔ Why this is a function of `nowAd` and no longer a constant
 *
 * It was `RENTAL_KPI_FILTERS`, an object built at import from `TODAY_DAY_AD`
 * and `NOW_AD`. Three of the four figures are labelled by the day — Pickups
 * Today, Returns Today, Overdue — so a tablet left on this list across midnight
 * kept yesterday's counts under today's headings, and the Overdue count was
 * measured against 05:45 rather than against now (X-05, X-06).
 *
 * Taking the instant as an argument moves the decision to the caller, which
 * renders it, exactly as `data/calendar.ts`'s `railBookingCounts` does. The day
 * the two "today" counts bound is derived from that same instant, so the three
 * cards cannot end up on two different days. `useList` keys its effect on the
 * VALUE of the filter set, not its identity, so rebuilding these objects costs
 * nothing and re-queries only when the answer actually changes.
 */
const COUNT_PAGE: ListFilters['page'] = { index: 0, size: 1 }

export function rentalKpiFilters(nowAd: string = businessNowAd()): Record<
  'active' | 'pickups' | 'returns' | 'overdue',
  ListFilters
> {
  const dayAd = businessDayAd(new Date(nowAd))
  return {
    /** Everything currently with a client. Shared verbatim with Today's own card. */
    active: { ...ACTIVE_RENTALS_FILTERS, page: COUNT_PAGE },
    /** Today ▸ Outgoing — pickups on the operating day that have not left yet. */
    pickups: { ...todaysOutgoing(dayAd), page: COUNT_PAGE },
    /** Today ▸ Incoming — returns due on the operating day, still out. */
    returns: { ...todaysIncoming(dayAd), page: COUNT_PAGE },
    /** Due back before **now** and never actually returned. An instant, not a day. */
    overdue: { ...overdue(nowAd), page: COUNT_PAGE },
  }
}

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
  /**
   * `bookings.project_type` + `project_type_other` (0144) — the ALREADY-DISPLAYED
   * answer, resolved once here so no screen re-derives it. `Other` renders its
   * custom text; anything unlisted or null renders the unset dash. Neutral by
   * construction: color stays reserved for operational state (spec §3).
   */
  projectTypeDisplay: string
  /** The raw stored type, for filtering/sorting by the controlled value. */
  projectTypeValue: string | null
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
  pickup: { date: string; time: string; ad?: string }
  /** `return_at`, same split. */
  ret: { date: string; time: string; ad?: string }
  /** `bookings.delivery_type`. An enum member, not UI copy (Law 17). */
  deliveryType: BookingListRow['deliveryType']
  /** `bookings.quote_expires_at`, rendered. `null` means none was set. */
  quoteExpires: string | null
  /**
   * `bookings.deposit_required`. **`null` means the caller did not ask**, which
   * is what a money-blind session must produce — not "no deposit".
   */
  deposit: Paisa | null
  /** Total Amount for the rental booking (from invoices / rental calculation). `null` when not asked. */
  totalAmount?: Paisa | null
  /**
   * Does this booking carry externally-sourced (sub-rented) gear?
   *
   * **Derived, never stored** — rulings §11.1. There is no booking-level column
   * and there must not be one; this is `data/booking.ts`'s
   * `isSubRentalBooking` applied to the booking's lines, delivered as the id
   * set {@link subRentalBookingIds} returns.
   *
   * `null` still means **"this query cannot answer" — never "no"**, the same
   * convention as `deposit` above. It is what a row carries before the id set
   * has arrived, and what every row carries if reading `booking_lines` failed.
   * Coalescing it to `false` would assert "carries no external gear" about
   * every booking in the database from a question nobody asked.
   *
   * §4.1 draws a gold-outlined row for external gear and §4.2's Notes put the
   * outline on the *line*; §11.1 says both, from one fact. The row treatment is
   * `ExternalGearMark` in `RentalsList.tsx` — gold outline **plus**
   * `STATUS.ext`'s `external_link` icon **plus** the label "Sub-rented", per
   * Law 11, colour never alone — and it fires on `true` only.
   */
  isExternal: boolean | null
}

/** "31 Jul 2026" + "09:00 AM", both rendered in Kathmandu (Law 7). */
function stampOf(instantAd: string): { date: string; time: string; ad: string } {
  return { date: formatAd(new Date(instantAd)), time: clockPad(kathmanduMinutes(instantAd)), ad: instantAd }
}

/**
 * A raw booking row → the row the table renders.
 *
 * `isOverdue` is `overdue()`'s predicate evaluated against the same anchor
 * instant the Overdue chip sends to Postgres — On Rent, past `return_at`,
 * `actual_return_at` still null — so a row cannot be overdue in the chip and on
 * time in the table.
 *
 * ⛔ `nowAd` defaulted to `data/today.ts`'s `NOW_AD` — midnight UTC of the
 * operating day, i.e. 05:45 in Kathmandu (X-06). `lateDays` is
 * `civilDaysBetween(return_at, nowAd)`, so a booking that fell due at 09:00 this
 * morning came back as *not overdue at all*. The default is the real instant
 * now.
 *
 * (An earlier note here also claimed the `'Late today'` wording was unreachable
 * under the old anchor. It was not: a booking due at 02:00 NPT is both before
 * 05:45 — so the predicate accepts it — and on the same Kathmandu civil day, so
 * `civilDaysBetween` returns 0. The overnight window is small, but the note
 * rendered. Left written down because a "this branch is dead" claim is exactly
 * the kind a later reader deletes code on.)
 *
 * `Due Soon` is deliberately NOT derived, even though the seed carried it: it
 * needs a "how soon is soon" window no spec in this repo states, and inventing
 * one puts an amber badge on a booking for a reason nobody chose. `VIP` needs a
 * client attribute the schema does not have at all.
 */
export function toRentalListRow(
  row: BookingListRow,
  nowAd: string = businessNowAd(),
  /**
   * The derived sub-rental set, or `null` while it is unknown. Passed in rather
   * than fetched here so the mapping stays pure — and so the one answer the
   * screen holds is the one both the chip and the row marker read.
   */
  subRentedBookingIds: ReadonlySet<string> | null = null,
): RentalListRow {
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
    projectTypeDisplay: displayProjectType(row.projectType, row.projectTypeOther),
    projectTypeValue: row.projectType,
    pickupLocation: row.pickupLocation,
    returnLocation: row.returnLocation,
    itemCount: row.itemCount,
    createdOn: formatAd(new Date(row.createdAtAd)),
    status: row.stage,
    statusKey: statusToken(row.stage),
    flags,
    ...(isOverdue
      ? { statusNote: lateDays > 0 ? `${lateDays} day${lateDays === 1 ? '' : 's'} late` : 'Late today' }
      : row.stage === 'Quote' && !row.isCancelled && row.quoteExpiresAtAd && row.quoteExpiresAtAd < nowAd
        ? { statusNote: 'Quote expired' }
      : row.stage === 'Quote' && !row.isCancelled && row.pickupAtAd < nowAd
        ? { statusNote: 'Pickup date passed' }
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
    // A deposit is a liability (Law 5); it cannot stand in for a rental total.
    totalAmount: row.totalAmount ?? null,
    // §11.1 — derived from the lines, never a column. `null` while the set is
    // unknown; deliberately NOT defaulted to `false`, which would assert "no
    // external gear" from a question nobody asked. See the field's own comment.
    isExternal: subRentalOf(subRentedBookingIds, row.id),
  }
}

/** The derived answer for one booking, or `null` while the set is unknown. */
function subRentalOf(ids: ReadonlySet<string> | null, bookingId: string): boolean | null {
  return ids === null ? null : ids.has(bookingId)
}

/**
 * The same derivation applied to a row that is already mapped.
 *
 * The screen needs this because the id set and the page of rows arrive from two
 * independent requests: whichever lands second must still be able to mark the
 * rows. Written here rather than inline in `RentalsList.tsx` so the rule has
 * one home — a page re-deriving "is this booking sub-rental" from anything else
 * is exactly the second opinion §11.1 forbids.
 *
 * Returns the row unchanged when the answer has not moved, so the render memo
 * downstream of it does not churn on identity alone.
 */
export function withSubRental(row: RentalListRow, subRentedBookingIds: ReadonlySet<string> | null): RentalListRow {
  const isExternal = subRentalOf(subRentedBookingIds, row.id)
  return row.isExternal === isExternal ? row : { ...row, isExternal }
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
    /* Project Type sits under the client/project subtitle (spec §20) — one
       neutral line, never a status-colored badge (spec §3). */
    row.projectTypeDisplay,
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
      /* Spec §21 — name and kind stay separate fields, never combined. */
      { label: 'Project type', value: row.projectTypeDisplay },
      { label: 'Pickup', value: `${row.pickup.date} · ${row.pickup.time}` },
      { label: 'Pickup location', value: row.pickupLocation ?? '—' },
      { label: 'Return', value: `${row.ret.date} · ${row.ret.time}` },
      { label: 'Return location', value: row.returnLocation ?? '—' },
      // ⛔ This printed `row.deliveryType` raw. It is the stored
      // `bookings.delivery_type` enum, whose first member is spelled
      // 'Customer Pickup' (`0001_enums.sql:280`) — and these groups ARE
      // rendered: `RentalsList.tsx` passes them to the Intel card as
      // `detail`. So the banned word reached the DOM (Law 17).
      //
      // `deliveryTypeLabel` is the one sanctioned enum→copy crossing.
      // The ROW field stays the enum on purpose (see its own doc
      // comment): logic that compares the stored value — e.g.
      // `driverSignatureRequired` in `HandoverWorkspace.tsx` — must never
      // be handed the label, which matches no enum member.
      { label: 'Delivery', value: deliveryTypeLabel(row.deliveryType) },
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
