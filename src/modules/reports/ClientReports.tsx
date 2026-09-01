import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, KpiStrip, ReflowRail, SummaryRows, FooterNote, cardStyle, useRailGridColumns } from '../../components/ui/Page'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import { Donut, Legend, HBars, catColor } from '../../components/ui/Charts'
import { BRAND, BRAND_TEXT } from '../../lib/status'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import {
  KPIS,
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
 * arithmetic; the horizontal padding is left alone.
 *
 * This table is the case the rule exists for. Every client row ends in a
 * control cell — a `role="button"` view-client glyph and the overflow beside it
 * — and each of those owes a 44px hit area that cannot fit inside a 10+~18+10
 * row: it would overhang the rows above and below, and in the overlap band the
 * later row in the DOM wins the tap, so a thumb near a boundary opens the WRONG
 * client. 56px is what makes the row able to hold the target those glyphs still
 * need; they render at 14px today, and giving them a real `TouchTarget` is the
 * next fix, which needs this row height before it can be done safely.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }
const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const

/*
 * `PeriodPill` used to live here — a "This Month ▾" button on nine cards, with
 * no handler on any of them. It is gone rather than wired: nine independent
 * period pickers is not what this report wants, and one that claims a period
 * the figures do not obey is what the shared toolbar exists to stop.
 */

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
 * The export body.
 *
 * ⚠ Takes `money` and cuts the same three columns and the same three sections
 * the screen cuts — revenue, outstanding and lifetime value. This page does not
 * restrict as a whole (bookings, rental days, retention and case counts are
 * operational facts a money-blind role needs), so the export has to make the
 * same cut the render does, or the download becomes the way around the gate.
 */
function clientsCsv(money: boolean): ReportCsvRow[] {
  const rows: ReportCsvRow[] = [
    ['Figure', 'Value'],
    ...(money ? SUMMARY : SUMMARY.filter((s) => s.label !== 'Outstanding Receivables' && s.label !== 'Average Lifetime Value')).map(
      (s): ReportCsvRow => [s.label, s.value],
    ),
    [],
    ['Client performance overview'],
    money
      ? ['Client', 'Client ID', 'Membership', 'Bookings', 'Rental Days', 'Revenue (Rs)', 'Outstanding (Rs)', 'Lifetime Value (Rs)', 'Last Booking (AD)', 'Last Booking (BS)', 'Late Returns', 'Cases']
      : ['Client', 'Client ID', 'Membership', 'Bookings', 'Rental Days', 'Last Booking (AD)', 'Last Booking (BS)', 'Late Returns', 'Cases'],
    ...CLIENTS.map((c): ReportCsvRow =>
      money
        ? [c.name, c.id, c.membership, c.bookings, c.days, c.revenue, c.outstanding, c.lifetime, c.lastAd, c.lastBs, c.lateReturns, c.cases]
        : [c.name, c.id, c.membership, c.bookings, c.days, c.lastAd, c.lastBs, c.lateReturns, c.cases],
    ),
    [],
    ['Retention'],
    // `Slice.display` carries the share and `Slice.percent` the count on this
    // dataset — named for the donut, not for a column header. Read the values,
    // not the field names.
    ['Segment', 'Share', 'Clients'],
    ...RETENTION.map((s): ReportCsvRow => [s.label, s.display, (s.percent ?? '').replace(/[()]/g, '')]),
  ]

  if (!money) return rows

  return [
    ...rows,
    [],
    ['Outstanding ageing'],
    ['Bucket', 'Amount', 'Share'],
    ...AGEING.map((s): ReportCsvRow => [s.label, s.display, (s.percent ?? '').replace(/[()]/g, '')]),
    [],
    ['Top clients by lifetime value'],
    ['Rank', 'Client', 'Lifetime value'],
    ...TOP_CLIENTS.map((c): ReportCsvRow => [c.rank, c.name, c.amount]),
    [],
    ['High risk clients'],
    ['Client', 'Outstanding (Rs)', 'Ageing'],
    ...HIGH_RISK.map((r): ReportCsvRow => [r.name, r.outstanding, r.ageing]),
  ]
}

/**
 * Reports → **Client Reports**, built from render `D1353039`.
 *
 * The client table shows AD above BS and says so in a note beneath — the render
 * carries that note precisely because the order is the exception, not the rule.
 */
export default function ClientReports() {
  /* Rulings §7 — the rail track goes away below 1280 so `ReflowRail`'s
     inline column is not squeezed by a rail column that is still there. */
  const railGridColumns = useRailGridColumns()
  const navigate = useNavigate()
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
      />

      {/*
        This replaces three separate pieces of dead chrome: four header buttons
        (Compare · Export · Saved Views · Schedule Report) with no handler
        between them, a fourteen-chip period row that set state and filtered
        nothing, and eight dropdown-shaped buttons that opened nothing.

        What it does NOT gain is a date range, and that is deliberate rather
        than unfinished. Everything above the client table —  the four KPIs, the
        growth chart, the retention donut, the ageing donut, membership, cases,
        top clients, high risk and the insight list — is a separate
        pre-aggregated constant in `data/clientReports` with no date dimension
        at all. `CLIENTS[].lastAd` is the one dated field on the page, so a
        range control here would narrow six table rows while eleven cards sat
        frozen at figures for a period nobody chose. A filter that moves part of
        a report is a worse lie than no filter; this one arrives when the report
        reads Postgres.
      */}
      <ReportToolbar title="Client Reports" csv={{ filename: 'client-reports', build: () => clientsCsv(money) }} />

      <div style={{ display: 'grid', gridTemplateColumns: railGridColumns, gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={kpis} columns={kpis.length} />

          <div style={{ display: 'grid', gridTemplateColumns: money ? 'repeat(3, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
            <Card title="Client Growth Trend">
              <GrowthChart />
            </Card>

            {money && (
              <Card title="Revenue by Client (Top 10)">
                <HBars rows={REVENUE_BY_CLIENT} axisTicks={REVENUE_AXIS} colorIndex={2} />
              </Card>
            )}

            <Card title="Client Retention Analysis">
              <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center' }}>
                <Donut slices={RETENTION} centreLabel="Total" centreValue={RETENTION_TOTAL} size={116} />
                <Legend slices={RETENTION} />
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: money ? 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,0.75fr)' : 'minmax(0,1fr) minmax(0,1fr) minmax(0,0.75fr)', gap: 'var(--sp-md)' }}>
            <Card title="Booking Frequency">
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
              <Card title="Outstanding Ageing">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Donut slices={AGEING} centreLabel="Total" centreValue={AGEING_TOTAL} size={100} />
                  <Legend slices={AGEING} />
                </div>
              </Card>
            )}

            <Card title="Membership Analysis">
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

          <Card title="Client Performance Overview" bodyStyle={{ padding: 0 }}>
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
                              borderRadius: 'var(--r-chip)',
                              /*
                               * Membership TIER is an entity attribute, not a
                               * state — §2 reserves the hue vocabulary for
                               * state, so a Gold/Silver tier reading as a
                               * status is a category error. Worse here than
                               * most: a tier chip beside a real status chip in
                               * the same row invites reading them as the same
                               * kind of fact.
                               */
                              background: 'var(--surface-2)',
                              border: '1px solid var(--border)',
                              color: 'var(--text2)',
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
              {/*
                BUG-003 — a nine-control pager (`« ‹ 1 2 3 4 … 209 ›`) stood here
                with no handler on any of it, beneath "Showing 1 to 6 of 1,248
                clients".

                It is gone rather than wired, for the same reason the `PeriodPill`
                above it went: **there is no page 2 to reach.** `CLIENTS` holds
                six rows, `:340` maps all six unsliced, and both figures were
                literals — 1,248 is the seeded Total Clients KPI, and 209 is that
                number divided by six. So the pager was not a broken pager; it was
                decoration advertising 1,242 records this screen has never held.
                Wiring it would page through exactly one page.

                The `aria-current="page"` on the "1" button is the part that had to
                go regardless: it told assistive tech this was a working pager, so
                a screen-reader user was invited to look for pages that do not
                exist. The audit read the symptom as "records beyond page 1 are
                unreachable" — there are none; nothing is unreachable.

                The real, DB-backed, genuinely paginated client list is `/clients`,
                so the row now says where to go instead of faking it here. Making
                this report query the register is a separate job: every
                `/reports/*` screen is seed-only (LAYER-D-VERIFICATION).
              */}
              <span>
                Showing all {CLIENTS.length} rows
                <span style={{ display: 'block', color: 'var(--link)', fontSize: 'var(--t-meta)', marginTop: 2 }}>{BS_NOTE}</span>
              </span>
              <span style={{ marginLeft: 'auto' }}>
                A seeded sample, not a client-register query — the full directory is at{' '}
                <Link to="/clients" style={link}>
                  Clients
                </Link>
                .
              </span>
            </div>
          </Card>
        </div>

        <ReflowRail>
          <Card title="Client Summary">
            <SummaryRows rows={summary} />
          </Card>

          {money && (
            <Card title="Top Clients by Lifetime Value">
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
            <Card title="High Risk Clients">
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
        </ReflowRail>
      </div>

      <FooterNote />
    </div>
  )
}
