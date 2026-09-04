/**
 * **The day's closing figures — one read, one shape.**
 *
 * `WHATSAPP_LINKS_SPEC_v1.0` §2's `daily_digest` and the Daily Closing screen
 * state the same eight numbers. They are gathered here, once, so the screen a
 * person approves and the message that leaves the building cannot disagree —
 * which is the whole risk of a closing ritual whose summary is composed
 * somewhere else (Law 2: the engines own the figures; screens render them).
 *
 * Everything below is a **read**. Nothing here writes, and nothing here
 * re-prices: each figure is a sum of columns the database already maintains
 * (`invoices.outstanding_amount` via `sync_payment_to_invoice()`,
 * `clients.deposit_held_amount` via the directory view).
 *
 * ## ⚠ Two different days are in this object, deliberately
 *
 * `pickupsCount` / `returnsCount` / `newCount` are counted over the
 * **operational day** — D4's `operationalDayStart` (default 06:00), so a 05:30
 * return belongs to yesterday's floor. `collected` is counted over the
 * **calendar day**, because `paymentsInPeriod` uses calendar bounds and
 * `lib/operationalDay.ts`'s header rules that finance and audit boundaries
 * stay at midnight.
 *
 * That is not an oversight and must not be "fixed" by moving one to match the
 * other: the floor's day and the ledger's day are different questions, and VAT
 * periods depend on the second. It IS a real edge, so it is stated on the
 * screen rather than left for someone to discover from a variance they cannot
 * explain: a payment taken at 05:30 lands in a different day's collection
 * total than the return it settles. {@link DailyClosing.dayBoundaryNote}
 * carries the wording.
 */

import { listBookings, operationalDayRange, todaysIncoming, todaysOutgoing } from './bookings'
import { listInvoices, listPayments, outstandingInvoices, paymentsInPeriod } from './finance'
import { sumDepositsHeld } from './clients'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Paisa } from '../money'

/** The four buckets `daily_digest` prints, plus what fed each. */
export interface CollectedByChannel {
  cash: Paisa
  bank: Paisa
  card: Paisa
  /**
   * `Other` AND `Digital wallets` AND payments whose channel is unknown.
   *
   * ⚠ **Digital wallets is folded in here and that hides something real.**
   * eSewa and Khalti are a first-class channel in this market, not a remainder,
   * but the ruled digest template has exactly four buckets and none of them is
   * a wallet. Folding is the honest option available: inventing a fifth line
   * would change a ruled message, and dropping wallet payments would make the
   * four totals not add up to the day's takings. The screen shows the split
   * that the message cannot. Flagged for the spec's §6 open list.
   */
  other: Paisa
  /** Every payment counted above, so a reader can check the four against it. */
  total: Paisa
  /** How much of `other` was specifically a wallet — for the screen, not the message. */
  digitalWallets: Paisa
  /** Payments with no `bank_accounts` row behind them, so no channel at all. */
  unclassified: Paisa
}

export interface DailyClosing {
  /** The AD day these figures describe, as passed in. */
  dayAd: string
  pickupsCount: number
  returnsCount: number
  newCount: number
  collected: CollectedByChannel
  /** Every live invoice still owed, not only today's. A closing states the standing position. */
  receivablesTotal: Paisa
  /** Held across all clients — a liability, never revenue (Law 5). */
  depositsHeld: Paisa
  dayBoundaryNote: string
}

const P = (n: number) => n as Paisa

export const DAY_BOUNDARY_NOTE =
  'Movement counts use the operational day (D4, default 06:00). Collections use the calendar day, because VAT periods do — so a payment taken before 06:00 sits in a different day here than the return it settles.'

/** PostgREST's `max_rows` (supabase/config.toml:18) — the widest page one request can return. */
const CLOSING_PAGE_SIZE = 1000

/**
 * Every row a filter set matches — paged until complete, and **proven**
 * complete against the server's count before it is returned (FI-02).
 *
 * The two money sums in a closing (`collected.*`, `receivablesTotal`) are
 * reductions over rows, and a reduction over one page of a two-page result is
 * a smaller number that looks exactly like the right one. `Finance.tsx`'s
 * `sumOf` refuses to add up a list whose `total !== rows.length`; this is the
 * same rule for a read that is signed rather than displayed. It pages with
 * `page` (→ `.range()`, on the list's `id` tiebreak) until a page comes back
 * short, then checks the rows read against `total`. A mismatch throws a
 * sentence the screen renders — never a short figure.
 *
 * `total` can move between two pages if a payment lands mid-read; the final
 * check catches that too, and a retry is the right answer to it.
 */
async function readEvery<T>(
  what: string,
  list: (opts: ListFilters & { withCount: true }) => Promise<ListQueryResult<T>>,
  filters: ListFilters,
): Promise<T[]> {
  const rows: T[] = []
  let total: number | null = null

  for (let index = 0; ; index += 1) {
    const page = await list({ ...filters, withCount: true, page: { index, size: CLOSING_PAGE_SIZE } })
    rows.push(...page.rows)
    if (typeof page.total === 'number') total = page.total

    if (page.rows.length < CLOSING_PAGE_SIZE) break
    if (total !== null && rows.length >= total) break
    /* A server that never gives a count and never gives a short page cannot be
       read to completion — stop rather than loop, and say so. */
    if (index >= 10_000) throw new Error(`Daily closing cannot be computed: ${what} did not end after ${rows.length} rows.`)
  }

  if (total !== null && rows.length !== total) {
    throw new Error(`Daily closing cannot be computed: ${total} ${what} but only ${rows.length} were read.`)
  }
  return rows
}

/**
 * Read one day's closing position.
 *
 * Six reads, run together. A single failure rejects the whole read rather
 * than returning a partial closing: a screen showing seven right figures and
 * one silently-zero one is worse than a screen that says it could not load,
 * because the zero is indistinguishable from a real quiet day.
 *
 * The three counts take the server's `total`. The two row-sums are read to
 * completion by {@link readEvery}; deposits come from `sumDepositsHeld`, which
 * pages every client — deactivated ones included — and count-checks itself.
 */
export async function fetchDailyClosing(dayAd: string): Promise<DailyClosing> {
  const [outgoing, incoming, created, payments, invoices, deposits] = await Promise.all([
    listBookings({ ...todaysOutgoing(dayAd), withCount: true }),
    listBookings({ ...todaysIncoming(dayAd), withCount: true }),
    listBookings({ ...bookingsCreatedOn(dayAd), withCount: true }),
    readEvery('payments today', listPayments, paymentsInPeriod(dayAd, dayAd)),
    readEvery('outstanding invoices', listInvoices, outstandingInvoices()),
    sumDepositsHeld(),
  ])

  let cash = 0
  let bank = 0
  let card = 0
  let wallets = 0
  let plainOther = 0
  let unclassified = 0
  for (const p of payments) {
    switch (p.channelGroup) {
      case 'Cash':
        cash += p.amount
        break
      case 'Bank':
        bank += p.amount
        break
      case 'Cards':
        card += p.amount
        break
      case 'Digital wallets':
        wallets += p.amount
        break
      case 'Other':
        plainOther += p.amount
        break
      default:
        /* `channelGroup` is null when a payment carries no bank account. Not
           guessed into a bucket — counted, and shown as its own figure so a
           closing that does not add up says why. */
        unclassified += p.amount
    }
  }

  return {
    dayAd,
    /* `total` is the server's count where it gave one; `rows.length` would be
       the page size, which silently caps a busy day at whatever the fetch
       returned. */
    pickupsCount: outgoing.total ?? outgoing.rows.length,
    returnsCount: incoming.total ?? incoming.rows.length,
    newCount: created.total ?? created.rows.length,
    collected: {
      cash: P(cash),
      bank: P(bank),
      card: P(card),
      other: P(wallets + plainOther + unclassified),
      total: P(cash + bank + card + wallets + plainOther + unclassified),
      digitalWallets: P(wallets),
      unclassified: P(unclassified),
    },
    receivablesTotal: P(invoices.filter((r) => !r.isVoid).reduce((s, r) => s + r.outstandingAmount, 0)),
    depositsHeld: deposits.total,
    dayBoundaryNote: DAY_BOUNDARY_NOTE,
  }
}

/**
 * Bookings whose row was CREATED on this day — the digest's "New bookings".
 *
 * Not a stage transition: `created_at` is the insert instant, so a quote raised
 * today and confirmed next week counts today, once. That is what "new bookings
 * today" means at a counter, and `BookingListRow.createdAtAd`'s own comment
 * makes the same distinction. Cancellations are excluded on the same terms as
 * every other named set — 'Cancelled' is a flag, not a stage.
 *
 * ## ⛔ The day this counts over, and the day it used to count over
 *
 * The bounds are `queries/bookings.ts`'s operational day — D4, default 06:00,
 * read from the setting per call — which is the SAME boundary `todaysOutgoing`
 * and `todaysIncoming` use two lines above in {@link fetchDailyClosing}.
 *
 * They used to be `new Date(dayAd)` with `setUTCHours(0,0,0,0)` and
 * `setUTCHours(23,59,59,999)`: midnight **UTC**, which is 05:45 → 05:45 in
 * Kathmandu (FI-06). So the Daily Closing screen carried THREE day boundaries —
 * the operational day for the two movement counts, calendar midnight for
 * `collected`, and this unstated third one for New bookings — while its header
 * told the operator there were two and named which figures used which.
 *
 * Be precise about the size of it, because the first version of this comment
 * was not. Old bounds for day D ran D 05:45 → D+1 05:44:59.999 NPT; the
 * operational day runs D 06:00 → D+1 05:59:59.999. They disagree about exactly
 * one fifteen-minute band, 05:45–06:00, and about nothing else — a booking
 * raised at 05:30, or at 23:30, lands on the same day under both rules. The
 * defect fixed here is therefore the UNSTATED THIRD BOUNDARY on a signed
 * screen, not a figure that was hours out. A reconciliation that cannot be
 * reproduced from the screen's own stated rules is the problem; the fifteen
 * minutes are how often it bites.
 *
 * `collected` is deliberately NOT moved with it: the ledger's day stays at
 * calendar midnight because VAT periods depend on it. That split is the one the
 * header already states — see this module's own header and
 * `lib/operationalDay.ts`'s.
 */
export function bookingsCreatedOn(dayAd: string) {
  const { fromAd, toAd } = operationalDayRange(dayAd)
  return {
    dateRange: { column: 'created_at', fromAd, toAd },
    presence: { cancelled_at: false },
    sort: { column: 'created_at', ascending: false },
  } as const
}

/**
 * The variance line the digest prints, from a counted-cash figure.
 *
 * The comparison is **cash only**. Bank, card and wallet takings are not in a
 * drawer to be counted, so folding them into an expected figure would produce a
 * variance nobody can act on. Returns wording, not a number, because the digest
 * takes wording — and because "balanced" is the answer that should read as a
 * sentence rather than as `Rs 0`.
 *
 * `counted` is `null` when the operator has not counted yet: that is NOT a
 * zero count, and it must never render as "Rs X short".
 */
export function varianceLine(expectedCash: Paisa, counted: Paisa | null, format: (p: Paisa) => string): string {
  if (counted === null) return 'not counted'
  const delta = counted - expectedCash
  if (delta === 0) return 'balanced'
  return delta > 0 ? `${format(P(delta))} over` : `${format(P(Math.abs(delta)))} short`
}
