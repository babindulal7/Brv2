import { describe, it, expect } from 'vitest'
import {
  PHONE_LOCAL_RE,
  PHONE_STORED_RE,
  canonicalPhone,
  isValidLocalPhone,
  phoneLocalDigits,
} from '../phone'
import { buildImportRow, type ImportTargetField } from '../clientImport'

/**
 * The rule under test is the database's, not this module's —
 * `supabase/migrations/0005_clients.sql:91`:
 *
 *     constraint clients_phone_format check (phone ~ '^\+977(97|98)[0-9]{8}$')
 *
 * Every screen that accepts a phone number used to answer this question for
 * itself, and two of the three answers were `/^9\d{9}$/` — which accepts 96, 95
 * and 90 numbers the database refuses. The point of these cases is that the
 * accepted set and the CHECK's set are the same set.
 */

/** 10-digit numbers starting 9 that the old, looser rule let through. */
const ACCEPTED_BY_THE_OLD_RULE = ['9601234567', '9501234567', '9901234567', '9001234567', '9111111111']

const VALID = ['9801234567', '9741234567', '9700000000', '9899999999']

const MALFORMED = [
  '0981234567', // leading zero
  '981234567', // nine digits
  '98012345678', // eleven digits
  '014412345', // landline
  '',
  '   ',
  'not a phone',
  '98O1234567', // letter O for zero
  '+9199812345670', // a foreign number
]

describe('phone — the accepted set is exactly what the CHECK accepts', () => {
  it.each(VALID)('accepts %s', (good) => {
    expect(isValidLocalPhone(good)).toBe(true)
    expect(canonicalPhone(good)).toMatch(PHONE_STORED_RE)
  })

  it.each(ACCEPTED_BY_THE_OLD_RULE)('rejects %s — legal under /^9\\d{9}$/, illegal in the database', (bad) => {
    expect(/^9\d{9}$/.test(bad)).toBe(true) // the old rule would have taken it
    expect(isValidLocalPhone(bad)).toBe(false)
  })

  it.each(MALFORMED)('rejects %j', (bad) => {
    expect(isValidLocalPhone(bad)).toBe(false)
  })

  it('never produces a stored value the CHECK would refuse', () => {
    for (const good of VALID) {
      expect(PHONE_STORED_RE.test(canonicalPhone(good))).toBe(true)
    }
  })
})

describe('phone — normalisation strips formatting and nothing else', () => {
  it.each([
    ['980 123 4567', '9801234567'],
    ['980-123-4567', '9801234567'],
    ['(980) 123.4567', '9801234567'],
    ['+9779801234567', '9801234567'],
    ['9779801234567', '9801234567'],
    ['+977 980-123 4567', '9801234567'],
  ])('%s → %s', (raw, expected) => {
    expect(phoneLocalDigits(raw)).toBe(expected)
    expect(canonicalPhone(raw)).toBe(`+977${expected}`)
  })

  it('does not invent digits: a leading 0 is not stripped into a valid number', () => {
    // The tempting "fix" is to drop the 0 and accept it. That dials a different
    // person — 0981234567 minus the 0 is 981234567, nine digits, still invalid;
    // reshaping it to 9801234567 would be inventing a number outright.
    expect(phoneLocalDigits('0981234567')).toBe('0981234567')
    expect(isValidLocalPhone('0981234567')).toBe(false)
  })

  it('does not treat a 977 that is part of the number as a country code twice over', () => {
    // 9779801234567 is the country code plus a local number; stripping once is
    // correct and stripping twice would corrupt it.
    expect(phoneLocalDigits('9779801234567')).toBe('9801234567')
    expect(phoneLocalDigits('9779779801234567')).toBe('9779801234567')
    expect(isValidLocalPhone('9779779801234567')).toBe(false)
  })

  it('PHONE_LOCAL_RE and PHONE_STORED_RE describe the same numbers', () => {
    for (const n of [...VALID, ...ACCEPTED_BY_THE_OLD_RULE, ...MALFORMED]) {
      const local = phoneLocalDigits(n)
      expect(PHONE_STORED_RE.test(`+977${local}`)).toBe(PHONE_LOCAL_RE.test(local))
    }
  })
})

/* ── the CSV path ────────────────────────────────────────────────────────
 * `buildImportRow` is the third client-creating surface. It validated with the
 * same loose rule AND stored the raw cell, so even a perfect 9801234567 came
 * out as a value no insert could accept. `ImportCenter` imports every row that
 * carries only warnings, so a warning was not enough to stop it. */

function row(fields: Partial<Record<ImportTargetField, string>>): Record<ImportTargetField, string> {
  return { name: 'Everest Vision Media', address: 'Baneshwor', ...fields } as Record<ImportTargetField, string>
}

describe('clientImport — a row can only be imported if the database would take it', () => {
  it('stores the phone with the +977 the CHECK requires', () => {
    const r = buildImportRow(row({ phone: '9801234567' }), 0, [])
    expect(r.errors).toEqual([])
    expect(r.record?.phone).toBe('+9779801234567')
    expect(r.record?.phone).toMatch(PHONE_STORED_RE)
  })

  it.each(ACCEPTED_BY_THE_OLD_RULE)('blocks %s as an error, not a warning', (bad) => {
    const r = buildImportRow(row({ phone: bad }), 0, [])
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors[0]).toContain('97 or 98')
    // `record === null` is what keeps it out of ImportCenter's `readyRows`.
    expect(r.record).toBeNull()
  })

  it('accepts a formatted cell and canonicalises it', () => {
    const r = buildImportRow(row({ phone: '+977 980-123 4567' }), 0, [])
    expect(r.errors).toEqual([])
    expect(r.record?.phone).toBe('+9779801234567')
  })

  it('still reports a missing phone as required', () => {
    const r = buildImportRow(row({ phone: '' }), 0, [])
    expect(r.errors).toContain('Phone is required.')
    expect(r.record).toBeNull()
  })

  it('the shipped sample row passes its own importer', () => {
    const r = buildImportRow(row({ phone: '9801112233' }), 0, [])
    expect(r.errors).toEqual([])
    expect(r.record?.phone).toMatch(PHONE_STORED_RE)
  })
})
