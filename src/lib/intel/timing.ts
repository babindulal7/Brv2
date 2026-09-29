/**
 * Smart Intel Cards v1 — shared timing contract (spec §4 / §21).
 *
 * 250ms initial open is the spec's synthesis (between Radix Themes 200ms and
 * the NN/G 300–500ms floor); 300ms close is the Radix default; 500ms
 * long-press is the Android/iOS standard. Adjacent switching is ~0ms while a
 * session is active (Stripe pattern). No timed auto-dismiss — WCAG 1.4.13.
 */

export const INTEL_OPEN_DELAY_MS = 250
export const INTEL_CLOSE_DELAY_MS = 300
export const INTEL_LONG_PRESS_MS = 500
export const INTEL_CARD_IN_MS = 140
export const INTEL_ADJACENT_DELAY_MS = 0
/** Row highlight must land fast (NN/G 0.1s feedback). */
export const INTEL_ROW_HIGHLIGHT_MS = 100
