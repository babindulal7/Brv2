import { useState, useEffect, useRef } from 'react'
import { Modal } from './Modal'
import { Button } from './Page'
import Icon from './Icon'
import { DomainEvents, EVENT_TYPES } from '../../events/eventBus'

export interface ScannableItem {
  id: string
  name: string
  serial?: string
  assetTag?: string
  isAccessory?: boolean
  status?: string
}

export interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'pack' | 'handover' | 'return' | 'reset'
  bookingId?: string
  items: ScannableItem[]
  onItemScanned: (item: ScannableItem) => void
}

/** Web Audio Beep Feedback */
function playAudioFeedback(type: 'success' | 'error') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'success') {
      osc.frequency.setValueAtTime(880, ctx.currentTime) // A5 beep
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime) // A3 error beep
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      osc.start()
      osc.stop(ctx.currentTime + 0.25)
    }
  } catch (e) {
    // Ignore audio context errors in headless envs
  }
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  mode,
  bookingId = 'B-710',
  items,
  onItemScanned,
}: BarcodeScannerModalProps) {
  const [query, setQuery] = useState('')
  const [scanType, setScanType] = useState<'Barcode' | 'Serial' | 'QR'>('Serial')
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean
    message: string
    itemName?: string
  } | null>(null)
  const [sessionScanLog, setSessionScanLog] = useState<
    Array<{ id: string; time: string; text: string; success: boolean }>
  >([])

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const code = query.trim()
    if (!code) return

    setQuery('')
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false })

    // 1. Search for matching item in current booking list
    const matchedItem = items.find(
      (i) =>
        i.id.toLowerCase() === code.toLowerCase() ||
        (i.serial && i.serial.toLowerCase() === code.toLowerCase()) ||
        (i.assetTag && i.assetTag.toLowerCase() === code.toLowerCase()) ||
        i.name.toLowerCase().includes(code.toLowerCase()),
    )

    if (!matchedItem) {
      // Unknown item
      playAudioFeedback('error')
      const msg = `Item "${code}" is not in this booking (${bookingId}).`
      setLastScanResult({ success: false, message: msg })
      setSessionScanLog((prev) => [
        { id: Date.now().toString(), time: timeStr, text: msg, success: false },
        ...prev,
      ])
      return
    }

    // 2. Child Accessories Rule check
    if (matchedItem.isAccessory) {
      playAudioFeedback('error')
      const msg = `"${matchedItem.name}" is a child accessory. Accessories are checklist items only and cannot be scanned.`
      setLastScanResult({ success: false, message: msg })
      setSessionScanLog((prev) => [
        { id: Date.now().toString(), time: timeStr, text: msg, success: false },
        ...prev,
      ])
      return
    }

    // 3. Success scan
    playAudioFeedback('success')
    const verb =
      mode === 'pack'
        ? 'Packed'
        : mode === 'handover'
        ? 'Handed Over'
        : mode === 'return'
        ? 'Returned'
        : 'Reset'

    const successMsg = `Successfully ${verb.toLowerCase()}: ${matchedItem.name} (${
      matchedItem.serial || matchedItem.id
    })`

    setLastScanResult({
      success: true,
      message: successMsg,
      itemName: matchedItem.name,
    })

    setSessionScanLog((prev) => [
      { id: Date.now().toString(), time: timeStr, text: successMsg, success: true },
      ...prev,
    ])

    // Emit domain event
    const eventType =
      mode === 'pack'
        ? EVENT_TYPES.INVENTORY_PACKED
        : mode === 'handover'
        ? EVENT_TYPES.INVENTORY_CHECKED_OUT
        : EVENT_TYPES.INVENTORY_RETURNED

    DomainEvents.emit(eventType, {
      itemId: matchedItem.id,
      serial: matchedItem.serial,
      bookingId,
      timestamp: new Date().toISOString(),
    })

    onItemScanned(matchedItem)
  }

  const modeTitle =
    mode === 'pack'
      ? 'Packing Scanner'
      : mode === 'handover'
      ? 'Handover Dispatch Scanner'
      : mode === 'return'
      ? 'Return Check-in Scanner'
      : 'Reset & Maintenance Scanner'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modeTitle}
      subtitle={`Booking ${bookingId} · Point hardware laser or type serial/barcode.`}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close Scanner
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {/* Scanner Input Box */}
        <form onSubmit={handleScanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
            {(['Serial', 'Barcode', 'QR'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setScanType(t)}
                style={{
                  // Law 15 — 44×44 at every width.
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn)',
                  border: scanType === t ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
                  background: scanType === t ? 'var(--nav-active-accent-bg, var(--card2))' : 'var(--card)',
                  color: scanType === t ? 'var(--nav-active-accent)' : 'var(--text2)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t} Mode
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                try {
                  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    setLastScanResult({ success: false, message: 'Camera API is not supported in this browser environment.' })
                    return
                  }
                  await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                  setLastScanResult({ success: true, message: 'Camera permission granted. Camera scanner active.' })
                } catch (err: any) {
                  playAudioFeedback('error')
                  const errorName = err?.name || 'Error'
                  const detail = errorName === 'NotAllowedError' ? 'Camera access denied by user or device policy.' : `Camera error: ${err?.message || errorName}`
                  setLastScanResult({ success: false, message: detail })
                }
              }}
              style={{
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--sp-xs)',
              }}
            >
              <Icon name="camera" size={13} />
              Enable Camera
            </button>
          </div>

          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  scanType === 'Serial'
                    ? 'Scan barcode / type serial (e.g. SN-884192, CAM-001)...'
                    : 'Scan QR tag / asset ID...'
                }
                style={{
                  width: '100%',
                  height: 42,
                  padding: '0 12px 0 36px',
                  borderRadius: 'var(--r-btn)',
                  border: lastScanResult
                    ? lastScanResult.success
                      ? '2px solid var(--success, #16a34a)'
                      : '2px solid var(--danger, #dc2626)'
                    : '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-ui)',
                  fontFamily: 'monospace',
                }}
              />
              <div style={{ position: 'absolute', left: 10, top: 12, color: 'var(--muted)' }}>
                <Icon name="search" size={18} />
              </div>
            </div>

            <Button variant="primary" onClick={() => handleScanSubmit()}>
              Scan
            </Button>
          </div>
        </form>

        {/* Feedback Alert Banner */}
        {lastScanResult && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-btn)',
              background: lastScanResult.success
                ? 'var(--success-bg, #dcfce7)'
                : 'var(--danger-bg, #fee2e2)',
              color: lastScanResult.success
                ? 'var(--success-text, #15803d)'
                : 'var(--danger-text, #b91c1c)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
            }}
          >
            <Icon name={lastScanResult.success ? 'check' : 'alert_triangle'} size={18} />
            <span>{lastScanResult.message}</span>
          </div>
        )}

        {/* Quick Simulated Scans (for demo testing) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
            Available Items for Test Scanning:
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {items.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  setQuery(i.serial || i.id)
                }}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  padding: '0 8px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'var(--card2)',
                  color: i.isAccessory ? 'var(--muted)' : 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  textDecoration: i.isAccessory ? 'line-through' : 'none',
                }}
                title={i.isAccessory ? 'Accessory (Not Scannable)' : 'Scannable Unit'}
              >
                {i.name} ({i.serial || i.id})
              </button>
            ))}
          </div>
        </div>

        {/* Live Session Scan Log */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Session Scan History ({sessionScanLog.length})
          </div>
          {sessionScanLog.length === 0 ? (
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', fontStyle: 'italic' }}>
              No scans recorded in this session yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', maxHeight: 150, overflowY: 'auto' }}>
              {sessionScanLog.map((log) => (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-sm)',
                    fontSize: 'var(--t-meta)',
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: log.success ? 'var(--success-bg, #f0fdf4)' : 'var(--danger-bg, #fef2f2)',
                    color: log.success ? 'var(--success-text, #166534)' : 'var(--danger-text, #991b1b)',
                  }}
                >
                  <span style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)', fontFamily: 'monospace' }}>
                    {log.time}
                  </span>
                  <span style={{ fontWeight: 500 }}>{log.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
