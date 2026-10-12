/**
 * src/components/ui/header/pageActionRegistry.ts — Babin Rentals OS
 *
 * Typed Action Registry for Universal Page Header Standard.
 * Encapsulates visibility, permissions, workflow states, confirmation rules,
 * loading states, and priority-driven action partitioning.
 */

import type { IconName } from '../Icon'
import type { Role as SystemRole } from '../../../lib/rbac'
import { canViewMoney } from '../../../lib/rbac'

export type PageActionPriority = 'primary' | 'secondary' | 'overflow' | 'add'

export interface PageActionConfirmConfig {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string | undefined
  variant?: 'danger' | 'primary' | undefined
}

export interface PageActionDropdownItem {
  id: string
  label: string
  icon?: IconName | undefined
  onClick: () => void | Promise<void>
  disabled?: boolean | undefined
  disabledReason?: string | undefined
}

export interface PageActionContext {
  role?: SystemRole | null | undefined
  workflowState?: string | undefined
  isDirty?: boolean | undefined
  isSubmitting?: boolean | undefined
}

export interface PageActionItem {
  id: string
  label: string
  icon?: IconName | undefined
  priority?: PageActionPriority | undefined
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | undefined
  
  /** Whether the action involves monetary amounts or actions (Law 6) */
  isMoneyAction?: boolean | undefined

  /** Visibility rule: boolean or dynamic predicate */
  visible?: boolean | ((ctx: PageActionContext) => boolean) | undefined

  /** Role-based permission checker */
  permission?: ((role: SystemRole) => boolean) | undefined

  /** Allowed workflow stage keys (e.g. ['Quote', 'Booked']) */
  allowedWorkflowStates?: readonly string[] | string[] | undefined
  currentState?: string | undefined

  /** Enabled condition + explanation when disabled */
  enabled?: boolean | ((ctx: PageActionContext) => boolean) | undefined
  disabledReason?: string | undefined

  /** Loading state and accessible text */
  loading?: boolean | undefined
  loadingLabel?: string | undefined

  /** Primary click handler */
  onClick?: ((e?: React.MouseEvent) => void | Promise<void>) | undefined

  /** Confirmation dialog requirement for destructive/irreversible actions */
  confirm?: PageActionConfirmConfig | undefined

  /** Multi-option creation dropdown items (for Add actions) */
  dropdownItems?: PageActionDropdownItem[] | undefined
}

export interface ResolvedPageActions {
  primary: PageActionItem | null
  add: PageActionItem | null
  secondary: PageActionItem[]
  overflow: PageActionItem[]
}

/**
 * Evaluates visibility, role permission, money blindness, and workflow state
 * to determine whether an action should be visible in the current context.
 */
export function isActionVisible(action: PageActionItem, ctx: PageActionContext): boolean {
  if (action.visible === false) return false
  if (typeof action.visible === 'function' && !action.visible(ctx)) return false

  // Law 6: Money blindness check
  if (action.isMoneyAction && ctx.role && !canViewMoney(ctx.role)) {
    return false
  }

  // Permission check
  if (action.permission && ctx.role && !action.permission(ctx.role)) {
    return false
  }

  // Workflow stage check
  if (action.allowedWorkflowStates && action.allowedWorkflowStates.length > 0) {
    const current = action.currentState ?? ctx.workflowState
    if (current && !action.allowedWorkflowStates.includes(current)) {
      return false
    }
  }

  return true
}

/**
 * Checks whether an action is interactive or disabled.
 */
export function isActionEnabled(action: PageActionItem, ctx: PageActionContext): { enabled: boolean; reason?: string | undefined } {
  if (action.loading) {
    return { enabled: false, reason: action.loadingLabel ?? 'Processing…' }
  }

  if (action.enabled === false) {
    return { enabled: false, reason: action.disabledReason }
  }

  if (typeof action.enabled === 'function' && !action.enabled(ctx)) {
    return { enabled: false, reason: action.disabledReason }
  }

  return { enabled: true }
}

/**
 * Partitions visible actions into primary, add, visible secondary (up to 2), and overflow items.
 */
export function resolvePageActions(
  actions: PageActionItem[] = [],
  ctx: PageActionContext = {}
): ResolvedPageActions {
  const visibleActions = actions.filter((action) => isActionVisible(action, ctx))

  let primary: PageActionItem | null = null
  let add: PageActionItem | null = null
  const secondary: PageActionItem[] = []
  const overflow: PageActionItem[] = []

  for (const action of visibleActions) {
    if (action.priority === 'add') {
      if (!add) {
        add = action
      } else {
        secondary.push(action)
      }
      continue
    }

    if (action.priority === 'primary') {
      if (!primary) {
        primary = action
      } else {
        // Only one primary allowed per design invariants; subsequent ones demote to secondary
        secondary.push(action)
      }
      continue
    }

    if (action.priority === 'overflow') {
      overflow.push(action)
      continue
    }

    // Default to secondary
    secondary.push(action)
  }

  // Enforce at most 2 visible secondary actions; route excess to overflow
  const visibleSecondary = secondary.slice(0, 2)
  const excessSecondary = secondary.slice(2)

  return {
    primary,
    add,
    secondary: visibleSecondary,
    overflow: [...excessSecondary, ...overflow],
  }
}
