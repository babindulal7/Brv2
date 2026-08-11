import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { STATUS, BRAND } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import {
  PERIOD,
  KPIS,
  SEGMENTS,
  CAMPAIGN_TABS,
  CAMPAIGNS,
  CHANNEL_MIX,
  TOTAL_SENT,
  BUILDER_STEPS,
  PREVIEW_TABS,
  PREVIEW_MESSAGE,
  VARIABLES,
  FUNNEL,
  PERFORMANCE,
  UPCOMING,
  QUICK_ACTIONS,
  ACTIVITY,
  ADVISOR,
} from '../../data/broadcast'

/**
 * Channel marks. Each carries a letter, so a chip is never colour-only.
 *
 * These use `STATUS` bg/fg pairs rather than a brand fill with white on top —
 * the brand colours are tuned as *marks*, and white on `--success` measures
 * 2.28:1. A pair designed as background-plus-foreground is the right tool.
 */
const CHANNEL: Record<string, { letter: string; key: StatusKey; dot: 'success' | 'primary' | 'progress' | 'primary' }> = {
  whatsapp: { letter: 'W', key: 'in', dot: 'success' },
  email: { letter: 'E', key: 'primary', dot: 'primary' },
  sms: { letter: 'S', key: 'progress', dot: 'progress' },
  push: { letter: 'P', key: 'progress', dot: 'primary' },
}

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const, verticalAlign: 'top' as const }
const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const

/** Multi-series line chart. One y-axis — never two. */
function MultiLine() {
  const [hover, setHover] = useState<number | null>(null)
  const w = 100
  const h = 100
  const n = PERFORMANCE.labels.length
  const max = Math.max(...PERFORMANCE.series.flatMap((s) => s.points))
  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        <div
          aria-hidden
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 150, fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}
        >
          {[...PERFORMANCE.yTicks].reverse().map((t) => (
            <span key={t} className="figure">
              {t}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Campaign performance over time"
          style={{ width: '100%', height: 150, overflow: 'visible' }}
          onMouseLeave={() => setHover(null)}
        >
          {PERFORMANCE.yTicks.map((_, i) => (
            <line
              key={i}
              x1={0}
              x2={w}
              y1={(i / (PERFORMANCE.yTicks.length - 1)) * h}
              y2={(i / (PERFORMANCE.yTicks.length - 1)) * h}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {PERFORMANCE.series.map((s, si) => (
            <polyline
              key={s.name}
              points={s.points.map((p, i) => `${(i / (n - 1)) * w},${h - (p / max) * h}`).join(' ')}
              fill="none"
              stroke={catColor(si)}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              opacity={hover === null || hover === si ? 1 : 0.3}
            />
          ))}
          {PERFORMANCE.series.map((s, si) =>
            s.points.map((p, i) => (
              <circle
                key={`${si}-${i}`}
                cx={(i / (n - 1)) * w}
                cy={h - (p / max) * h}
                r={2.2}
                fill="var(--card)"
                stroke={catColor(si)}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                opacity={hover === null || hover === si ? 1 : 0.3}
              />
            )),
          )}
        </svg>
      </div>
      <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 28, marginTop: 5, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {PERFORMANCE.labels.map((l) => (
          <span key={l} className="figure">
            {l}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-md)', justifyContent: 'center', marginTop: 9, flexWrap: 'wrap' }}>
        {PERFORMANCE.series.map((s, i) => (
          <button
            key={s.name}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              border: 'none',
              background: 'transparent',
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 'var(--r-badge)', background: catColor(i) }} />
            {s.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Notification Center → **Broadcast Center**, built from render `3B62B8D9`.
 *
 * Every outbound channel here sends real messages to real clients, so nothing
 * on this page is wired to a send path — the builder and its Send controls are
 * presentational until the confirmation and audit flow exists.
 */
export default function BroadcastCenter() {
  const [tab, setTab] = useState('All')
  const [preview, setPreview] = useState(PREVIEW_TABS[0] as string)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="bell"
        title="Broadcast Center"
        description="Create, manage and analyze multi-channel broadcast campaigns."
        actions={
          <>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                height: 34,
                padding: '0 11px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
              }}
            >
              <Icon name="calendar" size={14} style={{ color: 'var(--muted)' }} />
              <span style={{ lineHeight: 1.2, textAlign: 'left' }}>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                  {PERIOD.range}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{PERIOD.ad}</span>
              </span>
            </span>
            <Button icon="plus" variant="primary">
              New Broadcast
            </Button>
            <Button icon="calendar_stats">Schedule Campaign</Button>
            <Button icon="queues">Duplicate</Button>
            <Button icon="download">Export</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={6} />

          <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Audience Segments"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View All →
                </span>
              }
              bodyStyle={{ padding: 10 }}
            >
              {SEGMENTS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    width: '100%',
                    padding: '7px 6px',
                    borderRadius: 'var(--r-sm)',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-card)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    aria-hidden
                    style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', background: 'var(--card2)', color: BRAND[s.tone], flexShrink: 0 }}
                  >
                    <Icon name="users" size={14} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
                    <span
                      style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {s.note}
                    </span>
                  </span>
                  <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                    {s.count}
                  </span>
                </button>
              ))}
              <div style={{ marginTop: 'var(--sp-sm)' }}>
                <Button icon="plus">Create New Segment</Button>
              </div>
            </Card>

            <Card
              title="Broadcast Campaigns"
              action={
                <>
                  <Button icon="chevron_down">All Campaigns</Button>
                  <Button icon="queues">Filter</Button>
                </>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ display: 'flex', gap: 'var(--sp-xs)', padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                {CAMPAIGN_TABS.map((t) => {
                  const on = tab === t.label
                  return (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setTab(t.label)}
                      aria-pressed={on}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        height: 26,
                        padding: '0 9px',
                        borderRadius: 7,
                        border: 'none',
                        background: on ? 'var(--nav-active-bg)' : 'transparent',
                        color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: on ? 700 : 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {t.label}
                      <span className="figure" style={{ fontSize: 'var(--t-meta)', color: on ? 'var(--nav-active-accent)' : 'var(--muted)' }}>
                        {t.count}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Campaign', 'Channel', 'Audience', 'Status', 'Scheduled Date (BS / AD)', 'Delivery', 'Read', 'Click', 'Actions'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CAMPAIGNS.map((c) => (
                      <tr key={c.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>
                          <span style={{ display: 'block', fontWeight: 600 }}>{c.name}</span>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{c.note}</span>
                        </td>
                        <td style={td}>
                          <span style={{ display: 'flex', gap: 3 }}>
                            {c.channels.map((ch) => {
                              const meta = CHANNEL[ch]
                              if (!meta) return null
                              return (
                                <span
                                  key={ch}
                                  title={ch}
                                  className="figure"
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 4,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: STATUS[meta.key].bg,
                                    color: STATUS[meta.key].fg,
                                    fontSize: 'var(--t-meta)',
                                    fontWeight: 700,
                                  }}
                                >
                                  {meta.letter}
                                </span>
                              )
                            })}
                          </span>
                        </td>
                        <td className="figure" style={td}>{c.audience}</td>
                        <td style={td}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 19,
                              padding: '0 7px',
                              borderRadius: 5,
                              background: STATUS[c.statusKey].bg,
                              color: STATUS[c.statusKey].fg,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                            }}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td style={td}>
                          <span className="figure" style={{ display: 'block' }}>{c.bs}</span>
                          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{c.ad}</span>
                        </td>
                        <td className="figure" style={td}>{c.delivery}</td>
                        <td className="figure" style={td}>{c.read}</td>
                        <td className="figure" style={td}>{c.click}</td>
                        <td style={{ ...td, color: 'var(--muted)' }}>
                          <Icon name="more_vert" size={14} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                <span>Showing 1 to 6 of 56 campaigns</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                  {['‹', '1', '2', '3', '4', '5', '…', '10', '›'].map((p, i) => {
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

          <Card title="Campaign Builder">
            <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) minmax(0,1.1fr) 180px', gap: 14 }}>
              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {BUILDER_STEPS.map((s, i) => (
                  <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
                    <span
                      className="figure"
                      style={{
                        width: 19,
                        height: 19,
                        borderRadius: 'var(--r-badge)',
                        display: 'grid',
                        placeItems: 'center',
                        background: i === 0 ? 'var(--btn-primary-bg)' : 'var(--card2)',
                        color: i === 0 ? 'var(--btn-primary-fg)' : 'var(--text2)',
                        border: i === 0 ? 'none' : '1px solid var(--border)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ color: i === 0 ? 'var(--text)' : 'var(--text2)', fontWeight: i === 0 ? 600 : 500 }}>{s}</span>
                  </li>
                ))}
              </ol>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <Field label="Campaign Name" value="Dashain Festival Offer 2082" />
                <Field label="Campaign Type" value="Promotional" select />
                <Field label="Description" value="Special discount offer for Dashain festival for our valued clients." area />
                <div>
                  <div style={fieldLabel}>Selected Channels</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {(['whatsapp', 'email', 'sms'] as const).map((ch) => {
                      const meta = CHANNEL[ch]
                      if (!meta) return null
                      return (
                        <span
                          key={ch}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            height: 24,
                            padding: '0 8px',
                            borderRadius: 'var(--r-xs)',
                            border: '1px solid var(--border)',
                            background: 'var(--card2)',
                            fontSize: 'var(--t-meta)',
                            color: 'var(--text)',
                            textTransform: 'capitalize',
                          }}
                        >
                          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 'var(--r-badge)', background: BRAND[meta.dot] }} />
                          {ch}
                        </span>
                      )
                    })}
                    <Button icon="plus">Add Channel</Button>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', gap: 3, marginBottom: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  {PREVIEW_TABS.map((p) => {
                    const on = preview === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPreview(p)}
                        aria-pressed={on}
                        style={{
                          height: 25,
                          padding: '0 9px',
                          borderRadius: 'var(--r-xs)',
                          border: 'none',
                          background: on ? 'var(--nav-active-bg)' : 'transparent',
                          color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
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
                </div>
                <div
                  style={{
                    padding: 11,
                    borderRadius: 'var(--r-btn)',
                    background: 'var(--st-in-bg)',
                    color: 'var(--st-in-fg)',
                    fontSize: 'var(--t-meta)',
                    lineHeight: 1.7,
                  }}
                >
                  {PREVIEW_MESSAGE.map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                  <div className="figure" style={{ textAlign: 'right', fontSize: 'var(--t-meta)', marginTop: 5, opacity: 0.8 }}>
                    10:30 AM ✓✓
                  </div>
                </div>
              </div>

              <div>
                <div style={fieldLabel}>Personalization Variables</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                  {VARIABLES.map((v) => (
                    <span
                      key={v}
                      className="figure"
                      style={{
                        fontSize: 'var(--t-meta)',
                        padding: '5px 8px',
                        borderRadius: 'var(--r-xs)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text2)',
                      }}
                    >
                      {v}
                    </span>
                  ))}
                  <Button icon="plus">More Variables</Button>
                </div>
              </div>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Delivery Funnel"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View Full Report →
                </span>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                {FUNNEL.map((f, i) => (
                  <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                    <span
                      aria-hidden
                      style={{
                        width: `${f.width}%`,
                        height: 15,
                        background: catColor(i),
                        borderRadius: 3,
                        minWidth: 12,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 'var(--t-meta)',
                        color: 'var(--text2)',
                        flex: 1,
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {f.label}
                    </span>
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                      {f.value}
                    </span>
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', minWidth: 42, textAlign: 'right' }}>
                      {f.pct}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Campaign Performance Over Time"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View Analytics →
                </span>
              }
            >
              <MultiLine />
            </Card>

            <Card
              title="Upcoming Scheduled"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View All →
                </span>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {UPCOMING.map((u) => (
                  <div key={u.name} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span
                      style={{
                        width: 42,
                        borderRadius: 7,
                        background: 'var(--card2)',
                        border: '1px solid var(--border)',
                        padding: '5px 3px',
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                        {u.bs}
                      </span>
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        {u.bsYear}
                      </span>
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{u.name}</span>
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{u.detail}</span>
                    </span>
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', flexShrink: 0 }}>
                      {u.at}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <Rail>
          <Card
            title="Channel Distribution"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View Details →
              </span>
            }
          >
            <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center' }}>
              <Donut slices={CHANNEL_MIX} centreLabel="Total Sent" centreValue={TOTAL_SENT} size={110} />
              <Legend slices={CHANNEL_MIX} />
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
                    lineHeight: 1.25,
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
                <div key={a.what} style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
                  <Icon name="dot" size={9} style={{ color: BRAND[a.tone], flexShrink: 0, marginTop: 'var(--sp-xs)' }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{a.what}</span>
                  <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', flexShrink: 0 }}>
                    {a.at}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="AI Broadcast Advisor — Preview"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View All →
              </span>
            }
          >
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              {ADVISOR.map((t) => (
                <li key={t} style={{ display: 'flex', gap: 7, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                  <Icon name="dot" size={9} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 'var(--sp-xs)' }} />
                  <span style={{ color: 'var(--text2)' }}>{t}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div style={{ ...cardStyle, padding: 11, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            Sending is not wired up. The builder and its controls are presentational until the
            confirmation and audit flow exists.
          </div>
        </Rail>
      </div>

      <FooterNote extra={['Broadcast data is real-time', 'Communication logs are immutable and audit ready']} />
    </div>
  )
}

const fieldLabel = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 'var(--sp-xs)' } as const

function Field({ label, value, select, area }: { label: string; value: string; select?: boolean; area?: boolean }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <div
        style={{
          display: 'flex',
          alignItems: area ? 'flex-start' : 'center',
          gap: 6,
          minHeight: area ? 50 : 30,
          padding: area ? '7px 9px' : '0 9px',
          borderRadius: 'var(--r-input)',
          border: '1px solid var(--input-border)',
          background: 'var(--input-bg)',
          fontSize: 'var(--t-meta)',
          color: 'var(--text)',
          lineHeight: 1.4,
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>{value}</span>
        {select && <Icon name="chevron_down" size={13} style={{ color: 'var(--muted)' }} />}
      </div>
    </div>
  )
}
