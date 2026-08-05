/**
 * Return & Inspection Workspace seed data — `04 Operations/Return Workflow.md`
 * v2.1 (Build Locked) + `Inspection Workflow.md`, with the render's defects
 * corrected rather than copied, and the module's own pre-Foundation vocabulary
 * translated rather than reproduced.
 *
 * ## Return vs Inspection — one workspace, not two
 *
 * `Inspection Workflow.md` states this directly: *"Inspection is not a separate
 * workspace. Equipment is received and inspected in the same screen, without
 * leaving it — that is the design intent of the Return workspace, which is
 * built around equipment, not paperwork."* So this file is the seed for both
 * halves of one screen, and `ReturnWorkspace.tsx` is the one component.
 *
 * ## The bigger correction: "Stage 6–11" is retired vocabulary
 *
 * `Return Workflow.md` "Consumes **Foundation v1.3**" (its own header), and
 * still speaks in the old 12-stage numbering — "Stage 6 On Rent", "Stage 8
 * Inspection", "Stage 9 Cleaning", "Stage 10 Completed", "Stage 11 Closed" —
 * and even invents a `Partial Return` flag and a `Late Return` flag that do not
 * exist in Foundation v2.2 §1.9's closed 17-flag registry. Per the governing
 * rule ("Where anything disagrees with Foundation, Foundation wins"), none of
 * that numbering or those two flags appear anywhere in this file or in
 * `ReturnWorkspace.tsx`. Translated instead, straight from `lib/workflow.ts`:
 *
 *   · "Stage 6 On Rent"                 → `BookingStatus` **'On Rent'** — exactly
 *     `JOBS.Return.runsAt`, so the two documents agree once translated.
 *   · "first item received sets Stage 8 + Partial Return"
 *                                        → Return `JobState` **'In Progress'**;
 *     shown as plain text ("N items still outstanding"), never a fabricated flag.
 *   · "final session closed sets Stage 9 Cleaning"
 *                                        → `JOBS.Return.sets` = **'Returned'**
 *     (§1.5, verbatim). Reset/"Cleaning" is job #4, out of scope here.
 *   · "Missing blocks Stage 10 Completed. Damaged blocks Stage 11 Closed."
 *                                        → Foundation has no "Completed" status.
 *     Its own §1.9 registry says both block the same real gate: `Missing` —
 *     "Blocks Close, opens a Case"; `Damaged` — "Blocks Close until charge
 *     approved or waived". Both are rendered here via `FLAGS.Missing.effect`
 *     / `FLAGS.Damaged.effect`, verbatim from the engine, not retyped.
 *   · "Late Return" flag (§4)            → not in the closed registry. The
 *     overrun is rendered as informational text, never a badge.
 *
 * ## §0 corrections applied
 *
 *  · Condition showed **Excellent and Damage both selected** on one item on the
 *    render → single-select, five values (§6.3). One `Condition` field, never two.
 *  · Nine render statuses conflated item state with routing destination →
 *    replaced with Foundation's real `ItemState` (Picked Up / Returned /
 *    Missing) for the line, plus a separate `InspectionState` for
 *    Pending → Inspected (§6.2). Foundation's `ItemState` values are used
 *    verbatim; `ITEM_STATE_LABEL` below only changes what is *displayed*
 *    ("Outstanding" for `Picked Up`, "Not Returned" for `Missing`), matching
 *    the module's own §6.2 wording without inventing a second type.
 *  · The render's `Missing 1` was an Allen key — an **accessory**, not an item
 *    (§6.5). Two counters, never merged. A genuinely missing *item* (the Top
 *    Handle) is seeded separately so the Critical-flag path is demonstrable.
 *  · Routing (Cleaning / Maintenance / Insurance) is **derived** from
 *    condition, never chosen by hand (§6.4) — `routeFor()`, not a stored field.
 *  · The render showed all three signatures captured at 10:16–10:17 while 11
 *    items were still out. This file seeds Session 1 (Complete, signed) and
 *    Session 2 (In Progress, unsigned) separately, so the workspace can prove
 *    signatures follow closure, never precede it (§9).
 *  · The render's breadcrumb read `Rentals › Booking › Return & Inspection ›
 *    BR-2613`; corrected to `Rentals › Bookings › {BOOKING.no} › Return` in
 *    the component, and `BR-2613` retired per Foundation §9.7's ID format.
 *
 * ## No money, anywhere, ever
 *
 * The build brief and Foundation §8.3 agree: *"Warehouse sees no monetary
 * value anywhere, including inside a gate checklist."* These are warehouse
 * floor screens. So `lib/money.ts` is not imported and no Paisa figure — no
 * deposit, no damage charge, no late fee, no rental total — is modelled in
 * this file at all. Only the non-monetary facts a warehouse screen is allowed
 * to show: item state, condition, accessories, evidence counts, decisions,
 * sessions and signatures. §8.2's late-fee formula and §8.4/§8.5's
 * money-adjacent rulings are open Foundation/module items (§14 / §16) and are
 * moot here regardless of how they're eventually decided.
 *
 * ## Granularity
 *
 * The render groups batteries into one row ("NP-FZ100 Battery x4"). Nothing in
 * §0 corrects this, but Foundation §9.3 models serials as their own units, and
 * the sibling Packing file (`packing.ts`) already made that call for this same
 * booking. This file matches it — one row per serialised unit — so condition,
 * an accessory checklist and a damage record can be tracked per serial, which
 * a qty-grouped row cannot support.
 */

import type { ItemState, ItemCounts, JobState, Flag } from '../lib/workflow'
import { assertItemCounts, FLAGS } from '../lib/workflow'

/** §6.3 — five values, single-select. `Needs Cleaning`/`Needs Repair` are retired: they were disposition, not condition (§0 #1). */
export type Condition = 'Excellent' | 'Good' | 'Fair' | 'Damaged' | 'Lost'

/** §6.2 — inspection is tracked separately from the item's return state. */
export type InspectionState = 'Pending' | 'Inspected'

/** A return session runs the same three-stage lifecycle `JobState` already models. */
export type SessionState = JobState

export type SessionId = 'S1' | 'S2'

/** §8.5 — the decision required for an item never returned. */
export type NotReturnedDecision = 'Still expected' | 'Charge replacement' | 'Insurance claim' | 'Write off'

export const NOT_RETURNED_DECISIONS: NotReturnedDecision[] = [
  'Still expected',
  'Charge replacement',
  'Insurance claim',
  'Write off',
]

export interface AccessoryCheck {
  name: string
  /** `null` — not yet checked. §12.1 gate 3 requires every accessory checked. */
  present: boolean | null
}

export interface DamageDetail {
  description: string
  /** §7 — mandatory on every Damaged/Lost line before a charge can be raised. */
  photos: number
  /** Warehouse routes a finding; only Manager/Owner may approve it (§8.3, §13). */
  routedForApproval: boolean
}

export interface Sig {
  name: string
  role: string
  at: string
}

export interface ReturnUnit {
  id: string
  name: string
  category: string
  serial: string
  /** §1.6 — `Ready` is unused here (nothing is pre-handover on this screen). */
  state: ItemState
  condition?: Condition
  inspection: InspectionState
  sessionId?: SessionId
  pickup: { at: string; by: string; photos: number }
  ret?: { at: string; by: string; photos: number }
  accessories?: AccessoryCheck[]
  damage?: DamageDetail
  note?: string
  /** §8.5 — set only once a Missing item's disposition is decided. */
  decision?: NotReturnedDecision
}

export interface ReturnSession {
  id: SessionId
  state: SessionState
  returningPerson: string
  receivingStaff: string
  startedAt: string
  closedAt?: string
  signatures: { returningPerson?: Sig; warehouseStaff?: Sig; witness?: Sig }
}

/**
 * The 18 units on the same FX3 Documentary Package booking Packing seeded.
 * Session 1 already closed with 8 items back; Session 2 is receiving the
 * Manfrotto tripod now. One item (Top Handle) never comes back — the seed
 * needed for the Missing-blocks-Close path to be provable, not just claimed.
 */
export const UNITS: ReturnUnit[] = [
  { id: 'r01', name: 'Sony FX3 Camera Body', category: 'Camera', serial: 'SN102', state: 'Returned', condition: 'Excellent', inspection: 'Inspected', sessionId: 'S1', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 3 }, ret: { at: '19 Jul 2026, 10:10 AM', by: 'Sagar Maharjan', photos: 2 } },
  { id: 'r02', name: 'NP-FZ100 Battery', category: 'Battery', serial: 'SN-BAT-001', state: 'Returned', condition: 'Good', inspection: 'Inspected', sessionId: 'S1', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 }, ret: { at: '19 Jul 2026, 10:11 AM', by: 'Sagar Maharjan', photos: 1 } },
  { id: 'r03', name: 'NP-FZ100 Battery', category: 'Battery', serial: 'SN-BAT-002', state: 'Returned', condition: 'Good', inspection: 'Inspected', sessionId: 'S1', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 }, ret: { at: '19 Jul 2026, 10:11 AM', by: 'Sagar Maharjan', photos: 1 } },
  { id: 'r04', name: 'NP-FZ100 Battery', category: 'Battery', serial: 'SN-BAT-003', state: 'Returned', condition: 'Good', inspection: 'Inspected', sessionId: 'S1', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 }, ret: { at: '19 Jul 2026, 10:11 AM', by: 'Sagar Maharjan', photos: 1 } },
  { id: 'r05', name: 'NP-FZ100 Battery', category: 'Battery', serial: 'SN-BAT-004', state: 'Returned', condition: 'Good', inspection: 'Inspected', sessionId: 'S1', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 }, ret: { at: '19 Jul 2026, 10:11 AM', by: 'Sagar Maharjan', photos: 1 } },
  { id: 'r06', name: '256GB CFexpress Type A', category: 'Media Card', serial: 'SN-CFX-001', state: 'Returned', condition: 'Good', inspection: 'Inspected', sessionId: 'S1', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 }, ret: { at: '19 Jul 2026, 10:12 AM', by: 'Sagar Maharjan', photos: 1 } },
  { id: 'r07', name: '256GB CFexpress Type A', category: 'Media Card', serial: 'SN-CFX-002', state: 'Returned', condition: 'Good', inspection: 'Inspected', sessionId: 'S1', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 }, ret: { at: '19 Jul 2026, 10:12 AM', by: 'Sagar Maharjan', photos: 1 } },
  { id: 'r08', name: 'NISI Athena 35mm T1.9', category: 'Lens', serial: 'SN-LEN-035', state: 'Picked Up', inspection: 'Pending', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 2 } },
  { id: 'r09', name: 'NISI Athena 50mm T1.9', category: 'Lens', serial: 'SN-LEN-050', state: 'Picked Up', inspection: 'Pending', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 2 } },
  { id: 'r10', name: 'NISI Athena 85mm T1.9', category: 'Lens', serial: 'SN-LEN-085', state: 'Picked Up', inspection: 'Pending', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 2 } },
  {
    id: 'r11',
    name: 'Manfrotto 504X',
    category: 'Support',
    serial: 'SN-TRP-001',
    state: 'Returned',
    condition: 'Damaged',
    // §6.3 — the render had this item Excellent *and* Damage at once. Seeded
    // with exactly one condition value and Inspection still Pending, so the
    // workspace can show Save Inspection actually gating the state change.
    inspection: 'Pending',
    sessionId: 'S2',
    pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 2 },
    ret: { at: '19 Jul 2026, 10:14 AM', by: 'Sagar Maharjan', photos: 1 },
    accessories: [
      { name: 'Tripod Head', present: true },
      { name: 'Quick Release Plate', present: true },
      { name: 'Pan Handle', present: true },
      { name: 'Carry Bag', present: true },
      // §6.5 — this is the missing accessory. It must never add to the
      // Items Not Returned count.
      { name: 'Allen Key', present: false },
    ],
    damage: { description: 'Minor scratches on leg locks and rubber grip.', photos: 1, routedForApproval: false },
    note: '',
  },
  { id: 'r12', name: 'Portkeys BM5 III', category: 'Monitor', serial: 'SN-MON-001', state: 'Returned', condition: 'Good', inspection: 'Inspected', sessionId: 'S1', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 }, ret: { at: '19 Jul 2026, 10:15 AM', by: 'Sagar Maharjan', photos: 1 } },
  { id: 'r13', name: 'Monitor Arm', category: 'Monitor', serial: 'SN-MON-002', state: 'Picked Up', inspection: 'Pending', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 0 } },
  { id: 'r14', name: 'SmallRig Cage', category: 'Support', serial: 'SN-RIG-001', state: 'Picked Up', inspection: 'Pending', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 } },
  {
    id: 'r15',
    name: 'Top Handle',
    category: 'Support',
    serial: 'SN-RIG-002',
    // The real Missing item — §1.9's Critical flag, not the render's confused
    // accessory count. No `decision` yet: §8.5 requires one be recorded.
    state: 'Missing',
    inspection: 'Pending',
    pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 0 },
  },
  { id: 'r16', name: 'Rode NTG5 Shotgun', category: 'Audio', serial: 'SN-AUD-001', state: 'Picked Up', inspection: 'Pending', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 } },
  { id: 'r17', name: 'Boom Pole', category: 'Audio', serial: 'SN-AUD-002', state: 'Picked Up', inspection: 'Pending', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 0 } },
  { id: 'r18', name: 'AtomX 500GB SSD', category: 'Storage', serial: 'SN-SSD-001', state: 'Picked Up', inspection: 'Pending', pickup: { at: '16 Jul 2026, 06:00 AM', by: 'Sagar Maharjan', photos: 1 } },
]

export const TOTAL_ITEMS = UNITS.length

/**
 * §1.6 invariant, asserted at module load exactly like `packing.ts`'s
 * `GROUP_SUM` check — the sum cannot silently drift because it is never
 * hand-typed anywhere; it is computed from `UNITS` every time.
 */
const COUNTS: ItemCounts = {
  Ready: UNITS.filter((u) => u.state === 'Ready').length,
  'Picked Up': UNITS.filter((u) => u.state === 'Picked Up').length,
  Returned: UNITS.filter((u) => u.state === 'Returned').length,
  Missing: UNITS.filter((u) => u.state === 'Missing').length,
  Damaged: UNITS.filter((u) => u.condition === 'Damaged').length,
}
assertItemCounts(COUNTS, TOTAL_ITEMS)

/** §12.1 gate 5 / §8.3 — Critical flags, effect text taken verbatim from the engine. */
export const MISSING_FLAG: Flag = 'Missing'
export const DAMAGED_FLAG: Flag = 'Damaged'
export const MISSING_EFFECT = FLAGS[MISSING_FLAG].effect
export const DAMAGED_EFFECT = FLAGS[DAMAGED_FLAG].effect

/** §6.2 display wording — Foundation's `ItemState` values are kept as-is; only the label changes. */
export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  Ready: 'Ready',
  'Picked Up': 'Outstanding',
  Returned: 'Returned',
  Missing: 'Not Returned',
}

/** §6 equipment-table filter chips. */
export const FILTERS: Array<'All' | ItemState> = ['All', 'Picked Up', 'Returned', 'Missing']

/**
 * §6.4 — routing is **derived** from condition, never chosen by hand. A pure
 * function rather than a stored field, so it cannot go stale against the
 * condition that produced it.
 */
export function routeFor(condition: Condition): { queue: string; then: string } {
  switch (condition) {
    case 'Excellent':
    case 'Good':
      return { queue: 'Cleaning', then: 'Available' }
    case 'Fair':
      return { queue: 'Cleaning', then: 'Available, flagged for review' }
    case 'Damaged':
      return { queue: 'Manager review → Maintenance', then: 'Available after repair' }
    case 'Lost':
      return { queue: 'Insurance / write-off', then: 'Replacement' }
  }
}

/** §3 — sessions, mirroring the Handover pattern. One In Progress at a time. */
export const SESSIONS: Record<SessionId, ReturnSession> = {
  S1: {
    id: 'S1',
    state: 'Complete',
    returningPerson: 'Sagar Maharjan',
    receivingStaff: 'Ramesh Dulal',
    startedAt: '19 Jul 2026, 10:08 AM',
    closedAt: '19 Jul 2026, 10:13 AM',
    // §9 — signatures belong to the session that closed, never an earlier one.
    signatures: {
      returningPerson: { name: 'Sagar Maharjan', role: 'Client Representative', at: '19 Jul 2026, 10:13 AM' },
      warehouseStaff: { name: 'Ramesh Dulal', role: 'Warehouse', at: '19 Jul 2026, 10:13 AM' },
    },
  },
  S2: {
    id: 'S2',
    state: 'In Progress',
    returningPerson: 'Sagar Maharjan',
    receivingStaff: 'Ramesh Dulal',
    startedAt: '19 Jul 2026, 10:14 AM',
    // §9 — unsigned. Session 2 has not closed, so it cannot carry a signature
    // yet; the render's defect was exactly this, seeded backwards on purpose.
    signatures: {},
  },
}

/** §4 — the booking's expected vs actual return, in the Foundation date form. */
export const RETURN_TIMING = {
  expected: { ad: '19 Jul 2026', time: '06:00 AM' },
  actual: { ad: '19 Jul 2026', time: '10:15 AM' },
  /**
   * Informational text, not a flag (see file header — "Late Return" is not in
   * Foundation §1.9's closed registry).
   */
  overrunText: '4h 15m past expected return',
}
