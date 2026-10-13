import { formatAd } from '../../lib/bs'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionContext } from '../../actions/core'
import { addBookingNote } from '../../actions/notes/addBookingNote'
import {
  addClientIntelNote,
  addEquipmentIntelNote,
  configureIntelField,
  setClientIntelField,
  setEquipmentIntelField,
  setRentalIntelField,
} from '../../actions/intel/writeIntel'
import type { IntelContext, IntelEntityType } from '../../lib/intel/context'
import type { GateContext } from '../../lib/fieldGating'
import { loadIntelExtras, type IntelCustomFieldRow, type IntelNoteRow, type IntelNoteVisibility, type IntelFieldClass } from '../../lib/queries/intelExtras'
import { newClientUuid } from '../../lib/supabase'

type EditableIntelType = Extract<IntelEntityType, 'client' | 'equipment' | 'rental'>

interface Props {
  entityType: EditableIntelType
  entityId: string
  context: IntelContext
  gateContext: GateContext
  actionContext: ActionContext | null
  section?: 'notes' | 'fields'
}

const MANAGEMENT = ['Owner', 'Admin', 'Manager']
const DESK = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse']

export function IntelDetailExtras({ entityType, entityId, gateContext, actionContext, section }: Props) {
  const [notes, setNotes] = useState<IntelNoteRow[]>([])
  const [fields, setFields] = useState<IntelCustomFieldRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<IntelNoteVisibility>('all_staff')
  const [saving, setSaving] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const [fieldKey, setFieldKey] = useState('')
  const [fieldLabel, setFieldLabel] = useState('')
  const [classification, setClassification] = useState<IntelFieldClass>('operational')
  const [highPriority, setHighPriority] = useState(false)
  const noteKey = useRef<string | null>(null)
  const configKey = useRef<string | null>(null)
  const canManage = MANAGEMENT.includes(gateContext.role)
  const canWrite = actionContext !== null && (entityType === 'equipment' ? canManage : DESK.includes(gateContext.role))

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await loadIntelExtras(entityType, entityId, gateContext, section)
      setNotes(result.notes)
      setFields(result.fields)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId, gateContext, section])

  useEffect(() => { void reload() }, [reload])

  const saveNote = async () => {
    if (!actionContext || !body.trim() || saving) return
    setSaving(true)
    setError(null)
    const clientUuid = noteKey.current ?? (noteKey.current = newClientUuid())
    try {
      if (entityType === 'rental') {
        await addBookingNote({ bookingId: entityId, noteType: 'Internal', body, visibility, clientUuid }, actionContext)
      } else {
        const input = { entityType, entityId, body, visibility, clientUuid }
        if (entityType === 'client') await addClientIntelNote(input, actionContext)
        else await addEquipmentIntelNote(input, actionContext)
      }
      noteKey.current = null
      setBody('')
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  const createField = async () => {
    if (!actionContext || saving) return
    setSaving(true)
    setError(null)
    const clientUuid = configKey.current ?? (configKey.current = newClientUuid())
    try {
      await configureIntelField({ entityType, fieldKey, label: fieldLabel, classification, highPriority, clientUuid }, actionContext)
      configKey.current = null
      setFieldKey('')
      setFieldLabel('')
      setConfiguring(false)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div aria-label={`${entityType} Intel details`} style={{ display: 'grid', gap: 18, marginTop: 20 }}>
      {error && <div role="alert" style={{ color: 'var(--danger-text)' }}>{error} <button type="button" onClick={() => void reload()} style={{ minHeight: 44 }}>Retry</button></div>}
      {loading && <p role="status" style={{ color: 'var(--muted)', margin: 0 }}>{section === 'notes' ? 'Loading notes…' : section === 'fields' ? 'Loading custom fields…' : 'Loading notes and custom fields…'}</p>}
      {section !== 'fields' && <section aria-label="Notes">
        <h3 style={{ fontSize: 'var(--t-ui)', margin: '0 0 8px' }}>Notes</h3>
        {notes.length === 0 && !loading && !error && <p style={{ color: 'var(--muted)' }}>No notes recorded.</p>}
        {notes.map((note) => (
          <div key={note.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>
              {formatAd(new Date(note.createdAt))} · {note.visibility.replace('_', ' ')}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
          </div>
        ))}
        {canWrite && !error && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <label htmlFor={`intel-note-${entityId}`}>Add note</label>
            <textarea id={`intel-note-${entityId}`} value={body} onChange={(event) => { setBody(event.target.value); noteKey.current = null }} rows={3} style={{ width: '100%', minHeight: 80 }} />
            <label htmlFor={`intel-visibility-${entityId}`}>Visibility</label>
            <select id={`intel-visibility-${entityId}`} value={visibility} onChange={(event) => { setVisibility(event.target.value as IntelNoteVisibility); noteKey.current = null }} style={{ minHeight: 44 }}>
              <option value="all_staff">All staff</option>
              <option value="operations">Operations</option>
              {canManage && <option value="management">Management</option>}
            </select>
            <button type="button" onClick={() => void saveNote()} disabled={saving || !body.trim()} style={{ minHeight: 44 }}>Save note</button>
          </div>
        )}
      </section>}
      {section !== 'notes' && <section aria-label="Custom fields">
        <h3 style={{ fontSize: 'var(--t-ui)', margin: '0 0 8px' }}>Custom fields</h3>
        {fields.length === 0 && !loading && !error && <p style={{ color: 'var(--muted)' }}>No custom fields configured.</p>}
        {fields.map((field) => (
          <IntelFieldValue key={field.id} field={field} entityType={entityType} entityId={entityId} actionContext={canWrite ? actionContext : null} onSaved={reload} />
        ))}
        {canManage && !error && (
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={() => setConfiguring((current) => !current)} style={{ minHeight: 44 }}>Configure field</button>
            {configuring && (
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <label>Field key <input value={fieldKey} onChange={(event) => { setFieldKey(event.target.value); configKey.current = null }} placeholder="shoot_location" /></label>
                <label>Label <input value={fieldLabel} onChange={(event) => { setFieldLabel(event.target.value); configKey.current = null }} placeholder="Shoot location" /></label>
                <label>Classification <select value={classification} onChange={(event) => { setClassification(event.target.value as IntelFieldClass); configKey.current = null }}>
                  <option value="operational">Operational</option><option value="personal">Personal</option><option value="financial">Financial</option>
                </select></label>
                <label><input type="checkbox" checked={highPriority} onChange={(event) => { setHighPriority(event.target.checked); configKey.current = null }} /> High priority in Glance</label>
                <button type="button" onClick={() => void createField()} disabled={saving || !fieldKey || !fieldLabel} style={{ minHeight: 44 }}>Add field</button>
              </div>
            )}
          </div>
        )}
      </section>}
    </div>
  )
}

function IntelFieldValue({ field, entityType, entityId, actionContext, onSaved }: {
  field: IntelCustomFieldRow
  entityType: EditableIntelType
  entityId: string
  actionContext: ActionContext | null
  onSaved: () => Promise<void>
}) {
  const [value, setValue] = useState(field.value ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = useRef<string | null>(null)
  const save = async () => {
    if (!actionContext || saving) return
    setSaving(true)
    setError(null)
    const clientUuid = key.current ?? (key.current = newClientUuid())
    const input = { entityType, entityId, definitionId: field.id, classification: field.classification, value: value.trim() || null, clientUuid }
    try {
      if (entityType === 'client') await setClientIntelField(input, actionContext)
      else if (entityType === 'equipment') await setEquipmentIntelField(input, actionContext)
      else await setRentalIntelField(input, actionContext)
      key.current = null
      setEditing(false)
      await onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }
  return <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
    <div style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>{field.label} · {field.classification}</div>
    {!editing ? <div>{field.value ?? 'Not set'} {actionContext && <button type="button" onClick={() => setEditing(true)} style={{ minHeight: 44 }}>Edit</button>}</div> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <input aria-label={field.label} value={value} onChange={(event) => { setValue(event.target.value); key.current = null }} maxLength={2000} />
      <button type="button" onClick={() => void save()} disabled={saving} style={{ minHeight: 44 }}>Save</button>
      <button type="button" onClick={() => setEditing(false)} style={{ minHeight: 44 }}>Cancel</button>
    </div>}
    {error && <p role="alert" style={{ color: 'var(--danger-text)' }}>{error}</p>}
  </div>
}
