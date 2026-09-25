/**
 * **Scanner Audio & Haptic Feedback Engine — AUD-002**
 *
 * Provides immediate auditory and tactile feedback for warehouse scanning:
 * - 'ok': Crisp high-pitch double chime (880Hz -> 1760Hz) + single gentle haptic tap
 * - 'wrong': Low warning buzz (180Hz square wave) + double warning vibration pulse
 * - 'error': Low error double buzz (140Hz) + heavy vibration pulse
 */

export type ScanFeedbackTone = 'ok' | 'wrong' | 'error'

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass()
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume()
    }
    return audioCtx
  } catch {
    return null
  }
}

/**
 * Plays a distinct sound chime for scan results.
 */
export function playScanSound(tone: ScanFeedbackTone): void {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime

    if (tone === 'ok') {
      // Pleasant high-pitch double chime (880Hz A5 -> 1760Hz A6)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, now)
      gain1.gain.setValueAtTime(0.15, now)
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.08)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(1760, now + 0.09)
      gain2.gain.setValueAtTime(0.2, now + 0.09)
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.18)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.09)
      osc2.stop(now + 0.18)
    } else if (tone === 'wrong') {
      // Low square buzz for unrecognized / wrong item
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(180, now)
      gain.gain.setValueAtTime(0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.25)
    } else {
      // Lower double buzz for query/network error
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(140, now)
      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.3)
    }
  } catch {
    // Audio playback failures (e.g. autoplay policy) gracefully ignored
  }
}

/**
 * Triggers haptic vibration feedback on supported mobile devices.
 */
export function triggerScanVibration(tone: ScanFeedbackTone): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  try {
    if (tone === 'ok') {
      navigator.vibrate(60) // Single crisp tap
    } else if (tone === 'wrong') {
      navigator.vibrate([120, 60, 120]) // Warning double pulse
    } else {
      navigator.vibrate([180, 80, 180, 80, 250]) // Heavy error pulse
    }
  } catch {
    // Ignored in non-vibrating environments
  }
}

/**
 * **Peripheral Visual Scan Flash — High-Velocity Warehouse Ergonomics**
 *
 * Flashes a high-saturation full-screen inset glow for 220ms on barcode scan:
 * - 'ok': Vibrant Emerald Green (#10B981)
 * - 'wrong': Warning Amber (#F59E0B)
 * - 'error': High-visibility Crimson (#EF4444)
 *
 * Provides instant peripheral confirmation so floor operators wearing protective
 * glasses or working in glare do not need to pause and read small text.
 */
export function triggerVisualScanFlash(tone: ScanFeedbackTone): void {
  if (typeof document === 'undefined') return
  const id = 'br-scanner-peripheral-flash'
  let flashEl = document.getElementById(id)
  if (!flashEl) {
    flashEl = document.createElement('div')
    flashEl.id = id
    flashEl.setAttribute('aria-hidden', 'true')
    flashEl.style.position = 'fixed'
    flashEl.style.inset = '0'
    flashEl.style.pointerEvents = 'none'
    flashEl.style.zIndex = '99999'
    flashEl.style.transition = 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
    document.body.appendChild(flashEl)
  }

  const color = tone === 'ok'
    ? 'rgba(16, 185, 129, 0.5)'
    : tone === 'wrong'
    ? 'rgba(245, 158, 11, 0.55)'
    : 'rgba(239, 68, 68, 0.6)'

  const border = tone === 'ok'
    ? '6px solid rgba(16, 185, 129, 0.95)'
    : tone === 'wrong'
    ? '6px solid rgba(245, 158, 11, 0.95)'
    : '6px solid rgba(239, 68, 68, 0.95)'

  flashEl.style.boxShadow = `inset 0 0 50px ${color}`
  flashEl.style.border = border
  flashEl.style.opacity = '1'

  setTimeout(() => {
    if (flashEl) {
      flashEl.style.opacity = '0'
      flashEl.style.boxShadow = 'none'
      flashEl.style.border = 'none'
    }
  }, 220)
}

/**
 * Unified dispatch helper: triggers audio chime, haptic vibration, and peripheral visual flash.
 */
export function dispatchScanFeedback(tone: ScanFeedbackTone): void {
  playScanSound(tone)
  triggerScanVibration(tone)
  triggerVisualScanFlash(tone)
}

