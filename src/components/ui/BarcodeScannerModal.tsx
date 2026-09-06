import { useState, useEffect, useRef } from 'react'
import { Modal } from './Modal'
import { Button } from './Page'
import Icon from './Icon'
import { audioContextClass } from '../../lib/audioContext'

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

/** Why "Enable Camera" cannot claim an active camera scanner: permission is
 *  requested, but no decode pipeline is attached to the stream yet. */
const REASON_CAMERA_DECODE_NOT_WIRED =
  'Camera permission granted, but live camera decoding is not wired yet — use a hardware laser or type the code.'

/** Web Audio Beep Feedback */
function playAudioFeedback(type: 'success' | 'error') {
  try {
    const Ctor = audioContextClass()
    if (!Ctor) return
    const ctx = new Ctor()
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
  bookingId,
  items,
  onItemScanned,
  matchLabel = DEFAULT_MATCH_LABEL,
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

    // 1. Identity match ONLY — id, serial or asset tag. A barcode is an
    //    identity; a name substring is not ("battery" must never resolve to
    //    whichever of four identical batteries sorts first).
    const matchedItem = items.find(
      (i) =>
        i.id.toLowerCase() === code.toLowerCase() ||
        (i.serial && i.serial.toLowerCase() === code.toLowerCase()) ||
        (i.assetTag && i.assetTag.toLowerCase() === code.toLowerCase()),
    )

    if (!matchedItem) {
      // Unknown item
      playAudioFeedback('error')
      const msg = bookingId
        ? `"${code}" does not match any scannable item in this booking (${bookingId}).`
        : `"${code}" does not match any scannable item in this list.`
      setLastScanResult({ success: false, message: msg })
      setSessionScanLog((prev) => [
        { id: Date.now().toString(), time: timeStr, text: msg, success: false },
        ...prev,
      ])
      return
    }

    /*
     * 2. Rows that cannot be scanned.
     *
     * The refusal used to read "is a child accessory. Accessories are checklist
     * items only" — a classification the flag does not carry. All three floor
     * workspaces set `isAccessory` from `r.serial === null` ("Quantity rows
     * have no serial to scan — the modal treats them as accessories"), so the
     * row may be a quantity line, or a unit whose serial and asset tag are both
     * unrecorded. Neither is an accessory, and telling an operator a camera
     * body is one sends them looking for a parent item that does not exist.
     * The refusal now states the fact the flag actually stands for.
     */
    if (matchedItem.isAccessory) {
      playAudioFeedback('error')
      const msg = `"${matchedItem.name}" has no serial or asset tag to scan — it is a checklist item only. Tick it in the list instead.`
      setLastScanResult({ success: false, message: msg })
      setSessionScanLog((prev) => [
        { id: Date.now().toString(), time: timeStr, text: msg, success: false },
        ...prev,
      ])
      return
    }

    // 3. Match. Report ONLY what happened: the item was identified and handed
    //    to the consuming screen, and the CONSUMER says what that changed —
    //    it may well be nothing (PK-09). No "Successfully packed/handed
    //    over/returned" — that work has not happened yet — and no domain
    //    event: the action layer emits INVENTORY_* after the write actually
    //    lands (see src/actions/inventory/packEquipment.ts).
    //
    //    The hand-off runs BEFORE the beep and the banner, because it is what
    //    decides both.
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
                  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                  // No decoder consumes this stream yet — release the camera
                  // instead of leaving its indicator lit over a dead feed.
                  stream.getTracks().forEach((t) => t.stop())
                  setLastScanResult({ success: false, message: REASON_CAMERA_DECODE_NOT_WIRED })
                } catch (err) {
                  playAudioFeedback('error')
                  const errorName = err instanceof Error && err.name ? err.name : 'Error'
                  const detail = errorName === 'NotAllowedError' ? 'Camera access denied by user or device policy.' : `Camera error: ${err instanceof Error && err.message ? err.message : errorName}`
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

        {/* Feedback Alert Banner */}
        {lastScanResult && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-btn)',
              /*
                The status pairs, not aliases-with-a-light-theme-hex-behind-them.
                These read `var(--success-bg, #dcfce7)` / `var(--danger-bg,
                #fee2e2)` etc: six literals that were dead while the aliases
                resolved and became a light-only pink/green the moment one did
                not. §3 bans a literal in a screen regardless, and a scan
                result is a STATE, so it takes the same st-* pair as every
                other status surface.
              */
              background: lastScanResult.success ? 'var(--st-in-bg)' : 'var(--st-danger-bg)',
              color: lastScanResult.success ? 'var(--st-in-fg)' : 'var(--st-danger-fg)',
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
