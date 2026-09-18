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
import { rentalDaysBetween, formatRentalDays } from '../rentalDays'
import { civilDaysBetween } from '../../data/today'

/** Kathmandu is +05:45 and has no daylight saving, so a local clock time is a fixed UTC offset. */
const npt = (day: string, clock: string) => `${day}T${clock}:00.000+05:45`

describe('rentalDaysBetween — 06:00 -> 06:00 rental-day rule (Task 6)', () => {
  it('counts 06:00 to next day 06:00 as exactly 1 rental day', () => {
    expect(rentalDaysBetween(npt('2026-09-20', '06:00'), npt('2026-09-21', '06:00'))).toBe(1)
  })

  it('counts multiple whole rental days correctly (06:00 -> 06:00)', () => {
    // Sep 20 06:00 to Sep 24 06:00 = 4 days
    expect(rentalDaysBetween(npt('2026-09-20', '06:00'), npt('2026-09-24', '06:00'))).toBe(4)
  })

  it('counts hire past 06:00 boundary as entering next rental day', () => {
    // Sep 20 06:00 to Sep 21 06:01 or 09:00 = 2 rental days
    expect(rentalDaysBetween(npt('2026-09-20', '06:00'), npt('2026-09-21', '09:00'))).toBe(2)
  })

  it('counts pickup 20:00, return 08:00 next day crossing 06:00 boundary as 2 rental days (AUD-009)', () => {
    // Sep 20 20:00 to Sep 21 08:00 crosses Sep 21 06:00 = 2 rental days billed
    expect(rentalDaysBetween(npt('2026-09-20', '20:00'), npt('2026-09-21', '08:00'))).toBe(2)
  })

  it('counts same-day hire within operational window as 1 rental day', () => {
    // Sep 20 09:00 to Sep 20 18:00 = 1 rental day
    expect(rentalDaysBetween(npt('2026-09-20', '09:00'), npt('2026-09-20', '18:00'))).toBe(1)
  })

  it('counts afternoon pickup to next day 06:00 as 1 rental day', () => {
    // Sep 20 14:00 to Sep 21 06:00 = 1 rental day
    expect(rentalDaysBetween(npt('2026-09-20', '14:00'), npt('2026-09-21', '06:00'))).toBe(1)
  })

  it('treats pickup before 06:00 as belonging to previous operational day', () => {
    // Sep 20 05:30 (belongs to Sep 19 shift) to Sep 21 06:00 (end of Sep 20 shift) = 2 rental days
    expect(rentalDaysBetween(npt('2026-09-20', '05:30'), npt('2026-09-21', '06:00'))).toBe(2)
  })

  it('refuses return before or equal to pickup (returns null)', () => {
    expect(rentalDaysBetween(npt('2026-09-21', '06:00'), npt('2026-09-20', '06:00'))).toBeNull()
    expect(rentalDaysBetween(npt('2026-09-20', '06:00'), npt('2026-09-20', '06:00'))).toBeNull()
  })

  it('is unaffected by UTC vs NPT representation of the same instants', () => {
    const inNpt = rentalDaysBetween(npt('2026-09-20', '06:00'), npt('2026-09-21', '06:00'))
    const inUtc = rentalDaysBetween('2026-09-20T00:15:00.000Z', '2026-09-21T00:15:00.000Z')
    expect(inUtc).toBe(inNpt)
    expect(inUtc).toBe(1)
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

describe('the three day counts are not interchangeable — canonical 06:00 rule', () => {
  it('disagrees with civilDaysBetween on a span that crosses one date boundary', () => {
    const from = npt('2026-09-01', '09:00')
    const to = npt('2026-09-02', '22:00')
    // Spans 2 rental days (Sep 01 and Sep 02); civilDaysBetween counts 1 midnight boundary crossed.
    expect(rentalDaysBetween(from, to)).toBe(2)
    expect(civilDaysBetween(from, to)).toBe(1)
  })

  it('agrees with civilDaysBetween when return is at 06:00 cutoff', () => {
    const from = npt('2026-09-01', '09:00')
    const to = npt('2026-09-04', '06:00')
    expect(rentalDaysBetween(from, to)).toBe(3)
    expect(civilDaysBetween(from, to)).toBe(3)
  })

  it('adds an extra rental day when return extends past 06:00 into the next shift', () => {
    const from = npt('2026-09-01', '09:00')
    const to = npt('2026-09-04', '09:00')
    // Touching the Sep 04 06:00-06:00 operational day makes it 4 rental days
    expect(rentalDaysBetween(from, to)).toBe(4)
    expect(civilDaysBetween(from, to)).toBe(3)
  })
})
