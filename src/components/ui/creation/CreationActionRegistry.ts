/**
 * src/components/ui/creation/CreationActionRegistry.ts — Babin Rentals OS
 *
 * Universal Creation Action Registry for GlobalAddMenu.
 *
 * Encapsulates the 7 canonical creation groups, 22 typed creation actions,
 * module-to-action contextual mappings, capability requirements, money-blindness
 * filters (Law 6), opening modes, and context resolvers.
 */

import type { IconName } from '../Icon'
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
} from '../../../lib/rbac'

export type CreationGroupKey =
  | 'rentals'
  | 'clients'
  | 'inventory'
  | 'operations'
  | 'crew'
  | 'billing'
  | 'admin'

export interface CreationGroupDefinition {
  key: CreationGroupKey
  label: string
  description: string
  icon: IconName
  displayOrder: number
}

export const CANONICAL_CREATION_GROUPS: Record<CreationGroupKey, CreationGroupDefinition> = {
  rentals: {
    key: 'rentals',
    label: 'Rentals & Bookings',
    description: 'Create rentals, quotations, and booking reservations',
    icon: 'calendar',
    displayOrder: 1,
  },
  clients: {
    key: 'clients',
    label: 'Clients & Contacts',
    description: 'Register clients, corporate entities, and contacts',
    icon: 'users',
    displayOrder: 2,
  },
  inventory: {
    key: 'inventory',
    label: 'Inventory & Bundles',
    description: 'Add physical gear, kits, bundles, and item categories',
    icon: 'box',
    displayOrder: 3,
  },
  operations: {
    key: 'operations',
    label: 'Operations & Maintenance',
    description: 'Open tasks, turnaround queues, tickets, and inspections',
    icon: 'checklist',
    displayOrder: 4,
  },
  crew: {
    key: 'crew',
    label: 'Crew & Logistics',
    description: 'Assign operators, drivers, technicians, and crew staff',
    icon: 'crew',
    displayOrder: 5,
  },
  billing: {
    key: 'billing',
    label: 'Documents & Billing',
    description: 'Record payments, adjustments, agreements, and documents',
    icon: 'receipt',
    displayOrder: 6,
  },
  admin: {
    key: 'admin',
    label: 'Expenses & Administration',
    description: 'Log expenses, configure roles, categories, and users',
    icon: 'card',
    displayOrder: 7,
  },
}

export type CreationOpeningMode = 'wizard' | 'dialog' | 'drawer' | 'modal' | 'route'

export interface CreationContextFacts {
  rentalId?: string | undefined
  bookingNo?: string | undefined
  clientId?: string | undefined
  clientName?: string | undefined
  equipmentId?: string | undefined
  equipmentName?: string | undefined
  dateRange?: { start: string; end: string } | undefined
  role?: SystemRole | null | undefined
}

export interface CreationActionDefinition {
  id: string
  label: string
  description?: string | undefined
  icon: IconName
  module: string
  group: CreationGroupKey
  displayPriority: number
  /** Whether the action involves pricing, payments, or revenue figures (Law 6) */
  isMoneyAction?: boolean | undefined
  openingMode: CreationOpeningMode
  route?: string | undefined
  /** Check if the action is permitted for the given role */
  isPermitted: (role: SystemRole) => boolean
  /** Default context resolver extracting prefill values */
  resolveContext?: ((facts: CreationContextFacts) => Record<string, unknown>) | undefined
}

export const CREATION_ACTIONS: CreationActionDefinition[] = [
  // ── 1. Rentals & Bookings ──
  {
    id: 'rental.new',
    label: 'New Rental',
    description: 'Open the New Rental workspace',
    icon: 'plus',
    module: 'rentals',
    group: 'rentals',
    displayPriority: 1,
    // RULING 2026-10-13: header creation opens the real workspace; the quick wizard confirmed nothing.
    openingMode: 'route',
    route: '/rentals?action=new',
    isPermitted: (role) => canWriteBookingDesk(role),
    resolveContext: (facts) => ({
      clientId: facts.clientId,
      clientName: facts.clientName,
      dateRange: facts.dateRange,
    }),
  },
  {
    id: 'quote.new',
    label: 'New Quote',
    description: 'Create commercial rental quotation in draft',
    icon: 'invoice',
    module: 'rentals',
    group: 'rentals',
    displayPriority: 2,
    isMoneyAction: true,
    openingMode: 'wizard',
    isPermitted: (role) => canWriteBookingDesk(role) && canViewMoney(role),
    resolveContext: (facts) => ({
      bookingNo: facts.bookingNo,
      rentalId: facts.rentalId,
      clientId: facts.clientId,
      clientName: facts.clientName,
    }),
  },
  {
    id: 'booking.new',
    label: 'New Booking',
    description: 'Reserve dates and schedule rental on calendar',
    icon: 'calendar_event',
    module: 'calendar',
    group: 'rentals',
    displayPriority: 3,
    openingMode: 'wizard',
    route: '/calendar?action=new',
    isPermitted: (role) => canWriteBookingDesk(role),
    resolveContext: (facts) => ({
      dateRange: facts.dateRange,
    }),
  },

  // ── 2. Clients & Contacts ──
  {
    id: 'client.new',
    label: 'New Client',
    description: 'Quick-create client contact and business entity',
    icon: 'users',
    module: 'clients',
    group: 'clients',
    displayPriority: 1,
    openingMode: 'dialog',
    isPermitted: (role) => canCreateClient(role),
    resolveContext: (facts) => ({
      prefillName: facts.clientName,
    }),
  },

  // ── 3. Inventory & Bundles ──
  {
    id: 'equipment.new',
    label: 'New Equipment',
    description: 'Add physical gear model and tracked asset units',
    icon: 'box',
    module: 'inventory',
    group: 'inventory',
    displayPriority: 1,
    openingMode: 'route',
    route: '/inventory/new',
    // RULING 2026-10-13: createEquipment needs inventory.create (canCreateBundle), not floor write.
    isPermitted: (role) => canCreateBundle(role),
    resolveContext: (facts) => ({
      equipmentId: facts.equipmentId,
    }),
  },
  {
    id: 'bundle.new',
    label: 'New Bundle',
    description: 'Assemble equipment package with fixed components',
    icon: 'package',
    module: 'bundles',
    group: 'inventory',
    displayPriority: 2,
    openingMode: 'route',
    route: '/inventory/bundles/new',
    isPermitted: (role) => canCreateBundle(role),
  },
  {
    id: 'category.new',
    label: 'New Category',
    description: 'Define an inventory category for grouping gear',
    icon: 'box',
    module: 'inventory',
    group: 'inventory',
    displayPriority: 3,
    openingMode: 'dialog',
    isPermitted: (role) => canCreateBundle(role),
  },

  // ── 4. Operations & Maintenance ──
  {
    id: 'task.new',
    label: 'New Task',
    description: 'Create operations turnaround or packing task',
    icon: 'checklist',
    module: 'operations',
    group: 'operations',
    displayPriority: 1,
    openingMode: 'dialog',
    isPermitted: (role) => canPerformOperations(role),
    resolveContext: (facts) => ({
      bookingNo: facts.bookingNo,
    }),
  },
  {
    id: 'maintenance.new',
    label: 'New Maintenance Ticket',
    description: 'Open repair or servicing ticket for equipment',
    icon: 'tool',
    module: 'maintenance',
    group: 'operations',
    displayPriority: 2,
    openingMode: 'dialog',
    isPermitted: (role) => canPerformOperations(role),
    resolveContext: (facts) => ({
      equipmentId: facts.equipmentId,
      equipmentName: facts.equipmentName,
    }),
  },
  {
    id: 'inspection.new',
    label: 'New Inspection',
    description: 'Log post-rental triage condition inspection',
    icon: 'check',
    module: 'maintenance',
    group: 'operations',
    displayPriority: 3,
    openingMode: 'dialog',
    isPermitted: (role) => canPerformOperations(role),
    resolveContext: (facts) => ({
      equipmentId: facts.equipmentId,
    }),
  },

  // ── 5. Crew & Logistics ──
  {
    id: 'crew.assign',
    label: 'New Crew Assignment',
    description: 'Assign technician, driver, or operator to booking',
    icon: 'crew',
    module: 'crew',
    group: 'crew',
    displayPriority: 1,
    openingMode: 'dialog',
    isPermitted: (role) => canPerformOperations(role),
    resolveContext: (facts) => ({
      bookingNo: facts.bookingNo,
    }),
  },
  {
    id: 'crew_member.new',
    label: 'New Crew Member',
    description: 'Register a staff technician or transport driver',
    icon: 'user',
    module: 'crew',
    group: 'crew',
    displayPriority: 2,
    openingMode: 'dialog',
    isPermitted: (role) => canManageSettings(role),
  },

  // ── 6. Documents & Billing ──
  {
    id: 'payment.record',
    label: 'Record Payment',
    description: 'Log advance deposit, invoice payment, or bank transfer',
    icon: 'receipt',
    module: 'payments',
    group: 'billing',
    displayPriority: 1,
    isMoneyAction: true,
    openingMode: 'dialog',
    isPermitted: (role) => canRecordPayment(role) && canViewMoney(role),
    resolveContext: (facts) => ({
      bookingNo: facts.bookingNo,
      rentalId: facts.rentalId,
      clientId: facts.clientId,
    }),
  },
  {
    id: 'adjustment.record',
    label: 'Record Adjustment',
    description: 'Post ledger adjustment or authorized discount balance',
    icon: 'receipt',
    module: 'payments',
    group: 'billing',
    displayPriority: 2,
    isMoneyAction: true,
    openingMode: 'dialog',
    isPermitted: (role) => canReversePayment(role) && canViewMoney(role),
    resolveContext: (facts) => ({
      bookingNo: facts.bookingNo,
      rentalId: facts.rentalId,
    }),
  },
  {
    id: 'document.new',
    label: 'New Document',
    description: 'Generate booking agreement, invoice, or voucher',
    icon: 'file',
    module: 'documents',
    group: 'billing',
    displayPriority: 3,
    openingMode: 'dialog',
    isPermitted: (role) => canWriteBookingDesk(role),
    resolveContext: (facts) => ({
      bookingNo: facts.bookingNo,
    }),
  },
  {
    id: 'template.new',
    label: 'New Template',
    description: 'Create standardized contract or email template',
    icon: 'file',
    module: 'documents',
    group: 'billing',
    displayPriority: 4,
    openingMode: 'dialog',
    isPermitted: (role) => canManageSettings(role),
  },
  {
    id: 'agreement.new',
    label: 'New Agreement',
    description: 'Draft custom client terms and conditions document',
    icon: 'file',
    module: 'documents',
    group: 'billing',
    displayPriority: 5,
    openingMode: 'dialog',
    isPermitted: (role) => canWriteBookingDesk(role),
    resolveContext: (facts) => ({
      bookingNo: facts.bookingNo,
      clientId: facts.clientId,
    }),
  },

  // ── 7. Expenses & Administration ──
  {
    id: 'expense.new',
    label: 'New Expense',
    description: 'Record operating cost, maintenance fee, or purchase',
    icon: 'card',
    module: 'expenses',
    group: 'admin',
    displayPriority: 1,
    isMoneyAction: true,
    openingMode: 'drawer',
    isPermitted: (role) => isStaff(role) && canViewMoney(role),
  },
  {
    id: 'expense_category.new',
    label: 'New Expense Category',
    description: 'Create category for bookkeeping expense categorization',
    icon: 'card',
    module: 'expenses',
    group: 'admin',
    displayPriority: 2,
    isMoneyAction: true,
    openingMode: 'dialog',
    isPermitted: (role) => canManageSettings(role) && canViewMoney(role),
  },
  {
    id: 'user.new',
    label: 'New User',
    description: 'Create staff account with role and credentials',
    icon: 'user',
    module: 'settings',
    group: 'admin',
    displayPriority: 3,
    openingMode: 'dialog',
    isPermitted: (role) => canManageSettings(role),
  },
  {
    id: 'role.new',
    label: 'New Role',
    description: 'Configure access permissions and seat capabilities',
    icon: 'settings',
    module: 'settings',
    group: 'admin',
    displayPriority: 4,
    openingMode: 'dialog',
    isPermitted: (role) => canManageSettings(role),
  },
]

/**
 * Module contextual actions mapping as specified in Section 2.
 * The default action is displayed first, followed by other contextual choices.
 */
export interface ModuleContextualConfig {
  defaultActionId: string
  otherActionIds: string[]
}

export const MODULE_CONTEXTUAL_MAPPING: Record<string, ModuleContextualConfig> = {
  today: {
    defaultActionId: 'rental.new',
    otherActionIds: ['quote.new', 'client.new'],
  },
  rentals: {
    defaultActionId: 'rental.new',
    otherActionIds: ['quote.new', 'client.new'],
  },
  calendar: {
    defaultActionId: 'booking.new',
    otherActionIds: ['rental.new', 'client.new'],
  },
  inventory: {
    defaultActionId: 'equipment.new',
    otherActionIds: ['bundle.new', 'category.new'],
  },
  bundles: {
    defaultActionId: 'bundle.new',
    otherActionIds: ['equipment.new'],
  },
  clients: {
    defaultActionId: 'client.new',
    otherActionIds: ['rental.new', 'quote.new'],
  },
  operations: {
    defaultActionId: 'task.new',
    otherActionIds: ['maintenance.new'],
  },
  payments: {
    defaultActionId: 'payment.record',
    otherActionIds: ['adjustment.record'],
  },
  finance: {
    defaultActionId: 'payment.record',
    otherActionIds: ['expense.new', 'adjustment.record'],
  },
  crew: {
    defaultActionId: 'crew.assign',
    otherActionIds: ['crew_member.new'],
  },
  documents: {
    defaultActionId: 'document.new',
    otherActionIds: ['template.new', 'agreement.new'],
  },
  expenses: {
    defaultActionId: 'expense.new',
    otherActionIds: ['expense_category.new'],
  },
  maintenance: {
    defaultActionId: 'maintenance.new',
    otherActionIds: ['inspection.new'],
  },
  settings: {
    defaultActionId: 'user.new',
    otherActionIds: ['role.new', 'category.new'],
  },
}

/**
 * Normalizes a route path or module name to a key in MODULE_CONTEXTUAL_MAPPING.
 */
export function normalizeModuleKey(moduleOrPath?: string | null): string {
  if (!moduleOrPath) return 'today'
  const clean = moduleOrPath.toLowerCase().replace(/^\//, '').split('/')[0] || 'today'
  return clean in MODULE_CONTEXTUAL_MAPPING ? clean : 'today'
}

/**
 * Returns contextual actions for the given module, filtered by the role's permissions.
 */
export function getContextualActions(
  moduleOrPath: string,
  role?: SystemRole | null
): {
  defaultAction: CreationActionDefinition | null
  otherActions: CreationActionDefinition[]
} {
  const modKey = normalizeModuleKey(moduleOrPath)
  const config = MODULE_CONTEXTUAL_MAPPING[modKey] ?? MODULE_CONTEXTUAL_MAPPING['today']!

  const actionMap = new Map<string, CreationActionDefinition>()
  for (const act of CREATION_ACTIONS) {
    actionMap.set(act.id, act)
  }

  const defaultDef = actionMap.get(config.defaultActionId) ?? null
  const isDefaultAllowed = defaultDef && (!role || defaultDef.isPermitted(role))

  const allowedOthers: CreationActionDefinition[] = []
  for (const id of config.otherActionIds) {
    const def = actionMap.get(id)
    if (def && (!role || def.isPermitted(role))) {
      allowedOthers.push(def)
    }
  }

  // If default is not allowed, promote first other allowed action
  if (!isDefaultAllowed && allowedOthers.length > 0) {
    const [promoted, ...rest] = allowedOthers
    return {
      defaultAction: promoted ?? null,
      otherActions: rest,
    }
  }

  return {
    defaultAction: isDefaultAllowed ? defaultDef : null,
    otherActions: allowedOthers,
  }
}

/**
 * Returns all actions permitted for the role, grouped by canonical creation group.
 * Groups with 0 permitted actions are omitted.
 */
export function getGroupedGlobalActions(
  role?: SystemRole | null
): Array<{
  group: CreationGroupDefinition
  actions: CreationActionDefinition[]
}> {
  const result: Array<{
    group: CreationGroupDefinition
    actions: CreationActionDefinition[]
  }> = []

  const groupKeys: CreationGroupKey[] = [
    'rentals',
    'clients',
    'inventory',
    'operations',
    'crew',
    'billing',
    'admin',
  ]

  for (const gKey of groupKeys) {
    const groupDef = CANONICAL_CREATION_GROUPS[gKey]
    const permittedInGroup = CREATION_ACTIONS.filter(
      (a) => a.group === gKey && (!role || a.isPermitted(role))
    ).sort((a, b) => a.displayPriority - b.displayPriority)

    if (permittedInGroup.length > 0) {
      result.push({
        group: groupDef,
        actions: permittedInGroup,
      })
    }
  }

  return result
}

/**
 * Returns all permitted creation actions for a role as a flat list.
 */
export function getAllPermittedActions(role?: SystemRole | null): CreationActionDefinition[] {
  return CREATION_ACTIONS.filter((a) => !role || a.isPermitted(role))
}

/**
 * Creation actions whose flow writes through a real action and reloads as saved.
 *
 * RULING 2026-10-13: the quick wizard, drawer and generic dialog behind the other
 * ids show a success toast without writing anything ("Booking BK-2026-#### created"
 * with a random number, "Expense Recorded", "Record Created"). A creation menu offers
 * only these ids until a flow is wired to its action; the mapping above stays the
 * per-module intent. Revert = return `true` from isCreationActionReady.
 */
export const READY_CREATION_ACTION_IDS: ReadonlySet<string> = new Set([
  'rental.new',
  'client.new',
  'equipment.new',
  'bundle.new',
])

export function isCreationActionReady(action: CreationActionDefinition): boolean {
  return READY_CREATION_ACTION_IDS.has(action.id)
}

/**
 * The page's creation choices as a menu offers them: permitted, ready, with the
 * module's default first and the first ready alternative promoted when the
 * default cannot be offered.
 */
export function getReadyContextualActions(
  moduleOrPath: string,
  role?: SystemRole | null
): { defaultAction: CreationActionDefinition | null; otherActions: CreationActionDefinition[] } {
  const { defaultAction, otherActions } = getContextualActions(moduleOrPath, role)
  const ready = [defaultAction, ...otherActions].filter(
    (a): a is CreationActionDefinition => a !== null && isCreationActionReady(a)
  )
  const [first, ...rest] = ready
  return { defaultAction: first ?? null, otherActions: rest }
}

/** Every permitted creation action a menu may offer anywhere in the app. */
export function getReadyPermittedActions(role?: SystemRole | null): CreationActionDefinition[] {
  return getAllPermittedActions(role).filter(isCreationActionReady)
}
