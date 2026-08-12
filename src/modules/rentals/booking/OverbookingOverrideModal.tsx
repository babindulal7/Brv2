import { useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import type { EquipmentResult } from './itemCatalogue'

/**
 * redesign v1 §3 — the overbooking valve's override dialog. Only reachable
 * when Settings ▸ Financial ▸ Booking rules ▸ Allow overbooking is on
 * (`lib/bookingRules.ts`); a booked/maintenance chip is otherwise inert.
 *
 * Reason (≥10 chars) and a named approver are both required before
 * "Book it anyway" can be pressed — the same shape as `NewRental.tsx`'s own
 * >10% discount gate, which is already enforced client-side with no separate
 * audit write in this build. This mirrors that exact precedent rather than
 * inventing a new audit mechanism.
 *
 * Sub-rent is listed first and marked preferred, per the 27 Jul lock this
 * spec cites. It has nowhere to dispatch to, though: sub-renting attaches to
 * a *confirmed* booking (`BookingDetail.tsx`'s Create Sub-Rental), and this
 * screen is still a draft with no booking id. Rather than fabricate that
 * workflow for a row that does not exist yet, choosing it disables Override
 * and states the honest reason plainly instead.
 */

export interface OverbookingOverrideModalProps {
  isOpen: boolean
  onClose: () => void
  unit: EquipmentResult | null
  /** Fires only for "Book it anyway" — the caller adds the unit exactly as any other pick. */
  onOverbook: (unit: EquipmentResult) => void
}

const MIN_REASON_LENGTH = 10

export function OverbookingOverrideModal({ isOpen, onClose, unit, onOverbook }: OverbookingOverrideModalProps) {
  const [choice, setChoice] = useState<'sub-rent' | 'overbook'>('sub-rent')
  const [reason, setReason] = useState('')
  const [approver, setApprover] = useState('')

  const reset = () => {
    setChoice('sub-rent')
    setReason('')
    setApprover('')
  }
  const close = () => {
    reset()
    onClose()
  }

  if (!unit) return null

  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH
  const approverOk = approver.trim().length > 0
  const canOverride = choice === 'overbook' && reasonOk && approverOk

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="sm"
      title={`${unit.serial} is ${unit.status.toLowerCase()}`}
      {...(unit.committedTo !== '—' ? { subtitle: unit.committedTo } : {})}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!canOverride}
            onClick={() => {
              onOverbook(unit)
              close()
            }}
          >
            Override
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <label style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="radio" name="overbooking-choice" checked={choice === 'sub-rent'} onChange={() => setChoice('sub-rent')} style={{ marginTop: 3 }} />
          <span>
            <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Sub-rent this item instead</span>
            <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--link)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Preferred</span>
          </span>
        </label>
        <label style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="radio" name="overbooking-choice" checked={choice === 'overbook'} onChange={() => setChoice('overbook')} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Book it anyway (overbooking)</span>
        </label>

        {choice === 'sub-rent' ? (
          <p style={{ margin: 0, display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
            <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
            Sub-renting attaches to a confirmed booking — this draft has no booking number yet. Confirm this
            booking first, then use Create Sub-Rental, or choose "Book it anyway" to add this unit now.
          </p>
        ) : (
          <>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>
                Reason (required, min {MIN_REASON_LENGTH} characters)
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                style={{ width: '100%', resize: 'vertical', padding: '8px 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>Approved by (named person, required)</span>
              <input
                value={approver}
                onChange={(e) => setApprover(e.target.value)}
                style={{ width: '100%', height: 32, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
              />
            </label>
            {/* §10.8's discount gate uses the same shape: reason + named approver,
                enforced here and nowhere else in this build (no audit table exists
                to write to yet). */}
          </>
        )}
      </div>
    </Modal>
  )
}
