/**
 * # Return countdown — how long until a rental is due back, or how far past it
 *
 * The active-rental brief (`D:\proects\md\11_active_rental.md`) asked for the
 * due time to be prominent, "countdown style if possible". Today's Returns
 * column and Booking Detail both showed the due *stamp* ("Due 2 Aug 2026 ·
 * 06:00 AM") but never the distance to it, so the desk did the subtraction in
 * its head.
 *
 * ## A display span, never a billing figure
 *
 * This is elapsed wall-clock time between `bookings.return_at` and now, and
 * nothing else. It is not a rental-day count (Law 1 — `rentalDaysBetween`
 * owns that) and not a late fee (`lib/lateFee.ts` / `money.ts:lateFee()` own
 * that, with their 30-minute grace and half-day bands). "Overdue by 20m" while
 * the fee engine says Rs 0 is correct: the rental IS past its return time, and
 * the grace period is a pricing rule, not a redefinition of late.
 *
 * ## The overdue predicate is the caller's, the sign is ours
 *
 * Whether a booking can be late at all — On Rent, not closed, not cancelled,
 * `actual_return_at` null — is decided where it already is (`toMovementRow`,
 * BookingDetail's `isOverdue`). Callers render a countdown only for a booking
 * that passes that predicate; this module only says which side of `return_at`
 * "now" is on, with the same strict `<` those predicates use.
 */
import { useEffect, useState } from 'react'

const MINUTE = 60_000

/**
 * Whole minutes → the shortest honest span: "45m", "3h 20m", "3h", "2d 4h", "2d".
 * Two units at most — "2d 4h 17m" is a precision nobody acts on.
 * Floors, never rounds up: "in 59m" must not read as "in 1h".
 */
export function formatSpan(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes))
  if (m < 1) return 'under 1m'
  const days = Math.floor(m / 1440)
  const hours = Math.floor((m % 1440) / 60)
  const mins = m % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  return `${mins}m`
}

export type ReturnCountdown = {
  /** Now is strictly after `return_at` — the same `<` the overdue predicates use. */
  overdue: boolean
  /** `formatSpan` of the distance either side, e.g. "3h 20m". */
  span: string
}

/** `null` when `returnAtAd` is not a parseable instant — no countdown, never a wrong one. */
export function returnCountdown(returnAtAd: string, nowMs: number): ReturnCountdown | null {
  const due = Date.parse(returnAtAd)
  if (!Number.isFinite(due) || !Number.isFinite(nowMs)) return null
  const overdue = due < nowMs
  return { overdue, span: formatSpan(Math.abs(nowMs - due) / MINUTE) }
}

/**
 * `Date.now()`, re-read once a minute so a countdown on a tablet left open all
 * shift keeps moving. Aligned to the minute boundary, so every countdown on
 * the screen turns over together instead of drifting by mount time.
 */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const tick = () => setNow(Date.now())
    const align = setTimeout(() => {
      tick()
      interval = setInterval(tick, MINUTE)
    }, MINUTE - (Date.now() % MINUTE))
    return () => {
      clearTimeout(align)
      if (interval !== undefined) clearInterval(interval)
    }
  }, [])
  return now
}
