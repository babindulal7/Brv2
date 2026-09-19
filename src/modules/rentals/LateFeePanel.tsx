import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { cardStyle } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { settleLateFee, validateWaiver, formatOverage, bandExplanation, WAIVER_REASON_MIN } from '../../lib/lateFee'
import type { LateFeeResult, LateFeeOutcome } from '../../lib/lateFee'
import { useAuth } from '../../lib/auth'
import { canApproveLateFeeWaiver } from '../../lib/rbac'

/**
 * # The late-fee decision
 *
 * ## Why this is not on the Return workspace
 *
 * The 12 Aug spec draws this panel on "Return". `ReturnWorkspace.tsx` is the
 * Warehouse's screen and its own header says so: *"No money, anywhere.
 * Foundation §8.3 … `lib/money.ts` is not imported; no Rs figure appears."*
 * Putting `Suggested late fee Rs 6,000` there would break the law CLAUDE.md
 * lists among the ones most easily broken, and Foundation wins over a later
 * spec by that file's own rule.
 *
 * So the split is by *what the information is*, not by which screen it was
 * drawn on:
 *
 * - **Return** gets the overage and the band — "4h 15m late · a full day is
 *   chargeable". That is operational: it tells the floor to flag the booking.
 *   A band name is a unit of rental time, not a monetary value.
 * - **This panel** gets the rupees and the decision, and lives where money
 *   already lives behind `canBookingMoney`.
 *
 * ## Suggested, never applied
 *
 * Nothing renders as already-charged. The operator applies or waives, and until
 * they do, the figure is a suggestion — `lib/lateFee.ts` carries the rule.
 */

export function LateFeePanel({
  result,
  dayRateBasis,
  staffName,
  outcome,
  onSettle,
}: {
  result: LateFeeResult
  /**
   * What the day rate was taken from, shown verbatim. The scope is unruled —
   * `money.ts`'s own `LateFeeInput` note says no function anywhere aggregates a
   * booking's rate into one "one day" figure, and whether that scope includes
   * crew and transport has no answer. The caller states its basis rather than
   * this panel implying a settled one.
   */
  dayRateBasis: string
  staffName: string
  outcome: LateFeeOutcome | null
  onSettle: (o: LateFeeOutcome) => void
}) {
  const [waiving, setWaiving] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  /*
   * Ruled 12 Aug (PLAN.md §4.23) — a waiver needs a Manager or Owner, the same
   * as a discount above 10%. Both give money away.
   *
   * Ruled again 12 Aug: that approver is the SESSION, not a typed name. This was
   * `useState('')` behind a free-text input; it is now read from `useAuth()` and
   * cannot be authored. `rbac.canApproveLateFeeWaiver` gates the rank on this
   * screen and migration 0058 enforces both the rank and
   * `approved_by = the acting session` at the row, so a name typed here could
   * not have reached the database as an approver anyway.
   */
  const { user } = useAuth()
  const approverName = user?.name?.trim() ?? ''
  const mayApprove = user ? canApproveLateFeeWaiver(user.role) : false

  /* Inside the grace period there is nothing to decide, and a panel offering a
     choice about Rs 0 is noise on a screen that already has a lot on it. */
  if (result.band === 'None') {
    return (
      <div style={{ ...cardStyle, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-sm)' }}>
        <Icon name="check" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--success-text)' }} />
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Returned within the 30-minute grace period — no late fee.
        </span>
      </div>
    )
  }

  if (outcome) {
    const waived = outcome.decision === 'Waive'
    return (
      <div style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
          <Icon name={waived ? 'flag' : 'check'} size={14} style={{ color: waived ? 'var(--progress-text)' : 'var(--success-text)' }} />
          <strong style={{ fontSize: 'var(--t-ui)' }}>
            {waived ? 'Late fee waived' : `Late fee applied — ${formatMoney(outcome.chargedPaisa)}`}
          </strong>
        </div>
        {waived && (
          <>
            {/* The figure survives the waiver: a waived Rs 6,000 is not the
                same event as a Rs 0 fee, and the record has to show which. */}
            <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {formatMoney(outcome.suggestedPaisa)} was suggested and not charged.
            </span>
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Waived by {outcome.waiver?.staffName}, approved by {outcome.waiver?.approverName} — “{outcome.waiver?.reason}”
            </span>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
        <Icon name="alert_triangle" size={15} style={{ color: 'var(--progress-text)', flexShrink: 0 }} />
        <strong style={{ fontSize: 'var(--t-ui)' }}>Returned {formatOverage(result.overageMinutes)} late</strong>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-md)' }}>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Suggested late fee</span>
        <span className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
          {formatMoney(result.feePaisa)}
        </span>
      </div>

      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{bandExplanation(result)}</span>

      {/* The basis is stated, not implied. `money.ts` says the scope of "one
          day's rate" is unruled; the operator should see which reading produced
          the number before they approve it. */}
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        <Icon name="info" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
        Day rate basis: {dayRateBasis}
      </span>

      {!waiving ? (
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            icon="check"
            onClick={() => onSettle(settleLateFee(result, 'Apply'))}
          >
            Apply {formatMoney(result.feePaisa)}
          </Button>
          <Button icon="flag" onClick={() => setWaiving(true)}>
            Waive…
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label htmlFor="late-fee-waiver-reason" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
            Why is this fee being waived? (minimum {WAIVER_REASON_MIN} characters)
          </label>
          <textarea
            id="late-fee-waiver-reason"
            value={reason}
            rows={3}
            onChange={(e) => {
              setReason(e.target.value)
              setError(null)
            }}
            placeholder="e.g. Client held up by the Kalanki road closure, called ahead"
            style={{
              padding: 10,
              borderRadius: 'var(--r-input)',
              border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
              background: 'var(--card2)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />

          {/*
            RULED 12 Aug 2026: the approver IS the signed-in session, not a typed
            name. This was a free-text input whose only validation was
            "non-empty" — so a waiver could be recorded as approved by anyone an
            operator chose to type, including someone who never agreed to it.
            That is the fabricated-identity defect this pass removed everywhere
            else, sitting on a control that gives money away.

            Migration 0058 enforces the same thing at the row: a RESTRICTIVE
            policy requires the session hold Owner or Manager, and
            `enforce_approver_is_actor` refuses an approval whose `approved_by`
            is not the acting session. The screen and the database now agree, and
            neither trusts a string.

            The label stays visible so the operator can see WHO the waiver will
            be recorded against before they commit to it.
          */}
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
            Approved by
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 32,
              fontSize: 'var(--t-meta)',
              color: approverName ? 'var(--text)' : 'var(--danger-text)',
              fontWeight: 600,
            }}
          >
            <Icon name={approverName ? 'check' : 'alert_triangle'} size={12} style={{ flexShrink: 0 }} />
            {approverName
              ? `${approverName} — this session`
              : 'Not signed in. A waiver is recorded against the person approving it, so it cannot be signed from here.'}
          </span>

          {/* Ruled 12 Aug (PLAN.md §4.23): a waiver and a discount above 10%
              both give money away, so both carry a named approver. No
              threshold — Law 10's gate is a percentage and a waiver has no base
              to take one of. */}
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Raised by {staffName}. Any staff member may raise a waiver; a Manager or Owner approves it, and both
            names go to the audit log with the reason.
          </span>

          {error && (
            <span role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
              <Icon name="alert_triangle" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
              {error}
            </span>
          )}

          <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
            <Button
              variant="primary"
              onClick={() => {
                /*
                 * The rank gate, ahead of `validateWaiver`. That engine checks the
                 * waiver is well-formed — a name, a reason, an approver — but it
                 * never sees a ROLE, so it cannot tell a Manager's signature from
                 * a Coordinator's. `lib/lateFee.ts:26` rules the rank and
                 * `rbac.canApproveLateFeeWaiver` is where it now lives.
                 */
                if (!user) {
                  setError('You are not signed in, so this waiver cannot be recorded against anyone. Nothing was waived.')
                  return
                }
                if (!mayApprove) {
                  setError(`A waiver is approved by a Manager or Owner. Your role (${user.role}) may raise one, but not approve it.`)
                  return
                }
                const check = validateWaiver({ staffName, reason, approverName })
                if (!check.valid) {
                  setError(check.error)
                  return
                }
                onSettle(settleLateFee(result, 'Waive', { staffName, reason, approverName }))
              }}
            >
              Confirm waiver
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setWaiving(false)
                setReason('')
                setError(null)
              }}
            >
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export type { Paisa }
