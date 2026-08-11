import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { Donut, Legend, HBars, catColor } from '../../components/ui/Charts'
import { STATUS, BRAND, BRAND_TEXT } from '../../lib/status'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { PERIOD_CHIPS } from '../../data/expenseReports'
import {
  KPIS,
  FILTERS,
  GROWTH,
  REVENUE_BY_CLIENT,
  REVENUE_AXIS,
  RETENTION,
  RETENTION_TOTAL,
  FREQUENCY,
  AGEING,
  AGEING_TOTAL,
  MEMBERSHIP,
  CASES,
  CLIENTS,
  SUMMARY,
  TOP_CLIENTS,
  HIGH_RISK,
  INSIGHTS,
  BS_NOTE,
} from '../../data/clientReports'
import { useState } from 'react'

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

function GrowthChart() {
  const w = 100
  const h = 100
  const max = Math.max(...GROWTH.series.flatMap((s) => s.points))
  const n = GROWTH.series[0]?.points.length ?? 0
  return (
    <div>
      <div style={{ display: 'flex', gap: 7 }}>
        <div
          aria-hidden
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 150, fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}
        >
          {GROWTH.yTicks.map((t) => (
            <span key={t} className="figure">
              {t}
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Client growth trend" style={{ width: '100%', height: 150 }}>
          {GROWTH.yTicks.map((_, i) => (
            <line
              key={i}
              x1={0}
              x2={w}
              y1={(i / (GROWTH.yTicks.length - 1)) * h}
              y2={(i / (GROWTH.yTicks.length - 1)) * h}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {GROWTH.series.map((s, si) => (
            <g key={s.name}>
              <polyline
                points={s.points.map((p, i) => `${(i / (n - 1)) * w},${h - (p / max) * h}`).join(' ')}
                fill="none"
                stroke={catColor(si)}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
              {s.points.map((p, i) => (
                <circle key={i} cx={(i / (n - 1)) * w} cy={h - (p / max) * h} r={1.8} fill={catColor(si)} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 26, marginTop: 5, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {GROWTH.labels.map((l) => (
          <span key={l} className="figure">
            {l}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-md)', justifyContent: 'center', marginTop: 8 }}>
        {GROWTH.series.map((s, i) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 'var(--r-badge)', background: catColor(i) }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Reports → **Client Reports**, built from render `D1353039`.
 *
 * The client table shows AD above BS and says so in a note beneath — the render
 * carries that note precisely because the order is the exception, not the rule.
 */
export default function ClientReports() {
  const navigate = useNavigate()
  const [chip, setChip] = useState('This Month')
  const money = useCanViewMoney()
  const kpis = money ? KPIS : KPIS.filter((k) => k.label !== 'Outstanding Receivables')
  const summary = money ? SUMMARY : SUMMARY.filter((s) => s.label !== 'Outstanding Receivables' && s.label !== 'Average Lifetime Value')
  const membershipStats = money ? MEMBERSHIP.stats : MEMBERSHIP.stats.filter((s) => s.label === 'Renewal Rate')
  // Law 6 / P0-5 (BUG_SWEEP_REGISTER_v1.0): the one ungated money tile on this
  // screen — same filter shape as KPIS/SUMMARY above.
  const frequency = money ? FREQUENCY : FREQUENCY.filter((f) => f.label !== 'Avg. Booking Value')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Client Reports"
        description="Analyze client value, revenue, retention, payment behavior, and rental performance."
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

          <div style={{ display: 'grid', gridTemplateColumns: money ? 'repeat(3, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
            <Card title="Client Growth Trend" action={<PeriodPill />}>
              <GrowthChart />
            </Card>

            {money && (
              <Card title="Revenue by Client (Top 10)" action={<PeriodPill />}>
                <HBars rows={REVENUE_BY_CLIENT} axisTicks={REVENUE_AXIS} colorIndex={2} />
              </Card>
            )}

            <Card title="Client Retention Analysis" action={<PeriodPill />}>
              <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center' }}>
                <Donut slices={RETENTION} centreLabel="Total" centreValue={RETENTION_TOTAL} size={116} />
                <Legend slices={RETENTION} />
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: money ? 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,0.75fr)' : 'minmax(0,1fr) minmax(0,1fr) minmax(0,0.75fr)', gap: 'var(--sp-md)' }}>
            <Card title="Booking Frequency" action={<PeriodPill />}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${frequency.length},1fr)`, gap: 'var(--sp-sm)' }}>
                {frequency.map((f, i) => (
                  <div key={f.label} style={{ textAlign: 'center', minWidth: 0 }}>
                    <span
                      style={{ width: 34, height: 34, borderRadius: 9, display: 'inline-grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--border)', color: catColor(i) }}
                    >
                      <Icon name={f.icon} size={17} />
                    </span>
                    <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.value}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2, lineHeight: 1.3 }}>{f.label}</div>
                  </div>
                ))}
              </div>
            </Card>

            {money && (
              <Card title="Outstanding Ageing" action={<PeriodPill />}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Donut slices={AGEING} centreLabel="Total" centreValue={AGEING_TOTAL} size={100} />
                  <Legend slices={AGEING} />
                </div>
              </Card>
            )}

            <Card title="Membership Analysis" action={<PeriodPill />}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                {[
                  { l: 'Members', d: MEMBERSHIP.members, tone: 'success' as const },
                  { l: 'Non-Members', d: MEMBERSHIP.nonMembers, tone: 'primary' as const },
                ].map((x) => (
                  <div key={x.l} style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="users" size={15} style={{ color: BRAND[x.tone] }} />
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{x.l}</span>
                    </div>
                    <div className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>
                      {x.d.value}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: BRAND_TEXT[x.tone], fontWeight: 600 }}>{x.d.pct}</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{x.d.note}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${membershipStats.length},1fr)`, gap: 7, marginTop: 11, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                {membershipStats.map((s) => (
                  <span key={s.label} style={{ minWidth: 0, textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.3 }}>{s.label}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                      {s.value}
                    </span>
                  </span>
                ))}
              </div>
            </Card>

            <Card title="Damage & Case Analysis">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {CASES.map((c) => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{c.label}</span>
                    <span className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: BRAND_TEXT[c.tone] }}>
                      {c.value}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Client Performance Overview" action={<PeriodPill />} bodyStyle={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {(money
                      ? ['Client', 'Client ID', 'Membership', 'Bookings', 'Rental Days', 'Revenue (Rs)', 'Outstanding (Rs)', 'Lifetime Value (Rs)', 'Last Booking', 'Late Returns', 'Cases', 'Status', 'Actions']
                      : ['Client', 'Client ID', 'Membership', 'Bookings', 'Rental Days', 'Last Booking', 'Late Returns', 'Cases', 'Status', 'Actions']
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
                  {CLIENTS.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        <Link to={`/clients/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {c.name}
                        </Link>
                      </td>
                      <td className="identifier" style={{ ...td, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                        <Link to={`/clients/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {c.id}
                        </Link>
                      </td>
                      <td style={td}>
                        {c.membership === '—' ? (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 19,
                              padding: '0 7px',
                              borderRadius: 5,
                              background: STATUS[c.membershipKey].bg,
                              color: STATUS[c.membershipKey].fg,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 700,
                            }}
                          >
                            {c.membership}
                          </span>
                        )}
                      </td>
                      <td className="figure" style={td}>{c.bookings}</td>
                      <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{c.days}</td>
                      {money && <td className="figure" style={{ ...td, fontWeight: 600 }}>{c.revenue}</td>}
                      {money && (
                        <td
                          className="figure"
                          style={{ ...td, fontWeight: 600, color: c.hasOutstanding ? 'var(--danger-text)' : 'var(--success-text)' }}
                        >
                          {c.outstanding}
                        </td>
                      )}
                      {money && <td className="figure" style={{ ...td, fontWeight: 600 }}>{c.lifetime}</td>}
                      <td style={td}>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)' }}>{c.lastAd}</span>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--link)' }}>{c.lastBs}</span>
                      </td>
                      <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{c.lateReturns}</td>
                      <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{c.cases}</td>
                      <td style={{ ...td, color: 'var(--success-text)', fontWeight: 600 }}>Active</td>
                      <td style={{ ...td, color: 'var(--muted)' }}>
                        <span style={{ display: 'flex', gap: 5 }}>
                          <span
                            onClick={() => navigate(`/clients/${c.id}`)}
                            role="button"
                            aria-label="View client"
                            style={{ display: 'inline-flex', cursor: 'pointer' }}
                          >
                            <Icon name="eye" size={14} />
                          </span>
                          <Icon name="more_vert" size={14} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '10px 14px', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <span>
                Showing 1 to 6 of 1,248 clients
                <span style={{ display: 'block', color: 'var(--link)', fontSize: 'var(--t-meta)', marginTop: 2 }}>{BS_NOTE}</span>
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                {['«', '‹', '1', '2', '3', '4', '…', '209', '›'].map((p, i) => {
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
            </div>
          </Card>
        </div>

        <Rail>
          <Card title="Client Summary" action={<PeriodPill />}>
            <SummaryRows rows={summary} />
          </Card>

          {money && (
            <Card title="Top Clients by Lifetime Value" action={<PeriodPill />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {TOP_CLIENTS.map((c) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
                    <span className="figure" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                      {c.rank}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </span>
                    <span className="figure" style={{ fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                      {c.amount}
                    </span>
                  </div>
                ))}
              </div>
              <Link to="/clients" style={{ ...link, display: 'inline-block', marginTop: 8 }}>
                View All Clients →
              </Link>
            </Card>
          )}

          {money && (
            <Card title="High Risk Clients" action={<PeriodPill />}>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 'var(--sp-sm)', paddingBottom: 6, borderBottom: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}
              >
                <span>Client</span>
                <span style={{ textAlign: 'right' }}>Outstanding (Rs)</span>
                <span style={{ textAlign: 'right' }}>Ageing</span>
              </div>
              {HIGH_RISK.map((r) => (
                <div key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 'var(--sp-sm)', padding: '6px 0', fontSize: 'var(--t-meta)', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                  <span className="figure" style={{ textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>
                    {r.outstanding}
                  </span>
                  <span
                    className="figure"
                    style={{ textAlign: 'right', color: r.severe ? 'var(--danger-text)' : 'var(--progress-text)', fontWeight: 600, minWidth: 56 }}
                  >
                    {r.ageing}
                  </span>
                </div>
              ))}
              <span style={{ ...link, display: 'inline-block', marginTop: 6 }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View All High Risk →
              </span>
            </Card>
          )}

          <Card title="Client Insights">
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {INSIGHTS.map((n) => (
                <li key={n.text} style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start', fontSize: 'var(--t-meta)' }}>
                  <Icon name="info" size={13} style={{ color: BRAND_TEXT[n.tone], flexShrink: 0, marginTop: 1 }} />
                  <span style={{ color: 'var(--text2)' }}>{n.text}</span>
                </li>
              ))}
            </ul>
          </Card>

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
