/**
 * **Text size — Foundation v2.2 §4.3.11.**
 *
 * > "Viewport width is a decent proxy for physical size but it cannot tell a
 * > 27-inch 1080p monitor from a 13-inch one, and it knows nothing about
 * > eyesight. So §4.3.6 handles the screen and this handles the person."
 *
 * One variable moves the whole application, because every size in §4.3.6 is
 * expressed in `rem` and the root multiplies by `--ui-scale`. **No component
 * opts in and none can opt out** — that is the point of putting it on the root
 * rather than threading a prop.
 *
 * It is **additive to browser zoom, not a replacement for it.** The root clamp
 * uses `rem + vw` rather than pure `vw` precisely so Ctrl+ keeps working
 * alongside this (WCAG 1.4.4).
 */

export type TextSize = 'compact' | 'default' | 'large'

export const TEXT_SIZES: Array<{ key: TextSize; label: string; scale: number; who: string }> = [
  { key: 'compact', label: 'Compact', scale: 0.9, who: 'Coordinator on a large desktop who wants more rows visible' },
  { key: 'default', label: 'Default', scale: 1, who: '' },
  { key: 'large', label: 'Large', scale: 1.15, who: 'Warehouse tablet, or anyone who wants it' },
]

export const TEXT_SIZE_KEY = 'br-text-size'

export function scaleOf(size: TextSize): number {
  return TEXT_SIZES.find((s) => s.key === size)?.scale ?? 1
}

export function readTextSize(): TextSize {
  const v = localStorage.getItem(TEXT_SIZE_KEY)
  return v === 'compact' || v === 'large' || v === 'default' ? v : 'default'
}

/**
 * §4.3.11 — "applied before first paint so nothing reflows on load." The same
 * write runs from an inline script in `index.html`; this is the runtime path
 * for when the user changes it.
 */
export function applyTextSize(size: TextSize): void {
  document.documentElement.style.setProperty('--ui-scale', String(scaleOf(size)))
  localStorage.setItem(TEXT_SIZE_KEY, size)
}
