/**
 * Smart Intel Cards v1 — shared timing contract (spec §4 / §21).
 *
 * Every pointer hover opens after 300ms, including adjacent identifiers.
 * Close grace is 300ms; touch long-press remains 500ms. No timed
 * auto-dismiss — WCAG 1.4.13.
 */

export const INTEL_OPEN_DELAY_MS = 300
export const INTEL_CLOSE_DELAY_MS = 300
export const INTEL_LONG_PRESS_MS = 500
export const INTEL_CARD_IN_MS = 140
export const INTEL_ADJACENT_DELAY_MS = 300
/** Row highlight must land fast (NN/G 0.1s feedback). */
export const INTEL_ROW_HIGHLIGHT_MS = 100
