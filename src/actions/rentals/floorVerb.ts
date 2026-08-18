import { supabase } from '../../lib/supabase'
import { generateClientUuid, idempotentInsert, safeUpdate } from '../../lib/dataAccess'
import { applyBookingTransition } from '../../lib/bookingTransition'
import { logAuditEvent } from '../../lib/audit'
import { JOBS, type BookingStatus, type JobName } from '../../lib/workflow'
import type { ActionContext } from '../core'
import type {
  DeliveryMethod,
  HandoverLineState,
  ItemCondition,
  ItemQuantityState,
  NotReturnedDecision,
  OperationKind,
  PackingLineState,
  ReturnLineState,
} from '../../types/database'

/**
 * # The four floor verbs, as one shape
 *
 * `Pack · Handover · Return · Reset` are not four transactions. They are one
 * transaction parameterised by `JOBS` (`src/lib/workflow.ts` §1.5), which
 * already holds every difference between them as data:
 *
 * ```
 *          runsAt      sets        so this file
 * Pack     Booked      Packed      guards the stage, writes a Packing session, advances
 * Handover Packed      On Rent     guards the stage, writes a Handover session, advances
 * Return   On Rent     Returned    guards the stage, writes a Return session, advances
 * Reset    Returned    null        guards the stage, writes the queue, advances NOTHING
 * ```
 *
 * The body is therefore written once:
 *
 *  1. **Resolve** the booking from a uuid or a `B-` number, reading no money.
 *  2. **Refuse** unless `bookings.stage === JOBS[job].runsAt`. That one clause
 *     is also the replay guard for the three session verbs: completing one
 *     advances the stage, so a double-submit finds the booking already past
 *     `runsAt` and is refused **by name** rather than writing a second session.
 *  3. **Write the operational record** — an `operation_sessions` row plus its
 *     line table and `session_line_movements`; for Reset the per-item
 *     `cleaning_queue_entries` rows, because Reset has no session at all.
 *  4. **Advance the stage** through `applyBookingTransition`, i.e. an INSERT
 *     into `booking_stage_transitions`, whose trigger (`0021`) is the only
 *     writer of `bookings.stage` — `0021:199` revokes that column from
 *     `authenticated`, so a hand-written UPDATE would be rejected anyway.
 *
 * ## Law 6 — nothing here reads or writes money
 *
 * These are the warehouse-facing verbs and Warehouse is money-blind. Every
 * SELECT below names its columns, and none of them is a money column:
 * `booking_lines.rate`, `discount_amount`, `supplier_cost` and `markup_amount`
 * are never selected, so a later `select('*')` cannot leak one by accident.
 *
 * ## Why the session is opened, filled, then closed — in that order
 *
 * `0003_operations.sql:174` wants session close to be one transaction, and
 * PostgREST offers no client-side transaction to put it in. Rather than pretend,
 * the write order is chosen so that **every partial failure leaves a truthful
 * residue**: the session is inserted `'In Progress'`, its lines and movements
 * are written into it — which is also what `0003:235` requires, movements may
 * only be written while the parent session is In Progress — and only then is it
 * marked `'Completed'` and the stage moved. A failure half-way leaves an open
 * session someone can see and finish. It never leaves a booking that changed
 * stage on work that was not recorded.
 *
 * That residue is only useful if the next attempt picks it up, so step 4 resumes
 * an `'In Progress'` session instead of opening a second one —
 * `operation_sessions_one_in_progress` (`0003:150`) would refuse a second one
 * anyway. And a session is closed only when the verb's own close gate is met,
 * except where the operation is explicitly multi-session; see
 * `CLOSES_WHILE_INCOMPLETE`, which is where the Pack case is argued.
 *
 * ## What this file deliberately does NOT do
 *
 * - **It does not evaluate the six session gates** (`0003:161-171`). Receiver
 *   verification, payment and deposit clearance, signatures and mandatory
 *   evidence are the workspace's gates, and three of them are money facts a
 *   money-blind verb may not read. They belong in the triggers `0003` marks
 *   `TRIGGER REQUIRED` and has never had. `TODO(decision)` — until those exist,
 *   this writes what the caller states happened and nothing more.
 * - **It does not set `bookings.actual_return_at`** (`0002:33`). `bookings` is
 *   Booqable-mastered (`dataAccess.ts:216`), so the generic write path refuses
 *   it by design, and the bridge's `pushOrderStop` takes a sign-off boolean this
 *   module cannot derive. Reaching past that with a raw `safeUpdate` would dodge
 *   an ownership rule the codebase states twice. `TODO(decision)`.
 * - **It does not write a `Partial Pickup` flag.** `0003:340` wants one when a
 *   handover leaves lines Remaining; `0015:52-59` records that flag storage does
 *   not exist in this schema — `booking_flags`' CHECK admits four values and
 *   that is not one of them. The partial handover records itself fully and the
 *   stage simply stays at Packed. `TODO(decision)`.
 */

/* ── Input ──────────────────────────────────────────────────────────────── */

/** What happened to one booking line under this verb. Two outcomes, no third. */
export type FloorLineOutcome = 'done' | 'missing'

/**
 * One booking line, as the floor resolved it — the same shape for Pack,
 * Handover and Return, each mapping `outcome` onto its own line-state enum.
 *
 * Nothing here is inferred from the booking. A line the caller does not name is
 * a line nobody touched, and `0003:630` is explicit that absence is never
 * converted into a state.
 */
export interface FloorLineInput {
  /** `booking_lines.id` — a uuid. Must be a live line of this booking. */
  bookingLineId: string
  /** Default `'done'`. `'missing'` requires `reason`. */
  outcome?: FloorLineOutcome
  /** `product_units.id` per scanned serialised unit — one movement row each. */
  unitIds?: readonly string[]
  /** Serials, paired positionally with `unitIds` when both are given. */
  serials?: readonly string[]
  /**
   * Non-serialised lines only — the manually entered count. Ignored when
   * `unitIds`/`serials` are present, because then the count is the scan count.
   * Omitted on a `'done'` line means the line's whole required quantity.
   */
  qty?: number
  /** ≥ 10 characters — the DB CHECK behind every `missing_reason` in `0003`. */
  reason?: string
  /** Return only. Single-select; supplying it marks the line Inspected. */
  condition?: ItemCondition
  /** Return only, and mandatory on a `'missing'` line (`0003:378`). */
  notReturnedDecision?: NotReturnedDecision
  /** Pack only — the shelf the items came off. */
  warehouseLocation?: string
}

export interface FloorVerbInput {
  /**
   * `bookings.id` (uuid) or `bookings.booking_no` (`B-` + digits).
   *
   * ⚠ Corrected 15 Aug 2026 — this said `BK-YYYY-NNNN`. See the same correction
   * in `confirmRental.ts` above `UUID_RE` for the live CHECK it was read
   * against; nothing here depended on the shape, only on "uuid or not".
   */
  bookingRef: string
  /** Pack / Handover / Return. Required — an empty list is refused. */
  lines?: readonly FloorLineInput[]
  /** Reset only: `cleaning_queue_entries.unit_id` for each item that was reset. */
  unitIds?: readonly string[]
  /** Free text onto `operation_sessions.notes` (`0003:80`). Ignored by Reset, which has no session. */
  notes?: string
  /** Law 8 — the action key, minted where the user acted, not at send time. */
  clientUuid?: string
  /** AD/UTC (Law 7). Defaults to now. */
  occurredAt?: string
}

export interface FloorVerbResult {
  success: true
  /** The booking's uuid, whatever form `bookingRef` arrived in. */
  bookingId: string
  /** `operation_sessions.id`, or `null` for Reset, which has no session. */
  sessionId: string | null
  /**
   * Whether that session was closed. `false` means it was deliberately left
   * `'In Progress'` because lines remain — the Pack case (`0003:174`), where the
   * same session is resumed rather than a second one opened — and `null` for
   * Reset, which has no session to close. Stated rather than implied: a caller
   * that read `success: true` as "the session is finished" would be wrong.
   */
  sessionClosed: boolean | null
  /** Rows written or updated in this verb's line table. */
  lines: number
  /** Rows written to `session_line_movements`. */
  movements: number
  /** Queue entries whose `reset_completed_at` was set. Reset only. */
  unitsReset: number
  /** The stage move that landed, or `null` when none was made. */
  stage: { from: BookingStatus; to: BookingStatus } | null
  /**
   * `booking_lines.id`s that are not yet at a terminal state for this verb, and
   * are therefore why `stage` is `null`. Empty when the stage moved, and always
   * empty for Reset, which sets no stage by design (§1.5).
   */
  stageHeldBy: readonly string[]
}

/* ── Static per-verb facts ──────────────────────────────────────────────── */

/**
 * `operation_sessions.operation` for each verb.
 *
 * ⚠ Deliberately NOT `JOBS[job].sessions`. `workflow.ts:90` says "Handover and
 * Return are session-based; Pack and Reset are not", but `0003_operations.sql`
 * disagrees for Pack: `operation_sessions_operation_is_a_session` (:88) admits
 * `'Packing'`, and `operation_sessions_one_packing_per_booking` (:152) exists
 * precisely to cap Packing at **one** session per booking. Read together,
 * `sessions: false` on Pack means "not multi-session", not "no row" — Reset is
 * the only verb with genuinely no session (`0003:855-857`). This file writes to
 * the database, so it is keyed on the database. `TODO(decision)`:
 * `workflow.ts`'s wording should be narrowed to say that.
 */
const SESSION_OPERATION: Record<JobName, OperationKind | null> = {
  Pack: 'Packing',
  Handover: 'Handover',
  Return: 'Return',
  Reset: null,
}

/** The line table each session verb owns. Reset owns none — it has no lines. */
const LINE_TABLE = {
  Pack: 'packing_lines',
  Handover: 'handover_lines',
  Return: 'return_lines',
} as const

/**
 * The line states that satisfy this verb, straight out of `0003`'s own close
 * gates: Packing `:170`, Handover `:340`, Return `:399`. A line short of one of
 * these is why a stage does not move.
 */
const TERMINAL_LINE_STATES: Record<keyof typeof LINE_TABLE, readonly string[]> = {
  Pack: ['Packed', 'Missing', 'Not Required', 'Replaced'],
  Handover: ['Picked Up', 'Missing'],
  Return: ['Returned', 'Not Returned'],
}

/**
 * May this verb's session close while lines are still short of the states above?
 *
 * **Pack: no, and this is not a preference.** `0003:174` — "a Packing session
 * may not close unless every required `packing_lines` row is Packed,
 * Missing-with-reason, or Replaced" — and `operation_sessions_one_packing_per_booking`
 * (`0003:156`) is a unique index allowing a booking exactly **one** Packing
 * session, ever. Closing a partial pack therefore spends the only session the
 * booking is allowed and leaves it permanently unpackable: the next Complete
 * Packing is refused by a unique-constraint violation, not by any rule an
 * operator can read. The session stays `'In Progress'` and the next pack resumes
 * it — which is also what `0003:235` requires, since movements may only be
 * written while the parent session is In Progress.
 *
 * **Handover and Return: yes.** They are multi-session by design — `0003:129`,
 * the morning collection is 1 and the evening collection is 2 — so a collection
 * that leaves lines Remaining closes on its own and the next one opens beside
 * it. `0003:181` is explicit that "Items Handed Over"/"Items Returned" are
 * booking conditions deciding the stage and "must never block a close".
 */
const CLOSES_WHILE_INCOMPLETE: Record<keyof typeof LINE_TABLE, boolean> = {
  Pack: false,
  Handover: true,
  Return: true,
}

/** `0003:224-227` — the resulting item state is fixed by the parent operation. */
const MOVEMENT_STATE: Record<JobName, ItemQuantityState | null> = {
  Pack: null, // "Packing does not move the item out of the warehouse."
  Handover: 'Picked Up',
  Return: 'Returned', // narrowed per line by `returnMovementState`
  Reset: null,
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIN_REASON = 10

type SessionJob = keyof typeof LINE_TABLE

function isSessionJob(job: JobName): job is SessionJob {
  return SESSION_OPERATION[job] !== null
}

/* ── Reads. Every one names its columns; none names a money column. ─────── */

interface BookingHead {
  id: string
  booking_no: string
  branch_id: string
  stage: BookingStatus
  /**
   * `bookings.delivery_type` (`0002:34`), copied onto
   * `operation_sessions.delivery_method` (`0003:61`), which a Handover session
   * must carry (CHECK :91). Two enum names, identical members —
   * `0001_enums.sql:33-38` and `:279-284` — so this is a faithful copy, not a
   * mapping table someone has to keep in step.
   */
  delivery_type: DeliveryMethod
  cancelled_at: string | null
  closed_at: string | null
}

interface BookingLineHead {
  id: string
  qty: number
}

async function readBooking(bookingRef: string): Promise<BookingHead> {
  const column = UUID_RE.test(bookingRef) ? 'id' : 'booking_no'
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_no, branch_id, stage, delivery_type, cancelled_at, closed_at')
    .eq(column, bookingRef)
    .maybeSingle()

  if (error) throw new Error(`Could not read booking ${bookingRef}: ${error.message}`)
  if (!data) throw new Error(`No booking matches ${bookingRef}. Nothing was written.`)
  return data as BookingHead
}

/** Live lines only — `voided_at` is Law 3's terminal state, and a voided line is not packed. */
async function readBookingLines(bookingId: string): Promise<BookingLineHead[]> {
  const { data, error } = await supabase
    .from('booking_lines')
    .select('id, qty')
    .eq('booking_id', bookingId)
    .is('voided_at', null)

  if (error) throw new Error(`Could not read the lines of booking ${bookingId}: ${error.message}`)
  return (data ?? []) as BookingLineHead[]
}

/**
 * The verb's existing line rows, keyed by `booking_line_id`.
 *
 * All three line tables carry `unique (booking_line_id)` — `0003:271`, `:323`,
 * `:376` — so a line has **one** row for the whole booking, not one per session.
 * Handover and Return can run several sessions (`0003:129`, staggered
 * collection), so the second session must UPDATE the row the first one wrote.
 * Inserting again would hit that unique constraint, and because it is not the
 * `client_uuid` constraint, `idempotentInsert` would throw rather than resolve.
 */
async function readLineRows(
  job: SessionJob,
  bookingLineIds: readonly string[],
): Promise<Map<string, { id: string; state: string }>> {
  if (bookingLineIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from(LINE_TABLE[job])
    .select('id, booking_line_id, state')
    .in('booking_line_id', [...bookingLineIds])

  if (error) throw new Error(`Could not read existing ${LINE_TABLE[job]}: ${error.message}`)
  const rows = (data ?? []) as Array<{ id: string; booking_line_id: string; state: string }>
  return new Map(rows.map((r) => [r.booking_line_id, { id: r.id, state: r.state }]))
}

/**
 * The booking's most recent session for this operation, or `null` when it has
 * none. Two facts come off that one row, and both are read rather than assumed:
 *
 *  - `session_no` is 1-based within `(booking_id, operation)` and carries a
 *    unique constraint (`0003:85`) — the morning collection is 1, the evening
 *    collection is 2 — so the next one is this one plus one.
 *  - `state`, because a session still `'In Progress'` is **resumed, not
 *    replaced**. `operation_sessions_one_in_progress` (`0003:150`) is a unique
 *    index on `(booking_id, operation) where state = 'In Progress'`, so opening
 *    a second one beside it is not something the database offers.
 */
async function readLatestSession(
  bookingId: string,
  operation: OperationKind,
): Promise<{ id: string; session_no: number; state: string; notes: string | null } | null> {
  const { data, error } = await supabase
    .from('operation_sessions')
    // `notes` so a resumed session can keep what the earlier pass wrote; no
    // money column appears here or anywhere else in this file (Law 6).
    .select('id, session_no, state, notes')
    .eq('booking_id', bookingId)
    .eq('operation', operation)
    .order('session_no', { ascending: false })
    .limit(1)

  if (error) throw new Error(`Could not read existing ${operation} sessions: ${error.message}`)
  const rows = (data ?? []) as Array<{ id: string; session_no: number; state: string; notes: string | null }>
  return rows[0] ?? null
}

/* ── Validation — everything judgeable without a round trip ─────────────── */

/** Runs inside each action's `validate`, so it fires before `execute` and before any write. */
export function validateFloorVerb(job: JobName, input: FloorVerbInput): void {
  if (!input.bookingRef || input.bookingRef.trim() === '') {
    throw new Error('A booking reference is required — pass the booking uuid or its B- number.')
  }

  if (!isSessionJob(job)) {
    if (!input.unitIds || input.unitIds.length === 0) {
      throw new Error(
        'Reset is recorded per item, not per booking (0003:899), so it needs the unit ids that were reset. ' +
          'None were supplied, so nothing was written.',
      )
    }
    return
  }

  const lines = input.lines ?? []
  if (lines.length === 0) {
    throw new Error(
      `${job} needs the booking lines it resolved — an empty list would open a session claiming work on nothing.`,
    )
  }

  const seen = new Set<string>()
  for (const line of lines) {
    if (!line.bookingLineId) throw new Error(`${job}: every line must name a booking_lines id.`)
    if (seen.has(line.bookingLineId)) {
      throw new Error(
        `${job}: booking line ${line.bookingLineId} appears twice. Each line table holds one row per ` +
          'booking line (0003:271/:323/:376), so the second would be rejected by the database.',
      )
    }
    seen.add(line.bookingLineId)

    const outcome = line.outcome ?? 'done'
    if (outcome === 'missing') {
      if ((line.reason ?? '').trim().length < MIN_REASON) {
        throw new Error(
          `${job}: a missing line needs a reason of at least ${MIN_REASON} characters ` +
            `(booking line ${line.bookingLineId}). That is a database CHECK, not a form rule.`,
        )
      }
      if (job === 'Return' && line.notReturnedDecision === undefined) {
        throw new Error(
          'Return: a Not Returned line needs both a reason and a decision (0003:378) — booking line ' +
            `${line.bookingLineId} has no decision. One of 'Still expected', 'Charge replacement', ` +
            "'Insurance claim', 'Write off'.",
        )
      }
    }

    if (line.qty !== undefined && line.qty <= 0) {
      throw new Error(`${job}: qty must be greater than zero (booking line ${line.bookingLineId}).`)
    }
    if (line.condition !== undefined && job !== 'Return') {
      throw new Error(`${job}: a condition is recorded at Return inspection only (0003:387).`)
    }
  }
}

/* ── Per-line derivation ────────────────────────────────────────────────── */

interface ScannedUnit {
  unitId: string | null
  serial: string | null
}

/**
 * The units this line moved. A serialised line names them; a non-serialised line
 * resolves no `unit_id` at all (`0003:238`) and moves as one quantity entry.
 */
function scannedUnits(line: FloorLineInput): ScannedUnit[] {
  const unitIds = line.unitIds ?? []
  const serials = line.serials ?? []
  if (unitIds.length > 0) {
    return unitIds.map((unitId, i) => ({ unitId, serial: serials[i] ?? null }))
  }
  return serials.map((serial) => ({ unitId: null, serial }))
}

/** Scans first, then a stated count, then the line's full required quantity. */
function movedQty(line: FloorLineInput, required: number): number {
  const scans = scannedUnits(line).length
  if (scans > 0) return scans
  if (line.qty !== undefined) return line.qty
  return required
}

/** `0003:225` — a Return movement lands in one of three states, chosen by what the line says. */
function returnMovementState(line: FloorLineInput): ItemQuantityState {
  if ((line.outcome ?? 'done') === 'missing') return 'Missing'
  if (line.condition === 'Damaged') return 'Damaged'
  if (line.condition === 'Lost') return 'Missing'
  return 'Returned'
}

/* ── The one body ───────────────────────────────────────────────────────── */

export async function runFloorVerb(
  job: JobName,
  input: FloorVerbInput,
  ctx: ActionContext,
): Promise<FloorVerbResult> {
  const meta = JOBS[job]
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const actionUuid = input.clientUuid ?? generateClientUuid()

  /* 1 — the booking, and the three refusals that precede every write. */
  const booking = await readBooking(input.bookingRef)

  if (booking.cancelled_at !== null) {
    throw new Error(`${booking.booking_no} was cancelled on ${booking.cancelled_at}. ${job} does not run on it.`)
  }
  if (booking.closed_at !== null) {
    throw new Error(`${booking.booking_no} is Closed. Closed is final (0002:96) — nothing further is recorded.`)
  }
  if (booking.stage !== meta.runsAt) {
    throw new Error(
      `${job} runs at stage ${meta.runsAt}; ${booking.booking_no} is at ${booking.stage}. ` +
        'Nothing was written. If this is a repeat submit, the first one already landed.',
    )
  }

  /* 2 — Reset has no session. It is the queue, per item. */
  if (!isSessionJob(job)) {
    const unitsReset = await completeResetQueue(booking, input.unitIds ?? [], ctx, occurredAt, actionUuid)
    return {
      success: true,
      bookingId: booking.id,
      sessionId: null,
      sessionClosed: null,
      lines: 0,
      movements: 0,
      unitsReset,
      stage: null,
      stageHeldBy: [],
    }
  }

  const operation = SESSION_OPERATION[job] as OperationKind
  const lines = input.lines ?? []

  /* 3 — every named line must be a live line of THIS booking. */
  const live = await readBookingLines(booking.id)
  const requiredByLine = new Map(live.map((l) => [l.id, l.qty]))
  const strangers = lines.filter((l) => !requiredByLine.has(l.bookingLineId)).map((l) => l.bookingLineId)
  if (strangers.length > 0) {
    throw new Error(
      `${job}: ${strangers.length} line id(s) are not live lines of ${booking.booking_no} — ` +
        `${strangers.join(', ')}. Nothing was written.`,
    )
  }

  /* 4 — open the session, or resume the one that is already open.
   *
   *     A session left `'In Progress'` — by a pack that could not finish every
   *     line, or by a failure half-way through step 5 — is exactly the residue
   *     the write order below exists to leave, and `operation_sessions_one_in_progress`
   *     (`0003:150`) means the database will not accept a second one beside it.
   *     So it is resumed, not replaced. When a new session IS opened its id is
   *     minted here rather than read back, so the child rows can point at it even
   *     on the offline path, where `idempotentInsert` queues the write and
   *     returns the payload instead of a server-assigned row. */
  const latest = await readLatestSession(booking.id, operation)
  const resumed = latest !== null && latest.state === 'In Progress' ? latest : null
  const sessionId = resumed?.id ?? generateClientUuid()

  if (resumed === null) {
    await idempotentInsert('operation_sessions', {
      id: sessionId,
      client_uuid: actionUuid,
      booking_id: booking.id,
      operation,
      session_no: (latest?.session_no ?? 0) + 1,
      state: 'In Progress',
      started_at: occurredAt,
      started_by: ctx.userId,
      warehouse_staff_id: ctx.userId,
      // CHECK :91 is an equivalence — non-null on Handover, null on everything else.
      delivery_method: operation === 'Handover' ? booking.delivery_type : null,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      created_by: ctx.userId,
    })
  } else if (input.notes !== undefined) {
    // The resumed session already exists, so a note typed on THIS pass has no
    // insert to ride in on and would otherwise be dropped on the floor. Appended
    // rather than written over: both passes' words are the operator's own.
    const merged = [resumed.notes, input.notes].filter((n) => n !== null && n !== '').join('\n')
    await safeUpdate('operation_sessions', sessionId, { notes: merged, updated_at: occurredAt }, actionUuid)
  }

  /* 5 — the line rows and their movements. */
  const existing = await readLineRows(
    job,
    lines.map((l) => l.bookingLineId),
  )
  let movements = 0

  for (const line of lines) {
    const required = requiredByLine.get(line.bookingLineId) ?? 0
    const moved = movedQty(line, required)
    const priorId = existing.get(line.bookingLineId)?.id ?? null

    if (job === 'Pack') await writePackingLine(sessionId, line, required, moved, ctx, occurredAt, priorId, actionUuid)
    else if (job === 'Handover')
      await writeHandoverLine(sessionId, line, required, moved, ctx, occurredAt, priorId, actionUuid)
    else await writeReturnLine(sessionId, line, required, moved, ctx, occurredAt, priorId, actionUuid)

    // Absence is never converted into a state (0003:630): a line marked missing,
    // or one nothing moved on, produces no movement row.
    if ((line.outcome ?? 'done') === 'done' && moved > 0) {
      movements += await writeMovements(job, sessionId, line, moved, ctx, occurredAt)
    }
  }

  /* 6 — one question, asked once, answering two things: has every live line of
   *     the booking reached a state this verb calls terminal? It decides whether
   *     the session may close AND whether the stage may move, and asking it once
   *     is what keeps those two from ever disagreeing. */
  const heldBy = await linesShortOfTerminal(job, live)
  const complete = heldBy.length === 0

  /* 7 — close the session, unless this is the verb that may not close short.
   *     See `CLOSES_WHILE_INCOMPLETE`: sealing a partial pack would spend the
   *     one Packing session the booking is allowed. Only a closed session is a
   *     completed fact; an open one is work someone can still see and finish. */
  const closed = complete || CLOSES_WHILE_INCOMPLETE[job]
  if (closed) {
    await safeUpdate(
      'operation_sessions',
      sessionId,
      { state: 'Completed', completed_at: occurredAt, completed_by: ctx.userId, updated_at: occurredAt },
      actionUuid,
    )
  }

  /* TODO(decision) §4.36 — this is THE call site the ruling is about.
   *
   * `operation_sessions` carries no audit trigger, so this row is the only
   * record that the session happened and who closed it. Until 16 Aug 2026 a
   * failure here was invisible: `logAuditEvent` returned void and swallowed it,
   * so a Warehouse actor finished a return, saw success, and left no trace.
   *
   * It is now reportable. What to DO about a failure is the open ruling — fail
   * the verb with it, or proceed and surface a banner until the row drains. The
   * verb deliberately still PROCEEDS, exactly as before, so nothing here
   * pre-empts the answer. When §4.36 is ruled, this branch is where it lands. */
  const sessionAudit = await logAuditEvent({
    eventClass: 'session',
    category: 'Rentals',
    module: 'Operations',
    action: 'Update',
    severity: 'Informational',
    tableName: 'operation_sessions',
    recordId: sessionId,
    actorId: ctx.userId,
    actorRole: ctx.role,
    branchId: booking.branch_id,
    // The state the session is actually in, not the one the verb was aiming at.
    newValues: { operation, state: closed ? 'Completed' : 'In Progress', lines: lines.length, movements },
  })
  if (!sessionAudit.ok) {
    console.error(
      `[floorVerb] ${operation} on ${booking.booking_no} completed with NO audit row for session ${sessionId}.`,
      sessionAudit.error,
    )
  }

  /* 8 — the stage, through the transition trigger and nothing else. */
  const stage = complete ? await advanceStage(job, booking, ctx, actionUuid, occurredAt) : null

  return {
    success: true,
    bookingId: booking.id,
    sessionId,
    sessionClosed: closed,
    lines: lines.length,
    movements,
    unitsReset: 0,
    stage,
    stageHeldBy: heldBy,
  }
}

/* ── Line writers, one per verb ─────────────────────────────────────────── */

async function writePackingLine(
  sessionId: string,
  line: FloorLineInput,
  required: number,
  moved: number,
  ctx: ActionContext,
  at: string,
  priorId: string | null,
  actionUuid: string,
): Promise<void> {
  const outcome = line.outcome ?? 'done'
  // `0003:289` — Packed only at full quantity, Partial strictly between.
  const state: PackingLineState = outcome === 'missing' ? 'Missing' : moved >= required ? 'Packed' : 'Partial'
  /**
   * ⚠ An INFERENCE, and the only one in this file — named so nobody mistakes it
   * for a fact. `0003:292` wants `qty_packed_entered` NULL on serialised booking
   * lines and non-null on non-serialised ones, but the tracking mode lives on
   * `products.tracking_mode`, which a money-blind verb is not reading here.
   * "The caller named units" is used as the stand-in. It is right whenever a
   * serialised line was actually scanned, and wrong for a serialised line packed
   * without scanning — which is the case `0003:292`'s trigger exists to reject,
   * and it does not exist yet. `TODO(decision)`: either read the tracking mode
   * on the line query or let the trigger be the arbiter, but do not leave a
   * heuristic standing in for a column indefinitely.
   */
  const serialised = scannedUnits(line).some((u) => u.unitId !== null)

  const fields = {
    state,
    qty_required: required,
    // `0003:280` — the manually entered count, non-serialised lines only. A
    // serialised line's packed count is summed from session_line_movements.
    qty_packed_entered: serialised || outcome === 'missing' ? null : moved,
    ...(line.warehouseLocation === undefined ? {} : { warehouse_location: line.warehouseLocation }),
    ...(outcome === 'missing'
      ? { missing_reason: line.reason ?? null }
      : { packed_at: at, packed_by: ctx.userId }),
  }

  if (priorId !== null) {
    await safeUpdate('packing_lines', priorId, { ...fields, updated_at: at }, actionUuid)
    return
  }
  await idempotentInsert('packing_lines', {
    client_uuid: generateClientUuid(),
    session_id: sessionId,
    booking_line_id: line.bookingLineId,
    created_by: ctx.userId,
    ...fields,
  })
}

async function writeHandoverLine(
  sessionId: string,
  line: FloorLineInput,
  required: number,
  moved: number,
  ctx: ActionContext,
  at: string,
  priorId: string | null,
  actionUuid: string,
): Promise<void> {
  const outcome = line.outcome ?? 'done'
  // `0003:336` — Picked Up is reachable only at full quantity. Short of that the
  // line stays Remaining for a later session; staggered collection is normal.
  const state: HandoverLineState = outcome === 'missing' ? 'Missing' : moved >= required ? 'Picked Up' : 'Remaining'

  const fields = {
    state,
    qty_required: required,
    ...(outcome === 'missing' ? { missing_reason: line.reason ?? null } : {}),
    // `0003:331` — the session that took the LAST unit, so only a completed line stamps it.
    ...(state === 'Picked Up' ? { completed_session_id: sessionId, picked_up_at: at } : {}),
  }

  if (priorId !== null) {
    // `first_session_id` is deliberately not in the update: the first session
    // that touched this line is a fact the second session must not overwrite.
    await safeUpdate('handover_lines', priorId, { ...fields, updated_at: at }, actionUuid)
    return
  }
  await idempotentInsert('handover_lines', {
    client_uuid: generateClientUuid(),
    booking_line_id: line.bookingLineId,
    first_session_id: sessionId,
    created_by: ctx.userId,
    ...fields,
  })
}

async function writeReturnLine(
  sessionId: string,
  line: FloorLineInput,
  required: number,
  moved: number,
  ctx: ActionContext,
  at: string,
  priorId: string | null,
  actionUuid: string,
): Promise<void> {
  const outcome = line.outcome ?? 'done'
  // `return_line_state` has no partial member (`0001:74`), so a part-received
  // line is still Outstanding — which is exactly what it is.
  const state: ReturnLineState = outcome === 'missing' ? 'Not Returned' : moved >= required ? 'Returned' : 'Outstanding'
  const condition = line.condition

  const fields = {
    state,
    qty_expected: required,
    // `0003:391` — the session that received the line, the last one where
    // receipt is split across loads, so this IS overwritten on a later session.
    session_id: sessionId,
    ...(state === 'Returned' ? { returned_at: at } : {}),
    // CHECK :382 — Inspected needs condition, inspector and time together or not at all.
    ...(condition === undefined
      ? {}
      : {
          inspection_state: 'Inspected' as const,
          condition,
          inspected_by: ctx.userId,
          inspected_at: at,
        }),
    ...(outcome === 'missing'
      ? { not_returned_reason: line.reason ?? null, not_returned_decision: line.notReturnedDecision ?? null }
      : {}),
  }

  if (priorId !== null) {
    await safeUpdate('return_lines', priorId, { ...fields, updated_at: at }, actionUuid)
    return
  }
  await idempotentInsert('return_lines', {
    client_uuid: generateClientUuid(),
    booking_line_id: line.bookingLineId,
    created_by: ctx.userId,
    ...fields,
  })
}

/**
 * One movement per scanned serialised unit, or one quantity movement for a
 * non-serialised line. `0003:190` states exactly that split and adds that every
 * partial-quantity counter in all three workspaces sums from this table.
 */
async function writeMovements(
  job: SessionJob,
  sessionId: string,
  line: FloorLineInput,
  moved: number,
  ctx: ActionContext,
  at: string,
): Promise<number> {
  const resulting = job === 'Return' ? returnMovementState(line) : MOVEMENT_STATE[job]
  const scans = scannedUnits(line)

  if (scans.length === 0) {
    await idempotentInsert('session_line_movements', {
      client_uuid: generateClientUuid(),
      session_id: sessionId,
      booking_line_id: line.bookingLineId,
      qty: moved,
      resulting_item_state: resulting,
      moved_at: at,
      created_by: ctx.userId,
    })
    return 1
  }

  for (const scan of scans) {
    await idempotentInsert('session_line_movements', {
      client_uuid: generateClientUuid(),
      session_id: sessionId,
      booking_line_id: line.bookingLineId,
      unit_id: scan.unitId,
      serial: scan.serial,
      qty: 1,
      resulting_item_state: resulting,
      moved_at: at,
      created_by: ctx.userId,
    })
  }
  return scans.length
}

/* ── Reset — the queue, per item, no session ────────────────────────────── */

/**
 * `0003:855-857` — "Reset and Cleaning are two modes of this one workspace,
 * which is why neither has a session." So Reset writes `reset_completed_at` on
 * the entries that were reset, and nothing else:
 *
 *  - it does not move `state` to `'Ready'`, which `0003:916` reaches only when
 *    every required checklist task is ticked, `problem_state` is clean and the
 *    required evidence exists — three facts this verb is not told;
 *  - it does not create queue entries. An entry is raised by the Return flow and
 *    carries `return_line_id`; minting one here would be inventing the work.
 */
async function completeResetQueue(
  booking: BookingHead,
  unitIds: readonly string[],
  ctx: ActionContext,
  at: string,
  actionUuid: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('cleaning_queue_entries')
    .select('id, unit_id, requires_reset, reset_completed_at')
    .eq('booking_id', booking.id)
    .in('unit_id', [...unitIds])

  if (error) throw new Error(`Could not read the reset queue for ${booking.booking_no}: ${error.message}`)

  const entries = (data ?? []) as Array<{
    id: string
    unit_id: string
    requires_reset: boolean
    reset_completed_at: string | null
  }>

  const found = new Set(entries.map((e) => e.unit_id))
  const unqueued = unitIds.filter((u) => !found.has(u))
  if (unqueued.length > 0) {
    throw new Error(
      `${unqueued.length} unit(s) are not in ${booking.booking_no}'s reset queue — ${unqueued.join(', ')}. ` +
        'A reset is completed against a queued item; nothing was written.',
    )
  }

  // CHECK :895 — reset_completed_at may only be set where requires_reset.
  const notRequired = entries.filter((e) => !e.requires_reset).map((e) => e.unit_id)
  if (notRequired.length > 0) {
    throw new Error(
      `${notRequired.length} unit(s) do not require a reset — ${notRequired.join(', ')}. ` +
        'The database rejects reset_completed_at on them (0003:895). Nothing was written.',
    )
  }

  const pending = entries.filter((e) => e.reset_completed_at === null)
  if (pending.length === 0) {
    throw new Error(
      `Every named unit on ${booking.booking_no} was already reset. Nothing was written — this is a repeat submit.`,
    )
  }

  for (const entry of pending) {
    await safeUpdate('cleaning_queue_entries', entry.id, { reset_completed_at: at, updated_at: at }, actionUuid)
    // Per item, never per batch (`0003:911`) — and so is its audit row.
    // TODO(decision) §4.36, same ruling as the session row above. Note the extra
    // wrinkle here: the `safeUpdate` on the line before has already committed,
    // so "fail the verb with it" would have to mean failing PART WAY THROUGH a
    // loop that has written earlier entries. Whoever rules §4.36 should rule
    // this shape too rather than let it be inferred at the call site.
    const entryAudit = await logAuditEvent({
      eventClass: 'session',
      category: 'Rentals',
      module: 'Operations',
      action: 'Update',
      severity: 'Informational',
      tableName: 'cleaning_queue_entries',
      recordId: entry.id,
      actorId: ctx.userId,
      actorRole: ctx.role,
      branchId: booking.branch_id,
      newValues: { reset_completed_at: at, unit_id: entry.unit_id },
    })
    if (!entryAudit.ok) {
      console.error(
        `[floorVerb] Reset committed on cleaning_queue_entries ${entry.id} with NO audit row.`,
        entryAudit.error,
      )
    }
  }

  return pending.length
}

/* ── The stage, and the cases where it deliberately does not move ───────── */

/**
 * The verb's close gate: which of the booking's **live** lines have not reached
 * a state this verb calls terminal (`TERMINAL_LINE_STATES`, which is `0003`'s
 * own close-gate list per operation). Empty means the verb is finished.
 *
 * One rule covering three real situations the specs describe separately: a
 * packing session that could not finish every line, a staggered collection that
 * leaves lines Remaining (`0003:340`), and a return with a line still
 * Outstanding (`0003:399`). None of those is an error — the session records
 * itself in full and the booking simply stays where it is, which the caller
 * reads off `stage: null` plus `stageHeldBy`.
 *
 * Note it asks about every live line of the booking, not only the lines this
 * call named: a second collection finishes what the first one left.
 */
async function linesShortOfTerminal(job: SessionJob, live: readonly BookingLineHead[]): Promise<string[]> {
  const liveIds = live.map((l) => l.id)
  const rows = await readLineRows(job, liveIds)
  const terminal = TERMINAL_LINE_STATES[job]
  return liveIds.filter((id) => {
    const row = rows.get(id)
    return row === undefined || !terminal.includes(row.state)
  })
}

/**
 * `JOBS[job].sets` decides whether a move is attempted at all, so Reset — §1.5's
 * "Reset blocks the *item* returning to Available, never the booking" — falls
 * out without a special case.
 *
 * Called only once `linesShortOfTerminal` came back empty.
 */
async function advanceStage(
  job: SessionJob,
  booking: BookingHead,
  ctx: ActionContext,
  actionUuid: string,
  occurredAt: string,
): Promise<{ from: BookingStatus; to: BookingStatus } | null> {
  const to = JOBS[job].sets
  if (to === null) return null

  const { ok, plan } = await applyBookingTransition({
    bookingId: booking.id,
    branchId: booking.branch_id,
    from: booking.stage,
    to,
    actorId: ctx.userId,
    actorRole: ctx.role,
    clientUuid: actionUuid,
    occurredAt,
  })

  if (!ok) {
    throw new Error(
      `${booking.booking_no}'s ${job} was recorded, but the stage did not move to ${to}: ` +
        plan.blockers.map((b) => `${b.label}${b.blocking === null ? '' : ` (${b.blocking})`}`).join('; '),
    )
  }
  return { from: booking.stage, to }
}
