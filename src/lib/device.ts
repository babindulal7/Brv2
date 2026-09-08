import { useEffect, useState } from 'react'
import { BP, MQ, viewportFor, type Viewport } from './breakpoints'
import { onMediaChange } from './safeStorage'

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
 * v4.1 §7.7 locks the breakpoints at **768** and **1280** and specifies width
 * as the discriminator — they live in `lib/breakpoints.ts`, not here. A
 * warehouse tablet rotated to portrait is still a tablet; a phone in landscape
 * is still a phone. Orientation changes the shape of the viewport, not the
 * size of the thumb using it.
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

export type { Viewport }

/**
 * **v2.1 — the numbers moved to `lib/breakpoints.ts`.**
 *
 * This file used to declare `BREAKPOINT = { phone: 768, desktop: 1180 }`
 * itself. Two things were wrong with that:
 *
 *  1. `1180` is superseded. v4.1 §7.7 rules 768/1280, and the spec's own test
 *     width 1194 (iPad Pro 11" landscape) sat on the WRONG side of 1180 — the
 *     likeliest device on a rental floor was classified `desktop` and served
 *     hover affordances and mouse-sized targets.
 *  2. A breakpoint declared here could not be shared with `responsive.css` or
 *     the `index.html` pre-paint script, so the same threshold existed three
 *     times and could drift silently.
 *
 * `BREAKPOINT` is re-exported for the existing call sites, but it now points at
 * the shared constant. New code should import `BP` from `lib/breakpoints`.
 */
export const BREAKPOINT = BP

function readViewport(): Viewport {
  if (typeof window === 'undefined') return 'desktop'
  return viewportFor(window.innerWidth)
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
    const sync = () => setVp(readViewport())

    /* `onMediaChange`, not `addEventListener` — `MediaQueryList` did not inherit
       `EventTarget` in WebKit until Safari 14, so on 13 and earlier this throws
       a TypeError. It runs in a mount effect ABOVE the app's only ErrorBoundary
       (App.tsx wraps the routed page only), so React 18 tears down the whole
       root and the device shows a blank white page. `safeStorage.ts` carries
       the two-branch bind. */
    const offPhone = onMediaChange(MQ.phone, sync)
    const offDesktop = onMediaChange(MQ.desktop, sync)
    sync()

    return () => {
      offPhone()
      offDesktop()
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
    const sync = () => setCap(readCapability())
    /* Same Safari-14 reason as useViewport above. */
    const offs = [
      '(pointer: coarse)',
      '(hover: hover)',
      '(display-mode: standalone)',
      '(prefers-reduced-motion: reduce)',
    ].map((q) => onMediaChange(q, sync))
    sync()

    return () => offs.forEach((off) => off())
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
