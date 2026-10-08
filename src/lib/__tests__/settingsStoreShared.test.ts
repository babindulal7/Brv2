// @vitest-environment jsdom
/** G1 (0158): shared settings overlay the device's own copy; device-local keys never leave the device. */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  writeSettings,
  getSetting,
  getSettingForLocation,
  applyRemoteSettings,
  clearRemoteSettings,
  resetSettings,
  isDeviceLocalKey,
} from '../settingsStore'

beforeEach(() => {
  resetSettings()
  clearRemoteSettings()
})

describe('shared settings overlay', () => {
  it('a database value beats this device\'s old local copy', () => {
    writeSettings({ operationalDayStart: '07:00' })
    applyRemoteSettings([{ key: 'operationalDayStart', value: '05:30', scope: 'org', location_id: null }])
    expect(getSetting('operationalDayStart')).toBe('05:30')
  })

  it('a key the database has no row for keeps the local value — nothing reverts on rollout', () => {
    writeSettings({ vatRatePercent: 10 })
    applyRemoteSettings([{ key: 'operationalDayStart', value: '05:30', scope: 'org', location_id: null }])
    expect(getSetting('vatRatePercent')).toBe(10)
  })

  it('coerces numbers and drops values that no longer validate', () => {
    applyRemoteSettings([
      { key: 'vatRatePercent', value: '15', scope: 'org', location_id: null },
      { key: 'paymentTermsDays', value: 'abc', scope: 'org', location_id: null },
    ])
    expect(getSetting('vatRatePercent')).toBe(15)
    expect(typeof getSetting('paymentTermsDays')).toBe('number')
  })

  it('device-local keys ignore the database', () => {
    expect(isDeviceLocalKey('density')).toBe(true)
    applyRemoteSettings([{ key: 'density', value: 'Compact', scope: 'org', location_id: null }])
    expect(getSetting('density')).not.toBe('Compact')
  })

  it('resolves location → org → default', () => {
    expect(getSettingForLocation('operationalDayStart', 'loc-1')).toBe('06:00')
    applyRemoteSettings([
      { key: 'operationalDayStart', value: '05:00', scope: 'org', location_id: null },
      { key: 'operationalDayStart', value: '07:00', scope: 'location', location_id: 'loc-1' },
    ])
    expect(getSettingForLocation('operationalDayStart', 'loc-1')).toBe('07:00')
    expect(getSettingForLocation('operationalDayStart', 'loc-2')).toBe('05:00')
    expect(getSettingForLocation('operationalDayStart', null)).toBe('05:00')
  })
})
