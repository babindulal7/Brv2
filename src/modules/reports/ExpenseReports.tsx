import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { Donut, Legend, LineChart, GroupedBars, HBars } from '../../components/ui/Charts'
import { BRAND, BRAND_TEXT, STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import {
  PERIOD_CHIPS,
  FILTERS,
  KPIS,
  TREND,
  BY_CATEGORY,
  BY_METHOD,
  AGEING,
  APPROVAL,
  BUDGET_VS_ACTUAL,
  BY_BRANCH,
  TRANSACTIONS,
  SUMMARY,
  TOP_CATEGORIES,
  TOP_VENDORS,
  INSIGHTS,
  QUICK_ACTIONS,
} from '../../data/expenseReports'

const rs = (v: number) => `Rs ${v.toLocaleString('en-IN')}`

/** Approval states map onto the locked status tokens, not ad-hoc colours. */
const STATUS_OF: Record<string, StatusKey> = {
  Approved: 'in',
  Pending: 'progress',
  Rejected: 'danger',
}

function PeriodChips() {
  const [active, setActive] = useState('This Month')
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {PERIOD_CHIPS.map((p) => {
        const on = active === p
        return (
          <button
            key={p}
            type="button"
            onClick={() => setActive(p)}
            aria-pressed={on}
            style={{
              height: 30,
              padding: '0 11px',
              borderRadius: 8,
              border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
              background: on ? 'var(--nav-active-bg)' : 'var(--card)',
              color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: on ? 600 : 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}

function FilterBar() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            height: 34,
            padding: '0 11px',
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--input-border)',
            background: 'var(--input-bg)',
            color: 'var(--text2)',
            fontSize: 'var(--t-meta)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          {f}
          <Icon name="chevron_down" size={14} style={{ color: 'var(--muted)' }} />
        </button>
      ))}
      <Button icon="queues">Filters</Button>
    </div>
  )
}

/** Donut + legend side by side — the layout every distribution card uses. */
function DonutCard({
  title,
  slices,
  centreValue,
  showPercent = true,
}: {
  title: string
  slices: Parameters<typeof Legend>[0]['slices']
  centreValue: string
  showPercent?: boolean
}) {
  return (
    <Card title={title} action={<PeriodPill />}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Donut slices={slices} centreLabel="Total" centreValue={centreValue} size={132} />
        <Legend slices={slices} showPercent={showPercent} />
      </div>
    </Card>
  )
}

function PeriodPill() {
  return (
    <button
      type="button"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 26,
        padding: '0 8px',
        borderRadius: 7,
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text2)',
        fontSize: 'var(--t-meta)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      This Month
      <Icon name="chevron_down" size={12} style={{ color: 'var(--muted)' }} />
    </button>
  )
}

/**
 * Finance → Reports → **Expense Reports**, built from render `09168AC3`.
 *
 * Chart colour comes from the validated categorical ramp in `Charts.tsx`, in
 * fixed order. Every distribution carries a legend with the value and share
 * spelled out, so a series is never identified by colour alone.
 */
export default function ExpenseReports() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Expense Reports"
        description="Analyze expenses, categories, vendors, trends, and cost efficiency."
        actions={
          <>
            <Button icon="refresh">Compare</Button>
            <Button icon="download">Export</Button>
            <Button icon="eye">Saved Views</Button>
            <Button icon="calendar_stats" variant="primary">
              Schedule Report
            </Button>
          </>
        }
      />

      <PeriodChips />
      <FilterBar />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 288px', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={4} />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card title="Expense Trend" action={<PeriodPill />}>
              <LineChart
                points={TREND.points}
                labels={TREND.labels}
                yTicks={TREND.yTicks}
                seriesLabel="Expenses (Rs)"
                format={(v) => rs(v * 1000)}
              />
            </Card>
            <DonutCard title="Expenses by Category" slices={BY_CATEGORY} centreValue="Rs 18,72,500" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <DonutCard title="Expenses by Payment Method" slices={BY_METHOD} centreValue="Rs 18,72,500" />
            <Card title="Monthly Budget vs Actual" action={<PeriodPill />}>
              <GroupedBars
                groups={BUDGET_VS_ACTUAL.groups}
                series={BUDGET_VS_ACTUAL.series}
                yTicks={BUDGET_VS_ACTUAL.yTicks}
                format={(v) => rs(v * 100000)}
              />
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <DonutCard title="Expense Ageing (By Date)" slices={AGEING} centreValue="Rs 18,72,500" />
            <Card title="Expenses by Branch" action={<PeriodPill />}>
              <HBars rows={BY_BRANCH.rows} axisTicks={BY_BRANCH.axisTicks} />
            </Card>
            <DonutCard title="Approval Status" slices={APPROVAL} centreValue="Rs 18,72,500" />
          </div>

          <Card title="Expense Transactions" bodyStyle={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {['Date (BS)', 'Date (AD)', 'Reference', 'Category', 'Vendor / Payee', 'Branch', 'Payment Method', 'Amount (Rs)', 'Status', 'Approved By', 'Actions'].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: h === 'Amount (Rs)' ? 'right' : 'left',
                            padding: '10px 12px',
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                            color: 'var(--text2)',
                            whiteSpace: 'nowrap',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {TRANSACTIONS.map((t) => {
                    const st = STATUS[STATUS_OF[t.status] ?? 'neutral']
                    return (
                      <tr key={t.ref} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="figure" style={td}>{t.bs}</td>
                        <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{t.ad}</td>
                        <td className="figure" style={{ ...td, color: 'var(--link)', fontWeight: 600 }}>{t.ref}</td>
                        <td style={td}>{t.category}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{t.vendor}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{t.branch}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{t.method}</td>
                        <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{t.amount}</td>
                        <td style={td}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 21,
                              padding: '0 8px',
                              borderRadius: 'var(--r-badge)',
                              background: st.bg,
                              color: st.fg,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                            }}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{t.approvedBy}</td>
                        <td style={td}>
                          <span style={{ display: 'flex', gap: 4, color: 'var(--muted)' }}>
                            <Icon name="eye" size={15} />
                            <Icon name="more_vert" size={15} />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 14px',
                flexWrap: 'wrap',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
              }}
            >
              <span>Showing 1 to 6 of 246 expenses</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                {['«', '‹', '1', '2', '3', '4', '5', '…', '41', '›', '»'].map((p, i) => {
                  const on = p === '1'
                  return (
                    <button
                      key={`${p}-${i}`}
                      type="button"
                      aria-current={on ? 'page' : undefined}
                      style={{
                        minWidth: 26,
                        height: 26,
                        borderRadius: 7,
                        border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                        background: on ? 'var(--btn-primary-bg)' : 'transparent',
                        color: on ? 'var(--btn-primary-fg)' : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: on ? 700 : 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {p}
                    </button>
                  )
                })}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                Rows per page
                <span
                  className="figure"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 28,
                    padding: '0 8px',
                    borderRadius: 7,
                    border: '1px solid var(--border)',
                  }}
                >
                  10
                  <Icon name="chevron_down" size={12} style={{ color: 'var(--muted)' }} />
                </span>
              </span>
            </div>
          </Card>
        </div>

        <Rail>
          <Card title="Expense Summary" action={<PeriodPill />}>
            <SummaryRows rows={SUMMARY} />
          </Card>

          <Card title="Top Expense Categories" action={<PeriodPill />}>
            <RankTable head="Category" rows={TOP_CATEGORIES} link="View All Categories" />
          </Card>

          <Card title="Top Vendors" action={<PeriodPill />}>
            <RankTable head="Vendor" rows={TOP_VENDORS} link="View All Vendors" />
          </Card>

          <Card title="Expense Insights">
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {INSIGHTS.map((n) => (
                <li key={n.text} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-meta)' }}>
                  <Icon name={n.icon} size={14} style={{ color: BRAND_TEXT[n.tone], flexShrink: 0, marginTop: 1 }} />
                  <span style={{ color: 'var(--text2)' }}>{n.text}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 6px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'center',
                    lineHeight: 1.25,
                  }}
                >
                  <Icon name={a.icon} size={18} style={{ color: BRAND[a.tone] }} />
                  {a.label}
                </button>
              ))}
            </div>
          </Card>

          <div style={{ ...cardStyle, padding: 12, fontSize: 'var(--t-meta)', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span>All amounts are in NPR</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Data last updated: Today, 10:30 AM
              <Icon name="refresh" size={12} />
            </span>
          </div>
        </Rail>
      </div>

      <FooterNote extra={['Expense records are immutable once approved']} />
    </div>
  )
}

const td = {
  padding: '10px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap',
} as const

function RankTable({
  head,
  rows,
  link,
}: {
  head: string
  rows: Array<{ rank: number; name: string; amount: string; share: string }>
  link: string
}) {
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) auto auto',
          gap: 8,
          paddingBottom: 6,
          borderBottom: '1px solid var(--border)',
          fontSize: 'var(--t-meta)',
          color: 'var(--muted)',
          fontWeight: 600,
        }}
      >
        <span>{head}</span>
        <span style={{ textAlign: 'right' }}>Amount (Rs)</span>
        <span style={{ textAlign: 'right', minWidth: 46 }}>% of Total</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.name}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) auto auto',
            gap: 8,
            padding: '7px 0',
            fontSize: 'var(--t-meta)',
            alignItems: 'center',
          }}
        >
          <span style={{ display: 'flex', gap: 7, minWidth: 0 }}>
            <span className="figure" style={{ color: 'var(--muted)', flexShrink: 0 }}>
              {r.rank}
            </span>
            <span style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.name}
            </span>
          </span>
          <span className="figure" style={{ textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>
            {r.amount}
          </span>
          <span className="figure" style={{ textAlign: 'right', color: 'var(--muted)', minWidth: 46 }}>
            {r.share}
          </span>
        </div>
      ))}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 6,
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          color: 'var(--link)',
          textDecoration: 'none',
        }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
        {link}
        <Icon name="arrow_right" size={12} />
      </span>
    </div>
  )
}
