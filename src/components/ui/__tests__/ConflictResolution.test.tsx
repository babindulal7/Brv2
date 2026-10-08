// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConflictResolutionModal } from '../ConflictResolutionModal'
import { ConflictNotificationBanner } from '../ConflictNotificationBanner'
import * as offlineQueue from '../../../lib/offlineQueue'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Test Operator', role: 'Operations' },
  }),
}))

vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

describe('ConflictResolutionModal & ConflictNotificationBanner — Phase 9 UI', () => {
  it('ConflictNotificationBanner renders warning when unresolved conflicts exist', async () => {
    vi.spyOn(offlineQueue, 'countUnresolvedConflicts').mockResolvedValue(1)

    await act(async () => {
      root.render(<ConflictNotificationBanner />)
    })

    const banner = container.querySelector('[data-testid="conflict-notification-banner"]')
    expect(banner).toBeTruthy()
    expect(banner?.textContent).toContain('1 offline sync conflict requires review')

    const reviewBtn = banner?.querySelector('button')
    expect(reviewBtn).toBeTruthy()
    expect(reviewBtn?.style.minHeight).toBe('44px') // Law 15 touch target
  })

  it('ConflictNotificationBanner renders nothing when conflict count is 0', async () => {
    vi.spyOn(offlineQueue, 'countUnresolvedConflicts').mockResolvedValue(0)

    await act(async () => {
      root.render(<ConflictNotificationBanner />)
    })

    const banner = container.querySelector('[data-testid="conflict-notification-banner"]')
    expect(banner).toBeNull()
  })

  it('ConflictResolutionModal renders side-by-side comparison of local vs server fields', async () => {
    const mockConflict: offlineQueue.QueuedConflict = {
      id: 101,
      mutationId: 5,
      clientUuid: 'uuid-123',
      table: 'bookings',
      recordId: 'BK-999',
      localChanges: { status: 'Packed', notes: 'Packed into case 4' },
      remoteState: { status: 'On Rent', notes: 'Dispatched early by counter' },
      detectedAt: '2026-10-08T10:00:00Z',
      status: 'unresolved',
    }

    vi.spyOn(offlineQueue, 'getUnresolvedConflicts').mockResolvedValue([mockConflict])
    const onClose = vi.fn()
    const onResolved = vi.fn()

    await act(async () => {
      root.render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={onClose}
          onResolved={onResolved}
        />
      )
    })

    expect(document.body.textContent).toContain('Offline Sync Conflicts')
    expect(document.body.textContent).toContain('bookings')
    expect(document.body.textContent).toContain('BK-999')
    // Side by side field diffs
    expect(document.body.textContent).toContain('Local Offline Edit')
    expect(document.body.textContent).toContain('Server Version')
    expect(document.body.textContent).toContain('Packed')
    expect(document.body.textContent).toContain('On Rent')

    // Action buttons adhere to Law 15 44px touch targets
    const buttons = Array.from(document.body.querySelectorAll('button'))
    const keepServerBtn = buttons.find((b) => b.textContent?.includes('Keep Server Version'))
    const forceLocalBtn = buttons.find((b) => b.textContent?.includes('Apply Local Offline Changes'))
    expect(keepServerBtn).toBeTruthy()
    expect(forceLocalBtn).toBeTruthy()
    expect(keepServerBtn?.style.minHeight).toBe('44px')
    expect(forceLocalBtn?.style.minHeight).toBe('44px')
  })

  it('ConflictResolutionModal triggers resolveConflict on resolution button click', async () => {
    const mockConflict: offlineQueue.QueuedConflict = {
      id: 202,
      mutationId: 6,
      clientUuid: 'uuid-456',
      table: 'bookings',
      recordId: 'BK-1000',
      localChanges: { notes: 'Offline note' },
      remoteState: { notes: 'Server note' },
      detectedAt: '2026-10-08T10:00:00Z',
      status: 'unresolved',
    }

    vi.spyOn(offlineQueue, 'getUnresolvedConflicts')
      .mockResolvedValueOnce([mockConflict])
      .mockResolvedValueOnce([]) // after resolve, empty
    const resolveSpy = vi.spyOn(offlineQueue, 'resolveConflict').mockResolvedValue(undefined)
    const onClose = vi.fn()
    const onResolved = vi.fn()

    await act(async () => {
      root.render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={onClose}
          onResolved={onResolved}
        />
      )
    })

    const buttons = Array.from(document.body.querySelectorAll('button'))
    const keepServerBtn = buttons.find((b) => b.textContent?.includes('Keep Server Version'))

    await act(async () => {
      keepServerBtn?.click()
    })

    expect(resolveSpy).toHaveBeenCalledWith(202, 'keep_server', 'Test Operator')
    expect(onResolved).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
