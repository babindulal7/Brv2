import { describe, expect, it } from 'vitest'
import {
  OPERATIONAL_DAY_START_DEFAULT,
  OPERATIONAL_DAY_START_DEFAULT_MINUTES,
  dayStartMinutesFrom,
  operationalDayBounds,
  operationalDayOf,
  parseDayStart,
} from '../operationalDay'

/**
 * D4, ruled 30 Aug 2026 (REFERENCE_SPEC v2.5 Appendix A0): the operational day
 * runs 06:00 → 06:00, as a setting. The acceptance sentence from the run
 * prompt is pinned verbatim in the `operationalDayOf` block below: a booking
 * at 05:30 belongs to YESTERDAY's operational day when the setting is 06:00,
 * and to today's when it is 00:00.
 */

describe('parseDayStart', () => {
  it('parses the ruled default', () => {
    expect(parseDayStart(OPERATIONAL_DAY_START_DEFAULT)).toBe(OPERATIONAL_DAY_START_DEFAULT_MINUTES)
    expect(parseDayStart('06:00')).toBe(360)
  })

  it('parses midnight and late starts', () => {
    expect(parseDayStart('00:00')).toBe(0)
    expect(parseDayStart('23:59')).toBe(23 * 60 + 59)
    expect(parseDayStart(' 06:30 ')).toBe(390)
  })

  it('refuses non-clock strings with null, never a guess', () => {
    for (const bad of ['24:00', '6:00', '06:60', '0600', 'six', '', '06:00:00']) {
      expect(parseDayStart(bad)).toBeNull()
    }
  })
})

describe('dayStartMinutesFrom', () => {
  it('falls back to the RULED default (06:00), not to midnight, on garbage', () => {
    // Falling back to 00:00 would silently re-rule D4 from a corrupted
    // localStorage; the fallback must be the ruling.
    expect(dayStartMinutesFrom('nonsense')).toBe(360)
    expect(dayStartMinutesFrom(undefined)).toBe(360)
    expect(dayStartMinutesFrom(6)).toBe(360)
  })

  it('honours a valid stored value, including 00:00', () => {
    expect(dayStartMinutesFrom('00:00')).toBe(0)
    expect(dayStartMinutesFrom('07:15')).toBe(435)
  })
})

describe('operationalDayBounds', () => {
  it('a 06:00 day runs 06:00 today to 05:59:59.999 tomorrow, Kathmandu', () => {
    expect(operationalDayBounds('2026-08-12', 360)).toEqual({
      fromAd: '2026-08-12T06:00:00.000+05:45',
      toAd: '2026-08-13T05:59:59.999+05:45',
    })
  })

  it('a 00:00 day degrades exactly to the pre-D4 calendar-midnight pair', () => {
    expect(operationalDayBounds('2026-08-12', 0)).toEqual({
      fromAd: '2026-08-12T00:00:00.000+05:45',
      toAd: '2026-08-12T23:59:59.999+05:45',
    })
  })

  it('crosses a month boundary by date arithmetic, not day-number addition', () => {
    // 31 + 1 must be the 1st of the next month, never "2026-08-32".
    expect(operationalDayBounds('2026-08-31', 360).toAd).toBe('2026-09-01T05:59:59.999+05:45')
  })

  it('handles a non-whole-hour start', () => {
    expect(operationalDayBounds('2026-08-12', 390)).toEqual({
      fromAd: '2026-08-12T06:30:00.000+05:45',
      toAd: '2026-08-13T06:29:59.999+05:45',
    })
  })

  it('refuses a start outside one day', () => {
    expect(() => operationalDayBounds('2026-08-12', -1)).toThrow()
    expect(() => operationalDayBounds('2026-08-12', 1440)).toThrow()
    expect(() => operationalDayBounds('2026-08-12', 90.5)).toThrow()
  })
})

describe('operationalDayOf — the D4 acceptance test', () => {
  // 05:30 on 12 Aug in Kathmandu, written as the UTC instant Law 7 stores.
  const HALF_FIVE_NPT_12_AUG = '2026-08-11T23:45:00.000Z'

  it('a booking at 05:30 belongs to YESTERDAY when the day starts at 06:00', () => {
    expect(operationalDayOf(HALF_FIVE_NPT_12_AUG, 360)).toBe('2026-08-11')
  })

  it('the same booking belongs to TODAY when the day starts at 00:00', () => {
    expect(operationalDayOf(HALF_FIVE_NPT_12_AUG, 0)).toBe('2026-08-12')
  })

  it('06:00 exactly opens the new day; one ms before it closes the old one', () => {
    // 06:00 NPT on 12 Aug = 00:15 UTC.
    expect(operationalDayOf('2026-08-12T00:15:00.000Z', 360)).toBe('2026-08-12')
    expect(operationalDayOf('2026-08-12T00:14:59.999Z', 360)).toBe('2026-08-11')
  })

  it('accepts an instant already carrying the +05:45 offset', () => {
    expect(operationalDayOf('2026-08-12T05:30:00.000+05:45', 360)).toBe('2026-08-11')
    expect(operationalDayOf('2026-08-12T06:15:00.000+05:45', 360)).toBe('2026-08-12')
  })

  it('refuses a non-instant rather than answering NaN', () => {
    expect(() => operationalDayOf('not a date', 360)).toThrow()
  })
})
