import { rupees } from '../lib/money'
import type { Paisa } from '../lib/money'

/**
 * **Finance ▸ Reports ▸ Cash Flow + Working Capital** — the data behind two of the
 * 31 designed reports, built from `Babin Cash Flow Report` and
 * `Babin Working Capital Report`.
 *
 * Law 1: the screens hold no arithmetic. Every figure either sits in a ledger
 * array below or is derived by a function here, so a number cannot differ
 * between the KPI strip, the statement table and the rail.
 *
 * Two rules from the design carry real business meaning and are enforced, not
 * merely rendered:
 *
 *  1. **Deposits are excluded from operating cash.** They are client funds held
 *     in trust — refundable, never revenue, never Babin's to spend. `netCash()`
 *     cannot see `DEPOSITS_HELD`; it is reported beside the statement, never
 *     inside it. This is the same liability rule the schema enforces by keeping
 *     `security_deposits` out of `payments`.
 *  2. **Cash basis, not accrual.** This report reconciles the accrual profit to
 *     the cash the month actually produced. `PAPER_PROFIT` exists only so the
 *     gap can be stated out loud; it is never added to a cash line.
 */

// ── Period ───────────────────────────────────────────────────────────────────
// AD is the stored value; BS is rendered from it by lib/bs. Nothing here stores
// a BS string — Date Engine is the only converter.
export const PERIOD_START = new Date(Date.UTC(2026, 6, 16))
export const PERIOD_END = new Date(Date.UTC(2026, 7, 15))

// ── Cash flow ledger ─────────────────────────────────────────────────────────

export type CashKind = 'opening' | 'in' | 'operating' | 'capex' | 'closing'

export interface CashLine {
  label: string
  detail?: string
  kind: CashKind
  amount: Paisa
}

/** Signed movement lines only — opening and closing are derived, never typed. */
export const CASH_LINES: CashLine[] = [
  { label: 'Cash in — client collections', detail: 'invoices settled this period', kind: 'in', amount: rupees(274_000) },
  { label: 'Cash out — operating', detail: 'rent, salary, maintenance, transport', kind: 'operating', amount: rupees(-135_000) },
  { label: 'Cash out — equipment purchase', detail: 'capex, one-off', kind: 'capex', amount: rupees(-56_000) },
]

export const OPENING_CASH: Paisa = rupees(340_000)

/** Billed in the period on the accrual side — the denominator for collection rate. */
export const INVOICED: Paisa = rupees(420_000)

/** Accrual profit. Quoted to expose the profit-vs-cash gap; never a cash line. */
export const PAPER_PROFIT: Paisa = rupees(229_000)

/** Client money held in trust. Deliberately outside every cash total. */
export const DEPOSITS_HELD: Paisa = rupees(25_000)

/** Monthly operating burn, used for runway. */
export const OPERATING_BURN: Paisa = rupees(135_000)

// ── Cash flow derivations ────────────────────────────────────────────────────

const sum = (lines: CashLine[]): number => lines.reduce((t, l) => t + (l.amount as number), 0)

export const cashIn = (): Paisa => sum(CASH_LINES.filter((l) => l.kind === 'in')) as Paisa
export const operatingOut = (): Paisa => sum(CASH_LINES.filter((l) => l.kind === 'operating')) as Paisa
export const capexOut = (): Paisa => sum(CASH_LINES.filter((l) => l.kind === 'capex')) as Paisa

/** Operating cash before capital spend — the figure that shows the business works. */
export const netOperatingCash = (): Paisa => ((cashIn() as number) + (operatingOut() as number)) as Paisa

/** Net movement including capex. Deposits are absent by design. */
export const netCash = (): Paisa => sum(CASH_LINES) as Paisa

export const closingCash = (): Paisa => ((OPENING_CASH as number) + (netCash() as number)) as Paisa

/** Share of what was billed that actually arrived. */
export const collectionRate = (): number =>
  Math.round(((cashIn() as number) / (INVOICED as number)) * 100)

export const uncollected = (): Paisa => ((INVOICED as number) - (cashIn() as number)) as Paisa

/** Months of operating cost the closing balance covers. One decimal. */
export const runwayMonths = (): number =>
  Math.round(((closingCash() as number) / Math.abs(OPERATING_BURN as number)) * 10) / 10

/** The gap the report exists to explain: accrual profit that did not become cash. */
export const profitToCashGap = (): Paisa => ((PAPER_PROFIT as number) - (netCash() as number)) as Paisa

/**
 * What lifting collection to a target rate would release this cycle. The design
 * quotes 80% → ~NPR 63K; this derives it rather than hardcoding the sentence.
 */
export const collectionUpside = (targetPct: number): Paisa =>
  Math.round((INVOICED as number) * ((targetPct - collectionRate()) / 100)) as Paisa

// ── Working capital position ─────────────────────────────────────────────────

/**
 * A balance-sheet line.
 *
 * `amount: null` means **not tracked yet** — there is no table behind the line,
 * so no figure may be printed for it and no derivation may include it. It is
 * NOT zero: zero is a claim that the business owes nothing, which is a
 * different and unevidenced statement.
 *
 * See `POSITION` below for the one line that carries it and why.
 */
export interface PositionLine {
  label: string
  nature: string
  amount: Paisa | null
  side: 'asset' | 'liability'
}

/**
 * ⚠ **Trade payables was a hand-typed Rs 42,200 and is now `null`.**
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §8 names this line specifically, and
 * `09_FINANCE.md` §9.6 rules the Payables report *"renders the honest 'not
 * tracked yet' empty state, never a fabricated figure"*. There is no
 * supplier-invoice table anywhere in `supabase/migrations/` — no `bills`, no
 * `supplier_invoices`, no `accounts_payable` — so nothing in this repository
 * knows what Babin owes its suppliers or its sub-rental partners.
 *
 * The figure was not merely displayed. It flowed into `currentLiabilities()`,
 * and from there into `workingCapital()`, `currentRatio()` and `freeCash()` —
 * four figures on `WorkingCapitalReport.tsx`, every one of them stated as fact.
 * Had the Payables report been built beside it, the app would have said "not
 * tracked yet" on one screen and Rs 42,200 of the same liability on another.
 *
 * **What replaces it, and why not simply delete the line.** Deleting it would
 * make the liability side *look* complete, and the current ratio would read as
 * a finished figure computed over a set that is missing a whole class of
 * obligation. The line stays, states that it is untracked, and every derivation
 * below either excludes it and says so (`LIABILITIES_ARE_COMPLETE` is `false`)
 * or refuses to answer. A reader of the report is told what is missing rather
 * than shown a total that quietly is not one.
 */
export const POSITION: PositionLine[] = [
  { label: 'Cash at bank', nature: 'Operating account', amount: rupees(398_000), side: 'asset' },
  { label: 'Cash in hand', nature: 'Petty cash', amount: rupees(25_000), side: 'asset' },
  { label: 'Trade receivables', nature: '4 clients owing', amount: rupees(155_000), side: 'asset' },
  {
    label: 'Trade payables',
    nature: 'Not tracked yet — no supplier-invoice table exists',
    amount: null,
    side: 'liability',
  },
  { label: 'Deposits refundable', nature: 'Client funds held in trust', amount: rupees(25_000), side: 'liability' },
]

/** The lines that have no source. Rendered by name so the gap is visible, not implied. */
export const untrackedLines = (side: PositionLine['side']): PositionLine[] =>
  POSITION.filter((l) => l.side === side && l.amount === null)

/**
 * `false` while any liability line is untracked.
 *
 * Every consumer of `currentLiabilities()` must branch on this: the sum below
 * is the total of what is *known*, which is a floor, not the figure. Exported
 * as a derived constant rather than a comment so a caller cannot forget it —
 * `WorkingCapitalReport.tsx` reads it to decide between a number and "not
 * tracked yet".
 */
export const LIABILITIES_ARE_COMPLETE: boolean = untrackedLines('liability').length === 0
export const ASSETS_ARE_COMPLETE: boolean = untrackedLines('asset').length === 0

/** Days between invoicing and collection. Rentals are pre-agreed, so this is all receivables. */
export const CASH_CONVERSION_DAYS = 28
export const CASH_CONVERSION_DAYS_PRIOR = 25

/** Sum of the lines on one side that HAVE a figure. An untracked line contributes nothing. */
const sumSide = (side: PositionLine['side']): Paisa =>
  POSITION.filter((l) => l.side === side && l.amount !== null).reduce(
    (t, l) => t + (l.amount as number),
    0,
  ) as Paisa

export const currentAssets = (): Paisa => sumSide('asset')

/**
 * The liabilities that are tracked. **A floor, not a total** — check
 * `LIABILITIES_ARE_COMPLETE` before rendering it as one.
 */
export const currentLiabilities = (): Paisa => sumSide('liability')

export const receivables = (): Paisa =>
  POSITION.find((l) => l.label === 'Trade receivables')?.amount ?? (rupees(0) as Paisa)

/**
 * Assets less liabilities — `null` while either side is incomplete.
 *
 * With payables untracked, assets-less-KNOWN-liabilities is an upper bound, and
 * an upper bound printed as a figure is a fabricated figure. Callers render
 * "not tracked yet". `workingCapitalCeiling()` exists for a caller that wants
 * to state the bound *as* a bound, in words.
 */
export const workingCapital = (): Paisa | null =>
  LIABILITIES_ARE_COMPLETE && ASSETS_ARE_COMPLETE
    ? (((currentAssets() as number) - (currentLiabilities() as number)) as Paisa)
    : null

/** The bound, labelled as one. Never render this without the words "at most". */
export const workingCapitalCeiling = (): Paisa =>
  ((currentAssets() as number) - (currentLiabilities() as number)) as Paisa

/**
 * One decimal. No inventory for resale, so the quick ratio equals this.
 *
 * `null` while liabilities are incomplete: a denominator missing a whole class
 * of obligation *overstates* liquidity, which is the direction that gets a
 * business into trouble.
 */
export const currentRatio = (): number | null =>
  LIABILITIES_ARE_COMPLETE
    ? Math.round(((currentAssets() as number) / (currentLiabilities() as number)) * 10) / 10
    : null

/**
 * Cash genuinely available once obligations are met. Deposits come out here too:
 * they sit in the operating account but belong to the client.
 *
 * `null` for the same reason as `currentRatio()`, and it is the most important
 * of the four: "free" cash computed against an incomplete obligation list is
 * the one figure somebody would go and spend.
 */
export const freeCash = (): Paisa | null =>
  LIABILITIES_ARE_COMPLETE
    ? (((currentAssets() as number) - (receivables() as number) - (currentLiabilities() as number)) as Paisa)
    : null

export const freeCashMonths = (): number | null => {
  const free = freeCash()
  return free === null ? null : Math.round(((free as number) / Math.abs(OPERATING_BURN as number)) * 100) / 100
}

export const receivableShare = (): number =>
  Math.round(((receivables() as number) / (currentAssets() as number)) * 100)

/** Cash released per day cut from the collection cycle. */
export const cashPerDayOfCycle = (): Paisa =>
  Math.round((receivables() as number) / CASH_CONVERSION_DAYS) as Paisa

export const cycleUpside = (targetDays: number): Paisa =>
  Math.round((cashPerDayOfCycle() as number) * (CASH_CONVERSION_DAYS - targetDays)) as Paisa

export const OVERDUE: Paisa = rupees(36_400)
