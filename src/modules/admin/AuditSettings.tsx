import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote } from '../../components/ui/Page'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { STATUS, BRAND, BRAND_TEXT } from '../../lib/status'
import {
  KPIS,
  LOG_EVENTS,
  CATEGORIES,
  RETENTION,
  AUDIT_RULES,
  COMPLIANCE,
  LEGAL_HOLD,
  BY_MODULE,
  TOTAL_EVENTS,
  BY_USER,
  BY_BRANCH,
  HIGH_RISK,
  GROWTH,
  INSIGHTS,
  SUMMARY,
  ALERTS,
  QUICK_ACTIONS,
  ACTIVITY,
} from '../../data/audit'

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

function Toggle({ on, label }: { on: boolean; label: string }) {
  const [state, setState] = useState(on)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={state}
      aria-label={label}
      onClick={() => setState((s) => !s)}
      style={{
        width: 30,
        height: 17,
        borderRadius: 999,
        border: 'none',
        padding: 2,
        background: state ? 'var(--success)' : 'var(--disabled)',
        cursor: 'pointer',
        flexShrink: 0,
        display: 'flex',
        justifyContent: state ? 'flex-end' : 'flex-start',
      }}
    >
      <span aria-hidden style={{ width: 13, height: 13, borderRadius: 999, background: '#fff', display: 'block' }} />
    </button>
  )
}

function StatusPill({ text }: { text: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 19,
        padding: '0 7px',
        borderRadius: 5,
        background: STATUS.in.bg,
        color: STATUS.in.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  )
}

/** Ranked horizontal bars — one hue, because rank is not a category. */
function RankBars({ rows, tone }: { rows: Array<{ name: string; value: string; pct: number }>; tone: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{ width: 88, flexShrink: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {r.name}
          </span>
          <span aria-hidden style={{ flex: 1, minWidth: 0, height: 11, background: 'var(--card2)', borderRadius: 3 }}>
            <span style={{ display: 'block', width: `${r.pct}%`, height: '100%', background: catColor(tone), borderRadius: 3 }} />
          </span>
          <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', flexShrink: 0, minWidth: 40, textAlign: 'right' }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function MiniLine({ d, tone }: { d: { yTicks: string[]; labels: string[]; points: number[] }; tone: number }) {
  const w = 100
  const h = 100
  const max = Math.max(...d.points)
  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div
          aria-hidden
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 80, fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}
        >
          {d.yTicks.map((t) => (
            <span key={t} className="figure">
              {t}
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ width: '100%', height: 80 }}>
          <polyline
            points={d.points.map((p, i) => `${(i / (d.points.length - 1)) * w},${h - (p / max) * h}`).join(' ')}
            fill="none"
            stroke={catColor(tone)}
            strokeWidth={1.8}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {d.points.map((p, i) => (
            <circle
              key={i}
              cx={(i / (d.points.length - 1)) * w}
              cy={h - (p / max) * h}
              r={1.8}
              fill={catColor(tone)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 26, marginTop: 4, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {d.labels.map((l) => (
          <span key={l} className="figure">
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Administration → **Audit Settings**, built from render `13590713`.
 *
 * The Audit Logs retention row reads "Forever / Never Delete" and is the one
 * row with no expiry — that is Foundation's "nothing is deleted" rule showing
 * up in the retention table, not a data-entry accident.
 */
export default function AuditSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="settings"
        title="Audit Settings"
        description="Configure audit logging, retention policies and compliance rules to ensure accountability and data integrity."
        actions={
          <>
            <Button icon="plus" variant="primary">
              Create Audit Rule
            </Button>
            <Button icon="download">Export</Button>
            <Button icon="checklist">Verify Logs</Button>
            <Button icon="refresh">Refresh</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={6} />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.05fr) minmax(0,1.25fr)', gap: 'var(--sp-md)' }}>
            <Card title="Audit Configuration">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 10px',
                  borderRadius: 'var(--r-btn)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ flex: 1, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Global Audit Logging</span>
                <Toggle on label="Global audit logging" />
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--success-text)', fontWeight: 600 }}>Enabled</span>
              </div>

              <div style={{ marginTop: 11 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Audit Level (Granularity)</div>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    height: 30,
                    marginTop: 5,
                    padding: '0 9px',
                    borderRadius: 'var(--r-input)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ flex: 1, textAlign: 'left' }}>Detailed</span>
                  <Icon name="chevron_down" size={13} style={{ color: 'var(--muted)' }} />
                </button>
                <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  Captures detailed context for all critical actions.
                </p>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Log These Events</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 10px' }}>
                  {LOG_EVENTS.map((e, i) => (
                    <span key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Icon name="checklist" size={12} style={{ color: catColor(i % 8), flexShrink: 0 }} />
                      <span
                        style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {e.label}
                      </span>
                      <Toggle on={e.on} label={e.label} />
                    </span>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span style={{ flex: 1, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Exclude System Heartbeat Logs</span>
                <Icon name="info" size={12} style={{ color: 'var(--muted)' }} />
                <Toggle on={false} label="Exclude system heartbeat logs" />
              </div>
            </Card>

            <Card
              title="Audit Categories"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View all →
                </span>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                {CATEGORIES.map((c, i) => (
                  <div
                    key={c.name}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      minWidth: 0,
                    }}
                  >
                    <Icon name={c.icon} size={16} style={{ color: catColor(i) }} />
                    <div
                      style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {c.name}
                    </div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                      {c.events}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Retention Policies"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  Manage Policies →
                </span>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Module', 'Retention Period', 'Action After Expiry', 'Status'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RETENTION.map((r) => (
                      <tr key={r.module} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{r.module}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{r.period}</td>
                        <td
                          style={{
                            ...td,
                            color: r.action === 'Never Delete' ? 'var(--progress-text)' : 'var(--text2)',
                            fontWeight: r.action === 'Never Delete' ? 600 : 400,
                          }}
                        >
                          {r.action}
                        </td>
                        <td style={td}>
                          <StatusPill text="Active" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                <Button icon="plus">Add Retention Policy</Button>
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Audit Rules"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View all rules →
                </span>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Rule Name', 'Module / Category', 'Condition', 'Audit Level', 'Status', 'Last Updated', ''].map((h, i) => (
                        <th key={h || i} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {AUDIT_RULES.map((r) => (
                      <tr key={r.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{r.name}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{r.module}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{r.condition}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{r.level}</td>
                        <td style={td}>
                          <StatusPill text="Active" />
                        </td>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{r.at}</td>
                        <td style={{ ...td, color: 'var(--muted)', width: 26 }}>
                          <Icon name="more_vert" size={14} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                <Button icon="plus">Create Audit Rule</Button>
              </div>
            </Card>

            <Card
              title="Compliance Rules"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View all →
                </span>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {COMPLIANCE.map((c) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)' }}>
                    <Icon name="checklist" size={13} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </span>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', flexShrink: 0 }}>{c.cadence}</span>
                    <StatusPill text="Compliant" />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 11 }}>
                <Button icon="plus">Create Compliance Rule</Button>
              </div>
            </Card>

            <Card title="Legal Hold">
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{LEGAL_HOLD.note}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--progress-text)' }}>
                <Icon name="alert_triangle" size={13} />
                {LEGAL_HOLD.active}
              </div>
              <div style={{ marginTop: 11 }}>
                <Button>Manage Legal Holds</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                {[
                  { l: 'Oldest Hold', v: LEGAL_HOLD.oldest },
                  { l: 'Locked Records', v: LEGAL_HOLD.locked },
                  { l: 'Expires On', v: LEGAL_HOLD.expires },
                ].map((x) => (
                  <span key={x.l} style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{x.l}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                      {x.v}
                    </span>
                  </span>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Audit Analytics (This Month)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={sub}>Events by Module</div>
                <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{TOTAL_EVENTS}</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Total Events</div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 7 }}>
                  <Donut slices={BY_MODULE} size={58} />
                  <Legend slices={BY_MODULE} showPercent={false} />
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Events by User</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 7 }}>Top 5 Active Users</div>
                <RankBars rows={BY_USER} tone={0} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Events by Branch</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 7 }}>&nbsp;</div>
                <RankBars rows={BY_BRANCH} tone={2} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>High-Risk Actions</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{HIGH_RISK.note}</div>
                <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{HIGH_RISK.value}</div>
                <MiniLine d={HIGH_RISK} tone={5} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Audit Growth</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{GROWTH.note}</div>
                <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{GROWTH.value}</div>
                <MiniLine d={GROWTH} tone={3} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={sub}>AI Audit Insights</span>
                  <span style={{ ...link, marginLeft: 'auto', fontSize: 'var(--t-meta)' }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                    View Insights →
                  </span>
                </div>
                <ul style={{ margin: '7px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {INSIGHTS.map((t) => (
                    <li key={t} style={{ display: 'flex', gap: 6, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                      <Icon name="dot" size={9} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 3 }} />
                      <span style={{ color: 'var(--text2)' }}>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>

        <Rail>
          <Card title="Audit Summary">
            <SummaryRows rows={SUMMARY} />
            <div aria-hidden style={{ height: 6, borderRadius: 999, background: 'var(--card2)', marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: '98%', height: '100%', background: BRAND.success, borderRadius: 999 }} />
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
                  <span className="figure" style={{ color: 'var(--muted)', flexShrink: 0 }}>{a.when}</span>
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

          <Card title="AI Audit Assistant">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 32,
                padding: '0 9px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
              }}
            >
              <input
                aria-label="Ask AI about audit settings"
                placeholder="Ask AI about audit settings…"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--t-meta)', color: 'var(--text)', fontFamily: 'inherit' }}
              />
              <Icon name="arrow_right" size={14} style={{ color: 'var(--muted)' }} />
            </div>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['All audit logs are immutable and tamper-proof']} />
    </div>
  )
}

const sub = { fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' } as const
