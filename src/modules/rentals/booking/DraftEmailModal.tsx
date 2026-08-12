import { useEffect, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'

/**
 * redesign v1 §5 — comms are draft-only, never auto-sent (21 Jul lock, cited
 * in the spec). Choosing "Email to client" opens this prefilled, editable
 * draft; nothing sends until Send is pressed here. No email backend exists
 * in this build (no comms action module, confirmed by search), so `onSend`
 * is the page's own stub — the same shape `saveDraft`/`confirmBooking`
 * already use for an unimplemented dispatch, not a new fabricated one.
 */

export interface DraftEmailModalProps {
  isOpen: boolean
  onClose: () => void
  /** What is being sent — "Quote", "Rental Agreement", etc. */
  documentName: string
  toEmail: string
  subject: string
  body: string
  onSend: (draft: { to: string; subject: string; body: string }) => void
}

export function DraftEmailModal({ isOpen, onClose, documentName, toEmail, subject, body, onSend }: DraftEmailModalProps) {
  const [to, setTo] = useState(toEmail)
  const [subjectText, setSubjectText] = useState(subject)
  const [bodyText, setBodyText] = useState(body)

  // Re-seed the draft each time it opens for a (possibly different) document —
  // editing one draft must not bleed into the next document's prefill.
  useEffect(() => {
    if (isOpen) {
      setTo(toEmail)
      setSubjectText(subject)
      setBodyText(body)
    }
  }, [isOpen, toEmail, subject, body])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={`Email ${documentName}`}
      subtitle="Review before sending — nothing is sent until you press Send."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="arrow_right"
            disabled={to.trim().length === 0 || subjectText.trim().length === 0}
            onClick={() => {
              onSend({ to: to.trim(), subject: subjectText.trim(), body: bodyText })
              onClose()
            }}
          >
            Send
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>To</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ width: '100%', height: 32, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
          />
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>Subject</span>
          <input
            value={subjectText}
            onChange={(e) => setSubjectText(e.target.value)}
            style={{ width: '100%', height: 32, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
          />
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>Message</span>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={7}
            style={{ width: '100%', resize: 'vertical', padding: '8px 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </label>
      </div>
    </Modal>
  )
}
