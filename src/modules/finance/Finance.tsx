import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Donut, Legend } from '../../components/ui/Charts'
import type { Slice } from '../../components/ui/Charts'
import { STATUS } from '../../lib/status'
import { TODAY, toBs, formatBs, formatAd } from '../../lib/bs'

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
 *  · #5 **`Partial` is invoice-only** — payment and invoice statuses are
 *    different sets
 */

/** Lakh grouping — `Rs 2,80,000`, never `Rs 280,000`. */
const rs = (n: number) => `Rs ${n.toLocaleString('en-IN')}`

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

/** §3 — four KPIs; the second is a count, not the same money twice. */
const KPIS: Kpi[] = [
  { label: 'Total Revenue', value: rs(REVENUE), icon: 'dollar', accent: 'success', delta: { direction: 'up', text: '14.2% vs last month' } },
  { label: 'Outstanding Invoices', value: '23', icon: 'invoice', accent: 'progress', note: `${rs(RECEIVABLE)} receivable` },
  { label: 'Received (This Month)', value: rs(RECEIVED), icon: 'card', accent: 'primary', delta: { direction: 'up', text: '9.8% vs last month' } },
  { label: 'Net Profit', value: rs(NET_PROFIT), icon: 'chart', accent: 'primary', note: `Margin ${((NET_PROFIT / REVENUE) * 100).toFixed(1)}%` },
]

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
 * §5.2 — payment and invoice statuses are **different sets**. `Partial` is an
 * invoice status and never a payment status; the build the spec reviewed listed
 * it as both.
 */
const PAYMENT_STATUSES = ['Completed', 'Pending', 'Failed', 'Reversed'] as const
const INVOICE_STATUSES = ['Draft', 'Issued', 'Partial', 'Paid', 'Overdue', 'Void'] as const

const INVOICES = [
  { id: 'INV-2026-0492', client: 'ABC Films Pvt. Ltd.', booking: 'BK-2026-0715', amount: rs(486000), due: '2 Aug 2026', status: 'Overdue' as const },
  { id: 'INV-2026-0491', client: 'Vision Production', booking: 'BK-2026-0710', amount: rs(312000), due: '5 Aug 2026', status: 'Partial' as const },
  { id: 'INV-2026-0490', client: 'Creative Studio', booking: 'BK-2026-0716', amount: rs(198500), due: '9 Aug 2026', status: 'Issued' as const },
  { id: 'INV-2026-0489', client: 'Mountain Stories', booking: 'BK-2026-0709', amount: rs(164000), due: '—', status: 'Paid' as const },
  { id: 'INV-2026-0488', client: 'Mirage Weddings', booking: 'BK-2026-0713', amount: rs(88000), due: '—', status: 'Draft' as const },
]

const INVOICE_TOKEN: Record<(typeof INVOICE_STATUSES)[number], keyof typeof STATUS> = {
  Draft: 'neutral',
  Issued: 'primary',
  Partial: 'progress',
  Paid: 'in',
  Overdue: 'danger',
  Void: 'neutral',
}

const th = { textAlign: 'left' as const, padding: '9px 10px', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' }
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

export default function Finance() {
  const [tab, setTab] = useState<'Dashboard' | 'Invoices'>('Dashboard')

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
            <Button icon="dollar" variant="primary">
              Record Payment
            </Button>
            <Button icon="download">Export</Button>
          </>
        }
      />

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
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
              gap: 4,
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

      <KpiStrip items={KPIS} columns={4} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 288px', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {tab === 'Dashboard' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
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
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Donut slices={METHODS} centreLabel="Received" centreValue={rs(RECEIVED)} size={116} />
                  <Legend slices={METHODS} />
                </div>
                {/* §5.4 — reconciled, and the period is on the card title. */}
                <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  Reconciles to Received exactly.
                </p>
              </Card>
            </div>
          ) : (
            <Card title="Invoices" bodyStyle={{ padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Invoice', 'Client', 'Booking', 'Amount', 'Due', 'Status'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {INVOICES.map((i) => (
                      <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="identifier" style={{ ...td, color: 'var(--link)', fontWeight: 600 }}>{i.id}</td>
                        <td style={td}>{i.client}</td>
                        <td className="figure" style={{ ...td, color: 'var(--link)', fontSize: 'var(--t-meta)' }}>{i.booking}</td>
                        <td className="figure" style={{ ...td, fontWeight: 600 }}>{i.amount}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              These are different sets. <strong style={{ color: 'var(--text2)' }}>Partial</strong> is an invoice status
              and never a payment status.
            </p>
          </Card>
        </div>

        <Rail>
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

          <div style={{ ...cardStyle, padding: 12, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            Deposits are liabilities and never appear in revenue or receivables. Payments are immutable —
            corrections are reversal rows, never edits.
          </div>
        </Rail>
      </div>

      <FooterNote extra={['Finance consumes operational data and never creates it']} />
    </div>
  )
}
