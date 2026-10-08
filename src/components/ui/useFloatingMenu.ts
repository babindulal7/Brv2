import { useLayoutEffect, useState, type RefObject } from 'react'

/** Fixed body portals escape cards/tables and flip above cramped anchors. */
export function useFloatingMenu(open: boolean, triggerRef: RefObject<HTMLElement>, menuRef: RefObject<HTMLElement>, revision: string | null = null) {
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const anchor = triggerRef.current?.getBoundingClientRect()
      const menu = menuRef.current
      if (!anchor || !menu) return
      const width = Math.min(230, Math.max(0, window.innerWidth - 16))
      const below = Math.max(0, window.innerHeight - anchor.bottom - 12)
      const above = Math.max(0, anchor.top - 12)
      const height = Math.min(menu.scrollHeight, Math.max(above, below))
      const up = menu.scrollHeight > below && above > below
      setPosition({
        top: Math.max(8, up ? anchor.top - 4 - height : Math.min(anchor.bottom + 4, window.innerHeight - 8 - height)),
        left: Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8)),
        width,
        maxHeight: up ? above : below,
      })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, revision, triggerRef, menuRef])
  return position
}
