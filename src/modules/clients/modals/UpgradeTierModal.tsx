import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'
import { useAuth } from '../../../lib/auth'
import { MEMBERSHIP_TIERS } from '../../../data/clients'
import type { ClientRecord, MembershipTier } from '../../../data/clients'

export interface UpgradeTierModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newTier: MembershipTier) => void
  client: ClientRecord
}

const TIER_BENEFITS: Record<MembershipTier, { discount: number; depositWaiver: string; description: string }> = {
  Academy: { discount: 0, depositWaiver: 'Full standard deposit required', description: 'Entry tier for students and emerging indie film crew.' },
  Creator: { discount: 5, depositWaiver: 'Standard deposit with ID hold', description: 'Designed for independent creators, vloggers, and commercial videographers.' },
  Cinematographer: { discount: 10, depositWaiver: '50% deposit reduction', description: 'For professional DoPs, active cinematographers, and frequent renters.' },
  'Production Alliance': { discount: 15, depositWaiver: 'Zero deposit with corporate guarantee', description: 'For registered production houses, agencies, and long-form projects.' },
  Elite: { discount: 20, depositWaiver: 'Zero deposit + VIP concierge gear staging', description: 'Top-tier enterprise partners and marquee feature film productions.' },
}

export function UpgradeTierModal({
  isOpen,
  onClose,
  onSuccess,
  client,
}: UpgradeTierModalProps) {
  const { user } = useAuth()
  const [selectedTier, setSelectedTier] = useState<MembershipTier>(client.membership || 'Academy')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const benefit = TIER_BENEFITS[selectedTier]

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await DomainEvents.emit(EVENT_TYPES.MEMBERSHIP_TIER_CHANGED, {
        clientId: client.id,
        clientName: client.name,
        oldTier: client.membership,
        newTier: selectedTier,
        discountPct: benefit.discount,
        notes: notes.trim(),
        authorizedBy: user?.name ?? 'Admin',
        atIso: new Date().toISOString(),
      })

      onSuccess(selectedTier)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update membership tier')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Membership Tier"
      subtitle={`Update tier plan and automatic discount entitlements for ${client.name}.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={submitting}>
            {submitting ? 'Updating Tier…' : 'Apply Tier Change'}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Select Membership Tier <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value as MembershipTier)}
            style={{
              height: 38,
              padding: '0 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-body)',
              fontWeight: 600,
            }}
          >
            {MEMBERSHIP_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier} ({TIER_BENEFITS[tier].discount}% Standing Discount)
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 'var(--r-card, 8px)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{selectedTier} Plan Benefits</span>
            <span
              style={{
                fontSize: 'var(--t-caption)',
                fontWeight: 700,
                color: 'var(--primary)',
                background: 'var(--nav-active-bg)',
                padding: '2px 8px',
                borderRadius: 'var(--r-badge)',
              }}
            >
              {benefit.discount}% OFF RENTALS
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
            {benefit.description}
          </p>
          <div style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)', marginTop: 4 }}>
            <strong>Security Deposit Policy:</strong> {benefit.depositWaiver}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Notes / Partner Reference (Optional)
          </label>
          <textarea
            rows={2}
            placeholder="Add any internal remarks or qualifying portfolio link…"
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
