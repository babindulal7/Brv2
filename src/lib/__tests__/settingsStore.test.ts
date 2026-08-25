// @vitest-environment jsdom
/**
 * The settings registry.
 *
 * `bookingRules.ts` states the problem this closes: *"no settings-persistence
 * layer exists in this build"*. What matters here is not that values round-trip
 * — it is that a value which is **not valid never reaches a consumer**, whether
 * it arrives from the screen or from a hand-edited localStorage. A VAT rate is
 * multiplied into every invoice; a bad one is not a display bug.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SETTINGS_DEFAULTS,
  SETTING_SPECS,
  readSettings,
  writeSettings,
  getSetting,
  validateSetting,
  formatSetting,
  resetSettings,
} from '../settingsStore'
import { toRupees } from '../money'
import { FEE_PER_CREW_DAY_PAISA } from '../../data/crew'

beforeEach(() => {
  window.localStorage.clear()
})

describe('settingsStore — defaults', () => {
  it('reads defaults when nothing is stored', () => {
    expect(readSettings()).toEqual(SETTINGS_DEFAULTS)
  })

  it('the VAT default is the 13 the seed and the query layer already assume', () => {
    // `lib/seed.ts:83` VAT_PERCENT = 13, and bookingQuery.ts:1017 calls it
    // "A PERCENTAGE (13, not 0.13) from Settings ▸ Finance".
    expect(SETTINGS_DEFAULTS.vatRatePercent).toBe(13)
  })

  it('the crew fee default is derived from the crew engine, not retyped', () => {
    expect(SETTINGS_DEFAULTS.crewCoordinationFeeRupees).toBe(toRupees(FEE_PER_CREW_DAY_PAISA))
  })

  it('every select spec lists its own default among its options', () => {
    for (const [key, spec] of Object.entries(SETTING_SPECS)) {
      if (spec.kind !== 'select') continue
      expect(spec.options, `${key} is a select with no options`).toBeDefined()
      expect(spec.options).toContain(String(spec.default))
    }
  })

  it('every default validates against its own spec', () => {
    for (const [key, spec] of Object.entries(SETTING_SPECS)) {
      expect(validateSetting(key as never, spec.default), key).toBeNull()
    }
  })
})

describe('settingsStore — writing', () => {
  it('a written value survives a re-read', () => {
    writeSettings({ vatRatePercent: 15 })
    expect(readSettings().vatRatePercent).toBe(15)
    expect(getSetting('vatRatePercent')).toBe(15)
  })

  it('writes only the keys in the patch', () => {
    writeSettings({ vatRatePercent: 15 })
    expect(readSettings().paymentTermsDays).toBe(SETTINGS_DEFAULTS.paymentTermsDays)
  })

  it('refuses an invalid value rather than storing it', () => {
    expect(() => writeSettings({ vatRatePercent: 140 })).toThrow(/exceed 100/)
    expect(readSettings().vatRatePercent).toBe(13)
  })

  it('refuses a select value outside its options', () => {
    expect(() => writeSettings({ passwordPolicy: 'Whatever' })).toThrow(/Must be one of/)
  })

  it('refuses a blank organisation name — it appears on every document', () => {
    expect(() => writeSettings({ organisationName: '   ' })).toThrow(/cannot be blank/)
  })

  it('refuses a VAT number that is not nine digits', () => {
    expect(() => writeSettings({ vatNumber: '12345' })).toThrow(/nine digits/)
    expect(() => writeSettings({ vatNumber: '601928473' })).not.toThrow()
  })

  /*
   * Inverted 25 Aug 2026. This read "refuses a session timeout of zero — that
   * is not a timeout", which made OFF unrepresentable and handed every session
   * a 30-minute idle timer nobody asked for. The owner ruled the lock off by
   * default, and 0 is how off is stored.
   */
  it('accepts zero as OFF, and defaults to off', () => {
    expect(() => writeSettings({ sessionTimeoutMinutes: 0 })).not.toThrow()
    expect(readSettings().sessionTimeoutMinutes).toBe(0)
  })

  it('still refuses a negative or absurd timeout', () => {
    expect(() => writeSettings({ sessionTimeoutMinutes: -1 })).toThrow()
    expect(() => writeSettings({ sessionTimeoutMinutes: 481 })).toThrow(/eight hours/)
  })
})

describe('settingsStore — a stored value that stopped being valid', () => {
  it('falls back to the default rather than propagating into an invoice', () => {
    // Hand-edited storage, or a spec that tightened after the value was written.
    window.localStorage.setItem('br.settings.vatRatePercent', '900')
    expect(readSettings().vatRatePercent).toBe(13)
  })

  it('ignores a non-numeric value in a numeric slot', () => {
    window.localStorage.setItem('br.settings.paymentTermsDays', 'soon')
    expect(readSettings().paymentTermsDays).toBe(SETTINGS_DEFAULTS.paymentTermsDays)
  })

  it('ignores a select value that is no longer an option', () => {
    window.localStorage.setItem('br.settings.density', 'Roomy')
    expect(readSettings().density).toBe('Comfortable')
  })
})

describe('settingsStore — rendering and reset', () => {
  it('formats a value with its suffix', () => {
    expect(formatSetting('vatRatePercent', 13)).toBe('13%')
    expect(formatSetting('paymentTermsDays', 14)).toBe('14 days')
    expect(formatSetting('passwordPolicy', 'Strict')).toBe('Strict')
  })

  it('reset clears every override', () => {
    writeSettings({ vatRatePercent: 15, density: 'Compact' })
    resetSettings()
    expect(readSettings()).toEqual(SETTINGS_DEFAULTS)
  })
})
