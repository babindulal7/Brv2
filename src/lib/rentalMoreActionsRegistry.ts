/**
 * src/lib/rentalMoreActionsRegistry.ts — Babin Rentals OS
 *
 * Universal Secondary Header Actions Registry & Evaluator.
 *
 * Implements the 5 primary action groups for the Rentals header More (⋯) menu:
 * 1. Quote (Drafting, preview, PDF, delivery, revision versioning)
 * 2. Invoice (Drafting, payment status, PDF, duplicate prevention, financial gate)
 * 3. Duplicate Rental (Independent draft creation with sanitized copy & availability check)
 * 4. Audit History (Append-only immutable audit viewer with category filters & export)
 * 5. Cancel Rental (Pre-handover lifecycle cancellation with packing warnings & reservation release)
 *
 * Enforces:
 * - Lifecycle-stage matrix from specification Section 7.
 * - Strict Law 6 zero-leakage financial gating (omitted for money-blind roles: Warehouse, Technician, Driver, Client).
 * - Law 12 honest disabled explanations over live conditions.
 * - Monotonic immutable history (issued quotes/invoices cannot be overwritten in-place).
 */

import type { SystemRole } from '../types/database'
import type { IconName } from '../components/ui/Icon'
import {
  canWriteBookingDesk,
  canIssueInvoice,
} from './rbac'
import { AUDIT_READ_ROLES } from './queries/audit'
import type { Paisa } from './money'

export type SecondaryActionGroupId =
  | 'quote'
  | 'invoice'
  | 'duplicate'
  | 'audit'
  | 'cancel'

export type SecondaryActionId =
  // Quote group
  | 'quote.create'
  | 'quote.view'
  | 'quote.edit_draft'
  | 'quote.preview'
  | 'quote.download_pdf'
  | 'quote.send'
  | 'quote.duplicate'
  | 'quote.versions'
  // Invoice group
  | 'invoice.create'
  | 'invoice.view'
  | 'invoice.edit_draft'
  | 'invoice.preview'
  | 'invoice.download_pdf'
  | 'invoice.send'
  | 'invoice.payment_status'
  | 'invoice.payment_history'
  | 'invoice.corrections'
  // Duplicate group
  | 'rental.duplicate'
  // Audit group
  | 'audit.full'
  | 'audit.operational'
  | 'audit.financial'
  | 'audit.document'
  | 'audit.export'
  // Cancel group
  | 'rental.cancel'

export interface SecondaryActionItem {
  id: SecondaryActionId
  groupId: SecondaryActionGroupId
  label: string
  icon: IconName
  visible: boolean
  disabled: boolean
  disabledReason?: string | undefined
  destructive?: boolean | undefined
  badge?: string | undefined
}

export interface SecondaryActionGroup {
  id: SecondaryActionGroupId
  label: string
  icon: IconName
  visible: boolean
  disabled: boolean
  disabledReason?: string | undefined
  isSubmenu: boolean
  destructive?: boolean | undefined
  items: SecondaryActionItem[]
}

export interface SelectedRentalBookingFacts {
  id: string
  bookingNo: string
  clientName?: string | null | undefined
  clientId?: string | null | undefined
  stage: string
  isCancelled?: boolean | undefined
  isClosed?: boolean | undefined
  isOverdue?: boolean | undefined
  isPartial?: boolean | undefined
  isPacked?: boolean | undefined
  isPackingInProgress?: boolean | undefined
  hasInvoice?: boolean | undefined
  invoiceNo?: string | null | undefined
  invoiceStatus?: string | null | undefined
  hasQuote?: boolean | undefined
  quoteNo?: string | null | undefined
  quoteIssued?: boolean | undefined
  depositRequired?: Paisa | null | undefined
  totalAmount?: Paisa | number | null | undefined
  paidAmount?: Paisa | number | null | undefined
  outstandingAmount?: Paisa | number | null | undefined
  itemCount?: number | undefined
  pickupDate?: string | undefined
  returnDate?: string | undefined
}

export interface RentalActionEvaluationContext {
  booking?: SelectedRentalBookingFacts | null | undefined
  selectedCount?: number | undefined
  userRole?: SystemRole | undefined
  canViewMoney?: boolean | undefined
  isOnline?: boolean | undefined
}

/**
 * Normalizes loose or legacy status strings to canonical lifecycle stages.
 */
export function normalizeRentalStage(rawStage?: string | undefined): string {
  const s = (rawStage ?? '').trim()
  switch (s) {
    case 'Draft':
    case 'Quote':
      return 'Draft'
    case 'Booked':
    case 'Confirmed':
      return 'Confirmed'
    case 'Packing':
      return 'Packing'
    case 'Packed':
      return 'Packed'
    case 'On Rent':
    case 'Out':
      return 'On Rent'
    case 'Partially Returned':
      return 'Partially Returned'
    case 'Returned':
    case 'Inspection Pending':
      return 'Returned'
    case 'Reset Pending':
    case 'Reset':
      return 'Reset Pending'
    case 'Completed':
    case 'Closed':
      return 'Completed'
    case 'Cancelled':
      return 'Cancelled'
    default:
      return s || 'Draft'
  }
}

/**
 * Evaluates whether a role is money-blind (strictly Law 6 compliant).
 */
export function isRoleMoneyBlind(role?: SystemRole | undefined): boolean {
  if (!role) return true
  return role === 'Warehouse' || role === 'Technician' || role === 'Driver' || role === 'Client'
}

/**
 * Primary action registry evaluation function.
 * Evaluates the 5 action groups against the context-aware stage matrix and role capabilities.
 */
export function evaluateRentalSecondaryActions(
  ctx: RentalActionEvaluationContext,
): SecondaryActionGroup[] {
  const {
    booking,
    selectedCount = booking ? 1 : 0,
    userRole = 'Owner',
    isOnline = true,
  } = ctx

  const canSeeMoney = ctx.canViewMoney ?? !isRoleMoneyBlind(userRole)
  const isSingle = selectedCount === 1 && Boolean(booking)
  const stage = booking ? normalizeRentalStage(booking.stage) : 'None'
  const isCancelled = Boolean(booking?.isCancelled || stage === 'Cancelled')
  const isClosed = Boolean(booking?.isClosed || stage === 'Completed')
  const isPostHandover = ['On Rent', 'Partially Returned', 'Returned', 'Reset Pending', 'Completed'].includes(stage)

  const deskWriter = canWriteBookingDesk(userRole)
  const invoiceIssuer = canIssueInvoice(userRole)
  const canAudit = AUDIT_READ_ROLES.includes(userRole as typeof AUDIT_READ_ROLES[number])
  const isManagerOrAbove = userRole === 'Owner' || userRole === 'Admin' || userRole === 'Manager'

  // ───────────────────────────────────────────────────────────────────────────
  // 1. QUOTE GROUP
  // ───────────────────────────────────────────────────────────────────────────
  const quoteGroupItems: SecondaryActionItem[] = []
  const hasQuote = Boolean(booking?.hasQuote || booking?.quoteNo)
  const isQuoteIssued = Boolean(booking?.quoteIssued)

  // 1.1 Create Quote
  let quoteCreateDisabled = !isSingle
  let quoteCreateReason = !isSingle ? 'Select a rental to create a quote' : undefined
  if (isSingle) {
    if (isCancelled) {
      quoteCreateDisabled = true
      quoteCreateReason = 'Cannot create quote for a cancelled rental'
    } else if (hasQuote) {
      quoteCreateDisabled = true
      quoteCreateReason = 'A quote already exists for this rental. Use View or Revise.'
    }
  }
  quoteGroupItems.push({
    id: 'quote.create',
    groupId: 'quote',
    label: 'Create Quote',
    icon: 'plus',
    visible: true,
    disabled: quoteCreateDisabled,
    disabledReason: quoteCreateReason,
  })

  // 1.2 View Quote
  quoteGroupItems.push({
    id: 'quote.view',
    groupId: 'quote',
    label: 'View Quote',
    icon: 'eye',
    visible: true,
    disabled: !isSingle,
    disabledReason: !isSingle ? 'Select a rental to view its quote' : undefined,
  })

  // 1.3 Edit Draft Quote
  let quoteEditDisabled = !isSingle
  let quoteEditReason = !isSingle ? 'Select a rental to edit quote draft' : undefined
  if (isSingle) {
    if (isCancelled) {
      quoteEditDisabled = true
      quoteEditReason = 'Cancelled rentals cannot be edited'
    } else if (isQuoteIssued) {
      quoteEditDisabled = true
      quoteEditReason = 'Issued quote is locked. Create a new revision to change terms.'
    } else if (!deskWriter) {
      quoteEditDisabled = true
      quoteEditReason = 'You do not have permission to edit quote drafts'
    }
  }
  quoteGroupItems.push({
    id: 'quote.edit_draft',
    groupId: 'quote',
    label: 'Edit Draft Quote',
    icon: 'edit',
    visible: true,
    disabled: quoteEditDisabled,
    disabledReason: quoteEditReason,
  })

  // 1.4 Preview Quote
  quoteGroupItems.push({
    id: 'quote.preview',
    groupId: 'quote',
    label: 'Preview Quote',
    icon: 'eye',
    visible: true,
    disabled: !isSingle,
    disabledReason: !isSingle ? 'Select a rental to preview quote' : undefined,
  })

  // 1.5 Download PDF
  quoteGroupItems.push({
    id: 'quote.download_pdf',
    groupId: 'quote',
    label: 'Download PDF',
    icon: 'download',
    visible: true,
    disabled: !isSingle,
    disabledReason: !isSingle ? 'Select a rental to download quote PDF' : undefined,
  })

  // 1.6 Send Quote
  let quoteSendDisabled = !isSingle
  let quoteSendReason = !isSingle ? 'Select a rental to send quote' : undefined
  if (isSingle && !isOnline) {
    quoteSendDisabled = true
    quoteSendReason = 'Cannot send quotes while offline'
  }
  quoteGroupItems.push({
    id: 'quote.send',
    groupId: 'quote',
    label: 'Send Quote',
    icon: 'external_link',
    visible: true,
    disabled: quoteSendDisabled,
    disabledReason: quoteSendReason,
  })

  // 1.7 Duplicate Quote
  quoteGroupItems.push({
    id: 'quote.duplicate',
    groupId: 'quote',
    label: 'Duplicate Quote',
    icon: 'copy',
    visible: true,
    disabled: !isSingle,
    disabledReason: !isSingle ? 'Select a rental to duplicate quote' : undefined,
  })

  // 1.8 View Quote Versions
  quoteGroupItems.push({
    id: 'quote.versions',
    groupId: 'quote',
    label: 'View Quote Versions',
    icon: 'calendar_stats',
    visible: true,
    disabled: !isSingle,
    disabledReason: !isSingle ? 'Select a rental to view quote history' : undefined,
  })

  const quoteGroup: SecondaryActionGroup = {
    id: 'quote',
    label: 'Quote',
    icon: 'file',
    visible: canSeeMoney || deskWriter,
    disabled: !isSingle && selectedCount === 0,
    disabledReason: !isSingle ? 'Select a rental to access quote options' : undefined,
    isSubmenu: true,
    items: quoteGroupItems.filter((i) => i.visible),
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. INVOICE GROUP (Strictly gated by Law 6: Hidden from money-blind roles)
  // ───────────────────────────────────────────────────────────────────────────
  const invoiceGroupItems: SecondaryActionItem[] = []
  const hasInvoice = Boolean(booking?.hasInvoice || booking?.invoiceNo)

  if (canSeeMoney) {
    // 2.1 Create Invoice
    let invoiceCreateDisabled = !isSingle
    let invoiceCreateReason = !isSingle ? 'Select a rental to create invoice' : undefined
    if (isSingle) {
      if (isCancelled) {
        invoiceCreateDisabled = true
        invoiceCreateReason = 'Cannot create invoice for a cancelled rental. View existing records.'
      } else if (hasInvoice) {
        invoiceCreateDisabled = true
        invoiceCreateReason = `Invoice already exists for ${booking?.bookingNo}. Reuse or view existing invoice.`
      } else if (!invoiceIssuer) {
        invoiceCreateDisabled = true
        invoiceCreateReason = 'You do not have permission to issue invoices'
      } else if (stage === 'Draft') {
        invoiceCreateDisabled = true
        invoiceCreateReason = 'Draft rentals must be confirmed before creating an invoice.'
      }
    }
    invoiceGroupItems.push({
      id: 'invoice.create',
      groupId: 'invoice',
      label: 'Create Invoice',
      icon: 'plus',
      visible: true,
      disabled: invoiceCreateDisabled,
      disabledReason: invoiceCreateReason,
    })

    // 2.2 View Invoice
    let invoiceViewDisabled = !isSingle
    let invoiceViewReason = !isSingle ? 'Select a rental to view invoice' : undefined
    if (isSingle && !hasInvoice) {
      invoiceViewDisabled = true
      invoiceViewReason = 'No invoice has been created for this rental yet'
    }
    invoiceGroupItems.push({
      id: 'invoice.view',
      groupId: 'invoice',
      label: 'View Invoice',
      icon: 'eye',
      visible: true,
      disabled: invoiceViewDisabled,
      disabledReason: invoiceViewReason,
    })

    // 2.3 Edit Draft Invoice
    let invoiceEditDisabled = !isSingle
    let invoiceEditReason = !isSingle ? 'Select a rental to edit draft invoice' : undefined
    if (isSingle) {
      if (!hasInvoice) {
        invoiceEditDisabled = true
        invoiceEditReason = 'No invoice exists to edit'
      } else if (booking?.invoiceStatus && booking.invoiceStatus !== 'Draft') {
        invoiceEditDisabled = true
        invoiceEditReason = 'Issued invoices are immutable. Post adjustments or corrections.'
      } else if (!invoiceIssuer) {
        invoiceEditDisabled = true
        invoiceEditReason = 'You do not have permission to edit invoices'
      }
    }
    invoiceGroupItems.push({
      id: 'invoice.edit_draft',
      groupId: 'invoice',
      label: 'Edit Draft Invoice',
      icon: 'edit',
      visible: true,
      disabled: invoiceEditDisabled,
      disabledReason: invoiceEditReason,
    })

    // 2.4 Preview Invoice
    invoiceGroupItems.push({
      id: 'invoice.preview',
      groupId: 'invoice',
      label: 'Preview Invoice',
      icon: 'eye',
      visible: true,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to preview invoice' : undefined,
    })

    // 2.5 Download PDF
    invoiceGroupItems.push({
      id: 'invoice.download_pdf',
      groupId: 'invoice',
      label: 'Download PDF',
      icon: 'download',
      visible: true,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to download invoice PDF' : undefined,
    })

    // 2.6 Send Invoice
    let invoiceSendDisabled = !isSingle
    let invoiceSendReason = !isSingle ? 'Select a rental to send invoice' : undefined
    if (isSingle) {
      if (!hasInvoice) {
        invoiceSendDisabled = true
        invoiceSendReason = 'No invoice generated yet to send'
      } else if (!isOnline) {
        invoiceSendDisabled = true
        invoiceSendReason = 'Cannot send invoices while offline'
      }
    }
    invoiceGroupItems.push({
      id: 'invoice.send',
      groupId: 'invoice',
      label: 'Send Invoice',
      icon: 'external_link',
      visible: true,
      disabled: invoiceSendDisabled,
      disabledReason: invoiceSendReason,
    })

    // 2.7 View Payment Status
    invoiceGroupItems.push({
      id: 'invoice.payment_status',
      groupId: 'invoice',
      label: 'View Payment Status',
      icon: 'dollar',
      visible: true,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to view payment status' : undefined,
    })

    // 2.8 Open Payment History
    invoiceGroupItems.push({
      id: 'invoice.payment_history',
      groupId: 'invoice',
      label: 'Open Payment History',
      icon: 'calendar_stats',
      visible: true,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to view payments' : undefined,
    })

    // 2.9 View Invoice Corrections
    invoiceGroupItems.push({
      id: 'invoice.corrections',
      groupId: 'invoice',
      label: 'View Invoice Corrections',
      icon: 'receipt',
      visible: true,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to view corrections' : undefined,
    })
  }

  const invoiceGroup: SecondaryActionGroup = {
    id: 'invoice',
    label: 'Invoice',
    icon: 'invoice',
    visible: canSeeMoney,
    disabled: !isSingle && selectedCount === 0,
    disabledReason: !isSingle ? 'Select a rental to access invoice options' : undefined,
    isSubmenu: true,
    items: invoiceGroupItems.filter((i) => i.visible),
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. DUPLICATE RENTAL
  // ───────────────────────────────────────────────────────────────────────────
  const duplicateItem: SecondaryActionItem = {
    id: 'rental.duplicate',
    groupId: 'duplicate',
    label: 'Duplicate as New Draft',
    icon: 'copy',
    visible: true,
    disabled: !isSingle,
    disabledReason: !isSingle ? 'Select a rental to duplicate as a new draft' : undefined,
  }

  const duplicateGroup: SecondaryActionGroup = {
    id: 'duplicate',
    label: 'Duplicate Rental',
    icon: 'copy',
    visible: true,
    disabled: !isSingle,
    disabledReason: !isSingle ? 'Select a rental to duplicate' : undefined,
    isSubmenu: false,
    items: [duplicateItem],
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. AUDIT HISTORY
  // ───────────────────────────────────────────────────────────────────────────
  const auditItems: SecondaryActionItem[] = [
    {
      id: 'audit.full',
      groupId: 'audit',
      label: 'View Full History',
      icon: 'activity',
      visible: true,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to view audit history' : undefined,
    },
    {
      id: 'audit.operational',
      groupId: 'audit',
      label: 'View Operational History',
      icon: 'box',
      visible: true,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to view operational history' : undefined,
    },
    {
      id: 'audit.financial',
      groupId: 'audit',
      label: 'View Financial History',
      icon: 'dollar',
      visible: canSeeMoney && canAudit,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to view financial history' : undefined,
    },
    {
      id: 'audit.document',
      groupId: 'audit',
      label: 'View Document History',
      icon: 'file',
      visible: true,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to view document history' : undefined,
    },
    {
      id: 'audit.export',
      groupId: 'audit',
      label: 'Export History',
      icon: 'download',
      visible: canAudit,
      disabled: !isSingle,
      disabledReason: !isSingle ? 'Select a rental to export history' : undefined,
    },
  ]

  const auditGroup: SecondaryActionGroup = {
    id: 'audit',
    label: 'Audit History',
    icon: 'activity',
    visible: true,
    disabled: !isSingle,
    disabledReason: !isSingle ? 'Select a rental to view history' : undefined,
    isSubmenu: false,
    items: auditItems.filter((i) => i.visible),
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. CANCEL RENTAL (Destructive, strictly pre-handover)
  // ───────────────────────────────────────────────────────────────────────────
  let cancelDisabled = !isSingle
  let cancelReason = !isSingle ? 'Select a rental to cancel' : undefined

  if (isSingle) {
    if (isCancelled) {
      cancelDisabled = true
      cancelReason = `${booking?.bookingNo} is already cancelled.`
    } else if (isClosed) {
      cancelDisabled = true
      cancelReason = `Cannot cancel completed rental ${booking?.bookingNo}.`
    } else if (isPostHandover) {
      cancelDisabled = true
      cancelReason = `Cannot cancel a rental that has reached ${stage} (equipment has left custody). Use return workflow.`
    } else if (stage === 'Packed' && !isManagerOrAbove) {
      cancelDisabled = true
      cancelReason = 'Cancelling a packed rental requires Manager permission.'
    } else if (!deskWriter) {
      cancelDisabled = true
      cancelReason = 'You do not have permission to cancel rental bookings.'
    }
  }

  const cancelItem: SecondaryActionItem = {
    id: 'rental.cancel',
    groupId: 'cancel',
    label: 'Cancel Rental',
    icon: 'close',
    visible: true,
    disabled: cancelDisabled,
    disabledReason: cancelReason,
    destructive: true,
  }

  const cancelGroup: SecondaryActionGroup = {
    id: 'cancel',
    label: 'Cancel Rental',
    icon: 'close',
    visible: true,
    disabled: cancelDisabled,
    disabledReason: cancelReason,
    isSubmenu: false,
    destructive: true,
    items: [cancelItem],
  }

  const allGroups = [
    quoteGroup,
    invoiceGroup,
    duplicateGroup,
    auditGroup,
    cancelGroup,
  ]

  return allGroups.filter((g) => g.visible)
}
