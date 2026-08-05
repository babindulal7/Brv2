import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote } from '../../components/ui/Page'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { STATUS, BRAND } from '../../lib/status'
import {
  KPIS,
  CATEGORIES,
  SEQUENCES,
  PREVIEW,
  CONFIG_TABS,
  CONFIG_FIELDS,
  ANALYTICS,
  SUMMARY,
  ALERTS,
  QUICK_ACTIONS,
  ACTIVITY,
  INSIGHTS,
} from '../../data/numbering'

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

/**
 * Administration → **Numbering Sequences**, built from render `CD132C04`.
 *
 * Save Changes is inert. A sequence counter is the one setting where a wrong
 * value produces duplicate IDs across the whole product, so it does not get a
 * live write before the confirmation and audit path exists.
 */
export default function NumberingSequences() {
  const [cat, setCat] = useState('All Sequences')
  const [tab, setTab] = useState(CONFIG_TABS[0] as string)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="queues"
        title="Numbering Sequences"
        description="Configure and manage all auto-generated numbers used across Babin Rentals OS."
        actions={
          <>
            <Button icon="plus" variant="primary">
              Add Sequence
            </Button>
            <Button icon="download">Import</Button>
            <Button icon="download">Export</Button>
            <Button icon="refresh">Reset Counter</Button>
            <Button icon="refresh">Refresh</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 288px', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={6} />

          <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card title="Sequence Categories" bodyStyle={{ padding: 8 }}>
              {CATEGORIES.map((c, i) => {
                const on = cat === c.name
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setCat(c.name)}
                    aria-pressed={on}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      width: '100%',
                      height: 34,
                      padding: '0 9px',
                      borderRadius: 8,
                      border: 'none',
                      background: on ? 'var(--nav-active-bg)' : 'transparent',
                      color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: on ? 600 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <Icon name={c.icon} size={14} style={{ color: on ? 'var(--nav-active-accent)' : catColor(i), flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </span>
                    {/* `--muted` on the selected row's tint measures 4.38:1 — under AA. */}
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', color: on ? 'var(--text2)' : 'var(--muted)' }}>
                      {c.count}
                    </span>
                  </button>
                )
              })}
            </Card>

            <Card
              title="All Sequences"
              action={
                <>
                  <Button icon="chevron_down">All Modules</Button>
                  <Button icon="chevron_down">All Status</Button>
                  <Button icon="search">Search sequences…</Button>
                </>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Code', 'Sequence Name', 'Prefix', 'Format', 'Current Counter', 'Reset Rule', 'Scope', 'Status', 'Actions'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SEQUENCES.map((s) => (
                      <tr key={s.code} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="identifier" style={{ ...td, fontWeight: 700 }}>{s.code}</td>
                        <td style={td}>{s.name}</td>
                        <td style={td}>
                          <span
                            className="figure"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 18,
                              padding: '0 6px',
                              borderRadius: 4,
                              background: STATUS.primary.bg,
                              color: STATUS.primary.fg,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 700,
                            }}
                          >
                            {s.prefix}
                          </span>
                        </td>
                        <td className="figure" style={{ ...td, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{s.format}</td>
                        <td className="figure" style={{ ...td, fontWeight: 600 }}>{s.counter}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{s.resetRule}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{s.scope}</td>
                        <td style={td}>
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
                            Active
                          </span>
                        </td>
                        <td style={{ ...td, color: 'var(--muted)' }}>
                          <span style={{ display: 'flex', gap: 5 }}>
                            <Icon name="tool" size={13} />
                            <Icon name="more_vert" size={13} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                <span>Showing 1 to 10 of 18 sequences</span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  Rows per page
                  <span className="figure" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)' }}>
                    10
                    <Icon name="chevron_down" size={11} style={{ color: 'var(--muted)' }} />
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 3 }}>
                  {['‹', '1', '2', '›'].map((p, i) => {
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card title="Sequence Preview Generator">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 9 }}>
                {[
                  { l: 'Select Sequence', v: PREVIEW.sequence },
                  { l: 'Branch', v: PREVIEW.branch },
                  { l: 'Warehouse (Optional)', v: PREVIEW.warehouse },
                ].map((f) => (
                  <div key={f.l} style={{ minWidth: 0 }}>
                    <div style={fieldLabel}>{f.l}</div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        height: 30,
                        padding: '0 9px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        fontSize: 'var(--t-meta)',
                        color: 'var(--text)',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.v}</span>
                      <Icon name="chevron_down" size={12} style={{ color: 'var(--muted)' }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Each segment is labelled and coloured so the format is legible
                  as a structure, not just as a string. */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {PREVIEW.parts.map((p, i) => (
                  <span key={p.label} style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                    {i > 0 && <span style={{ color: 'var(--muted)', paddingBottom: 8 }}>-</span>}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 3 }}>
                        {p.label}
                      </span>
                      <span
                        className="figure"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: 32,
                          padding: '0 11px',
                          borderRadius: 8,
                          border: `1px solid ${BRAND[p.tone]}`,
                          background: 'var(--card2)',
                          color: 'var(--text)',
                          fontSize: 'var(--t-ui)',
                          fontWeight: 700,
                        }}
                      >
                        {p.value}
                      </span>
                    </span>
                  </span>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={fieldLabel}>Live Preview</div>
                <div
                  className="figure"
                  style={{
                    padding: '11px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    fontSize: 'var(--t-h3)',
                    fontWeight: 700,
                    color: 'var(--text)',
                    letterSpacing: '0.06em',
                    textAlign: 'center',
                    overflowX: 'auto',
                  }}
                >
                  {PREVIEW.live}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 11, flexWrap: 'wrap' }}>
                {[
                  { l: 'Next Number', v: PREVIEW.next },
                  { l: 'Current Counter', v: PREVIEW.counter },
                  { l: 'Padding Length', v: PREVIEW.padding },
                  { l: 'Total Length', v: PREVIEW.totalLength },
                ].map((x) => (
                  <span key={x.l} style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{x.l}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>
                      {x.v}
                    </span>
                  </span>
                ))}
                <span style={{ marginLeft: 'auto' }}>
                  <Button icon="arrow_right">Test Next 5 Numbers</Button>
                </span>
              </div>
              <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{PREVIEW.note}</p>
            </Card>

            <Card title="Sequence Configuration">
              <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                {CONFIG_TABS.map((t) => {
                  const on = tab === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      aria-current={on ? 'page' : undefined}
                      style={{
                        height: 28,
                        padding: '0 10px',
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 9, marginTop: 11 }}>
                {CONFIG_FIELDS.map((f) => (
                  <div key={f.label} style={{ minWidth: 0 }}>
                    <div style={fieldLabel}>
                      {f.label}
                      {f.required && <span style={{ color: 'var(--danger-text)' }}> *</span>}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        height: 30,
                        padding: '0 9px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        fontSize: 'var(--t-meta)',
                        color: f.value ? 'var(--text)' : 'var(--muted)',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.value || '—'}
                      </span>
                      {f.select && <Icon name="chevron_down" size={12} style={{ color: 'var(--muted)' }} />}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span aria-hidden style={{ width: 30, height: 17, borderRadius: 999, background: 'var(--success)', padding: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{ width: 13, height: 13, borderRadius: 999, background: '#fff' }} />
                  </span>
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Active</span>
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                  <Button>Cancel</Button>
                  <span title="Not wired up — a wrong counter produces duplicate IDs product-wide">
                    <Button>Save Changes</Button>
                  </span>
                </span>
              </div>
              <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'right' }}>
                Saving is disabled until the confirmation and audit path exists.
              </p>
            </Card>
          </div>

          <Card title="Sequence Analytics">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={sub}>Records Generated</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{ANALYTICS.generated.note}</div>
                <div className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>
                  {ANALYTICS.generated.value}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 'var(--t-meta)', color: 'var(--success-text)', marginTop: 2 }}>
                  <Icon name="arrow_up" size={10} fill />
                  {ANALYTICS.generated.delta}
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Daily Generation Trend</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{ANALYTICS.dailyTrend.avg}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 66, marginTop: 7, borderBottom: '1px solid var(--chart-grid)' }}>
                  {ANALYTICS.dailyTrend.bars.map((b) => (
                    <span key={b.label} style={{ flex: 1, height: `${b.v}%`, background: catColor(0), borderRadius: '3px 3px 0 0', minWidth: 3 }} title={`${b.label}: ${b.v}`} />
                  ))}
                </div>
                <div aria-hidden style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                  {ANALYTICS.dailyTrend.bars.map((b) => (
                    <span key={b.label} className="figure" style={{ flex: 1, textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Top Sequences by Usage</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 6 }}>This Month</div>
                {ANALYTICS.topSequences.map((t) => (
                  <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                    <span style={{ width: 66, flexShrink: 0, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.name}
                    </span>
                    <span aria-hidden style={{ flex: 1, minWidth: 0, height: 8, background: 'var(--card2)', borderRadius: 2 }}>
                      <span style={{ display: 'block', width: `${t.pct}%`, height: '100%', background: catColor(3), borderRadius: 2 }} />
                    </span>
                    <span className="figure" style={{ fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                      {t.value}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Reset History</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 6 }}>
                  Last 6 Months · Total Resets {ANALYTICS.resetHistory.total}
                </div>
                {ANALYTICS.resetHistory.rows.map((r) => (
                  <div key={r.name} style={{ display: 'flex', gap: 6, padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}
                    </span>
                    <span style={{ color: 'var(--muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{r.rule}</span>
                    <span className="figure" style={{ color: 'var(--text)', flexShrink: 0 }}>
                      {r.at}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Branch-wise Generation</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>This Month</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <Donut slices={ANALYTICS.branchMix} size={62} />
                  <Legend slices={ANALYTICS.branchMix} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Rail>
          <Card
            title="Sequence Summary"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View Full Report →
              </span>
            }
          >
            <SummaryRows rows={SUMMARY} />
            <div aria-hidden style={{ height: 6, borderRadius: 999, background: 'var(--card2)', marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: BRAND.success, borderRadius: 999 }} />
            </div>
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
                <div key={a.text} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 'var(--t-meta)' }}>
                  <Icon name="checklist" size={13} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{a.text}</span>
                  <span className="figure" style={{ color: 'var(--text)', fontWeight: 600, flexShrink: 0 }}>
                    {a.count}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {ACTIVITY.map((a) => (
                <div key={a.what} style={{ display: 'flex', gap: 8 }}>
                  <Icon name="dot" size={9} style={{ color: 'var(--link)', flexShrink: 0, marginTop: 4 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.what}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{a.detail}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{a.at}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="AI Numbering Insights"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View Insights →
              </span>
            }
          >
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {INSIGHTS.map((t) => (
                <li key={t} style={{ display: 'flex', gap: 7, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                  <Icon name="dot" size={9} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 4 }} />
                  <span style={{ color: 'var(--text2)' }}>{t}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 10 }}>
              <Button icon="sparkles">Run AI Analysis</Button>
            </div>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['Sequence counters are append-only and never reused']} />
    </div>
  )
}

const fieldLabel = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 } as const
const sub = { fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' } as const
