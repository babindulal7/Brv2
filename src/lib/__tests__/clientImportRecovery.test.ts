import { describe, expect, it, vi } from 'vitest'
import { buildImportPreview, importClientValues } from '../clientImport'
import { discardClientImportRecovery, loadClientImportRecovery, saveClientImportRecovery, type ClientImportRecoveryDraft } from '../clientImportRecovery'

function store() {
  const entries = new Map<string, string>()
  return { getItem: vi.fn((key: string) => entries.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { entries.set(key, value) }), removeItem: vi.fn((key: string) => { entries.delete(key) }) }
}
function draft(): ClientImportRecoveryDraft {
  const rawRows = [['Name', 'Phone'], ['First', '9801234560'], ['Second', '9801234561'], ['Third', '9801234562'], ['Fourth', '9801234563'], ['Skipped', '9801234564']]
  const mapping = { 0: 'name', 1: 'phone' } as const
  const rows = buildImportPreview(rawRows.slice(1), mapping, [], new Set([4]))
  return { fileName: 'clients.csv', rawRows, hasHeaderRow: true, mapping, skippedRows: [4], batch: rows.slice(0, 4).map(row => ({ rowIndex: row.rowIndex, clientUuid: `00000000-0000-4000-8000-00000000000${row.rowIndex}`, values: importClientValues(row.record!) })), outcomes: [
    { rowIndex: 0, status: 'saved', clientId: 'client-id', clientCode: 'C-1' },
    { rowIndex: 1, status: 'failed', message: 'Refused' }, { rowIndex: 2, status: 'unconfirmed', message: 'Timed out' }, { rowIndex: 3, status: 'pending' },
  ] }
}

describe('unfinished client import recovery', () => {
  it('restores mappings, excluded rows, immutable requests and every outcome on a new read', () => {
    const storage = store(), original = draft()
    expect(saveClientImportRecovery('actor', original, storage).ok).toBe(true)
    expect(loadClientImportRecovery('actor', storage)).toEqual({ draft: original, error: null })
    original.batch![0]!.values.name = 'Changed after write'
    expect(loadClientImportRecovery('actor', storage).draft?.batch?.[0]?.values.name).toBe('First')
  })
  it('does not write repeatedly for unchanged progress and retains only one active draft', () => {
    const storage = store()
    saveClientImportRecovery('actor', draft(), storage)
    saveClientImportRecovery('actor', draft(), storage)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    saveClientImportRecovery('other', { ...draft(), fileName: 'other.csv' }, storage)
    expect(storage.setItem.mock.calls[0]?.[0]).toBe(storage.setItem.mock.calls[1]?.[0])
  })
  it('purges contact data without exposing it to another actor or signed-out session', () => {
    const storage = store()
    saveClientImportRecovery('actor', draft(), storage)
    expect(loadClientImportRecovery('other', storage)).toEqual({ draft: null, error: null })
    expect(loadClientImportRecovery('actor', storage).draft).toBeNull()
    saveClientImportRecovery('actor', draft(), storage)
    expect(loadClientImportRecovery('', storage).draft).toBeNull()
  })
  it.each(['duplicate-key', 'modified-payload', 'invalid-outcome', 'skipped-save', 'invalid-mapping'])('rejects %s before overwriting a recoverable request', reason => {
    const storage = store(), value = draft()
    saveClientImportRecovery('actor', value, storage)
    if (reason === 'duplicate-key') value.batch![1]!.clientUuid = value.batch![0]!.clientUuid
    if (reason === 'modified-payload') value.batch![0]!.values.phone = '+9779801234599'
    if (reason === 'invalid-outcome') value.outcomes[0]!.clientId = ''
    if (reason === 'skipped-save') value.skippedRows.push(0)
    if (reason === 'invalid-mapping') value.mapping[99] = 'name'
    expect(saveClientImportRecovery('actor', value, storage).ok).toBe(false)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })
  it('discards invalid persisted data and reports recovery failures inline', () => {
    const storage = store()
    saveClientImportRecovery('actor', draft(), storage)
    const [key, encoded] = storage.setItem.mock.calls[0]!
    const value = JSON.parse(encoded)
    value.draft.batch[0].values.name = 'Injected'
    storage.setItem(key, JSON.stringify(value))
    expect(loadClientImportRecovery('actor', storage)).toEqual({ draft: null, error: expect.stringContaining('invalid') })
    storage.setItem(key, '{')
    expect(loadClientImportRecovery('actor', storage).error).toContain('could not be read')
  })
  it('reports quota or unavailable browser storage instead of claiming recovery succeeded', () => {
    const storage = store()
    storage.setItem.mockImplementation(() => { throw new Error('quota') })
    expect(saveClientImportRecovery('actor', draft(), storage)).toEqual({ ok: false, error: expect.stringContaining('could not preserve') })
    storage.getItem.mockImplementation(() => { throw new Error('blocked') })
    expect(loadClientImportRecovery('actor', storage).error).toContain('could not preserve')
  })
  it('explicit discard removes the draft while ordinary reads keep it', () => {
    const storage = store()
    saveClientImportRecovery('actor', draft(), storage)
    loadClientImportRecovery('actor', storage)
    expect(discardClientImportRecovery('actor', storage).ok).toBe(true)
    expect(loadClientImportRecovery('actor', storage).draft).toBeNull()
  })
  it('restores a pre-save preview without minting receipt keys', () => {
    const storage = store(), preview = { ...draft(), batch: null, outcomes: [] }
    expect(saveClientImportRecovery('actor', preview, storage).ok).toBe(true)
    expect(loadClientImportRecovery('actor', storage).draft?.batch).toBeNull()
  })
})
