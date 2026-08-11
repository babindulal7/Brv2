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

/** Check if role can manage users and system configuration */
export function canManageSettings(role: SystemRole): boolean {
  return role === 'Owner'
}
