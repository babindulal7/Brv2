/**
 * Smart Hover status → Babin STATUS tokens.
 *
 * Spec §12 names hex fills. Babin DESIGN_DIRECTION_SPEC v4.1 §2/§4 is
 * authoritative here: seven hues + gold outline, solid blocks, colour never
 * alone (Law 11). This file maps every hover state to a `StatusKey` in
 * `lib/status.ts` — no hex lives in hover components.
 */

import type { StatusKey } from '../../lib/status'
import type { PackingStatus } from '../../lib/smartHover'
import type { PaymentState } from '../../lib/smartHover'

export const PACKING_TONE: Record<PackingStatus, StatusKey> = {
  not_started: 'neutral',
  preparing: 'progress',
  partially_packed: 'progress',
  packed: 'progress',
  blocked: 'danger',
  handover_ready: 'in',
  handed_over: 'dim',
}

export const PAYMENT_TONE: Record<PaymentState, StatusKey> = {
  UNPAID: 'danger',
  PARTIALLY_PAID: 'progress',
  PAID: 'in',
  OVERPAID: 'progress',
  REFUND_DUE: 'progress',
  REFUNDED: 'neutral',
  PAYMENT_OVERDUE: 'danger',
}

export type AccountTone = StatusKey

export function accountTone(input: { restricted: boolean; overdue: boolean }): AccountTone {
  if (input.restricted) return 'danger'
  if (input.overdue) return 'danger'
  return 'in'
}

/** Triggers that may open a rich card (§11). Everything else uses InfoTooltip. */
const RICH_TRIGGERS: ReadonlySet<string> = new Set([
  'client-name',
  'company-name',
  'rental-no',
  'booking-no',
  'equipment-name',
  'sku',
  'serial',
  'invoice-no',
  'quote-no',
  'contract-no',
  'document-no',
  'payment-ref',
  'calendar-bar',
])

export function isRichTrigger(kind: string): boolean {
  return RICH_TRIGGERS.has(kind)
}
