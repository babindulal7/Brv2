/**
 * Validation Engine — Law 9 & Causal Ordering
 *
 * Enforces business rules across booking creation, operations gates, and closure.
 *
 * ⛔ **NOTHING IN THIS FILE IS CALLED.** Verified 16 Aug 2026 by grepping every
 * `.ts`/`.tsx` under `src/` outside `archive/` — **201 files, zero references**
 * to `validateRentalDates`, `validateHandoverReadiness`, `DateRangeValidation`,
 * or to the module path itself. Not one import exists.
 *
 * `BUG_SWEEP_ENGINES_v1.1` `R3-2` found the second function uncalled and
 * `PLAN.md` §4.35 prescribed "delete the dead function (free)". **It is
 * deliberately NOT deleted**, for three reasons found while checking that
 * instruction — see §4.35's revised entry:
 *
 * 1. `validateHandoverReadiness` is the only written statement anywhere in the
 *    codebase of what the Handover gate actually is. The rules still need
 *    building; `floorVerb.ts:979` calls `applyBookingTransition` with **no
 *    `flags`**, so `planTransition`'s `'Deposit Pending'` / `'Payment Due'`
 *    rules (both `blocks: BLOCKS_HANDOVER`) never fire, and the only live gate
 *    is four `useState(false)` checkboxes in `HandoverWorkspace`. Deleting this
 *    would delete the spec of the thing that has yet to be wired.
 * 2. The gate cannot move to the screen instead. Handover is warehouse-facing
 *    and Warehouse is money-blind (Law 6) — `HandoverWorkspace.tsx:945` says so
 *    outright: *"no Outstanding, no Deposit Pending here (§13.1)"*. A deposit
 *    gate is therefore **only** expressible in an engine. Law 1, not taste.
 * 3. The sibling function exposes a live Law 1 violation that deleting this
 *    file would bury: `validateRentalDates` is unused while
 *    `NewRental.tsx:1283` re-derives the same rule inline, and **the two
 *    disagree** (see below).
 *
 * ⬅ **TODO(decision) — the two implementations do not agree, and the screen is
 * the one that runs.** `validateRentalDates` floors at `Math.max(1, ceil(…))`,
 * which is Law 9 (`days >= 1`, enforced at the database on six priced-line
 * tables). `NewRental.tsx:1283` computes `Math.max(0, round(…))` and blocks
 * Confirm on `days === 0`. Because `pickup`/`ret` are date-only there (time is
 * separate state), `round` vs `ceil` never diverges today — but the floor does:
 * **a same-day rental is 1 day to this engine and to the database, and an error
 * on the screen** ("Return must be later than pickup"), so it cannot be booked
 * at all. For a gear-rental business that is a real scenario, and the fix is a
 * behaviour change with money consequences. Not decided here.
 */

export interface DateRangeValidation {
  valid: boolean
  days: number
  error: string | null
}

/**
 * Validates causal pickup/return timestamps in UTC/AD.
 */
export function validateRentalDates(pickupIso: string, returnIso: string): DateRangeValidation {
  const pickup = new Date(pickupIso)
  const returnDate = new Date(returnIso)

  if (isNaN(pickup.getTime()) || isNaN(returnDate.getTime())) {
    return { valid: false, days: 0, error: 'Invalid date format provided.' }
  }

  if (returnDate <= pickup) {
    return {
      valid: false,
      days: 0,
      error: 'Return date/time must be strictly after pickup date/time.',
    }
  }

  const diffMs = returnDate.getTime() - pickup.getTime()
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

  return { valid: true, days, error: null }
}

/**
 * Validates Handover gate checklist
 */
export function validateHandoverReadiness(params: {
  equipmentPacked: boolean
  receiverVerified: boolean
  signaturesCollected: boolean
  depositPendingPaisa: number
  outstandingPaymentPaisa: number
  hasCreditOverride: boolean
}): { ready: boolean; blockingReasons: string[] } {
  const blockingReasons: string[] = []

  if (!params.equipmentPacked) {
    blockingReasons.push('Equipment packing has not been completed.')
  }
  if (!params.receiverVerified) {
    blockingReasons.push('Receiver identity has not been verified.')
  }
  if (!params.signaturesCollected) {
    blockingReasons.push('Handover signatures are incomplete.')
  }
  if (params.depositPendingPaisa > 0 && !params.hasCreditOverride) {
    blockingReasons.push('Security deposit is pending and no credit limit override exists.')
  }
  if (params.outstandingPaymentPaisa > 0 && !params.hasCreditOverride) {
    blockingReasons.push('Rental payment is outstanding and no credit limit override exists.')
  }

  return {
    ready: blockingReasons.length === 0,
    blockingReasons,
  }
}
