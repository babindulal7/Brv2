import { useState, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Whether a row-anchored popover (⋮ menu, action dropdown) should open
 * upward instead of down — true when opening downward would run past the
 * bottom of the viewport but there is room above. The same fix
 * `RentalsList.tsx`'s `RowOperations` proved out first for its
 * horizontally-scrolling table (LP-02: "popovers clip and never flip"),
 * generalized to viewport bounds for callers with no scroll-clipping
 * ancestor of their own.
 */
export function shouldFlipUp(anchor: DOMRect, menuHeight: number, gap = 8): boolean {
  return anchor.bottom + menuHeight + gap > window.innerHeight && anchor.top - menuHeight - gap > 0
}

/**
 * Hook form of `shouldFlipUp` for menus whose trigger is its own component
 * instance (one hook call per trigger). Rows rendered inline inside a
 * `.map()` can't call this — call `shouldFlipUp` directly against
 * `e.currentTarget.getBoundingClientRect()` in the click handler instead.
 * Call `measure()` in the same click handler that flips `open` to true,
 * before state updates, so the read happens against the pre-open DOM.
 */
export function useMenuFlip<T extends HTMLElement = HTMLElement>(menuHeight: number, gap = 8) {
  const ref = useRef<T>(null)
  const [up, setUp] = useState(false)

  function measure() {
    const anchor = ref.current?.getBoundingClientRect()
    if (!anchor) return
    setUp(shouldFlipUp(anchor, menuHeight, gap))
  }

  return { ref: ref as RefObject<T>, up, measure }
}
