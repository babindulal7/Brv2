import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, toRupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { refundPayment } from '../../../actions/payments/refundPayment'
import { useAuth } from '../../../lib/auth'

interface RefundPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (refund: { invoiceId: string; refundAmountPaisa: Paisa; reason: string }) => void
  invoiceId: string
  client: string
  /**
   * `invoices.paid_amount` for this invoice — what has actually been received
   * against it. It is rendered, and it BOUNDS the reversal.
   *
   * Still optional in the TYPE, and that is deliberate — see the submit guard:
   * a caller that genuinely cannot read the figure must be able to say so
   * (`undefined`) instead of being forced to invent one to satisfy a required
   * prop. What changed is that `undefined` no longer means "unbounded": it now
   * REFUSES the reversal. Absence is "we do not know what was received", and
   * that is a reason to stop, not a licence.
   */
  currentPaidPaisa?: Paisa | undefined
}

type RefundMethod = 'Bank Reversal' | 'Cash Return' | 'Wallet Credit'

export function RefundPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  invoiceId,
  client,
  currentPaidPaisa,
}: RefundPaymentModalProps) {
  const { user } = useAuth()
  /*
   * Was `useState<number>(50000)` — the same defect `RecordPaymentModal.tsx`
   * ~41-65 was fixed for, and worse here, because this figure is a REVERSAL:
   * every operator opening this modal on every invoice was pre-filled with the
   * same invented Rs 50,000, bearing no relation to what was received. A stray
   * Enter reversed Rs 50,000 against anything.
   *
   * The honest default is now available (`currentPaidPaisa` is a real column,
   * `invoices.paid_amount`) and is still NOT used as a pre-fill: a full reversal
   * is a decision, not a default, and pre-filling it makes the destructive
   * choice the one that happens by accident. It is displayed instead, and it
   * bounds the field. `0` renders as an empty box; the submit guard refuses it.
   */
  const [refundAmount, setRefundAmount] = useState<number>(0)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<RefundMethod>('Bank Reversal')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    /* `Number.isFinite` is not decoration: `NaN <= 0` is `false`, so a
       non-finite amount would slip past a bare `<= 0` and reach `rupees()`. */
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      setError('Enter the reversal amount in rupees — it must be greater than 0.')
      return
    }
    /*
     * A reversal offsets a receipt, so it cannot exceed what was received — and
     * an ABSENT cap is not a free pass. This guard read
     *
     *     if (currentPaidPaisa !== undefined && rupees(refundAmount) > currentPaidPaisa)
     *
     * so a caller that simply did not pass the figure skipped the entire check,
     * and `Payments.tsx` was that caller: it mounted this modal with no
     * `currentPaidPaisa` at all, which made the cap **inert on that whole
     * route** even though the fix that introduced it was reported as closing
     * the defect. A cap that any caller can switch off by omission is not a cap.
     *
     * So the two branches are now separate, and BOTH refuse. "We do not know
     * what was received" is a reason to stop: an over-refund is money out of the
     * door, and Law 4 makes the only correction for it another reversal.
     *
     * Kept as a runtime refusal rather than a required prop on purpose. A
     * required `Paisa` would push every caller to hand over *something*, and the
     * something a screen without the figure reaches for is a plausible
     * substitute — this payment's own amount, the invoice total — which is the
     * exact class of fabrication this pass exists to remove. Refusing lets a
     * caller be honest about not knowing.
     */
    if (currentPaidPaisa === undefined) {
      setError(
        `This screen cannot read how much has actually been received against ${invoiceId}, so there is nothing to bound ` +
          'this reversal against and it is refused. A reversal larger than the receipt is money paid out twice, and ' +
          'payments are immutable — process it from Finance ▸ Invoices, where the invoice row carries its paid amount.',
      )
      return
    }
    if (rupees(refundAmount) > currentPaidPaisa) {
      setError(
        `Only ${formatMoney(currentPaidPaisa)} has been received against ${invoiceId}, so a reversal cannot be larger than that.`,
      )
      return
    }
    if (!reason.trim()) {
      setError('Please provide a reason for the refund reversal.')
      return
    }
    /*
     * No session, no reversal. This dispatched as `{ userId: 'USR-001', role:
     * 'Manager' }` — an invented staff id, and a role the business-9 migration
     * churned — so every reversal processed here was attributed to somebody who
     * does not exist. `RecordPaymentModal` was already fixed for exactly this
     * (~90-100); a reversal is the more consequential of the two, because Law 4
     * makes it the only correction there is. Inline, because toasts are
     * successes only.
     */
    if (!user) {
      setError('You are not signed in, so this reversal cannot be attributed to anyone. Sign in and process it again.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      /*
       * ⚠ TODO(decision) / BUILD GAP — **the figures do not reach the action.**
       *
       * `RefundPaymentInput` is, in full:
       *
       *     export type RefundPaymentInput = {
       *       id: string; // Placeholder for actual input schema
       *     };
       *
       * — `actions/payments/refundPayment.ts:4-6`, its own comment saying it is
       * a placeholder. There is nowhere in it for the amount, the method or the
       * reason, so the three things the operator just typed are validated here
       * and then dropped. That is stated rather than papered over: widening an
       * action's input is a change to its contract, and inventing a schema for
       * a table this screen cannot see is exactly the fabrication this pass is
       * removing. The reversal's real home is `payment_reversals` — and
       * `payment_reversals.original_payment_id` (0006:215) says a reversal
       * offsets a specific PAYMENT, while this modal is invoice-scoped, which is
       * the same gap `Payments.tsx` ~355 already records on its own button.
       *
       * Nothing is lost by dispatching anyway, and something is gained:
       * `refundPayment` never sets `implemented: true`, so `actions/core.ts:131`
       * throws `ActionNotImplementedError` before validate, execute, events or
       * audit — *"is not connected to the database yet, so nothing was saved"* —
       * and the `catch` below puts that sentence on screen. The operator is told
       * the truth, `onSuccess` never fires, and the modal stays open.
       *
       * ⚠ Whoever sets `implemented: true` must widen this input FIRST. With the
       * placeholder schema still in place, an implemented action would write a
       * reversal carrying no amount while this screen reported the typed figure
       * through `onSuccess` — a correction for an amount nobody recorded, and
       * Law 4 makes a reversal the only correction there is.
       */
      await refundPayment({ id: invoiceId }, { userId: user.id, role: user.role })

      /*
       * The screen-level `DomainEvents.emit(PAYMENT_REFUNDED, …)` that stood
       * here is gone, for the reason `RecordPaymentModal.tsx` ~199-207 gives:
       * the DISPATCHER emits an action's events, after `execute` returns
       * (`actions/core.ts:155-158`), and `refundPayment` already declares a
       * `PAYMENT_REFUNDED` event of its own. Two emits for one reversal, with
       * incompatible payloads — the action's `{ id, timestamp, userId }` and
       * this one's `{ invoiceId, refundAmountPaisa, reason, method, timestamp }`
       * — would leave any future subscriber unable to say how much was reversed
       * without knowing which emitter it heard. Events follow the write; a page
       * never announces one.
       */
      onSuccess({
        invoiceId,
        refundAmountPaisa: rupees(refundAmount),
        reason: reason.trim(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to process refund')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Process Refund / Reversal — ${invoiceId}`}
      subtitle={`Enforcing payment immutability. Creating negative reversal entry for ${client}.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Processing...' : 'Confirm Reversal'}
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
              /*
                ⛔ Was `var(--danger-bg, #fee2e2)` / `var(--danger-text, #991b1b)`.
                The same correction landed on the three rentals modals
                (AssignCrewModal, CreateSubRentalModal, ExtendRentalModal) in an
                earlier pass; these three were missed by it and kept the hexes.

                Two things were wrong. A raw hex in a component is a §3
                violation on its own ("screens use var(--…), never a literal").
                And the pair is a LIGHT-theme pink: when the fallback fired it
                stayed pink in dark mode, where the status pair resolves to a
                deep `#4b1515`-family red instead.

                `--danger-bg` exists again as of the v4.1 repaint, so the
                fallbacks are now dead rather than active — but a dead fallback
                carrying the wrong colour is a trap for whoever next removes an
                alias. Using the status pair directly removes the question.
              */
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            padding: 'var(--sp-md)',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            fontSize: 'var(--t-meta)',
            lineHeight: 1.5,
          }}
        >
          <strong>Notice:</strong> Payments in Babin Rentals OS are immutable. Confirming this reversal will register a negative entry in the audit ledger without altering original receipt records.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Refund Amount (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              {...(currentPaidPaisa !== undefined ? { max: toRupees(currentPaidPaisa) } : {})}
              /* 0 renders as an empty box, not a typed-looking "0": the state has
                 to be a number for the guard and for `rupees()`, but the operator
                 must see a field they are required to fill. */
              value={refundAmount === 0 ? '' : refundAmount}
              onChange={(e) => {
                const next = Number(e.target.value)
                setRefundAmount(Number.isFinite(next) ? next : 0)
              }}
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
              Formatted: {refundAmount > 0 ? formatMoney(rupees(refundAmount)) : '—'}
            </span>
            {/* The real figure from `invoices.paid_amount`, stated rather than
                pre-filled. Absent when the caller could not supply it — never a
                zero standing in for "we did not look". When it is absent the
                submit guard refuses, so that consequence is stated here rather
                than discovered after the form is filled in. */}
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              {currentPaidPaisa === undefined
                ? 'Received to date: not available to this screen — a reversal cannot be bounded here, so it will be refused.'
                : `Received to date: ${formatMoney(currentPaidPaisa)}`}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* ⚠ This control currently goes nowhere. `RefundPaymentInput` has
                no field for the method (see the dispatch block above), so the
                choice is collected and dropped. It is left rendered rather than
                removed because the reversal genuinely has a method and the
                operator must state it — but nobody should read this select as
                evidence that the ledger knows how the money went back. */}
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Reversal Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as RefundMethod)}
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
              <option value="Bank Reversal">Bank Reversal</option>
              <option value="Cash Return">Cash Return</option>
              <option value="Wallet Credit">Wallet Credit</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Reason for Reversal / Refund <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            rows={3}
            placeholder="State the reason (e.g. Overpayment correction, Equipment damage refund)..."
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
