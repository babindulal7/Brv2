import { IMPORT_TARGET_FIELDS, buildImportPreview, importClientValues, type ImportTargetField } from './clientImport'
import type { ClientImportEntry, ClientImportOutcome } from '../actions/clients/importClients'

export interface ClientImportRecoveryDraft {
  fileName: string
  rawRows: string[][]
  hasHeaderRow: boolean
  mapping: Record<number, ImportTargetField>
  skippedRows: number[]
  batch: ClientImportEntry[] | null
  outcomes: ClientImportOutcome[]
}
export interface ClientImportRecoveryResult { ok: boolean; error: string | null }
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const KEY = 'babin.clientImportRecovery.v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const same = (left: unknown, right: unknown): boolean => {
  if (!object(left) || !object(right)) return left === right
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key])
}
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key))

/** Stored outcomes are progress hints only. Replay every immutable batch key through the server on resume. */
function validDraft(value: unknown): value is ClientImportRecoveryDraft {
  if (!object(value) || !exactKeys(value, ['fileName', 'rawRows', 'hasHeaderRow', 'mapping', 'skippedRows', 'batch', 'outcomes'])) return false
  if (typeof value.fileName !== 'string' || !value.fileName || typeof value.hasHeaderRow !== 'boolean') return false
  if (!Array.isArray(value.rawRows) || !value.rawRows.length || !value.rawRows.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string'))) return false
  const rawRows = value.rawRows as string[][]
  const dataRows = value.hasHeaderRow ? rawRows.slice(1) : rawRows
  const columns = rawRows[0]?.length ?? 0
  if (!object(value.mapping) || !Object.entries(value.mapping).every(([index, target]) => /^(0|[1-9]\d*)$/.test(index) && Number(index) < columns && IMPORT_TARGET_FIELDS.some(field => field.key === target))) return false
  const validIndex = (index: unknown): index is number => typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < dataRows.length
  if (!Array.isArray(value.skippedRows) || !value.skippedRows.every(validIndex) || new Set(value.skippedRows).size !== value.skippedRows.length) return false
  if (!Array.isArray(value.outcomes) || (value.batch !== null && !Array.isArray(value.batch))) return false
  if (value.batch === null) return value.outcomes.length === 0
  if (!value.batch.length) return false
  const preview = buildImportPreview(dataRows, value.mapping as Record<number, ImportTargetField>, [], new Set(value.skippedRows))
  const keys = new Set<string>(), indices = new Set<number>()
  for (const row of value.batch) {
    if (!object(row) || !exactKeys(row, ['rowIndex', 'clientUuid', 'values']) || !validIndex(row.rowIndex) || typeof row.clientUuid !== 'string' || !UUID.test(row.clientUuid) || indices.has(row.rowIndex) || keys.has(row.clientUuid)) return false
    const source = preview[row.rowIndex]
    if (!source?.record || source.skip || source.errors.length || !same(row.values, importClientValues(source.record))) return false
    keys.add(row.clientUuid); indices.add(row.rowIndex)
  }
  const outcomes = new Set<number>()
  for (const row of value.outcomes) {
    if (!object(row) || !exactKeys(row, ['rowIndex', 'status', 'clientId', 'clientCode', 'message']) || !validIndex(row.rowIndex) || !indices.has(row.rowIndex) || outcomes.has(row.rowIndex) || !['saved', 'failed', 'unconfirmed', 'pending'].includes(String(row.status))) return false
    if (['clientId', 'clientCode', 'message'].some(key => row[key] !== undefined && typeof row[key] !== 'string')) return false
    if (row.status === 'saved' && (!row.clientId || !row.clientCode)) return false
    outcomes.add(row.rowIndex)
  }
  return true
}

function storageOrBrowser(storage?: RecoveryStorage): RecoveryStorage { return storage ?? window.localStorage }
const failure = (): ClientImportRecoveryResult => ({ ok: false, error: 'This browser could not preserve the unfinished import. Keep this page open and retry recovery before saving.' })

/** One active draft bounds storage; unchanged state produces no storage write. No retention policy is invented. */
export function saveClientImportRecovery(actorId: string, draft: ClientImportRecoveryDraft, storage?: RecoveryStorage): ClientImportRecoveryResult {
  if (!actorId || !validDraft(draft)) return { ok: false, error: 'The import recovery data is invalid. Review the file before saving.' }
  try {
    const target = storageOrBrowser(storage)
    const encoded = JSON.stringify({ version: 1, actorId, draft })
    if (target.getItem(KEY) !== encoded) target.setItem(KEY, encoded)
    return { ok: true, error: null }
  } catch { return failure() }
}

export function discardClientImportRecovery(_actorId: string, storage?: RecoveryStorage): ClientImportRecoveryResult {
  try { storageOrBrowser(storage).removeItem(KEY); return { ok: true, error: null } } catch { return failure() }
}

export function loadClientImportRecovery(actorId: string, storage?: RecoveryStorage): { draft: ClientImportRecoveryDraft | null; error: string | null } {
  try {
    const target = storageOrBrowser(storage), encoded = target.getItem(KEY)
    if (!encoded) return { draft: null, error: null }
    let stored: unknown
    try { stored = JSON.parse(encoded) } catch { target.removeItem(KEY); return { draft: null, error: 'The unfinished import could not be read. Choose the CSV file again.' } }
    // Different actors never see names, contacts, filenames or row outcomes from the previous session.
    if (!actorId || !object(stored) || stored.actorId !== actorId) { target.removeItem(KEY); return { draft: null, error: null } }
    if (stored.version !== 1 || !exactKeys(stored, ['version', 'actorId', 'draft']) || !validDraft(stored.draft)) {
      target.removeItem(KEY)
      return { draft: null, error: 'The unfinished import is invalid. Choose the CSV file again.' }
    }
    return { draft: stored.draft, error: null }
  } catch { return { draft: null, error: failure().error } }
}
