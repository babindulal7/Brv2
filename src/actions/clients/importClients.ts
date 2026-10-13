import { createAction, type ActionConfig } from '../core'
import { saveRecord } from '../recordEditor'
import { supabase } from '../../lib/supabase'
import { findClientMatches } from '../../lib/queries/clients'
import { canImportClients } from '../../lib/clientImport'
import { recordFields, validateRecord, type RecordValues } from '../../lib/recordEditor'
import { EVENT_TYPES } from '../../events/eventBus'
import { PHONE_STORED_RE } from '../../lib/phone'

export interface ClientImportEntry { rowIndex: number; clientUuid: string; values: RecordValues }
export interface ClientImportOutcome {
  rowIndex: number; status: 'saved' | 'failed' | 'unconfirmed' | 'pending';
  clientId?: string; clientCode?: string; message?: string;
}
export interface ImportClientsInput {
  rows: readonly ClientImportEntry[];
  onProgress?: (outcomes: readonly ClientImportOutcome[]) => void;
  shouldStop?: () => boolean;
}
export interface ImportClientsResult { outcomes: ClientImportOutcome[] }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMEOUT_MS = 20_000
class ImportConfirmationTimeout extends Error {}

/** A timeout is uncertain: the server may have saved the row. Retry its original receipt key. */
async function confirmedWithin<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ImportConfirmationTimeout('Save confirmation timed out. Retry this import to check the same save; a second client will not be created.')), TIMEOUT_MS)
    })])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}

export const importClientsConfig: ActionConfig<ImportClientsInput, ImportClientsResult> = {
  name: 'IMPORT_CLIENTS', permissions: ['client.create'], implemented: true,
  validate(input) {
    if (!input.rows.length) throw new Error('Include at least one valid client row.')
    const keys = new Set<string>(), phones = new Set<string>(), emails = new Set<string>(), indices = new Set<number>()
    const fields = new Set(recordFields.client.map(f => f.key))
    for (const row of input.rows) {
      if (!Number.isInteger(row.rowIndex) || row.rowIndex < 0 || indices.has(row.rowIndex)) throw new Error('Every import row must have a unique row number.')
      if (!UUID.test(row.clientUuid) || keys.has(row.clientUuid)) throw new Error('Every import row must have its own save key.')
      indices.add(row.rowIndex); keys.add(row.clientUuid)
      if (Object.keys(row.values).some(key => !fields.has(key))) throw new Error('An import row contains an unsupported field.')
      const errors = validateRecord('client', row.values)
      if (!PHONE_STORED_RE.test(String(row.values.phone))) errors.phone = 'Use the confirmed +977 phone number from the preview.'
      const type = row.values.type_parent
      if (type != null && !['Organisation', 'Individual'].includes(String(type))) errors.type_parent = 'Client Type is not recognized.'
      if (type === 'Organisation' && !recordFields.client.find(f => f.key === 'org_subtype')?.options?.includes(String(row.values.org_subtype))) errors.org_subtype = 'Select an Organisation Type.'
      if (type !== 'Organisation' && row.values.org_subtype != null) errors.org_subtype = 'Only an Organisation can have an Organisation Type.'
      if (Object.keys(errors).length) throw new Error(`Row ${row.rowIndex + 1}: ${Object.values(errors).join(' ')}`)
      const phone = String(row.values.phone), email = String(row.values.email ?? '').toLowerCase()
      if (phones.has(phone) || (email && emails.has(email))) throw new Error('Repeated phone or email in the import. Include only one matching row.')
      phones.add(phone); if (email) emails.add(email)
    }
  },
  async execute(input, ctx) {
    if (!canImportClients(ctx.role)) throw new Error('Your role cannot import client contact records.')
    if (ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)) throw new Error('Connect to import clients. Your file and mappings are still here.')

    // Reconcile previous attempts before duplicate checking. No money is selected.
    const owned = new Set<string>()
    for (let offset = 0; offset < input.rows.length; offset += 100) {
      const { data, error } = await confirmedWithin(Promise.resolve(supabase.from('clients').select('id, client_uuid').in('client_uuid', input.rows.slice(offset, offset + 100).map(row => row.clientUuid))))
      if (error) throw new Error(`Previous saves could not be checked: ${error.message}`)
      for (const row of (data ?? []) as unknown as Array<{ id: string }>) owned.add(row.id)
    }
    const matches = await confirmedWithin(findClientMatches({
      phones: input.rows.map(row => String(row.values.phone)), emails: input.rows.map(row => String(row.values.email ?? '')),
    }))
    if (matches.some(match => !owned.has(match.dbId ?? match.id))) throw new Error('One or more rows match an existing client. Nothing new was saved. Review the duplicate and skip that row.')

    const outcomes: ClientImportOutcome[] = input.rows.map(row => ({ rowIndex: row.rowIndex, status: 'pending' }))
    const events: Array<{ type: string; payload: unknown }> = []
    for (let index = 0; index < input.rows.length; index++) {
      if (input.shouldStop?.()) break
      const row = input.rows[index]!
      try {
        const saved = await confirmedWithin(saveRecord({ kind: 'client', id: null, expectedRevision: null, clientUuid: row.clientUuid, values: row.values, rows: [] }, ctx))
        if (!saved.id || !saved.code || !saved.revision) throw new Error('Save confirmation was incomplete. Retry with the same save key.')
        outcomes[index] = { rowIndex: row.rowIndex, status: 'saved', clientId: saved.id, clientCode: saved.code }
        events.push({ type: EVENT_TYPES.CLIENT_CREATED, payload: { clientId: saved.id, clientCode: saved.code, userId: ctx.userId } })
      } catch (error: unknown) {
        outcomes[index] = {
          rowIndex: row.rowIndex, status: error instanceof ImportConfirmationTimeout ? 'unconfirmed' : 'failed',
          message: error instanceof Error ? error.message : 'This row could not be saved. Retry with the same save key.',
        }
        input.onProgress?.([...outcomes])
        break
      }
      input.onProgress?.([...outcomes])
    }
    return { result: { outcomes }, events }
  },
}
export const importClients = createAction(importClientsConfig)
