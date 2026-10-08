import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { ChoiceCards, type ChoiceCardOption } from '../../../components/ui/ChoiceCards'
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
  /** `invoices.id` — the UUID of the invoice to preselect. NOT its number. */
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
   * ⚠ **`id` is the invoice's UUID (`invoices.id`), not its number** — changed
   * for MONEY-05, and the change is the whole fix. It used to be
   * `invoices.invoice_no`, and this modal resolved the payment by that number,
   * which made every invoice the application creates **unpayable**:
   *
   *  · **R-15** — *"a Draft carries no `invoice_no`. It is minted by
   *    `next_document_number('invoice')` at the moment of issue"*, and
   *    `createInvoice` omits the column entirely.
   *  · **R-02** — an invoice *"is created as **Draft** and stays Draft for the
   *    whole rental"*, issued once at return.
   *
   * So for a rental's entire life there was no number to send, and SPEC-P0-1 §5's
   * acceptance case — *"Record a 50% advance; the invoice **stays Draft**"* —
   * could not be performed at all. `recordPayment` already accepted an
   * `invoiceId`; nothing but this prop was in the way.
   *
   * `invoiceNo` travels alongside and is **display-only**: `null` on a Draft,
   * which the picker renders as "Draft (no number)" rather than as a blank
   * label. The action's own `invoiceNo` path is kept for a caller that genuinely
   * holds only a typed number and no uuid; this screen is not one.
   *
   * `booking` is still accepted so the calling screens keep compiling unchanged,
   * but it is not sent anywhere: it held a booking NUMBER and was being passed
   * as the action's `bookingId`, where the schema needs a uuid. The booking a
   * payment belongs to is read off the invoice row itself, which is the only
   * place that fact is authoritative.
   */
  invoices: Array<{
    id: string
    invoiceNo: string | null
    client: string
    amount: string
    status: string
    booking?: string
    /**
     * **R-39 fix (defaults are doctrine):** the invoice's outstanding balance
     * in RUPEES (the unit the operator types), used as the Amount field's
     * prefill while that field is untouched. Optional so a caller reading a
     * narrower source can still compile; when absent the field opens empty,
     * exactly as it always has. `undefined` is *not* Rs 0 — a caller that
     * cannot compute outstanding must omit it rather than pass 0.
     */
    outstandingRupees?: number
  }>
  /**
   * Present when the invoice list itself failed to load (the modal renders
   * the reason inline with the picker, never an empty picker in silence).
   * Pair with `onRetryInvoices`.
   */
  invoicesError?: string | null
  /** Re-runs the caller's invoice fetch — rendered as a link beside the error. */
  onRetryInvoices?: () => void
}

/**
 * How a Draft is named in the picker. A Draft genuinely has no number (R-15) and
 * an empty label would read as a rendering fault; this says which state it is.
 */
export const DRAFT_NO_NUMBER = 'Draft (no number)'

/**
 * This read "against an ISSUED invoice", which is now the wrong word. R-02 keeps
 * an invoice in Draft for the whole rental, R-14 leaves it in Draft when a
 * payment lands, and SPEC-P0-1 §5's acceptance case is a 50% advance recorded
 * against exactly that Draft. Telling an operator the form is for issued
 * invoices would send them away from the only invoice they have.
 */
const SUBTITLE = 'Register an incoming payment against an invoice — a Draft included.'

type PaymentMethod = 'Bank Transfer' | 'Cash' | 'Fonepay' | 'eSewa' | 'Khalti' | 'Card' | 'Cheque'

/*
 * The method picker, as tap cards rather than a `<select>`: every method is on
 * screen and one tap picks it (R-39). The `value` is the label `recordPayment`
 * writes to the notes (its METHOD block), so it must not change. A hint says
 * what the method is, never which account it lands in; that is the account
 * picker's job below.
 */
const PAYMENT_METHODS: readonly ChoiceCardOption<PaymentMethod>[] = [
  { value: 'Bank Transfer', label: 'Bank Transfer', hint: 'To an account', icon: 'bank' },
  { value: 'Cash', label: 'Cash', hint: 'At the desk', icon: 'cash' },
  // RULING 2026-10-08: Fonepay is a method label only, with no account default (RULINGS-2026-10-08, May briefs #1).
  { value: 'Fonepay', label: 'Fonepay', hint: 'QR scan', icon: 'qr' },
  { value: 'eSewa', label: 'eSewa', hint: 'Wallet app', icon: 'wallet' },
  { value: 'Khalti', label: 'Khalti', hint: 'Wallet app', icon: 'wallet' },
  { value: 'Card', label: 'Card', hint: 'Card machine', icon: 'card' },
  { value: 'Cheque', label: 'Cheque', hint: 'Paper cheque', icon: 'file' },
]

export function RecordPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  initialInvoiceId = '',
  initialAmount,
  invoices,
  invoicesError = null,
  onRetryInvoices,
}: RecordPaymentModalProps) {
  const { user } = useAuth()
  const isOnline = useNetwork()
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId || (invoices[0]?.id ?? ''))
  const prevInvoicesLen = useRef(invoices.length)
  useEffect(() => {
    if (prevInvoicesLen.current === 0 && invoices.length > 0 && !invoiceId) {
      setInvoiceId(initialInvoiceId || (invoices[0]?.id ?? ''))
    }
    prevInvoicesLen.current = invoices.length
  }, [invoices, initialInvoiceId, invoiceId])
  /*
   * The amount default — was Rs 50,000, invented; then 0/empty, honest but a
   * typed field the caller already knows the answer to (R-39 defect D1):
   * "a field that could be prefilled but is not is a defect."
   *
   * The outstanding balance of the selected invoice is the one figure both
   * true and useful, and it is now carried in from `listInvoices`
   * (`outstanding_amount`) by every caller. While the field is UNTOUCHED it
   * follows the selected invoice's outstanding; the moment the operator types,
   * the figure becomes theirs and invoice switches stop re-writing it.
   * A caller that genuinely has no outstanding figure omits it and the field
   * opens empty — `undefined` never means Rs 0.
   */
  const outstandingOf = (id: string) =>
    invoices.find((i) => i.id === id)?.outstandingRupees
  const [amount, setAmount] = useState<number>(
    initialAmount ?? outstandingOf(initialInvoiceId || invoices[0]?.id || '') ?? 0,
  )
  const [amountTouched, setAmountTouched] = useState(false)
  useEffect(() => {
    if (amountTouched) return
    const o = outstandingOf(invoiceId)
    if (typeof o === 'number') setAmount(o)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, invoices, amountTouched])
  useEffect(() => {
    if (isOpen) setAmountTouched(initialAmount !== undefined)
  }, [isOpen, initialAmount])
  const [method, setMethod] = useState<PaymentMethod>('Bank Transfer')
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
  /* True once the operator has exercised the account picker; the D3 default
     below never fires after that, so a deliberate "No account recorded"
     survives the account list arriving later. */
  const accountTouched = useRef(false)
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
      accountTouched.current = false
    }
  }, [isOpen])

  /*
   * R-39 D3 — the bank-account default that was missing. When the method is a
   * bank transfer and the account list has arrived, the desk's PRIMARY account
   * is the default (`listBankAccounts` sorts `is_primary` first). It fires once
   * per untampered form: a deliberate change — including deliberately picking
   * "No account recorded" — stops it re-applying.
   */
  useEffect(() => {
    if (!isOpen || method !== 'Bank Transfer' || accountTouched.current || bankAccountId) return
    if (accounts.length === 0) return
    setBankAccountId((accounts.find((a) => a.isPrimary) ?? accounts[0]!).id)
  }, [isOpen, method, accounts, bankAccountId])
  /*
   * …and its mirror: a machine-applied default is retracted when the method
   * moves off Bank Transfer (a cash receipt attached to NIC Asia Main is a
   * wrong ledger fact). The operator's OWN choice is never retracted —
   * `accountTouched` is what separates "the screen picked this" from "the
   * desk did".
   */
  useEffect(() => {
    if (method !== 'Bank Transfer' && !accountTouched.current) setBankAccountId('')
  }, [method])

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
     * The field opens with the invoice's outstanding pre-filled where a caller
     * can supply one (R-39 D1), and empty where it cannot; either way this
     * guard is the only thing standing between an untouched form and a Rs 0
     * write — it has to hold. `Number.isFinite` is not decoration: `NaN <= 0`
     * is `false`, so a non-finite amount would slip past a bare `amount <= 0`
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
       * invoice at all, so *which bill the money settled* reached nothing.
       *
       * ⚠ **`invoiceId`, not `invoiceNo`** (MONEY-05). The intermediate version
       * sent the invoice NUMBER, which is `text not null unique` and is exactly
       * what every screen used to hold — but R-15 gives a **Draft no number at
       * all**, and R-02 keeps an invoice in Draft for the whole rental, so the
       * number path could never settle an invoice this application had created.
       * `invoiceId` carries `invoices.id` from the picker, and the action reads
       * `booking_id`, `client_id` and `branch_id` off that row itself.
       *
       * `recordPayment` accepts either and requires exactly one; its `invoiceNo`
       * path stays for a caller that genuinely holds only a typed number. A
       * caller that hands this modal something that is neither — a BOOKING
       * number, as the archived `UnifiedInbox` does — still gets a named refusal
       * naming the reference that was not found, rather than money posted against
       * nothing. Whether a payment may be taken before an invoice exists is
       * unruled and is not ruled here.
       *
       * The note the operator types for the receipt is written to
       * `payments.notes`; `clientUuid` is Law 8's key for THIS attempt; and
       * `isOnline` is what `lib/rbac`'s money rules degrade on.
       */
      await recordPayment(
        {
          invoiceId,
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
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to record payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Payment"
      subtitle={SUBTITLE}
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

        {invoicesError && invoices.length === 0 && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
            }}
          >
            The open invoices could not be loaded ({invoicesError}).{' '}
            {onRetryInvoices && (
              <button
                type="button"
                onClick={onRetryInvoices}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  minHeight: 'var(--tap)',
                  color: 'inherit',
                  font: 'inherit',
                  fontWeight: 700,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="rpm-invoice" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Select Invoice <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <select
            id="rpm-invoice"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            style={{
              minHeight: 'var(--tap)',
              padding: '0 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {/* The NUMBER is the label and the UUID is the value. A Draft has
                no number (R-15), so it is named for the state it is in rather
                than rendered with an empty label — an operator has to be able to
                tell "this invoice has not been issued yet" from "this row failed
                to render". */}
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNo ?? DRAFT_NO_NUMBER} — {inv.client} ({inv.amount})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="rpm-amount" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Amount (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            id="rpm-amount"
            type="number"
            inputMode="numeric"
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
              // The field is now the operator's, not the invoice's — a
              // picker switch must not overwrite a figure they typed.
              setAmountTouched(true)
            }}
            style={{
              minHeight: 'var(--tap)',
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

        <ChoiceCards<PaymentMethod>
          legend="Payment Method"
          name="rpm-method"
          options={PAYMENT_METHODS}
          value={method}
          onChange={setMethod}
          required
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="rpm-account" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Deposit To Account
          </label>
          {/*
            `bank_accounts` picker — writes `payments.bank_account_id`, which is
            what the Payments list's Method column and the Finance dashboard's
            method breakdown read (`bank_accounts.channel_group` through the
            embed). Optional: "No account recorded" is the honest row for cash
            in hand or a desk with no accounts entered, and it is DIFFERENT
            from the method label above — a label is the operator's word, this
            is the ledger fact. Law 15's 44px floor now applies to every field
             in this modal (`minHeight: var(--tap)`).
          */}
          <select
            id="rpm-account"
            value={bankAccountId}
            onChange={(e) => {
              accountTouched.current = true
              setBankAccountId(e.target.value)
            }}
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
          <label htmlFor="rpm-reference" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Transaction Reference / Txn ID
          </label>
          <input
            id="rpm-reference"
            type="text"
            placeholder="e.g. TXN-9948123 or Bank Ref #881"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            style={{
              minHeight: 'var(--tap)',
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
          <label htmlFor="rpm-notes" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Notes (Optional)</label>
          <textarea
            id="rpm-notes"
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
