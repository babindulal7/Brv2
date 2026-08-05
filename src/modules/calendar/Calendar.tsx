import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, FooterNote, cardStyle } from '../../components/ui/Page'
import { BRAND } from '../../lib/status'
import { TODAY, toBs, formatBs, formatAd, eachDay, isWeekend, BS_MONTHS } from '../../lib/bs'
import { canViewMoney } from '../../lib/rbac'
import type { Role as SystemRole } from '../../lib/rbac'
import { useAuth } from '../../lib/auth'
import type { Role as ShiftRole } from '../../lib/auth'
import {
  VIEWS,
  ROW_TYPES,
  ROWS,
  BAR_STYLE,
  BAR_KINDS,
  CLIENTS,
  SAVED_VIEWS,
  KPIS,
  HOLIDAYS,
  holidayOn,
  TODAY_SUMMARY,
  UPCOMING,
  QUICK_ACTIONS,
  EVENT_MARKERS,
  SHORTCUTS,
  EVENT_DETAIL,
  EVENT_ACTIONS,
  ZOOM_STEPS,
  DEFAULT_ZOOM,
  adDay,
  dayDiff,
} from '../../data/calendar'
import type { Bar, BarKind, ResourceRow, RowType, ViewName } from '../../data/calendar'

/**
 * **Calendar Workspace** — built against `03 Core Modules/Calendar.PNG` and
 * `Calendar - Full View.PNG`.
 *
 * The two renders are two *modes of one screen*, not two routes: Full View
 * drops the app chrome, opens the filter rail and the Selected Event panel, and
 * moves the summary cards to a bottom strip. `full` below is that toggle — the
 * `⤢` button in the header and the `F` key both drive it, and `Esc` leaves.
 *
 * Structural rules that outrank the renders:
 *  · §4.1 columns are **generated** from a range, never hand-listed — which is
 *    what makes `‹ ›`, the zoom steps and the mini-calendar real controls
 *    rather than decoration.
 *  · §4.2 every BS date comes from the **one** Date Engine (`lib/bs.ts`), and
 *    every date shows **both** calendars. The renders label this week
 *    "10–16 Shrawan"; the engine's anchor makes it 11–17 and the engine wins.
 *  · §4.3 one `today` per render — marker, summary and mini-calendar agree.
 *  · §4.2's five-colour law — the renders' purple Sub-Rental bars become the
 *    gold outline §4.2 reserves for sub-rental, and the purple Utilization KPI
 *    becomes `progress`.
 *  · §8.3 — Warehouse sees no money. `Payment Due` is omitted, not masked.
 */

/**
 * `lib/auth.tsx` carries eight *shift* roles; `lib/rbac.ts` is written against
 * Foundation §11's six *system* roles, so this maps rather than casts — a cast
 * would hand `canViewMoney` a string it has no rule for and get `true`.
 *
 * TODO(decision): this table is now duplicated on Rentals and Calendar. It
 * belongs in `lib/rbac.ts`, which this screen does not own.
 */
const SYSTEM_ROLE: Record<ShiftRole, SystemRole> = {
  Owner: 'Owner',
  Manager: 'Manager',
  Coordinator: 'Manager',
  Warehouse: 'Warehouse',
  Technician: 'Warehouse',
  Driver: 'Warehouse',
  Accounts: 'Accounts',
  Client: 'Viewer',
}

const LABEL_W = 212

/**
 * Row order. The renders group by resource type — Equipment, then Vehicles,
 * Crew, Warehouse Bays — so `group` (the seed order) is the default and the
 * alphabetical sorts are opt-in, one click each.
 */
type SortMode = 'group' | 'asc' | 'desc'
const SORT_NEXT: Record<SortMode, SortMode> = { group: 'asc', asc: 'desc', desc: 'group' }
const SORT_HINT: Record<SortMode, string> = {
  group: 'Grouped by resource type — click to sort A–Z',
  asc: 'Sorted A–Z — click to sort Z–A',
  desc: 'Sorted Z–A — click to group by resource type',
}

/* ── date helpers — all of them ask the engine, none of them do BS maths ── */

/** The AD day that starts the BS month containing `from`. */
function bsMonthStart(from: Date): Date {
  let d = from
  for (let i = 0; i < 40; i += 1) {
    const bs = toBs(d)
    if (!bs) break
    if (bs.day === 1) return d
    d = adDay(dayDiff(d, TODAY) - 1)
  }
  return d
}

/** Every AD day the engine can still name inside that BS month. */
function bsMonthDays(from: Date): Date[] {
  const start = bsMonthStart(from)
  const out: Date[] = []
  for (let i = 0; i < 34; i += 1) {
    const d = adDay(dayDiff(start, TODAY) + i)
    if (!toBs(d)) break
    out.push(d)
  }
  return out
}

/** "11 – 17 Shrawan 2083 BS" — collapsed only when the engine agrees it is one month. */
function bsRangeLabel(days: Date[]): string {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return '—'
  const a = toBs(first)
  const b = toBs(last)
  if (!a || !b) return '—'
  if (a.year === b.year && a.month === b.month) {
    if (a.day === b.day) return formatBs(a)
    return `${a.day} – ${b.day} ${BS_MONTHS[a.month - 1] ?? ''} ${a.year} BS`
  }
  return `${formatBs(a)} – ${formatBs(b)}`
}

function adRangeLabel(days: Date[]): string {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return '—'
  if (first.getTime() === last.getTime()) return `${formatAd(first)} AD`
  return `${formatAd(first)} – ${formatAd(last)} AD`
}

/** "20 Shrawan" — the short BS form used inside bars, from the engine only. */
function bsShort(d: Date): string {
  const bs = toBs(d)
  return bs ? `${bs.day} ${BS_MONTHS[bs.month - 1] ?? ''}` : formatAd(d)
}

function weekdayShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Asia/Kathmandu' }).toUpperCase()
}

function adShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' })
}

function isToday(d: Date): boolean {
  return d.getTime() === TODAY.getTime()
}

/** A day is "off" when Nepal's weekend (Saturday) or a festival lands on it. */
function isOffDay(d: Date): boolean {
  return isWeekend(d) || holidayOn(d) !== null
}

/** Placement of a bar inside the rendered window, clipped at both ends. */
function place(bar: Bar, days: Date[]): { start: number; span: number; clipL: boolean; clipR: boolean } | null {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return null
  if (bar.to.getTime() < first.getTime() || bar.from.getTime() > last.getTime()) return null
  const rawStart = dayDiff(bar.from, first)
  const rawEnd = dayDiff(bar.to, first)
  const start = Math.max(0, rawStart)
  const end = Math.min(days.length - 1, rawEnd)
  return { start, span: end - start + 1, clipL: rawStart < 0, clipR: rawEnd > days.length - 1 }
}

/* ── small shared bits ─────────────────────────────────────────────────── */

const chipBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 26,
  padding: '0 9px',
  borderRadius: 999,
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap' as const,
}

const selectStyle = {
  height: 30,
  padding: '0 8px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  maxWidth: '100%',
} as const

function IconTile({ name, tone }: { name: IconName; tone?: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 32,
        height: 32,
        flexShrink: 0,
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        color: tone ?? 'var(--muted)',
      }}
    >
      <Icon name={name} size={16} />
    </span>
  )
}

/** A control whose destination genuinely does not exist yet. Never an href="#". */
function Unavailable({ label, reason, icon }: { label: string; reason: string; icon?: IconName }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled
      title={reason}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '9px 10px',
        borderRadius: 'var(--r-btn)',
        border: '1px dashed var(--border2)',
        background: 'transparent',
        color: 'var(--disabled)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        fontFamily: 'inherit',
        textAlign: 'left',
        cursor: 'not-allowed',
      }}
    >
      {icon && <Icon name={icon} size={14} />}
      <span style={{ minWidth: 0 }}>
        {label}
        <span style={{ display: 'block', fontWeight: 400, fontSize: 'var(--t-th)' }}>{reason}</span>
      </span>
    </button>
  )
}

/* ── timeline bar ──────────────────────────────────────────────────────── */

function BarView({
  bar,
  pos,
  selected,
  compact,
  onSelect,
}: {
  bar: Bar
  pos: { start: number; span: number; clipL: boolean; clipR: boolean }
  selected: boolean
  compact: boolean
  onSelect: (id: string) => void
}) {
  const s = BAR_STYLE[bar.kind]
  const bsFrom = toBs(bar.from)
  const bsTo = toBs(bar.to)
  const when = bsFrom && bsTo ? `${formatBs(bsFrom)} – ${formatBs(bsTo)} · ${formatAd(bar.from)} – ${formatAd(bar.to)}` : ''
  return (
    <button
      type="button"
      onClick={() => onSelect(bar.id)}
      title={`${bar.kind} · ${bar.label}${bar.sub ? ` · ${bar.sub}` : ''}${when ? `\n${when}` : ''}`}
      style={{
        gridColumn: `${pos.start + 1} / span ${pos.span}`,
        gridRow: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        height: compact ? 26 : 42,
        margin: '4px 2px',
        padding: compact ? '0 7px' : '0 8px',
        borderTopLeftRadius: pos.clipL ? 0 : 7,
        borderBottomLeftRadius: pos.clipL ? 0 : 7,
        borderTopRightRadius: pos.clipR ? 0 : 7,
        borderBottomRightRadius: pos.clipR ? 0 : 7,
        background: s.bg,
        border: `1px ${s.dash ? 'dashed' : 'solid'} ${s.line}`,
        color: s.fg,
        fontFamily: 'inherit',
        fontSize: 'var(--t-th)',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: selected ? '0 0 0 2px var(--card), 0 0 0 4px var(--nav-active-accent)' : 'none',
        zIndex: selected ? 10 : 1,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {s.icon && <Icon name={s.icon} size={compact ? 11 : 14} style={{ flexShrink: 0 }} />}
      <span style={{ minWidth: 0, lineHeight: 1.25 }}>
        <span
          className={bar.label.startsWith('BK-') || bar.label.startsWith('QT-') || bar.label.startsWith('CASE-') ? 'booking-id' : undefined}
          style={{ display: 'block', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {bar.label}
        </span>
        {!compact && bar.sub && (
          <span style={{ display: 'block', fontWeight: 500, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {bar.sub}
          </span>
        )}
      </span>
      {!compact && (bar.note || bar.noteAt) && (
        <span style={{ marginLeft: 'auto', flexShrink: 0, opacity: 0.85, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {[bar.note, bar.noteAt ? bsShort(bar.noteAt) : null].filter(Boolean).join(' ')}
        </span>
      )}
      {bar.dot && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 6,
            height: 6,
            borderRadius: 999,
            background: BRAND[bar.dot === 'danger' ? 'danger' : bar.dot === 'progress' ? 'progress' : bar.dot === 'primary' ? 'primary' : 'success'],
          }}
        />
      )}
    </button>
  )
}

/* ── timeline ──────────────────────────────────────────────────────────── */

function Timeline({
  rows,
  days,
  selectedId,
  onSelect,
  sort,
  onToggleSort,
  labelHeading,
  itemCount,
}: {
  rows: ResourceRow[]
  days: Date[]
  selectedId: string | null
  onSelect: (id: string) => void
  sort: SortMode
  onToggleSort: () => void
  labelHeading: string
  itemCount: number
}) {
  const n = days.length
  const compact = n > 10
  const grid = `${LABEL_W}px repeat(${n}, minmax(0,1fr))`

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: n > 10 ? 240 + n * 78 : 0 }}>
        {/* header */}
        <div style={{ display: 'grid', gridTemplateColumns: grid, background: 'var(--th-bg)', borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onToggleSort}
            title={SORT_HINT[sort]}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'center',
              gap: 1,
              padding: '7px 10px',
              border: 'none',
              borderRight: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text2)',
              font: 'inherit',
              fontSize: 'var(--t-th)',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {labelHeading}
              <Icon name={sort === 'desc' ? 'chevron_up' : sort === 'asc' ? 'chevron_down' : 'more_vert'} size={12} />
            </span>
            <span className="figure" style={{ fontWeight: 400, color: 'var(--muted)' }}>{itemCount} items</span>
          </button>

          {days.map((d, i) => {
            const bs = toBs(d)
            const today = isToday(d)
            const off = isOffDay(d)
            const hol = holidayOn(d)
            const ink = today ? 'var(--nav-active-accent)' : off ? 'var(--danger-text)' : 'var(--text)'
            return (
              <div
                key={d.getTime()}
                aria-current={today ? 'date' : undefined}
                title={hol ? `${hol.name}${bs ? ` · ${formatBs(bs)}` : ''}` : bs ? formatBs(bs) : undefined}
                style={{
                  position: 'relative',
                  /* Room at the top for the Today pill, on every column so the
                     marked one does not sit a row lower than its neighbours. */
                  padding: '18px 4px 7px',
                  textAlign: 'center',
                  borderRight: i < n - 1 ? '1px solid var(--border)' : 'none',
                  borderLeft: today ? '2px solid var(--nav-active-accent)' : undefined,
                  background: today ? 'var(--nav-active-bg)' : off ? 'var(--card2)' : 'transparent',
                }}
              >
                {today && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      padding: '1px 7px',
                      borderRadius: 999,
                      background: 'var(--nav-active-accent)',
                      color: 'var(--app)',
                      fontSize: 'var(--t-th)',
                      fontWeight: 700,
                      zIndex: 3,
                    }}
                  >
                    Today
                  </span>
                )}
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: ink, lineHeight: 1.15 }}>
                  {bs ? bs.day : '—'}
                </span>
                {!compact && (
                  <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: today ? 'var(--text2)' : 'var(--muted)' }}>
                    {bs ? `${BS_MONTHS[bs.month - 1]} ${bs.year} BS` : ''}
                  </span>
                )}
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: today ? 'var(--text2)' : 'var(--muted)' }}>
                  {adShort(d)}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--t-th)', letterSpacing: '0.05em', color: today ? 'var(--text2)' : off ? 'var(--danger-text)' : 'var(--muted)' }}>
                  {weekdayShort(d)}
                </span>
              </div>
            )
          })}
        </div>

        {/* rows */}
        {rows.map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: grid, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', minWidth: 0, borderRight: '1px solid var(--border)' }}>
              <IconTile name={row.icon} />
              <span style={{ minWidth: 0, lineHeight: 1.25 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.name}
                </span>
                {row.code && (
                  <span className="serial" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {row.code}
                  </span>
                )}
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--t-th)',
                    color:
                      row.metaTone === 'success'
                        ? 'var(--success-text)'
                        : row.metaTone === 'primary'
                          ? 'var(--primary-text)'
                          : row.metaTone === 'progress'
                            ? 'var(--progress-text)'
                            : 'var(--muted)',
                  }}
                >
                  {row.meta}
                </span>
              </span>
            </div>

            <div style={{ gridColumn: `2 / span ${n}`, position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
              {days.map((d, i) => (
                <span
                  key={d.getTime()}
                  aria-hidden
                  style={{
                    gridColumn: `${i + 1} / span 1`,
                    gridRow: 1,
                    borderRight: i < n - 1 ? '1px solid var(--border)' : 'none',
                    borderLeft: isToday(d) ? '2px solid var(--nav-active-accent)' : undefined,
                    background: isToday(d) ? 'var(--nav-active-bg)' : isOffDay(d) ? 'var(--card2)' : 'transparent',
                  }}
                />
              ))}
              <div style={{ gridColumn: `1 / span ${n}`, gridRow: 1, display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, alignItems: 'center' }}>
                {row.bars.map((b) => {
                  const pos = place(b, days)
                  if (!pos) return null
                  return <BarView key={b.id} bar={b} pos={pos} compact={compact} selected={b.id === selectedId} onSelect={onSelect} />
                })}
              </div>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '28px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>No resources match these filters</div>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Clear an event type, widen the client filter, or pick a different saved view.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── month grid ────────────────────────────────────────────────────────── */

function MonthGrid({
  anchor,
  rows,
  onPickDay,
}: {
  anchor: Date
  rows: ResourceRow[]
  onPickDay: (d: Date) => void
}) {
  const days = bsMonthDays(anchor)
  const first = days[0]
  const lead = first ? first.getUTCDay() : 0
  const head = toBs(first ?? anchor)

  const barsOn = (d: Date): Bar[] =>
    rows.flatMap((r) => r.bars.filter((b) => d.getTime() >= b.from.getTime() && d.getTime() <= b.to.getTime()))

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6, marginBottom: 6 }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((w, i) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 'var(--t-th)', fontWeight: 600, color: i === 6 ? 'var(--danger-text)' : 'var(--muted)' }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6 }}>
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} aria-hidden style={{ minHeight: 92, borderRadius: 8, background: 'var(--card2)', opacity: 0.4 }} />
        ))}
        {days.map((d) => {
          const bs = toBs(d)
          const today = isToday(d)
          const hol = holidayOn(d)
          const list = barsOn(d)
          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onPickDay(d)}
              title={`Open ${bs ? formatBs(bs) : ''} · ${formatAd(d)}`}
              style={{
                minHeight: 92,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: 6,
                borderRadius: 8,
                textAlign: 'left',
                fontFamily: 'inherit',
                cursor: 'pointer',
                background: today ? 'var(--nav-active-bg)' : 'var(--card)',
                border: today ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: today ? 'var(--nav-active-accent)' : isOffDay(d) ? 'var(--danger-text)' : 'var(--text)' }}>
                  {bs ? bs.day : '—'}
                </span>
                <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{adShort(d)}</span>
              </span>
              {hol && (
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--danger-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {hol.name}
                </span>
              )}
              {list.slice(0, 2).map((b) => {
                const s = BAR_STYLE[b.kind]
                return (
                  <span
                    key={b.id}
                    style={{
                      display: 'block',
                      padding: '1px 5px',
                      borderRadius: 5,
                      background: s.bg,
                      border: `1px ${s.dash ? 'dashed' : 'solid'} ${s.line}`,
                      color: s.fg,
                      fontSize: 'var(--t-th)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {b.label}
                  </span>
                )
              })}
              {list.length > 2 && (
                <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>+{list.length - 2} more</span>
              )}
            </button>
          )
        })}
      </div>
      <p style={{ margin: '10px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        {head ? `${BS_MONTHS[head.month - 1]} ${head.year} BS` : ''} · {days.length} days the Date Engine can name. Pick a day to open it.
      </p>
    </div>
  )
}

/* ── mini month (rail) ─────────────────────────────────────────────────── */

function MiniMonth({ anchor, onPickDay, busy }: { anchor: Date; onPickDay: (d: Date) => void; busy: Set<number> }) {
  const days = bsMonthDays(anchor)
  const first = days[0]
  const lead = first ? first.getUTCDay() : 0
  const head = toBs(first ?? anchor)
  const step = (delta: number) => {
    const target = adDay(dayDiff(anchor, TODAY) + delta * days.length)
    if (toBs(target)) onPickDay(target)
  }
  const prevOk = Boolean(toBs(adDay(dayDiff(anchor, TODAY) - days.length)))
  const nextOk = Boolean(toBs(adDay(dayDiff(anchor, TODAY) + days.length)))

  return (
    <Card bodyStyle={{ padding: '14px 14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!prevOk}
          title={prevOk ? 'Previous month' : 'The Date Engine only vouches for Shrawan 2083'}
          style={{ background: 'none', border: 'none', color: prevOk ? 'var(--text2)' : 'var(--disabled)', cursor: prevOk ? 'pointer' : 'not-allowed', display: 'flex', padding: 2 }}
        >
          <Icon name="chevron_left" size={16} />
        </button>
        <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>
          {head ? `${BS_MONTHS[head.month - 1]} ${head.year} BS` : 'Calendar'}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!nextOk}
          title={nextOk ? 'Next month' : 'The Date Engine only vouches for Shrawan 2083'}
          style={{ background: 'none', border: 'none', color: nextOk ? 'var(--text2)' : 'var(--disabled)', cursor: nextOk ? 'pointer' : 'not-allowed', display: 'flex', padding: 2 }}
        >
          <Icon name="chevron_right" size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center', fontSize: 'var(--t-th)', color: 'var(--muted)', marginBottom: 4 }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((w, i) => (
          <div key={w} style={{ color: i === 6 ? 'var(--danger-text)' : 'var(--muted)' }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden style={{ height: 26 }} />
        ))}
        {days.map((d) => {
          const bs = toBs(d)
          const today = isToday(d)
          const hol = holidayOn(d)
          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onPickDay(d)}
              title={`${bs ? formatBs(bs) : ''} · ${formatAd(d)}${hol ? ` · ${hol.name}` : ''}`}
              className="figure"
              style={{
                position: 'relative',
                height: 26,
                borderRadius: 999,
                border: 'none',
                background: today ? 'var(--nav-active-accent)' : 'transparent',
                color: today ? 'var(--app)' : hol ? 'var(--danger-text)' : isWeekend(d) ? 'var(--danger-text)' : 'var(--text)',
                fontSize: 'var(--t-th)',
                fontWeight: today ? 700 : 500,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {bs ? bs.day : ''}
              {busy.has(d.getTime()) && !today && (
                <span aria-hidden style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: 999, background: 'var(--primary)' }} />
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/* ── rail cards ────────────────────────────────────────────────────────── */

function FestivalCard() {
  return (
    <Card bodyStyle={{ padding: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Festivals &amp; Holidays</div>
        {/* The render's "Manage" link. Holiday editing has no screen yet, so it
            is visibly unavailable and the reason is stated below, on the card
            face — not hidden in a `title` a mouse has to find. */}
        <span aria-disabled style={{ fontSize: 'var(--t-th)', color: 'var(--disabled)', textDecoration: 'line-through' }}>
          Manage
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {HOLIDAYS.map((h) => {
          const a = toBs(h.from)
          const b = toBs(h.to)
          const label = a && b ? (a.day === b.day ? `${a.day}` : `${a.day}-${b.day}`) : '—'
          const month = a ? BS_MONTHS[a.month - 1] : ''
          /* §4.2 — every date shows both calendars, BS above AD. */
          const ad = h.from.getTime() === h.to.getTime() ? formatAd(h.from) : `${adShort(h.from)} – ${formatAd(h.to)}`
          return (
            <div key={h.name} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-meta)' }}>
              <span style={{ minWidth: 0, lineHeight: 1.3 }}>
                <span className="figure" style={{ display: 'block', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {label} {month}
                </span>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {ad}
                </span>
              </span>
              <span style={{ color: 'var(--text)', textAlign: 'right' }}>{h.name}</span>
            </div>
          )
        })}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        Holiday calendars are configured in Settings.
      </p>
    </Card>
  )
}

function CountList({ rows, money, dots }: { rows: typeof TODAY_SUMMARY; money: boolean; dots: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* §8.3 — the money row is absent from the markup, not hidden by CSS. */}
      {rows.filter((r) => money || !r.money).map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 'var(--t-meta)' }}>
          {dots ? (
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, background: r.tone, flexShrink: 0 }} />
          ) : (
            r.icon && <Icon name={r.icon} size={14} style={{ color: r.tone, flexShrink: 0 }} />
          )}
          <span className="figure" style={{ fontWeight: 700, color: 'var(--text)', minWidth: 18 }}>{r.value}</span>
          <span style={{ color: 'var(--text2)', minWidth: 0 }}>{r.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── selected event panel ──────────────────────────────────────────────── */

function DateBlock({ label, at, time, icon }: { label: string; at: Date; time: string; icon: IconName }) {
  const bs = toBs(at)
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Icon name={icon} size={15} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>{label}</div>
        {/* BS above AD, both from the engine — §4.2. */}
        <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{bs ? formatBs(bs) : '—'}</div>
        <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{formatAd(at)}, {time}</div>
      </div>
    </div>
  )
}

function SelectedEventPanel({ bar, row, onClose }: { bar: Bar; row: ResourceRow; onClose: () => void }) {
  const detail = EVENT_DETAIL[bar.label]
  const skin = BAR_STYLE[bar.kind]
  return (
    <Card bodyStyle={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.04em' }}>SELECTED EVENT</div>
          <div className="booking-id" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>
            {bar.label}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', fontWeight: 700, color: skin.fg === 'var(--st-out-fg)' ? 'var(--success-text)' : skin.fg }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: skin.line }} />
          {bar.kind}
        </span>
        <button type="button" onClick={onClose} title="Close (Esc)" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
          <Icon name="close" size={16} />
        </button>
      </div>

      <div>
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{detail?.client ?? bar.client ?? bar.sub ?? row.name}</div>
        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{detail?.project ?? `${bar.kind} · ${row.name}`}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(detail?.equipment ?? [{ name: row.name, code: row.code ?? '', icon: row.icon }]).map((e) => (
          <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <IconTile name={e.icon} />
            <span style={{ minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
              {e.name} {e.code && <span className="serial" style={{ color: 'var(--muted)' }}>({e.code})</span>}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        {detail ? (
          <>
            <DateBlock label="Pickup" at={detail.pickup.at} time={detail.pickup.time} icon="calendar_event" />
            <DateBlock label="Return" at={detail.return.at} time={detail.return.time} icon="calendar_due" />
            <DateBlock label="Handover Session" at={detail.handoverSession.at} time={detail.handoverSession.time} icon="crew" />
            <DateBlock label="Return Session" at={detail.returnSession.at} time={detail.returnSession.time} icon="return_arrow" />
          </>
        ) : (
          <>
            <DateBlock label="Starts" at={bar.from} time="—" icon="calendar_event" />
            <DateBlock label="Ends" at={bar.to} time="—" icon="calendar_due" />
            <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Session times are recorded on the booking; this bar carries only its window.
            </p>
          </>
        )}
      </div>

      {detail && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>Crew</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {detail.crew.slice(0, 3).map((c) => (
                <span
                  key={c}
                  title={c}
                  style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-th)', fontWeight: 700 }}
                >
                  {c.slice(0, 1)}
                </span>
              ))}
              {detail.crew.length > 3 && (
                <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>+{detail.crew.length - 3}</span>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Vehicle</div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{detail.vehicle}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>Notes</div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{detail.notes}</div>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ── screen ────────────────────────────────────────────────────────────── */

export default function Calendar() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const role: SystemRole = user ? SYSTEM_ROLE[user.role] : 'Viewer'
  const money = canViewMoney(role)

  const [view, setView] = useState<ViewName>('Resource Timeline')
  const [full, setFull] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)
  /** The window's first day. `TODAY` sits one column in, as the render shows. */
  const [start, setStart] = useState<Date>(adDay(-1))
  const [rowType, setRowType] = useState<'All' | RowType>('All')
  const [client, setClient] = useState('All')
  const [kinds, setKinds] = useState<Set<BarKind>>(new Set())
  const [resource, setResource] = useState('All')
  const [query, setQuery] = useState('')
  const [savedView, setSavedView] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>('group')
  const [showShortcuts, setShowShortcuts] = useState(false)

  const dayCount = view === 'Day' ? 1 : view === 'Week' ? 7 : zoom
  const days = useMemo(() => eachDay(start, dayCount), [start, dayCount])

  /** Walks `ZOOM_STEPS`; +1 widens the window, −1 narrows it. */
  const stepZoom = (dir: 1 | -1) => {
    setZoom((z) => {
      const at = ZOOM_STEPS.indexOf(z as (typeof ZOOM_STEPS)[number])
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (at === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : at) + dir))]
      return next ?? z
    })
  }

  const goToday = useCallback(() => {
    setStart(adDay(view === 'Day' ? 0 : -1))
  }, [view])

  const shift = useCallback(
    (dir: -1 | 1) => {
      setStart((s) => adDay(dayDiff(s, TODAY) + dir * dayCount))
    },
    [dayCount],
  )

  /* ── keyboard: the render's Shortcuts card, wired ───────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return
      if (e.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false)
        else if (selectedId) setSelectedId(null)
        else if (full) setFull(false)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'f') setFull((v) => !v)
      else if (k === 't') goToday()
      else if (k === 'r') setView('Resource Timeline')
      else if (e.key === '?') setShowShortcuts((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full, selectedId, showShortcuts, goToday])

  /* ── body scroll lock while the overlay is up ───────────────────────── */
  useEffect(() => {
    if (!full) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [full])

  /* ── filtering ──────────────────────────────────────────────────────── */
  const q = query.trim().toLowerCase()
  const filterActive = kinds.size > 0 || client !== 'All' || q.length > 0

  const rows = useMemo(() => {
    const out = ROWS.filter((r) => rowType === 'All' || r.type === rowType)
      .filter((r) => resource === 'All' || r.id === resource)
      .map((r) => {
        const rowHit = q.length > 0 && (r.name.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q))
        const bars = r.bars.filter((b) => {
          if (kinds.size > 0 && !kinds.has(b.kind)) return false
          if (client !== 'All' && b.client !== client) return false
          if (q.length > 0 && !rowHit) {
            const hay = `${b.label} ${b.sub ?? ''} ${b.client ?? ''}`.toLowerCase()
            if (!hay.includes(q)) return false
          }
          return true
        })
        return { ...r, bars }
      })
      .filter((r) => (filterActive ? r.bars.length > 0 : true))
    if (sort === 'group') {
      out.sort((a, b) => ROW_TYPES.indexOf(a.type) - ROW_TYPES.indexOf(b.type))
    } else {
      out.sort((a, b) => (sort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)))
    }
    return out
  }, [rowType, resource, kinds, client, q, filterActive, sort])

  const selected = useMemo(() => {
    if (!selectedId) return null
    for (const r of rows) {
      const bar = r.bars.find((b) => b.id === selectedId)
      if (bar) return { bar, row: r }
    }
    return null
  }, [rows, selectedId])

  const busyDays = useMemo(() => {
    const set = new Set<number>()
    for (const r of ROWS) for (const b of r.bars) {
      for (let t = b.from.getTime(); t <= b.to.getTime(); t += 86_400_000) set.add(t)
    }
    return set
  }, [])

  const clearAll = () => {
    setRowType('All')
    setClient('All')
    setResource('All')
    setKinds(new Set())
    setQuery('')
    setSavedView(null)
  }

  const applySavedView = (name: string) => {
    const v = SAVED_VIEWS.find((s) => s.name === name)
    if (!v) return
    setSavedView(name)
    setRowType(v.rowType)
    setKinds(new Set(v.kinds))
    setClient('All')
    setResource('All')
  }

  const toggleKind = (k: BarKind) => {
    setSavedView(null)
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const showConflicts = () => {
    setSavedView('Conflict View')
    setRowType('All')
    setKinds(new Set<BarKind>(['Conflict', 'Case Escalation']))
    setShowFilters(true)
  }

  const runQuickAction = (a: (typeof QUICK_ACTIONS)[number]) => {
    if (a.action === 'conflicts') showConflicts()
    else if (a.to) navigate(a.to)
  }

  /* ── shared fragments ───────────────────────────────────────────────── */

  const rangePill = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 34,
        padding: '0 11px',
        borderRadius: 'var(--r-btn)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
      }}
    >
      <span style={{ lineHeight: 1.2, textAlign: 'left' }}>
        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
          {bsRangeLabel(days)}
        </span>
        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          {adRangeLabel(days)}
        </span>
      </span>
      <Icon name="calendar" size={14} style={{ color: 'var(--muted)' }} />
    </span>
  )

  const navButtons = (
    <>
      <Button onClick={goToday}>Today</Button>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        <button type="button" onClick={() => shift(-1)} title="Previous range" style={iconBtn}>
          <Icon name="chevron_left" size={15} />
        </button>
        <button type="button" onClick={() => shift(1)} title="Next range" style={iconBtn}>
          <Icon name="chevron_right" size={15} />
        </button>
      </span>
      {rangePill}
    </>
  )

  const viewTabs = (
    <span style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 10, background: 'var(--card2)', border: '1px solid var(--border)' }}>
      {VIEWS.map((v) => {
        const on = view === v
        return (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={on}
            style={{
              height: 28,
              padding: '0 11px',
              borderRadius: 7,
              border: on ? '1px solid var(--nav-active-accent)' : '1px solid transparent',
              background: on ? 'var(--card)' : 'transparent',
              color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: on ? 700 : 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {v}
          </button>
        )
      })}
    </span>
  )

  const rowTypeControl = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Row Type</span>
      <select
        value={rowType}
        onChange={(e) => {
          setSavedView(null)
          setRowType(e.target.value as 'All' | RowType)
          setResource('All')
        }}
        style={selectStyle}
        aria-label="Row type"
      >
        <option value="All">All Resources</option>
        {ROW_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </span>
  )

  const clientControl = (
    <select value={client} onChange={(e) => { setSavedView(null); setClient(e.target.value) }} style={selectStyle} aria-label="Client">
      <option value="All">All Clients</option>
      {CLIENTS.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  )

  const zoomControl = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Zoom</span>
      <button type="button" onClick={() => stepZoom(1)} title="Show more days" style={iconBtn} aria-label="Zoom out">
        <Icon name="chevron_down" size={14} />
      </button>
      <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', minWidth: 46, textAlign: 'center' }}>
        {dayCount} days
      </span>
      <button type="button" onClick={() => stepZoom(-1)} title="Show fewer days" style={iconBtn} aria-label="Zoom in">
        <Icon name="chevron_up" size={14} />
      </button>
      <button type="button" onClick={() => { setZoom(DEFAULT_ZOOM); goToday() }} title="Back to a 7-day window on today" style={{ ...iconBtn, width: 'auto', padding: '0 9px', fontSize: 'var(--t-th)', fontWeight: 600 }}>
        Fit
      </button>
    </span>
  )

  const kindChips = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {BAR_KINDS.map((k) => {
        const s = BAR_STYLE[k]
        const on = kinds.has(k)
        return (
          <button
            key={k}
            type="button"
            onClick={() => toggleKind(k)}
            aria-pressed={on}
            title={on ? `Stop filtering by ${k}` : `Show only ${k}`}
            style={{
              ...chipBase,
              border: `1px solid ${on ? s.line : 'var(--border)'}`,
              background: on ? s.bg : 'transparent',
              color: on ? s.fg : 'var(--text2)',
            }}
          >
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: s.dash ? 'transparent' : s.line, border: `1.5px ${s.dash ? 'dashed' : 'solid'} ${s.line}` }} />
            {k}
          </button>
        )
      })}
      {kinds.size > 0 && (
        <button type="button" onClick={() => setKinds(new Set())} style={{ ...chipBase, border: '1px solid var(--border)', background: 'transparent', color: 'var(--link)' }}>
          Clear event types
        </button>
      )}
    </div>
  )

  const markerLegend = (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
      {EVENT_MARKERS.filter((m) => money || !m.money).map((m) => (
        <span key={m.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
          {m.icon && <Icon name={m.icon} size={13} style={{ color: m.tone }} />}
          {m.label}
        </span>
      ))}
    </div>
  )

  const filtersPanel = (
    <Card bodyStyle={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Filters</div>
        <button type="button" onClick={clearAll} style={{ background: 'none', border: 'none', color: 'var(--link)', fontSize: 'var(--t-meta)', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          Clear All
        </button>
      </div>

      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginBottom: 5 }}>Search</span>
        <span style={{ position: 'relative', display: 'block' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Booking, equipment, client, crew…"
            style={{ ...selectStyle, width: '100%', height: 32, paddingLeft: 28, cursor: 'text' }}
          />
          <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--muted)' }} />
        </span>
      </label>

      <div>
        <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', marginBottom: 6 }}>Event Type</div>
        {kindChips}
      </div>

      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginBottom: 5 }}>Client</span>
        <span style={{ display: 'block' }}>{clientControl}</span>
      </label>

      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginBottom: 5 }}>Resource Type</span>
        <select
          value={rowType}
          onChange={(e) => { setSavedView(null); setRowType(e.target.value as 'All' | RowType); setResource('All') }}
          style={{ ...selectStyle, width: '100%' }}
          aria-label="Resource type"
        >
          <option value="All">All Resources</option>
          {ROW_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginBottom: 5 }}>Resource</span>
        <select value={resource} onChange={(e) => { setSavedView(null); setResource(e.target.value) }} style={{ ...selectStyle, width: '100%' }} aria-label="Resource">
          <option value="All">All</option>
          {ROWS.filter((r) => rowType === 'All' || r.type === rowType).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>

      <div>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 8 }}>Saved Views</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SAVED_VIEWS.map((v) => {
            const on = savedView === v.name
            return (
              <button
                key={v.name}
                type="button"
                onClick={() => applySavedView(v.name)}
                aria-pressed={on}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 9px',
                  borderRadius: 8,
                  border: on ? '1px solid var(--nav-active-accent)' : '1px solid transparent',
                  background: on ? 'var(--nav-active-bg)' : 'transparent',
                  color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: on ? 700 : 500,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {v.name}
                {v.starred && <Icon name="dot" size={12} style={{ marginLeft: 'auto', color: 'var(--nav-active-accent)' }} />}
              </button>
            )
          })}
        </div>
      </div>
    </Card>
  )

  const timelineCard = (
    <Card bodyStyle={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ minWidth: 0 }}>
          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{bsRangeLabel(days)}</span>
          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{adRangeLabel(days)}</span>
        </span>
        <span style={{ marginLeft: 'auto' }}>{view === 'Resource Timeline' ? zoomControl : <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{view} view · fixed window</span>}</span>
      </div>
      <Timeline
        rows={rows}
        days={days}
        selectedId={selectedId}
        onSelect={setSelectedId}
        sort={sort}
        onToggleSort={() => setSort((s) => SORT_NEXT[s])}
        labelHeading={rowType === 'All' ? 'Resource' : rowType}
        itemCount={rows.length}
      />
      {markerLegend}
    </Card>
  )

  const monthCard = (
    <Card bodyStyle={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
        <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700 }}>{bsRangeLabel(bsMonthDays(start))}</span>
        <span className="figure" style={{ marginLeft: 'auto', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{adRangeLabel(bsMonthDays(start))}</span>
      </div>
      <MonthGrid anchor={start} rows={rows} onPickDay={(d) => { setStart(d); setView('Day') }} />
      {markerLegend}
    </Card>
  )

  const centre = view === 'Month' ? monthCard : timelineCard

  const shortcutsCard = (
    <Card bodyStyle={{ padding: 14 }}>
      <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 10 }}>Shortcuts</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
        {SHORTCUTS.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
            <kbd
              style={{
                minWidth: 20,
                textAlign: 'center',
                padding: '1px 5px',
                borderRadius: 5,
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontFamily: 'var(--font-id)',
                fontSize: 'var(--t-th)',
              }}
            >
              {s.key}
            </kbd>
            {s.label}
          </span>
        ))}
      </div>
    </Card>
  )

  const railDefault = (
    <>
      <MiniMonth anchor={start} onPickDay={(d) => setStart(d)} busy={busyDays} />
      <FestivalCard />
      <Card bodyStyle={{ padding: 14 }}>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Today&apos;s Summary</div>
        <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', margin: '2px 0 10px' }}>
          {(() => {
            const bs = toBs(TODAY)
            return `${bs ? formatBs(bs) : '—'} (${formatAd(TODAY)})`
          })()}
        </div>
        <CountList rows={TODAY_SUMMARY} money={money} dots />
      </Card>
      <Card bodyStyle={{ padding: 14 }}>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 10 }}>
          Upcoming <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 'var(--t-th)' }}>(Next 7 Days)</span>
        </div>
        <CountList rows={UPCOMING} money={money} dots={false} />
      </Card>
      <Card bodyStyle={{ padding: 14 }}>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 10 }}>Quick Actions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
          {QUICK_ACTIONS.map((a) =>
            a.unavailable ? (
              <Unavailable key={a.label} label={a.label} reason={a.unavailable} icon={a.icon} />
            ) : (
              <button
                key={a.label}
                type="button"
                onClick={() => runQuickAction(a)}
                title={a.to ? `Go to ${a.to}` : 'Filter the timeline to conflicts'}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '10px 9px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card2)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-th)',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon name={a.icon} size={16} style={{ color: 'var(--nav-active-accent)' }} />
                {a.label}
              </button>
            ),
          )}
        </div>
      </Card>
    </>
  )

  /* ── full view overlay ──────────────────────────────────────────────── */

  if (full) {
    return (
      <div
        role="dialog"
        aria-label="Calendar — full view"
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--app)', overflow: 'auto', padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--t-h2)', fontWeight: 700 }}>Calendar</h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 10 }}>{navButtons}</span>
          <span style={{ position: 'relative', marginLeft: 'auto' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search booking, equipment, client, crew…"
              style={{ ...selectStyle, height: 34, width: 300, paddingLeft: 30, cursor: 'text' }}
            />
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
          </span>
          <Button icon="settings" onClick={() => setShowFilters((v) => !v)}>{showFilters ? 'Hide Filters' : 'Filters'}</Button>
          <Button icon="close" onClick={() => setFull(false)}>Exit Full View</Button>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {viewTabs}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {rowTypeControl}
            {clientControl}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: showFilters ? '230px minmax(0,1fr) 300px' : 'minmax(0,1fr) 300px',
            gap: 'var(--sp-md)',
            alignItems: 'start',
          }}
        >
          {showFilters && filtersPanel}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>{centre}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {selected ? (
              <SelectedEventPanel bar={selected.bar} row={selected.row} onClose={() => setSelectedId(null)} />
            ) : (
              <Card bodyStyle={{ padding: 14 }}>
                <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 6 }}>Selected Event</div>
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Pick a bar in the timeline to see its booking, sessions, crew and vehicle.</p>
              </Card>
            )}
            <Card bodyStyle={{ padding: 14 }}>
              <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 10 }}>Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {EVENT_ACTIONS.map((a) => {
                  if (a.unavailable) return <Unavailable key={a.label} label={a.label} reason={a.unavailable} icon={a.icon} />
                  const bookingNo = selected?.bar.label
                  const openable = Boolean(bookingNo && bookingNo.startsWith('BK-'))
                  if (!openable) {
                    return <Unavailable key={a.label} label={a.label} reason="Select a booking bar first" icon={a.icon} />
                  }
                  return (
                    <Button key={a.label} icon={a.icon} onClick={() => navigate(`/rentals/${bookingNo}`)}>
                      {a.label}
                    </Button>
                  )
                })}
              </div>
            </Card>
            {shortcutsCard}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
          <Card bodyStyle={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Today&apos;s Summary</div>
            <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', margin: '2px 0 10px' }}>
              {(() => {
                const bs = toBs(TODAY)
                return `${bs ? formatBs(bs) : '—'} (${formatAd(TODAY)})`
              })()}
            </div>
            <CountList rows={TODAY_SUMMARY} money={money} dots />
          </Card>
          <Card bodyStyle={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 8 }}>Conflicts</div>
            <div className="kpi-value" style={{ fontSize: 'var(--t-kpi)', color: 'var(--danger-text)' }}>4</div>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', margin: '4px 0 10px' }}>Requires attention</div>
            <Button icon="alert_triangle" onClick={showConflicts}>View Conflicts</Button>
          </Card>
          <Card bodyStyle={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 8 }}>
              Utilization <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 'var(--t-th)' }}>(This Month)</span>
            </div>
            <div className="kpi-value" style={{ fontSize: 'var(--t-kpi)', color: 'var(--text)' }}>84%</div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--card2)', border: '1px solid var(--border)', marginTop: 10, overflow: 'hidden' }}>
              <span aria-hidden style={{ display: 'block', width: '84%', height: '100%', background: 'var(--progress)' }} />
            </div>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 6 }}>Matches Today &amp; Inventory</div>
          </Card>
          <Card bodyStyle={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 10 }}>
              Upcoming <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 'var(--t-th)' }}>(Next 7 Days)</span>
            </div>
            <CountList rows={UPCOMING} money={money} dots={false} />
          </Card>
        </div>

        {showShortcuts && (
          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 8 }}>Keyboard shortcuts</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {SHORTCUTS.map((s) => (
                <span key={s.key}>
                  <strong style={{ color: 'var(--text)' }}>{s.key}</strong> — {s.label}
                </span>
              ))}
              <span><strong style={{ color: 'var(--text)' }}>Esc</strong> — close / exit</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── default view ───────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="calendar"
        title="Calendar"
        description="Plan resources, track availability, and manage operational schedules."
        actions={
          <>
            {navButtons}
            <Button icon="settings" onClick={() => setShowFilters((v) => !v)}>{showFilters ? 'Hide Filters' : 'Filters'}</Button>
            <Button icon="eye" onClick={() => setFull(true)}>Full View</Button>
            <Button icon="plus" variant="primary" onClick={() => navigate('/rentals/new')}>
              New Rental
            </Button>
          </>
        }
      />

      {/* KPI band — the render's four cards, with their footer links wired. */}
      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        {KPIS.map((k) => (
          <article key={k.label} className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {/* The one literal on this screen. `KpiStrip` in `components/ui/Page.tsx`
                  paints its tile glyph the same way, and `theme.css` has no
                  theme-invariant white token to point at — every candidate
                  (--card, --text, --st-out-fg) inverts between themes and would
                  put dark ink on a saturated fill in one of them. */}
              <span style={{ width: 30, height: 30, borderRadius: 8, background: BRAND[k.accent], color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={k.icon} size={16} fill />
              </span>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {k.label}
              </div>
            </div>
            <div className="kpi-value" style={{ marginTop: 9, fontSize: 'clamp(16px, 1.5vw, 22px)', color: 'var(--text)', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              {k.value}
            </div>
            <div style={{ marginTop: 7, fontSize: 'var(--t-th)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {k.delta && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, color: k.delta.good ? 'var(--success-text)' : 'var(--danger-text)' }}>
                  <Icon name={k.delta.direction === 'up' ? 'arrow_up' : 'arrow_down'} size={11} fill />
                  {k.delta.text}
                </span>
              )}
              <span style={{ color: 'var(--muted)' }}>{k.note}</span>
            </div>
            {k.hint && (
              <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                <Icon name="info" size={12} />
                {k.hint}
              </div>
            )}
            {k.link && (
              <button
                type="button"
                onClick={() => k.link && navigate(k.link.to)}
                style={{ marginTop: 'auto', paddingTop: 8, background: 'none', border: 'none', color: 'var(--link)', fontSize: 'var(--t-th)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
              >
                {k.link.label}
                <Icon name="arrow_right" size={12} />
              </button>
            )}
            {k.label === 'Schedule Conflicts' && (
              <button
                type="button"
                onClick={showConflicts}
                style={{ marginTop: 'auto', paddingTop: 8, background: 'none', border: 'none', color: 'var(--link)', fontSize: 'var(--t-th)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
              >
                View Conflicts
                <Icon name="arrow_right" size={12} />
              </button>
            )}
          </article>
        ))}
      </section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {viewTabs}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {rowTypeControl}
          {clientControl}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{kindChips}</div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showFilters ? '230px minmax(0,1fr) 300px' : 'minmax(0,1fr) 300px',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {showFilters && filtersPanel}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {centre}
          {selected && <SelectedEventPanel bar={selected.bar} row={selected.row} onClose={() => setSelectedId(null)} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {railDefault}
          {shortcutsCard}
        </div>
      </div>

      {showShortcuts && (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 8 }}>Keyboard shortcuts</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            {SHORTCUTS.map((s) => (
              <span key={s.key}>
                <strong style={{ color: 'var(--text)' }}>{s.key}</strong> — {s.label}
              </span>
            ))}
            <span><strong style={{ color: 'var(--text)' }}>Esc</strong> — close / exit</span>
          </div>
        </div>
      )}

      <FooterNote extra={['Bookings are cancelled, never deleted']} />
    </div>
  )
}

const iconBtn = {
  width: 34,
  height: 34,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 'var(--r-btn)',
  border: '1px solid var(--btn-secondary-border)',
  background: 'var(--btn-secondary-bg)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
} as const
