import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { generateClientUuid } from '../../lib/dataAccess'
import { applyBookingTransition } from '../../lib/bookingTransition'
import { BOOKING_STATUS, STATUS_ORDER, type BookingStatus } from '../../lib/workflow'

/**
 * # CONFIRM_RENTAL — the transition that makes a Quote a commitment
 *
 * ## What this replaced
 *
 * ```ts
 * console.log(`[DB TX] Executing CONFIRM_RENTAL for ${input.id}`)
 * return { result: { success: true }, events: [...] }
 * ```
 *
 * A `console.log` and `{ success: true }`. The dispatcher's `implemented`
 * default (false) is the only reason no operator was ever shown a booking that
 * had been "confirmed" into nothing.
 *
 * ## Confirm is an INSERT, not an UPDATE
 *
 * `bookings.stage` cannot be written. `0021_forward_only_stage_transitions.sql`
 * revokes the column (`:199`) and `0002_bookings.sql:80-81` states it plainly:
 * *"Read model of booking_stage_transitions. Written ONLY by that table's
 * trigger; a direct UPDATE is rejected."* So confirming is **one INSERT into
 * `booking_stage_transitions`**, and `trg_apply_booking_stage_transition`
 * (`AFTER INSERT`, verified live 12 Aug 2026) moves the stage.
 *
 * That row is not written here either — `lib/bookingTransition.ts`'s
 * `applyBookingTransition` owns it, and it in turn asks `lib/workflow.ts`'s
 * `planTransition` whether the move is legal. Law 1: this file states *which*
 * move Confirm is and refuses the situations the engine cannot see; it decides
 * nothing about the lifecycle itself.
 *
 * ## Working WITH `apply_booking_stage_transition()`, not around it
 *
 * Read off the live project on 12 Aug 2026, the trigger function:
 *
 *  - takes `select … from bookings where id = NEW.booking_id **for update**`,
 *    so two operators pressing Confirm at once are serialised by Postgres, not
 *    by this file;
 *  - raises when `NEW.from_stage <> ` the booking's *actual* current stage —
 *    *"Stale read or concurrent write"*. The stage guard below is therefore a
 *    courtesy that produces a readable sentence; the database is the arbiter
 *    and cannot be talked past;
 *  - raises unless `to_stage = next_booking_stage(from_stage)`, and
 *    `next_booking_stage('Quote')` is `'Booked'` — the same pairing
 *    `workflow.ts` holds, which is why `CONFIRM_TO` below is read out of
 *    `STATUS_ORDER` rather than typed a third time;
 *  - raises when the booking is Closed, and when `occurred_at` precedes the
 *    booking's previous transition;
 *  - and its `update bookings set stage = …` passes through
 *    `trg_booking_gate_check` / `validate_booking_gates()`, whose gates
 *    (verified live) fire only on `'On Rent'` and `'Closed'`. **Quote → Booked
 *    has no money gate in the database**, which is consistent with §1.9's
 *    'Deposit Pending' and 'Payment Due' — *"Blocks Handover, not Confirm"*.
 *
 * ## What Confirm is supposed to do as well, and cannot yet
 *
 * `0002_bookings.sql:495-501` marks two things `TRIGGER REQUIRED` that do not
 * exist on the live project (checked: the only triggers on
 * `booking_stage_transitions` are the transition applier and the
 * update/delete rejections):
 *
 *  - *"advancing to 'Confirmed' runs as one transaction — reserve inventory for
 *    the booking dates, update calendar, recalculate payment status, generate
 *    the Rental Agreement, enable Packing, write audit"*;
 *  - *"advance **past** 'Confirmed' is rejected while any Critical condition
 *    holds — an equipment conflict, a client with neither government ID nor
 *    PAN, a stacked discount above 10% without reason and approver, a Blocked
 *    client, or a client over credit limit."*
 *
 * Neither is synthesised here. The reservation belongs in one transaction with
 * the stage move, which PostgREST cannot offer a client, and
 * `inventory_reservations` is Booqable-mastered besides (`dataAccess.ts:201`).
 * The Critical-condition list gates the transition *after* this one, and three
 * of its five clauses are money facts. `TODO(decision)` — both are migrations,
 * not an action body. What this action does write is exactly the stage move,
 * and it reports the live line count it moved so the missing reservation is
 * visible rather than assumed.
 *
 * ## No pricing, by construction
 *
 * Not one money column is selected or written here. `lib/money.ts` owns the
 * calculation order (subtotal → discount → taxable → VAT → total →
 * outstanding), a booking's totals are read from it wherever they are shown,
 * and a stage transition carries no amounts at all — so there is nothing for a
 * second copy of that order to drift from.
 *
 * ## ⚠ TODO(decision) — `rental.confirm` resolves to no rule in `lib/rbac`
 *
 * `actions/core.ts:105-126` resolves seven capability strings and
 * `rental.confirm` is not one of them, so `checkCapability` returns `undefined`
 * and the dispatcher denies this action **before** `validate` or `execute` runs
 * (`core.ts:144-149`). That is the fail-closed direction and it is deliberate.
 *
 * It is NOT re-pointed at a capability that happens to resolve.
 * `operations.perform` — the one `packRental` legitimately uses — maps to
 * `rbac.canPerformOperations`, which is `Owner | Admin | Manager | Warehouse |
 * Technician`. The rule that actually governs this write is the live RLS policy
 * on the table it inserts into (read from the project, 12 Aug 2026):
 *
 *     policy booking_stage_transitions_insert with check (
 *       auth_user_role() = any (array['Owner','Admin','Manager','Coordinator','Warehouse'])
 *       and actor_id = nullif(current_setting('app.current_user_id', true), '')::uuid
 *     )
 *
 * The two sets differ in both directions: it admits **Coordinator** — the
 * booking desk, the seat that confirms bookings — and excludes **Technician**.
 * Borrowing `operations.perform` would therefore deny the role whose job this
 * is and admit one the database will reject. Writing the correct rule into
 * `lib/rbac` is a change to a file this task was not given, so it is reported
 * rather than invented. `permissions` keeps naming the real capability.
 *
 * `confirmRentalConfig` is exported for the same reason `createClientConfig`
 * is: until the matrix is ruled, driving `validate`/`execute` through the
 * dispatcher is impossible, and "untested because unreachable" is how a write
 * body rots. The suite drives the config directly and pins the denial
 * separately through `confirmRental` itself.
 */

/** Confirm is the move OUT of `Quote`. */
const CONFIRM_FROM: BookingStatus = 'Quote'

/** `bookings.id` is a uuid; `booking_no` is `BK-YYYY-NNNN` (CHECK, live). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A full ISO instant that CARRIES ITS OFFSET.
 *
 * `Date.parse` alone is not the check: it accepts `'12 Aug'`, and it reads
 * `'2026-08-12T09:00:00'` — no offset — as the *device's local* time, which is
 * harmless on a Kathmandu machine and 5h45m out on one set to Auckland.
 * `queries/bookings.ts`'s `nepalDay` names the same hazard for the read side.
 * `occurred_at` is what the trigger's causal-order check compares, so a skewed
 * one either rejects a legitimate confirm or silently records the wrong
 * ordering.
 */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/

export type ConfirmRentalInput = {
  /** `bookings.id` (uuid) or `bookings.booking_no` (`BK-YYYY-NNNN`). */
  id: string
  /**
   * **Law 8.** Minted where the operator pressed Confirm (`newClientUuid()` in
   * `lib/supabase`) and reused across every retry of that one press.
   * `booking_stage_transitions.client_uuid` carries `unique`, and 0002's
   * comment on that column is this exact case: *"A double-submitted Confirm may
   * not advance two stages."*
   *
   * Optional so the call sites that have not been given one yet still compile;
   * one is minted when it is absent. The stage guard below is the stronger of
   * the two protections either way — a second Confirm finds the booking already
   * at `Booked` and is refused by name.
   */
  clientUuid?: string
  /** AD/UTC (Law 7). Defaults to now. Compared by the trigger's causal-order check. */
  occurredAt?: string
  /** Free text onto `booking_stage_transitions.reason`. Never required at Confirm. */
  reason?: string
}

export type ConfirmRentalResult = {
  success: true
  /** The booking's uuid, whatever form `id` arrived in. */
  bookingId: string
  bookingNo: string
  clientId: string
  /** The move that landed, re-read from `bookings.stage` after the write. */
  stage: { from: BookingStatus; to: BookingStatus }
  /** Live (non-voided) `booking_lines` rows on the booking at the moment it was confirmed. */
  lines: number
  /**
   * `sum(qty)` across those lines — units, not rows. Same figure, and the same
   * bundle caveat, as `lib/queries/bookings.ts`'s ITEM COUNT block.
   */
  units: number
}

interface BookingHead {
  id: string
  booking_no: string
  branch_id: string
  client_id: string
  stage: BookingStatus
  cancelled_at: string | null
  closed_at: string | null
}

/**
 * The booking, by uuid or by `BK-` number. Every column is named and none of
 * them is money — `deposit_required` sits unmasked on this table
 * (`queries/bookings.ts` DEPOSIT), so a `select('*')` here would hand a rupee
 * figure to any session that can confirm a booking, Warehouse included.
 */
async function readBooking(ref: string): Promise<BookingHead> {
  const column = UUID_RE.test(ref) ? 'id' : 'booking_no'
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_no, branch_id, client_id, stage, cancelled_at, closed_at')
    .eq(column, ref)
    .maybeSingle()

  if (error) throw new Error(`Could not read booking ${ref}, so nothing was confirmed: ${error.message}`)
  if (!data) throw new Error(`No booking matches ${ref}. Nothing was confirmed.`)
  return data as unknown as BookingHead
}

/** Live lines only — Law 3, a removed line is `voided_at`, never deleted, and a voided line is not booked. */
async function readLiveLines(bookingId: string): Promise<Array<{ id: string; qty: number }>> {
  const { data, error } = await supabase
    .from('booking_lines')
    .select('id, qty')
    .eq('booking_id', bookingId)
    .is('voided_at', null)

  if (error) throw new Error(`Could not read the lines of the booking, so nothing was confirmed: ${error.message}`)
  return (data ?? []) as unknown as Array<{ id: string; qty: number }>
}

/** The stage the database holds now. This is the persistence check — see execute. */
async function readStage(bookingId: string): Promise<BookingStatus | null> {
  const { data, error } = await supabase.from('bookings').select('stage').eq('id', bookingId).maybeSingle()
  if (error) throw new Error(`The confirm could not be verified against the database: ${error.message}`)
  const row = data as unknown as { stage?: BookingStatus } | null
  return row?.stage ?? null
}

export const confirmRentalConfig: ActionConfig<ConfirmRentalInput, ConfirmRentalResult> = {
  name: 'CONFIRM_RENTAL',
  // Left naming the real capability. See the TODO(decision) in the header.
  permissions: ['rental.confirm'],

  /**
   * `true` because `execute` below inserts a `booking_stage_transitions` row
   * through `lib/bookingTransition` → `lib/dataAccess`'s `idempotentInsert`,
   * and then **re-reads `bookings.stage`** and refuses unless the database
   * actually moved it.
   *
   * ⚠ The write was driven against the live project as SQL, inside a
   * transaction rolled back by `raise exception` so nothing committed: a Quote
   * booking with one live line, then the exact payload this action sends. The
   * trigger accepted it and `bookings.stage` read `Booked`; a second insert
   * carrying `from_stage = 'Quote'` was rejected by the trigger, which is the
   * replay case. It could **not** be driven through the UI: `rental.confirm`
   * resolves to no rbac rule, so the dispatcher denies it before `execute`, and
   * every operational table on the project is empty (0047 unapplied, PLAN.md
   * §4.20) so there is no Quote to press the button on.
   */
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim() === '') {
      throw new Error('A booking reference is required — pass the booking uuid or its BK- number.')
    }
    if (input.clientUuid !== undefined && input.clientUuid.trim() === '') {
      throw new Error(
        'The idempotency key is present but empty. Pass the key minted where the operator pressed Confirm, ' +
          'or omit it — an empty string is neither. Nothing was sent.',
      )
    }
    if (
      input.occurredAt !== undefined &&
      (!ISO_INSTANT_RE.test(input.occurredAt) || Number.isNaN(Date.parse(input.occurredAt)))
    ) {
      throw new Error(
        'occurredAt must be a full ISO instant carrying an offset — "2026-08-12T04:15:00.000Z" or ' +
          `"…+05:45" (Law 7). Received ${JSON.stringify(input.occurredAt)}, which either is not an instant or ` +
          "has no offset and would be read as the device's local time. Nothing was sent.",
      )
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /*
     * OFFLINE — refused, not queued.
     *
     * `idempotentInsert` queues an offline insert and returns
     * `{ data: <the payload you sent>, error: null }` (`dataAccess.ts:39-43`),
     * and `applyBookingTransition` reports `ok` either way because it does not
     * look at the row. A queued Confirm is not a confirmed booking: the trigger
     * compares `from_stage` against the booking's stage **at the moment the
     * queue drains**, so a transition sent now can be rejected an hour later
     * with nobody watching, while the operator has already been told the
     * booking is Booked. It is refused here instead.
     */
    const offline =
      ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)
    if (offline) {
      throw new Error(
        'This device is offline, so the booking was not confirmed. A stage change is checked against the ' +
          "booking's current stage at the moment it reaches the database, so it is not queued for later. " +
          'Confirm it when you are back online.',
      )
    }

    const booking = await readBooking(input.id)

    /* The refusals that precede the write. Each one is a sentence about this
     * booking, not a 400 from Postgres five layers away. */
    if (booking.cancelled_at !== null) {
      throw new Error(
        `${booking.booking_no} was cancelled on ${booking.cancelled_at}. A cancelled booking is not confirmed.`,
      )
    }
    if (booking.closed_at !== null) {
      throw new Error(`${booking.booking_no} is Closed. Closed is final (0002:96) — nothing further is recorded.`)
    }
    if (booking.stage !== CONFIRM_FROM) {
      throw new Error(
        `Confirm moves a booking from ${CONFIRM_FROM} to the next stage; ${booking.booking_no} is at ` +
          `${booking.stage}. Nothing was written. If this is a repeat submit, the first one already landed.`,
      )
    }

    /* `Booked` is read out of the engine's own order, not typed here. It is
     * also what `next_booking_stage('Quote')` returns in the database, and the
     * trigger rejects anything else. */
    const to = STATUS_ORDER[BOOKING_STATUS[CONFIRM_FROM].order + 1]
    if (to === undefined) {
      throw new Error(`No stage follows ${CONFIRM_FROM} in workflow.ts's order — there is nothing to confirm into.`)
    }

    /*
     * A Quote with no live lines is not confirmable. `workflow.ts:45` defines
     * the stage this writes: Booked means *"Committed. Gear reserved, calendar
     * held, serials assigned."* There is nothing to reserve or assign on an
     * empty booking, so the transition would assert a commitment with no
     * content — and the packing queue would then show a booking `packRental`
     * itself refuses (an empty line list "would open a session claiming work on
     * nothing"). The database does not enforce this; it is refused in the
     * fail-closed direction rather than written and discovered on the floor.
     */
    const lines = await readLiveLines(booking.id)
    if (lines.length === 0) {
      throw new Error(
        `${booking.booking_no} has no live lines, so there is nothing to commit — a booking reaches ${to} with ` +
          'gear reserved and serials assigned. Add the items, or void nothing: a removed line is voided, not ' +
          'deleted, so a booking whose lines were all voided is in this same state. Nothing was confirmed.',
      )
    }

    const clientUuid = input.clientUuid ?? generateClientUuid()
    const occurredAt = input.occurredAt ?? new Date().toISOString()

    const { ok, plan } = await applyBookingTransition({
      bookingId: booking.id,
      branchId: booking.branch_id,
      from: booking.stage,
      to,
      actorId: ctx.userId,
      actorRole: ctx.role,
      clientUuid,
      occurredAt,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    })

    if (!ok) {
      throw new Error(
        `${booking.booking_no} was not confirmed: ` +
          plan.blockers.map((b) => `${b.label}${b.blocking === null ? '' : ` (${b.blocking})`}`).join('; '),
      )
    }

    /* ── PERSISTENCE CHECK ──────────────────────────────────────────────────
     * `applyBookingTransition` returns the *plan*, not the row, so `ok` means
     * "the engine allowed it and the insert call returned" — not "the database
     * moved the stage". Two of `idempotentInsert`'s branches return
     * successfully having written nothing: the offline queue (refused above)
     * and the `'Failed to fetch'` / 408 branch (`dataAccess.ts:49-53`), which
     * fires even when `navigator.onLine` is true. The stage is what the whole
     * action exists to change, so it is read back and compared. A Confirm that
     * cannot be seen in `bookings.stage` is reported as not confirmed.
     */
    const persisted = await readStage(booking.id)
    if (persisted !== to) {
      throw new Error(
        `${booking.booking_no} is still at ${persisted ?? 'an unreadable stage'} — the confirm was queued or ` +
          'rejected rather than applied, so treat the booking as NOT confirmed. Check the connection and try again.',
      )
    }

    const units = lines.reduce((total, line) => total + line.qty, 0)

    return {
      result: {
        success: true as const,
        bookingId: booking.id,
        bookingNo: booking.booking_no,
        clientId: booking.client_id,
        stage: { from: booking.stage, to },
        lines: lines.length,
        units,
      },
      events: [
        {
          type: EVENT_TYPES.RENTAL_CONFIRMED,
          payload: {
            bookingId: booking.id,
            bookingNo: booking.booking_no,
            clientId: booking.client_id,
            branchId: booking.branch_id,
            from: booking.stage,
            to,
            lines: lines.length,
            units,
            occurredAt,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const confirmRental = createAction(confirmRentalConfig)
