import { describe, it, expect } from 'vitest'
import { syncEngine, type SyncState } from '../syncEngine'

describe('SyncEngine State & Subscriptions', () => {
  it('reports initial sync state correctly', () => {
    const state = syncEngine.getState()
    expect(state).toHaveProperty('status')
    expect(state).toHaveProperty('pendingCount')
  })

  it('subscribes to state updates when listeners register', () => {
    let notifiedState: SyncState | null = null
    const unsub = syncEngine.subscribe((s) => {
      notifiedState = s
    })

    expect(notifiedState).not.toBeNull()
    expect(notifiedState).toHaveProperty('status')
    unsub()
  })

  it('handles refreshPendingCount gracefully when indexedDB is absent in test', async () => {
    const count = await syncEngine.refreshPendingCount()
    expect(typeof count).toBe('number')
  })
})

