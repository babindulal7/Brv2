import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle, SummaryRows } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { STATUS, BRAND, BRAND_ON } from '../../lib/status'
import type { StatusKey, BrandKey } from '../../lib/status'
import { TODAY, toBs, formatBs, formatAd, isWeekend } from '../../lib/bs'
import { useTabularLayout } from '../../lib/device'
import {
  // clock
  at,
  spanLabel,
  spanMinutes,
  hoursLabel,
  // hours
  HOURS,
  COMPANY_HOURS,
  COMPANY_WEEK,
  WEEK,
  WEEK_COLUMNS,
  FACILITY_SHORT,
  FACILITY_LABEL,
  // policy
  PICKUP_RETURN,
  GRACE_MINUTES,
  // shifts
  SHIFTS,
  overlaps,
  overlappingNames,
  // calendar
  EXCEPTIONS,
  exceptionDays,
  bsShort,
  bsAdLabel,
  KIND_LABEL,
  KIND_TONE,
  KIND_ICON,
  MONTH_DAYS,
  MONTH_LABEL,
  MONTH_AD_LABEL,
  MONTH_STEP_WHY,
  CALENDAR_VIEWS,
  // scopes
  SCOPES,
  BRANCH_ROWS,
  WAREHOUSE_ROWS,
  COUNTER_ROWS,
  OVERRIDE_WHY,
  // year + rail
  YEAR,
  WORKING_DAYS,
  CLOSURE_DAYS,
  CALENDAR_SUMMARY,
  alertsFor,
  ACTIVITY,
  insightsFor,
  upcomingOf,
  upcomingDaysOf,
  SEED_ERRORS,
  TO,
} from '../../data/businessHours'
import type { Dest, Hours, Shift, CalException, ExceptionKind, Scope, CalendarView, ScopeRow } from '../../data/businessHours'
import { BRANCHES, totalsOf } from '../../data/settings'

/**
 * **Administration ▸ Business Hours & Holidays** — built against
 * `03 Core Modules/Settings/Business Hours.PNG` and its v3.0 spec.
 *
 * The render's card set, ordering and density are kept: five KPI tiles, then
 * Business Hours beside the Holiday Calendar, then Shift Management ·
 * Pickup & Return Windows · Special Days across the bottom, with Calendar
 * Summary · Alerts · Quick Actions · Recent Activity · AI Scheduling Insights
 * down the rail.
 *
 * Everything printed is derived from `data/businessHours`. See that file's
 * header for the full list of deviations; the two that show most here:
 *
 *  1. **The calendar is Shrawan 2083, and it cannot be stepped.** `lib/bs`
 *     carries one month table and `toBs()` returns null outside it. The render
 *     shows "May 2082 (Baisakh / Jestha)" with three mutually contradictory
 *     numbers per cell. Two lines — BS day over AD day, both from the engine —
 *     is the only rendering that cannot drift, and the ‹ › controls render
 *     visibly unavailable with the reason attached rather than producing a
 *     month this build cannot vouch for.
 *  2. **`Add Holiday` and `Add Shift` are real.** They open validating modals
 *     and append to session state, which the calendar, the KPI tiles, the rail
 *     summary and both exports all re-derive from. The modal states plainly
 *     that the row lives for the session only.
 *
 * Money never appears on this screen, so there is nothing for §8.3 to omit.
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
        gap: 4,
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

/** States *that* something is unavailable; `title` states why. Never `href="#"`. */
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

/** A header button with nowhere to go — inert, dashed, and it says why. */
function InertButton({ icon, label, why }: { icon: IconName; label: string; why: string }) {
  return (
    <span
      aria-disabled="true"
      title={why}
      style={{ ...controlStyle, height: 34, cursor: 'not-allowed', color: 'var(--muted)', borderStyle: 'dashed' }}
    >
      <Icon name={icon} size={13} />
      {label}
      <Unavailable why={why} />
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
  linkLabel: string
  dest?: Dest
  onAction?: () => void
}

const linkStyle: CSSProperties = {
  marginTop: 9,
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--link)',
  textDecoration: 'none',
  cursor: 'pointer',
}

function KpiCard({ k }: { k: Tile }) {
  return (
    <article className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
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
          fontSize: k.value.length > 8 ? 'clamp(15px, 1.0vw, 19px)' : 'clamp(16px, 1.4vw, 22px)',
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

      <div style={{ marginTop: 6, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{k.note}</div>

      {k.dest ? (
        <DestControl dest={k.dest} style={linkStyle}>
          {k.linkLabel}
          {k.dest.kind === 'none' ? <Unavailable why={k.dest.why} /> : <Icon name="arrow_right" size={12} />}
        </DestControl>
      ) : (
        <button type="button" onClick={k.onAction} style={linkStyle}>
          {k.linkLabel}
          <Icon name="arrow_right" size={12} />
        </button>
      )}
    </article>
  )
}

/* ── exports ───────────────────────────────────────────────────────────── */

function download(filename: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
}

/** `20260802` — the DATE form an all-day VEVENT takes. */
function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

function icsFor(rows: CalException[]): string {
  const stamp = `${icsDate(TODAY)}T000000Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Babin Rentals OS//Business Hours//EN',
    'CALSCALE:GREGORIAN',
  ]
  for (const e of rows) {
    /* DTEND on an all-day VEVENT is exclusive, so a one-day event ends the next day. */
    const end = new Date(e.to.getTime() + 86_400_000)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@babin-rentals-os`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.from)}`,
      `DTEND;VALUE=DATE:${icsDate(end)}`,
      `SUMMARY:${e.name} (${KIND_LABEL[e.kind]})`,
      `DESCRIPTION:${e.scope} — ${spanLabel(e.hours)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/* ── Business Hours card ───────────────────────────────────────────────── */

function ScopeTable({ rows }: { rows: ScopeRow[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Hours</th>
            <th style={th}>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>
                <span style={{ display: 'block', fontWeight: 600 }}>{r.name}</span>
                <span className="identifier" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  {r.code} · {r.meta}
                </span>
              </td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                <span className="figure" style={{ fontWeight: 600 }}>
                  {spanLabel(r.hours)}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{hoursLabel(r.hours)}</span>
              </td>
              <td style={td}>
                {r.override === null ? (
                  <span title={OVERRIDE_WHY} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <ToneChip tone="neutral" icon="dot">
                      Inherits company
                    </ToneChip>
                  </span>
                ) : (
                  <ToneChip tone="primary" icon="check">
                    Override set
                  </ToneChip>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: '10px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>{OVERRIDE_WHY}</p>
    </div>
  )
}

function BusinessHoursCard() {
  const [scope, setScope] = useState<Scope>('Company')

  return (
    <Card
      title="Business Hours"
      action={
        <span
          aria-disabled="true"
          title={OVERRIDE_WHY}
          style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)', cursor: 'not-allowed', color: 'var(--muted)', borderStyle: 'dashed' }}
        >
          <Icon name="settings" size={12} />
          Configure
          <Unavailable why={OVERRIDE_WHY} />
        </span>
      }
    >
      <div role="tablist" aria-label="Business hours scope" style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {SCOPES.map((s) => {
          const on = s === scope
          return (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setScope(s)}
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
              {s}
            </button>
          )
        })}
      </div>

      {scope === 'Company' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Company Default Hours</span>
            <ToneChip tone="in" icon="check">
              Active
            </ToneChip>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {COMPANY_HOURS.map((f) => (
              <div
                key={f.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <Icon name={f.icon} size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{f.label}</span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                    {spanLabel(f.hours)}
                  </span>
                  {f.hours !== 'always' && f.hours !== 'closed' && f.hours.close <= f.hours.open && (
                    <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>(Next Day)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : scope === 'Branches' ? (
        <ScopeTable rows={BRANCH_ROWS} />
      ) : scope === 'Warehouses' ? (
        <ScopeTable rows={WAREHOUSE_ROWS} />
      ) : (
        <ScopeTable rows={COUNTER_ROWS} />
      )}
    </Card>
  )
}

/* ── weekly schedule ───────────────────────────────────────────────────── */

function cellStyle(h: Hours): CSSProperties {
  return {
    ...td,
    whiteSpace: 'nowrap',
    color: h === 'closed' ? 'var(--muted)' : 'var(--text)',
    fontWeight: h === 'closed' ? 500 : 600,
  }
}

function WeeklySchedule() {
  return (
    <Card
      title="Weekly Schedule (Company)"
      action={
        <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          {formatAd(COMPANY_WEEK[0]?.date ?? TODAY)} – {formatAd(COMPANY_WEEK[6]?.date ?? TODAY)}
        </span>
      }
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>Day</th>
              {WEEK_COLUMNS.map((c) => (
                <th key={c} style={th}>
                  {FACILITY_SHORT[c]}
                </th>
              ))}
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {COMPANY_WEEK.map((d) => (
              <tr key={d.date.getTime()}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <Icon
                      name="dot"
                      size={9}
                      style={{ color: d.weeklyHoliday ? 'var(--muted)' : 'var(--primary)', flexShrink: 0 }}
                    />
                    <span style={{ fontWeight: 600 }}>{d.weekday}</span>
                  </span>
                  <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', marginLeft: 16 }}>
                    {bsShort(d.date)}
                  </span>
                </td>
                {WEEK_COLUMNS.map((c) => (
                  <td key={c} className="figure" style={cellStyle(d.hours[c])}>
                    {spanLabel(d.hours[c])}
                  </td>
                ))}
                <td style={td}>
                  {d.weeklyHoliday ? (
                    <ToneChip tone="neutral" icon="calendar_week">
                      Weekly Holiday
                    </ToneChip>
                  ) : (
                    <ToneChip tone="in" icon="check">
                      Open
                    </ToneChip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 9,
          marginTop: 12,
          padding: '10px 11px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--card2)',
        }}
      >
        <Icon name="info" size={15} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', lineHeight: 1.5 }}>
          Saturday is Nepal&rsquo;s weekly holiday and the office shuts; the warehouse and both counters stay open. The day is
          decided by <code>isWeekend</code> in the Date Engine, not by this table, so every screen agrees on which day it is.
        </span>
      </div>
    </Card>
  )
}

/* ── holiday calendar ──────────────────────────────────────────────────── */

function HolidayCalendar({ rows }: { rows: CalException[] }) {
  const [view, setView] = useState<CalendarView>('Month')
  const first = MONTH_DAYS[0]
  const lead = first ? first.getUTCDay() : 0

  const on = (d: Date): CalException[] => {
    const t = d.getTime()
    return rows.filter((e) => t >= e.from.getTime() && t <= e.to.getTime())
  }

  const legend: ExceptionKind[] = ['public', 'festival', 'maintenance', 'special']

  return (
    <Card
      title="Holiday Calendar"
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            aria-disabled="true"
            title={MONTH_STEP_WHY}
            style={{ ...controlStyle, height: 28, width: 28, padding: 0, justifyContent: 'center', cursor: 'not-allowed', color: 'var(--muted)', borderStyle: 'dashed' }}
          >
            <Icon name="chevron_left" size={14} />
          </span>
          <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            {MONTH_LABEL}
          </span>
          <span
            aria-disabled="true"
            title={MONTH_STEP_WHY}
            style={{ ...controlStyle, height: 28, width: 28, padding: 0, justifyContent: 'center', cursor: 'not-allowed', color: 'var(--muted)', borderStyle: 'dashed' }}
          >
            <Icon name="chevron_right" size={14} />
          </span>
          <span style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
            {CALENDAR_VIEWS.map((v) => {
              const active = v === view
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={active}
                  style={{
                    height: 28,
                    padding: '0 11px',
                    borderRadius: 'var(--r-btn)',
                    border: `1px solid ${active ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                    background: active ? 'var(--nav-active-bg)' : 'transparent',
                    color: active ? 'var(--nav-active-accent)' : 'var(--text2)',
                    fontSize: 'var(--t-th)',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {v}
                </button>
              )
            })}
          </span>
        </div>
      }
    >
      {view === 'List' ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.length === 0 ? (
            <EmptyState icon={<Icon name="calendar" size={24} />} title="No closures in this month" description="Nothing is gazetted or scheduled inside Shrawan 2083." />
          ) : (
            rows.map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <Icon name={KIND_ICON[e.kind]} size={15} style={{ color: STATUS[KIND_TONE[e.kind]].fg, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{e.name}</span>
                  <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {bsAdLabel(e.from)}
                    {exceptionDays(e) > 1 ? ` → ${bsAdLabel(e.to)}` : ''} · {e.scope}
                  </span>
                </span>
                <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', flexShrink: 0 }}>
                  {spanLabel(e.hours)}
                </span>
                <ToneChip tone={KIND_TONE[e.kind]} icon={KIND_ICON[e.kind]}>
                  {KIND_LABEL[e.kind]}
                </ToneChip>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 5, marginBottom: 6 }}>
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((w, i) => (
              <div
                key={w}
                style={{
                  textAlign: 'center',
                  fontSize: 'var(--t-th)',
                  fontWeight: 700,
                  color: i === 6 ? 'var(--text2)' : 'var(--muted)',
                }}
              >
                {w}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 5 }}>
            {view === 'Month' &&
              Array.from({ length: lead }, (_, i) => (
                <div key={`lead-${i}`} aria-hidden style={{ minHeight: 76, borderRadius: 8, background: 'var(--card2)', opacity: 0.4 }} />
              ))}
            {/* Week is the Sun–Sat week `lib/bs` generates, so it lines up under
                the same seven headers Month does — a ±3-day window around today
                would put Friday in the Sunday column. */}
            {(view === 'Month' ? MONTH_DAYS : WEEK).map(
              (d) => {
                const bs = toBs(d)
                const today = d.getTime() === TODAY.getTime()
                const marks = on(d)
                const sat = isWeekend(d)
                return (
                  <div
                    key={d.getTime()}
                    title={`${bs ? formatBs(bs) : ''} · ${formatAd(d)}`}
                    style={{
                      minHeight: 76,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      padding: 6,
                      borderRadius: 8,
                      background: today ? 'var(--nav-active-bg)' : 'var(--card)',
                      border: today ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
                      minWidth: 0,
                    }}
                  >
                    <span
                      className="figure"
                      style={{
                        fontSize: 'var(--t-ui)',
                        fontWeight: 700,
                        lineHeight: 1.1,
                        color: today ? 'var(--nav-active-accent)' : sat ? 'var(--text2)' : 'var(--text)',
                      }}
                    >
                      {bs ? bs.day : '—'}
                    </span>
                    <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.1 }}>
                      {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' })}
                    </span>
                    {marks.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        title={`${e.name} — ${e.scope}`}
                        style={{
                          display: 'block',
                          padding: '1px 5px',
                          borderRadius: 5,
                          background: STATUS[KIND_TONE[e.kind]].bg,
                          color: STATUS[KIND_TONE[e.kind]].fg,
                          fontSize: 'var(--t-th)',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {e.name}
                      </span>
                    ))}
                    {marks.length > 2 && (
                      <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                        +{marks.length - 2} more
                      </span>
                    )}
                  </div>
                )
              },
            )}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
        {legend.map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
            <Icon name={KIND_ICON[k]} size={12} style={{ color: STATUS[KIND_TONE[k]].fg }} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
          <Icon name="calendar_week" size={12} style={{ color: 'var(--muted)' }} />
          Weekly Holiday (Sat)
        </span>
      </div>

      <p style={{ margin: '10px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
        BS day above AD date. {MONTH_LABEL} · {MONTH_AD_LABEL} — {MONTH_DAYS.length} days. {MONTH_STEP_WHY}
      </p>
    </Card>
  )
}

/* ── shift management ──────────────────────────────────────────────────── */

function ShiftManagement({ rows, onAdd }: { rows: Shift[]; onAdd: () => void }) {
  /* Recomputed from the rows on screen, so a shift added in session is checked
     the same way the seeded five are. */
  const laps = useMemo(() => overlaps(rows), [rows])
  const lapping = useMemo(() => overlappingNames(laps), [laps])

  return (
    <Card
      title="Shift Management"
      action={
        <button type="button" onClick={onAdd} style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}>
          <Icon name="plus" size={12} />
          Add Shift
        </button>
      }
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              <th style={th}>Shift Name</th>
              <th style={th}>Time</th>
              <th style={th}>Break</th>
              <th style={th}>Departments</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td style={td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <Icon name="dot" size={9} style={{ color: s.active ? 'var(--primary)' : 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                  </span>
                  {lapping.has(s.name) && (
                    <span style={{ display: 'block', marginTop: 3, marginLeft: 16 }}>
                      <ToneChip tone="progress" icon="crew">
                        Overlapping cover
                      </ToneChip>
                    </span>
                  )}
                </td>
                <td className="figure" style={{ ...td, whiteSpace: 'nowrap' }}>
                  {spanLabel(s.span)}
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {Math.round(spanMinutes(s.span) / 60)}h
                    {s.span.close <= s.span.open ? ' · crosses midnight' : ''}
                  </span>
                </td>
                <td className="figure" style={td}>
                  {s.breakMinutes}m
                </td>
                <td style={td}>{s.departments.join(', ')}</td>
                <td style={td}>
                  {s.active ? (
                    <ToneChip tone="in" icon="check">
                      Active
                    </ToneChip>
                  ) : (
                    <ToneChip tone="neutral" icon="dot">
                      Inactive
                    </ToneChip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {laps.length > 0 && (
        <p style={{ margin: '11px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          {laps.map((o) => `${o.department} is covered twice in ${o.window} (${o.shifts.join(' + ')})`).join('. ')}. Whether a
          double cover is a rota or a mistake has not been ruled on, so this states the fact and never calls it a conflict.
        </p>
      )}
    </Card>
  )
}

/* ── special days ──────────────────────────────────────────────────────── */

function SpecialDays({ rows }: { rows: CalException[] }) {
  const [all, setAll] = useState(false)
  /* Upcoming first — a shutdown that has already happened is history, not a
     thing to plan around, so it never takes one of the four visible slots. */
  const ordered = useMemo(() => {
    const ahead = rows.filter((e) => e.to.getTime() >= TODAY.getTime())
    const behind = rows.filter((e) => e.to.getTime() < TODAY.getTime()).reverse()
    return [...ahead, ...behind]
  }, [rows])
  const shown = all ? ordered : ordered.slice(0, 4)

  return (
    <Card
      title="Special Days / Shutdowns"
      action={
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}
        >
          {all ? 'Show next 4' : `View all ${ordered.length}`}
          <Icon name={all ? 'chevron_up' : 'chevron_down'} size={12} />
        </button>
      }
    >
      {shown.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" size={24} />}
          title="No shutdowns scheduled"
          description="Nothing closes or runs reduced hours inside the month the Date Engine can name."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 9px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card2)',
              }}
            >
              <span
                style={{
                  width: 44,
                  flexShrink: 0,
                  textAlign: 'center',
                  padding: '5px 0',
                  borderRadius: 7,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
                  {bsShort(e.from)}
                </span>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.2 }}>
                  {formatAd(e.from)}
                </span>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{e.name}</span>
                <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{e.scope}</span>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  {e.hours === 'closed' ? 'Closed' : e.hours === 'always' ? 'All day' : spanLabel(e.hours)}
                  {exceptionDays(e) > 1 ? ` · ${exceptionDays(e)} days` : ''}
                  {e.blocksBooking ? ' · blocks booking' : ' · booking allowed'}
                </span>
              </span>
              <ToneChip tone={KIND_TONE[e.kind]} icon={KIND_ICON[e.kind]}>
                {KIND_LABEL[e.kind]}
              </ToneChip>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ── modals ────────────────────────────────────────────────────────────── */

const SESSION_NOTE =
  'This build has no backend. The row is added to this session only — reloading the page restores the seed.'

function fieldBox(): CSSProperties {
  return {
    height: 32,
    padding: '0 9px',
    borderRadius: 'var(--r-input)',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--text)',
    fontSize: 'var(--t-meta)',
    fontFamily: 'inherit',
    width: '100%',
  }
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...cardStyle,
          borderRadius: 'var(--r-modal)',
          boxShadow: 'var(--shadow-modal)',
          width: 'min(460px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ ...controlStyle, marginLeft: 'auto', width: 30, padding: 0, justifyContent: 'center' }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Errors({ list }: { list: string[] }) {
  if (list.length === 0) return null
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {list.map((e) => (
        <span key={e} style={{ fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
          {e}
        </span>
      ))}
    </div>
  )
}

function AddHolidayModal({ onClose, onAdd, existing }: { onClose: () => void; onAdd: (e: CalException) => void; existing: CalException[] }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ExceptionKind>('public')
  const [offset, setOffset] = useState(1)
  const [scope, setScope] = useState('All branches')
  const [touched, setTouched] = useState(false)

  const from = new Date(TODAY.getTime() + offset * 86_400_000)
  const bs = toBs(from)

  const errors: string[] = []
  if (!name.trim()) errors.push('A name is required.')
  else if (existing.some((e) => e.name.toLowerCase() === name.trim().toLowerCase())) errors.push(`"${name.trim()}" is already on the calendar.`)
  if (!bs) errors.push('That day falls outside Shrawan 2083, which is the only month the Date Engine can name.')
  if (!scope.trim()) errors.push('A scope is required.')

  const submit = () => {
    setTouched(true)
    if (errors.length > 0) return
    onAdd({
      id: `add-${Date.now()}`,
      name: name.trim(),
      kind,
      from,
      to: from,
      scope: scope.trim(),
      hours: kind === 'special' ? { open: at(6), close: at(14) } : 'closed',
      blocksBooking: kind !== 'special',
    })
    onClose()
  }

  return (
    <ModalShell title="Add holiday or shutdown" onClose={onClose}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Janai Purnima" style={fieldBox()} />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Kind</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as ExceptionKind)} style={fieldBox()}>
          {(['public', 'festival', 'maintenance', 'special'] as ExceptionKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Days from today</span>
        <input
          type="number"
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          style={fieldBox()}
        />
        <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          {bs ? `${formatBs(bs)} · ${formatAd(from)}` : `${formatAd(from)} — no BS date available`}
        </span>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Scope</span>
        <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="All branches" style={fieldBox()} />
      </label>

      {touched && <Errors list={errors} />}

      <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>{SESSION_NOTE}</p>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="plus" onClick={submit}>
          Add to calendar
        </Button>
      </div>
    </ModalShell>
  )
}

function AddShiftModal({ onClose, onAdd, existing }: { onClose: () => void; onAdd: (s: Shift) => void; existing: Shift[] }) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('06:00')
  const [end, setEnd] = useState('14:00')
  const [breakMinutes, setBreakMinutes] = useState(30)
  const [departments, setDepartments] = useState('Operations')
  const [touched, setTouched] = useState(false)

  const parse = (v: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
    if (!m) return null
    const h = Number(m[1])
    const min = Number(m[2])
    if (h > 23 || min > 59) return null
    return h * 60 + min
  }

  const openM = parse(start)
  const closeM = parse(end)

  const errors: string[] = []
  if (!name.trim()) errors.push('A shift name is required.')
  else if (existing.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())) errors.push(`"${name.trim()}" already exists.`)
  if (openM === null) errors.push('Start time must be HH:MM on a 24-hour clock.')
  if (closeM === null) errors.push('End time must be HH:MM on a 24-hour clock.')
  if (openM !== null && closeM !== null && openM === closeM) errors.push('A shift cannot start and end at the same minute.')
  if (!departments.trim()) errors.push('At least one department is required.')
  if (openM !== null && closeM !== null) {
    const length = closeM > openM ? closeM - openM : 1440 - openM + closeM
    if (breakMinutes >= length) errors.push('The break cannot be as long as the shift.')
  }

  const submit = () => {
    setTouched(true)
    if (errors.length > 0 || openM === null || closeM === null) return
    onAdd({
      id: `shift-${Date.now()}`,
      name: name.trim(),
      span: { open: openM, close: closeM },
      breakMinutes,
      departments: departments
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean),
      active: true,
    })
    onClose()
  }

  return (
    <ModalShell title="Add shift" onClose={onClose}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Shift name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Evening Shift" style={fieldBox()} />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Start (24h)</span>
          <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="06:00" style={fieldBox()} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>End (24h)</span>
          <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="14:00" style={fieldBox()} />
        </label>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Break (minutes)</span>
        <input type="number" value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} style={fieldBox()} />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Departments (comma separated)</span>
        <input value={departments} onChange={(e) => setDepartments(e.target.value)} placeholder="Warehouse, Operations" style={fieldBox()} />
      </label>

      {touched && <Errors list={errors} />}

      <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
        Departments are roster groups, not roles — the business 8 stay the only role names in the product. {SESSION_NOTE}
      </p>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="plus" onClick={submit}>
          Add shift
        </Button>
      </div>
    </ModalShell>
  )
}

/* ── panes ─────────────────────────────────────────────────────────────── */

/**
 * One object drives both halves of the screen, so the KPI tiles, the calendar,
 * the rail and the two exports can never be looking at different rows.
 */
export interface BusinessHoursState {
  exceptions: CalException[]
  shifts: Shift[]
  upcoming: CalException[]
  upcomingDays: number
  holidayOpen: boolean
  shiftOpen: boolean
  setHolidayOpen: (v: boolean) => void
  setShiftOpen: (v: boolean) => void
  openHoliday: () => void
  openShift: () => void
  addException: (e: CalException) => void
  addShift: (s: Shift) => void
  exportCsv: () => void
  exportIcs: () => void
}

/**
 * The main column, exported so **Settings can mount this screen as a pane**
 * without inheriting a second page header. See the file footer for the wiring.
 */
export function BusinessHoursPane({ state }: { state: BusinessHoursState }) {
  const totals = useMemo(() => totalsOf(BRANCHES), [])
  const activeShifts = state.shifts.filter((s) => s.active).length
  const monthClosures = state.exceptions.filter((e) =>
    MONTH_DAYS.some((d) => d.getTime() >= e.from.getTime() && d.getTime() <= e.to.getTime()),
  )

  const kpis: Tile[] = [
    {
      label: 'Active Branches',
      value: String(totals.activeBranches),
      icon: 'home',
      accent: 'primary',
      note: `of ${totals.branches} branches`,
      linkLabel: 'View all',
      dest: TO('/settings?tab=branches'),
    },
    {
      label: 'Business Hours (Company)',
      value: spanLabel(HOURS.warehouse),
      icon: 'timer',
      accent: 'primary',
      note: FACILITY_LABEL.warehouse,
      linkLabel: 'View hours',
      dest: TO('/inventory/warehouses'),
    },
    {
      label: 'Active Shifts',
      value: String(activeShifts),
      icon: 'crew',
      accent: 'progress',
      note: 'Shift schedules',
      linkLabel: 'View shifts',
      dest: TO('/operations/crew'),
    },
    {
      label: 'Closure Days (Year)',
      value: String(CLOSURE_DAYS),
      icon: 'calendar_due',
      accent: 'danger',
      note: `${YEAR.publicHolidays} public · ${YEAR.festivals} festivals · ${YEAR.maintenanceDays} shutdown`,
      linkLabel: 'View calendar',
      dest: TO('/calendar'),
    },
    {
      label: 'Upcoming Holidays',
      value: String(state.upcomingDays),
      icon: 'calendar_event',
      accent: 'success',
      note: `days in the next 30 · ${monthClosures.length} exceptions in ${MONTH_LABEL}`,
      linkLabel: 'View upcoming',
      dest: TO('/calendar'),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      {SEED_ERRORS.length > 0 && (
        <div
          role="alert"
          style={{ ...cardStyle, padding: 12, borderColor: 'var(--danger)', display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--danger-text)' }}>Seed data does not reconcile</strong>
          {SEED_ERRORS.map((e) => (
            <span key={e} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {e}
            </span>
          ))}
        </div>
      )}

      <section
        aria-label="Key figures"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(178px, 1fr))', gap: 'var(--sp-md)' }}
      >
        {kpis.map((k) => (
          <KpiCard key={k.label} k={k} />
        ))}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <BusinessHoursCard />
          <WeeklySchedule />
        </div>
        <HolidayCalendar rows={state.exceptions} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <ShiftManagement rows={state.shifts} onAdd={state.openShift} />
        <Card
          title="Pickup & Return Windows"
          action={
            <span
              aria-disabled="true"
              title={OVERRIDE_WHY}
              style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)', cursor: 'not-allowed', color: 'var(--muted)', borderStyle: 'dashed' }}
            >
              Edit
              <Unavailable why={OVERRIDE_WHY} />
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {PICKUP_RETURN.map((r) => (
              <div
                key={r.label}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}
              >
                <Icon name={r.icon} size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{r.label}</span>
                <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
          <p style={{ margin: '11px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
            Every figure derives from the company hours above plus one {GRACE_MINUTES}-minute grace period, so a change to the
            counter window moves the late-return cut-off with it.
          </p>
        </Card>
        <SpecialDays rows={state.exceptions} />
      </div>

      {/* The modals live in the pane, not the page, so a Settings tab that
          mounts pane + rail keeps Add Holiday and Add Shift working. */}
      {state.holidayOpen && (
        <AddHolidayModal existing={state.exceptions} onClose={() => state.setHolidayOpen(false)} onAdd={state.addException} />
      )}
      {state.shiftOpen && (
        <AddShiftModal existing={state.shifts} onClose={() => state.setShiftOpen(false)} onAdd={state.addShift} />
      )}
    </div>
  )
}

/** The rail, exported for the same reason as the pane. */
export function BusinessHoursRail({ state }: { state: BusinessHoursState }) {
  const alerts = useMemo(() => alertsFor(state.shifts, state.exceptions), [state.shifts, state.exceptions])
  const insights = useMemo(() => insightsFor(state.shifts, state.exceptions), [state.shifts, state.exceptions])

  return (
    <>
      <Card
        title="Calendar Summary"
        action={
          <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            BS 2083
          </span>
        }
      >
        <SummaryRows rows={CALENDAR_SUMMARY.map((r) => ({ label: r.label, value: r.value }))} />
        <p style={{ margin: '10px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          The six figures partition the {YEAR.days}-day year. Working Days ({WORKING_DAYS}) is the derived one, which is why this
          card cannot state a holiday total that disagrees with its own parts.
        </p>
        <Link to="/calendar" style={{ ...controlStyle, justifyContent: 'center', width: '100%', marginTop: 10 }}>
          View full calendar
          <Icon name="arrow_right" size={13} />
        </Link>
      </Card>

      <Card title="Alerts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((a) => (
            <DestControl
              key={a.id}
              dest={a.dest}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 9px',
                borderRadius: 8,
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
          {[
            { label: 'Add Holiday', icon: 'calendar_event' as IconName, run: state.openHoliday },
            { label: 'Add Shift', icon: 'crew' as IconName, run: state.openShift },
            { label: 'Print Calendar', icon: 'file' as IconName, run: () => window.print() },
            { label: 'Export Schedule', icon: 'download' as IconName, run: state.exportCsv },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={q.run}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                minHeight: 72,
                padding: '10px 6px',
                borderRadius: 'var(--r-card)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontSize: 'var(--t-th)',
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <Icon name={q.icon} size={18} style={{ color: 'var(--nav-active-accent)' }} />
              {q.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Recent Activity">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ACTIVITY.map((a) => (
            <div key={`${a.who}-${a.when}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  background: 'var(--card2)',
                  color: 'var(--text2)',
                  border: '1px solid var(--border)',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {a.initials}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.who}</span>
                <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 1 }}>{a.what}</span>
              </span>
              <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {a.when}
              </span>
            </div>
          ))}
          <Link to="/admin/audit" style={{ ...controlStyle, justifyContent: 'center', width: '100%', marginTop: 2 }}>
            View all activity
            <Icon name="arrow_right" size={13} />
          </Link>
        </div>
      </Card>

      <Card title="AI Scheduling Insights">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {insights.map((i) => (
            <div key={i.text} style={{ display: 'flex', gap: 8 }}>
              <Icon name={i.icon} size={14} style={{ color: STATUS[i.tone].fg, flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', lineHeight: 1.5 }}>{i.text}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          Each line states something this page can prove from the schedule. Nothing here is a forecast — no staffing model exists
          in this build.
        </p>
      </Card>
    </>
  )
}

/* ── page ──────────────────────────────────────────────────────────────── */

/**
 * The whole screen — header, panes, rail and footer bar. Mount this at a route.
 * Settings can instead mount `BusinessHoursPane` + `BusinessHoursRail` inside
 * its own grid; both take the same `state`, which `useBusinessHoursState`
 * builds.
 */
export function useBusinessHoursState(): BusinessHoursState {
  const [exceptions, setExceptions] = useState<CalException[]>(EXCEPTIONS)
  const [shifts, setShifts] = useState<Shift[]>(SHIFTS)
  const [holidayOpen, setHolidayOpen] = useState(false)
  const [shiftOpen, setShiftOpen] = useState(false)

  /** Holiday **days** in the next 30, not events — a two-day Tihar is two of them. */
  const upcoming = useMemo(() => upcomingOf(exceptions), [exceptions])
  const upcomingDays = useMemo(() => upcomingDaysOf(exceptions), [exceptions])

  const exportCsv = () => {
    const rows: string[][] = [['Section', 'Item', 'Detail', 'Value']]
    for (const f of COMPANY_HOURS) rows.push(['Company hours', f.label, hoursLabel(f.hours), spanLabel(f.hours)])
    for (const d of COMPANY_WEEK) {
      for (const c of WEEK_COLUMNS) {
        rows.push(['Weekly schedule', d.weekday, FACILITY_SHORT[c], spanLabel(d.hours[c])])
      }
    }
    for (const s of shifts) {
      rows.push(['Shifts', s.name, `${s.departments.join(' / ')} · ${s.breakMinutes}m break`, spanLabel(s.span)])
    }
    for (const r of PICKUP_RETURN) rows.push(['Counters', r.label, '', r.value])
    for (const e of exceptions) {
      rows.push([
        KIND_LABEL[e.kind],
        e.name,
        `${e.scope} · ${bsAdLabel(e.from)}${exceptionDays(e) > 1 ? ` → ${bsAdLabel(e.to)}` : ''}`,
        spanLabel(e.hours),
      ])
    }
    for (const r of CALENDAR_SUMMARY) rows.push(['Calendar summary (BS 2083)', r.label, '', r.value])
    download('babin-business-hours.csv', 'text/csv', csv(rows))
  }

  const exportIcs = () => download('babin-holiday-calendar.ics', 'text/calendar', icsFor(exceptions))

  return {
    exceptions,
    shifts,
    upcoming,
    upcomingDays,
    holidayOpen,
    shiftOpen,
    setHolidayOpen,
    setShiftOpen,
    openHoliday: () => setHolidayOpen(true),
    openShift: () => setShiftOpen(true),
    addException: (e: CalException) =>
      setExceptions((rows) => [...rows, e].sort((a, b) => a.from.getTime() - b.from.getTime())),
    addShift: (s: Shift) => setShifts((rows) => [...rows, s]),
    exportCsv,
    exportIcs,
  }
}

const REFRESH_WHY =
  'There is no feed to re-poll — this build reads a static seed, and the operating day is fixed at 31 Jul 2026 so every screen agrees on "today".'

const IMPORT_WHY =
  'Importing an .ics writes holidays into the org calendar. No backend is connected in this build, so the calendar can be exported but not replaced.'

export default function BusinessHours() {
  const tabular = useTabularLayout()
  const state = useBusinessHoursState()

  const bs = toBs(TODAY)
  const asOf = `${bs ? formatBs(bs) : 'BS date unavailable'} · ${formatAd(TODAY)}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="calendar_week"
        title="Business Hours & Holidays"
        description="Manage company operating hours, branch and warehouse schedules, shifts, holidays and special operating days."
        actions={
          <>
            <InertButton icon="upload" label="Import Calendar" why={IMPORT_WHY} />
            <InertButton icon="refresh" label="Refresh" why={REFRESH_WHY} />
            <Button icon="calendar" onClick={state.exportIcs}>
              Export ICS
            </Button>
            <Button icon="download" onClick={state.exportCsv}>
              Export CSV
            </Button>
            <Button icon="crew" onClick={state.openShift}>
              Add Shift
            </Button>
            <Button icon="plus" variant="primary" onClick={state.openHoliday}>
              Add Holiday
            </Button>
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
        <BusinessHoursPane state={state} />
        <Rail>
          <BusinessHoursRail state={state} />
        </Rail>
      </div>

      <FooterNote
        extra={[
          `Data as of ${asOf}`,
          `Calendar covers ${MONTH_LABEL} — the one month the Date Engine can name`,
          `${state.upcoming.length} exceptions upcoming (${state.upcomingDays} days)`,
        ]}
      />
    </div>
  )
}
