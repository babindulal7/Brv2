import type { StatusKey } from './status'

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
  Closed: { order: 5, token: 'neutral', client: 'Complete', means: 'Money settled, deposit resolved, nothing open.' },
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
}

export const FLAGS: Record<Flag, FlagMeta> = {
  Draft: { type: 'State', effect: 'Quote not yet sent', token: 'neutral' },
  'Partial Pickup': { type: 'State', effect: 'Items remain at status Packed', token: 'progress' },
  'Returned Early': { type: 'Information', effect: 'Reporting only', token: 'neutral' },
  'Due Soon': { type: 'Attention', effect: 'Yellow badge, ≤24h to return', token: 'progress' },
  Overdue: { type: 'Critical', effect: 'Red badge, blocks Close, triggers late-fee calculation', token: 'danger' },
  Missing: { type: 'Critical', effect: 'Blocks Close, opens a Case', token: 'danger' },
  Damaged: { type: 'Critical', effect: 'Blocks Close until charge approved or waived', token: 'danger' },
  'Not Reset': { type: 'Attention', effect: 'Warns at next pickup, blocks nothing', token: 'progress' },
  Unverified: { type: 'Attention', effect: 'Stock-check flag, self-heals on any later scan', token: 'progress' },
  'Deposit Pending': { type: 'Attention', effect: 'Blocks Handover, not Confirm', token: 'progress' },
  'Payment Due': { type: 'Attention', effect: 'Blocks Handover, not Confirm', token: 'progress' },
  'Security Held': { type: 'State', effect: 'Cheque/ID held in custody; blocks silently closing', token: 'neutral' },
  'Sub-Rented': { type: 'State', effect: 'Gold outline; excluded from ROI', token: 'ext' },
  VIP: { type: 'Information', effect: 'Display only', token: 'neutral' },
  Blocked: { type: 'Critical', effect: 'Client cannot create new bookings', token: 'danger' },
  Sessions: { type: 'Information', effect: 'Count of handover/return sessions', token: 'neutral' },
  Cancelled: { type: 'Critical', effect: 'Excluded from every operational count and revenue figure', token: 'danger' },
}

/* ── §1.7 · close gates ────────────────────────────────────────────────── */

export interface CloseGateInput {
  rentalOutstandingPaisa: number
  depositResolved: boolean
  openCases: number
  damageChargesPendingApproval: number
}

/**
 * §1.7 — all four must pass. **Reset is deliberately not a close gate**, and
 * neither is Cleaning; an un-reset item blocks the item, never the booking.
 * §5.6 wants failing gates to carry the blocking *value*, so each returns one.
 */
export function closeGates(i: CloseGateInput): Array<{ label: string; passing: boolean; blocking: string | null }> {
  return [
    {
      label: 'Rental Outstanding settled',
      passing: i.rentalOutstandingPaisa === 0,
      blocking: i.rentalOutstandingPaisa === 0 ? null : String(i.rentalOutstandingPaisa),
    },
    { label: 'Deposit resolved', passing: i.depositResolved, blocking: i.depositResolved ? null : 'unresolved' },
    { label: 'No open Case', passing: i.openCases === 0, blocking: i.openCases === 0 ? null : `${i.openCases} open` },
    {
      label: 'No damage charge pending approval',
      passing: i.damageChargesPendingApproval === 0,
      blocking: i.damageChargesPendingApproval === 0 ? null : `${i.damageChargesPendingApproval} pending`,
    },
  ]
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
