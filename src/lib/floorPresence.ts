import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * # Multi-Terminal Floor Presence Engine (Pillar 4)
 *
 * Prevents race conditions and serial scan contention across warehouse floor tablets.
 * Uses `BroadcastChannel('br-floor-presence')` with localStorage fallback to coordinate
 * real-time terminal heartbeats and scan alerts across local tabs/devices.
 */

export interface FloorPeer {
  readonly terminalId: string
  readonly bookingNo: string
  readonly staffName: string
  readonly role: string
  readonly lastSeen: number
}

export type FloorPresenceMessage =
  | { readonly type: 'HEARTBEAT'; readonly peer: FloorPeer }
  | { readonly type: 'RELEASE'; readonly terminalId: string; readonly bookingNo: string }
  | { readonly type: 'SCAN'; readonly terminalId: string; readonly bookingNo: string; readonly assetTag: string; readonly staffName: string }

const CHANNEL_NAME = 'br-floor-presence'
const HEARTBEAT_INTERVAL_MS = 6000
const PEER_TIMEOUT_MS = 18000

let cachedTerminalId: string | null = null

export function getTerminalId(): string {
  if (cachedTerminalId) return cachedTerminalId
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem('br-terminal-id')
      if (stored) {
        cachedTerminalId = stored
        return stored
      }
      const newId = `T-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      window.sessionStorage.setItem('br-terminal-id', newId)
      cachedTerminalId = newId
      return newId
    }
  } catch {
    // SessionStorage restricted
  }
  cachedTerminalId = `T-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
  return cachedTerminalId
}

export interface UseFloorPresenceResult {
  readonly terminalId: string
  readonly activePeers: readonly FloorPeer[]
  readonly presenceBanner: string | null
  readonly lastRemoteScan: { assetTag: string; staffName: string } | null
  readonly broadcastScan: (assetTag: string) => void
}

/**
 * Hook for floor workspaces to broadcast presence and detect concurrent terminal activity.
 */
export function useFloorPresence(
  bookingNo: string | undefined | null,
  staffName: string,
  role = 'Warehouse staff',
): UseFloorPresenceResult {
  const terminalId = useRef(getTerminalId()).current
  const [peers, setPeers] = useState<Record<string, FloorPeer>>({})
  const [lastRemoteScan, setLastRemoteScan] = useState<{ assetTag: string; staffName: string } | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  // Broadcast helper
  const postMsg = useCallback((msg: FloorPresenceMessage) => {
    try {
      if (channelRef.current) {
        channelRef.current.postMessage(msg)
      } else if (typeof window !== 'undefined' && window.localStorage) {
        // Fallback for environments without BroadcastChannel
        window.localStorage.setItem('br-presence-event', JSON.stringify({ msg, rand: Math.random() }))
      }
    } catch {
      // Storage/broadcast restricted
    }
  }, [])

  const broadcastScan = useCallback((assetTag: string) => {
    if (!bookingNo) return
    postMsg({
      type: 'SCAN',
      terminalId,
      bookingNo,
      assetTag,
      staffName,
    })
  }, [bookingNo, postMsg, staffName, terminalId])

  useEffect(() => {
    if (!bookingNo) return

    // Setup channel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        channelRef.current = new BroadcastChannel(CHANNEL_NAME)
      } catch {
        channelRef.current = null
      }
    }

    const handleMessage = (msg: FloorPresenceMessage) => {
      const msgTerminalId = msg.type === 'HEARTBEAT' ? msg.peer.terminalId : msg.terminalId
      const msgBookingNo = msg.type === 'HEARTBEAT' ? msg.peer.bookingNo : msg.bookingNo

      if (msgTerminalId === terminalId) return
      if (msgBookingNo !== bookingNo) return

      if (msg.type === 'HEARTBEAT') {
        setPeers((prev) => ({
          ...prev,
          [msg.peer.terminalId]: msg.peer,
        }))
      } else if (msg.type === 'RELEASE') {
        setPeers((prev) => {
          const next = { ...prev }
          delete next[msg.terminalId]
          return next
        })
      } else if (msg.type === 'SCAN') {
        setLastRemoteScan({ assetTag: msg.assetTag, staffName: msg.staffName })
      }
    }

    // BroadcastChannel listener
    if (channelRef.current) {
      channelRef.current.onmessage = (event: MessageEvent<FloorPresenceMessage>) => {
        handleMessage(event.data)
      }
    }

    // Storage fallback listener
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'br-presence-event' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as { msg: FloorPresenceMessage }
          if (parsed && parsed.msg) handleMessage(parsed.msg)
        } catch {
          // Ignore parse errors
        }
      }
    }
    window.addEventListener('storage', handleStorage)

    // Initial heartbeat
    const sendHeartbeat = () => {
      postMsg({
        type: 'HEARTBEAT',
        peer: {
          terminalId,
          bookingNo,
          staffName,
          role,
          lastSeen: Date.now(),
        },
      })
    }
    sendHeartbeat()

    const interval = setInterval(() => {
      sendHeartbeat()
      // Prune timed-out peers
      const now = Date.now()
      setPeers((prev) => {
        let changed = false
        const next: Record<string, FloorPeer> = {}
        for (const [id, peer] of Object.entries(prev)) {
          if (now - peer.lastSeen <= PEER_TIMEOUT_MS) {
            next[id] = peer
          } else {
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorage)
      postMsg({ type: 'RELEASE', terminalId, bookingNo })
      if (channelRef.current) {
        channelRef.current.close()
        channelRef.current = null
      }
    }
  }, [bookingNo, postMsg, role, staffName, terminalId])

  const activePeers = Object.values(peers)
  const otherTechnician =
    activePeers.length > 0
      ? `${activePeers.map((p) => `${p.staffName} (${p.terminalId})`).join(', ')} also active on this booking`
      : null

  return {
    terminalId,
    activePeers,
    presenceBanner: otherTechnician,
    lastRemoteScan,
    broadcastScan,
  }
}
