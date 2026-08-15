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
    const parsed = parseTstzRange(toTstzRangeLiteral(window))

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
     where that ruling physically reaches the database. If the constant is
     re-ruled, this test is what proves the range literal followed it. */
  it('writes the ruled bound convention into the bracket', () => {
    expect(toTstzRangeLiteral(window)).toBe('[2026-08-16T09:00:00+05:45,2026-08-18T18:00:00+05:45)')
    expect(toTstzRangeLiteral(window).endsWith(')')).toBe(true)
  })

  it('tracks RENTAL_WINDOW_BOUNDS rather than hardcoding a bracket', () => {
    const expected = RENTAL_WINDOW_BOUNDS === 'closed' ? ']' : ')'
    expect(toTstzRangeLiteral(window).endsWith(expected)).toBe(true)
  })

  it('can be asked for the other convention explicitly', () => {
    expect(toTstzRangeLiteral(window, 'closed').endsWith(']')).toBe(true)
    expect(toTstzRangeLiteral(window, 'half-open').endsWith(')')).toBe(true)
  })
})
