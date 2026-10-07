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
 * ⛔ **THE ANCHOR WAS WRONG BY ONE DAY — corrected 5 Sep 2026.**
 *
 * This file previously declared `16 Jul 2026 = 1 Shrawan 2083` and
 * `SHRAWAN_2083_DAYS = 32`, sourced from `Calendar.md` §4.2 and carried as "a
 * spec-supplied fact, not a conversion I derived". **Both are wrong.** The real
 * values, agreed by four independent sources checked on 16 Aug 2026 — Hamro
 * Patro, Merokalam (verified against the Ministry of Home Affairs gazette),
 * nepalicalendar.online, and the `bikram-sambat` package:
 *
 *   - **1 Shrawan 2083 = 17 Jul 2026**, not 16 Jul.
 *   - **Shrawan 2083 has 31 days**, not 32.
 *
 * 32 is **Ashadh** 2083 (15 Jun – 16 Jul 2026). The off-by-one anchor pulled
 * Ashadh's length onto Shrawan's name, which is why 32 looked right to everyone
 * who checked it.
 *
 * Every BS date this app rendered before this correction was **one day ahead**.
 * The seeded operating day, 31 Jul 2026, is **15 Shrawan 2083** — not 16.
 *
 * Recorded because the wrong number won twice, on the record:
 * `modules/calendar/Calendar.tsx` noted the spec labelling a week "10–16
 * Shrawan" and resolved it as "the engine's anchor makes it 11–17 and the engine
 * wins" — the spec was right. And `PROGRESS.md` rejected `Date Engine.md` §2.1's
 * month row as impossible because the anchors were "exactly 93 days apart"; the
 * true gap is 94, so the validator itself was calibrated on the wrong anchor.
 * In both cases a correct external fact was overruled because the wrong one was
 * already in code. `Calendar.md` §4.2 needs amending, not this file.
 *
 * ## Provenance of this correction
 *
 * Ported — not re-derived — from `updated mds/COMPLETE/BS date .zip`, produced
 * 16 Aug 2026, which `RULINGS-2026-09-04.md` R-00 names as authoritative:
 * *"the 2078–2095 table produced 16 Aug is authoritative — port it, do not
 * re-source it."* Its `APPLY.md` carries the full derivation. The pack's other
 * three files were **not** applied wholesale: they are three weeks stale against
 * this tree (they predate ~400 tests), so only the engine was taken and the
 * fallout was fixed forward. See PROGRESS.md.
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

/**
 * Days in each BS month, 2078–2095.
 *
 * BS is a solar calendar whose month lengths are set by the Sun's transit of
 * each Rashi under the Surya Siddhanta, so they cannot be computed from a
 * formula — they come from a published table and vary year to year (29–32).
 *
 * **Provenance.** Transcribed 16 Aug 2026 from the `bikram-sambat` Python
 * package's compiled table, then cross-checked for 2083 against Merokalam's
 * month-by-month listing (which states its source as the Ministry of Home
 * Affairs gazette and the NCHL calendar). All twelve 2083 lengths agree
 * exactly. `bs.test.ts` re-derives every year's total from the AD span between
 * its own Baishakh 1 and the next, so a transcription error in any of these 216
 * numbers fails the suite rather than silently shipping a wrong date.
 *
 * ⚠ **This table expires.** Beyond 2095 `toBs` returns null — an honest gap
 * beats a wrong date. Extending it is data entry against a published calendar,
 * not a product decision. `TODO(decision)`: who reloads it, and how often.
 */
const BS_MONTH_DAYS: Readonly<Record<number, readonly number[]>> = {
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2085: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2087: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2088: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2090: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2091: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2092: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2093: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2094: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2095: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
}

/** First and last BS year the table can vouch for. Derived, never hand-typed. */
export const BS_MIN_YEAR = 2078
export const BS_MAX_YEAR = 2095

/**
 * **1 Baishakh 2078 = 14 Apr 2021 (AD).** The single epoch. Every other BS date
 * is this plus a sum over `BS_MONTH_DAYS` — there is one anchor in this file
 * and one only, which is the whole point of §4.2.
 */
const EPOCH_AD = Date.UTC(2021, 3, 14)

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

/** AD → BS. Returns null outside the years the table covers. */
export function toBs(ad: Date): BsDate | null {
  const utc = kathmanduCivil(ad)
  let remaining = Math.round((utc - EPOCH_AD) / DAY)
  if (remaining < 0) return null

  for (let year = BS_MIN_YEAR; year <= BS_MAX_YEAR; year += 1) {
    const months = BS_MONTH_DAYS[year]
    if (!months) return null
    for (let month = 1; month <= 12; month += 1) {
      const length = months[month - 1] ?? 0
      if (remaining < length) return { year, month, day: remaining + 1 }
      remaining -= length
    }
  }
  return null
}

/**
 * BS → AD. The inverse of `toBs`, returning midnight UTC of the Kathmandu civil
 * date. Needed by `fiscalYear()` and by any screen that filters on a BS range;
 * without it a caller would build its own offset, which is the banned thing.
 *
 * Returns null for a date the table cannot vouch for, including a day number
 * that does not exist in that month — 32 Shrawan 2083 is not a date.
 */
export function toAd(bs: BsDate): Date | null {
  const months = BS_MONTH_DAYS[bs.year]
  if (!months) return null
  if (bs.month < 1 || bs.month > 12) return null
  const length = months[bs.month - 1] ?? 0
  if (bs.day < 1 || bs.day > length) return null

  let days = 0
  for (let year = BS_MIN_YEAR; year < bs.year; year += 1) {
    const row = BS_MONTH_DAYS[year]
    if (!row) return null
    for (const len of row) days += len
  }
  for (let month = 1; month < bs.month; month += 1) days += months[month - 1] ?? 0
  days += bs.day - 1

  return new Date(EPOCH_AD + days * DAY)
}

/**
 * The Nepali fiscal year an instant falls in — **Shrawan 1 to the last day of
 * Ashadh**, which is why this could not be answered while the engine held one
 * month. `0012_seed_data.sql` seeds `FY 2083/84` and `Header.tsx` renders the
 * badge; both were reading a literal until now.
 *
 * Returns the label in the form the rest of the app already prints —
 * `"2083/84"` — plus the AD bounds, so a report period is derived here and not
 * re-derived per screen. `endAd` is the last day *inside* the year, not the
 * first day after it: a half-open bound read as inclusive is how a VAT period
 * gains a day.
 */
export function fiscalYear(ad: Date): { label: string; startBsYear: number; startAd: Date; endAd: Date } | null {
  const bs = toBs(ad)
  if (!bs) return null

  // Shrawan is month 4. Baishakh–Ashadh still belong to the FY that opened the
  // previous Shrawan.
  const startBsYear = bs.month >= 4 ? bs.year : bs.year - 1
  const startAd = toAd({ year: startBsYear, month: 4, day: 1 })
  const nextStart = toAd({ year: startBsYear + 1, month: 4, day: 1 })
  if (!startAd || !nextStart) return null

  const shortNext = String((startBsYear + 1) % 100).padStart(2, '0')
  return {
    label: `${startBsYear}/${shortNext}`,
    startBsYear,
    startAd,
    endAd: new Date(nextStart.getTime() - DAY),
  }
}

/** Whether the engine can name this AD day in BS at all. */
export function hasBs(ad: Date): boolean {
  return toBs(ad) !== null
}

/** "16 Shrawan" — compact day/month labels; legacy suffix options stay source-compatible. */
export function formatBs(bs: BsDate, _opts: { suffix?: boolean } = {}): string {
  const name = BS_MONTHS[bs.month - 1] ?? ''
  return `${bs.day} ${name}`
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
 * "31/7/2026" — rendered in Kathmandu, not UTC, without zero padding.
 *
 * Same defect as `toBs` had: `timeZone: 'UTC'` puts the AD line a day behind
 * the BS line above it for the last 5h45m of every UTC day, so the pair would
 * have disagreed with each other on the same screen.
 */
export function formatAd(ad: Date): string {
  if (Number.isNaN(ad.getTime())) return '—'
  const civil = new Date(kathmanduCivil(ad))
  return `${civil.getUTCDate()}/${civil.getUTCMonth() + 1}/${civil.getUTCFullYear()}`
}

/**
 * `"16/7/2026, 02:25 PM"` — a stored AD/UTC instant rendered in Kathmandu.
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
  const date = formatAd(d)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kathmandu' })
  return `${date}, ${time.toUpperCase()}`
}

/** Compact booking hovercard timestamp, with both calendars in Kathmandu. */
export function formatBookingHoverDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not scheduled'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const bs = toBs(d)
  return `${formatAdDateTime(iso)}${bs ? ` · ${formatBs(bs)}` : ''}`
}

/**
 * §4.1 — columns are **generated from a range, never hand-listed**. The build
 * the spec reviewed rendered 28 Jul twice and WED twice: seven days occupying
 * eight columns, which no generated range can produce.
 *
 * ⛔ Truncated on `getUTCDate()` until 5 Sep 2026 — the defect this file's
 * `kathmanduCivil` header describes, left unconverted in this one export
 * (`BUG_SWEEP_ENGINES_v1.1` E-P1-5). A month range starting from an instant
 * after 18:15 UTC began a day early.
 */
export function eachDay(startAd: Date, days: number): Date[] {
  const start = kathmanduCivil(startAd)
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

/**
 * "14/4/2021 – 13/4/2039" — the window `toBs` answers inside.
 *
 * **Derived from the table, never hand-typed**, so it cannot drift from what
 * the engine actually covers: the day count is the sum of all 216 month
 * lengths, and both ends move automatically when a year is added.
 */
const BS_TABLE_DAYS = Object.values(BS_MONTH_DAYS).reduce(
  (total, months) => total + months.reduce((sum, len) => sum + len, 0),
  0,
)

export const BS_SUPPORTED_RANGE = `${formatAd(new Date(EPOCH_AD))} – ${formatAd(
  new Date(EPOCH_AD + (BS_TABLE_DAYS - 1) * DAY),
)}`

/**
 * The sentence a screen prints where a BS label cannot be computed. It names
 * the gap and what closes it; it never stands in for a date, because the
 * English date is always known and is shown instead.
 *
 * Since the 2078–2095 table landed this is a genuine edge case rather than the
 * everyday path it used to be — it now fires only outside an eighteen-year
 * span, where before it fired outside a single month.
 */
export const BS_UNSUPPORTED_NOTE =
  `Nepali (BS) dates are available for ${BS_SUPPORTED_RANGE} — the Date Engine's month-length table covers ` +
  `BS ${BS_MIN_YEAR}–${BS_MAX_YEAR}, and month lengths are published calendar data that is never inferred here. ` +
  'English dates are shown outside that span.'

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

/**
 * Nepal's weekend is Saturday. `Calendar.md` §0 — Saturday shaded, not Sunday.
 *
 * ⛔ Read `getUTCDay()` until 5 Sep 2026 (`BUG_SWEEP_ENGINES_v1.1` E-P1-5):
 * from 18:15 UTC Friday it is already Saturday in Kathmandu while UTC still
 * says Friday, so the calendar shaded the wrong column for 5h45m of every day.
 */
export function isWeekend(ad: Date): boolean {
  return new Date(kathmanduCivil(ad)).getUTCDay() === 6
}

/**
 * The business day formatted as YYYY-MM-DD in Kathmandu civil time.
 */
export function businessDayAd(now: Date = new Date()): string {
  return new Date(kathmanduCivil(getBusinessToday(now))).toISOString().slice(0, 10)
}
