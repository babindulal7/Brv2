import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { PageBody } from '../../components/ui/PageBody'
import { useAuth } from '../../lib/auth'
import { isStaff } from '../../lib/rbac'
import { BRAND_TEXT } from '../../lib/status'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { PERIOD_CHIPS } from '../../data/expenseReports'
import {
  KPIS,
  FILTERS,
  BY_CATEGORY,
  CATEGORY_TOTAL,
  TOP_REVENUE,
  PROFIT_TREND,
  TURNOVER,
  FAST_MOVING,
  SLOW_MOVING,
  DEAD_STOCK,
  RETURNS,
  PRODUCTS,
  SUMMARY,
  TOP_SELLING,
  LOW_STOCK,
  SUPPLIERS,
} from '../../data/productReports'

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }
const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const

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

function SalesTrendSummary() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>
        <span>Metric</span>
        <span>Month Total</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)', padding: '4px 0' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 'var(--r-badge)', background: catColor(2) }} />
          Revenue
        </span>
        <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>Rs 8,46,500</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)', padding: '4px 0' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 'var(--r-badge)', background: catColor(3) }} />
          Gross Profit
        </span>
        <span className="figure" style={{ fontWeight: 700, color: 'var(--success-text)' }}>Rs 3,12,800</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)', padding: '4px 0' }}>
        <span style={{ color: 'var(--text2)' }}>Avg Margin</span>
        <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>36.9%</span>
      </div>
    </div>
  )
}

function ProfitTrendTable() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 8, paddingBottom: 5, borderBottom: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>
        <span>Period</span>
        <span style={{ textAlign: 'right' }}>Revenue</span>
        <span style={{ textAlign: 'right' }}>Profit</span>
      </div>
      {PROFIT_TREND.groups.map((g) => (
        <div key={g.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 8, fontSize: 'var(--t-meta)', padding: '3px 0' }}>
          <span style={{ color: 'var(--text2)' }}>{g.label}</span>
          <span className="figure" style={{ textAlign: 'right', color: 'var(--text)' }}>{`Rs ${((g.values[0] ?? 0) * 10000).toLocaleString('en-IN')}`}</span>
          <span className="figure" style={{ textAlign: 'right', color: 'var(--success-text)', fontWeight: 600 }}>{`Rs ${((g.values[2] ?? 0) * 10000).toLocaleString('en-IN')}`}</span>
        </div>
      ))}
    </div>
  )
}

export interface ProductReportsProps {
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

/** Ranked list with an inline bar — single hue, rank is not a category. */
function MoverList({ rows, tone, unit }: { rows: Array<{ name: string; value: string; pct: number }>; tone: number; unit: string }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', paddingBottom: 5, borderBottom: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>
        <span style={{ flex: 1 }}>Product</span>
        <span>{unit}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 7 }}>
        {rows.map((r) => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)' }}>
            <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.name}
            </span>
            <span aria-hidden style={{ width: 44, height: 9, background: 'var(--card2)', borderRadius: 2, flexShrink: 0 }}>
              <span style={{ display: 'block', width: `${r.pct}%`, height: '100%', background: catColor(tone), borderRadius: 2 }} />
            </span>
            <span className="figure" style={{ fontWeight: 600, color: 'var(--text)', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Reports → **Product Reports**, built from render `34BC280B`.
 *
 * Stock counts carry a coloured dot *and* the number; the dot only reinforces
 * what the figure already says, so a red/amber distinction never has to be seen
 * to read the row.
 */
export default function ProductReports({
  loading: propLoading,
  error: propError,
  onRetry: propOnRetry,
}: ProductReportsProps = {}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const staff = isStaff(user?.role ?? 'Client')
  const [chip, setChip] = useState('This Month')
  const money = useCanViewMoney()
  const kpis = money ? KPIS : KPIS.filter((k) => k.label !== 'Total Product Revenue' && k.label !== 'Gross Profit')
  const summary = money ? SUMMARY : SUMMARY.filter((s) => s.label !== 'Product Revenue' && s.label !== 'Gross Profit' && s.label !== 'Average Margin')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Product Reports"
        description="Analyze product sales, inventory, profitability, supplier performance, and stock movement."
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

      <PageBody
        noun="product reports"
        loading={propLoading}
        error={propError}
        onRetry={propOnRetry}
        skeleton="table"
        restricted={!staff}
        restrictedRequiredRole="Staff"
        restrictedReason="Product reports are for Babin Rentals staff only. Clients may view their confirmed bookings in the client portal."
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PERIOD_CHIPS.map((p) => {
          const on = chip === p
          return (
            <button
              key={p}
              type="button"
              onClick={() => setChip(p)}
              aria-pressed={on}
              style={{
                height: 30,
                padding: '0 11px',
                borderRadius: 'var(--r-sm)',
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

      <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
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
            <Icon name="chevron_down" size={13} style={{ color: 'var(--muted)' }} />
          </button>
        ))}
        <Button icon="queues">Filters</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={kpis} columns={kpis.length} />

          <div style={{ display: 'grid', gridTemplateColumns: money ? 'repeat(4, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
            {money && (
              <Card title="Product Sales Trend (Rs)" action={<PeriodPill />}>
                <SalesTrendSummary />
              </Card>
            )}
            <Card title="Sales by Category" action={<PeriodPill />}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Donut slices={BY_CATEGORY} centreLabel="Total" centreValue={`${CATEGORY_TOTAL} Units`} size={104} />
                <Legend slices={BY_CATEGORY} />
              </div>
            </Card>
            {money && (
              <Card title="Product Revenue (Top 5)" action={<PeriodPill />}>
                <MoverList
                  rows={TOP_REVENUE.rows.map((r) => ({
                    name: r.label,
                    value: r.display,
                    pct: Math.round((r.value / (TOP_REVENUE.rows[0]?.value ?? 1)) * 100),
                  }))}
                  tone={2}
                  unit="Revenue"
                />
              </Card>
            )}
            {money && (
              <Card title="Gross Profit Trend (Rs)" action={<PeriodPill />}>
                <ProfitTrendTable />
              </Card>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
            <Card title="Inventory Turnover by Category" action={<PeriodPill />}>
              <MoverList
                rows={TURNOVER.rows.map((r) => ({
                  name: r.label,
                  value: r.display,
                  pct: Math.min(100, Math.round((r.value / 12) * 100)),
                }))}
                tone={2}
                unit="Turnover"
              />
            </Card>
            <Card title="Fast Moving Products" action={<PeriodPill />}>
              <MoverList rows={FAST_MOVING} tone={3} unit="Units Sold" />
            </Card>
            <Card title="Slow Moving Products" action={<PeriodPill />}>
              <MoverList rows={SLOW_MOVING} tone={1} unit="Units Sold" />
            </Card>
            <Card title="Dead Stock (No Sales)" action={<PeriodPill />}>
              <MoverList rows={DEAD_STOCK} tone={5} unit="Days in Stock" />
            </Card>
            <Card title="Product Return Analysis" action={<PeriodPill />}>
              <MoverList
                rows={RETURNS.map((r) => ({
                  name: r.label,
                  value: `${r.value} ${r.percent}`,
                  pct: Math.round((r.value / 38) * 100),
                }))}
                tone={5}
                unit="Units"
              />
            </Card>
          </div>

          <Card title="Product Performance Overview" action={<PeriodPill />} bodyStyle={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1020 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {(money
                      ? ['Product', 'SKU', 'Category', 'Brand', 'Units Sold', 'Revenue (Rs)', 'Cost (Rs)', 'Profit (Rs)', 'Margin %', 'Stock', 'Supplier', 'Return Rate', 'Actions']
                      : ['Product', 'SKU', 'Category', 'Brand', 'Units Sold', 'Stock', 'Supplier', 'Return Rate', 'Actions']
                    ).map(
                      (h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {PRODUCTS.map((p) => (
                    <tr key={p.sku} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
                      <td className="figure" style={{ ...td, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{p.sku}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{p.category}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{p.brand}</td>
                      <td className="figure" style={td}>{p.sold}</td>
                      {money && <td className="figure" style={{ ...td, fontWeight: 600 }}>{p.revenue}</td>}
                      {money && <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{p.cost}</td>}
                      {money && <td className="figure" style={{ ...td, fontWeight: 600 }}>{p.profit}</td>}
                      {money && <td className="figure" style={{ ...td, color: 'var(--success-text)', fontWeight: 600 }}>{p.margin}</td>}
                      <td style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Icon name="dot" size={9} style={{ color: BRAND_TEXT[p.stockTone] }} />
                          <span className="figure" style={{ fontWeight: 600, color: BRAND_TEXT[p.stockTone] }}>
                            {p.stock}
                          </span>
                        </span>
                      </td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{p.supplier}</td>
                      <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{p.returnRate}</td>
                      <td style={{ ...td, color: 'var(--muted)' }}>
                        <span style={{ display: 'flex', gap: 5 }}>
                          <Icon name="eye" size={14} />
                          <Icon name="more_vert" size={14} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '10px 14px', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <span>Showing 1 to 5 of 158 products</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                {['«', '‹', '1', '2', '3', '4', '5', '…', '16', '›', '»'].map((p, i) => {
                  const on = p === '1'
                  return (
                    <button
                      key={`${p}-${i}`}
                      type="button"
                      aria-current={on ? 'page' : undefined}
                      style={{
                        minWidth: 24,
                        height: 24,
                        borderRadius: 'var(--r-xs)',
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
                <span className="figure" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', height: 26, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)' }}>
                  10
                  <Icon name="chevron_down" size={11} style={{ color: 'var(--muted)' }} />
                </span>
              </span>
            </div>
          </Card>
        </div>

        <Rail>
          <Card title="Product Summary" action={<PeriodPill />}>
            <SummaryRows rows={summary} />
          </Card>

          <Card title="Top Selling Products" action={<PeriodPill />}>
            <div
              style={{ display: 'grid', gridTemplateColumns: money ? 'minmax(0,1fr) auto auto auto' : 'minmax(0,1fr) auto', gap: 7, paddingBottom: 5, borderBottom: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}
            >
              <span>Product</span>
              <span style={{ textAlign: 'right' }}>Units Sold</span>
              {money && <span style={{ textAlign: 'right' }}>Revenue (Rs)</span>}
              {money && <span style={{ textAlign: 'right' }}>Profit (Rs)</span>}
            </div>
            {TOP_SELLING.map((p) => (
              <div key={p.name} style={{ display: 'grid', gridTemplateColumns: money ? 'minmax(0,1fr) auto auto auto' : 'minmax(0,1fr) auto', gap: 7, padding: '6px 0', fontSize: 'var(--t-meta)', alignItems: 'center' }}>
                <span style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                  <span className="figure" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                    {p.rank}
                  </span>
                  <span style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                </span>
                <span className="figure" style={{ textAlign: 'right', color: 'var(--text)' }}>{p.sold}</span>
                {money && <span className="figure" style={{ textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>{p.revenue}</span>}
                {money && <span className="figure" style={{ textAlign: 'right', color: 'var(--muted)' }}>{p.profit}</span>}
              </div>
            ))}
            <span
              role="link"
              tabIndex={0}
              onClick={() => navigate('/inventory')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate('/inventory')
              }}
              style={{ ...link, display: 'inline-block', marginTop: 6, cursor: 'pointer' }}
            >
              View All Products →
            </span>
          </Card>

          <Card title="Low Stock Alert" action={<PeriodPill />}>
            <div
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 7, paddingBottom: 5, borderBottom: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}
            >
              <span>Product</span>
              <span style={{ textAlign: 'right' }}>Stock</span>
              <span style={{ textAlign: 'right' }}>Min. Stock</span>
              <span style={{ textAlign: 'right' }}>Reorder Qty</span>
            </div>
            {LOW_STOCK.map((p) => (
              <div key={p.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 7, padding: '6px 0', fontSize: 'var(--t-meta)', alignItems: 'center' }}>
                <span style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                <span className="figure" style={{ textAlign: 'right', color: 'var(--danger-text)', fontWeight: 700 }}>{p.stock}</span>
                <span className="figure" style={{ textAlign: 'right', color: 'var(--text2)' }}>{p.min}</span>
                <span className="figure" style={{ textAlign: 'right', color: 'var(--text2)' }}>{p.reorder}</span>
              </div>
            ))}
            <span
              role="link"
              tabIndex={0}
              onClick={() => navigate('/inventory/stock-check')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate('/inventory/stock-check')
              }}
              style={{ ...link, display: 'inline-block', marginTop: 6, cursor: 'pointer' }}
            >
              View All Low Stock →
            </span>
          </Card>

          {money && (
            <Card title="Supplier Ranking" action={<PeriodPill />}>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 7, paddingBottom: 5, borderBottom: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}
              >
                <span>Supplier</span>
                <span style={{ textAlign: 'right' }}>Revenue (Rs)</span>
                <span style={{ textAlign: 'right' }}>Margin %</span>
                <span style={{ textAlign: 'right' }}>Lead Time</span>
              </div>
              {SUPPLIERS.map((s) => (
                <div key={s.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 7, padding: '6px 0', fontSize: 'var(--t-meta)', alignItems: 'center' }}>
                  <span style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                    <span className="figure" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                      {s.rank}
                    </span>
                    <span style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                  </span>
                  <span className="figure" style={{ textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>{s.revenue}</span>
                  <span className="figure" style={{ textAlign: 'right', color: 'var(--text2)' }}>{s.margin}</span>
                  <span className="figure" style={{ textAlign: 'right', color: 'var(--muted)' }}>{s.lead}</span>
                </div>
              ))}
              <span style={{ ...link, display: 'inline-block', marginTop: 6 }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View All Suppliers →
              </span>
            </Card>
          )}

          <div style={{ ...cardStyle, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span>All amounts are in NPR</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Data last updated: Today, 10:30 AM
              <Icon name="refresh" size={12} />
            </span>
          </div>
        </Rail>
      </div>
      </PageBody>

      <FooterNote />
    </div>
  )
}
