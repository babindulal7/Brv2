import { describe, it, expect, vi } from 'vitest'
import { createAction, ActionNotImplementedError, ActionPermissionError } from '../core'

/**
 * The dispatcher's whole job now is to refuse. These assert the refusals,
 * because the failure they exist to prevent — an action reporting success for a
 * write it never made — is silent by construction and cannot be caught by
 * reading the screen.
 */
describe('createAction — fails closed', () => {
  const ctx = { userId: 'u-1', role: 'Owner' as const }

  it('refuses an action with no `implemented` flag, before validate or execute', async () => {
    const validate = vi.fn()
    const execute = vi.fn()
    const action = createAction({ name: 'STUB', permissions: [], validate, execute })

    await expect(action({}, ctx)).rejects.toBeInstanceOf(ActionNotImplementedError)
    // The point of the ordering: nothing observable ran.
    expect(validate).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('refuses `implemented: false` explicitly, not just a missing flag', async () => {
    const action = createAction({
      name: 'STUB_EXPLICIT',
      permissions: [],
      implemented: false,
      validate: () => {},
      execute: async () => ({ result: { ok: true }, events: [] }),
    })
    await expect(action({}, ctx)).rejects.toBeInstanceOf(ActionNotImplementedError)
  })

  it('names the action in the error, so a report identifies which button lied', async () => {
    const action = createAction({
      name: 'RECORD_PAYMENT',
      permissions: [],
      validate: () => {},
      execute: async () => ({ result: null, events: [] }),
    })
    await expect(action({}, ctx)).rejects.toThrow(/RECORD_PAYMENT/)
  })

  it('refuses an implemented action called with no session context', async () => {
    const execute = vi.fn()
    const action = createAction({
      name: 'NEEDS_IDENTITY',
      permissions: [],
      implemented: true,
      validate: () => {},
      execute,
    })
    // The old dispatcher substituted `{ userId: 'system', role: 'admin' }` here.
    await expect(action({})).rejects.toThrow(/session context/)
    expect(execute).not.toHaveBeenCalled()
  })

  it('denies a capability that has no defined rule, rather than waving it through', async () => {
    const execute = vi.fn()
    const action = createAction({
      name: 'UNKNOWN_CAPABILITY',
      permissions: ['some.capability.nobody.ruled'],
      implemented: true,
      validate: () => {},
      execute,
    })
    await expect(action({}, ctx)).rejects.toBeInstanceOf(ActionPermissionError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('denies payment.create to Warehouse — Law 6, through lib/rbac not a local matrix', async () => {
    const execute = vi.fn()
    const action = createAction({
      name: 'RECORD_PAYMENT',
      permissions: ['payment.create'],
      implemented: true,
      validate: () => {},
      execute,
    })
    await expect(action({}, { userId: 'u-2', role: 'Warehouse' })).rejects.toBeInstanceOf(ActionPermissionError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('runs an implemented, permitted action and emits its events after execute', async () => {
    const order: string[] = []
    const action = createAction<{ n: number }, { ok: true }>({
      name: 'REAL',
      permissions: ['money.view'],
      implemented: true,
      validate: () => {
        order.push('validate')
      },
      execute: async () => {
        order.push('execute')
        return { result: { ok: true as const }, events: [{ type: 'TEST_EVENT', payload: {} }] }
      },
    })

    await expect(action({ n: 1 }, ctx)).resolves.toEqual({ ok: true })
    expect(order).toEqual(['validate', 'execute'])
  })
})
