/**
 * Client Import Engine — Law 1: pages never implement business logic.
 *
 * Column mapping, per-row validation, enum normalization and duplicate
 * matching all live here so `ImportCenter.tsx` only renders what this module
 * decides. Nothing here writes to `CLIENTS_DATA` — no data layer exists yet
 * (Phase 1), so the page that calls `buildImportRow` simulates the commit
 * step exactly the way every other "New X" screen in this app already does.
 */
import { MEMBERSHIP_TIERS, normalizedPhone, type ClientRecord, type ClientType, type MembershipTier } from '../data/clients'

export type ImportTargetField =
  | 'skip'
  | 'name'
  | 'company'
  | 'phone'
  | 'email'
  | 'clientType'
  | 'membership'
  | 'address'
  | 'city'
  | 'pan'
  | 'businessRegistrationNo'
  | 'notes'

export interface ImportFieldDef {
  key: ImportTargetField
  label: string
  required?: boolean
}

export const IMPORT_TARGET_FIELDS: ImportFieldDef[] = [
  { key: 'skip', label: '— Skip this column —' },
  { key: 'name', label: 'Client / Company Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'clientType', label: 'Client Type' },
  { key: 'membership', label: 'Membership Tier' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'pan', label: 'PAN' },
  { key: 'businessRegistrationNo', label: 'Business Reg. No.' },
  { key: 'notes', label: 'Notes' },
]

const KNOWN_CLIENT_TYPES: ClientType[] = [
  'Company',
  'Individual',
  'Student',
  'Production Company',
  'Educational Institution',
  'Freelancer',
  'Government',
  'NGO',
  'Broadcaster',
]

/**
 * Guesses a target field from a CSV header string — a real convenience, not
 * a requirement: every guess is a normal dropdown selection the user can
 * override before anything is validated against it.
 */
export function guessTargetField(header: string): ImportTargetField {
  const h = header.trim().toLowerCase().replace(/[^a-z]+/g, '')
  const table: Array<[ImportTargetField, string[]]> = [
    ['name', ['name', 'clientname', 'companyname', 'client']],
    ['company', ['company', 'organization', 'organisation']],
    ['phone', ['phone', 'mobile', 'contactnumber', 'phonenumber']],
    ['email', ['email', 'emailaddress']],
    ['clientType', ['type', 'clienttype', 'category']],
    ['membership', ['membership', 'tier', 'membershiptier']],
    ['address', ['address']],
    ['city', ['city']],
    ['pan', ['pan', 'pannumber', 'vat']],
    ['businessRegistrationNo', ['regno', 'registrationno', 'businessregno', 'regnumber']],
    ['notes', ['notes', 'note', 'remarks']],
  ]
  for (const [field, aliases] of table) {
    if (aliases.includes(h)) return field
  }
  return 'skip'
}

/** Only the fields a CSV row can populate — the rest of `ClientRecord`
 *  (financials, booking history, KYC…) has no source in an import sheet and
 *  must come from real transactions, never be typed in. */
/*
 * `Pick` keeps each field exactly as required/optional as `ClientRecord`
 * declares it, but a CSV cell that comes back empty is built as
 * `field: cell(...) || undefined` — present-and-undefined, not absent. Under
 * exactOptionalPropertyTypes those are different types, so the five that can
 * legitimately be blank on a sheet (company, city, pan,
 * businessRegistrationNo, notes) are widened to accept it explicitly.
 */
export type ImportedClientFields = Pick<
  ClientRecord,
  'name' | 'phone' | 'email' | 'clientType' | 'membership' | 'address'
> & {
  company?: string | undefined
  city?: string | undefined
  pan?: string | undefined
  businessRegistrationNo?: string | undefined
  notes?: string | undefined
}

export interface ImportRowResult {
  rowIndex: number
  record: ImportedClientFields | null
  errors: string[]
  warnings: string[]
  duplicateOf: ClientRecord | null
  skip: boolean
}

function cell(raw: Record<ImportTargetField, string>, key: ImportTargetField): string {
  return (raw[key] ?? '').trim()
}

/**
 * Validates and normalizes one mapped CSV row. `existing` is checked for a
 * phone or email match — the same two fields `findDuplicateGroups` trusts
 * most, since PAN and name are frequently blank or inconsistently entered on
 * an import sheet.
 */
export function buildImportRow(raw: Record<ImportTargetField, string>, rowIndex: number, existing: ClientRecord[]): ImportRowResult {
  const errors: string[] = []
  const warnings: string[] = []

  const name = cell(raw, 'name')
  if (!name) errors.push('Client / Company Name is required.')

  const phone = cell(raw, 'phone')
  if (!phone) {
    errors.push('Phone is required.')
  } else if (!/^9\d{9}$/.test(phone.replace(/\D/g, ''))) {
    warnings.push('Phone does not look like a standard Nepal mobile number (98XXXXXXXX).')
  }

  const email = cell(raw, 'email')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    warnings.push('Email format looks invalid.')
  }

  let clientType: ClientType = 'Company'
  const rawType = cell(raw, 'clientType')
  if (rawType) {
    const match = KNOWN_CLIENT_TYPES.find((t) => t.toLowerCase() === rawType.toLowerCase())
    if (match) clientType = match
    else warnings.push(`Client Type "${rawType}" not recognized — defaulted to Company.`)
  }

  let membership: MembershipTier = 'Creator'
  const rawMembership = cell(raw, 'membership')
  if (rawMembership) {
    const match = MEMBERSHIP_TIERS.find((t) => t.toLowerCase() === rawMembership.toLowerCase())
    if (match) membership = match
    else warnings.push(`Membership Tier "${rawMembership}" not recognized — defaulted to Creator.`)
  }

  const phoneKey = phone ? normalizedPhone(phone) : ''
  const emailKey = email.toLowerCase()
  const duplicateOf =
    existing.find((c) => phoneKey.length >= 7 && normalizedPhone(c.phone) === phoneKey) ??
    existing.find((c) => emailKey.length > 0 && c.email.trim().toLowerCase() === emailKey) ??
    null

  const record =
    errors.length === 0
      ? {
          name,
          phone,
          email,
          clientType,
          membership,
          company: cell(raw, 'company') || undefined,
          address: cell(raw, 'address'),
          city: cell(raw, 'city') || undefined,
          pan: cell(raw, 'pan') || undefined,
          businessRegistrationNo: cell(raw, 'businessRegistrationNo') || undefined,
          notes: cell(raw, 'notes') || undefined,
        }
      : null

  return { rowIndex, record, errors, warnings, duplicateOf, skip: false }
}

export const IMPORT_SAMPLE_HEADERS: ImportTargetField[] = [
  'name',
  'phone',
  'email',
  'company',
  'clientType',
  'membership',
  'address',
  'city',
  'pan',
]

export const IMPORT_SAMPLE_ROW = [
  'Everest Vision Media',
  '9801112233',
  'contact@everestvision.com.np',
  'Everest Vision Pvt. Ltd.',
  'Company',
  'Creator',
  'Baneshwor, Kathmandu',
  'Kathmandu',
  '600111222',
]
