import { describe, it, expect } from 'vitest'
import { formatBookingNo, parseBookingNoSearch } from '../format'

/**
 * R-10 / SPEC-P0-3 §7. `0085_booking_numbers_bare` stores a booking number as a
 * bare integer and the `#` becomes display-only, so two things have to hold
 * forever after: the screens must never show a naked `946`, and the three forms
 * an operator might type must all reach the same rental.
 *
 * The second is the one with a deadline attached — staff will type `B-946` for
 * months, and clients hold paperwork carrying it. A search that silently returns
 * nothing is the failure this pins.
 */
describe('formatBookingNo — display only, never stored', () => {
  it('renders the # the database does not carry', () => {
    expect(formatBookingNo('946')).toBe('#946')
    expect(formatBookingNo('700')).toBe('#700')
    expect(formatBookingNo('90000')).toBe('#90000')
  })

  it('does not double the # if it is already there', () => {
    expect(formatBookingNo('#946')).toBe('#946')
  })

  it('gives an explicit non-value rather than a bare #', () => {
    expect(formatBookingNo(null)).toBe('—')
    expect(formatBookingNo(undefined)).toBe('—')
    expect(formatBookingNo('')).toBe('—')
    expect(formatBookingNo('   ')).toBe('—')
    expect(formatBookingNo(null, 'not set')).toBe('not set')
  })
})

describe('parseBookingNoSearch — all three forms find the same rental', () => {
  it('accepts the stored form, the displayed form and the retired form', () => {
    expect(parseBookingNoSearch('880')).toBe('880')
    expect(parseBookingNoSearch('#880')).toBe('880')
    expect(parseBookingNoSearch('B-880')).toBe('880')
    // Staff type in a hurry; the retired prefix was lowercase in some exports.
    expect(parseBookingNoSearch('b-880')).toBe('880')
  })

  it('trims what a paste brings with it', () => {
    expect(parseBookingNoSearch('  #880  ')).toBe('880')
  })

  it('leaves a project search alone — the same term also runs against project', () => {
    // The danger of a greedy strip: this is a plausible project name, and
    // rewriting it would silently change what the operator asked for.
    expect(parseBookingNoSearch('B-roll')).toBe('B-roll')
    expect(parseBookingNoSearch('Everest')).toBe('Everest')
    expect(parseBookingNoSearch('#')).toBe('#')
    expect(parseBookingNoSearch('B-')).toBe('B-')
  })

  it('does not invent a number from a mixed token', () => {
    expect(parseBookingNoSearch('B-880x')).toBe('B-880x')
    expect(parseBookingNoSearch('880-B')).toBe('880-B')
  })

  it('round-trips with formatBookingNo', () => {
    for (const stored of ['700', '899', '946', '90045']) {
      expect(parseBookingNoSearch(formatBookingNo(stored))).toBe(stored)
    }
  })
})
