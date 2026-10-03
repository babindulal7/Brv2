import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Page'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Modal } from '../../components/ui/Modal'
import { LoadingSkeleton } from '../../components/ui/StateViews'
import { JOB_ORDER, BOOKING_STATUS, JOBS, type BookingStatus, type JobName } from '../../lib/workflow'
import { stepWriteGate, stepDotState } from '../../lib/operationsShell'
import { fetchFloorBooking, type FloorBooking } from '../../lib/queries/bookings'
import { DomainEvents, EVENT_TYPES } from '../../events/eventBus'

const PackingWorkspace = lazy(() => import('../rentals/PackingWorkspace'))
const HandoverWorkspace = lazy(() => import('../rentals/HandoverWorkspace'))
const ReturnWorkspace = lazy(() => import('../rentals/ReturnWorkspace'))
const ResetWorkspace = lazy(() => import('../rentals/ResetWorkspace'))

const LABEL: Record<JobName, string> = {
  Pack: 'Packing',
  Handover: 'Handover',
  Return: 'Return & Inspection',
  Reset: 'Cleaning & Reset',
}

const PREV_JOB: Partial<Record<JobName, JobName>> = {
  Handover: 'Pack',
  Return: 'Handover',
  Reset: 'Return',
}

const NEXT_JOB: Partial<Record<JobName, JobName>> = {
  Pack: 'Handover',
  Handover: 'Return',
  Return: 'Reset',
}

const STATUS_AFTER: Record<JobName, BookingStatus> = {
  Pack: 'Packed',
  Handover: 'On Rent',
  Return: 'Returned',
  Reset: 'Returned',
}

export interface WorkspaceActions {
  canComplete: boolean
  dispatching: boolean
  complete: () => void
  isDirty: boolean
  label?: string
  error?: string | null
}

export interface OperationsShellProps {
  bookingNo: string
  bookingStatus: BookingStatus
  isOpen: boolean
  onClose: () => void
  initialJob?: JobName
  progress?: Partial<Record<JobName, { done: number; total: number }>>
}

/** Global modal chrome around the existing, backend-powered workspaces. */
export default function OperationsShell({
  bookingNo,
  bookingStatus,
  isOpen,
  onClose,
  initialJob = 'Pack',
  progress,
}: OperationsShellProps) {
  const [job, setJob] = useState<JobName>(initialJob)
  const [liveStatus, setLiveStatus] = useState<BookingStatus>(bookingStatus)
  const [floor, setFloor] = useState<FloorBooking | null>(null)
  const [actions, setActions] = useState<WorkspaceActions | null>(null)
  const [pending, setPending] = useState<
    | { type: 'close' }
    | { type: 'prev'; job: JobName }
    | { type: 'switch'; job: JobName }
    | null
  >(null)

  const refreshFloor = useCallback(async () => {
    try {
      const data = await fetchFloorBooking(bookingNo)
      if (data) {
        setFloor(data)
      }
    } catch {
      // Fallback silently if floor cannot be read (e.g. in headless unit test)
    }
  }, [bookingNo])

  useEffect(() => {
    if (!isOpen) return
    setJob(initialJob)
    setLiveStatus(bookingStatus)
    void refreshFloor()
  }, [bookingNo, bookingStatus, initialJob, isOpen, refreshFloor])

  useEffect(() => {
    if (!isOpen || !actions?.isDirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [actions?.isDirty, isOpen])



  // Universal close action (top-right X, Esc, or Stage 1 Close button)
  const requestClose = useCallback(() => {
    if (actions?.isDirty) {
      setPending({ type: 'close' })
    } else {
      onClose()
    }
  }, [actions?.isDirty, onClose])

  // Navigation back to previous operation
  const requestPrev = useCallback(() => {
    const prev = PREV_JOB[job]
    if (!prev) {
      requestClose()
      return
    }
    if (actions?.isDirty) {
      setPending({ type: 'prev', job: prev })
    } else {
      setActions(null)
      setJob(prev)
    }
  }, [actions?.isDirty, job, requestClose])

  // Switching stages via tab click
  const requestJob = useCallback(
    (nextJob: JobName) => {
      if (nextJob === job) return
      if (actions?.isDirty) {
        setPending({ type: 'switch', job: nextJob })
      } else {
        setActions(null)
        setJob(nextJob)
      }
    },
    [actions?.isDirty, job],
  )

  // Keyboard navigation: 1-4 jumps between unlocked stages
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable) {
        return
      }

      if (['1', '2', '3', '4'].includes(e.key)) {
        const stageIndex = parseInt(e.key, 10) - 1
        const candidate = JOB_ORDER[stageIndex]
        if (candidate) {
          const currentOrder = BOOKING_STATUS[liveStatus]?.order ?? 0
          const candidateOrder = BOOKING_STATUS[JOBS[candidate].runsAt]?.order ?? 0
          const isBlocked = currentOrder < candidateOrder
          if (!isBlocked) {
            e.preventDefault()
            requestJob(candidate)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, liveStatus, requestJob])

  // Progression upon successful confirmation
  const completed = useCallback(async () => {
    const next = NEXT_JOB[job]
    const targetStatus = STATUS_AFTER[job]

    // Emit domain event for the completed stage
    if (job === 'Pack') {
      void DomainEvents.emit(EVENT_TYPES.RENTAL_PACKED, { bookingNo })
      void DomainEvents.emit(EVENT_TYPES.INVENTORY_PACKED, { bookingNo })
    } else if (job === 'Handover') {
      void DomainEvents.emit(EVENT_TYPES.RENTAL_HANDED_OVER, { bookingNo })
      void DomainEvents.emit(EVENT_TYPES.RENTAL_PICKED_UP, { bookingNo })
    } else if (job === 'Return') {
      void DomainEvents.emit(EVENT_TYPES.RENTAL_RETURNED, { bookingNo })
      void DomainEvents.emit(EVENT_TYPES.INVENTORY_RETURNED, { bookingNo })
    } else if (job === 'Reset') {
      void DomainEvents.emit(EVENT_TYPES.RENTAL_RESET_COMPLETED, { bookingNo })
    }

    // Refresh state from database
    await refreshFloor()

    setActions(null)
    setLiveStatus(targetStatus)

    if (next) {
      setJob(next)
    } else {
      onClose()
    }
  }, [job, bookingNo, refreshFloor, onClose])

  const currentGate = stepWriteGate(job, liveStatus)
  const currentJobOrder = BOOKING_STATUS[liveStatus]?.order ?? 0
  const jobRunsAtOrder = BOOKING_STATUS[JOBS[job].runsAt]?.order ?? 0
  const isCurrentJobCompleted = currentJobOrder > jobRunsAtOrder

  // Left and Right footer button labels
  const leftLabel = job === 'Pack' ? 'Close' : `← ${LABEL[PREV_JOB[job]!]}`
  const rightLabel = actions?.dispatching
    ? 'Saving…'
    : isCurrentJobCompleted
      ? 'Completed ✓'
      : job === 'Pack'
        ? 'Confirm Packing & Next'
        : job === 'Handover'
          ? 'Confirm Handover & Next'
          : job === 'Return'
            ? 'Confirm Return & Next'
            : 'Confirm Reset'

  const workspaceProps = useMemo(
    () => ({
      bookingNo,
      embedded: true,
      onCancel: requestClose,
      onConfirmSuccess: completed,
      onRegisterActions: setActions,
    }),
    [bookingNo, completed, requestClose],
  )

  const workspace =
    job === 'Pack' ? (
      <PackingWorkspace key={`${bookingNo}:Pack`} {...workspaceProps} />
    ) : job === 'Handover' ? (
      <HandoverWorkspace key={`${bookingNo}:Handover`} {...workspaceProps} />
    ) : job === 'Return' ? (
      <ReturnWorkspace key={`${bookingNo}:Return`} {...workspaceProps} />
    ) : (
      <ResetWorkspace key={`${bookingNo}:Reset`} {...workspaceProps} />
    )

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        size="full"
        title={`Operations · ${bookingNo}${floor?.clientName ? ` · ${floor.clientName}` : ''}`}
        subtitle={`${LABEL[job]} · Status: ${liveStatus}`}
        footer={
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <Button
                variant="secondary"
                onClick={requestPrev}
                disabled={actions?.dispatching}
                style={{ minHeight: 'var(--tap)' }}
              >
                {leftLabel}
              </Button>
              <Button
                variant="primary"
                onClick={() => actions?.complete()}
                disabled={isCurrentJobCompleted || !actions?.canComplete || actions?.dispatching}
                style={{ minHeight: 'var(--tap)' }}
              >
                {rightLabel}
              </Button>
            </div>
          </div>
        }
      >
        <nav
          aria-label="Operation stage"
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 12,
            marginBottom: 16,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {JOB_ORDER.map((candidate) => {
            const gate = stepWriteGate(candidate, liveStatus)
            const selected = candidate === job
            const currentOrder = BOOKING_STATUS[liveStatus]?.order ?? 0
            const candidateOrder = BOOKING_STATUS[JOBS[candidate].runsAt]?.order ?? 0
            const isCompleted = currentOrder > candidateOrder
            const isBlocked = currentOrder < candidateOrder
            const measured = progress?.[candidate]
            const state = stepDotState(candidate, liveStatus, measured ?? { done: 0, total: 1 })
            const stateLabel =
              gate.allowed && !measured
                ? 'Open'
                : state === 'not-started'
                  ? 'Not started'
                  : state === 'in-progress'
                    ? 'In progress'
                    : state === 'done'
                      ? 'Done'
                      : 'Not open yet'

            const countStr = measured ? ` ${measured.done}/${measured.total}` : ''
            const displayLabel = `${isBlocked ? '🔒 ' : ''}${LABEL[candidate]} · ${stateLabel}${countStr}`

            return (
              <Button
                key={candidate}
                size="sm"
                variant={selected ? 'primary' : 'secondary'}
                aria-current={selected ? 'step' : undefined}
                disabled={isBlocked}
                title={!gate.allowed ? gate.reason ?? undefined : undefined}
                onClick={() => requestJob(candidate)}
                icon={isCompleted ? 'check' : isBlocked ? 'lock' : undefined}
                style={{
                  minHeight: 'var(--tap)',
                  opacity: isBlocked ? 0.6 : 1,
                }}
              >
                {displayLabel}
              </Button>
            )
          })}
        </nav>

        {floor && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-md)',
              flexWrap: 'wrap',
              padding: '8px 14px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--surface-2, rgba(255, 255, 255, 0.04))',
              border: '1px solid var(--border)',
              marginBottom: 14,
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
            }}
          >
            <div>
              <span style={{ color: 'var(--muted)', marginRight: 4 }}>Booking:</span>
              <strong style={{ color: 'var(--text)' }}>{bookingNo}</strong>
            </div>
            {floor.clientName && (
              <div>
                <span style={{ color: 'var(--muted)', marginRight: 4 }}>Client:</span>
                <strong style={{ color: 'var(--text)' }}>{floor.clientName}</strong>
              </div>
            )}
            {floor.project && (
              <div>
                <span style={{ color: 'var(--muted)', marginRight: 4 }}>Project:</span>
                <strong style={{ color: 'var(--text)' }}>{floor.project}</strong>
              </div>
            )}
            {floor.pickupAtAd && (
              <div>
                <span style={{ color: 'var(--muted)', marginRight: 4 }}>Pickup:</span>
                <span style={{ color: 'var(--text)' }}>{floor.pickupAtAd.slice(0, 10)}</span>
              </div>
            )}
            {floor.returnAtAd && (
              <div>
                <span style={{ color: 'var(--muted)', marginRight: 4 }}>Return:</span>
                <span style={{ color: 'var(--text)' }}>{floor.returnAtAd.slice(0, 10)}</span>
              </div>
            )}
            {floor.deliveryType && (
              <div>
                <span style={{ color: 'var(--muted)', marginRight: 4 }}>Delivery:</span>
                <span style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{floor.deliveryType}</span>
              </div>
            )}
            {floor.lines && floor.lines.length > 0 && (
              <div style={{ marginLeft: 'auto' }}>
                <span style={{ color: 'var(--muted)', marginRight: 4 }}>Lines:</span>
                <strong style={{ color: 'var(--text)' }}>{floor.lines.length}</strong>
              </div>
            )}
          </div>
        )}

        {!currentGate.allowed && (
          <p
            role="status"
            style={{
              margin: '0 0 12px',
              color: 'var(--muted)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {currentGate.reason}
          </p>
        )}

        <Suspense fallback={<LoadingSkeleton type="card" label={`Loading ${LABEL[job]}…`} />}>
          {workspace}
        </Suspense>
      </Modal>

      {/* Discard confirmation dialog */}
      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          const choice = pending
          setPending(null)
          setActions(null)
          if (choice?.type === 'switch') setJob(choice.job)
          else if (choice?.type === 'prev') setJob(choice.job)
          else if (choice?.type === 'close') onClose()
        }}
        title={
          pending?.type === 'close'
            ? 'Discard unsaved operations work?'
            : 'You have unsaved changes.'
        }
        description={
          pending?.type === 'close'
            ? 'You have changes that have not been saved.'
            : pending?.type === 'prev'
              ? `Discard changes and go back to ${LABEL[pending.job]}?`
              : 'Discard them and switch operations?'
        }
        cancelLabel={pending?.type === 'close' ? 'Keep Editing' : 'Stay Here'}
        confirmLabel={
          pending?.type === 'close'
            ? 'Discard Changes'
            : pending?.type === 'prev'
              ? 'Discard & Go Back'
              : 'Discard & Switch'
        }
        variant="danger"
      />
    </>
  )
}

