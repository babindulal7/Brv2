/**
 * RBAC Engine — Law 6 & Law 11
 *
 * Implements capability checks for the 6 canonical roles:
 *   - Owner
 *   - Manager
 *   - Warehouse (STRICT ZERO-MONEY VISIBILITY)
 *   - Billing
 *   - Accounts
 *   - Viewer
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
  return role !== 'Warehouse'
}

/** Check if user can approve a given discount percentage */
export function canApproveDiscount(role: SystemRole, percent: number, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Approval action blocked offline
  if (percent <= 0) return true
  if (percent > 25) return false // 25% hard cap (Law 10)
  if (role === 'Owner') return true
  if (role === 'Manager' && percent <= 15) return true
  return false
}

/** Check if role can void an invoice */
export function canVoidInvoice(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  return role === 'Owner' || role === 'Accounts'
}

/** Check if role can manage operations sessions (pack, handover, return, reset) */
export function canPerformOperations(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Warehouse'
}

/** Check if role can record payments or security deposits */
export function canRecordPayment(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  return role === 'Owner' || role === 'Billing' || role === 'Accounts'
}

/** Check if role can override client credit limits */
export function canOverrideCreditLimit(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Approval action blocked offline
  return role === 'Owner' || role === 'Manager'
}

/** Check if role can manage users and system configuration */
export function canManageSettings(role: SystemRole): boolean {
  return role === 'Owner'
}

/** Mask monetary figures for Warehouse users */
export function maskMoneyForRole(formattedAmount: string, role: SystemRole): string {
  if (!canViewMoney(role)) {
    return 'Required'
  }
  return formattedAmount
}
