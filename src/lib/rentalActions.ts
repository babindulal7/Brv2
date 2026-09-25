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

export interface RentalPrimaryActionFacts {
  isCancelled?: boolean | undefined
  isClosed?: boolean | undefined
  isOverdue?: boolean | undefined
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
 * Universal single source of truth for the next primary lifecycle action on any booking.
 *
 * Consumed by:
 * - BookingDetail.tsx (PageHeader primary action)
 * - RentalsList.tsx (Row primary action / Quick action)
 * - OperationsQueues.tsx
 * - Dashboard movement cards
 * - LifecycleProgress.tsx
 */
export function getRentalPrimaryAction(
  stage: BookingStatus | string | undefined,
  facts: RentalPrimaryActionFacts = {}
): RentalPrimaryAction {
  const {
    isCancelled = false,
    isClosed = false,
    isOverdue = false,
    canCloseRental = true,
    canOperate = true,
    cancelledReason = null,
    operationsUnavailable = null,
    bookingNo,
  } = facts

  if (isCancelled) {
    if (stage === 'Quote') {
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

  if (isClosed || stage === 'Closed') {
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

  switch (stage) {
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
      const route = bookingNo ? jobToRoutePath(bookingNo, 'Return') : undefined
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
