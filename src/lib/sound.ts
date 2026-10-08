/**
 * POS-style synthesized sound generator using the standard Web Audio API.
 * Operates 100% offline with zero external audio assets or network requests.
 */
import { audioContextClass } from './audioContext'

class SoundEngine {
  private ctx: AudioContext | null = null
  private enabled = true

  constructor() {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('babin_sound_enabled') : null
      this.enabled = stored !== 'false'
    } catch {
      this.enabled = true
    }
  }

  private initContext() {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx = audioContextClass()
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  public setEnabled(val: boolean) {
    this.enabled = val
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('babin_sound_enabled', String(val))
      }
    } catch {}
  }

  /**
   * Crisp, high-frequency beep for successful barcode scan.
   */
  public playScan() {
    if (!this.enabled) return
    const ctx = this.initContext()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(1800, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.06)

    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.08)
  }

  /**
   * Warm two-tone major chord for order completion, check-in, or payment confirmation.
   */
  public playSuccess() {
    if (!this.enabled) return
    const ctx = this.initContext()
    if (!ctx) return

    const tones = [523.25, 659.25, 783.99] // C5, E5, G5
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.04)

      gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.04 + 0.25)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime + idx * 0.04)
      osc.stop(ctx.currentTime + idx * 0.04 + 0.28)
    })
  }

  /**
   * Low double-buzz for conflicts, overdue alerts, or validation errors.
   */
  public playError() {
    if (!this.enabled) return
    const ctx = this.initContext()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(160, ctx.currentTime)
    osc.frequency.setValueAtTime(120, ctx.currentTime + 0.08)

    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.22)
  }

  /**
   * Subtle click for category tabs and steppers.
   */
  public playClick() {
    if (!this.enabled) return
    const ctx = this.initContext()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.03)

    gain.gain.setValueAtTime(0.05, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.04)
  }
}

export const sound = new SoundEngine()
