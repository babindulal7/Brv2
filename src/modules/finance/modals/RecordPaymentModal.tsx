import { useEffect, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { recordPayment } from '../../../actions/finance/recordPayment'
import { listBankAccounts } from '../../../lib/queries/bankAccounts'
import type { BankAccountRow } from '../../../lib/queries/bankAccounts'
import { useAuth } from '../../../lib/auth'
import { useNetwork } from '../../../lib/network'
import { newClientUuid } from '../../../lib/supabase'

/**
 * The largest amount `payments.amount` can hold, in paisa.
 *
 * `numeric(14,2)` = 14 significant digits with 2 after the point → Rs
 * 999,999,999,999.99 → 99,999,999,999,999 paisa. Derived from the column
 * (`0006_finance.sql:184`), not chosen — see the guard in `handleSubmit`.
 */
const MAX_PAYMENT_PAISA = 99_999_999_999_999

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
   * The invoices this modal offers.
   *
   * ⚠ `id` is the invoice **number** (`invoices.invoice_no`), not a uuid — that
   * is what `Finance.tsx` and `Payments.tsx` map into it, and it is what the
   * action resolves the payment's `booking_id`/`client_id`/`branch_id` from.
   *
   * `booking` is still accepted so the four calling screens keep compiling
   * unchanged, but it is no longer sent anywhere: it held a booking NUMBER and
   * was being passed as the action's `bookingId`, where the schema needs a
   * uuid. The booking a payment belongs to is now read off the invoice row
   * itself, which is the only place that fact is authoritative.
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
  const isOnline = useNetwork()
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
  /*
   * The ACCOUNT the money landed in — `bank_accounts.id`, the structured half
   * of "how was this paid" (`recordPayment.ts`'s METHOD block). '' means "no
   * account recorded", which is an ordinary state (`payments.bank_account_id`
   * is nullable): the method label above is the operator's word, this picker
   * is the ledger fact, and neither is derived from the other. Read through
   * `queries/bankAccounts.ts` (Law 2), loaded per open so a newly added
   * account appears without a reload.
   */
  const [bankAccountId, setBankAccountId] = useState('')
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Law 8 — the idempotency key is minted ONCE, when the modal opens, and it is
   * the same key on every retry of that one attempt. Exactly the pattern
   * `Expenses.tsx:428-441` uses, and for the same reason: a `[Record Payment]`
   * pressed again after a dropped response must carry the SAME uuid so
   * `payments_client_uuid_key` rejects the duplicate and the action hands back
   * the row the first attempt already wrote. A key minted per click charges the
   * client twice, and `payments` cannot be edited afterwards to fix it (Law 4) —
   * the correction would be a `payment_reversals` row and a conversation.
   *
   * Re-minted after a SUCCESSFUL submit as well as on open, so that a screen
   * which ever keeps this modal mounted across two payments cannot post the
   * second one under the first one's key and silently receive the first
   * payment's row back as a "success".
   */
  const [clientUuid, setClientUuid] = useState<string>(() => newClientUuid())
  useEffect(() => {
    if (isOpen) {
      setClientUuid(newClientUuid())
      setError(null)
      // A fresh open must not inherit the previous payment's account choice —
      // an account is per-receipt, and a stale one silently credits it again.
      setBankAccountId('')
    }
  }, [isOpen])

  /*
   * The account list, fetched while the modal is open. A failure here must not
   * block the payment — an account is optional on the row — so it degrades to
   * "no accounts to offer" with the reason stated inline, never a silent empty
   * picker (mock mode genuinely serves zero `bank_accounts` rows, and a live
   * desk may not have entered its accounts yet — both render the same honest
   * way).
   */
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setAccountsError(null)
    listBankAccounts()
      .then((rows) => {
        if (!cancelled && typeof window !== 'undefined') setAccounts(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled && typeof window !== 'undefined') {
          setAccounts([])
          setAccountsError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

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
     * ── The upper bound that IS this screen's to enforce ──────────────────────
     *
     * `payments.amount` is `numeric(14,2)` (`0006_finance.sql:184`) — twelve
     * integer digits and two decimals, so the largest amount the column can
     * hold is Rs 999,999,999,999.99, i.e. 99,999,999,999,999 paisa.
     *
     * This is a representability fact, not a business rule, which is why it can
     * be decided here while the question below cannot. Without it a fat-fingered
     * exponent reaches `toRupees()` in the action, passes its
     * `Number.isFinite`/`Number.isInteger` checks (`Number.isInteger(1e20)` is
     * `true`), and fails inside Postgres as a raw numeric-overflow message the
     * operator cannot act on. Anything at or under this bound came out of
     * `Math.round` and is comfortably inside `Number.MAX_SAFE_INTEGER`
     * (~9.0e15), so no precision is lost on the way either.
     */
    if (rupees(amount) > MAX_PAYMENT_PAISA) {
      setError(
        `That amount is larger than the ledger can record — a single payment cannot exceed ${formatMoney(
          MAX_PAYMENT_PAISA as Paisa,
        )}. Check the figure; nothing was recorded.`,
      )
      return
    }
    /*
     * ── TODO(decision) · may a receipt exceed what the invoice asks for? ──────
     *
     * `RefundPaymentModal` bounds a reversal by `invoices.paid_amount` and
     * refuses when it cannot read one. This form has no equivalent bound, and
     * the asymmetry was examined rather than mirrored: **the two are not the
     * same question.** An over-refund is money out of the door that Law 4 can
     * only correct with another reversal. An over-payment is money already
     * received — refusing it wrongly turns an operator away from a receipt the
     * client has genuinely handed over, which is as damaging as accepting one
     * wrongly.
     *
     * Nothing in the product rules it, and the evidence points at "allowed":
     *
     *  · `payments` carries exactly one constraint on magnitude —
     *    `payments_amount_positive check (amount > 0)` (0006:196). There is no
     *    upper bound and no reference to the invoice.
     *  · `invoices_amounts_non_negative` (0006:110) floors `paid_amount` at 0
     *    and bounds it above at nothing, so `paid_amount > total_amount` is a
     *    state the schema deliberately permits.
     *  · `sync_payment_to_invoice()` (`0010_triggers_functions.sql:262`) writes
     *    `greatest(0, v_total_amount - v_total_paid)` — it ABSORBS the excess
     *    rather than raising, marks the invoice 'Paid', and moves on.
     *  · every row this action writes is `payment_type: 'Advance Payment'`
     *    (`recordPayment.ts:330`) — money ahead of the bill is the modelled
     *    normal case, not an anomaly.
     *
     * But "the ledger tolerates it" is not the same as "the desk intends it",
     * and the representation half is **explicitly open**: `PLAN.md` §4.17 asks,
     * as decision (1) of three, whether outstanding is *"floored at 0, or may it
     * go negative to represent an overpayment"* — and the codebase currently
     * answers both ways, `sync_payment_to_invoice()` clamping while
     * `lib/workflow.ts`'s `outstanding()` goes negative on purpose, with a test
     * asserting it (`__tests__/workflow.test.ts:401`). The invoice status set
     * has no 'Overpaid' either (Payments spec §5.2), so today an over-payment
     * is indistinguishable from an exact settlement once written.
     *
     * The options, so whoever rules it is choosing rather than discovering:
     *   (a) allow silently — today's behaviour;
     *   (b) allow with an explicit on-screen acknowledgement of the excess
     *       ("Rs X more than this invoice asks for — record as an advance?");
     *   (c) refuse above the outstanding balance, and route the excess to a
     *       credit/advance the desk applies later.
     *
     * ⚠ Note that (b) and (c) are not merely unruled, they are **not buildable
     * from this modal's props today**, and that is the second reason nothing is
     * guessed here. `invoices[]` gives this screen `amount` — a pre-formatted
     * display STRING — and no paid figure at all. Re-deriving paisa from that
     * string is the exact 100x round trip `CreateInvoiceModal.tsx` ~60-66
     * records (`Rs 1,39,506.5` parses back as 13,95,065), and the string does
     * not even mean the same thing to every caller: `Finance.tsx` and
     * `Payments.tsx` pass the invoice TOTAL, while `UnifiedInbox.tsx` ~1098
     * passes `Outstanding Rs …`, a client balance. Enforcing either option
     * needs a real `outstandingPaisa: Paisa` on the prop, from callers that can
     * genuinely read one — and `BookingDetail`/`UnifiedInbox` cannot, because
     * they hold a booking and no invoice at all (their own open question).
     *
     * Record in `PLAN.md` §4 alongside 4.17; do not close it from this file.
     */
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
    /*
     * Offline, refused here and named for what it is.
     *
     * `lib/rbac`'s `canRecordPayment(role, isOnline)` already returns false
     * offline, and `isOnline` is passed to the dispatcher below so that rule is
     * honoured — but the dispatcher reports every denial as an
     * `ActionPermissionError` reading "Your role (Owner) cannot perform
     * RECORD_PAYMENT", which would tell an Owner their ROLE was the problem
     * when the problem was the network. This check runs first so the operator
     * reads the true reason. `recordPayment`'s own offline guard is the
     * backstop for any caller that skips this one.
     */
    if (!isOnline) {
      setError(
        'This device is offline. A payment is not queued for later — it is refused, because a receipt for money ' +
          'the ledger has not recorded is worse than no receipt. Record it once you are back online.',
      )
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      /*
       * The figures the operator typed now reach a real INSERT into `payments`.
       *
       * The previous version sent `bookingId: selectedInvoice?.booking` — the
       * booking NUMBER, in a field the schema needs a uuid for — and sent no
       * invoice at all, so *which bill the money settled* reached nothing. The
       * action now takes the invoice's number (`invoices.invoice_no` is
       * `text not null unique`) and reads `booking_id`, `client_id` and
       * `branch_id` off that invoice row itself. Both TODO(decision)s that
       * stood here — no `invoiceId`, no `notes` — are closed by that change:
       * the note the operator types for the receipt is now written to
       * `payments.notes`.
       *
       * ⚠ `invoiceId` here holds the value of `invoices[].id`, which every
       * calling screen populates with the invoice NUMBER (`Finance.tsx` and
       * `Payments.tsx` both map `id: r.invoiceNo`) — not a uuid. That is what
       * `invoiceNo` is named for. `BookingDetail` and `UnifiedInbox` pass a
       * BOOKING number instead, and the action answers those with a named
       * refusal rather than posting the money against nothing; their own
       * TODO(decision) (may a payment be taken before an invoice exists?)
       * is the thing that has to be ruled, and it is not ruled here.
       *
       * `clientUuid` is Law 8's key for THIS attempt; `isOnline` is what
       * `lib/rbac`'s money rules degrade on.
       */
      await recordPayment(
        {
          invoiceNo: invoiceId,
          amountPaisa: rupees(amount),
          paymentMethod: method,
          // The chosen account's row id, or nothing at all — the action never
          // infers an account from the method label (METHOD, recordPayment.ts).
          bankAccountId: bankAccountId || undefined,
          reference: reference || undefined,
          notes: notes || undefined,
          clientUuid,
        },
        { userId: user.id, role: user.role, isOnline },
      )

      // A new key for the next payment. See the `clientUuid` state above: only
      // a completed write ends an attempt, so this is re-minted here and not in
      // `finally`, where a failed submit would lose its own retry protection.
      setClientUuid(newClientUuid())

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
            Deposit To Account
          </label>
          {/*
            `bank_accounts` picker — writes `payments.bank_account_id`, which is
            what the Payments list's Method column and the Finance dashboard's
            method breakdown read (`bank_accounts.channel_group` through the
            embed). Optional: "No account recorded" is the honest row for cash
            in hand or a desk with no accounts entered, and it is DIFFERENT
            from the method label above — a label is the operator's word, this
            is the ledger fact. Law 15's 44px floor on the new control; the
            sibling 36px fields predate the rule and are not this edit's.
          */}
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            aria-label="Deposit to account"
            style={{
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          >
            <option value="">No account recorded</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bankName} — {a.accountName} ({a.channelGroup})
              </option>
            ))}
          </select>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            {accountsError
              ? `Accounts could not be loaded (${accountsError}) — the payment can still be recorded with no account.`
              : accounts.length === 0
                ? 'No active accounts are on file, so this payment will carry no account. The method above is kept in the notes.'
                : 'The real account the money landed in. Leave as "No account recorded" if none applies (e.g. cash in hand).'}
          </span>
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
