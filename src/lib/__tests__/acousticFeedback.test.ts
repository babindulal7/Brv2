// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  playScanSuccess,
  playScanError,
  playCaseComplete,
  playDamageAlert,
  unlockAudioContext,
  isAudioFeedbackMuted,
  setAudioFeedbackMuted,
  _resetAudioContextForTesting,
} from '../acousticFeedback'


describe('acousticFeedback engine', () => {
  let mockOscillator: {
    type: string
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> }
    connect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }
  let mockGain: {
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
    }
    connect: ReturnType<typeof vi.fn>
  }
  let mockAudioContext: {
    currentTime: number
    state: string
    resume: ReturnType<typeof vi.fn>
    destination: Record<string, unknown>
    createOscillator: ReturnType<typeof vi.fn>
    createGain: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    localStorage.clear()
    _resetAudioContextForTesting()

    mockOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }

    mockAudioContext = {
      currentTime: 10,
      state: 'running',
      resume: vi.fn(),
      destination: {},
      createOscillator: vi.fn().mockImplementation(() => mockOscillator),
      createGain: vi.fn().mockImplementation(() => mockGain),
    }

    const MockAudioCtx = vi.fn().mockImplementation(() => mockAudioContext)
    vi.stubGlobal('AudioContext', MockAudioCtx)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('manages mute setting state in localStorage', () => {
    expect(isAudioFeedbackMuted()).toBe(false)
    setAudioFeedbackMuted(true)
    expect(isAudioFeedbackMuted()).toBe(true)
    setAudioFeedbackMuted(false)
    expect(isAudioFeedbackMuted()).toBe(false)
  })

  it('plays 880 Hz sine wave tone on playScanSuccess()', () => {
    playScanSuccess()
    expect(mockAudioContext.createOscillator).toHaveBeenCalled()
    expect(mockOscillator.type).toBe('sine')
    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 10)
    expect(mockOscillator.start).toHaveBeenCalledWith(10)
  })

  it('plays 220 Hz square wave tone on playScanError()', () => {
    playScanError()
    expect(mockAudioContext.createOscillator).toHaveBeenCalled()
    expect(mockOscillator.type).toBe('square')
    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(220, 10)
    expect(mockOscillator.start).toHaveBeenCalledWith(10)
  })

  it('plays two harmonic tones on playCaseComplete()', () => {
    playCaseComplete()
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('plays dissonant minor-second warning on playDamageAlert()', () => {
    playDamageAlert()
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2)
    expect(mockOscillator.type).toBe('sawtooth')
  })

  it('unlocks suspended audio context on unlockAudioContext()', () => {
    mockAudioContext.state = 'suspended'
    unlockAudioContext()
    expect(mockAudioContext.resume).toHaveBeenCalled()
  })

  it('suppresses audio synthesis when muted', () => {
    setAudioFeedbackMuted(true)
    playScanSuccess()
    playScanError()
    playCaseComplete()
    playDamageAlert()
    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled()
  })
})

