// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { getTerminalId, useFloorPresence, type FloorPresenceMessage, type UseFloorPresenceResult } from '../floorPresence'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('getTerminalId', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('generates a terminal ID starting with T-', () => {
    const id = getTerminalId()
    expect(id).toMatch(/^T-[A-Z0-9]{4}$/)
  })

  it('persists and reuses terminal ID from sessionStorage', () => {
    const id1 = getTerminalId()
    const id2 = getTerminalId()
    expect(id1).toBe(id2)
  })
})

describe('useFloorPresence hook', () => {
  let container: HTMLDivElement
  let root: Root
  let mockPostMessage: ReturnType<typeof vi.fn>
  let mockClose: ReturnType<typeof vi.fn>
  let listeners: ((event: MessageEvent<FloorPresenceMessage>) => void)[] = []

  class MockBroadcastChannel {
    name: string
    onmessage: ((event: MessageEvent<FloorPresenceMessage>) => void) | null = null

    constructor(name: string) {
      this.name = name
      listeners.push((event) => {
        if (this.onmessage) {
          this.onmessage(event)
        }
      })
    }

    postMessage(data: FloorPresenceMessage) {
      mockPostMessage(data)
      listeners.forEach((l) => l({ data } as MessageEvent<FloorPresenceMessage>))
    }

    close() {
      mockClose()
    }
  }

  let hookResult: UseFloorPresenceResult | null = null

  function TestHarness({ bookingNo, staffName }: { bookingNo: string; staffName: string }) {
    const res = useFloorPresence(bookingNo, staffName, 'Warehouse Lead')
    hookResult = res
    return (
      <div id="test-harness">
        <span data-testid="terminal">{res.terminalId}</span>
        <span data-testid="banner">{res.presenceBanner || 'none'}</span>
      </div>
    )
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockPostMessage = vi.fn()
    mockClose = vi.fn()
    listeners = []
    hookResult = null
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('returns terminalId and empty peers initially', () => {
    act(() => {
      root.render(<TestHarness bookingNo="BK-2026-001" staffName="Babin Staff" />)
    })

    expect(hookResult?.terminalId).toBeDefined()
    expect(hookResult?.activePeers).toEqual([])
    expect(hookResult?.presenceBanner).toBeNull()
    expect(hookResult?.lastRemoteScan).toBeNull()
  })

  it('detects concurrent peer heartbeats and generates presenceBanner', () => {
    act(() => {
      root.render(<TestHarness bookingNo="BK-2026-001" staffName="Technician A" />)
    })

    const peerHeartbeat: FloorPresenceMessage = {
      type: 'HEARTBEAT',
      peer: {
        terminalId: 'T-PEER',
        bookingNo: 'BK-2026-001',
        staffName: 'Technician B',
        role: 'Packer',
        lastSeen: Date.now(),
      },
    }

    act(() => {
      listeners.forEach((l) => l({ data: peerHeartbeat } as MessageEvent<FloorPresenceMessage>))
    })

    expect(hookResult?.activePeers).toHaveLength(1)
    expect(hookResult?.activePeers[0]?.staffName).toBe('Technician B')
    expect(hookResult?.presenceBanner).toContain('Technician B (T-PEER) also active on this booking')
  })

  it('ignores heartbeats from different bookings', () => {
    act(() => {
      root.render(<TestHarness bookingNo="BK-2026-001" staffName="Technician A" />)
    })

    const peerHeartbeat: FloorPresenceMessage = {
      type: 'HEARTBEAT',
      peer: {
        terminalId: 'T-OTHER',
        bookingNo: 'BK-9999-999',
        staffName: 'Technician Other',
        role: 'Packer',
        lastSeen: Date.now(),
      },
    }

    act(() => {
      listeners.forEach((l) => l({ data: peerHeartbeat } as MessageEvent<FloorPresenceMessage>))
    })

    expect(hookResult?.activePeers).toHaveLength(0)
    expect(hookResult?.presenceBanner).toBeNull()
  })

  it('broadcasts scans and updates lastRemoteScan when another terminal scans', () => {
    act(() => {
      root.render(<TestHarness bookingNo="BK-2026-001" staffName="Technician A" />)
    })

    act(() => {
      hookResult?.broadcastScan('FX6-001')
    })

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SCAN',
        bookingNo: 'BK-2026-001',
        assetTag: 'FX6-001',
        staffName: 'Technician A',
      })
    )

    const remoteScan: FloorPresenceMessage = {
      type: 'SCAN',
      terminalId: 'T-PEER',
      bookingNo: 'BK-2026-001',
      assetTag: 'LENS-2470',
      staffName: 'Technician B',
    }

    act(() => {
      listeners.forEach((l) => l({ data: remoteScan } as MessageEvent<FloorPresenceMessage>))
    })

    expect(hookResult?.lastRemoteScan).toEqual({
      assetTag: 'LENS-2470',
      staffName: 'Technician B',
    })
  })

  it('removes peer when RELEASE message is received', () => {
    act(() => {
      root.render(<TestHarness bookingNo="BK-2026-001" staffName="Technician A" />)
    })

    act(() => {
      listeners.forEach((l) =>
        l({
          data: {
            type: 'HEARTBEAT',
            peer: {
              terminalId: 'T-PEER',
              bookingNo: 'BK-2026-001',
              staffName: 'Technician B',
              role: 'Packer',
              lastSeen: Date.now(),
            },
          },
        } as MessageEvent<FloorPresenceMessage>)
      )
    })

    expect(hookResult?.activePeers).toHaveLength(1)

    act(() => {
      listeners.forEach((l) =>
        l({
          data: {
            type: 'RELEASE',
            terminalId: 'T-PEER',
            bookingNo: 'BK-2026-001',
          },
        } as MessageEvent<FloorPresenceMessage>)
      )
    })

    expect(hookResult?.activePeers).toHaveLength(0)
    expect(hookResult?.presenceBanner).toBeNull()
  })
})
