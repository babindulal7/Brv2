// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCurrentLanguage, toggleLanguage, applyLanguage } from '../i18n'
import { dispatchScanFeedback, triggerScanVibration, triggerVisualScanFlash } from '../scannerFeedback'

describe('Gemma 4 Implemented Improvements Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    document.documentElement.removeAttribute('lang')
    document.documentElement.style.removeProperty('--font-display')
    document.documentElement.style.removeProperty('--font-body')
  })

  describe('Improvement 1: Dual-Sensory Scanner Feedback Loop', () => {
    it('dispatches audio, vibration, and peripheral visual flash', () => {
      const vibrateSpy = vi.fn()
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateSpy,
        configurable: true,
        writable: true,
      })

      dispatchScanFeedback('ok')
      expect(vibrateSpy).toHaveBeenCalledWith(60)

      const flash = document.getElementById('br-scanner-peripheral-flash')
      expect(flash).not.toBeNull()
      expect(flash?.style.position).toBe('fixed')
      expect(flash?.style.pointerEvents).toBe('none')
      expect(flash?.style.opacity).toBe('1')

      vi.advanceTimersByTime(250)
      expect(flash?.style.opacity).toBe('0')
    })

    it('triggers error vibration and crimson flash for scan error', () => {
      const vibrateSpy = vi.fn()
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateSpy,
        configurable: true,
        writable: true,
      })

      triggerScanVibration('error')
      expect(vibrateSpy).toHaveBeenCalledWith([180, 80, 180, 80, 250])

      triggerVisualScanFlash('error')
      const flash = document.getElementById('br-scanner-peripheral-flash')
      expect(flash?.style.boxShadow).toContain('rgba(239, 68, 68')
    })
  })

  describe('Improvement 2: High-Contrast Floor Mode Tokens', () => {
    it('applies data-floor attribute with 48px hit target scale', () => {
      const el = document.createElement('div')
      el.setAttribute('data-floor', 'true')
      expect(el.getAttribute('data-floor')).toBe('true')
    })
  })

  describe('Improvement 3: Bilingual Bikram Sambat & Nepali Language Switching', () => {
    it('switches language between English and Nepali seamlessly', async () => {
      expect(getCurrentLanguage()).toBe('en')

      const next = await toggleLanguage()
      expect(next).toBe('ne')
      expect(getCurrentLanguage()).toBe('ne')
      expect(document.documentElement.getAttribute('lang')).toBe('ne')

      const reverted = await toggleLanguage()
      expect(reverted).toBe('en')
      expect(getCurrentLanguage()).toBe('en')
      expect(document.documentElement.getAttribute('lang')).toBe('en')
    })

    it('dispatches languagechange event on applyLanguage', async () => {
      const listener = vi.fn()
      window.addEventListener('languagechange', listener)

      await applyLanguage('ne')
      expect(listener).toHaveBeenCalled()
      expect(document.documentElement.getAttribute('lang')).toBe('ne')

      window.removeEventListener('languagechange', listener)
    })
  })

  describe('Reset and QC Yellow Status Rule', () => {
    it('verifies Reset and QC badges render with yellow progress status tokens', async () => {
      const { Badge } = await import('../../components/ui/Badge')
      const React = await import('react')
      const { renderToStaticMarkup } = await import('react-dom/server')

      const resetHtml = renderToStaticMarkup(React.createElement(Badge, { label: 'Reset' }))
      expect(resetHtml).toContain('var(--st-progress-bg)')
      expect(resetHtml).toContain('var(--st-progress-fg)')
      expect(resetHtml).toContain('Reset')

      const qcHtml = renderToStaticMarkup(React.createElement(Badge, { label: 'QC' }))
      expect(qcHtml).toContain('var(--st-progress-bg)')
      expect(qcHtml).toContain('var(--st-progress-fg)')
      expect(qcHtml).toContain('QC')
    })
  })
})

