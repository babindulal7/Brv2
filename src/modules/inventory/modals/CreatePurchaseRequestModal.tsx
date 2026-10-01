import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { getBusinessToday, toBs, formatBs } from '../../../lib/bs'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import { useAuth } from '../../../lib/auth'
import type { PRPriority, PurchaseRequest } from '../../../lib/queries/purchaseRequests'

export interface CreatePurchaseRequestModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (pr: PurchaseRequest) => void
}

export function CreatePurchaseRequestModal({
  isOpen,
  onClose,
  onSuccess,
}: CreatePurchaseRequestModalProps) {
  const { user } = useAuth()
  const [equipmentTitle, setEquipmentTitle] = useState('')
  const [category, setCategory] = useState('Camera Body')
  const [quantity, setQuantity] = useState<number>(1)
  const [unitCostRupees, setUnitCostRupees] = useState<number>(0)
  const [priority, setPriority] = useState<PRPriority>('Medium')
  const [turnaways, setTurnaways] = useState<number>(0)
  const [justification, setJustification] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalCostRs = quantity * unitCostRupees

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!equipmentTitle.trim()) {
      setError('Please provide an equipment model or title.')
      return
    }
    if (justification.trim().length < 5) {
      setError('Please document the business justification / utilization need for this purchase.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const prNo = `PR-2026-${Math.floor(1000 + Math.random() * 9000)}`
      const payload: PurchaseRequest = {
        id: prNo,
        prNo,
        fleetItemId: `EQ-${Math.floor(100 + Math.random() * 900)}`,
        fleetItemName: equipmentTitle.trim(),
        category,
        requestedQty: Math.max(1, quantity),
        reason: 'Demand exceeded',
        estimatedUnitCost: rupees(unitCostRupees),
        totalEstimatedCost: rupees(totalCostRs),
        totalSubRentPaid: 0 as Paisa,
        refusedCount: turnaways,
        subRentCount: 0,
        priorityScore: priority === 'High' ? 85 : priority === 'Medium' ? 60 : 40,
        priority,
        status: 'Draft',
        requestedBy: user?.name ?? 'Warehouse Lead',
        dateCreatedAD: getBusinessToday().toISOString().slice(0, 10),
        dateCreatedBS: (() => {
          const bs = toBs(getBusinessToday())
          return bs ? formatBs(bs) : ''
        })(),
        notes: justification.trim(),
        refusedBookings: [],
        subRentals: [],
      }

      await DomainEvents.emit(EVENT_TYPES.PURCHASE_REQUEST_UPDATED, payload)
      onSuccess(payload)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create purchase request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Equipment Purchase Request"
      subtitle="Draft a capital expenditure request backed by rental turnaways and sub-rental evidence."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={submitting}>
            {submitting ? 'Submitting PR…' : 'Submit Purchase Request'}
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
              Equipment Name / Model <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Sony FE 70-200mm f/2.8 GM OSS II"
              value={equipmentTitle}
              onChange={(e) => setEquipmentTitle(e.target.value)}
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
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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
              <option value="Camera Body">Camera Body</option>
              <option value="Cinema Lens">Cinema Lens</option>
              <option value="Lighting">Lighting / Grip</option>
              <option value="Audio">Audio / Wireless</option>
              <option value="Stabilization">Gimbal / Stabilization</option>
              <option value="Power">Power / Battery Batch</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Quantity <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
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
              Unit Est. Cost (Rs)
            </label>
            <input
              type="number"
              min={0}
              value={unitCostRupees === 0 ? '' : unitCostRupees}
              placeholder="0"
              onChange={(e) => setUnitCostRupees(Math.max(0, Number(e.target.value) || 0))}
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
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as PRPriority)}
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
              <option value="Low">Low — Fleet expansion</option>
              <option value="Medium">Medium — High demand</option>
              <option value="High">High — Frequent turnaways</option>
            </select>
          </div>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)', fontSize: 'var(--t-meta)' }}>
          <strong>Total Estimated Outlay:</strong> {formatMoney(rupees(totalCostRs))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Turnaway Count in Last 30 Days
          </label>
          <input
            type="number"
            min={0}
            value={turnaways === 0 ? '' : turnaways}
            placeholder="0"
            onChange={(e) => setTurnaways(Math.max(0, Number(e.target.value) || 0))}
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
            Business Justification &amp; ROI Case <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            rows={3}
            placeholder="Explain why acquiring this asset delivers immediate return (e.g. Eliminates external vendor rental cost and satisfies peak wedding season demand)…"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
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
