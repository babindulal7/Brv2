import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Input, Select, EmptyState, TouchTarget, PageBody, CheckAvailabilityModal } from '../../components/ui'
import { Card, PageHeader, Button, FooterNote, cardStyle, Rail } from '../../components/ui/Page'
import { listInventory } from '../../lib/queries/inventory'
import { BRAND } from '../../lib/status'
import {
  getBusinessToday,
  toBs,
  formatBs,
  formatBsOrAd,
  formatAd,
  formatAdMonth,
  adMonthDays,
  adMonthStart,
  addAdMonths,
  eachDay,
  isWeekend,
  BS_MONTHS,
} from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import type { Viewport } from '../../lib/device'
import { useList } from '../../lib/queries/useList'
import type { ListQueryResult, ListResult } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import { CALENDAR_BAR_KINDS, calendarWindow, fetchCalendarBars } from '../../lib/queries/calendar'
import { listBookings } from '../../lib/queries/bookings'
import type { BookingListRow } from '../../lib/queries/bookings'
import { listInvoices } from '../../lib/queries/finance'
import type { InvoiceListRow } from '../../lib/queries/finance'
import {
  VIEWS,
  VIEWS_BY_WIDTH,
  DEFAULT_VIEW,
  ROW_TYPES,
  ROWS,
  BAR_STYLE,
  BAR_KINDS,
  SAVED_VIEWS,
  SAVED_VIEWS_NOT_AVAILABLE,
  HOLIDAYS_NOT_TRACKED,
  TODAY_SUMMARY,
  UPCOMING,
  UPCOMING_PERIOD,
  railBookingCounts,
  railInvoiceCounts,
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
  businessDayAd,
  type Bar,
  type BarKind,
  type CountKey,
  type CountSlot,
  type LaneRow,
  type ResourceRow,
  type RowType,
  type ViewName,
} from '../../lib/queries/calendar'

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
 * The one reason a **BS** month step does not move, stated once and rendered on
 * the page face rather than hidden in a `title`.
 *
 * `lib/bs.ts` vouches for **Shrawan 2083 only** (`SHRAWAN_2083_DAYS = 32`), so
 * stepping off it needs the lengths of Ashadh and Bhadra 2083. Those are
 * calendar *data*: `PLAN.md` §4.34 says in terms that they cannot be inferred,
 * and inferring them would put a wrong Nepali date in front of a client — the
 * defect `Calendar.md` §4.2 calls the highest-priority correctness bug in the
 * product.
 *
 * ⚠ This blocks **BS stepping only**, and saying otherwise cost the operator the
 * whole month view. Both header arrows shipped hard-coded `disabled`, and the
 * mini month's were gated on `toBs(target)` — which is null for every day after
 * 16 Aug 2026, i.e. for every day the grid is actually rendering. Month is the
 * default tab and the live-data surface, so the page had **no way at all** to
 * leave the current month.
 *
 * `bsMonthDays` already falls back to the AD month wherever `toBs` is null, and
 * an AD month's length is arithmetic, not a table — see `monthStepTarget`, which
 * steps that fallback exactly and invents nothing.
 */
const MONTH_STEP_BLOCKED =
  'The Date Engine vouches for Shrawan 2083 only, so stepping to the Nepali month either side of it needs the ' +
  'neighbouring BS month lengths — calendar data that is never inferred here (PLAN.md §4.34). Months outside ' +
  'that window are drawn and stepped as AD months.'

/**
 * The anchor one month away, or `null` when the step genuinely cannot be taken.
 *
 * Two cases, and only one of them is ever blocked:
 *
 *  · **The anchor has no BS name.** `bsMonthDays` is already drawing the
 *    anchor's **AD** month there, and an AD month's first day and length come
 *    from `Date` arithmetic (`adMonthStart` / `addAdMonths`), not from a table.
 *    So the step lands on the 1st of the neighbouring AD month, exactly, and no
 *    BS fact is needed, guessed or implied.
 *  · **The anchor has a BS name.** The grid is drawing a BS month, and stepping
 *    it needs the neighbouring BS month lengths — `MONTH_STEP_BLOCKED`. The
 *    engine is asked rather than assumed: if it can name the day one month-width
 *    away, the step is allowed; today it never can, because it vouches for one
 *    month, so this returns `null` and the arrow is disabled WITH the reason.
 *
 * Nothing here derives a BS month length. Stepping a BS month is either
 * answered by the engine or refused.
 */
function monthStepTarget(anchor: Date, dir: -1 | 1): Date | null {
  if (!toBs(anchor)) return addAdMonths(adMonthStart(anchor), dir)
  const width = bsMonthDays(anchor).length
  const target = adDay(dayDiff(anchor, TODAY) + dir * width)
  return toBs(target) ? target : null
}

/**
 * Lane order, shared by the two grids that have lanes.
 *
 * `group` is each view's own natural order and means something different in
 * each — resource type on the Timeline (Equipment, Vehicles, Crew, Warehouse
 * Bays, as the renders group them), start day on the Week, where lanes are
 * bookings and chronological is the order the week happens in. The
 * alphabetical sorts are opt-in, one click each, and mean the same thing in
 * both. The hint below is therefore worded without naming either, since one
 * control drives both grids.
 */
type SortMode = 'group' | 'asc' | 'desc'
const SORT_NEXT: Record<SortMode, SortMode> = { group: 'asc', asc: 'desc', desc: 'group' }
const SORT_HINT: Record<SortMode, string> = {
  group: 'In this view’s own order — click to sort A–Z',
  asc: 'Sorted A–Z — click to sort Z–A',
  desc: 'Sorted Z–A — click to return to this view’s own order',
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

/**
 * `?client=` carries the display name.
 *
 * ⛔ It used to be validated against `CLIENTS`, a five-name list derived from the
 * seed. That list is empty now — the clients on screen are whoever the live
 * bookings in the window belong to — and validating against a list that arrives
 * ASYNCHRONOUSLY would be worse than not validating at all: a shared link would
 * render "All Clients" for the first frame and then snap to the real filter, so
 * the URL and the screen would disagree for as long as the read took.
 *
 * So a non-empty parameter is taken at its word. The cost is bounded and
 * visible: a name matching no booking filters the grid to nothing and the empty
 * state says a filter is narrowing it, with Clear filters beside it. The
 * alternative — silently ignoring the parameter — loses the operator's filter
 * with no way to tell that it happened.
 */
function clientFromParam(raw: string | null): string {
  return raw && raw.trim().length > 0 ? raw : 'All'
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
 * The same anchor, **clamped to `day`'s own month**.
 *
 * `anchorFor`'s one-column-in offset is right for the Week and Timeline grids,
 * and wrong for the Month grid on exactly one day a month: `MonthGrid` and
 * `MiniMonth` both re-derive their month from this anchor, so on the **1st** the
 * offset lands in the month before and the calendar draws that month instead —
 * the day the operator asked for is not even on screen.
 *
 * That fired on a day click (a click on "1" jumped a month backwards), on the
 * initial anchor, and on Today, all through the same expression. So the offset
 * is kept wherever it stays inside the month and dropped where it would leave
 * it, once, here.
 */
function anchorShowing(day: Date): Date {
  const shifted = anchorFor(day)
  return bsMonthDays(shifted)[0]?.getTime() === bsMonthDays(day)[0]?.getTime() ? shifted : day
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

/**
 * A grid day → the `YYYY-MM-DD` the query takes.
 *
 * Every `Date` on this screen is a UTC-midnight AD day — `adDay`, `eachDay` and
 * `bsMonthDays` all produce them and nothing here ever holds an instant — so
 * the first ten characters of the ISO form are that calendar date exactly.
 * `lib/queries/calendar.ts` turns it into the operational-day boundary; no
 * timezone arithmetic happens on this side.
 */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return Boolean(a && b && a.getTime() === b.getTime())
}

/**
 * A day is "off" when Nepal's weekend (Saturday) lands on it.
 *
 * ⛔ It used to be `isWeekend(d) || holidayOn(d) !== null`, and the second half
 * shaded three days of the grid, coloured their numbers with the weekend's
 * `--danger-text` and printed a festival's name inside the cell — from three
 * dates typed into `data/calendar.ts` with no table anywhere in the schema
 * behind them, and with Dashain, an autumn festival, dated at the end of July.
 *
 * `holidayOn` is not called here any more, rather than called and always
 * answering `null`: a call site implies a source. Nepal's festival dates are BS
 * calendar data of the same class as the month lengths PLAN.md §4.34 refuses to
 * infer — see `ARCHIVED_RENDER_HOLIDAYS` for the `TODO(decision)` naming what a
 * real source would be. Until one exists the grid shades the weekend, which it
 * can prove, and says nothing about festivals, which it cannot.
 */
function isOffDay(d: Date): boolean {
  return isWeekend(d)
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

/**
 * One job on one day — the unit the peek, the sheet and the phone agenda all
 * list.
 *
 * `row` is **nullable**, and that nullability is what lets the month grid show
 * every live booking. A booking bar comes from `lib/queries/calendar.ts` and has
 * no resource row: the lane it would hang off needs `product_units`, which has
 * no rows on the live database. Requiring a row here would have meant either
 * dropping every live booking from the grid or inventing a lane to hang it on —
 * the two failures this screen was full of. `null` means "this job is not
 * attached to a resource", which is the truth, and every reader below handles it
 * by leaving the resource out rather than by substituting something.
 */
interface DayJob {
  row: ResourceRow | null
  bar: Bar
}

/**
 * The time §5.1's agenda row draws (`▪ time BR# client`) exists on a *booking*,
 * not on a bar: a bar carries an inclusive day window and nothing finer. So a
 * time is rendered **only** where the booking detail actually records one for
 * this day, and every other row shows the window instead. A plausible default
 * here would be a fabricated figure.
 *
 * `EVENT_DETAIL` is empty today — the render's one hand-written booking was
 * archived on 4 Sep because it was keyed by booking NUMBER and would have
 * attached invented crew, a vehicle and a shoot note to whichever live booking
 * happened to share it. So this returns `null` for every bar, and every agenda
 * row shows its window. It fills in when a per-booking read exists, not before.
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
        {/* The identifier face is for an issued identifier. A bar that carries a
            booking has one; a bar labelled "Cleaning" or "CONFLICT" does not,
            and `bar.bookingNo` is the bar's own answer rather than a guess made
            by pattern-matching its label. */}
        <span
          className={bar.bookingNo ? 'booking-id' : undefined}
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

/**
 * The day-column grid.
 *
 * Takes `LaneRow[]`, not `ResourceRow[]`, since 4 Sep 2026. The geometry — the
 * generated columns, the today marker, the clipping at both edges, the zoom —
 * is the same whether a lane is a camera or a booking, and the Week view now
 * draws one lane per live booking because the resource dimension has no rows.
 * Nothing here asks what a lane is; the callers do.
 */
function Timeline({
  rows,
  days,
  selectedId,
  onSelect,
  sort,
  onToggleSort,
  labelHeading,
  itemCount,
  emptyTitle,
  emptyBody,
  emptyAction,
}: {
  rows: LaneRow[]
  days: Date[]
  selectedId: string | null
  onSelect: (id: string) => void
  sort: SortMode
  onToggleSort: () => void
  labelHeading: string
  itemCount: number
  /** What an empty grid says. Passed in because "no lanes" means a different thing per view. */
  emptyTitle: string
  emptyBody: string
  /**
   * The control the empty copy asks for, when it asks for one.
   *
   * ⛔ The Week view's filtered-empty body read *"Clear an event type, widen the
   * client filter, or clear the search to see the whole week"* and rendered no
   * control at all — and below 1280 the chips it refers to are inside a Filters
   * panel that starts closed, so the instruction pointed at something the reader
   * could not reach. An empty state that names an action has to carry it.
   */
  emptyAction?: ReactNode
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
            const ink = today ? 'var(--nav-active-accent)' : off ? 'var(--danger-text)' : 'var(--text)'
            return (
              <div
                key={d.getTime()}
                aria-current={today ? 'date' : undefined}
                title={bs ? formatBs(bs) : undefined}
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
                <span
                  className={row.identifier ? 'booking-id' : undefined}
                  style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
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
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{emptyTitle}</div>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', maxWidth: 520, marginInline: 'auto', lineHeight: 1.5 }}>
              {emptyBody}
            </p>
            {emptyAction && <div style={{ marginTop: 12 }}>{emptyAction}</div>}
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
              aria-label={`${dateName} — ${list.length === 0 ? 'no jobs' : `${list.length} job${list.length === 1 ? '' : 's'}: ${jobNames}`}`}
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

              {/* A festival's name used to print here, from three dates typed
                  into a seed file with no table behind them. See `isOffDay`. */}

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
  /*
   * The row opens the booking it IS, or nothing.
   *
   * ⛔ This used to be `isIssuedBy('BK', job.bar.label)` — "does this bar's
   * LABEL look like a booking number". That is a guess about a string, and it
   * got the answer wrong in both directions the moment the grid went live: a
   * bar labelled with anything else was unopenable even when it belonged to a
   * booking, and any label matching `B-\d+` became a link to whatever
   * `/rentals/:bookingNo` resolved it to. `bookingNo` is the bar's own answer.
   */
  const bookingNo = job.bar.bookingNo ?? null
  const openable = bookingNo !== null
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
          {job.bar.client ?? job.bar.sub ?? job.row?.name ?? '—'}
        </span>
        {/* The resource is named only where there IS one. A live booking bar has
            no resource row (see `DayJob`), so the line is the kind alone rather
            than the kind plus a lane invented to fill the gap. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: s.fg }}>
          {s.icon && <Icon name={s.icon} size={12} />}
          {job.row ? `${job.bar.kind} · ${job.row.name}` : job.bar.kind}
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
    <button type="button" onClick={() => onOpen(bookingNo)} title={`Open ${bookingNo}`} style={{ ...frame, cursor: 'pointer' }}>
      {body}
    </button>
  )
}

function DayJobList({
  day,
  jobs,
  overlayNote,
  loading,
  error,
  filtered,
  onOpen,
}: {
  day: Date
  jobs: DayJob[]
  overlayNote: boolean
  /** The window's read is still in flight, so "no jobs" is not yet a fact. */
  loading: boolean
  /**
   * The window's read FAILED, in which case "no jobs" is not a fact either.
   *
   * ⛔ This prop did not exist. The panel took `loading` and `filtered` only, so
   * a failed read fell through to the last branch and the peek said *"Nothing is
   * booked for this day — no pickup, no return and nothing out."* — a business
   * assertion, in a confident sentence, produced by a query that never returned.
   * An operator reading it would leave gear on the shelf.
   *
   * Law 12 — the failure is stated inline and stays on screen; it is not a toast
   * and it does not replace the day's heading.
   */
  error: string | null
  /** Whether a filter is narrowing the grid, which decides which empty sentence is true. */
  filtered: boolean
  onOpen: (bookingNo: string) => void
}) {
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
        {/* A festival label used to sit here, from `data/calendar`'s invented
            holiday list. See `isOffDay` for the finding. */}
      </div>

      {/* Law 11 — the failure carries an icon and a sentence, never colour alone,
          and it sits above whatever rows survived rather than replacing them: a
          failed REFRESH must not blank a list someone is reading. */}
      {error && (
        <p
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            margin: 0,
            padding: '8px 9px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--danger)',
            background: 'var(--st-danger-bg)',
            fontSize: 'var(--t-th)',
            color: 'var(--danger-text)',
            lineHeight: 1.45,
          }}
        >
          <Icon name="alert_triangle" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            This day’s bookings could not be loaded, so this list is not a record of what is on. {error}
          </span>
        </p>
      )}

      {jobs.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
          {loading
            ? 'Loading this day’s bookings…'
            : error
              ? /* The read failed — this panel knows nothing about the day, and
                   must not say the day is empty. The banner above carries why. */
                'Nothing can be shown for this day until the read succeeds.'
              : filtered
                ? 'No jobs on this day match the current filters.'
                : 'Nothing is booked for this day — no pickup, no return and nothing out.'}
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
 * ## ⛔ What this panel used to say, and why every sentence of it was wrong
 *
 * It read: *"No engine answers 'what is free between these two dates'"*, and
 * called the availability validator *"a named open gap in PLAN.md Phase 3"*.
 * Both were true when they were written and neither is true now:
 *
 *  - `lib/availability.ts` exports `selectUnitsForLine` and `explainShortfall`
 *    — the pure engine, with the overlap convention and the disqualifying unit
 *    states ruled (§4.30);
 *  - `lib/queries/availability.ts` exports `planAssignment` and
 *    `reserveAssignedUnits` — the read and the write around it;
 *  - on **4 Sep 2026** an open-cleaning-entry exclusion was added and driven
 *    through a New Rental confirm, and the engine refused a named unit for a
 *    named window rather than reporting "none available".
 *
 * ⚠ The panel's copy used to QUOTE that refusal as
 * *"EQ000234-U01 is on the reset bench and has not been cleaned or reset yet"*.
 * The sentence template is real — `explainShortfall` in `lib/availability.ts`
 * builds exactly that shape from `assetTag` — but the tag in it is not: it is a
 * literal typed into `supabase/migrations/0047_seed_reference_corpus.sql`, and
 * `product_units` has 0 rows on this database, so no unit carries it. Nothing in
 * the app mints a `-U01` suffix either (`data/numbering.ts` has no unit sequence
 * at all). Quoting an example asset tag is inventing one, which is the class of
 * defect this whole change removes — so the panel now describes the shape of the
 * answer and quotes no tag.
 *
 * A screen that tells an operator no engine exists, while the engine is
 * rejecting their bookings by name, teaches them to distrust the screen.
 *
 * ## What is actually missing here, which is a different thing
 *
 * The engine answers a **per-booking** question: *can THIS booking's lines be
 * covered in THIS window* — one booking, its own lines, a yes/no with a reason.
 * This tab wants a **per-day-per-product free/busy grid**: for every product,
 * for every day on screen, how many units are free. That is a different shape,
 * and it needs a denominator the per-booking question never asks for — the
 * count of units that exist. `product_units` has 0 rows, so every cell of that
 * grid would divide by nothing.
 *
 * So this panel does not claim availability is unbuilt, and does not claim it
 * works here either. It says which question is answered where.
 */
function AvailabilityPanel({ onCheckAvailability }: { onCheckAvailability?: () => void }) {
  return (
    <Card bodyStyle={{ padding: 'var(--sp-md)' }}>
      <EmptyState
        icon={<Icon name="calendar_event" size={22} />}
        title="Check product availability"
        description="Inspect stock levels, active holds, and future capacity for any equipment item across custom rental windows."
        {...(onCheckAvailability ? { actionLabel: 'Check availability', onAction: onCheckAvailability } : {})}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', margin: '12px 0 0' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          Where the answer lives today: confirm a rental and the assignment step checks the window against
          every unit’s holds, its state and its cleaning bench, and states what is short.
        </p>
        <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          Month and Week show what is <em>booked</em>, which is a record of commitments rather than a computed
          answer about what is free.
        </p>
      </div>
    </Card>
  )
}

/**
 * What the Timeline tab says when it has no lanes, which is always, today.
 *
 * The view is neither broken nor unbuilt: the grid, the zoom, the clipping, the
 * sort and the overlays all work, and the day columns below the heading are real
 * dates that the zoom and the range arrows still move. What it lays out is a
 * *resource*, and every table a resource lane would come from is empty —
 * `product_units` (the lanes themselves), `booking_line_units` (the bars on
 * them), and `maintenance_records` / `cleaning_queue_entries` /
 * `crew_assignments` (the overlays). Two of those three have no writer anywhere
 * in `src/`; `cleaning_queue_entries` does — `actions/rentals/floorVerb.ts`
 * enqueues one row per returned unit on every Return — and is empty only
 * because no Return has been recorded against this database yet.
 *
 * Drawing `ARCHIVED_RENDER_ROWS` here instead — the transcription of the render,
 * with its camera van, its two crew and its two warehouse bays — is what this
 * screen did until 4 Sep 2026, and it was the most confident thing the product
 * asserted: a fleet, a roster and a warehouse layout, under today's date, with
 * serial numbers.
 *
 * The wording deliberately does not say "no results": nothing is being filtered
 * out, the rows do not exist.
 */
const TIMELINE_EMPTY_TITLE = 'No resources to lay out yet'
const TIMELINE_EMPTY_BODY =
  'A resource timeline draws one lane per physical item — this camera, that van, this bay — and no unit ' +
  'records exist yet, so there are no lanes to draw. Nothing is hidden by a filter here. Month and Week show ' +
  'the same bookings this view would, without the resource dimension: which booking, which client, and which ' +
  'days it covers.'

/* ── mini month (rail) ─────────────────────────────────────────────────── */

function MiniMonth({
  anchor,
  onPickDay,
  onStepMonth,
  busy,
}: {
  anchor: Date
  onPickDay: (d: Date) => void
  /**
   * Move the whole calendar a month. Separate from `onPickDay` on purpose: the
   * arrows used to call `onPickDay` with a day in the neighbouring month, which
   * *selected* that day and opened the peek as a side effect of navigating.
   * Stepping a month and choosing a day are two different intentions.
   */
  onStepMonth: (dir: -1 | 1) => void
  busy: Set<number>
}) {
  const days = bsMonthDays(anchor)
  const first = days[0]
  const lead = first ? first.getUTCDay() : 0
  const head = toBs(first ?? anchor)
  /*
   * ⛔ Both arrows were gated on `toBs(anchor ± this month's width)`, which is
   * null for every day after 16 Aug 2026 — so on the live grid they were always
   * dead. `monthStepTarget` blocks only the BS case that is genuinely blocked
   * and steps the AD fallback the grid is already drawing.
   */
  const prevTarget = monthStepTarget(anchor, -1)
  const nextTarget = monthStepTarget(anchor, 1)
  const prevOk = prevTarget !== null
  const nextOk = nextTarget !== null

  return (
    <Card bodyStyle={{ padding: '14px 14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => onStepMonth(-1)}
          disabled={!prevOk}
          title={prevOk ? 'Previous month' : MONTH_STEP_BLOCKED}
          /*
           * §5 — "Icon buttons 44×44, always `aria-label`".
           *
           * These two carried a `title` and nothing else: the only child is an
           * `Icon`, which sets `aria-hidden` when it has no label, plus a
           * `TouchTarget` spacer. So the accessible name was EMPTY — a screen
           * reader announced "button, dimmed" with no indication of what was
           * dimmed or why, on the one pair of controls this screen keeps
           * permanently disabled. `title` is not an accessible name here: it is
           * only consulted when nothing else is present, and support for that
           * fallback is inconsistent across screen readers.
           *
           * The disabled state is no longer permanent — it now applies only
           * inside the BS window, where stepping needs the neighbouring month
           * lengths, which are calendar data and are never inferred (PLAN.md
           * §4.34, and `MONTH_STEP_BLOCKED` above). Naming the control is what
           * lets a non-sighted operator learn that from the same `title` a mouse
           * user gets, on the days it is still dimmed.
           */
          aria-label={prevOk ? 'Previous month' : 'Previous month (unavailable)'}
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
          onClick={() => onStepMonth(1)}
          disabled={!nextOk}
          title={nextOk ? 'Next month' : MONTH_STEP_BLOCKED}
          /* Named for the same reason as the Previous arrow above — see its note. */
          aria-label={nextOk ? 'Next month' : 'Next month (unavailable)'}
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
          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onPickDay(d)}
              title={`${bs ? `${formatBs(bs)} · ` : ''}${formatAd(d)}`}
              className="figure"
              style={{
                position: 'relative',
                // Law 15 — the mini-calendar's day cells are buttons, and on the
                // warehouse tablet they are the primary way to change the date.
                minHeight: TOUCH,
                borderRadius: 'var(--r-badge)',
                border: 'none',
                background: today ? 'var(--nav-active-accent)' : 'transparent',
                color: today ? 'var(--app)' : isWeekend(d) ? 'var(--danger-text)' : 'var(--text)',
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

/**
 * ⛔ This card used to list Dashain (28–30 Jul), Buddha Jayanti (8 Aug) and
 * Tihar (11–12 Aug), each with a BS line above an AD line, under a footer
 * reading *"Holiday calendars are configured in Settings"* — of a calendar
 * configured nowhere at all. Three dates typed into a seed file, rendered as
 * gazetted fact, and wrong besides: Dashain is an autumn festival.
 *
 * The card stays, because the operator's question ("is the warehouse shut that
 * week?") is a real one and a missing card answers it worse than an honest one.
 * What it holds is the answer the product actually has, which is none.
 */
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
      <NotTracked what="The festival and holiday calendar" reason={HOLIDAYS_NOT_TRACKED} />
    </Card>
  )
}

/** What a rail row needs to know about its live figure. */
interface CountReadout {
  total: number | null
  loading: boolean
  error: string | null
}

type CountReadouts = Record<CountKey, CountReadout>

/**
 * A rail card's rows.
 *
 * ⛔ Every row used to print a hand-typed integer — 3 pickups, 5 returns, 4
 * cleaning, 12 bookings — under today's real date, beside a Dashboard reading
 * the live database, where the true figures for today are zero. Rulings §8: a
 * number with no real source renders "not tracked yet", never a plausible
 * default and never zero.
 *
 * A row now has one of exactly two shapes, decided by `slot.key`:
 *
 *  - **a live count** — the number the server returned. `0` is a real answer and
 *    is printed as `0`; `—` means the count has not arrived or failed, which is
 *    a different fact and must not be mistakable for a zero (the same `—`
 *    convention `OperationsQueues`' chips use).
 *  - **no source** — "not tracked yet" plus the reason, on the card face.
 *
 * §8.3 is unchanged: a `money` row is absent from the MARKUP for a role that may
 * not see money, not hidden by CSS and not blanked.
 */
function CountList({
  rows,
  money,
  dots,
  counts,
}: {
  rows: CountSlot[]
  money: boolean
  dots: boolean
  counts: CountReadouts
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      {rows
        .filter((r) => money || !r.money)
        .map((r) => {
          if (!r.key) {
            return (
              <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 'var(--t-meta)' }}>
                {dots ? (
                  <span aria-hidden style={{ width: 9, height: 9, marginTop: 6, borderRadius: 3, background: 'var(--disabled)', flexShrink: 0 }} />
                ) : (
                  r.icon && <Icon name={r.icon} size={14} style={{ color: 'var(--disabled)', flexShrink: 0, marginTop: 3 }} />
                )}
                <span style={{ minWidth: 0, lineHeight: 1.35 }}>
                  <span style={{ display: 'block', color: 'var(--text2)' }}>
                    {r.label} — <span style={{ color: 'var(--muted)', fontWeight: 600 }}>not tracked yet</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    {r.reason}
                  </span>
                </span>
              </div>
            )
          }

          const c = counts[r.key]
          const text = c.loading && c.total === null ? '…' : c.total === null ? '—' : String(c.total)
          const spoken =
            c.total === null ? `${r.label}: no count available` : `${r.label}: ${c.total}`

          return (
            <div
              key={r.label}
              style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 'var(--t-meta)' }}
              {...(c.error ? { title: c.error } : {})}
            >
              {dots ? (
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, background: r.tone, flexShrink: 0 }} />
              ) : (
                r.icon && <Icon name={r.icon} size={14} style={{ color: r.tone, flexShrink: 0 }} />
              )}
              <span className="figure" aria-label={spoken} style={{ fontWeight: 700, color: 'var(--text)', minWidth: 18 }}>
                {text}
              </span>
              <span style={{ color: 'var(--text2)', minWidth: 0 }}>{r.label}</span>
              {c.error && <Icon name="alert_triangle" size={12} style={{ color: 'var(--danger-text)', flexShrink: 0 }} />}
            </div>
          )
        })}
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

/**
 * `row` is nullable for the same reason `DayJob.row` is: a live booking bar has
 * no resource lane behind it. Where there is no row the panel simply does not
 * name a resource — it does not fall back to the bar's own label dressed up as
 * a piece of equipment, which would put an invented item in an equipment list.
 */
function SelectedEventPanel({ bar, row, onClose }: { bar: Bar; row: ResourceRow | null; onClose: () => void }) {
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
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
          {detail?.client ?? bar.client ?? bar.sub ?? row?.name ?? bar.label}
        </div>
        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          {detail?.project ?? (row ? `${bar.kind} · ${row.name}` : bar.kind)}
        </div>
      </div>

      {/*
        The equipment list is drawn only where there IS equipment to draw.

        ⛔ It used to fall back to `[{ name: row.name, code: row.code }]` — the
        LANE the bar sat on, rendered as if it were the booking's kit. On a
        resource timeline that was merely redundant; against a live booking bar,
        whose lane is the booking itself, it would have listed the booking number
        as a piece of equipment with a serial. A booking's items come from its
        lines, which this panel does not read; absent beats invented.
      */}
      {(detail?.equipment ?? (row ? [{ name: row.name, code: row.code ?? '', icon: row.icon }] : [])).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {(detail?.equipment ?? (row ? [{ name: row.name, code: row.code ?? '', icon: row.icon }] : [])).map((e) => (
            <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <IconTile name={e.icon} />
              <span style={{ minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                {e.name} {e.code && <span className="serial" style={{ color: 'var(--muted)' }}>({e.code})</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {!detail && !row && (
        <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
          The items on this booking are on the booking itself — open it to see its lines.
        </p>
      )}

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

      {/* The bar's own booking, not a pattern match on its label — see `DayJobRow`. */}
      {bar.bookingNo && (
        <Button icon="file" onClick={() => navigate(`/rentals/${bar.bookingNo ?? ''}`)}>
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
  const [start, setStart] = useState<Date>(() => anchorShowing(requestedDay(dParam) ?? TODAY))
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
  const [showCheckAvailability, setShowCheckAvailability] = useState(false)
  const [catalogProducts, setCatalogProducts] = useState<
    Array<{ id: string; name: string; totalQuantity?: number | undefined; dailyRate?: number | undefined; description?: string | undefined }>
  >([])

  useEffect(() => {
    listInventory({ withMoney: true }).then((res) => {
      setCatalogProducts(
        res.rows.map((r) => ({
          id: r.id,
          name: r.name,
          totalQuantity: r.totalQuantity,
          dailyRate: r.dailyRate ? Number(r.dailyRate) / 100 : undefined,
        }))
      )
    }).catch(() => {})
  }, [])
  /*
   * ⛔ An `overlays` Set lived here, holding the three §5.1 layer names, driven
   * by three chips in the header. It is gone with them — see `layerToggles`
   * below for the finding. Keeping the state without the control would be a
   * value nothing can change; keeping the control without a layer to toggle was
   * the defect.
   */

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
  /* Which of the two windows is on screen. Declared here rather than beside the
     header stepper it also drives, because the read below needs it first. */
  const monthOnly = view === 'Month' || view === 'Availability'

  /** Walks `ZOOM_STEPS`; +1 widens the window, −1 narrows it. */
  const stepZoom = (dir: 1 | -1) => {
    setZoom((z) => {
      const at = ZOOM_STEPS.indexOf(z as (typeof ZOOM_STEPS)[number])
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (at === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : at) + dir))]
      return next ?? z
    })
  }

  const goToday = useCallback(() => {
    // `anchorShowing`, not `adDay(-1)`: on the 1st of a month the bare offset
    // lands in the previous month and Today would draw the wrong month.
    setStart(anchorShowing(TODAY))
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

  /* ── the one read ───────────────────────────────────────────────────────
   *
   * This screen had ZERO imports from `lib/queries` or `lib/supabase` until
   * 4 Sep 2026. Every bar on it came from a transcription of a render, under
   * today's real date, beside a Dashboard reading the live database.
   *
   * The window is the UNION of the two the page draws — the BS month (the Month
   * grid and the rail's mini month) and the day range (Week, Timeline). Both are
   * anchored on `start`, so the union is barely wider than either, and taking it
   * removes a class of disagreement rather than saving a row: fetching only the
   * active view's window would leave the mini month's busy dots covering a
   * different span from the grid beside them, changing as the operator flicked
   * tabs. `lib/queries/calendar.ts` owns the overlap rule; this only says which
   * days are on screen.
   * ------------------------------------------------------------------------ */
  const windowEdges = [monthDays[0], monthDays[monthDays.length - 1], days[0], days[days.length - 1]]
    .filter((d): d is Date => d !== undefined)
    .map((d) => d.getTime())
  const windowFrom = isoDay(windowEdges.length > 0 ? new Date(Math.min(...windowEdges)) : start)
  const windowTo = isoDay(windowEdges.length > 0 ? new Date(Math.max(...windowEdges)) : start)
  const windowFilters = useMemo(() => calendarWindow(windowFrom, windowTo), [windowFrom, windowTo])
  /* `isFilteredOverride: false` — the window is what this list MEANS, not
     something the operator narrowed. The chips below do the narrowing. */
  const barList = useList<Bar>(fetchCalendarBars, windowFilters, { isFilteredOverride: false })

  /* ── filtering ──────────────────────────────────────────────────────── */
  const q = query.trim().toLowerCase()
  const filterActive = kinds.size > 0 || client !== 'All' || q.length > 0

  /**
   * The bars the grid draws, after the chip row.
   *
   * ⚠ This narrows an array in the browser, which `listQuery.ts` exists to stop
   * — *"a chip would filter the page you fetched, not the table"*. The hazard it
   * names is PAGING: filtering page 1 of 12 hides matches on pages 2-12. There
   * is no paging here. `listCalendarBookings` fetches every booking overlapping
   * the window, so the fetched set IS the set, and narrowing it locally gives
   * the same answer a server-side chip would — instantly, without a round trip
   * per keystroke on the search box. Move the WINDOW and the server re-queries.
   */
  const bars = useMemo(
    () =>
      barList.rows.filter((b) => {
        if (kinds.size > 0 && !kinds.has(b.kind)) return false
        if (client !== 'All' && b.client !== client) return false
        if (q.length > 0) {
          const hay = `${b.label} ${b.sub ?? ''} ${b.client ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      }),
    [barList.rows, kinds, client, q],
  )

  /** The Client dropdown's options — whoever the loaded bookings belong to. */
  const clientOptions = useMemo(() => {
    const names = new Set(barList.rows.map((b) => b.client).filter((c): c is string => Boolean(c)))
    // A client carried in the URL stays offered even when this window holds none
    // of their bookings, so the select never shows a value it cannot represent.
    if (client !== 'All') names.add(client)
    return [...names].sort()
  }, [barList.rows, client])

  /**
   * The resource lanes the Timeline view would draw. Empty, because `ROWS` is —
   * see `ResourceTimelinePanel` and `data/calendar.ts`. Kept as a real
   * derivation rather than deleted so that the Row Type and Resource filters
   * stay wired to the thing they filter, and so the day this has rows is a data
   * change and not a rewrite.
   */
  const resourceRows = useMemo(() => {
    const out = ROWS.filter((r) => rowType === 'All' || r.type === rowType)
      .filter((r) => resource === 'All' || r.id === resource)
      .map((r) => {
        const rowHit = q.length > 0 && (r.name.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q))
        const rowBars = r.bars.filter((b) => {
          if (kinds.size > 0 && !kinds.has(b.kind)) return false
          if (client !== 'All' && b.client !== client) return false
          if (q.length > 0 && !rowHit) {
            const hay = `${b.label} ${b.sub ?? ''} ${b.client ?? ''}`.toLowerCase()
            if (!hay.includes(q)) return false
          }
          return true
        })
        return { ...r, bars: rowBars }
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
   * The Week view's lanes: **one per booking**, not one per resource.
   *
   * A week strip needs lanes and the resource dimension has none, so the lane is
   * the booking itself — which is honest and is also what a week of bookings
   * looks like on paper. The label column carries the booking number, its
   * client and its stage; the bar spans pickup day to return day.
   *
   * Only bookings that actually intersect the rendered window get a lane, so a
   * booking whose bar would be clipped to nothing does not leave an empty row.
   */
  const bookingLanes = useMemo<LaneRow[]>(() => {
    const lanes = bars
      .filter((b) => place(b, days) !== null)
      .map<LaneRow>((b) => ({
        id: b.id,
        // The lane IS the booking, so its name is the booking number and it gets
        // the identifier face. The client sits on the third line in prose; the
        // stage rides on the bar itself, where its colour and icon already are.
        name: b.label,
        identifier: true,
        meta: b.client ?? b.sub ?? '—',
        metaTone: 'muted',
        icon: 'calendar_event',
        bars: [b],
      }))
    if (sort === 'group') {
      // "Grouped" on a booking lane means chronological — the order a week
      // actually happens in. There is no resource type to group by.
      lanes.sort((a, b) => (a.bars[0]?.from.getTime() ?? 0) - (b.bars[0]?.from.getTime() ?? 0) || a.name.localeCompare(b.name))
    } else {
      lanes.sort((a, b) => (sort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)))
    }
    return lanes
  }, [bars, days, sort])

  /**
   * §5.1 Notes — the crew, maintenance and transport overlays are desktop-only,
   * so below 1280 the grid and the day list carry the booking layer alone and
   * say so in words rather than dropping rows silently.
   *
   * `row` is nullable because a live booking bar has no resource lane; `layerOf`
   * then places the bar by its own kind, which for every bar this screen loads
   * today is the base booking layer — so this returns `true` for every bar on
   * the grid, at every width, and the width rule below only bites the day a
   * resource lane or an overlay kind exists.
   *
   * It no longer consults a per-layer toggle, because there is no longer one to
   * consult; see `layerToggles`.
   */
  const layerVisible = useCallback(
    (row: ResourceRow | null, bar: Bar): boolean => {
      const layer = layerOf(row, bar)
      if (!layer) return true
      return desktop
    },
    [desktop],
  )

  /**
   * The jobs on one day — live bookings first, then anything hanging off a
   * resource lane.
   *
   * Both sources are walked rather than one, so the day a resource timeline has
   * rows the peek shows them without another edit. They cannot double-count
   * today (`ROWS` is empty); if it ever gains rows carrying booking bars, this
   * is where the de-duplication belongs.
   */
  const jobsOn = useCallback(
    (d: Date): DayJob[] => [
      ...bars.filter((b) => coversDay(b, d) && layerVisible(null, b)).map((bar) => ({ row: null, bar })),
      ...resourceRows.flatMap((r) =>
        r.bars.filter((b) => coversDay(b, d) && layerVisible(r, b)).map((bar) => ({ row: r, bar })),
      ),
    ],
    [bars, resourceRows, layerVisible],
  )

  const dayJobs = useMemo(() => (day ? jobsOn(day) : []), [day, jobsOn])

  const selected = useMemo(() => {
    if (!selectedId) return null
    const live = bars.find((b) => b.id === selectedId)
    if (live) return { bar: live, row: null }
    for (const r of resourceRows) {
      const bar = r.bars.find((b) => b.id === selectedId)
      if (bar) return { bar, row: r }
    }
    return null
  }, [bars, resourceRows, selectedId])

  /**
   * The mini month's busy dots — the days the bookings **on the grid** cover.
   *
   * ⛔ This read `barList.rows`, the unfiltered fetched set, while the grid
   * beside it drew `bars`, the filtered one. Tick a kind chip or pick a client
   * and the mini month kept its dots on days the month grid had just emptied, so
   * the two calendars on one screen disagreed about which days had work — with
   * the smaller one, the navigation control, being the wrong one. It reads the
   * same array the grid does now, and `jobsOn` already does.
   */
  const busyDays = useMemo(() => {
    const set = new Set<number>()
    for (const b of bars) {
      for (let t = b.from.getTime(); t <= b.to.getTime(); t += 86_400_000) set.add(t)
    }
    return set
  }, [bars])

  /* ── the rail figures ───────────────────────────────────────────────────
   *
   * Five fixed calls in a fixed order — never a loop, so the hook order cannot
   * change between renders. Each asks for one row (`page` size 1, set in
   * `data/calendar.ts`) and reads `total`, so the cost is five counts rather
   * than five lists. The filter sets are named over there; nothing is assembled
   * here (Law 1).
   *
   * `isFilteredOverride: false` on every one: a rail figure's set is the card's
   * own definition and no operator input reaches it, so it can never read as
   * "filtered".
   * ---------------------------------------------------------------------- */
  const countFetcher = useCallback((f: ListFilters) => listBookings({ ...f, withCount: true }), [])

  /**
   * The operating day, resolved **at render**.
   *
   * ⛔ The five filter sets below were module constants built from
   * `data/today.ts`'s `TODAY_DAY_AD`, which that file resolves once, when it is
   * first imported. A warehouse tablet is left on this screen for days: after
   * midnight the "Today's Summary" card went on counting the previous day's
   * pickups and returns, under a heading rendering today's date from
   * `getBusinessToday()` two lines above it. The card contradicted itself and
   * looked entirely normal doing so.
   *
   * `useList` keys its effect on the VALUE of the filter set, not its identity,
   * so rebuilding these every render is free and the queries re-run exactly when
   * the day turns over.
   */
  const dayAd = businessDayAd()
  const bookingCounts = useMemo(() => railBookingCounts(dayAd), [dayAd])
  const invoiceCounts = useMemo(() => railInvoiceCounts(dayAd), [dayAd])

  /**
   * The same day as a `Date`, for the heading over those counts.
   *
   * The two "Today's Summary" cards printed `toBs(TODAY)` / `formatAd(TODAY)`
   * from this module's import-time `TODAY`. Moving the counts to render time and
   * leaving the heading behind would have swapped one mismatch for a worse one —
   * yesterday's date over today's figures — so both come off `dayAd`.
   * `businessDayAd` returns the Kathmandu civil day, which is what every other
   * day on this screen is: UTC midnight of that date.
   */
  const todayLabelled = useMemo(() => new Date(`${dayAd}T00:00:00.000Z`), [dayAd])
  const todaySummaryDate = (() => {
    const bs = toBs(todayLabelled)
    return bs ? `${formatBs(bs)} (${formatAd(todayLabelled)})` : formatAd(todayLabelled)
  })()

  /**
   * Payment Due, and the one place money enters this screen.
   *
   * §8.3: the Warehouse role sees no financial figure. `CountList` already omits
   * the row from the MARKUP for a money-blind role, and this stops the query
   * running for them as well — a money-blind session gets `{ rows: [], total: 0 }`
   * back from RLS, and a `0` that is really a permission answer is worse than no
   * row at all.
   *
   * The filter set is swapped rather than only the fetcher, because `useList`
   * keys its effect on the FILTERS: handing it a different set is what makes the
   * count re-run if `money` ever changes within a session.
   */
  const paymentDueFetcher = useCallback(
    (f: ListFilters): Promise<ListQueryResult<InvoiceListRow>> =>
      money ? listInvoices({ ...f, withCount: true }) : Promise.resolve({ rows: [], total: null }),
    [money],
  )
  const paymentDueFilters: ListFilters = money ? invoiceCounts.upcomingPaymentDue : {}

  const todayPickupsQ = useList<BookingListRow>(countFetcher, bookingCounts.todayPickups, { isFilteredOverride: false })
  const todayReturnsQ = useList<BookingListRow>(countFetcher, bookingCounts.todayReturns, { isFilteredOverride: false })
  const upcomingPickupsQ = useList<BookingListRow>(countFetcher, bookingCounts.upcomingPickups, { isFilteredOverride: false })
  const upcomingQuotesQ = useList<BookingListRow>(countFetcher, bookingCounts.upcomingQuoteExpiry, { isFilteredOverride: false })
  const upcomingPaymentQ = useList<InvoiceListRow>(paymentDueFetcher, paymentDueFilters, { isFilteredOverride: false })

  /**
   * The five readouts, keyed the way `CountSlot.key` names them.
   *
   * Rebuilt every render on purpose: `useList` returns a fresh object each time
   * and memoising this would only pin a stale `loading`.
   */
  const readout = (r: ListResult<unknown>): CountReadout => ({ total: r.total, loading: r.loading, error: r.error })
  const counts: CountReadouts = {
    todayPickups: readout(todayPickupsQ),
    todayReturns: readout(todayReturnsQ),
    upcomingPickups: readout(upcomingPickupsQ),
    upcomingQuoteExpiry: readout(upcomingQuotesQ),
    upcomingPaymentDue: readout(upcomingPaymentQ),
  }

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

  /*
   * ⛔ `toggleLayer` lived here, flipping a name in and out of the `overlays`
   * Set. It went with the three chips that called it — see `layerToggles`.
   *
   * ⛔ `showConflicts` lived here too — it set the saved view to "Conflict View"
   * and filtered the grid to the `Conflict` and `Case Escalation` kinds. Both
   * were seed inventions; the live read produces `Reserved` and `On Rent` and
   * nothing else, so the button's only possible outcome was an emptied grid that
   * read as "checked, none found". Nothing in the product lists conflicting
   * bookings — see `QUICK_ACTIONS` in `data/calendar.ts` for where the overlap
   * rule actually is and why it cannot answer this question.
   *
   * ⛔ And `runQuickAction` lived here, as `if (a.to) navigate(a.to)` — an `if`
   * with no `else`, so a tile carrying neither `to` nor `unavailable` rendered
   * as a live button and did nothing at all when pressed. `QuickAction` is a
   * union now (`data/calendar.ts`) and that tile cannot be written, so the tile
   * markup navigates directly and there is no dispatcher left to swallow a case.
   */

  /**
   * Move the whole calendar one month, in whichever calendar the grid is drawing.
   *
   * `monthStepTarget` decides whether the step is possible and where it lands;
   * this only commits it. `start` is the single anchor both grids derive from,
   * so moving it moves the month grid, the mini month, the day range and the
   * read's window together — they cannot drift apart.
   *
   * The selected day is cleared, because it belongs to the month being left: a
   * peek showing 5 September beside a grid showing October is two answers to
   * "which day is open".
   */
  const stepMonth = (dir: -1 | 1) => {
    const target = monthStepTarget(start, dir)
    if (!target) return
    setStart(target)
    setDayChoice(null)
  }

  /**
   * Select a day — **without moving the month it was picked from**.
   *
   * ⛔ This was `setStart(anchorFor(d))`, and `anchorFor` returns `d − 1` so the
   * picked day sits one column in on the Week and Timeline grids. `MonthGrid`
   * re-derives its month from that same anchor, so clicking day **1** set the
   * anchor to the last day of the PREVIOUS month and the grid redrew there: the
   * operator clicked a day and the calendar jumped a month backwards, with their
   * selection now off-screen.
   *
   * So the one-column-in offset is kept — it is what the render shows and what
   * the range views want — except where taking it would change which month is
   * displayed, in which case the anchor is the picked day itself. A day picked
   * from the visible month always stays in the visible month; a day picked from
   * outside it (nothing does today, but `MiniMonth` could) still travels.
   */
  const pickDay = (d: Date) => {
    setDayChoice(d)
    setStart(anchorShowing(d))
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
   * ⛔ Both arrows shipped hard-coded `disabled`, which made Month — the DEFAULT
   * tab, and the only tab with a live source — a view the operator could not
   * leave. The reason given was that stepping needs BS month lengths, and that
   * is true of a BS month and only a BS month: `bsMonthDays` already falls back
   * to the AD month past 16 Aug 2026, which is every day the grid actually
   * draws, and an AD month steps by arithmetic. See `monthStepTarget`.
   *
   * So each arrow is now live exactly when a step is possible, and dimmed with
   * the reason on the days it is not — the BS window, 16 Jul – 16 Aug 2026.
   */
  const monthPrev = monthStepTarget(start, -1)
  const monthNext = monthStepTarget(start, 1)
  const monthStepper = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
      <button
        type="button"
        onClick={() => stepMonth(-1)}
        disabled={monthPrev === null}
        aria-disabled={monthPrev === null}
        title={monthPrev === null ? MONTH_STEP_BLOCKED : 'Previous month'}
        aria-label={monthPrev === null ? 'Previous month (unavailable)' : 'Previous month'}
        style={monthPrev === null ? iconBtnOff : iconBtn}
      >
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
      <button
        type="button"
        onClick={() => stepMonth(1)}
        disabled={monthNext === null}
        aria-disabled={monthNext === null}
        title={monthNext === null ? MONTH_STEP_BLOCKED : 'Next month'}
        aria-label={monthNext === null ? 'Next month (unavailable)' : 'Next month'}
        style={monthNext === null ? iconBtnOff : iconBtn}
      >
        <Icon name="chevron_right" size={15} />
      </button>
    </span>
  )

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

  /* Printed only while a step is actually refused. It used to render on every
     Month and Availability view, beside two arrows that were always dead; now
     the arrows work in the AD fallback and the note appears with the dimming it
     explains, not instead of a working control. */
  const monthStepNote = monthOnly && (monthPrev === null || monthNext === null) && (
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

  /**
   * §5.1's Crew / Maintenance / Transport layer toggles.
   *
   * ⛔ They were three live, pressed-state chips, and **not one of them could
   * change a single pixel**. `layerOf` (`data/calendar.ts`) puts a bar on an
   * overlay by its resource row's type or by its own kind; `row` is `null` for
   * every bar this screen loads — there are no `product_units` to hang a lane
   * off — and the only kinds the read can produce are `Reserved` and `On Rent`,
   * neither of which is a layer. So `layerOf` answered `null` for every bar,
   * `layerVisible` returned `true` for every bar, and toggling all three off
   * left the grid exactly as it was.
   *
   * That is the same defect this change removed from the conflict button, the
   * kind chips and the saved views: a control whose outcome is fixed. It is
   * rendered `Unavailable` with the reason on its face rather than deleted,
   * because §5.1 asks for the overlays and the day the tables have rows this is
   * where they come back.
   */
  const layerToggles = desktop && view === 'Month' && (
    <span style={{ display: 'inline-flex', minWidth: 250, maxWidth: 430 }}>
      <Unavailable
        label={`Layers · ${LAYERS.map((l) => l.label).join(' · ')}`}
        reason="Every bar on this grid is a booking, and a booking belongs to no overlay — so these three would filter nothing. They need crew assignments, maintenance records and vehicles, none of which has a row."
        icon="eye_off"
      />
    </span>
  )

  /**
   * The Row Type filter — **Timeline only**.
   *
   * ⛔ It rendered in the header at every view and narrowed `resourceRows`,
   * which derives from `ROWS` — an empty array. On Month, Week and Availability
   * it therefore touched nothing at all, and on those three views it was not
   * even pointed at what was on screen: the Month and Week grids draw bookings,
   * which have no resource type to be filtered by.
   *
   * Scoped rather than made `Unavailable`, because on the Timeline it is a real
   * filter over a real (currently empty) list, and that view already states why
   * it has no lanes. Off the Timeline the control is simply not that view's.
   */
  const rowTypeControl = view === 'Timeline' && (
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

  /**
   * The Client filter.
   *
   * Options come from the bookings actually loaded for this window, not from a
   * five-name list transcribed off a render — so the dropdown offers the clients
   * on the grid in front of the operator, and moving the window changes it.
   */
  const clientControl = (
    <Select value={client} onChange={(e) => pickClient(e.target.value)} style={selectStyle} aria-label="Client">
      <option value="All">All Clients</option>
      {clientOptions.map((c) => (
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

  /**
   * The event-type filter.
   *
   * ⛔ It offered all twelve legend kinds. Ten of them — Cleaning, Maintenance,
   * Crew Duty, Blocked, both Sub-Rental kinds, Conflict, Quote Expiry, Case
   * Escalation and Available — cannot appear on a bar this screen loads, so
   * ticking one could only ever empty the grid: a live-looking control whose
   * single outcome is the empty state, which is the defect `data/today.ts`'s
   * `LIST_STAGES` exists to prevent on the Dashboard.
   *
   * The chips now come from `CALENDAR_BAR_KINDS`, which the query module derives
   * from its own stage map, and the note beneath says what is missing rather
   * than letting ten kinds vanish without explanation.
   */
  const kindChips = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {CALENDAR_BAR_KINDS.map((k) => {
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
      {/*
        ⛔ This read "{10} more event types are in the key below — … None of them
        is recorded anywhere yet." Both halves were wrong. The key below is
        `EVENT_MARKERS`, eleven POINT markers (Pickup, Return, Handover…), a
        different list that happens to share some words — so it did not contain
        the ten and a reader following the sentence found something else. And
        "recorded nowhere" is false of at least one: `cleaning_queue_entries` has
        a writer (`actions/rentals/floorVerb.ts`, on every Return). What is true
        of all ten is narrower and is what the sentence says now — no BAR on this
        calendar can carry one, because the read maps three booking stages and
        nothing else.
      */}
      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45, flexBasis: '100%' }}>
        The legend defines {BAR_KINDS.length} bar types in all; the other{' '}
        {BAR_KINDS.length - CALENDAR_BAR_KINDS.length} — cleaning, maintenance, crew duty, sub-rental,
        conflicts and the rest — cannot appear here, because this calendar reads bookings and draws only the
        booked, packed and out ones. A chip for any of them could do nothing but empty the grid.
      </span>
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

      {/*
        Resource Type and Resource narrow `resourceRows`, which the Timeline
        draws and nothing else does. On Month, Week and Availability they are not
        a filter that comes back empty — they are not that view's control at all,
        so they are rendered as unavailable-with-reason rather than as two live
        selects that quietly govern a grid nobody is looking at.
      */}
      {view === 'Timeline' ? (
        <>
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

          <p style={{ margin: '-6px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
            These two narrow the lanes on this view. It has none yet — no unit records exist — so neither
            changes what is drawn until it does.
          </p>
        </>
      ) : (
        <Unavailable
          label="Resource Type and Resource"
          reason={`They scope the Timeline’s lanes and nothing else; the ${view} view has none to scope. Narrow it with the event types, the client or the search above.`}
          icon="box"
        />
      )}

      <div>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 'var(--sp-sm)' }}>Saved Views</div>
        {/*
          The list is empty and says why on its face. `SAVED_VIEWS` held one
          entry, "My Bookings", whose `kinds` were exactly the two kinds every
          bar already has: it narrowed nothing and its only effect was to put the
          page into "filtered" mode — different empty-state copy, a lit chip row,
          a Clear control for filters that were doing nothing. See
          `SAVED_VIEWS_NOT_AVAILABLE` in `data/calendar.ts`.
        */}
        {SAVED_VIEWS.length === 0 && (
          <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
            {SAVED_VIEWS_NOT_AVAILABLE}
          </p>
        )}
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

  /**
   * The sentence a grid with no bars on it prints.
   *
   * `null` while the read is in flight or has failed — neither is an emptiness,
   * and `PageBody` is already saying which one it is. An empty month has to say
   * WHY it is empty, or it reads as a screen that failed to draw.
   */
  const emptyNote =
    barList.loading || barList.error || bars.length > 0
      ? null
      : filterActive
        ? 'No booking in this window matches the current filters.'
        : 'Nothing is booked in this window. Bookings appear here from the day they are confirmed until the day they come back.'

  /**
   * The control that does what the filtered-empty copy asks for.
   *
   * ⛔ Both empty states told the operator to "clear them to see the whole
   * window" / "clear an event type, widen the client filter" and rendered no way
   * to do any of it. On desktop the chips are at least on screen; below 1280
   * they are inside a Filters panel that is *closed by default*, so the
   * instruction pointed at a control the reader could not see. `PageBody` has an
   * `onClearFilters` for exactly this, but its empty state replaces the
   * children — and for a calendar the children are the dates (see `monthCard`),
   * so the button is rendered beside the sentence instead of instead of it.
   */
  const clearFiltersButton = (
    <Button icon="close" onClick={clearAll}>
      Clear filters
    </Button>
  )

  /**
   * The window came back cut. Stated, never swallowed.
   *
   * `total` is the EXACT number of bookings overlapping the window
   * (`lib/queries/calendar.ts` asks for the count); `barList.rows` is what fits
   * under the read's ceiling. When they differ the grid is drawing a partial
   * month, and a missing bar on a calendar reads as "nothing is booked that
   * day" — so this is a persistent inline warning, not a toast (Law 12), and it
   * counts the FETCHED set rather than the filtered one because truncation is a
   * property of the read.
   */
  const truncated = barList.total !== null && barList.total > barList.rows.length
  const truncationNote = truncated && (
    <p
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 7,
        margin: 0,
        padding: '9px 11px',
        borderRadius: 'var(--r-sm)',
        border: '1px solid var(--progress)',
        background: 'var(--st-progress-bg)',
        fontSize: 'var(--t-th)',
        color: 'var(--ready-text)',
        lineHeight: 1.5,
      }}
    >
      <Icon name="alert_triangle" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>
        This window holds {barList.total} bookings and only the first {barList.rows.length} were loaded, so days
        further down the window may look emptier than they are. Narrow the window — a shorter zoom, or a single
        month — and the whole of it fits.
      </span>
    </p>
  )

  /**
   * The Timeline view — the resource grid, with the lanes it actually has.
   *
   * Kept as the real grid rather than swapped for a bare card: the day columns,
   * the zoom cluster, the sort and the range arrows are all live controls over a
   * real window, and the operator can see that the view works and that the rows
   * are what is missing. `TIMELINE_EMPTY_BODY` says which rows and why.
   */
  const timelineCard = (
    <Card bodyStyle={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ minWidth: 0 }}>
          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{bsRangeLabel(days)}</span>
          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{adRangeLabel(days)}</span>
        </span>
        <span style={{ marginLeft: 'auto' }}>{zoomControl}</span>
      </div>
      <Timeline
        rows={resourceRows}
        days={days}
        selectedId={selectedId}
        onSelect={setSelectedId}
        sort={sort}
        onToggleSort={() => setSort((s) => SORT_NEXT[s])}
        labelHeading={rowType === 'All' ? 'Resource' : rowType}
        itemCount={resourceRows.length}
        emptyTitle={TIMELINE_EMPTY_TITLE}
        emptyBody={TIMELINE_EMPTY_BODY}
      />
      {markerLegend}
    </Card>
  )

  /** The Week strip — one lane per booking, because there are no resource lanes. */
  const weekCard = (
    <Card bodyStyle={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ minWidth: 0 }}>
          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{bsRangeLabel(days)}</span>
          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{adRangeLabel(days)}</span>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Week view · fixed 7-day window</span>
      </div>
      <Timeline
        rows={bookingLanes}
        days={days}
        selectedId={selectedId}
        onSelect={setSelectedId}
        sort={sort}
        onToggleSort={() => setSort((s) => SORT_NEXT[s])}
        /* One lane per booking — see `bookingLanes`. The heading says what a row
           IS, so it must not still say "Resource". */
        labelHeading="Booking"
        itemCount={bookingLanes.length}
        emptyTitle={filterActive ? 'No booking matches these filters' : 'Nothing is booked this week'}
        emptyBody={
          filterActive
            ? 'An event type, a client or the search box is narrowing this week. Clear them to see all of it.'
            : 'No booking overlaps these seven days — nothing goes out, nothing is out and nothing comes back.'
        }
        emptyAction={filterActive ? clearFiltersButton : null}
      />
      {truncationNote && <div style={{ padding: '0 12px 10px' }}>{truncationNote}</div>}
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
      {truncationNote && <div style={{ padding: '0 var(--sp-md) var(--sp-sm)' }}>{truncationNote}</div>}
      {/* The grid itself always renders: a month of dates is the content, and
          replacing it with a full-page empty state would hide the calendar to
          announce that the calendar is empty. The sentence sits under it — with
          the Clear control beside it when it is filters doing the emptying. */}
      {emptyNote && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap', padding: '0 var(--sp-md) var(--sp-sm)' }}>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5, minWidth: 0 }}>{emptyNote}</p>
          {filterActive && clearFiltersButton}
        </div>
      )}
      {!desktop && (
        <p style={{ margin: 0, padding: '0 var(--sp-md) var(--sp-sm)', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          Chips truncate to a dot below 1280, and the crew, maintenance and transport layers are desktop-only
          (§5.1 Notes) — this grid shows the booking layer.
        </p>
      )}
      {markerLegend}
    </Card>
  )

  /**
   * The four views, and the two that have a live source wrapped in the house
   * loading / error states.
   *
   * `hasRows` decides the SHAPE of the two states (`PageBody`'s header): a first
   * load with nothing on screen gets the skeleton and the full-width error
   * banner; a refresh over a drawn grid keeps the grid and puts the banner above
   * it, because an error about a REFRESH must not destroy what is already
   * readable.
   *
   * ⛔ It was `bars.length > 0` — the FILTERED set — which defeated exactly that.
   * An operator with a client filter on, or a search term typed, that matched
   * nothing had `hasRows: false`, so a failed refresh threw away the drawn month
   * and replaced it with a full-page error. Whether a previous read succeeded is
   * a property of the READ, so it is `barList.rows`.
   *
   * `empty` is deliberately `false`. `PageBody`'s empty state replaces the
   * children, and for a calendar the children are the dates — see `monthCard`.
   */
  const gridBody = (
    <PageBody
      loading={barList.loading}
      error={barList.error}
      onRetry={barList.refetch}
      hasRows={barList.rows.length > 0}
      noun="bookings"
      skeleton="card"
    >
      {view === 'Month' ? monthCard : weekCard}
    </PageBody>
  )

  const centre =
    view === 'Availability' ? (
      <AvailabilityPanel onCheckAvailability={() => setShowCheckAvailability(true)} />
    ) : view === 'Timeline' ? (
      /* Not wrapped in `PageBody`: this view reads nothing. Its rows come from
         `ROWS`, which is empty in the source, so there is no load to fail and no
         spinner that could ever resolve into content. */
      timelineCard
    ) : (
      gridBody
    )

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
      <MiniMonth anchor={start} onPickDay={pickDay} onStepMonth={stepMonth} busy={busyDays} />
      <FestivalCard />
      <Card bodyStyle={{ padding: 14 }}>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Today&apos;s Summary</div>
        <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', margin: '2px 0 10px' }}>
          {todaySummaryDate}
        </div>
        <CountList rows={TODAY_SUMMARY} money={money} dots counts={counts} />
      </Card>
      <Card bodyStyle={{ padding: 14 }}>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 10 }}>
          {/* The heading names the window the queries below are actually bounded
              by — `UPCOMING_PERIOD`, the same chip `data/today.ts` defines — so
              the card cannot promise seven days while counting a different span. */}
          Upcoming <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 'var(--t-th)' }}>({UPCOMING_PERIOD})</span>
        </div>
        <CountList rows={UPCOMING} money={money} dots={false} counts={counts} />
      </Card>
      <Card bodyStyle={{ padding: 14 }}>
        <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 10 }}>Quick Actions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-sm)' }}>
          {QUICK_ACTIONS.map((a) => {
            if (a.kind === 'unavailable') return <Unavailable key={a.label} label={a.label} reason={a.unavailable} icon={a.icon} />
            /*
             * `QuickAction` is a union (`data/calendar.ts`): a tile without an
             * `unavailable` reason HAS a `to`, so this branch cannot render a
             * button that goes nowhere — which is what `runQuickAction`'s
             * `if (a.to) navigate(a.to)` quietly did. Lifted to a const so the
             * narrowing survives into the click handler's closure.
             *
             * The title used to fall back to 'Filter the timeline to conflicts',
             * describing behaviour deleted with the conflict filter.
             */
            const to = a.to
            return (
              <button
                key={a.label}
                type="button"
                onClick={() => navigate(to)}
                title={`Go to ${to}`}
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
            )
          })}
        </div>
      </Card>
    </>
  )

  /** The day peek, in whichever shell this width calls for. */
  const dayJobList = day && (
    <DayJobList
      day={day}
      jobs={dayJobs}
      overlayNote={!desktop}
      loading={barList.loading}
      /* Law 12 — a failed window read must not read as an empty day. */
      error={barList.error}
      filtered={filterActive}
      onOpen={(no) => navigate(`/rentals/${no}`)}
    />
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
          <Button icon="calendar_event" onClick={() => setShowCheckAvailability(true)}>Check availability</Button>
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
                  /* The selected bar's own booking — not a pattern match on its
                     label. A bar with none cannot navigate anywhere, and says so
                     rather than offering a button that goes nowhere. */
                  const bookingNo = selected?.bar.bookingNo
                  if (!bookingNo) {
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
              {todaySummaryDate}
            </div>
            <CountList rows={TODAY_SUMMARY} money={money} dots counts={counts} />
          </Card>
          <Card bodyStyle={{ padding: 14 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 'var(--sp-sm)' }}>Conflicts</div>
            {/*
              ⛔ Was a count of the `Conflict` and `Case Escalation` bars on
              screen, captioned "Nothing double-booked or escalated" whenever it
              came out at 0 — with a View Conflicts button beside it. Every bar
              of those two kinds was a seed invention; the live read produces
              `Reserved` and `On Rent` and nothing else, so the count is
              structurally 0 and the caption was a clean bill of health from a
              check that never ran. That is worse than no card: an operator reads
              it as "checked, none found".

              Nothing in the product lists conflicting bookings. The overlap
              defence is the GiST exclusion on `inventory_reservations`, which
              REJECTS a write, and `lib/availability.ts`, which answers for ONE
              booking at confirm time. Neither can be asked to sweep a calendar.
            */}
            <NotTracked
              what="Conflicts"
              reason="has no source: overlaps are refused per booking when one is confirmed, and nothing sweeps the calendar for clashes."
            />
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
              Upcoming <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 'var(--t-th)' }}>({UPCOMING_PERIOD})</span>
            </div>
            <CountList rows={UPCOMING} money={money} dots={false} counts={counts} />
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

        <CheckAvailabilityModal
          open={showCheckAvailability}
          onClose={() => setShowCheckAvailability(false)}
          products={catalogProducts}
          onApplyRange={(rng, qty) => {
            navigate(`/rentals/new?from=${rng.from}&to=${rng.to}&qty=${qty}`)
          }}
        />

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
        /*
         * ⛔ Was "Plan resources, track availability, and manage operational
         * schedules." — three promises, none of which this screen keeps.
         *
         *  · *plan resources* — there are no resources to plan; `product_units`
         *    is empty and the Timeline says so.
         *  · *track availability* — availability is answered per booking at
         *    confirm time, not tracked here; the Availability tab explains which
         *    question lives where.
         *  · *manage operational schedules* — nothing on this page schedules
         *    anything. It reads.
         *
         * A subtitle is the first thing an operator reads and the last thing
         * anyone checks. This one now says what the page does.
         *
         * ⚠ It then over-claimed in the other direction: *"Every confirmed
         * booking in the window"*. The read maps three stages —Booked and Packed
         * to `Reserved`, On Rent to `On Rent` — and drops cancellations, so a
         * quote, a returned booking and a closed one are all absent, and 197 of
         * the 246 bookings in the database can never appear. "Every" was the
         * word doing the damage: an operator who trusts it reads an empty day as
         * "nothing happened", when a returned booking may well have.
         */
        description="Bookings that are booked, packed or out — by month or by week, in both calendars. Quotes, returns and closed bookings are not drawn here."
        actions={
          <>
            {navButtons}
            <Button icon="calendar_event" onClick={() => setShowCheckAvailability(true)}>Check availability</Button>
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

      <CheckAvailabilityModal
        open={showCheckAvailability}
        onClose={() => setShowCheckAvailability(false)}
        products={catalogProducts}
        onApplyRange={(rng, qty) => {
          navigate(`/rentals/new?from=${rng.from}&to=${rng.to}&qty=${qty}`)
        }}
      />

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
