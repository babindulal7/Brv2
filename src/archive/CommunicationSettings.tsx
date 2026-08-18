import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle, SummaryRows } from '../../components/ui/Page'
import { Donut, Legend } from '../../components/ui/Charts'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { STATUS, BRAND, BRAND_ON } from '../../lib/status'
import type { StatusKey, BrandKey } from '../../lib/status'
import { getBusinessToday, toBs, formatBs, formatAd } from '../../lib/bs'
import { useTabularLayout } from '../../lib/device'
import {
  CHANNELS,
  CHANNEL_LABEL,
  CHANNEL_ICON,
  CHANNEL_STATE_TONE,
  CHANNEL_STATE_ICON,
  CHANNEL_SLICES,
  CHANNEL_VOLUME,
  QUEUE,
  QUEUE_ROWS,
  IN_FLIGHT,
  TOTAL_HANDLED,
  RESOLVED,
  DELIVERY_SLICES,
  DELIVERY_RATE,
  FAILED_RATE,
  READ_RATE,
  CLICK_RATE,
  pct,
  TODAY_SENT,
  FAILED_TODAY,
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  MEASURED_TEMPLATES,
  templateCount,
  VARIABLES,
  AUTOMATION_RULES,
  STRANDED_RULES,
  TIMELINE,
  DELIVERY_TONE,
  DELIVERY_ICON,
  ALERTS,
  ACTIVITY,
  INSIGHTS,
  QUICK_ACTIONS,
  SEED_ERRORS,
} from '../../data/communicationSettings'
import type { Dest, Channel, Template, TemplateCategory } from '../../data/communicationSettings'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/**
 * **Administration ▸ Communication Settings** — built against
 * `03 Core Modules/Settings/Communication Settings.PNG` and its v3.0 spec.
 *
 * The render's card set and ordering are kept: six KPI tiles, then
 * Communication Channels beside Delivery Overview, then Notification Templates
 * beside the Delivery Queue / Automation Rules stack, then Communication
 * Analytics beside Channel Usage, then the full-width Communication Timeline,
 * with Communication Summary · Alerts · Quick Actions · Recent Activity · AI
 * Communication Assistant down the rail.
 *
 * Every count, rate and slice comes from `data/communicationSettings`'s single
 * `QUEUE` primitive, which is what resolves the render disagreeing with itself
 * three separate times (see that file's header). The three headline departures
 * visible here:
 *
 *  1. **"Customer" is gone.** The render's fifth template category and its
 *     activity feed both use it; the word is banned in UI text. They are
 *     clients, and the recipients in the timeline are read out of
 *     `data/clients` so the screen cannot address one who does not exist.
 *  2. **Unprovisioned channels say so.** The render paints all five tiles
 *     `Active · Connected`. WhatsApp and Push have no credentials in this
 *     build, so their tiles read Disconnected and their configure controls are
 *     visibly inert with the reason attached — never a live-looking button over
 *     nothing.
 *  3. **No sparklines.** The render draws one under each analytics tile. No
 *     daily series exists here and inventing twelve points per metric is
 *     inventing figures.
 *
 * No figure on this screen is money, so §8.3 has nothing to omit.
 */

/* ── style atoms ───────────────────────────────────────────────────────── */

const th: CSSProperties = {
  textAlign: 'left',
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
}

const td: CSSProperties = {
  padding: '10px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--border)',
}

const controlStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 32,
  padding: '0 12px',
  borderRadius: 'var(--r-btn)',
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  textDecoration: 'none',
  fontFamily: 'inherit',
  cursor: 'pointer',
  flexShrink: 0,
}

/** §4.2 — colour is never the sole carrier. Icon + label, always. */
function ToneChip({ tone, icon, children }: { tone: StatusKey; icon: IconName; children: ReactNode }) {
  const t = STATUS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
        padding: '2px 8px',
        borderRadius: 'var(--r-badge)',
        background: t.bg,
        color: t.fg,
        border: t.border ? `1px solid ${t.border}` : '1px solid transparent',
        fontSize: 'var(--t-th)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={icon} size={12} fill />
      {children}
    </span>
  )
}

function Unavailable({ why }: { why: string }) {
  return (
    <span
      title={why}
      style={{
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        color: 'var(--muted)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--r-badge)',
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      Unavailable
    </span>
  )
}

function DestControl({ dest, children, style }: { dest: Dest; children: ReactNode; style: CSSProperties }) {
  if (dest.kind === 'route') {
    return (
      <Link to={dest.to} style={style}>
        {children}
      </Link>
    )
  }
  return (
    <span
      aria-disabled="true"
      title={dest.why}
      style={{ ...style, cursor: 'not-allowed', color: 'var(--muted)', background: 'transparent', borderStyle: 'dashed' }}
    >
      {children}
    </span>
  )
}

/** A row of channel glyphs — the render's "Email, SMS, WhatsApp" column. */
function ChannelPips({ channels }: { channels: Channel[] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {channels.map((c) => (
        <span
          key={c}
          title={CHANNEL_LABEL[c]}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 'var(--t-th)', color: 'var(--text2)' }}
        >
          <Icon name={CHANNEL_ICON[c]} size={12} />
          {CHANNEL_LABEL[c]}
        </span>
      ))}
    </span>
  )
}

/* ── KPI tile ──────────────────────────────────────────────────────────── */

interface Tile {
  label: string
  value: string
  icon: IconName
  accent: BrandKey
  note: string
  delta?: { direction: 'up' | 'down'; text: string; good: boolean }
}

function KpiCard({ k }: { k: Tile }) {
  return (
    <article className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 'var(--r-sm)',
            background: BRAND[k.accent],
            color: BRAND_ON[k.accent],
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={k.icon} size={16} fill />
        </span>
        <div
          style={{
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            color: 'var(--text2)',
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {k.label}
        </div>
      </div>

      <div
        className="kpi-value"
        style={{
          marginTop: 9,
          fontSize: 'clamp(16px, 1.4vw, 22px)',
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {k.value}
      </div>

      <div style={{ marginTop: 6, fontSize: 'var(--t-th)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {k.delta && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontWeight: 700,
              color: k.delta.good ? 'var(--success-text)' : 'var(--danger-text)',
            }}
          >
            <Icon name={k.delta.direction === 'up' ? 'arrow_up' : 'arrow_down'} size={11} fill />
            {k.delta.text}
          </span>
        )}
        <span style={{ color: 'var(--muted)' }}>{k.note}</span>
      </div>
    </article>
  )
}

/* ── export ────────────────────────────────────────────────────────────── */

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportLogs() {
  const rows: string[][] = [['Section', 'Item', 'Detail', 'Value']]
  for (const c of CHANNELS) rows.push(['Channel', c.label, `${c.transport} · ${c.meta}`, c.state])
  for (const q of QUEUE_ROWS) rows.push(['Delivery queue', q.state, q.note, String(q.count)])
  for (const c of CHANNEL_SLICES) rows.push(['Channel usage', c.label, c.percent, c.display])
  for (const t of TEMPLATES) {
    rows.push([
      `Template · ${t.category}`,
      t.name,
      t.channels.map((c) => CHANNEL_LABEL[c]).join(' / '),
      t.usage === null ? 'Not measured' : String(t.usage),
    ])
  }
  for (const r of AUTOMATION_RULES) rows.push(['Automation', r.name, `${r.trigger} → ${r.template}`, r.active ? 'Active' : 'Paused'])
  for (const m of TIMELINE) rows.push(['Timeline', CHANNEL_LABEL[m.channel], `${m.who} · ${m.to} · ${m.subject}`, `${m.status} · ${m.ago}`])
  downloadCsv('babin-communication-logs.csv', rows)
}

/* ── channels card ─────────────────────────────────────────────────────── */

function ChannelsCard() {
  return (
    <Card
      title="Communication Channels"
      action={
        <Link to="/notifications" style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}>
          Notification Center
          <Icon name="arrow_right" size={12} />
        </Link>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(178px, 1fr))', gap: 10 }}>
        {CHANNELS.map((c) => (
          <section
            key={c.key}
            style={{ ...cardStyle, background: 'var(--card2)', padding: '12px 12px 11px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 'var(--r-sm)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  background: 'var(--nav-active-bg)',
                  color: 'var(--nav-active-accent)',
                }}
              >
                <Icon name={c.icon} size={16} fill />
              </span>
              <span style={{ minWidth: 0, flex: 1, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{c.label}</span>
            </div>

            <ToneChip tone={CHANNEL_STATE_TONE[c.state]} icon={CHANNEL_STATE_ICON[c.state]}>
              {c.state}
            </ToneChip>

            <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', lineHeight: 1.45 }}>{c.transport}</span>
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45, flex: 1 }}>{c.meta}</span>

            <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              {CHANNEL_VOLUME[c.key].toLocaleString('en-IN')} sent · {pct(CHANNEL_VOLUME[c.key], TOTAL_HANDLED)}
            </span>

            <DestControl dest={c.dest} style={{ ...controlStyle, height: 28, width: '100%', justifyContent: 'center', fontSize: 'var(--t-th)' }}>
              {c.dest.kind === 'none' ? (
                <>
                  Configure
                  <Unavailable why={c.dest.why} />
                </>
              ) : (
                <>
                  Configure
                  <Icon name="arrow_right" size={12} />
                </>
              )}
            </DestControl>
          </section>
        ))}
      </div>
    </Card>
  )
}

/* ── templates card ────────────────────────────────────────────────────── */

const TEMPLATE_WRITE_WHY =
  'Editing or creating a template is a write against the message library. No backend is connected in this build, so the library can be read and exported but not changed.'

function TemplatesCard() {
  const [tab, setTab] = useState<TemplateCategory | 'All'>('All')
  const [showAll, setShowAll] = useState(false)

  const rows: Template[] = useMemo(
    () => (tab === 'All' ? TEMPLATES : TEMPLATES.filter((t) => t.category === tab)),
    [tab],
  )
  const shown = showAll ? rows : rows.slice(0, 8)
  const tabs: Array<TemplateCategory | 'All'> = ['All', ...TEMPLATE_CATEGORIES]

  return (
    <Card
      title="Notification Templates"
      action={
        <span
          aria-disabled="true"
          title={TEMPLATE_WRITE_WHY}
          style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)', cursor: 'not-allowed', color: 'var(--muted)', borderStyle: 'dashed' }}
        >
          <Icon name="plus" size={12} />
          New Template
          <Unavailable why={TEMPLATE_WRITE_WHY} />
        </span>
      }
    >
      <div role="tablist" aria-label="Template categories" style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap', marginBottom: 'var(--sp-md)' }}>
        {tabs.map((t) => {
          const on = t === tab
          return (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => {
                setTab(t)
                setShowAll(false)
              }}
              style={{
                height: 28,
                padding: '0 11px',
                borderRadius: 'var(--r-btn)',
                border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: on ? 'var(--nav-active-bg)' : 'transparent',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-th)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t} ({templateCount(t)})
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<Icon name="file" size={24} />} title="No templates in this category" description="Nothing is seeded here." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Template Name</th>
                <th style={th}>Category</th>
                <th style={th}>Channels</th>
                <th style={{ ...th, textAlign: 'right' }}>Sent this month</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{t.name}</td>
                  <td style={td}>{t.category}</td>
                  <td style={td}>
                    <ChannelPips channels={t.channels} />
                  </td>
                  <td className="figure" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {t.usage === null ? (
                      <span title="No send count was supplied for this template in this build." style={{ color: 'var(--muted)' }}>
                        —
                      </span>
                    ) : (
                      t.usage.toLocaleString('en-IN')
                    )}
                  </td>
                  <td style={td}>
                    {t.active ? (
                      <ToneChip tone="in" icon="check">
                        Active
                      </ToneChip>
                    ) : (
                      <ToneChip tone="neutral" icon="dot">
                        Paused
                      </ToneChip>
                    )}
                  </td>
                  <td style={td}>
                    <span
                      aria-disabled="true"
                      title={TEMPLATE_WRITE_WHY}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--muted)', fontSize: 'var(--t-th)', fontWeight: 600 }}
                    >
                      <Icon name="file" size={13} />
                      Edit
                      <Unavailable why={TEMPLATE_WRITE_WHY} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'var(--sp-md)', flexWrap: 'wrap' }}>
        {rows.length > 8 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} style={controlStyle}>
            {showAll ? 'Show first 8' : `View all ${rows.length} templates`}
            <Icon name={showAll ? 'chevron_up' : 'chevron_down'} size={13} />
          </button>
        )}
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5, flex: 1, minWidth: 220 }}>
          {MEASURED_TEMPLATES} of {TEMPLATES.length} templates carry a measured send count. A dash means nobody supplied one — it
          is not a zero.
        </span>
      </div>

      <div style={{ marginTop: 'var(--sp-md)', paddingTop: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>
          Variables every template may use
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {VARIABLES.map((v) => (
            <span
              key={v}
              className="identifier"
              style={{
                padding: '2px 7px',
                borderRadius: 'var(--r-badge)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                fontSize: 'var(--t-th)',
                color: 'var(--text2)',
              }}
            >
              {v}
            </span>
          ))}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          Pickup and return each carry a BS and an AD variable, and both are rendered from the Date Engine at send time — a BS
          date is never stored in a template body.
        </p>
      </div>
    </Card>
  )
}

/* ── queue + automation ────────────────────────────────────────────────── */

function DeliveryQueueCard() {
  return (
    <Card
      title="Delivery Queue"
      action={
        <Link to="/notifications/sms" style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}>
          SMS log
          <Icon name="arrow_right" size={12} />
        </Link>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {QUEUE_ROWS.map((q) => (
          <div key={q.state} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <Icon name="dot" size={9} style={{ color: STATUS[q.tone].fg, flexShrink: 0 }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{q.state}</span>
              <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{q.note}</span>
            </span>
            <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              {q.count.toLocaleString('en-IN')}
            </span>
          </div>
        ))}
      </div>
      <p style={{ margin: '10px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
        Read is a subset of Delivered, not a state beside it, so the six rows do not sum to the total. {RESOLVED.toLocaleString('en-IN')}{' '}
        messages have reached an outcome and {IN_FLIGHT} are still moving.
      </p>
    </Card>
  )
}

const RULE_WRITE_WHY =
  'Adding or pausing an automation rule is a write against the rules engine. Open Automation Center to see the rules that exist; changing one needs a backend this build does not have.'

function AutomationCard() {
  return (
    <Card
      title="Automation Rules"
      action={
        <Link to="/automation" style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}>
          Automation Center
          <Icon name="arrow_right" size={12} />
        </Link>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {AUTOMATION_RULES.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
              <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                {r.trigger} → {r.template}
              </span>
              <span style={{ display: 'block', marginTop: 3 }}>
                <ChannelPips channels={r.channels} />
              </span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--sp-xs)', flexShrink: 0 }}>
              {r.active ? (
                <ToneChip tone="in" icon="check">
                  Active
                </ToneChip>
              ) : (
                <ToneChip tone="neutral" icon="dot">
                  Paused
                </ToneChip>
              )}
              {STRANDED_RULES.some((s) => s.id === r.id) && (
                <ToneChip tone="danger" icon="plug">
                  No transport
                </ToneChip>
              )}
            </span>
          </div>
        ))}
      </div>
      {STRANDED_RULES.length > 0 && (
        <p style={{ margin: '10px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          {STRANDED_RULES.length} of these rules name a channel that has no transport behind it in this build. They are marked
          rather than quietly re-routed — a rule that sends somewhere the operator did not choose is worse than one that does not
          send.
        </p>
      )}
      <span
        aria-disabled="true"
        title={RULE_WRITE_WHY}
        style={{ ...controlStyle, marginTop: 10, width: '100%', justifyContent: 'center', cursor: 'not-allowed', color: 'var(--muted)', borderStyle: 'dashed' }}
      >
        <Icon name="plus" size={13} />
        Add Rule
        <Unavailable why={RULE_WRITE_WHY} />
      </span>
    </Card>
  )
}

/* ── analytics ─────────────────────────────────────────────────────────── */

function StatTile({ label, value, note, tone }: { label: string; value: string; note: string; tone: StatusKey }) {
  return (
    <div style={{ ...cardStyle, background: 'var(--card2)', padding: '12px 13px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>
        <Icon name="chart" size={12} style={{ color: STATUS[tone].fg }} />
        {label}
      </div>
      <div className="figure" style={{ marginTop: 7, fontSize: 'clamp(16px, 1.3vw, 21px)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ marginTop: 'var(--sp-xs)', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>{note}</div>
    </div>
  )
}

/* ── panes ─────────────────────────────────────────────────────────────── */

/** The main column, exported so Settings can mount this screen as a pane. */
export function CommunicationPane() {
  const kpis: Tile[] = [
    ...TODAY_SENT.map(
      (t): Tile => ({
        label: `${CHANNEL_LABEL[t.channel]} Sent Today`,
        value: t.sent.toLocaleString('en-IN'),
        icon: CHANNEL_ICON[t.channel],
        accent: 'primary',
        note: 'vs yesterday',
        delta: { direction: t.deltaPercent >= 0 ? 'up' : 'down', text: `${Math.abs(t.deltaPercent)}%`, good: t.deltaPercent >= 0 },
      }),
    ),
    {
      label: 'Delivery Success Rate',
      value: DELIVERY_RATE,
      icon: 'check',
      accent: 'success',
      note: `of ${RESOLVED.toLocaleString('en-IN')} resolved this month`,
    },
    {
      label: 'Failed Messages',
      value: FAILED_TODAY.count.toLocaleString('en-IN'),
      icon: 'alert_triangle',
      accent: 'danger',
      note: `today · ${QUEUE.failed.toLocaleString('en-IN')} this month`,
      delta: {
        direction: FAILED_TODAY.deltaPercent >= 0 ? 'up' : 'down',
        text: `${Math.abs(FAILED_TODAY.deltaPercent)}%`,
        good: FAILED_TODAY.deltaPercent < 0,
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      {SEED_ERRORS.length > 0 && (
        <ErrorBanner
          title="Seed data does not reconcile"
          message={
            <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
              {SEED_ERRORS.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          }
        />
      )}

      <section
        aria-label="Key figures"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 'var(--sp-md)' }}
      >
        {kpis.map((k) => (
          <KpiCard key={k.label} k={k} />
        ))}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <ChannelsCard />
        <Card
          title="Delivery Overview"
          action={
            <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              This month
            </span>
          }
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Donut slices={DELIVERY_SLICES} centreLabel="Handled" centreValue={TOTAL_HANDLED.toLocaleString('en-IN')} size={140} />
            <Legend slices={DELIVERY_SLICES} />
          </div>
          <p style={{ margin: '11px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
            Three disjoint outcomes that sum to everything handled. Success rate ({DELIVERY_RATE}) is measured against the{' '}
            {RESOLVED.toLocaleString('en-IN')} that have finished, not against the whole ring.
          </p>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <TemplatesCard />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <DeliveryQueueCard />
          <AutomationCard />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <Card
          title="Communication Analytics"
          action={
            <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              This month
            </span>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <StatTile label="Delivery Rate" value={DELIVERY_RATE} note={`${QUEUE.delivered.toLocaleString('en-IN')} of ${RESOLVED.toLocaleString('en-IN')} resolved`} tone="in" />
            <StatTile label="Read Rate" value={READ_RATE} note={`${QUEUE.read.toLocaleString('en-IN')} of ${QUEUE.delivered.toLocaleString('en-IN')} delivered`} tone="primary" />
            <StatTile label="Click Rate" value={CLICK_RATE} note={`${QUEUE.clicked.toLocaleString('en-IN')} of ${QUEUE.delivered.toLocaleString('en-IN')} delivered`} tone="progress" />
            <StatTile label="Failed Rate" value={FAILED_RATE} note={`${QUEUE.failed.toLocaleString('en-IN')} of ${RESOLVED.toLocaleString('en-IN')} resolved`} tone="danger" />
          </div>
          <p style={{ margin: '11px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
            Each tile names its own denominator, which is what stops a read rate and a delivery rate being compared as if they
            measured the same pool. The render draws a sparkline under each of these; no daily series exists in this build and one
            would have to be invented.
          </p>
        </Card>

        <Card title="Channel Usage">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Donut slices={CHANNEL_SLICES} centreLabel="Messages" centreValue={TOTAL_HANDLED.toLocaleString('en-IN')} size={140} />
            <Legend slices={CHANNEL_SLICES} />
          </div>
        </Card>
      </div>

      <Card
        title="Communication Timeline"
        action={
          <Link to="/admin/audit" style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}>
            Activity log
            <Icon name="arrow_right" size={12} />
          </Link>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Channel</th>
                <th style={th}>To / From</th>
                <th style={th}>Subject / Message</th>
                <th style={th}>Status</th>
                <th style={th}>Time</th>
                <th style={th}>Related to</th>
              </tr>
            </thead>
            <tbody>
              {TIMELINE.map((m) => (
                <tr key={m.id}>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name={CHANNEL_ICON[m.channel]} size={14} style={{ color: 'var(--muted)' }} />
                      {CHANNEL_LABEL[m.channel]}
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{m.who}</span>
                    <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      {m.to}
                    </span>
                  </td>
                  <td style={td}>{m.subject}</td>
                  <td style={td}>
                    <ToneChip tone={DELIVERY_TONE[m.status]} icon={DELIVERY_ICON[m.status]}>
                      {m.status}
                    </ToneChip>
                  </td>
                  <td className="figure" style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                    {m.ago}
                  </td>
                  <td style={td}>
                    <DestControl
                      dest={m.dest}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 'var(--t-th)',
                        fontWeight: 700,
                        color: 'var(--link)',
                        textDecoration: 'none',
                      }}
                    >
                      <span className="identifier">{m.related}</span>
                      {m.dest.kind === 'none' ? <Unavailable why={m.dest.why} /> : <Icon name="arrow_right" size={12} />}
                    </DestControl>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '11px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          Recipients and booking numbers are read out of the client records, so this screen cannot address a client who does not
          exist or link to a booking that was never made.
        </p>
      </Card>
    </div>
  )
}

/** The rail, exported for the same reason as the pane. */
export function CommunicationRail() {
  const summary = [
    { label: 'Total Handled', value: TOTAL_HANDLED.toLocaleString('en-IN') },
    { label: 'Delivered', value: `${QUEUE.delivered.toLocaleString('en-IN')} · ${pct(QUEUE.delivered, TOTAL_HANDLED)}` },
    { label: 'Failed', value: `${QUEUE.failed.toLocaleString('en-IN')} · ${pct(QUEUE.failed, TOTAL_HANDLED)}` },
    { label: 'In Queue', value: String(IN_FLIGHT) },
    { label: 'Read Rate', value: READ_RATE },
    { label: 'Click Rate', value: CLICK_RATE },
  ]

  return (
    <>
      <Card
        title="Communication Summary"
        action={
          <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            This month
          </span>
        }
      >
        <SummaryRows rows={summary} />
      </Card>

      <Card title="Alerts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALERTS.map((a) => (
            <DestControl
              key={a.id}
              dest={a.dest}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                width: '100%',
                padding: '8px 9px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontWeight: 500,
                fontFamily: 'inherit',
                textAlign: 'left',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon name={a.icon} size={14} style={{ color: STATUS[a.tone].fg, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{a.text}</span>
              <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {a.meta}
              </span>
              {a.dest.kind === 'none' && <Unavailable why={a.dest.why} />}
            </DestControl>
          ))}
        </div>
      </Card>

      <Card title="Quick Actions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {QUICK_ACTIONS.map((q) => (
            <DestControl
              key={q.label}
              dest={q.dest}
              style={{ ...controlStyle, height: 34, width: '100%', justifyContent: 'flex-start', gap: 'var(--sp-sm)', background: 'var(--card2)' }}
            >
              <Icon name={q.icon} size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.label}</span>
              {q.dest.kind === 'none' ? <Unavailable why={q.dest.why} /> : <Icon name="chevron_right" size={13} />}
            </DestControl>
          ))}
          <button
            type="button"
            onClick={exportLogs}
            style={{ ...controlStyle, height: 34, width: '100%', justifyContent: 'flex-start', gap: 'var(--sp-sm)', background: 'var(--card2)' }}
          >
            <Icon name="download" size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: 'left' }}>Export Logs</span>
            <Icon name="chevron_right" size={13} style={{ color: 'var(--muted)' }} />
          </button>
        </div>
      </Card>

      <Card title="Recent Activity">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ACTIVITY.map((a) => (
            <div key={a.what + a.ago} style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
              <Icon name={a.icon} size={14} style={{ color: STATUS[a.tone].fg, flexShrink: 0, marginTop: 2 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.what}</span>
                <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{a.detail}</span>
              </span>
              <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {a.ago}
              </span>
            </div>
          ))}
          <Link to="/admin/audit" style={{ ...controlStyle, justifyContent: 'center', width: '100%', marginTop: 2 }}>
            View all activity
            <Icon name="arrow_right" size={13} />
          </Link>
        </div>
      </Card>

      <Card title="AI Communication Assistant">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {INSIGHTS.map((i) => (
            <div key={i.text} style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
              <Icon name={i.icon} size={14} style={{ color: STATUS[i.tone].fg, flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', lineHeight: 1.5 }}>{i.text}</span>
            </div>
          ))}
        </div>
        <Link to="/ai" style={{ ...controlStyle, justifyContent: 'center', width: '100%', marginTop: 11 }}>
          <Icon name="sparkles" size={13} />
          Ask the AI Assistant
        </Link>
        <p style={{ margin: '9px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          Each line states something these counts can prove. The render puts a prompt box here; the assistant lives on its own
          screen, so this opens that rather than pretending to answer in the rail.
        </p>
      </Card>
    </>
  )
}

/* ── page ──────────────────────────────────────────────────────────────── */

export default function CommunicationSettings() {
  const tabular = useTabularLayout()
  const bs = toBs(TODAY)
  const asOf = `${bs ? formatBs(bs) : 'BS date unavailable'} · ${formatAd(TODAY)}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="mail"
        title="Communication Settings"
        description="Manage communication channels, templates, automation, notifications and delivery performance."
        actions={
          <>
            <Link to="/admin/audit" style={{ ...controlStyle, height: 34 }}>
              <Icon name="checklist" size={14} />
              Logs
            </Link>
            <Link to="/automation" style={{ ...controlStyle, height: 34 }}>
              <Icon name="automation" size={14} />
              Automation
            </Link>
            <Link to="/settings?tab=communication" style={{ ...controlStyle, height: 34 }}>
              <Icon name="settings" size={14} />
              Settings
            </Link>
            <Button icon="download" onClick={exportLogs}>
              Export Logs
            </Button>
            <Link
              to="/notifications"
              style={{
                ...controlStyle,
                height: 34,
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-fg)',
                border: '1px solid transparent',
              }}
            >
              <Icon name="plus" size={14} />
              New Message
            </Link>
          </>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: tabular ? 'minmax(0,1fr) 288px' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <CommunicationPane />
        <Rail>
          <CommunicationRail />
        </Rail>
      </div>

      <FooterNote
        extra={[
          `Data as of ${asOf}`,
          'Every message sent, edited, cancelled or retried is recorded in the Activity Log',
          `${CHANNELS.filter((c) => c.state === 'Connected' || c.state === 'Enabled').length} of ${CHANNELS.length} channels are live`,
        ]}
      />
    </div>
  )
}
