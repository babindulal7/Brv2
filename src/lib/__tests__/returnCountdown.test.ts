import { describe, it, expect } from 'vitest'
import { formatSpan, returnCountdown } from '../returnCountdown'

const DUE = '2026-10-08T12:15:00.000Z' // 18:00 in Kathmandu
const at = (iso: string) => Date.parse(iso)

describe('formatSpan', () => {
  it('keeps two units at most and drops a zero second unit', () => {
    expect(formatSpan(45)).toBe('45m')
    expect(formatSpan(200)).toBe('3h 20m')
    expect(formatSpan(180)).toBe('3h')
    expect(formatSpan(1440 * 2 + 4 * 60 + 17)).toBe('2d 4h')
    expect(formatSpan(1440 * 2)).toBe('2d')
  })

  it('floors, so 59 minutes never reads as an hour', () => {
    expect(formatSpan(59.9)).toBe('59m')
    expect(formatSpan(119.99)).toBe('1h 59m')
  })

  it('says "under 1m" rather than "0m" for the last minute', () => {
    expect(formatSpan(0)).toBe('under 1m')
    expect(formatSpan(0.5)).toBe('under 1m')
    expect(formatSpan(-5)).toBe('under 1m')
  })
})

describe('returnCountdown', () => {
  it('counts down to return_at while it is still ahead', () => {
    expect(returnCountdown(DUE, at('2026-10-08T08:55:00.000Z'))).toEqual({ overdue: false, span: '3h 20m' })
  })

  it('is NOT overdue at the exact due instant — the same strict < the overdue predicates use', () => {
    expect(returnCountdown(DUE, at(DUE))).toEqual({ overdue: false, span: 'under 1m' })
  })

  it('counts up past return_at once it has gone by', () => {
    expect(returnCountdown(DUE, at('2026-10-08T14:30:00.000Z'))).toEqual({ overdue: true, span: '2h 15m' })
    expect(returnCountdown(DUE, at('2026-10-10T16:15:00.000Z'))).toEqual({ overdue: true, span: '2d 4h' })
  })

  it('returns null for an instant it cannot read — no countdown rather than a wrong one', () => {
    expect(returnCountdown('not a date', at(DUE))).toBeNull()
    expect(returnCountdown('', at(DUE))).toBeNull()
  })
})
