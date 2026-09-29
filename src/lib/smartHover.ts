/**
 * Smart Hover engine — Law 1 owner for SMART_HOVER_CARDS_V2 packing,
 * readiness, payment and action logic.
 *
 * Components under `src/components/smart-hover/` present and collect only.
 * Every derivation here is pure: data in, decision out, no storage, no clock.
 *
 * Spec refs: §35–§37 (packing state machine), §34/§64 (handover readiness),
 * §43–§46 (ledger-derived payments, TDS, deposits), §51–§52 (action engine),
 * §61 (default tabs), §67–§68 (capabilities, money-blind omission).
 */

import type { SystemRole } from '../types/database'
import { canViewMoney } from './rbac'

/* ── §35 · booking-level packing ─────────────────────────────────────────── */

export type PackingStatus =
  | 'not_started'
  | 'preparing'
  | 'partially_packed'
  | 'packed'
  | 'blocked'
  | 'handover_ready'
  | 'handed_over'

export const PACKING_LABEL: Record<PackingStatus, string> = {
  not_started: 'Not Started',
  preparing: 'Preparing',
  partially_packed: 'Packing',
  packed: 'Packed',
  blocked: 'Blocked',
  handover_ready: 'Ready for Handover',
  handed_over: 'Handed Over',
}

/* ── §36 · line-level packing ────────────────────────────────────────────── */

export type PackingItemStatus =
  | 'required'
  | 'allocated'
  | 'picked'
  | 'tested'
  | 'clean'
  | 'packed'
  | 'blocked'
  | 'missing'
  | 'damaged'
  | 'substitute_required'

export interface PackingLine {
  id: string
  label: string
  serial?: string | null
  status: PackingItemStatus
  qtyRequired: number
  qtyPacked: number
}

const BLOCKING_ITEM: ReadonlySet<PackingItemStatus> = new Set([
  'blocked',
  'missing',
  'damaged',
  'substitute_required',
])

function isFullyPackedLine(line: PackingLine): boolean {
  if (line.status === 'packed') return true
  return line.qtyRequired > 0 && line.qtyPacked >= line.qtyRequired
}

function hasPackingProgress(line: PackingLine): boolean {
  if (line.status === 'packed') return true
  if (line.qtyPacked > 0) return true
  return line.status === 'allocated' || line.status === 'picked' || line.status === 'tested' || line.status === 'clean'
}

/**
 * §37 derivation. `handover_ready` / `handed_over` are NOT derived here —
 * they need payment/deposit/contract gates (§37) and a stage read (§34),
 * so the caller promotes `packed` explicitly via `promoteToHandoverReady`.
 */
export function derivePackingStatus(items: readonly PackingLine[]): PackingStatus {
  if (items.length === 0) return 'not_started'
  if (items.some((l) => BLOCKING_ITEM.has(l.status))) return 'blocked'
  if (items.every(isFullyPackedLine)) return 'packed'
  if (items.some(hasPackingProgress)) return 'partially_packed'
  if (items.some((l) => l.status !== 'required')) return 'preparing'
  return 'not_started'
}

export interface PackingProgress {
  status: PackingStatus
  total: number
  packed: number
  blocked: number
  pending: number
}

export function packingProgress(items: readonly PackingLine[]): PackingProgress {
  const total = items.length
  const packed = items.filter(isFullyPackedLine).length
  const blocked = items.filter((l) => BLOCKING_ITEM.has(l.status)).length
  const pending = Math.max(0, total - packed - blocked)
  return { status: derivePackingStatus(items), total, packed, blocked, pending }
}

/* ── §34/§64 · handover readiness (separate from packing) ────────────────── */

export interface RentalReadiness {
  equipmentReady: boolean
  packingReady: boolean
  paymentReady: boolean
  depositReady: boolean
  contractReady: boolean
  clientAllowed: boolean
}

export function handoverBlockedReason(r: RentalReadiness): string | null {
  if (!r.equipmentReady) return 'Equipment not fully reserved'
  if (!r.packingReady) return 'Packing incomplete'
  if (!r.paymentReady) return 'Payment requirement not met'
  if (!r.depositReady) return 'Security deposit missing'
  if (!r.contractReady) return 'Contract not signed'
  if (!r.clientAllowed) return 'Client restricted — new rental confirmation blocked'
  return null
}

export function isHandoverReady(r: RentalReadiness): boolean {
  return handoverBlockedReason(r) === null
}

/* ── §19–§21, §43–§46 · ledger-derived payments ──────────────────────────── */

export type PaymentTxType =
  | 'rental_payment'
  | 'deposit'
  | 'deposit_refund'
  | 'late_fee'
  | 'damage_charge'
  | 'delivery_charge'
  | 'courier_charge'
  | 'tds'
  | 'refund'
  | 'credit'
  | 'adjustment'

export type PaymentTxStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'voided'

export interface PaymentTransaction {
  id: string
  clientId: string
  rentalId?: string
  invoiceId?: string
  type: PaymentTxType
  status: PaymentTxStatus
  method: 'cash' | 'bank_transfer' | 'card' | 'qr' | 'cheque' | 'credit' | 'other'
  /** Integer paisa. Law: never float. */
  amountPaisa: number
  reference?: string
  paidAt?: string
  createdAt: string
  createdBy: string
}

export type PaymentState = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID' | 'REFUND_DUE' | 'REFUNDED' | 'PAYMENT_OVERDUE'

export interface RentalPaymentSummary {
  /** Grand total, paisa. */
  totalPaisa: number
  /** Σ completed rental payments minus refunds. Deposits excluded (Law 5). */
  paidPaisa: number
  /** total − credits − paid. */
  duePaisa: number
  depositRequiredPaisa: number
  depositHeldPaisa: number
  state: PaymentState
  /** Operational gate for floor staff — no amounts (§22). */
  handoverClear: boolean
}

const RENTAL_MONEY_TYPES: ReadonlySet<PaymentTxType> = new Set(['rental_payment', 'late_fee', 'damage_charge', 'delivery_charge', 'courier_charge'])

function completedAmount(txs: readonly PaymentTransaction[]): number {
  return txs.filter((t) => t.status === 'completed' && RENTAL_MONEY_TYPES.has(t.type)).reduce((s, t) => s + t.amountPaisa, 0)
}

function refundAmount(txs: readonly PaymentTransaction[]): number {
  return txs
    .filter((t) => (t.type === 'refund' || t.type === 'adjustment') && (t.status === 'completed' || t.status === 'partially_refunded'))
    .reduce((s, t) => s + t.amountPaisa, 0)
}

/**
 * §44: summary derived from ledger rows, never hand-maintained totals.
 * §45: a recorded `tds` row settles that part — `due` subtracts it.
 * Law 5: deposits never enter paid/due.
 */
export function summarizeRentalPayments(input: {
  grandTotalPaisa: number
  transactions: readonly PaymentTransaction[]
  depositRequiredPaisa?: number
  applicableCreditsPaisa?: number
  overdue?: boolean
  refundDue?: boolean
  fullyRefunded?: boolean
}): RentalPaymentSummary {
  const credits = input.applicableCreditsPaisa ?? 0
  const tdsSettled = input.transactions
    .filter((t) => t.type === 'tds' && (t.status === 'completed' || t.status === 'partially_refunded'))
    .reduce((s, t) => s + t.amountPaisa, 0)
  const paid = completedAmount(input.transactions) - refundAmount(input.transactions)
  const due = input.grandTotalPaisa - credits - tdsSettled - paid
  const depositHeld = depositHeldFrom(input.transactions)

  let state: PaymentState
  if (input.fullyRefunded) state = 'REFUNDED'
  else if (input.refundDue) state = 'REFUND_DUE'
  else if (input.overdue && due > 0) state = 'PAYMENT_OVERDUE'
  else if (due === 0 && paid === 0 && input.grandTotalPaisa === 0) state = 'PAID'
  else if (due === 0) state = 'PAID'
  else if (due < 0) state = 'OVERPAID'
  else if (paid > 0) state = 'PARTIALLY_PAID'
  else state = 'UNPAID'

  return {
    totalPaisa: input.grandTotalPaisa,
    paidPaisa: paid,
    duePaisa: due,
    depositRequiredPaisa: input.depositRequiredPaisa ?? 0,
    depositHeldPaisa: depositHeld,
    state,
    handoverClear: due <= 0,
  }
}

/** §46: deposits held = received − refunded − applied. */
export function depositHeldFrom(txs: readonly PaymentTransaction[]): number {
  const received = txs.filter((t) => t.type === 'deposit' && t.status === 'completed').reduce((s, t) => s + t.amountPaisa, 0)
  const out = txs
    .filter((t) => t.type === 'deposit_refund' && (t.status === 'completed' || t.status === 'partially_refunded'))
    .reduce((s, t) => s + t.amountPaisa, 0)
  return received - out
}

/** Newest first (§103). Invalid dates sort last, never throw. */
export function sortTxNewestFirst(txs: readonly PaymentTransaction[]): PaymentTransaction[] {
  return [...txs].sort((a, b) => {
    const ta = Date.parse(a.paidAt ?? a.createdAt)
    const tb = Date.parse(b.paidAt ?? b.createdAt)
    const na = Number.isNaN(ta) ? Number.NEGATIVE_INFINITY : ta
    const nb = Number.isNaN(tb) ? Number.NEGATIVE_INFINITY : tb
    return nb - na
  })
}

/* ── §67–§68 · money-blind payload rule ──────────────────────────────────── */

export type ClearanceView =
  | { kind: 'cleared'; depositOk: boolean }
  | { kind: 'blocked'; reasons: string[] }

/**
 * Finance DOM rule (§68): unauthorized roles must not receive amounts.
 * Callers build the money-blind branch FIRST and never spread finance in.
 */
export function canViewFinance(role: SystemRole): boolean {
  return canViewMoney(role)
}

export function clearanceForBlind(input: { paymentReady: boolean; depositReady: boolean }): ClearanceView {
  const reasons: string[] = []
  if (!input.paymentReady) reasons.push('Payment required')
  if (!input.depositReady) reasons.push('Security deposit required')
  if (reasons.length === 0) return { kind: 'cleared', depositOk: true }
  return { kind: 'blocked', reasons }
}

/* ── §51–§52, §61 · contexts, tabs, action engine ────────────────────────── */

export type HoverEntity = 'client' | 'equipment' | 'rental' | 'document' | 'invoice' | 'payment'

export type HoverContext =
  | 'dashboard'
  | 'rentals'
  | 'new-rental'
  | 'calendar'
  | 'inventory'
  | 'clients'
  | 'packing'
  | 'handover'
  | 'return'
  | 'inspection'
  | 'payments'
  | 'documents'
  | 'search'
  | 'reports'

export type HoverActionId =
  | 'new_rental'
  | 'open_entity'
  | 'select_client'
  | 'add_equipment'
  | 'reserve_equipment'
  | 'assign_serial'
  | 'swap_equipment'
  | 'start_packing'
  | 'continue_packing'
  | 'mark_packed'
  | 'mark_all_ready'
  | 'verify_handover'
  | 'handover'
  | 'receive_return'
  | 'inspect'
  | 'close_rental'
  | 'resolve_requirements'
  | 'record_payment'
  | 'request_payment'
  | 'record_deposit'
  | 'refund_deposit'
  | 'open_invoice'
  | 'view_ledger'
  | 'add_note'
  | 'call_client'
  | 'email_client'
  | 'view_timeline'
  | 'view_documents'
  | 'print_packing_slip'
  | 'review_account'
  | 'repair_ticket'

export interface HoverActions {
  primary: HoverActionId | null
  secondary: HoverActionId | null
  overflow: HoverActionId[]
}

export type BookingStage = 'Quote' | 'Booked' | 'Packed' | 'On Rent' | 'Returned' | 'Closed'

export interface ActionInput {
  entityType: HoverEntity
  context: HoverContext
  role: SystemRole
  stage?: BookingStage | undefined
  packingStatus?: PackingStatus | undefined
  restricted?: boolean | undefined
  overdue?: boolean | undefined
}

const FLOOR_PACK: ReadonlySet<SystemRole> = new Set(['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'])
const MONEY_ROLES: ReadonlySet<SystemRole> = new Set(['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'])
export const ACTION_NEEDS_MONEY: ReadonlySet<HoverActionId> = new Set([
  'record_payment',
  'request_payment',
  'record_deposit',
  'refund_deposit',
  'view_ledger',
])

function rentalPrimary(input: ActionInput): HoverActionId | null {
  if (input.restricted === true) return 'resolve_requirements'
  if (input.stage === 'Quote') return 'continue_packing'
  if (input.stage === 'Booked') {
    if (input.packingStatus === 'packed' || input.packingStatus === 'handover_ready') return 'handover'
    if (input.packingStatus === 'partially_packed' || input.packingStatus === 'preparing') return 'continue_packing'
    return 'start_packing'
  }
  if (input.stage === 'Packed') {
    if (input.packingStatus === 'blocked') return 'resolve_requirements'
    return 'handover'
  }
  if (input.stage === 'On Rent') return 'receive_return'
  if (input.stage === 'Returned') return 'inspect'
  return null
}

function filterByCapability(actions: HoverActions, role: SystemRole): HoverActions {
  const allowed = (a: HoverActionId | null): HoverActionId | null => {
    if (a === null) return null
    if (ACTION_NEEDS_MONEY.has(a) && !MONEY_ROLES.has(role)) return null
    if ((a === 'start_packing' || a === 'continue_packing' || a === 'mark_packed' || a === 'mark_all_ready') && !FLOOR_PACK.has(role)) return null
    if ((a === 'handover' || a === 'verify_handover') && !(FLOOR_PACK.has(role))) return null
    return a
  }
  return {
    primary: allowed(actions.primary),
    secondary: allowed(actions.secondary),
    overflow: actions.overflow.filter((a) => allowed(a) !== null),
  }
}

/**
 * §51 contextual engine. Returns max 2 visible + overflow (§52).
 * Capability filtering is structural: disallowed actions are absent, never disabled.
 */
export function getHoverActions(input: ActionInput): HoverActions {
  let raw: HoverActions
  switch (input.entityType) {
    case 'rental': {
      const primary = rentalPrimary(input)
      const secondary: HoverActionId | null = primary === 'handover' ? 'open_entity' : primary === null ? 'open_entity' : 'open_entity'
      const overflow: HoverActionId[] =
        input.context === 'packing'
          ? ['add_note', 'view_documents', 'print_packing_slip', 'view_timeline']
          : input.context === 'payments'
            ? ['view_ledger', 'open_invoice', 'add_note', 'view_documents']
            : ['add_note', 'view_documents', 'call_client', 'view_timeline']
      raw = { primary, secondary, overflow }
      break
    }
    case 'client': {
      if (input.context === 'new-rental') raw = { primary: 'select_client', secondary: 'open_entity', overflow: ['view_timeline', 'add_note'] }
      else if (input.restricted === true) raw = { primary: 'review_account', secondary: 'open_entity', overflow: ['add_note'] }
      else raw = { primary: 'new_rental', secondary: 'open_entity', overflow: ['call_client', 'email_client', 'add_note', 'record_payment', 'view_ledger'] }
      break
    }
    case 'equipment': {
      if (input.context === 'new-rental') raw = { primary: 'add_equipment', secondary: 'open_entity', overflow: ['view_timeline', 'add_note'] }
      else if (input.context === 'packing') raw = { primary: 'mark_packed', secondary: 'open_entity', overflow: ['assign_serial', 'swap_equipment', 'add_note'] }
      else if (input.context === 'handover') raw = { primary: 'verify_handover', secondary: 'open_entity', overflow: ['view_timeline'] }
      else if (input.context === 'return' || input.context === 'inspection') raw = { primary: 'inspect', secondary: 'open_entity', overflow: ['repair_ticket', 'add_note'] }
      else raw = { primary: 'reserve_equipment', secondary: 'open_entity', overflow: ['view_timeline', 'add_note'] }
      break
    }
    case 'invoice':
    case 'document': {
      raw = { primary: 'record_payment', secondary: 'open_entity', overflow: ['open_invoice', 'view_ledger', 'add_note'] }
      break
    }
    case 'payment': {
      raw = { primary: 'open_entity', secondary: 'view_ledger', overflow: ['open_invoice'] }
      break
    }
  }
  const filtered = filterByCapability(raw, input.role)
  // §52: max 2 visible + overflow. Overflow keeps capability-filtered remainder.
  return { primary: filtered.primary, secondary: filtered.secondary, overflow: filtered.overflow.slice(0, 6) }
}

/** §61 default tab per entity × context. */
export function defaultTabForContext(entityType: HoverEntity, context: HoverContext): string {
  if (entityType === 'client') {
    if (context === 'packing' || context === 'handover' || context === 'return') return 'current'
    if (context === 'payments') return 'payments'
    return 'info'
  }
  if (entityType === 'equipment') {
    if (context === 'packing') return 'packing'
    if (context === 'payments') return 'current'
    return 'current'
  }
  if (entityType === 'rental') {
    if (context === 'packing' || context === 'handover' || context === 'return' || context === 'inspection') return 'packing'
    if (context === 'payments') return 'payments'
    if (context === 'clients' || context === 'dashboard') return 'overview'
    return 'overview'
  }
  return 'summary'
}

/* ── timing (§6/§8), dimensions (§4), viewport (§76) ─────────────────────── */

export const HOVER_TIMING = {
  openMs: 250,
  closeMs: 300,
  siblingMs: 80,
  longPressMs: 500,
  animMs: 150,
} as const

export const HOVER_DIMS = {
  width: 360,
  widthLarge: 380,
  minWidth: 320,
  maxWidth: 420,
  maxHeight: 520,
  viewportMargin: 16,
  radius: 14,
} as const
