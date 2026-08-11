import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { refundPayment } from '../../../actions/payments/refundPayment'

interface RefundPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (refund: { invoiceId: string; refundAmountPaisa: Paisa; reason: string }) => void
  invoiceId: string
  client: string
  currentPaidPaisa?: Paisa | undefined
}

export function RefundPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  invoiceId,
  client,
}: RefundPaymentModalProps) {
  const [refundAmount, setRefundAmount] = useState<number>(50000)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<'Bank Reversal' | 'Cash Return' | 'Wallet Credit'>('Bank Reversal')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (refundAmount <= 0) {
      setError('Refund amount must be greater than 0.')
      return
    }
    if (!reason.trim()) {
      setError('Please provide a reason for the refund reversal.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Execute backend action with ctx
      await refundPayment({ id: invoiceId }, { userId: 'USR-001', role: 'Manager' })

      // Emit domain event
      await DomainEvents.emit(EVENT_TYPES.PAYMENT_REFUNDED, {
        invoiceId,
        refundAmountPaisa: rupees(refundAmount),
        reason: reason.trim(),
        method,
        timestamp: new Date().toISOString(),
      })

      onSuccess({
        invoiceId,
        refundAmountPaisa: rupees(refundAmount),
        reason: reason.trim(),
      })
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to process refund')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Process Refund / Reversal — ${invoiceId}`}
      subtitle={`Enforcing payment immutability. Creating negative reversal entry for ${client}.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Processing...' : 'Confirm Reversal'}
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

        <div
          style={{
            padding: 'var(--sp-md)',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            fontSize: 'var(--t-meta)',
            lineHeight: 1.5,
          }}
        >
          <strong>Notice:</strong> Payments in Babin Rentals OS are immutable. Confirming this reversal will register a negative entry in the audit ledger without altering original receipt records.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Refund Amount (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={refundAmount}
              onChange={(e) => setRefundAmount(Number(e.target.value))}
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
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Formatted: {formatMoney(rupees(refundAmount))}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Reversal Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            >
              <option value="Bank Reversal">Bank Reversal</option>
              <option value="Cash Return">Cash Return</option>
              <option value="Wallet Credit">Wallet Credit</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Reason for Reversal / Refund <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            rows={3}
            placeholder="State the reason (e.g. Overpayment correction, Equipment damage refund)..."
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
      </form>
    </Modal>
  )
}
