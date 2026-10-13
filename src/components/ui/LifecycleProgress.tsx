import { Badge } from './Badge'
import { Button } from './Button'
import { STATUS_ICON, type StatusKey } from '../../lib/status'
import Icon from './Icon'
import type { BookingStatus } from '../../lib/workflow'
import {
  getRentalPrimaryAction,
  type RentalPrimaryAction,
} from '../../lib/rentalActions'

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
  badgeTone: StatusKey
  currentStage: LifecycleStage
  stageIndex: number // 0-based
  /**
   * RULING 2026-09-29 (audit §7 unification): the offered action itself.
   * Always the output of `getRentalPrimaryAction` — this component owns the
   * progress-track presentation only, never the lifecycle decision.
   */
  action: RentalPrimaryAction
}

interface BannerPresentation {
  stageLabel: string
  nextActionLabel: string
  badgeTone: UniversalNextAction['badgeTone']
  currentStage: LifecycleStage
  stageIndex: number
}

/**
 * Progress-track presentation per booking status (Spec §17 & §18).
 * Presentation only — the offered action is delegated to the single resolver.
 */
function bannerPresentation(
  status: BookingStatus | string | undefined,
  meta?: { isOverdue?: boolean; isPartial?: boolean; uncheckedCount?: number },
): BannerPresentation {
  const normalized = (status ?? 'Draft').trim()

  if (meta?.isOverdue) {
    return {
      stageLabel: 'OVERDUE',
      nextActionLabel: 'Receive Overdue Return',
      badgeTone: 'danger',
      currentStage: 'Return',
      stageIndex: 3,
    }
  }

  if (meta?.isPartial || normalized === 'Partial Return') {
    return {
      stageLabel: 'PARTIAL RETURN',
      nextActionLabel: 'Continue Outstanding Return',
      badgeTone: 'progress',
      currentStage: 'Return',
      stageIndex: 3,
    }
  }

  switch (normalized) {
    case 'Draft':
      return {
        stageLabel: 'DRAFT',
        nextActionLabel: 'Confirm Rental',
        badgeTone: 'neutral',
        currentStage: 'Created',
        stageIndex: 0,
      }
    case 'Booked':
    case 'Confirmed':
      return {
        stageLabel: 'CONFIRMED',
        nextActionLabel: 'Prepare Equipment',
        badgeTone: 'primary',
        currentStage: 'Prepare',
        stageIndex: 1,
      }
    case 'Preparing':
    case 'Packing':
      return {
        stageLabel: 'PREPARING',
        nextActionLabel: 'Continue Preparation',
        badgeTone: 'progress',
        currentStage: 'Prepare',
        stageIndex: 1,
      }
    case 'Packed':
    case 'Ready':
      return {
        stageLabel: 'READY',
        nextActionLabel: 'Start Handover',
        badgeTone: 'progress',
        currentStage: 'Handover',
        stageIndex: 2,
      }
    case 'On Rent':
    case 'Out':
    case 'Picked Up':
      return {
        stageLabel: 'OUT',
        nextActionLabel: 'Receive Return',
        badgeTone: 'out',
        currentStage: 'Return',
        stageIndex: 3,
      }
    case 'Returned':
      return {
        stageLabel: 'RETURNED',
        nextActionLabel: 'Inspect Equipment',
        badgeTone: 'in',
        currentStage: 'Inspect',
        stageIndex: 4,
      }
    case 'Inspected':
    case 'Inspection Complete':
      return {
        stageLabel: 'INSPECTION COMPLETE',
        nextActionLabel: 'Clean & Reset',
        badgeTone: 'progress',
        currentStage: 'Reset',
        stageIndex: 5,
      }
    case 'Reset Complete':
    case 'Ready for Rental':
      return {
        stageLabel: 'RESET COMPLETE',
        nextActionLabel: 'Close Rental',
        badgeTone: 'progress',
        currentStage: 'Closed',
        stageIndex: 6,
      }
    case 'Closed':
      return {
        stageLabel: 'CLOSED',
        nextActionLabel: 'All lifecycle actions completed',
        badgeTone: 'dim',
        currentStage: 'Closed',
        stageIndex: 6,
      }
    case 'Cancelled':
    case 'Void':
      return {
        stageLabel: 'CANCELLED',
        nextActionLabel: 'Rental cancelled',
        badgeTone: normalized === 'Void' ? 'dim' : 'danger',
        currentStage: 'Created',
        stageIndex: 0,
      }
    default:
      return {
        stageLabel: normalized.toUpperCase(),
        nextActionLabel: 'Review Operations',
        badgeTone: 'neutral',
        currentStage: 'Created',
        stageIndex: 0,
      }
  }
}

/**
 * RULING 2026-09-29 (audit §7 unification): the banner's offered action is
 * delegated to `getRentalPrimaryAction`. The progress track (stage labels,
 * tones, indices) stays presentational here; the verb and the transition
 * target (`action.job` / `action.route`) come from the single resolver, so no
 * surface can offer the same transition under a second name.
 */
export function getUniversalNextAction(
  status: BookingStatus | string | undefined,
  meta?: { isOverdue?: boolean; isPartial?: boolean; uncheckedCount?: number }
): UniversalNextAction {
  const presentation = bannerPresentation(status, meta)
  const normalized = (status ?? 'Draft').trim()
  const action = getRentalPrimaryAction(status, {
    isOverdue: meta?.isOverdue,
    isPartial: meta?.isPartial ?? normalized === 'Partial Return',
    bookingNo: undefined,
  })
  return {
    ...presentation,
    primaryVerb: action.label,
    action,
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
            <Badge
              tone={nextAction.badgeTone}
              label={nextAction.stageLabel}
              icon={<Icon name={STATUS_ICON[nextAction.badgeTone]} size={14} />}
            />
            <span className="next-action-banner__prompt">
              <span className="next-action-banner__prefix">Next:</span>{' '}
              <strong>{nextAction.nextActionLabel}</strong>
            </span>
          </div>
          {onActionClick && nextAction.stageLabel !== 'CLOSED' && nextAction.stageLabel !== 'CANCELLED' && (
            <Button
              type="button"
              variant="primary"
              data-primary-verb
              className="next-action-banner__action"
              disabled={nextAction.action.disabled}
              title={nextAction.action.reason ?? undefined}
              iconRight="chevron_right"
              onClick={onActionClick}
              aria-label={`${nextAction.primaryVerb} for this rental`}
            >
              {nextAction.primaryVerb}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
