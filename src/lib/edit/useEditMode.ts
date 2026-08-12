import { useCallback, useMemo, useState } from 'react'

/**
 * # Inline edit
 *
 * Two decisions that pull against each other, resolved here rather than in each
 * screen:
 *
 * - **One Edit button unlocks the whole page.**
 * - **Each field saves on its own.**
 *
 * Taken literally that puts a Save/Cancel pair beside all 32 fields of a client
 * record the moment you press Edit. So the pair renders only on a field that is
 * actually **dirty** — the page unlocks as one, and controls appear where you
 * have typed. An untouched field looks like an input and carries no chrome.
 *
 * ## Coupled fields save together
 *
 * Per-field saving can persist an invalid intermediate state, and this schema
 * has three places where that matters:
 *
 * - **Discount % and its reason + approver.** Law 10 needs a reason ≥10 chars
 *   AND a named approver above 10%. Saving the percentage alone writes a
 *   discount the constraint should refuse — and the 11 Aug audit found the
 *   stacking trigger is INSERT-only, so an UPDATE may slip past it.
 * - **Warehouse and storage bin.** Half a location is not a location; the
 *   field's own error message says the floor has to be able to find it.
 *   * - **Pickup and return.** Return must be later than pickup, so saving one
 *   without the other can invert the window.
 *
 * A `group` on a field makes it save with its siblings, as one write.
 *
 * ## Immutable records refuse edit entirely
 *
 * `payments`, `deposit_movements`, `audit_events` and
 * `booking_stage_transitions` are immutable (`dataAccess.ts:102`), and an
 * issued invoice is immutable too. Inline edit must not offer a pencil on any
 * of them — the correction is a reversal row, a void or a credit note. A field
 * marked `immutable` renders read-only with its reason, even in edit mode,
 * because a control that throws on save is worse than no control.
 */

export interface FieldSpec {
  /** Column name. Also the key everything else is addressed by. */
  key: string
  /** Fields sharing a group name save as one write. */
  group?: string
  /**
   * Set when the row may not be updated at all. The field renders read-only
   * with this text as the reason, in edit mode as well as out of it.
   */
  immutable?: string
  /** Returns an error string, or null. Runs before save; a failing field never writes. */
  validate?: (value: unknown) => string | null
}

export interface UseEditModeOptions<T extends Record<string, unknown>> {
  /** The saved record. Every comparison is against this, never against a copy. */
  record: T
  fields: readonly FieldSpec[]
  /**
   * Persists one field or one group. Receives only the changed keys — never the
   * whole record — so an edit cannot silently rewrite a column nobody touched.
   */
  onSave: (patch: Partial<T>) => Promise<void>
}

export interface UseEditModeResult {
  editing: boolean
  startEditing: () => void
  /** Leaves edit mode. Refuses while anything is unsaved, and says what. */
  stopEditing: () => { ok: true } | { ok: false; unsaved: string[] }
  /** Discards every pending change and leaves edit mode. */
  cancelAll: () => void
  /** Current value of a field — the draft if touched, otherwise the saved value. */
  valueOf: (key: string) => unknown
  setValue: (key: string, value: unknown) => void
  /** True when this field differs from the saved record. Drives the Save/Cancel pair. */
  isDirty: (key: string) => boolean
  /** Keys with unsaved changes. */
  dirtyKeys: string[]
  /** Validation message for a field, or null. */
  errorOf: (key: string) => string | null
  /** Saves this field and any siblings in its group. */
  saveField: (key: string) => Promise<void>
  /** Reverts this field and its group to the saved values. */
  cancelField: (key: string) => void
  savingKeys: string[]
  /** The reason a field cannot be edited, or null. */
  immutableReason: (key: string) => string | null
}

export function useEditMode<T extends Record<string, unknown>>({
  record,
  fields,
  onSave,
}: UseEditModeOptions<T>): UseEditModeResult {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [savingKeys, setSavingKeys] = useState<string[]>([])

  const specOf = useMemo(() => {
    const m = new Map<string, FieldSpec>()
    for (const f of fields) m.set(f.key, f)
    return m
  }, [fields])

  /** Every key that saves together with this one. A field with no group is alone. */
  const groupOf = useCallback(
    (key: string): string[] => {
      const g = specOf.get(key)?.group
      if (!g) return [key]
      return fields.filter((f) => f.group === g).map((f) => f.key)
    },
    [fields, specOf],
  )

  const valueOf = useCallback(
    (key: string) => (key in draft ? draft[key] : record[key]),
    [draft, record],
  )

  const isDirty = useCallback(
    (key: string) => key in draft && draft[key] !== record[key],
    [draft, record],
  )

  const dirtyKeys = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== record[k]),
    [draft, record],
  )

  const setValue = useCallback((key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }))
    // Clear the error on type. Re-validation happens at save, not per keystroke —
    // a message that appears mid-word reads as the field arguing with you.
    setErrors((e) => {
      if (!(key in e)) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }, [])

  const cancelField = useCallback((key: string) => {
    const keys = groupOf(key)
    setDraft((d) => {
      const next = { ...d }
      for (const k of keys) delete next[k]
      return next
    })
    setErrors((e) => {
      const next = { ...e }
      for (const k of keys) delete next[k]
      return next
    })
  }, [groupOf])

  const saveField = useCallback(
    async (key: string) => {
      const keys = groupOf(key)

      const immutable = keys.find((k) => specOf.get(k)?.immutable)
      if (immutable) {
        setErrors((e) => ({ ...e, [key]: specOf.get(immutable)!.immutable! }))
        return
      }

      // Validate the whole group. One bad sibling blocks the write, because the
      // group exists precisely so its members never persist apart.
      const found: Record<string, string> = {}
      for (const k of keys) {
        const msg = specOf.get(k)?.validate?.(valueOf(k)) ?? null
        if (msg) found[k] = msg
      }
      if (Object.keys(found).length > 0) {
        setErrors((e) => ({ ...e, ...found }))
        return
      }

      const patch: Record<string, unknown> = {}
      for (const k of keys) if (k in draft) patch[k] = draft[k]
      if (Object.keys(patch).length === 0) return

      setSavingKeys((s) => [...s, ...keys])
      try {
        await onSave(patch as Partial<T>)
        // Drop the draft only after the write lands. Clearing first would show
        // the old value the moment a save failed.
        setDraft((d) => {
          const next = { ...d }
          for (const k of keys) delete next[k]
          return next
        })
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        setErrors((e) => ({ ...e, [key]: detail }))
        // The draft survives a failure — retyping what you just typed is the
        // worst possible response to a network blip.
      } finally {
        setSavingKeys((s) => s.filter((k) => !keys.includes(k)))
      }
    },
    [draft, groupOf, onSave, specOf, valueOf],
  )

  const stopEditing = useCallback(() => {
    if (dirtyKeys.length > 0) return { ok: false as const, unsaved: dirtyKeys }
    setEditing(false)
    setErrors({})
    return { ok: true as const }
  }, [dirtyKeys])

  const cancelAll = useCallback(() => {
    setDraft({})
    setErrors({})
    setEditing(false)
  }, [])

  return {
    editing,
    startEditing: useCallback(() => setEditing(true), []),
    stopEditing,
    cancelAll,
    valueOf,
    setValue,
    isDirty,
    dirtyKeys,
    errorOf: useCallback((key: string) => errors[key] ?? null, [errors]),
    saveField,
    cancelField,
    savingKeys,
    immutableReason: useCallback((key: string) => specOf.get(key)?.immutable ?? null, [specOf]),
  }
}
