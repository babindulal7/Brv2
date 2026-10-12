import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { voidInvoice } from '../../../actions/finance/voidInvoice'

interface VoidInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (invoiceId: string) => void
  invoiceId: string
  invoiceNo?: string
  client: string
}

export function VoidInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
  invoiceId,
  invoiceNo,
  client,
}: VoidInvoiceModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!user) {
      setError('You must be signed in to void an invoice.')
      return
    }
    const trimmedReason = reason.trim()
    if (trimmedReason.length < 10) {
      setError('A cancellation reason of at least 10 characters is mandatory.')
      return
    }
    if (!confirmed) {
      setError('Please check the confirmation box.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await voidInvoice(
        {
          invoiceId,
          reason: trimmedReason,
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast('Invoice Voided', `${invoiceNo ?? invoiceId} has been voided`)
      onSuccess(invoiceId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Void Invoice — ${invoiceNo ?? invoiceId}`}
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
            placeholder="Provide reason for safe-cancelling this invoice (at least 10 characters)..."
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
