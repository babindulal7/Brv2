import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { stepWriteGate } from '../../lib/operationsShell'
import type { BookingStatus, JobName } from '../../lib/workflow'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'

const OPERATIONS: ReadonlyArray<{ job: JobName; label: string; icon: IconName }> = [
  { job: 'Pack', label: 'Packing', icon: 'box' },
  { job: 'Handover', label: 'Handover', icon: 'truck' },
  { job: 'Return', label: 'Return & Inspection', icon: 'return_arrow' },
  { job: 'Reset', label: 'Cleaning & Reset', icon: 'refresh' },
]

export interface BookingOperationsMenuProps {
  /** Omitted while the booking is still being created. */
  bookingNo?: string
  /** Omitted while the booking is still being created. */
  bookingStatus?: BookingStatus
  /** A booking-level refusal, such as cancellation. */
  unavailable?: string | null
  primary?: boolean
}

/**
 * The one booking-scoped Operations control used by new and existing rentals.
 * It only links to the four canonical operation routes and never mounts a
 * workspace over the current page.
 */
export default function BookingOperationsMenu({
  bookingNo,
  bookingStatus,
  unavailable = null,
  primary = false,
}: BookingOperationsMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const { openOperations } = useOperationsWorkspace()

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node | null)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const triggerSkin = primary
    ? {
        background: 'var(--btn-primary-bg)',
        color: 'var(--btn-primary-fg)',
        border: '1px solid transparent',
      }
    : {
        background: 'var(--btn-secondary-bg)',
        color: 'var(--text)',
        border: '1px solid var(--btn-secondary-border)',
      }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="press"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 44,
          padding: '0 12px',
          borderRadius: 'var(--r-btn)',
          fontFamily: 'inherit',
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          ...triggerSkin,
        }}
      >
        Operations
        <Icon name="chevron_down" size={14} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Operations"
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 220,
            padding: 5,
            background: 'var(--dropdown)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          {OPERATIONS.map(({ job, label, icon }) => {
            const gate = bookingStatus ? stepWriteGate(job, bookingStatus) : null
            const reason =
              unavailable ??
              (!bookingNo
                ? 'Save and confirm this booking before starting operations.'
                : gate && !gate.allowed
                  ? gate.reason
                  : null)
            const disabled = reason !== null

            return (
              <button
                key={job}
                type="button"
                role="menuitem"
                aria-disabled={disabled}
                aria-label={disabled && reason ? `${label}. Unavailable: ${reason}` : label}
                title={disabled && reason ? reason : undefined}
                className="press"
                onClick={() => {
                  if (disabled || !bookingNo) return
                  setOpen(false)
                  openOperations(bookingNo, bookingStatus!, job)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-sm)',
                  width: '100%',
                  minHeight: 44,
                  padding: '0 10px',
                  borderRadius: 'var(--r-btn)',
                  border: 'none',
                  background: 'transparent',
                  color: disabled ? 'var(--muted)' : 'var(--text)',
                  fontFamily: 'inherit',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.62 : 1,
                }}
              >
                <Icon name={icon} size={15} style={{ color: disabled ? 'var(--muted)' : 'var(--text2)' }} />
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
