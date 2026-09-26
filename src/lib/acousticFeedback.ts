/**
 * # Acoustic Feedback Engine for Warehouse Floor Operations
 *
 * Implements standard acoustic feedback for barcode scanning per Booqable audit §11:
 *  - Scan Success: 880 Hz affirmative sine wave tone (120ms)
 *  - Scan Collision / Error: 220 Hz low warning buzz (250ms square wave)
 *  - Case Complete: Dual harmonic chime (587 Hz -> 880 Hz)
 *
 * Fully offline-capable using browser Web Audio API with zero external audio assets.
 */
let audioCtx: AudioContext | null = null
let activeNodes: Array<{ stop: (when?: number) => void }> = []

function stopActiveNodes(): void {
  for (const node of activeNodes) {
    try {
      node.stop()
    } catch {
      // already stopped or discarded
    }
  }
  activeNodes = []
}

export function _resetAudioContextForTesting(): void {
  stopActiveNodes()
  audioCtx = null
}

export function unlockAudioContext(): void {
  if (typeof window === 'undefined') return
  const ctx = getAudioContext()
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume()
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass()
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume()
    }
    return audioCtx
  } catch {
    return null
  }
}

export function isAudioFeedbackMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem('br-audio-feedback-muted') === 'true'
  } catch {
    return false
  }
}

export function setAudioFeedbackMuted(muted: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('br-audio-feedback-muted', muted ? 'true' : 'false')
  } catch {
    // LocalStorage restricted
  }
}

/**
 * Plays an affirmative high-frequency chime on successful item barcode scan (880 Hz).
 * Halts any currently sounding tones to prevent distortion on rapid scanning.
 */
export function playScanSuccess(): void {
  if (isAudioFeedbackMuted()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    stopActiveNodes()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime) // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.12)
    activeNodes.push(osc)
  } catch {
    // Audio synthesis failure non-fatal
  }
}

/**
 * Plays a low-frequency alert buzz on scan collision, wrong item, or scan error (220 Hz).
 * Halts any currently sounding tones to prevent distortion on rapid scanning.
 */
export function playScanError(): void {
  if (isAudioFeedbackMuted()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    stopActiveNodes()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'square'
    osc.frequency.setValueAtTime(220, ctx.currentTime) // A3 low buzz

    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)
    activeNodes.push(osc)
  } catch {
    // Audio synthesis failure non-fatal
  }
}

/**
 * Plays a celebratory two-tone chord when an entire flight case or package finishes packing (587 Hz -> 880 Hz).
 */
export function playCaseComplete(): void {
  if (isAudioFeedbackMuted()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    stopActiveNodes()
    const now = ctx.currentTime

    // Note 1: D5 (587.3 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0.14, now)
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.15)

    // Note 2: A5 (880 Hz)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, now + 0.1)
    gain2.gain.setValueAtTime(0.16, now + 0.1)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.1)
    osc2.stop(now + 0.3)

    activeNodes.push(osc1, osc2)
  } catch {
    // Audio synthesis failure non-fatal
  }
}

/**
 * Plays a dissonant minor-second warning clash (440 Hz + 466.16 Hz) to signal
 * damage, optical failure, or QC rejection during warehouse inspection.
 */
export function playDamageAlert(): void {
  if (isAudioFeedbackMuted()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    stopActiveNodes()
    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'sawtooth'
    osc1.frequency.setValueAtTime(440, now) // A4
    osc2.type = 'sawtooth'
    osc2.frequency.setValueAtTime(466.16, now) // Bb4 (dissonant clash)

    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.35)
    osc2.stop(now + 0.35)

    activeNodes.push(osc1, osc2)
  } catch {
    // Audio synthesis failure non-fatal
  }
}

