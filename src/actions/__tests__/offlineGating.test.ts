import { describe, it, expect, vi } from 'vitest'
import { createAction, ActionOfflineError, ActionPermissionError } from '../core'

describe('createAction — Phase 9 offline gating (PLAN.md §4.27)', () => {
  it('throws ActionOfflineError for financial actions when isOnline is false', async () => {
    const execute = vi.fn().mockResolvedValue({ result: { success: true }, events: [] })
    const action = createAction({
      name: 'RECORD_PAYMENT',
      permissions: ['payment.create'],
      implemented: true,
      validate: () => {},
      execute,
    })

    // Owner would be allowed online, but is refused offline with ActionOfflineError
    await expect(
      action({}, { userId: 'u-1', role: 'Owner', isOnline: false })
    ).rejects.toBeInstanceOf(ActionOfflineError)

    await expect(
      action({}, { userId: 'u-1', role: 'Owner', isOnline: false })
    ).rejects.toThrow(/cannot be performed while offline — requires payment\.create/)

    expect(execute).not.toHaveBeenCalled()
  })

  it('throws ActionPermissionError (not ActionOfflineError) if role is unauthorized even online', async () => {
    const execute = vi.fn().mockResolvedValue({ result: { success: true }, events: [] })
    const action = createAction({
      name: 'RECORD_PAYMENT',
      permissions: ['payment.create'],
      implemented: true,
      validate: () => {},
      execute,
    })

    // Warehouse is money-blind and unauthorized online too -> ActionPermissionError
    await expect(
      action({}, { userId: 'u-2', role: 'Warehouse', isOnline: false })
    ).rejects.toBeInstanceOf(ActionPermissionError)

    expect(execute).not.toHaveBeenCalled()
  })

  it('throws ActionOfflineError for invoice void when offline', async () => {
    const execute = vi.fn().mockResolvedValue({ result: { success: true }, events: [] })
    const action = createAction({
      name: 'VOID_INVOICE',
      permissions: ['invoice.void'],
      implemented: true,
      validate: () => {},
      execute,
    })

    await expect(
      action({}, { userId: 'u-1', role: 'Owner', isOnline: false })
    ).rejects.toBeInstanceOf(ActionOfflineError)

    expect(execute).not.toHaveBeenCalled()
  })

  it('throws ActionOfflineError for closing approvals when offline', async () => {
    const execute = vi.fn().mockResolvedValue({ result: { success: true }, events: [] })
    const action = createAction({
      name: 'APPROVE_DAILY_CLOSING',
      permissions: ['closing.approve'],
      implemented: true,
      validate: () => {},
      execute,
    })

    await expect(
      action({}, { userId: 'u-1', role: 'Owner', isOnline: false })
    ).rejects.toBeInstanceOf(ActionOfflineError)

    expect(execute).not.toHaveBeenCalled()
  })

  it('allows floor operations when offline without throwing ActionOfflineError', async () => {
    const execute = vi.fn().mockResolvedValue({ result: { success: true }, events: [] })
    const action = createAction({
      name: 'PERFORM_OPERATIONS',
      permissions: ['operations.perform'],
      implemented: true,
      validate: () => {},
      execute,
    })

    const res = await action({}, { userId: 'u-3', role: 'Warehouse', isOnline: false })
    expect(res).toEqual({ success: true })
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
