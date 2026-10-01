import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import { useAuth } from '../../../lib/auth'
import { useCanViewMoney } from '../../../lib/moneyVisibility'
import { createMaintenanceJob } from '../../../actions/maintenance/createMaintenanceJob'
import { generateClientUuid } from '../../../lib/dataAccess'
import { getBusinessToday } from '../../../lib/bs'

export type MaintenanceType = 'Repair' | 'Service' | 'Calibration' | 'Inspection'
export type MaintenancePriority = 'Low' | 'Medium' | 'High' | 'Critical'

export interface MaintenanceJobPayload {
  id: string
  equipmentName: string
  serialNo: string
  type: MaintenanceType
  priority: MaintenancePriority
  technician: string
  vendor?: string
  estCostPaisa: Paisa
  estCompletionAd: string
  bookingImpact?: string
  notes: string
  loggedBy: string
  atIso: string
}

export interface LogMaintenanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (job: MaintenanceJobPayload) => void
  initialEquipment?: string
  initialSerial?: string
}

export function LogMaintenanceModal({
  isOpen,
  onClose,
  onSuccess,
  initialEquipment = '',
  initialSerial = '',
}: LogMaintenanceModalProps) {
  const { user } = useAuth()
  // RS-07 / Law 6 — Warehouse sees no money: the cost field is omitted for a
  // money-blind role and the payload carries zero rather than reading it.
  const money = useCanViewMoney()
  const [equipment, setEquipment] = useState(initialEquipment)
  const [serial, setSerial] = useState(initialSerial)
  const [jobType, setJobType] = useState<MaintenanceType>('Service')
  const [priority, setPriority] = useState<MaintenancePriority>('Medium')
  const [technician, setTechnician] = useState(user?.name ?? 'Internal Tech')
  const [vendor, setVendor] = useState('')
  const [costRupees, setCostRupees] = useState<number>(0)
  const [daysToComplete, setDaysToComplete] = useState<number>(3)
  const [bookingImpact, setBookingImpact] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!equipment.trim()) {
      setError('Please specify the equipment item name.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      let jobId = `MJ-2026-${Math.floor(1000 + Math.random() * 9000)}`
      if (user) {
        try {
          const res = await createMaintenanceJob(
            {
              serialNo: serial.trim() || undefined,
              description: notes.trim() || `${jobType} for ${equipment.trim()}`,
              maintenanceType: jobType === 'Service' ? 'Preventive Service' : jobType,
              priority: priority === 'Medium' ? 'Normal' : priority === 'Critical' ? 'Urgent' : priority,
              vendorName: vendor.trim() || undefined,
              cost: money && costRupees ? costRupees : undefined,
              performedBy: user.id,
              clientUuid: generateClientUuid(),
            },
            { userId: user.id, role: user.role },
          )
          if (res?.recordNo) {
            jobId = res.recordNo
          }
        } catch (actionErr) {
          console.warn('createMaintenanceJob action note:', actionErr)
        }
      }

      const estCompletion = getBusinessToday()
      estCompletion.setDate(estCompletion.getDate() + (daysToComplete || 1))

      const payload: MaintenanceJobPayload = {
        id: jobId,
        equipmentName: equipment.trim(),
        serialNo: serial.trim() || 'SN-UNKNOWN',
        type: jobType,
        priority,
        technician: technician.trim(),
        ...(vendor.trim() ? { vendor: vendor.trim() } : {}),
        estCostPaisa: money ? rupees(costRupees) : (0 as Paisa),
        estCompletionAd: estCompletion.toISOString().slice(0, 10),
        ...(bookingImpact.trim() ? { bookingImpact: bookingImpact.trim() } : {}),
        notes: notes.trim(),
        loggedBy: user?.name ?? 'Staff',
        atIso: new Date().toISOString(),
      }

      await DomainEvents.emit(EVENT_TYPES.MAINTENANCE_STARTED, payload)
      onSuccess(payload)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to log maintenance job')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Equipment Maintenance"
      subtitle="Schedule equipment repairs, routine calibration, or vendor servicing."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={submitting}>
            {submitting ? 'Creating Job…' : 'Schedule Job'}
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
              Equipment Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Sony FX3 Cinema Line Camera"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
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
              Serial Number / Asset Tag
            </label>
            <input
              type="text"
              placeholder="e.g. SN-889124 or BAB-CAM-01"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Maintenance Type <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value as MaintenanceType)}
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
              <option value="Service">Routine Service / Cleaning</option>
              <option value="Repair">Damage Repair</option>
              <option value="Calibration">Lens / Sensor Calibration</option>
              <option value="Inspection">Safety / Electrical Inspection</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Priority <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as MaintenancePriority)}
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
              <option value="Low">Low — Standby gear</option>
              <option value="Medium">Medium — Standard turnaround</option>
              <option value="High">High — Popular rentable unit</option>
              <option value="Critical">Critical — Conflicting active booking</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Assigned Technician / Specialist
            </label>
            <input
              type="text"
              placeholder="e.g. Ramesh Thapa"
              value={technician}
              onChange={(e) => setTechnician(e.target.value)}
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
              External Vendor / Service Centre
            </label>
            <input
              type="text"
              placeholder="e.g. Sony Authorised Service / Camera House"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
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

        <div style={{ display: 'grid', gridTemplateColumns: money ? '1fr 1fr' : '1fr', gap: 'var(--sp-md)' }}>
          {money && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Estimated Cost (Rs)
            </label>
            <input
              type="number"
              min={0}
              value={costRupees === 0 ? '' : costRupees}
              placeholder="0"
              onChange={(e) => setCostRupees(Math.max(0, Number(e.target.value) || 0))}
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
              {costRupees > 0 ? formatMoney(rupees(costRupees)) : 'Rs 0'}
            </span>
          </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Estimated Turnaround (Days)
            </label>
            <input
              type="number"
              min={1}
              value={daysToComplete}
              onChange={(e) => setDaysToComplete(Math.max(1, Number(e.target.value) || 1))}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Impacted Booking No. (If holding upcoming rental)
          </label>
          <input
            type="text"
            placeholder="e.g. BR-715 or leave empty if spare"
            value={bookingImpact}
            onChange={(e) => setBookingImpact(e.target.value)}
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
            Issue Description &amp; Checklist Items
          </label>
          <textarea
            rows={3}
            placeholder="Describe defect, sensor spots, loose mount, calibration offset, or vendor RMA notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
