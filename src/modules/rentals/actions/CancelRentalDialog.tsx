/**
 * src/modules/rentals/actions/CancelRentalDialog.tsx — Babin Rentals OS
 *
 * Pre-handover rental cancellation confirmation dialog.
 *
 * Enforces:
 * - Pre-handover restriction: Blocked if equipment has left custody (On Rent, Returned, Closed).
 * - Mandatory cancellation reason: Minimum 10 characters required.
 * - Preparation warning: Alerts staff if equipment was already packed/prepared for dispatch.
 * - Explicit staff confirmation: Checkbox required before submission.
 * - Atomic cancellation: Releases equipment holds and records immutable audit event.
 * - Law 17: "customer" banned — client used throughout.
 */

import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { Badge } from '../../../components/ui/Badge'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { newClientUuid } from '../../../lib/supabase'
import { cancelRental } from '../../../actions/rentals/cancelRental'
import { formatBookingNo } from '../../../lib/format'
import type { SelectedRentalBookingFacts } from '../../../lib/rentalMoreActionsRegistry'

export interface CancelRentalDialogProps {
  isOpen: boolean
  onClose: () => void
  booking: SelectedRentalBookingFacts
  onSuccess?: (() => void) | undefined
}

export function CancelRentalDialog({
  isOpen,
  onClose,
  booking,
  onSuccess,
}: CancelRentalDialogProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()

  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPostHandover = [
    'On Rent',
    'Partially Returned',
    'Returned',
    'Reset Pending',
    'Completed',
    'Closed',
  ].includes(booking.stage)

  const hasPackingWork =
    booking.stage === 'Packed' || Boolean(booking.isPacked || booking.isPackingInProgress)

  const handleConfirmCancel = async () => {
    if (!user) {
      setError('You must be signed in to cancel a rental booking.')
      return
    }

    if (reason.trim().length < 10) {
      setError('A cancellation reason of at least 10 characters is mandatory.')
      return
    }

    if (!confirmed) {
      setError('You must check the confirmation box before proceeding.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      const clientUuid = newClientUuid()
      const ctx = { userId: user.id, role: user.role }

      const res = await cancelRental(
        {
          id: booking.id,
          reason: reason.trim(),
          clientUuid,
        },
        ctx,
      )

      showSuccessToast(
        'Rental Cancelled',
        `${res.bookingNo || formatBookingNo(booking.bookingNo)} was cancelled and equipment reservations were released.`,
      )
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title={`Cancel Rental · ${formatBookingNo(booking.bookingNo)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 16px)' }}>
        {/* Post-handover hard gate warning */}
        {isPostHandover ? (
          <div
            role="alert"
            style={{
              padding: 12,
              borderRadius: 'var(--r-card, 8px)',
              background: 'color-mix(in srgb, var(--danger, #dc2626) 8%, var(--card))',
              border: '1px solid var(--danger, #dc2626)',
              color: 'var(--danger-text, #991b1b)',
              display: 'flex',
              gap: 10,
              fontSize: 'var(--t-meta, 13px)',
              lineHeight: 1.4,
            }}
          >
            <Icon name="alert_triangle" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Cancellation Blocked (Post-Handover):</strong>
              <div style={{ marginTop: 4 }}>
                This rental has reached <strong>{booking.stage}</strong> and equipment has already
                transitioned into client custody. You cannot cancel a live or completed rental.
                Please use the standard Return and Settlement workflow to check in equipment and
                resolve deposits or fees.
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Rental Summary Card */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--r-card, 8px)',
                background: 'var(--card2, #f9fafb)',
                border: '1px solid var(--border, #e5e7eb)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--t-ui, 14px)' }}>
                  {formatBookingNo(booking.bookingNo)}
                  {booking.clientName && ` · ${booking.clientName}`}
                </span>
                <Badge label={booking.stage} tone="primary" size="sm" />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 8,
                  fontSize: 'var(--t-caption, 12px)',
                  color: 'var(--text2, #4b5563)',
                }}
              >
                <div>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>Pickup:</span>{' '}
                  <strong>{booking.pickupDate || 'Not scheduled'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>Return:</span>{' '}
                  <strong>{booking.returnDate || 'Not scheduled'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>Total Items:</span>{' '}
                  <strong>{booking.itemCount ?? '0'}</strong>
                </div>
              </div>
            </div>

            {/* Preparation Warning if Packing is done or in progress */}
            {hasPackingWork && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--r-card, 8px)',
                  background: 'color-mix(in srgb, var(--chip-amber-bg, #fef3c7) 50%, var(--card))',
                  border: '1px solid var(--chip-amber-fg, #b45309)',
                  color: 'var(--chip-amber-fg, #b45309)',
                  display: 'flex',
                  gap: 10,
                  fontSize: 'var(--t-meta, 13px)',
                  lineHeight: 1.4,
                }}
              >
                <Icon name="package" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>Preparation Work Detected:</strong>
                  <div style={{ marginTop: 2 }}>
                    Equipment for this rental has already been packed or staged. Cancelling now will
                    release system allocations, but staff must physically return staged gear back
                    to warehouse shelving.
                  </div>
                </div>
              </div>
            )}

            {/* Warning regarding financial transactions */}
            <p
              style={{
                margin: 0,
                fontSize: 'var(--t-meta, 13px)',
                color: 'var(--text2, #4b5563)',
                lineHeight: 1.4,
              }}
            >
              Cancellation permanently marks the rental cancelled and releases all reserved equipment holds.
              Existing issued invoices or payment records remain intact and must be settled or refunded
              through Finance.
            </p>

            {/* Cancellation Reason Textarea */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                htmlFor="cancel-reason"
                style={{
                  fontWeight: 600,
                  fontSize: 'var(--t-meta, 13px)',
                  color: 'var(--text, #111827)',
                }}
              >
                Cancellation Reason <span style={{ color: 'var(--danger, #dc2626)' }}>*</span>
              </label>
              <textarea
                id="cancel-reason"
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="Enter mandatory reason for audit history (minimum 10 characters)..."
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--r-btn, 8px)',
                  border: '1px solid var(--border, #d1d5db)',
                  background: 'var(--card, #fff)',
                  color: 'var(--text, #111827)',
                  fontSize: 'var(--t-meta, 13px)',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <span
                style={{
                  fontSize: 'var(--t-caption, 11px)',
                  color: reason.trim().length >= 10 ? 'var(--success, #16a34a)' : 'var(--muted, #6b7280)',
                }}
              >
                {reason.trim().length} / 10 characters minimum
              </span>
            </div>

            {/* Mandatory Staff Confirmation Checkbox */}
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 'var(--t-meta, 13px)',
                color: 'var(--text, #111827)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={submitting}
                style={{ marginTop: 2 }}
              />
              <span>
                I confirm that I want to cancel this booking and understand that future equipment
                allocations will be immediately released.
              </span>
            </label>

            {/* Error Banner */}
            {error && (
              <div
                role="alert"
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--r-sm, 6px)',
                  background: 'color-mix(in srgb, var(--danger, #dc2626) 8%, var(--card))',
                  border: '1px solid var(--danger, #dc2626)',
                  color: 'var(--danger-text, #991b1b)',
                  fontSize: 'var(--t-meta, 13px)',
                }}
              >
                {error}
              </div>
            )}
          </>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            borderTop: '1px solid var(--border, #e5e7eb)',
            paddingTop: 12,
            marginTop: 4,
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {isPostHandover ? 'Close' : 'Keep Booking'}
          </Button>

          {!isPostHandover && (
            <Button
              variant="danger"
              icon="close"
              disabled={submitting || reason.trim().length < 10 || !confirmed}
              onClick={handleConfirmCancel}
            >
              {submitting ? 'Cancelling…' : 'Cancel Rental'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default CancelRentalDialog
