// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  usePwaInstall,
  isAppInstalled,
  promptPwaInstall,
  _setDeferredPromptForTesting,
  type BeforeInstallPromptEvent,
} from '../usePwaInstall'
import { PwaInstallControl } from '../../components/ui/PwaInstallControl'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('usePwaInstall & PWA install flows (PLAN.md Phase 10)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    _setDeferredPromptForTesting(null, false)
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
    _setDeferredPromptForTesting(null, false)
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
  })

  describe('isAppInstalled detection', () => {
    it('detects display-mode: standalone from matchMedia', () => {
      const origMatchMedia = window.matchMedia
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      expect(isAppInstalled()).toBe(true)
      window.matchMedia = origMatchMedia
    })

    it('detects iOS navigator.standalone', () => {
      const origNavigator = window.navigator
      Object.defineProperty(window, 'navigator', {
        value: { ...origNavigator, standalone: true },
        configurable: true,
      })

      expect(isAppInstalled()).toBe(true)

      Object.defineProperty(window, 'navigator', {
        value: origNavigator,
        configurable: true,
      })
    })

    it('detects source=pwa in query params', () => {
      window.history.replaceState(null, '', '/?source=pwa')
      expect(isAppInstalled()).toBe(true)
      window.history.replaceState(null, '', '/')
    })
  })

  describe('promptPwaInstall and deferred prompt handling', () => {
    it('returns unavailable when no prompt is deferred', async () => {
      const outcome = await promptPwaInstall()
      expect(outcome).toBe('unavailable')
    })

    it('calls prompt() and resolves accepted outcome', async () => {
      const promptMock = vi.fn().mockResolvedValue(undefined)
      const mockEvent: BeforeInstallPromptEvent = {
        platforms: ['web'],
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
        prompt: promptMock,
      } as unknown as BeforeInstallPromptEvent

      _setDeferredPromptForTesting(mockEvent, false)

      const outcome = await promptPwaInstall()
      expect(promptMock).toHaveBeenCalled()
      expect(outcome).toBe('accepted')
      expect(isAppInstalled()).toBe(true)
    })

    it('calls prompt() and resolves dismissed outcome without marking installed', async () => {
      const promptMock = vi.fn().mockResolvedValue(undefined)
      const mockEvent: BeforeInstallPromptEvent = {
        platforms: ['web'],
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
        prompt: promptMock,
      } as unknown as BeforeInstallPromptEvent

      _setDeferredPromptForTesting(mockEvent, false)

      const outcome = await promptPwaInstall()
      expect(promptMock).toHaveBeenCalled()
      expect(outcome).toBe('dismissed')
    })
  })

  describe('usePwaInstall hook in component', () => {
    function TestHookConsumer() {
      const { canInstall, isInstalled, hasPrompt } = usePwaInstall()
      return (
        <div data-testid="hook-state">
          <span data-testid="canInstall">{canInstall ? 'yes' : 'no'}</span>
          <span data-testid="isInstalled">{isInstalled ? 'yes' : 'no'}</span>
          <span data-testid="hasPrompt">{hasPrompt ? 'yes' : 'no'}</span>
        </div>
      )
    }

    it('updates state dynamically when deferred prompt is injected or cleared', () => {
      act(() => {
        root!.render(<TestHookConsumer />)
      })

      const el = host!.querySelector('[data-testid="hook-state"]')!
      expect(el.querySelector('[data-testid="canInstall"]')!.textContent).toBe('no')
      expect(el.querySelector('[data-testid="hasPrompt"]')!.textContent).toBe('no')

      const mockEvent = {
        platforms: ['web'],
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
        prompt: vi.fn(),
      } as unknown as BeforeInstallPromptEvent

      act(() => {
        _setDeferredPromptForTesting(mockEvent, false)
      })

      expect(el.querySelector('[data-testid="canInstall"]')!.textContent).toBe('yes')
      expect(el.querySelector('[data-testid="hasPrompt"]')!.textContent).toBe('yes')
      expect(el.querySelector('[data-testid="isInstalled"]')!.textContent).toBe('no')

      act(() => {
        _setDeferredPromptForTesting(null, true)
      })

      expect(el.querySelector('[data-testid="canInstall"]')!.textContent).toBe('no')
      expect(el.querySelector('[data-testid="isInstalled"]')!.textContent).toBe('yes')
    })
  })

  describe('PwaInstallControl component rendering', () => {
    it('renders fallback when no prompt is available and not installed', () => {
      act(() => {
        root!.render(<PwaInstallControl />)
      })

      expect(host!.textContent).toContain('Available in supported browsers')
    })

    it('renders Install App button when prompt is available', () => {
      const mockEvent = {
        platforms: ['web'],
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
        prompt: vi.fn(),
      } as unknown as BeforeInstallPromptEvent

      _setDeferredPromptForTesting(mockEvent, false)
      act(() => {
        root!.render(<PwaInstallControl />)
      })

      const btn = host!.querySelector('button')
      expect(btn).not.toBeNull()
      expect(btn!.textContent).toContain('Install App')
    })

    it('renders Installed (Standalone) badge when app is installed', () => {
      _setDeferredPromptForTesting(null, true)
      act(() => {
        root!.render(<PwaInstallControl />)
      })

      expect(host!.textContent).toContain('Installed (Standalone)')
      expect(host!.querySelector('button')).toBeNull()
    })
  })
})
