import { createAction, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { applyBookingTransition } from '../../lib/bookingTransition'
import { supabase } from '../../lib/supabase'
import { getSetting } from '../../lib/settingsStore'
import type { CloseGateInput } from '../../lib/workflow'
import type { SystemRole } from '../../types/database'

/**
 * # CLOSE_RENTAL — SPEC-P0-2 §4, the sixth stage and the only terminal one
 *
 * ## What this replaced
 *
 * Nothing. There was no Close verb anywhere in the application, so `Returned`
 * was terminal in practice and the canonical six-stage lifecycle could never
 * complete: `bookings.closed_at` was never set by the app, deposits were never
 * resolved, and `Closed` was reachable only by seed. That is audit P0-2.
 *
 * ## Smaller than the audit made it sound
 *
 * SPEC-P0-2 §1 is right that the database is further along than "schema ready":
 * `Closed` is in the `booking_stage` enum, `validate_booking_gates` already has
 * a `Closed` branch enforcing **outstanding = 0** and **deposit resolved**
 * server-side, and `next_booking_stage('Returned')` is already `'Closed'`. What
 * was missing is this verb.
 *
 * ## Two gate evaluations, deliberately
 *
 * The four §1.7 gates are checked **twice**, and that is not redundancy:
 *
 *  1. Here, against live reads, so the operator gets a specific refusal naming
 *     the blocking amount before anything is written (Law 12 — inline and
 *     specific, never a toast). `planTransition` refuses outright if `gates` is
 *     omitted for a Closed transition, so this is also mandatory.
 *  2. In `validate_booking_gates` on the row, which is the one that cannot be
 *     talked past by a stale read, an offline replay or a script.
 *
 * ⚠ **The server-side half is still wrong, and this file can no longer fix
 * that.** Read live on 7 Sep 2026 with `pg_get_functiondef`, the deployed
 * `validate_booking_gates` has exactly two branches in its `Closed` arm:
 * `coalesce(sum(outstanding_amount), 0)` over non-Void invoices, and
 * `coalesce(pending_amount, 0)` from `security_deposits`. So on the database:
 *
 *  - **MONEY-13 stands** — the sum is over zero rows for an un-invoiced rental.
 *  - **RL-05 stands** — `pending_amount` means *not yet collected*.
 *  - **RL-06 has no branch at all** — no damage gate, and no case gate either.
 *
 * The corrections below therefore live in ONE of the two layers. Anything that
 * writes `bookings.stage` without going through this action — a script, an
 * offline replay, a direct PostgREST call (audit DB-02, SEC-06) — still closes
 * past all three. Migration `0084_close_gates_complete` is the other half and
 * is **not written**; PHASE-0 Step 0 gates every migration and has not run.
 *
 * ## R-07 · a hard block, and never automatic
 *
 * The Close gate stays a hard block. The *verb* is manual and the *prompt* is
 * automatic: Booking Detail surfaces "Ready to close" when all four pass. The
 * 28 Jul note about auto-closing when an invoice is marked Paid is superseded —
 * auto-firing would close rentals carrying an open case or an unapproved damage
 * charge, because those two gates sit outside the invoice entirely.
 *
 * ## Zero-Value Close Override — PLAN.md / OPEN_DECISIONS.md §4.51
 *
 * Migration 0135 implements MONEY-13's recommended pairing: the "must be invoiced"
 * predicate is paired with an **Owner/Admin override carrying a reason to `audit_events`**,
 * for genuine zero-value jobs (a goodwill loan, an internal shoot, a booking billed on
 * another company's paperwork).
 *
 *  - Gated on `Owner | Admin` only (general staff cannot waive the close gate).
 *  - Refused if the reason is absent or below 10 characters.
 *  - Enforced server-side in `apply_booking_stage_transition()` which logs a `'CloseOverride'`
 *    event into `audit_events` with the actor, reason, and gate snapshot.
 *  - App-side evaluates `CloseGateInput.isZeroValueOverride` in `workflow.ts:closeGates()`.
 *  - All other close gates (unsettled invoices if any exist, deposit unresolved, open cases,
 *    pending damage findings) still strictly block closure.
 */

export type CloseRentalInput = {
  /** The booking to close, by its number. */
  bookingNo: string
  /**
   * **Law 8.** Minted where the operator confirmed, and carried through every
   * retry — `booking_stage_transitions` has `unique (client_uuid)` whose own
   * comment is exactly this case: a double-submitted Close may not advance two
   * stages.
   */
  clientUuid: string
  /** Optional free text onto the transition row and the audit event. */
  reason?: string
  /**
   * **OPEN_DECISIONS.md §4.51 — Zero-Value Close Override.**
   * For genuine zero-value / sponsored / goodwill jobs where no invoice is issued.
   * Gated on `Owner | Admin` and requires a mandatory reason of at least 10 characters.
   */
  override?: {
    reason: string
  }
  /**
   * RULING 2026-10-06 (migration 0155) — close with the deposit unresolved, on a
   * written reason. Manager and above; offered only while Settings ▸ Financial ▸
   * Deposit rules allows it. Moves no money (Law 5): the deposit stays held and
   * the skip is audited with the amounts. The database enforces role and reason.
   */
  depositSkip?: {
    reason: string
  }
}

export type CloseRentalResult = {
  bookingId: string
  bookingNo: string
  /** Always `'Closed'` when this resolves. */
  stage: 'Closed'
  /**
   * What the four §1.7 gates were reading at the moment of the close, so a
   * caller can render what was true — including `rentalInvoiced`, which is the
   * fact that separates "paid in full" from "never billed" (MONEY-13).
   */
  gates: CloseGateInput
}

/**
 * `case_status` values that count as still open. The live enum is
 * `Open | Under Review | Awaiting Decision | In Progress | Resolved | Closed |
 * Cancelled` — the first four are open, the last three are not.
 */
const OPEN_CASE_STATES = ['Open', 'Under Review', 'Awaiting Decision', 'In Progress']

/**
 * The one `damage_approval_state` that is not yet a charge. The live enum is
 * `Pending Approval | Approved` — two members, so "not approved" and "pending"
 * are the same set today, and naming the member rather than negating `Approved`
 * keeps that true if a third (`Rejected`, say) is ever added.
 */
const DAMAGE_PENDING_APPROVAL = 'Pending Approval'

/**
 * Invoice statuses that mean **no bill has been issued**. The live
 * `invoice_status` enum is `Draft | Sent | Partially Paid | Paid | Overdue |
 * Void`; R-02 keeps an invoice in `Draft` for the whole rental and issues it
 * once, at return, so `Draft` is a working figure and not a bill. `Void` is
 * already excluded from the read below because a voided invoice carries no
 * balance (R-04 settles it by credit note).
 */
const UNISSUED_INVOICE_STATUSES = ['Draft', 'Void']

type BookingRow = {
  id: string
  booking_no: string
  branch_id: string
  stage: string
  closed_at: string | null
  cancelled_at: string | null
}

/** Rupees (numeric, which postgrest-js may hand back as a string) → paisa. */
const paisa = (v: number | string | null | undefined): number => Math.round(Number(v ?? 0) * 100)

/** The `id` column off a `select('id')`, which postgrest-js hands back untyped. */
const idsOf = (rows: unknown[] | null): string[] =>
  ((rows ?? []) as Array<{ id: string }>).map((row) => row.id)

/**
 * Read the four §1.7 gates for one booking, from the tables that own them.
 *
 * Separate reads rather than one embed: each gate lives on a different table,
 * and a failed embed surfaces as a null column rather than an error — which
 * would read as "gate passes". A gate that passes because its read broke is the
 * one failure mode this function must not have, so each read is separate and
 * each failure throws with the table named.
 */
async function readCloseGates(bookingId: string, bookingNo: string): Promise<CloseGateInput> {
  /*
   * ── Gate 1 · MONEY-13 ────────────────────────────────────────────────────
   *
   * `status` is selected and USED now. It used to be selected and ignored,
   * which is how "outstanding = 0" came to mean two different things: an
   * invoice paid in full, and a booking nobody ever billed. R-01 makes
   * invoicing manual and R-02 issues it at return, so the second case is
   * ordinary rather than exotic — on the live project today there are 246
   * bookings and 0 invoices, and every one of the 130 already at `Returned`
   * would pass this gate on an empty sum.
   */
  const { data: invoiceRows, error: invoiceError } = await supabase
    .from('invoices')
    .select('outstanding_amount, status')
    .eq('booking_id', bookingId)
    .neq('status', 'Void')

  if (invoiceError) {
    throw new Error(
      `Could not read the invoices for ${bookingNo}, so whether it is settled is unknown and it was not closed: ` +
        invoiceError.message,
    )
  }

  const invoices = (invoiceRows ?? []) as unknown as Array<{ outstanding_amount: number | string; status: string }>

  /* Outstanding still counts a Draft's balance — a working figure someone has
     to settle or void is not nothing. What a Draft cannot do is stand in for a
     bill having been raised. */
  const rentalOutstandingPaisa = invoices.reduce((sum, row) => sum + paisa(row.outstanding_amount), 0)
  const rentalInvoiced = invoices.some((row) => !UNISSUED_INVOICE_STATUSES.includes(row.status))

  /*
   * ── Gate 2 · RL-05 ───────────────────────────────────────────────────────
   *
   * Law 5 — the deposit is the client's money, a liability held separately from
   * the rental total. "Resolved" is Foundation §1.7's word and it means
   * *returned*: refunded, forfeited or applied.
   *
   * This used to read `pending_amount`, which `sync_deposit_balances` derives
   * as `greatest(required − received, 0)` — what the client still OWES US.
   * A deposit collected in full and never given back read as `0` there, so
   * Close passed and Rs 25,000–50,000 of somebody else's money stayed with
   * Cine Sewa with no step left in the lifecycle that would return it. The
   * three columns below are the ones `sync_deposit_balances` actually
   * maintains from `deposit_movements` (`Received` / `Released` / `Applied`).
   *
   * A booking with no deposit row required no deposit: Σ over zero rows is 0,
   * and here that genuinely means nothing is held.
   */
  const { data: depositRows, error: depositError } = await supabase
    .from('security_deposits')
    .select('received_amount, refunded_amount, applied_amount')
    .eq('booking_id', bookingId)

  if (depositError) {
    throw new Error(
      `Could not read the deposit for ${bookingNo}, so whether it is resolved is unknown and it was not closed: ` +
        depositError.message,
    )
  }

  const depositHeldPaisa = (
    (depositRows ?? []) as unknown as Array<{
      received_amount: number | string
      refunded_amount: number | string
      applied_amount: number | string
    }>
  ).reduce(
    (sum, row) => sum + paisa(row.received_amount) - paisa(row.refunded_amount) - paisa(row.applied_amount),
    0,
  )

  /* ── Gate 3 · the open case ─────────────────────────────────────────────── */
  const { data: caseRows, error: caseError } = await supabase
    .from('cases')
    .select('id, status')
    .eq('linked_booking_id', bookingId)
    .in('status', OPEN_CASE_STATES)

  if (caseError) {
    throw new Error(
      `Could not read the cases for ${bookingNo}, so whether any is open is unknown and it was not closed: ` +
        caseError.message,
    )
  }

  /*
   * ── Gate 4 · RL-06 ───────────────────────────────────────────────────────
   *
   * This was the literal `0` with a comment explaining that no query could
   * return a real number. Both halves of that explanation are now false:
   * `floorVerb` inserts `damage_findings` from Return (`writeDamageFindings`,
   * `source = 'Return inspection'`) and from Reset (`source = 'Cleaning'`) —
   * both landed in `e6c306e`, on the same day as this file's own `58846c3` —
   * and a booking path exists through each of the two parents that
   * `damage_findings_exactly_one_parent` allows:
   * `return_lines.session_id → operation_sessions.booking_id`, and
   * `cleaning_queue_entries.booking_id` directly.
   *
   * Read parent-first rather than as one `or()` over an embed: an embed that
   * fails to resolve returns nulls rather than an error, and this is the gate
   * that must never pass because its read broke. Every step names its table on
   * failure, and a booking with no sessions and no cleaning entries skips
   * straight to zero without asking `damage_findings` about an empty list.
   *
   * ⚠ Still invisible to this gate: damage recorded against a **quantity**
   * line, which RT-02 leaves in the session notes with no `damage_findings`
   * row to count. On live that is every line — all 204 products are
   * quantity-tracked (audit INV-02) — so this gate is armed but unreachable
   * there until a finding can parent to something other than a `product_units`
   * row. Filed, not papered over.
   */
  const { data: sessionRows, error: sessionError } = await supabase
    .from('operation_sessions')
    .select('id')
    .eq('booking_id', bookingId)

  if (sessionError) {
    throw new Error(
      `Could not read the operation sessions for ${bookingNo}, so whether any damage finding is awaiting approval ` +
        `is unknown and it was not closed: ${sessionError.message}`,
    )
  }

  const sessionIds = idsOf(sessionRows)
  let returnLineIds: string[] = []

  if (sessionIds.length > 0) {
    const { data: returnLineRows, error: returnLineError } = await supabase
      .from('return_lines')
      .select('id')
      .in('session_id', sessionIds)

    if (returnLineError) {
      throw new Error(
        `Could not read the return lines for ${bookingNo}, so whether any damage finding is awaiting approval is ` +
          `unknown and it was not closed: ${returnLineError.message}`,
      )
    }
    returnLineIds = idsOf(returnLineRows)
  }

  const { data: cleaningRows, error: cleaningError } = await supabase
    .from('cleaning_queue_entries')
    .select('id')
    .eq('booking_id', bookingId)

  if (cleaningError) {
    throw new Error(
      `Could not read the cleaning queue for ${bookingNo}, so whether any damage finding is awaiting approval is ` +
        `unknown and it was not closed: ${cleaningError.message}`,
    )
  }

  /**
   * Findings awaiting approval under one parent column. `exactly_one_parent`
   * means a finding hangs off `return_line_id` or `cleaning_queue_entry_id` but
   * never both, so the two counts add without double-counting.
   */
  const countPending = async (parentColumn: string, parentIds: readonly string[]): Promise<number> => {
    if (parentIds.length === 0) return 0

    const { data, error } = await supabase
      .from('damage_findings')
      .select('id')
      .in(parentColumn, parentIds)
      .eq('approval_state', DAMAGE_PENDING_APPROVAL)
      .is('voided_at', null)

    if (error) {
      throw new Error(
        `Could not read the damage findings for ${bookingNo}, so whether a charge is awaiting approval is unknown ` +
          `and it was not closed: ${error.message}`,
      )
    }
    return (data ?? []).length
  }

  const damageChargesPendingApproval =
    (await countPending('return_line_id', returnLineIds)) +
    (await countPending('cleaning_queue_entry_id', idsOf(cleaningRows)))

  return {
    rentalInvoiced,
    rentalOutstandingPaisa,
    depositHeldPaisa,
    openCases: (caseRows ?? []).length,
    damageChargesPendingApproval,
  }
}

export const closeRental = createAction<CloseRentalInput, CloseRentalResult>({
  name: 'CLOSE_RENTAL',
  permissions: ['rental.close'],

  /**
   * `true` because `execute` writes a real `booking_stage_transitions` row
   * through `applyBookingTransition`, and then **reads the stage back** to
   * confirm the trigger actually moved it — the guard `confirmRental` has and
   * `floorVerb` still lacks (audit RL-08).
   */
  implemented: true,

  validate: (input) => {
    if (!input.bookingNo || input.bookingNo.trim() === '') {
      throw new Error('Closing a rental must name the booking.')
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      // Law 8. Not defaulted: a key minted at send time gives a replayed submit
      // a different key, and `booking_stage_transitions` exists to refuse that.
      throw new Error('This close carries no idempotency key, so a retry could advance two stages. Nothing was sent.')
    }
    if (input.depositSkip !== undefined && input.depositSkip.reason.trim().length < 10) {
      throw new Error('Closing without settling the deposit needs a written reason of at least 10 characters. Nothing was sent.')
    }
    if (input.override !== undefined) {
      if (!input.override.reason || input.override.reason.trim().length < 10) {
        throw new Error(
          'A zero-value close override requires an audit reason of at least 10 characters. Nothing was sent.',
        )
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /*
     * OFFLINE — refused. Closing evaluates live money and live findings; a
     * queued close would be checked against a stage, a balance and an approval
     * state that may be hours old by the time it drains. `confirmRental`
     * refuses offline for the same reason and says so in the same words.
     */
    if (ctx.isOnline === false) {
      throw new Error(
        'Closing a rental needs a connection — the close gates are read from live invoices, deposits, cases and ' +
          'damage findings. Nothing was closed.',
      )
    }

    const isOverride = input.override !== undefined
    if (isOverride && ctx.role !== 'Owner' && ctx.role !== 'Admin') {
      throw new Error(
        `A zero-value close override is restricted to Owner and Admin (called by ${ctx.role}). Nothing was closed.`,
      )
    }

    const isDepositSkip = input.depositSkip !== undefined
    if (isDepositSkip && !['Owner', 'Admin', 'Manager'].includes(String(ctx.role))) {
      throw new Error(
        `Closing without settling the deposit is restricted to Manager and above (called by ${ctx.role}). Nothing was closed.`,
      )
    }
    if (isDepositSkip && getSetting('allowDepositSkipOnClose') !== 'On') {
      throw new Error(
        'Closing without settling the deposit is switched off in Settings ▸ Financial ▸ Deposit rules. Nothing was closed.',
      )
    }

    const bookingNo = input.bookingNo.trim()

    const { data, error } = await supabase
      .from('bookings')
      .select('id, booking_no, branch_id, stage, closed_at, cancelled_at')
      .eq('booking_no', bookingNo)
      .maybeSingle()

    if (error) {
      throw new Error(`Could not look up booking ${bookingNo}, so nothing was closed: ${error.message}`)
    }
    if (!data) {
      throw new Error(`No booking numbered ${bookingNo} exists, so there is nothing to close.`)
    }

    const booking = data as unknown as BookingRow

    if (booking.closed_at !== null) {
      // R-09 makes reopen a separate, Owner/Admin-only act with its own reason.
      throw new Error(
        `${bookingNo} was already closed on ${booking.closed_at}. Reopening is a separate action, restricted to ` +
          'Owner and Admin and requiring a reason.',
      )
    }
    if (booking.cancelled_at !== null) {
      // §1.3 keeps Cancelled orthogonal to the six, and whether a cancelled
      // booking may still be walked to Closed for settlement is UNRULED
      // (PLAN.md §4.16). Refusing is the honest reading of an open question.
      throw new Error(
        `${bookingNo} was cancelled on ${booking.cancelled_at}. Whether a cancelled booking is still walked to ` +
          'Closed for settlement is an open ruling (PLAN.md §4.16), so nothing was closed.',
      )
    }
    /*
     * SPEC-P0-2 §4 — the precondition is `Returned`. Checked here so the
     * operator is told which stage the booking is actually in; the engine's
     * forward-only rule would refuse it too, but less legibly.
     */
    if (booking.stage !== 'Returned') {
      throw new Error(
        `${bookingNo} is ${booking.stage}, and only a Returned rental can be closed. Nothing was closed.`,
      )
    }

    const rawGates = await readCloseGates(booking.id, bookingNo)
    const gates: CloseGateInput = {
      ...rawGates,
      ...(isOverride ? { isZeroValueOverride: true } : {}),
      ...(isDepositSkip ? { depositSkipReason: input.depositSkip!.reason.trim() } : {}),
    }

    const transitionReason = isOverride ? input.override!.reason.trim() : input.reason

    /*
     * The engine decides, not this file (Law 1). `planTransition` evaluates
     * §1.7's four gates and refuses with every blocking reason and its value —
     * which is what the screen renders inline.
     */
    const outcome = await applyBookingTransition({
      bookingId: booking.id,
      branchId: booking.branch_id,
      from: 'Returned',
      to: 'Closed',
      actorId: ctx.userId,
      actorRole: ctx.role as SystemRole,
      clientUuid: input.clientUuid,
      gates,
      ...(transitionReason === undefined ? {} : { reason: transitionReason }),
    })

    if (!outcome.ok) {
      const blockers = outcome.plan.blockers
        .map((b) => (b.blocking === null ? b.label : `${b.label} (${b.blocking})`))
        .join('; ')
      throw new Error(`${bookingNo} cannot be closed yet — ${blockers}. Nothing was written.`)
    }

    /* ── READ THE STAGE BACK ─────────────────────────────────────────────────
     *
     * `applyBookingTransition` inserts the transition row; the DATABASE moves
     * `bookings.stage` from that row's trigger, and `validate_booking_gates`
     * can still refuse there. A resolved insert is therefore not proof the
     * stage moved — and this is the exact guard `confirmRental` carries and
     * `floorVerb.advanceStage` does not (audit RL-08), which is how a floor
     * verb can report a move the database never made.
     */
    const { data: after, error: afterError } = await supabase
      .from('bookings')
      .select('stage, closed_at')
      .eq('id', booking.id)
      .maybeSingle()

    if (afterError || !after) {
      throw new Error(
        `${bookingNo}'s close was submitted but its stage could not be read back, so treat it as NOT closed and ` +
          `check the booking before retrying${afterError ? `: ${afterError.message}` : '.'}`,
      )
    }

    const stageNow = (after as unknown as { stage: string; closed_at: string | null }).stage
    if (stageNow !== 'Closed') {
      throw new Error(
        `${bookingNo} is still ${stageNow} after the close was submitted, so treat it as NOT closed. The database ` +
          'refused the move — check the close gates on the booking.',
      )
    }

    const events = [
      {
        type: EVENT_TYPES.RENTAL_CLOSED,
        payload: {
          bookingId: booking.id,
          bookingNo: booking.booking_no,
          rentalInvoiced: gates.rentalInvoiced,
          rentalOutstandingPaisa: gates.rentalOutstandingPaisa,
          depositHeldPaisa: gates.depositHeldPaisa,
          openCases: gates.openCases,
          damageChargesPendingApproval: gates.damageChargesPendingApproval,
          isZeroValueOverride: isOverride,
          depositSkipped: isDepositSkip,
          reason: transitionReason ?? null,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        bookingId: booking.id,
        bookingNo: booking.booking_no,
        stage: 'Closed' as const,
        gates,
      },
      events,
    }
  },
})
