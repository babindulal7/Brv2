import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'

/*
 * ── This modal voided nothing, and said it had ─────────────────────────────
 *
 * What stood in `handleSubmit`: `DomainEvents.emit(EVENT_TYPES.INVOICE_VOIDED,
 * …)`, then `onSuccess(invoiceId)`, then `onClose()`. No action was dispatched,
 * so nothing consulted `implemented`, nothing checked a permission and nothing
 * carried an identity — and yet the modal closed and `Finance.tsx` flipped the
 * row's badge to `Void`. The invoice stayed live in Postgres, still counted
 * toward Outstanding on every other screen, and the operator had a screen
 * telling them the opposite. That is the success-fabrication `actions/core.ts`
 * was rebuilt to make impossible: *"A UI that reports success for work it did
 * not do is worse than one that is visibly unbuilt."*
 *
 * The screen-level emit is gone for the reason `RecordPaymentModal.tsx` ~199-207
 * gives: the DISPATCHER emits an action's events, after `execute` returns
 * (`actions/core.ts:155-158`). A page that emits ahead of the write announces
 * something that did not happen — and the day a `voidInvoice` action exists,
 * this emit would fire a SECOND `invoice.voided` for one void.
 *
 * **There is nothing to dispatch.** A repo-wide search finds no `voidInvoice` /
 * `VOID_INVOICE` anywhere under `src/actions/`. Writing a stub here would only
 * move the refusal one file along, so the refusal is stated inline and
 * persistently instead (Law 12 — and `useToast()` exposes only
 * `showSuccessToast`, which is the wrong shape for this by definition). The
 * modal deliberately does NOT close and does NOT clear the form: the reason the
 * operator typed is still on screen.
 *
 * ⚠ The capability side is NOT the gap. `actions/core.ts:113-114` already maps
 * `invoice.void` → `rbac.canVoidInvoice` (Owner / Accounts), and the launchers
 * in `Finance.tsx` now carry that same rule. What is missing is the WRITE:
 * `invoices_void_requires_reason` (0006:124-127) is an all-or-nothing CHECK over
 * `voided_at` + `voided_by` + a ≥10-character `void_reason` + `credit_note_no`,
 * and the credit-note number belongs to `next_document_number`, not to a form.
 * TODO(decision) — the credit note a void is settled against is a finance ruling
 * that no screen may invent.
 */

interface VoidInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Called only when an invoice has genuinely been voided. Nothing calls it
   * today — see `handleSubmit` — but the prop and `Finance.tsx`'s handler stay
   * wired, because the seam is real: the day a `voidInvoice` action exists this
   * becomes an ordinary refetch.
   *
   * Deliberately NOT destructured below: nothing in this file may call it while
   * no void write exists, and `noUnusedLocals` would flag a binding that is only
   * there to look wired. The same shape `CreateInvoiceModal.tsx` ~81-88 uses.
   */
  onSuccess: (invoiceId: string) => void
  invoiceId: string
  client: string
}

export function VoidInvoiceModal({
  isOpen,
  onClose,
  invoiceId,
  client,
}: VoidInvoiceModalProps) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!reason.trim()) {
      setError('A cancellation reason is required to void an invoice.')
      return
    }
    if (!confirmed) {
      setError('Please check the confirmation box.')
      return
    }

    setIsSubmitting(true)

    /*
     * Nothing writes a void, so this refuses rather than pretending. See the
     * header for what used to stand here and why each piece of it was a claim
     * the system could not back.
     */
    setError(
      `${invoiceId} was NOT voided, and nothing was saved. Voiding an invoice writes voided_at, voided_by, void_reason ` +
        'and a credit-note number together, and no action dispatches that write yet — the invoice is still live, still ' +
        'owed, and still counted in Outstanding everywhere else. The reason you typed is still here; report this rather ' +
        'than retrying.',
    )
    setIsSubmitting(false)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Void Invoice — ${invoiceId}`}
      subtitle={`Safe-cancelling invoice for ${client}. Terminology rule: 'Void', never 'Delete'.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Voiding...' : 'Void Invoice'}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Reason for Voiding <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            rows={3}
            placeholder="Provide reason for safe-cancelling this invoice (e.g. Duplicate booking, Order cancelled before handover)..."
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

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm that this invoice is to be voided and moved to audit archives.
        </label>
      </form>
    </Modal>
  )
}
