import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { generateClientUuid } from '../../lib/dataAccess'
import { applyBookingTransition } from '../../lib/bookingTransition'
import { BOOKING_STATUS, STATUS_ORDER, type BookingStatus } from '../../lib/workflow'
import {
  planAssignment,
  findCollidingHolds,
  describeCollisions,
  readHeldForBooking,
  availabilityRules,
  AssignmentIncompleteError,
} from '../../lib/queries/availability'

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
 * **The first of those is done, and since 8 Sep 2026 it is done by the database.**
 *
 * From 16 Aug this action reserved inventory itself, before moving the stage,
 * and then compensated — released the holds — if the stage did not move. The
 * comment here said what was wrong with that: *"belongs in one transaction with
 * the stage move, which PostgREST cannot offer a client … the server-side
 * function remains the real fix."*
 *
 * RULING 2026-09-08 (R-26) built it. `0100_reservations_written_by_transition.sql`
 * hangs the reservation off `after insert on booking_stage_transitions`, so the
 * hold and the stage move are one transaction by construction: a refused hold
 * raises inside the transition INSERT and the booking is still a Quote. Nothing
 * to order wrong, nothing to compensate, and — the reason it is a P0 rather than
 * a tidy-up — **no way to skip it.** Reproduced before the fix: two bookings for
 * one camera over overlapping dates, both confirmed straight over PostgREST,
 * `inventory_reservations` still at zero rows, the GiST exclusion never offered
 * a row to reject.
 *
 * What is left here is a READ. `planAssignment` still decides which units the
 * booking wants (it is what refuses a booking with nothing free, in a sentence
 * an operator can act on), and `findCollidingHolds` names the booking already
 * holding a unit so the refusal reads *"#912 has it"* rather than `23P01`.
 * Neither is a gate. If either says yes and the database says no, the database
 * wins and the confirm is refused whole — which is the whole point of moving the
 * write.
 *
 *  - The 16 Aug note that *"`inventory_reservations` is Booqable-mastered
 *    (`dataAccess.ts:201`)"* was ruled otherwise on 16 Aug, PLAN.md §4.30(a),
 *    and is moot here now: this file writes nothing to that table at all.
 *
 * The remaining three of that first list — calendar, payment status, Rental
 * Agreement — and the whole Critical-condition list are still not synthesised
 * here. Three of that list's five clauses are money facts, and it gates the
 * transition *after* this one.
 *
 * ## No pricing, by construction
 *
 * Not one money column is selected or written here. `lib/money.ts` owns the
 * calculation order (subtotal → discount → taxable → VAT → total →
 * outstanding), a booking's totals are read from it wherever they are shown,
 * and a stage transition carries no amounts at all — so there is nothing for a
 * second copy of that order to drift from.
 *
 * ## ✅ `rental.confirm` — ruled 15 Aug 2026, closing PLAN.md §4.20
 *
 * For three days this action was implemented and unreachable: `rental.confirm`
 * resolved to no rule in `checkCapability`, which returns `undefined` for an
 * unhandled capability, which the dispatcher reads as a denial for **every**
 * role, Owner included. Fail-closed was the right default and the wrong answer.
 *
 * It was never re-pointed at a capability that happens to resolve.
 * `operations.perform` — the one the four floor verbs legitimately use — maps to
 * `rbac.canPerformOperations`: `Owner | Admin | Manager | Warehouse |
 * Technician`. The rule that actually governs this write is the live RLS policy
 * on the table it inserts into (re-read from the project, 15 Aug 2026):
 *
 *     policy booking_stage_transitions_insert with check (
 *       auth_user_role() = any (array['Owner','Admin','Manager','Coordinator','Warehouse'])
 *       and actor_id = nullif(current_setting('app.current_user_id', true), '')::uuid
 *     )
 *
 * The two sets differ in both directions: it admits **Coordinator** — the
 * booking desk, the seat that confirms bookings — and excludes **Technician**.
 * Borrowing `operations.perform` would have denied the role whose job this is
 * and admitted one the database rejects. So the ruling mirrored the policy
 * instead: `rbac.canConfirmRental`, wired at `core.ts:checkCapability`.
 * `permissions` still names the real capability, and always did.
 *
 * The policy's second clause — the actor must BE the session — has no mirror in
 * `lib/rbac` and needs none: `applyBookingTransition` passes `ctx.userId` as
 * `actor_id`, and RLS enforces the identity at the row where it cannot be talked
 * past. `rbac` answers rank; the database answers identity.
 *
 * `confirmRentalConfig` stays exported. It was originally exported because the
 * dispatcher was unreachable and "untested because unreachable" is how a write
 * body rots; it stays because driving `validate`/`execute` directly keeps the
 * body's assertions independent of the permission gate, which is now pinned
 * separately against the ruled role list.
 */

/** Confirm is the move OUT of `Quote`. */
const CONFIRM_FROM: BookingStatus = 'Quote'

/**
 * `bookings.id` is a uuid; `booking_no` is `B-` + digits.
 *
 * ⚠ Corrected 15 Aug 2026. This said `BK-YYYY-NNNN`, which was the CHECK in
 * `0002_bookings.sql:58` and has not been the live rule since
 * `0055_ruled_identifier_formats` was applied on 12 Aug. Read from the project:
 * `bookings_booking_no_format CHECK (booking_no ~ '^B-[0-9]+$')`, and live rows
 * are `B-715` … `B-917`. Nothing here depended on the shape — the branch below
 * only asks "uuid or not" — but the comment was being quoted as fact by two
 * separate reports on 15 Aug, both of which concluded the format was in conflict
 * with itself. It is not; the comment was stale.
 */
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
  /** `bookings.id` (uuid) or `bookings.booking_no` (`B-` + digits — see UUID_RE). */
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
  /**
   * Physical units actually reserved — one `inventory_reservations` row each.
   *
   * Reported separately from `units` and never merged with it, because the two
   * differ exactly where it matters: a bundle or service line contributes to
   * `units` and can be assigned no serial, so `unitsReserved < units` is the
   * normal, correct shape for a booking carrying one. Collapsing them would
   * hide which lines got gear.
   *
   * ⚠ Counts SERIALISED holds only. Bulk stock is held by
   * `quantityReserved`/`quantityHolds` below and is not added in here, because a
   * cable held by a count is not a body with a serial on it and the floor
   * screens treat the two differently.
   *
   * ⚠ Since R-26 this is **read back from the database after the transition
   * committed**, not counted from what this action wrote — it writes nothing.
   * The trigger reserves from `booking_line_units` and the line remainder, so on
   * a booking whose serials moved between creation and confirm the plan's number
   * and the table's number differ, and the table is the one that is true.
   */
  unitsReserved: number
  /**
   * Items of bulk stock held — Σ `qty` across the product-level
   * `inventory_reservations` rows this Confirm wrote.
   *
   * On the live catalogue this is where every hold lands: all 204 products are
   * `tracking_mode = 'Quantity'` with no `product_units` rows, so `unitsReserved`
   * is 0 and this is the number that says the booking has stock behind it.
   */
  quantityReserved: number
  /**
   * How many product-level rows carried that quantity — one per quantity line.
   * Separate from `quantityReserved` because one row can hold forty cables.
   */
  quantityHolds: number
}

interface BookingHead {
  id: string
  booking_no: string
  branch_id: string
  client_id: string
  stage: BookingStatus
  cancelled_at: string | null
  closed_at: string | null
  /** 0144 — NULL for legacy rows and Drafts; Confirm refuses it (spec §6). */
  project_type: string | null
}

/**
 * The booking, by uuid or by `B-` number. Every column is named and none of
 * them is money — `deposit_required` sits unmasked on this table
 * (`queries/bookings.ts` DEPOSIT), so a `select('*')` here would hand a rupee
 * figure to any session that can confirm a booking, Warehouse included.
 */
async function readBooking(ref: string): Promise<BookingHead> {
  const column = UUID_RE.test(ref) ? 'id' : 'booking_no'
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_no, branch_id, client_id, stage, cancelled_at, closed_at, project_type')
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

/*
 * RULING 2026-09-08 (R-26): `strandedNote` used to live here.
 *
 * It named the holds a failed rollback could not give back — a sentence that only
 * had to exist because this action wrote reservations in one statement and moved
 * the stage in another, so a failure between them left live holds against a
 * booking that was never confirmed. The database writes both in one transaction
 * now (`0100`), so there is no compensation, nothing half-runs, and nothing can
 * be stranded. Deleted rather than kept for a case that can no longer arise.
 */

/** The stage the database holds now. This is the persistence check — see execute. */
async function readStage(bookingId: string): Promise<BookingStatus | null> {
  const { data, error } = await supabase.from('bookings').select('stage').eq('id', bookingId).maybeSingle()
  if (error) throw new Error(`The confirm could not be verified against the database: ${error.message}`)
  const row = data as unknown as { stage?: BookingStatus } | null
  return row?.stage ?? null
}

export const confirmRentalConfig: ActionConfig<ConfirmRentalInput, ConfirmRentalResult> = {
  name: 'CONFIRM_RENTAL',
  // Names the real capability, and now resolves. See the header.
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
   * replay case.
   *
   * ⚠ **It has still not been driven through the UI, but both reasons it could
   * not be are gone as of 15 Aug 2026.** This said the dispatcher denied it
   * before `execute` (ruled — see the header) and that "every operational table
   * on the project is empty (0047 unapplied)". The second was true on 12 Aug and
   * is not now: counted live on 15 Aug, `bookings` holds 121 rows and 18 of them
   * are at `Quote`, with 419 `booking_lines` behind them. The seed corpus in
   * `0047_seed_reference_corpus.sql` is indeed still unapplied — the rows came in
   * by another route — so the file's status line is right and the conclusion
   * drawn from it was wrong. There are real Quotes to press the button on.
   */
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim() === '') {
      throw new Error('A booking reference is required — pass the booking uuid or its B- number.')
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

    /* Project Type is required to confirm (spec §6) but optional on a Draft —
       the booking is created first as a Quote without one. The New Rental
       screen states this before the press; this is the enforcement for every
       other caller, in the fail-closed direction. `?? ''` because rows that
       predate 0144 (and mock corpus rows) carry no key at all. */
    if ((booking.project_type ?? '').trim() === '') {
      throw new Error(
        `Select a project type before confirming this rental. ${booking.booking_no} has none recorded — ` +
          'open it, set the type, and confirm again. Nothing was confirmed.',
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

    /* ── AUTO ASSIGN SERIALS ────────────────────────────────────────────────
     *
     * `workflow.ts:45` defines the stage this action writes into: Booked means
     * *"Committed. Gear reserved, calendar held, **serials assigned**."* Until
     * 16 Aug 2026 this action moved the stage and assigned nothing, so every
     * booking it confirmed arrived on the floor with no units behind it — which
     * PROGRESS.md identified as the single blocker sitting under Packing,
     * Handover, Return, Reset and Evidence equally.
     *
     * Ruled 16 Aug (PLAN.md §4.30): the assignment is held in
     * `inventory_reservations`, the only table carrying a double-booking
     * exclusion. `lib/availability` decides; `lib/queries/availability` fetches.
     * Since R-26 (8 Sep) **Postgres writes** — see `0100`. Nothing about
     * availability is decided in this file — Law 1.
     *
     * ## Serials are only half of it — 7 Sep 2026
     *
     * `products.tracking_mode` has three values and only one of them has units.
     * Until this date the plan treated every line as needing serials, so a line
     * naming bulk stock resolved an empty pool and this action refused the
     * booking with *"not every line has … free for these dates"* — on the
     * live project that is 204 of 204 products, every one of them `Quantity`
     * with no `product_units` rows (INV-02). `planAssignment` now splits the
     * lines by mode and writes a product-level hold (`product_id`, `qty`,
     * `period`) for the quantity ones, which is the shape
     * `inventory_reservations_serialised_xor_quantity` was written for and which
     * `enforce_inventory_reservation_capacity()` — live since 11 Aug — has been
     * guarding with nothing to guard.
     *
     * ## The ORDER, and what is left of it — 8 Sep 2026
     *
     * It used to be: reserve, verify the reservation, move the stage, and give
     * the units back if the stage did not move. Three of those four steps were
     * compensation for not having a transaction.
     *
     * It is now: PLAN (a read — refuse a booking nothing is free for, in an
     * operator's words), PRE-CHECK (a read — name the booking already holding a
     * unit), then ONE INSERT. The hold and the stage move commit together or
     * neither does, because `0100`'s trigger hangs off that same insert.
     *
     * ## Why the two reads survive the trigger
     *
     * Neither is a gate — the database is the arbiter and cannot be talked past.
     * They exist for the sentence. Without them a Confirm that collides comes
     * back as
     *
     *     conflicting key value violates exclusion constraint
     *     "inventory_reservations_no_double_booking"
     *
     * which tells an operator at 6 AM nothing at all. With them it comes back
     * naming the booking to ring. A read that only improves an error message is
     * worth one round trip; a read that decided anything would be a second
     * implementation of the rule, which is what Law 10 forbids.
     */
    const assignment = await planAssignment(booking.id)
    if (!assignment.complete) throw new AssignmentIncompleteError(assignment)

    /*
     * RULING 2026-09-08 (R-26): the database writes reservations; this is a
     * courtesy check only. Same question the constraint asks — the units this
     * plan wants, held live by another booking over an overlapping window —
     * asked under the same bracket convention (`availabilityRules().bounds`,
     * which is `RENTAL_WINDOW_BOUNDS`, which is what `0100` writes as `'[)'`).
     *
     * Racy by construction and that is fine: another session can take the unit
     * between this line and the insert below. Silence here is not permission,
     * it is only the absence of a better sentence.
     */
    const wanted = assignment.lines.flatMap((entry) =>
      entry.kind === 'serialised' ? entry.outcome.assigned.map((unit) => unit.unitId) : [],
    )
    const collisions = await findCollidingHolds(
      wanted,
      assignment.window,
      availabilityRules().bounds,
      booking.id,
    )
    const collision = describeCollisions(collisions)
    if (collision !== null) {
      throw new Error(`${booking.booking_no} was not confirmed: ${collision}`)
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
      /* Nothing to give back. The holds are written by the same INSERT this
         refused, so a refusal leaves no rows behind — which is the difference
         between this branch and the four-branch rollback it replaced. */
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
     *
     * This is now also the reservation's persistence check. Under R-26 the two
     * cannot disagree — one transaction writes both — so a stage that moved is
     * a booking that holds its stock, and there is no separate rollback to run
     * when it did not.
     */
    const persisted = await readStage(booking.id)
    if (persisted !== to) {
      /*
       * ⚠ The units are held and the booking did NOT move. Release them.
       *
       * This branch was missed when Auto Assign Serials was first wired and a
       * test caught it — and it is the *more likely* of the two failures, not
       * the exotic one: it is the path `idempotentInsert` takes when a write is
       * queued offline or swallowed by the `'Failed to fetch'` / 408 branch
       * (`dataAccess.ts:49-53`), which fires even when `navigator.onLine` is
       * true. Without this, a confirm that visibly failed would leave every
       * unit on the booking held against a Quote, invisibly, until someone
       * found them by hand.
       */
      await Promise.all([
        releaseReservations(
          reservation.reservationIds,
          `Rolled back: ${booking.booking_no} did not reach ${to} — the confirm was queued or rejected.`,
        ),
        releaseBookingLineUnits(
          reservation.unitRowIds,
          `Rolled back: ${booking.booking_no} did not reach ${to} — the confirm was queued or rejected.`,
        ),
      ])
      throw new Error(
        `${booking.booking_no} is still at ${persisted ?? 'an unreadable stage'} — the confirm was queued or ` +
          'rejected rather than applied, so treat the booking as NOT confirmed. Nothing is held against it. ' +
          'Check the connection and try again.',
      )
    }

    /* What the DATABASE holds, not what this action intended — see
       `readHeldForBooking`. Read after the commit, like the stage above. */
    const held = await readHeldForBooking(booking.id)

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
        unitsReserved: held.units,
        quantityReserved: held.quantityReserved,
        quantityHolds: held.quantityHolds,
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
            unitsReserved: held.units,
            quantityReserved: held.quantityReserved,
            quantityHolds: held.quantityHolds,
            occurredAt,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const confirmRental = createAction(confirmRentalConfig)
