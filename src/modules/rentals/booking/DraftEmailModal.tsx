import { useEffect, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { Unavailable } from '../../../components/ui/Unavailable'

/**
 * redesign v1 §5 — comms are draft-only, never auto-sent (21 Jul lock, cited
 * in the spec). Choosing "Email to client" opens this prefilled, editable
 * draft.
 *
 * ⛔ Send used to be a live-looking button raising an `onSend` callback that
 * the page answered with an "Email queued" success toast — a success for a
 * send that never happened. No email backend exists in this build (no comms
 * action module, confirmed by search), so there is nothing true that control
 * could do. Per the honesty convention (`Unavailable` + a named reason;
 * Law 12 forbids the fake toast), the send control now states why it cannot
 * act, and the drafting UI stays: the draft is still reviewable and editable.
 * When a real comms action lands, it replaces `EMAIL_SEND_UNAVAILABLE_REASON`
 * with a dispatch — not this modal.
 */

/** The named reason the send control is unavailable — stated, never a fake toast. */
export const EMAIL_SEND_UNAVAILABLE_REASON =
  'No email backend exists in this build — there is no comms action to dispatch, so this draft cannot be sent or queued from here.'

export interface DraftEmailModalProps {
  isOpen: boolean
  onClose: () => void
  /** What is being drafted — "Quote", "Rental Agreement", etc. */
  documentName: string
  toEmail: string
  subject: string
  body: string
}

export function DraftEmailModal({ isOpen, onClose, documentName, toEmail, subject, body }: DraftEmailModalProps) {
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
      subtitle="Draft only — sending is not available in this build, so nothing leaves this screen."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {/* Not wired ≠ hidden: the control stays, disabled, carrying the named
              reason (hover title on pointer devices, long-press popover on touch). */}
          <Unavailable reason={EMAIL_SEND_UNAVAILABLE_REASON}>
            <Button variant="primary" disabled>
              Send
            </Button>
          </Unavailable>
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
