import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { Unavailable } from '../../../components/ui/Unavailable'
import { MEMBERSHIP_TIERS, type ClientRecord, type MembershipTier } from '../../../lib/queries/clients'

export interface UpgradeTierModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Never called today — see `SAVE_BLOCKED`. Kept on the contract so the wired
   * version fires it with the tier the action actually wrote.
   */
  onSuccess: (newTier: MembershipTier) => void
  client: ClientRecord
}

/**
 * Labels only. The discount percentage and deposit-waiver policy that used to
 * sit beside each tier here are gone: `membership_plans` carries
 * `individual_discount_pct` and `default_credit_limit` per level, and 0005's
 * comment on that table is the rule — *"no plan value may be hardcoded in
 * application code; every read comes from this table."* A "15% OFF RENTALS"
 * badge from a constant was exactly that, and it disagreed with whatever the
 * table holds.
 *
 * TODO: read the selected tier's entitlements from `membership_plans_v` —
 * `useMembershipPlans()` (`lib/queries/useClients.ts`) already does, and the
 * Credit tab (`Clients.tsx` CreditView) already renders it — and show them
 * here instead of `PLAN_NOTE`. Money columns arrive `null` for a money-blind
 * session, so the render must tolerate that.
 */
const TIER_DESCRIPTIONS: Record<MembershipTier, string> = {
  Academy: 'Entry tier for students and emerging indie film crew.',
  Creator: 'Designed for independent creators, vloggers, and commercial videographers.',
  Cinematographer: 'For professional DoPs, active cinematographers, and frequent renters.',
  'Production Alliance': 'For registered production houses, agencies, and long-form projects.',
  Elite: 'Top-tier enterprise partners and marquee feature film productions.',
}

const PLAN_NOTE = 'Plan entitlements come from the membership plans table and are not shown here yet.'

/*
 * TODO(decision) — no tier-change action exists. A tier lives in
 * `client_memberships` (`createClient.ts` :379), a different table from
 * `clients`, and nothing in `src/actions/clients` writes it; `updateClient` is
 * a stub. What stood here emitted `MEMBERSHIP_TIER_CHANGED`, called
 * `onSuccess`, and closed — a Save that wrote nothing, with an
 * `authorizedBy: user?.name ?? 'Admin'` fallback that fabricated an approver.
 * The event belongs in the action, after its write succeeds.
 */
const SAVE_BLOCKED =
  'Tier changes are a client-membership action that is not built yet — nothing typed here can be saved.'

export function UpgradeTierModal({
  isOpen,
  onClose,
  client,
}: UpgradeTierModalProps) {
  const [selectedTier, setSelectedTier] = useState<MembershipTier>(client.membership || 'Academy')
  const [notes, setNotes] = useState('')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Membership Tier"
      subtitle={`Update the membership tier for ${client.name}.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Unavailable reason={SAVE_BLOCKED}>
            <Button variant="primary" disabled>
              Apply Tier Change
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
                {tier}
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
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{selectedTier} plan</span>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
            {TIER_DESCRIPTIONS[selectedTier]}
          </p>
          <div style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)', marginTop: 4 }}>
            {PLAN_NOTE}
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
