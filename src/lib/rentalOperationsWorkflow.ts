/**
 * src/lib/rentalOperationsWorkflow.ts — Babin Rentals OS
 *
 * Universal Rentals Operations Header Workflow Engine.
 *
 * Implements the authoritative state-to-action resolution rules for the 4-stage
 * equipment movement lifecycle: Packing → Handover → Return & Inspection → Cleaning & Reset.
 *
 * Evaluates:
 * - Selected rental status and lifecycle facts (partial returns, in-progress packing, inspection state, QC/reset state, overdue flags).
 * - Automatic primary button verb & icon per specification table.
 * - 4-stage Operations dropdown status (completed, current, locked + explanation).
 * - Context-aware stage hint (e.g. "Ready to pack", "Ready for handover").
 * - Separation of booking stage and physical asset condition/holds.
 * - Strict money-blindness (Law 6) for non-financial operations staff.
 */

import type { IconName } from '../components/ui/Icon'
import type { JobName } from './workflow'

export type OperationalWorkflowStage =
  | 'confirmed'
  | 'packing'
  | 'packed'
  | 'on_rent'
  | 'partially_returned'
  | 'inspection_pending'
  | 'inspection_completed'
  | 'reset_completed'
  | 'overdue'
  | 'quote'
  | 'closed'
  | 'cancelled'

export interface RentalWorkflowFacts {
  /** Booking number (e.g. 'BK-2026-0715' or 'B-1028') */
  bookingNo?: string | undefined
  /** Client name if known */
  clientName?: string | null | undefined
  /** Whether rental is marked as cancelled */
  isCancelled?: boolean | undefined
  /** Whether rental is closed */
  isClosed?: boolean | undefined
  /** Whether the return schedule has lapsed into overdue */
  isOverdue?: boolean | undefined
  /** Whether packing preparation has begun (e.g. local draft scans or open packing session) */
  isPackingInProgress?: boolean | undefined
  /** Whether items were partially returned */
  isPartial?: boolean | undefined
  /** Whether physical return is received but unit inspection is still pending */
  isInspectionPending?: boolean | undefined
  /** Whether inspection completed and units are ready for cleaning & reset */
  isInspectionCompleted?: boolean | undefined
  /** Whether cleaning & reset (QC) has completed on all eligible units */
  isResetComplete?: boolean | undefined
  /** Whether user has operational capability (Technician / Warehouse / Ops Officer / Admin) */
  canOperate?: boolean | undefined
  /** Whether user has permission to close the rental (Admin / Owner) */
  canCloseRental?: boolean | undefined
  /** Count of total items on booking */
  totalItemCount?: number | undefined
  /** Count of items returned so far */
  returnedItemCount?: number | undefined
  /** Count of items held for damage or maintenance */
  heldItemCount?: number | undefined
  /** Cancellation reason if any */
  cancelledReason?: string | null | undefined
}

export interface HeaderPrimaryAction {
  /** The exact button label required by the specification */
  label:
    | 'Start Packing'
    | 'Confirm Packed'
    | 'Confirm Handover'
    | 'Return & Inspect'
    | 'Continue Return'
    | 'Continue Inspection'
    | 'Cleaning & Reset'
    | 'View Summary'
    | 'Confirm Booking'
    | 'Close Rental'
    | 'View Details'
  /** Short action verb */
  verb: string
  /** Standard icon for this action */
  icon: IconName
  /** Associated operational job name if it launches an Operations workspace */
  job: JobName | null
  /** Action identifier type */
  actionType: 'pack' | 'handover' | 'return' | 'reset' | 'summary' | 'close' | 'confirm' | 'view'
  /** Whether the action button should be disabled */
  disabled: boolean
  /** Reason why the action is disabled if applicable */
  disabledReason?: string | null | undefined
}

export interface OperationStageMenuItem {
  job: JobName
  label: string
  icon: IconName
  /** Stage progression state for the selected rental */
  state: 'completed' | 'current' | 'locked'
  /** Accessible explanation if locked or disabled */
  disabledReason?: string | null | undefined
}

export interface ResolvedRentalHeaderOperations {
  /** Machine-readable operational stage key */
  stageKey: OperationalWorkflowStage
  /** Human-readable status label (e.g. 'Confirmed', 'Packed', 'On Rent') */
  displayStatus: string
  /** Contextual eyebrow or status hint (e.g. 'Ready to pack', 'Ready for handover') */
  stageHint: string
  /** The primary contextual header action */
  primaryAction: HeaderPrimaryAction
  /** The 4 operations dropdown stages with completion & availability flags */
  operationsMenu: OperationStageMenuItem[]
  /** Whether any operation can currently be run on this rental */
  canRunOperations: boolean
}

/**
 * Evaluates the rental's booking status and operational facts to determine
 * the normalized operational workflow stage.
 */
export function resolveOperationalStage(
  rawStatus: string | undefined,
  facts: RentalWorkflowFacts = {},
): OperationalWorkflowStage {
  if (facts.isCancelled) return 'cancelled'
  if (facts.isClosed) return 'closed'

  const normalized = (rawStatus ?? '').trim().toLowerCase()

  if (normalized === 'cancelled' || normalized === 'void') return 'cancelled'
  if (normalized === 'closed') return 'closed'
  if (normalized === 'quote' || normalized === 'draft') return 'quote'

  // Confirmed / Booked stage
  if (
    normalized === 'booked' ||
    normalized === 'confirmed' ||
    normalized === 'preparing' ||
    normalized === 'packing'
  ) {
    if (facts.isPackingInProgress || normalized === 'packing') {
      return 'packing'
    }
    return 'confirmed'
  }

  // Packed stage
  if (normalized === 'packed' || normalized === 'ready' || normalized === 'ready_for_handover') {
    return 'packed'
  }

  // On Rent / Picked up stage
  if (
    normalized === 'on rent' ||
    normalized === 'on_rent' ||
    normalized === 'picked up' ||
    normalized === 'picked_up' ||
    normalized === 'out' ||
    normalized === 'partial return' ||
    normalized === 'partially returned' ||
    normalized === 'partially_returned'
  ) {
    if (facts.isOverdue) {
      return 'overdue'
    }
    if (facts.isPartial || normalized === 'partial return' || normalized === 'partially_returned') {
      return 'partially_returned'
    }
    return 'on_rent'
  }

  // Returned stage
  if (
    normalized === 'returned' ||
    normalized === 'inspected' ||
    normalized === 'inspection pending' ||
    normalized === 'inspection completed' ||
    normalized === 'reset completed' ||
    normalized === 'ready for rental'
  ) {
    if (facts.isResetComplete || normalized === 'reset completed' || normalized === 'ready for rental') {
      return 'reset_completed'
    }
    if (facts.isInspectionPending || normalized === 'inspection pending') {
      return 'inspection_pending'
    }
    if (facts.isInspectionCompleted || normalized === 'inspection completed' || normalized === 'inspected') {
      return 'inspection_completed'
    }
    // Default inside Returned status: inspection completed, ready for reset
    return 'inspection_completed'
  }

  return 'confirmed'
}

/**
 * Resolves the complete operational header configuration for a selected rental.
 *
 * Implements Section 2 of the specification:
 * | Rental status        | Primary header button |
 * | Confirmed            | Start Packing         |
 * | Packing              | Confirm Packed        |
 * | Packed / Ready       | Confirm Handover      |
 * | Picked Up / On Rent  | Return & Inspect      |
 * | Partially Returned   | Continue Return       |
 * | Inspection Pending   | Continue Inspection   |
 * | Inspection Completed | Cleaning & Reset      |
 * | Reset Completed      | View Summary          |
 * | Overdue              | Return & Inspect      |
 */
export function getRentalHeaderOperations(
  rawStatus: string | undefined,
  facts: RentalWorkflowFacts = {},
): ResolvedRentalHeaderOperations {
  const {
    canOperate = true,
    canCloseRental = false,
    cancelledReason = null,
  } = facts

  const stageKey = resolveOperationalStage(rawStatus, facts)

  // Status label & Contextual hint mapping
  let displayStatus = 'Confirmed'
  let stageHint = 'Ready to pack'

  switch (stageKey) {
    case 'quote':
      displayStatus = 'Quote'
      stageHint = 'Draft quote · Not confirmed'
      break
    case 'confirmed':
      displayStatus = 'Confirmed'
      stageHint = 'Ready to pack'
      break
    case 'packing':
      displayStatus = 'Packing'
      stageHint = 'Packing in progress'
      break
    case 'packed':
      displayStatus = 'Packed'
      stageHint = 'Ready for handover'
      break
    case 'on_rent':
      displayStatus = 'On Rent'
      stageHint = 'With client · On rent'
      break
    case 'partially_returned':
      displayStatus = 'Partially Returned'
      stageHint = 'Partially returned · Awaiting items'
      break
    case 'inspection_pending':
      displayStatus = 'Inspection Pending'
      stageHint = 'Return received · Inspection pending'
      break
    case 'inspection_completed':
      displayStatus = 'Inspected'
      stageHint = 'Inspection completed · Ready for reset'
      break
    case 'reset_completed':
      displayStatus = 'Reset Completed'
      stageHint = 'Reset completed · All gear available'
      break
    case 'overdue':
      displayStatus = 'Overdue'
      stageHint = 'Overdue for return'
      break
    case 'closed':
      displayStatus = 'Closed'
      stageHint = 'Rental closed · Completed'
      break
    case 'cancelled':
      displayStatus = 'Cancelled'
      stageHint = cancelledReason || 'Booking cancelled'
      break
  }

  // Primary action button resolution
  let primaryAction: HeaderPrimaryAction

  if (stageKey === 'cancelled') {
    primaryAction = {
      label: 'View Details',
      verb: 'View',
      icon: 'eye',
      job: null,
      actionType: 'view',
      disabled: false,
      disabledReason: cancelledReason || 'This booking has been cancelled.',
    }
  } else if (stageKey === 'closed') {
    primaryAction = {
      label: 'View Summary',
      verb: 'Summary',
      icon: 'check',
      job: null,
      actionType: 'summary',
      disabled: false,
      disabledReason: null,
    }
  } else if (stageKey === 'quote') {
    primaryAction = {
      label: 'Confirm Booking',
      verb: 'Confirm',
      icon: 'plus',
      job: null,
      actionType: 'confirm',
      disabled: !canOperate,
      disabledReason: !canOperate ? 'Insufficient permissions to confirm booking.' : null,
    }
  } else if (stageKey === 'confirmed') {
    primaryAction = {
      label: 'Start Packing',
      verb: 'Pack',
      icon: 'box',
      job: 'Pack',
      actionType: 'pack',
      disabled: !canOperate,
      disabledReason: !canOperate ? 'Insufficient permissions to start packing.' : null,
    }
  } else if (stageKey === 'packing') {
    primaryAction = {
      label: 'Confirm Packed',
      verb: 'Confirm Packed',
      icon: 'box',
      job: 'Pack',
      actionType: 'pack',
      disabled: !canOperate,
      disabledReason: !canOperate ? 'Insufficient permissions to complete packing.' : null,
    }
  } else if (stageKey === 'packed') {
    primaryAction = {
      label: 'Confirm Handover',
      verb: 'Handover',
      icon: 'truck',
      job: 'Handover',
      actionType: 'handover',
      disabled: !canOperate,
      disabledReason: !canOperate ? 'Insufficient permissions to confirm handover.' : null,
    }
  } else if (stageKey === 'on_rent' || stageKey === 'overdue') {
    primaryAction = {
      label: 'Return & Inspect',
      verb: 'Return',
      icon: 'return_arrow',
      job: 'Return',
      actionType: 'return',
      disabled: !canOperate,
      disabledReason: !canOperate ? 'Insufficient permissions to receive returns.' : null,
    }
  } else if (stageKey === 'partially_returned') {
    primaryAction = {
      label: 'Continue Return',
      verb: 'Continue Return',
      icon: 'return_arrow',
      job: 'Return',
      actionType: 'return',
      disabled: !canOperate,
      disabledReason: !canOperate ? 'Insufficient permissions to continue returns.' : null,
    }
  } else if (stageKey === 'inspection_pending') {
    primaryAction = {
      label: 'Continue Inspection',
      verb: 'Inspect',
      icon: 'return_arrow',
      job: 'Return',
      actionType: 'return',
      disabled: !canOperate,
      disabledReason: !canOperate ? 'Insufficient permissions to perform inspection.' : null,
    }
  } else if (stageKey === 'inspection_completed') {
    primaryAction = {
      label: 'Cleaning & Reset',
      verb: 'Reset',
      icon: 'refresh',
      job: 'Reset',
      actionType: 'reset',
      disabled: !canOperate,
      disabledReason: !canOperate ? 'Insufficient permissions to perform cleaning & reset.' : null,
    }
  } else if (stageKey === 'reset_completed') {
    // If user has close permission, they can also close the rental
    if (canCloseRental) {
      primaryAction = {
        label: 'Close Rental',
        verb: 'Close',
        icon: 'check',
        job: null,
        actionType: 'close',
        disabled: false,
        disabledReason: null,
      }
    } else {
      primaryAction = {
        label: 'View Summary',
        verb: 'Summary',
        icon: 'eye',
        job: null,
        actionType: 'summary',
        disabled: false,
        disabledReason: null,
      }
    }
  } else {
    primaryAction = {
      label: 'View Details',
      verb: 'View',
      icon: 'eye',
      job: null,
      actionType: 'view',
      disabled: false,
    }
  }

  // 4 Operations Menu Items Evaluation (Packing, Handover, Return, Reset)
  // Stage order: Pack (0) -> Handover (1) -> Return (2) -> Reset (3)
  const isCancelled = stageKey === 'cancelled'
  const isQuote = stageKey === 'quote'

  let packState: 'completed' | 'current' | 'locked' = 'locked'
  let packReason: string | null = null

  let handoverState: 'completed' | 'current' | 'locked' = 'locked'
  let handoverReason: string | null = null

  let returnState: 'completed' | 'current' | 'locked' = 'locked'
  let returnReason: string | null = null

  let resetState: 'completed' | 'current' | 'locked' = 'locked'
  let resetReason: string | null = null

  if (isCancelled) {
    packReason = 'Booking is cancelled — operations unavailable.'
    handoverReason = 'Booking is cancelled — operations unavailable.'
    returnReason = 'Booking is cancelled — operations unavailable.'
    resetReason = 'Booking is cancelled — operations unavailable.'
  } else if (isQuote) {
    packReason = 'Confirm booking before starting packing.'
    handoverReason = 'Complete packing and booking confirmation first.'
    returnReason = 'Handover required before receiving returns.'
    resetReason = 'Return & inspection required before cleaning & reset.'
  } else {
    // Pack
    if (stageKey === 'confirmed' || stageKey === 'packing') {
      packState = 'current'
    } else {
      // Past confirmed/packing: pack is completed
      packState = 'completed'
    }

    // Handover
    if (stageKey === 'confirmed' || stageKey === 'packing') {
      handoverState = 'locked'
      handoverReason = 'Packing must be completed before handover.'
    } else if (stageKey === 'packed') {
      handoverState = 'current'
    } else {
      // Past packed: handover is completed
      handoverState = 'completed'
    }

    // Return & Inspection
    if (stageKey === 'confirmed' || stageKey === 'packing' || stageKey === 'packed') {
      returnState = 'locked'
      returnReason = 'Equipment must be handed over on rent before receiving returns.'
    } else if (
      stageKey === 'on_rent' ||
      stageKey === 'overdue' ||
      stageKey === 'partially_returned' ||
      stageKey === 'inspection_pending'
    ) {
      returnState = 'current'
    } else {
      // Past return: inspection/return is completed
      returnState = 'completed'
    }

    // Cleaning & Reset
    if (
      stageKey === 'confirmed' ||
      stageKey === 'packing' ||
      stageKey === 'packed' ||
      stageKey === 'on_rent' ||
      stageKey === 'overdue' ||
      stageKey === 'partially_returned' ||
      stageKey === 'inspection_pending'
    ) {
      resetState = 'locked'
      resetReason = 'Equipment return & inspection must be completed before cleaning & reset.'
    } else if (stageKey === 'inspection_completed') {
      resetState = 'current'
    } else {
      resetState = 'completed'
    }
  }

  const operationsMenu: OperationStageMenuItem[] = [
    {
      job: 'Pack',
      label: 'Packing',
      icon: 'box',
      state: packState,
      ...(packReason ? { disabledReason: packReason } : {}),
    },
    {
      job: 'Handover',
      label: 'Handover',
      icon: 'truck',
      state: handoverState,
      ...(handoverReason ? { disabledReason: handoverReason } : {}),
    },
    {
      job: 'Return',
      label: 'Return & Inspection',
      icon: 'return_arrow',
      state: returnState,
      ...(returnReason ? { disabledReason: returnReason } : {}),
    },
    {
      job: 'Reset',
      label: 'Cleaning & Reset',
      icon: 'refresh',
      state: resetState,
      ...(resetReason ? { disabledReason: resetReason } : {}),
    },
  ]

  const canRunOperations = !isCancelled && !isQuote && stageKey !== 'closed'

  return {
    stageKey,
    displayStatus,
    stageHint,
    primaryAction,
    operationsMenu,
    canRunOperations,
  }
}
