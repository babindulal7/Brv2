import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { newClientUuid } from '../../../lib/supabase'
import { cancelRental } from '../../../actions/rentals/cancelRental'
import { formatGateError } from '../../../lib/gates'
import type { BookingStatus } from '../../../lib/workflow'

export interface CancelRentalModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (bookingId: string) => void
  bookingId: string
  bookingNo: string
  stage: BookingStatus | string
}

export function CancelRentalModal({
  isOpen,
  onClose,
  onSuccess,
  bookingId,
  bookingNo,
  stage,
}: CancelRentalModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedReason = reason.trim()
  const isReasonValid = trimmedReason.length >= 10
  const isPacked = stage === 'Packed'

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!user) {
      setError('You must be signed in to cancel a booking.')
      return
    }
    if (!isReasonValid) {
      setError('A cancellation reason of at least 10 characters is required.')
      return
    }
    if (!confirmed) {
      setError('Please confirm that you understand this cancellation is permanent and releases all inventory allocations.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const clientUuid = newClientUuid()
      await cancelRental(
        {
          id: bookingId,
          reason: trimmedReason,
          clientUuid,
        },
        { userId: user.id, role: user.role },
      )

      showSuccessToast(
        'Booking Cancelled',
        `${bookingNo} has been cancelled and its inventory reservations have been released.`,
      )
      onSuccess(bookingId)
      onClose()
    } catch (err: unknown) {
      setError(formatGateError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Cancel Booking — ${bookingNo}`}
      subtitle={`Stage: ${stage}. Cancelling releases all inventory reservations and records an immutable audit trail.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Keep Booking
          </Button>
          <Button
            variant="danger"
            onClick={() => handleSubmit()}
            disabled={isSubmitting || !isReasonValid || !confirmed}
          >
            {isSubmitting ? 'Cancelling…' : 'Cancel Booking'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            fontSize: 'var(--t-meta)',
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>
            Law 3 & Inventory Allocation
          </strong>
          Cancelling will immediately release all reserved equipment and inventory allocations for{' '}
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{bookingNo}</span>. This action is irreversible.
        </div>

        {isPacked && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-btn)',
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          >
            <strong>Manager Authority Required:</strong> Because this booking has already been packed, cancellation
            requires Manager, Admin, or Owner credentials per database gate rule (0115).
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Reason for Cancellation <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <span
              style={{
                fontSize: 'var(--t-caption)',
                color: isReasonValid ? 'var(--muted)' : 'var(--danger)',
              }}
            >
              {trimmedReason.length}/10 characters minimum
            </span>
          </div>
          <textarea
            rows={3}
            placeholder="State the operational reason for cancelling this booking (client cancelled shoot, scheduling conflict, etc.)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              resize: 'vertical',
            }}
          />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--sp-sm)',
            fontSize: 'var(--t-meta)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>I confirm that this booking is to be cancelled and all reserved gear released back into stock.</span>
        </label>
      </form>
    </Modal>
  )
}
