import Icon from './Icon'
import { InfoTooltip } from './InfoTooltip'
import { Button } from './Button'
import { BRAND_TEXT } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import type { UseEditModeResult } from '../../lib/edit/useEditMode'

/**
 * # Editable summary rows
 *
 * The read-mode twin of this component is `SummaryRows` in `Page.tsx`, and the
 * shapes are deliberately the same: a detail page swaps one for the other and
 * keeps its row list. That matters because the row list *is* the page's content
 * — rewriting it per screen is how the two drift apart.
 *
 * The interaction rule comes from `lib/edit/useEditMode.ts` and is the whole
 * point of the pattern:
 *
 * - **The page unlocks as one.** One Edit button in the header, every keyed row
 *   becomes an input at once.
 * - **Chrome appears only where you typed.** An untouched input carries no
 *   Save/Cancel pair. A client record has 32 fields; sprouting 32 button pairs
 *   the instant you press Edit is the thing this avoids.
 * - **Typing a value back to its original clears the pair again**, because
 *   `isDirty` compares against the saved record, not against "has been touched".
 *
 * A row with no `key` is display-only in both modes — derived figures, computed
 * totals, and anything whose source is another table.
 */

export interface EditableRowDef {
  /**
   * The record's column name. A row without one never becomes an input —
   * use it for derived or cross-referenced values.
   */
  key?: string
  label: string
  /** Read-mode rendering, and the fallback for keyless rows in edit mode. */
  value: string
  tone?: BrandKey
  /** `number` and `tel` change the keypad on a phone; `textarea` grows. */
  as?: 'text' | 'number' | 'email' | 'tel' | 'textarea'
  /** Shown under the input in edit mode — units, formats, why a rule exists. */
  hint?: string
}

/* Law 15 — the law is the hit area, not the paint, and `--tap` in theme.css is
   where that number lives. Both consumers below are a real <input>/<textarea>
   inside a stacked edit row, so the honest fix is to grow the box rather than
   inset an invisible target; 36 also left these out of step with Input.tsx,
   which has been at 44 all along. */
const inputStyle = {
  width: '100%',
  minHeight: 'var(--tap)',
  padding: '7px 10px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
} as const

export function EditableRows({
  rows,
  edit,
}: {
  rows: EditableRowDef[]
  /** Omit to render exactly like `SummaryRows` — used by money-gated cards that never edit. */
  edit?: UseEditModeResult
}) {
  const editing = edit?.editing ?? false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      {rows.map((r) => {
        const editable = editing && edit && r.key !== undefined
        const immutable = editable ? edit.immutableReason(r.key!) : null

        /* Read mode, keyless rows, and immutable rows all render the value.
           An immutable row keeps its reason visible *in edit mode too* — a
           pencil that throws on save is worse than no pencil (§2.2). */
        if (!editable || immutable) {
          return (
            <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--t-meta)' }}>
                <span style={{ color: 'var(--text2)', minWidth: 0, flex: 1 }}>{r.label}</span>
                <span
                  className="figure"
                  style={{ fontWeight: 600, color: r.tone ? BRAND_TEXT[r.tone] : 'var(--text)', whiteSpace: 'nowrap' }}
                >
                  {r.value}
                </span>
              </div>
              {immutable && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  <Icon name="lock" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{immutable}</span>
                </div>
              )}
            </div>
          )
        }

        const key = r.key!
        const dirty = edit.isDirty(key)
        const error = edit.errorOf(key)
        const saving = edit.savingKeys.includes(key)
        const raw = edit.valueOf(key)
        const shown = raw === null || raw === undefined ? '' : String(raw)

        return (
          <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <label style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }} htmlFor={`edit-${key}`}>
                {r.label}
              </label>
              {r.hint && <InfoTooltip content={r.hint} />}
            </div>

            {r.as === 'textarea' ? (
              <textarea
                id={`edit-${key}`}
                value={shown}
                rows={3}
                onChange={(e) => edit.setValue(key, e.target.value)}
                style={{ ...inputStyle, resize: 'vertical', borderColor: error ? 'var(--danger)' : 'var(--border)' }}
              />
            ) : (
              <input
                id={`edit-${key}`}
                type={r.as ?? 'text'}
                value={shown}
                onChange={(e) =>
                  /* A number field must not hand the record a string — the saved
                     value is what `isDirty` compares against, and '5' !== 5 would
                     make an untouched field read as dirty forever. */
                  edit.setValue(key, r.as === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)
                }
                style={{ ...inputStyle, borderColor: error ? 'var(--danger)' : 'var(--border)' }}
              />
            )}

            {/* Law: errors inline, never colour alone — the message carries the meaning. */}
            {error && (
              <span role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                <Icon name="alert_triangle" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                {error}
              </span>
            )}

            {dirty && (
              <div style={{ display: 'flex', gap: 'var(--sp-xs)' }}>
                <Button size="sm" variant="primary" loading={saving} onClick={() => void edit.saveField(key)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => edit.cancelField(key)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
