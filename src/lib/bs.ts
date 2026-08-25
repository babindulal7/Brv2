/**
 * The Date Engine — one conversion, one month-length table, one `today`.
 *
 * `Calendar.md` v3.2 §4.2 marks this ⭐ **"the highest-priority correctness bug
 * in the product"**: the system held three different BS offsets at once, so the
 * same AD day rendered as two different BS days depending on the page. "A
 * Nepali client reading a delivery date one day out is the first thing anyone
 * will notice."
 *
 * Every BS date in the app must come from here. Nothing computes its own.
 *
 * The anchor is the one §4.2 names as correct — the offset used by Cases,
 * Handover and Maintenance: **16 Jul 2026 = 1 Shrawan 2083**, which puts
 * 26 Jul at 11 Shrawan. That is a spec-supplied fact, not a conversion I
 * derived; a real BS calendar table replaces this file's arithmetic later.
 */

/** Locked month spellings — never "Shravan". */
export const BS_MONTHS = [
  'Baishakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const

export interface BsDate {
  year: number
  /** 1-based, indexes `BS_MONTHS`. */
  month: number
  day: number
}

/** 16 Jul 2026 (AD) === 1 Shrawan 2083 (BS). `Calendar.md` §4.2. */
const ANCHOR_AD = Date.UTC(2026, 6, 16)
const ANCHOR_BS: BsDate = { year: 2083, month: 4, day: 1 }

/**
 * Days in Shrawan 2083. BS month lengths vary year to year and come from a
 * table; only the anchor month is known here, so conversion is valid within it
 * and `toBs` returns null outside — an honest gap beats a wrong date.
 *
 * ## ⚠ Required before BS may be trusted anywhere else
 *
 * **A full BS month-length table for 2080–2090 has to land in this file before
 * any BS date outside the window below can be rendered.** A Bikram Sambat month
 * is 29, 30, 31 or 32 days and the sequence is published calendar *data*, not
 * arithmetic: there is no rule, no cycle and no leap formula to derive it from,
 * so nothing here may extrapolate past the one month the anchor vouches for.
 * Inventing those lengths would put a wrong Nepali date in front of a client —
 * `Calendar.md` §4.2's highest-priority correctness bug, in a new costume.
 *
 * Until that table exists the product's primary calendar is **English (AD)**:
 * `toBs` returns null outside its window, `formatBsOrAd` falls back to the
 * English date, and screens state `BS_UNSUPPORTED_NOTE` rather than drawing an
 * empty grid or an em dash where a date belongs.
 */
const SHRAWAN_2083_DAYS = 32

const DAY = 86400000

/**
 * Nepal Time is **UTC+05:45** — Foundation §3.1: "stored UTC, rendered in user
 * timezone (Asia/Kathmandu, UTC+05:45)".
 *
 * Exported because the QUERY side needs the same number: `queries/bookings.ts`
 * builds `+05:45` day boundaries so the day a screen filters by is the day it
 * labels. A second hand-written copy of this offset is precisely the defect
 * `Calendar.md` §4.2 calls the highest-priority correctness bug in the product
 * — the system held three at once — so there is one, here.
 */
export const NPT_OFFSET_MIN = 345

/**
 * An instant → the civil date it falls on **in Kathmandu**.
 *
 * ⛔ This used to truncate on `getUTCDate()`, which is a different date for
 * 5 hours 45 minutes of every day: any instant from 18:15 UTC onward is already
 * tomorrow in Kathmandu, so the BS day, the AD day and every "days left" chip
 * derived from them rendered one day early. It happened to look right only
 * because every seeded timestamp is midnight UTC — 05:45 in Kathmandu — so the
 * window was never crossed. It would have started failing the moment real
 * `timestamptz` values arrived.
 *
 * Shifting by the offset before truncating is correct for Nepal specifically,
 * because NPT has no daylight saving and has not changed since 1986.
 *
 * Returns midnight UTC of that civil date, so `new Date(kathmanduCivil(d))
 * .toISOString().slice(0, 10)` is the Kathmandu calendar date and nothing else.
 * Exported for `queries/bookings.ts`, which needs exactly that string to stamp a
 * day boundary onto the right day — the render side and the query side must
 * agree on which day an instant belongs to, and they only do that by sharing
 * this function rather than each truncating their own way.
 */
export function kathmanduCivil(ad: Date): number {
  const shifted = new Date(ad.getTime() + NPT_OFFSET_MIN * 60_000)
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
}

/** AD → BS. Returns null outside the month this file can vouch for. */
export function toBs(ad: Date): BsDate | null {
  const utc = kathmanduCivil(ad)
  const offset = Math.round((utc - ANCHOR_AD) / DAY)
  const day = ANCHOR_BS.day + offset
  if (day < 1 || day > SHRAWAN_2083_DAYS) return null
  return { year: ANCHOR_BS.year, month: ANCHOR_BS.month, day }
}

/** Whether the engine can name this AD day in BS at all. */
export function hasBs(ad: Date): boolean {
  return toBs(ad) !== null
}

/** "16 Shrawan 2083 BS" — Latin digits always (Foundation §03). */
export function formatBs(bs: BsDate, opts: { suffix?: boolean } = {}): string {
  const name = BS_MONTHS[bs.month - 1] ?? ''
  return `${bs.day} ${name} ${bs.year}${opts.suffix === false ? '' : ' BS'}`
}

/**
 * The BS date where the engine can vouch for one, the **English date**
 * otherwise. Never null, never an em dash, never a guessed BS day.
 *
 * This is what a screen calls when it has one line to spend on a date: a
 * missing BS label is a gap in this file's table, not a gap in the date, and
 * showing "—" where "25 Aug 2026" is known would hide a date the app holds.
 */
export function formatBsOrAd(ad: Date, opts: { suffix?: boolean } = {}): string {
  const bs = toBs(ad)
  return bs ? formatBs(bs, opts) : formatAd(ad)
}

/**
 * "31 Jul 2026" — rendered in Kathmandu, not UTC.
 *
 * Same defect as `toBs` had: `timeZone: 'UTC'` puts the AD line a day behind
 * the BS line above it for the last 5h45m of every UTC day, so the pair would
 * have disagreed with each other on the same screen.
 */
export function formatAd(ad: Date): string {
  return ad.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kathmandu' })
}

/**
 * `"16 Jul 2026, 02:25 PM"` — a stored AD/UTC instant rendered in Kathmandu.
 *
 * Exists because the floor workspaces were stamping their session-close times
 * as string literals (`closedAt: '16 Jul 2026, 02:25 PM'`), which would have
 * rendered as the closing time of every handover and every return the build
 * ever performed. Law 7: the instant is stored in UTC and rendered here; the
 * caller passes the same ISO string it sent to the write, so what the screen
 * says and what the database holds are the same moment.
 */
export function formatAdDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kathmandu' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kathmandu' })
  return `${date}, ${time.toUpperCase()}`
}

/**
 * §4.1 — columns are **generated from a range, never hand-listed**. The build
 * the spec reviewed rendered 28 Jul twice and WED twice: seven days occupying
 * eight columns, which no generated range can produce.
 */
export function eachDay(startAd: Date, days: number): Date[] {
  const start = Date.UTC(startAd.getUTCFullYear(), startAd.getUTCMonth(), startAd.getUTCDate())
  return Array.from({ length: days }, (_, i) => new Date(start + i * DAY))
}

/* ── the English (AD) month — the calendar this product can always compute ──
 *
 * Gregorian month lengths ARE derivable (`Date.UTC(y, m + 1, 0)` is the last
 * day of month `m`, leap years included), which is the whole difference between
 * this block and the BS table `SHRAWAN_2083_DAYS` is waiting for. Every screen
 * that has to draw a month draws it from here, so a month grid is never empty
 * and a month arrow never has to be disabled.
 */

/** Midnight UTC of the 1st of the AD month `ad` falls in. */
export function adMonthStart(ad: Date): Date {
  return new Date(Date.UTC(ad.getUTCFullYear(), ad.getUTCMonth(), 1))
}

/** Days in the AD month `ad` falls in — day 0 of the next month, never a table. */
export function adMonthLength(ad: Date): number {
  return new Date(Date.UTC(ad.getUTCFullYear(), ad.getUTCMonth() + 1, 0)).getUTCDate()
}

/** Every day of that AD month, **generated from a range** (§4.1), never listed. */
export function adMonthDays(ad: Date): Date[] {
  return eachDay(adMonthStart(ad), adMonthLength(ad))
}

/**
 * `n` calendar months from `ad`, clamped to the target month's last day so
 * 31 Jan − 1 month is 31 Dec and 31 Mar + 1 month is 30 Apr rather than a date
 * rolling silently into the month after it.
 */
export function addAdMonths(ad: Date, months: number): Date {
  const year = ad.getUTCFullYear()
  const month = ad.getUTCMonth() + months
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(ad.getUTCDate(), last)))
}

/** "August 2026" — the month heading, rendered in Kathmandu like every other date. */
export function formatAdMonth(ad: Date): string {
  return ad.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Kathmandu' })
}

/** "Tuesday" — the weekday of an AD day. */
export function formatAdWeekday(ad: Date): string {
  return ad.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Kathmandu' })
}

/** "16 Jul 2026 – 16 Aug 2026" — the only window `toBs` answers inside. */
export const BS_SUPPORTED_RANGE = `${formatAd(new Date(ANCHOR_AD))} – ${formatAd(
  new Date(ANCHOR_AD + (SHRAWAN_2083_DAYS - 1) * DAY),
)}`

/**
 * The sentence a screen prints where a BS label cannot be computed. It names
 * the gap and what closes it; it never stands in for a date, because the
 * English date is always known and is shown instead.
 */
export const BS_UNSUPPORTED_NOTE =
  `Nepali (BS) dates are available for ${BS_SUPPORTED_RANGE} only — the Date Engine needs the 2080–2090 BS ` +
  'month-length table before it can name any other month, and month lengths are calendar data that is never ' +
  'inferred here. English dates are shown throughout.'

/**
 * §4.3 — **the operating day, from the real clock.** The Today marker, the
 * summary heading, every countdown, every "days left" chip and every overdue
 * comparison read this one function. Nothing computes its own today.
 *
 * ## What it returns
 *
 * Midnight UTC of the civil date it is **now in Kathmandu** — the same shape
 * `kathmanduCivil` returns, so a value from here is directly comparable with
 * `kathmanduCivil(someInstant)` and with the `+05:45` day boundaries
 * `queries/bookings.ts` builds. It is a day marker, not an instant: for "now"
 * as a timestamp, use `new Date()` and store it as UTC (Law 7).
 *
 * ## Why it is a function and not a constant
 *
 * This was `export const TODAY = new Date(Date.UTC(2026, 6, 31))` — the
 * operating day frozen at 31 Jul 2026 so the static build stayed
 * self-consistent while every figure on screen came from `src/data`. A
 * constant cannot be the real clock: it is evaluated once when the module
 * loads and can never be anything else, and every overdue chip, ageing count
 * and "days left" figure derived from it was measuring distance from a day in
 * the past rather than from today.
 *
 * A function also lets a test decide what today is — `getBusinessToday(d)` or
 * `vi.setSystemTime(d)` — instead of the product carrying a fixed date so its
 * tests can assert against one.
 *
 * ## The timezone is Kathmandu, deliberately
 *
 * Not the browser's. A tablet whose clock is set to another zone, or a laptop
 * that travelled, must still agree with the warehouse about which day it is:
 * the business day is Nepal's day. `NPT_OFFSET_MIN` above is the single copy
 * of that offset.
 *
 * @param now Override for tests and for "what would this have been on X".
 *            Defaults to the real clock.
 */
export function getBusinessToday(now: Date = new Date()): Date {
  return new Date(kathmanduCivil(now))
}

/** Nepal's weekend is Saturday. `Calendar.md` §0 — Saturday shaded, not Sunday. */
export function isWeekend(ad: Date): boolean {
  return ad.getUTCDay() === 6
}
