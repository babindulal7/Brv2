import { supabase } from '../supabase'
import { getSetting } from '../settingsStore'
import { dayStartMinutesFrom, operationalDayOf } from '../operationalDay'
import { todaysOutgoing } from './bookings'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'
import type { Bar, BarKind } from '../../data/calendar'

/**
 * # The Calendar Workspace's one read
 *
 * `modules/calendar/Calendar.tsx` had **zero** imports from `lib/queries` or
 * `lib/supabase` before this file existed: every bar, every rail figure and
 * every festival on the screen came from `data/calendar.ts`, which is a
 * transcription of two renders. The page sat under today's real date beside a
 * Dashboard reading the live database, and the two contradicted each other.
 *
 * This module is the replacement read. It owns the RULE — which bookings fall
 * in a window and what each one looks like as a bar — so the page owns none of
 * it (Law 1).
 *
 * ## Why this queries Supabase directly instead of going through `listBookings`
 *
 * The question a calendar asks is an **overlap**: *which bookings are on screen
 * between these two days*, i.e.
 *
 *     pickup_at <= <end of the last day>  AND  return_at >= <start of the first>
 *
 * `ListFilters.dateRange` (`listQuery.ts`) carries ONE `{ column, fromAd, toAd }`
 * and `applyListFilters` turns it into `gte`/`lte` on that single column. Two
 * different columns, each with one bound, is not expressible in that shape.
 *
 * Three routes were open and this is why the third was taken:
 *
 *  1. **Bound `pickup_at` alone.** A booking that started before the window and
 *     is still out — the one an operator most needs to see — would vanish from
 *     the grid. Wrong answer, quietly.
 *  2. **Widen `ListFilters`** with a list of ranges. Honest, but it is a change
 *     to the contract 34 screens share, plus `applyListFilters`,
 *     `useList`'s `narrowingKey` and `filterKey` — a lot of blast radius for
 *     one screen's question, and the shared shape would then carry a feature
 *     with exactly one caller.
 *  3. **Ask Postgres directly here**, the way `fetchFloorBooking`
 *     (`queries/bookings.ts`) already does for the floor's per-booking read.
 *     The rule stays inside a query module, the page still sees only rows, and
 *     nothing shared has to move.
 *
 * If a second screen ever needs an overlap, route (2) becomes the right one and
 * this function becomes its first caller.
 *
 * ## Law 6 — no money
 *
 * `CALENDAR_COLUMNS` below names no money column, by the same construction as
 * `FLOOR_COLUMNS` in `queries/bookings.ts`: "this module cannot leak a rupee
 * figure" is checkable by reading one constant. The Calendar is a Warehouse
 * surface (Foundation §8.3) and has no reason to carry one.
 *
 * ## Law 7 — AD in, AD out
 *
 * `pickup_at` / `return_at` are `timestamptz not null` (0002:31-32). Every
 * instant crossing this boundary is AD/UTC; the BS labels are rendered by
 * `lib/bs.ts` at paint time and are never stored, queried or returned from here.
 */

type BookingStageDb = Database['public']['Enums']['booking_stage']

/**
 * The stages that HAVE a bar kind, and the kind each becomes.
 *
 * ## What is deliberately missing, and why none of it is guessed
 *
 * - **`Returned` and `Closed`** — 190 of the 246 live bookings. Neither has a
 *   legend kind in `data/calendar.ts`'s `BarKind`, and neither is `Reserved`
 *   (the gear is not booked out any more) or `On Rent` (it is not with the
 *   client). Drawing them as either would put 190 wrong bars on the grid, so
 *   they are omitted entirely.
 *   `TODO(decision)`: should a finished booking stay visible on the calendar —
 *   a 'Completed' kind in the legend, drawn quieter than the live ones — or
 *   does the calendar show only work that is still ahead? Either is defensible;
 *   nothing in `Calendar.md` §6 says which, so nothing here picks.
 * - **`Quote`** — a quote is not a reservation and does not hold stock. The
 *   legend's `Quote Expiry` is a POINT marker on the expiry date, not a window
 *   spanning the requested dates, so mapping a Quote onto a bar would draw the
 *   wrong shape as well as the wrong fact.
 *   `TODO(decision)`: whether quotes appear on the calendar at all, and if so
 *   as an expiry marker or as a provisional window.
 *
 * Cancellation is not a stage (0015: it is the `cancelled_at` flag), so it is
 * excluded by presence below rather than here.
 */
const STAGE_BAR_KIND = {
  Booked: 'Reserved',
  Packed: 'Reserved',
  'On Rent': 'On Rent',
} as const satisfies Partial<Record<BookingStageDb, BarKind>>

/** The stages above, as the `in (...)` list. Derived, so the two cannot drift. */
const CALENDAR_STAGES = Object.keys(STAGE_BAR_KIND) as BookingStageDb[]

/**
 * The bar kinds this read can actually produce.
 *
 * Exported so the screen's event-type filter offers the kinds a booking can be
 * rather than all twelve in the legend. Ten of those twelve — Cleaning,
 * Maintenance, Crew Duty, Blocked, both Sub-Rental kinds, Conflict, Quote
 * Expiry, Case Escalation, Available — have no source anywhere: each would come
 * from a table with no rows, and most from a table with no writer either. A chip
 * for one of them is a control whose only possible outcome is an emptied grid,
 * which is the defect `data/today.ts`'s `LIST_STAGES` exists to prevent on the
 * Dashboard.
 *
 * Derived from the map above rather than typed out, so a stage gaining a kind
 * puts its chip on the screen in the same edit.
 */
export const CALENDAR_BAR_KINDS: readonly BarKind[] = [...new Set(Object.values(STAGE_BAR_KIND))]

/**
 * The projection. **No money column appears here and none may be added** — see
 * the Law 6 note in the header.
 *
 * Every name was checked against `supabase/migrations/0002_bookings.sql`'s
 * `create table bookings` and against the GENERATED `src/types/supabase.ts`
 * (`bookings.Row`): `booking_no` (:24), `project` (:29), `stage` (:30),
 * `pickup_at` (:31), `return_at` (:32), `cancelled_at` (:39). `clients ( name )`
 * is the same embed `BASE_COLUMNS` uses.
 *
 * ⚠ Line numbers rot. `booking_no` was cited at :23 and `cancelled_at` at :44
 * here; both were wrong, and a wrong citation is worse than none because the
 * next reader checks the line, finds a different column, and stops trusting the
 * rest of the note. Re-check them against the file or cite by name only.
 */
const CALENDAR_COLUMNS = 'id, booking_no, project, stage, pickup_at, return_at, cancelled_at, clients ( name )'

/**
 * The ceiling on one window's read, stated here rather than inherited.
 *
 * ⛔ This query had no `.limit()` and no count. PostgREST applies its OWN
 * ceiling in that case (`db-max-rows`, unset in this project's config but
 * enforced by the platform), and it applies it **silently**: the response is a
 * short array with a 200 status. `total` was `rows.length`, so a truncated
 * window reported itself as complete and the grid drew a month with bookings
 * quietly missing from it — the one failure a calendar must not have, because
 * an absent bar reads as "nothing is booked that day".
 *
 * So the cap is named here and the count is asked for. `total` is now the EXACT
 * number of bookings overlapping the window, whether or not they all came back,
 * and the screen compares the two and says so on the page face when they differ
 * (Law 12 — inline and persistent, never a toast).
 *
 * 1000 is not a guess about the business: it is well above any real month
 * (49 bookings are live in the whole database today) and well below the point
 * where the browser-side narrowing in `Calendar.tsx` would be slow. It is a
 * backstop, not a page size — there is no second page to fetch.
 */
const CALENDAR_WINDOW_LIMIT = 1000

interface RawCalendarRow {
  id: string
  booking_no: string
  project: string | null
  stage: BookingStageDb
  /** `timestamptz not null` (0002:31). AD, UTC. */
  pickup_at: string
  /** `timestamptz not null` (0002:32). AD, UTC. */
  return_at: string
  cancelled_at: string | null
  clients: { name: string } | null
}

/**
 * Read fresh per call, never captured at module load, so a changed operational
 * day start takes effect without a reload — the same rule
 * `queries/bookings.ts`'s `operationalDayStartMinutes` follows.
 */
function dayStartMinutes(): number {
  return dayStartMinutesFrom(getSetting('operationalDayStart'))
}

/**
 * The instant a Nepal calendar day opens and the instant it closes.
 *
 * Both are taken from `todaysOutgoing`, the named set, rather than rebuilt here
 * — the trick `data/today.ts`'s `overDays` documents and for the same reason:
 * `startOfDay` / `endOfDay` are module-private in `queries/bookings.ts` and
 * carry the `+05:45` and operational-day-start (D4) reasoning that makes the day
 * a screen FILTERS by the day it LABELS. Re-deriving those boundaries in a
 * second file is how two answers to "which day is it in Kathmandu" get written.
 *
 * `todaysOutgoing` always returns a `dateRange` with both ends, so the fallback
 * can only fire if that contract changes — in which case failing loudly beats
 * quietly querying an unbounded window.
 */
function dayBounds(dayAd: string): { open: string; close: string } {
  const range = todaysOutgoing(dayAd).dateRange
  if (!range?.fromAd || !range.toAd) {
    throw new Error(`Could not resolve the operational-day bounds for ${JSON.stringify(dayAd)}.`)
  }
  return { open: range.fromAd, close: range.toAd }
}

/** A UTC-midnight AD day, which is the only date shape `Bar.from` / `Bar.to` accept. */
function utcMidnight(dayAd: string): Date {
  return new Date(`${dayAd}T00:00:00.000Z`)
}

/**
 * The operational day an instant belongs to, as a UTC-midnight AD `Date`.
 *
 * `operationalDayOf` is the same function `queries/bookings.ts`'s `nepalDay`
 * uses, so the day a bar is DRAWN on and the day the filters would have
 * selected it by are computed by one piece of arithmetic. A pickup at 05:30
 * Kathmandu belongs to the previous day when the day starts at 06:00, and the
 * bar lands there too.
 */
function dayOf(instantAd: string, startMinutes: number): Date {
  return utcMidnight(operationalDayOf(instantAd, startMinutes))
}

/**
 * One booking → one bar.
 *
 * The bar's window is the PICKUP day through the RETURN day, inclusive at both
 * ends — which is what `Bar.from` / `Bar.to` mean and what `place()` and
 * `coversDay()` on the screen assume. It is deliberately not the half-open
 * `[pickup, return)` convention `RENTAL_WINDOW_BOUNDS` uses for overlap
 * arithmetic: that answers "may these two bookings share a unit", a different
 * question from "which cells does this booking appear in". A one-day booking
 * must occupy one cell, not zero.
 */
function toBar(r: RawCalendarRow, startMinutes: number): Bar {
  const kind = STAGE_BAR_KIND[r.stage as keyof typeof STAGE_BAR_KIND]
  // A booking always has a client (NOT NULL + FK), so a missing join is a query
  // bug rather than a data state — say so instead of printing a friendly dash.
  const clientName = r.clients?.name ?? '(client not joined)'
  const from = dayOf(r.pickup_at, startMinutes)
  const to = dayOf(r.return_at, startMinutes)

  return {
    // Keyed on the row's uuid, so the id is stable across refetches and unique
    // even if two bookings ever shared a number.
    id: `bk-${r.id}`,
    kind,
    label: r.booking_no,
    sub: r.project ? `${clientName} · ${r.project}` : clientName,
    client: clientName,
    // The bar's own booking, carried explicitly. The screen used to decide
    // whether a bar could be opened by testing whether its LABEL looked like a
    // booking number; a bar that carries its booking cannot be wrong about it.
    bookingNo: r.booking_no,
    from,
    // A return recorded before its pickup would render as a negative span and
    // silently disappear from the grid. The database does not forbid it, so the
    // bar is clamped to at least its pickup day and stays visible.
    to: to.getTime() < from.getTime() ? from : to,
  }
}

/**
 * The bookings OVERLAPPING an inclusive AD day window, as calendar bars.
 *
 * `fromAd` / `toAd` are Nepal calendar days (`YYYY-MM-DD`) — the days the grid
 * is drawing, not instants.
 *
 * The overlap is the whole point: `pickup_at <= <close of toAd>` and
 * `return_at >= <open of fromAd>` selects the four cases a calendar must show —
 * a booking wholly inside the window, one that starts before it and runs in, one
 * that starts inside and runs out, and one that spans the window entirely. A
 * single-column range would have kept only the first two.
 *
 * Returns bars sorted by start day, then by row id — the primary key, not the
 * booking number, because only a unique column makes the order total — so a
 * re-render cannot reshuffle the lanes under the operator's cursor.
 *
 * `total` is the EXACT count of overlapping bookings, which may be larger than
 * `rows.length`: see `CALENDAR_WINDOW_LIMIT`. A caller that draws the rows must
 * compare the two and say when the window was cut.
 */
export async function listCalendarBookings(fromAd: string, toAd: string): Promise<ListQueryResult<Bar>> {
  const startMinutes = dayStartMinutes()
  const windowOpen = dayBounds(fromAd).open
  const windowClose = dayBounds(toAd).close

  const { data, error, count } = await supabase
    .from('bookings')
    // `count: 'exact'` costs a second planner pass and buys the one thing a
    // silent truncation destroys: the ability to know it happened.
    .select(CALENDAR_COLUMNS, { count: 'exact' })
    // The overlap. Both bounds are inclusive: a booking returning at the exact
    // instant the window opens still occupied that day.
    .lte('pickup_at', windowClose)
    .gte('return_at', windowOpen)
    .in('stage', CALENDAR_STAGES)
    // Law 3 / 0015 — 'Cancelled' is a flag, not a stage. A cancelled booking is
    // still a row and is still read elsewhere; it is not work on a calendar.
    .is('cancelled_at', null)
    .order('pickup_at', { ascending: true })
    // `bookings.id` is the primary key (0002:22) — a total order, so paging and
    // re-fetching return the same sequence. See PAGINATION in `listQuery.ts`.
    .order('id', { ascending: true })
    // The named ceiling, so truncation is this module's decision rather than
    // PostgREST's default applied out of sight. See `CALENDAR_WINDOW_LIMIT`.
    .limit(CALENDAR_WINDOW_LIMIT)

  if (error) throw new Error(`listCalendarBookings failed: ${error.message}`)

  const rows = ((data ?? []) as unknown as RawCalendarRow[]).map((r) => toBar(r, startMinutes))
  // `count` is the exact number of matching bookings; `rows.length` is how many
  // came back. They differ exactly when the window was cut. Falling back to
  // `rows.length` when the count is absent keeps the old — honest, if less
  // informative — behaviour rather than inventing a total.
  return { rows, total: count ?? rows.length }
}

/**
 * The nominal column the window travels under.
 *
 * ⚠ This filter set never reaches `applyListFilters` — `fetchCalendarBars`
 * unpacks it and calls `listCalendarBookings`, which builds its own overlap.
 * The name is here so the shape is a legal `ListFilters` and so `useList`'s
 * `filterKey` re-fetches when the window moves; it is not the column the query
 * bounds. `pickup_at` is used rather than an invented name so nothing downstream
 * can be handed a column that does not exist.
 */
const WINDOW_COLUMN = 'pickup_at'

/**
 * The window as a `ListFilters`, so the screen can drive this read through
 * `useList` like every other list and get the same loading / error / empty
 * states without a bespoke effect.
 */
export function calendarWindow(fromAd: string, toAd: string): ListFilters {
  return { dateRange: { column: WINDOW_COLUMN, fromAd, toAd } }
}

/**
 * The `useList` adapter. Reads the window back out of the filter set
 * `calendarWindow` built and asks the real question.
 *
 * A filter set with no window is a programming mistake at a fixed call site, not
 * a runtime condition, so it throws rather than quietly fetching every booking
 * in the table.
 */
export async function fetchCalendarBars(filters: ListFilters): Promise<ListQueryResult<Bar>> {
  const { fromAd, toAd } = filters.dateRange ?? {}
  if (!fromAd || !toAd) {
    throw new Error('fetchCalendarBars needs a window — build it with calendarWindow(fromAd, toAd).')
  }
  return listCalendarBookings(fromAd, toAd)
}
