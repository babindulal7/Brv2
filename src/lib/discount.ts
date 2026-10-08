/**
 * Discount Engine — Law 10 as amended: THE GATE IS GONE.
 *
 * The ruling chain, kept because it moved twice in two days:
 *
 *  - Original Law 10: ">10% needs reason ≥10 chars and a named approver;
 *    25% hard cap; no role bypass, including Owner."
 *  - 30 Aug 2026, D3 (REFERENCE_SPEC v2.5 Appendix A0): Babin ruled **no
 *    discount gate** ("copy Booqable").
 *  - 31 Aug, first confirmation: the policies alternative (authorise once,
 *    apply by reference) was accepted and briefly built here.
 *  - 31 Aug, final word from Babin: **"don't put any gate on discount."**
 *    The policies mechanism was removed the same session; this file, the
 *    `money.ts` and `rbac.ts` copies, and the DB objects (via
 *    `0074_drop_discount_gate.sql`, draft) all dropped the ceremony together
 *    — a half-removed gate (UI open, DB closed) being the one state the
 *    RUN_PROMPT forbade.
 *
 * What survives is arithmetic validity, not policy: a negative "discount" is
 * a price increase (the R3-1 hole stays closed), and above 100% is a negative
 * price. `requiresApproval` is kept in the result shape so the call sites
 * that render approval UI keep compiling — it is now always `false`, which is
 * exactly what makes their approval prompts disappear without a sweep.
 */

export interface DiscountValidationResult {
  valid: boolean
  /** Always false since 31 Aug 2026 — nothing needs approval any more. */
  requiresApproval: boolean
  error: string | null
}

/**
 * Validates ONLY that the number is a discount at all. No reason, no
 * approver, no cap below 100 — ruled, twice, by the owner.
 */
export function validateDiscount(
  percent: number,
  _reason?: string | null,
  _approverId?: string | null
): DiscountValidationResult {
  if (percent < 0) {
    return { valid: false, requiresApproval: false, error: 'Discount percent cannot be negative' }
  }

  if (percent > 100) {
    return {
      valid: false,
      requiresApproval: false,
      error: 'A discount above 100% is a negative price, not a discount.',
    }
  }

  return { valid: true, requiresApproval: false, error: null }
}
