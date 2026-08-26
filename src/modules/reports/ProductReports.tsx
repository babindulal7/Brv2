import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { Donut, Legend, HBars, GroupedBars, catColor } from '../../components/ui/Charts'
import { BRAND_TEXT } from '../../lib/status'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { PERIOD_CHIPS } from '../../data/expenseReports'
import {
  KPIS,
  FILTERS,
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
  RETURNS_TOTAL,
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

function TrendChart() {
  const w = 100
  const h = 100
  const max = Math.max(...SALES_TREND.series.flatMap((s) => s.points))
  const n = SALES_TREND.series[0]?.points.length ?? 0
  return (
    <div>
      <div style={{ display: 'flex', gap: 7 }}>
        <div
          aria-hidden
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 150, fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}
        >
          {SALES_TREND.yTicks.map((t) => (
            <span key={t} className="figure">
              {t}
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Product sales trend" style={{ width: '100%', height: 150 }}>
          {SALES_TREND.yTicks.map((_, i) => (
            <line
              key={i}
              x1={0}
              x2={w}
              y1={(i / (SALES_TREND.yTicks.length - 1)) * h}
              y2={(i / (SALES_TREND.yTicks.length - 1)) * h}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {SALES_TREND.series.map((s, si) => (
            <g key={s.name}>
              <polyline
                points={s.points.map((p, i) => `${(i / (n - 1)) * w},${h - (p / max) * h}`).join(' ')}
                fill="none"
                stroke={catColor(si === 0 ? 2 : 3)}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
              {s.points.map((p, i) => (
                <circle key={i} cx={(i / (n - 1)) * w} cy={h - (p / max) * h} r={1.8} fill={catColor(si === 0 ? 2 : 3)} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 30, marginTop: 5, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {SALES_TREND.labels.map((l) => (
          <span key={l} className="figure">
            {l}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-md)', justifyContent: 'center', marginTop: 8 }}>
        {SALES_TREND.series.map((s, i) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 'var(--r-badge)', background: catColor(i === 0 ? 2 : 3) }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
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
export default function ProductReports() {
  const navigate = useNavigate()
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
                <TrendChart />
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
                <HBars rows={TOP_REVENUE.rows} axisTicks={TOP_REVENUE.axisTicks} colorIndex={2} />
              </Card>
            )}
            {money && (
              <Card title="Gross Profit Trend (Rs)" action={<PeriodPill />}>
                <GroupedBars
                  groups={PROFIT_TREND.groups}
                  series={PROFIT_TREND.series}
                  yTicks={PROFIT_TREND.yTicks}
                  format={(v) => `Rs ${(v * 10000).toLocaleString('en-IN')}`}
                  height={140}
                />
              </Card>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
            <Card title="Inventory Turnover by Category" action={<PeriodPill />}>
              <HBars rows={TURNOVER.rows} axisTicks={TURNOVER.axisTicks} colorIndex={2} />
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
              <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                <Donut slices={RETURNS} centreLabel="Total" centreValue={`${RETURNS_TOTAL} Units`} size={86} />
                <Legend slices={RETURNS} />
              </div>
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

      <FooterNote />
    </div>
  )
}
