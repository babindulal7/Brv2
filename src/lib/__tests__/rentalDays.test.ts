/**
 * # `lib/rentalDays.ts` — the booking span, and the two counts it is not
 *
 * The figure this module returns is what a rate is multiplied by, so the tests
 * that matter are the ones that pin WHICH rule it implements. The last block
 * asserts the divergence from `civilDaysBetween` deliberately: it is the
 * TODO(decision) recorded in the module header, and if somebody later
 * harmonises the two, this suite is where that shows up as a decision rather
 * than as a silent reprice.
 */
import { describe, it, expect } from 'vitest'
import { rentalDaysBetween, formatRentalDays, RENTAL_DAYS_MIN } from '../rentalDays'
import { civilDaysBetween } from '../../data/today'

/** Kathmandu is +05:45 and has no daylight saving, so a local clock time is a fixed UTC offset. */
const npt = (day: string, clock: string) => `${day}T${clock}:00.000+05:45`

describe('rentalDaysBetween — elapsed hours, rounded, floored at 1', () => {
  it('counts a whole-day hire as that many days', () => {
    expect(rentalDaysBetween(npt('2026-09-01', '09:00'), npt('2026-09-04', '09:00'))).toBe(3)
  })

  it('rounds a part day UP once it passes the half day', () => {
    // 37 elapsed hours = 1.54 days.
    expect(rentalDaysBetween(npt('2026-09-01', '09:00'), npt('2026-09-02', '22:00'))).toBe(2)
  })

  it('rounds a part day DOWN below the half day, and the floor catches it', () => {
    // 21 elapsed hours = 0.875 days, which rounds to 1 and is also the floor.
    expect(rentalDaysBetween(npt('2026-09-01', '09:00'), npt('2026-09-02', '06:00'))).toBe(1)
  })

  it('never returns less than one day — Law 9’s explicit floor', () => {
    // Two hours is a real hire, not a zero-day one.
    expect(rentalDaysBetween(npt('2026-09-01', '09:00'), npt('2026-09-01', '11:00'))).toBe(RENTAL_DAYS_MIN)
    expect(RENTAL_DAYS_MIN).toBe(1)
  })

  it('is unaffected by the UTC offset the same instants are written in', () => {
    const inNpt = rentalDaysBetween(npt('2026-09-01', '09:00'), npt('2026-09-02', '22:00'))
    const inUtc = rentalDaysBetween('2026-09-01T03:15:00.000Z', '2026-09-02T16:15:00.000Z')
    expect(inUtc).toBe(inNpt)
  })
})

describe('rentalDaysBetween — what it refuses to guess', () => {
  it('answers null, not 1, for a missing instant', () => {
    // `FloorBooking` really does carry `pickupAtAd: string | null`. The four
    // page-local copies this replaces returned 1 here, which renders "1 Day"
    // for a booking whose dates the screen does not have.
    expect(rentalDaysBetween(null, npt('2026-09-04', '09:00'))).toBeNull()
    expect(rentalDaysBetween(npt('2026-09-01', '09:00'), null)).toBeNull()
    expect(rentalDaysBetween(undefined, undefined)).toBeNull()
  })

  it('answers null for an unparseable instant', () => {
    expect(rentalDaysBetween('not a date', npt('2026-09-04', '09:00'))).toBeNull()
  })

  it('treats an empty string as missing rather than as the epoch', () => {
    expect(rentalDaysBetween('', npt('2026-09-04', '09:00'))).toBeNull()
  })
})

describe('formatRentalDays — the label, pluralised', () => {
  it('pluralises, which the page’s hand-built `${days} Days` did not', () => {
    expect(formatRentalDays(1)).toBe('1 Day')
    expect(formatRentalDays(3)).toBe('3 Days')
  })

  it('hands an unknown length to the caller’s fallback, never to a number', () => {
    expect(formatRentalDays(null)).toBe('—')
    expect(formatRentalDays(null, 'Not recorded')).toBe('Not recorded')
  })
})

describe('the three day counts are not interchangeable — TODO(decision), module header', () => {
  it('disagrees with civilDaysBetween on a span that crosses one date boundary', () => {
    const from = npt('2026-09-01', '09:00')
    const to = npt('2026-09-02', '22:00')
    // 37 elapsed hours: this engine prices two days; the overdue counters count
    // one calendar boundary crossed. Neither is wrong for its own question.
    expect(rentalDaysBetween(from, to)).toBe(2)
    expect(civilDaysBetween(from, to)).toBe(1)
  })

  it('agrees with it whenever the elapsed span lands near a whole day', () => {
    const from = npt('2026-09-01', '09:00')
    const to = npt('2026-09-04', '09:00')
    expect(rentalDaysBetween(from, to)).toBe(3)
    expect(civilDaysBetween(from, to)).toBe(3)
  })
})
