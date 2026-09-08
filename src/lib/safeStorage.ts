/**
 * # `localStorage` is not a safe operation on WebKit
 *
 * **Found 8 Sep 2026**, diagnosing an app that loaded on an Android phone and
 * showed a blank white page on every Apple device. Every iOS/iPadOS browser is
 * WebKit — Chrome on iPad is Safari's engine wearing Chrome's UI — so
 * "works in Chrome on the phone, fails in Chrome on the iPad" was never a
 * browser difference. It was Blink vs WebKit.
 *
 * ## The mechanism
 *
 * Chrome, asked for `localStorage` where storage is unavailable, hands back a
 * working object or `null`. **Safari throws.** Not on the value — on the
 * *property access itself*, as a `SecurityError` — under:
 *
 *  - **Lockdown Mode**
 *  - Settings ▸ Safari ▸ **Block All Cookies**
 *  - some Private Browsing configurations
 *  - an iframe whose storage is partitioned away
 *
 * Nine call sites across four modules read or wrote storage unguarded, and none
 * of them was inside a `try`. Three of the nine sit **above every
 * `ErrorBoundary`** — `theme.tsx`'s `useState` initializer runs during
 * `ThemeProvider`'s first render, and `collapse.ts` is called by `Sidebar`,
 * which renders at tablet width and up. That last one is why an **iPad** failed
 * where a phone-width device did not: the phone never renders the Sidebar.
 *
 * A throw in any of those is not a lost preference. It is a blank page, with no
 * error UI, on a device with no console.
 *
 * ## The contract
 *
 * Every function here is total: it returns a value or does nothing, and it
 * never throws. A device that cannot store preferences must still run the app —
 * losing a remembered theme is a cost worth paying; losing the app is not.
 *
 * Use this for **preferences**. It is deliberately not a cache and not a
 * database: `offlineQueue` and `localStore` own durable state, and they have
 * their own IndexedDB availability guards.
 */

/**
 * Whether storage answered at all. Not memoised: Lockdown Mode can be toggled
 * without reloading the page, and a stale `true` here is the crash this module
 * exists to prevent.
 */
export function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    /* The SecurityError described above — the access itself threw. */
    return false
  }
}

/** Read a key, or `null` when storage is unreadable for any reason. */
export function readLocal(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Write a key. Returns whether it landed, so a caller that must tell the user
 * "this will not be remembered" can — most callers correctly ignore it.
 *
 * Also swallows `QuotaExceededError`, which Safari raises in Private Browsing
 * with a quota of zero: there, `getItem` works and every `setItem` throws.
 */
export function writeLocal(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined') return false
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** Remove a key. Silent when storage is unavailable. */
export function removeLocal(key: string): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
  } catch {
    /* Nothing to remove if nothing could be stored. */
  }
}

/**
 * Every key currently in storage, or `[]`. Used by the settings sweep, which
 * enumerates its own prefix.
 */
export function localKeys(): string[] {
  try {
    if (typeof window === 'undefined') return []
    return Object.keys(window.localStorage)
  } catch {
    return []
  }
}

/**
 * Subscribe to a media query across engines.
 *
 * `MediaQueryList.addEventListener` is **Safari 14+**; 13 and earlier expose
 * only the deprecated `addListener`, and calling the modern one there throws.
 * Both `theme.tsx` and `device.ts` subscribe during a mount effect, so on an
 * older iPad that throw is — again — a blank page rather than a stale value.
 *
 * Returns an unsubscribe that is always safe to call.
 */
export function onMediaChange(query: string, handler: (matches: boolean) => void): () => void {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const mq = window.matchMedia(query)
    const listener = (e: MediaQueryListEvent) => handler(e.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', listener)
      return () => {
        try {
          mq.removeEventListener('change', listener)
        } catch {
          /* Teardown must not throw during unmount. */
        }
      }
    }
    /* Safari ≤ 13 / older Android WebView. */
    const legacy = mq as MediaQueryList & {
      addListener?: (l: (e: MediaQueryListEvent) => void) => void
      removeListener?: (l: (e: MediaQueryListEvent) => void) => void
    }
    if (typeof legacy.addListener === 'function') {
      legacy.addListener(listener)
      return () => {
        try {
          legacy.removeListener?.(listener)
        } catch {
          /* As above. */
        }
      }
    }
    return () => {}
  } catch {
    return () => {}
  }
}
