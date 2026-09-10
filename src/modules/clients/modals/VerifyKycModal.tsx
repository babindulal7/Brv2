import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { Unavailable } from '../../../components/ui/Unavailable'
import type { ClientRecord, KycStatus } from '../../../lib/queries/clients'

export interface VerifyKycModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Never called today — see `SAVE_BLOCKED`. Kept on the contract so the wired
   * version fires it with the status the action actually wrote.
   */
  onSuccess: (newStatus: KycStatus, notes: string) => void
  client: ClientRecord
}

/*
 * TODO(decision) — no KYC action exists. Nothing in `src/actions/clients`
 * writes a KYC status or a document record; `updateClient` is a stub. What
 * stood here emitted `KYC_STATUS_UPDATED`, called `onSuccess`, and closed — a
 * Save that wrote nothing, with a `reviewer: user?.name ?? 'Admin Staff'`
 * fallback that fabricated a reviewer. The event belongs in the action, after
 * its write succeeds.
 */
const SAVE_BLOCKED =
  'KYC decisions are a client-KYC action that is not built yet — nothing typed here can be saved.'

export function VerifyKycModal({
  isOpen,
  onClose,
  client,
}: VerifyKycModalProps) {
  const [status, setStatus] = useState<KycStatus>(client.kycStatus === 'Not Submitted' ? 'Verified' : client.kycStatus)
  const [docType, setDocType] = useState('Citizenship Certificate / National ID')
  const [docNumber, setDocNumber] = useState(client.pan ?? '')
  const [notes, setNotes] = useState('')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verify Client KYC Documents"
      subtitle={`Review identity and legal documentation for ${client.name} (${client.id}).`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Unavailable reason={SAVE_BLOCKED}>
            <Button variant="primary" disabled>
              Save KYC Decision
            </Button>
          </Unavailable>
        </>
      }
    >
      {/* Enter inside a field must not submit either — there is nothing to submit to. */}
      <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            color: 'var(--text2)',
            fontSize: 'var(--t-meta)',
            lineHeight: 1.45,
          }}
        >
          {SAVE_BLOCKED}
        </div>

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
