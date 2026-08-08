import { useEffect, useState } from 'react'

/**
 * **Device capability and viewport — the primitive Law 13 requires.**
 *
 * Law 13: *"No platform branch in a layout component. Branch on capability."*
 * Until now nothing in the app could obey that, because nothing measured
 * capability: `matchMedia` appeared once, for colour scheme, and the only two
 * `@media` rules in the stylesheet are a 1560px nudge and reduced-motion. Every
 * screen is therefore effectively desktop-only, and tables carry `minWidth: 900`
 * to `1180`, which on a phone produces a horizontal scrollbar rather than a
 * layout.
 *
 * This module is the one place that asks the browser what it can do. Components
 * consume the answers; they never sniff a user agent, and they never ask "is
 * this an iPad" — a question that has been wrong more often than right for a
 * decade.
 *
 * ## Width decides, never orientation
 *
 * Foundation locks the breakpoints at **768** and **1180** and specifies width
 * as the discriminator. A warehouse tablet rotated to portrait is still a
 * tablet; a phone in landscape is still a phone. Orientation changes the shape
 * of the viewport, not the size of the thumb using it.
 *
 * ## Capability is separate from size
 *
 * They are genuinely different questions and conflating them is the usual bug:
 *
 *  - A 24-inch touchscreen at the packing bench is **desktop-sized** but
 *    **coarse-pointered**: it needs 44px targets and long-press, not hover.
 *  - A phone mirrored to a monitor is **desktop-sized** with **no hover**.
 *  - A laptop with a touchscreen has **both** fine pointer and touch.
 *
 * So `useViewport()` answers *how much room is there* and `useCapability()`
 * answers *what can the person do with it*. Ask whichever the decision needs;
 * asking both to mean one thing is how hover menus end up on tablets.
 */

export type Viewport = 'phone' | 'tablet' | 'desktop'

/** Foundation's locked breakpoints. Width only. */
export const BREAKPOINT = { phone: 768, desktop: 1180 } as const

function readViewport(): Viewport {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  if (w < BREAKPOINT.phone) return 'phone'
  if (w < BREAKPOINT.desktop) return 'tablet'
  return 'desktop'
}

/**
 * Current viewport band. Re-evaluates on resize, so a tablet rotating or a
 * window being dragged narrower changes the answer.
 */
export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(readViewport)

  useEffect(() => {
    // Driven by matchMedia rather than a resize listener: the browser fires
    // these only when a threshold is actually crossed, instead of on every
    // pixel of a drag.
    const phone = window.matchMedia(`(max-width: ${BREAKPOINT.phone - 1}px)`)
    const desktop = window.matchMedia(`(min-width: ${BREAKPOINT.desktop}px)`)
    const sync = () => setVp(readViewport())

    phone.addEventListener('change', sync)
    desktop.addEventListener('change', sync)
    sync()

    return () => {
      phone.removeEventListener('change', sync)
      desktop.removeEventListener('change', sync)
    }
  }, [])

  return vp
}

export interface Capability {
  /** A finger or a glove, not a mouse. Demands 44px targets and no hover-only affordance. */
  coarsePointer: boolean
  /** True hover exists. When false, hover intel must become long-press. */
  hasHover: boolean
  /** Installed as a PWA rather than running in a browser tab. */
  standalone: boolean
  /** The user asked for less motion. Respect it in every transition. */
  reducedMotion: boolean
}

function readCapability(): Capability {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return { coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }
  }
  return {
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    hasHover: window.matchMedia('(hover: hover)').matches,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari reports installation here rather than through display-mode.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}

/**
 * What the device can do. A docked tablet gaining a mouse, or a user changing
 * their motion preference, updates without a reload.
 */
export function useCapability(): Capability {
  const [cap, setCap] = useState<Capability>(readCapability)

  useEffect(() => {
    const queries = [
      '(pointer: coarse)',
      '(hover: hover)',
      '(display-mode: standalone)',
      '(prefers-reduced-motion: reduce)',
    ].map((q) => window.matchMedia(q))

    const sync = () => setCap(readCapability())
    queries.forEach((q) => q.addEventListener('change', sync))
    sync()

    return () => queries.forEach((q) => q.removeEventListener('change', sync))
  }, [])

  return cap
}

/**
 * Whether a table should render as a table at all.
 *
 * Below 768 a wide table is not a table — it is a horizontal scrollbar hiding
 * the columns that matter. Card rows, each with one primary action, are the
 * locked alternative.
 */
export function useTabularLayout(): boolean {
  return useViewport() !== 'phone'
}

/**
 * Floor screens (Pack · Handover · Return · Reset · Scanner) run one step
 * larger than the rest of the app, regardless of viewport — they are read at
 * arm's length, often through a case, sometimes in daylight.
 *
 * This is a *floor* rule, not a *tablet* rule: the same screen on a desktop at
 * the packing bench is read from the same distance.
 */
export const FLOOR_UI_SCALE = 1.1
