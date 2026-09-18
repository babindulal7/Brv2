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
      navigator.vibrate(60) // Single short tap
    } else {
      navigator.vibrate([120, 60, 120]) // Warning double pulse
    }
  } catch {
    // Ignored
  }
}

/**
 * Helper to trigger both sound and haptic vibration together.
 */
export function dispatchScanFeedback(tone: ScanFeedbackTone): void {
  playScanSound(tone)
  triggerScanVibration(tone)
}
