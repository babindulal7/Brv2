/*
 * Reports → **Product Reports** — routed at `/reports/products` by the
 * §4.41(a) ruling (2 Sep 2026): the content is wanted. Until `6fb1c62`
 * (12 Aug 2026) this screen WAS `/reports/inventory`, under the crumb "Asset
 * Utilization"; the 11-section restructure pointed that route at
 * `InventoryReports` — a different report (asset stock and health) — and
 * nothing live replaced the turnover, dead-stock, slow-mover and supplier
 * sections here. `/reports/inventory` now links across instead.
 *
 * Routing it would have revived ~15 controls that could never render, so the
 * ClientReports remediation came with it: the four dead header buttons, the
 * period-chip row and the eight dropdown-shaped filter buttons are replaced by
 * the one shared `ReportToolbar` (working CSV export); `PeriodPill` and the
 * presentational pager are gone rather than wired — BUG-003's reasoning: there
 * is no page 2 to reach. `PRODUCTS` holds five rows; "158 products" and the
 * 16-page pager were literals.
 *
 * NOT in the §9.6 register: the 43-count and the per-group counts are pinned
 * by rulings §11.3 and asserted in `catalog.test.ts` — adding a 44th row is a
 * register change only a ruling can make. See PLAN.md §4.41(a).
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, KpiStrip, ReflowRail, SummaryRows, FooterNote, cardStyle, useRailGridColumns } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { Donut, Legend, HBars, GroupedBars, catColor } from '../../components/ui/Charts'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import { BRAND_TEXT } from '../../lib/status'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatMoney, rupees } from '../../lib/money'
import { useViewport } from '../../lib/device'
import {
  KPIS,
  SALES_TREND,
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
  getProductReportsSummary,
  type ProductReportsSummary,
} from '../../lib/queries/productReports'

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic; the horizontal padding is unchanged.
 *
 * The last cell of every product row carries the same eye/overflow glyph pair
 * the client table uses. A 44px hit area cannot fit inside a 10+~18+10 row, so
 * it overhangs the neighbouring rows, and the later row in the DOM wins a tap
 * anywhere in that overlap — on a table where the glyph is meant to open one
 * product, that is a wrong-row action rather than a cosmetic annoyance. The row
 * floor is also the precondition for ever giving those 14px glyphs a real
 * target: there is nowhere to put one until the row can hold it.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }
const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const

/*
 * `PeriodPill` used to live here — a "This Month ▾" button on ten cards, with
 * no handler on any of them. Gone rather than wired, for ClientReports'
 * reason: ten independent period pickers is not what this report wants, and
 * one that claims a period the pre-aggregated fixtures do not obey is what the
 * shared toolbar exists to stop.
 */

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

/** Money-gated like the screen: no revenue/cost/profit/margin column reaches a CSV Law 6 would hide. */
function productsCsv(money: boolean): ReportCsvRow[] {
  return [
    ['Figure', 'Value'],
    ...(money ? SUMMARY : SUMMARY.filter((s) => s.label !== 'Product Revenue' && s.label !== 'Gross Profit' && s.label !== 'Average Margin')).map(
      (s): ReportCsvRow => [s.label, s.value],
    ),
    [],
    ['Product performance overview'],
    money
      ? ['Product', 'SKU', 'Category', 'Brand', 'Units Sold', 'Revenue (Rs)', 'Cost (Rs)', 'Profit (Rs)', 'Margin %', 'Stock', 'Supplier', 'Return Rate']
      : ['Product', 'SKU', 'Category', 'Brand', 'Units Sold', 'Stock', 'Supplier', 'Return Rate'],
    ...PRODUCTS.map((p): ReportCsvRow =>
      money
        ? [p.name, p.sku, p.category, p.brand, p.sold, p.revenue, p.cost, p.profit, p.margin, p.stock, p.supplier, p.returnRate]
        : [p.name, p.sku, p.category, p.brand, p.sold, p.stock, p.supplier, p.returnRate],
    ),
  ]
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
  const money = useCanViewMoney()
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const tablet = viewport === 'tablet'
  const railGridColumns = useRailGridColumns()
  const [, setSummary] = useState<ProductReportsSummary | null>(null)

  useEffect(() => {
    let active = true
    void getProductReportsSummary().then((res) => {
      if (active) setSummary(res)
    })
    return () => {
      active = false
    }
  }, [])
  const kpis = money ? KPIS : KPIS.filter((k) => k.label !== 'Total Product Revenue' && k.label !== 'Gross Profit')
  const summary = money ? SUMMARY : SUMMARY.filter((s) => s.label !== 'Product Revenue' && s.label !== 'Gross Profit' && s.label !== 'Average Margin')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Product Reports"
        description="Analyze product sales, inventory, profitability, supplier performance, and stock movement."
      />

      {/*
        This replaces the same three pieces of dead chrome ClientReports shed:
        four header buttons (Compare · Export · Saved Views · Schedule Report)
        with no handler between them, a period-chip row that set state and
        filtered nothing, and eight dropdown-shaped buttons that opened
        nothing.

        No date range, and deliberately: every figure on this page is a
        pre-aggregated constant in `data/productReports` with no date dimension
        at all. A range control here would claim to narrow figures it cannot
        touch; it arrives when the report reads Postgres.
      */}
      <ReportToolbar title="Product Reports" csv={{ filename: 'product-reports', build: () => productsCsv(money) }} />

      <div style={{ display: 'grid', gridTemplateColumns: railGridColumns, gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={kpis} columns={kpis.length} />

          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : tablet ? 'repeat(2, minmax(0,1fr))' : money ? 'repeat(4, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
            {money && (
              <Card title="Product Sales Trend (Rs)">
                <TrendChart />
              </Card>
            )}
            <Card title="Sales by Category">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Donut slices={BY_CATEGORY} centreLabel="Total" centreValue={`${CATEGORY_TOTAL} Units`} size={104} />
                <Legend slices={BY_CATEGORY} />
              </div>
            </Card>
            {money && (
              <Card title="Product Revenue (Top 5)">
                <HBars rows={TOP_REVENUE.rows} axisTicks={TOP_REVENUE.axisTicks} colorIndex={2} />
              </Card>
            )}
            {money && (
              <Card title="Gross Profit Trend (Rs)">
                <GroupedBars
                  groups={PROFIT_TREND.groups}
                  series={PROFIT_TREND.series}
                  yTicks={PROFIT_TREND.yTicks}
                  format={(v) => formatMoney(rupees(v * 10000))}
                  height={140}
                />
              </Card>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : tablet ? 'repeat(2, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
            <Card title="Inventory Turnover by Category">
              <HBars rows={TURNOVER.rows} axisTicks={TURNOVER.axisTicks} colorIndex={2} />
            </Card>
            <Card title="Fast Moving Products">
              <MoverList rows={FAST_MOVING} tone={3} unit="Units Sold" />
            </Card>
            <Card title="Slow Moving Products">
              <MoverList rows={SLOW_MOVING} tone={1} unit="Units Sold" />
            </Card>
            <Card title="Dead Stock (No Sales)">
              <MoverList rows={DEAD_STOCK} tone={5} unit="Days in Stock" />
            </Card>
            <Card title="Product Return Analysis">
              <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                <Donut slices={RETURNS} centreLabel="Total" centreValue={`${RETURNS_TOTAL} Units`} size={86} />
                <Legend slices={RETURNS} />
              </div>
            </Card>
          </div>

          <Card title="Product Performance Overview" bodyStyle={{ padding: 0 }}>
            <DataTableShell ariaLabel="Product performance overview">
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
            </DataTableShell>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '10px 14px', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {/*
                BUG-003's pager stood here too — eleven controls (`« ‹ 1 … 16 › »`)
                with no handler on any of them, beneath "Showing 1 to 5 of 158
                products". Gone rather than wired: `PRODUCTS` holds five rows,
                the table maps all five unsliced, and both figures were
                literals, so the pager advertised 153 records this screen has
                never held. The `aria-current="page"` on "1" had to go
                regardless — it told assistive tech this was a working pager.
              */}
              <span>Showing all {PRODUCTS.length} rows</span>
              <span style={{ marginLeft: 'auto' }}>
                A seeded sample, not a catalogue query — the full catalogue is at{' '}
                <Link to="/inventory" style={link}>
                  Inventory
                </Link>
              </span>
            </div>
          </Card>
        </div>

        <ReflowRail>
          <Card title="Product Summary">
            <SummaryRows rows={summary} />
          </Card>

          <Card title="Top Selling Products">
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

          <Card title="Low Stock Alert">
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
            <Card title="Supplier Ranking">
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
              <span style={{ ...link, display: 'inline-block', marginTop: 6 }} aria-disabled title="Not built yet">
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
        </ReflowRail>
      </div>
      </PageBody>

      <FooterNote />
    </div>
  )
}
