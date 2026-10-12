import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { useAuth } from '../../../lib/auth'
import { useCanViewMoney } from '../../../lib/moneyVisibility'
import { useToast } from '../../../components/ui/Toast'
import { formatMoney } from '../../../lib/money'
import { resolveCase } from '../../../actions/cases/resolveCase'
import type { Case } from '../../../lib/queries/cases'

export interface ResolveCaseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (caseId: string, status: 'Resolved' | 'Closed', disposition: string) => void
  caseItem: Case
}

export function ResolveCaseModal({
  isOpen,
  onClose,
  onSuccess,
  caseItem,
}: ResolveCaseModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const money = useCanViewMoney()

  const [status, setStatus] = useState<'Resolved' | 'Closed'>('Resolved')
  const [resolution, setResolution] = useState('')
  const [chargedAmount, setChargedAmount] = useState<string>('')
  const [absorbedAmount, setAbsorbedAmount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!resolution.trim()) {
      setError('Please state a disposition or resolution summary.')
      return
    }

    if (!user) {
      setError('You must be signed in to resolve a case.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const chargedNum = chargedAmount.trim() ? Number(chargedAmount) : undefined
      const absorbedNum = absorbedAmount.trim() ? Number(absorbedAmount) : undefined

      if (chargedNum !== undefined && (!Number.isFinite(chargedNum) || chargedNum < 0)) {
        throw new Error('Charged to client amount must be a valid positive number.')
      }
      if (absorbedNum !== undefined && (!Number.isFinite(absorbedNum) || absorbedNum < 0)) {
        throw new Error('Absorbed amount must be a valid positive number.')
      }

      await resolveCase(
        {
          caseId: caseItem.id,
          status,
          resolution: resolution.trim(),
          chargedToClientAmount: chargedNum,
          absorbedAmount: absorbedNum,
          clientUuid: crypto.randomUUID(),
        },
        { userId: user.id, role: user.role },
      )

      showSuccessToast('Case Resolved', `Case marked as ${status}`)
      onSuccess?.(caseItem.id, status, resolution.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resolve Case — ${caseItem.id}`}
      subtitle={`Settling ${caseItem.title} (${caseItem.counterpartyName}).`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={submitting}>
            {submitting ? 'Resolving...' : `Mark as ${status}`}
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

        {/* Case Info Summary */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
            fontSize: 'var(--t-meta)',
          }}
        >
          <div>
            <div style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>Incident Type</div>
            <div style={{ fontWeight: 600 }}>{caseItem.type} ({caseItem.priority} Priority)</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>Counterparty</div>
            <div style={{ fontWeight: 600 }}>{caseItem.counterpartyName}</div>
          </div>
          {money && (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>Assessed Loss</div>
              <div className="figure" style={{ fontWeight: 600 }}>
                {caseItem.assessedPaisa ? formatMoney(caseItem.assessedPaisa) : '—'}
              </div>
            </div>
          )}
          {caseItem.linked.linkedRecordId && (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>Linked Booking</div>
              <div className="figure" style={{ fontWeight: 600 }}>{caseItem.linked.linkedRecordId}</div>
            </div>
          )}
        </div>

        {/* Target Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Target Status
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['Resolved', 'Closed'] as const).map((s) => (
              <label
                key={s}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                   fontSize: 'var(--t-meta)',
                }}
              >
                <input
                  type="radio"
                  name="targetStatus"
                  value={s}
                  checked={status === s}
                  onChange={() => setStatus(s)}
                  style={{ accentColor: 'var(--nav-active-accent)' }}
                />
                {s}
              </label>
            ))}
          </div>
        </div>

        {/* Disposition / Resolution Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Disposition / Resolution Notes <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Repaired in-house with replacement sensor / Client agreed to partial charge / Insurance claim filed."
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontFamily: 'inherit',
               fontSize: 'var(--t-ui)', // RULING 2026-09-23: --t-body-sm never existed; --t-ui is the step below --t-body
              resize: 'vertical',
            }}
          />
        </div>

        {/* Financial Allocations (only if user has money permissions) */}
        {money && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                Charged to Client (NPR)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={chargedAmount}
                onChange={(e) => setChargedAmount(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                   fontSize: 'var(--t-meta)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                Absorbed Loss (NPR)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={absorbedAmount}
                onChange={(e) => setAbsorbedAmount(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                   fontSize: 'var(--t-meta)',
                }}
              />
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
