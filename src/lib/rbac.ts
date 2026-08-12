/**
 * RBAC Engine — Law 6 & Law 11
 *
 * Implements capability checks for the business 9 (Manager reopened 9 Aug
 * 2026 by Hover Intel System v2.1 — see the SystemRole doc comment):
 *   - Owner
 *   - Admin        (was also "the Ops Manager" until 9 Aug; now its own seat)
 *   - Manager      (grants mirror Admin everywhere unless a spec says otherwise)
 *   - Coordinator  (bookings, clients, takes the advance)
 *   - Warehouse    (STRICT ZERO-MONEY VISIBILITY)
 *   - Technician   (AC/prep — shares return triage; money-blind)
 *   - Accounts
 *   - Driver       (trips and delivery legs; money-blind)
 *   - Client       (EXTERNAL — portal only, never a staff surface)
 *
 * Every rule below mirrors a function in migration 0014/0018, so a capability
 * can never be granted in the UI and denied by RLS, or the reverse.
 *
 * Rule: Forbidden items are ABSENT from UI / Data, not merely disabled.
 */

import type { SystemRole } from '../types/database'

export type Role = SystemRole

export interface UserSession {
  id: string
  fullName: string
  email: string
  role: SystemRole
  branchId: string
  warehouseId: string | null
}

/** Law 6: Warehouse sees zero financial numbers anywhere in the application */
export function canViewMoney(role: SystemRole): boolean {
  return !MONEY_BLIND.has(role)
}

/**
 * Law 6, widened from Warehouse to the whole floor. A technician holding a
 * tablet in front of a client and a driver at the door are in the same position
 * the rule was written for. Mirrors `auth_can_view_money()` in 0014.
 */
const MONEY_BLIND: ReadonlySet<SystemRole> = new Set<SystemRole>([
  'Warehouse',
  'Technician',
  'Driver',
  'Client',
])

/** Client is external. Guard every staff surface with this. */
export function isStaff(role: SystemRole): boolean {
  return role !== 'Client'
}

/** Check if user can approve a given discount percentage */
export function canApproveDiscount(role: SystemRole, percent: number, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Approval action blocked offline
  if (percent <= 0) return true
  if (percent > 25) return false // 25% hard cap (Law 10)
  if (role === 'Owner') return true
  if ((role === 'Admin' || role === 'Manager') && percent <= 15) return true
  return false
}

/** Check if role can void an invoice */
export function canVoidInvoice(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  return role === 'Owner' || role === 'Accounts'
}

/** Check if role can manage operations sessions (pack, handover, return, reset) */
export function canPerformOperations(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Warehouse' || role === 'Technician'
}

/** Check if role can record payments or security deposits */
export function canRecordPayment(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  return role === 'Owner' || role === 'Coordinator' || role === 'Accounts'
}

/** Check if role can override client credit limits */
export function canOverrideCreditLimit(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Approval action blocked offline
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Check if role can sign off a damage charge at the level the engine requires.
 *
 * **Ruled 12 Aug 2026: Owner and Manager only.** Previously this rule did not
 * exist here at all — `DamageTab.tsx` computed it inline as
 * `approver === 'Owner' ? role === 'Owner' : role === 'Owner' || role === 'Admin' || role === 'Manager'`,
 * which put a business rule in a page (against Law 1) and quietly granted damage
 * sign-off to **Admin**, a role the ruling excludes.
 *
 * The database does not settle this: RLS on `damage_findings` is a single
 * `auth_is_staff()` policy, and its only relevant CHECK
 * (`damage_findings_approved_needs_approver`) requires an approver be *named*,
 * not that they hold any particular rank. So this is the app's rule to state,
 * and an RLS predicate mirroring it is the natural follow-up.
 *
 * `requiredApprover` comes from `lib/damage`'s `approverFor(chargePaisa)` — the
 * Rs 25,000 banding lives there and is NOT duplicated here. This function
 * answers only "may this role act at that level", which keeps the threshold in
 * one place and the role rule in the other. That split is deliberate: importing
 * the threshold into `rbac` would let a later change to one silently re-rule the
 * other, which is exactly the trap `canOverrideCreditLimit` sets if it is
 * borrowed for this.
 */
export function canApproveDamage(role: SystemRole, requiredApprover: 'Manager' | 'Owner'): boolean {
  if (requiredApprover === 'Owner') return role === 'Owner'
  return role === 'Owner' || role === 'Manager'
}

/**
 * Check if role can approve a late-fee waiver.
 *
 * **Not a new ruling** — `lib/lateFee.ts:26` already states it: "Any staff member
 * may raise a waiver; a Manager or Owner must approve it." This function is that
 * sentence made enforceable. There is deliberately **no threshold**, matching
 * `WAIVER_NEEDS_APPROVER = true`: unlike a discount, every waiver needs an
 * approver regardless of size, because waiving is giving money away and the
 * direction — not the amount — is what makes it an approval.
 *
 * Distinct from `canApproveDiscount`, which is percentage-banded, and from
 * `canApproveDamage`, which bands at Rs 25,000. Three money approvals, three
 * different shapes, each stated where it is ruled.
 *
 * ⚠ This governs the SESSION performing the approval. `LateFeePanel` separately
 * collects `approverName` as free-typed text, and `validateWaiver` checks only
 * that it is non-empty — so a typed name is not an authenticated approver.
 * TODO(decision): whether the typed approver field should be replaced by the
 * session's own identity, or kept as a second countersignature alongside it.
 */
export function canApproveLateFeeWaiver(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Manager'
}

/** Check if role can manage users and system configuration */
export function canManageSettings(role: SystemRole): boolean {
  return role === 'Owner'
}
