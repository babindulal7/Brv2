import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import { useAuth } from '../../../lib/auth'
import { useCanViewMoney } from '../../../lib/moneyVisibility'
import { useToast } from '../../../components/ui/Toast'
import type { Case, CasePriority, CaseType } from '../../../lib/queries/cases'

export interface LogCaseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (newCase: Case) => void
  bookingNo?: string
  clientName?: string
  initialEquipment?: Array<{ name: string; serial?: string }>
  initialType?: CaseType
  initialNotes?: string
}

export function LogCaseModal({
  isOpen,
  onClose,
  onSuccess,
  bookingNo = '',
  clientName = '',
  initialEquipment = [],
  initialType = 'Damage',
  initialNotes = '',
}: LogCaseModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  // RS-07 / Law 6 — Warehouse sees no money: the cost and deposit-hold fields
  // are omitted for a money-blind role, and the submit path below must not
  // read them for that role.
  const money = useCanViewMoney()
  const [caseType, setCaseType] = useState<CaseType>(initialType)
  const [priority, setPriority] = useState<CasePriority>('Medium')
  const [title, setTitle] = useState(
    initialEquipment.length > 0
      ? `${initialType}: ${initialEquipment.map((e) => `${e.name}${e.serial ? ` (${e.serial})` : ''}`).join(', ')}`
      : '',
  )
  const [booking, setBooking] = useState(bookingNo)
  const [client, setClient] = useState(clientName)
  const [equipmentList] = useState(initialEquipment)
  const [estimatedCostRupees, setEstimatedCostRupees] = useState<number>(0)
  const [holdDeposit, setHoldDeposit] = useState(true)
  const [depositHoldRupees, setDepositHoldRupees] = useState<number>(0)
  const [description, setDescription] = useState(initialNotes)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!title.trim()) {
      setError('Please provide a title or summary for the incident.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const caseNo = `CASE-2026-${Math.floor(1000 + Math.random() * 9000)}`
      const costPaisa = money ? rupees(estimatedCostRupees) : (0 as Paisa)
      // TODO(decision): "hold amount defaults to the estimated cost" is deposit
      // logic on a page. It belongs in the engine (src/lib/money.ts, beside the
      // deposit helpers) — left in place, not moved, until that is ruled.
      const holdPaisa = money && holdDeposit ? rupees(depositHoldRupees || estimatedCostRupees) : (0 as Paisa)

      const newCase: Case = {
        id: caseNo,
        type: caseType,
        title: title.trim(),
        counterpartyKind: 'Client',
        counterpartyName: client || 'Walk-in Client',
        equipment: equipmentList.length > 0
          ? equipmentList.map((e) => ({ name: e.name, serial: e.serial ?? 'N/A' }))
          : [{ name: 'Equipment Batch', serial: 'N/A' }],
        priority,
        status: 'Open',
        disposition: null,
        assessedPaisa: costPaisa,
        depositHeldPaisa: holdPaisa,
        chargedToClientPaisa: 0 as Paisa,
        depositAppliedPaisa: 0 as Paisa,
        insuranceClaimedPaisa: 0 as Paisa,
        warrantyCoveredPaisa: 0 as Paisa,
        recoveredFromPartnerPaisa: 0 as Paisa,
        absorbedPaisa: 0 as Paisa,
        openedAd: new Date(),
        owner: user?.name ?? 'Warehouse Staff',
        ownerRole: 'Warehouse',
        flags: ['Under Investigation'],
        linked: {
          linkedRecordKind: 'Booking',
          linkedRecordId: booking || 'B-715',
          clientName: client || 'Walk-in Client',
        },
        evidence: {},
      }

      await DomainEvents.emit(EVENT_TYPES.DISCREPANCY_FLAGGED, {
        case: newCase,
        bookingNo: booking,
        clientName: client,
        type: caseType,
        equipment: equipmentList,
        operator: user?.name ?? 'Operator',
        notes: description,
      })

      showSuccessToast('Incident Logged', `Case ${newCase.id} logged successfully`)
      if (onSuccess) {
        onSuccess(newCase)
      }
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to log incident case')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Incident / Discrepancy Case"
      subtitle="Report equipment damages, missing items, or rental discrepancies for manager & finance resolution."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={submitting}>
            {submitting ? 'Logging Incident…' : 'Log Incident Case'}
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
              Incident Type <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={caseType}
              onChange={(e) => setCaseType(e.target.value as CaseType)}
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
              <option value="Damage">Damage / Repair Required</option>
              <option value="Missing">Missing Equipment</option>
              <option value="Theft">Theft / Unreturned</option>
              <option value="Dispute">Client Dispute / Policy Exception</option>
              <option value="Vendor">Sub-Rental / Vendor Issue</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Priority / Urgency <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as CasePriority)}
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
              <option value="Low">Low — Routine maintenance/clean</option>
              <option value="Medium">Medium — Inspection finding</option>
              <option value="High">High — Critical equipment conflict</option>
              <option value="Critical">Critical — Severe loss / Dispute</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Incident Summary / Title <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Broken front element on Sony FE 24-70mm GM II"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Linked Booking No.
            </label>
            <input
              type="text"
              placeholder="e.g. BR-715"
              value={booking}
              onChange={(e) => setBooking(e.target.value)}
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
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Client Name</label>
            <input
              type="text"
              placeholder="e.g. Himalayan Films"
              value={client}
              onChange={(e) => setClient(e.target.value)}
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
        </div>

        {money && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Estimated Cost (Rs)
            </label>
            <input
              type="number"
              min={0}
              value={estimatedCostRupees === 0 ? '' : estimatedCostRupees}
              placeholder="0"
              onChange={(e) => setEstimatedCostRupees(Math.max(0, Number(e.target.value) || 0))}
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
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              {estimatedCostRupees > 0 ? formatMoney(rupees(estimatedCostRupees)) : 'Rs 0'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Deposit Hold Amount (Rs)
            </label>
            <input
              type="number"
              min={0}
              value={depositHoldRupees === 0 ? '' : depositHoldRupees}
              placeholder={estimatedCostRupees > 0 ? String(estimatedCostRupees) : '0'}
              onChange={(e) => setDepositHoldRupees(Math.max(0, Number(e.target.value) || 0))}
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={holdDeposit}
                onChange={(e) => setHoldDeposit(e.target.checked)}
              />
              Hold deposit from auto-refund
            </label>
          </div>
        </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Technician Findings & Evidence Notes
          </label>
          <textarea
            rows={3}
            placeholder="Detailed description of the issue, inspection findings, serial numbers involved, or client statements…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
