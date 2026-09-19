import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Page'
import { useAuth } from '../../lib/auth'
import { useToast } from '../../components/ui/Toast'
import { createDocument } from '../../actions/documents/createDocument'
import { generateClientUuid } from '../../lib/dataAccess'

const DOC_TYPES = [
  'Quotation',
  'Rental Agreement',
  'Packing List',
  'Delivery Note',
  'Return Report',
  'Inspection Report',
  'Damage Report',
  'Tax Invoice',
  'Receipt',
  'Credit Note',
  'Debit Note',
  'Job Card',
  'Service Report',
  'Incident Report',
  'Insurance Claim',
  'Call Sheet',
]

export interface CreateDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  initialBookingNo?: string
  initialClientId?: string
  initialDocType?: string
}

export function CreateDocumentModal({
  isOpen,
  onClose,
  onSuccess,
  initialBookingNo = '',
  initialClientId = '',
  initialDocType = 'Quotation',
}: CreateDocumentModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState(initialDocType)
  const [bookingRef, setBookingRef] = useState(initialBookingNo)
  const [clientRef, setClientRef] = useState(initialClientId)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!title.trim()) {
      setError('Please provide a document title.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      if (!user) {
        throw new Error('You must be signed in to create documents.')
      }

      const res = await createDocument(
        {
          title: title.trim(),
          docType,
          relatedBookingId: bookingRef.trim() || undefined,
          clientId: clientRef.trim() || undefined,
          clientUuid: generateClientUuid(),
        },
        {
          userId: user.id,
          role: user.role,
        },
      )

      showSuccessToast('Document Created', `${res.documentNo} (${docType}) is recorded.`)
      onSuccess?.()
      onClose()
      setTitle('')
      setBookingRef('')
      setClientRef('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--text)',
    fontSize: 'var(--t-meta)',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    fontSize: 'var(--t-meta)',
    fontWeight: 600,
    color: 'var(--text)',
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Document"
      subtitle="Register a new commercial, operational, or financial document."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Document'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--danger)',
              background: 'var(--st-danger-bg)',
              color: 'var(--danger-text)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        <label style={labelStyle}>
          <span>Document Title *</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Equipment Rental Agreement — Himalayan Films"
            required
            style={inputStyle}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <label style={labelStyle}>
            <span>Document Type</span>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              style={inputStyle}
            >
              {DOC_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span>Related Booking No (Optional)</span>
            <input
              type="text"
              value={bookingRef}
              onChange={(e) => setBookingRef(e.target.value)}
              placeholder="e.g. B-715"
              style={inputStyle}
            />
          </label>
        </div>

        <label style={labelStyle}>
          <span>Related Client ID (Optional)</span>
          <input
            type="text"
            value={clientRef}
            onChange={(e) => setClientRef(e.target.value)}
            placeholder="e.g. C-1"
            style={inputStyle}
          />
        </label>
      </form>
    </Modal>
  )
}
