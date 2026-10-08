// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DataAgeBadge, formatRelativeAge } from '../DataAgeBadge'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('DataAgeBadge — Phase 9 operational data age tracking (PLAN.md §4.27)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
    vi.useRealTimers()
  })

  describe('formatRelativeAge', () => {
    it('formats durations under 45s as "Just now"', () => {
      expect(formatRelativeAge(0)).toBe('Just now')
      expect(formatRelativeAge(30_000)).toBe('Just now')
      expect(formatRelativeAge(44_000)).toBe('Just now')
    })

    it('formats minute ranges accurately', () => {
      expect(formatRelativeAge(60_000)).toBe('1m ago')
      expect(formatRelativeAge(5 * 60_000)).toBe('5m ago')
      expect(formatRelativeAge(59 * 60_000)).toBe('59m ago')
    })

    it('formats hour ranges accurately', () => {
      expect(formatRelativeAge(60 * 60_000)).toBe('1h ago')
      expect(formatRelativeAge(3 * 3_600_000)).toBe('3h ago')
    })

    it('formats day ranges accurately', () => {
      expect(formatRelativeAge(24 * 3_600_000)).toBe('1d ago')
      expect(formatRelativeAge(3 * 86_400_000)).toBe('3d ago')
    })
  })

  describe('component rendering', () => {
    it('renders "No cache" when loadedAt is undefined or null', () => {
      act(() => {
        root!.render(<DataAgeBadge />)
      })
      expect(host!.textContent).toContain('No cache')
    })

    it('renders fresh age with "Updated Just now" when newly loaded', () => {
      const now = Date.now()
      vi.setSystemTime(now)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={now} />)
      })
      expect(host!.textContent).toContain('Updated Just now')
    })

    it('marks data as "Stale" once the staleThresholdMs is crossed', () => {
      const start = Date.now()
      vi.setSystemTime(start)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={start} staleThresholdMs={10 * 60 * 1000} />)
      })
      expect(host!.textContent).toContain('Updated Just now')

      // Advance past 10 minutes
      vi.setSystemTime(start + 11 * 60 * 1000)
      act(() => {
        root!.render(<DataAgeBadge loadedAt={start} staleThresholdMs={10 * 60 * 1000} />)
      })
      expect(host!.textContent).toContain('Stale · 11m ago')
    })

    it('renders accessible refresh button with 44px hit target (Law 15)', () => {
      const onRefresh = vi.fn()
      act(() => {
        root!.render(<DataAgeBadge loadedAt={Date.now()} onRefresh={onRefresh} />)
      })

      const btn = host!.querySelector('button[aria-label="Refresh data"]') as HTMLButtonElement
      expect(btn).not.toBeNull()
      expect(btn.style.minWidth).toBe('44px')
      expect(btn.style.minHeight).toBe('44px')

      act(() => {
        btn.click()
      })
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })
})
