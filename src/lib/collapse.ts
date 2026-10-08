import { useCallback, useState } from 'react'
import { readLocal, writeLocal } from './safeStorage'

const PREFIX = 'br-collapsed:'

/*
 * ⛔ This module white-screened the iPad, and only the iPad.
 *
 * `useCollapsed` is called by `Sidebar`, which renders at tablet width and up,
 * and it read `window.localStorage` during render, unguarded, OUTSIDE any
 * ErrorBoundary. WebKit throws SecurityError on that access under Lockdown
 * Mode or "Block All Cookies" — so an iPad blanked on the first authenticated
 * paint while a phone-width device, which never renders the Sidebar, did not.
 * That asymmetry is exactly what made the bug look like a network problem.
 */
function readCollapsed(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue
  const raw = readLocal(PREFIX + key)
  return raw === null ? defaultValue : raw === '1'
}

/**
 * Persists a panel's open/closed state per key — usually a route path, or an
 * explicit id when a page carries more than one collapsible panel. A rail a
 * user closed stays closed on the next visit, the same way `textSize.ts`
 * persists the text-size setting.
 */
export function useCollapsed(key: string, defaultValue = false): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(key, defaultValue))
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      /* The panel still collapses on a device that cannot remember it. */
      writeLocal(PREFIX + key, next ? '1' : '0')
      return next
    })
  }, [key])
  return [collapsed, toggle]
}
