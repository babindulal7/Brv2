import { useCallback, useState } from 'react'

const PREFIX = 'br-collapsed:'

function readCollapsed(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue
  const raw = window.localStorage.getItem(PREFIX + key)
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
      window.localStorage.setItem(PREFIX + key, next ? '1' : '0')
      return next
    })
  }, [key])
  return [collapsed, toggle]
}
