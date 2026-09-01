import { describe, it, expect } from 'vitest'
import { BS_MONTHS, getBusinessToday, kathmanduCivil, toBs, formatBs, formatBsOrAd, formatAd, eachDay, isWeekend } from '../bs'

const ad = (y: number, m: number, d: number, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min))

/* ── the anchor Calendar.md §4.2 names as correct ───────────────────────── */

describe('toBs — the anchor pair', () => {
  it('16 Jul 2026 AD is 1 Shrawan 2083 BS', () => {
    expect(toBs(ad(2026, 7, 16))).toEqual({ year: 2083, month: 4, day: 1 })
  })

  it('which puts 26 Jul 2026 at 11 Shrawan — the check §4.2 states', () => {
    expect(toBs(ad(2026, 7, 26))).toEqual({ year: 2083, month: 4, day: 11 })
  })

  it('and 31 Jul 2026 — the day this build was frozen at — at 16 Shrawan', () => {
    expect(toBs(ad(2026, 7, 31))).toEqual({ year: 2083, month: 4, day: 16 })
  })

  it('advances one BS day per AD day, with no drift across the month', () => {
    for (let offset = 0; offset < 32; offset += 1) {
      const bs = toBs(new Date(ad(2026, 7, 16).getTime() + offset * 86_400_000))
      expect(bs).toEqual({ year: 2083, month: 4, day: offset + 1 })
    }
  })
})

/* ── the month boundary — an honest null beats a wrong date ─────────────── */

describe('toBs — month boundaries', () => {
  it('16 Aug 2026 is the last day this file can vouch for: 32 Shrawan', () => {
    expect(toBs(ad(2026, 8, 16))).toEqual({ year: 2083, month: 4, day: 32 })
  })

  it('returns null the day after Shrawan ends rather than inventing 33 Shrawan', () => {
    expect(toBs(ad(2026, 8, 17))).toBeNull()
    expect(toBs(ad(2026, 9, 1))).toBeNull()
  })

  it('returns null before the anchor rather than counting backwards into day 0', () => {
    expect(toBs(ad(2026, 7, 15))).toBeNull()
    expect(toBs(ad(2026, 7, 1))).toBeNull()
  })

  it('never returns a day outside 1..32', () => {
    for (let offset = -40; offset < 80; offset += 1) {
      const bs = toBs(new Date(ad(2026, 7, 16).getTime() + offset * 86_400_000))
      if (bs === null) continue
      expect(bs.day).toBeGreaterThanOrEqual(1)
      expect(bs.day).toBeLessThanOrEqual(32)
    }
  })
})

/* ── the fallback — a missing BS name never hides a known date ──────────── */

describe('formatBsOrAd — the English date where BS cannot be named', () => {
  it('gives the BS date inside the table', () => {
    expect(formatBsOrAd(ad(2026, 7, 31))).toBe('16 Shrawan 2083 BS')
  })

  it('gives the English date outside it — never an em dash', () => {
    // The regression this guards: eight call sites rendered `bs ? formatBs(bs) : '—'`,
    // so from 17 Aug 2026 the Dashboard pill, the Finance As-of pill, client rows,
    // case rows and three floor workspaces showed "—" for dates the app held. On the
    // two pills the dash took the BOLD line while the real date sat muted beneath.
    // 'Sept', not 'Sep' — en-GB's short month for September is four letters.
    expect(formatBsOrAd(ad(2026, 9, 1))).toBe('1 Sept 2026')
    expect(formatBsOrAd(ad(2026, 8, 17))).toBe('17 Aug 2026')
    expect(formatBsOrAd(ad(2026, 7, 15))).toBe('15 Jul 2026')
  })

  it('never returns an em dash or an empty string for any day across two years', () => {
    for (let offset = -400; offset < 400; offset += 1) {
      const out = formatBsOrAd(new Date(ad(2026, 7, 16).getTime() + offset * 86_400_000))
      expect(out).not.toBe('—')
      expect(out.trim()).not.toBe('')
    }
  })

  it('resolves the civil date in Kathmandu on the fallback path too', () => {
    // 31 Aug 18:15 UTC is already 1 Sep in Kathmandu; the AD fallback must not
    // answer a day behind the BS path it stands in for.
    expect(formatBsOrAd(ad(2026, 8, 31, 18, 15))).toBe('1 Sept 2026')
  })
})

/* ── Foundation §3.1 — the civil date is Kathmandu's, not UTC's ─────────── */

describe('toBs — resolves the civil date in Kathmandu (UTC+05:45)', () => {
  it('18:15 UTC is already tomorrow in Kathmandu', () => {
    // 15 Jul 18:15 UTC == 16 Jul 00:00 NPT == 1 Shrawan. Truncating on
    // getUTCDate() instead would answer null here and put every date, chip and
    // countdown one day early for 5h45m of every day.
    expect(toBs(ad(2026, 7, 15, 18, 15))).toEqual({ year: 2083, month: 4, day: 1 })
    expect(toBs(ad(2026, 7, 15, 23, 30))).toEqual({ year: 2083, month: 4, day: 1 })
  })

  it('one minute earlier is still the previous Kathmandu day', () => {
    expect(toBs(ad(2026, 7, 15, 18, 14))).toBeNull()
  })

  it('the AD line and the BS line never disagree on the same screen', () => {
    const instant = ad(2026, 7, 15, 18, 30)
    expect(formatAd(instant)).toBe('16 Jul 2026')
    expect(formatBs(toBs(instant)!)).toBe('1 Shrawan 2083 BS')
  })

  it('formatAd renders in Kathmandu, not UTC', () => {
    expect(formatAd(ad(2026, 7, 31))).toBe('31 Jul 2026')
    expect(formatAd(ad(2026, 7, 31, 19, 0))).toBe('1 Aug 2026')
  })
})

/* ── rendering ──────────────────────────────────────────────────────────── */

describe('BS month names and formatting', () => {
  it('holds twelve months', () => {
    expect(BS_MONTHS).toHaveLength(12)
  })

  it('spells the fourth month Shrawan — never Shravan', () => {
    expect(BS_MONTHS[3]).toBe('Shrawan')
    expect(BS_MONTHS).not.toContain('Shravan')
  })

  it('renders Latin digits and the BS suffix', () => {
    expect(formatBs({ year: 2083, month: 4, day: 16 })).toBe('16 Shrawan 2083 BS')
    expect(formatBs({ year: 2083, month: 1, day: 1 })).toBe('1 Baishakh 2083 BS')
    expect(formatBs({ year: 2083, month: 12, day: 30 })).toBe('30 Chaitra 2083 BS')
  })

  it('can drop the suffix', () => {
    expect(formatBs({ year: 2083, month: 4, day: 16 }, { suffix: false })).toBe('16 Shrawan 2083')
  })

  it('degrades to a blank month rather than printing the word "undefined"', () => {
    // formatBs is only ever handed toBs output today, but a month index off the
    // end must never reach a client-facing date line as "1 undefined 2083 BS".
    expect(formatBs({ year: 2083, month: 13, day: 1 })).not.toContain('undefined')
    expect(formatBs({ year: 2083, month: 0, day: 1 })).not.toContain('undefined')
  })

  it('never renders Devanagari digits', () => {
    expect(formatBs({ year: 2083, month: 4, day: 16 })).toMatch(/^[\x20-\x7E]+$/)
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
