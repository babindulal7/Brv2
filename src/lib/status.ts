/**
 * **Colour — DESIGN_DIRECTION_SPEC_v4.1 §2/§4. Seven hues + gold.**
 *
 * v4.1 replaced the 28 Jul five-colour law. The reasoning that produced "five
 * plus gold" was about *distinguishability* — nine arbitrary hues do not
 * survive a warehouse tablet in daylight. v4.1 keeps that constraint and
 * spends the budget differently: seven hues, each with **exactly one meaning**,
 * so a shelf or a queue can be read by colour before any word is.
 *
 *   blue   committed / scheduled
 *   yellow being worked in-house / waiting
 *   green  home & ready / coming home / settled
 *   orange out with the client        <- On Rent moved here from green
 *   red    problem / money owed / decide now
 *   gray   not started yet
 *   dim    finished / inactive
 *
 * Two things changed that this file is the single point of enforcement for:
 *
 *  1. **Every status is a SOLID block.** The 24 Aug morning solid-vs-outline
 *     fill rule is dead. Gold is the only outline left on screen.
 *  2. **On Rent is ORANGE, Returned is GREEN.** The lifecycle now reads
 *     gray -> blue -> yellow -> orange (gear is out) -> green (safely home)
 *     -> dim. Green stopped meaning "out" and started meaning "home", which is
 *     what the floor actually cares about.
 *
 * Purple is gone. It had been reserved for Sub-Rental; v4.1 makes Sub-Rental
 * the gold OUTLINE mark, so the hue is retired rather than re-pointed.
 *
 * Each key resolves to a CSS variable pair that `styles/theme.css` redefines
 * per theme, so a component never branches on theme and never hardcodes a
 * colour. §7.4 still holds: colour is never the sole carrier — every block
 * renders its word, and STATUS_ICON below keeps the icon part of the token.
 */
import type { IconName } from '../components/ui/Icon'
import type { PaymentStatus } from '../types/database'

export type StatusKey =
  /** Gray, solid — Quote, Draft. "Not started yet." */
  | 'neutral'
  /** Blue, solid — Booked, Reserved, Issued. "Committed / scheduled." */
  | 'primary'
  /** Yellow, solid — Packed, Due Soon, Partial, Cleaning, Maintenance. */
  | 'progress'
  /** Orange, solid — On Rent, Picked Up, Partial Pickup. "Out with the client." */
  | 'out'
  /** Green, solid — Returned, Available, Returning, Paid. "Home & settled." */
  | 'in'
  /** Red, solid — Overdue, Damaged, Unpaid, Blocked. The only alarm colour. */
  | 'danger'
  /** Dim, solid — Closed, Void, Retired, Deactivated. "Finished / inactive." */
  | 'dim'
  /** Gold, **outline only** — sub-rented / external gear. Never a status. */
  | 'ext'

export interface StatusTokens {
  bg: string
  fg: string
  /**
   * §2 — gold is the ONE outline on screen, so `ext` is the only key that
   * carries a border. Everything else is a solid block (§4).
   */
  border?: string
}

export const STATUS: Record<StatusKey, StatusTokens> = {
  neutral: { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)' },
  primary: { bg: 'var(--st-primary-bg)', fg: 'var(--st-primary-fg)' },
  progress: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  out: { bg: 'var(--st-out-bg)', fg: 'var(--st-out-fg)' },
  in: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)' },
  danger: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)' },
  dim: { bg: 'var(--st-dim-bg)', fg: 'var(--st-dim-fg)' },
  ext: { bg: 'var(--ext-bg)', fg: 'var(--ext-fg)', border: 'var(--ext-line)' },
}

/**
 * NOTE ON THE KEY NAME. v4.1 §7.5 is explicit that the spec "recolours them,
 * it does not rename them", so the yellow key keeps the name `progress` even
 * though v4.1 calls the hue "ready". The key is an internal identifier read by
 * ~195 call sites; the *colour* is what changed. Renaming it would have been a
 * mechanical churn that §7.5 forbids for no behavioural gain.
 */

/**
 * §7.4 — "Colour is never the sole carrier. Every status renders colour + icon
 * + label." The icon is part of the token, not left to each call site to
 * remember, so a bare colour chip cannot be built by accident.
 *
 * ## Typed `IconName`, not `string` — this map shipped three broken glyphs
 *
 * It was `Record<StatusKey, string>`, so nothing checked the names against the
 * `Icon` REGISTRY and every call site had to cast with `as IconName`. Three of
 * the eight values named glyphs that do not exist — `neutral` and `dim` both
 * pointed at `circle_dashed`, `progress` at `progress` — and `Icon`'s miss
 * branch rendered them as red `[Icon:…]` developer text **inside status chips
 * on `/clients` and `/crew`**: 51 instances of debug output in front of a
 * client (BUG-001). `RentalsList.tsx` and `CrewBooking.tsx` had each already
 * written a paragraph warning about this exact hazard and removed their own
 * usages; the two remaining live sites were missed.
 *
 * The `IconName` type is what stops it recurring: a name the REGISTRY does not
 * carry is now a compile error here, at the one place the map is written,
 * instead of red text at runtime on whichever screen happens to render it. The
 * `as IconName` casts at the call sites are gone with it — a cast is exactly
 * how the broken names reached the screen. `data/warehouse.ts` and
 * `Maintenance.tsx` already type their equivalent maps this way.
 *
 * Substitutions are from the existing REGISTRY; no glyph was added. `timer` for
 * `progress` follows the established house usage for a waiting state
 * (`warehouse.ts` `Pending: 'timer'`, `BranchesWarehouses.tsx`
 * `'Under Setup': 'timer'`). `neutral` and `dim` keep a **shared** glyph, as
 * they did under `circle_dashed` — colour and word already separate them, and
 * giving them distinct icons would be a design change, not a bug fix.
 */
export const STATUS_ICON: Record<StatusKey, IconName> = {
  neutral: 'dot',
  primary: 'check',
  progress: 'timer',
  out: 'truck',
  in: 'return_arrow',
  danger: 'alert_triangle',
  dim: 'dot',
  ext: 'external_link',
}

/**
 * The **block anatomy** from §4, in one place so no screen re-invents it:
 * solid fill, 11.5px, weight 800, uppercase, 0.04em tracking, radius 6,
 * padding 7x12. A screen that needs a status renders the component that reads
 * this — it never assembles its own.
 */
export const STATUS_BLOCK = {
  fontSize: '11.5px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  borderRadius: 'var(--r-chip)',
  padding: '7px 12px',
} as const

/**
 * The gold mark is deliberately NOT block anatomy — §4 gives it weight 600 and
 * no uppercase, so it can never be mistaken for a yellow status at a glance.
 */
export const EXT_MARK = {
  fontSize: '11.5px',
  fontWeight: 600,
  letterSpacing: '0.01em',
  borderRadius: 'var(--r-chip)',
  padding: '6px 11px',
  border: '1px solid var(--ext-line)',
} as const

/**
 * Solid brand colours for **fills** — KPI icon tiles, dots, bars.
 *
 * `gold` and `purple` are gone: gold because v4.1 §2 forbids it anywhere but
 * the sub-rented outline ("a gold Save button beside a gold sub-rental badge
 * destroys the one distinction a warehouse must see"), purple because the hue
 * is retired outright.
 */
export type BrandKey = 'neutral' | 'primary' | 'progress' | 'warn' | 'success' | 'danger'

export const BRAND: Record<BrandKey, string> = {
  neutral: 'var(--muted)',
  primary: 'var(--primary)',
  progress: 'var(--ready)',
  warn: 'var(--warn)',
  success: 'var(--success)',
  danger: 'var(--danger)',
}

/**
 * The ink that sits **on** a brand fill — an icon glyph inside a coloured tile.
 *
 * Never hard-code `#fff` here. Every pair below was measured against the v4.1
 * §7.8 gate: yellow and orange both fail white ink outright (orange at 3.61:1
 * in the light theme), so both carry dark ink from their own family in BOTH
 * themes. The measurements are recorded in spec §10.
 */
export const BRAND_ON: Record<BrandKey, string> = {
  neutral: 'var(--on-neutral)',
  primary: 'var(--on-primary)',
  progress: 'var(--on-ready)',
  warn: 'var(--on-warn)',
  success: 'var(--on-success)',
  danger: 'var(--on-danger)',
}

/**
 * The same keys for **coloured text on a card**.
 *
 * The brand fills are tuned to read as fills. As 12px text on `--surface` they
 * measure under AA, so each has a text-safe variant that shifts just enough for
 * a red fill and red micro-copy to stay recognisably the same colour without
 * the text being the failing one. §7.8 requires 4.5:1 verified in both themes.
 */
export const BRAND_TEXT: Record<BrandKey, string> = {
  neutral: 'var(--muted)',
  primary: 'var(--primary-text)',
  progress: 'var(--ready-text)',
  warn: 'var(--warn-text)',
  success: 'var(--success-text)',
  danger: 'var(--danger-text)',
}

/* ── Payment status → tone ────────────────────────────────────────────────
 *
 * ⛔ This map existed THREE times: `modules/finance/Payments.tsx`, the payment
 * history on `modules/rentals/BookingDetail.tsx`, and — as a two-way ternary
 * that answered differently — `data/bookingIntel.ts`'s `paymentGlance`. The
 * ledger, the booking's history and the hover card render THE SAME ROW, so
 * three copies is three chances to disagree about whether money arrived, and
 * the ternary already did: it painted `Refunded`, `Failed` and `Cancelled`
 * identically (`progress`, yellow), so a bounced transfer and a refund were
 * one colour, and neither was the red that `Failed` earns.
 *
 * Keyed on `PaymentStatus` so a new enum member is a compile error rather than
 * a silent fallthrough to some default colour.
 */
export const PAYMENT_STATUS_TONE: Record<PaymentStatus, StatusKey> = {
  Received: 'in',
  Refunded: 'neutral',
  Failed: 'danger',
  Cancelled: 'neutral',
}

/**
 * The same map for callers holding a loosely-typed status.
 *
 * `PaymentHistoryRow.status` is a bare `string` (a seed shape), so it cannot
 * index the record above. An unrecognised value resolves to `neutral` — never
 * to `in`: painting an unknown status with the colour that means "the money
 * arrived" is the one wrong answer, and a grey chip beside its own printed
 * word is a legible "we do not recognise this".
 */
export function paymentStatusTone(status: string): StatusKey {
  return (PAYMENT_STATUS_TONE as Record<string, StatusKey | undefined>)[status] ?? 'neutral'
}
