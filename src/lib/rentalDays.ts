/**
 * # Rental days — the length of a booking, owned by the engine (Law 1)
 *
 * A booking's length in days is a business figure: it is what `booking_lines`
 * multiplies a rate by (Pricing Engine §1, `Equipment Rental = Σ (Qty × Rate ×
 * Days − line discount)`), it is what `bookingDayRate()` in `lib/lateFee.ts`
 * divides a booking total by, and Law 9 makes it mandatory and explicit on
 * every priced line. It was nonetheless computed **on the page** — one private
 * helper, byte-for-byte identical, copied into `BookingDetail.tsx`,
 * `HandoverWorkspace.tsx`, `PackingWorkspace.tsx` and `ReturnWorkspace.tsx`,
 * each named `rentalDays` and each reading
 * `Math.max(1, Math.round(ms / 86_400_000))`. Four screens agreeing today is
 * four screens that can disagree tomorrow, which is the whole of Law 1.
 *
 * `BookingDetail.tsx`, `NewRental.tsx` and — since the 7 Sep handover batch —
 * `HandoverWorkspace.tsx` are routed through this module. `PackingWorkspace.tsx`
 * and `ReturnWorkspace.tsx` still hold their own copies: a follow-up, not a
 * claim.
 *
 * This list is the reason the file exists, so it is updated by whoever adopts
 * it. It said "the three floor workspaces still hold their copies" for a day
 * after Handover stopped holding one — a reader scoping the follow-up would
 * have been working from a list that was one item wrong.
 *
 * This module is that calculation, once. It is pure: two instants in, a whole
 * number of days out, no storage and no clock.
 *
 * ## Which rule this is, and the two it is NOT
 *
 * Three different day counts live in this codebase and they answer three
 * different questions. They are not interchangeable and this one is only the
 * first:
 *
 *  1. **This module — the priced SPAN.** Elapsed milliseconds between pickup
 *     and return ÷ 86 400 000, rounded half-up, floored at 1.
 *  2. **`civilDaysBetween` (`data/today.ts`) — elapsed CALENDAR days in
 *     Kathmandu.** It differences `bs.ts`'s `kathmanduCivil` day index, so it
 *     counts date boundaries crossed, not hours elapsed. It answers "how many
 *     days late is this?" for the overdue chips.
 *  3. **`lateFee()` (`lib/money.ts`) — overage BANDS past the scheduled
 *     return.** ≤30 min grace, <2 h half day, otherwise
 *     `Math.ceil(overageMinutes / 1440)` full days. It answers "what is
 *     chargeable?", and its own boundaries are pinned by `money.test.ts`.
 *
 * 1 and 2 genuinely disagree. A pickup at 09:00 and a return at 22:00 the
 * NEXT day is 37 elapsed hours: this module rounds 37 ÷ 24 = 1.54 up to
 * **2 days**, while `civilDaysBetween` crosses one date boundary and answers
 * **1**. Neither is wrong for its own question; they are wrong only if either
 * is used for the other's.
 *
 * ## TODO(decision) — PLAN.md §4: is the priced span elapsed-hours or calendar days?
 *
 * **No spec settles it.** `04 Operations/Booking Workflow.md` lists "rental
 * days (derived)" among the schedule fields and never says derived how;
 * `05 Finance/Pricing Engine.md` makes Days mandatory per line (Law 9) and
 * gives the multiplication, but not the derivation. The nearest ruling is A0
 * D4 (`lib/operationalDay.ts`) — *the rental day runs 06:00 → 06:00, as a
 * setting* — and that module scopes itself explicitly to the FLOOR's day
 * (today's pickups, today's returns, the queues), not to the priced span. The
 * two measure different things anyway: D4 asks which 06:00 → 06:00 shift an
 * instant falls in, this module asks how much time elapsed. A 09:00 → 06:00
 * hire is 21 elapsed hours — one day here — while touching two of D4's shifts.
 *
 * So this implements **the rule that is already documented in code and already
 * decides what gets billed**, and reports the conflict rather than picking a
 * new one:
 *
 *  - `NewRental.tsx` computes the booking's length as
 *    `Math.max(0, Math.round((return − pickup) / 86_400_000))` and hands it to
 *    `AddItemPanel` as `days={days || 1}` — a prop whose own doc comment reads
 *    *"The booking's length in days — seeds every draft's Days column"*. That
 *    column is written to `booking_lines.days` at creation.
 *  - Therefore the elapsed-hours rounding is what the client was invoiced on.
 *    A detail screen that counted the same booking a second way would state a
 *    different length from the one the money was calculated over.
 *
 * The floor at 1 is Law 9's ("explicitly `1`, never by omission") and matches
 * the six priced-line `days >= 1` CHECKs. `NewRental` floors at 0 instead
 * because a zero there is its "return must be later than pickup" gate, before
 * a row exists; by the time a booking is stored the span is positive.
 *
 * Whoever rules this: changing it changes what a rental costs, so it is a
 * migration-and-reprice question, not a display one.
 */

/** Milliseconds in a 24-hour day. Nepal has no daylight saving, so this never varies. */
const DAY_MS = 86_400_000

/**
 * Law 9's floor. A stored booking is at least one rental day, never zero and
 * never by omission.
 */
export const RENTAL_DAYS_MIN = 1

/**
 * Kathmandu (+05:45) shift offset: 06:00 local time minus +05:45 offset = 15 minutes (900,000 ms).
 * A timestamp minus 900,000 ms aligns exact 06:00 Kathmandu time to UTC midnight.
 */
const KATHMANDU_SHIFT_OFFSET_MS = 900_000

export function rentalDaysBetween(
  pickupIso: string | null | undefined,
  returnIso: string | null | undefined,
): number | null {
  if (!pickupIso || !returnIso) return null
  const p = Date.parse(pickupIso)
  const r = Date.parse(returnIso)
  if (!Number.isFinite(p) || !Number.isFinite(r)) return null
  if (r <= p) return null

  const pickupShift = Math.floor((p - KATHMANDU_SHIFT_OFFSET_MS) / DAY_MS)
  const returnShift = Math.floor((r - 1 - KATHMANDU_SHIFT_OFFSET_MS) / DAY_MS)
  return Math.max(RENTAL_DAYS_MIN, returnShift - pickupShift + 1)
}

/** `2` → `"2 Days"`, `1` → `"1 Day"`, `null` → the caller's fallback. */
export function formatRentalDays(days: number | null, fallback = '—'): string {
  if (days === null) return fallback
  return `${days} Day${days === 1 ? '' : 's'}`
}
