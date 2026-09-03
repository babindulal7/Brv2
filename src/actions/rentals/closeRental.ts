import { createAction, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { applyBookingTransition } from '../../lib/bookingTransition'
import { supabase } from '../../lib/supabase'
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
 * ⚠ Today the server-side half is **vacuous** for a different reason: it reads
 * `invoices` and `security_deposits`, and nothing in the app writes either, so
 * both sums are NULL and `coalesce(...,0)` reads zero (audit P1-14, SPEC-P0-1
 * §2.3). It becomes real the moment `createInvoice` lands — which is precisely
 * why PHASE-0-PLAN sequences Close (Step 4) after invoicing (Step 3).
 *
 * ## R-07 · a hard block, and never automatic
 *
 * The Close gate stays a hard block. The *verb* is manual and the *prompt* is
 * automatic: Booking Detail surfaces "Ready to close" when all four pass. The
 * 28 Jul note about auto-closing when an invoice is marked Paid is superseded —
 * auto-firing would close rentals carrying an open case or an unapproved damage
 * charge, because those two gates sit outside the invoice entirely.
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
}

export type CloseRentalResult = {
  bookingId: string
  bookingNo: string
  /** Always `'Closed'` when this resolves. */
  stage: 'Closed'
  /** The four §1.7 gates as they stood, so a caller can render what was true at close. */
  gates: CloseGateInput
}

/**
 * `case_status` values that count as still open. The live enum is
 * `Open | Under Review | Awaiting Decision | In Progress | Resolved | Closed |
 * Cancelled` — the first four are open, the last three are not.
 */
const OPEN_CASE_STATES = ['Open', 'Under Review', 'Awaiting Decision', 'In Progress']

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

/**
 * Read the four §1.7 gates for one booking, from the tables that own them.
 *
 * Four reads rather than one embed: each gate lives on a different table, and a
 * failed embed surfaces as a null column rather than an error — which would
 * read as "gate passes". A gate that passes because its read broke is the one
 * failure mode this function must not have, so each read is separate and each
 * failure throws with the table named.
 */
async function readCloseGates(bookingId: string, bookingNo: string): Promise<CloseGateInput> {
  /*
   * Outstanding across every invoice that is not Void — the same expression the
   * server-side gate uses, so the two cannot disagree about what "settled"
   * means. A voided invoice is settled by credit note and carries no balance.
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

  const rentalOutstandingPaisa = ((invoiceRows ?? []) as unknown as Array<{ outstanding_amount: number | string }>)
    .reduce((sum, row) => sum + paisa(row.outstanding_amount), 0)

  /*
   * Law 5 — the deposit is a liability, held separately from the rental total.
   * "Resolved" means nothing is still pending: refunded, applied, or never
   * required. A booking with no deposit row required no deposit.
   */
  const { data: depositRows, error: depositError } = await supabase
    .from('security_deposits')
    .select('pending_amount')
    .eq('booking_id', bookingId)

  if (depositError) {
    throw new Error(
      `Could not read the deposit for ${bookingNo}, so whether it is resolved is unknown and it was not closed: ` +
        depositError.message,
    )
  }

  const depositPendingPaisa = ((depositRows ?? []) as unknown as Array<{ pending_amount: number | string }>)
    .reduce((sum, row) => sum + paisa(row.pending_amount), 0)

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

  return {
    rentalOutstandingPaisa,
    depositResolved: depositPendingPaisa === 0,
    openCases: (caseRows ?? []).length,
    /*
     * ⚠ Vacuously zero, and honestly so. `damage_findings` carries no booking
     * FK at all — it points at `return_line_id`, `cleaning_queue_entry_id` and
     * `unit_id` — and nothing in the app writes it yet (audit P1-3, SPEC-P1-3).
     * So there is no query that could return a real number here today.
     *
     * Reporting 0 is therefore accurate about the DATA and misleading about the
     * WORLD: a damaged item can exist with no finding to count. SPEC-P0-2 §3
     * says exactly this — "until findings are written this gate is vacuously
     * true, which is honest but weak. Note it in the UI." The Booking Detail
     * prompt must say the damage gate is not yet enforced rather than showing a
     * green tick.
     * TODO(P1-3): count `damage_findings` in `Pending Approval` for the booking
     * once the writer and the booking link exist.
     */
    damageChargesPendingApproval: 0,
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
  },

  execute: async (input, ctx: ActionContext) => {
    /*
     * OFFLINE — refused. Closing evaluates live money on three tables; a queued
     * close would be checked against a stage and a balance that may be hours
     * old by the time it drains. `confirmRental` refuses offline for the same
     * reason and says so in the same words.
     */
    if (ctx.isOnline === false) {
      throw new Error(
        'Closing a rental needs a connection — the close gates are read from live invoices, deposits and cases. ' +
          'Nothing was closed.',
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

    const gates = await readCloseGates(booking.id, bookingNo)

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
      ...(input.reason === undefined ? {} : { reason: input.reason }),
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
          rentalOutstandingPaisa: gates.rentalOutstandingPaisa,
          depositResolved: gates.depositResolved,
          openCases: gates.openCases,
          reason: input.reason ?? null,
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
