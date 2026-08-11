/**
 * Hover Intel System v2.1 — the Booking + Payment cards.
 *
 * Same split as `clientIntel.ts`/`equipmentIntel.ts`: every gating decision
 * goes through `lib/fieldGating.ts`, this file only decides what a field says
 * once it has already been cleared to render.
 *
 * Two money categories apply here, not one. §4.1's Coordinator carve-out is
 * "booking-level money + client balance/deposit only (no asset ROI, **no
 * crew pay**, no supplier margin)" — so a crew member's day-rate/payout is
 * gated `'asset-finance'` (Coordinator excluded), while the booking's own
 * rental total / discount / deposit / payment figures are gated `'booking'`
 * (Coordinator included). Getting that split backwards would show a
 * Coordinator the one line §4.1 explicitly names as forbidden.
 *
 * Only `BOOKING.no` (`BK-2026-0715`, from `data/booking.ts`) carries the full
 * booking seed — items, crew, transport, documents, timeline, notes. Every
 * other row in `data/rentals.ts`'s `ROWS` is a real, separately-seeded
 * `RentalRow`, but that shape only carries summary fields (client, kit, items
 * count, pickup/return, amount/due/deposit) — there is no per-row gear/crew/
 * document data to build a Gear or Crew group from. Rather than fabricate
 * one, `bookingDetailGroups` states the gap honestly for every booking except
 * the one seeded record — the same "Not available" convention
 * `equipmentIntel.ts` uses for `utilizationPct`/`recoveryPct`.
 */

import { formatAd, toBs, formatBs } from '../lib/bs'
import { formatMoney, DISCOUNT_APPROVAL_THRESHOLD } from '../lib/money'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField, canViewNotes } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'
import type { RentalRow } from './rentals'
import {
  BOOKING,
  ITEMS,
  CREW,
  CREW_SUBTOTAL,
  TRANSPORT,
  TOTALS,
  RENTAL_TOTAL,
  EQUIPMENT_SUBTOTAL,
  DEPOSIT_LEDGER,
  RENTAL_PAYMENTS,
  DOCUMENTS,
  TIMELINE,
  NOTES,
  NOTES_BY,
  NOTES_AT,
} from './booking'
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

/* ── Booking ───────────────────────────────────────────────────────────── */

function isFullySeeded(row: RentalRow): boolean {
  return row.bookingNo === BOOKING.no
}

export function bookingGlance(row: RentalRow, gctx: GateContext): IntelGlance {
  const lines: string[] = [
    `Pickup ${formatAd(row.pickup.ad)} · ${row.pickup.time} · ${row.items} item${row.items === 1 ? '' : 's'}`,
  ]
  if (canViewMoneyField(gctx, 'booking') && row.due !== undefined) {
    lines.push(row.due === 0 ? 'Paid in full' : `${formatMoney(row.due)} due`)
  }

  return {
    avatarLabel: (row.avatar[0] ?? row.client).slice(0, 2).toUpperCase(),
    avatarTone: row.avatarTone,
    avatarIcon: 'briefcase',
    title: row.bookingNo,
    statusDot: row.statusKey,
    subtitle: `${row.client} · ${row.project}`,
    badges: [
      { label: row.status, tone: row.statusKey },
      ...(row.tag ? [{ label: row.tag.text, tone: row.tag.status }] : []),
    ],
    lines,
    primaryAction: { label: 'Open booking', to: `/rentals/${row.bookingNo}` },
  }
}

export function bookingDetailGroups(row: RentalRow, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []
  const full = isFullySeeded(row)
  const canBookingMoney = canViewMoneyField(gctx, 'booking')
  const canCrewMoney = canViewMoneyField(gctx, 'asset-finance')

  groups.push({
    title: 'Schedule',
    fields: [
      { label: 'Client', value: row.client },
      { label: 'Project', value: row.project },
      { label: 'Location', value: row.location },
      { label: 'Pickup', value: `${formatAd(row.pickup.ad)} · ${row.pickup.time} · ${row.pickup.who}` },
      { label: 'Return', value: `${formatAd(row.ret.ad)} · ${row.ret.time} · ${row.ret.who}` },
      // §1.2's four-step pipeline (Track, RentalsList.tsx) stated in words —
      // the spec calls for a "6-dot" stepper that does not exist anywhere in
      // this build; the existing 4-step one is described as-is rather than
      // reconciled against a stepper this app never built.
      { label: 'Progress', value: `Step ${row.progress} of 4 — ${row.status}${row.statusNote ? ` (${row.statusNote})` : ''}` },
    ],
  })

  const moneyFields: IntelField[] = []
  if (canBookingMoney) {
    if (row.amount !== undefined) moneyFields.push({ label: 'Rental total', value: formatMoney(row.amount) })
    if (row.due !== undefined) moneyFields.push({ label: 'Outstanding', value: row.due === 0 ? 'Paid' : formatMoney(row.due) })
    if (row.deposit !== undefined) moneyFields.push({ label: 'Deposit held', value: formatMoney(row.deposit) })
  }
  if (moneyFields.length > 0) groups.push({ title: 'Money', fields: moneyFields })

  if (full) {
    groups.push({
      title: 'Gear',
      fields: ITEMS.map((it): IntelField => {
        const serial = it.serial && it.serial !== '—' ? it.serial : undefined
        const label = it.depth === 0 || !serial ? it.name : `${it.name} · ${serial}`
        const value = [it.qty && `Qty ${it.qty}`, it.rate, it.total].filter(Boolean).join(' · ') || (it.badge ? it.badge.text : '—')
        // Only depth-2 leaves carry a real, individually-tracked serial
        // (`/inventory/:assetId` resolves a child's serial — see
        // `equipmentIntel.ts`'s `assetDetailPath`); bundle/category rows
        // reuse the same field for descriptive text ("18 Items · 10%
        // Bundle Discount"), which is not a route.
        if (it.depth === 2 && serial && !serial.includes(' ')) {
          return { label, value, trigger: { label: 'Open', to: `/inventory/${encodeURIComponent(serial)}` } }
        }
        return { label, value }
      }),
    })

    const crewFields: IntelField[] = CREW.map((c): IntelField => ({
      label: c.name,
      value: canCrewMoney ? `${c.role} · Rs ${c.rate}/day × ${c.days} days = Rs ${c.amount}` : c.role,
    }))
    if (canCrewMoney) crewFields.push({ label: 'Crew subtotal', value: `Rs ${CREW_SUBTOTAL}` })
    groups.push({ title: 'Crew', fields: crewFields })

    groups.push({
      title: 'Delivery & Driver',
      fields: TRANSPORT.filter((t) => t.label !== 'Transport Charge' || canBookingMoney).map(
        (t): IntelField => ({ label: t.label, value: t.value }),
      ),
    })

    if (canBookingMoney) {
      const discountRow = TOTALS.find((t) => t.label.startsWith('Discount'))
      const discountMatch = discountRow ? /\((\d+)/.exec(discountRow.label) : null
      const discountPercent = discountMatch && discountMatch[1] ? Number(discountMatch[1]) : undefined

      groups.push({
        title: 'Pricing',
        fields: [
          { label: 'Equipment subtotal', value: EQUIPMENT_SUBTOTAL },
          ...TOTALS.map((t): IntelField => ({ label: t.label, value: t.value })),
          { label: 'Rental total', value: RENTAL_TOTAL },
          {
            label: 'Discount reason',
            value:
              discountPercent === undefined
                ? '—'
                : discountPercent > DISCOUNT_APPROVAL_THRESHOLD
                  ? `Required but not on file — a discount above ${DISCOUNT_APPROVAL_THRESHOLD}% needs a reason and a Manager approver (§2.5)`
                  : `Not required — ${discountPercent}% is at or under the ${DISCOUNT_APPROVAL_THRESHOLD}% threshold that needs no reason (§2.5)`,
          },
        ],
      })

      groups.push({
        title: 'Deposit & Payments',
        fields: [
          ...DEPOSIT_LEDGER.map((d): IntelField => ({ label: d.label, value: d.value })),
          ...RENTAL_PAYMENTS.map((p): IntelField => ({ label: p.label, value: p.value })),
        ],
      })
    }

    groups.push({
      title: 'Documents',
      fields: DOCUMENTS.map((d): IntelField => ({ label: d.name, value: d.ready ? `${d.kind} · Ready` : d.kind })),
    })

    groups.push({
      title: 'Event log',
      fields: TIMELINE.map((t): IntelField => ({ label: t.what, value: `${t.at} · ${t.who}` })),
    })

    if (canViewNotes(gctx) && NOTES) {
      groups.push({
        title: 'Notes',
        fields: [
          { label: 'Internal note', value: NOTES },
          { label: 'Added by', value: `${NOTES_BY} · ${NOTES_AT}` },
        ],
      })
    }
  } else {
    groups.push({
      title: 'Detail',
      fields: [
        {
          label: 'Full detail',
          value: `Gear, crew, delivery, documents and the event log are only seeded for ${BOOKING.no} today — every other booking, including this one, shows summary fields only until the repository layer lands.`,
        },
      ],
    })
  }

  return groups
}

/* ── Quote ─────────────────────────────────────────────────────────────── */

/**
 * §1.2: Quote is one value of `BookingStatus`, not a separate entity or ID
 * series — it lives in the exact same `RentalRow` / `data/booking.ts` shape a
 * regular booking does, so this reuses `bookingGlance`/`bookingDetailGroups`'s
 * row and gating plumbing rather than a parallel model. The one real seeded
 * Quote-status row today is `BK-2026-0714` (City Motion) — `lib/workflow.ts`
 * §1.4's `RETIRED.Cancelled` maps to exactly `{ status: 'Quote', flags:
 * ['Cancelled'] }`, which is what that row carries.
 *
 * Two gaps are stated honestly rather than filled, both judgment calls:
 *   - `row.amount` is `undefined` on `BK-2026-0714` (`RentalRow`'s own doc:
 *     "Absent on a cancelled booking — there is nothing to bill"), so there
 *     is no real quoted figure anywhere in the seed data. Rather than invent
 *     one, the Money group states the gap — the same "Not available"
 *     convention `invoiceIntel.ts` uses for Export (PDF).
 *   - `ITEMS` in `data/booking.ts` is only seeded for `BOOKING.no`
 *     (`BK-2026-0715`) — exactly the gap `bookingDetailGroups`'s `full`
 *     branch already states for every other row. The Quote's Line Items
 *     group states that same gap rather than fabricating a breakdown.
 *
 * "Convert to booking" is a status transition — `canAdvance('Quote',
 * 'Booked')` is structurally true per §1.2's forward-only rule — but no
 * engine exists yet to actually run it or re-check availability. Law 1
 * ("pages never implement business logic") plus PLAN.md Phase 3 still being
 * pending means this stays a stated gap, not a working button.
 */

export function quoteGlance(row: RentalRow, gctx: GateContext): IntelGlance {
  const money = canViewMoneyField(gctx, 'booking')
  const parts: string[] = [row.sentAd ? `Sent ${row.sentAd}` : 'Sent — not on file']
  if (money) parts.push(row.amount !== undefined ? formatMoney(row.amount) : 'amount not on file')
  // Plain text, not computed — §1.2: "Priced, not committed. Reserves
  // nothing." A quote does not reserve inventory, so there is no reservation
  // system to ask.
  parts.push('holds nothing')

  return {
    avatarLabel: (row.avatar[0] ?? row.client).slice(0, 2).toUpperCase(),
    avatarTone: row.avatarTone,
    avatarIcon: 'file',
    title: row.bookingNo,
    statusDot: row.statusKey,
    subtitle: `${row.client} · ${row.project}`,
    badges: [
      { label: row.status, tone: row.statusKey },
      ...(row.tag ? [{ label: row.tag.text, tone: row.tag.status }] : []),
    ],
    lines: [parts.join(' · ')],
    primaryAction: { label: 'Open booking', to: `/rentals/${row.bookingNo}` },
  }
}

export function quoteDetailGroups(row: RentalRow, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []
  const sentBs = row.sentAd ? bsLabel(row.sentAd) : null
  const validBs = row.validUntilAd ? bsLabel(row.validUntilAd) : null

  const quoteFields: IntelField[] = [
    { label: 'Client', value: row.client },
    { label: 'Project', value: row.project },
    { label: 'Location', value: row.location },
    { label: 'Sent', value: row.sentAd ? (sentBs ? `${row.sentAd} · ${sentBs}` : row.sentAd) : 'Not on file' },
    {
      label: 'Valid until',
      value: row.validUntilAd ? (validBs ? `${row.validUntilAd} · ${validBs}` : row.validUntilAd) : 'Not on file',
    },
    { label: 'Reserves', value: 'Nothing — a quote does not hold inventory until it converts (§1.2)' },
  ]
  if (row.flags.includes('Cancelled')) quoteFields.push({ label: 'Outcome', value: 'Cancelled' })
  groups.push({ title: 'Quote', fields: quoteFields })

  if (canViewMoneyField(gctx, 'booking')) {
    groups.push({
      title: 'Money',
      fields: [
        {
          label: 'Quoted amount',
          value:
            row.amount !== undefined
              ? formatMoney(row.amount)
              : 'Not available — no quoted rental total is recorded for this booking',
        },
      ],
    })
  }

  groups.push({
    title: 'Line Items',
    fields: [
      {
        label: 'Items',
        value: `Not available — line-item data in data/booking.ts is only seeded for ${BOOKING.no}; ${row.bookingNo} has no line-item breakdown in the seed data (the same gap bookingDetailGroups states for every booking except that one).`,
      },
    ],
  })

  groups.push({
    title: 'Convert to Booking',
    fields: [
      {
        label: 'Availability re-check',
        value: "Not available — booking status transitions aren't wired to an engine yet (Phase 3).",
      },
    ],
  })

  return groups
}

/* ── Payment ───────────────────────────────────────────────────────────── */

export function paymentGlance(payment: PaymentHistoryRow, bookingNo: string, gctx: GateContext): IntelGlance {
  const money = canViewMoneyField(gctx, 'booking')
  const bs = bsLabel(payment.date)

  return {
    avatarLabel: payment.type.slice(0, 2).toUpperCase(),
    avatarTone: payment.status === 'Received' ? 'in' : 'progress',
    avatarIcon: 'receipt',
    title: money ? `Rs ${payment.amount} · ${payment.type}` : payment.type,
    statusDot: payment.status === 'Received' ? 'in' : 'progress',
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
