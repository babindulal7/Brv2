/**
 * Handover Workspace seed data — `04 Operations/Handover Workflow.md` v1.1
 * (Build Locked), built from the module's own §0 corrections rather than the
 * reference render, per Foundation §0: "a render is evidence of intent, not
 * authority." Where the module spec itself disagrees with Foundation, this
 * file follows Foundation (governing rule: "Where anything disagrees with
 * Foundation, Foundation wins") — exactly the precedent `returnInspection.ts`
 * set for this same booking, and this file is built to sit beside it.
 *
 * ## No money, anywhere, ever
 *
 * Foundation §8.3: *"Warehouse sees no monetary value anywhere, including
 * inside a gate checklist."* This is a warehouse floor screen, so
 * `lib/money.ts` is not imported and no Paisa figure — no rental total, no
 * outstanding balance, no deposit — is modelled in this file at all.
 *
 * The render prints `Outstanding Rs 1,24,506` in the booking strip and a full
 * Payment Summary card with every rupee figure the booking has. The 5 Aug
 * whole-app review flagged exactly this class of defect project-wide: *"money
 * still appearing on Warehouse-facing KPI cards as '(masked)' when §8.3
 * requires the field **absent**, not shown-with-no-value."* So the fix here
 * is not a masked placeholder — it is that `paymentVerified` and
 * `depositReceived` below are **booleans**, never amounts, and Invoice /
 * Receipt are not in `DOCUMENTS` at all (§13.1: "Documents — Invoice and
 * Receipt hidden" for Warehouse; there being no role switch in this build,
 * the safer reading is to never model the figure rather than gate a figure
 * that has nowhere to hide).
 *
 * ## §7.2 — one row per serialised unit, not the render's qty-grouped rows
 *
 * The render aggregates `NP-FZ100 Battery ×4` into a single row and tracks a
 * `2 / 4` fraction. Foundation §9.3 models serials as their own units, and
 * both sibling files on this booking — `packing.ts` and `returnInspection.ts`
 * — already made that call ("Nothing in §0 corrects this, but Foundation
 * §9.3 models serials as their own units, and the sibling Packing file
 * already made that call for this same booking. This file matches it.").
 * This file follows the same precedent: 18 rows, one per serial, matching
 * `packing.ts`'s roster exactly so the three workspaces describe one booking
 * consistently rather than three.
 *
 * ## Reusing the engine's own `ItemState`, not a fourth invented type
 *
 * §7.2's three line states — Remaining / Picked Up / Missing — are Foundation
 * §1.6's `ItemState` under different display words. "Remaining" *is* `Ready`:
 * an item still in the warehouse, not yet with the client. `returnInspection.ts`
 * made the identical call for "Outstanding" (`Picked Up`, relabelled) rather
 * than invent a `ReturnLineState`; `ITEM_STATE_LABEL` below is this file's
 * equivalent. `Returned` is a real member of the imported type but never
 * reached on this screen — Return is a later job, §1.5 — and is included only
 * because the type is imported whole, per §11 ("Every module imports these.
 * None reimplements them.").
 *
 * ## §0's "Landed in the build" scenario, taken as the starting point
 *
 * The build already gets the chips right — "`All 18 · Remaining 8 · Picked Up
 * 10 · Missing 0` with the invariant holding" is listed as needing no change.
 * So the seed below is not a blank slate the way `packing.ts` starts blank —
 * it starts *mid-handover*: Session 1 closed at 10 of 18, Session 2 open for
 * the remaining eight. `assertItemCounts` below is what keeps that honest —
 * it is derived from `UNITS` every time, never hand-typed as "10 / 8 / 0".
 *
 * ## Two more render defects the module's own table already names
 *
 *  · §6.2: *"A row with no possible value is not shown at all."* The render
 *    prints `Vehicle –` on a Customer Pickup. `DELIVERY_FIELDS` encodes the
 *    §6.2 table so a Customer Pickup never has a vehicle value to hide badly
 *    — the field is structurally absent, not blanked.
 *  · §14: the render times `Booking Confirmed` at 09:20 AM, *after* Packing
 *    Completed at 05:30 AM the same day. `TIMELINE` below is seeded in true
 *    chronological order and asserted ascending at load; the component
 *    renders it newest-first, which is a display choice, not a data one.
 */

import type { ItemState, ItemCounts, JobState, Flag } from '../lib/workflow'
import { assertItemCounts, FLAGS } from '../lib/workflow'

/** A handover session runs the same three-stage lifecycle `JobState` already models — the convention `returnInspection.ts` set for this booking's other session-based job. */
export type SessionState = JobState

export type SessionId = 'S1' | 'S2'

export type DeliveryMethod = 'Customer Pickup' | 'Babin Delivery' | 'Courier' | 'Third Party'

export interface HandoverUnit {
  id: string
  name: string
  group: string
  /** The physical case this line ships in — reused from `packing.ts`'s grouping so the evidence gate can be checked per case (§9.1 / §17's proposed granularity). */
  case: string
  serial: string
  required: boolean
  /** §1.6 — `Ready` reads "Remaining" here; `Returned` is never reached on this screen. */
  state: ItemState
  /** Set once the line is resolved (Picked Up or Missing) — which session resolved it. */
  sessionId?: SessionId
  handoverAt?: string
  /** Required once `state` is `Missing` — mirrors the ≥10-character reason rule used everywhere else in the app (§1.2 reversal, §2.5 discount, §11.4 override). */
  reason?: string
}

/**
 * The 18 units on FX3 Documentary Package — the same roster `packing.ts`
 * seeded for this booking. Ten already left in Session 1; the remaining
 * eight are what Session 2, open now, is for.
 */
export const UNITS: HandoverUnit[] = [
  { id: 'h01', name: 'Sony FX3 Camera Body', group: 'Camera', case: 'Pelican 1610', serial: 'SN102', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:05 AM' },
  { id: 'h02', name: 'NP-FZ100 Battery', group: 'Batteries', case: 'Pelican 1610', serial: 'SN-BAT-001', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:05 AM' },
  { id: 'h03', name: 'NP-FZ100 Battery', group: 'Batteries', case: 'Pelican 1610', serial: 'SN-BAT-002', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:05 AM' },
  { id: 'h04', name: 'NP-FZ100 Battery', group: 'Batteries', case: 'Pelican 1610', serial: 'SN-BAT-003', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:05 AM' },
  { id: 'h05', name: 'NP-FZ100 Battery', group: 'Batteries', case: 'Pelican 1610', serial: 'SN-BAT-004', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:05 AM' },
  { id: 'h06', name: '256GB CFexpress Type A', group: 'Cards', case: 'Pelican 1610', serial: 'SN-CFX-001', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:06 AM' },
  { id: 'h07', name: '256GB CFexpress Type A', group: 'Cards', case: 'Pelican 1610', serial: 'SN-CFX-002', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:06 AM' },
  { id: 'h08', name: 'NISI 35mm T1.9', group: 'Lens Set — NISI Athena Prime', case: 'Lens Case', serial: 'SN-LEN-035', required: true, state: 'Ready' },
  { id: 'h09', name: 'NISI 50mm T1.9', group: 'Lens Set — NISI Athena Prime', case: 'Lens Case', serial: 'SN-LEN-050', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:07 AM' },
  { id: 'h10', name: 'NISI 85mm T1.9', group: 'Lens Set — NISI Athena Prime', case: 'Lens Case', serial: 'SN-LEN-085', required: true, state: 'Ready' },
  { id: 'h11', name: 'Portkeys BM5 III', group: 'Monitor Kit — Portkeys', case: 'Accessories Case', serial: 'SN-MON-001', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:07 AM' },
  { id: 'h12', name: 'Monitor Arm', group: 'Monitor Kit — Portkeys', case: 'Accessories Case', serial: 'SN-MON-002', required: false, state: 'Ready' },
  { id: 'h13', name: 'SmallRig Cage', group: 'Support & Rigging', case: 'Accessories Case', serial: 'SN-RIG-001', required: true, state: 'Picked Up', sessionId: 'S1', handoverAt: '06:08 AM' },
  { id: 'h14', name: 'Top Handle', group: 'Support & Rigging', case: 'Accessories Case', serial: 'SN-RIG-002', required: false, state: 'Ready' },
  { id: 'h15', name: 'Rode NTG5 Shotgun', group: 'Audio Kit', case: 'Accessories Case', serial: 'SN-AUD-001', required: true, state: 'Ready' },
  { id: 'h16', name: 'Boom Pole', group: 'Audio Kit', case: 'Accessories Case', serial: 'SN-AUD-002', required: false, state: 'Ready' },
  { id: 'h17', name: 'BNC Cable 3m', group: 'Accessories & Cables', case: 'Accessories Case', serial: '—', required: true, state: 'Ready' },
  { id: 'h18', name: 'Pelican 1610 Case', group: 'Accessories & Cables', case: 'Accessories Case', serial: 'SN-ACC-002', required: true, state: 'Ready' },
]

export const TOTAL_ITEMS = UNITS.length

/**
 * §7.2 invariant — "Remaining + Picked Up + Missing = Total" — asserted at
 * module load via the same engine call `returnInspection.ts` uses, exactly
 * mirroring `packing.ts`'s `GROUP_SUM` check: derived from `UNITS`, never
 * hand-typed, so "10 / 8 / 0" cannot silently drift from the data.
 */
const COUNTS: ItemCounts = {
  Ready: UNITS.filter((u) => u.state === 'Ready').length,
  'Picked Up': UNITS.filter((u) => u.state === 'Picked Up').length,
  // Return is a later job (§1.5) — nothing on this screen is ever `Returned`.
  Returned: 0,
  Missing: UNITS.filter((u) => u.state === 'Missing').length,
}
assertItemCounts(COUNTS, TOTAL_ITEMS)

export const CASES: string[] = [...new Set(UNITS.map((u) => u.case))]

/** §7.2 display wording — Foundation's `ItemState` values kept as-is; only the label changes, same pattern as `returnInspection.ts`'s `ITEM_STATE_LABEL`. */
export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  Ready: 'Remaining',
  'Picked Up': 'Picked Up',
  Returned: 'Returned',
  Missing: 'Missing',
}

/** §7 equipment-table filter chips. */
export const FILTERS: Array<'All' | ItemState> = ['All', 'Ready', 'Picked Up', 'Missing']

export interface Sig {
  name: string
  role: string
  at: string
}

export interface HandoverSession {
  id: SessionId
  state: SessionState
  receiver: string
  receiverPhone: string
  warehouseStaff: string
  startedAt: string
  closedAt?: string
  /** §9.2 — captured at session close, never before. `driver` only exists as a key when the delivery method requires one (§6.2 / §9.2). */
  signatures: { receiver?: Sig; warehouse?: Sig; driver?: Sig; witness?: Sig }
  evidenceFiles: number
}

/** §2.1 — sessions, "mirroring the Handover pattern" `returnInspection.ts` already names this convention after. One In Progress at a time. */
export const SESSIONS: Record<SessionId, HandoverSession> = {
  S1: {
    id: 'S1',
    state: 'Complete',
    receiver: 'Bikash Thapa',
    receiverPhone: '+977 9841234567',
    warehouseStaff: 'Sagar Maharjan',
    startedAt: '16 Jul 2026, 06:05 AM',
    closedAt: '16 Jul 2026, 06:16 AM',
    signatures: {
      receiver: { name: 'Bikash Thapa', role: 'Receiver', at: '16 Jul 2026, 06:15 AM' },
      warehouse: { name: 'Sagar Maharjan', role: 'Warehouse', at: '16 Jul 2026, 06:16 AM' },
    },
    evidenceFiles: 5,
  },
  S2: {
    id: 'S2',
    state: 'In Progress',
    receiver: 'Bikash Thapa',
    receiverPhone: '+977 9841234567',
    warehouseStaff: 'Sagar Maharjan',
    startedAt: '16 Jul 2026, 02:00 PM',
    // §9.2 — unsigned. Session 2 has not closed, so it carries no signature yet.
    signatures: {},
    evidenceFiles: 0,
  },
}

/** The session this workspace is actively working. */
export const ACTIVE_SESSION: SessionId = 'S2'

/* ── §6.2 delivery method — which fields apply, table verbatim ─────────── */

export interface DeliveryFieldFlags {
  pickupPerson: boolean
  vehicle: boolean
  driver: boolean
  courier: boolean
  address: boolean
  warehouseStaff: boolean
  estimatedArrival: boolean
}

/**
 * §6.2's table, encoded rather than eyeballed per row. "The Handover Summary
 * currently shows `Vehicle –` on a customer pickup. A row with no possible
 * value is not shown at all" — this is what makes that true structurally: a
 * Customer Pickup has no `vehicle` key to render in the first place.
 */
export const DELIVERY_FIELDS: Record<DeliveryMethod, DeliveryFieldFlags> = {
  'Customer Pickup': { pickupPerson: true, vehicle: false, driver: false, courier: false, address: false, warehouseStaff: true, estimatedArrival: false },
  'Babin Delivery': { pickupPerson: false, vehicle: true, driver: true, courier: false, address: true, warehouseStaff: true, estimatedArrival: true },
  Courier: { pickupPerson: false, vehicle: false, driver: false, courier: true, address: true, warehouseStaff: true, estimatedArrival: true },
  'Third Party': { pickupPerson: true, vehicle: true, driver: true, courier: false, address: true, warehouseStaff: true, estimatedArrival: true },
}

/** §9.2 — Driver signs only on a delivery Babin, a courier or a third party drives. */
export function driverSignatureRequired(m: DeliveryMethod): boolean {
  return DELIVERY_FIELDS[m].driver
}

export const DELIVERY = {
  method: 'Customer Pickup' as DeliveryMethod,
  pickupPerson: 'Bikash Thapa',
  pickupPersonPhone: '+977 9841234567',
  warehouseStaff: 'Sagar Maharjan',
  /** §10.5-equivalent explanation card, replacing the render's warehouse map (§0 "Landed in the build"). */
  note: 'Items will be collected from our warehouse by the client. No delivery route to show.',
}

export const RECEIVER = {
  authorizedBy: 'Bikash Thapa (Director)',
  receiver: 'Bikash Thapa',
  phone: '+977 9841234567',
  email: 'bikash@himalayanfilms.com',
  govId: '27-01-74-12345',
}

/* ── §10 Documents — money documents never modelled, per §13.1 ─────────── */

export type DocumentState = 'Generated' | 'Not Generated'

/**
 * Rental Agreement and Packing List are already generated (from Confirm and
 * Pack); Delivery Note generates only on the final session close (§11.2). No
 * Invoice, no Receipt — §13.1 hides both for Warehouse, and this is a
 * Warehouse floor screen with no role switch to hide them behind, so they are
 * not in this list at all rather than present-and-masked.
 */
export const DOCUMENTS: Array<{ name: string; state: DocumentState }> = [
  { name: 'Rental Agreement', state: 'Generated' },
  { name: 'Packing List', state: 'Generated' },
  { name: 'Delivery Note', state: 'Not Generated' },
]

/* ── §1.9 flags — text taken verbatim from the engine, never retyped ───── */

export const PARTIAL_PICKUP_FLAG: Flag = 'Partial Pickup'
export const PARTIAL_PICKUP_EFFECT = FLAGS[PARTIAL_PICKUP_FLAG].effect

/* ── §14 Timeline — seeded in true order, asserted ascending ───────────── */

export interface TimelineEvent {
  id: string
  what: string
  who?: string
  at: Date
}

/**
 * The render times `Booking Confirmed` at 09:20 AM, after Packing Completed
 * at 05:30 AM the same day — "a booking confirmed after it was packed." Seeded
 * here in the order it actually happened; the component displays it
 * newest-first, which is presentation, not data.
 */
export const TIMELINE: TimelineEvent[] = [
  { id: 'e1', what: 'Booking Confirmed', who: 'by Sagar Maharjan', at: new Date('2026-07-16T05:00:00+05:45') },
  { id: 'e2', what: 'Packing Completed', who: 'by Ramesh Shrestha', at: new Date('2026-07-16T05:30:00+05:45') },
  { id: 'e3', what: 'Handover Started (Session 1)', who: 'by Sagar Maharjan', at: new Date('2026-07-16T06:05:00+05:45') },
  { id: 'e4', what: 'Session 1 Completed', who: '10 of 18 items handed over', at: new Date('2026-07-16T06:16:00+05:45') },
  { id: 'e5', what: 'Handover Started (Session 2)', who: 'by Sagar Maharjan', at: new Date('2026-07-16T14:00:00+05:45') },
]

/**
 * ⛔ This check used to `throw` at module scope. A module-evaluation throw is
 * **uncatchable** — it runs before React mounts, so no boundary can catch it and
 * the operator gets a blank white screen with nothing in it. `lib/money.ts` hit
 * exactly this and fixed it by *reporting* the failure instead of throwing; the
 * same pattern is used here.
 *
 * §14's ordering invariant still runs on every load. The failure is exported so
 * the screen can state it, and logged so a broken seed is never silent even
 * before a screen reads it.
 */
export const HANDOVER_SEED_ERROR: string | null = (() => {
  for (let i = 1; i < TIMELINE.length; i++) {
    const prev = TIMELINE[i - 1] as TimelineEvent
    const cur = TIMELINE[i] as TimelineEvent
    if (cur.at.getTime() < prev.at.getTime()) {
      return `§14 timeline violated: "${cur.what}" (${cur.at.toISOString()}) precedes "${prev.what}" (${prev.at.toISOString()}). The handover timeline is out of order — see src/data/handover.ts.`
    }
  }
  return null
})()

if (HANDOVER_SEED_ERROR) console.error(HANDOVER_SEED_ERROR)

/**
 * ⭐ TODO(decision) — `Handover Workflow.md` §17 leaves mandatory evidence
 * per session **open**: "one photo of loaded cases proposed." This is not the
 * same question as Packing's, which *was* ruled (`packing.ts`'s file header:
 * "⭐ RULED — evidence is mandatory... one photo per packed case"). Handover's
 * own module spec still lists it under "Needs Babin."
 *
 * Implemented at the same proposed granularity — one photo per case that has
 * something leaving in the active session — so the session's evidence gate is
 * checkable rather than unbuildable, but this is a stated placeholder for
 * that ruling, not a stand-in for it. If Babin rules otherwise (mandatory per
 * item, optional, or a fixed count per session regardless of case count),
 * only this constant and the gate that reads it need to change.
 */
export const EVIDENCE_MIN_PHOTOS_PER_CASE = 1
