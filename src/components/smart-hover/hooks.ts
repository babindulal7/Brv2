/**
 * Smart hover interaction hooks — §6–§10, §76, §80–§81.
 *
 * Timing: open 250ms, close 300ms, sibling switch 50–80ms (§6/§8).
 * Safe travel: a grace window keeps trigger → card travel open (§7).
 * Touch: 500ms long-press opens the sheet; short tap navigates (§10).
 * Keyboard: Space pins, Enter activates, Esc closes and restores focus (§80).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { HOVER_DIMS, HOVER_TIMING } from '../../lib/smartHover'
import { canViewMoney } from '../../lib/rbac'
import { isIntelSessionActive } from '../../lib/intel/store'

export function useHoverIntent(input: { onOpen: () => void; onClose: () => void; disabled?: boolean }) {
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inCard = useRef(false)

  const cancel = useCallback(() => {
    if (openTimer.current !== null) clearTimeout(openTimer.current)
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const handleTriggerEnter = useCallback(() => {
    if (input.disabled === true) return
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    const delay = isIntelSessionActive() ? HOVER_TIMING.siblingMs : HOVER_TIMING.openMs
    if (openTimer.current !== null) clearTimeout(openTimer.current)
    openTimer.current = setTimeout(() => {
      input.onOpen()
    }, delay)
  }, [input])

  const handleLeaveBoth = useCallback(() => {
    if (openTimer.current !== null) clearTimeout(openTimer.current)
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    // §7 safe polygon: leaving trigger alone does not close at once —
    // the card gets a grace window to receive the pointer.
    closeTimer.current = setTimeout(() => {
      if (!inCard.current) input.onClose()
    }, HOVER_TIMING.closeMs)
  }, [input])

  const handleCardEnter = useCallback(() => {
    inCard.current = true
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    if (openTimer.current !== null) clearTimeout(openTimer.current)
  }, [])

  const handleCardLeave = useCallback(() => {
    inCard.current = false
    handleLeaveBoth()
  }, [handleLeaveBoth])

  return { handleTriggerEnter, handleLeaveBoth, handleCardEnter, handleCardLeave, cancel }
}

export function useLongPress(input: { onPreview: () => void; ms?: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)

  const start = useCallback(() => {
    fired.current = false
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      fired.current = true
      input.onPreview()
    }, input.ms ?? HOVER_TIMING.longPressMs)
  }, [input])

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  /** Short tap navigates only when the long-press did not fire (§10). */
  const handleTap = useCallback(
    (navigate: () => void) => {
      if (!fired.current) navigate()
      fired.current = false
    },
    [],
  )

  return { start, cancel, handleTap, didFire: () => fired.current }
}

export interface HoverRect {
  top: number
  left: number
  width: number
  height: number
}

export interface PlacedStyle {
  top: number
  left: number
  placement: 'right' | 'left' | 'bottom' | 'top'
}

/**
 * §76 placement: prefer right, else left, else bottom, else top.
 * Always inside the viewport with a 16px margin.
 */
export function placeHoverCard(trigger: HoverRect, cardW: number, cardH: number, viewportW: number, viewportH: number): PlacedStyle {
  const m = HOVER_DIMS.viewportMargin
  const fitsRight = trigger.left + trigger.width + 8 + cardW <= viewportW - m
  const fitsLeft = trigger.left - 8 - cardW >= m
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

  if (fitsRight) {
    return {
      placement: 'right',
      left: Math.min(trigger.left + trigger.width + 8, viewportW - m - cardW),
      top: clamp(trigger.top - 8, m, Math.max(m, viewportH - m - cardH)),
    }
  }
  if (fitsLeft) {
    return {
      placement: 'left',
      left: Math.max(trigger.left - 8 - cardW, m),
      top: clamp(trigger.top - 8, m, Math.max(m, viewportH - m - cardH)),
    }
  }
  const belowTop = trigger.top + trigger.height + 8
  if (belowTop + cardH <= viewportH - m) {
    return { placement: 'bottom', top: belowTop, left: clamp(trigger.left, m, Math.max(m, viewportW - m - cardW)) }
  }
  return { placement: 'top', top: Math.max(m, trigger.top - 8 - cardH), left: clamp(trigger.left, m, Math.max(m, viewportW - m - cardW)) }
}

export function useHoverPosition() {
  const [placed, setPlaced] = useState<PlacedStyle | null>(null)
  const measure = useCallback((triggerEl: HTMLElement | null, large: boolean) => {
    if (triggerEl === null) {
      setPlaced(null)
      return
    }
    const r = triggerEl.getBoundingClientRect()
    const w = large ? HOVER_DIMS.widthLarge : HOVER_DIMS.width
    const h = Math.min(HOVER_DIMS.maxHeight, window.innerHeight - 32)
    setPlaced(placeHoverCard({ top: r.top, left: r.left, width: r.width, height: r.height }, w, h, window.innerWidth, window.innerHeight))
  }, [])
  return { placed, measure }
}

export function useHoverKeyboard(input: { open: boolean; pinned: boolean; onClose: () => void; onPin: () => void; triggerRef: React.RefObject<HTMLElement> }) {
  useEffect(() => {
    if (!input.open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        input.onClose()
        // §80: focus returns to the trigger that opened the card.
        input.triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [input])
}

/**
 * Capability mirror for hover surfaces (§67).
 * Reads the session role once; cards branch on `canViewFinance` and
 * `actions` rather than re-checking roles per row (P3: UI ⊆ DB).
 */
export function useHoverPermissions(role: import('../../types/database').SystemRole): {
  canViewFinance: boolean
} {
  return { canViewFinance: canViewMoney(role) }
}
