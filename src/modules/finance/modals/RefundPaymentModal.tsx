import { useEffect, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { formatMoney, rupees, toRupees } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { generateClientUuid } from '../../../lib/dataAccess'
import { refundPayment } from '../../../actions/payments/refundPayment'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'

interface RefundPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  paymentId: string
  paymentNo: string
  paymentAmountPaisa: Paisa
  client: string
}

/**
 * Records one compensating row against one receipt. The interface provides a
 * helpful per-receipt cap; Postgres is the authority for the cumulative cap,
 * including concurrent submissions and any earlier partial reversals.
 */
export function RefundPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  paymentId,
  paymentNo,
  paymentAmountPaisa,
  client,
}: RefundPaymentModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [refundAmount, setRefundAmount] = useState(0)
  const [reason, setReason] = useState('')
  const [clientUuid, setClientUuid] = useState(() => generateClientUuid())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setRefundAmount(0)
    setReason('')
    setError(null)
    setClientUuid(generateClientUuid())
  }, [isOpen])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      setError('Enter the reversal amount in rupees — it must be greater than 0.')
      return
    }
    if (rupees(refundAmount) > paymentAmountPaisa) {
      setError(`This receipt is ${formatMoney(paymentAmountPaisa)}. A single reversal cannot be larger than the original payment.`)
      return
    }
    if (reason.trim().length < 10) {
      setError('Give a reversal reason of at least 10 characters.')
      return
    }
    if (!user) {
      setError('You are not signed in, so this reversal cannot be attributed to anyone. Sign in and process it again.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      await refundPayment(
        { paymentId, amount: refundAmount, reason: reason.trim(), clientUuid },
        { userId: user.id, role: user.role },
      )
      showSuccessToast('Payment Reversed', `Reversal of ${formatMoney(rupees(refundAmount))} processed`)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to process reversal')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Process payment reversal — ${paymentNo}`}
      subtitle={`Correcting the immutable receipt for ${client}.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Processing...' : 'Confirm reversal'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)', fontSize: 'var(--t-meta)' }}>
            {error}
          </div>
        )}

        <div style={{ padding: 'var(--sp-md)', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)', fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>
          <strong>Receipt amount:</strong> {formatMoney(paymentAmountPaisa)}. Payments are immutable; this creates a separate audited correction. The ledger will reject any cumulative reversal above the remaining amount.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="rpm-reversal-amount" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Reversal amount (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            id="rpm-reversal-amount"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            max={toRupees(paymentAmountPaisa)}
            value={refundAmount === 0 ? '' : refundAmount}
            onChange={(e) => {
              const next = Number(e.target.value)
              setRefundAmount(Number.isFinite(next) ? next : 0)
            }}
            style={{ minHeight: 'var(--tap)', padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 'var(--t-meta)' }}
          />
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            Formatted: {refundAmount > 0 ? formatMoney(rupees(refundAmount)) : '—'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="rpm-reversal-reason" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Reason for reversal <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            id="rpm-reversal-reason"
            rows={3}
            placeholder="State the correction reason..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 'var(--t-meta)', resize: 'vertical' }}
          />
        </div>
      </form>
    </Modal>
  )
}
