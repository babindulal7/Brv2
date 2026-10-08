import { describe, it, expect } from 'vitest'
import { computeDatePreset } from '../datePresets'

describe('Booqable Date Presets Engine (Law 1, DATE_TIME_PICKER_SPEC v1.0)', () => {
  const anchor = '2026-08-31' // Monday

  it('computes all_time as unbounded', () => {
    const res = computeDatePreset('all_time', anchor)
    expect(res).toEqual({ from: '', to: '', label: 'All time' })
  })

  it('computes today correctly', () => {
    const res = computeDatePreset('today', anchor)
    expect(res).toEqual({ from: '2026-08-31', to: '2026-08-31', label: 'Today' })
  })

  it('computes yesterday correctly', () => {
    const res = computeDatePreset('yesterday', anchor)
    expect(res).toEqual({ from: '2026-08-30', to: '2026-08-30', label: 'Yesterday' })
  })

  it('computes tomorrow correctly', () => {
    const res = computeDatePreset('tomorrow', anchor)
    expect(res).toEqual({ from: '2026-09-01', to: '2026-09-01', label: 'Tomorrow' })
  })

  it('computes next_7_days correctly (today + 6 days)', () => {
    const res = computeDatePreset('next_7_days', anchor)
    expect(res).toEqual({ from: '2026-08-31', to: '2026-09-06', label: 'Next 7 days' })
  })

  it('computes this_week (Sunday-anchored per Booqable §1)', () => {
    // 2026-08-31 is Monday, so Sunday of this week is 2026-08-30, Saturday is 2026-09-05
    const res = computeDatePreset('this_week', anchor)
    expect(res).toEqual({ from: '2026-08-30', to: '2026-09-05', label: 'This week' })
  })

  it('computes last_week and next_week relative to this_week', () => {
    const last = computeDatePreset('last_week', anchor)
    expect(last).toEqual({ from: '2026-08-23', to: '2026-08-29', label: 'Last week' })

    const next = computeDatePreset('next_week', anchor)
    expect(next).toEqual({ from: '2026-09-06', to: '2026-09-12', label: 'Next week' })
  })

  it('computes this_month, last_month, and forward next_month', () => {
    const thisMo = computeDatePreset('this_month', anchor)
    expect(thisMo).toEqual({ from: '2026-08-01', to: '2026-08-31', label: 'This month' })

    const lastMo = computeDatePreset('last_month', anchor)
    expect(lastMo).toEqual({ from: '2026-07-01', to: '2026-07-31', label: 'Last month' })

    const nextMo = computeDatePreset('next_month', anchor)
    expect(nextMo).toEqual({ from: '2026-09-01', to: '2026-09-30', label: 'Next month' })
  })

  it('computes this_year, last_year, and next_year', () => {
    const thisYr = computeDatePreset('this_year', anchor)
    expect(thisYr).toEqual({ from: '2026-01-01', to: '2026-12-31', label: 'This year' })

    const lastYr = computeDatePreset('last_year', anchor)
    expect(lastYr).toEqual({ from: '2025-01-01', to: '2025-12-31', label: 'Last year' })

    const nextYr = computeDatePreset('next_year', anchor)
    expect(nextYr).toEqual({ from: '2027-01-01', to: '2027-12-31', label: 'Next year' })
  })

  it('computes this_fiscal_year and last_fiscal_year anchored on Shrawan 1 (BS calendar)', () => {
    // 2026-08-31 is Bhadra 2083, so FY is 2083/84
    // 1 Shrawan 2083 = 17 Jul 2026
    const thisFy = computeDatePreset('this_fiscal_year', anchor)
    expect(thisFy.from).toBe('2026-07-17')
    expect(thisFy.label).toContain('2083/84')

    const lastFy = computeDatePreset('last_fiscal_year', anchor)
    expect(lastFy.label).toContain('2082/83')
    expect(lastFy.to).toBe('2026-07-16') // Day before 1 Shrawan 2083
  })
})
