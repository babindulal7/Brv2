/**
 * Pure utilities for the New Rental page.
 *
 * Extracted from NewRental.tsx to keep the component focused on rendering.
 * These have no UI, network, or Supabase dependencies — they are plain
 * functions and types that can be tested in isolation and reused.
 */

import { rentalDaysBetween } from '../../../lib/rentalDays'
import { NPT_OFFSET_STRING } from '../../../lib/operationalDay'
import { getSetting } from '../../../lib/settingsStore'
import { roundHalfUp } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'

/** One day in milliseconds — used for date arithmetic defaults. */
export const DAY = 86400000

/**
 * The VAT rate is **read from Settings**, never a literal.
 *
 * `VAT_PCT = 13` used to live here and is deleted: `PLAN.md` §5 Conventions
 * bans "a hardcoded VAT rate", and `WIREFRAME_RULINGS_2026-08-12.md` §7 rules
 * that spec 01's drawn `VAT 13%` is read as `VAT {rate}%` off
 * `settingsStore`'s `vatRatePercent`. Read once per mount — the same shape
 * every other consumer of `getSetting` uses; a rate changed in another tab
 * lands on the next mount, not mid-booking.
 */
export function readVatRatePercent(): number {
  const n = Number(getSetting('vatRatePercent'))
  return Number.isFinite(n) ? n : 0
}

/** Canonical JSON serialisation for dirty checks — order-independent. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * The two pickers of one end of the booking — a `YYYY-MM-DD` date and an
 * `HH:mm` wall-clock time — as a single instant, or `null` if either is
 * unparseable.
 *
 * This is the **same construction `confirmBooking` sends** (`new
 * Date(\`${date}T${time}\`)`, local wall-clock in, `.toISOString()` — AD/UTC —
 * out, Law 7). It exists so the page cannot measure the booking over one pair
 * of instants and store it over another: before NR-19 the length was computed
 * from the DATES ALONE while the write sent date+time, so the two disagreed by
 * up to a day at every booking whose times were not midnight.
 *
 * `null` rather than a fallback instant: an unparseable value is not midnight,
 * and `DateTimeField` never lets one through anyway — `commitDate` reverts to
 * the last good date and `commitTime` to the last good time, so the guard here
 * is a type-level one rather than a state this screen can reach.
 */
export function bookingInstant(date: string, time: string): Date | null {
  if (!date || !time) return null
  let isoTime = time.trim()
  if (!/[Z+-]/.test(isoTime)) {
    if (isoTime.length === 5) isoTime = `${isoTime}:00`
    isoTime = `${isoTime}${NPT_OFFSET_STRING}`
  }
  const d = new Date(`${date}T${isoTime}`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The booking's length in whole rental days, or `0` for a window that is not a
 * booking at all.
 *
 * The arithmetic is **not** here — `lib/rentalDays.ts` owns it (Law 1), and its
 * header settles which of this repo's three day-counts this is: the priced
 * span, elapsed ms ÷ 86 400 000, rounded half-up, floored at 1. What is here is
 * the page's own gate, and only that: a return at or before the pickup is `0`,
 * which every date-dependent thing on this screen reads as "unset" (an em dash,
 * never a zero — §8.6) and which blocks Confirm.
 *
 * ⛔ NR-19 — the page used to difference the two `YYYY-MM-DD` picker values and
 * ignore the times beside them, so a 09:00 → 18:00 same-day hire measured 0 and
 * was refused for being zero days long. `createRental.validate` refuses only a
 * return strictly BEFORE the pickup, and the write sends date+time, so the page
 * was rejecting bookings its own action would have taken. Measured over the
 * instants that are actually stored, that hire is 9 h → the engine's floor of
 * one rental day.
 *
 * `0` cannot be a stored length: Law 9 and six `days >= 1` CHECKs, and Confirm
 * is blocked while this is 0.
 */
export function bookingDays(pickupAt: Date | null, returnAt: Date | null): number {
  if (!pickupAt || !returnAt || returnAt.getTime() <= pickupAt.getTime()) return 0
  return rentalDaysBetween(pickupAt.toISOString(), returnAt.toISOString()) ?? 0
}

/** Regex matching a UUID v4 (products.id). */
export const PRODUCT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** §10.1 — line amount, rounded once at the end (half-up), same convention `lib/money.ts`'s `price()` uses internally. */
export function lineAmountPaisa(line: { qty: number; days: number; ratePaisa: Paisa; discountPct: number }): Paisa {
  return roundHalfUp(line.qty * line.days * line.ratePaisa * (1 - line.discountPct / 100)) as Paisa
}

/** Common shoot presets — NOT a ceiling, just conveniences. */
export const SHOOT_PRESETS = [
  { id: '1-day', label: '1-Day Shoot', icon: 'timer' as const, description: 'Single-day shoot (07:00 → 20:00, 1 rental day)' },
  { id: 'weekend', label: 'Weekend (Fri–Mon)', icon: 'calendar_week' as const, description: 'Weekend shoot (Friday 14:00 → Monday 10:00, 3 rental days)' },
  { id: '3-day', label: '3-Day Commercial', icon: 'video' as const, description: '3-day commercial shoot (08:00 → Day 3 20:00, 3 rental days)' },
  { id: '1-week', label: '1-Week Production', icon: 'calendar_event' as const, description: '7-day production block (08:00 → Day 7 20:00, 7 rental days)' },
] as const