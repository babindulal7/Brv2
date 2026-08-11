import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { DomainEvents } from '../../../events/eventBus'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'

interface AssignCrewModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (crewMember: { role: string; name: string; dailyRatePaisa: Paisa; days: number; totalPayPaisa: Paisa }) => void
  bookingId: string
}

export function AssignCrewModal({ isOpen, onClose, onSuccess, bookingId }: AssignCrewModalProps) {
  const [role, setRole] = useState<'DP / Cinematographer' | '1st AC' | 'Gaffer' | 'Sound Recordist' | 'Grip' | 'Drone Operator'>('1st AC')
  const [name, setName] = useState('')
  const [dailyRate, setDailyRate] = useState<number>(5000)
  const [days, setDays] = useState<number>(3)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalPay = dailyRate * days

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!name.trim()) {
      setError('Crew member name is required.')
      return
    }
    if (dailyRate <= 0 || days <= 0) {
      setError('Rate and days must be greater than 0.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const crewData = {
        role,
        name: name.trim(),
        dailyRatePaisa: rupees(dailyRate),
        days,
        totalPayPaisa: rupees(totalPay),
      }

      await DomainEvents.emit('crew.assigned', {
        bookingId,
        ...crewData,
        timestamp: new Date().toISOString(),
      })

      onSuccess(crewData)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to assign crew member')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Assign Crew Member — ${bookingId}`}
      subtitle="Add a specialized technician or crew member to this booking."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Assigning...' : 'Add Crew Member'}
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
              background: 'var(--danger-bg, #fee2e2)',
              color: 'var(--danger-text, #991b1b)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Crew Role <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
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
              <option value="DP / Cinematographer">DP / Cinematographer</option>
              <option value="1st AC">1st AC</option>
              <option value="Gaffer">Gaffer</option>
              <option value="Sound Recordist">Sound Recordist</option>
              <option value="Grip">Grip</option>
              <option value="Drone Operator">Drone Operator</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Technician Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Suman Karki"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              Daily Rate (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={dailyRate}
              onChange={(e) => setDailyRate(Number(e.target.value))}
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
              Number of Days <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
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

        <div
          style={{
            padding: 'var(--sp-md)',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 'var(--t-meta)',
            fontWeight: 700,
          }}
        >
          <span>Total Calculated Crew Pay:</span>
          <span style={{ color: 'var(--nav-active-accent)' }}>{formatMoney(rupees(totalPay))}</span>
        </div>
      </form>
    </Modal>
  )
}
