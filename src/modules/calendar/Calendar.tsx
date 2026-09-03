import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Input, Select, EmptyState, TouchTarget } from '../../components/ui'
import { Card, PageHeader, Button, FooterNote, cardStyle, Rail } from '../../components/ui/Page'
import { BRAND } from '../../lib/status'
import { getBusinessToday, toBs, formatBs, formatBsOrAd, formatAd, formatAdMonth, adMonthDays, eachDay, isWeekend, BS_MONTHS } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { isIssuedBy } from '../../data/numbering'
import { useViewport } from '../../lib/device'
import type { Viewport } from '../../lib/device'
import {
  VIEWS,
  VIEWS_BY_WIDTH,
  DEFAULT_VIEW,
  ROW_TYPES,
  ROWS,
  BAR_STYLE,
  BAR_KINDS,
  CLIENTS,
  SAVED_VIEWS,
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
  LAYERS,
  layerOf,
  adDay,
  dayDiff,
} from '../../data/calendar'
import type { Bar, BarKind, LayerName, ResourceRow, RowType, ViewName } from '../../data/calendar'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/**
 * **Calendar Workspace** — built against `03 Core Modules/Calendar.PNG` and
 * `Calendar - Full View.PNG`, then re-arranged to `05_CALENDAR.md`'s three
 * responsive layouts (12 Aug 2026).
 *
 * The two renders are two *modes of one screen*, not two routes: Full View
 * drops the app chrome, opens the filter rail and the Selected Event panel, and
 * moves the summary cards to a bottom strip. `full` below is that toggle — the
 * `⤢` button in the header and the `F` key both drive it, and `Esc` leaves.
 *
 * ## What §5.1 arranges
 *
 * | Width | Grid | A day click opens |
 * |---|---|---|
 * | Desktop ≥1280 | 7 columns, BS big / AD small, booking **chips** | a right **side-peek** |
 * | Tablet 768–1279 | 7 columns, chips truncate to a **dot** | a **bottom sheet** |
 * | Phone <768 | dots only | the **agenda list below the grid** |
 *
 * Per `WIREFRAME_RULINGS_2026-08-12.md` §1 the wireframe is a **layout** spec,
 * not a content inventory: the right rail, the Full View mode and the filter
 * panel survive because no prose removes them. Below 1280 the rail **reflows**
 * beneath the grid (§7: *"collapse means reflow, not hide"*) — it is not
 * wrapped in `CollapsibleAside`, whose defaults other pages depend on.
 *
 * Structural rules that outrank the renders:
 *  · §4.1 columns are **generated** from a range, never hand-listed — which is
 *    what makes the zoom steps and the mini-calendar real controls rather than
 *    decoration.
 *  · §4.2 every BS date comes from the **one** Date Engine (`lib/bs.ts`), and
 *    every date shows **both** calendars. The renders label this week
 *    "10–16 Shrawan"; the engine's anchor makes it 11–17 and the engine wins.
 *  · §4.3 one `today` per render — marker, summary and mini-calendar agree.
 *  · §4.2's five-colour law — the renders' purple Sub-Rental bars become the
 *    gold outline §4.2 reserves for sub-rental.
 *  · §8.3 — Warehouse sees no money. `Payment Due` is omitted, not masked.
 *  · Law 11 — never colour alone. A grid dot is never the only carrier of a
 *    status: every cell states its jobs in its accessible name and every dot
 *    carries the kind and the booking in its title.
 *
 * **The KPI band is gone, removed 30 Aug 2026 at the owner's instruction.**
 * Rulings §1 had listed it by name in the Kept column, and it was deleted once
 * before — on 12 Aug, silently, under a false note claiming Full View's strip
 * still carried its figures. `__tests__/calendar.kpiBand.test.tsx` existed to
 * make that impossible to repeat. This removal is the opposite case: asked for
 * directly, so the ruling, the guard test and the band retire together rather
 * than the code drifting from a ruling that still says Kept.
 *
 * What that band held, and where it stands now: Active Bookings and Today's
 * Operations existed nowhere else and are gone with it; Equipment Utilization
 * was a `NotTracked` placeholder, never a figure; Schedule Conflicts survives
 * on the Full View strip, where it was already duplicated.
 */

const LABEL_W = 212

/** Law 15 — 44×44 at every width, desktop included. */
const TOUCH = 44

/**
 * The one reason the month arrows do not move, stated once and rendered on the
 * page face rather than hidden in a `title`.
 *
 * `lib/bs.ts` vouches for **Shrawan 2083 only** (`SHRAWAN_2083_DAYS = 32`), so
 * stepping a month needs the lengths of Ashadh and Bhadra 2083. Those are
 * calendar *data*: `PLAN.md` §4.4 says in terms that they are "not something to
 * infer", and inferring them would put a wrong Nepali date in front of a client
 * — the defect `Calendar.md` §4.2 calls the highest-priority correctness bug in
 * the product. The arrows therefore ship disabled with the reason visible until
 * the 2000–2100 BS table is loaded.
 */
const MONTH_STEP_BLOCKED =
  'The Date Engine vouches for Shrawan 2083 only. Stepping a month needs the neighbouring BS month lengths, which are calendar data and are never inferred here (PLAN.md §4.4).'

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

/**
 * Reads `?d=YYYY-MM-DD` into a UTC-midnight AD date.
 *
 * Returns `null` for anything that is not a real AD date — a malformed string,
 * or the `2026-07-32` that Today's next-day button used to emit before its own
 * day arithmetic was fixed. A bad parameter falls back to today rather than
 * throwing or rendering a blank grid.
 *
 * A valid AD date is accepted whether or not `toBs` can name it: the BS table
 * ends on 16 Aug 2026 (PLAN.md §4.34), and refusing every later `?d=` sent a
 * link to 17 Aug back to today while the grid below rendered empty anyway. The
 * month helpers fall back to the AD month for such an anchor.
 */
function requestedDay(raw: string | null): Date | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ad = new Date(Date.UTC(y, mo - 1, d))
  // Rejects overflow like 2026-07-32, which Date would roll into August.
  if (ad.getUTCMonth() !== mo - 1 || ad.getUTCDate() !== d) return null
  return ad
}

/* ── 3.7 · the other filters live in the URL too ─────────────────────────
 * `?d=` made a *date* linkable; these make the rest of the filter state
 * shareable the same way — `?view=` `?type=` `?client=` `?res=` `?kind=` `?q=`
 * — per the house pattern (Inventory `?tab=`, OperationsQueues `patch()`).
 * Every reader validates against the real vocabulary and falls back to the
 * default, so a stale or hand-mangled parameter filters to "All" rather than
 * rendering a blank grid or an impossible chip.
 */

/** `"Warehouse Bays"` → `"warehouse-bays"` — the URL spelling of a display name. */
function urlSlug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-')
}

/** `?view=` → a real ViewName. A stale value lands on the default, never a blank tab. */
function viewFromParam(raw: string | null): ViewName {
  return VIEWS.find((v) => urlSlug(v) === raw) ?? DEFAULT_VIEW
}

function rowTypeFromParam(raw: string | null): 'All' | RowType {
  return ROW_TYPES.find((t) => urlSlug(t) === raw) ?? 'All'
}

/** `?kind=on-rent,conflict` → the valid subset, silently dropping what no longer exists. */
function kindsFromParam(raw: string | null): Set<BarKind> {
  if (!raw) return new Set()
  const bits = raw.split(',')
  return new Set(BAR_KINDS.filter((k) => bits.includes(urlSlug(k))))
}

/** The `?kind=` value for a set — `null` (delete the key) when nothing is selected. */
function kindsToParam(next: ReadonlySet<BarKind>): string | null {
  if (next.size === 0) return null
  return BAR_KINDS.filter((k) => next.has(k)).map(urlSlug).join(',')
}

/** `?client=` carries the display name; anything not in the seed list is "All". */
function clientFromParam(raw: string | null): string {
  return raw && CLIENTS.includes(raw) ? raw : 'All'
}

/** `?res=` carries a row id; a stale id is "All" rather than an empty timeline. */
function resourceFromParam(raw: string | null): string {
  return raw && ROWS.some((r) => r.id === raw) ? raw : 'All'
}

/** Where the window starts so `day` is visible — one column in, as the render shows. */
function anchorFor(day: Date | null): Date {
  if (!day) return adDay(-1)
  return adDay(dayDiff(day, TODAY) - 1)
}

/**
 * Every AD day the engine can still name inside that BS month — or, when the
 * engine cannot name the anchor at all, every day of the anchor's **AD month**.
 *
 * `toBs` is null for any day after 16 Aug 2026 (PLAN.md §4.34), and this used
 * to return `[]` there, which left the Month view and the rail's mini month as
 * an empty grid with "—" for a heading. A month grid is never empty
 * (`lib/bs.ts`): the AD month is always known, so it is shown, labelled as AD.
 */
function bsMonthDays(from: Date): Date[] {
  if (!toBs(from)) return adMonthDays(from)
  const start = bsMonthStart(from)
  const out: Date[] = []
  for (let i = 0; i < 34; i += 1) {
    const d = adDay(dayDiff(start, TODAY) + i)
    if (!toBs(d)) break
    out.push(d)
  }
  return out
}

/**
 * "11 – 17 Shrawan 2083 BS" — collapsed only when the engine agrees it is one
 * month. Where either end has no BS name, the window is labelled by its AD
 * month(s) instead — "September 2026", no " BS" — and the day range stays on
 * the AD line every caller prints beneath this one.
 */
function bsRangeLabel(days: Date[]): string {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return '—'
  const a = toBs(first)
  const b = toBs(last)
  if (!a || !b) {
    const ma = formatAdMonth(first)
    const mb = formatAdMonth(last)
    return ma === mb ? ma : `${ma} – ${mb}`
  }
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

/** "Shrawan 2083" — the BS month a window sits in, with no day numbers; the AD month ("September 2026") where BS is null. */
function bsMonthLabel(days: Date[]): string {
  const first = days[0] ?? TODAY
  const bs = toBs(first)
  return bs ? `${BS_MONTHS[bs.month - 1] ?? ''} ${bs.year}` : formatAdMonth(first)
}

/**
 * "Jul–Aug 2026" — the AD months a BS month straddles, which is the second half
 * of §5.1's header stepper (`‹ Shrawan 2083 / Jul–Aug 2026 ›`).
 */
function adMonthSpanLabel(days: Date[]): string {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return '—'
  const mon = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Asia/Kathmandu' })
  const yr = (d: Date) => d.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Asia/Kathmandu' })
  if (yr(first) !== yr(last)) return `${mon(first)} ${yr(first)}–${mon(last)} ${yr(last)}`
  if (mon(first) === mon(last)) return `${mon(first)} ${yr(last)}`
  return `${mon(first)}–${mon(last)} ${yr(last)}`
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

function sameDay(a: Date | null, b: Date | null): boolean {
  return Boolean(a && b && a.getTime() === b.getTime())
}

/** A day is "off" when Nepal's weekend (Saturday) or a festival lands on it. */
function isOffDay(d: Date): boolean {
  return isWeekend(d) || holidayOn(d) !== null
}

/** Whether a bar's inclusive window covers this AD day. */
function coversDay(bar: Bar, d: Date): boolean {
  return d.getTime() >= bar.from.getTime() && d.getTime() <= bar.to.getTime()
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

/** One job on one day — the unit the peek, the sheet and the phone agenda all list. */
interface DayJob {
  row: ResourceRow
  bar: Bar
}

/**
 * The time §5.1's agenda row draws (`▪ time BR# client`) exists on a *booking*,
 * not on a bar: a bar carries an inclusive day window and nothing finer. So a
 * time is rendered **only** where the booking detail actually records one for
 * this day, and every other row shows the window instead. A plausible default
 * here would be a fabricated figure.
 */
function timeOn(bar: Bar, day: Date): { time: string; what: string } | null {
  const detail = EVENT_DETAIL[bar.label]
  if (!detail) return null
  if (detail.pickup.at.getTime() === day.getTime()) return { time: detail.pickup.time, what: 'Pickup' }
  if (detail.return.at.getTime() === day.getTime()) return { time: detail.return.time, what: 'Return' }
  return null
}

/* ── small shared bits ─────────────────────────────────────────────────── */

/**
 * Law 15 — every one of `chipBase`'s three call sites below is a real
 * `<button>` (the layer toggles, the kind filters, and Clear). It was 26px
 * tall, so the file's own `TOUCH = 44` constant applied everywhere except the
 * controls the operator presses most.
 */
const chipBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  minHeight: TOUCH,
  padding: '0 11px',
  borderRadius: 'var(--r-badge)',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap' as const,
}

/* Law 15 — hit area, not paint; `--tap` holds the number. Shared by the booking
   drawer's Selects and the full-view search field, all of them in wrapping flex
   rows rather than a fixed-height strip. */
const selectStyle = {
  minHeight: 'var(--tap)',
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
        borderRadius: 'var(--r-sm)',
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
        gap: 'var(--sp-sm)',
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

/**
 * A figure the product does not compute. §8 of the rulings register:
 * *"A number with no real source renders 'not tracked yet', never a plausible
 * default and never zero."*
 */
function NotTracked({ what, reason }: { what: string; reason: string }) {
  return (
    <div>
      <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--muted)' }}>
        not tracked yet
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
        {what} {reason}
      </p>
    </div>
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
  const when = bsFrom && bsTo
    ? `${formatBs(bsFrom)} – ${formatBs(bsTo)} · ${formatAd(bar.from)} – ${formatAd(bar.to)}`
    : `${formatAd(bar.from)} – ${formatAd(bar.to)}`
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
          className={isIssuedBy('BK', bar.label) || isIssuedBy('QT', bar.label) || isIssuedBy('CASE', bar.label) ? 'booking-id' : undefined}
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
            borderRadius: 'var(--r-badge)',
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
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
                      borderRadius: 'var(--r-badge)',
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
                  {bs ? bs.day : d.getUTCDate()}
                </span>
                {!compact && (
                  <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: today ? 'var(--text2)' : 'var(--muted)' }}>
                    {bs ? `${BS_MONTHS[bs.month - 1]} ${bs.year} BS` : formatAdMonth(d)}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '8px 10px', minWidth: 0, borderRight: '1px solid var(--border)' }}>
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

/**
 * One marker in a narrow cell. Law 11 — the shape and colour are decoration
 * (`aria-hidden` on the row); the meaning is carried by the cell's accessible
 * name and by each dot's `title`.
 */
function DayDot({ job }: { job: DayJob }) {
  const s = BAR_STYLE[job.bar.kind]
  return (
    <span
      title={`${job.bar.kind} · ${job.bar.label}${job.bar.sub ? ` · ${job.bar.sub}` : ''}`}
      style={{
        width: 7,
        height: 7,
        borderRadius: 'var(--r-badge)',
        flexShrink: 0,
        background: s.dash ? 'transparent' : s.line,
        border: `1.5px ${s.dash ? 'dashed' : 'solid'} ${s.line}`,
      }}
    />
  )
}

/**
 * §5.1's grid at all three widths.
 *
 * ⚠ **The spec contradicts itself on the phone cell** and this is the reading
 * taken. The Notes require *"BS leads AD in every cell"*; the phone box draws
 * `· · ▪ · ▪ · ·` with no digit anywhere. "Dots only" is read as **no booking
 * chips, only markers** — the BS day number (and the small AD day) stay, because
 * a dot grid with no day numbers gives the reader no way to tell which day a dot
 * sits on, and dropping the digits would also break the Notes' own BS-leads-AD
 * rule two lines above. Flagged for the spec owner rather than silently chosen.
 */
function MonthGrid({
  anchor,
  jobsOn,
  viewport,
  selectedDay,
  onPickDay,
}: {
  anchor: Date
  jobsOn: (d: Date) => DayJob[]
  viewport: Viewport
  selectedDay: Date | null
  onPickDay: (d: Date) => void
}) {
  const days = bsMonthDays(anchor)
  const first = days[0]
  const lead = first ? first.getUTCDay() : 0
  const head = toBs(first ?? anchor)
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'
  const cellMin = desktop ? 92 : phone ? 56 : 72
  const maxDots = desktop ? 0 : phone ? 4 : 6

  return (
    <div style={{ padding: phone ? 'var(--sp-sm)' : 'var(--sp-md)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: phone ? 3 : 6, marginBottom: 6 }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((w, i) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 'var(--t-th)', fontWeight: 600, color: i === 6 ? 'var(--danger-text)' : 'var(--muted)' }}>
            {phone ? w.slice(0, 1) : w}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: phone ? 3 : 6 }}>
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} aria-hidden style={{ minHeight: cellMin, borderRadius: 'var(--r-sm)', background: 'var(--card2)', opacity: 0.4 }} />
        ))}
        {days.map((d) => {
          const bs = toBs(d)
          const today = isToday(d)
          const picked = sameDay(d, selectedDay)
          const hol = holidayOn(d)
          const list = jobsOn(d)
          const dateName = bs ? `${formatBs(bs)}, ${formatAd(d)}` : formatAd(d)
          const jobNames = list.map((j) => `${j.bar.kind} ${j.bar.label}`).join(', ')
          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onPickDay(d)}
              aria-current={today ? 'date' : undefined}
              aria-pressed={picked}
              aria-label={`${dateName}${hol ? ` · ${hol.name}` : ''} — ${list.length === 0 ? 'no jobs' : `${list.length} job${list.length === 1 ? '' : 's'}: ${jobNames}`}`}
              title={`Open ${dateName}`}
              style={{
                minHeight: cellMin,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: phone ? 4 : 6,
                borderRadius: 'var(--r-sm)',
                textAlign: 'left',
                fontFamily: 'inherit',
                cursor: 'pointer',
                background: today ? 'var(--nav-active-bg)' : 'var(--card)',
                border: today ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
                boxShadow: picked ? '0 0 0 2px var(--nav-active-accent)' : 'none',
              }}
            >
              {/* §5.1 Notes — BS leads AD in every cell, at every width. */}
              <span
                style={{
                  display: 'flex',
                  flexDirection: phone ? 'column' : 'row',
                  alignItems: phone ? 'flex-start' : 'baseline',
                  gap: phone ? 0 : 5,
                  minWidth: 0,
                }}
              >
                <span
                  className="figure"
                  style={{
                    fontSize: 'var(--t-ui)',
                    fontWeight: 700,
                    lineHeight: 1.1,
                    color: today ? 'var(--nav-active-accent)' : isOffDay(d) ? 'var(--danger-text)' : 'var(--text)',
                  }}
                >
                  {bs ? bs.day : d.getUTCDate()}
                </span>
                <span
                  className="figure"
                  style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}
                >
                  {adShort(d)}
                </span>
              </span>

              {hol && !phone && (
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--danger-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {hol.name}
                </span>
              )}

              {desktop ? (
                <>
                  {/* Desktop keeps the booking chip — the widest cell is the only
                      one where the identifier is legible. */}
                  {list.slice(0, 2).map((j) => {
                    const s = BAR_STYLE[j.bar.kind]
                    return (
                      <span
                        key={j.bar.id}
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
                        {j.bar.label}
                      </span>
                    )
                  })}
                  {list.length > 2 && (
                    <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>+{list.length - 2} more</span>
                  )}
                </>
              ) : (
                /* Tablet and phone: the chip truncates to a dot. */
                <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', marginTop: 'auto' }}>
                  {list.slice(0, maxDots).map((j) => (
                    <DayDot key={j.bar.id} job={j} />
                  ))}
                  {list.length > maxDots && (
                    <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>+{list.length - maxDots}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p style={{ margin: '10px 2px 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        {head
          ? `${BS_MONTHS[head.month - 1]} ${head.year} BS · ${days.length} days the Date Engine can name.`
          : `${formatAdMonth(first ?? anchor)} · shown as the AD month because the BS month lengths for this period are not loaded yet (PLAN.md §4.34).`}{' '}
        {desktop ? 'Pick a day to peek at its jobs.' : phone ? 'Pick a day to load the agenda below.' : 'Pick a day to open its sheet.'}
      </p>
    </div>
  )
}

/* ── the day's jobs — peek (desktop) · sheet (tablet) · agenda (phone) ─── */

function DayJobRow({ job, day, onOpen }: { job: DayJob; day: Date; onOpen: (bookingNo: string) => void }) {
  const s = BAR_STYLE[job.bar.kind]
  const at = timeOn(job.bar, day)
  const openable = isIssuedBy('BK', job.bar.label)
  const body = (
    <>
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          marginTop: 4,
          flexShrink: 0,
          borderRadius: 'var(--r-badge)',
          background: s.dash ? 'transparent' : s.line,
          border: `1.5px ${s.dash ? 'dashed' : 'solid'} ${s.line}`,
        }}
      />
      <span style={{ minWidth: 0, flex: 1, lineHeight: 1.35 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          {/* A time only where the booking records one for this day. */}
          <span className="figure" style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
            {at ? `${at.time} ${at.what}` : `${bsShort(job.bar.from)} – ${bsShort(job.bar.to)}`}
          </span>
          <span
            className={openable ? 'booking-id' : undefined}
            style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}
          >
            {job.bar.label}
          </span>
        </span>
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {job.bar.client ?? job.bar.sub ?? job.row.name}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: s.fg }}>
          {s.icon && <Icon name={s.icon} size={12} />}
          {job.bar.kind} · {job.row.name}
        </span>
      </span>
      {openable && <Icon name="chevron_right" size={15} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 4 }} />}
    </>
  )

  const frame = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--sp-sm)',
    width: '100%',
    minHeight: TOUCH,
    padding: '9px 10px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
    background: 'var(--card2)',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  }

  if (!openable) return <div style={frame}>{body}</div>
  return (
    <button type="button" onClick={() => onOpen(job.bar.label)} title={`Open ${job.bar.label}`} style={{ ...frame, cursor: 'pointer' }}>
      {body}
    </button>
  )
}

function DayJobList({
  day,
  jobs,
  overlayNote,
  onOpen,
}: {
  day: Date
  jobs: DayJob[]
  overlayNote: boolean
  onOpen: (bookingNo: string) => void
}) {
  const hol = holidayOn(day)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      <div>
        <div style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.04em' }}>SELECTED DAY</div>
        {/* §4.2 — BS above AD, both from the one Date Engine. */}
        <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
          {formatBsOrAd(day)}
        </div>
        <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          {formatAd(day)} · {weekdayShort(day)}
        </div>
        {hol && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
            <Icon name="flag" size={12} />
            {hol.name}
          </div>
        )}
      </div>

      {jobs.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          No jobs on this day under the current filters.
        </p>
      ) : (
        jobs.map((j) => <DayJobRow key={j.bar.id} job={j} day={day} onOpen={onOpen} />)
      )}

      <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
        Session times are recorded on the booking; a calendar bar carries only its day window, so a row
        without a recorded time shows that window instead.
      </p>

      {overlayNote && (
        <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
          Crew, maintenance and transport layers are desktop-only (§5.1 Notes), so this list shows the booking
          layer only.
        </p>
      )}
    </div>
  )
}

/**
 * §5.1 — *"day click → right side-peek"* on desktop, *"day tap → bottom sheet,
 * not side-peek"* on tablet. One panel, two edges.
 *
 * This is deliberately not `CollapsibleAside`: that component's job is the
 * persistent page rail and other pages depend on its defaults. A peek is
 * transient and dismissable, so it gets its own shell here.
 */
function DaySheet({ side, onClose, children }: { side: 'right' | 'bottom'; onClose: () => void; children: ReactNode }) {
  const bottom = side === 'bottom'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: bottom ? 'flex-end' : 'stretch', justifyContent: bottom ? 'center' : 'flex-end' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.40)' }} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jobs on the selected day"
        style={{
          position: 'relative',
          zIndex: 1,
          width: bottom ? '100%' : 'min(360px, 100vw)',
          maxHeight: bottom ? '80vh' : '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          borderLeft: bottom ? 'none' : '1px solid var(--border)',
          borderTop: bottom ? '1px solid var(--border)' : 'none',
          borderRadius: bottom ? '16px 16px 0 0' : 0,
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)', padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Day</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            style={{ minWidth: TOUCH, minHeight: TOUCH, display: 'grid', placeItems: 'center', border: '1px solid transparent', background: 'transparent', color: 'var(--muted)', borderRadius: 'var(--r-btn)', cursor: 'pointer' }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-md)' }}>{children}</div>
      </div>
    </div>
  )
}

/* ── availability ──────────────────────────────────────────────────────── */

/**
 * §5.1 draws an `[Availability]` tab and subtitles the page "availability-first".
 *
 * Nothing in `src/lib/` computes availability — `PLAN.md` Phase 3 names it as an
 * open gap ("no stock/availability validator"). Deriving free/busy from `ROWS`
 * inside this component is exactly the Law 1 violation ("pages never implement
 * business logic") the plan says never comes back out of a component, and a
 * derived-here answer would disagree with the GiST constraint the moment real
 * data arrived. So the tab states the gap instead of inventing an answer.
 */
function AvailabilityPanel() {
  return (
    <Card bodyStyle={{ padding: 'var(--sp-md)' }}>
      <EmptyState
        icon={<Icon name="calendar_event" size={22} />}
        title="Availability is not computed yet"
        description="No engine answers “what is free between these two dates”, and this page may not work it out for itself — business logic lives in the engines, never in a screen (PLAN.md §0, law 1). The availability validator is a named open gap in PLAN.md Phase 3; this tab renders real free/busy the day it exists."
      />
      <p style={{ margin: '12px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
        Until then the Month and Timeline views show what is <em>booked</em>, which is a record, not a
        computed availability answer.
      </p>
    </Card>
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
          title={prevOk ? 'Previous month' : MONTH_STEP_BLOCKED}
          /* Law 14 — hit area, not paint. This month stepper is a bare 20px glyph
             at the left edge of the mini BS calendar's header; inflating the paint
             would give the card a chrome it does not want, and the row is
             `space-between` with a wide month label in the middle, so the invisible
             44 has nothing to collide with on either side. */
          style={{ position: 'relative', background: 'none', border: 'none', color: prevOk ? 'var(--text2)' : 'var(--disabled)', cursor: prevOk ? 'pointer' : 'not-allowed', display: 'flex', padding: 2 }}
        >
          <TouchTarget />
          <Icon name="chevron_left" size={16} />
        </button>
        <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>
          {head ? `${BS_MONTHS[head.month - 1]} ${head.year} BS` : formatAdMonth(first ?? anchor)}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!nextOk}
          title={nextOk ? 'Next month' : MONTH_STEP_BLOCKED}
          /* Same treatment as the Previous arrow above — see its note. */
          style={{ position: 'relative', background: 'none', border: 'none', color: nextOk ? 'var(--text2)' : 'var(--disabled)', cursor: nextOk ? 'pointer' : 'not-allowed', display: 'flex', padding: 2 }}
        >
          <TouchTarget />
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
          <span key={`lead-${i}`} aria-hidden style={{ height: TOUCH }} />
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
              title={`${bs ? `${formatBs(bs)} · ` : ''}${formatAd(d)}${hol ? ` · ${hol.name}` : ''}`}
              className="figure"
              style={{
                position: 'relative',
                // Law 15 — the mini-calendar's day cells are buttons, and on the
                // warehouse tablet they are the primary way to change the date.
                minHeight: TOUCH,
                borderRadius: 'var(--r-badge)',
                border: 'none',
                background: today ? 'var(--nav-active-accent)' : 'transparent',
                color: today ? 'var(--app)' : hol ? 'var(--danger-text)' : isWeekend(d) ? 'var(--danger-text)' : 'var(--text)',
                fontSize: 'var(--t-th)',
                fontWeight: today ? 700 : 500,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {bs ? bs.day : d.getUTCDate()}
              {busy.has(d.getTime()) && !today && (
                <span aria-hidden style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: 'var(--r-badge)', background: 'var(--primary)' }} />
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
        {HOLIDAYS.map((h) => {
          const a = toBs(h.from)
          const b = toBs(h.to)
          /* Outside the BS table the AD day and month stand in — never an em dash (bs.ts). */
          const [fd, td] = [h.from.getUTCDate(), h.to.getUTCDate()]
          const label = a && b ? (a.day === b.day ? `${a.day}` : `${a.day}-${b.day}`) : fd === td ? `${fd}` : `${fd}-${td}`
          const month = a ? BS_MONTHS[a.month - 1] : formatAdMonth(h.from)
          /* §4.2 — every date shows both calendars, BS above AD. */
          const ad = h.from.getTime() === h.to.getTime() ? formatAd(h.from) : `${adShort(h.from)} – ${formatAd(h.to)}`
          return (
            <div key={h.name} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
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
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
      <Icon name={icon} size={15} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>{label}</div>
        {/* BS above AD, both from the engine — §4.2. */}
        <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{formatBsOrAd(at)}</div>
        <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{formatAd(at)}, {time}</div>
      </div>
    </div>
  )
}

function SelectedEventPanel({ bar, row, onClose }: { bar: Bar; row: ResourceRow; onClose: () => void }) {
  const navigate = useNavigate()
  const detail = EVENT_DETAIL[bar.label]
  const skin = BAR_STYLE[bar.kind]
  return (
    <Card bodyStyle={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-sm)' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.04em' }}>SELECTED EVENT</div>
          <div className="booking-id" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>
            {bar.label}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', fontWeight: 700, /*
            `ink`, not `fg` — this label sits on a --card, not on the bar.

            Two wrongs preceded it. First a string comparison against a token
            NAME (`skin.fg === 'var(--st-out-fg)'`), written when On Rent was
            green and needed its ink overridden; On Rent is ORANGE under v4.1,
            so that branch painted the orange event's label green. Replacing it
            with `skin.fg` fixed the wrong colour but kept the wrong KIND of
            colour: `fg` is an on-colour, chosen to sit on its own fill, so on
            a card it renders near-black for the two dark-ink hues —
            Maintenance's #1C1405 on a dark card is effectively invisible.

            `BarSkin.ink` is the text-safe form, added for exactly this.
          */
          color: skin.ink }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 'var(--r-badge)', background: skin.line }} />
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
        {(detail?.equipment ?? [{ name: row.name, code: row.code ?? '', icon: row.icon }]).map((e) => (
          <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <IconTile name={e.icon} />
            <span style={{ minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
              {e.name} {e.code && <span className="serial" style={{ color: 'var(--muted)' }}>({e.code})</span>}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)' }}>
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
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <div>
            <div style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', marginBottom: 'var(--sp-xs)' }}>Crew</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {detail.crew.slice(0, 3).map((c) => (
                <span
                  key={c}
                  title={c}
                  style={{ width: 26, height: 26, borderRadius: 'var(--r-badge)', display: 'grid', placeItems: 'center', background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-th)', fontWeight: 700 }}
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

      {isIssuedBy('BK', bar.label) && (
        <Button icon="file" onClick={() => navigate(`/rentals/${bar.label}`)}>
          Open Booking
        </Button>
      )}
    </Card>
  )
}

/* ── screen ────────────────────────────────────────────────────────────── */

export default function Calendar() {
  const navigate = useNavigate()
  /* §8.3 — the shared hook, same call site as every other screen. It omits the
     money rows below; nothing here is masked. */
  const money = useCanViewMoney()

  /* Law 13/14 — width decides, and it is measured once here. No component
     below this line asks what kind of device it is running on. */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'

  const [params, setParams] = useSearchParams()
  const dParam = params.get('d')

  /* Merge-write one or more params; `null` deletes a key. `replace: true`
   * keeps tab flicks and search keystrokes out of the history stack
   * (OperationsQueues.tsx patch()). */
  const patch = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const merged = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(next)) {
            if (v === null) merged.delete(k)
            else merged.set(k, v)
          }
          return merged
        },
        { replace: true },
      )
    },
    [setParams],
  )

  /* 3.7 — the view tab and every filter are read from the URL, validated, and
     written back through `patch`. Local `useState` remains only for what is
     genuinely not shareable state: the transient UI (Full View, the filters
     panel, the day peek) and per-session view preferences (zoom, sort,
     overlays). */
  const viewChoice = viewFromParam(params.get('view'))
  const setViewChoice = useCallback(
    (v: ViewName) => patch({ view: v === DEFAULT_VIEW ? null : urlSlug(v) }),
    [patch],
  )

  const [fullChoice, setFullChoice] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)
  /**
   * The window's first day. `TODAY` sits one column in, as the render shows.
   *
   * Today's date pill, its prev/next day and month buttons and every cell of its
   * mini month all link here as `/calendar?d=YYYY-MM-DD`. This screen used to
   * read no query string at all, so all six landed on the same fixed week — the
   * controls navigated and scoped nothing. Anchoring the window on `d` is what
   * makes them mean what they say, and it makes a date linkable and shareable.
   */
  const [start, setStart] = useState<Date>(() => anchorFor(requestedDay(dParam)))
  /** The day the peek / sheet / phone agenda is showing. */
  const [dayChoice, setDayChoice] = useState<Date | null>(() => requestedDay(dParam))
  const rowType = rowTypeFromParam(params.get('type'))
  const client = clientFromParam(params.get('client'))
  const kinds = useMemo(() => kindsFromParam(params.get('kind')), [params])
  const resource = resourceFromParam(params.get('res'))
  const query = params.get('q') ?? ''
  /* The saved-view *label* stays local: the filters it applied are already in
     the URL, and a shared link reproduces them without claiming the name. */
  const [savedView, setSavedView] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>('group')
  const [showShortcuts, setShowShortcuts] = useState(false)
  /** §5.1 Notes — desktop-only overlays, all on by default so nothing is lost. */
  const [overlays, setOverlays] = useState<Set<LayerName>>(() => new Set<LayerName>(['Crew', 'Maintenance', 'Transport']))

  /* The tab row this width may show, and the view that survives it. Derived
     rather than synced through an effect, so a resize can never leave the page
     on a tab that is no longer rendered. */
  const allowedViews = VIEWS_BY_WIDTH[viewport]
  const view: ViewName = allowedViews.includes(viewChoice) ? viewChoice : DEFAULT_VIEW
  /* Full View is a desktop mode: it drops the app chrome for a wall display. */
  const full = fullChoice && desktop
  /* The phone layout always shows an agenda, so it falls back to today. */
  const day: Date | null = dayChoice ?? (phone ? TODAY : null)

  const dayCount = view === 'Week' ? 7 : zoom
  const days = useMemo(() => eachDay(start, dayCount), [start, dayCount])
  const monthDays = useMemo(() => bsMonthDays(start), [start])

  /** Walks `ZOOM_STEPS`; +1 widens the window, −1 narrows it. */
  const stepZoom = (dir: 1 | -1) => {
    setZoom((z) => {
      const at = ZOOM_STEPS.indexOf(z as (typeof ZOOM_STEPS)[number])
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (at === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : at) + dir))]
      return next ?? z
    })
  }

  const goToday = useCallback(() => {
    setStart(adDay(-1))
    setDayChoice(TODAY)
  }, [])

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
        else if (dayChoice && !phone) setDayChoice(null)
        else if (selectedId) setSelectedId(null)
        else if (full) setFullChoice(false)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'f' && desktop) setFullChoice((v) => !v)
      else if (k === 't') goToday()
      else if (k === 'r' && desktop) setViewChoice('Timeline')
      else if (e.key === '?') setShowShortcuts((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full, selectedId, showShortcuts, goToday, setViewChoice, dayChoice, phone, desktop])

  /* ── body scroll lock while an overlay is up ────────────────────────── */
  const dayOverlayOpen = Boolean(day) && !phone
  useEffect(() => {
    if (!full && !dayOverlayOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [full, dayOverlayOpen])

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

  /**
   * §5.1 Notes — the crew, maintenance and transport overlays are desktop-only,
   * so below 1280 the grid and the day list carry the booking layer alone and
   * say so in words rather than dropping rows silently.
   */
  const layerVisible = useCallback(
    (row: ResourceRow, bar: Bar): boolean => {
      const layer = layerOf(row, bar)
      if (!layer) return true
      return desktop && overlays.has(layer)
    },
    [desktop, overlays],
  )

  const jobsOn = useCallback(
    (d: Date): DayJob[] =>
      rows.flatMap((r) => r.bars.filter((b) => coversDay(b, d) && layerVisible(r, b)).map((bar) => ({ row: r, bar }))),
    [rows, layerVisible],
  )

  const dayJobs = useMemo(() => (day ? jobsOn(day) : []), [day, jobsOn])

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

  /**
   * The Full View strip's Conflicts figure, **counted from the rows on screen**
   * rather than typed. It read a hardcoded `4` while the seed carries two
   * conflict-class bars, so the card and the timeline it sits under disagreed.
   */
  const conflictCount = useMemo(
    () => ROWS.reduce((n, r) => n + r.bars.filter((b) => b.kind === 'Conflict' || b.kind === 'Case Escalation').length, 0),
    [],
  )

  /* Every filter write goes through `patch`, so each one is a URL edit —
     shareable, reload-proof, and out of the history stack. */
  const setQuery = (q: string) => patch({ q: q || null })

  const pickRowType = (t: 'All' | RowType) => {
    setSavedView(null)
    // Changing the row type always resets the single-resource filter, as the
    // old paired `setRowType`/`setResource('All')` calls did.
    patch({ type: t === 'All' ? null : urlSlug(t), res: null })
  }

  const pickClient = (c: string) => {
    setSavedView(null)
    patch({ client: c === 'All' ? null : c })
  }

  const pickResource = (id: string) => {
    setSavedView(null)
    patch({ res: id === 'All' ? null : id })
  }

  const clearAll = () => {
    setSavedView(null)
    patch({ type: null, client: null, res: null, kind: null, q: null })
  }

  const applySavedView = (name: string) => {
    const v = SAVED_VIEWS.find((s) => s.name === name)
    if (!v) return
    setSavedView(name)
    patch({
      type: v.rowType === 'All' ? null : urlSlug(v.rowType),
      kind: kindsToParam(new Set(v.kinds)),
      client: null,
      res: null,
    })
  }

  const toggleKind = (k: BarKind) => {
    setSavedView(null)
    const next = new Set(kinds)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    patch({ kind: kindsToParam(next) })
  }

  const toggleLayer = (l: LayerName) => {
    setOverlays((prev) => {
      const next = new Set(prev)
      if (next.has(l)) next.delete(l)
      else next.add(l)
      return next
    })
  }

  const showConflicts = () => {
    setSavedView('Conflict View')
    patch({ type: null, kind: kindsToParam(new Set<BarKind>(['Conflict', 'Case Escalation'])) })
    setShowFilters(true)
  }

  const runQuickAction = (a: (typeof QUICK_ACTIONS)[number]) => {
    if (a.action === 'conflicts') showConflicts()
    else if (a.to) navigate(a.to)
  }

  const pickDay = (d: Date) => {
    setStart(anchorFor(d))
    setDayChoice(d)
  }

  /* ── shared fragments ───────────────────────────────────────────────── */

  const rangePill = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-sm)',
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

  /**
   * §5.1's header stepper — `‹ Shrawan 2083 / Jul–Aug 2026 ›`.
   *
   * Both arrows are permanently disabled and the reason is printed under them.
   * See `MONTH_STEP_BLOCKED`: making them move needs real BS calendar data, and
   * inventing that data is the one failure this screen is most likely to ship.
   */
  const monthStepper = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
      <button type="button" disabled aria-disabled title={MONTH_STEP_BLOCKED} aria-label="Previous month (unavailable)" style={iconBtnOff}>
        <Icon name="chevron_left" size={15} />
      </button>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          // Matches the two steppers either side, which are now a full `--tap` box.
          height: 'var(--tap)',
          padding: '0 11px',
          borderRadius: 'var(--r-btn)',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          lineHeight: 1.2,
        }}
      >
        <span style={{ textAlign: 'left' }}>
          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
            {bsMonthLabel(monthDays)}
          </span>
          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            {adMonthSpanLabel(monthDays)}
          </span>
        </span>
      </span>
      <button type="button" disabled aria-disabled title={MONTH_STEP_BLOCKED} aria-label="Next month (unavailable)" style={iconBtnOff}>
        <Icon name="chevron_right" size={15} />
      </button>
    </span>
  )

  const monthOnly = view === 'Month' || view === 'Availability'

  const navButtons = (
    <>
      <Button onClick={goToday}>Today</Button>
      {monthOnly ? (
        monthStepper
      ) : (
        <>
          <span style={{ display: 'inline-flex', gap: 'var(--sp-xs)' }}>
            <button type="button" onClick={() => shift(-1)} title="Previous range" aria-label="Previous range" style={iconBtn}>
              <Icon name="chevron_left" size={15} />
            </button>
            <button type="button" onClick={() => shift(1)} title="Next range" aria-label="Next range" style={iconBtn}>
              <Icon name="chevron_right" size={15} />
            </button>
          </span>
          {rangePill}
        </>
      )}
    </>
  )

  const monthStepNote = monthOnly && (
    <p role="note" style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5, maxWidth: 760 }}>
      <Icon name="info" size={12} style={{ verticalAlign: '-1px', marginRight: 5 }} />
      {MONTH_STEP_BLOCKED}
    </p>
  )

  /* §5.1 draws four tabs at desktop, two at tablet and none at phone. */
  const viewTabs = allowedViews.length > 1 && (
    <span role="tablist" aria-label="Calendar view" style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 10, background: 'var(--card2)', border: '1px solid var(--border)' }}>
      {allowedViews.map((v) => {
        const on = view === v
        return (
          <button
            key={v}
            type="button"
            role="tab"
            onClick={() => setViewChoice(v)}
            aria-selected={on}
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

  /** §5.1 Notes — desktop only. Below 1280 the note in the grid says why. */
  const layerToggles = desktop && view === 'Month' && (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Layers</span>
      {LAYERS.map((l) => {
        const on = overlays.has(l.name)
        return (
          <button
            key={l.name}
            type="button"
            onClick={() => toggleLayer(l.name)}
            aria-pressed={on}
            title={on ? `Hide the ${l.label.toLowerCase()} layer` : `Show the ${l.label.toLowerCase()} layer`}
            style={{
              ...chipBase,
              border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
              background: on ? 'var(--nav-active-bg)' : 'transparent',
              color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
            }}
          >
            <Icon name={l.icon} size={12} />
            {l.label}
            <Icon name={on ? 'check' : 'close'} size={11} />
          </button>
        )
      })}
    </span>
  )

  const rowTypeControl = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Row Type</span>
      <Select
        value={rowType}
        onChange={(e) => pickRowType(e.target.value as 'All' | RowType)}
        style={selectStyle}
        aria-label="Row type"
      >
        <option value="All">All Resources</option>
        {ROW_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </Select>
    </span>
  )

  const clientControl = (
    <Select value={client} onChange={(e) => pickClient(e.target.value)} style={selectStyle} aria-label="Client">
      <option value="All">All Clients</option>
      {CLIENTS.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </Select>
  )

  const zoomControl = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>Zoom</span>
      <button type="button" onClick={() => stepZoom(1)} title="Show more days" style={iconBtnCompact} aria-label="Zoom out">
        <TouchTarget />
        <Icon name="chevron_down" size={14} />
      </button>
      <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', minWidth: 46, textAlign: 'center' }}>
        {dayCount} days
      </span>
      <button type="button" onClick={() => stepZoom(-1)} title="Show fewer days" style={iconBtnCompact} aria-label="Zoom in">
        <TouchTarget />
        <Icon name="chevron_up" size={14} />
      </button>
      <button type="button" onClick={() => { setZoom(DEFAULT_ZOOM); goToday() }} title="Back to a 7-day window on today" style={{ ...iconBtnCompact, width: 'auto', padding: '0 9px', fontSize: 'var(--t-th)', fontWeight: 600 }}>
        {/* `TouchTarget` uses `max(100%, var(--tap))`, so this one keeps its own
            text width and only the short axis is inflated to the floor. */}
        <TouchTarget />
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
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 'var(--r-badge)', background: s.dash ? 'transparent' : s.line, border: `1.5px ${s.dash ? 'dashed' : 'solid'} ${s.line}` }} />
            {k}
          </button>
        )
      })}
      {kinds.size > 0 && (
        <button type="button" onClick={() => patch({ kind: null })} style={{ ...chipBase, border: '1px solid var(--border)', background: 'transparent', color: 'var(--link)' }}>
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
        <Input
          icon={<Icon name="search" size={13} />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Booking, equipment, client, crew…"
          style={{ ...selectStyle, width: '100%', cursor: 'text' }}
        />
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
        <Select
          value={rowType}
          onChange={(e) => pickRowType(e.target.value as 'All' | RowType)}
          style={{ ...selectStyle, width: '100%' }}
          aria-label="Resource type"
        >
          <option value="All">All Resources</option>
          {ROW_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </label>

      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginBottom: 5 }}>Resource</span>
        <Select value={resource} onChange={(e) => pickResource(e.target.value)} style={{ ...selectStyle, width: '100%' }} aria-label="Resource">
          <option value="All">All</option>
          {ROWS.filter((r) => rowType === 'All' || r.type === rowType).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
      </label>

      <div>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 'var(--sp-sm)' }}>Saved Views</div>
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
                  borderRadius: 'var(--r-sm)',
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
        <span style={{ marginLeft: 'auto' }}>{view === 'Timeline' ? zoomControl : <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{view} view · fixed window</span>}</span>
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
        <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700 }}>{bsRangeLabel(monthDays)}</span>
        <span className="figure" style={{ marginLeft: 'auto', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{adRangeLabel(monthDays)}</span>
      </div>
      <MonthGrid anchor={start} jobsOn={jobsOn} viewport={viewport} selectedDay={day} onPickDay={pickDay} />
      {!desktop && (
        <p style={{ margin: 0, padding: '0 var(--sp-md) var(--sp-sm)', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          Chips truncate to a dot below 1280, and the crew, maintenance and transport layers are desktop-only
          (§5.1 Notes) — this grid shows the booking layer.
        </p>
      )}
      {markerLegend}
    </Card>
  )

  const centre = view === 'Availability' ? <AvailabilityPanel /> : view === 'Month' ? monthCard : timelineCard

  const shortcutsCard = (
    <Card bodyStyle={{ padding: 14 }}>
      <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 10 }}>Shortcuts</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-sm)' }}>
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
      <MiniMonth anchor={start} onPickDay={pickDay} busy={busyDays} />
      <FestivalCard />
      <Card bodyStyle={{ padding: 14 }}>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Today&apos;s Summary</div>
        <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', margin: '2px 0 10px' }}>
          {(() => {
            const bs = toBs(TODAY)
            return bs ? `${formatBs(bs)} (${formatAd(TODAY)})` : formatAd(TODAY)
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-sm)' }}>
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
                  minHeight: TOUCH,
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

  /** The day peek, in whichever shell this width calls for. */
  const dayJobList = day && (
    <DayJobList day={day} jobs={dayJobs} overlayNote={!desktop} onOpen={(no) => navigate(`/rentals/${no}`)} />
  )

  const dayOverlay = day && !phone && (
    <DaySheet side={desktop ? 'right' : 'bottom'} onClose={() => setDayChoice(null)}>
      {dayJobList}
    </DaySheet>
  )

  /* ── full view overlay ──────────────────────────────────────────────── */

  if (full) {
    return (
      <div
        role="dialog"
        aria-label="Calendar — full view"
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--app)', overflow: 'auto', padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--t-h2)', fontWeight: 700 }}>Calendar</h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-sm)', marginLeft: 10 }}>{navButtons}</span>
          <span style={{ marginLeft: 'auto' }}>
            <Input
              icon={<Icon name="search" size={14} />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search booking, equipment, client, crew…"
              style={{ ...selectStyle, height: 34, width: 300, cursor: 'text' }}
            />
          </span>
          <Button icon="settings" onClick={() => setShowFilters((v) => !v)}>{showFilters ? 'Hide Filters' : 'Filters'}</Button>
          <Button icon="close" onClick={() => setFullChoice(false)}>Exit Full View</Button>
        </div>

        {monthStepNote}

        <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center', flexWrap: 'wrap' }}>
          {viewTabs}
          {layerToggles}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {rowTypeControl}
            {clientControl}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: showFilters ? '230px minmax(0,1fr) auto' : 'minmax(0,1fr) auto',
            gap: 'var(--sp-md)',
            alignItems: 'start',
          }}
        >
          {showFilters && filtersPanel}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>{centre}</div>
          <Rail width={300} label="Event detail">
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
                  const openable = isIssuedBy('BK', bookingNo)
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
          </Rail>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
          <Card bodyStyle={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Today&apos;s Summary</div>
            <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', margin: '2px 0 10px' }}>
              {(() => {
                const bs = toBs(TODAY)
                return bs ? `${formatBs(bs)} (${formatAd(TODAY)})` : formatAd(TODAY)
              })()}
            </div>
            <CountList rows={TODAY_SUMMARY} money={money} dots />
          </Card>
          <Card bodyStyle={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 'var(--sp-sm)' }}>Conflicts</div>
            <div className="kpi-value" style={{ fontSize: 'var(--t-kpi)', color: conflictCount > 0 ? 'var(--danger-text)' : 'var(--text)' }}>
              {conflictCount}
            </div>
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', margin: '4px 0 10px' }}>
              {conflictCount > 0 ? 'Requires attention' : 'Nothing double-booked or escalated'}
            </div>
            <Button icon="alert_triangle" onClick={showConflicts}>View Conflicts</Button>
          </Card>
          <Card bodyStyle={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 'var(--sp-sm)' }}>
              Utilization <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 'var(--t-th)' }}>(This Month)</span>
            </div>
            {/* Was a hand-typed 84% with a bar drawn to match and a caption
                claiming it agreed with Today and Inventory. Nothing computes
                utilization anywhere in the repo, so it states that instead. */}
            <NotTracked
              what="Utilization"
              reason="has no source: no engine computes utilised days against available days, and this screen may not derive one (law 1)."
            />
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
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 'var(--sp-sm)' }}>Keyboard shortcuts</div>
            <div style={{ display: 'flex', gap: 'var(--sp-lg)', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {SHORTCUTS.map((s) => (
                <span key={s.key}>
                  <strong style={{ color: 'var(--text)' }}>{s.key}</strong> — {s.label}
                </span>
              ))}
              <span><strong style={{ color: 'var(--text)' }}>Esc</strong> — close / exit</span>
            </div>
          </div>
        )}

        {dayOverlay}
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
            {/* Full View drops the app chrome for a wall display — a desktop mode. */}
            {desktop && <Button icon="eye" onClick={() => setFullChoice(true)}>Full View</Button>}
            <Button icon="plus" variant="primary" onClick={() => navigate('/rentals/new')}>
              New Rental
            </Button>
          </>
        }
      />

      {monthStepNote}

      {/* The four-card KPI band that sat here (Active Bookings, Today's
          Operations, Equipment Utilization, Schedule Conflicts) was removed on
          30 Aug 2026 at the owner's instruction. It had been listed by name in
          Rulings §1's Kept column and guarded by
          `__tests__/calendar.kpiBand.test.tsx`; both are retired with it, so the
          ruling and the code do not disagree. Conflicts survives on the Full
          View strip below, which is where it was already duplicated.

          ⚠ Keep this note inside a JSX expression. Written as a bare block
          comment in a JSX children position it is a string literal, and it
          rendered on the calendar as visible body text. */}

      {(viewTabs || layerToggles || desktop) && (
        <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center', flexWrap: 'wrap' }}>
          {viewTabs}
          {layerToggles}
          {/* Below 1280 these two live in the Filters panel instead of doubling
              in the header — the same controls, one place. */}
          {desktop && (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {rowTypeControl}
              {clientControl}
            </span>
          )}
        </div>
      )}

      {/* The event-type chip row is a desktop affordance; §5.1 puts filters
          behind `[filters ▾]`, and twelve chips ahead of the grid on a phone is
          a scroll, not a filter. Below 1280 they render inside Filters. */}
      {desktop && <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', flexWrap: 'wrap' }}>{kindChips}</div>}

      {desktop ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: showFilters ? '230px minmax(0,1fr) auto' : 'minmax(0,1fr) auto',
            gap: 'var(--sp-md)',
            alignItems: 'start',
          }}
        >
          {showFilters && filtersPanel}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {centre}
            {selected && <SelectedEventPanel bar={selected.bar} row={selected.row} onClose={() => setSelectedId(null)} />}
          </div>
          <Rail width={300} label="Event detail">
            {railDefault}
            {shortcutsCard}
          </Rail>
        </div>
      ) : (
        /* Tablet and phone: the rail **reflows** beneath the grid rather than
           hiding behind a handle (rulings §7). `CollapsibleAside` is deliberately
           not used here and its defaults are untouched. */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {showFilters && filtersPanel}
          {centre}
          {selected && <SelectedEventPanel bar={selected.bar} row={selected.row} onClose={() => setSelectedId(null)} />}

          {/* §5.1 phone — the selected-day agenda sits under the grid, not in a sheet. */}
          {phone && day && <Card bodyStyle={{ padding: 'var(--sp-md)' }}>{dayJobList}</Card>}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: phone ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))',
              gap: 'var(--sp-md)',
              alignItems: 'start',
            }}
          >
            {railDefault}
            {shortcutsCard}
          </div>
        </div>
      )}

      {showShortcuts && (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 'var(--sp-sm)' }}>Keyboard shortcuts</div>
          <div style={{ display: 'flex', gap: 'var(--sp-lg)', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
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

      {dayOverlay}
    </div>
  )
}

/**
 * §5 — "Icon buttons 44×44, always `aria-label`".
 *
 * This was 34×34 and the header it sits in was already 44 tall, because every
 * `Button` beside it carries `minHeight: 44`. So the paint had room to grow to
 * the floor for free: the range steppers and the month steppers now match the
 * height of the Today / Filters / New Rental buttons they sit between instead
 * of being visibly short of them, and nothing gets pushed down.
 *
 * Growing the paint also disposes of the hazard the alternative carries. Two
 * arrows 4px apart, each given an invisible 44-wide target, would have had
 * overlapping targets with the later one in the DOM winning — a Previous-range
 * button whose right edge silently steps forward. A real 44 box has no
 * invisible half to collide.
 */
const iconBtn = {
  width: 'var(--tap)',
  height: 'var(--tap)',
  display: 'grid',
  placeItems: 'center',
  borderRadius: 'var(--r-btn)',
  border: '1px solid var(--btn-secondary-border)',
  background: 'var(--btn-secondary-bg)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
} as const

/**
 * The §5 compact exception, for the timeline strip only.
 *
 * The zoom cluster does NOT live in a 44-tall row — it sits in the timeline
 * card's own header, a 9px-padded strip whose tallest occupant is a two-line
 * BS/AD label, ~46px all in. Taking the paint to 44 there would push that strip
 * to ~62 and eat a row of the timeline itself, which is the density §60 asks
 * for. So this is the case §5 wrote the exception for: **the paint stays 34 and
 * the HIT AREA goes to 44** via `TouchTarget`, which needs the `position:
 * relative` below to anchor against.
 */
const iconBtnCompact = {
  ...iconBtn,
  width: 34,
  height: 34,
  position: 'relative',
} as const

/** The same control, permanently unavailable and saying so. */
const iconBtnOff = {
  ...iconBtn,
  color: 'var(--disabled)',
  borderStyle: 'dashed',
  cursor: 'not-allowed',
} as const
