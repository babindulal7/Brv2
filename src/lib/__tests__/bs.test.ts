import { describe, it, expect } from 'vitest'
import {
  BS_MONTHS,
  BS_MAX_YEAR,
  BS_MIN_YEAR,
  BS_SUPPORTED_RANGE,
  getBusinessToday,
  kathmanduCivil,
  toBs,
  toAd,
  fiscalYear,
  formatBs,
  formatBsOrAd,
  formatAd,
  formatAdDateTime,
  formatBookingHoverDateTime,
  eachDay,
  isWeekend,
} from '../bs'

const ad = (y: number, m: number, d: number, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min))

/** The seeded operating day. Was `export const TODAY` until the clock was un-frozen. */
const SEEDED_OPERATING_DAY = ad(2026, 7, 31)

/* ── the anchor, CORRECTED 5 Sep 2026 ────────────────────────────────────
 *
 * These assertions used to read `16 Jul 2026 = 1 Shrawan` and `31 Jul = 16
 * Shrawan`, transcribed from Calendar.md §4.2. Both were one day early, and
 * this suite pinned the bug in place. The values below are agreed by four
 * independent sources checked on 16 Aug 2026: Hamro Patro, Merokalam (Ministry
 * of Home Affairs gazette), nepalicalendar.online, and the `bikram-sambat`
 * package.
 *
 * This block is the reason the correction was safe to make: it fails loudly if
 * anyone restores the old anchor.
 * ─────────────────────────────────────────────────────────────────────────── */

describe('toBs — the anchor pair', () => {
  it('17 Jul 2026 AD is 1 Shrawan 2083 BS — not 16 Jul', () => {
    expect(toBs(ad(2026, 7, 17))).toEqual({ year: 2083, month: 4, day: 1 })
    expect(toBs(ad(2026, 7, 16))).toEqual({ year: 2083, month: 3, day: 32 })
  })

  it('14 Apr 2026 is 1 Baishakh 2083 — Nepali New Year', () => {
    expect(toBs(ad(2026, 4, 14))).toEqual({ year: 2083, month: 1, day: 1 })
  })

  it('puts the seeded operating day, 31 Jul 2026, at 15 Shrawan — not 16', () => {
    expect(toBs(SEEDED_OPERATING_DAY)).toEqual({ year: 2083, month: 4, day: 15 })
  })

  it('advances one BS day per AD day, with no drift across the month', () => {
    for (let offset = 0; offset < 31; offset += 1) {
      const bs = toBs(new Date(ad(2026, 7, 17).getTime() + offset * 86_400_000))
      expect(bs).toEqual({ year: 2083, month: 4, day: offset + 1 })
    }
  })
})

/* ── the table itself — a transcription error must fail here, not ship ──── */

describe('BS_MONTH_DAYS — re-derived, never trusted', () => {
  it('every covered year totals the AD gap between its own Baishakh 1 and the next', () => {
    for (let year = BS_MIN_YEAR; year < BS_MAX_YEAR; year += 1) {
      const start = toAd({ year, month: 1, day: 1 })
      const next = toAd({ year: year + 1, month: 1, day: 1 })
      expect(start, `Baishakh 1 ${year}`).not.toBeNull()
      expect(next, `Baishakh 1 ${year + 1}`).not.toBeNull()

      let total = 0
      for (let month = 1; month <= 12; month += 1) {
        // the last day that resolves in this month is its length
        let length = 0
        for (let day = 29; day <= 32; day += 1) {
          if (toAd({ year, month, day }) !== null) length = day
        }
        expect(length, `${year}-${month} length`).toBeGreaterThanOrEqual(29)
        expect(length, `${year}-${month} length`).toBeLessThanOrEqual(32)
        total += length
      }

      const gap = Math.round((next!.getTime() - start!.getTime()) / 86_400_000)
      expect(total, `BS ${year} total`).toBe(gap)
      expect([365, 366], `BS ${year} is not a year`).toContain(total)
    }
  })

  it('round-trips every day of 2083 through toAd and back', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= 32; day += 1) {
        const back = toAd({ year: 2083, month, day })
        if (back === null) continue
        expect(toBs(back)).toEqual({ year: 2083, month, day })
      }
    }
  })

  it('holds the four externally verified 2083 facts', () => {
    // Ashadh is the 32-day month — the length that was wrongly on Shrawan.
    expect(toAd({ year: 2083, month: 3, day: 32 })?.toISOString().slice(0, 10)).toBe('2026-07-16')
    expect(toAd({ year: 2083, month: 4, day: 32 })).toBeNull()
    expect(toAd({ year: 2083, month: 4, day: 31 })?.toISOString().slice(0, 10)).toBe('2026-08-16')
    expect(toAd({ year: 2083, month: 12, day: 30 })?.toISOString().slice(0, 10)).toBe('2027-04-13')
  })

  it('Shrawan 2083 has 31 days, and Shrawan 30 is Saturday 15 Aug 2026', () => {
    // Merokalam and Hamro Patro both state this pair; it is the check that
    // catches the old 32-day Shrawan on sight.
    const shrawan30 = toAd({ year: 2083, month: 4, day: 30 })
    expect(shrawan30?.toISOString().slice(0, 10)).toBe('2026-08-15')
    expect(isWeekend(shrawan30!)).toBe(true)
  })
})

/* ── the Nepali fiscal year — unanswerable while the engine held one month ─ */

describe('fiscalYear', () => {
  it('runs Shrawan 1 to the last day of Ashadh', () => {
    const fy = fiscalYear(ad(2026, 8, 1))
    expect(fy?.label).toBe('2083/84')
    expect(fy?.startAd.toISOString().slice(0, 10)).toBe('2026-07-17')
    expect(fy?.endAd.toISOString().slice(0, 10)).toBe('2027-07-16')
  })

  it('puts a Baishakh date in the FY that opened the previous Shrawan', () => {
    // 20 Apr 2026 is Baishakh 2083 — still FY 2082/83.
    expect(fiscalYear(ad(2026, 4, 20))?.label).toBe('2082/83')
  })

  it('endAd is the last day inside the year, not the first day after it', () => {
    const fy = fiscalYear(ad(2026, 8, 1))!
    // The last day inside FY 2083/84 is the last day of Ashadh 2084 — whatever
    // length the table gives that month. Hardcoding 32 here would assert Ashadh
    // 2083's length against Ashadh 2084, which is 31.
    const last = toBs(fy.endAd)!
    expect({ year: last.year, month: last.month }).toEqual({ year: 2084, month: 3 })
    expect(toBs(new Date(fy.endAd.getTime() + 86_400_000))).toEqual({ year: 2084, month: 4, day: 1 })
  })
})

/* ── the table's edge — an honest null beats a wrong date ──────────────── */

describe('toBs — the edge of the table', () => {
  it('crosses a month boundary rather than stopping, which is the bug this fixes', () => {
    // 17 Aug 2026 returned null before the table landed. It is 1 Bhadra.
    expect(toBs(ad(2026, 8, 17))).toEqual({ year: 2083, month: 5, day: 1 })
    expect(toBs(ad(2026, 9, 1))).toEqual({ year: 2083, month: 5, day: 16 })
  })

  it('resolves a year end and the next Baishakh', () => {
    expect(toBs(ad(2027, 4, 13))).toEqual({ year: 2083, month: 12, day: 30 })
    expect(toBs(ad(2027, 4, 14))).toEqual({ year: 2084, month: 1, day: 1 })
  })

  it('returns null before the epoch rather than counting backwards into day 0', () => {
    expect(toBs(ad(2021, 4, 13))).toBeNull()
    expect(toBs(ad(2019, 1, 1))).toBeNull()
  })

  it('returns null past the last year the table can vouch for', () => {
    expect(toBs(ad(2040, 1, 1))).toBeNull()
    expect(toAd({ year: BS_MAX_YEAR + 1, month: 1, day: 1 })).toBeNull()
  })

  it('never returns a day outside 1..32, across the whole covered span', () => {
    const start = ad(2021, 4, 14).getTime()
    for (let offset = 0; offset < 6600; offset += 7) {
      const bs = toBs(new Date(start + offset * 86_400_000))
      if (bs === null) continue
      expect(bs.day).toBeGreaterThanOrEqual(1)
      expect(bs.day).toBeLessThanOrEqual(32)
      expect(bs.month).toBeGreaterThanOrEqual(1)
      expect(bs.month).toBeLessThanOrEqual(12)
    }
  })

  it('states the span it covers, derived from the table rather than typed', () => {
    // The note screens print must move when the table does.
    expect(BS_SUPPORTED_RANGE).toContain('14/4/2021')
    expect(toBs(new Date(ad(2021, 4, 14).getTime()))).toEqual({ year: BS_MIN_YEAR, month: 1, day: 1 })
  })
})

/* ── the fallback — a missing BS name never hides a known date ──────────── */

describe('formatBsOrAd — the English date where BS cannot be named', () => {
  it('gives the BS date inside the table', () => {
    expect(formatBsOrAd(SEEDED_OPERATING_DAY)).toBe('15 Shrawan')
  })

  it('gives the English date outside it — never an em dash', () => {
    // The regression this guards: eight call sites rendered `bs ? formatBs(bs) : '—'`,
    // so any uncovered date showed "—" for a date the app held. On two pills the
    // dash took the BOLD line while the real date sat muted beneath.
    //
    // The dates that used to exercise this (1 Sept 2026, 17 Aug 2026) now resolve
    // in BS — the table covers them. Only genuinely uncovered years fall back now,
    // which is the point of the 2078–2095 table.
    expect(formatBsOrAd(ad(2040, 1, 1))).toBe('1/1/2040')
    expect(formatBsOrAd(ad(2019, 6, 30))).toBe('30/6/2019')
  })

  it('never returns an em dash or an empty string for any day across two years', () => {
    for (let offset = -400; offset < 400; offset += 1) {
      const out = formatBsOrAd(new Date(ad(2026, 7, 16).getTime() + offset * 86_400_000))
      expect(out).not.toBe('—')
      expect(out.trim()).not.toBe('')
    }
  })

  it('resolves the civil date in Kathmandu on the fallback path too', () => {
    // 31 Dec 2039 18:15 UTC is already 1 Jan 2040 in Kathmandu; the AD fallback
    // must not answer a day behind the BS path it stands in for.
    expect(formatBsOrAd(ad(2039, 12, 31, 18, 15))).toBe('1/1/2040')
  })
})

/* ── Foundation §3.1 — the civil date is Kathmandu's, not UTC's ─────────── */

describe('toBs — resolves the civil date in Kathmandu (UTC+05:45)', () => {
  it('18:15 UTC is already tomorrow in Kathmandu', () => {
    // 16 Jul 18:15 UTC == 17 Jul 00:00 NPT == 1 Shrawan. Truncating on
    // getUTCDate() instead would put every date, chip and countdown one day
    // early for 5h45m of every day.
    expect(toBs(ad(2026, 7, 16, 18, 15))).toEqual({ year: 2083, month: 4, day: 1 })
    expect(toBs(ad(2026, 7, 16, 23, 30))).toEqual({ year: 2083, month: 4, day: 1 })
  })

  it('one minute earlier is still the previous Kathmandu day', () => {
    expect(toBs(ad(2026, 7, 16, 18, 14))).toEqual({ year: 2083, month: 3, day: 32 })
  })

  it('the AD line and the BS line never disagree on the same screen', () => {
    const instant = ad(2026, 7, 16, 18, 30)
    expect(formatAd(instant)).toBe('17/7/2026')
    expect(formatBs(toBs(instant)!)).toBe('1 Shrawan')
  })

  it('formatAd renders in Kathmandu, not UTC', () => {
    expect(formatAd(ad(2026, 7, 31))).toBe('31/7/2026')
    expect(formatAd(ad(2026, 7, 31, 19, 0))).toBe('1/8/2026')
  })
})

/* ── rendering ──────────────────────────────────────────────────────────── */

describe('compact dual-calendar formatting', () => {
  it('uses the requested numeric AD date and short BS label', () => {
    const iso = '2026-09-30T01:15:00.000Z'
    expect(formatAdDateTime(iso)).toBe('30/9/2026, 07:00 AM')
    expect(formatBookingHoverDateTime(iso)).toBe('30/9/2026, 07:00 AM · 14 Ashwin')
  })

  it('keeps both calendars on the same Kathmandu day across UTC midnight', () => {
    expect(formatBookingHoverDateTime('2026-09-29T18:30:00.000Z')).toBe('30/9/2026, 12:15 AM · 14 Ashwin')
    expect(formatBookingHoverDateTime(null)).toBe('Not scheduled')
    expect(formatBookingHoverDateTime('invalid')).toBe('—')
  })
})

describe('BS month names and formatting', () => {
  it('holds twelve months', () => {
    expect(BS_MONTHS).toHaveLength(12)
  })

  it('spells the fourth month Shrawan — never Shravan', () => {
    expect(BS_MONTHS[3]).toBe('Shrawan')
    expect(BS_MONTHS).not.toContain('Shravan')
  })

  it('renders Latin digits and the day/month without the year or suffix', () => {
    expect(formatBs({ year: 2083, month: 4, day: 15 })).toBe('15 Shrawan')
    expect(formatBs({ year: 2083, month: 1, day: 1 })).toBe('1 Baishakh')
    expect(formatBs({ year: 2083, month: 12, day: 30 })).toBe('30 Chaitra')
  })

  it('keeps compact labels for callers with legacy suffix options', () => {
    expect(formatBs({ year: 2083, month: 4, day: 15 }, { suffix: false })).toBe('15 Shrawan')
  })

  it('degrades to a blank month rather than printing the word "undefined"', () => {
    // formatBs is only ever handed toBs output today, but a month index off the
    // end must never reach a client-facing date line as "1 undefined 2083 BS".
    expect(formatBs({ year: 2083, month: 13, day: 1 })).not.toContain('undefined')
    expect(formatBs({ year: 2083, month: 0, day: 1 })).not.toContain('undefined')
  })

  it('never renders Devanagari digits', () => {
    expect(formatBs({ year: 2083, month: 4, day: 15 })).toMatch(/^[\x20-\x7E]+$/)
  })
})

/* ── §4.1 — columns come from a generated range ─────────────────────────── */

describe('eachDay', () => {
  it('produces exactly the number of days asked for', () => {
    expect(eachDay(ad(2026, 7, 26), 7)).toHaveLength(7)
    expect(eachDay(ad(2026, 7, 26), 1)).toHaveLength(1)
    expect(eachDay(ad(2026, 7, 26), 0)).toHaveLength(0)
  })

  it('never repeats a day — the build §4.1 rejected rendered 28 Jul twice', () => {
    const week = eachDay(ad(2026, 7, 26), 7)
    expect(new Set(week.map((d) => d.toISOString())).size).toBe(7)
    // ...and WED twice: seven days must occupy seven distinct weekdays.
    expect(new Set(week.map((d) => d.getUTCDay())).size).toBe(7)
  })

  it('steps one day at a time, across a month boundary', () => {
    const span = eachDay(ad(2026, 7, 30), 4).map((d) => d.toISOString().slice(0, 10))
    expect(span).toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'])
  })

  it('truncates the start to midnight rather than carrying a time of day', () => {
    const [first] = eachDay(ad(2026, 7, 26, 13, 37), 3)
    expect(first?.toISOString()).toBe('2026-07-26T00:00:00.000Z')
  })

  it('truncates in Kathmandu, not UTC — the E-P1-5 window', () => {
    // 26 Jul 18:15 UTC is already 27 Jul in Kathmandu, so a range starting there
    // must begin on the 27th. It began a day early until 5 Sep 2026.
    const [first] = eachDay(ad(2026, 7, 26, 18, 15), 2)
    expect(first?.toISOString()).toBe('2026-07-27T00:00:00.000Z')
  })
})

/* ── Calendar.md §0 — Nepal's weekend is Saturday ───────────────────────── */

describe('isWeekend', () => {
  it('is true on Saturday', () => {
    expect(isWeekend(ad(2026, 8, 1))).toBe(true) // Saturday
    expect(isWeekend(ad(2026, 8, 8))).toBe(true)
  })

  it('is false on Sunday — Nepal shades Saturday, not Sunday', () => {
    expect(isWeekend(ad(2026, 8, 2))).toBe(false) // Sunday
  })

  it('is false on every weekday', () => {
    for (let d = 3; d <= 7; d += 1) expect(isWeekend(ad(2026, 8, d))).toBe(false)
  })

  it('is Saturday in Kathmandu, not in UTC — the E-P1-5 window', () => {
    // 18:15 UTC Friday is already Saturday in Kathmandu.
    expect(isWeekend(ad(2026, 7, 31, 18, 15))).toBe(true)
    expect(isWeekend(ad(2026, 7, 31, 18, 14))).toBe(false)
  })

  it('marks exactly one day in seven', () => {
    const week = eachDay(ad(2026, 7, 26), 7)
    expect(week.filter(isWeekend)).toHaveLength(1)
  })
})

/* ── the operating day comes from the clock, in Kathmandu ───────────────── */

describe('getBusinessToday', () => {
  it('is the civil day in Kathmandu, as a midnight-UTC marker', () => {
    expect(getBusinessToday(ad(2026, 7, 31, 6, 0)).toISOString()).toBe('2026-07-31T00:00:00.000Z')
  })

  it('is already tomorrow after 18:15 UTC, because Nepal is UTC+05:45', () => {
    expect(getBusinessToday(ad(2026, 7, 31, 18, 14)).toISOString()).toBe('2026-07-31T00:00:00.000Z')
    expect(getBusinessToday(ad(2026, 7, 31, 18, 15)).toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })

  it('agrees with kathmanduCivil, which is the one truncation in the product', () => {
    const instant = ad(2026, 8, 3, 20, 30)
    expect(getBusinessToday(instant).getTime()).toBe(kathmanduCivil(instant))
  })

  it('reads the real clock when given no argument, and moves with it', () => {
    const now = new Date()
    expect(getBusinessToday().getTime()).toBe(kathmanduCivil(now))
    /* Not a fixed date: a day chosen years from the frozen 31 Jul 2026 still
       resolves to itself, which `export const TODAY` could never do. */
    expect(getBusinessToday(ad(2031, 3, 9, 12, 0)).toISOString()).toBe('2031-03-09T00:00:00.000Z')
  })
})
