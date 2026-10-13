import { describe, expect, it } from 'vitest'
import { defaultShortageDays, shortageCalendarLink, shortagePeriod } from '../shortagePeriod'

describe('shortage operational period', () => {
  it('includes the selected shift day at 06:00 Nepal, with a half-open end', () => {
    expect(shortagePeriod('2026-10-13', '2026-10-13', 360)).toEqual({ fromAd: '2026-10-13T00:15:00.000Z', toAd: '2026-10-14T00:15:00.000Z' })
  })
  it('honors a configured shift start', () => {
    expect(shortagePeriod('2026-10-13', '2026-10-14', 480)).toEqual({ fromAd: '2026-10-13T02:15:00.000Z', toAd: '2026-10-15T02:15:00.000Z' })
  })
  it.each([['2026-02-30', '2026-03-01'], ['2026-10-14', '2026-10-13'], ['', '2026-10-13']])('refuses invalid day range %s / %s', (from, to) => expect(shortagePeriod(from, to, 360)).toBeNull())
  it('starts on the current operational day before Nepal 06:00', () => {
    expect(defaultShortageDays(new Date('2026-10-13T00:00:00Z'), 360)).toEqual({ from: '2026-10-12', to: '2026-11-11' })
  })
  it('links to the Nepal civil calendar date rather than the UTC date', () => {
    expect(shortageCalendarLink('2026-10-12T20:00:00Z')).toBe('/calendar?d=2026-10-13')
  })
})
