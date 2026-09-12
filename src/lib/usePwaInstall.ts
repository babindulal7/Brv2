import { useEffect, useMemo, useState } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

let deferredPrompt: BeforeInstallPromptEvent | null = null
let appInstalledFlag = false
const subscribers = new Set<() => void>()

function notifySubscribers() {
  subscribers.forEach((cb) => {
    try {
      cb()
    } catch {
      /* ignore subscriber error */
    }
  })
}

/**
 * Checks if the current app instance is running as an installed PWA / standalone application.
 */
export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false
  if (appInstalledFlag) return true

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    document.referrer?.includes('android-app://') === true ||
    window.location?.search?.includes('source=pwa') === true

  return isStandalone
}

// Module-level registration captures beforeinstallprompt even if fired before components mount
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent mini-infobar on mobile
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notifySubscribers()
  })

  window.addEventListener('appinstalled', () => {
    appInstalledFlag = true
    deferredPrompt = null
    notifySubscribers()
  })
}

/**
 * Internal testing helper to inject or reset the deferred install prompt.
 */
export function _setDeferredPromptForTesting(prompt: BeforeInstallPromptEvent | null, installed = false) {
  deferredPrompt = prompt
  appInstalledFlag = installed
  notifySubscribers()
}

/**
 * Trigger the native PWA install prompt if available.
 */
export async function promptPwaInstall(): Promise<InstallOutcome> {
  if (!deferredPrompt) return 'unavailable'
  try {
    const promptEvent = deferredPrompt
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === 'accepted') {
      appInstalledFlag = true
      deferredPrompt = null
    }
    notifySubscribers()
    return choice.outcome
  } catch {
    return 'unavailable'
  }
}

export interface UsePwaInstallResult {
  /** True if the browser has provided an install prompt or iOS manual install applies and app is not installed */
  canInstall: boolean
  /** True if running standalone or appinstalled event has fired */
  isInstalled: boolean
  /** True if the beforeinstallprompt event is captured and available for triggering */
  hasPrompt: boolean
  /** True if running on iOS WebKit Safari where beforeinstallprompt does not exist */
  isIos: boolean
  /** Trigger the install dialog */
  promptInstall: () => Promise<InstallOutcome>
}

/**
 * Hook to inspect PWA installation capability and trigger beforeinstallprompt.
 */
export function usePwaInstall(): UsePwaInstallResult {
  const [installed, setInstalled] = useState<boolean>(() => isAppInstalled())
  const [hasPrompt, setHasPrompt] = useState<boolean>(() => deferredPrompt !== null)

  useEffect(() => {
    const update = () => {
      setInstalled(isAppInstalled())
      setHasPrompt(deferredPrompt !== null)
    }

    subscribers.add(update)

    let mq: MediaQueryList | null = null
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        mq = window.matchMedia('(display-mode: standalone)')
        if (mq.addEventListener) {
          mq.addEventListener('change', update)
        } else if ('addListener' in mq) {
          // Safari 13 compatibility
          ;(mq as unknown as { addListener: (cb: () => void) => void }).addListener(update)
        }
      }
    } catch {
      /* ignore mediaQuery errors */
    }

    return () => {
      subscribers.delete(update)
      if (mq) {
        if (mq.removeEventListener) {
          mq.removeEventListener('change', update)
        } else if ('removeListener' in mq) {
          ;(mq as unknown as { removeListener: (cb: () => void) => void }).removeListener(update)
        }
      }
    }
  }, [])

  const isIos = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent || '') &&
      !(window as unknown as { MSStream?: unknown }).MSStream
    )
  }, [])

  return {
    canInstall: !installed && (hasPrompt || isIos),
    isInstalled: installed,
    hasPrompt,
    isIos,
    promptInstall: promptPwaInstall,
  }
}
