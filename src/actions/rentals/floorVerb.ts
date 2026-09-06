import { supabase } from '../../lib/supabase'
import { generateClientUuid, idempotentInsert, safeUpdate } from '../../lib/dataAccess'
import { applyBookingTransition } from '../../lib/bookingTransition'
import { logAuditEvent } from '../../lib/audit'
import { captureError } from '../../lib/monitoring'
import { JOBS, type BookingStatus, type JobName } from '../../lib/workflow'
import type { ActionContext } from '../core'
import type {
  CleaningProblemState,
  Database,
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
 * The update shape for one cleaning-queue entry.
 *
 * Added 25 Aug 2026. `CleaningQueueUpdate` was referenced at the `fields`
 * declaration below but declared nowhere, and `Database` sat imported and
 * unused directly above — the two halves of an alias that was never written.
 * Derived from the generated table type rather than hand-listed, so a column
 * added or renamed in a migration reaches this call site through `tsc` instead
 * of through a runtime PostgREST error.
 */
type CleaningQueueUpdate = Database['public']['Tables']['cleaning_queue_entries']['Update']

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
 *     writer of `bookings.stage`.
 *
 *     ⚠ Corrected 6 Sep 2026. This said `0021:199` revokes that column from
 *     `authenticated` "so a hand-written UPDATE would be rejected anyway".
 *     That revoke is **inert** — `0094`'s header reproduces it: a column-level
 *     REVOKE cannot subtract from a table-level GRANT, every signed-in user is
 *     the same Postgres role, and a `PATCH /bookings {stage}` returned 204 and
 *     skipped three stages. `0094`'s `trg_bookings_stage_write_guard` is what
 *     actually shuts that door, and it was written today — check
 *     `schema_migrations` before assuming it is live. Going through the
 *     transition row was never merely tidy; it was the only thing keeping this
 *     file honest.
 *
 * ## Law 6 — nothing here reads or writes money
 *
 * These are the warehouse-facing verbs and Warehouse is money-blind. Every
 * SELECT below names its columns, and none of them is a money column:
 * `booking_lines.rate`, `discount_amount`, `supplier_cost` and `markup_amount`
 * are never selected, so a later `select('*')` cannot leak one by accident.
 *
 * ## Why the session is opened, filled, moved, then closed — in that order
 *
 * `0003_operations.sql:174` wants session close to be one transaction, and
 * PostgREST offers no client-side transaction to put it in. Rather than pretend,
 * the write order is chosen so that **every partial failure leaves a truthful
 * residue**: the session is inserted `'In Progress'`, its lines and movements
 * are written into it — which is also what `0003:235` requires, movements may
 * only be written while the parent session is In Progress — then the stage is
 * moved, and the session is sealed `'Completed'` **last**. A failure half-way
 * leaves an open session someone can see and finish. It never leaves a booking
 * that changed stage on work that was not recorded.
 *
 * ### The seal moved behind the stage on 6 Sep 2026 (PK-05)
 *
 * This deliberately overturns the earlier order, which sealed first and moved
 * the stage after, on the reading that a sealed-but-unmoved session was the
 * safer residue. It is not, and for Pack it is unrecoverable.
 * `operation_sessions_one_packing_per_booking` (`0003:152`) is a unique index
 * on `booking_id where operation = 'Packing'` — one Packing session per
 * booking, ever — and step 4 resumes only a session whose state is still
 * `'In Progress'`. So a transition refused *after* the seal left a `'Completed'`
 * session that cannot be resumed, a booking still at `Booked`, and a second
 * session the unique index refuses: the booking could never be packed again,
 * and the refusal an operator eventually saw was a constraint name.
 *
 * Sealing last inverts that. A refused transition now leaves the session open,
 * the next attempt resumes it, and nothing has been spent.
 *
 * The reverse failure is NEW and worth stating precisely, because the old order
 * could not produce it: `safeUpdate` throws, so if the stage moves and the seal
 * write then fails, the verb throws on a booking that HAS advanced, leaving its
 * session `'In Progress'` for a stage the job is finished with. Two questions
 * follow, and both were checked rather than assumed:
 *
 *   - Is the session recoverable? It is not spent — the unique index counts
 *     rows, not states, and step 4 will resume it. But the retry re-enters at
 *     the new stage, so whether `runFloorVerb` accepts it depends on the job's
 *     own gate; for Pack it will not, and the session simply stays open.
 *   - Does an open session harm anything? No, and this is the load-bearing
 *     claim: **nothing in `src/` reads `operation_sessions` outside this
 *     file** — verified by grep on 6 Sep 2026; every other mention is a comment
 *     naming the table, not a query. So an orphaned open session gates no
 *     screen, blocks no verb, and is visible to whoever looks at the row.
 *     `operation_sessions_one_in_progress` would refuse a SECOND open session
 *     for the same booking and operation, and nothing needs one.
 *
 * That is a strictly better trade than the one it replaced — an orphaned open
 * row against a permanently unpackable booking — but it is a trade, not a free
 * win, and the day something starts reading `operation_sessions` it needs
 * re-checking.
 *
 * What did **not** change is the half of the order the residue argument is
 * really about: lines and movements are still written before either the stage
 * or the seal, so no booking advances on work that was not recorded.
 *
 * That residue is only useful if the next attempt picks it up, so step 4 resumes
 * an `'In Progress'` session instead of opening a second one —
 * `operation_sessions_one_in_progress` (`0003:150`) would refuse a second one
 * anyway. And a session is closed only when the verb's own close gate is met
 * *and* the stage move it belongs to actually landed, except where the operation
 * is explicitly multi-session; see `CLOSES_WHILE_INCOMPLETE`, which is where the
 * Pack case is argued.
 *
 * ## What this file deliberately does NOT do
 *
 * - **It does not evaluate the six session gates** (`0003:161-171`). Receiver
 *   verification, payment and deposit clearance, signatures and mandatory
 *   evidence are the workspace's gates, and three of them are money facts a
 *   money-blind verb may not read. They belong in the triggers `0003` marks
 *   `TRIGGER REQUIRED` and has never had. `TODO(decision)` — until those exist,
 *   this writes what the caller states happened and nothing more.
 * - ~~It does not set `bookings.actual_return_at`~~ — **it does, since 3 Sep
 *   2026** (BUG_AUDIT_LIFECYCLE RT-01), once, at the session that moves the
 *   booking to Returned. The earlier refusal read `dataAccess.ts`'s table-level
 *   switch as "bookings is Booqable's"; the integration spec masters at FIELD
 *   level ("every mapped field has exactly one master"), `booqable/map` maps no
 *   actual-return instant (only `planned_stops_at`), and the column's own
 *   comment names its writer: "Set by the Return workspace" (`0002:86`). So the
 *   stamp is an OS-native write to an OS-native field on a shared table, done
 *   with the action key like every other write here. `pushOrderStop` (the
 *   Booqable status write-back) stays unruled — PLAN §4.16 — and is not called.
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
  /**
   * Return only — the damage found on individual units of this line.
   *
   * `return_lines` carries ONE condition for the whole line (the worst), which
   * is why this rides alongside it: `damage_findings.unit_id` is NOT NULL
   * (`0003:455`), so a finding is per unit and cannot be derived from the
   * line's condition. Before this existed the description and photo tally rode
   * `operation_sessions.notes` and no finding was ever raised
   * (BUG_AUDIT_LIFECYCLE RT-02).
   */
  damage?: readonly DamageFindingInput[]
  /** Pack only — the shelf the items came off. */
  warehouseLocation?: string
}

/**
 * One `cleaning_queue_entries` row as the reset floor resolved it.
 *
 * `unitIds` alone says *which* items were reset and nothing else, and the
 * screen that dispatches Reset has always known more than that: who cleaned the
 * unit, who checked it, whether the check was skipped and why, and whether the
 * item carries a problem. Every one of those is a column on
 * `cleaning_queue_entries` (`0003:859-887`), so it is carried here rather than
 * collected on screen and dropped at the boundary.
 *
 * ⚠ `cleaned_by` and `qc_by` are `users.id` — uuids, not names. There is no
 * text column for a person on this table, so a typed name has nowhere truthful
 * to go and must not be sent.
 */
/**
 * One damage finding, as the floor stated it.
 *
 * Deliberately carries no cost: `damage_findings.estimated_cost` is "NULL until
 * a Manager or Billing user enters it at approval. Warehouse has no cost field
 * at all" (`0003:488`), and `0034` revokes SELECT on that column from
 * `authenticated` outright. A money-blind verb neither reads nor writes it.
 */
export interface DamageFindingInput {
  /** `product_units.id`. A quantity line resolves no unit, so it can raise no finding. */
  unitId: string
  /** What the floor recorded on the unit. Written to `damage_type`; see `SEVERITY_NOT_ASSESSED`. */
  condition: 'Damaged' | 'Lost'
  /** Free text from the floor — `damage_findings.description` is NOT NULL (`0003:457`). */
  description: string
}

export interface ResetEntryInput {
  /** `cleaning_queue_entries.unit_id` — a `product_units.id`. */
  unitId: string
  /** `users.id` of whoever ticked the cleaning checklist. Stamps `clean_completed_at` with it. */
  cleanedBy?: string
  /** `users.id` of whoever performed QC. */
  qcBy?: string
  /**
   * `0003:887` — a self-approved check is not a check. QC by the cleaner is
   * legal only when it is declared skipped and given a reason; anything else
   * with `qc_by = cleaned_by` is rejected by the CHECK.
   */
  qcSkipped?: boolean
  /** Mandatory when `qcSkipped`, and written to audit (`0003:882`). */
  qcSkipReason?: string
  /** The reason an earlier QC pass failed, carried onto the record that finally passed. */
  qcFailReason?: string
  /**
   * `0003:881`. Anything other than `'No Problems'` routes the item out of the
   * batch, so it records the problem and **no** `reset_completed_at` — the item
   * was not reset, it was routed.
   */
  problemState?: CleaningProblemState
  /**
   * The damage the cleaner found, when `problemState` is `'Damaged'`.
   *
   * Written as a `damage_findings` row with `source = 'Cleaning'`, parented on
   * the queue entry (`damage_findings_parent_matches_source`, `0003:474`).
   * Before this existed an exception row was never even dispatched, so a unit
   * marked Damaged at reset left no record anywhere
   * (BUG_AUDIT_LIFECYCLE RS-03).
   *
   * Unlike the Return path, the cleaning screen collects a real type and a real
   * severity from fixed lists (`data/reset.ts` — Cosmetic/Functional/Structural
   * and Low/Medium/High), so these columns take the floor's own words rather
   * than the "no scale is ruled" placeholder. `TODO(decision)`: those two lists
   * live in the UI, and `0003:486` still wants the severity scale ruled before
   * the column becomes an enum.
   */
  damageType?: string
  damageSeverity?: string
  /** The cleaner's description. `damage_findings.description` is NOT NULL (`0003:457`). */
  problemReason?: string
}

export interface FloorVerbInput {
  /**
   * **R-06 — the named reason for handing over with money outstanding.**
   *
   * Since `0090` the database no longer blocks handover on an unpaid balance or
   * an unpaid deposit; it asks for a reason, records it in `audit_events` with
   * both amounts as they stood, and still refuses when none is given. Passing it
   * here is what turns "blocked" into "allowed, and attributable".
   *
   * Ignored by every verb except the one that moves a booking to On Rent — the
   * other stages have no money gate to override.
   */
  overrideReason?: string

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
  /**
   * Handover only — gate 1's two facts, checked against the receiver's physical
   * ID at the counter. They ride `operation_sessions.government_id_verified` /
   * `booking_authorization_verified` (0003:66-67). Both columns are NOT NULL
   * DEFAULT false, and until this field existed every session recorded both as
   * false while the screen said they "ride the session as gate 1"
   * (BUG_AUDIT_LIFECYCLE HO-02).
   */
  governmentIdVerified?: boolean
  bookingAuthorizationVerified?: boolean
  /**
   * Reset only, and the fuller form of `unitIds`: the same items with the
   * record the floor actually made. When both are given this one wins; a caller
   * that passes only `unitIds` gets `{ unitId }` entries and stamps nothing but
   * the reset time, which is exactly what it used to do.
   */
  resetEntries?: readonly ResetEntryInput[]
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
  /** `damage_findings` rows raised — Return only, one per damaged or lost unit. */
  damageFindings: number
  /**
   * `cleaning_queue_entries` rows raised by this call — Return only, one per
   * serialised unit that actually came back. Zero on the other three verbs, and
   * zero on a Return that re-received lines already queued.
   */
  queued: number
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
 * **Pack: no, and this is not a preference.** `0003:170` — "a Packing session
 * may not close unless every required `packing_lines` row is Packed,
 * Missing-with-reason, or Replaced" — and `operation_sessions_one_packing_per_booking`
 * (`0003:152`, corrected 6 Sep 2026 from `:156`, which is the unrelated
 * forward-only-session comment) is a unique index allowing a booking exactly
 * **one** Packing session, ever. Closing a partial pack therefore spends the
 * only session the booking is allowed and leaves it permanently unpackable: the
 * next Complete Packing is refused by a unique-constraint violation, not by any
 * rule an operator can read. The session stays `'In Progress'` and the next pack
 * resumes it — which is also what `0003:235` requires, since movements may only
 * be written while the parent session is In Progress.
 *
 * That same index is why the stage move is now attempted **before** the seal
 * rather than after it — this constant closed one route to a spent Packing
 * session and PK-05 closed the other. See the header.
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

/**
 * `damage_findings.severity` is NOT NULL and has no ruled scale — the column's
 * own comment says so: *"no spec states the severity scale values, so this
 * stays text until Babin sets them. It becomes an enum the moment the scale is
 * decided"* (`0003:486`).
 *
 * So the row says the scale does not exist rather than inventing a value for
 * it. `TODO(decision)` — when the scale is ruled, this constant becomes the
 * assessment the floor (or the approver) actually makes, and these rows are
 * the ones to migrate.
 */
const SEVERITY_NOT_ASSESSED = 'Not assessed — no severity scale is ruled (0003:486)'

/**
 * `unitIds` and `resetEntries` are the same list at two levels of detail, so
 * every Reset path reads it through here and none of them has to know which
 * form the caller used.
 */
function resetEntriesOf(input: FloorVerbInput): readonly ResetEntryInput[] {
  if (input.resetEntries !== undefined) return input.resetEntries
  return (input.unitIds ?? []).map((unitId) => ({ unitId }))
}

/**
 * Gate 1's two facts as `operation_sessions` columns — only the ones the
 * caller actually stated. An omitted field is left to the column default
 * (false) on insert and untouched on a resumed session; `undefined` is never
 * written as a value.
 */
function gateOneFacts(input: FloorVerbInput): { government_id_verified?: boolean; booking_authorization_verified?: boolean } {
  return {
    ...(input.governmentIdVerified === undefined ? {} : { government_id_verified: input.governmentIdVerified }),
    ...(input.bookingAuthorizationVerified === undefined
      ? {}
      : { booking_authorization_verified: input.bookingAuthorizationVerified }),
  }
}

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
    const entries = resetEntriesOf(input)
    if (entries.length === 0) {
      throw new Error(
        'Reset is recorded per item, not per booking (0003:899), so it needs the unit ids that were reset. ' +
          'None were supplied, so nothing was written.',
      )
    }

    const seenUnits = new Set<string>()
    for (const entry of entries) {
      if (!entry.unitId) throw new Error('Reset: every entry must name a product_units id.')
      if (seenUnits.has(entry.unitId)) {
        throw new Error(
          `Reset: unit ${entry.unitId} appears twice. A unit holds one open queue entry per booking, ` +
            'so the second would be written over the first.',
        )
      }
      seenUnits.add(entry.unitId)

      if (entry.problemState === 'Damaged') {
        if ((entry.problemReason ?? '').trim() === '') {
          throw new Error(
            `Reset: unit ${entry.unitId} is marked Damaged with no description. A damage finding's ` +
              'description is a NOT NULL column (0003:457), not a form rule — nothing was written.',
          )
        }
      }

      if (entry.qcSkipped === true) {
        if ((entry.qcSkipReason ?? '').trim() === '') {
          throw new Error(
            `Reset: unit ${entry.unitId} declares a skipped QC with no reason. ` +
              'CHECK cleaning_queue_entries_qc_is_a_second_pair_of_eyes (0003:887) rejects that row.',
          )
        }
      } else if (
        entry.qcBy !== undefined &&
        entry.cleanedBy !== undefined &&
        entry.qcBy === entry.cleanedBy
      ) {
        throw new Error(
          `Reset: unit ${entry.unitId} was checked by the person who cleaned it. A self-approved check is ` +
            'not a check (0003:887) — either a second person checks it, or record it as a skipped QC ' +
            'with a reason. Nothing was written.',
        )
      }
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

    const damage = line.damage ?? []
    if (damage.length > 0 && job !== 'Return') {
      throw new Error(`${job}: a damage finding is raised at Return inspection only (0003:475).`)
    }
    const seenDamage = new Set<string>()
    for (const d of damage) {
      if (!d.unitId) {
        throw new Error(
          `Return: a damage finding must name the product_units id it is against — damage_findings.unit_id ` +
            `is NOT NULL (0003:455). Booking line ${line.bookingLineId}.`,
        )
      }
      if (seenDamage.has(d.unitId)) {
        throw new Error(`Return: unit ${d.unitId} carries two damage findings on one line. Merge them into one description.`)
      }
      seenDamage.add(d.unitId)
      if ((d.description ?? '').trim() === '') {
        throw new Error(
          `Return: the damage finding on unit ${d.unitId} has no description. That is a NOT NULL column ` +
            '(0003:457), not a form rule — nothing was written.',
        )
      }
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
    const resetOutcome = await completeResetQueue(booking, resetEntriesOf(input), ctx, occurredAt, actionUuid)
    return {
      success: true,
      bookingId: booking.id,
      sessionId: null,
      sessionClosed: null,
      lines: 0,
      movements: 0,
      // Damage found at cleaning is its own source (0003:484), parented on the
      // queue entry rather than a return line — RS-03.
      damageFindings: resetOutcome.findings,
      unitsReset: resetOutcome.reset,
      queued: 0,
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

  /* 4a — a Packing session that cannot be resumed is the only one this booking
   *      will ever get, already spent.
   *
   *      `operation_sessions_one_packing_per_booking` (`0003:152`) is a unique
   *      index on `booking_id where operation = 'Packing'`, so the insert below
   *      would be refused by Postgres with a constraint name and nothing an
   *      operator can act on. Refused here by name instead — Law 12: a floor
   *      that cannot pack a booking must be told which fact stops it.
   *
   *      The way this codebase produced the state is an earlier pack that sealed
   *      its session and then failed to move the stage — the failure PK-05
   *      closed by sealing last. A session written out of band (a seed, an
   *      import) reaches it too, which is the other reason the message has to
   *      say what it found rather than assume how it got there.
   *
   *      Either way the booking stays stranded: `0003:156-158`
   *      makes `session_state` forward-only and admits a reversal only through a
   *      Manager `override_records` row, and nothing in `src/` writes that table
   *      (it appears only in the generated types). `TODO(decision)` — how a
   *      booking already in this state is recovered, and by whom. */
  if (job === 'Pack' && latest !== null && resumed === null) {
    throw new Error(
      `${booking.booking_no} already holds a Packing session (no. ${latest.session_no}, ${latest.state}), and a ` +
        'booking is allowed exactly one, ever (0003:152). Only an In Progress session can be resumed, and a ' +
        'second one would be refused by the database. Nothing was written. Reopening that session is a ' +
        'backwards move on session_state, which 0003:156 allows only as a Manager override — a path this ' +
        'application does not yet have.',
    )
  }

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
      ...(operation === 'Handover' ? gateOneFacts(input) : {}),
      created_by: ctx.userId,
    })
  } else {
    // A resumed Handover session re-checks the receiver: the facts from THIS
    // pass are the current ones, so they are written over the earlier pass.
    const facts = operation === 'Handover' ? gateOneFacts(input) : {}
    if (Object.keys(facts).length > 0) {
      await safeUpdate('operation_sessions', sessionId, { ...facts, updated_at: occurredAt }, actionUuid)
    }
  }
  if (resumed !== null && input.notes !== undefined) {
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
  let findings = 0
  const queueCandidates: ResetQueueCandidate[] = []
  /* Law 8 — a resumed session must not append a second movement for a unit
     the earlier pass already moved. Read once, consult per line. */
  const priorMovements = await readSessionMovements(sessionId, lines.map((l) => l.bookingLineId))

  for (const line of lines) {
    const required = requiredByLine.get(line.bookingLineId) ?? 0
    const moved = movedQty(line, required)
    const priorId = existing.get(line.bookingLineId)?.id ?? null

    if (job === 'Pack') await writePackingLine(sessionId, line, required, moved, ctx, occurredAt, priorId, actionUuid)
    else if (job === 'Handover')
      await writeHandoverLine(sessionId, line, required, moved, ctx, occurredAt, priorId, actionUuid)
    else {
      const returnLineId = await writeReturnLine(
        sessionId,
        line,
        required,
        moved,
        ctx,
        occurredAt,
        priorId,
        actionUuid,
      )
      queueCandidates.push(...resetQueueCandidates(line, returnLineId))
      findings += await writeDamageFindings(line, returnLineId, ctx)
    }

    // Absence is never converted into a state (0003:630): a line marked missing,
    // or one nothing moved on, produces no movement row.
    if ((line.outcome ?? 'done') === 'done' && moved > 0) {
      movements += await writeMovements(job, sessionId, line, moved, ctx, occurredAt, priorMovements.get(line.bookingLineId))
    }

    /* The per-unit state (0002:225-262) — the row Booking Detail's Packed /
       Missing / Returned counters and Handover's "recorded by an earlier
       session" read from. Nothing wrote it before this call; see writeUnitStates. */
    await writeUnitStates(job, sessionId, line, required, moved, ctx, occurredAt, actionUuid)
  }

  /* 5b — the reset queue, which nothing in this codebase used to fill.
   *
   *     `0003:855-857` calls a `cleaning_queue_entries` row "one item in the
   *     cleaning/reset queue", and `completeResetQueue` below has always
   *     required one to exist before it will record a reset. Nothing raised
   *     them, so Complete Reset was refused on every real booking and a
   *     rental could not be closed. Gear that comes back is what puts an item
   *     in the queue, so Return is where the row belongs. */
  const queued = await enqueueReturnedUnits(booking, queueCandidates, ctx, occurredAt)

  /* 6 — one question, asked once, answering two things: has every live line of
   *     the booking reached a state this verb calls terminal? It decides whether
   *     the session may close AND whether the stage may move, and asking it once
   *     is what keeps those two from ever disagreeing. */
  const heldBy = await linesShortOfTerminal(job, live)
  const complete = heldBy.length === 0

  /* 7 — the stage, through the transition trigger and nothing else — and
   *     BEFORE the session is sealed. The header argues the order (PK-05); the
   *     short version is that a transition refused after the seal spends the one
   *     Packing session a booking is allowed (`0003:152`) and the booking can
   *     never be packed again.
   *
   *     A refusal arrives two ways and both land in this catch: `advanceStage`
   *     throws when `planTransition` refuses, and `idempotentInsert` throws when
   *     the database does — `0021`'s from_stage / no-skip / causal-order checks,
   *     `0090`'s R-06 money gate on the move to On Rent, or the insert policy
   *     `0021` gave the table.
   *
   *     `0094` (6 Sep 2026) does not make this call more likely to be refused:
   *     it guards *direct* writes to `bookings.stage`, and exempts
   *     `apply_booking_stage_transition`, which is SECURITY DEFINER and so
   *     arrives as `postgres`. What it removes is the workaround. Before it, a
   *     refused transition could still be papered over with a PATCH on
   *     `bookings.stage`, because `0021`'s column REVOKE was inert against the
   *     table-level GRANT. It is not any more, so a refusal here is now simply a
   *     booking that did not move — which is exactly why what it costs matters.
   *
   *     It is caught rather than thrown straight out because two things must
   *     still happen first: the session must not be sealed on a move that did not
   *     land, and the pass that DID happen must still leave its audit row. It is
   *     rethrown at 8b, once both are true. */
  let stage: { from: BookingStatus; to: BookingStatus } | null = null
  let stageMoved = false
  let stageRefusal: Error | null = null
  if (complete) {
    try {
      stage = await advanceStage(job, booking, ctx, actionUuid, occurredAt, input.overrideReason)
      stageMoved = true
    } catch (err) {
      stageRefusal = err instanceof Error ? err : new Error(String(err))
    }
  }

  /* 8 — seal the session, and only for a reason that is true of it.
   *
   *     Two reasons, never conflated. A verb whose every line is terminal seals
   *     because the stage it sets has landed. A verb that may close short seals
   *     because a partial collection is a finished collection — Handover and
   *     Return only, which `0003:129` makes multi-session; see
   *     `CLOSES_WHILE_INCOMPLETE`, where the Pack case is argued.
   *
   *     A complete verb whose transition was refused qualifies under neither, so
   *     it stays `'In Progress'` and the next attempt resumes it. Only a closed
   *     session is a completed fact; an open one is work someone can still see
   *     and finish. */
  const closed = complete ? stageMoved : CLOSES_WHILE_INCOMPLETE[job]
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
    captureError(sessionAudit.error, {
      where: 'floorVerb.sessionAudit',
      operation,
      bookingNo: booking.booking_no,
      sessionId,
    })
  }

  /* 8b — the refused transition, rethrown now that the session sits in its
   *      truthful state and the pass it recorded has its audit row.
   *
   *      This is still a failure and the caller still sees one — `success: true`
   *      on a booking that did not move would be the "success announced before
   *      dispatch" this file exists to prevent. What the message adds is the one
   *      fact the floor needs next: the session is open, so pressing Complete
   *      again resumes it. */
  if (stageRefusal !== null) {
    throw new Error(
      `${stageRefusal.message} The ${operation} session is still open, so the next ${job} on ` +
        `${booking.booking_no} resumes it rather than opening a second one — nothing has been spent.`,
      { cause: stageRefusal },
    )
  }

  /* 9 — `bookings.actual_return_at` (0002:33,86): set once, by the session
     that moved the booking to Returned, to the instant that session recorded.
     Never on a partial session (the gear is still out), never overwritten
     (`0002:86` compares it to `return_at` once, at the return session). See the
     header for why this is the OS's field to write. */
  if (job === 'Return' && stage !== null && stage.to === 'Returned') {
    await safeUpdate('bookings', booking.id, { actual_return_at: occurredAt, updated_at: occurredAt }, actionUuid)
  }

  return {
    success: true,
    bookingId: booking.id,
    sessionId,
    sessionClosed: closed,
    lines: lines.length,
    movements,
    damageFindings: findings,
    unitsReset: 0,
    queued,
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

/**
 * Returns `return_lines.id`, because the reset queue hangs off it
 * (`cleaning_queue_entries.return_line_id`, `0003:862`). On a fresh row the id
 * is minted here rather than read back — the same reason the session's is
 * (`runFloorVerb` step 4): on the offline path `idempotentInsert` queues the
 * write and hands back the payload, never a server-assigned row.
 */
async function writeReturnLine(
  sessionId: string,
  line: FloorLineInput,
  required: number,
  moved: number,
  ctx: ActionContext,
  at: string,
  priorId: string | null,
  actionUuid: string,
): Promise<string> {
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
    return priorId
  }
  const rowId = generateClientUuid()
  await idempotentInsert('return_lines', {
    id: rowId,
    client_uuid: generateClientUuid(),
    booking_line_id: line.bookingLineId,
    created_by: ctx.userId,
    ...fields,
  })
  return rowId
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
  prior: PriorMovements | undefined,
): Promise<number> {
  const resulting = job === 'Return' ? returnMovementState(line) : MOVEMENT_STATE[job]
  const scans = scannedUnits(line)

  if (scans.length === 0) {
    /* One quantity movement per (session, line). A resumed session that states
       a new count corrects the row it already wrote rather than adding a second
       one — the counters sum this table (0003:291), so a second row would
       double the packed quantity (BUG_AUDIT_LIFECYCLE PK-04). */
    if (prior?.qtyRow) {
      /* `session_line_movements` is append-only (its Update type is `never`),
         so a resumed pass that states a DIFFERENT count cannot correct the row
         it already wrote. The line row (`qty_packed_entered` / the line state)
         carries the corrected count; the movement stays at what first moved.
         Not appending a second row is the fix here — TODO(decision): whether a
         within-session correction should append a delta movement instead. */
      return 0
    }
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

  let written = 0
  for (const scan of scans) {
    // A unit the earlier pass of this session already moved is not moved again.
    if (scan.unitId !== null && prior?.unitIds.has(scan.unitId)) continue
    if (scan.unitId === null && scan.serial !== null && prior?.serials.has(scan.serial)) continue
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
    written += 1
  }
  return written
}

/**
 * **The damage findings a return session raised** (`0003:449-481`).
 *
 * One row per damaged or lost unit, parented on the `return_lines` row this
 * verb just wrote — `damage_findings_exactly_one_parent` and
 * `damage_findings_parent_matches_source` require exactly that pairing for
 * `source = 'Return inspection'`.
 *
 * What is deliberately NOT set:
 *   - `estimated_cost` — the approver's field, and money-blind here (0003:488).
 *   - `approval_state` — the column default is `'Pending Approval'`, which is
 *     what a finding raised on the floor is.
 *   - `disposition` / `case_id` / `charge_id` — decisions, not observations.
 *     A 'Cleaning' finding raises a Manager case (0003:484); a return-inspection
 *     one does not, because the client has not signed off yet.
 */
async function writeDamageFindings(
  line: FloorLineInput,
  returnLineId: string,
  ctx: ActionContext,
): Promise<number> {
  const damage = line.damage ?? []
  for (const d of damage) {
    await idempotentInsert('damage_findings', {
      client_uuid: generateClientUuid(),
      source: 'Return inspection',
      return_line_id: returnLineId,
      unit_id: d.unitId,
      /* The floor's own word for what it found. There is no ruled damage-type
         vocabulary anywhere in the specs, and inventing one ('Scratch',
         'Water', …) would be inventing the vocabulary. TODO(decision). */
      damage_type: d.condition,
      description: d.description.trim(),
      severity: SEVERITY_NOT_ASSESSED,
      created_by: ctx.userId,
    })
  }
  return damage.length
}

/** What an earlier pass of the SAME session already moved on a line. */
interface PriorMovements {
  unitIds: Set<string>
  serials: Set<string>
  qtyRow: { id: string; qty: number } | null
}

async function readSessionMovements(sessionId: string, lineIds: readonly string[]): Promise<Map<string, PriorMovements>> {
  const out = new Map<string, PriorMovements>()
  if (lineIds.length === 0) return out
  const { data, error } = await supabase
    .from('session_line_movements')
    .select('id, booking_line_id, unit_id, serial, qty')
    .eq('session_id', sessionId)
    .in('booking_line_id', [...lineIds])
  if (error) throw new Error(`Could not read the movements already recorded on session ${sessionId}: ${error.message}`)
  for (const r of (data ?? []) as Array<{ id: string; booking_line_id: string; unit_id: string | null; serial: string | null; qty: number }>) {
    let p = out.get(r.booking_line_id)
    if (!p) {
      p = { unitIds: new Set(), serials: new Set(), qtyRow: null }
      out.set(r.booking_line_id, p)
    }
    if (r.unit_id !== null) p.unitIds.add(r.unit_id)
    else if (r.serial !== null) p.serials.add(r.serial)
    else p.qtyRow = { id: r.id, qty: r.qty }
  }
  return out
}

/**
 * **The per-unit state — `booking_line_units` (0002:225-262).**
 *
 * The table's own comment: "Ready / Picked Up / Returned / Missing / Damaged
 * lives here, per item." Before this function nothing in `src/` and no
 * migration trigger wrote `unit_state`, `packed`, `packed_at` or the three
 * `*_session_id` columns — only the 0047 seed. So Booking Detail's Packed /
 * Missing / Returned counters never moved after real floor work, and
 * HandoverWorkspace read "recorded by an earlier session" off a column that
 * was always 'Ready' (BUG_AUDIT_LIFECYCLE X-03, HO-01, driven 2 Sep 2026).
 *
 * What is written is exactly what the column comments define, nothing ruled
 * elsewhere:
 *   Pack     done    → packed / packed_at / packed_by / packing_session_id
 *            missing → unit_state 'Missing' + missing_reason (CHECK :258)
 *   Handover done    → unit_state 'Picked Up' + handover_session_id
 *   Return   done    → unit_state per `returnMovementState` + returned_at +
 *                      return_session_id (+ condition, damaged when Damaged)
 *            missing → unit_state 'Missing' + missing_reason
 *
 * Which rows: the scanned units (`asset_id` ∈ unitIds) when the line was
 * scanned; every not-yet-terminal unit of the line when a quantity line was
 * resolved in full. A short quantity line touches no unit — which physical
 * units moved is not a fact this call has. Idempotent by construction: the
 * same patch on the same rows lands the same state, so a resumed session or a
 * replayed action changes nothing a first pass did not.
 *
 * Authorization: `booking_line_units_all` (0024:40) admits Owner, Admin,
 * Manager, Coordinator and Warehouse — the floor set — so the write is not a
 * Law 6 question; the table carries no money column.
 */
async function writeUnitStates(
  job: SessionJob,
  sessionId: string,
  line: FloorLineInput,
  required: number,
  moved: number,
  ctx: ActionContext,
  at: string,
  actionUuid: string,
): Promise<void> {
  const outcome = line.outcome ?? 'done'
  const unitIds = scannedUnits(line).map((u) => u.unitId).filter((u): u is string => u !== null)
  const scoped = unitIds.length > 0 ? unitIds : null
  // A short quantity line names no unit — nothing per-unit can honestly be said.
  if (scoped === null && outcome === 'done' && moved < required) return

  let patch: Record<string, unknown>
  if (outcome === 'missing') {
    patch = { unit_state: 'Missing', missing_reason: line.reason ?? null }
  } else if (job === 'Pack') {
    patch = { packed: true, packed_at: at, packed_by: ctx.userId, packing_session_id: sessionId }
  } else if (job === 'Handover') {
    patch = { unit_state: 'Picked Up', handover_session_id: sessionId }
  } else {
    const state = returnMovementState(line)
    patch = {
      unit_state: state,
      returned_at: at,
      return_session_id: sessionId,
      ...(line.condition === undefined ? {} : { condition: line.condition }),
      ...(state === 'Damaged' ? { damaged: true } : {}),
    }
  }

  /* Read the live unit rows of the line, then write each by id through
     `safeUpdate` — the one update path every other floor write takes, so the
     action key rides along (Law 8) and the offline queue sees it. A released
     row (§4.39a) is history and is never touched. */
  const { data, error } = await supabase
    .from('booking_line_units')
    .select('id, asset_id, unit_state')
    .eq('booking_line_id', line.bookingLineId)
    .is('released_at', null)
  if (error) throw new Error(`Could not read the units of booking line ${line.bookingLineId}: ${error.message}`)
  const units = (data ?? []) as Array<{ id: string; asset_id: string | null; unit_state: string }>
  const targets = units.filter((u) => {
    if (scoped !== null) return u.asset_id !== null && scoped.includes(u.asset_id)
    if (outcome === 'missing') return u.unit_state !== 'Returned'
    return true
  })
  for (const u of targets) {
    await safeUpdate('booking_line_units', u.id, patch, actionUuid)
  }
}

/* ── The reset queue: raised at Return, completed at Reset ──────────────── */

interface ResetQueueCandidate {
  unitId: string
  returnLineId: string
}

/**
 * Which units on one returned line belong in the reset queue.
 *
 * Three exclusions, each because the row would otherwise be a claim nobody
 * made:
 *
 *  - a `'missing'` line — nothing came back, so nothing is waiting to be reset;
 *  - `condition: 'Lost'` — same fact, recorded on the line rather than the
 *    outcome, and `returnMovementState` already lands it in `'Missing'`;
 *  - a unit-less scan, i.e. a quantity-tracked line. `cleaning_queue_entries.unit_id`
 *    is NOT NULL (`0003:861`) and the queue is per item (`0003:899`), so a line
 *    with no `product_units.id` has no row to write. It is not dropped in
 *    silence: the Reset workspace lists these separately and says why.
 *
 * A `'Damaged'` unit IS queued. Damage routes the item afterwards; it still
 * came back and it still has to be handled by the warehouse.
 */
function resetQueueCandidates(line: FloorLineInput, returnLineId: string): ResetQueueCandidate[] {
  if ((line.outcome ?? 'done') === 'missing') return []
  if (line.condition === 'Lost') return []

  const out: ResetQueueCandidate[] = []
  for (const scan of scannedUnits(line)) {
    if (scan.unitId === null) continue
    out.push({ unitId: scan.unitId, returnLineId })
  }
  return out
}

/**
 * One queue entry per serialised unit this Return brought back.
 *
 * **`requires_reset` is set explicitly, and that is the whole point.** The
 * column defaults to `false` (`0003:868`) and `completeResetQueue` refuses any
 * entry carrying `false`, because CHECK `cleaning_queue_entries_reset_only_when_required`
 * (`0003:895`) would reject the write anyway. An insert that leaned on the
 * default would therefore fill the queue with rows that can never be completed
 * — the same dead end, one step further along. Ruled: every returned serialised
 * unit enters the queue requiring a reset, and `requires_clean` keeps the
 * column's own default of `true` — stated here rather than inherited, so a
 * later default change cannot silently retire the rule.
 *
 * **Idempotency.** Handover and Return are multi-session by design (`0003:129`,
 * staggered collection), so this runs again on the same booking with some units
 * already queued. Open entries for `(booking_id, unit_id)` are read first and
 * those units are skipped, so a second collection queues only what it actually
 * brought back and a replayed one queues nothing.
 */
async function enqueueReturnedUnits(
  booking: BookingHead,
  candidates: readonly ResetQueueCandidate[],
  ctx: ActionContext,
  at: string,
): Promise<number> {
  if (candidates.length === 0) return 0

  // A unit can only be on one line of a booking, but a caller could still name
  // it twice; first mention wins and the second is not a second row.
  const byUnit = new Map<string, ResetQueueCandidate>()
  for (const candidate of candidates) {
    if (!byUnit.has(candidate.unitId)) byUnit.set(candidate.unitId, candidate)
  }
  const unitIds = [...byUnit.keys()]

  const { data, error } = await supabase
    .from('cleaning_queue_entries')
    .select('id, unit_id')
    .eq('booking_id', booking.id)
    .in('unit_id', unitIds)

  if (error) {
    throw new Error(
      `${booking.booking_no}'s return was recorded, but its reset queue could not be read: ${error.message}`,
    )
  }

  const queued = new Set(((data ?? []) as Array<{ unit_id: string }>).map((r) => r.unit_id))
  let written = 0

  for (const unitId of unitIds) {
    if (queued.has(unitId)) continue
    const candidate = byUnit.get(unitId) as ResetQueueCandidate

    await idempotentInsert('cleaning_queue_entries', {
      client_uuid: generateClientUuid(),
      unit_id: unitId,
      booking_id: booking.id,
      return_line_id: candidate.returnLineId,
      state: 'Waiting',
      requires_clean: true,
      requires_reset: true,
      entered_queue_at: at,
      created_by: ctx.userId,
    })
    written += 1
  }

  return written
}

/* ── Reset — completing the queue, per item, no session ─────────────────── */

/**
 * `0003:855-857` — "Reset and Cleaning are two modes of this one workspace,
 * which is why neither has a session." So Reset writes onto the entries the
 * Return raised, and creates none: minting one here would be inventing the
 * work, and `enqueueReturnedUnits` above already records it where it happened.
 *
 * What it writes, per item and never per batch (`0003:911`):
 *
 *  - `reset_completed_at` — the fact the verb is named after;
 *  - `clean_completed_at` / `cleaned_by` — who ticked the checklist, when;
 *  - `qc_by` / `qc_at` / `qc_skipped` / `qc_skip_reason` / `qc_fail_reason` —
 *    the check, including the case where the cleaner was the only person on
 *    shift, which `0003:887` admits only as a declared skip with a reason;
 *  - `problem_state` — and on a problem entry, **no** `reset_completed_at`. The
 *    item was routed out of the batch, not reset, and the two must not read the
 *    same.
 *
 * What it still does NOT write:
 *
 *  - `state`. `0003:916` lets it reach `'Ready'` only when every required task
 *    in the item's **category checklist** is ticked for each required mode —
 *    `category_checklist_tasks` / `cleaning_task_results`, neither of which this
 *    verb is told about. Moving it would be asserting a checklist nobody ran.
 *    `TODO(decision)`: an item therefore stays `'Waiting'` with its completion
 *    times set, and every reader must judge completion off the timestamps.
 *  - `checklist_version`, for the same reason, and `first_task_at`, which is a
 *    moment on the floor no caller currently carries.
 */
async function completeResetQueue(
  booking: BookingHead,
  entries: readonly ResetEntryInput[],
  ctx: ActionContext,
  at: string,
  actionUuid: string,
): Promise<{ reset: number; findings: number }> {
  const byUnit = new Map(entries.map((e) => [e.unitId, e]))
  const unitIds = [...byUnit.keys()]

  const { data, error } = await supabase
    .from('cleaning_queue_entries')
    .select('id, unit_id, requires_clean, requires_reset, clean_completed_at, reset_completed_at')
    .eq('booking_id', booking.id)
    .in('unit_id', unitIds)

  if (error) throw new Error(`Could not read the reset queue for ${booking.booking_no}: ${error.message}`)

  const rows = (data ?? []) as Array<{
    id: string
    unit_id: string
    requires_clean: boolean
    requires_reset: boolean
    clean_completed_at: string | null
    reset_completed_at: string | null
  }>

  const found = new Set(rows.map((e) => e.unit_id))
  const unqueued = unitIds.filter((u) => !found.has(u))
  if (unqueued.length > 0) {
    throw new Error(
      `${unqueued.length} unit(s) are not in ${booking.booking_no}'s reset queue — ${unqueued.join(', ')}. ` +
        'A reset is completed against a queued item; nothing was written.',
    )
  }

  // CHECK :895 — reset_completed_at may only be set where requires_reset.
  const notRequired = rows.filter((e) => !e.requires_reset).map((e) => e.unit_id)
  if (notRequired.length > 0) {
    throw new Error(
      `${notRequired.length} unit(s) do not require a reset — ${notRequired.join(', ')}. ` +
        'The database rejects reset_completed_at on them (0003:895). Nothing was written.',
    )
  }

  const pending = rows.filter((e) => e.reset_completed_at === null)
  if (pending.length === 0) {
    throw new Error(
      `Every named unit on ${booking.booking_no} was already reset. Nothing was written — this is a repeat submit.`,
    )
  }

  let reset = 0
  let findings = 0

  for (const row of pending) {
    const entry = byUnit.get(row.unit_id) as ResetEntryInput
    const problem = entry.problemState ?? 'No Problems'
    const routed = problem !== 'No Problems'

    // CHECK :893 mirrors :895 for the cleaning half — a stamp only where the
    // mode was required, and never a second one over a stamp already there.
    const stampsClean =
      !routed && entry.cleanedBy !== undefined && row.requires_clean !== false && row.clean_completed_at === null

    const fields: CleaningQueueUpdate = {
      updated_at: at,
      ...(routed ? { problem_state: problem } : { reset_completed_at: at }),
      ...(entry.cleanedBy === undefined ? {} : { cleaned_by: entry.cleanedBy }),
      ...(stampsClean ? { clean_completed_at: at } : {}),
      ...(entry.qcSkipped === true
        ? { qc_skipped: true, qc_skip_reason: entry.qcSkipReason ?? null, qc_at: at }
        : {}),
      ...(entry.qcBy === undefined ? {} : { qc_by: entry.qcBy, qc_at: at }),
      ...(entry.qcFailReason === undefined ? {} : { qc_fail_reason: entry.qcFailReason }),
    }

    await safeUpdate('cleaning_queue_entries', row.id, fields, actionUuid)
    if (!routed) reset += 1

    /*
     * `0003:484` — "Damage found at cleaning is after the client signed off and
     * raises a Manager case instead of a direct charge decision." The FINDING is
     * written here, parented on the queue entry as the CHECK requires.
     *
     * `TODO(decision)` — the Manager case is NOT raised: `cases` has no writer
     * anywhere in `src/` and no case-number sequence is built (the workspace
     * says so itself, `data/cases.ts`'s `NEW_CASE_UNAVAILABLE_REASON`). Raising
     * one would mean inventing the number and the shape. `case_id` stays null
     * and the finding is the record until case creation exists.
     */
    if (problem === 'Damaged') {
      await idempotentInsert('damage_findings', {
        client_uuid: generateClientUuid(),
        source: 'Cleaning',
        cleaning_queue_entry_id: row.id,
        unit_id: row.unit_id,
        damage_type: entry.damageType ?? 'Not stated',
        description: (entry.problemReason ?? '').trim(),
        severity: entry.damageSeverity ?? SEVERITY_NOT_ASSESSED,
        created_by: ctx.userId,
      })
      findings += 1
    }

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
      recordId: row.id,
      actorId: ctx.userId,
      actorRole: ctx.role,
      branchId: booking.branch_id,
      newValues: { ...fields, unit_id: row.unit_id },
    })
    if (!entryAudit.ok) {
      console.error(
        `[floorVerb] Reset committed on cleaning_queue_entries ${row.id} with NO audit row.`,
        entryAudit.error,
      )
      captureError(entryAudit.error, { where: 'floorVerb.entryAudit', entryId: row.id })
    }
  }

  return { reset, findings }
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
  /*
   * R-06 — the named reason for proceeding with money outstanding.
   *
   * `validate_booking_gates` no longer blocks handover on an unpaid balance or an
   * unpaid deposit (0090); it requires this reason instead, records it in
   * `audit_events` with both amounts as they stood, and still refuses when it is
   * absent. It rides `booking_stage_transitions.reason`, which is where the
   * database reads it from.
   */
  overrideReason?: string,
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
    ...(overrideReason === undefined || overrideReason.trim() === ''
      ? {}
      : { reason: overrideReason.trim() }),
  })

  if (!ok) {
    throw new Error(
      `${booking.booking_no}'s ${job} was recorded, but the stage did not move to ${to}: ` +
        plan.blockers.map((b) => `${b.label}${b.blocking === null ? '' : ` (${b.blocking})`}`).join('; '),
    )
  }
  return { from: booking.stage, to }
}
