import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'

interface VoidInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (invoiceId: string) => void
  invoiceId: string
  client: string
}

export function VoidInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
  invoiceId,
  client,
}: VoidInvoiceModalProps) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!reason.trim()) {
      setError('A cancellation reason is required to void an invoice.')
      return
    }
    if (!confirmed) {
      setError('Please check the confirmation box.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Emit Domain Event
      await DomainEvents.emit(EVENT_TYPES.INVOICE_VOIDED, {
        invoiceId,
        client,
        reason: reason.trim(),
        timestamp: new Date().toISOString(),
      })

      onSuccess(invoiceId)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to void invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Void Invoice — ${invoiceId}`}
      subtitle={`Safe-cancelling invoice for ${client}. Terminology rule: 'Void', never 'Delete'.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Voiding...' : 'Void Invoice'}
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
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Reason for Voiding <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            rows={3}
            placeholder="Provide reason for safe-cancelling this invoice (e.g. Duplicate booking, Order cancelled before handover)..."
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

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm that this invoice is to be voided and moved to audit archives.
        </label>
      </form>
    </Modal>
  )
}
