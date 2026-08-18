import { describe, it, expect } from 'vitest'
import { parseTstzRange, toTstzRangeLiteral } from '../availability'
import { windowsOverlap, RENTAL_WINDOW_BOUNDS, type RentalWindow } from '../../availability'

/**
 * The two text-format functions, which are where a range round-trip goes wrong
 * silently. Everything else in `queries/availability.ts` is IO and is exercised
 * against the live project rather than mocked.
 *
 * A `tstzrange` read back wrong is the unsafe direction twice over: a hold that
 * fails to parse is DROPPED, so the unit reads as free.
 */
describe('parseTstzRange', () => {
  /**
   * ⭐ **Captured from the live database, 16 Aug 2026 — not composed here.**
   *
   * The reservation write path was driven against project `sxguwvgoserhdolewibb`
   * inside a transaction rolled back by `raise exception`, so nothing committed.
   * A row was inserted with exactly the literal `toTstzRangeLiteral` produces,
   * and `period::text` was read straight back. This is that value, verbatim:
   *
   *     ["2026-08-03 00:15:00+00","2026-08-05 00:15:00+00")
   *
   * It matters because every other case in this file states the shape the
   * parser was *designed* for. This one states the shape the database actually
   * returns — which is the thing that can silently disagree, and the disagreement
   * is unsafe in one direction: a hold that fails to parse is DROPPED, so the
   * unit reads as free and gets double-booked.
   *
   * Note what the round trip does NOT preserve: the literal written was
   * `[2026-08-03T00:15:00+00:00,…)` — `T` separator, `+00:00` offset. Postgres
   * normalised both. Same instants, different text, which is exactly why this
   * module compares parsed instants and never strings.
   */
  it('reads the exact text the live database returned for a written period', () => {
    const fromLiveDb = '["2026-08-03 00:15:00+00","2026-08-05 00:15:00+00")'
    const parsed = parseTstzRange(fromLiveDb)

    expect(parsed).not.toBeNull()
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse('2026-08-03T00:15:00Z'))
    expect(Date.parse(parsed?.toAd ?? '')).toBe(Date.parse('2026-08-05T00:15:00Z'))

    /* And the round trip closes: what was written parses back to what it meant. */
    const written = toTstzRangeLiteral(
      { fromAd: '2026-08-03T00:15:00+00:00', toAd: '2026-08-05T00:15:00+00:00' },
      'half-open',
    )
    expect(Date.parse(parseTstzRange(written)?.fromAd ?? '')).toBe(Date.parse(parsed?.fromAd ?? ''))
  })

  /* Postgres's own text output: a space instead of `T`, `+00` instead of `Z`,
     and a half-open upper bound. This exact string shape is what PostgREST
     hands back for a tstzrange column. */
  it("reads Postgres's text output, spaces and +00 and all", () => {
    const parsed = parseTstzRange('["2026-08-16 03:15:00+00","2026-08-18 12:15:00+00")')
    expect(parsed).not.toBeNull()
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse('2026-08-16T03:15:00Z'))
    expect(Date.parse(parsed?.toAd ?? '')).toBe(Date.parse('2026-08-18T12:15:00Z'))
  })

  it('reads it without the quotes, which Postgres omits when unambiguous', () => {
    const parsed = parseTstzRange('[2026-08-16 03:15:00+00,2026-08-18 12:15:00+00)')
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse('2026-08-16T03:15:00Z'))
  })

  it('reads a four-digit offset, which is what +05:45 comes back as', () => {
    const parsed = parseTstzRange('["2026-08-16 09:00:00+0545","2026-08-18 18:00:00+0545")')
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse('2026-08-16T09:00:00+05:45'))
  })

  it('accepts a closed upper bound too, so the convention can be re-ruled', () => {
    expect(parseTstzRange('["2026-08-16 03:15:00+00","2026-08-18 12:15:00+00"]')).not.toBeNull()
  })

  it('returns null rather than a wrong window for anything it cannot read', () => {
    expect(parseTstzRange('empty')).toBeNull()
    expect(parseTstzRange('')).toBeNull()
    expect(parseTstzRange('["2026-08-16 03:15:00+00",)')).toBeNull()
  })

  /*
   * The round trip is the property that matters: what this module writes, it
   * must be able to read back as the same two instants. A mismatch here means
   * a booking's own hold stops being recognisable as its own.
   */
  it('round-trips a window written by toTstzRangeLiteral', () => {
    const window: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }
    const parsed = parseTstzRange(toTstzRangeLiteral(window, RENTAL_WINDOW_BOUNDS))

    expect(parsed).not.toBeNull()
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse(window.fromAd))
    expect(Date.parse(parsed?.toAd ?? '')).toBe(Date.parse(window.toAd))
  })

  it('produces a window the overlap engine accepts', () => {
    const window: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }
    const parsed = parseTstzRange('["2026-08-17 03:15:00+00","2026-08-19 12:15:00+00")')

    expect(parsed).not.toBeNull()
    /* The engine rejects an instant with no offset (Law 7), so this also proves
       the parser restores one rather than handing over a naive timestamp. */
    expect(windowsOverlap(window, parsed as RentalWindow, RENTAL_WINDOW_BOUNDS)).toBe(true)
  })
})

describe('toTstzRangeLiteral', () => {
  const window: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }

  /* PLAN.md §4.30(b) ruled half-open, and the literal's closing bracket is
     where that ruling physically reaches the database.

     `bounds` is passed explicitly at every call below because the parameter no
     longer has a default — removed 16 Aug 2026 once `rentalTurnaround` became a
     Settings key, so that a period can never be WRITTEN under the ruled default
     while the availability check that produced it RAN under the owner's choice. */
  it('writes the ruled bound convention into the bracket', () => {
    expect(toTstzRangeLiteral(window, RENTAL_WINDOW_BOUNDS)).toBe(
      '[2026-08-16T09:00:00+05:45,2026-08-18T18:00:00+05:45)',
    )
  })

  it('tracks RENTAL_WINDOW_BOUNDS rather than hardcoding a bracket', () => {
    const expected = RENTAL_WINDOW_BOUNDS === 'closed' ? ']' : ')'
    expect(toTstzRangeLiteral(window, RENTAL_WINDOW_BOUNDS).endsWith(expected)).toBe(true)
  })

  it('can be asked for the other convention explicitly', () => {
    expect(toTstzRangeLiteral(window, 'closed').endsWith(']')).toBe(true)
    expect(toTstzRangeLiteral(window, 'half-open').endsWith(')')).toBe(true)
  })
})
