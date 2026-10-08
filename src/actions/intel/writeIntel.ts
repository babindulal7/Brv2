import { createAction, type ActionConfig, type ActionContext } from '../core'
import { idempotentInsert } from '../../lib/dataAccess'
import type { IntelEntityType } from '../../lib/intel/context'
import type { IntelFieldClass, IntelNoteVisibility } from '../../lib/queries/intelExtras'

const MANAGEMENT = ['Owner', 'Admin', 'Manager'] as const
const FULL_FINANCE = ['Owner', 'Admin', 'Manager', 'Accounts'] as const
const PERSONAL = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'] as const

function requireOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('This device is offline. Nothing was queued or saved.')
  }
}

function requireKey(clientUuid: string): void {
  if (!clientUuid) throw new Error('An idempotency key is required.')
}

async function insertConfirmed(table: string, payload: Record<string, unknown>): Promise<string> {
  const inserted = await idempotentInsert(table as never, payload as never, { queueOnFailure: false, returningColumns: 'id' })
  if (inserted.error) throw new Error(`The database refused this write: ${inserted.error.message}`)
  const row = inserted.data as { id?: unknown } | null
  if (!row || typeof row.id !== 'string') throw new Error('The write was not confirmed by the database.')
  return row.id
}

export interface AddIntelEntityNoteInput {
  entityType: 'client' | 'equipment'
  entityId: string
  body: string
  visibility: IntelNoteVisibility
  clientUuid: string
}

function noteConfig(name: string, permissions: string[], entityType: AddIntelEntityNoteInput['entityType']): ActionConfig<AddIntelEntityNoteInput, { id: string }> {
  return {
    name,
    permissions,
    implemented: true,
    validate: (input) => {
      if (input.entityType !== entityType || !input.entityId || !input.body.trim()) throw new Error('Choose a record and write a note.')
      if (!['all_staff', 'operations', 'management'].includes(input.visibility)) throw new Error('Choose note visibility.')
      requireKey(input.clientUuid)
    },
    execute: async (input, ctx: ActionContext) => {
      requireOnline()
      if (input.visibility === 'management' && !MANAGEMENT.includes(ctx.role as typeof MANAGEMENT[number])) {
        throw new Error('Management notes require Owner, Admin, or Manager access.')
      }
      const id = await insertConfirmed('intel_entity_notes', {
        client_uuid: input.clientUuid,
        entity_type: entityType,
        ...(entityType === 'client' ? { client_id: input.entityId } : { product_id: input.entityId }),
        body: input.body.trim(),
        visibility: input.visibility,
        created_by: ctx.userId,
      })
      return { result: { id }, events: [] }
    },
  }
}

export const addClientIntelNote = createAction(noteConfig('ADD_CLIENT_INTEL_NOTE', ['note.create'], 'client'))
export const addEquipmentIntelNote = createAction(noteConfig('ADD_EQUIPMENT_INTEL_NOTE', ['inventory.create'], 'equipment'))

export interface ConfigureIntelFieldInput {
  entityType: Exclude<IntelEntityType, 'document'>
  fieldKey: string
  label: string
  classification: IntelFieldClass
  highPriority: boolean
  clientUuid: string
}

export const configureIntelField = createAction<ConfigureIntelFieldInput, { id: string }>({
  name: 'CONFIGURE_INTEL_FIELD',
  permissions: ['inventory.create'], // Same Owner/Admin/Manager set as the schema's definition policy.
  implemented: true,
  validate: (input) => {
    if (!['client', 'equipment', 'rental'].includes(input.entityType)) throw new Error('Choose a supported entity.')
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(input.fieldKey)) throw new Error('Use a lowercase field key.')
    if (!input.label.trim() || input.label.length > 80) throw new Error('Use a label up to 80 characters.')
    if (!['operational', 'personal', 'financial'].includes(input.classification)) throw new Error('Choose a field classification.')
    requireKey(input.clientUuid)
  },
  execute: async (input, ctx) => {
    requireOnline()
    const id = await insertConfirmed('intel_field_definitions', {
      client_uuid: input.clientUuid,
      entity_type: input.entityType,
      field_key: input.fieldKey,
      label: input.label.trim(),
      classification: input.classification,
      high_priority: input.highPriority,
      created_by: ctx.userId,
    })
    return { result: { id }, events: [] }
  },
})

export interface SetIntelFieldValueInput {
  entityType: Exclude<IntelEntityType, 'document'>
  entityId: string
  definitionId: string
  classification: IntelFieldClass
  value: string | null
  clientUuid: string
}

function valueConfig(name: string, permissions: string[], entityType: SetIntelFieldValueInput['entityType']): ActionConfig<SetIntelFieldValueInput, { id: string }> {
  return {
    name,
    permissions,
    implemented: true,
    validate: (input) => {
      if (input.entityType !== entityType || !input.entityId || !input.definitionId) throw new Error('Choose a field and record.')
      if (input.value !== null && input.value.length > 2000) throw new Error('Field values are limited to 2000 characters.')
      requireKey(input.clientUuid)
    },
    execute: async (input, ctx) => {
      requireOnline()
      if (input.classification === 'financial' && !FULL_FINANCE.includes(ctx.role as typeof FULL_FINANCE[number])) {
        throw new Error('Financial fields require money visibility.')
      }
      if (input.classification === 'personal' && !PERSONAL.includes(ctx.role as typeof PERSONAL[number])) {
        throw new Error('Personal fields require PII access.')
      }
      const id = await insertConfirmed('intel_field_values', {
        client_uuid: input.clientUuid,
        definition_id: input.definitionId,
        ...(entityType === 'client' ? { client_id: input.entityId } : entityType === 'equipment' ? { product_id: input.entityId } : { booking_id: input.entityId }),
        value_text: input.value?.trim() || null,
        created_by: ctx.userId,
      })
      return { result: { id }, events: [] }
    },
  }
}

export const setClientIntelField = createAction(valueConfig('SET_CLIENT_INTEL_FIELD', ['note.create'], 'client'))
export const setEquipmentIntelField = createAction(valueConfig('SET_EQUIPMENT_INTEL_FIELD', ['inventory.create'], 'equipment'))
export const setRentalIntelField = createAction(valueConfig('SET_RENTAL_INTEL_FIELD', ['note.create'], 'rental'))
