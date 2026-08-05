import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote } from '../../components/ui/Page'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { STATUS, BRAND, BRAND_TEXT } from '../../lib/status'
import {
  KPIS,
  GATEWAYS,
  QUEUE_TILES,
  QUEUE_MIX,
  QUEUE_TOTAL,
  MESSAGES,
  VIEWER,
  TEMPLATES,
  VOLUME,
  GATEWAY_PERF,
  CAMPAIGN_PERF,
  CAMPAIGN_TOTAL,
  CAMPAIGN_EXTRA,
  SUMMARY,
  ALERTS,
  QUICK_ACTIONS,
  ACTIVITY,
  ADVISOR,
} from '../../data/sms'

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

function Health({ status }: { status: 'Healthy' | 'Warning' }) {
  const k = status === 'Healthy' ? STATUS.in : STATUS.progress
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 19,
        padding: '0 7px',
        borderRadius: 5,
        background: k.bg,
        color: k.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  )
}

function VolumeChart() {
  const w = 100
  const h = 100
  const max = Math.max(...VOLUME.series.flatMap((s) => s.points))
  const n = VOLUME.series[0]?.points.length ?? 0
  return (
    <div>
      <div style={{ display: 'flex', gap: 7 }}>
        <div
          aria-hidden
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 120, fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}
        >
          {VOLUME.yTicks.map((t) => (
            <span key={t} className="figure">
              {t}
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="SMS volume trend" style={{ width: '100%', height: 120 }}>
          {VOLUME.yTicks.map((_, i) => (
            <line
              key={i}
              x1={0}
              x2={w}
              y1={(i / (VOLUME.yTicks.length - 1)) * h}
              y2={(i / (VOLUME.yTicks.length - 1)) * h}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {VOLUME.series.map((s, si) => (
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
                <circle key={i} cx={(i / (n - 1)) * w} cy={h - (p / max) * h} r={1.9} fill={catColor(si)} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 24, marginTop: 5, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {VOLUME.labels.map((l) => (
          <span key={l} className="figure">
            {l}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
        {VOLUME.series.map((s, i) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: catColor(i) }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Notification Center → **SMS Center**, built from render `2562E6AA`.
 *
 * Nothing here sends. Gateway balances and queue counts are read-only display;
 * the New SMS / Send OTP / Broadcast controls are presentational until the
 * send path and its audit trail exist.
 */
export default function SmsCenter() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="bell"
        title="SMS Center"
        description="Manage all SMS communications, templates, campaigns and gateways from one place."
        actions={
          <>
            <Button icon="plus" variant="primary">
              New SMS
            </Button>
            <Button icon="crew">Send OTP</Button>
            <Button icon="queues">Broadcast SMS</Button>
            <Button icon="file">Create Template</Button>
            <Button icon="download">Export</Button>
            <Button icon="refresh">Refresh</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 288px', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={6} />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Gateway Manager"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View All Gateways →
                </span>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Gateway', 'Status', 'Latency', 'Balance', 'Throughput (1h)', 'Last Sync'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {GATEWAYS.map((g) => (
                      <tr key={g.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{g.name}</td>
                        <td style={td}>
                          <Health status={g.status} />
                        </td>
                        <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{g.latency}</td>
                        <td className="figure" style={{ ...td, fontWeight: 600 }}>{g.balance}</td>
                        <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{g.throughput}</td>
                        <td style={{ ...td, color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>{g.sync}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="SMS Queue">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {/* Three across, not four — "Cancelled" and "2,086" do not fit
                    a quarter of this card beside the donut. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 7, flex: 1, minWidth: 0 }}>
                  {QUEUE_TILES.map((q) => (
                    <div
                      key={q.label}
                      style={{ padding: '9px 8px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', minWidth: 0 }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--t-meta)',
                          color: BRAND_TEXT[q.tone],
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {q.label}
                      </div>
                      <div
                        className="figure"
                        style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {q.value}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexShrink: 0 }}>
                  <Donut slices={QUEUE_MIX} centreLabel="Total" centreValue={QUEUE_TOTAL} size={92} />
                  <Legend slices={QUEUE_MIX} showPercent={false} />
                </div>
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Message List"
              action={
                <>
                  <Button icon="chevron_down">All Types</Button>
                  <Button icon="calendar">{''}</Button>
                  <Button icon="queues">Filter</Button>
                </>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['ID', 'Customer', 'Phone Number', 'Type', 'Gateway', 'Status', 'Sent Time (BS / AD)', 'Delivery Time'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MESSAGES.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="identifier" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--link)', fontWeight: 600 }}>{m.id}</td>
                        <td style={td}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {m.customer}
                            {m.vip && (
                              <span
                                style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 3, background: 'var(--st-progress-bg)', color: 'var(--st-progress-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}
                              >
                                VIP
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{m.phone}</td>
                        <td style={td}>
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', height: 19, padding: '0 7px', borderRadius: 5, background: STATUS[m.typeKey].bg, color: STATUS[m.typeKey].fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td style={{ ...td, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{m.gateway}</td>
                        <td style={td}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 19,
                              padding: '0 7px',
                              borderRadius: 5,
                              background: m.status === 'Delivered' ? STATUS.in.bg : STATUS.danger.bg,
                              color: m.status === 'Delivered' ? STATUS.in.fg : STATUS.danger.fg,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                            }}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td style={td}>
                          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)' }}>{m.bs}</span>
                          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.ad}</span>
                        </td>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{m.delivered}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                <span>Showing 1 to 25 of 2,158 SMS</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                  {['1', '2', '3', '4', '5', '6', '…', '87', '›'].map((p, i) => {
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
              title="Message Viewer"
              action={
                <>
                  <Icon name="flag" size={14} style={{ color: 'var(--muted)' }} />
                  <Icon name="return_arrow" size={14} style={{ color: 'var(--muted)' }} />
                  <Icon name="external_link" size={14} style={{ color: 'var(--muted)' }} />
                  <Icon name="more_vert" size={14} style={{ color: 'var(--muted)' }} />
                </>
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="identifier" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                  {VIEWER.id}
                </span>
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', height: 17, padding: '0 6px', borderRadius: 4, background: STATUS.in.bg, color: STATUS.in.fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}
                >
                  {VIEWER.status}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 9, marginTop: 10 }}>
                {[
                  { l: 'Customer', v: VIEWER.customer },
                  { l: 'Phone Number', v: VIEWER.phone },
                  { l: 'Gateway', v: VIEWER.gateway },
                ].map((x) => (
                  <span key={x.l} style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{x.l}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {x.v}
                    </span>
                  </span>
                ))}
              </div>

              <div
                style={{
                  marginTop: 10,
                  padding: 11,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card2)',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text)',
                  lineHeight: 1.6,
                }}
              >
                {VIEWER.body.map((l) => (
                  <p key={l} style={{ margin: '0 0 6px' }}>
                    {l}
                  </p>
                ))}
              </div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 5 }}>{VIEWER.meta}</div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 7 }}>Delivery Details</div>
                {VIEWER.delivery.map((d) => (
                  <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                    <Icon
                      name={d.done ? 'checklist' : 'dot'}
                      size={12}
                      style={{ color: d.done ? 'var(--success-text)' : 'var(--disabled)', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, minWidth: 0, color: d.done ? 'var(--text)' : 'var(--muted)' }}>{d.label}</span>
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', flexShrink: 0 }}>
                      {d.at}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 7 }}>Linked Records</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 7 }}>
                  {VIEWER.linked.map((l) => (
                    <span
                      key={l.label}
                      style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card2)', minWidth: 0 }}
                    >
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{l.label}</span>
                      <span
                        className="figure"
                        style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--link)', fontWeight: 600, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {l.value}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="SMS Volume Trend"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View Full Report →
                </span>
              }
            >
              <VolumeChart />
            </Card>

            <Card
              title="Gateway Performance"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View Details →
                </span>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Gateway', 'Delivery Rate', 'Avg. Latency', 'Throughput (1h)', 'Status'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {GATEWAY_PERF.map((g) => (
                      <tr key={g.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...td, fontSize: 'var(--t-meta)' }}>{g.name}</td>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', fontWeight: 600 }}>{g.rate}</td>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{g.latency}</td>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{g.throughput}</td>
                        <td style={td}>
                          <Health status={g.status as 'Healthy' | 'Warning'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card
              title="Campaign Performance"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View All Campaigns →
                </span>
              }
            >
              <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                <Donut slices={CAMPAIGN_PERF} centreLabel="Total Sent" centreValue={CAMPAIGN_TOTAL} size={104} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Legend slices={CAMPAIGN_PERF} />
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    {CAMPAIGN_EXTRA.map((x) => (
                      <div key={x.label} style={{ display: 'flex', gap: 8, fontSize: 'var(--t-meta)', padding: '2px 0' }}>
                        <span style={{ color: 'var(--text2)', flex: 1 }}>{x.label}</span>
                        <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {x.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Rail>
          <Card
            title="SMS Summary"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View Analytics →
              </span>
            }
          >
            <SummaryRows rows={SUMMARY} />
          </Card>

          <Card
            title="Template Library"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View All →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {TEMPLATES.map((t, i) => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)' }}>
                  <Icon name="file" size={13} style={{ color: catColor(i), flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.name}
                  </span>
                  <span className="figure" style={{ fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
            <span style={{ ...link, display: 'inline-block', marginTop: 9 }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
              More Templates →
            </span>
          </Card>

          <Card
            title="Alerts"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View All →
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
                View All →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACTIVITY.map((a) => (
                <div key={a.what} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="dot" size={9} style={{ color: BRAND[a.tone], flexShrink: 0, marginTop: 4 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{a.what}</span>
                  <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', flexShrink: 0 }}>
                    {a.at}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="AI SMS Advisor"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View All →
              </span>
            }
          >
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ADVISOR.map((t) => (
                <li key={t} style={{ display: 'flex', gap: 7, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                  <Icon name="dot" size={9} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 4 }} />
                  <span style={{ color: 'var(--text2)' }}>{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['SMS data is real-time', 'Communication logs are immutable and audit ready']} />
    </div>
  )
}
