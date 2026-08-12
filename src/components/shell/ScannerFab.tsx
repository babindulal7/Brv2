import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { useViewport } from '../../lib/device'
import { BAR_BOX } from './BottomBar'

/**
 * **Scanner — Foundation v2.0 §5.5.**
 *
 * > "One FAB, bottom-right, at **every** width — not mobile-only, never a
 * > sidebar item. Six contexts. Continuous mode. Audible and haptic feedback
 * > first, with wrong-job as the key state."
 */

const CONTEXTS = [
  { key: 'pack', label: 'Packing', hint: 'Tick items against the packing list' },
  { key: 'handover', label: 'Handover', hint: 'Confirm what physically leaves' },
  { key: 'return', label: 'Return', hint: 'Receive and count items back' },
  { key: 'reset', label: 'Reset', hint: 'Clear items back to Available' },
  { key: 'stock', label: 'Stock Check', hint: 'Verify shelf against record' },
  { key: 'lookup', label: 'Lookup', hint: 'Find any item by code' },
] as const

type Feedback = { tone: 'ok' | 'wrong-job' | 'unknown' | 'duplicate'; text: string } | null

/**
 * The one way another surface reaches this scanner.
 *
 * The updated wireframe gives the phone bar a centre **Scan ⦿** slot as well as
 * keeping the FAB at every width. That slot must *trigger this component* — a
 * second scanner would mean a second camera lifecycle, a second continuous-mode
 * flag and two places for the wrong-job tone to drift. So `BottomBar` dispatches
 * this event and the panel below opens, exactly as Ctrl/⌘-B already does.
 *
 * Nothing else about this file changed: it was never width-gated (`phone` only
 * lifts the FAB clear of the bottom bar), so it already satisfied the spec's
 * "exists at every width — not phone-only".
 */
export const SCANNER_TOGGLE_EVENT = 'br:scanner:toggle'

/** Open or close the single Scanner from anywhere. */
export function toggleScanner(): void {
  window.dispatchEvent(new CustomEvent(SCANNER_TOGGLE_EVENT))
}

export default function ScannerFab() {
  /*
   * The only thing `phone` decides is where the FAB sits: lifted clear of the
   * bottom bar's full box (58px + the home-indicator inset) instead of 20px off
   * the floor. It never decides *whether* the FAB renders — §5.5 and the
   * wireframe both keep it at every width. The phone bar's centre Scan slot is
   * a second trigger for this same panel, not a replacement for it; see the doc
   * block above `SCANNER_TOGGLE_EVENT`.
   */
  const phone = useViewport() === 'phone'
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<(typeof CONTEXTS)[number]['key']>('pack')
  const [continuous, setContinuous] = useState(true)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  
  const panel = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const codeReader = useRef<BrowserMultiFormatReader | null>(null)

  // 1. Keyboard Wedge Shortcut & Esc/Outside Click
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (open && e.key === 'Escape') setOpen(false)
    }
    const away = (e: Event) => {
      if (open && e.target instanceof Element && !e.target.closest('[data-scanner]')) {
        setOpen(false)
      }
    }
    /* The phone bar's centre Scan slot — same panel, not a second scanner. */
    const external = () => setOpen((v) => !v)
    document.addEventListener('keydown', handleKey)
    document.addEventListener('pointerdown', away)
    window.addEventListener(SCANNER_TOGGLE_EVENT, external)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('pointerdown', away)
      window.removeEventListener(SCANNER_TOGGLE_EVENT, external)
    }
  }, [open])

  // 2. Camera Mount/Unmount (ZXing Web Fallback)
  useEffect(() => {
    if (!open) {
      (codeReader.current as any)?.reset()
      codeReader.current = null
      setCameraError(null)
      return
    }

    if (!codeReader.current) {
      codeReader.current = new BrowserMultiFormatReader()
    }

    let isMounted = true
    setCameraError(null)

    if (videoRef.current) {
      // Decode from default video device
      codeReader.current.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result && isMounted) {
          handleScan(result.getText())
        }
      }).catch(e => {
        if (isMounted) {
          console.warn('Scanner init failed', e)
          setCameraError('Camera unavailable or permission denied. Use manual code entry below.')
        }
      })
    }

    return () => {
      isMounted = false
      ;(codeReader.current as any)?.reset()
    }
  }, [open, continuous]) // re-mounts on open

  // 3. Audio & Haptic Feedback Engine
  const playTone = (type: NonNullable<Feedback>['tone']) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return
      const ctx = new AudioContextClass()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      if (type === 'ok') {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        gain.gain.setValueAtTime(0.5, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.1)
      } else if (type === 'duplicate') {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.1)
        
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'sine'
        osc2.frequency.setValueAtTime(440, ctx.currentTime + 0.15)
        gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15)
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start(ctx.currentTime + 0.15)
        osc2.stop(ctx.currentTime + 0.25)
      } else {
        // Error / Unknown buzz
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(150, ctx.currentTime)
        gain.gain.setValueAtTime(0.4, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.3)
      }
    } catch(e) {}
  }

  const fire = (tone: NonNullable<Feedback>['tone'], text: string) => {
    playTone(tone)
    if ('vibrate' in navigator) navigator.vibrate(tone === 'ok' ? 30 : tone === 'duplicate' ? [30, 40, 30] : [40, 60, 40])
    
    setFeedback({ tone, text })
    window.setTimeout(() => setFeedback(null), 2600)
  }

  const handleScan = (code: string) => {
    const c = code.trim().toUpperCase()
    if (!c) return
    
    // Simulate real responses (since Engine isn't fully wired)
    if (c.includes('ERR')) fire('wrong-job', `${c} belongs to another job`)
    else if (c.includes('XXX')) fire('unknown', 'Not a Babin code')
    else if (c.includes('DUP')) fire('duplicate', `${c} already scanned`)
    else fire('ok', `${c} — ticked`)

    if (inputRef.current) inputRef.current.value = ''
    if (!continuous) setOpen(false)
  }

  const tone = feedback?.tone
  const bannerBg = tone === 'ok' ? 'var(--st-in-bg)' : tone === 'wrong-job' ? 'var(--st-danger-bg)' : 'var(--st-progress-bg)'
  const bannerFg = tone === 'ok' ? 'var(--st-in-fg)' : tone === 'wrong-job' ? 'var(--st-danger-fg)' : 'var(--st-progress-fg)'

  return (
    <div
      data-scanner
      data-floor="true"
      style={{
        position: 'fixed',
        right: 20,
        bottom: phone ? `calc(16px + ${BAR_BOX})` : 20,
        zIndex: 60,
      }}
    >
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Scanner"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 62,
            width: 292,
            padding: 14,
            borderRadius: 'var(--r-card)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Scanner</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close scanner"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                /* Law 15 — 44×44, and this panel is now reachable from the phone
                   bar's Scan slot, so it is a thumb target. `-10px` margin keeps
                   the icon optically where the render puts it while the hit area
                   grows outward. */
                minWidth: 44,
                minHeight: 44,
                margin: -10,
                display: 'grid',
                placeItems: 'center',
              }}
              title="Close (Esc)"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 10 }}>
            {CONTEXTS.find(c => c.key === context)?.hint || 'Select context'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 'var(--sp-md)' }}>
            {CONTEXTS.map((c) => {
              const on = context === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setContext(c.key)}
                  aria-pressed={on}
                  title={c.hint}
                  style={{
                    /* Law 15 — 44 minimum, not the render's 30. These six are
                       the gate contexts (Packing · Handover · Return · Reset),
                       and PLAN.md §0 calls a gate accessibility failure a
                       release blocker. Laws outrank the wireframe's
                       proportions. */
                    minHeight: 44,
                    borderRadius: 7,
                    border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                    background: on ? 'var(--st-primary-bg)' : 'transparent',
                    color: on ? 'var(--st-primary-fg)' : 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: on ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {c.label}
                </button>
              )
            })}
          </div>

          {/* Camera Viewfinder */}
          <div style={{ 
            position: 'relative', 
            height: 160, 
            background: '#000',
            borderRadius: 'var(--r-sm)',
            overflow: 'hidden',
            marginBottom: 10,
            border: feedback ? `2px solid ${bannerBg}` : '1px solid transparent'
          }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            
            {cameraError ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-md)', textAlign: 'center', color: 'var(--st-danger-fg)', fontSize: 'var(--t-meta)', background: 'rgba(0,0,0,0.85)' }}>
                <Icon name="alert_triangle" size={22} style={{ marginBottom: 6 }} />
                <span>{cameraError}</span>
              </div>
            ) : (
              <div style={{ position: 'absolute', inset: '15%', border: '1.5px dashed rgba(255,255,255,0.4)', borderRadius: 'var(--r-input)', pointerEvents: 'none' }} />
            )}
          </div>

          {/* Manual Entry */}
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Type code or use wedge scanner..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleScan(e.currentTarget.value)
              }}
              style={{
                width: '100%',
                /* Law 15. `--app-bg` was never defined in `theme.css` and had no
                   fallback, so this field painted transparent in both themes —
                   the token is `--app`. */
                height: 44,
                padding: '0 12px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--app)',
                color: 'var(--text)',
                fontSize: 'var(--t-ui)',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginTop: 11, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <input type="checkbox" checked={continuous} onChange={() => setContinuous((v) => !v)} />
            Continuous mode — keep scanning
          </label>

          {feedback && (
            <div
              role="status"
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 'var(--r-sm)',
                background: bannerBg,
                color: bannerFg,
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Icon name={tone === 'ok' ? 'checklist' : tone === 'wrong-job' ? 'alert_triangle' : 'error'} size={14} fill />
              {feedback.text}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Scanner"
        aria-expanded={open}
        style={{
          width: 52,
          height: 52,
          borderRadius: 'var(--r-badge)',
          border: 'none',
          background: 'var(--btn-primary-bg)',
          color: 'var(--btn-primary-fg)',
          boxShadow: 'var(--shadow-modal)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="search" size={22} />
      </button>
    </div>
  )
}
