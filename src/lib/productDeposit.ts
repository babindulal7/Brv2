import type { Paisa } from './money'

/**
 * # What a product itself asks as a security deposit (C6)
 *
 * `products.deposit_fixed` and `products.deposit_percent` have been editable on
 * the equipment record since 0004, and nothing ever read them: New Rental's
 * recommended deposit was only "the gear total, never under Rs 5,000". A
 * deposit someone set on a camera body had no effect on the booking.
 *
 * ## The rule (⭐ B-5, the conservative reading — Babin may override)
 *
 * Per unit: a **fixed** deposit wins when it is set; otherwise **percent of the
 * unit's replacement value**; otherwise the product asks for nothing. Per line:
 * unit deposit × quantity (not × days — a deposit is held once). The booking's
 * product deposit is the sum over its physical lines.
 *
 * The recommended deposit is then **the larger of** the existing flat rule and
 * that sum. A product can raise the recommendation; it can never lower it below
 * what the booking asked before this existed. That is the stricter side, and it
 * is reversible with one expression.
 *
 * ## What it is not
 *
 * Not revenue and never part of Rental Total or Outstanding (Law 5) — it feeds
 * only the `recommendedDepositPaisa` input of the pricing pipeline, where the
 * deposit stays its own liability. A staff override (reason + authorising
 * manager) still wins over it, exactly as before.
 *
 * Money-blind sessions read `null` for every figure here (`products_v` masks
 * them), so for them this contributes nothing and the flat rule stands. They
 * never see the deposit in any case (Law 6).
 */

export interface ProductDepositTerms {
  /** `products.deposit_fixed`, whole paisa, or null when unset or masked. */
  fixedPaisa: number | null
  /** `products.deposit_percent`, 0–100, or null when unset or masked. */
  percent: number | null
  /** `products.replacement_value`, whole paisa, or null when unset or masked. */
  replacementPaisa: number | null
}

/** One unit's deposit, in paisa, or null when the product asks for none. */
export function unitDepositPaisa(terms: ProductDepositTerms | undefined): number | null {
  if (!terms) return null
  if (terms.fixedPaisa !== null && Number.isFinite(terms.fixedPaisa) && terms.fixedPaisa > 0) {
    return terms.fixedPaisa
  }
  if (
    terms.percent !== null &&
    terms.replacementPaisa !== null &&
    Number.isFinite(terms.percent) &&
    Number.isFinite(terms.replacementPaisa) &&
    terms.percent > 0 &&
    terms.replacementPaisa > 0
  ) {
    return (terms.replacementPaisa * terms.percent) / 100
  }
  return null
}

export interface DepositLine {
  productId?: string | null | undefined
  qty: number
  lineType?: string | undefined
}

/** Line types that are physical gear and so can carry a product deposit. */
const PHYSICAL = new Set(['Equipment', 'Accessory'])

/** Σ unit deposit × qty over the booking's physical lines, rounded to a whole rupee. */
export function productDepositPaisa(
  lines: readonly DepositLine[],
  terms: ReadonlyMap<string, ProductDepositTerms>,
): Paisa {
  let total = 0
  for (const line of lines) {
    if (!line.productId) continue
    if (line.lineType !== undefined && !PHYSICAL.has(line.lineType)) continue
    if (!Number.isFinite(line.qty) || line.qty <= 0) continue
    const unit = unitDepositPaisa(terms.get(line.productId))
    if (unit !== null) total += unit * line.qty
  }
  return (Math.round(total / 100) * 100) as Paisa
}

/** The recommendation: the flat rule, raised (never lowered) by what the products ask. */
export function recommendedDepositWithProducts(flatRulePaisa: Paisa, fromProductsPaisa: Paisa): Paisa {
  return Math.max(flatRulePaisa, fromProductsPaisa) as Paisa
}
