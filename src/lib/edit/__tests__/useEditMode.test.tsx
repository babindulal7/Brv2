// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { useEditMode, type FieldSpec } from '../useEditMode'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderHook<T>(hook: () => T) {
  const box = { current: undefined as unknown as T }
  function Probe() {
    box.current = hook()
    return null as unknown as ReactNode
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(createElement(Probe)))
  return { result: box, unmount: () => { act(() => root.unmount()); host.remove() } }
}

const RECORD = { name: 'Sony FX3', discount_percent: 5, discount_reason: '', warehouse: 'KTM', bin: 'A-12' }

const FIELDS: FieldSpec[] = [
  { key: 'name' },
  // Law 10 — the percentage and its justification are one write.
  { key: 'discount_percent', group: 'discount', validate: (v) => (Number(v) > 25 ? 'Discount is capped at 25%.' : null) },
  { key: 'discount_reason', group: 'discount' },
  // Half a location is not a location.
  { key: 'warehouse', group: 'location' },
  { key: 'bin', group: 'location' },
]

describe('useEditMode', () => {
  it('starts locked, and one button unlocks the page', () => {
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave: vi.fn() }))
    expect(result.current.editing).toBe(false)
    act(() => result.current.startEditing())
    expect(result.current.editing).toBe(true)
  })

  it('marks only touched fields dirty — Save/Cancel appears where you typed, not on 32 fields', () => {
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave: vi.fn() }))
    act(() => result.current.startEditing())
    expect(result.current.dirtyKeys).toEqual([])
    act(() => result.current.setValue('name', 'Sony FX6'))
    expect(result.current.isDirty('name')).toBe(true)
    expect(result.current.isDirty('warehouse')).toBe(false)
    expect(result.current.dirtyKeys).toEqual(['name'])
  })

  it('typing a value back to the saved one is not dirty', () => {
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave: vi.fn() }))
    act(() => result.current.setValue('name', 'Sony FX6'))
    act(() => result.current.setValue('name', 'Sony FX3'))
    expect(result.current.isDirty('name')).toBe(false)
    expect(result.current.dirtyKeys).toEqual([])
  })

  it('sends ONLY the changed key, never the whole record', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave }))
    act(() => result.current.setValue('name', 'Sony FX6'))
    await act(async () => { await result.current.saveField('name') })
    expect(onSave).toHaveBeenCalledWith({ name: 'Sony FX6' })
  })

  it('saves a coupled group as ONE write — discount % never persists without its reason', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave }))
    act(() => result.current.setValue('discount_percent', 15))
    act(() => result.current.setValue('discount_reason', 'Long-term production client'))
    await act(async () => { await result.current.saveField('discount_percent') })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ discount_percent: 15, discount_reason: 'Long-term production client' })
  })

  it('a failing sibling blocks the whole group — the group exists so its members never split', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave }))
    act(() => result.current.setValue('discount_percent', 40))
    act(() => result.current.setValue('discount_reason', 'anything'))
    await act(async () => { await result.current.saveField('discount_reason') })
    expect(onSave).not.toHaveBeenCalled()
    expect(result.current.errorOf('discount_percent')).toMatch(/25%/)
  })

  it('cancelling one field of a group reverts the whole group', () => {
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave: vi.fn() }))
    act(() => result.current.setValue('warehouse', 'PKR'))
    act(() => result.current.setValue('bin', 'B-01'))
    act(() => result.current.cancelField('warehouse'))
    expect(result.current.isDirty('bin')).toBe(false)
    expect(result.current.valueOf('bin')).toBe('A-12')
  })

  it('refuses to edit an immutable field and says why — a control that throws is worse than none', async () => {
    const onSave = vi.fn()
    const immutableFields: FieldSpec[] = [
      { key: 'amount', immutable: 'Payments are immutable. Record a reversal instead.' },
    ]
    const { result } = renderHook(() =>
      useEditMode({ record: { amount: 5000 }, fields: immutableFields, onSave }),
    )
    expect(result.current.immutableReason('amount')).toMatch(/reversal/)
    act(() => result.current.setValue('amount', 9999))
    await act(async () => { await result.current.saveField('amount') })
    expect(onSave).not.toHaveBeenCalled()
    expect(result.current.errorOf('amount')).toMatch(/immutable/)
  })

  it('keeps the draft when a save fails — retyping after a blip is the worst response', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Network unreachable'))
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave }))
    act(() => result.current.setValue('name', 'Sony FX6'))
    await act(async () => { await result.current.saveField('name') })
    expect(result.current.valueOf('name')).toBe('Sony FX6')
    expect(result.current.isDirty('name')).toBe(true)
    expect(result.current.errorOf('name')).toMatch(/Network unreachable/)
  })

  it('refuses to leave edit mode with unsaved work, and names it', () => {
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave: vi.fn() }))
    act(() => result.current.startEditing())
    act(() => result.current.setValue('name', 'Sony FX6'))
    let outcome: ReturnType<typeof result.current.stopEditing> | undefined
    act(() => { outcome = result.current.stopEditing() })
    expect(outcome).toEqual({ ok: false, unsaved: ['name'] })
    expect(result.current.editing).toBe(true)
  })

  it('leaves cleanly once everything is saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave }))
    act(() => result.current.startEditing())
    act(() => result.current.setValue('name', 'Sony FX6'))
    await act(async () => { await result.current.saveField('name') })
    let outcome: ReturnType<typeof result.current.stopEditing> | undefined
    act(() => { outcome = result.current.stopEditing() })
    expect(outcome).toEqual({ ok: true })
    expect(result.current.editing).toBe(false)
  })

  it('cancelAll discards everything and exits', () => {
    const { result } = renderHook(() => useEditMode({ record: RECORD, fields: FIELDS, onSave: vi.fn() }))
    act(() => result.current.startEditing())
    act(() => result.current.setValue('name', 'Sony FX6'))
    act(() => result.current.cancelAll())
    expect(result.current.editing).toBe(false)
    expect(result.current.dirtyKeys).toEqual([])
    expect(result.current.valueOf('name')).toBe('Sony FX3')
  })
})
