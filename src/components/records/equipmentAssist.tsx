import { useEffect, useState } from 'react'
import Icon from '../ui/Icon'
import { Button, Card } from '../ui/Page'
import { listInventory } from '../../lib/queries/inventory'
import type { RecordValues } from '../../lib/recordEditor'

/*
 * Add Equipment assists (8 Oct 2026, RULINGS-2026-10-08.md; Add Equipment v3.0
 * §2, §3, §5.2, §5.4, §7, §9). Presentation and guidance only — nothing here
 * decides whether a record may be saved; `validateRecord` and the record-editor
 * RPC still own that (Law 1). Every state pairs an icon with words.
 */

/** Intake condition — the five values of `unit_condition` (0004) and Return & Inspection v2.1. */
export const INTAKE_CONDITIONS = ['Excellent', 'Good', 'Fair', 'Damaged', 'Lost'] as const

const text = (v: unknown) => String(v ?? '').trim()
const filled = (v: unknown) => text(v) !== ''
const positive = (v: unknown) => Number(v) > 0

/** Split pasted serials (one per line, or comma/tab separated), dropping blanks and repeats. */
export function parseSerialList(input: string, existing: readonly unknown[]): { serials: string[]; skipped: number } {
  const seen = new Set(existing.map((s) => text(s).toLowerCase()).filter(Boolean))
  const serials: string[] = []
  let skipped = 0
  for (const raw of input.split(/[\n,\t]+/)) {
    const serial = raw.trim()
    if (!serial) continue
    const key = serial.toLowerCase()
    if (seen.has(key)) { skipped += 1; continue }
    seen.add(key)
    serials.push(serial)
  }
  return { serials, skipped }
}

export interface ReadinessItem { ok: boolean; label: string }

/** §9 Ready to Rent — what the record still needs before it is worth renting. Never blocks saving. */
export function equipmentReadiness(values: RecordValues, rows: readonly RecordValues[]): ReadinessItem[] {
  const serialised = values.tracking_mode === 'Serialised'
  const identity = filled(values.name) && filled(values.category_id) && filled(values.brand) && filled(values.tracking_mode)
  const withSerial = rows.filter((r) => filled(r.serial_no)).length
  const items: ReadinessItem[] = [
    { ok: identity, label: identity ? 'Name, category, brand and tracking' : 'Name, category, brand and tracking needed' },
    serialised
      ? { ok: rows.length > 0 && withSerial === rows.length, label: rows.length === 0 ? 'No units added' : withSerial === rows.length ? `${rows.length} ${rows.length === 1 ? 'unit' : 'units'} with serials` : `${rows.length - withSerial} of ${rows.length} units need a serial` }
      : { ok: positive(values.total_quantity), label: positive(values.total_quantity) ? `Quantity ${Number(values.total_quantity)} ${text(values.quantity_unit) || 'piece'}` : 'Quantity not set' },
    { ok: filled(values.daily_rate), label: filled(values.daily_rate) ? 'Daily rate set' : 'Daily rate not set' },
    { ok: filled(values.replacement_value), label: filled(values.replacement_value) ? 'Replacement value set' : 'Replacement value not set — needed for damage charges' },
  ]
  if (serialised && rows.length > 0) {
    const located = rows.filter((r) => filled(r.warehouse_id)).length
    items.push({ ok: located === rows.length, label: located === rows.length ? 'Every unit has a warehouse' : `${rows.length - located} of ${rows.length} units need a warehouse` })
  }
  return items
}

export type SectionState = 'complete' | 'todo' | 'optional'

/** §2 completeness dot for one section of the equipment form. */
export function equipmentSectionState(section: string, values: RecordValues, rows: readonly RecordValues[]): SectionState {
  const ready = equipmentReadiness(values, rows)
  switch (section) {
    case 'Identity': return ready[0]!.ok ? 'complete' : 'todo'
    case 'Units & location': return ready[1]!.ok && (ready[4]?.ok ?? true) ? 'complete' : 'todo'
    case 'Pricing': return filled(values.daily_rate) ? 'complete' : 'todo'
    case 'Purchase': return filled(values.replacement_value) ? 'complete' : 'optional'
    default: return 'optional'
  }
}

const STATE_COPY: Record<SectionState, { icon: 'check' | 'alert_circle' | 'dot'; word: string }> = {
  complete: { icon: 'check', word: 'complete' },
  todo: { icon: 'alert_circle', word: 'needs attention' },
  optional: { icon: 'dot', word: 'optional' },
}

/** §2 — jump links with a completeness mark; any section may be filled in any order. */
export function EquipmentSectionLinks({ sections, stateOf, idOf }: { sections: readonly string[]; stateOf: (s: string) => SectionState; idOf: (s: string) => string }) {
  return (
    <nav aria-label="Form sections" className="record-section-links">
      {sections.map((section) => {
        const state = stateOf(section)
        return (
          <a key={section} href={`#${idOf(section)}`} className={`record-section-link is-${state}`} onClick={(e) => { e.preventDefault(); document.getElementById(idOf(section))?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            <Icon name={STATE_COPY[state].icon} size={14} />
            <span>{section}</span>
            <span className="sr-only">, {STATE_COPY[state].word}</span>
          </a>
        )
      })}
    </nav>
  )
}

/** §8–§9 — a live picture of what will be created, then the Ready-to-Rent checklist. */
export function EquipmentSummary({ values, rows, categoryName, editing }: { values: RecordValues; rows: readonly RecordValues[]; categoryName: string | undefined; editing: boolean }) {
  const ready = equipmentReadiness(values, rows)
  const open = ready.filter((r) => !r.ok).length
  const maker = [text(values.brand), text(values.model)].filter(Boolean).join(' ')
  return (
    <Card title="Equipment summary">
      <div className="equipment-summary">
        <strong className="equipment-summary__name">{text(values.name) || 'New equipment'}</strong>
        <span className="equipment-summary__meta">{[categoryName, maker].filter(Boolean).join(' · ') || 'Category and brand not chosen yet'}</span>
        <span className="equipment-summary__meta">{editing ? 'Editing the existing record.' : 'A new record will be created.'}</span>
        {/* The record editor issues both on save (0153): asset_code EQ######, and EQ######-01… per new unit. */}
        {!editing && <span className="equipment-summary__meta">The asset code and unit tags (EQ000123-01…) are issued when you save.</span>}
        <div className="equipment-summary__ready" aria-live="polite">
          <span className="equipment-summary__ready-title">{open === 0 ? 'Ready to rent' : `Ready to rent? ${open} to finish`}</span>
          <ul>
            {ready.map((item) => (
              <li key={item.label} className={item.ok ? 'is-ok' : 'is-open'}>
                <Icon name={item.ok ? 'check' : 'alert_triangle'} size={14} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
          <span className="equipment-summary__note">Saving is never blocked by this list.</span>
        </div>
      </div>
    </Card>
  )
}

/** §5.2 — paste many serials at once instead of adding units one by one. */
export function PasteSerials({ existing, disabled, onAdd }: { existing: readonly unknown[]; disabled: boolean; onAdd: (serials: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const preview = parseSerialList(draft, existing)
  return (
    <div className="record-paste-serials">
      <label className="record-field" htmlFor="record-paste-serials">
        <span>Paste serials — one per line</span>
        <textarea id="record-paste-serials" value={draft} disabled={disabled} rows={3} placeholder={'SN1023\nSN1024\nSN1025'} onChange={(e) => { setDraft(e.target.value); setNote('') }} />
      </label>
      <Button
        disabled={disabled || preview.serials.length === 0}
        onClick={() => {
          onAdd(preview.serials)
          setNote(`${preview.serials.length} ${preview.serials.length === 1 ? 'unit' : 'units'} added${preview.skipped ? `; ${preview.skipped} repeated ${preview.skipped === 1 ? 'serial' : 'serials'} skipped` : ''}.`)
          setDraft('')
        }}
      >
        {preview.serials.length > 0 ? `Add ${preview.serials.length} ${preview.serials.length === 1 ? 'unit' : 'units'}` : 'Add units'}
      </Button>
      {note && <p role="status" className="record-paste-serials__note">{note}</p>}
    </div>
  )
}

/** §7 — an existing equipment record with the same name (and model, when one is given). */
export function useEquipmentDuplicate(name: unknown, model: unknown, enabled: boolean): { id: string; name: string } | null {
  const [match, setMatch] = useState<{ id: string; name: string } | null>(null)
  const wantName = text(name).toLowerCase()
  const wantModel = text(model).toLowerCase()
  useEffect(() => {
    if (!enabled || wantName.length < 3) { setMatch(null); return }
    let active = true
    const timer = setTimeout(() => {
      void listInventory({ search: text(name) })
        .then((result) => {
          if (!active) return
          const hit = result.rows.find((p) => p.name.trim().toLowerCase() === wantName && (!wantModel || !p.model || p.model.trim().toLowerCase() === wantModel))
          setMatch(hit ? { id: hit.id, name: hit.name } : null)
        })
        // The database has no unique name rule; a failed check simply shows no warning.
        .catch(() => { if (active) setMatch(null) })
    }, 350)
    return () => { active = false; clearTimeout(timer) }
  }, [enabled, wantName, wantModel, name])
  return match
}
