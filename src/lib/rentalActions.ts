import type { BookingStatus, JobName } from './workflow'
import type { IconName } from '../components/ui/Icon'

export type RentalPrimaryActionType =
  | 'confirm'
  | 'pack'
  | 'handover'
  | 'return'
  | 'reset'
  | 'close'
  | 'view'
  | 'summary'
  | 'fulfill'

export interface RentalPrimaryActionFacts {
  isCancelled?: boolean | undefined
  isClosed?: boolean | undefined
  isOverdue?: boolean | undefined
  /** A partial return is in flight — the next action continues receiving, not closing. */
  isPartial?: boolean | undefined
  /** Booking contains only non-physical lines (Service, Sub-rental, Manual item) */
  isServiceOnly?: boolean | undefined
  /** Whether operational cleaning & reset (QC) has already completed on all units */
  isResetComplete?: boolean | undefined
  canCloseRental?: boolean | undefined
  canOperate?: boolean | undefined
  cancelledReason?: string | null | undefined
  operationsUnavailable?: string | null | undefined
  bookingNo?: string | undefined
}

export interface RentalPrimaryAction {
  /** The action verb shown on the button, e.g. "Start Packing", "Handover" */
  label: string
  /** Short action verb */
  verb: string
  /** Standard icon for this action */
  icon: IconName
  /** Associated operational job name if any */
  job?: JobName | undefined
  /** Canonical full-screen route path if this action navigates to an operation workspace */
  route?: string | undefined
  /** Machine-readable action type */
  actionType: RentalPrimaryActionType
  /** Whether the action button should be disabled */
  disabled: boolean
  /** Reason why the action is unavailable, if any */
  reason?: string | null | undefined
  /** Whether this action represents an operable primary workflow step */
  isOperable: boolean
}

/**
 * Maps a JobName to its canonical full-screen route suffix
 */
export function jobToRouteSuffix(job: JobName): string {
  switch (job) {
    case 'Pack':
      return 'packing'
    case 'Handover':
      return 'handover'
    case 'Return':
      return 'return'
    case 'Reset':
      return 'reset'
  }
}

/**
 * Maps a JobName to its full canonical URL path
 */
export function jobToRoutePath(bookingNo: string, job: JobName): string {
  return `/rentals/${encodeURIComponent(bookingNo)}/${jobToRouteSuffix(job)}`
}

/**
 * RULING 2026-09-29 (audit §7 unification): this resolver is the single owner
 * of "what is the next action on this booking". Pre-v2.0 records and loose
 * callers may still carry the retired 12-stage vocabulary (workflow.ts §1.4),
 * so the resolver normalizes those aliases to the canonical six itself rather
 * than letting each surface interpret them a second time. Unknown input falls
 * through to the View action, never to an invented transition.
 */
export type NormalizedBookingStage = BookingStatus | 'Cancelled' | 'Unknown'

export function normalizeBookingStatus(stage: BookingStatus | string | undefined): NormalizedBookingStage {
  const normalized = (stage ?? '').trim()
  switch (normalized) {
    case 'Quote':
    case 'Draft':
      return 'Quote'
    case 'Booked':
    case 'Confirmed':
    case 'Preparing':
    case 'Packing':
      return 'Booked'
    case 'Packed':
    case 'Ready':
      return 'Packed'
    case 'On Rent':
    case 'Out':
    case 'Picked Up':
    case 'Partial Return':
      return 'On Rent'
    case 'Returned':
    case 'Inspected':
    case 'Inspection Complete':
    case 'Reset Complete':
    case 'Ready for Rental':
      return 'Returned'
    case 'Closed':
      return 'Closed'
    case 'Cancelled':
    case 'Void':
      return 'Cancelled'
    default:
      return 'Unknown'
  }
}

/**
 * Universal single source of truth for the next primary lifecycle action on any booking.
 *
 * Consumed by:
 * - BookingDetail.tsx (PageHeader primary action)
 * - RentalsList.tsx (Row primary action / Quick action)
 * - OperationsQueues.tsx
 * - Dashboard movement cards
 * - LifecycleProgress.tsx (banner verb — presentation only, action is delegated)
 */
export function getRentalPrimaryAction(
  stage: BookingStatus | string | undefined,
  facts: RentalPrimaryActionFacts = {}
): RentalPrimaryAction {
  const {
    isCancelled = false,
    isClosed = false,
    isOverdue = false,
    isPartial = false,
    isServiceOnly = false,
    isResetComplete = false,
    canCloseRental = true,
    canOperate = true,
    cancelledReason = null,
    operationsUnavailable = null,
    bookingNo,
  } = facts

  const canonical = normalizeBookingStatus(stage)
  /** The retired status name itself means a return is in flight (workflow.ts §1.4). */
  const partial = isPartial || (stage ?? '').trim() === 'Partial Return'

  if (isCancelled || canonical === 'Cancelled') {
    if (canonical === 'Quote') {
      return {
        label: 'Confirm Booking',
        verb: 'Confirm',
        icon: 'plus',
        actionType: 'confirm',
        disabled: true,
        reason: `${bookingNo ?? 'This booking'} is cancelled — a cancelled booking is not confirmed.`,
        isOperable: true,
      }
    }
    return {
      label: 'Cancelled',
      verb: 'Cancelled',
      icon: 'close',
      actionType: 'view',
      disabled: true,
      reason: cancelledReason || 'This booking has been cancelled.',
      isOperable: false,
    }
  }

  if (isClosed || canonical === 'Closed') {
    return {
      label: 'Rental Closed',
      verb: 'Closed',
      icon: 'check',
      actionType: 'view',
      disabled: true,
      reason: 'All lifecycle actions completed.',
      isOperable: false,
    }
  }

  switch (canonical) {
    case 'Quote':
      return {
        label: 'Confirm Booking',
        verb: 'Confirm',
        icon: 'plus',
        actionType: 'confirm',
        disabled: Boolean(cancelledReason),
        reason: cancelledReason,
        isOperable: true,
      }

    case 'Booked': {
      const disabled = !canOperate || Boolean(operationsUnavailable) || Boolean(cancelledReason)
      if (isServiceOnly) {
        return {
          label: 'Complete Service',
          verb: 'Fulfill',
          icon: 'check',
          actionType: 'fulfill',
          disabled,
          reason: cancelledReason || operationsUnavailable,
          isOperable: true,
        }
      }
      const route = bookingNo ? jobToRoutePath(bookingNo, 'Pack') : undefined
      return {
        label: 'Start Packing',
        verb: 'Pack',
        icon: 'box',
        job: 'Pack',
        route,
        actionType: 'pack',
        disabled,
        reason: cancelledReason || operationsUnavailable,
        isOperable: true,
      }
    }

    case 'Packed': {
      const disabled = !canOperate || Boolean(operationsUnavailable) || Boolean(cancelledReason)
      if (isServiceOnly) {
        return {
          label: 'Complete Service',
          verb: 'Fulfill',
          icon: 'check',
          actionType: 'fulfill',
          disabled,
          reason: cancelledReason || operationsUnavailable,
          isOperable: true,
        }
      }
      const route = bookingNo ? jobToRoutePath(bookingNo, 'Handover') : undefined
      return {
        label: 'Handover',
        verb: 'Handover',
        icon: 'truck',
        job: 'Handover',
        route,
        actionType: 'handover',
        disabled,
        reason: cancelledReason || operationsUnavailable,
        isOperable: true,
      }
    }

    case 'On Rent': {
      const disabled = !canOperate || Boolean(operationsUnavailable) || Boolean(cancelledReason)
      if (isServiceOnly) {
        return {
          label: 'Complete Service',
          verb: 'Fulfill',
          icon: 'check',
          actionType: 'fulfill',
          disabled,
          reason: cancelledReason || operationsUnavailable,
          isOperable: true,
        }
      }
      const route = bookingNo ? jobToRoutePath(bookingNo, 'Return') : undefined
      if (partial) {
        return {
          label: 'Continue Return',
          verb: 'Continue Return',
          icon: 'return_arrow',
          job: 'Return',
          route,
          actionType: 'return',
          disabled,
          reason: cancelledReason || operationsUnavailable,
          isOperable: true,
        }
      }
      return {
        label: isOverdue ? 'Receive Overdue Return' : 'Return & Inspect',
        verb: isOverdue ? 'Receive Return' : 'Return',
        icon: 'return_arrow',
        job: 'Return',
        route,
        actionType: 'return',
        disabled,
        reason: cancelledReason || operationsUnavailable,
        isOperable: true,
      }
    }

    case 'Returned': {
      const isResetDone = isResetComplete || (stage ?? '').trim() === 'Reset Complete'
      // If user has permission to close the rental, the primary completion action is Close Rental
      if (canCloseRental) {
        return {
          label: 'Close Rental',
          verb: 'Close',
          icon: 'check',
          actionType: 'close',
          disabled: Boolean(cancelledReason),
          reason: cancelledReason,
          isOperable: true,
        }
      }
      // If operational reset/QC is already done, show awaiting close state to non-closers
      if (isResetDone) {
        return {
          label: 'QC Done · Awaiting Close',
          verb: 'Awaiting Close',
          icon: 'check',
          actionType: 'view',
          disabled: true,
          reason: 'Equipment cleaning & reset is complete. Rental is awaiting financial settlement and close.',
          isOperable: false,
        }
      }
      // Otherwise, the next operational job is Cleaning & Reset
      const disabled = !canOperate || Boolean(operationsUnavailable) || Boolean(cancelledReason)
      const route = bookingNo ? jobToRoutePath(bookingNo, 'Reset') : undefined
      return {
        label: 'Cleaning & Reset',
        verb: 'Reset',
        icon: 'refresh',
        job: 'Reset',
        route,
        actionType: 'reset',
        disabled,
        reason: cancelledReason || operationsUnavailable,
        isOperable: true,
      }
    }

    default:
      return {
        label: 'View Booking',
        verb: 'View',
        icon: 'eye',
        actionType: 'view',
        disabled: false,
        isOperable: false,
      }
  }
}
