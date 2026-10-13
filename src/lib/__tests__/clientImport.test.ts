import { describe, expect, it } from 'vitest'
import { buildImportPreview, buildImportRow, canImportClients, importClientValues, importMappingErrors, IMPORT_SAMPLE_HEADERS, IMPORT_SAMPLE_ROW, type ImportTargetField } from '../clientImport'
import type { SystemRole } from '../../types/database'

const row = (extra: Partial<Record<ImportTargetField, string>> = {}) => ({ name: 'Client One', phone: '9801234567', ...extra })

describe('client CSV import validation', () => {
  it('the sample maps to supported fields and produces a database payload', () => {
    const mapping = Object.fromEntries(IMPORT_SAMPLE_HEADERS.map((field, index) => [index, field]))
    const result = buildImportPreview([IMPORT_SAMPLE_ROW], mapping, [], new Set())[0]!
    expect(result.errors).toEqual([])
    expect(importClientValues(result.record!)).toMatchObject({ name: 'Everest Vision Media', phone: '+9779801112233', type_parent: 'Organisation', org_subtype: 'Production House', pan_vat: '600111222' })
    expect(importClientValues(result.record!)).not.toHaveProperty('membership')
  })
  it.each([
    { clientType: 'Company' }, { orgSubtype: 'Unknown' }, { email: 'broken' }, { pan: '12' },
    { membership: 'Creator' }, { company: 'Other name' }, { clientType: 'Individual', orgSubtype: 'Production House' },
  ])('blocks invalid or unsupported fields: %j', extra => {
    const result = buildImportRow(row(extra), 0, [])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.record).toBeNull()
  })
  it('does not overwrite a target when two columns map to it', () => {
    expect(importMappingErrors(['Name', 'Name', 'Phone'], { 0: 'name', 1: 'name', 2: 'phone' })).toEqual([expect.stringContaining('Columns 1, 2')])
    expect(importMappingErrors(['Name', '', 'Phone'], { 0: 'name', 1: 'skip', 2: 'phone' })).toEqual([])
  })
  it('flags both repeated phones; deselecting one resolves the collision', () => {
    const data = [['One', '9801234567'], ['Two', '+9779801234567']]
    const mapping = { 0: 'name', 1: 'phone' } as const
    const all = buildImportPreview(data, mapping, [], new Set())
    expect(all.every(r => r.errors.some(e => e.includes('Repeated phone')))).toBe(true)
    const chosen = buildImportPreview(data, mapping, [], new Set([1]))
    expect(chosen[0]!.errors).toEqual([])
    expect(chosen[1]!.skip).toBe(true)
  })
  it('does not collapse distinct clients with the same name', () => {
    const rows = buildImportPreview([['Same', '9801234567'], ['Same', '9807654321']], { 0: 'name', 1: 'phone' }, [], new Set())
    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.errors.length === 0)).toBe(true)
  })
  it('flags repeated emails without changing their values', () => {
    const rows = buildImportPreview([['One', '9801234567', 'a@example.com'], ['Two', '9807654321', 'A@example.com']], { 0: 'name', 1: 'phone', 2: 'email' }, [], new Set())
    expect(rows.every(r => r.errors.some(e => e.includes('Repeated email')))).toBe(true)
  })
  it('preserves explicitly Unassigned clients without assigning an organisation subtype', () => {
    const result = buildImportRow(row({ clientType: 'Unassigned' }), 0, [])
    expect(importClientValues(result.record!)).toMatchObject({ type_parent: null, org_subtype: null })
  })
  it.each(['Owner', 'Admin', 'Manager', 'Coordinator'] as SystemRole[])('allows %s import', role => expect(canImportClients(role)).toBe(true))
  it.each(['Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'] as SystemRole[])('refuses %s import', role => expect(canImportClients(role)).toBe(false))
})
