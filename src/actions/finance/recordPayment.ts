import { createAction, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { toRupees, type Paisa } from '../../lib/money'

/**
 * # RECORD_PAYMENT — the first action in this tree that actually writes
 *
 * ## What this replaced
 *
 * ```ts
 * const paymentId = issue('PAY', Number(Date.now().toString().slice(-4)))
 * console.log(`[DB TX] Recorded payment ${paymentId}: ${input.amountPaisa / 100} NPR …`)
 * return { result: { success: true, paymentId }, events }
 * ```
 *
 * A `console.log`, a minted-from-the-clock reference number, and
 * `success: true`. Nothing reached Postgres. The dispatcher's `implemented`
 * default (false) is the only reason the screen was not showing that success
 * to an operator today — see `actions/core.ts`. This file is now the write.
 *
 * ## The five schema facts this body is built on
 *
 * Verified against `supabase/migrations/0006_finance.sql:176-199` **and** the
 * live project's `information_schema` (12 Aug 2026), because the two can drift:
 *
 * 1. `payments.booking_id`, `client_id`, `branch_id` are all `uuid NOT NULL`.
 *    The caller has none of them — a screen holds an invoice NUMBER. They are
 *    read off the invoice here, in one round trip, rather than guessed.
 * 2. `payments.amount` is `numeric(14,2)` in **RUPEES**; `lib/money` is integer
 *    **paisa**. `toRupees()` converts once, at this boundary, exactly as
 *    `queries/finance.ts:1347` does for `expenses.amount`. Getting the
 *    direction wrong writes a figure 100× off that still looks plausible.
 * 3. `payment_no` is `text not null unique`. `next_document_number('payment')`
 *    (`0007_admin_security.sql:359`) is the ONLY allocator — it takes
 *    `for update` on `number_sequences`, so two operators submitting in the
 *    same instant cannot be handed the same number. `PAY-${Date.now()}` was not
 *    merely ugly, it was a collision waiting on the unique constraint.
 * 4. `payment_type` may never be `'Security Deposit'` — table CHECK
 *    `payments_no_security_deposit` (0006:198), Law 5. Deposits are
 *    `security_deposits` + `deposit_movements`, a different liability account.
 * 5. **Law 4 — the row is immutable the instant it lands.** `safeUpdate`
 *    refuses `payments` at `lib/dataAccess.ts:102-105`, and the database backs
 *    that with `trg_payments_reject_update` / `trg_payments_reject_delete`
 *    (0046), which are live on the project. A correction is a
 *    `payment_reversals` row referencing this payment — never an edit, and
 *    there is deliberately no update path anywhere in this file.
 *
 * ## What this action does NOT compute — Law 1
 *
 * The invoice's `paid_amount`, `outstanding_amount` and `status` are moved by
 * `sync_payment_to_invoice()` (`0010_triggers_functions.sql:245-283`), an
 * `after insert on payments` trigger that re-sums every `'Received'` payment
 * for the invoice. This body must not recompute any of them: two places
 * computing the same money is exactly what Law 1 forbids, and the trigger is
 * the one that runs inside the same transaction as the insert.
 *
 * The audit row is likewise not written here — `trg_audit_payments`
 * (`0010:116`) fires `log_audit_event()` on the same insert.
 */

/**
 * Everything the operator typed, plus the two keys the write needs.
 *
 * ### Why `invoiceNo` and not `bookingId`
 *
 * The previous input was `{ bookingId?: string; amountPaisa; paymentMethod?;
 * reference? }` and every field of it was a problem:
 *
 *  - `bookingId` was **optional** while `payments.booking_id` is `NOT NULL`, so
 *    the type permitted an input the table cannot accept.
 *  - Both live call sites passed a booking *number* (`B-715`) into it —
 *    `Finance.tsx` and `Payments.tsx` map `booking: r.bookingNo`, and both
 *    carry a `TODO(decision)` saying so. A display number in a field named
 *    `bookingId` is the fabrication this rewrite exists to remove.
 *  - There was no `invoiceId` at all, so *which bill the money settles* — the
 *    single most important fact about a payment — reached nothing, and
 *    `sync_payment_to_invoice()` had no invoice to move.
 *
 * `invoice_no` is `text not null unique` (0006:76, :195) and is precisely what
 * every screen already holds, so it is the natural key this action resolves.
 * The uuids are then read off the invoice row rather than travelling through a
 * modal that has no way to know them.
 */
export type RecordPaymentInput = {
  /**
   * `invoices.invoice_no` — e.g. `INV-2026-0001`. NOT the invoice's uuid and
   * NOT a booking number: a caller that passes `B-715` gets a named refusal,
   * not a payment posted against nothing.
   */
  invoiceNo: string
  /** Integer paisa, from `lib/money`'s `rupees()`. Converted to rupees once, below. */
  amountPaisa: Paisa | number
  /**
   * What the operator selected in the modal's picker. **TODO(decision): this
   * has no column of its own.** See `METHOD` below before assuming it is stored
   * as structured data.
   */
  paymentMethod?: string | undefined
  /** Bank ref / txn id → `payments.transaction_ref` (nullable text). */
  reference?: string | undefined
  /** The operator's free text → `payments.notes` (nullable text). */
  notes?: string | undefined
  /**
   * **Law 8.** Minted once at the point the user acted (`newClientUuid()` in
   * `lib/supabase`) and reused across every retry of that one action, so a
   * double-submitted Record Payment conflicts on `payments_client_uuid_key`
   * and returns the first row instead of taking the money twice.
   *
   * Required, not optional. `idempotentInsert` would happily mint a fresh key
   * per call, which is silent double-charging — the one failure mode Law 8
   * exists for. A caller with no key is a bug, so the type refuses it.
   */
  clientUuid: string
}

export type RecordPaymentResult = {
  /** `payments.id` — the row's uuid, generated by Postgres. Never a client-side string. */
  paymentId: string
  /** `payments.payment_no` — allocated by `next_document_number('payment')`. */
  paymentNo: string
  invoiceId: string
  bookingId: string
  clientId: string
  /** Echoed back in paisa, so a caller never re-derives it from the rupee column. */
  amountPaisa: number
}

/* ── METHOD · the one field with nowhere to go ────────────────────────────
 *
 * `RecordPaymentModal` offers Bank Transfer / Cash / eSewa / Khalti / Card /
 * Cheque. `payments` has no method column. The nearest thing is
 * `bank_account_id` → `bank_accounts.channel_group`
 * ('Digital wallets' | 'Bank' | 'Cash' | 'Cards' | 'Other', 0001:1028), which
 * names a REAL ACCOUNT the money landed in — the live project has two
 * (`Nabil Bank Ltd.` and `eSewa Digital Wallet`, seeded by 0012).
 *
 * Mapping six UI labels onto those rows would be attributing money to an
 * account nobody chose: 'Cash', 'Card' and 'Cheque' have no account at all,
 * and picking one by `channel_group` would silently credit the bank account
 * for a cash payment. That is a product decision (which accounts exist, and
 * which the desk uses), so `bank_account_id` is left NULL and the method is
 * written into `notes` under an explicit `Method:` label instead.
 *
 * That is lossy and it is stated rather than hidden — it keeps a fact the
 * operator entered instead of discarding it, but it is text, not structure, so
 * the Finance dashboard's method breakdown (which reads `channel_group`, see
 * `queries/finance.ts:640-650`) still cannot see it.
 *
 * TODO(decision): replace the modal's hardcoded method list with a picker over
 * `bank_accounts`, and write the chosen account's id. That is the shape the
 * schema was built for; it needs a ruling on which accounts the desk offers.
 */

/** The four uuids `payments` needs, read off the invoice being settled. */
type PaymentTarget = {
  invoiceId: string
  bookingId: string
  clientId: string
  branchId: string
}

/**
 * Resolve an invoice number to the FK set a payment row requires.
 *
 * ⚠ **Why this read is here and not in `lib/queries/finance.ts`.** That module
 * owns invoice reads (Law 2's Single Query Rule) and is the correct long-term
 * home. It is outside this task's assigned file list, and another session is
 * live-editing this repo, so adding an export to it would be an edit that
 * session is not expecting — the same trade `queries/finance.ts:1455-1471`
 * records for its own duplicated day-boundary helpers. This is a four-column,
 * single-row lookup with no filters and no money conversion, so nothing about
 * the finance module's masking contract is being re-implemented.
 * TODO(refactor): hoist to `queries/finance.ts` as `invoiceTargetByNo()`.
 *
 * `branch_id` is the reason a lookup is unavoidable even if a screen did carry
 * uuids: `payments.branch_id` is NOT NULL, `InvoiceListRow` does not carry it,
 * and `AuthUser` has no branch either — the invoice is the only place it is.
 */
async function resolvePaymentTarget(invoiceNo: string): Promise<PaymentTarget> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, booking_id, client_id, branch_id, invoice_no, voided_at')
    .eq('invoice_no', invoiceNo)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not look up invoice ${invoiceNo}, so nothing was recorded: ${error.message}`)
  }
  if (!data) {
    // Reached by BookingDetail and UnifiedInbox, which hand this modal a
    // BOOKING number as the record id (their own TODO(decision): whether a
    // payment may be taken before an invoice exists is unruled). Saying which
    // number was not found is what makes that diagnosable instead of "failed".
    throw new Error(
      `No invoice numbered ${invoiceNo} exists, so this payment has nothing to settle and nothing was recorded.`,
    )
  }

  const row = data as unknown as {
    id: string
    booking_id: string
    client_id: string
    branch_id: string
    invoice_no: string
    voided_at: string | null
  }

  /*
   * A voided invoice is settled against a credit note, not against new money
   * (Law 3 — `invoices_void_requires_reason`, 0006:124-127). And the refusal is
   * not merely tidy: `sync_payment_to_invoice()` recomputes `status` from the
   * paid total with no reference to `voided_at`, so a payment landing here
   * would silently rewrite a voided invoice to 'Partially Paid' — un-voiding it
   * from a screen that never offered that action. Fail closed.
   */
  if (row.voided_at !== null) {
    throw new Error(
      `Invoice ${row.invoice_no} was voided on ${row.voided_at}. A voided invoice is settled by its credit note, ` +
        `not by a new payment — nothing was recorded.`,
    )
  }

  return {
    invoiceId: row.id,
    bookingId: row.booking_id,
    clientId: row.client_id,
    branchId: row.branch_id,
  }
}

/** `payments.notes` — the operator's text, with the method labelled above it. See METHOD. */
function composeNotes(method: string | undefined, notes: string | undefined): string | null {
  const lines: string[] = []
  const trimmedMethod = method?.trim()
  const trimmedNotes = notes?.trim()
  if (trimmedMethod) lines.push(`Method: ${trimmedMethod}`)
  if (trimmedNotes) lines.push(trimmedNotes)
  return lines.length > 0 ? lines.join('\n') : null
}

export const recordPayment = createAction<RecordPaymentInput, RecordPaymentResult>({
  name: 'RECORD_PAYMENT',
  permissions: ['payment.create'],

  /**
   * `true` because `execute` below inserts into `payments` through
   * `lib/dataAccess`'s `idempotentInsert` and then **verifies the row came back
   * from Postgres** before returning. See the PERSISTENCE CHECK block.
   */
  implemented: true,

  validate: (input) => {
    if (!input.invoiceNo || input.invoiceNo.trim() === '') {
      throw new Error('A payment must name the invoice it settles.')
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      // Law 8. Not defaulted here: a generated-at-send-time key gives a
      // replayed submit a DIFFERENT key, which is precisely how one payment
      // becomes two rows.
      throw new Error('This payment carries no idempotency key, so a retry could record it twice. Nothing was sent.')
    }
    // `Number.isFinite` first: `NaN <= 0` is false, so a bare `<= 0` lets NaN
    // through to `toRupees`, which yields NaN and a 400 the operator cannot read.
    if (!Number.isFinite(input.amountPaisa) || input.amountPaisa <= 0) {
      throw new Error('Payment amount must be greater than zero.')
    }
    // `payments.amount` is numeric(14,2) — two decimal places, i.e. whole
    // paisa. A fractional paisa would be silently rounded by Postgres.
    if (!Number.isInteger(input.amountPaisa)) {
      throw new Error('Payment amount must be a whole number of paisa.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /*
     * OFFLINE — refused here as well as in rbac, and the duplication is the point.
     *
     * `rbac.canRecordPayment(role, online)` returns false offline, but the
     * dispatcher reads `ctx.isOnline ?? true`, so a caller that omits the flag
     * is treated as online. If such a call reached `idempotentInsert` while the
     * device was offline, `lib/dataAccess.ts:39-43` would queue the mutation and
     * return `{ data: finalPayload, error: null }` — an optimistic response that
     * this action would hand back as a recorded payment. That is the exact
     * "success for a write that did not happen" the dispatcher was built to kill,
     * and it would be re-created one layer down. A payment is refused offline.
     */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. A payment is not queued for later — it is refused, ' +
          'because a receipt for money the ledger has not recorded is worse than no receipt. Record it when you are back online.',
      )
    }

    const target = await resolvePaymentTarget(input.invoiceNo.trim())

    /*
     * `payment_no` from the database's allocator, never from the clock.
     *
     * ⚠ A retry re-enters this RPC BEFORE the insert, so a replay that then
     * conflicts on `client_uuid` has burned a sequence value and writes no row.
     * Gaps in `payment_no` are therefore possible and are not a defect — the
     * same caveat `queries/finance.ts:1323-1328` states for `expense_no`. An
     * allocator that could hand back an unused number would have to hold the
     * transaction open across the round trip.
     */
    const { data: paymentNo, error: numberError } = await supabase.rpc('next_document_number', {
      p_sequence_key: 'payment',
    })

    if (numberError) {
      throw new Error(`Could not allocate a payment number, so nothing was recorded: ${numberError.message}`)
    }
    if (!paymentNo) {
      throw new Error('next_document_number returned no payment number, so nothing was recorded.')
    }

    const result = await idempotentInsert('payments', {
      client_uuid: input.clientUuid,
      payment_no: paymentNo as string,
      booking_id: target.bookingId,
      invoice_id: target.invoiceId,
      client_id: target.clientId,
      branch_id: target.branchId,
      // Paisa → rupees. The ONE conversion in this file. See fact 2 in the header.
      amount: toRupees(input.amountPaisa as Paisa),
      // Law 5 restated as code: the only incoming type this table accepts. A
      // deposit is `deposit_movements`, and the table CHECK enforces it anyway.
      payment_type: 'Advance Payment',
      // `sync_payment_to_invoice()` sums only `'Received'` rows, so a payment
      // written in any other status would not move the invoice.
      status: 'Received',
      // `payment_date` and `created_at` are deliberately omitted: both default
      // to `now()` on the server. Law 7 — AD stored UTC, and the database's
      // clock is the one that cannot be skewed by an operator's device.
      // `bank_account_id` omitted — see METHOD above.
      transaction_ref: input.reference?.trim() || null,
      notes: composeNotes(input.paymentMethod, input.notes),
      received_by: ctx.userId,
    })

    /* ── PERSISTENCE CHECK · why the result is inspected rather than trusted ──
     *
     * `idempotentInsert` reports failure by THROWING, and returns
     * `{ data, error: null }` on success — but it has two branches that return
     * successfully without having written anything: the offline queue
     * (`dataAccess.ts:39-43`, guarded above) and the `'Failed to fetch'`/408
     * network branch (`:49-53`), which can fire even when `navigator.onLine` is
     * true. Both return the payload that was SENT, which has no `id` — the
     * `id` column is `default gen_random_uuid()` and only Postgres fills it.
     *
     * A third branch (`:56-58`, the Law 8 duplicate replay) returns the RAW
     * PostgREST result, so unlike every other path its `error` can be non-null.
     *
     * So the row is only real if `error` is null AND `id` came back. Anything
     * else is reported as a failure, because a caller of this action treats a
     * resolved promise as "the money is in the ledger".
     */
    const persisted = result.data as { id?: string; payment_no?: string } | null
    if (result.error) {
      throw new Error(
        `The payment could not be confirmed against the ledger, so treat it as not recorded: ${
          (result.error as { message?: string }).message ?? String(result.error)
        }`,
      )
    }
    if (!persisted || typeof persisted.id !== 'string') {
      throw new Error(
        'The payment was queued rather than written — the ledger has not confirmed it, so do not issue a receipt. ' +
          'Check the connection and record it again.',
      )
    }

    const events = [
      {
        type: EVENT_TYPES.PAYMENT_RECORDED,
        payload: {
          paymentId: persisted.id,
          paymentNo: persisted.payment_no ?? paymentNo,
          invoiceId: target.invoiceId,
          bookingId: target.bookingId,
          clientId: target.clientId,
          amountPaisa: input.amountPaisa,
          paymentMethod: input.paymentMethod ?? null,
          reference: input.reference ?? null,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        paymentId: persisted.id,
        paymentNo: (persisted.payment_no ?? paymentNo) as string,
        invoiceId: target.invoiceId,
        bookingId: target.bookingId,
        clientId: target.clientId,
        amountPaisa: input.amountPaisa,
      },
      events,
    }
  },
})
