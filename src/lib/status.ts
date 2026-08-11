/**
 * **Colour — Foundation Specification v2.0 §4.2, the 5-colour law + gold.**
 *
 * v2.0's reasoning, verbatim: "Nine hues are not reliably distinguishable, do
 * not survive a light build, and are not readable on a tablet in warehouse
 * daylight. Five plus gold."
 *
 * This file previously carried eight status hues — available, reserved, pickup,
 * return, inspection, maintenance, damage, cancelled — one of which
 * (inspection) was purple. §4.2 bans cyan, teal, indigo and violet outright.
 * Purple itself is not banned — it is reserved exclusively for the Sub-Rental
 * status (gold-outline styling) and must not be used for any other KPI or
 * accent purpose. The eight collapse onto the five below.
 *
 * Each key resolves to a CSS variable pair that `styles/theme.css` redefines
 * per theme, so a component never branches on theme and never hardcodes a
 * colour.
 */
export type StatusKey =
  /** Gray — Quote, Closed, inactive, historical. */
  | 'neutral'
  /** Blue — Booked, commercial commitment, primary buttons. */
  | 'primary'
  /** Yellow — Packed, work in progress, and Due Soon. Deliberate double duty. */
  | 'progress'
  /** Green, **solid** fill — On Rent. "Solid = out." */
  | 'out'
  /** Green, **soft** fill — Returned, Paid. "Soft = in." */
  | 'in'
  /** Red — Overdue, Damaged, Missing, Blocked. The only alarm colour. */
  | 'danger'
  /** Gold, **outline only** — sub-rental, partner equipment. Never a fill. */
  | 'ext'

export interface StatusTokens {
  bg: string
  fg: string
  /** §4.2 — gold is an outline, so `ext` is the one key that carries a border. */
  border?: string
}

export const STATUS: Record<StatusKey, StatusTokens> = {
  neutral: { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)' },
  primary: { bg: 'var(--st-primary-bg)', fg: 'var(--st-primary-fg)' },
  progress: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  out: { bg: 'var(--st-out-bg)', fg: 'var(--st-out-fg)' },
  in: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)' },
  danger: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)' },
  ext: { bg: 'transparent', fg: 'var(--ext-fg)', border: 'var(--ext-line)' },
}

/**
 * §4.2 — "Colour is never the sole carrier. Every status renders colour + icon
 * + label." The icon is part of the token, not left to each call site to
 * remember, so a bare colour chip cannot be built by accident.
 */
export const STATUS_ICON: Record<StatusKey, string> = {
  neutral: 'circle_dashed',
  primary: 'check',
  progress: 'progress',
  out: 'truck',
  in: 'return_arrow',
  danger: 'alert_triangle',
  ext: 'external_link',
}

/**
 * Solid brand colours for **fills** — KPI icon tiles, dots, bars.
 *
 * `gold` and `purple` are gone. Gold because §4.2 forbids it as a fill ("a gold
 * Save button beside a gold sub-rental badge destroys the one distinction a
 * warehouse must see"); purple because §4.2 bans the hue.
 */
export type BrandKey = 'neutral' | 'primary' | 'progress' | 'success' | 'danger' | 'purple'

export const BRAND: Record<BrandKey, string> = {
  neutral: 'var(--muted)',
  primary: 'var(--primary)',
  progress: 'var(--progress)',
  success: 'var(--success)',
  danger: 'var(--danger)',
  purple: 'var(--st-purple-fg)',
}

/**
 * The same keys for **coloured text on a card**.
 *
 * The brand colours are tuned to read as fills. As 12px text on `--card` they
 * measure under AA, so each has a text-safe variant that shifts just enough for
 * a red fill and red micro-copy to stay recognisably the same colour without
 * the text being the failing one. §6 requires 4.5:1 verified in both themes.
 */
/**
 * The ink that sits **on** a brand fill — an icon glyph inside a coloured tile.
 *
 * Callers used to hard-code `#fff`, which is both a raw hex (§4.2) and wrong on
 * two tiles. Dark theme lightens the fills, and measuring them in the browser
 * showed `--progress` (#fbbf24) at 1.7:1 and `--success` (#22c55e) at 2.3:1
 * against white — both under the 3:1 WCAG minimum for non-text. Those two take
 * dark ink from their own family; the rest keep white.
 */
export const BRAND_ON: Record<BrandKey, string> = {
  neutral: 'var(--on-brand)',
  primary: 'var(--on-brand)',
  progress: 'var(--on-progress)',
  success: 'var(--on-success)',
  danger: 'var(--on-brand)',
  purple: 'var(--on-brand)',
}

export const BRAND_TEXT: Record<BrandKey, string> = {
  neutral: 'var(--muted)',
  primary: 'var(--primary-text)',
  progress: 'var(--progress-text)',
  success: 'var(--success-text)',
  danger: 'var(--danger-text)',
  purple: 'var(--st-purple-fg)',
}
