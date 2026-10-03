import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { adjustStock } from '../../actions/inventory/adjustStock'
import { useAuth } from '../../lib/auth'
import { formatGateError } from '../../lib/gates'
import { newClientUuid } from '../../lib/supabase'

export function AdjustStockModal({ productId, productName, currentQuantity, onClose, onAdjusted }: {
  productId: string
  productName: string
  currentQuantity: number
  onClose: () => void
  onAdjusted: () => void
}) {
  const { user } = useAuth()
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [clientUuid] = useState(newClientUuid)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const quantity = Number(delta)
    if (!Number.isSafeInteger(quantity) || quantity === 0) {
      setError('Enter a non-zero whole number, with + to add or − to remove stock.')
      return
    }
    if (reason.trim().length < 10) {
      setError('Give a reason of at least ten characters.')
      return
    }
    if (!user) {
      setError('Sign in before adjusting stock.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adjustStock({ productId, delta: quantity, reason, clientUuid }, { userId: user.id, role: user.role })
      onAdjusted()
      onClose()
    } catch (cause: unknown) {
      setError(formatGateError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Adjust Stock — ${productName}`}
      subtitle={`Recorded quantity: ${currentQuantity}`}
      size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Adjusting…' : 'Record Adjustment'}</Button>
      </>}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
        {error && <div role="alert" style={{ padding: '10px 14px', border: '1px solid var(--danger)', borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)' }}>{error}</div>}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text)', fontWeight: 600 }}>
          Quantity change <span style={{ color: 'var(--danger)' }}>*</span>
          <input type="number" inputMode="numeric" step="1" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="+2 or -3" style={{ minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }} />
        </label>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text)', fontWeight: 600 }}>
          Reason <span style={{ color: 'var(--danger)' }}>*</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Explain what changed and why" style={{ minHeight: 80, padding: '10px 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', resize: 'vertical' }} />
        </label>
      </div>
    </Modal>
  )
}
