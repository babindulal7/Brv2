import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote } from '../../components/ui/Page'
import { catColor } from '../../components/ui/Charts'
import { STATUS, BRAND, BRAND_TEXT } from '../../lib/status'
import {
  KPIS,
  CATEGORIES,
  TIMELINE_RANGES,
  TIMELINE_DATE,
  ACTIVITY_CHART,
  TOTALS,
  DETAIL,
  TRIGGERS,
  QUEUE,
  SUMMARY,
  ALERTS,
  QUICK_ACTIONS,
  ACTIVITY,
  ADVISOR,
  FILTERS,
} from '../../data/triggers'

const th = {
  textAlign: 'left' as const,
  padding: '8px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '9px 10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }
const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const

/** Four series, one y-axis. Legend always present; hover isolates a series. */
function ActivityChart() {
  const [hover, setHover] = useState<number | null>(null)
  const w = 100
  const h = 100
  const max = Math.max(...ACTIVITY_CHART.series.flatMap((s) => s.points))
  const n = ACTIVITY_CHART.series[0]?.points.length ?? 0
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          aria-hidden
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 168, fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}
        >
          {ACTIVITY_CHART.yTicks.map((t) => (
            <span key={t} className="figure">
              {t}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Trigger activity over the day"
          style={{ width: '100%', height: 168, overflow: 'visible' }}
        >
          {ACTIVITY_CHART.yTicks.map((_, i) => (
            <line
              key={i}
              x1={0}
              x2={w}
              y1={(i / (ACTIVITY_CHART.yTicks.length - 1)) * h}
              y2={(i / (ACTIVITY_CHART.yTicks.length - 1)) * h}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {ACTIVITY_CHART.series.map((s, si) => (
            <g key={s.name} opacity={hover === null || hover === si ? 1 : 0.25}>
              <polyline
                points={s.points.map((p, i) => `${(i / (n - 1)) * w},${h - (p / max) * h}`).join(' ')}
                fill="none"
                stroke={catColor(si)}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={(i / (n - 1)) * w}
                  cy={h - (p / max) * h}
                  r={1.9}
                  fill={catColor(si)}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 28, marginTop: 5, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {ACTIVITY_CHART.labels.map((l) => (
          <span key={l} className="figure">
            {l}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 9, flexWrap: 'wrap' }}>
        {ACTIVITY_CHART.series.map((s, i) => (
          <button
            key={s.name}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', fontSize: 'var(--t-meta)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: catColor(i) }} />
            {s.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Automation Center → **Event Triggers**, built from render `1542A77D`.
 *
 * The render puts Automation Center behind its own sidebar rail (Dashboard,
 * Workflow Builder, Automation Library, …). That sub-shell is not built — this
 * page lives in the main shell — so the section's other pages are still
 * placeholders rather than being reachable from a rail that doesn't exist.
 */
export default function EventTriggers() {
  const [range, setRange] = useState<(typeof TIMELINE_RANGES)[number]>('Day')
  const [tab, setTab] = useState(DETAIL.tabs[0] as string)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="automation"
        title="Event Triggers"
        description="Monitor, manage and optimize all automation triggers in real-time."
        actions={
          <>
            <Button icon="plus" variant="primary">
              Create Trigger
            </Button>
            <Button icon="tool">Test Trigger</Button>
            <Button icon="download">Import</Button>
            <Button icon="download">Export</Button>
            <Button icon="refresh">Refresh</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 288px', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={6} />

          <Card
            title="Trigger Categories"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View all →
              </span>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 8 }}>
              {CATEGORIES.map((c, i) => (
                <div
                  key={c.name}
                  style={{ padding: '10px 9px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', minWidth: 0 }}
                >
                  <Icon name={c.icon} size={16} style={{ color: catColor(i) }} />
                  <div
                    style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {c.name}
                  </div>
                  <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 1 }}>
                    {c.count}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Trigger Activity Timeline"
              action={
                <>
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-meta)', color: 'var(--success-text)', fontWeight: 600 }}
                  >
                    <Icon name="dot" size={9} />
                    Live
                  </span>
                  <span style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)' }}>
                    {TIMELINE_RANGES.map((r) => {
                      const on = range === r
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRange(r)}
                          aria-pressed={on}
                          style={{
                            height: 22,
                            padding: '0 8px',
                            borderRadius: 6,
                            border: 'none',
                            background: on ? 'var(--card)' : 'transparent',
                            color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                            fontSize: 'var(--t-meta)',
                            fontWeight: on ? 700 : 500,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {r}
                        </button>
                      )
                    })}
                  </span>
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}
                  >
                    <Icon name="calendar" size={12} style={{ color: 'var(--muted)' }} />
                    <span className="figure">
                      {TIMELINE_DATE.ad} ({TIMELINE_DATE.bs})
                    </span>
                  </span>
                </>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 160px', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 4 }}>Events</div>
                  <ActivityChart />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {TOTALS.map((t) => (
                    <div
                      key={t.label}
                      style={{ padding: '8px 9px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="dot" size={9} style={{ color: BRAND[t.tone] }} />
                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{t.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
                        <span className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: BRAND_TEXT[t.tone] }}>
                          {t.value}
                        </span>
                        {t.note && <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{t.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card
              title="Trigger Details"
              action={<Icon name="close" size={15} style={{ color: 'var(--muted)' }} />}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span
                  style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', flexShrink: 0 }}
                >
                  <Icon name="calendar" size={17} fill />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{DETAIL.name}</span>
                    <span
                      style={{ display: 'inline-flex', alignItems: 'center', height: 17, padding: '0 6px', borderRadius: 4, background: STATUS.in.bg, color: STATUS.in.fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}
                    >
                      {DETAIL.status}
                    </span>
                  </span>
                  <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                    {DETAIL.id}
                  </span>
                </span>
                <Icon name="flag" size={15} style={{ color: 'var(--st-progress-fg)' }} />
              </div>

              <div style={{ display: 'flex', gap: 2, marginTop: 10, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                {DETAIL.tabs.map((t) => {
                  const on = tab === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      aria-current={on ? 'page' : undefined}
                      style={{
                        height: 27,
                        padding: '0 8px',
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
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={fieldLabel}>Description</div>
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{DETAIL.description}</p>
              </div>

              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DETAIL.fields.map((f) => (
                  <div key={f.label}>
                    <div style={fieldLabel}>{f.label}</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: f.link ? 'var(--link)' : 'var(--text)', fontWeight: f.link ? 600 : 400 }}>
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={fieldLabel}>Last Triggered</div>
                <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{DETAIL.lastBs}</div>
                <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{DETAIL.lastAd}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                {DETAIL.stats.map((s) => (
                  <span key={s.label} style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{s.label}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginTop: 1 }}>
                      {s.value}
                    </span>
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
                <Button icon="tool" variant="primary">
                  Edit Trigger
                </Button>
                <Button icon="arrow_right">Test Trigger</Button>
              </div>
            </Card>
          </div>

          <Card
            title={`Trigger List (${TRIGGERS.length})`}
            action={
              <>
                {FILTERS.map((f) => (
                  <Button key={f} icon="chevron_down">
                    {f}
                  </Button>
                ))}
                <Button variant="ghost">Clear</Button>
              </>
            }
            bodyStyle={{ padding: 0 }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {['Trigger Name', 'Module', 'Event', 'Workflow', 'Last Triggered (BS / AD)', 'Response Time', 'Success Rate', 'Actions'].map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TRIGGERS.map((t) => (
                    <tr key={t.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Icon name="automation" size={14} style={{ color: 'var(--muted)' }} />
                          <span style={{ fontWeight: 600 }}>{t.name}</span>
                        </span>
                      </td>
                      <td style={{ ...td, color: 'var(--link)', fontWeight: 600 }}>{t.module}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{t.event}</td>
                      <td style={{ ...td, color: 'var(--link)' }}>{t.workflow}</td>
                      <td style={td}>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)' }}>{t.bs}</span>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{t.ad}</span>
                      </td>
                      <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{t.response}</td>
                      <td className="figure" style={{ ...td, fontWeight: 600 }}>{t.success}</td>
                      <td style={td}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 19,
                              padding: '0 7px',
                              borderRadius: 5,
                              background: STATUS[t.statusKey].bg,
                              color: STATUS[t.statusKey].fg,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                            }}
                          >
                            {t.status}
                          </span>
                          <Icon name="more_vert" size={14} style={{ color: 'var(--muted)' }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <span>Showing 1 to 10 of 148 triggers</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                {['‹', '1', '2', '3', '4', '5', '…', '15', '›'].map((p, i) => {
                  const on = p === '1'
                  return (
                    <button
                      key={`${p}-${i}`}
                      type="button"
                      aria-current={on ? 'page' : undefined}
                      style={{
                        minWidth: 24,
                        height: 24,
                        borderRadius: 6,
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

          <Card
            title="Execution Queue (Real-time)"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View Full Queue →
              </span>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 9 }}>
              {QUEUE.map((q) => (
                <div
                  key={q.label}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', minWidth: 0 }}
                >
                  <span
                    style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--card)', color: BRAND[q.tone], flexShrink: 0, border: '1px solid var(--border)' }}
                  >
                    <Icon name={q.icon} size={14} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{q.label}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                      {q.value}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Rail>
          <Card title="Trigger Summary">
            <SummaryRows rows={SUMMARY} />
            <div aria-hidden style={{ height: 6, borderRadius: 999, background: 'var(--card2)', marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: '99.8%', height: '100%', background: BRAND.success, borderRadius: 999 }} />
            </div>
          </Card>

          <Card
            title="Alerts"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View all →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {ALERTS.map((a) => (
                <div key={a.text} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)' }}>
                  <Icon name="alert_triangle" size={13} style={{ color: BRAND_TEXT[a.tone], flexShrink: 0, marginTop: 1 }} />
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{a.text}</span>
                  <span className="figure" style={{ color: 'var(--muted)', flexShrink: 0, fontSize: 'var(--t-meta)' }}>
                    {a.when}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q.label}
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
                  }}
                >
                  <Icon name={q.icon} size={17} style={{ color: BRAND[q.tone] }} />
                  {q.label}
                </button>
              ))}
            </div>
          </Card>

          <Card
            title="Recent Activity"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View all →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {ACTIVITY.map((a) => (
                <div key={a.what} style={{ display: 'flex', gap: 8 }}>
                  <Icon name="dot" size={9} style={{ color: BRAND[a.tone], flexShrink: 0, marginTop: 4 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.what}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{a.at}</span>
                  </span>
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', flexShrink: 0 }}>{a.who}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="AI Trigger Assistant"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View all →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ADVISOR.map((a) => (
                <div key={a.text} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 'var(--t-meta)' }}>
                  <Icon name="dot" size={9} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{a.text}</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 17,
                      padding: '0 6px',
                      borderRadius: 4,
                      flexShrink: 0,
                      background:
                        a.weight === 'High' ? 'var(--st-danger-bg)' : a.weight === 'Medium' ? 'var(--st-progress-bg)' : 'var(--st-neutral-bg)',
                      color:
                        a.weight === 'High' ? 'var(--st-danger-fg)' : a.weight === 'Medium' ? 'var(--st-progress-fg)' : 'var(--st-neutral-fg)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 700,
                    }}
                  >
                    {a.weight}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 11,
                height: 32,
                padding: '0 9px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
              }}
            >
              <input
                aria-label="Ask AI to optimize triggers"
                placeholder="Ask AI to optimize triggers…"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--t-meta)', color: 'var(--text)', fontFamily: 'inherit' }}
              />
              <Icon name="arrow_right" size={14} style={{ color: 'var(--muted)' }} />
            </div>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['Automation logs are immutable and audit ready']} />
    </div>
  )
}

const fieldLabel = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 } as const
