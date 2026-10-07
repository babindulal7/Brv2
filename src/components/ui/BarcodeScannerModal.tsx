import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal } from './Modal'
import { Button } from './Page'
import Icon from './Icon'
import { BrowserMultiFormatReader } from '@zxing/browser'
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

type FeedbackType = 'success' | 'error' | 'duplicate'

/** Web Audio & Haptic Feedback Engine (Phase 8) */
function playAudioFeedback(type: FeedbackType) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (AudioContextClass) {
      const ctx = new AudioContextClass()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.connect(gain)
      gain.connect(ctx.destination)

      if (type === 'success') {
        // High crisp 880Hz sine beep (A5)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.12)
      } else if (type === 'duplicate') {
        // Double pulse 440Hz sine (A4)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        gain.gain.setValueAtTime(0.18, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.09)

        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'sine'
        osc2.frequency.setValueAtTime(440, ctx.currentTime + 0.13)
        gain2.gain.setValueAtTime(0.18, ctx.currentTime + 0.13)
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start(ctx.currentTime + 0.13)
        osc2.stop(ctx.currentTime + 0.22)
      } else {
        // Audibly distinct 180Hz low sawtooth buzz for errors/unknown
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(180, ctx.currentTime)
        gain.gain.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.25)
      }
    }
  } catch (e) {
    // Ignore audio context errors in headless environments
  }

  // Haptic feedback
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (type === 'success') navigator.vibrate(30)
      else if (type === 'duplicate') navigator.vibrate([30, 40, 30])
      else navigator.vibrate([40, 60, 40])
    }
  } catch (e) {
    // Ignore vibration errors
  }
}

/** Cooldown duration in ms to prevent duplicate re-fires when same barcode stays in camera view */
const SAME_CODE_COOLDOWN_MS = 2000

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
  const [continuous, setContinuous] = useState(true)
  const [cameraActive, setCameraActive] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean
    message: string
    itemName?: string
  } | null>(null)

  const [sessionScanLog, setSessionScanLog] = useState<
    Array<{ id: string; time: string; durationMs: number; text: string; success: boolean }>
  >([])

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)
  const lastScannedRef = useRef<{ code: string; time: number } | null>(null)

  // Focus manual input on open
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Camera stream and ZXing continuous scanning lifecycle
  useEffect(() => {
    if (!isOpen || !cameraActive) {
      if (codeReaderRef.current) {
        try {
          (codeReaderRef.current as any).reset()
        } catch {}
        codeReaderRef.current = null
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach((t) => t.stop())
        videoRef.current.srcObject = null
      }
      setTorchOn(false)
      setHasTorch(false)
      return
    }

    let isMounted = true
    setCameraError(null)

    if (!codeReaderRef.current) {
      codeReaderRef.current = new BrowserMultiFormatReader()
    }

    if (videoRef.current) {
      codeReaderRef.current
        .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && isMounted) {
            processCode(result.getText(), 'camera')
          }
        })
        .then(() => {
          if (isMounted && videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream
            const track = stream.getVideoTracks()[0]
            if (track && typeof (track as any).getCapabilities === 'function') {
              const caps = (track as any).getCapabilities()
              if (caps?.torch) {
                setHasTorch(true)
              }
            }
          }
        })
        .catch((err) => {
          if (isMounted) {
            const errName = err?.name || 'Error'
            const msg =
              errName === 'NotAllowedError'
                ? 'Camera access denied by user or device policy. Manual entry is ready below.'
                : `Camera unavailable (${err?.message || errName}). Manual entry is ready below.`
            setCameraError(msg)
          }
        })
    }

    return () => {
      isMounted = false
      if (codeReaderRef.current) {
        try {
          (codeReaderRef.current as any).reset()
        } catch {}
        codeReaderRef.current = null
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach((t) => t.stop())
        videoRef.current.srcObject = null
      }
      setTorchOn(false)
      setHasTorch(false)
    }
  }, [isOpen, cameraActive])

  // Torch toggle handler
  const toggleTorch = useCallback(async () => {
    const stream = videoRef.current?.srcObject as MediaStream | null
    const track = stream?.getVideoTracks()[0]
    if (!track) return

    try {
      const nextTorch = !torchOn
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      })
      setTorchOn(nextTorch)
    } catch (e) {
      console.warn('Torch toggle failed', e)
    }
  }, [torchOn])

  // Core scan processing logic with cooldown & timing instrumentation
  const processCode = useCallback(
    (rawCode: string, trigger: 'camera' | 'manual') => {
      const code = rawCode.trim()
      if (!code) return

      const now = Date.now()

      // Same-barcode cooldown check (prevents flood when holding item in frame)
      if (
        trigger === 'camera' &&
        lastScannedRef.current &&
        lastScannedRef.current.code.toLowerCase() === code.toLowerCase() &&
        now - lastScannedRef.current.time < SAME_CODE_COOLDOWN_MS
      ) {
        return
      }
      lastScannedRef.current = { code, time: now }

      const startTime = performance.now()
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
        const durationMs = Math.round(performance.now() - startTime)
        const msg = `Item "${code}" is not in this booking (${bookingId}).`
        setLastScanResult({ success: false, message: msg })
        setSessionScanLog((prev) => [
          { id: `${Date.now()}-${Math.random()}`, time: timeStr, durationMs, text: msg, success: false },
          ...prev,
        ])
        return
      }

      // 2. Child Accessories Rule check
      if (matchedItem.isAccessory) {
        playAudioFeedback('error')
        const durationMs = Math.round(performance.now() - startTime)
        const msg = `"${matchedItem.name}" is a child accessory. Accessories are checklist items only and cannot be scanned.`
        setLastScanResult({ success: false, message: msg })
        setSessionScanLog((prev) => [
          { id: `${Date.now()}-${Math.random()}`, time: timeStr, durationMs, text: msg, success: false },
          ...prev,
        ])
        return
      }

      // 3. Success scan
      playAudioFeedback('success')
      const durationMs = Math.round(performance.now() - startTime)
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
        { id: `${Date.now()}-${Math.random()}`, time: timeStr, durationMs, text: successMsg, success: true },
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

      // If continuous mode is disabled, close modal on successful scan
      if (!continuous) {
        onClose()
      }
    },
    [items, mode, bookingId, continuous, onItemScanned, onClose],
  )

  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const code = query.trim()
    if (!code) return
    setQuery('')
    processCode(code, 'manual')
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
      subtitle={`Booking ${bookingId} · Camera continuous scanner or hardware laser / manual code.`}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close Scanner
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {/* Camera Viewfinder & Frame */}
        <div
          style={{
            position: 'relative',
            height: 180,
            background: '#090d16',
            borderRadius: 'var(--r-sm)',
            overflow: 'hidden',
            border: lastScanResult
              ? lastScanResult.success
                ? '2px solid var(--success, #16a34a)'
                : '2px solid var(--danger, #dc2626)'
              : '1px solid var(--border)',
            transition: 'border-color 0.2s ease',
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {cameraError ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--sp-md)',
                textAlign: 'center',
                color: 'var(--st-danger-fg, #ef4444)',
                fontSize: 'var(--t-meta)',
                background: 'rgba(0,0,0,0.85)',
              }}
            >
              <Icon name="alert_triangle" size={24} style={{ marginBottom: 6 }} />
              <span>{cameraError}</span>
            </div>
          ) : (
            <>
              {/* Laser / Scanner Target Reticle */}
              <div
                style={{
                  position: 'absolute',
                  inset: '16%',
                  border: '1.5px dashed rgba(255,255,255,0.4)',
                  borderRadius: 'var(--r-input)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '50%',
                  height: 1,
                  background: 'rgba(239, 68, 68, 0.5)',
                  boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
                  pointerEvents: 'none',
                }}
              />
            </>
          )}

          {/* Viewfinder overlay controls (Torch & Camera status) */}
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'flex',
              gap: 6,
            }}
          >
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={torchOn ? 'Turn off torch' : 'Turn on torch'}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: 'var(--r-btn)',
                  border: torchOn ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.3)',
                  background: torchOn ? '#f59e0b' : 'rgba(0,0,0,0.6)',
                  color: torchOn ? '#000' : '#fff',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
                title={torchOn ? 'Torch On' : 'Torch Off'}
              >
                <Icon name="sun" size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setCameraActive(!cameraActive)}
              aria-label={cameraActive ? 'Pause camera' : 'Start camera'}
              style={{
                minWidth: 44,
                minHeight: 44,
                borderRadius: 'var(--r-btn)',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
              title={cameraActive ? 'Pause camera' : 'Resume camera'}
            >
              <Icon name={cameraActive ? 'video' : 'camera'} size={18} />
            </button>
          </div>
        </div>

        {/* Mode Selector and Manual Entry Form */}
        <form onSubmit={handleScanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
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
                  // Law 15 — 44px min height
                  height: 44,
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
              <div style={{ position: 'absolute', left: 10, top: 13, color: 'var(--muted)' }}>
                <Icon name="search" size={18} />
              </div>
            </div>

            <Button variant="primary" onClick={() => handleScanSubmit()}>
              Scan
            </Button>
          </div>

          {/* Continuous mode toggle (Law 15: 44px hit row) */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
              cursor: 'pointer',
              minHeight: 44,
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={continuous}
              onChange={(e) => setContinuous(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            Continuous mode — keep scanning without closing modal
          </label>
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

        {/* Quick Simulated Scans (for floor testing / manual pick) */}
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

        {/* Live Session Scan History with Timing Measurement (<2s per item) */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
              Session Scan History ({sessionScanLog.length})
            </span>
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Target: &lt;2s/item</span>
          </div>
          {sessionScanLog.length === 0 ? (
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', fontStyle: 'italic' }}>
              No scans recorded in this session yet.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--sp-xs)',
                maxHeight: 150,
                overflowY: 'auto',
              }}
            >
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
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: 'rgba(0,0,0,0.06)',
                      color: 'var(--text2)',
                    }}
                  >
                    ⏱ {log.durationMs}ms
                  </span>
                  <span style={{ fontWeight: 500, flex: 1 }}>{log.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
