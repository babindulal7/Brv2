import { type ReactNode, createContext, useContext, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Button, PageHeader } from '../../components/ui/Page'
import { Badge } from '../../components/ui/Badge'
import { ErrorBanner } from '../../components/ui/StateViews'
import { StickyFloorBar } from './StickyFloorBar'
import { useViewport } from '../../lib/device'
import type { BookingStatus, JobName } from '../../lib/workflow'

interface WorkspaceActions {
  canComplete: boolean
  dispatching: boolean
  complete: () => void
  isDirty: boolean
  error?: string | null
  label?: string
}

export interface RentalOperationShellProps {
  bookingNo: string
  job: JobName
  clientName?: string | undefined
  stage?: BookingStatus | undefined
  pickupAtAd?: string | null | undefined
  returnAtAd?: string | null | undefined
  deliveryType?: string | null | undefined
  progress?: {
    current: number
    total: number
    label?: string | undefined
    complete?: boolean | undefined
  } | undefined
  blockers?: Array<{ id: string; label: string }> | string[] | undefined
  heldNotice?: ReactNode
  dispatchError?: string | null | undefined
  primary: {
    label: string
    onClick: () => void
    disabled?: boolean | undefined
    loading?: boolean | undefined
    icon?: IconName | undefined
  }
  onBack?: (() => void) | undefined
  onScan?: (() => void) | undefined
  /**
   * RULING 2026-09-29 (audit §8): one host owns the footer.
   * When embedded in OperationsShell modal, the modal owns it (showFooter=false).
   * When rendered as a page, the shell owns it (showFooter=true, default).
   */
  showFooter?: boolean
  /**
   * Called by workspace when it has completion state ready.
   * The shell uses this to enable/disable its footer primary button.
   */
  onRegisterActions?: (actions: WorkspaceActions) => void
  children: ReactNode
}

const JOB_ORDER: JobName[] = ['Pack', 'Handover', 'Return', 'Reset']

const JOB_TITLES: Record<JobName, string> = {
  Pack: 'Packing Checklist',
  Handover: 'Equipment Handover',
  Return: 'Return & Inspection',
  Reset: 'Cleaning & Reset',
}

interface ShellContextValue {
  registerActions: (actions: WorkspaceActions) => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

function useOperationShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) {
    return { registerActions: () => {} }
  }
  return ctx
}

export function RentalOperationShell({
  bookingNo,
  job,
  clientName,
  stage = 'Booked',
  pickupAtAd,
  returnAtAd,
  deliveryType,
  progress,
  blockers,
  heldNotice,
  dispatchError,
  primary,
  onBack,
  onScan,
  showFooter = true,
  onRegisterActions,
  children,
}: RentalOperationShellProps) {
  const navigate = useNavigate()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const [actions, setActions] = useState<WorkspaceActions | null>(null)

  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      navigate(`/rentals/${encodeURIComponent(bookingNo)}`)
    }
  }

  const handleRegisterActions = useCallback(
    (a: WorkspaceActions) => {
      setActions(a)
      onRegisterActions?.(a)
    },
    [onRegisterActions],
  )

  const currentJobIndex = JOB_ORDER.indexOf(job)

  const ctxValue = useMemo(
    () => ({ registerActions: handleRegisterActions }),
    [handleRegisterActions],
  )

  return (
    <ShellContext.Provider value={ctxValue}>
      <div className="rental-operation-shell" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* ── Context & Navigation Header ── */}
      <PageHeader
        leading={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            aria-label={`Back to booking ${bookingNo}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="chevron_left" size={15} />
            <span>Booking</span>
          </Button>
        }
        title={`${JOB_TITLES[job]} · ${bookingNo}`}
        description={
          clientName
            ? `${clientName}${deliveryType ? ` · ${deliveryType}` : ''}`
            : undefined
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            <Badge status={stage} />
            {!isPhone && (
              <Button
                variant="primary"
                onClick={primary.onClick}
                disabled={primary.disabled || primary.loading}
                icon={primary.icon ?? 'check'}
                style={{ fontWeight: 600 }}
              >
                {primary.loading ? 'Recording…' : primary.label}
              </Button>
            )}
          </div>
        }
      />

      {/* ── Lifecycle Stepper Header ── */}
      <div
        className="operation-workflow-stepper"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: 'var(--card)',
          borderRadius: 'var(--r-card)',
          border: '1px solid var(--border)',
          overflowX: 'auto',
        }}
      >
        {JOB_ORDER.map((j, idx) => {
          const isDone = idx < currentJobIndex
          const isCurrent = idx === currentJobIndex

          return (
            <div
              key={j}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
                color: isCurrent ? 'var(--nav-active-accent)' : isDone ? 'var(--text)' : 'var(--muted)',
                fontWeight: isCurrent ? 700 : isDone ? 600 : 500,
                fontSize: 'var(--t-meta)',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: isDone
                    ? 'var(--st-success-bg)'
                    : isCurrent
                      ? 'var(--btn-primary-bg)'
                      : 'var(--card2)',
                  color: isDone
                    ? 'var(--st-success-fg)'
                    : isCurrent
                      ? 'var(--btn-primary-fg)'
                      : 'var(--muted)',
                  fontSize: 12,
                }}
              >
                {isDone ? <Icon name="check" size={13} /> : idx + 1}
              </span>
              <span>{j}</span>
              {idx < JOB_ORDER.length - 1 && (
                <span style={{ color: 'var(--border)', margin: '0 4px' }}>›</span>
              )}
            </div>
          )
        })}

        {pickupAtAd && returnAtAd && (
          <div style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', color: 'var(--text2)', display: 'flex', gap: 10 }}>
            <span>Pickup: <strong style={{ color: 'var(--text)' }}>{pickupAtAd.slice(0, 10)}</strong></span>
            <span>·</span>
            <span>Return: <strong style={{ color: 'var(--text)' }}>{returnAtAd.slice(0, 10)}</strong></span>
          </div>
        )}
      </div>

      {/* ── Inline Errors and Blockers ── */}
      {dispatchError && (
        <ErrorBanner title="Operation was not recorded" message={dispatchError} />
      )}

      {heldNotice}

      {blockers && blockers.length > 0 && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            background: 'var(--st-danger-bg)',
            color: 'var(--st-danger-fg)',
            borderRadius: 'var(--r-card)',
            border: '1px solid var(--st-danger-border, var(--border))',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 'var(--t-meta)',
          }}
        >
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="alert_triangle" size={16} />
            <span>Operation blocked</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {blockers.map((b, i) => (
              <li key={typeof b === 'string' ? i : b.id}>
                {typeof b === 'string' ? b : b.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Main Workspace Content ── */}
      <div className="operation-workspace-body">{children}</div>

      {/* ── Desktop Footer (owned by shell, not workspace) ── */}
      {showFooter !== false && !isPhone && (
        <div
          className="operation-workspace-footer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: '12px 16px',
            background: 'var(--card)',
            borderRadius: 'var(--r-card)',
            border: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            aria-label={`Back to booking ${bookingNo}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="chevron_left" size={15} />
            <span>Back</span>
          </Button>
          {progress && (
            <span
              style={{
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {progress.current} / {progress.total} items
              {progress.label && <span>· {progress.label}</span>}
              {progress.complete && <span style={{ color: 'var(--st-success-fg)' }}>✓ Complete</span>}
            </span>
          )}
          <Button
            variant="primary"
            onClick={actions?.complete ?? primary.onClick}
            disabled={primary.disabled || primary.loading || !actions?.canComplete || actions?.dispatching}
            icon={primary.icon ?? 'check'}
            style={{ fontWeight: 600, minWidth: 160 }}
          >
            {actions?.dispatching ? 'Recording…' : primary.label}
          </Button>
        </div>
      )}

      {/* ── Mobile Sticky Action Bar ── */}
      {isPhone && progress && (
        <StickyFloorBar
          progress={{
            current: progress.current,
            total: progress.total,
            label: progress.label,
            complete: progress.complete,
          }}
          onScan={onScan ?? (() => {})}
          primaryAction={{
            label: actions?.dispatching ? 'Recording…' : primary.label,
            onClick: actions?.complete ?? primary.onClick,
            disabled: primary.disabled || !actions?.canComplete || actions?.dispatching,
            loading: primary.loading || actions?.dispatching,
            icon: primary.icon,
          }}
        />
      )}
    </div>
  </ShellContext.Provider>
)
}
export default RentalOperationShell
export { useOperationShell, type WorkspaceActions, StickyFloorBar }
