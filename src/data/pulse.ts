import { rupees, roundHalfUp, formatMoney } from '../lib/money'
import type { Paisa } from '../lib/money'
import { TODAY, toBs, formatBs, formatAd, isWeekend } from '../lib/bs'
import { UTILIZATION_PCT, REVENUE_TODAY_PAISA, COUNTS } from './today'

/**
 * **Reports ▸ Pulse — the seed ledger.**
 *
 * `Reports.md` v2.1 §2.1: *"Reports reads, it does not compute. Every figure
 * comes from the engine that owns it… Reports may group, filter and compare. It
 * may not define a metric."* There is no Financial Engine query behind this
 * build yet, so this file stands in for those engines: it holds **one daily
 * ledger** and nothing else, and every panel on the page is a grouping of it.
 * The page itself computes no business figure.
 *
 * Three corrections from the spec are structural here rather than cosmetic:
 *
 * · **§3 — the period drives everything.** Every figure is a function of
 *   `(from, to)`. There is no constant on this page that survives a period
 *   change, which is what the render got wrong (a July range over Jan–Dec
 *   charts, with actuals in months that had not happened).
 * · **§5.3 — metrics are bounded.** Units on rent are distributed under a
 *   per-model cap, so `rental days ≤ units × days` and `utilization ≤ 100%`
 *   cannot be written down wrong. The render showed 128 rental days inside a
 *   31-day month.
 * · **§2.2 — Reports must not be the system's fifth opinion.** Two calibrations
 *   below tie this ledger to the engines the rest of the app already reads, and
 *   `RECONCILIATION` re-checks the tie on every load.
 *
 * Amounts are integer paisa throughout (§2.3) and every one is built with
 * `rupees()` / `roundHalfUp()` from `lib/money.ts`.
 */

const DAY = 86_400_000

/** The ledger's coverage. Anything asked of a date outside it answers `null`. */
export const LEDGER_FROM = new Date(Date.UTC(2026, 5, 1))
export const LEDGER_TO = TODAY
export const LEDGER_COVERAGE = `${formatAd(LEDGER_FROM)} – ${formatAd(LEDGER_TO)}`

function utc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
function addDays(d: Date, n: number): Date {
  return new Date(utc(d) + n * DAY)
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((utc(b) - utc(a)) / DAY)
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** "26 Jul" — the axis/label form. Full dates always go through `lib/bs.ts`. */
export function shortAd(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' })
}

/**
 * A deterministic wobble in `[0,1)`. Seed shaping only — never a business
 * figure. Written out rather than `Math.random()` so two loads of the page, and
 * two readers of the same export, never see different numbers.
 */
function noise(i: number): number {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/* ── the fleet ─────────────────────────────────────────────────────────── */

export interface FleetModel {
  name: string
  /** Owned units. The cap that bounds every utilization figure below. */
  units: number
  dayRate: Paisa
  /** Relative demand. Only decides how the day's on-rent units split. */
  weight: number
}

/** The five models the render's Top Equipment panel names, with a real fleet size. */
export const FLEET: FleetModel[] = [
  { name: 'Sony FX3', units: 6, dayRate: rupees(9500), weight: 26 },
  { name: 'Aputure 600d Pro', units: 5, dayRate: rupees(7200), weight: 20 },
  { name: 'Ronin 4D 6K', units: 3, dayRate: rupees(12500), weight: 13 },
  { name: 'DJI RS 3 Pro', units: 7, dayRate: rupees(3800), weight: 20 },
  { name: 'Sony FE 24-70mm GM II', units: 9, dayRate: rupees(2600), weight: 21 },
]

export const FLEET_UNITS = FLEET.reduce((s, m) => s + m.units, 0)

/**
 * Largest-remainder split **under a per-model cap**.
 *
 * This is the one function that makes §5.3's bound structural: a model can
 * never be handed more units than it owns, so no period can ever report more
 * rental days than `units × days`, and no utilization can exceed 100%. The
 * assertions at the foot of this file re-check it anyway.
 */
function distribute(total: number, caps: number[], weights: number[]): number[] {
  const wsum = weights.reduce((a, b) => a + b, 0) || 1
  const exact = weights.map((w) => (total * w) / wsum)
  const out = exact.map((s, i) => clamp(Math.floor(s), 0, caps[i] ?? 0))
  const order = exact
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  let left = total - out.reduce((a, b) => a + b, 0)
  let guard = 0
  while (left > 0 && guard < 200) {
    let moved = false
    for (const o of order) {
      if (left <= 0) break
      if ((out[o.i] ?? 0) < (caps[o.i] ?? 0)) {
        out[o.i] = (out[o.i] ?? 0) + 1
        left -= 1
        moved = true
      }
    }
    if (!moved) break
    guard += 1
  }
  return out
}

/* ── the daily ledger ──────────────────────────────────────────────────── */

export interface LedgerDay {
  ad: Date
  /** Units on rent, index-aligned with `FLEET`. Each ≤ that model's units. */
  onRent: number[]
  onRentTotal: number
  /** Rental revenue, recognised across rental days — see `PERIOD_BASIS`. */
  equipment: Paisa
  /** Crew, transport and consumables. Excluded from equipment-level reports. */
  services: Paisa
  revenue: Paisa
  expenses: Paisa
  /** Money actually received against invoices — not the same as revenue. */
  collected: Paisa
  /** Liabilities (Finance §5). In Cash Flow, never in Profit. */
  deposits: Paisa
  capital: Paisa
  cashIn: Paisa
  cashOut: Paisa
}

const SERVICES_RATIO = 0.18
const EXPENSE_FIXED = rupees(21_000)
const EXPENSE_VARIABLE = 0.235
const COLLECT_SAME_DAY = 0.62
const COLLECT_LAGGED = 0.345
const COLLECT_LAG_DAYS = 12
const PAYABLE_LAG_DAYS = 3
/** Receivable carried into 1 Jun 2026 from before the ledger starts. */
export const OPENING_RECEIVABLE = rupees(158_000)
/** A capital purchase — cash out, no effect on profit. §6.1's whole point. */
const CAPITAL_ON = Date.UTC(2026, 6, 12)
const CAPITAL_AMOUNT = rupees(4_80_000)

const DAY_COUNT = daysBetween(LEDGER_FROM, LEDGER_TO) + 1
const DATES: Date[] = Array.from({ length: DAY_COUNT }, (_, i) => new Date(utc(LEDGER_FROM) + i * DAY))

/** Raw fleet demand, before calibration. */
const fleetOnRent: number[] = DATES.map((d, i) => {
  const weekend = isWeekend(d) ? 0.74 : 1
  const wobble = 0.82 + 0.32 * noise(i)
  return clamp(Math.round(FLEET_UNITS * 0.92 * weekend * wobble), 0, FLEET_UNITS)
})

/**
 * **Calibration 1 of 2 (§2.2).** The current month's on-rent total is nudged,
 * one unit-day at a time, until fleet utilization for the month equals the
 * figure Inventory already publishes on Today (`UTILIZATION_PCT`). Without it
 * this page would print a fourth utilization number beside the three the build
 * already shows — which is the exact defect §2.2 names.
 */
const CURRENT_MONTH = TODAY.getUTCMonth()
const currentMonthIdx = DATES.map((d, i) => (d.getUTCMonth() === CURRENT_MONTH ? i : -1)).filter((i) => i >= 0)
{
  const target = Math.round((UTILIZATION_PCT / 100) * FLEET_UNITS * currentMonthIdx.length)
  let sum = currentMonthIdx.reduce((s, i) => s + (fleetOnRent[i] ?? 0), 0)
  let guard = 0
  while (sum !== target && guard < 500) {
    for (const i of currentMonthIdx) {
      if (sum === target) break
      const cur = fleetOnRent[i] ?? 0
      if (sum < target && cur < FLEET_UNITS) {
        fleetOnRent[i] = cur + 1
        sum += 1
      } else if (sum > target && cur > 0) {
        fleetOnRent[i] = cur - 1
        sum -= 1
      }
    }
    guard += 1
  }
}

const CAPS = FLEET.map((m) => m.units)
const WEIGHTS = FLEET.map((m) => m.weight)

export const LEDGER: LedgerDay[] = DATES.map((ad, i) => {
  const onRent = distribute(fleetOnRent[i] ?? 0, CAPS, WEIGHTS)
  const equipment = onRent.reduce((s, units, m) => s + units * (FLEET[m]?.dayRate ?? 0), 0) as Paisa
  const services = roundHalfUp(equipment * SERVICES_RATIO) as Paisa
  const revenue = (equipment + services) as Paisa
  const expenses = (EXPENSE_FIXED + roundHalfUp(revenue * EXPENSE_VARIABLE)) as Paisa
  const deposits = rupees(4_000 * Math.round(1 + 7 * noise(i + 211))) as Paisa
  const capital = (utc(ad) === CAPITAL_ON ? CAPITAL_AMOUNT : 0) as Paisa
  return {
    ad,
    onRent,
    onRentTotal: onRent.reduce((a, b) => a + b, 0),
    equipment,
    services,
    revenue,
    expenses,
    collected: 0 as Paisa,
    deposits,
    capital,
    cashIn: 0 as Paisa,
    cashOut: 0 as Paisa,
  }
})

/**
 * **Calibration 2 of 2 (§2.2).** The last ledger day is today, and Today
 * already publishes a Revenue Today figure. The services line for that one day
 * is pinned so the two screens cannot disagree; `RECONCILIATION` re-checks it.
 */
const LAST = LEDGER[LEDGER.length - 1]
if (LAST && REVENUE_TODAY_PAISA - LAST.equipment >= 0) {
  LAST.services = (REVENUE_TODAY_PAISA - LAST.equipment) as Paisa
  LAST.revenue = REVENUE_TODAY_PAISA
  LAST.expenses = (EXPENSE_FIXED + roundHalfUp(LAST.revenue * EXPENSE_VARIABLE)) as Paisa
}

/* Collections and cash, which need yesterday's rows and so run in a second pass. */
LEDGER.forEach((d, i) => {
  const lagged = LEDGER[Math.max(0, i - COLLECT_LAG_DAYS)]
  d.collected = (roundHalfUp(d.revenue * COLLECT_SAME_DAY) +
    roundHalfUp((lagged?.revenue ?? 0) * COLLECT_LAGGED)) as Paisa
  const paid = LEDGER[Math.max(0, i - PAYABLE_LAG_DAYS)]
  d.cashIn = (d.collected + d.deposits) as Paisa
  d.cashOut = ((paid?.expenses ?? 0) + d.capital) as Paisa
})

/* ── exceptions — the fourth KPI ───────────────────────────────────────── */

export interface ExceptionSeed {
  kind: 'Overdue' | 'Damage'
  ref: string
  what: string
  raisedOn: Date
  /** `null` = still open. An exception is counted while it is open. */
  closedOn: Date | null
}

/**
 * Seeded so that the four still open on 31 Jul match Today's Overdue count and
 * the two damage cases match the pair Pulse has always shown. Historical
 * periods differ because the closed ones were open then — which is the point of
 * scoping the card to the period.
 */
export const EXCEPTIONS: ExceptionSeed[] = [
  { kind: 'Overdue', ref: 'BK-2026-0641', what: 'Classic Media — 3 days late', raisedOn: new Date(Date.UTC(2026, 6, 24)), closedOn: null },
  { kind: 'Overdue', ref: 'BK-2026-0655', what: 'Everest Studios — 2 days late', raisedOn: new Date(Date.UTC(2026, 6, 26)), closedOn: null },
  { kind: 'Overdue', ref: 'BK-2026-0662', what: 'Himalayan Films — 1 day late', raisedOn: new Date(Date.UTC(2026, 6, 28)), closedOn: null },
  { kind: 'Overdue', ref: 'BK-2026-0670', what: 'Sagarmatha TV — due back today', raisedOn: new Date(Date.UTC(2026, 6, 30)), closedOn: null },
  { kind: 'Damage', ref: 'CS-2026-0118', what: 'Ronin 4D 6K — gimbal arm', raisedOn: new Date(Date.UTC(2026, 6, 22)), closedOn: null },
  { kind: 'Damage', ref: 'CS-2026-0125', what: 'Sony FX3 — screen delamination', raisedOn: new Date(Date.UTC(2026, 6, 29)), closedOn: null },
  { kind: 'Overdue', ref: 'BK-2026-0602', what: 'Nepal Media Hub — settled', raisedOn: new Date(Date.UTC(2026, 5, 12)), closedOn: new Date(Date.UTC(2026, 5, 20)) },
  { kind: 'Overdue', ref: 'BK-2026-0618', what: 'Kantipur Post — settled', raisedOn: new Date(Date.UTC(2026, 6, 2)), closedOn: new Date(Date.UTC(2026, 6, 10)) },
  { kind: 'Damage', ref: 'CS-2026-0101', what: 'Aputure 600d Pro — yoke', raisedOn: new Date(Date.UTC(2026, 5, 5)), closedOn: new Date(Date.UTC(2026, 5, 18)) },
]

/* ── upcoming payments and receivables ─────────────────────────────────── */

export interface UpcomingRow {
  kind: 'Receivable' | 'Payment'
  reference: string
  party: string
  due: Date
  amount: Paisa
}

/**
 * The render's own rows, with one correction: it marks a receivable due 3 Aug
 * as *Overdue 3 days* while its neighbours imply today is 31 Jul. §4.3 allows
 * one clock, so status is **derived** from the period's as-of date here and
 * never typed into the data.
 */
export const UPCOMING: UpcomingRow[] = [
  { kind: 'Receivable', reference: 'INV-2026-0159', party: 'Classic Media', due: new Date(Date.UTC(2026, 6, 28)), amount: rupees(75_000) },
  { kind: 'Payment', reference: 'Salary Shrawan 2083', party: 'Staff salary', due: new Date(Date.UTC(2026, 7, 1)), amount: rupees(2_15_000) },
  { kind: 'Receivable', reference: 'INV-2026-0160', party: 'Himalayan Films', due: new Date(Date.UTC(2026, 7, 6)), amount: rupees(45_000) },
  { kind: 'Payment', reference: 'Office rent — Bhadra', party: 'Sunrise Complex Pvt. Ltd.', due: new Date(Date.UTC(2026, 7, 5)), amount: rupees(85_000) },
  { kind: 'Receivable', reference: 'INV-2026-0162', party: 'Everest Studios', due: new Date(Date.UTC(2026, 7, 9)), amount: rupees(1_18_000) },
  { kind: 'Payment', reference: 'VAT — Ashadh 2083', party: 'Inland Revenue', due: new Date(Date.UTC(2026, 7, 12)), amount: rupees(1_64_000) },
]

/* ── grouping — everything the page renders comes from here ────────────── */

export interface EquipmentRow {
  name: string
  revenue: Paisa
  rentalDays: number
  /** `units × days in period` — the ceiling §5.3 asserts against. */
  capacity: number
  utilization: number
}

export interface Bucket {
  label: string
  revenue: Paisa
  expenses: Paisa
  profit: Paisa
  cashIn: Paisa
  cashOut: Paisa
  netCash: Paisa
  utilization: number
}

export interface PeriodFigures {
  from: Date
  to: Date
  days: number
  revenue: Paisa
  expenses: Paisa
  profit: Paisa
  collected: Paisa
  /** Cumulative receivable as at the period's last day. */
  outstanding: Paisa
  collectedPct: number
  cashIn: Paisa
  cashOut: Paisa
  netCash: Paisa
  deposits: Paisa
  utilization: number
  overdue: number
  damage: number
  equipment: EquipmentRow[]
  buckets: Bucket[]
  /** True while the period is still open — §12's freshness rule. */
  live: boolean
}

function slice(from: Date, to: Date): LedgerDay[] {
  const a = utc(from)
  const b = utc(to)
  return LEDGER.filter((d) => utc(d.ad) >= a && utc(d.ad) <= b)
}

function sum(days: LedgerDay[], pick: (d: LedgerDay) => number): Paisa {
  return days.reduce((s, d) => s + pick(d), 0) as Paisa
}

/** ≤ 8 buckets, split evenly; one per day while the period is short. */
function bucketize(days: LedgerDay[]): Bucket[] {
  if (days.length === 0) return []
  const size = days.length <= 10 ? 1 : Math.ceil(days.length / 8)
  const out: Bucket[] = []
  for (let i = 0; i < days.length; i += size) {
    const chunk = days.slice(i, i + size)
    const head = chunk[0]
    if (!head) continue
    const revenue = sum(chunk, (d) => d.revenue)
    const expenses = sum(chunk, (d) => d.expenses)
    const cashIn = sum(chunk, (d) => d.cashIn)
    const cashOut = sum(chunk, (d) => d.cashOut)
    const onRent = chunk.reduce((s, d) => s + d.onRentTotal, 0)
    out.push({
      label: shortAd(head.ad),
      revenue,
      expenses,
      profit: (revenue - expenses) as Paisa,
      cashIn,
      cashOut,
      netCash: (cashIn - cashOut) as Paisa,
      utilization: Math.round((onRent / (FLEET_UNITS * chunk.length)) * 100),
    })
  }
  return out
}

/**
 * The one grouping function. Returns `null` for a range the ledger cannot
 * vouch for, which is what lets the period picker disable a preset with a
 * reason instead of inventing a number for it.
 */
export function figuresFor(from: Date, to: Date): PeriodFigures | null {
  if (utc(from) > utc(to)) return null
  if (utc(from) < utc(LEDGER_FROM) || utc(to) > utc(LEDGER_TO)) return null

  const days = slice(from, to)
  if (days.length === 0) return null

  const revenue = sum(days, (d) => d.revenue)
  const expenses = sum(days, (d) => d.expenses)
  const collected = sum(days, (d) => d.collected)
  const cashIn = sum(days, (d) => d.cashIn)
  const cashOut = sum(days, (d) => d.cashOut)

  /* Receivable is a running balance, so it reads the whole ledger up to the
     period's last day rather than the period alone. */
  const toDate = slice(LEDGER_FROM, to)
  const outstanding = (OPENING_RECEIVABLE +
    toDate.reduce((s, d) => s + d.revenue - d.collected, 0)) as Paisa

  const equipment: EquipmentRow[] = FLEET.map((m, i) => {
    const rentalDays = days.reduce((s, d) => s + (d.onRent[i] ?? 0), 0)
    const capacity = m.units * days.length
    return {
      name: m.name,
      revenue: (rentalDays * m.dayRate) as Paisa,
      rentalDays,
      capacity,
      utilization: Math.round((rentalDays / capacity) * 100),
    }
  }).sort((a, b) => b.revenue - a.revenue)

  const onRent = days.reduce((s, d) => s + d.onRentTotal, 0)
  const openAt = (e: ExceptionSeed) =>
    utc(e.raisedOn) <= utc(to) && (e.closedOn === null || utc(e.closedOn) > utc(to))

  return {
    from,
    to,
    days: days.length,
    revenue,
    expenses,
    profit: (revenue - expenses) as Paisa,
    collected,
    outstanding,
    collectedPct: revenue > 0 ? Math.round((collected / revenue) * 100) : 0,
    cashIn,
    cashOut,
    netCash: (cashIn - cashOut) as Paisa,
    deposits: sum(days, (d) => d.deposits),
    utilization: Math.round((onRent / (FLEET_UNITS * days.length)) * 100),
    overdue: EXCEPTIONS.filter((e) => e.kind === 'Overdue' && openAt(e)).length,
    damage: EXCEPTIONS.filter((e) => e.kind === 'Damage' && openAt(e)).length,
    equipment,
    buckets: bucketize(days),
    live: utc(to) >= utc(TODAY),
  }
}

/* ── §4.2 presets ──────────────────────────────────────────────────────── */

export interface PeriodOption {
  key: string
  label: string
  range: { from: Date; to: Date } | null
  /** Why the range is unavailable. Rendered on the disabled preset. */
  why: string | null
}

/** Sunday-start week — Nepal's weekend is Saturday (`lib/bs.ts`). */
function weekStart(d: Date): Date {
  return addDays(d, -d.getUTCDay())
}

/**
 * 1 Shrawan is the fiscal year's first day (§4.2). Found by walking back
 * through the Date Engine rather than typed, so it cannot drift from `lib/bs.ts`.
 */
const fiscalYearStart: Date | null = (() => {
  for (let i = 0; i <= 400; i += 1) {
    const d = addDays(TODAY, -i)
    const bs = toBs(d)
    if (bs && bs.month === 4 && bs.day === 1) return d
  }
  return null
})()

const OUT_OF_TABLE =
  'The BS table covers Shrawan 2083 only (lib/bs.ts), so this range cannot be resolved without inventing a Nepali date.'
const OUT_OF_LEDGER = `Outside the seed ledger, which covers ${LEDGER_COVERAGE}.`

function opt(key: string, label: string, from: Date, to: Date): PeriodOption {
  const ok = figuresFor(from, to) !== null
  return { key, label, range: ok ? { from, to } : null, why: ok ? null : OUT_OF_LEDGER }
}

const monthStart = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1))
const lastMonthEnd = addDays(monthStart, -1)
const lastMonthStart = new Date(Date.UTC(lastMonthEnd.getUTCFullYear(), lastMonthEnd.getUTCMonth(), 1))

export const PERIODS: PeriodOption[] = [
  opt('today', 'Today', TODAY, TODAY),
  opt('yesterday', 'Yesterday', addDays(TODAY, -1), addDays(TODAY, -1)),
  opt('this-week', 'This week', weekStart(TODAY), TODAY),
  opt('last-week', 'Last week', addDays(weekStart(TODAY), -7), addDays(weekStart(TODAY), -1)),
  opt('last-7', 'Last 7 days', addDays(TODAY, -6), TODAY),
  opt('last-30', 'Last 30 days', addDays(TODAY, -29), TODAY),
  opt('this-month', 'This month', monthStart, TODAY),
  opt('last-month', 'Last month', lastMonthStart, lastMonthEnd),
  {
    key: 'this-quarter',
    label: 'This quarter',
    range: null,
    why: `A quarter of the Shrawan–Ashadh fiscal year needs BS month lengths. ${OUT_OF_TABLE} TODO(decision): are quarters BS or AD?`,
  },
  {
    key: 'last-quarter',
    label: 'Last quarter',
    range: null,
    why: `A quarter of the Shrawan–Ashadh fiscal year needs BS month lengths. ${OUT_OF_TABLE} TODO(decision): are quarters BS or AD?`,
  },
  fiscalYearStart
    ? opt('this-fy', 'This fiscal year (2083/84)', fiscalYearStart, TODAY)
    : { key: 'this-fy', label: 'This fiscal year (2083/84)', range: null, why: OUT_OF_TABLE },
  {
    key: 'last-fy',
    label: 'Last fiscal year (2082/83)',
    range: null,
    why: `1 Shrawan 2082 is outside the table. ${OUT_OF_TABLE}`,
  },
  fiscalYearStart
    ? opt('bs-shrawan', 'BS month · Shrawan 2083 to date', fiscalYearStart, TODAY)
    : { key: 'bs-shrawan', label: 'BS month · Shrawan 2083 to date', range: null, why: OUT_OF_TABLE },
]

export const DEFAULT_PERIOD = 'this-month'

/** The comparison range §9 renders as a second labelled series: the period before. */
export function previousPeriod(from: Date, to: Date): { from: Date; to: Date } | null {
  const span = daysBetween(from, to) + 1
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(span - 1))
  return figuresFor(prevFrom, prevTo) ? { from: prevFrom, to: prevTo } : null
}

/* ── dates, from the one engine ────────────────────────────────────────── */

export interface RangeLabel {
  /** BS above AD (§4.1). `null` when the engine cannot vouch for the range. */
  bs: string | null
  ad: string
  /** Stated reason, rendered in place of the BS line. */
  bsNote: string | null
}

export function rangeLabel(from: Date, to: Date): RangeLabel {
  const a = toBs(from)
  const b = toBs(to)
  const ad = utc(from) === utc(to) ? formatAd(from) : `${formatAd(from)} – ${formatAd(to)}`
  if (a && b) {
    const bs =
      utc(from) === utc(to)
        ? formatBs(a)
        : a.year === b.year && a.month === b.month
          ? `${a.day} – ${formatBs(b)}`
          : `${formatBs(a, { suffix: false })} – ${formatBs(b)}`
    return { bs, ad, bsNote: null }
  }
  const missing = !a ? formatAd(from) : formatAd(to)
  return {
    bs: null,
    ad,
    bsNote: `BS unavailable for ${missing} — lib/bs.ts covers Shrawan 2083 (16 Jul – 16 Aug 2026) and returns nothing outside it.`,
  }
}

/**
 * §4.3 — one clock. Every "overdue" and "due in" on the page derives from the
 * period's last day, so the page can never imply two different todays.
 */
export function dueStatus(due: Date, asOf: Date): { text: string; tone: 'danger' | 'progress' | 'neutral' } {
  const d = daysBetween(asOf, due)
  if (d < 0) return { text: `Overdue ${-d} ${-d === 1 ? 'day' : 'days'}`, tone: 'danger' }
  if (d === 0) return { text: 'Due today', tone: 'danger' }
  if (d <= 7) return { text: `Due in ${d} ${d === 1 ? 'day' : 'days'}`, tone: 'progress' }
  return { text: `Due in ${d} days`, tone: 'neutral' }
}

/* ── §5.1 report definitions ───────────────────────────────────────────── */

export type ChartView = 'revenue' | 'cash' | 'profit' | 'utilization'

export interface ReportDefinition {
  key: ChartView
  title: string
  shows: string
  formula: string
  source: string
  basis: string
  excludes: string
}

/**
 * ⭐ TODO(decision) — `Reports.md` §5.2 / §14. Revenue recognition is unanswered:
 * at booking confirmation, at pickup, or spread across rental days. This ledger
 * spreads it across rental days because that is the only basis a per-day ledger
 * can state honestly, and the definition below says so on the page rather than
 * leaving each reader to assume. Every revenue figure here changes if Babin
 * answers differently.
 */
export const PERIOD_BASIS = 'Spread across rental days — TODO(decision), Reports §5.2'

export const DEFINITIONS: Record<ChartView, ReportDefinition> = {
  revenue: {
    key: 'revenue',
    title: 'Revenue',
    shows: 'Rental revenue recognised inside the selected period.',
    formula: 'Σ (units on rent × day rate) + services, by bucket',
    source: 'Financial Engine · Bookings',
    basis: PERIOD_BASIS,
    excludes: 'Deposits, VAT, sub-rental cost recharged at cost',
  },
  cash: {
    key: 'cash',
    title: 'Cash flow',
    shows: 'Money in and money out, on the day it moved.',
    formula: 'Cash in = collections + deposits · Cash out = supplier and payroll settlements + capital purchases',
    source: 'Financial Engine · Payments',
    basis: 'Movement date — not the invoice date',
    excludes: 'Nothing. Cash flow is not profit: deposits and capital purchases appear here and never in profit (Finance §5, Reports §6.1)',
  },
  profit: {
    key: 'profit',
    title: 'Expense vs profit',
    shows: 'Revenue, expenses and the accrual profit between them.',
    formula: 'Profit = revenue − expenses, in the period',
    source: 'Financial Engine · Expenses v2.2',
    basis: PERIOD_BASIS,
    excludes: 'Deposits (a liability), capital purchases (balance sheet), VAT',
  },
  utilization: {
    key: 'utilization',
    title: 'Equipment utilization',
    shows: 'Share of the rentable fleet that was on rent.',
    formula: 'Σ unit-days on rent ÷ (units owned × days in period)',
    source: 'Inventory v3.0 §8',
    basis: 'Rental days inside the period',
    excludes: 'Units written off, units in maintenance beyond the fleet count',
  },
}

/* ── §2.2 the reconciliation assertion ─────────────────────────────────── */

export interface ReconciliationCheck {
  /** Which KPI card must show the discrepancy instead of its number. */
  card: 'Revenue' | 'Cash' | 'Equipment utilization' | 'Exceptions'
  figure: string
  engine: string
  pulse: string
  source: string
  ok: boolean
}

const SOURCE_OVERDUE = COUNTS.find((c) => c.label === 'Overdue')?.value ?? 0
const CURRENT_MONTH_FIGURES = figuresFor(monthStart, TODAY)
const TODAY_FIGURES = figuresFor(TODAY, TODAY)

/**
 * §2.2 — *"A reconciliation assertion runs on load. Where a headline differs
 * from its source engine, the card shows the discrepancy rather than the
 * number."* Three headlines have an owner inside this build; each is compared
 * to it here, and `Pulse.tsx` renders the mismatch on the card itself.
 */
export const RECONCILIATION: ReconciliationCheck[] = [
  {
    card: 'Equipment utilization',
    figure: 'Equipment utilization, this month',
    engine: 'Inventory v3.0 §8',
    pulse: `${CURRENT_MONTH_FIGURES?.utilization ?? 0}%`,
    source: `${UTILIZATION_PCT}%`,
    ok: (CURRENT_MONTH_FIGURES?.utilization ?? -1) === UTILIZATION_PCT,
  },
  {
    card: 'Revenue',
    figure: 'Revenue, today',
    engine: 'Financial Engine',
    pulse: formatMoney(TODAY_FIGURES?.revenue ?? (0 as Paisa)),
    source: formatMoney(REVENUE_TODAY_PAISA),
    ok: (TODAY_FIGURES?.revenue ?? -1) === REVENUE_TODAY_PAISA,
  },
  {
    card: 'Exceptions',
    figure: 'Overdue, open now',
    engine: 'Status Engine · Today',
    pulse: String(CURRENT_MONTH_FIGURES?.overdue ?? 0),
    source: String(SOURCE_OVERDUE),
    ok: (CURRENT_MONTH_FIGURES?.overdue ?? -1) === SOURCE_OVERDUE,
  },
]

/* ── §5.3 bounds, asserted rather than documented ──────────────────────── */

/**
 * Reported, never thrown — a module-evaluation throw runs before any
 * ErrorBoundary exists and blanks the page (`lib/money.ts` learned this the
 * hard way). `Pulse.tsx` renders these inline instead.
 */
export const LEDGER_ASSERTION_ERRORS: string[] = (() => {
  const errs: string[] = []
  const whole = figuresFor(LEDGER_FROM, LEDGER_TO)
  if (!whole) return ['The seed ledger produced no days at all — see data/pulse.ts.']
  for (const row of whole.equipment) {
    if (row.rentalDays > row.capacity)
      errs.push(`${row.name}: ${row.rentalDays} rental days inside a ${row.capacity} unit-day ceiling (Reports §5.3).`)
    if (row.utilization > 100) errs.push(`${row.name}: utilization ${row.utilization}% exceeds 100% (Reports §5.3).`)
  }
  if (whole.utilization > 100) errs.push(`Fleet utilization ${whole.utilization}% exceeds 100% (Reports §5.3).`)
  if (LEDGER.some((d) => utc(d.ad) > utc(TODAY)))
    errs.push('The ledger carries a day after today — §3 forbids actuals in a future period.')
  return errs
})()

/* ── §11 export header ─────────────────────────────────────────────────── */

/** Every export prints period, comparison, filters and generation time (§11). */
export function exportHeader(
  f: PeriodFigures,
  compare: { from: Date; to: Date } | null,
  generatedBy: string,
): string[] {
  const p = rangeLabel(f.from, f.to)
  const c = compare ? rangeLabel(compare.from, compare.to) : null
  return [
    'Babin Rentals OS — Reports ▸ Pulse',
    `Period,${p.bs ? `${p.bs} / ` : ''}${p.ad}`,
    `Compared with,${c ? `${c.bs ? `${c.bs} / ` : ''}${c.ad}` : 'None'}`,
    'Filters,None — Pulse reports the whole business',
    `Revenue recognition,${PERIOD_BASIS}`,
    `Generated by,${generatedBy}`,
    `Generated on,${formatAd(TODAY)} (Asia/Kathmandu)`,
    `Data freshness,${f.live ? 'Live — the period is still open' : `Snapshot, refreshed nightly (period closed ${formatAd(f.to)})`}`,
  ]
}

/* ── §11 scheduling, read-only ─────────────────────────────────────────── */

export interface ScheduleRow {
  name: string
  cadence: string
  recipients: string
  lastRun: string
  lastResult: 'Delivered' | 'Failed'
}

/** §11 — "every schedule shows its last run and its last result". */
export const SCHEDULES: ScheduleRow[] = [
  { name: 'Daily revenue summary', cadence: 'Every day, 08:00', recipients: 'Ramesh Dulal', lastRun: '31 Jul 2026, 08:00', lastResult: 'Delivered' },
  { name: 'Weekly finance report', cadence: 'Every Sunday, 09:00', recipients: 'Ramesh Dulal · Accounts', lastRun: '26 Jul 2026, 09:00', lastResult: 'Delivered' },
  { name: 'Monthly P&L', cadence: 'Ashadh-end, 09:00', recipients: 'Ramesh Dulal', lastRun: '15 Jul 2026, 09:00', lastResult: 'Failed' },
]
