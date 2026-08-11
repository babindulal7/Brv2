/**
 * **Financial Engine — Foundation Specification v2.0 §2.**
 *
 * §11 names the money formatter one of the four mandatory `lib/` pieces, and
 * says every drift found in this project came from one of the four being
 * reimplemented locally. So every amount in the product passes through here.
 *
 * ## §2.3 — amounts are integer paisa
 *
 * Not `numeric`, not `float`. v2.0's reasoning, verbatim: *"`numeric` returns
 * from the Postgres driver as a **string**; sooner or later something calls
 * `parseFloat` and VAT is out by a paisa. Integer paisa makes 'all displayed
 * totals reconcile exactly' structural rather than hopeful."*
 *
 * **Percentages stay numeric** — VAT rate, discount %, markup %. Only amounts
 * are paisa.
 */

/** A branded integer. `Paisa` and `number` are not interchangeable by accident. */
export type Paisa = number & { readonly __paisa: unique symbol }

/** Rupees → paisa. The only sanctioned way to write a literal amount. */
export function rupees(n: number): Paisa {
  return Math.round(n * 100) as Paisa
}

/** Paisa → rupees, as a number. For arithmetic only; never for display. */
export function toRupees(p: Paisa): number {
  return p / 100
}

/**
 * §2.4 — **Half Up, applied at each displayed step.** JavaScript's `Math.round`
 * is already half-up for positives, but it rounds −0.5 to −0 rather than −1, so
 * negatives (a reversal, a credit note) would drift the wrong way.
 */
export function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n)
}

/**
 * South Asian (lakh) digit grouping — `185000` → `"1,85,000"`.
 *
 * `toLocaleString('en-IN')` is deliberately not used: it is ICU-data dependent
 * and would silently regroup under a different build of Node or a different
 * browser. The last three digits stay together; everything above groups in twos.
 */
export function grouped(n: number): string {
  const neg = n < 0
  const s = String(Math.abs(roundHalfUp(n)))
  if (s.length <= 3) return (neg ? '-' : '') + s
  const tail = s.slice(-3)
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${head},${tail}`
}

/**
 * §2.3 display — `Rs 1,39,506`. Whole rupees carry no decimals; a fractional
 * paisa amount shows two, because hiding it would make a total that does not
 * reconcile look like one that does.
 */
export function formatMoney(p: Paisa): string {
  const whole = Math.trunc(Math.abs(p) / 100)
  const paise = Math.abs(p) % 100
  const sign = p < 0 ? '-' : ''
  return paise === 0
    ? `${sign}Rs ${grouped(whole)}`
    : `${sign}Rs ${grouped(whole)}.${String(paise).padStart(2, '0')}`
}

/** Alias for formatMoney */
export const formatPaisa = formatMoney


/** Parses user input — "1,39,506", "Rs 1,39,506", "139506.50" — to paisa. */
export function parseMoney(input: string): Paisa | null {
  const cleaned = input.replace(/[^\d.-]/g, '')
  if (!cleaned || !/^-?\d*\.?\d*$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? (roundHalfUp(n * 100) as Paisa) : null
}

/* ── §2.1 · the calculation order ──────────────────────────────────────── */

export interface PriceInput {
  equipment: Paisa
  subRental?: Paisa
  services?: Paisa
  crew?: Paisa
  /** §2.1 — "Rs 0 on client pickup". */
  transport?: Paisa
  /** §2.5 — stacked, capped 25%. A percentage, so it stays numeric. */
  discountPercent: number
  /** §2.1 — from Settings ▸ Finance, never hardcoded. */
  vatPercent: number
  payments: Paisa
}

export interface PriceBreakdown {
  subtotal: Paisa
  discount: Paisa
  taxable: Paisa
  vat: Paisa
  rentalTotal: Paisa
  payments: Paisa
  /** §2.2 — deposits never enter this. */
  outstanding: Paisa
}

/** Half-up to the nearest whole rupee, returned in paisa. */
function toWholeRupee(paisa: number): Paisa {
  return (roundHalfUp(paisa / 100) * 100) as Paisa
}

/**
 * §2.1's order, exactly. Every screen reads this; no module recomputes.
 *
 * **Each step rounds to a whole rupee**, which is what §2.4's "Half Up, applied
 * at each displayed step" means in practice — and §2.8's chain only reconciles
 * that way. Carrying full precision instead gives a discount of Rs 9,292.50, a
 * taxable of 1,23,457.50 and a total of **1,39,507** — one rupee above the
 * reference case, and the kind of drift §2.3 exists to prevent. The assertion
 * at the bottom of this file caught exactly that on the first run.
 */
export function price(i: PriceInput): PriceBreakdown {
  const subtotal = (i.equipment + (i.subRental ?? 0) + (i.services ?? 0) + (i.crew ?? 0) + (i.transport ?? 0)) as Paisa
  const discount = toWholeRupee(subtotal * (i.discountPercent / 100))
  const taxable = (subtotal - discount) as Paisa
  const vat = toWholeRupee(taxable * (i.vatPercent / 100))
  const rentalTotal = (taxable + vat) as Paisa
  return {
    subtotal,
    discount,
    taxable,
    vat,
    rentalTotal,
    payments: i.payments,
    outstanding: (rentalTotal - i.payments) as Paisa,
  }
}

/** Alias for price calculation function */
export const calculatePrice = price

/** §2.5 — >10% needs a reason ≥10 chars and a Manager. No Owner bypass. */
export const DISCOUNT_CAP = 25
export const DISCOUNT_APPROVAL_THRESHOLD = 10

export function discountGate(percent: number, reason: string, approver: string | null) {
  if (percent > DISCOUNT_CAP) return { ok: false as const, why: `Discount is capped at ${DISCOUNT_CAP}%` }
  if (percent <= DISCOUNT_APPROVAL_THRESHOLD) return { ok: true as const }
  if (reason.trim().length < 10) return { ok: false as const, why: 'A discount above 10% needs a reason of at least 10 characters' }
  if (!approver) return { ok: false as const, why: 'A discount above 10% needs a Manager approver' }
  return { ok: true as const }
}

/* ── §2 · crew coordination fee — Crew Booking spec v3.2 §2 ──────────────
 *
 * `billed = payouts + coordination fee (+ recharged expenses)`. The fee is
 * Babin's revenue, never paid to crew (§2.1: "the fee is never paid to the
 * crew member"). Expenses are recharged at cost as their own line — Model A,
 * the spec's own recommendation over absorbing them into the fee, which on
 * the spec's worked example (§2.3) would need a fee six times the proposed
 * default to break even.
 *
 * `feePerCrewDayPaisa` and `marginPaisa` can genuinely be absent — the caller
 * passes `undefined` when Settings hasn't configured a fee yet, the same
 * "Not configured, never zero" rule `lateFee`'s TDS-adjacent callers follow
 * elsewhere in this codebase.
 */

export interface CrewBillingInput {
  /** Sum of booked person-dates — see `data/crew.ts`'s `crewDaysBooked()`. */
  crewDays: number
  /** Σ (day rate × days) — paid to crew, never includes the coordination fee. */
  payoutsPaisa: Paisa
  /** Settings ▸ Finance value. `undefined` renders "Not configured", never a guessed zero. */
  feePerCrewDayPaisa?: Paisa
  /** Meals/travel/hotel/fuel/misc for the period. */
  expensesPaisa: Paisa
  /** Model A (true, recommended) recharges expenses at cost; Model B (false) would absorb them into cost with no separate billed line. */
  rechargeExpenses: boolean
}

export interface CrewBillingBreakdown {
  coordinationFeePaisa: Paisa | null
  billedPaisa: Paisa | null
  costPaisa: Paisa
  marginPaisa: Paisa | null
}

export function crewBilling(i: CrewBillingInput): CrewBillingBreakdown {
  const costPaisa = (i.payoutsPaisa + i.expensesPaisa) as Paisa
  if (i.feePerCrewDayPaisa === undefined) {
    return { coordinationFeePaisa: null, billedPaisa: null, costPaisa, marginPaisa: null }
  }
  const coordinationFeePaisa = (i.crewDays * i.feePerCrewDayPaisa) as Paisa
  const billedPaisa = (i.payoutsPaisa + coordinationFeePaisa + (i.rechargeExpenses ? i.expensesPaisa : 0)) as Paisa
  const marginPaisa = i.rechargeExpenses
    ? coordinationFeePaisa
    : ((coordinationFeePaisa - i.expensesPaisa) as Paisa)
  return { coordinationFeePaisa, billedPaisa, costPaisa, marginPaisa }
}

/* ── late fee · Decisions — 8 Aug 2026 §3 Q2 ───────────────────────────── */

/**
 * §3 Q2, verbatim: *"Late fee: ≤30 min grace → 0 · under 2h → half day · 2h
 * or more → full day, then full days."*
 *
 * Three tiers, stated by formula so a future reader can check this without
 * re-deriving the ruling from prose:
 *
 * ```
 * overageMinutes = max(0, (actualReturnAt − scheduledReturnAt) in minutes)
 *
 * overageMinutes <= 30   → band 'None'      feePaisa = 0
 * 30 < overageMinutes < 120 → band 'Half Day'  feePaisa = round½(dayRatePaisa / 2)
 * overageMinutes >= 120  → band 'Full Day'   feePaisa = round½(dayRatePaisa × fullDaysCharged)
 * ```
 *
 * `fullDaysCharged` inside the Full Day band: crossing the 2h line always
 * charges exactly one day — a return 2h01m late and a return 23h59m late owe
 * the same one day, because "2h or more → full day" is a threshold, not a
 * proration. Beyond that, "then full days" is read here as the same
 * round-up-on-any-excess rule the first two tiers already use: every
 * complete-or-partial additional 24h block adds one more day —
 *
 * ```
 * fullDaysCharged = max(1, ceil(overageMinutes / 1440))
 * ```
 *
 * ⚠ TODO(decision) — that second-and-later-days formula is the *natural
 * extension* of tiers 1-2's round-up logic, not a sentence the 8 Aug ruling
 * states explicitly. The ruling's text stops at "then full days" without
 * saying whether the second day starts charging at minute 1 past the first
 * 24h (this reading) or only after a further complete 24h has elapsed.
 * Flagged rather than silently assumed — confirm and record in PLAN.md §4.
 *
 * `overageMinutes` is left as an exact (possibly fractional) elapsed
 * duration, not pre-rounded to a whole minute — §2.4's Half Up rounding
 * governs *money*, at each displayed step; nothing in the ruling says
 * duration itself is rounded before the band comparison, and inventing a
 * rounding rule the ruling doesn't state would be its own defect.
 *
 * Plain AD-timestamp subtraction (`Date#getTime()`), deliberately not
 * touching `lib/bs.ts` — BS/AD calendar conversion has nothing to do with
 * elapsed-duration arithmetic between two already-AD instants.
 *
 * ⚠ TODO(decision) / known gap — this function cannot be driven end-to-end
 * from real data yet:
 *   - `scheduledReturnAt` / `actualReturnAt` are meant to be
 *     `bookings.return_at` / `bookings.actual_return_at`
 *     (`supabase/migrations/0002_bookings.sql` lines 32-33), but no TS
 *     domain type in `src/` exposes either as a live `Date` today — only
 *     pre-formatted display strings exist in the seed layer — and
 *     `actual_return_at` is a column nothing in the repo ever writes:
 *     `ReturnWorkspace.tsx` has no persistence layer at all yet, and which
 *     session-close event should stamp it (first partial close, or only the
 *     close that finally completes the booking's Return job) is unruled.
 *   - `dayRatePaisa` is not derived here, on the same convention `price()`
 *     already uses for `equipment` — the caller pre-aggregates, this
 *     function never sums rows. No function anywhere in `src/` aggregates a
 *     booking's live `booking_lines.rate × qty` into one "one day" figure
 *     yet, and whether that scope is equipment-only or also includes crew
 *     (`booking_crew_lines.day_rate`) and/or transport (a flat,
 *     non-daily charge) is unruled.
 * Neither gap is papered over with an invented source — the caller simply
 * cannot supply real values for either field yet.
 */
export interface LateFeeInput {
  /** `bookings.return_at` — the scheduled/expected return moment. */
  scheduledReturnAt: Date
  /** `bookings.actual_return_at` — set once, at whichever session completes the booking's Return job. Nothing writes this column today; see the TODO(decision) above. */
  actualReturnAt: Date
  /** One day's rental rate for whatever scope is eventually ruled on (see the TODO(decision) above) — pre-aggregated by the caller, never raw rows, same convention as `PriceInput.equipment`. */
  dayRatePaisa: Paisa
}

export interface LateFeeResult {
  /** Elapsed minutes past the scheduled return. Never negative — an early or on-time return reads as 0, not a negative number. */
  overageMinutes: number
  band: 'None' | 'Half Day' | 'Full Day'
  /** 0 outside the Full Day band; >=1 inside it. */
  fullDaysCharged: number
  feePaisa: Paisa
}

export function lateFee(i: LateFeeInput): LateFeeResult {
  const overageMs = i.actualReturnAt.getTime() - i.scheduledReturnAt.getTime()
  const overageMinutes = Math.max(0, overageMs / 60000)

  if (overageMinutes <= 30) {
    return { overageMinutes, band: 'None', fullDaysCharged: 0, feePaisa: rupees(0) }
  }
  if (overageMinutes < 120) {
    return { overageMinutes, band: 'Half Day', fullDaysCharged: 0, feePaisa: toWholeRupee(i.dayRatePaisa / 2) }
  }
  const fullDaysCharged = Math.max(1, Math.ceil(overageMinutes / 1440))
  return { overageMinutes, band: 'Full Day', fullDaysCharged, feePaisa: toWholeRupee(i.dayRatePaisa * fullDaysCharged) }
}

/* ── §2.8 · the reference case, asserted ───────────────────────────────── */

/**
 * *"Any screen showing 1,39,208 / 1,24,208 / 91,550 / 1,08,548 / 58,548 is
 * rendering superseded seed data and is a defect."*
 *
 * Checked at module load, so a change to the engine that breaks the worked
 * example fails loudly here rather than quietly on six screens.
 */
const REFERENCE = price({
  equipment: rupees(132750),
  discountPercent: 7,
  vatPercent: 13,
  payments: rupees(15000),
})

const EXPECTED = { discount: 9293, taxable: 123457, vat: 16049, rentalTotal: 139506, outstanding: 124506 }

/**
 * ⛔ This block used to `throw`. A module-evaluation throw is **uncatchable** —
 * it runs before `main.tsx`, so no ErrorBoundary exists yet and React never
 * mounts. The operator gets a white screen with nothing in it, which §6 rules
 * out twice over: *"A blank page is never acceptable. 'Something went wrong' is
 * never acceptable."* It happened for real while this engine was being written:
 * the paisa/rupee rounding bug below blanked the whole app and the only symptom
 * was an empty `#root`.
 *
 * The failure is still fatal — §2.8 says a screen showing different figures is
 * a defect, so the product must not run on a broken engine. It is now
 * *reported* instead of thrown, and `main.tsx` renders a stated error screen
 * naming the step that broke.
 */
export const REFERENCE_CASE_ERROR: string | null = (() => {
  const wrong = Object.entries(EXPECTED)
    .map(([k, v]) => ({ k, v, got: toRupees(REFERENCE[k as keyof typeof EXPECTED] as Paisa) }))
    .filter((x) => x.got !== x.v)
  if (wrong.length === 0) return null
  return (
    'Financial Engine failed Foundation §2.8. ' +
    wrong.map((x) => `${x.k}: expected Rs ${x.v}, engine produced Rs ${x.got}`).join('; ') +
    '. No screen may show money until this is fixed — see lib/money.ts.'
  )
})()

/** The §2.8 figures, for any screen that needs to show the worked example. */
export const REFERENCE_CASE = REFERENCE
