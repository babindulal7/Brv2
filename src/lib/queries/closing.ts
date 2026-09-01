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

import { listBookings, todaysIncoming, todaysOutgoing } from './bookings'
import { listInvoices, listPayments, outstandingInvoices, paymentsInPeriod } from './finance'
import { listClients } from './clients'
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

/**
 * Read one day's closing position.
 *
 * Six queries, run together. A single failure rejects the whole read rather
 * than returning a partial closing: a screen showing seven right figures and
 * one silently-zero one is worse than a screen that says it could not load,
 * because the zero is indistinguishable from a real quiet day.
 */
export async function fetchDailyClosing(dayAd: string): Promise<DailyClosing> {
  const [outgoing, incoming, created, payments, invoices, clients] = await Promise.all([
    listBookings({ ...todaysOutgoing(dayAd), withCount: true }),
    listBookings({ ...todaysIncoming(dayAd), withCount: true }),
    listBookings({ ...bookingsCreatedOn(dayAd), withCount: true }),
    listPayments(paymentsInPeriod(dayAd, dayAd)),
    listInvoices(outstandingInvoices()),
    listClients(),
  ])

  let cash = 0
  let bank = 0
  let card = 0
  let wallets = 0
  let plainOther = 0
  let unclassified = 0
  for (const p of payments.rows) {
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
    receivablesTotal: P(invoices.rows.filter((r) => !r.isVoid).reduce((s, r) => s + r.outstandingAmount, 0)),
    depositsHeld: P(clients.reduce((s, c) => s + (c.depositHeld ?? 0), 0)),
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
 */
export function bookingsCreatedOn(dayAd: string) {
  const day = new Date(dayAd)
  const from = new Date(day)
  from.setUTCHours(0, 0, 0, 0)
  const to = new Date(day)
  to.setUTCHours(23, 59, 59, 999)
  return {
    dateRange: { column: 'created_at', fromAd: from.toISOString(), toAd: to.toISOString() },
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
