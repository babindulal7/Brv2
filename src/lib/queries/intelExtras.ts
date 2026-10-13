import { IS_MOCK, supabase } from '../supabase'
import type { IntelEntityType } from '../intel/context'
import type { GateContext } from '../fieldGating'
import { canViewPII, moneyScope } from '../fieldGating'

export type IntelNoteVisibility = 'all_staff' | 'operations' | 'management'
export type IntelFieldClass = 'operational' | 'personal' | 'financial'

export interface IntelNoteRow {
  id: string
  body: string
  visibility: IntelNoteVisibility
  createdAt: string
}

export interface IntelCustomFieldRow {
  id: string
  key: string
  label: string
  classification: IntelFieldClass
  highPriority: boolean
  value: string | null
}

interface RawNote { id: string; body: string; visibility: IntelNoteVisibility; created_at: string }
interface RawDefinition {
  id: string; field_key: string; label: string; classification: IntelFieldClass; high_priority: boolean
}
interface RawValue { id: string; definition_id: string; value_text: string | null; created_at: string }

function visibleNote(note: RawNote, ctx: GateContext): boolean {
  if (ctx.role === 'Client') return false
  if (note.visibility === 'management') return ['Owner', 'Admin', 'Manager'].includes(ctx.role)
  if (note.visibility === 'operations') return ctx.role !== 'Accounts'
  return true
}

function visibleField(field: RawDefinition, ctx: GateContext): boolean {
  if (field.classification === 'operational') return ctx.role !== 'Client'
  if (field.classification === 'personal') return canViewPII(ctx) && ctx.role !== 'Driver'
  return moneyScope(ctx) === 'full'
}

/** The database applies RLS first; these predicates also keep the React payload narrow. */
export async function loadIntelNotes(entityType: IntelEntityType, entityId: string, ctx: GateContext): Promise<IntelNoteRow[]> {
  if (IS_MOCK || ctx.role === 'Client' || !['client', 'equipment', 'rental'].includes(entityType)) return []
  const key = entityType === 'client' ? 'client_id' : entityType === 'equipment' ? 'product_id' : 'booking_id'
  const table = entityType === 'rental' ? 'booking_notes' : 'intel_entity_notes'
  const notes: IntelNoteRow[] = []
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await supabase.from(table as never).select('id, body, visibility, created_at')
      .eq(key, entityId).is('archived_at', null).order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(page * 100, page * 100 + 99)
    if (error) throw new Error(`Could not read Intel notes: ${error.message}`)
    const chunk = (data ?? []) as unknown as RawNote[]
    notes.push(...chunk.filter(note => visibleNote(note, ctx)).map(note => ({ id: note.id, body: note.body, visibility: note.visibility, createdAt: note.created_at })))
    if (chunk.length < 100) return notes
  }
  throw new Error('Intel notes exceed the supported record limit')
}

export async function loadIntelExtras(entityType: IntelEntityType, entityId: string, ctx: GateContext, section?: 'notes' | 'fields'): Promise<{
  notes: IntelNoteRow[]
  fields: IntelCustomFieldRow[]
}> {
  if (IS_MOCK || ctx.role === 'Client') return { notes: [], fields: [] }
  if (entityType === 'document') return { notes: [], fields: [] }
  if (section === 'notes') return { notes: await loadIntelNotes(entityType, entityId, ctx), fields: [] }
  const key = entityType === 'client' ? 'client_id' : entityType === 'equipment' ? 'product_id' : 'booking_id'
  const [notesResult, definitionsResult, valuesResult] = await Promise.all([
    section === 'fields' ? Promise.resolve([]) : loadIntelNotes(entityType, entityId, ctx),
    supabase.from('intel_field_definitions' as never).select('id, field_key, label, classification, high_priority').eq('entity_type', entityType).is('archived_at', null),
    supabase.from('intel_field_values' as never).select('id, definition_id, value_text, created_at').eq(key, entityId).order('created_at', { ascending: false }),
  ])
  if (definitionsResult.error) throw new Error(`Could not read custom fields: ${definitionsResult.error.message}`)
  if (valuesResult.error) throw new Error(`Could not read custom field values: ${valuesResult.error.message}`)
  const notes = notesResult
  const values = new Map<string, string | null>()
  for (const value of (valuesResult.data ?? []) as unknown as RawValue[]) {
    if (!values.has(value.definition_id)) values.set(value.definition_id, value.value_text)
  }
  const fields = ((definitionsResult.data ?? []) as unknown as RawDefinition[])
    .filter((field) => visibleField(field, ctx))
    .map((field) => ({
      id: field.id,
      key: field.field_key,
      label: field.label,
      classification: field.classification,
      highPriority: field.high_priority,
      value: values.get(field.id) ?? null,
    }))
  return { notes, fields }
}

/** Optional high-priority facts load after the immediate row-backed Glance paints. */
export async function loadIntelGlanceFields(entityType: IntelEntityType, entityId: string, ctx: GateContext): Promise<string[]> {
  if (IS_MOCK || entityType === 'document' || ctx.role === 'Client') return []
  const key = entityType === 'client' ? 'client_id' : entityType === 'equipment' ? 'product_id' : 'booking_id'
  const definitions = await supabase.from('intel_field_definitions' as never)
    .select('id, field_key, label, classification, high_priority')
    .eq('entity_type', entityType)
    .eq('high_priority', true)
    .is('archived_at', null)
  if (definitions.error) return []
  const allowed = ((definitions.data ?? []) as unknown as RawDefinition[]).filter((field) => visibleField(field, ctx)).slice(0, 2)
  if (allowed.length === 0) return []
  const values = await supabase.from('intel_field_values' as never)
    .select('id, definition_id, value_text, created_at')
    .eq(key, entityId)
    .in('definition_id', allowed.map((field) => field.id))
    .order('created_at', { ascending: false })
  if (values.error) return []
  const latest = new Map<string, string | null>()
  for (const value of (values.data ?? []) as unknown as RawValue[]) {
    if (!latest.has(value.definition_id)) latest.set(value.definition_id, value.value_text)
  }
  return allowed.flatMap((field) => {
    const value = latest.get(field.id)
    return value ? [`${field.label}: ${value}`] : []
  })
}
