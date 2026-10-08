/**
 * **The breakpoints. One file, one pair of numbers, no exceptions.**
 *
 * DESIGN_DIRECTION_SPEC_v4.1 §7.7: *"No screen carries its own responsive
 * code; BP 768/1280; test widths 390/800/1194/1280/1920."*
 *
 * This module exists because a breakpoint that lives in two places is a
 * breakpoint that will disagree with itself. `device.ts` reads these numbers,
 * `styles/responsive.css` mirrors them, and `index.html` stamps the band
 * before first paint from the same pair — and a test asserts all three still
 * agree, because CSS cannot import TypeScript and the only alternative to a
 * guard is hoping.
 *
 * ## Why 1280 and not 1180
 *
 * `device.ts` carried `desktop: 1180` from an earlier Foundation ruling.
 * v4.1 supersedes it with 1280, and the spec's own test-width list is the
 * argument: **1194** is an iPad Pro 11" in landscape. At a 1180 threshold that
 * tablet resolves to `desktop` — it gets hover affordances, desktop-density
 * tables and mouse-sized targets, on a device being held. At 1280 it resolves
 * to `tablet`, which is what it is. The old number silently mis-classified the
 * single most likely device on a rental floor.
 *
 * 1280 is also the low end of the desktop test widths, so the boundary sits
 * exactly where "a laptop" begins rather than inside the tablet range.
 *
 * ## Width decides, never orientation, never user agent
 *
 * A warehouse tablet rotated to portrait is still a tablet; a phone in
 * landscape is still a phone. Orientation changes the shape of the viewport,
 * not the size of the thumb using it. And nothing here asks "is this an iPad" —
 * a question that has been wrong more often than right for a decade.
 *
 * Size is NOT capability. `device.ts:useCapability()` answers what the person
 * can do (coarse pointer, hover, reduced motion); this file only answers how
 * much room there is. Conflating them is how hover-only menus reach tablets.
 */

/**
 * The two thresholds, in px. A viewport is:
 *   phone    < 768
 *   tablet   768 .. 1279
 *   desktop  >= 1280
 */
export const BP = { phone: 768, desktop: 1280 } as const

export type Viewport = 'phone' | 'tablet' | 'desktop'

/**
 * The widths every screen is checked at (§7.7). Not decoration — these are the
 * arguments for the numbers above:
 *   390  phone (iPhone 14/15 class)
 *   800  small tablet / split-screen
 *   1194 iPad Pro 11" landscape — the case that forced 1280
 *   1280 the desktop boundary itself, tested ON the line
 *   1920 the target desktop
 */
export const TEST_WIDTHS = [390, 800, 1194, 1280, 1920] as const

/**
 * Media-query strings built from the same constants, so a component that needs
 * one never retypes a number. `styles/responsive.css` carries the CSS-side
 * twins of these and `__tests__/breakpoints.test.ts` asserts they match.
 */
export const MQ = {
  phone: `(max-width: ${BP.phone - 1}px)`,
  tablet: `(min-width: ${BP.phone}px) and (max-width: ${BP.desktop - 1}px)`,
  desktop: `(min-width: ${BP.desktop}px)`,
  /** Everything below desktop — the common "stack it" case. */
  belowDesktop: `(max-width: ${BP.desktop - 1}px)`,
  /** Everything at tablet or above — the common "it fits" case. */
  tabletUp: `(min-width: ${BP.phone}px)`,
} as const

/**
 * Classify a width. Exported so tests and the pre-paint script agree with the
 * hooks rather than each re-deriving the comparison — an off-by-one here is a
 * whole device class rendering the wrong layout.
 */
export function viewportFor(width: number): Viewport {
  if (width < BP.phone) return 'phone'
  if (width < BP.desktop) return 'tablet'
  return 'desktop'
}
