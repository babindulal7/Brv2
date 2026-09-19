import Icon from './Icon'
import type { BookingStatus } from '../../lib/workflow'

export type LifecycleStage =
  | 'Created'
  | 'Prepare'
  | 'Handover'
  | 'Return'
  | 'Inspect'
  | 'Reset'
  | 'Closed'

export const LIFECYCLE_STAGES: readonly LifecycleStage[] = [
  'Created',
  'Prepare',
  'Handover',
  'Return',
  'Inspect',
  'Reset',
  'Closed',
]

export interface UniversalNextAction {
  stageLabel: string
  nextActionLabel: string
  primaryVerb: string
  badgeTone: 'neutral' | 'info' | 'active' | 'success' | 'warning' | 'danger'
  currentStage: LifecycleStage
  stageIndex: number // 0-based
}

/**
 * Derives current lifecycle stage and next required operational action
 * based on booking status per Spec §17 & §18.
 */
export function getUniversalNextAction(
  status: BookingStatus | string | undefined,
  meta?: { isOverdue?: boolean; isPartial?: boolean; uncheckedCount?: number }
): UniversalNextAction {
  const normalized = (status ?? 'Draft').trim()

  if (meta?.isOverdue) {
    return {
      stageLabel: 'OVERDUE',
      nextActionLabel: 'Receive Overdue Return',
      primaryVerb: 'Receive Return',
      badgeTone: 'danger',
      currentStage: 'Return',
      stageIndex: 3,
    }
  }

  if (meta?.isPartial || normalized === 'Partial Return') {
    return {
      stageLabel: 'PARTIAL RETURN',
      nextActionLabel: 'Continue Outstanding Return',
      primaryVerb: 'Continue Return',
      badgeTone: 'warning',
      currentStage: 'Return',
      stageIndex: 3,
    }
  }

  switch (normalized) {
    case 'Draft':
      return {
        stageLabel: 'DRAFT',
        nextActionLabel: 'Confirm Rental',
        primaryVerb: 'Confirm Rental',
        badgeTone: 'neutral',
        currentStage: 'Created',
        stageIndex: 0,
      }
    case 'Booked':
    case 'Confirmed':
      return {
        stageLabel: 'CONFIRMED',
        nextActionLabel: 'Prepare Equipment',
        primaryVerb: 'Start Preparation',
        badgeTone: 'info',
        currentStage: 'Prepare',
        stageIndex: 1,
      }
    case 'Preparing':
    case 'Packing':
      return {
        stageLabel: 'PREPARING',
        nextActionLabel: 'Continue Preparation',
        primaryVerb: 'Continue Preparation',
        badgeTone: 'active',
        currentStage: 'Prepare',
        stageIndex: 1,
      }
    case 'Packed':
    case 'Ready':
      return {
        stageLabel: 'READY',
        nextActionLabel: 'Start Handover',
        primaryVerb: 'Start Handover',
        badgeTone: 'success',
        currentStage: 'Handover',
        stageIndex: 2,
      }
    case 'On Rent':
    case 'Out':
    case 'Picked Up':
      return {
        stageLabel: 'OUT',
        nextActionLabel: 'Receive Return',
        primaryVerb: 'Receive Return',
        badgeTone: 'active',
        currentStage: 'Return',
        stageIndex: 3,
      }
    case 'Returned':
      return {
        stageLabel: 'RETURNED',
        nextActionLabel: 'Inspect Equipment',
        primaryVerb: 'Start Inspection',
        badgeTone: 'warning',
        currentStage: 'Inspect',
        stageIndex: 4,
      }
    case 'Inspected':
    case 'Inspection Complete':
      return {
        stageLabel: 'INSPECTION COMPLETE',
        nextActionLabel: 'Clean & Reset',
        primaryVerb: 'Complete Reset',
        badgeTone: 'active',
        currentStage: 'Reset',
        stageIndex: 5,
      }
    case 'Reset Complete':
    case 'Ready for Rental':
      return {
        stageLabel: 'RESET COMPLETE',
        nextActionLabel: 'Close Rental',
        primaryVerb: 'Close Rental',
        badgeTone: 'success',
        currentStage: 'Closed',
        stageIndex: 6,
      }
    case 'Closed':
      return {
        stageLabel: 'CLOSED',
        nextActionLabel: 'All lifecycle actions completed',
        primaryVerb: 'View Booking',
        badgeTone: 'neutral',
        currentStage: 'Closed',
        stageIndex: 6,
      }
    case 'Cancelled':
    case 'Void':
      return {
        stageLabel: 'CANCELLED',
        nextActionLabel: 'Rental cancelled',
        primaryVerb: 'View Details',
        badgeTone: 'danger',
        currentStage: 'Created',
        stageIndex: 0,
      }
    default:
      return {
        stageLabel: normalized.toUpperCase(),
        nextActionLabel: 'Review Operations',
        primaryVerb: 'Open Booking',
        badgeTone: 'neutral',
        currentStage: 'Created',
        stageIndex: 0,
      }
  }
}

export interface LifecycleProgressProps {
  status: BookingStatus | string | undefined
  meta?: { isOverdue?: boolean; isPartial?: boolean; uncheckedCount?: number }
  onActionClick?: () => void
  showNextActionBanner?: boolean
  className?: string
}

export function LifecycleProgress({
  status,
  meta,
  onActionClick,
  showNextActionBanner = true,
  className = '',
}: LifecycleProgressProps) {
  const nextAction = getUniversalNextAction(status, meta)
  const activeIndex = nextAction.stageIndex

  return (
    <div className={`lifecycle-container ${className}`}>
      <div className="lifecycle-track" role="region" aria-label="Booking Lifecycle Progress">
        {LIFECYCLE_STAGES.map((stage, idx) => {
          const isDone = idx < activeIndex
          const isCurrent = idx === activeIndex

          return (
            <div
              key={stage}
              className={`lifecycle-step ${
                isDone ? 'is-done' : isCurrent ? 'is-current' : 'is-future'
              }`}
            >
              <div className="lifecycle-step__marker" aria-hidden="true">
                {isDone ? (
                  <Icon name="check" size={13} />
                ) : isCurrent ? (
                  <span className="lifecycle-step__dot" />
                ) : (
                  <span className="lifecycle-step__circle" />
                )}
              </div>
              <span className="lifecycle-step__label">{stage}</span>
              {idx < LIFECYCLE_STAGES.length - 1 && (
                <div
                  className={`lifecycle-step__connector ${isDone ? 'is-filled' : ''}`}
                  aria-hidden="true"
                />
              )}
            </div>
          )
        })}
      </div>

      {showNextActionBanner && (
        <div className={`next-action-banner next-action-banner--${nextAction.badgeTone}`}>
          <div className="next-action-banner__left">
            <span className={`status-pill status-pill--${nextAction.badgeTone}`}>
              {nextAction.stageLabel}
            </span>
            <span className="next-action-banner__prompt">
              <span className="next-action-banner__prefix">Next:</span>{' '}
              <strong>{nextAction.nextActionLabel}</strong>
            </span>
          </div>
          {onActionClick && nextAction.stageLabel !== 'CLOSED' && nextAction.stageLabel !== 'CANCELLED' && (
            <button
              type="button"
              className="next-action-banner__action"
              onClick={onActionClick}
              aria-label={`${nextAction.primaryVerb} for this rental`}
            >
              <span>{nextAction.primaryVerb}</span>
              <Icon name="chevron_right" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
