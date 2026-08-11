import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote } from '../../components/ui/Page'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { BRAND, BRAND_TEXT, STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import {
  KPIS,
  OVERVIEW,
  SCHEDULE,
  HISTORY,
  RESTORE_SCOPES,
  RESTORE_OPTIONS,
  RESTORE_POINT,
  DESTINATIONS,
  INTEGRITY,
  INTEGRITY_TOTAL,
  CLOUD_USAGE,
  ANALYTICS,
  SUMMARY,
  ALERTS,
  QUICK_ACTIONS,
  ACTIVITY,
  ADVISOR,
} from '../../data/backup'

const STATUS_OF: Record<string, StatusKey> = {
  Completed: 'in',
  Failed: 'danger',
  Verifying: 'progress',
}
const TYPE_OF: Record<string, StatusKey> = {
  Full: 'primary',
  Incremental: 'neutral',
  Differential: 'progress',
}

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

function Pill({ text, status }: { text: string; status: StatusKey }) {
  const c = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 19,
        padding: '0 7px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  )
}

/** Capacity bar. Colour tracks how full it is — that is the whole message. */
function Meter({ pct }: { pct: number }) {
  const tone = pct >= 80 ? 'danger' : pct >= 60 ? 'progress' : 'success'
  return (
    <div
      role="img"
      aria-label={`${pct}% used`}
      style={{ height: 6, borderRadius: 'var(--r-badge)', background: 'var(--card2)', overflow: 'hidden', marginTop: 7 }}
    >
      <div style={{ width: `${pct}%`, height: '100%', background: BRAND[tone], borderRadius: 'var(--r-badge)' }} />
    </div>
  )
}

function Spark({ points, tone }: { points: number[]; tone: 'primary' | 'success' | 'primary' | 'progress' | 'danger' }) {
  const w = 100
  const h = 34
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ width: '100%', height: h, display: 'block', marginTop: 'var(--sp-sm)' }}>
      <polyline
        points={points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / span) * (h - 4) - 2}`).join(' ')}
        fill="none"
        stroke={BRAND[tone]}
        strokeWidth={1.8}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Administration → **Backup & Restore**, built from render `F134F2C8`.
 *
 * The Start Restore control is deliberately inert here. Restore is the single
 * most destructive action in the product, and wiring a live button before the
 * confirmation flow exists would be the wrong order to build it in.
 */
export default function BackupRestore() {
  const [scope, setScope] = useState('Entire System')
  const [opts, setOpts] = useState(() => RESTORE_OPTIONS.map((o) => o.on))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="box"
        title="Backup & Restore"
        description="Protect your data with automated backups and restore with confidence."
        actions={
          <>
            <Button icon="plus" variant="primary">
              Create Backup
            </Button>
            <Button icon="refresh">Restore</Button>
            <Button icon="download">Export</Button>
            <Button icon="refresh">Refresh</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={6} />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Backup Overview"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View all types →
                </span>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-sm)' }}>
                {OVERVIEW.map((o, i) => (
                  <div
                    key={o.label}
                    style={{
                      padding: '11px 8px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      textAlign: 'center',
                      minWidth: 0,
                    }}
                  >
                    <Icon name={o.icon} size={17} style={{ color: catColor(i) }} />
                    <div
                      style={{
                        fontSize: 'var(--t-meta)',
                        color: 'var(--text2)',
                        marginTop: 5,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {o.label}
                    </div>
                    <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                      {o.value}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Backup Schedule" bodyStyle={{ padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Name', 'Frequency', 'Time', 'Next Run', 'Status'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEDULE.map((s) => (
                      <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{s.name}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{s.frequency}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{s.time}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{s.next}</td>
                        <td style={td}>
                          <Pill text="Enabled" status="in" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Backup History"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View all backups →
                </span>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Backup ID', 'Type', 'Started (BS / AD)', 'Completed (BS / AD)', 'Duration', 'Size', 'Destination', 'Status', 'Created By', ''].map(
                        (h, i) => (
                          <th key={h || i} style={th}>
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {HISTORY.map((b) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="identifier" style={{ ...td, color: 'var(--link)', fontWeight: 600 }}>{b.id}</td>
                        <td style={td}>
                          <Pill text={b.type} status={TYPE_OF[b.type] ?? 'neutral'} />
                        </td>
                        {/* BS leads, AD beneath — Foundation renders BS, stores AD. */}
                        <td style={td}>
                          <span className="figure" style={{ display: 'block' }}>{b.startedBs}</span>
                          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{b.startedAd}</span>
                        </td>
                        <td style={td}>
                          <span className="figure" style={{ display: 'block' }}>{b.completedBs}</span>
                          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{b.completedAd}</span>
                        </td>
                        <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{b.duration}</td>
                        <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{b.size}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{b.destination}</td>
                        <td style={td}>
                          <Pill text={b.status} status={STATUS_OF[b.status] ?? 'neutral'} />
                        </td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{b.by}</td>
                        <td style={{ ...td, color: 'var(--muted)' }}>
                          <span style={{ display: 'flex', gap: 5 }}>
                            <Icon name="download" size={14} />
                            <Icon name="checklist" size={14} />
                            <Icon name="more_vert" size={14} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                <span>Showing 1 to 8 of 1,248 backups</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                  {['‹', '1', '2', '3', '…', '156', '›'].map((p, i) => {
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

            <Card
              title="Restore Center"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  Learn more →
                </span>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
                <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
                  <legend style={legend}>Restore What?</legend>
                  {RESTORE_SCOPES.map((s) => (
                    <label
                      key={s}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 'var(--t-meta)', cursor: 'pointer' }}
                    >
                      <input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} />
                      <span style={{ color: scope === s ? 'var(--text)' : 'var(--text2)' }}>{s}</span>
                    </label>
                  ))}
                </fieldset>

                <div style={{ minWidth: 0 }}>
                  <div style={legend}>Restore From</div>
                  <button
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      height: 32,
                      padding: '0 9px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ flex: 1, textAlign: 'left' }}>Select backup or restore point</span>
                    <Icon name="chevron_down" size={13} />
                  </button>

                  <div
                    style={{
                      marginTop: 9,
                      padding: 10,
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="identifier" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {RESTORE_POINT.id}
                      </span>
                      <Icon name="dot" size={11} style={{ color: 'var(--success-text)' }} />
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 3 }}>{RESTORE_POINT.kind}</div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{RESTORE_POINT.at}</div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{RESTORE_POINT.size}</div>
                  </div>

                  <div style={{ ...legend, marginTop: 'var(--sp-md)' }}>Restore Options</div>
                  {RESTORE_OPTIONS.map((o, i) => (
                    <label
                      key={o.label}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 'var(--t-meta)', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={opts[i] ?? false}
                        onChange={() => setOpts((p) => p.map((v, j) => (j === i ? !v : v)))}
                      />
                      <span style={{ color: 'var(--text2)' }}>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled
                title="Restore is not wired up — the confirmation flow does not exist yet"
                /* Rendered as disabled, not as a dimmed primary — a washed-out
                   purple fill still reads as the thing you are meant to press. */
                style={{
                  marginTop: 'var(--sp-md)',
                  width: '100%',
                  height: 36,
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card2)',
                  color: 'var(--muted)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'not-allowed',
                }}
              >
                Start Restore
              </button>
              <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'center' }}>
                Disabled until the confirmation flow is built.
              </p>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Cloud Storage & Destinations"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  Manage →
                </span>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 9 }}>
                {DESTINATIONS.map((d) => (
                  <div
                    key={d.name}
                    style={{ padding: 10, borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', minWidth: 0 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.name}
                      </span>
                      {d.primary && <Pill text="Primary" status="primary" />}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 'var(--sp-xs)' }}>{d.used}</div>
                    <Meter pct={d.pct} />
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 3, textAlign: 'right' }}>{d.pct}%</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Integrity & Verification"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View logs →
                </span>
              }
            >
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <Donut slices={INTEGRITY} centreLabel="Verified" centreValue={INTEGRITY_TOTAL} size={116} />
                <Legend slices={INTEGRITY} />
              </div>
            </Card>
          </div>

          <Card title="Backup Analytics (This Month)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 10 }}>
              {ANALYTICS.map((a, i) => (
                <div key={a.label} style={{ minWidth: 0 }}>
                  <div
                    style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {a.label}
                  </div>
                  <div
                    className="figure"
                    style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {a.value}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 'var(--t-meta)', marginTop: 3, color: a.delta.good ? 'var(--success-text)' : 'var(--danger-text)' }}>
                    <Icon name={a.delta.direction === 'up' ? 'arrow_up' : 'arrow_down'} size={10} fill />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.delta.text}</span>
                  </div>
                  <Spark points={a.points} tone={(['primary', 'success', 'primary', 'progress', 'danger'] as const)[i % 5] ?? 'primary'} />
                </div>
              ))}

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>Cloud Usage</div>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', marginTop: 'var(--sp-xs)' }}>
                  <Donut slices={CLOUD_USAGE} size={62} />
                  <Legend slices={CLOUD_USAGE} showPercent={false} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Rail>
          <Card title="Backup Summary">
            <SummaryRows rows={SUMMARY} />
            <Meter pct={83} />
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
                  <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{a.text}</span>
                  <span className="figure" style={{ color: 'var(--muted)', flexShrink: 0 }}>{a.when}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
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
                <div key={a.what} style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                  <Icon name="dot" size={9} style={{ color: BRAND[a.tone], flexShrink: 0, marginTop: 'var(--sp-xs)' }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.what}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{a.at}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{a.who}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="AI Backup Advisor — Preview"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View insights →
              </span>
            }
          >
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {ADVISOR.map((t) => (
                <li key={t} style={{ display: 'flex', gap: 7, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                  <Icon name="dot" size={10} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 3 }} />
                  <span style={{ color: 'var(--text2)' }}>{t}</span>
                </li>
              ))}
            </ul>
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
                aria-label="Ask AI about backups"
                placeholder="Ask AI about backups…"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--t-meta)', color: 'var(--text)', fontFamily: 'inherit' }}
              />
              <Icon name="arrow_right" size={14} style={{ color: 'var(--muted)' }} />
            </div>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['Backups are encrypted at rest and in transit']} />
    </div>
  )
}

const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const
const legend = { fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6, padding: 0 } as const
