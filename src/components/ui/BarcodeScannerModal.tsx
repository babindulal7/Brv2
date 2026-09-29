import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserMultiFormatReader, BrowserCodeReader, type IScannerControls } from '@zxing/browser'
import { Modal } from './Modal'
import { Button } from './Page'
import Icon from './Icon'
import { dispatchScanFeedback } from '../../lib/scannerFeedback'

export interface ScannableItem {
  id: string
  name: string
  serial?: string
  assetTag?: string
  /**
   * This row cannot be scanned, and the modal refuses a match on it.
   *
   * The name is older than the meaning: all three floor workspaces set it from
   * `r.serial === null`, i.e. "no serial and no asset tag, so no code to scan".
   * It is not a claim that the row is an accessory — see the refusal in
   * `handleScanSubmit`, which says what the flag stands for.
   */
  isAccessory?: boolean
  status?: string
}

/**
 * **What the consuming screen actually did with a matched scan.**
 *
 * PK-09. This modal used to beep success and log `matchLabel` ("marked —
 * recorded at session close") for every identity match, then call
 * `onItemScanned` and never look at what happened. On a second scan of a unit
 * already ticked, `PackingWorkspace.pack` wrote "already packed" into the rail
 * behind the open modal — so one scan produced two verdicts and the operator
 * was looking at the wrong one.
 *
 * The consumer now answers, and this modal reports that answer verbatim: same
 * words in the banner, in the session log, and in the beep. A consumer that
 * returns nothing keeps the old default, which is still true for a screen where
 * every match is a fresh mark.
 */
export interface ScanOutcome {
  /** Did this scan change anything? `false` beeps the error tone. */
  ok: boolean
  /** The consumer's own words for what it recorded. Shown and logged as-is. */
  message: string
}

export interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'pack' | 'handover' | 'return' | 'reset'
  /** Booking context for the subtitle and no-match copy. Omitted on
   *  non-booking surfaces (Stock Check) — there is NO default booking. */
  bookingId?: string
  items: ScannableItem[]
  /**
   * Hand the matched item to the consuming screen, and let it say what it did.
   *
   * A returned `ScanOutcome` is the verdict the operator is shown; returning
   * nothing falls back to `matchLabel`, which is only true where every match is
   * a fresh mark.
   */
  onItemScanned: (item: ScannableItem) => ScanOutcome | void
  /**
   * What a successful match MEANS on the consuming screen, appended after
   * the item identity in the feedback banner and session log — used only when
   * `onItemScanned` returns no verdict of its own. The default describes the
   * floor workspaces truthfully: a scan is a local mark, and the write happens
   * when the session closes. A consumer whose scan means something else (Stock
   * Check copies the code into its scan field) MUST pass its own wording —
   * this modal never claims work it did not do.
   */
  matchLabel?: string
}

/**
 * Scan-match feedback tells the truth (Law: never fabricate success).
 * A match here is a LOCAL mark handed to the consumer via onItemScanned —
 * no dispatch has run, no domain event may be emitted from this component.
 * The action layer emits INVENTORY_* events after the write lands.
 *
 * This wording is the FALLBACK, used only when the consumer returns no
 * `ScanOutcome` of its own. It claims a mark was made, so a consumer that
 * might not make one has to answer for itself.
 */
const DEFAULT_MATCH_LABEL = 'marked — recorded at session close, nothing saved yet'

/** Same-code cooldown: ignore identical consecutive detections within 2s */
const SAME_CODE_COOLDOWN_MS = 2000

/** Web Audio, Vibration, and Peripheral Visual Flash Feedback */
function playAudioFeedback(type: 'success' | 'error') {
  try {
    dispatchScanFeedback(type === 'success' ? 'ok' : 'wrong')
  } catch (e) {
    // Graceful fallback in non-browser or mock test environments
  }
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  mode,
  bookingId,
  items,
  onItemScanned,
  matchLabel = DEFAULT_MATCH_LABEL,
}: BarcodeScannerModalProps) {
  const [query, setQuery] = useState('')
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean
    message: string
    itemName?: string
  } | null>(null)
  const [sessionScanLog, setSessionScanLog] = useState<
    Array<{ id: string; time: string; text: string; success: boolean }>
  >([])

  // Camera, torch, and continuous decode states
  const [cameraActive, setCameraActive] = useState(false)
  const [continuous, setContinuous] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [scanLatencyMs, setScanLatencyMs] = useState<number | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const videoTrackRef = useRef<MediaStreamTrack | null>(null)
  const lastScannedCodeRef = useRef<{ code: string; timestamp: number } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const processCode = useCallback((rawCode: string, fromCamera = false) => {
    const code = rawCode.trim()
    if (!code) return

    const now = Date.now()
    /*
     * D30 — the cooldown is not a camera-only rule. It was gated on
     * `fromCamera`, so a keyboard-wedge scanner (which submits through the
     * form path) re-fired the identical code instantly — the double-scan the
     * guard exists to stop, re-admitted through the second door. The source
     * of the code does not change the answer to "did we just see this one".
     */
    if (
      lastScannedCodeRef.current &&
      lastScannedCodeRef.current.code.toLowerCase() === code.toLowerCase() &&
      now - lastScannedCodeRef.current.timestamp < SAME_CODE_COOLDOWN_MS
    ) {
      // Cooldown active: skip duplicate scan of same item
      return
    }

    lastScannedCodeRef.current = { code, timestamp: now }
    const startTime = performance.now()

    setQuery('')
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false })

    // 1. Identity match ONLY — id, serial or asset tag
    const matchedItem = items.find(
      (i) =>
        i.id.toLowerCase() === code.toLowerCase() ||
        (i.serial && i.serial.toLowerCase() === code.toLowerCase()) ||
        (i.assetTag && i.assetTag.toLowerCase() === code.toLowerCase()),
    )

    if (!matchedItem) {
      playAudioFeedback('error')
      const msg = bookingId
        ? `"${code}" does not match any scannable item in this booking (${bookingId}).`
        : `"${code}" does not match any scannable item in this list.`
      setLastScanResult({ success: false, message: msg })
      setSessionScanLog((prev) => [
        { id: Date.now().toString(), time: timeStr, text: msg, success: false },
        ...prev,
      ])
      setScanLatencyMs(Math.round(performance.now() - startTime))
      return
    }

    // 2. Rows that cannot be scanned
    if (matchedItem.isAccessory) {
      playAudioFeedback('error')
      const msg = `"${matchedItem.name}" has no serial or asset tag to scan — it is a checklist item only. Tick it in the list instead.`
      setLastScanResult({ success: false, message: msg })
      setSessionScanLog((prev) => [
        { id: Date.now().toString(), time: timeStr, text: msg, success: false },
        ...prev,
      ])
      setScanLatencyMs(Math.round(performance.now() - startTime))
      return
    }

    // 3. Match
    const outcome = onItemScanned(matchedItem)
    const identity = `${matchedItem.name} (${matchedItem.serial || matchedItem.id})`
    const ok = outcome ? outcome.ok : true
    const resultMsg = outcome ? `${identity} — ${outcome.message}` : `${identity} ${matchLabel}`

    playAudioFeedback(ok ? 'success' : 'error')

    setLastScanResult({
      success: ok,
      message: resultMsg,
      itemName: matchedItem.name,
    })

    setSessionScanLog((prev) => [
      { id: Date.now().toString(), time: timeStr, text: resultMsg, success: ok },
      ...prev,
    ])

    setScanLatencyMs(Math.round(performance.now() - startTime))

    if (fromCamera && !continuous) {
      setCameraActive(false)
    }
  }, [items, bookingId, onItemScanned, matchLabel, continuous])

  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    processCode(query, false)
  }

  // Camera stop and stream release
  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    videoTrackRef.current = null
    setTorchOn(false)
    setHasTorch(false)
    BrowserCodeReader.releaseAllStreams()
  }, [])

  // Manage ZXing camera stream lifecycle
  useEffect(() => {
    if (!isOpen || !cameraActive) {
      stopCamera()
      codeReaderRef.current = null
      setCameraError(null)
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
            processCode(result.getText(), true)
          }
        })
        .then((controls) => {
          if (!isMounted) {
            controls.stop()
            return
          }
          controlsRef.current = controls

          // Probe torch capability
          try {
            const stream = (videoRef.current as HTMLVideoElement | null)?.srcObject as MediaStream | undefined
            const track = stream?.getVideoTracks()[0]
            if (track) {
              videoTrackRef.current = track
              const caps = (track.getCapabilities?.() as { torch?: boolean }) || {}
              setHasTorch(Boolean(caps.torch))
            }
          } catch {
            // Unsupported capabilities API in mock/headless
          }
        })
        .catch((err) => {
          if (isMounted) {
            const errorName = err instanceof Error && err.name ? err.name : 'Error'
            const detail =
              errorName === 'NotAllowedError'
                ? 'Camera access denied by user or device policy. Switched to manual input.'
                : `Camera error: ${err instanceof Error && err.message ? err.message : errorName}. Switched to manual input.`
            setCameraError(detail)
            playAudioFeedback('error')
            setTimeout(() => inputRef.current?.focus(), 80)
          }
        })
    }

    return () => {
      isMounted = false
      stopCamera()
    }
  }, [isOpen, cameraActive, processCode, stopCamera])

  // Stop camera when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCameraActive(false)
      stopCamera()
    }
  }, [isOpen, stopCamera])

  const toggleTorch = async () => {
    if (!videoTrackRef.current || !hasTorch) return
    const next = !torchOn
    try {
      await videoTrackRef.current.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch {
      // Ignore torch error
    }
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
      subtitle={
        bookingId
          ? `Booking ${bookingId} · Point hardware laser or type serial/barcode.`
          : 'Point hardware laser or type serial/barcode.'
      }
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close Scanner
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {/* Mode & Camera Controls */}
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--success, #22c55e)',
                display: 'inline-block',
                boxShadow: '0 0 6px var(--success, #22c55e)',
              }}
            />
            <span>Auto-Detect: Barcode · QR · Serial</span>
          </div>

          <button
            type="button"
            className="tap"
            onClick={() => setCameraActive((v) => !v)}
            aria-pressed={cameraActive}
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 'var(--r-btn)',
              border: `1px solid ${cameraActive ? 'var(--primary)' : 'var(--border)'}`,
              background: cameraActive ? 'var(--hover-card)' : 'var(--card)',
              color: cameraActive ? 'var(--primary)' : 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-xs)',
              marginLeft: 'auto',
            }}
          >
            <Icon name="camera" size={15} />
            <span>{cameraActive ? 'Stop Camera' : 'Camera Scan'}</span>
          </button>

          {cameraActive && hasTorch && (
            <button
              type="button"
              className="tap"
              onClick={toggleTorch}
              aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-btn)',
                border: `1px solid ${torchOn ? 'var(--primary)' : 'var(--border)'}`,
                background: torchOn ? 'var(--primary)' : 'var(--card)',
                color: torchOn ? 'var(--on-brand)' : 'var(--text2)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="zap" size={16} />
            </button>
          )}
        </div>

        {/* Camera Viewfinder */}
        {cameraActive && (
          <div
            style={{
              position: 'relative',
              height: 200,
              background: '#000',
              borderRadius: 'var(--r-sm)',
              overflow: 'hidden',
              border: lastScanResult
                ? lastScanResult.success
                  ? '2px solid var(--success)'
                  : '2px solid var(--danger)'
                : '1px solid var(--border)',
            }}
          >
            <video
              ref={videoRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              playsInline
              muted
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
                  color: 'var(--st-danger-fg)',
                  fontSize: 'var(--t-meta)',
                  background: 'rgba(0,0,0,0.85)',
                }}
              >
                <Icon name="alert_triangle" size={22} style={{ marginBottom: 6 }} />
                <span>{cameraError}</span>
              </div>
            ) : (
              <>
                <div
                  style={{
                    position: 'absolute',
                    inset: '18%',
                    border: '1.5px dashed rgba(255,255,255,0.6)',
                    borderRadius: 'var(--r-input)',
                    pointerEvents: 'none',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 6,
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 600,
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--success)',
                      display: 'inline-block',
                      animation: 'pulse 1.5s infinite',
                    }}
                  />
                  <span>Align barcode or QR inside reticle</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Continuous mode & Latency indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={continuous}
              onChange={(e) => setContinuous(e.target.checked)}
            />
            <span>Continuous mode (keeps scanner ready)</span>
          </label>
          {scanLatencyMs !== null && (
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
              Latency: {scanLatencyMs}ms (SLA &lt;2s)
            </span>
          )}
        </div>

        {/* Scanner Input Box */}
        <form onSubmit={handleScanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan barcode / QR / type serial or asset tag (e.g. SN-884192, CAM-001)..."
                style={{
                  width: '100%',
                  minHeight: 44,
                  padding: '0 12px 0 36px',
                  borderRadius: 'var(--r-btn)',
                  border: lastScanResult
                    ? lastScanResult.success
                      ? '2px solid var(--success)'
                      : '2px solid var(--danger)'
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

        {/* Feedback Alert Banner — High Contrast Dual-Sensory Confirmation Card */}
        {lastScanResult && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--r-btn)',
              background: lastScanResult.success ? 'var(--st-in-bg)' : 'var(--st-danger-bg)',
              color: lastScanResult.success ? 'var(--st-in-fg)' : 'var(--st-danger-fg)',
              border: `2px solid ${lastScanResult.success ? 'var(--success)' : 'var(--danger)'}`,
              boxShadow: lastScanResult.success ? '0 2px 12px rgba(16, 185, 129, 0.2)' : '0 2px 12px rgba(239, 68, 68, 0.2)',
              fontSize: 'var(--t-body)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-md)',
              transition: 'all var(--dur-fast) var(--ease)',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: lastScanResult.success ? 'var(--success)' : 'var(--danger)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name={lastScanResult.success ? 'check' : 'alert_triangle'} size={20} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {lastScanResult.itemName && (
                <span style={{ fontSize: 'var(--t-title)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {lastScanResult.itemName}
                </span>
              )}
              <span style={{ fontSize: 'var(--t-meta)', opacity: 0.95, wordBreak: 'break-word' }}>
                {lastScanResult.message}
              </span>
            </div>
          </div>
        )}

        {/*
          PK-07 — the test affordance, and it does not ship.

          This block lists every scannable unit with its serial and fills the
          scan field from a tap, which on a production floor is a way to "scan"
          a case of gear without walking to it. It was rendered unconditionally
          in every build, under a heading ("Available Items for Test Scanning")
          that told the operator so. It now compiles out of a production bundle
          entirely: `import.meta.env.DEV` is statically false in `vite build`,
          the house idiom used by `Icon.tsx` and `main.tsx`.

          It still only fills the input — the operator presses Scan, and the
          match rules above run unchanged — so it is a typing shortcut for
          development, never a second way to record a scan.
        */}
        {import.meta.env.DEV && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
              Development build only — fills the scan field, does not scan:
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
        )}

        {/* Live Session Scan Log */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Session Scan History ({sessionScanLog.length})
          </div>
          {sessionScanLog.length === 0 ? (
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', fontStyle: 'italic', lineHeight: '1.5' }}>
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
                    // Same correction as the result banner above — status
                    // pairs, no literals behind a fallback.
                    background: log.success ? 'var(--st-in-bg)' : 'var(--st-danger-bg)',
                    color: log.success ? 'var(--st-in-fg)' : 'var(--st-danger-fg)',
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
