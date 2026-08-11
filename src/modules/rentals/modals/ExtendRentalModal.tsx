import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { extendRental } from '../../../actions/rentals/extendRental'

interface ExtendRentalModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (extension: { days: number; extraAmountPaisa: Paisa; newReturnDate: string; reason: string }) => void
  bookingId: string
  client: string
  currentReturnDate?: string
}

export function ExtendRentalModal({
  isOpen,
  onClose,
  onSuccess,
  bookingId,
  client,
  currentReturnDate = '2026-08-12',
}: ExtendRentalModalProps) {
  const [days, setDays] = useState<number>(2)
  const [dailyRate, setDailyRate] = useState<number>(15000)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extraAmount = days * dailyRate

  // Calculate new return date estimate
  const baseDate = new Date(currentReturnDate)
  baseDate.setDate(baseDate.getDate() + (days || 0))
  const newReturnDateStr = baseDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (days <= 0) {
      setError('Extension days must be at least 1.')
      return
    }
    if (!reason.trim()) {
      setError('Please specify a reason for the extension.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Execute backend action
      await extendRental({ id: bookingId }, { userId: 'USR-001', role: 'Manager' })

      // Emit domain event
      await DomainEvents.emit(EVENT_TYPES.RENTAL_EXTENDED, {
        bookingId,
        days,
        extraAmountPaisa: rupees(extraAmount),
        newReturnDate: newReturnDateStr,
        reason: reason.trim(),
        timestamp: new Date().toISOString(),
      })

      onSuccess({
        days,
        extraAmountPaisa: rupees(extraAmount),
        newReturnDate: newReturnDateStr,
        reason: reason.trim(),
      })
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to extend rental')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Extend Rental — ${bookingId}`}
      subtitle={`Client: ${client} · Current Return: ${currentReturnDate}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Extending...' : 'Confirm Extension'}
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
              background: 'var(--danger-bg, #fee2e2)',
              color: 'var(--danger-text, #991b1b)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Additional Days <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Daily Extension Rate (Rs)
            </label>
            <input
              type="number"
              min={0}
              value={dailyRate}
              onChange={(e) => setDailyRate(Number(e.target.value))}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Reason for Extension <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Weather delay, shoot extension requested by director..."
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

        <div
          style={{
            padding: 'var(--sp-md)',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 'var(--t-meta)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>New Projected Return Date:</span>
            <span style={{ fontWeight: 700, color: 'var(--nav-active-accent)' }}>{newReturnDateStr}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Additional Rental Charge:</span>
            <span style={{ fontWeight: 700 }}>{formatMoney(rupees(extraAmount))}</span>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Client has authorized the extension and additional charges.
        </label>
      </form>
    </Modal>
  )
}
