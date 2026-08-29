import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import { useAuth } from '../../../lib/auth'
import type { ClientRecord, KycStatus } from '../../../data/clients'

export interface VerifyKycModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newStatus: KycStatus, notes: string) => void
  client: ClientRecord
}

export function VerifyKycModal({
  isOpen,
  onClose,
  onSuccess,
  client,
}: VerifyKycModalProps) {
  const { user } = useAuth()
  const [status, setStatus] = useState<KycStatus>(client.kycStatus === 'Not Submitted' ? 'Verified' : client.kycStatus)
  const [docType, setDocType] = useState('Citizenship Certificate / National ID')
  const [docNumber, setDocNumber] = useState(client.pan ?? '')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await DomainEvents.emit(EVENT_TYPES.KYC_STATUS_UPDATED, {
        clientId: client.id,
        clientName: client.name,
        oldStatus: client.kycStatus,
        newStatus: status,
        documentType: docType,
        documentNumber: docNumber,
        reviewer: user?.name ?? 'Admin Staff',
        notes: notes.trim(),
        atIso: new Date().toISOString(),
      })

      onSuccess(status, notes.trim())
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update KYC status')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verify Client KYC Documents"
      subtitle={`Review identity and legal documentation for ${client.name} (${client.id}).`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={submitting}>
            {submitting ? 'Updating Status…' : 'Save KYC Decision'}
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
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              KYC Verification Decision <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as KycStatus)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
              }}
            >
              <option value="Verified">Verified — Approved for Rentals</option>
              <option value="Pending Review">Pending Review — Additional Check Needed</option>
              <option value="Rejected">Rejected — Incomplete / Invalid ID</option>
              <option value="Not Submitted">Not Submitted — Awaiting Submission</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Document Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
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
              <option value="Citizenship Certificate / National ID">Citizenship Certificate / National ID</option>
              <option value="Passport">Passport</option>
              <option value="Company Registration Certificate">Company Registration Certificate</option>
              <option value="PAN / VAT Registration">PAN / VAT Registration</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Document ID / Number
          </label>
          <input
            type="text"
            placeholder="e.g. 27-01-78-12345 or PAN 609812453"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
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
            Reviewer Remarks &amp; Verification Notes
          </label>
          <textarea
            rows={3}
            placeholder="Notes regarding address match, physical photo match, verified expiry date, or rejection reason…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
