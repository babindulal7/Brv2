import { describe, it, expect } from 'vitest'
import { getSettingsSummary, TABS, isTabKey, DEFAULT_TAB } from '../settings'

describe('settings queries', () => {
  it('loads live settings summary and branch data', async () => {
    const summary = await getSettingsSummary()
    expect(summary).toBeDefined()
    expect(summary.branches.length).toBeGreaterThan(0)
    expect(summary.totals.branches).toBeGreaterThan(0)
    expect(summary.alerts.length).toBeGreaterThan(0)
  })

  it('validates tab configurations and keys', () => {
    expect(TABS.length).toBe(4)
    expect(isTabKey('business')).toBe(true)
    expect(isTabKey('people')).toBe(true)
    expect(isTabKey('branches')).toBe(true)
    expect(isTabKey('system')).toBe(true)
    expect(isTabKey('invalid_tab')).toBe(false)
    expect(DEFAULT_TAB).toBe('business')
  })
})
