import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import { useAuth } from '../../../lib/auth'
import type { ClientRecord } from '../../../data/clients'

export interface AdjustCreditLimitModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newLimitPaisa: Paisa, reason: string) => void
  client: ClientRecord
}

type Validity = '30 Days' | '90 Days' | 'Permanent'

export function AdjustCreditLimitModal({
  isOpen,
  onClose,
  onSuccess,
  client,
}: AdjustCreditLimitModalProps) {
  const { user } = useAuth()
  const currentLimitRs = Math.round(Number(client.creditLimitPaisa || 0) / 100)
  const [amountRupees, setAmountRupees] = useState<number>(currentLimitRs)
  const [reason, setReason] = useState('')
  const [validity, setValidity] = useState<Validity>('Permanent')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!Number.isFinite(amountRupees) || amountRupees < 0) {
      setError('Enter a valid non-negative credit limit in rupees.')
      return
    }
    if (reason.trim().length < 5) {
      setError('Please provide an audit reason for the credit limit adjustment (minimum 5 characters).')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const newLimitPaisa = rupees(amountRupees)
      await DomainEvents.emit(EVENT_TYPES.CLIENT_CREDIT_ADJUSTED, {
        clientId: client.id,
        clientName: client.name,
        oldLimitPaisa: client.creditLimitPaisa,
        newLimitPaisa,
        validity,
        reason: reason.trim(),
        authorizedBy: user?.name ?? 'Admin',
        atIso: new Date().toISOString(),
      })

      onSuccess(newLimitPaisa, reason.trim())
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to adjust credit limit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Client Credit Limit"
      subtitle={`Override or adjust credit ceiling for ${client.name} (${client.id}).`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={submitting}>
            {submitting ? 'Applying Override…' : 'Save Credit Limit'}
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
