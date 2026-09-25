import type { StatusKey } from './status'
/* §5.6 wants a failing gate to carry the blocking *value*. `money.ts` imports
   nothing, so the engine stays acyclic and the refusal reads in the same
   half-up, lakh-grouped rupees as every other figure in the app. */
import { formatMoney, type Paisa } from './money'

/**
 * **Status Engine — Foundation Specification v2.0 §1.**
 *
 * v2.0's headline change: the old 12-stage workflow "was not wrong, it was the
 * wrong *type*. It mixed three different things into one field." Those three
 * layers are now separated, and this file is the only place any of them lives.
 *
 * | Layer          | Values      | Who sees it            |
 * |----------------|-------------|------------------------|
 * | Booking status | 6           | everywhere             |
 * | Job state      | 4 jobs × 3  | Operations only        |
 * | Item state     | 5           | Operations + Inventory |
 *
 * ⚠ **This file previously carried the 12 stages** from the 19 Jul poster, and
 * its own comment argued that Dashboard.md §9's "Quote · Booked · Packed ·
 * On Rent · Returned · Closed" was wrong. v2.0 §0 explains why that argument
 * was backwards: the poster predated the lock, so every module faithfully
 * imported a stale rule. §9's six were right. The 12 survive only as the §1.4
 * migration map at the bottom, which nothing in `src/` calls any more — every
 * screen holds a `BookingStatus`. It is kept for the schema migration and the
 * go-live import of pre-v2.0 records (§9.6).
 *
 * The union types make a seventh status, a fifth job or an invented flag
 * unrepresentable. Modules import; modules never redefine (§11).
 */

/* ── §1.2 · booking status — the canonical six ─────────────────────────── */

export type BookingStatus = 'Quote' | 'Booked' | 'Packed' | 'On Rent' | 'Returned' | 'Closed'

export interface StatusMeta {
  /** Position in the forward-only sequence. Stages may not be skipped. */
  order: number
  /** §4.2 — which of the five tones carries it. */
  token: StatusKey
  /** §1.8 — what a client is allowed to see instead. */
  client: string
  means: string
}

export const BOOKING_STATUS: Record<BookingStatus, StatusMeta> = {
  Quote: { order: 0, token: 'neutral', client: 'Quote', means: 'Priced, not committed. Reserves nothing.' },
  Booked: { order: 1, token: 'primary', client: 'Confirmed', means: 'Committed. Gear reserved, calendar held, serials assigned.' },
  Packed: { order: 2, token: 'progress', client: 'Ready for pickup', means: 'Packing complete, ready to leave.' },
  // §4.2 — green separates these two by fill weight: solid = out, soft = in.
  'On Rent': { order: 3, token: 'out', client: 'With you', means: 'All items with the client.' },
  Returned: { order: 4, token: 'in', client: 'Returned', means: 'All items physically received back.' },
  Closed: { order: 5, token: 'dim', client: 'Complete', means: 'Money settled, deposit resolved, nothing open.' },
}

export const STATUS_ORDER = (Object.keys(BOOKING_STATUS) as BookingStatus[]).sort(
  (a, b) => BOOKING_STATUS[a].order - BOOKING_STATUS[b].order,
)

export function statusToken(s: BookingStatus): StatusKey {
  return BOOKING_STATUS[s].token
}

/** §1.8 — a client never sees Packing, Inspection or Reset. */
export function clientLabel(s: BookingStatus, overdue = false): string {
  return overdue ? 'Overdue' : BOOKING_STATUS[s].client
}

/**
 * §1.2 — "Forward-only. Stages may not be skipped." A reversal is not a
 * transition; it is a Manager-approved, audited exception, so it is deliberately
 * not expressible here.
 *
 * This answers ordering **only**. The question a screen actually asks — "may
 * this booking move now?" — also needs §1.9's flags and §1.7's close gates, so
 * it is `planTransition()` at the bottom of this file that callers use;
 * `canAdvance` is the ordering clause inside it.
 */
export function canAdvance(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_STATUS[to].order === BOOKING_STATUS[from].order + 1
}

/* ── §1.5 · job state — the four verbs ─────────────────────────────────── */

export type JobName = 'Pack' | 'Handover' | 'Return' | 'Reset'
export type JobState = 'Not Started' | 'In Progress' | 'Complete'

export interface JobMeta {
  /** The booking status the job runs at. */
  runsAt: BookingStatus
  /** The status completing it sets — `null` for Reset, which sets nothing. */
  sets: BookingStatus | null
  /** Handover and Return are session-based; Pack and Reset are not. */
  sessions: boolean
  /** §1.5 — Reset blocks the *item* returning to Available, never the booking. */
  blocksBooking: boolean
}

/**
 * Four operations, not five. **Reset absorbs Cleaning** — the separate Cleaning
 * workspace in the renders is deleted and its per-item category checklists move
 * inside Reset.
 */
export const JOBS: Record<JobName, JobMeta> = {
  Pack: { runsAt: 'Booked', sets: 'Packed', sessions: false, blocksBooking: true },
  Handover: { runsAt: 'Packed', sets: 'On Rent', sessions: true, blocksBooking: true },
  Return: { runsAt: 'On Rent', sets: 'Returned', sessions: true, blocksBooking: true },
  Reset: { runsAt: 'Returned', sets: null, sessions: false, blocksBooking: false },
}

export const JOB_ORDER: JobName[] = ['Pack', 'Handover', 'Return', 'Reset']

/** §1.5 — "One job In Progress per booking at a time." */
export function assertOneJobInProgress(states: Partial<Record<JobName, JobState>>): void {
  const running = JOB_ORDER.filter((j) => states[j] === 'In Progress')
  if (running.length > 1) {
    throw new Error(`§1.5 violated: ${running.length} jobs In Progress at once — ${running.join(', ')}`)
  }
}

/**
 * §1.5 read backwards: which job's completion sets this status. `Quote` and
 * `Booked` are reached by decisions, not jobs, and `Closed` by §1.7's gates —
 * all three answer `null`. Derived from `JOBS`, never a second table.
 */
export function jobThatSets(to: BookingStatus): JobName | null {
  return JOB_ORDER.find((j) => JOBS[j].sets === to) ?? null
}

/* ── §1.6 · item state ─────────────────────────────────────────────────── */

/**
 * "These are quantities, not statuses." `Damaged` is deliberately not one of
 * them: §1.6 makes it "a condition carried alongside `Returned`, not a fifth
 * mutually-exclusive bucket", so including it here would break the sum.
 */
export type ItemState = 'Ready' | 'Picked Up' | 'Returned' | 'Missing'

export interface ItemCounts {
  Ready: number
  'Picked Up': number
  Returned: number
  Missing: number
  /** A condition on the Returned quantity, never added to the total. */
  Damaged?: number
}

/** §1.6 — asserted in code and visibly failed if broken. */
export function assertItemCounts(c: ItemCounts, total: number): void {
  const sum = c.Ready + c['Picked Up'] + c.Returned + c.Missing
  if (sum !== total) {
    throw new Error(
      `§1.6 invariant violated: Ready ${c.Ready} + Picked Up ${c['Picked Up']} + Returned ${c.Returned} + ` +
        `Missing ${c.Missing} = ${sum}, but the booking has ${total} items`,
    )
  }
  if ((c.Damaged ?? 0) > c.Returned) {
    throw new Error(`§1.6: Damaged ${c.Damaged} exceeds Returned ${c.Returned} — damage is a condition on a returned item`)
  }
}

/** Converts a database item_quantity_state to workflow ItemState and Damaged flag */
export function normalizeItemState(rawState: string): { state: ItemState; isDamaged: boolean } {
  if (rawState === 'Damaged') {
    return { state: 'Returned', isDamaged: true }
  }
  if (rawState === 'Ready' || rawState === 'Picked Up' || rawState === 'Returned' || rawState === 'Missing') {
    return { state: rawState as ItemState, isDamaged: false }
  }
  return { state: 'Ready', isDamaged: false }
}

/* ── §1.9 · flags registry ─────────────────────────────────────────────── */

export type FlagType = 'State' | 'Information' | 'Attention' | 'Critical'

export type Flag =
  | 'Draft'
  | 'Partial Pickup'
  | 'Returned Early'
  | 'Due Soon'
  | 'Overdue'
  | 'Missing'
  | 'Damaged'
  | 'Not Reset'
  | 'Unverified'
  | 'Deposit Pending'
  | 'Payment Due'
  | 'Security Held'
  | 'Sub-Rented'
  | 'VIP'
  | 'Blocked'
  | 'Sessions'
  /** §1.3 — Cancelled is a flag, not a status. It preserves where the booking died. */
  | 'Cancelled'

export interface FlagMeta {
  type: FlagType
  effect: string
  /** §4.2 — gold is outline-only and belongs to external gear alone. */
  token: StatusKey
  /**
   * The statuses this flag refuses to let a booking advance **into**.
   *
   * Not a new rule: it is `effect` above it, made machine-readable so
   * `planTransition()` can read the registry instead of a screen re-typing
   * the prose. Empty for every flag whose `effect` names no transition —
   * including `Blocked` ("client cannot create **new** bookings" constrains
   * creation, not this booking's lifecycle) and `Not Reset` ("blocks
   * nothing", and §1.7 is explicit that Reset is not a close gate).
   */
  blocks: readonly BookingStatus[]
}

/**
 * "Blocks Handover" (§1.9, on Deposit Pending and Payment Due) resolved to the
 * status it actually stops — the one Handover sets — so the two cannot drift
 * apart if §1.5's table ever moves.
 */
const BLOCKS_HANDOVER: readonly BookingStatus[] = JOBS.Handover.sets === null ? [] : [JOBS.Handover.sets]

/** "Blocks Close" (§1.9, on Overdue, Missing and Damaged). */
const BLOCKS_CLOSE: readonly BookingStatus[] = ['Closed']

export const FLAGS: Record<Flag, FlagMeta> = {
  Draft: { type: 'State', effect: 'Quote not yet sent', token: 'neutral', blocks: [] },
  'Partial Pickup': { type: 'State', effect: 'Items remain at status Packed', token: 'out', blocks: [] },
  'Returned Early': { type: 'Information', effect: 'Reporting only', token: 'neutral', blocks: [] },
  'Due Soon': { type: 'Attention', effect: 'Yellow badge, ≤24h to return', token: 'progress', blocks: [] },
  Overdue: { type: 'Critical', effect: 'Red badge, blocks Close, triggers late-fee calculation', token: 'danger', blocks: BLOCKS_CLOSE },
  Missing: { type: 'Critical', effect: 'Blocks Close, opens a Case', token: 'danger', blocks: BLOCKS_CLOSE },
  Damaged: { type: 'Critical', effect: 'Blocks Close until charge approved or waived', token: 'danger', blocks: BLOCKS_CLOSE },
  'Not Reset': { type: 'Attention', effect: 'Warns at next pickup, blocks nothing', token: 'progress', blocks: [] },
  Unverified: { type: 'Attention', effect: 'Stock-check flag, self-heals on any later scan', token: 'progress', blocks: [] },
  'Deposit Pending': { type: 'Attention', effect: 'Blocks Handover, not Confirm', token: 'progress', blocks: BLOCKS_HANDOVER },
  'Payment Due': { type: 'Attention', effect: 'Blocks Handover, not Confirm', token: 'progress', blocks: BLOCKS_HANDOVER },
  // "Blocks silently closing" is not "blocks Close" — §1.7's four gates are the
  // close gates, and this one asks for custody to be *acknowledged*, not for the
  // transition to be refused. Left empty rather than hardened into a gate the
  // spec does not state. See PLAN.md §4.16.
  'Security Held': { type: 'State', effect: 'Cheque/ID held in custody; blocks silently closing', token: 'neutral', blocks: [] },
  'Sub-Rented': { type: 'State', effect: 'Gold outline; excluded from ROI', token: 'ext', blocks: [] },
  VIP: { type: 'Information', effect: 'Display only', token: 'neutral', blocks: [] },
  Blocked: { type: 'Critical', effect: 'Client cannot create new bookings', token: 'danger', blocks: [] },
  Sessions: { type: 'Information', effect: 'Count of handover/return sessions', token: 'neutral', blocks: [] },
  // §1.3 keeps Cancelled orthogonal to the six — 0015's header calls it "an
  // orthogonal terminal action on bookings, not a step in the forward-only
  // stage lifecycle" — and no spec text says a cancelled booking may not still
  // be walked to Closed for settlement. Not decided here. See PLAN.md §4.16.
  Cancelled: { type: 'Critical', effect: 'Excluded from every operational count and revenue figure', token: 'danger', blocks: [] },
}

/* ── §1.7 · close gates ────────────────────────────────────────────────── */

/**
 * What the four gates are READ FROM — corrected 7 Sep 2026 (audit MONEY-13,
 * RL-05, RL-06).
 *
 * All three of those defects were the same shape: **a gate that passes because
 * its predicate is vacuous or measures the wrong column.** A sum over zero
 * invoices is `0`, which read as "settled"; `pending_amount` was read as "still
 * held" when it means "not yet collected"; the damage count was a literal `0`.
 * Each field below therefore says what it is read from, because the previous
 * shape of this interface is what let three wrong readings look right.
 */
export interface CloseGateInput {
  /**
   * **MONEY-13.** Whether a bill for this rental exists at all — an invoice
   * that is neither `Draft` nor `Void`.
   *
   * R-01 makes invoicing manual and R-02 issues it at return, so a booking can
   * reach `Returned` having never been billed. `rentalOutstandingPaisa` is then
   * a sum over zero rows, which is `0`, which reads as "settled". *Never
   * billed* and *paid in full* are not the same fact; this field is the only
   * thing that separates them.
   */
  rentalInvoiced: boolean
  /** Σ `invoices.outstanding_amount` over every non-Void invoice, in paisa. */
  rentalOutstandingPaisa: number
  /**
   * **RL-05.** What Cine Sewa still **holds** of the client's money:
   * `received_amount − refunded_amount − applied_amount`, in paisa.
   *
   * Explicitly **not** `security_deposits.pending_amount`, which
   * `sync_deposit_balances` derives as `greatest(required − received, 0)` and
   * therefore means "not yet collected" — the opposite liability, and the one
   * that made a fully-collected, never-returned deposit read as resolved.
   * Foundation §1.7 gate 2, carried forward by R-00, is "deposit resolved —
   * refunded, forfeited, or applied", so the question is what is still held and
   * `0` is the only resolved answer. Law 5: it is the client's money.
   */
  depositHeldPaisa: number
  /** `cases` linked to the booking whose status is still an open one. */
  openCases: number
  /**
   * **RL-06.** `damage_findings` in `Pending Approval` and not voided, counted
   * through **both** parents — `return_lines → operation_sessions.booking_id`
   * (Return) and `cleaning_queue_entries.booking_id` (Reset). A constant here
   * is a gate that cannot fail, which is exactly what it was.
   */
  damageChargesPendingApproval: number
  /**
   * **§4.51.** Zero-Value Close Override.
   * When true and rentalOutstandingPaisa === 0, the invoice gate passes without an issued invoice.
   */
  isZeroValueOverride?: boolean
}

/**
 * §1.7 — all four must pass. **Reset is deliberately not a close gate**, and
 * neither is Cleaning; an un-reset item blocks the item, never the booking.
 * §5.6 wants failing gates to carry the blocking *value*, so each returns one —
 * and law 12 wants that value to be the actual figure or finding, in the words
 * the operator would use, not the word "blocked" and not a raw paisa integer.
 */
export function closeGates(i: CloseGateInput): Array<{ label: string; passing: boolean; blocking: string | null }> {
  const rs = (paisa: number): string => formatMoney(paisa as Paisa)

  /* MONEY-13 & §4.51 — "billed AND settled", or genuine zero-value override with 0 outstanding. */
  const settled =
    (i.rentalInvoiced && i.rentalOutstandingPaisa === 0) ||
    (i.isZeroValueOverride === true && i.rentalOutstandingPaisa === 0)
  const held = i.depositHeldPaisa
  const pending = i.damageChargesPendingApproval

  return [
    {
      label: 'Rental Outstanding settled',
      passing: settled,
      blocking: settled
        ? null
        : !i.rentalInvoiced
          ? 'nothing has been invoiced for this rental, so its outstanding balance is an empty sum rather than a settled account'
          : i.rentalOutstandingPaisa > 0
            ? `${rs(i.rentalOutstandingPaisa)} still outstanding`
            : `${rs(-i.rentalOutstandingPaisa)} overpaid — the invoice does not reconcile`,
    },
    {
      label: 'Deposit resolved',
      passing: held === 0,
      blocking:
        held === 0
          ? null
          : held > 0
            /* TODO(MONEY-10): drop the second clause once a screen records a Released or
               Applied deposit_movement. Nothing in src/actions or src/lib/queries writes one
               today, so telling the operator to "refund or apply it" names an action the app
               does not offer — the same dishonesty the floor verbs were just cleared of. */
            ? `${rs(held)} of the client's deposit is still held, so the rental cannot close — and no screen records a refund or an application yet`
            : `${rs(-held)} more deposit has been refunded or applied than was ever received`,
    },
    { label: 'No open Case', passing: i.openCases === 0, blocking: i.openCases === 0 ? null : `${i.openCases} open` },
    {
      label: 'No damage charge pending approval',
      passing: pending === 0,
      /* TODO(FORMS-05): drop the second clause once approving a finding writes
         damage_findings.approval_state. floorVerb only inserts findings today. */
      blocking:
        pending === 0
          ? null
          : `${pending} damage finding${pending === 1 ? '' : 's'} awaiting approval, and approving one is not built yet`,
    },
  ]
}

/* ── §1.2 + §1.7 + §1.9 · the transition decision ──────────────────────── */

/**
 * One refused clause. §5.6 wants a failing gate to carry the blocking *value*,
 * not just the word "blocked", so every blocker names one where it has one.
 */
export interface TransitionBlocker {
  /** Which of the three layers refused. */
  rule: 'forward-only' | 'flag' | 'close-gate'
  /** What the rule says, in the words the registry already holds. */
  label: string
  /** The value standing in the way, or `null` when the rule has none. */
  blocking: string | null
}

export interface TransitionRequest {
  from: BookingStatus
  to: BookingStatus
  /** §1.9 — the flags standing on the booking at the moment of the attempt. */
  flags?: readonly Flag[]
  /**
   * §1.7's four gates. **Required when `to` is `'Closed'`** — omitting it there
   * is itself a blocker, because "not evaluated" is not "passing".
   */
  gates?: CloseGateInput
}

export interface TransitionPlan {
  from: BookingStatus
  to: BookingStatus
  allowed: boolean
  /** Every reason, not the first — a screen shows the whole list inline (law 12). */
  blockers: TransitionBlocker[]
  /** §1.5 — the job whose completion sets `to`, when one does. */
  job: JobName | null
}

/**
 * The whole §1 question in one call: **may this booking move from `from` to
 * `to` right now?**
 *
 * Three layers, all read from the tables above rather than restated:
 *   1. `canAdvance` — §1.2's forward-only, no-skipping ordering.
 *   2. `FLAGS[f].blocks` — §1.9's registry.
 *   3. `closeGates` — §1.7's four, when and only when `to` is `'Closed'`.
 *
 * Pure. It decides; it does not write. `src/lib/bookingTransition.ts` is what
 * applies an allowed plan (law 1 — the engine owns the rule, the data layer
 * owns the row).
 *
 * A **reversal** is deliberately not expressible: §1.2 makes it a
 * Manager-approved audited exception, and `booking_stage_transitions.is_reversal`
 * (`0002_bookings.sql:447-452`) carries its own approver/reason/audit CHECK.
 */
export function planTransition(req: TransitionRequest): TransitionPlan {
  const { from, to } = req
  const flags = req.flags ?? []
  const blockers: TransitionBlocker[] = []

  if (!canAdvance(from, to)) {
    const next = STATUS_ORDER[BOOKING_STATUS[from].order + 1]
    blockers.push({
      rule: 'forward-only',
      label: `§1.2 is forward-only and stages may not be skipped: ${from} → ${to}`,
      blocking: next === undefined ? 'Closed is final — nothing follows it' : `the next stage is ${next}`,
    })
  }

  for (const flag of flags) {
    const meta = FLAGS[flag]
    if (meta.blocks.includes(to)) {
      blockers.push({ rule: 'flag', label: meta.effect, blocking: flag })
    }
  }

  if (to === 'Closed') {
    if (req.gates === undefined) {
      blockers.push({
        rule: 'close-gate',
        label: '§1.7 — all four close gates must pass',
        blocking: 'not evaluated: no CloseGateInput was supplied',
      })
    } else {
      for (const gate of closeGates(req.gates)) {
        if (!gate.passing) blockers.push({ rule: 'close-gate', label: gate.label, blocking: gate.blocking })
      }
    }
  }

  return { from, to, allowed: blockers.length === 0, blockers, job: jobThatSets(to) }
}

/* ── §1.4 · migration from the retired 12 stages ───────────────────────── */

/**
 * The v1.x vocabulary, kept **only** so existing seed data can be mapped
 * mechanically. It is not exported as a type, so a retired stage can never
 * reach a component.
 */
type RetiredStage =
  | 'Quote' | 'Draft' | 'Confirmed' | 'Preparing' | 'Ready' | 'Dispatched'
  | 'On Rent' | 'Return Due' | 'Inspection' | 'Cleaning' | 'Completed' | 'Closed' | 'Cancelled'

export interface Mapped {
  status: BookingStatus
  flags: Flag[]
  job?: { name: JobName; state: JobState }
}

/** §1.4's table, verbatim. */
const RETIRED: Record<RetiredStage, Mapped> = {
  Quote: { status: 'Quote', flags: [] },
  Draft: { status: 'Quote', flags: ['Draft'] },
  Confirmed: { status: 'Booked', flags: [] },
  Preparing: { status: 'Booked', flags: [], job: { name: 'Pack', state: 'In Progress' } },
  Ready: { status: 'Packed', flags: [] },
  Dispatched: { status: 'Packed', flags: ['Partial Pickup'] },
  'On Rent': { status: 'On Rent', flags: [] },
  'Return Due': { status: 'On Rent', flags: ['Due Soon'] },
  Inspection: { status: 'Returned', flags: [], job: { name: 'Return', state: 'In Progress' } },
  Cleaning: { status: 'Returned', flags: [], job: { name: 'Reset', state: 'In Progress' } },
  Completed: { status: 'Returned', flags: [] },
  Closed: { status: 'Closed', flags: [] },
  Cancelled: { status: 'Quote', flags: ['Cancelled'] },
}

/**
 * Translate a retired stage. §13.2 requires every 12-stage table to become a
 * pointer to §1.2 plus this mapping. Nothing in `src/` calls this any more —
 * every screen holds a `BookingStatus` — but it stays for the schema migration
 * and for importing pre-v2.0 records at go-live (§9.6).
 */
export function fromRetiredStage(stage: string): Mapped {
  const m = RETIRED[stage as RetiredStage]
  if (!m) throw new Error(`Unknown retired stage "${stage}" — v2.0 §1.2 defines six statuses`)
  return m
}

/* ── financial helper, unchanged in v2.0 §2.1 ──────────────────────────── */

/** §2.1 — `Rental Total − Payments`. Deposits never enter this (§2.2). */
export function outstanding(rentalTotal: number, rentalPayments: number): number {
  return rentalTotal - rentalPayments
}
