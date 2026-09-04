/**
 * Hover Intel System v2.1 — the Payment card.
 *
 * Same split as `clientIntel.ts`/`equipmentIntel.ts`: every gating decision
 * goes through `lib/fieldGating.ts`, this file only decides what a field says
 * once it has already been cleared to render.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ## What was removed, and why — `bookingGlance` · `bookingDetailGroups` ·
 * ## `quoteGlance` · `quoteDetailGroups`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * All four took a `RentalRow` — the seed shape in `data/rentals.ts`, whose own
 * header names its invented members outright: *"`RentalRow` carries invented
 * columns (`crew`, `kit`, `pickup.who`, `amount`, `due`)"*. Between them the
 * four builders rendered six fields that have **no column anywhere in the
 * schema**:
 *
 *   - `row.location`     — `bookings` has `pickup_location` and
 *                          `return_location`, two nullable free-text columns,
 *                          and no single "location" (0002:35-36).
 *   - `row.crew`         — "Crew 8" as a string. Crew is
 *                          `booking_crew_lines` rows, not a headcount label.
 *   - `row.pickup.who`   — no column. Who hands the goods over is an
 *   - `row.ret.who`         `operation_sessions` fact, not a booking field.
 *   - `row.amount`       — the rental total is the Financial Engine's figure and
 *   - `row.due`             lives on the booking's own totals, never on a row.
 *
 * `data/rentals.ts` already carries the honest replacements — `rentalGlance` /
 * `rentalDetailGroups`, built from the QUERIED `RentalListRow` — and its own
 * comment records that feeding a queried row into these builders "would have
 * meant manufacturing all six". They were kept only because
 * `ClientDetail.tsx` still rendered the seed; that page now reads
 * `client_directory_v` and `listBookings`, so the last reason to keep six
 * invented fields compiling went with it. A grep across `src/` finds no
 * importer of any of the four.
 *
 * `paymentGlance` / `paymentDetailGroups` stay: `modules/rentals/BookingDetail.tsx`
 * imports them, they take a `PaymentHistoryRow` rather than a `RentalRow`, and
 * every field they render is a member of that row. They are still seed-fed
 * (`data/booking.ts`) and still await a payments query — `queries/finance.ts`'s
 * `paymentsForBooking` is the shape that will replace them — but that is an
 * unconverted screen, not a fabricated field.
 *
 * The money category is unchanged: the booking's own payment figures are gated
 * `'booking'` (§4.1's Coordinator carve-out includes them), never
 * `'asset-finance'`.
 */

import { formatMoney } from '../lib/money'
import { toBs, formatBs } from '../lib/bs'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'
import { paymentStatusTone } from '../lib/status'
import { DOCUMENTS } from './booking'
import type { PaymentHistoryRow } from './booking'

/* ── a small AD-label → BS-label bridge, still routed through `lib/bs.ts` ── */

const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The seed layer stores payment dates as pre-formatted labels ("16 Jul
 * 2026"), not `Date`s. This parses that one fixed format back into a UTC
 * `Date` so it can be handed to the real converter below — a text parse, not
 * a calendar conversion; `toBs` stays the only thing in the app that knows
 * the BS offset, per `lib/bs.ts`'s own rule.
 */
function parseAdLabel(label: string): Date | null {
  const m = /^(\d{1,2}) (\w{3}) (\d{4})$/.exec(label)
  if (!m) return null
  const [, dayStr, monStr, yearStr] = m
  if (!dayStr || !monStr || !yearStr) return null
  const month = AD_MONTHS.indexOf(monStr)
  if (month < 0) return null
  return new Date(Date.UTC(Number(yearStr), month, Number(dayStr)))
}

/**
 * BS label for one of those AD strings, or `null` outside `toBs`'s single
 * anchored month (Shrawan 2083) — the 10 Jul 2026 advance payment falls
 * before the anchor and genuinely has no BS label yet, so it is left off
 * rather than guessed.
 */
function bsLabel(adLabel: string): string | null {
  const d = parseAdLabel(adLabel)
  if (!d) return null
  const bs = toBs(d)
  return bs ? formatBs(bs, { suffix: false }) : null
}

/* ── Payment ───────────────────────────────────────────────────────────── */

export function paymentGlance(payment: PaymentHistoryRow, bookingNo: string, gctx: GateContext): IntelGlance {
  const money = canViewMoneyField(gctx, 'booking')
  const bs = bsLabel(payment.date)

  /*
   * ⛔ Both tones were `payment.status === 'Received' ? 'in' : 'progress'` — a
   * TWO-way map over a FOUR-member enum. `Refunded`, `Failed` and `Cancelled`
   * all came out yellow, so a bounced transfer looked like a refund and neither
   * looked like a failure. The Payment History cell two screens over was fixed
   * to a four-way map while this card, which opens FROM THAT SAME ROW, kept the
   * old answer. One map now, in `lib/status.ts`.
   *
   * `status` is a bare `string` here (`PaymentHistoryRow` is a seed shape), so
   * it goes through `paymentStatusTone`, which refuses to answer `in` for a
   * value it does not recognise.
   */
  const tone = paymentStatusTone(payment.status)

  return {
    avatarLabel: payment.type.slice(0, 2).toUpperCase(),
    avatarTone: tone,
    avatarIcon: 'receipt',
    title: money ? `Rs ${payment.amount} · ${payment.type}` : payment.type,
    statusDot: tone,
    /* Law 11 — the dot was the ONLY carrier of status on this card, which is
       what `Payments.tsx`'s own StatusBadge comment forbids: "dot **and** word
       **and** tone". The word is the badge. */
    badges: [{ label: payment.status, tone }],
    subtitle: `${payment.method} · ${bookingNo}`,
    lines: [`${payment.date}${bs ? ` / ${bs}` : ''}`],
  }
}

export function paymentDetailGroups(payment: PaymentHistoryRow, bookingNo: string, gctx: GateContext): IntelGroup[] {
  const money = canViewMoneyField(gctx, 'booking')
  const bs = bsLabel(payment.date)
  const invoiceDoc = DOCUMENTS.find((d) => d.name === 'Invoice')

  return [
    {
      title: 'Payment',
      fields: [
        { label: 'Type', value: payment.type },
        ...(money ? [{ label: 'Amount', value: `Rs ${payment.amount}` }] : []),
        { label: 'Date', value: bs ? `${payment.date} · ${bs}` : payment.date },
        { label: 'Method', value: payment.method },
        { label: 'Status', value: payment.status },
        { label: 'Reference', value: payment.ref },
      ],
    },
    {
      title: 'Linked',
      fields: [
        { label: 'Booking', value: bookingNo, trigger: { label: 'Open', to: `/rentals/${bookingNo}` } },
        // The Invoice doc is the "linked invoice" the spec asks for — sourced
        // from the same `DOCUMENTS` array Block 5 already renders, not a
        // separate invoice record this data model doesn't have.
        { label: 'Invoice', value: invoiceDoc ? (invoiceDoc.ready ? 'Generated' : invoiceDoc.kind) : 'Not on file' },
        { label: 'Recorded by', value: payment.recordedBy ?? 'Not on file' },
      ],
    },
    {
      title: 'Refund / adjustment trail',
      fields:
        payment.adjustments && payment.adjustments.length > 0
          ? payment.adjustments.map(
              (a): IntelField => ({
                label: a.ad,
                value: money ? `${formatMoney(a.amountPaisa)} — ${a.reason}` : a.reason,
              }),
            )
          : [{ label: 'Adjustments', value: 'None recorded' }],
    },
  ]
}
