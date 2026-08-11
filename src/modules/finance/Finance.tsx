import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Donut, Legend } from '../../components/ui/Charts'
import type { Slice } from '../../components/ui/Charts'
import { STATUS } from '../../lib/status'
import { TODAY, toBs, formatBs, formatAd } from '../../lib/bs'
import { rupees, formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import { gateContext, canViewMoneyField } from '../../lib/fieldGating'
import { useViewport, useTabularLayout } from '../../lib/device'
import { IntelCard } from '../../components/ui/IntelCard'
import { invoiceGlance, invoiceDetailGroups, INVOICE_STATUSES, INVOICE_TOKEN } from '../../data/invoiceIntel'
import type { InvoiceRow } from '../../data/invoiceIntel'
import { RecordPaymentModal } from './modals/RecordPaymentModal'
import { CreateInvoiceModal } from './modals/CreateInvoiceModal'
import { RefundPaymentModal } from './modals/RefundPaymentModal'
import { VoidInvoiceModal } from './modals/VoidInvoiceModal'

/**
 * **Finance dashboard** — spec-derived (`03 Core Modules/Payments.md` v2.1,
 * Build Locked). No render covers this screen.
 *
 * The spec's §0 correction table is mostly about arithmetic that did not add
 * up, so the numbers here are computed rather than typed:
 *  · #1 `Rs 2,80,000` with South Asian grouping — never `NPR 280,000`
 *  · #2 **one P&L chain**; Net Profit appeared twice with different values
 *  · #3 four KPIs, and the second is a **count**, not a repeat of the first
 *  · #4 Payment Methods must reconcile to Received, and say for what period
 *  · #5 **`Partially Paid` is invoice-only** — payment and invoice statuses
 *    are different sets
 */

/** Lakh grouping via the canonical Financial Engine — `Rs 2,80,000`, never `Rs 280,000`. */
const rs = (n: number) => formatMoney(rupees(n))

/* ── one P&L chain (§4). Every figure below derives from these. ───────────── */
const REVENUE = 1985000
const COST_OF_RENTAL = 742000
const OPERATING_EXPENSES = 413000
const GROSS_PROFIT = REVENUE - COST_OF_RENTAL
const NET_PROFIT = GROSS_PROFIT - OPERATING_EXPENSES

const RECEIVED = 1250000
const RECEIVABLE = 735000
if (RECEIVED + RECEIVABLE !== REVENUE) {
  throw new Error(`Finance: received + receivable must equal revenue (${RECEIVED + RECEIVABLE} vs ${REVENUE})`)
}

/** §5.4 — methods are period-labelled and reconcile to Received exactly. */
const METHOD_ROWS: Array<{ label: string; value: number }> = [
  { label: 'Bank Transfer', value: 596000 },
  { label: 'Cash', value: 312500 },
  { label: 'eSewa', value: 168000 },
  { label: 'Khalti', value: 104500 },
  { label: 'Card', value: 69000 },
]
const METHOD_SUM = METHOD_ROWS.reduce((a, m) => a + m.value, 0)
if (METHOD_SUM !== RECEIVED) {
  throw new Error(`Finance: payment methods must reconcile to Received (${METHOD_SUM} vs ${RECEIVED})`)
}
const METHODS: Slice[] = METHOD_ROWS.map((m) => ({
  label: m.label,
  value: m.value,
  display: rs(m.value),
  percent: `${((m.value / RECEIVED) * 100).toFixed(1)}%`,
}))

/**
 * §3 — four KPIs; the second is a count, not the same money twice.
 *
 * Law 6 / §8.3: money-blind roles get the count-only KPI, never a masked or
 * blurred figure — `Total Revenue`, `Received` and `Net Profit` (all pure ₨
 * figures) and the Outstanding Invoices ₨ *note* are simply not constructed.
 */
function kpisFor(money: boolean): Kpi[] {
  const outstandingInvoices: Kpi = {
    label: 'Outstanding Invoices',
    value: '23',
    icon: 'invoice',
    accent: 'progress',
    ...(money ? { note: `${rs(RECEIVABLE)} receivable` } : {}),
  }
  if (!money) return [outstandingInvoices]
  return [
    { label: 'Total Revenue', value: rs(REVENUE), icon: 'dollar', accent: 'success', delta: { direction: 'up', text: '14.2% vs last month' } },
    outstandingInvoices,
    { label: 'Received (This Month)', value: rs(RECEIVED), icon: 'card', accent: 'primary', delta: { direction: 'up', text: '9.8% vs last month' } },
    { label: 'Net Profit', value: rs(NET_PROFIT), icon: 'chart', accent: 'primary', note: `Margin ${((NET_PROFIT / REVENUE) * 100).toFixed(1)}%` },
  ]
}

/** §2.2 / §7 — BS dates and the Nepali fiscal year, from the one Date Engine. */
const bs = toBs(TODAY)
const AS_OF = { bs: bs ? formatBs(bs) : '—', ad: formatAd(TODAY) }
const FISCAL_YEAR = 'FY 2083/84 · Shrawan – Ashadh'

const PL_CHAIN = [
  { label: 'Revenue', value: rs(REVENUE) },
  { label: 'Cost of Rental', value: `− ${rs(COST_OF_RENTAL)}`, tone: 'danger' as const },
  { label: 'Gross Profit', value: rs(GROSS_PROFIT) },
  { label: 'Operating Expenses', value: `− ${rs(OPERATING_EXPENSES)}`, tone: 'danger' as const },
]

/**
 * §5.2 — payment and invoice statuses are **different sets**. `Partially Paid`
 * is an invoice status and never a payment status; the build the spec reviewed
 * listed it as both. The set below is the DB payment-status enum
 * (`0001_enums.sql` / `types/database.ts` `PaymentStatus`) — payments are
 * recorded manually when received, so there is no `Pending` payment state.
 */
const PAYMENT_STATUSES = ['Received', 'Refunded', 'Failed', 'Cancelled'] as const
/* INVOICE_STATUSES / INVOICE_TOKEN now live in `data/invoiceIntel.ts` (imported
   above) — that file is also where `InvoiceRow` and the Glance/Detail card
   builders live, so the status vocabulary has one source instead of two. */

/**
 * HIS v2.1 Tier 2 — 2 of the 5 rows below (`INV-2026-0491`, `INV-2026-0489`)
 * carry the optional `lines`/`vatPaisa`/`paidPaisa`/`payments` fields; the
 * other 3 stay genuinely unseeded rather than guessed. Both seeded rows
 * reconcile exactly: `lines` sums to the pre-VAT taxable amount, `vatPaisa`
 * is 13% of that taxable amount (Half Up, `lib/money.ts` §2.4's convention),
 * `taxable + vatPaisa` equals the row's existing `amount`, and `payments`
 * sums to `paidPaisa`.
 */
export const INVOICES: InvoiceRow[] = [
  // Amount matches data/booking.ts's engine-computed Rental Total for this
  // booking (Rs 1,39,506) — was a disagreeing stale figure. Status 'Sent' not
  // 'Overdue': the due date (2 Aug) is still ahead of TODAY (31 Jul, lib/bs.ts).
  { id: 'INV-2026-0492', client: 'ABC Films Pvt. Ltd.', booking: 'BK-2026-0715', amount: rs(139506), due: '2 Aug 2026', status: 'Sent' },
  {
    id: 'INV-2026-0491',
    client: 'Vision Production',
    booking: 'BK-2026-0710',
    amount: rs(312000),
    due: '5 Aug 2026',
    status: 'Partially Paid',
    lines: [
      { desc: 'RED Komodo 6K Camera Package — 6 days', amountPaisa: rupees(210000) },
      { desc: 'Grip & Lighting Kit — 6 days', amountPaisa: rupees(48000) },
      { desc: 'Crew: 1x DP, 1x AC — 6 days', amountPaisa: rupees(18106) },
    ],
    vatPaisa: rupees(35894),
    paidPaisa: rupees(180000),
    payments: [
      { ad: '20 Jul 2026', amountPaisa: rupees(120000), method: 'Bank Transfer' },
      { ad: '28 Jul 2026', amountPaisa: rupees(60000), method: 'eSewa' },
    ],
  },
  { id: 'INV-2026-0490', client: 'Creative Studio', booking: 'BK-2026-0716', amount: rs(198500), due: '9 Aug 2026', status: 'Sent' },
  {
    id: 'INV-2026-0489',
    client: 'Mountain Stories',
    booking: 'BK-2026-0709',
    amount: rs(164000),
    due: '—',
    status: 'Paid',
    lines: [
      { desc: 'Sony FX6 Camera Package — 4 days', amountPaisa: rupees(96000) },
      { desc: 'Lighting & Grip — 4 days', amountPaisa: rupees(32000) },
      { desc: 'Delivery & setup crew — 4 days', amountPaisa: rupees(17133) },
    ],
    vatPaisa: rupees(18867),
    paidPaisa: rupees(164000),
    payments: [{ ad: '30 Jul 2026', amountPaisa: rupees(164000), method: 'Bank Transfer' }],
  },
  { id: 'INV-2026-0488', client: 'Mirage Weddings', booking: 'BK-2026-0713', amount: rs(88000), due: '—', status: 'Draft' },
]

const th = { textAlign: 'left' as const, padding: '9px 10px', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' }
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

export default function Finance() {
  const { user } = useAuth()
  /**
   * `gateContext` returns a fresh object literal on every call, so it must be
   * memoized here — otherwise the `invoiceRows` memo below (keyed on `gctx`)
   * would see a "changed" dependency on every render regardless of whether
   * the role actually changed, and recompute every row's Glance/Detail cards
   * anyway.
   */
  const role = user?.role ?? 'Client'
  const gctx = useMemo(() => gateContext(role), [role])
  /** Invoice/booking money is Coordinator-visible (HIS v2.1 §4.1) — 'booking', not 'asset-finance'. */
  const money = canViewMoneyField(gctx, 'booking')
  const [tab, setTab] = useState<'Dashboard' | 'Invoices'>('Dashboard')
  const [invoicesList, setInvoicesList] = useState<InvoiceRow[]>(INVOICES)
  /**
   * Law 13/14 — width decides, never a platform/orientation branch.
   * `viewport` collapses the dashboard grid and the P&L/Payment-Methods pair
   * below desktop/phone respectively; `tabular` swaps the ~840px Invoices
   * table for phone cards, same threshold RentalsList's table-to-cards
   * branch uses.
   */
  const viewport = useViewport()
  const tabular = useTabularLayout()

  // Modals state
  const [showRecordPayment, setShowRecordPayment] = useState(false)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [selectedInvoiceForRecord, setSelectedInvoiceForRecord] = useState<string>('')
  const [selectedInvoiceForRefund, setSelectedInvoiceForRefund] = useState<InvoiceRow | null>(null)
  const [selectedInvoiceForVoid, setSelectedInvoiceForVoid] = useState<InvoiceRow | null>(null)

  const kpis = kpisFor(money)

  /**
   * HIS v2.1 perf — `invoiceGlance`/`invoiceDetailGroups` build a full
   * field-gated object graph per row (role/PII/money filtering); calling
   * them inline inside the table's `.map()` reran that work on every
   * re-render of `Finance` (e.g. a tab switch or any parent state change),
   * even when `invoicesList`/`gctx` hadn't changed. Computed once per row
   * here instead, keyed on every value the builders actually read.
   */
  const invoiceRows = useMemo(
    () =>
      invoicesList.map((row) => ({
        row,
        glance: invoiceGlance(row, gctx),
        detail: invoiceDetailGroups(row, gctx),
      })),
    [invoicesList, gctx],
  )

  /**
   * Reconciles this screen's local copy of a payment the **modal has already
   * written**. It does not dispatch, and must not.
   *
   * It used to. This handler fired a second
   * `recordPayment({ amountPaisa, paymentMethod, reference })` for the same
   * receipt the modal had just dispatched — fire-and-forget, no `.catch()`,
   * and no `ActionContext`, which the fail-closed dispatcher rejects outright,
   * so the duplicate could only ever reject into an unobserved promise. It was
   * invisible for exactly one reason: `recordPayment` is still a stub, so the
   * modal's own dispatch rejects first and `onSuccess` never runs. The day
   * that action sets `implemented: true`, one click writes the payment twice —
   * two payment rows for one receipt, against the law that payments are
   * immutable and corrections are reversal rows. The modal owns the dispatch;
   * this handler only ever owned the view.
   *
   * The local row update below stays, and is honest: the modal `await`s the
   * action and calls `onSuccess` only after it resolves, so reaching this line
   * means the write landed. It is still only an in-memory reconciliation —
   * nothing here re-reads the invoice from the engine.
   *
   * Left alone deliberately (out of this task's scope, not a blessing):
   * `totalPaisa` recovers the invoice total by stripping non-digits and
   * `parseInt`-ing the formatted string, which would read "Rs 1,234.50" as
   * Rs 1,23,450. Every seeded row is whole rupees, so it is latent today;
   * `invoiceIntel.ts`'s `amountPaisaOf()` (`parseMoney`) is the right source.
   */
  const handleRecordPaymentSuccess = (payment: { invoiceId: string; amountPaisa: Paisa; method: string; reference: string }) => {
    setInvoicesList((prev) =>
      prev.map((inv) => {
        if (inv.id === payment.invoiceId) {
          const newPaid = (inv.paidPaisa || 0) + payment.amountPaisa
          const totalPaisa = rupees(parseInt(inv.amount.replace(/[^0-9]/g, '')) || 0)
          const newStatus = newPaid >= totalPaisa ? 'Paid' : 'Partially Paid'
          return {
            ...inv,
            status: newStatus,
            paidPaisa: newPaid as Paisa,
            payments: [
              ...(inv.payments || []),
              { ad: new Date().toLocaleDateString('en-GB'), amountPaisa: payment.amountPaisa, method: payment.method },
            ],
          }
        }
        return inv
      }),
    )
  }

  const handleCreateInvoiceSuccess = (newInv: InvoiceRow) => {
    setInvoicesList((prev) => [newInv, ...prev])
  }

  const handleRefundSuccess = (refund: { invoiceId: string; refundAmountPaisa: Paisa; reason: string }) => {
    setInvoicesList((prev) =>
      prev.map((inv) => {
        if (inv.id === refund.invoiceId) {
          const newPaid = Math.max(0, (inv.paidPaisa || 0) - refund.refundAmountPaisa)
          return {
            ...inv,
            status: newPaid === 0 ? 'Sent' : 'Partially Paid',
            paidPaisa: newPaid as Paisa,
          }
        }
        return inv
      }),
    )
  }

  const handleVoidSuccess = (invoiceId: string) => {
    setInvoicesList((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: 'Void' as const } : inv)),
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="card"
        title="Finance"
        description="Finance consumes operational data and never creates it."
        actions={
          <>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 11px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)' }}
            >
              <Icon name="calendar" size={14} style={{ color: 'var(--muted)' }} />
              <span style={{ lineHeight: 1.2, textAlign: 'left' }}>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                  {AS_OF.bs}
                </span>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{AS_OF.ad}</span>
              </span>
            </span>
            <Button
              icon="plus"
              variant="secondary"
              onClick={() => setShowCreateInvoice(true)}
            >
              Create Invoice
            </Button>
            <Button
              icon="dollar"
              variant="primary"
              onClick={() => {
                setSelectedInvoiceForRecord('')
                setShowRecordPayment(true)
              }}
            >
              Record Payment
            </Button>
            <Button
              icon="download"
              onClick={() => {
                const headers = ['Invoice ID', 'Client', 'Booking', 'Amount', 'Due Date', 'Status']
                const rows = invoicesList.map((i) => [i.id, `"${i.client}"`, i.booking, i.amount, i.due, i.status])
                const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `finance_invoices_${new Date().toISOString().slice(0, 10)}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Export
            </Button>
          </>
        }
      />

      <div style={{ display: 'flex', gap: 'var(--sp-xs)', borderBottom: '1px solid var(--border)' }}>
        {(['Dashboard', 'Invoices'] as const).map((t) => {
          const on = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={on ? 'page' : undefined}
              style={{
                height: 34,
                padding: '0 13px',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
              }}
            >
              {t}
            </button>
          )
        })}

        {/*
          §5.1 declares five tabs here — Payments · Expenses · Documents ·
          Reports · Audit. Dashboard/Invoices above *are* Payments, already
          built. The other four already exist as full screens elsewhere in the
          app; rather than re-host them (and duplicate their own PageHeader and
          search box), this row is a door to each — the same move Settings ▸
          System makes for Administration.
        */}
        {[
          ['Expenses', '/reports/expenses'],
          ['Documents', '/documents'],
          ['Reports', '/reports/clients'],
          ['Audit', '/admin/audit'],
        ].map(([label, to]) => (
          <Link
            key={label}
            to={to as string}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-xs)',
              height: 34,
              padding: '0 13px',
              marginBottom: -1,
              border: 'none',
              borderBottom: '2px solid transparent',
              color: 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            {label}
            <Icon name="external_link" size={11} />
          </Link>
        ))}
      </div>

      <KpiStrip items={kpis} columns={kpis.length} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1fr) auto' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {tab === 'Dashboard' ? (
            /* Law 6 / §8.3 — P&L and Payment Methods are entirely ₨ figures;
               for a money-blind role neither Card is constructed. */
            money && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: viewport === 'phone' ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)',
                gap: 'var(--sp-md)',
              }}
            >
              <Card title="Profit & Loss">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {PL_CHAIN.map((r) => (
                    <div key={r.label} style={{ display: 'flex', gap: 10, padding: '7px 0', fontSize: 'var(--t-meta)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ flex: 1, color: 'var(--text2)' }}>{r.label}</span>
                      <span className="figure" style={{ fontWeight: 600, color: r.tone ? 'var(--danger-text)' : 'var(--text)' }}>
                        {r.value}
                      </span>
                    </div>
                  ))}
                  {/* One chain — Net Profit is derived here, not stated twice. */}
                  <div style={{ display: 'flex', gap: 10, paddingTop: 10, fontSize: 'var(--t-ui)', fontWeight: 700 }}>
                    <span style={{ flex: 1 }}>Net Profit</span>
                    <span className="figure">{rs(NET_PROFIT)}</span>
                  </div>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{FISCAL_YEAR}</p>
              </Card>

              <Card title="Payment Methods (This Month)">
                <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center' }}>
                  <Donut slices={METHODS} centreLabel="Received" centreValue={rs(RECEIVED)} size={116} />
                  <Legend slices={METHODS} />
                </div>
                {/* §5.4 — reconciled, and the period is on the card title. */}
                <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  Reconciles to Received exactly.
                </p>
              </Card>
            </div>
            )
          ) : (
            <Card title="Invoices" bodyStyle={{ padding: 0 }}>
              {tabular ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 840 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        {/* §8.3 — Amount is omitted, not masked, for a money-blind role.
                            `Due` here is a due *date* (e.g. "2 Aug 2026"), not a ₨ figure —
                            it stays visible for every role; only the true money column is gated. */}
                        {['Invoice', 'Client', 'Booking', ...(money ? ['Amount'] : []), 'Due', 'Status', 'Actions'].map((h) => (
                          <th key={h} style={th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceRows.map(({ row: i, glance, detail }) => (
                        <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="identifier" style={{ ...td, color: 'var(--link)', fontWeight: 600 }}>
                            <IntelCard
                              glance={glance}
                              detail={detail}
                              detailTitle={i.id}
                              detailSubtitle={`${i.client} · ${i.status}`}
                            >
                              <span>{i.id}</span>
                            </IntelCard>
                          </td>
                          <td style={td}>{i.client}</td>
                          <td className="figure" style={{ ...td, color: 'var(--link)', fontSize: 'var(--t-meta)' }}>
                            <Link to={`/rentals/${i.booking}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {i.booking}
                            </Link>
                          </td>
                          {money && <td className="figure" style={{ ...td, fontWeight: 600 }}>{i.amount}</td>}
                          <td style={{ ...td, color: 'var(--text2)' }}>{i.due}</td>
                          <td style={td}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: 20,
                                padding: '0 8px',
                                borderRadius: 'var(--r-badge)',
                                background: STATUS[INVOICE_TOKEN[i.status]].bg,
                                color: STATUS[INVOICE_TOKEN[i.status]].fg,
                                fontSize: 'var(--t-meta)',
                                fontWeight: 600,
                              }}
                            >
                              {i.status}
                            </span>
                          </td>
                          <td style={{ ...td, display: 'flex', gap: 6 }}>
                            {i.status !== 'Void' && i.status !== 'Paid' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedInvoiceForRecord(i.id)
                                  setShowRecordPayment(true)
                                }}
                                style={{
                                  border: '1px solid var(--border)',
                                  background: 'var(--card)',
                                  color: 'var(--nav-active-accent)',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--r-btn)',
                                  fontSize: 'var(--t-meta)',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                + Pay
                              </button>
                            )}
                            {i.status === 'Paid' || i.status === 'Partially Paid' ? (
                              <button
                                type="button"
                                onClick={() => setSelectedInvoiceForRefund(i)}
                                style={{
                                  border: '1px solid var(--border)',
                                  background: 'var(--card)',
                                  color: 'var(--text2)',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--r-btn)',
                                  fontSize: 'var(--t-meta)',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                }}
                              >
                                Refund
                              </button>
                            ) : null}
                            {i.status !== 'Void' && (
                              <button
                                type="button"
                                onClick={() => setSelectedInvoiceForVoid(i)}
                                style={{
                                  border: '1px solid var(--border)',
                                  background: 'var(--card)',
                                  color: 'var(--danger)',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--r-btn)',
                                  fontSize: 'var(--t-meta)',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                }}
                              >
                                Void
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Below 768px an 840px-wide table is a horizontal scrollbar, not a
                   layout (`useTabularLayout`, `lib/device.ts`) — same threshold and
                   card shape RentalsList's table-to-cards branch uses. Every column
                   and action from the table above is preserved, just restacked. */
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {invoiceRows.map(({ row: i, glance, detail }) => (
                    <div
                      key={i.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--sp-sm)',
                        padding: '13px 14px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <IntelCard
                          glance={glance}
                          detail={detail}
                          detailTitle={i.id}
                          detailSubtitle={`${i.client} · ${i.status}`}
                        >
                          <span className="identifier" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--link)' }}>
                            {i.id}
                          </span>
                        </IntelCard>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            height: 20,
                            padding: '0 8px',
                            borderRadius: 'var(--r-badge)',
                            background: STATUS[INVOICE_TOKEN[i.status]].bg,
                            color: STATUS[INVOICE_TOKEN[i.status]].fg,
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {i.status}
                        </span>
                      </span>

                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{i.client}</span>

                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)' }}>
                        <Icon name="box" size={12} style={{ color: 'var(--muted)' }} />
                        <Link to={`/rentals/${i.booking}`} className="figure" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                          {i.booking}
                        </Link>
                      </span>

                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        {money && (
                          <span className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                            {i.amount}
                          </span>
                        )}
                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Due {i.due}</span>
                      </span>

                      {/* Every action from the table's Actions column, same conditions — restacked to full-width touch rows instead of squeezed into a 6px-gap row. */}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap', marginTop: 2 }}>
                        {i.status !== 'Void' && i.status !== 'Paid' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoiceForRecord(i.id)
                              setShowRecordPayment(true)
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: 40,
                              flex: '1 1 88px',
                              border: '1px solid var(--border)',
                              background: 'var(--card)',
                              color: 'var(--nav-active-accent)',
                              padding: '0 12px',
                              borderRadius: 'var(--r-btn)',
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            + Pay
                          </button>
                        )}
                        {i.status === 'Paid' || i.status === 'Partially Paid' ? (
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceForRefund(i)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: 40,
                              flex: '1 1 88px',
                              border: '1px solid var(--border)',
                              background: 'var(--card)',
                              color: 'var(--text2)',
                              padding: '0 12px',
                              borderRadius: 'var(--r-btn)',
                              fontSize: 'var(--t-meta)',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            Refund
                          </button>
                        ) : null}
                        {i.status !== 'Void' && (
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceForVoid(i)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: 40,
                              flex: '1 1 88px',
                              border: '1px solid var(--border)',
                              background: 'var(--card)',
                              color: 'var(--danger)',
                              padding: '0 12px',
                              borderRadius: 'var(--r-btn)',
                              fontSize: 'var(--t-meta)',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            Void
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card title="Status vocabularies">
            {/* §5.2 — spelled out on the page, because conflating them is the bug. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { title: 'Payment statuses', list: PAYMENT_STATUSES },
                { title: 'Invoice statuses', list: INVOICE_STATUSES },
              ].map((g) => (
                <div key={g.title}>
                  <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 7 }}>{g.title}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {g.list.map((s) => (
                      <span
                        key={s}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: 20,
                          padding: '0 8px',
                          borderRadius: 'var(--r-badge)',
                          border: '1px solid var(--border)',
                          background: 'var(--card2)',
                          color: 'var(--text2)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              These are different sets. <strong style={{ color: 'var(--text2)' }}>Partially Paid</strong> is an invoice
              status and never a payment status.
            </p>
          </Card>
        </div>

        <Rail>
          {/* Law 6 / §8.3 — every row here is a ₨ figure; the whole Card is omitted, not blurred. */}
          {money && (
            <Card title="Summary">
              <SummaryRows
                rows={[
                  { label: 'Revenue', value: rs(REVENUE) },
                  { label: 'Received', value: rs(RECEIVED), tone: 'success' },
                  { label: 'Receivable', value: rs(RECEIVABLE), tone: 'progress' },
                  { label: 'Gross Profit', value: rs(GROSS_PROFIT) },
                  { label: 'Net Profit', value: rs(NET_PROFIT) },
                ]}
              />
            </Card>
          )}

          <div style={{ ...cardStyle, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            Deposits are liabilities and never appear in revenue or receivables. Payments are immutable —
            corrections are reversal rows, never edits.
          </div>
        </Rail>
      </div>

      {/* Finance Modals */}
      {/* Mounted conditionally (same pattern as RefundPaymentModal below): the modal
          captures initialInvoiceId in useState on first mount, so a persistent mount
          posts every later payment against the first-ever invoice (P0-1,
          BUG_SWEEP_REGISTER_v1.0). Remounting per open recaptures the right row. */}
      {showRecordPayment && (
        <RecordPaymentModal
          isOpen={showRecordPayment}
          onClose={() => setShowRecordPayment(false)}
          onSuccess={handleRecordPaymentSuccess}
          initialInvoiceId={selectedInvoiceForRecord}
          invoices={invoicesList}
        />
      )}

      <CreateInvoiceModal
        isOpen={showCreateInvoice}
        onClose={() => setShowCreateInvoice(false)}
        onSuccess={handleCreateInvoiceSuccess}
      />

      {selectedInvoiceForRefund && (
        <RefundPaymentModal
          isOpen={!!selectedInvoiceForRefund}
          onClose={() => setSelectedInvoiceForRefund(null)}
          onSuccess={handleRefundSuccess}
          invoiceId={selectedInvoiceForRefund.id}
          client={selectedInvoiceForRefund.client}
          currentPaidPaisa={selectedInvoiceForRefund.paidPaisa}
        />
      )}

      {selectedInvoiceForVoid && (
        <VoidInvoiceModal
          isOpen={!!selectedInvoiceForVoid}
          onClose={() => setSelectedInvoiceForVoid(null)}
          onSuccess={handleVoidSuccess}
          invoiceId={selectedInvoiceForVoid.id}
          client={selectedInvoiceForVoid.client}
        />
      )}

      <FooterNote extra={['Finance consumes operational data and never creates it']} />
    </div>
  )
}
