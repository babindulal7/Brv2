/**
 * Smart Intel Cards v1 — controlled context set (spec §33).
 *
 * Context changes emphasis and the primary action, never the component
 * architecture. Entity renderers receive it; the shell only carries it.
 */

export type IntelContext =
  | 'dashboard'
  | 'inventory'
  | 'client-list'
  | 'rental-list'
  | 'new-rental'
  | 'rental-detail'
  | 'calendar'
  | 'packing'
  | 'handover'
  | 'return'
  | 'inspection'
  | 'payments'
  | 'documents'
  | 'search'

export type IntelEntityType = 'equipment' | 'client' | 'rental' | 'document' | 'invoice' | 'payment'

export type IntelMode = 'glance' | 'detail'

/**
 * Per-context primary-action overrides for equipment (spec §5 / §29).
 * The card component selects the label; navigation targets stay with the
 * caller, which knows the real booking/asset ids.
 */
export const EQUIPMENT_CONTEXT_ACTION: Record<IntelContext, string> = {
  dashboard: 'Open rental',
  inventory: 'Reserve',
  'client-list': 'Open',
  'rental-list': 'Open rental',
  'new-rental': 'Add',
  'rental-detail': 'Swap / Specify serial',
  calendar: 'Open rental',
  packing: 'Mark packed',
  handover: 'Continue workflow',
  return: 'Inspect',
  inspection: 'Inspect',
  payments: 'Open',
  documents: 'Open',
  search: 'Open',
}

export const CLIENT_CONTEXT_ACTION: Record<IntelContext, string> = {
  dashboard: 'Open active rental',
  inventory: 'Open client',
  'client-list': 'Open client',
  'rental-list': 'Open client',
  'new-rental': 'Select client',
  'rental-detail': 'Open client',
  calendar: 'Open client',
  packing: 'Open client',
  handover: 'Resolve requirement',
  return: 'Open client',
  inspection: 'Open client',
  payments: 'Record / Request payment',
  documents: 'Open client',
  search: 'Open',
}

export const RENTAL_CONTEXT_ACTION: Record<IntelContext, string> = {
  dashboard: 'Continue workflow',
  inventory: 'Open rental',
  'client-list': 'Open rental',
  'rental-list': 'Open',
  'new-rental': 'Open draft',
  'rental-detail': 'Open',
  calendar: 'Open rental',
  packing: 'Continue packing',
  handover: 'Continue workflow',
  return: 'Receive return',
  inspection: 'Open',
  payments: 'Open',
  documents: 'Open',
  search: 'Open',
}
