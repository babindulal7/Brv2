/**
 * Hover Intel System v2.1 §3 — the Invoice card (Tier 2).
 *
 * Mirrors `clientIntel.ts`/`equipmentIntel.ts`'s split: every gating decision
 * goes through `lib/fieldGating.ts`, this file only decides what a field says
 * once it has already been cleared to render. Invoice money is
 * Coordinator-visible — HIS v2.1 §4.1 puts "booking-level money" in
 * Coordinator's scope, and an invoice is booking money — so every figure here
 * is gated with `canViewMoneyField(gctx, 'booking')`, not `'asset-finance'`.
 *
 * `InvoiceRow` is the canonical shape for `Finance.tsx`'s inline `INVOICES`
 * array (there is no `src/data/invoices.ts`); the type and the small
 * status/tone vocabulary live here so `Finance.tsx` can import them without a
 * circular dependency (`Finance.tsx` also imports `invoiceGlance` /
 * `invoiceDetailGroups` from this file).
 */

import type { Paisa } from '../lib/money'
import { formatMoney, parseMoney, rupees } from '../lib/money'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'
import type { StatusKey } from '../lib/status'

export const INVOICE_STATUSES = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Void'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const INVOICE_TOKEN: Record<InvoiceStatus, StatusKey> = {
  Draft: 'neutral',
  Sent: 'primary',
  'Partially Paid': 'progress',
  Paid: 'in',
  Overdue: 'danger',
  Void: 'neutral',
}

export interface InvoiceRow {
  id: string
  client: string
  booking: string
  /**
   * Pre-formatted "Rs X,XX,XXX" — `Finance.tsx`'s own `rs()` helper, kept as
   * the table's existing display value rather than duplicated as a second
   * paisa field. `amountPaisaOf()` below recovers the paisa figure via
   * `parseMoney` so glance/detail arithmetic has one source of truth.
   */
  amount: string
  /** Due date, e.g. "2 Aug 2026", or "—" when settled/not yet issued. Not a money figure. */
  due: string
  status: InvoiceStatus

  /* ---- Hover Intel System v2.1 Tier 2 additions ----------------------
   * Optional, seeded on 2 of the 5 rows in `Finance.tsx` only — the other 3
   * stay genuinely undefined rather than guessed. */
  /** Line-item breakdown; sums to the pre-VAT taxable amount. */
  lines?: Array<{ desc: string; amountPaisa: Paisa }>
  /** VAT actually charged on this invoice (13% of the taxable line total, Half Up). */
  vatPaisa?: Paisa
  /** Total received against this invoice to date. */
  paidPaisa?: Paisa
  /** Payment history; each entry sums into `paidPaisa`. */
  payments?: Array<{ ad: string; amountPaisa: Paisa; method: string }>
}

/** Recovers the invoice total as `Paisa` from the table's formatted display string. */
function amountPaisaOf(row: InvoiceRow): Paisa {
  return parseMoney(row.amount) ?? rupees(0)
}

export function invoiceGlance(row: InvoiceRow, gctx: GateContext): IntelGlance {
  const total = amountPaisaOf(row)
  const lines: string[] = []
  if (canViewMoneyField(gctx, 'booking')) {
    if (row.paidPaisa !== undefined) {
      const balance = (total - row.paidPaisa) as Paisa
      lines.push(`${formatMoney(total)} · paid ${formatMoney(row.paidPaisa)} · balance ${formatMoney(balance)}`)
    } else {
      lines.push(formatMoney(total))
    }
  }

  return {
    avatarLabel: row.client.slice(0, 2).toUpperCase(),
    avatarIcon: 'invoice',
    avatarTone: INVOICE_TOKEN[row.status],
    title: row.id,
    statusDot: INVOICE_TOKEN[row.status],
    subtitle: row.client,
    lines,
    primaryAction: { label: 'Open booking', to: `/rentals/${row.booking}` },
  }
}

export function invoiceDetailGroups(row: InvoiceRow, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []
  const total = amountPaisaOf(row)

  groups.push({
    title: 'Invoice',
    fields: [
      { label: 'Invoice no.', value: row.id },
      { label: 'Client', value: row.client },
      { label: 'Booking', value: row.booking, trigger: { label: 'Open', to: `/rentals/${row.booking}` } },
      { label: 'Status', value: row.status },
      { label: 'Due date', value: row.due === '—' ? 'No due date — settled or not yet issued' : row.due },
    ],
  })

  if (canViewMoneyField(gctx, 'booking')) {
    const moneyFields: IntelField[] = [
      { label: 'Invoice total', value: formatMoney(total) },
      { label: 'VAT rate', value: '13%' },
      {
        label: 'VAT amount',
        value: row.vatPaisa !== undefined ? formatMoney(row.vatPaisa) : 'Not itemised — no VAT breakdown on file for this invoice',
      },
      { label: 'Paid to date', value: row.paidPaisa !== undefined ? formatMoney(row.paidPaisa) : '—' },
      {
        label: 'Balance due',
        value:
          row.paidPaisa !== undefined
            ? formatMoney((total - row.paidPaisa) as Paisa)
            : 'Not available — no payments recorded against this invoice yet',
      },
    ]
    groups.push({ title: 'Amount', fields: moneyFields })

    if (row.lines?.length) {
      groups.push({
        title: 'Line items',
        fields: row.lines.map((l): IntelField => ({ label: l.desc, value: formatMoney(l.amountPaisa) })),
      })
    }

    if (row.payments?.length) {
      groups.push({
        title: 'Payments',
        fields: row.payments.map(
          (p): IntelField => ({
            label: `${p.ad} · ${p.method}`,
            value: formatMoney(p.amountPaisa),
            trigger: { label: 'Open booking', to: `/rentals/${row.booking}` },
          }),
        ),
      })
    }

    // Part-invoice history — HIS v2.1 Tier 2 asks for it, but none of the 5
    // seed rows in `Finance.tsx` shares a `booking` with another invoice, so
    // there is no real multi-invoice-per-booking relationship to seed
    // against yet (TODO(decision), PLAN.md §4). The group is omitted
    // entirely rather than rendered with a fabricated single-row "history".
  }

  groups.push({
    title: 'Documents',
    fields: [{ label: 'Export (PDF)', value: 'Not available — no per-invoice export pipeline is wired yet' }],
  })

  return groups
}
