import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { recordPayment } from '../../../actions/finance/recordPayment'
import { useAuth } from '../../../lib/auth'

interface RecordPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (payment: { invoiceId: string; amountPaisa: Paisa; method: string; reference: string }) => void
  initialInvoiceId?: string
  /**
   * **Rupees, not paisa** — this pre-fills the "Amount (Rs)" field, which the
   * operator reads and edits in rupees; `rupees()` converts on submit. No
   * caller passes it today (see the state initialiser below), so it exists
   * only for a future caller that can genuinely derive a figure.
   */
  initialAmount?: number
  /**
   * `booking` is optional and carried through to the action as its `bookingId`
   * — `InvoiceRow` (Finance) already has it, and `BookingDetail` supplies its
   * own booking number. Without it the action receives no linkage at all,
   * which is still better than receiving the invoice number in a field named
   * `bookingId`.
   */
  invoices: Array<{ id: string; client: string; amount: string; status: string; booking?: string }>
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  initialInvoiceId = '',
  initialAmount,
  invoices,
}: RecordPaymentModalProps) {
  const { user } = useAuth()
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId || (invoices[0]?.id ?? ''))
  /*
   * Was `useState<number>(initialAmount || 50000)`.
   *
   * That Rs 50,000 was nobody's figure: no caller passes `initialAmount`
   * (`Finance.tsx` ~789 and `BookingDetail.tsx` ~1008 both omit it, checked),
   * so **every** operator opened this modal on **every** invoice with the same
   * invented amount pre-filled, bearing no relation to what was owed. Same
   * class of defect as the hardcoded `amountPaisa: 500000` the audit removed
   * from BookingDetail — and now that the typed figure actually reaches
   * `recordPayment`, it is an invented figure that would be *written*, not
   * merely displayed. A stray Enter would record Rs 50,000 against a bill for
   * anything.
   *
   * The honest default would be the selected invoice's outstanding balance,
   * and it is deliberately **not** used, because the modal cannot compute one:
   * `invoices` carries a pre-formatted total string (`amount`) and no paid
   * figure at all, and BookingDetail's row is a *booking* that has no invoice
   * behind it (its own TODO(decision) at ~996). Widening the prop to demand
   * `paidPaisa` would invent a contract that caller cannot satisfy. So the
   * field starts empty and the operator types the amount; the submit guard
   * rejects it while it is empty.
   *
   * `??`, not `||`: `||` treats a legitimate 0 as absent. 0 is not a payment
   * either way, but the guard is what refuses it, not a silent substitution.
   */
  const [amount, setAmount] = useState<number>(initialAmount ?? 0)
  const [method, setMethod] = useState<'Bank Transfer' | 'Cash' | 'eSewa' | 'Khalti' | 'Card' | 'Cheque'>('Bank Transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!invoiceId) {
      setError('Please select an invoice.')
      return
    }
    /*
     * The field now opens empty (see the state initialiser), so this guard is
     * the only thing standing between an untouched form and a Rs 0 write —
     * it has to hold. `Number.isFinite` is not decoration: `NaN <= 0` is
     * `false`, so a non-finite amount would slip past a bare `amount <= 0`
     * and reach `rupees()`, which would hand the action `NaN` paisa.
     */
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter the payment amount in rupees — it must be greater than 0.')
      return
    }
    /*
     * No session, no payment. This dispatched as `{ userId: 'USR-001', role:
     * 'Manager' }` — an invented staff id, and a role the business-9 migration
     * retired — so every payment recorded here was attributed to somebody who
     * does not exist. Refusing is the only honest branch: a payment has an
     * actor or it is not recorded. Inline, because toasts are successes only.
     */
    if (!user) {
      setError('You are not signed in, so this payment cannot be attributed to anyone. Sign in and record it again.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      /*
       * The figures the operator typed now reach the action. This previously
       * called the duplicate `actions/payments/recordPayment` with
       * `{ id: invoiceId }` alone, so the amount, method and reference went to
       * a domain event and the local `onSuccess` and **nowhere else** — the
       * engine that owns payments never saw the money. That duplicate is
       * deleted; `actions/finance/recordPayment` is the one implementation.
       *
       * `bookingId` comes from the selected invoice's own booking, never from
       * `invoiceId`: an invoice number sitting in a field named `bookingId` is
       * the same class of fabrication this fix exists to remove.
       *
       * TODO(decision): `RecordPaymentInput` has no `invoiceId` and no `notes`
       * field, so *which invoice this settles* and the note typed for the
       * receipt still reach nothing. Widening that input is a schema decision
       * and is not one to take here.
       */
      const selectedInvoice = invoices.find((inv) => inv.id === invoiceId)
      await recordPayment(
        {
          bookingId: selectedInvoice?.booking,
          amountPaisa: rupees(amount),
          paymentMethod: method,
          reference: reference || undefined,
        },
        { userId: user.id, role: user.role },
      )

      /*
       * The `PAYMENT_RECORDED` emit that stood here is gone. The dispatcher
       * emits that event itself, after `execute` returns — events follow the
       * write. A second emit from the screen meant one payment produced two
       * `payment.recorded` events with incompatible payloads (P0 in
       * BUG_SWEEP_REGISTER_v1.0), and this one announced a payment the engine
       * had not necessarily written. Nothing subscribes to the event today, so
       * removing it drops no consumer.
       */
      onSuccess({
        invoiceId,
        amountPaisa: rupees(amount),
        method,
        reference: reference || 'N/A',
      })
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to record payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Payment"
      subtitle="Register an incoming payment against an issued invoice."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Recording...' : 'Record Payment'}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Select Invoice <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <select
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
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
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.id} — {inv.client} ({inv.amount})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Amount (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              /*
               * 0 renders as an empty box, not a typed-looking "0": the state
               * has to be a number for the guard and for `rupees()`, but the
               * operator must see an empty field they are required to fill,
               * not a figure the screen chose.
               */
              value={amount === 0 ? '' : amount}
              onChange={(e) => {
                // Clearing the field gives '' → 0, which the submit guard
                // rejects. A non-numeric entry lands as 0 too, rather than as
                // the NaN that `rupees()` would happily convert.
                const next = Number(e.target.value)
                setAmount(Number.isFinite(next) ? next : 0)
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
            {/*
              The preview confirms the direction of the conversion to the
              operator: they type rupees, `rupees()` makes paisa, and
              `formatMoney()` renders paisa back as `Rs …`. With an empty
              field it shows a dash rather than "Rs 0", which would read as a
              figure the form is holding.
            */}
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Formatted: {amount > 0 ? formatMoney(rupees(amount)) : '—'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Payment Method <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
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
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="eSewa">eSewa</option>
              <option value="Khalti">Khalti</option>
              <option value="Card">Card</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Transaction Reference / Txn ID
          </label>
          <input
            type="text"
            placeholder="e.g. TXN-9948123 or Bank Ref #881"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
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
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Notes (Optional)</label>
          <textarea
            rows={2}
            placeholder="Additional notes for receipt generation..."
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
