/**
 * src/components/ui/creation/PermissionGate.tsx — Babin Rentals OS
 *
 * PermissionGate component and capability verification utilities
 * for creation workflows and UI surfaces.
 */

import type { ReactNode } from 'react'
import type { Role as SystemRole } from '../../../lib/rbac'
import {
  canViewMoney,
  canWriteBookingDesk,
  canCreateClient,
  canCreateBundle,
  canPerformOperations,
  canRecordPayment,
  canReversePayment,
  canManageSettings,
  isStaff,
  canWriteFloor,
} from '../../../lib/rbac'
import { useAuth } from '../../../lib/auth'

export type CreationCapability =
  | 'rental.create'
  | 'client.create'
  | 'inventory.create'
  | 'inventory.write'
  | 'operations.perform'
  | 'payment.create'
  | 'payment.reverse'
  | 'money.view'
  | 'settings.manage'
  | 'staff.access'

/**
 * Checks whether a given role holds the requested creation capability.
 */
export function hasCapability(
  capability: CreationCapability | string,
  role?: SystemRole | null
): boolean {
  if (!role) return false

  switch (capability) {
    case 'rental.create':
      return canWriteBookingDesk(role)
    case 'client.create':
      return canCreateClient(role)
    case 'inventory.create':
      return canCreateBundle(role)
    case 'inventory.write':
      return canWriteFloor(role)
    case 'operations.perform':
      return canPerformOperations(role)
    case 'payment.create':
      return canRecordPayment(role) && canViewMoney(role)
    case 'payment.reverse':
      return canReversePayment(role) && canViewMoney(role)
    case 'money.view':
      return canViewMoney(role)
    case 'settings.manage':
      return canManageSettings(role)
    case 'staff.access':
      return isStaff(role)
    default:
      return false
  }
}

/**
 * Hook to check if current logged-in user holds a creation capability.
 */
export function useHasCapability(capability: CreationCapability | string): boolean {
  const { user } = useAuth()
  return hasCapability(capability, user?.role)
}

export interface PermissionGateProps {
  capability: CreationCapability | string
  role?: SystemRole | null | undefined
  fallback?: ReactNode | undefined
  children: ReactNode
}

/**
 * Renders children only if current user has the required capability; otherwise renders fallback or null.
 * Strictly adheres to Law 6: forbidden items are ABSENT from UI, not merely disabled.
 */
export function PermissionGate({
  capability,
  role,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { user } = useAuth()
  const effectiveRole = role !== undefined ? role : user?.role

  if (!hasCapability(capability, effectiveRole)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
