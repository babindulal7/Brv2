/**
 * # Damage findings — the engine
 *
 * The flow was locked and entirely unbuilt: zero screens, no calculation, and
 * `damage_findings` / `cases` sitting in the schema with nothing writing them.
 *
 * ```
 * Return triage → Flag → Damage
 *    ↓ photo REQUIRED (1 minimum)
 * Damage Report
 *    ├ asset replacement value shown as the reference figure
 *    ├ actual charge decided case-by-case
 *    ├ < Rs 25,000 → Manager approves
 *    └ ≥ Rs 25,000 → Owner approves
 *    ↓ once approved
 * Item AUTO-MOVES to Maintenance (unavailable for booking)
 *    ↓
 * Deposit refund = deposit − damage, accountant confirms before issue
 * ```
 *
 * Pages never implement this — `CLAUDE.md`'s first law. Every rule above lives
 * here so the Return form, the Maintenance tab and whatever eventually writes
 * the row all reach the same answer.
 *
 * ## The two things this refuses to guess
 *
 * - **Replacement value is a reference, not the charge.** The spec says the
 *   charge is decided case-by-case, so nothing here derives one from the other.
 *   A scuffed lens hood on a Rs 4,00,000 lens is not a Rs 4,00,000 event, and an
 *   engine that defaulted the charge to the replacement value would make that
 *   the path of least resistance.
 * - **A charge above the replacement value is flagged, not blocked.** Repair can
 *   genuinely cost more than replacement, and this engine does not get to
 *   overrule the person holding the item. It says so and lets them proceed.
 */

import { rupees, toRupees } from './money'
import type { Paisa } from './money'

/** ≥ this figure needs the Owner; below it a Manager may approve. Ruled 12 Aug. */
export const OWNER_APPROVAL_THRESHOLD: Paisa = rupees(25000)

/** §7 — mandatory on every Damaged/Lost line before a charge can be raised. */
export const MIN_PHOTOS = 1

/** The floor a damage description has to clear, same length Law 10 uses for a discount reason. */
export const MIN_DESCRIPTION = 10

export type DamageApprover = 'Manager' | 'Owner'

export type DamageState = 'Draft' | 'Awaiting Approval' | 'Approved' | 'Rejected'

export interface DamageReportInput {
  /** Free text. What broke, and how. */
  description: string
  /** Evidence count. One is the minimum and the reason the flow exists. */
  photos: number
  /** What the operator proposes to charge. Case-by-case, never derived. */
  chargePaisa: Paisa
  /** The asset's replacement value — shown as the reference figure, never the default. */
  replacementPaisa: Paisa
}

/**
 * Who has to sign this off.
 *
 * The boundary is inclusive at the top: exactly Rs 25,000 goes to the Owner.
 * "< Rs 25,000 → Manager · ≥ Rs 25,000 → Owner" leaves no gap, and a threshold
 * that both roles could claim is the kind that gets argued about later.
 */
export function approverFor(chargePaisa: Paisa): DamageApprover {
  return chargePaisa >= OWNER_APPROVAL_THRESHOLD ? 'Owner' : 'Manager'
}

export interface DamageValidation {
  valid: boolean
  /** Blocking problems, keyed by field. */
  errors: Record<string, string>
  /** Non-blocking things the approver should see before signing. */
  warnings: string[]
  approver: DamageApprover
}

export function validateDamageReport(i: DamageReportInput): DamageValidation {
  const errors: Record<string, string> = {}
  const warnings: string[] = []

  if (i.photos < MIN_PHOTOS) {
    errors.photos = `At least ${MIN_PHOTOS} photo is required before a damage charge can be raised — it is the evidence the charge rests on.`
  }
  if (i.description.trim().length < MIN_DESCRIPTION) {
    errors.description = `Describe the damage in at least ${MIN_DESCRIPTION} characters. "Broken" is not a finding.`
  }
  if (i.chargePaisa < 0) {
    errors.charge = 'A damage charge cannot be negative. To charge nothing, enter 0 and say why.'
  }

  if (i.chargePaisa === 0) {
    warnings.push('Charging nothing. The finding is still recorded and the item still moves to Maintenance.')
  }
  if (i.replacementPaisa > 0 && i.chargePaisa > i.replacementPaisa) {
    /* Not blocked — repair can genuinely cost more than replacement, and this
       engine does not get to overrule the person holding the item. */
    warnings.push(
      `The charge is above the asset's replacement value of Rs ${toRupees(i.replacementPaisa).toLocaleString('en-IN')}. That can be right for a repair, but it needs saying out loud.`,
    )
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    warnings,
    approver: approverFor(i.chargePaisa),
  }
}

export interface DepositSettlement {
  /** What goes back to the client. Never negative — a deposit cannot owe. */
  refundPaisa: Paisa
  /** Damage that the deposit did not cover, and which becomes a receivable. */
  shortfallPaisa: Paisa
  /** True when the damage exactly consumed the deposit. */
  fullyConsumed: boolean
}

/**
 * `refund = deposit − damage`, floored at zero.
 *
 * The floor is the law, not a convenience: **deposits are liabilities and never
 * touch Rental Total or Outstanding** (`CLAUDE.md`). A damage charge larger than
 * the deposit does not make the refund negative — it produces a *shortfall*,
 * which is a receivable raised separately. Returning a negative number here
 * would invite a caller to add it to a total and quietly break the law.
 *
 * The accountant still confirms before the refund is issued; nothing here
 * issues anything.
 */
export function settleDeposit(depositPaisa: Paisa, damagePaisa: Paisa): DepositSettlement {
  const deposit = Math.max(0, depositPaisa)
  const damage = Math.max(0, damagePaisa)
  const refund = Math.max(0, deposit - damage)
  const shortfall = Math.max(0, damage - deposit)

  return {
    refundPaisa: refund as Paisa,
    shortfallPaisa: shortfall as Paisa,
    fullyConsumed: deposit > 0 && refund === 0,
  }
}

/**
 * What an approval does to the unit.
 *
 * The spec's "AUTO-MOVES to Maintenance (and is unavailable for booking)" is one
 * fact with two halves, and the second half is the one that matters: a unit in
 * Maintenance must not be pickable in New Rental. Returning both together stops
 * a caller moving the status and forgetting the availability.
 */
export interface DamageApprovalEffect {
  nextUnitStatus: 'Maintenance'
  availableForBooking: false
  /** Why the unit moved, for the maintenance record and the audit line. */
  reason: string
}

export function approvalEffect(report: DamageReportInput, approvedBy: string): DamageApprovalEffect {
  return {
    nextUnitStatus: 'Maintenance',
    availableForBooking: false,
    reason: `Damage approved by ${approvedBy}: ${report.description.trim()}`,
  }
}

/** The next state a report moves to when it is submitted for sign-off. */
export function submitState(validation: DamageValidation): DamageState {
  return validation.valid ? 'Awaiting Approval' : 'Draft'
}
