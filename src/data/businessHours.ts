import type { IconName } from '../components/ui/Icon'
import type { StatusKey } from '../lib/status'
import { TODAY, toBs, formatBs, formatAd, isWeekend, eachDay, BS_MONTHS } from '../lib/bs'
import { BRANCHES, totalsOf } from './settings'
import { HOLIDAYS, adDay, dayDiff } from './calendar'
import { WAREHOUSES } from './warehouse'

/**
 * **Business Hours & Holidays** seed —
 * `03 Core Modules/Settings/Business Hours.md` v3.0 (Build Locked), read
 * against `Business Hours.PNG`.
 *
 * Everything the screen prints is derived from the four primitives below —
 * `HOURS`, `SHIFTS`, `EXCEPTIONS` and `YEAR`. No KPI, count, summary row or
 * alert figure is transcribed twice, so the page cannot contradict itself the
 * way the render does.
 *
 * **Time is minutes-from-midnight, never a formatted string.** `06:00 – 22:00`
 * is produced by `spanLabel` at render time, so one change to a window moves
 * the KPI, the facility row, the weekly table and the CSV/ICS export together.
 * The clock is Asia/Kathmandu (NPT, UTC+05:45) — the same civil timezone
 * `lib/bs` renders in.
 *
 * **Dates are AD instants; the BS line is rendered by `lib/bs`, never stored.**
 * That is what forces the biggest departure from the render: the Date Engine's
 * month table covers **Shrawan 2083 (16 Jul – 16 Aug 2026)** and `toBs()`
 * returns null outside it. The render's month is "May 2082 (Baisakh / Jestha)"
 * and its cells carry *three* numbers — a top number, a BS month-day and an AD
 * month-day — which disagree with each other (the top number rolls 31 → 1
 * between AD May 4 and May 5, while the BS line rolls Baishakh 18 → 19, and by
 * mid-month the top number is still climbing when the BS month has changed).
 * Two lines per cell, both from the engine, is the only rendering that cannot
 * drift.
 *
 * **Deviations from the render — locked rules, never copy these back:**
 *  · the render carries the old 17-item **numbered** sidebar. Foundation §5.1
 *    locks 8 unnumbered sections + Settings and the shell owns it.
 *  · the render's `Add Holiday` button is violet. §4.2 bans violet outright;
 *    the primary action takes the blue primary. Gold appears nowhere here
 *    because nothing on this screen is external or sub-rented.
 *  · the render tints the Saturday `Weekly Holiday` chip red. §4.2 keeps red as
 *    the one alarm colour (Overdue, Damaged, Missing, Blocked); a routine
 *    Saturday is neutral. A gazetted closure keeps red — it genuinely blocks
 *    booking.
 *  · the render's rail sums its own parts to **40** holidays and its KPI says
 *    **42**. One derived source settles it — see `YEAR` below.
 *  · the render prints the pickup/return windows in 12-hour (`06:00 AM`) and
 *    everything else in 24-hour. One clock, 24-hour, everywhere.
 *
 * NOT wired to Supabase.
 */

/* ── where a control goes ──────────────────────────────────────────────── */

/**
 * PLAN.md §0 — *no dead controls*. Either a real route, or `none` **with the
 * reason stated**. There is no third case, so `href="#"` cannot be written by
 * accident.
 */
export type Dest = { kind: 'route'; to: string } | { kind: 'none'; why: string }

export const TO = (to: string): Dest => ({ kind: 'route', to })
export const NO = (why: string): Dest => ({ kind: 'none', why })

/* ── the clock ─────────────────────────────────────────────────────────── */

/** Minutes from midnight, Asia/Kathmandu. Never a pre-formatted string. */
export type Minute = number

export const at = (h: number, m = 0): Minute => h * 60 + m

/** A window that closes at or before it opens runs past midnight. */
export interface Span {
  open: Minute
  close: Minute
}

export type Hours = Span | 'always' | 'closed'

export function clock(min: Minute): string {
  const wrapped = ((min % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function isOvernight(h: Hours): boolean {
  return typeof h !== 'string' && h.close <= h.open
}

export function spanLabel(h: Hours): string {
  if (h === 'always') return '24 × 7'
  if (h === 'closed') return 'Closed'
  return `${clock(h.open)} – ${clock(h.close)}`
}

/** Length of a window in minutes — the one place the overnight wrap is handled. */
export function spanMinutes(h: Hours): number {
  if (h === 'always') return 1440
  if (h === 'closed') return 0
  return h.close > h.open ? h.close - h.open : 1440 - h.open + h.close
}

export function hoursLabel(h: Hours): string {
  if (h === 'always') return 'Open continuously'
  if (h === 'closed') return 'Closed all day'
  const mins = spanMinutes(h)
  return `${Math.floor(mins / 60)}h${mins % 60 === 0 ? '' : ` ${mins % 60}m`} open`
}

/* ── facilities ────────────────────────────────────────────────────────── */

export type FacilityKey = 'office' | 'warehouse' | 'pickup' | 'return' | 'emergency'

/** The company default, in the render's order. Everything else derives from it. */
export const HOURS: Record<FacilityKey, Hours> = {
  office: { open: at(6), close: at(18) },
  warehouse: { open: at(6), close: at(22) },
  pickup: { open: at(6), close: at(19) },
  return: { open: at(6), close: at(6) },
  emergency: 'always',
}

export const FACILITY_ORDER: FacilityKey[] = ['office', 'warehouse', 'pickup', 'return', 'emergency']

export const FACILITY_LABEL: Record<FacilityKey, string> = {
  office: 'Office Hours',
  warehouse: 'Warehouse Hours',
  pickup: 'Pickup Counter',
  return: 'Return Counter',
  emergency: 'Emergency Support',
}

export const FACILITY_SHORT: Record<FacilityKey, string> = {
  office: 'Office',
  warehouse: 'Warehouse',
  pickup: 'Pickup Counter',
  return: 'Return Counter',
  emergency: 'Emergency',
}

export const FACILITY_ICON: Record<FacilityKey, IconName> = {
  office: 'briefcase',
  warehouse: 'box',
  pickup: 'package',
  return: 'return_arrow',
  emergency: 'headset',
}

export interface Facility {
  key: FacilityKey
  label: string
  icon: IconName
  hours: Hours
}

export const COMPANY_HOURS: Facility[] = FACILITY_ORDER.map((key) => ({
  key,
  label: FACILITY_LABEL[key],
  icon: FACILITY_ICON[key],
  hours: HOURS[key],
}))

/** The four columns the render's weekly table carries — emergency is 24×7 and never varies. */
export const WEEK_COLUMNS: FacilityKey[] = ['office', 'warehouse', 'pickup', 'return']

/* ── the weekly schedule ───────────────────────────────────────────────── */

/**
 * Seven real AD days, generated from a range — `Calendar.md` §4.1: *columns are
 * generated, never hand-listed*. The build that spec reviewed rendered seven
 * days in eight columns. Saturday is decided by `isWeekend` in `lib/bs`, not by
 * a literal 6 written here, so Nepal's weekend is stated in exactly one place.
 */
export const WEEK_START: Date = adDay(-TODAY.getUTCDay())
export const WEEK: Date[] = eachDay(WEEK_START, 7)

export function weekdayLong(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Kathmandu' })
}

export interface DayRow {
  date: Date
  weekday: string
  hours: Record<FacilityKey, Hours>
  /** Nepal's weekly holiday. Office shuts; the warehouse and counters do not. */
  weeklyHoliday: boolean
}

export const COMPANY_WEEK: DayRow[] = WEEK.map((date) => {
  const off = isWeekend(date)
  return {
    date,
    weekday: weekdayLong(date),
    hours: {
      office: off ? 'closed' : HOURS.office,
      warehouse: HOURS.warehouse,
      pickup: HOURS.pickup,
      return: HOURS.return,
      emergency: HOURS.emergency,
    },
    weeklyHoliday: off,
  }
})

/* ── pickup & return policy ────────────────────────────────────────────── */

/** The one figure the render supplies for the counters. */
export const GRACE_MINUTES = 30

export type ClosedDayRule = 'Next Business Day'
export const CLOSED_DAY_RULE: ClosedDayRule = 'Next Business Day'

export interface PolicyRow {
  label: string
  value: string
  icon: IconName
}

const pickupSpan = HOURS.pickup
const returnSpan = HOURS.return

/** Every row derives from `HOURS` + `GRACE_MINUTES`; nothing is typed twice. */
export const PICKUP_RETURN: PolicyRow[] =
  typeof pickupSpan === 'string' || typeof returnSpan === 'string'
    ? []
    : [
        { label: 'Standard Pickup Time', value: clock(pickupSpan.open), icon: 'package' },
        { label: 'Standard Return Time', value: `${clock(returnSpan.close)} (Next Day)`, icon: 'return_arrow' },
        { label: 'Grace Period', value: `${GRACE_MINUTES} minutes`, icon: 'timer' },
        { label: 'Early Pickup', value: `From ${clock(pickupSpan.open)}`, icon: 'truck' },
        {
          label: 'Late Return',
          value: `Up to ${clock(returnSpan.close + GRACE_MINUTES)} (Next Day)`,
          icon: 'timer',
        },
        { label: 'Closed Day Handling', value: CLOSED_DAY_RULE, icon: 'calendar' },
      ]

/* ── shifts ────────────────────────────────────────────────────────────── */

/**
 * `departments` is a **roster** vocabulary, not `SystemRole`. Warehouse,
 * Operations, Security and Finance are the departments a shift is assigned to;
 * the business 8 remain the only role names in the product and nothing here
 * shadows them.
 */
export interface Shift {
  id: string
  name: string
  span: Span
  breakMinutes: number
  departments: string[]
  active: boolean
}

export const SHIFTS: Shift[] = [
  { id: 'sh-morning', name: 'Morning Shift', span: { open: at(6), close: at(14) }, breakMinutes: 30, departments: ['Warehouse', 'Operations'], active: true },
  { id: 'sh-afternoon', name: 'Afternoon Shift', span: { open: at(14), close: at(22) }, breakMinutes: 30, departments: ['Warehouse', 'Operations'], active: true },
  { id: 'sh-night', name: 'Night Shift', span: { open: at(22), close: at(6) }, breakMinutes: 30, departments: ['Warehouse', 'Security'], active: true },
  { id: 'sh-rot-a', name: 'Rotating Shift A', span: { open: at(6), close: at(14) }, breakMinutes: 30, departments: ['Operations', 'Finance'], active: true },
  { id: 'sh-rot-b', name: 'Rotating Shift B', span: { open: at(14), close: at(22) }, breakMinutes: 30, departments: ['Operations', 'Finance'], active: true },
]

export interface Overlap {
  department: string
  window: string
  shifts: string[]
}

/**
 * Two active shifts covering the same department in the same window. The render
 * asserts a "Shift Conflict" without saying what makes one, so this states only
 * what the roster can prove: the same department is covered twice. Whether a
 * double cover is a rota or a mistake is a scheduling judgement nobody has
 * ruled on — TODO(decision) — so the wording is *Overlapping cover*, never
 * "conflict".
 */
export function overlaps(shifts: Shift[]): Overlap[] {
  const buckets = new Map<string, Overlap>()
  for (const s of shifts) {
    if (!s.active) continue
    for (const dept of s.departments) {
      const key = `${dept}|${s.span.open}|${s.span.close}`
      const found = buckets.get(key)
      if (found) found.shifts.push(s.name)
      else buckets.set(key, { department: dept, window: spanLabel(s.span), shifts: [s.name] })
    }
  }
  return [...buckets.values()].filter((o) => o.shifts.length > 1)
}

/** Shift names appearing in at least one overlap — used to chip the table rows. */
export function overlappingNames(rows: Overlap[]): ReadonlySet<string> {
  return new Set(rows.flatMap((o) => o.shifts))
}

/* ── calendar exceptions ───────────────────────────────────────────────── */

export type ExceptionKind = 'public' | 'festival' | 'maintenance' | 'special'

export const KIND_LABEL: Record<ExceptionKind, string> = {
  public: 'Public Holiday',
  festival: 'Festival',
  maintenance: 'Maintenance',
  special: 'Special Day',
}

/**
 * §4.2 — red is the alarm colour and a gazetted closure blocks booking, so it
 * keeps red. The render also paints the routine Saturday chip red; that one
 * moves to neutral (see the file header).
 */
export const KIND_TONE: Record<ExceptionKind, StatusKey> = {
  public: 'danger',
  festival: 'progress',
  maintenance: 'primary',
  special: 'in',
}

export const KIND_ICON: Record<ExceptionKind, IconName> = {
  public: 'flag',
  festival: 'calendar_event',
  maintenance: 'tool',
  special: 'calendar_stats',
}

export interface CalException {
  id: string
  name: string
  kind: ExceptionKind
  /** Inclusive AD range. The BS line beside it is rendered, never stored. */
  from: Date
  to: Date
  scope: string
  /** `closed` shuts the scope; a span is reduced operating hours. */
  hours: Hours
  /** Whether a booking may still be scheduled inside the window. */
  blocksBooking: boolean
}

/**
 * The three gazetted closures come from **`data/calendar`'s own `HOLIDAYS`**,
 * not from a second list. Business Hours and the Calendar Workspace therefore
 * cannot show a different holiday set for the same month; `SEED_ERRORS` fails
 * loudly if a holiday over there gains no classification here.
 */
const HOLIDAY_KIND: Record<string, ExceptionKind> = {
  Dashain: 'festival',
  'Buddha Jayanti': 'public',
  'Tihar (Laxmi Puja)': 'festival',
}

const FROM_HOLIDAYS: CalException[] = HOLIDAYS.map((h, i) => ({
  id: `hol-${i + 1}`,
  name: h.name,
  kind: HOLIDAY_KIND[h.name] ?? 'public',
  from: h.from,
  to: h.to,
  scope: 'All branches',
  hours: 'closed',
  blocksBooking: true,
}))

/**
 * Maintenance shutdowns and special operating days. Seeded **inside Shrawan
 * 2083** so every one of them can render a BS line from the engine rather than
 * a dash — the render's own dates (Jestha / Ashwin / Kartik 2082) fall outside
 * the one month `lib/bs` can vouch for.
 */
const OPERATING_EXCEPTIONS: CalException[] = [
  {
    id: 'ex-wh-maint',
    name: 'Warehouse Maintenance',
    kind: 'maintenance',
    from: adDay(2),
    to: adDay(2),
    scope: 'All warehouses',
    hours: 'closed',
    blocksBooking: true,
  },
  {
    id: 'ex-half-day',
    name: 'Half Day Operations',
    kind: 'special',
    from: adDay(9),
    to: adDay(9),
    scope: 'All branches',
    hours: { open: at(6), close: at(14) },
    blocksBooking: false,
  },
  {
    id: 'ex-deep-clean',
    name: 'Deep Cleaning Day',
    kind: 'maintenance',
    from: adDay(14),
    to: adDay(14),
    scope: 'Kathmandu Main Hub (HQ)',
    hours: 'closed',
    blocksBooking: true,
  },
]

export const EXCEPTIONS: CalException[] = [...FROM_HOLIDAYS, ...OPERATING_EXCEPTIONS].sort(
  (a, b) => a.from.getTime() - b.from.getTime(),
)

export function exceptionsOn(d: Date): CalException[] {
  const t = d.getTime()
  return EXCEPTIONS.filter((e) => t >= e.from.getTime() && t <= e.to.getTime())
}

/** Whole days a range covers, inclusive. */
export function exceptionDays(e: CalException): number {
  return dayDiff(e.to, e.from) + 1
}

export function isUpcoming(e: CalException, withinDays = 30): boolean {
  const delta = dayDiff(e.from, TODAY)
  return delta >= 0 && delta <= withinDays
}

/**
 * Taken as a **function of the current rows**, never a constant, so a holiday
 * added in session moves the KPI, the alerts and the insights together. A
 * snapshot taken at module load would leave the rail stating the seed while the
 * calendar beside it showed something else.
 */
export function upcomingOf(rows: CalException[], withinDays = 30): CalException[] {
  return rows.filter((e) => isUpcoming(e, withinDays))
}

/** Holiday **days** inside the window, not events — a two-day Tihar is two. */
export function upcomingDaysOf(rows: CalException[], withinDays = 30): number {
  return upcomingOf(rows, withinDays).reduce((s, e) => s + exceptionDays(e), 0)
}

/** Days until an exception opens, from the one `TODAY` in `lib/bs`. */
export function daysAway(e: CalException): number {
  return dayDiff(e.from, TODAY)
}

/* ── the month the engine can name ─────────────────────────────────────── */

/**
 * Every AD day of the BS month `TODAY` falls in, walked outward until `toBs`
 * stops answering. The prev/next controls on the calendar are therefore
 * genuinely unavailable rather than broken: `lib/bs` carries one month table.
 */
function monthStart(from: Date): Date {
  let cursor = from
  for (;;) {
    const back = adDay(dayDiff(cursor, TODAY) - 1)
    const bs = toBs(back)
    if (!bs) return cursor
    const here = toBs(cursor)
    if (here && bs.month !== here.month) return cursor
    cursor = back
  }
}

export const MONTH_DAYS: Date[] = (() => {
  const start = monthStart(TODAY)
  const out: Date[] = []
  for (let i = 0; i < 34; i += 1) {
    const d = adDay(dayDiff(start, TODAY) + i)
    if (!toBs(d)) break
    out.push(d)
  }
  return out
})()

export const MONTH_LABEL: string = (() => {
  const first = MONTH_DAYS[0]
  const bs = first ? toBs(first) : null
  return bs ? `${BS_MONTHS[bs.month - 1] ?? ''} ${bs.year} BS` : 'BS month unavailable'
})()

export const MONTH_AD_LABEL: string = (() => {
  const first = MONTH_DAYS[0]
  const last = MONTH_DAYS[MONTH_DAYS.length - 1]
  return first && last ? `${formatAd(first)} – ${formatAd(last)} AD` : '—'
})()

/** The reason the month cannot be stepped — stated, never a dead chevron. */
export const MONTH_STEP_WHY =
  'The Date Engine carries one BS month table — Shrawan 2083 (16 Jul – 16 Aug 2026). ' +
  'Stepping outside it would print a BS date this build cannot vouch for, so the step is unavailable rather than wrong.'

export const CALENDAR_VIEWS = ['Month', 'Week', 'List'] as const
export type CalendarView = (typeof CALENDAR_VIEWS)[number]

/* ── scopes ────────────────────────────────────────────────────────────── */

export const SCOPES = ['Company', 'Branches', 'Warehouses', 'Counters'] as const
export type Scope = (typeof SCOPES)[number]

export interface ScopeRow {
  id: string
  name: string
  code: string
  meta: string
  hours: Hours
  /** null when the scope carries no override of its own. */
  override: Hours | null
}

/**
 * Nobody has supplied a per-branch or per-warehouse override, so none is
 * invented — every row states that it inherits the company default and the
 * "Set override" control says why it is unavailable. The render only ever
 * populates its Company tab, so there is nothing here to copy from it either.
 */
export const BRANCH_ROWS: ScopeRow[] = BRANCHES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  meta: `${b.city} · ${b.manager}`,
  hours: HOURS.office,
  override: null,
}))

export const WAREHOUSE_ROWS: ScopeRow[] = WAREHOUSES.map((w) => ({
  id: w.id,
  name: w.name,
  code: w.code,
  meta: `${w.branch} · ${w.manager}`,
  hours: HOURS.warehouse,
  override: null,
}))

export const COUNTER_ROWS: ScopeRow[] = [
  { id: 'ctr-pickup', name: FACILITY_LABEL.pickup, code: 'CTR-PU', meta: 'All branches', hours: HOURS.pickup, override: null },
  { id: 'ctr-return', name: FACILITY_LABEL.return, code: 'CTR-RT', meta: 'All branches · closes next day', hours: HOURS.return, override: null },
]

export const OVERRIDE_WHY =
  'A per-scope override is a write against the org tree. No backend is connected in this build, so the company default is what every branch, warehouse and counter runs on.'

/* ── the year ──────────────────────────────────────────────────────────── */

/**
 * The render's rail states six figures for the year and they partition it
 * exactly: 52 + 25 + 11 + 4 + 12 + 262 = 366. Five of the six are inputs — how
 * many days a BS year runs to, and how many closures the government gazettes,
 * are facts nobody derives. **Working Days is the sixth and is derived**, which
 * is what settles the render disagreeing with itself: its `Holidays This Year`
 * KPI says 42 while the same rail's own parts sum to 40.
 */
export const YEAR = {
  /** BS 2083. A BS year runs 365 or 366 days; the render's partition needs 366. */
  days: 366,
  weeklyHolidays: 52,
  publicHolidays: 25,
  festivals: 11,
  maintenanceDays: 4,
  specialOperatingDays: 12,
} as const

export const CLOSURE_DAYS = YEAR.publicHolidays + YEAR.festivals + YEAR.maintenanceDays

export const WORKING_DAYS = YEAR.days - YEAR.weeklyHolidays - CLOSURE_DAYS - YEAR.specialOperatingDays

/* ── rail ──────────────────────────────────────────────────────────────── */

export interface SummaryRow {
  label: string
  value: string
  tone?: StatusKey
}

export const CALENDAR_SUMMARY: SummaryRow[] = [
  { label: 'Working Days', value: String(WORKING_DAYS) },
  { label: 'Weekly Holidays (Sat)', value: String(YEAR.weeklyHolidays) },
  { label: 'Public Holidays', value: String(YEAR.publicHolidays) },
  { label: 'Festivals', value: String(YEAR.festivals) },
  { label: 'Maintenance / Shutdown', value: String(YEAR.maintenanceDays) },
  { label: 'Special Operating Days', value: String(YEAR.specialOperatingDays) },
]

export interface Alert {
  id: string
  text: string
  meta: string
  tone: StatusKey
  icon: IconName
  dest: Dest
}

/** "16 Shrawan 2083 BS · 31 Jul 2026" — both lines from the engine, never stored. */
export function bsAdLabel(d: Date): string {
  const bs = toBs(d)
  return bs ? `${formatBs(bs)} · ${formatAd(d)}` : formatAd(d)
}

/** "18 Shrawan" — the short BS form, with the AD day as the honest fallback. */
export function bsShort(d: Date): string {
  const bs = toBs(d)
  return bs ? `${bs.day} ${BS_MONTHS[bs.month - 1] ?? ''}` : formatAd(d)
}

/** Scopes running the company default because nothing overrides it. */
export const INHERITING_SCOPES = [...BRANCH_ROWS, ...WAREHOUSE_ROWS].filter((r) => r.override === null).length

/**
 * Every count is derived from the rows **passed in**, so a holiday or shift
 * added in session moves the rail with it. The render's alert list carries five
 * rows and so does this one, but "Dashain Schedule Not Set" is gone: Dashain is
 * in `data/calendar`'s holiday set with real dates, so the claim is not true
 * here. What *is* true — nothing carries a schedule override — takes its place.
 */
export function alertsFor(shifts: Shift[], exceptions: CalException[]): Alert[] {
  const ahead = upcomingOf(exceptions)
  const nextClosure = ahead.find((e) => e.blocksBooking)
  const nextMaintenance = ahead.find((e) => e.kind === 'maintenance')
  const nextSpecial = ahead.find((e) => e.kind === 'special')
  const laps = overlaps(shifts)

  return [
    ...(nextClosure
      ? [
          {
            id: 'al-closure',
            text: `Upcoming closure (${nextClosure.name})`,
            meta: `${daysAway(nextClosure)} day${daysAway(nextClosure) === 1 ? '' : 's'}`,
            tone: KIND_TONE[nextClosure.kind],
            icon: KIND_ICON[nextClosure.kind],
            dest: TO('/calendar'),
          } satisfies Alert,
        ]
      : []),
    ...(nextMaintenance
      ? [
          {
            id: 'al-maint',
            text: `Maintenance on ${bsShort(nextMaintenance.from)}`,
            meta: nextMaintenance.scope,
            tone: 'primary',
            icon: 'tool',
            dest: TO('/inventory/warehouses'),
          } satisfies Alert,
        ]
      : []),
    ...(laps.length > 0
      ? [
          {
            id: 'al-overlap',
            text: 'Overlapping shift cover',
            meta: `${laps.length} window${laps.length === 1 ? '' : 's'}`,
            tone: 'progress',
            icon: 'crew',
            dest: NO('Staff assignment per shift needs the roster backend, which is not connected in this build.'),
          } satisfies Alert,
        ]
      : []),
    {
      id: 'al-inherit',
      text: 'No schedule override set',
      meta: `${INHERITING_SCOPES} scopes`,
      tone: 'neutral',
      icon: 'info',
      dest: NO(OVERRIDE_WHY),
    },
    ...(nextSpecial
      ? [
          {
            id: 'al-special',
            text: `${nextSpecial.name} on ${bsShort(nextSpecial.from)}`,
            meta: spanLabel(nextSpecial.hours),
            tone: 'in',
            icon: 'calendar_stats',
            dest: TO('/calendar'),
          } satisfies Alert,
        ]
      : []),
  ]
}

export interface Activity {
  initials: string
  who: string
  what: string
  when: string
}

export const ACTIVITY: Activity[] = [
  { initials: 'RD', who: 'Holiday Added', what: 'Buddha Jayanti added to the closure calendar', when: 'Today, 09:15' },
  { initials: 'SG', who: 'Shift Updated', what: `Night Shift updated (${spanLabel(SHIFTS[2]?.span ?? { open: at(22), close: at(6) })})`, when: 'Yesterday, 17:42' },
  { initials: 'RD', who: 'Hours Changed', what: `Warehouse hours updated to ${spanLabel(HOURS.warehouse)}`, when: 'Yesterday, 14:10' },
  { initials: 'PL', who: 'Branch Schedule Updated', what: 'Pokhara branch confirmed on the company default', when: '4 days ago, 16:30' },
]

export interface Insight {
  text: string
  icon: IconName
  tone: StatusKey
}

/**
 * Every line states something the seed can prove. The render's fourth insight —
 * "2 branches have different Saturday rules" — is not one of them: no branch
 * carries an override, so the true statement is the opposite of the render's.
 */
export function insightsFor(shifts: Shift[], exceptions: CalException[]): Insight[] {
  const days = upcomingDaysOf(exceptions)
  const laps = overlaps(shifts)
  const departments = [...new Set(laps.map((o) => o.department))]

  return [
    ...(days > 0
      ? [
          {
            text: `${days} closure or special day${days === 1 ? '' : 's'} fall in the next 30 days — plan crew before booking against them.`,
            icon: 'calendar_due',
            tone: 'progress',
          } satisfies Insight,
        ]
      : []),
    ...(laps.length > 0
      ? [
          {
            text: `${departments.join(' and ')} ${
              laps.length === 1 ? 'is covered twice in one window' : `is covered twice across ${laps.length} windows`
            }. Confirm the rota or retire a shift.`,
            icon: 'crew',
            tone: 'progress',
          } satisfies Insight,
        ]
      : []),
    {
      text: `Every branch and warehouse runs the company default. ${INHERITING_SCOPES} scopes would change together if the default moved.`,
      icon: 'home',
      tone: 'primary',
    },
    {
      text: `The return counter's window wraps midnight (${Math.round(spanMinutes(HOURS.return) / 60)}h) while the warehouse shuts at ${spanLabel(HOURS.warehouse).split(' – ')[1] ?? ''}. A return after that lands on the next AD day.`,
      icon: 'timer',
      tone: 'primary',
    },
  ]
}

/* ── seed invariants ───────────────────────────────────────────────────── */

/**
 * Asserted at module load and **reported, never thrown** — a module-scope throw
 * runs before React mounts and blanks the app with no message. Same pattern as
 * `data/expenseReports`.
 */
export const SEED_ERRORS: string[] = (() => {
  const errs: string[] = []

  if (WORKING_DAYS !== 262) {
    errs.push(`Calendar Summary: Working Days derives to ${WORKING_DAYS}; the render states 262.`)
  }

  const partition = YEAR.weeklyHolidays + CLOSURE_DAYS + YEAR.specialOperatingDays + WORKING_DAYS
  if (partition !== YEAR.days) {
    errs.push(`Calendar Summary: the six figures partition ${partition} days, not ${YEAR.days}.`)
  }

  for (const h of HOLIDAYS) {
    if (!(h.name in HOLIDAY_KIND)) {
      errs.push(`data/calendar holiday "${h.name}" has no classification here — it would render untyped on the calendar.`)
    }
  }

  for (const e of EXCEPTIONS) {
    if (e.to.getTime() < e.from.getTime()) {
      errs.push(`"${e.name}" ends before it starts.`)
    }
    if (!toBs(e.from) || !toBs(e.to)) {
      errs.push(`"${e.name}" falls outside Shrawan 2083, which is the only month lib/bs can name.`)
    }
  }

  for (const s of SHIFTS) {
    const mins = spanMinutes(s.span)
    if (mins <= 0) errs.push(`Shift "${s.name}" has no length.`)
    if (s.breakMinutes >= mins) errs.push(`Shift "${s.name}" breaks for longer than it runs.`)
  }

  if (COMPANY_WEEK.filter((d) => d.weeklyHoliday).length !== 1) {
    errs.push('The weekly schedule must carry exactly one weekly holiday — lib/bs says Saturday.')
  }

  if (totalsOf(BRANCHES).warehouses !== WAREHOUSE_ROWS.length) {
    errs.push(
      `Branch records count ${totalsOf(BRANCHES).warehouses} warehouses; data/warehouse lists ${WAREHOUSE_ROWS.length}.`,
    )
  }

  return errs
})()
