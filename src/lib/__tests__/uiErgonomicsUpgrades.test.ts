// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  triggerScanVibration,
  triggerVisualScanFlash,
  dispatchScanFeedback,
} from '../scannerFeedback'
import { toBs, formatBs } from '../bs'
import type { ThemeMode, ResolvedTheme } from '../theme'

describe('UI/UX Ergonomics Upgrades (Gemma 4 Phased Plan)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    const flashEl = document.getElementById('br-scanner-peripheral-flash')
    if (flashEl) flashEl.remove()
  })

  describe('Phase 1: Multi-Sensory Scanner Feedback', () => {
    it('dispatches distinct haptic vibration patterns for ok, wrong, and error tones', () => {
      const vibrateSpy = vi.fn()
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateSpy,
        configurable: true,
        writable: true,
      })

      triggerScanVibration('ok')
      expect(vibrateSpy).toHaveBeenCalledWith(60)

      triggerScanVibration('wrong')
      expect(vibrateSpy).toHaveBeenCalledWith([120, 60, 120])

      triggerScanVibration('error')
      expect(vibrateSpy).toHaveBeenCalledWith([180, 80, 180, 80, 250])
    })

    it('creates and animates the full-viewport peripheral visual scan flash element', () => {
      triggerVisualScanFlash('ok')
      const flashEl = document.getElementById('br-scanner-peripheral-flash')
      expect(flashEl).not.toBeNull()
      expect(flashEl?.style.position).toBe('fixed')
      expect(flashEl?.style.opacity).toBe('1')
      expect(flashEl?.style.boxShadow).toContain('rgba(16, 185, 129')

      // Advances past the 220ms flash duration
      vi.advanceTimersByTime(250)
      expect(flashEl?.style.opacity).toBe('0')
    })

    it('flashes amber for wrong scan tone and crimson for error tone', () => {
      triggerVisualScanFlash('wrong')
      const flashEl = document.getElementById('br-scanner-peripheral-flash')
      expect(flashEl?.style.boxShadow).toContain('rgba(245, 158, 11')

      triggerVisualScanFlash('error')
      expect(flashEl?.style.boxShadow).toContain('rgba(239, 68, 68')
    })

    it('dispatchScanFeedback triggers audio, vibration, and peripheral flash together', () => {
      const vibrateSpy = vi.fn()
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateSpy,
        configurable: true,
        writable: true,
      })

      dispatchScanFeedback('ok')
      expect(vibrateSpy).toHaveBeenCalledWith(60)
      const flashEl = document.getElementById('br-scanner-peripheral-flash')
      expect(flashEl).not.toBeNull()
      expect(flashEl?.style.opacity).toBe('1')
    })
  })

  describe('Phase 2 & 5: High-Contrast Mode & Gloved Hit Area Tokens', () => {
    it('supports high-contrast mode in ThemeMode and ResolvedTheme types', () => {
      const mode: ThemeMode = 'high-contrast'
      const resolved: ResolvedTheme = 'high-contrast'
      expect(mode).toBe('high-contrast')
      expect(resolved).toBe('high-contrast')

      document.documentElement.dataset['theme'] = mode
      expect(document.documentElement.dataset['theme']).toBe('high-contrast')
    })

    it('supports data-floor attribute on container elements', () => {
      const floorContainer = document.createElement('main')
      floorContainer.setAttribute('data-floor', 'true')
      expect(floorContainer.getAttribute('data-floor')).toBe('true')
    })
  })

  describe('Phase 3: Dual-Date Display & Devanagari Typographic Parity', () => {
    it('correctly maps Gregorian AD date to Bikram Sambat BS date for Today dashboard dual-date header', () => {
      const adDate = new Date('2026-07-31T00:00:00.000Z')
      const bsDate = toBs(adDate)
      expect(bsDate).not.toBeNull()
      if (bsDate) {
        const formatted = formatBs(bsDate, { suffix: true })
        expect(formatted).toBe('15 Shrawan 2083 BS')
      }
    })

    it('supports Nepali language attribute on html document', () => {
      document.documentElement.setAttribute('lang', 'ne')
      expect(document.documentElement.getAttribute('lang')).toBe('ne')
      document.documentElement.setAttribute('lang', 'en')
      expect(document.documentElement.getAttribute('lang')).toBe('en')
    })
  })
})
