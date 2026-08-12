/**
 * # The settings registry
 *
 * `lib/bookingRules.ts` said it plainly: *"no settings-persistence layer exists
 * in this build"* — every `Switch` on `Settings.tsx` held its own `useState`,
 * 59 values rendered as spans dressed up as selects, and the whole 2,544-line
 * screen had four real inputs. So VAT, payment terms and the session timeout
 * could be read and not changed, and the modules that consume them read a
 * literal instead.
 *
 * This is that layer, built the way `bookingRules.ts` and `lib/collapse.ts`
 * already do it — `localStorage`, one namespaced key per setting, no invented
 * database column and no migration. Real enough that a changed VAT rate
 * survives a reload and the next screen to read it gets the new number;
 * honest about being local until a `settings` table exists.
 *
 * ## What is a setting, and what only looks like one
 *
 * Not every value on that screen belongs here. "Calendar mode: BS + AD",
 * "Number format: Lakh / crore" and "Default currency: NPR" are **product
 * laws** — Foundation fixes them, no other branch is implemented, and a select
 * offering the alternative would be a control that lies. Those keep rendering
 * as values, with the reason attached, and never gain an input.
 *
 * A key here means: the value is genuinely variable, and something reads it.
 */

import { toRupees } from './money'
import { FEE_PER_CREW_DAY_PAISA } from '../data/crew'

export type SettingKey =
  | 'organisationName'
  | 'businessDescription'
  | 'vatNumber'
  | 'vatRatePercent'
  | 'crewCoordinationFeeRupees'
  | 'paymentTermsDays'
  | 'latePaymentPercentPerMonth'
  | 'sessionTimeoutMinutes'
  | 'passwordPolicy'
  | 'density'
  | 'dateFormat'
  | 'decimalPlaces'
  | 'weekStarts'
  | 'language'

export type SettingValue = string | number

export interface SettingSpec {
  default: SettingValue
  kind: 'text' | 'number' | 'select'
  /** `select` only. The whole allowed set; anything else is refused on save. */
  options?: readonly string[]
  /** Rendered after the value in read mode — `%`, ` days`. Never stored. */
  suffix?: string
  /** Returns an error string, or null. Runs before the value is written. */
  validate?: (v: SettingValue) => string | null
}

/** A percentage that a tax engine multiplies by cannot be a free-text field. */
function percent(v: SettingValue, label: string): string | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return `${label} must be a number.`
  if (n < 0) return `${label} cannot be negative.`
  if (n > 100) return `${label} cannot exceed 100%.`
  return null
}

export const SETTING_SPECS: Record<SettingKey, SettingSpec> = {
  organisationName: {
    default: 'Babin Rentals',
    kind: 'text',
    validate: (v) => (String(v).trim() ? null : 'The organisation name appears on every document — it cannot be blank.'),
  },
  businessDescription: { default: 'Film & Production Equipment Rental', kind: 'text' },
  vatNumber: {
    default: '601928473',
    kind: 'text',
    /* Nepali PAN/VAT is nine digits. Refusing the shape here is the difference
       between a wrong number on one invoice and a wrong number on all of them. */
    validate: (v) => {
      const s = String(v).trim()
      if (!s) return null
      return /^\d{9}$/.test(s) ? null : 'A Nepali VAT/PAN is nine digits.'
    },
  },

  /* `lib/seed.ts:83` hard-codes `VAT_PERCENT = 13` and `bookingQuery.ts:1017`
     says the figure is "A PERCENTAGE (13, not 0.13) from Settings ▸ Finance".
     This is the Settings ▸ Finance that comment was pointing at. */
  vatRatePercent: { default: 13, kind: 'number', suffix: '%', validate: (v) => percent(v, 'VAT rate') },
  crewCoordinationFeeRupees: {
    /* Derived from `data/crew.ts`'s constant rather than retyped, so the
       default here and the figure the crew engine uses cannot disagree. Still
       a proposed default (§2.2), not a confirmed figure — PLAN.md §4. */
    default: toRupees(FEE_PER_CREW_DAY_PAISA),
    kind: 'number',
    validate: (v) => {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) return 'A fee cannot be negative.'
      return null
    },
  },
  paymentTermsDays: {
    default: 14,
    kind: 'number',
    suffix: ' days',
    validate: (v) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0) return 'Credit terms are a whole number of days.'
      if (n > 365) return 'Credit terms beyond a year need a written agreement, not a default.'
      return null
    },
  },
  latePaymentPercentPerMonth: {
    default: 1.5,
    kind: 'number',
    suffix: '% / month',
    validate: (v) => percent(v, 'Late payment interest'),
  },
  sessionTimeoutMinutes: {
    default: 30,
    kind: 'number',
    suffix: ' minutes',
    validate: (v) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1) return 'A timeout is at least one minute.'
      if (n > 480) return 'A timeout beyond eight hours is not a timeout.'
      return null
    },
  },
  passwordPolicy: { default: 'Strict', kind: 'select', options: ['Strict', 'Standard'] },
  density: { default: 'Comfortable', kind: 'select', options: ['Comfortable', 'Compact'] },
  dateFormat: { default: 'D MMM YYYY', kind: 'select', options: ['D MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] },
  decimalPlaces: {
    default: '0 (2 when paise exist)',
    kind: 'select',
    options: ['0 (2 when paise exist)', '2 always'],
  },
  weekStarts: { default: 'Sunday', kind: 'select', options: ['Sunday', 'Monday'] },

  /**
   * Ruled 12 Aug 2026 — the EN/NE toggle is live.
   *
   * Options are the endonyms, which is what a language picker shows: a user
   * looking for Nepali is looking for "नेपाली", not for the English word for it.
   * `lib/i18n.ts` owns the coverage gate; this only stores the choice.
   */
  language: { default: 'English', kind: 'select', options: ['English', 'नेपाली'] },
}

/** Maps the stored label to the code `lib/i18n.ts` works in. */
export function languageCodeOf(value: SettingValue): 'en' | 'ne' {
  return String(value) === 'नेपाली' ? 'ne' : 'en'
}

export type SettingsRecord = Record<SettingKey, SettingValue>

export const SETTINGS_DEFAULTS: SettingsRecord = Object.fromEntries(
  (Object.keys(SETTING_SPECS) as SettingKey[]).map((k) => [k, SETTING_SPECS[k].default]),
) as SettingsRecord

const PREFIX = 'br.settings.'

/**
 * Validates a value against its own spec. Exported because the screen runs it
 * before writing and the store runs it again on read — a value that stopped
 * being valid (a spec tightened, a hand-edited localStorage) falls back to the
 * default rather than propagating into an invoice.
 */
export function validateSetting(key: SettingKey, value: SettingValue): string | null {
  const spec = SETTING_SPECS[key]
  if (spec.kind === 'select' && spec.options && !spec.options.includes(String(value))) {
    return `Must be one of: ${spec.options.join(', ')}.`
  }
  return spec.validate?.(value) ?? null
}

export function readSettings(): SettingsRecord {
  if (typeof window === 'undefined') return { ...SETTINGS_DEFAULTS }
  const out = { ...SETTINGS_DEFAULTS }
  for (const key of Object.keys(SETTING_SPECS) as SettingKey[]) {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) continue
    const spec = SETTING_SPECS[key]
    const parsed: SettingValue = spec.kind === 'number' ? Number(raw) : raw
    if (spec.kind === 'number' && !Number.isFinite(parsed as number)) continue
    if (validateSetting(key, parsed) !== null) continue
    out[key] = parsed
  }
  return out
}

/** Writes only the keys in the patch. Refuses an invalid value rather than storing it. */
export function writeSettings(patch: Partial<SettingsRecord>): void {
  if (typeof window === 'undefined') return
  for (const [k, v] of Object.entries(patch) as Array<[SettingKey, SettingValue]>) {
    const problem = validateSetting(k, v)
    if (problem) throw new Error(problem)
    window.localStorage.setItem(PREFIX + k, String(v))
  }
}

/** One setting, read fresh. For modules that need a value without the whole record. */
export function getSetting(key: SettingKey): SettingValue {
  return readSettings()[key]
}

/** Read-mode rendering: the stored value plus its spec's suffix. */
export function formatSetting(key: SettingKey, value: SettingValue): string {
  return `${value}${SETTING_SPECS[key].suffix ?? ''}`
}

/** Clears every stored override. Used by the screen's Reset and by tests. */
export function resetSettings(): void {
  if (typeof window === 'undefined') return
  for (const key of Object.keys(SETTING_SPECS) as SettingKey[]) {
    window.localStorage.removeItem(PREFIX + key)
  }
}
