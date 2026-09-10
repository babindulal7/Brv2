import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { Unavailable } from '../../../components/ui/Unavailable'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import type { ClientRecord } from '../../../lib/queries/clients'

export interface AdjustCreditLimitModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Never called today — see `SAVE_BLOCKED`. Kept on the contract so the wired
   * version fires it with the limit the action actually wrote.
   */
  onSuccess: (newLimitPaisa: Paisa, reason: string) => void
  client: ClientRecord
}

type Validity = '30 Days' | '90 Days' | 'Permanent'

/*
 * TODO(decision) — no credit-limit action exists. `approved_credit_limit` is
 * writable only through the `credit.override` capability (`actions/core.ts`,
 * `createClient.ts` :372), and no action in `src/actions/clients` implements
 * it; `updateClient` is a stub. What stood here emitted
 * `CLIENT_CREDIT_ADJUSTED`, called `onSuccess`, and closed — a Save that wrote
 * nothing, with an `authorizedBy: user?.name ?? 'Admin'` fallback that
 * fabricated an approver. Until the action lands, the form states that it
 * cannot save; the event should be emitted by the action after its write
 * succeeds, carrying the real approver, not here.
 */
const SAVE_BLOCKED =
  'Credit-limit changes are the credit.override action, which is not built yet — nothing typed here can be saved.'

export function AdjustCreditLimitModal({
  isOpen,
  onClose,
  client,
}: AdjustCreditLimitModalProps) {
  const currentLimitRs = Math.round(Number(client.creditLimitPaisa || 0) / 100)
  const [amountRupees, setAmountRupees] = useState<number>(currentLimitRs)
  const [reason, setReason] = useState('')
  const [validity, setValidity] = useState<Validity>('Permanent')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Client Credit Limit"
      subtitle={`Override or adjust credit ceiling for ${client.name} (${client.id}).`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Unavailable reason={SAVE_BLOCKED}>
            <Button variant="primary" disabled>
              Save Credit Limit
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>Current Credit Limit</span>
            <span style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
              {formatMoney(client.creditLimitPaisa)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>Outstanding Balance</span>
            <span style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: client.outstandingPaisa > 0 ? 'var(--danger)' : 'var(--text)' }}>
              {formatMoney(client.outstandingPaisa)}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              New Credit Limit (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={0}
              value={amountRupees === 0 ? '' : amountRupees}
              placeholder="0"
              onChange={(e) => setAmountRupees(Math.max(0, Number(e.target.value) || 0))}
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
            <span style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>
              Preview: {formatMoney(rupees(amountRupees))}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Override Validity
            </label>
            <select
              value={validity}
              onChange={(e) => setValidity(e.target.value as Validity)}
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
              <option value="Permanent">Permanent Standing Limit</option>
              <option value="90 Days">Temporary (90 Days)</option>
              <option value="30 Days">Temporary (30 Days)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Audit Reason & Justification <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            rows={3}
            placeholder="Document why this credit limit is granted (e.g. Approved by Owner for feature film production agreement)…"
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
