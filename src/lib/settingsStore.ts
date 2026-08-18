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
  | 'overdueStopDays'
  | 'latePaymentPercentPerMonth'
  | 'sessionTimeoutMinutes'
  | 'passwordPolicy'
  | 'density'
  | 'dateFormat'
  | 'decimalPlaces'
  | 'weekStarts'
  | 'language'
  /* ── Operations rules, added 16 Aug 2026 ──────────────────────────────────
   * Each of these was a hardcoded constant carrying a PLAN.md ruling. They are
   * here because they are genuinely variable business rules rather than
   * arithmetic — the ruled answer becomes the `default`, so nothing changes
   * behaviour on the day this shipped, and the owner can change it without a
   * developer. See the doc comment on each spec for which ruling it carries. */
  | 'unitAvailabilityRule'
  | 'rentalTurnaround'
  | 'packingTreeGrouping'
  | 'packingPhotosRequired'
  | 'evidenceRetentionDays'

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
  /**
   * **Rulings §11.2 — the On Stop threshold.**
   *
   * "On Stop" is not a `client_flag_type` and never will be: a client is on
   * stop when their outstanding exceeds their credit limit, **or** when they
   * hold an invoice more than this many days past its due date. The ruling puts
   * the number here, beside the payment terms, precisely so that no module
   * writes `30` into itself — §11.4: *"Every value here is read by a screen.
   * None is hardcoded."*
   *
   * Read by `data/clients.ts:readOverdueStopDays()`, which is the only reader;
   * the directory chip and the client record's credit box both go through the
   * one predicate that takes it.
   *
   * Deliberately NOT derived from `paymentTermsDays` (14). They answer
   * different questions — when an invoice falls due, versus how long a business
   * carries a late one before it stops trading with that client — and tying
   * them would move the second every time somebody edited the first.
   */
  overdueStopDays: {
    default: 30,
    kind: 'number',
    suffix: ' days',
    validate: (v) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1) return 'A client goes on stop after a whole number of days — at least one.'
      if (n > 365) return 'Past a year this is a write-off decision, not a stop threshold.'
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

  /* ── Operations rules ──────────────────────────────────────────────────────
   *
   * Five rulings that used to be constants. The rule each one carries is stated
   * on its spec; the *mapping* from the label to what the engine does lives in
   * `lib/availability.ts` (Law 1 — a page, and a settings registry, may not
   * hold business logic). This file stores a choice; it does not interpret one.
   *
   * Every default is the answer that was ruled on 16 Aug 2026, so introducing
   * these changed no behaviour on the day they shipped. That is deliberate: a
   * setting whose default differs from the ruling would silently re-rule it.
   */

  /**
   * **PLAN.md §4.30(c), closing §4.14** — which units are out of the pool.
   *
   * Offered as three named presets rather than ten tick-boxes over
   * `inventory_state`, because the question an owner is actually answering is
   * "how cautious should assignment be", not "is Returning a disqualifying
   * state". The three are the three that were reasoned about when it was ruled;
   * `lib/availability.ts` holds what each maps to.
   *
   * ⚠ The lifecycle states (Reserved / Packed / On Rent / Returning) are absent
   * from every preset by design — they are facts about *today*, and the
   * date-overlap check already answers per-window. A preset that disqualified
   * them would make a camera out on rent this week unassignable for a shoot
   * three months away.
   */
  unitAvailabilityRule: {
    default: 'Condition only',
    kind: 'select',
    options: ['Condition only', 'Condition and turnaround', 'Only In Stock'],
  },

  /**
   * **PLAN.md §4.30(b)** — whether a booking ending at 18:00 frees its unit for
   * one starting at 18:00.
   *
   * Labelled in warehouse terms rather than as `half-open` / `closed`, because
   * the person setting it is deciding whether gear needs time between jobs, not
   * picking a range convention. `lib/availability.ts` maps it back.
   *
   * Ruled *"Same-instant handover allowed"* against a recommendation for the
   * other one — which is exactly why it is a setting now: if same-instant
   * turnaround proves wrong on the floor, it is one dropdown rather than a
   * release.
   */
  rentalTurnaround: {
    default: 'Same-instant handover allowed',
    kind: 'select',
    options: ['Same-instant handover allowed', 'Turnaround required'],
  },

  /** **PLAN.md §4.31(2)** — how the packing tree is grouped on the bench. */
  packingTreeGrouping: {
    default: 'Bundle, then category',
    kind: 'select',
    options: ['Bundle, then category', 'Category only'],
  },

  /**
   * **PLAN.md §4.31(1)** — Complete Packing's evidence gate.
   *
   * The ruling dissolved the per-case model: the gate is photos per BOOKING.
   * The count is a setting because "one" was ruled as a floor, not as a law —
   * a business wanting front-and-back of a loaded van sets two.
   *
   * Zero is allowed and means the gate is off. That is a real configuration
   * (a business that does not photograph packing), so it is permitted rather
   * than validated away — but it removes the evidence trail, which is why it
   * is not the default.
   */
  packingPhotosRequired: {
    default: 1,
    kind: 'number',
    suffix: ' per booking',
    validate: (v) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0) return 'A photo count is a whole number, zero or more.'
      if (n > 20) return 'More than twenty photos per booking is a workflow problem, not a setting.'
      return null
    },
  },

  /**
   * **PLAN.md §4.31(1b)** — how long a packing/evidence photo's IMAGE FILE is
   * kept after a booking completes. The `evidence_files` row is kept either
   * way; that is what keeps the ruling inside Law 0.
   *
   * **Zero means never expire, and is the default deliberately.** The ruling
   * said retention exists but *nobody stated a period*, and this is where a
   * period gets stated. Defaulting to any positive number would be inventing
   * the one part of that ruling that was never given — and it would start
   * destroying evidence on a schedule nobody chose.
   */
  evidenceRetentionDays: {
    default: 0,
    kind: 'number',
    suffix: ' days after completion (0 = keep)',
    validate: (v) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0) return 'A retention period is a whole number of days, or 0 to keep them.'
      if (n > 0 && n < 30) {
        return 'Under 30 days risks deleting a photo before a damage dispute is raised. Use 0 to keep them.'
      }
      if (n > 3650) return 'Beyond ten years, use 0 (keep) rather than a number nobody will revisit.'
      return null
    },
  },
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
    /*
     * ⚠ A stored value that no longer validates is DISCARDED and the default
     * substituted. That is the right call — a hand-edited localStorage must not
     * reach an invoice — but until 16 Aug 2026 it happened in total silence,
     * and the operations rules made that dangerous rather than merely untidy.
     *
     * The case: an owner sets `unitAvailabilityRule` to 'Only In Stock'; a
     * later build renames that option; the stored value stops validating and
     * this loop quietly restores 'Condition only'. Availability LOOSENS, gear
     * that was being held back becomes bookable again, and nothing anywhere
     * says so. A VAT rate reverting is visible on the next invoice; a
     * disqualifying-state set reverting is visible nowhere.
     *
     * Warning rather than throwing, because refusing to load settings at all
     * would take the app down over one bad key. This does not make it safe — it
     * makes it observable, which is the difference between a bug someone can
     * find and one nobody can.
     */
    const invalid = spec.kind === 'number' && !Number.isFinite(parsed as number) ? 'not a number' : validateSetting(key, parsed)
    if (invalid !== null) {
      console.warn(
        `[settings] Stored value for "${key}" was rejected (${invalid}) and the default ` +
          `${JSON.stringify(spec.default)} is being used instead. Stored: ${JSON.stringify(raw)}. ` +
          'If this is an operations rule, the behaviour it governs has just reverted to its default.',
      )
      continue
    }
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
