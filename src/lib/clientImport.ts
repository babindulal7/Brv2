/** CSV client validation and mapping. Pages collect input; this engine decides what can be saved. */
import { normalizedPhone, type ClientRecord, type ClientType } from '../data/clients'
import { PHONE_REJECTION, canonicalPhone, isValidLocalPhone } from './phone'
import { recordDefaults, recordFields, recordPayload, validateRecord, type RecordValues } from './recordEditor'
import { canCreateClient } from './rbac'
import type { SystemRole } from '../types/database'

export type ImportTargetField = 'skip' | 'name' | 'company' | 'phone' | 'email' | 'clientType' | 'orgSubtype' | 'membership' | 'address' | 'city' | 'pan' | 'businessRegistrationNo' | 'notes'
export interface ImportFieldDef { key: ImportTargetField; label: string; required?: boolean }
export const IMPORT_TARGET_FIELDS: ImportFieldDef[] = [
  { key: 'skip', label: '— Skip this column —' },
  { key: 'name', label: 'Client / Company Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'email', label: 'Email' }, { key: 'clientType', label: 'Client Type' },
  { key: 'orgSubtype', label: 'Organisation Type' }, { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' }, { key: 'pan', label: 'PAN' },
  { key: 'businessRegistrationNo', label: 'Business Reg. No.' }, { key: 'notes', label: 'Notes' },
  // Recognized legacy mappings stay visible so populated fields cannot silently disappear.
  { key: 'company', label: 'Separate Company — map to Name or skip' },
  { key: 'membership', label: 'Membership — use Membership after import' },
]
/** RULING 2026-10-13: CSV imports require client creation and full contact access (§4.5).
 * Warehouse keeps walk-in intake; Accounts keeps contact reads without client creation. */
export function canImportClients(role: SystemRole): boolean {
  return canCreateClient(role) && role !== 'Warehouse'
}
export function guessTargetField(header: string): ImportTargetField {
  const h = header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z]+/g, '')
  const aliases: Array<[ImportTargetField, string[]]> = [
    ['name', ['name', 'clientname', 'companyname', 'client']],
    ['company', ['company', 'organization', 'organisation']],
    ['phone', ['phone', 'mobile', 'contactnumber', 'phonenumber']],
    ['email', ['email', 'emailaddress']], ['clientType', ['type', 'clienttype', 'category']],
    ['orgSubtype', ['orgsubtype', 'organisationtype', 'organizationtype']],
    ['membership', ['membership', 'tier', 'membershiptier']],
    ['address', ['address', 'addressline']], ['city', ['city']], ['pan', ['pan', 'pannumber', 'vat', 'panvat']],
    ['businessRegistrationNo', ['regno', 'registrationno', 'businessregno', 'regnumber', 'businessregistration']],
    ['notes', ['notes', 'note', 'remarks']],
  ]
  return aliases.find(([, names]) => names.includes(h))?.[0] ?? 'skip'
}
export interface ImportedClientFields {
  name: string; phone: string; email: string; clientType: ClientType; orgSubtype: string;
  address: string; city?: string | undefined; pan?: string | undefined;
  businessRegistrationNo?: string | undefined; notes?: string | undefined;
}
export interface ImportRowResult {
  rowIndex: number; record: ImportedClientFields | null; errors: string[]; warnings: string[];
  duplicateOf: ClientRecord | null; skip: boolean;
}
function cell(raw: Partial<Record<ImportTargetField, string>>, key: ImportTargetField): string { return (raw[key] ?? '').trim() }

export function buildImportRow(raw: Partial<Record<ImportTargetField, string>>, rowIndex: number, existing: ClientRecord[]): ImportRowResult {
  const errors: string[] = []
  const name = cell(raw, 'name'), phone = cell(raw, 'phone'), email = cell(raw, 'email')
  if (!name) errors.push('Client / Company Name is required.')
  if (!phone) errors.push('Phone is required.')
  else if (!isValidLocalPhone(phone)) errors.push(PHONE_REJECTION)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Enter a valid email address.')
  const knownTypes: ClientType[] = ['Organisation', 'Individual', 'Unassigned']
  const rawType = cell(raw, 'clientType')
  const clientType = rawType ? knownTypes.find(t => t.toLowerCase() === rawType.toLowerCase()) : 'Organisation'
  if (!clientType) errors.push('Client Type "' + rawType + '" is not recognized. Use Organisation, Individual or Unassigned.')
  const rawSubtype = cell(raw, 'orgSubtype')
  const subtypeOptions = recordFields.client.find(f => f.key === 'org_subtype')?.options ?? []
  const orgSubtype = rawSubtype
    ? subtypeOptions.find(t => t.toLowerCase() === rawSubtype.toLowerCase())
    : clientType === 'Organisation' ? String(recordDefaults.client.org_subtype) : ''
  if (rawSubtype && !orgSubtype) errors.push('Organisation Type "' + rawSubtype + '" is not recognized.')
  if (rawSubtype && clientType !== 'Organisation') errors.push('Only an Organisation can have an Organisation Type.')
  const pan = cell(raw, 'pan')
  if (pan && !/^\d{9}$/.test(pan)) errors.push('PAN/VAT must be exactly nine digits.')
  if (cell(raw, 'membership')) errors.push('Membership is not imported. Skip this column and use Membership after import.')
  if (cell(raw, 'company')) errors.push('A separate company field is not supported. Map this column to Name, or explicitly skip it.')
  const phoneKey = phone ? normalizedPhone(phone) : ''
  const duplicateOf = existing.find(c => phoneKey.length >= 7 && normalizedPhone(c.phone) === phoneKey)
    ?? existing.find(c => email.length > 0 && c.email.trim().toLowerCase() === email.toLowerCase()) ?? null
  const record: ImportedClientFields | null = errors.length === 0 && clientType ? {
    name, phone: canonicalPhone(phone), email, clientType, orgSubtype: orgSubtype ?? '',
    address: cell(raw, 'address'), city: cell(raw, 'city') || undefined, pan: pan || undefined,
    businessRegistrationNo: cell(raw, 'businessRegistrationNo') || undefined, notes: cell(raw, 'notes') || undefined,
  } : null
  return { rowIndex, record, errors, warnings: [], duplicateOf, skip: false }
}

/** Multiple columns cannot overwrite one target. Empty columns remain in the mapper. */
export function importMappingErrors(headers: readonly string[], mapping: Readonly<Record<number, ImportTargetField>>): string[] {
  const groups = new Map<ImportTargetField, number[]>()
  headers.forEach((_, index) => {
    const target = mapping[index]
    if (!target || target === 'skip') return
    groups.set(target, [...(groups.get(target) ?? []), index + 1])
  })
  return [...groups].filter(([, indices]) => indices.length > 1).map(([target, indices]) =>
    'Columns ' + indices.join(', ') + ' map to ' + (IMPORT_TARGET_FIELDS.find(f => f.key === target)?.label ?? target) + '. Choose one column; no values will be overwritten.')
}
/** Duplicate rows are marked together; deselecting one resolves the collision without losing it. */
export function buildImportPreview(dataRows: readonly string[][], mapping: Readonly<Record<number, ImportTargetField>>, existing: ClientRecord[], skipped: ReadonlySet<number>): ImportRowResult[] {
  const rows = dataRows.map((row, rowIndex) => {
    const raw: Partial<Record<ImportTargetField, string>> = {}
    row.forEach((value, index) => { const target = mapping[index]; if (target && target !== 'skip') raw[target] = value })
    return { ...buildImportRow(raw, rowIndex, existing), skip: skipped.has(rowIndex) }
  })
  for (const key of ['phone', 'email'] as const) {
    const groups = new Map<string, ImportRowResult[]>()
    for (const row of rows) {
      if (row.skip || !row.record) continue
      const value = row.record[key].toLowerCase()
      if (value) groups.set(value, [...(groups.get(value) ?? []), row])
    }
    for (const matches of groups.values()) {
      if (matches.length < 2) continue
      const message = 'Repeated ' + key + ' in rows ' + matches.map(r => r.rowIndex + 1).join(', ') + '. Include only one of these rows.'
      matches.forEach(row => row.errors.push(message))
    }
  }
  return rows
}
export function importClientValues(record: ImportedClientFields): RecordValues {
  const values: RecordValues = {
    ...recordDefaults.client, name: record.name, phone: record.phone, email: record.email,
    type_parent: record.clientType === 'Unassigned' ? null : record.clientType,
    org_subtype: record.clientType === 'Organisation' ? record.orgSubtype : null,
    address_line: record.address, city: record.city ?? '', pan_vat: record.pan ?? '',
    business_registration: record.businessRegistrationNo ?? '', notes: record.notes ?? '',
  }
  const errors = validateRecord('client', values)
  if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '))
  return recordPayload('client', values, false)
}
export const IMPORT_SAMPLE_HEADERS: ImportTargetField[] = ['name', 'phone', 'email', 'clientType', 'orgSubtype', 'address', 'city', 'pan']
export const IMPORT_SAMPLE_ROW = ['Everest Vision Media', '9801112233', 'contact@everestvision.com.np', 'Organisation', 'Production House', 'Baneshwor, Kathmandu', 'Kathmandu', '600111222']
