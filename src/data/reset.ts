/**
 * Reset Workspace seed data — `04 Operations/Cleaning & Reset Workflow.md` v3.1
 * (Build Locked), with the render's defects corrected rather than copied.
 *
 * ⚠ Foundation §1.5 overrides the module spec's own title: **"Reset absorbs
 * Cleaning. There are four operations, not five. The rendered separate
 * Cleaning workspace is deleted; its per-item category checklists move inside
 * Reset."** So this file models ONE job (`workflow.ts`'s `Reset`), not two.
 * The module spec's §8 "Clean / Reset" toggle survives as a **display mode**
 * inside that one job — it changes which half of a unit's checklist is being
 * worked, never which workspace or which BookingStatus is in play.
 *
 * §0 "Found in the screen" lists what the reference screenshot got wrong. The
 * ones that shape this file:
 *  · Priority chips summed as if Priority were a fifth exclusive state
 *    (6+5+2+8=21, +3=24) → Priority is a computed **flag**, kept out of the
 *    `Waiting+Cleaning+QC+Ready` sum entirely (§3.2) — see `priorityTier`.
 *  · A single "Common Cleaning Checklist" gave a lens `Charge Batteries` and
 *    `Format Memory Cards` → §6.1 "the category checklist IS the checklist";
 *    only tasks that are *actually* common to every category live in
 *    `SHARED_CLEAN_TASKS`, and a lens never sees a battery task — see
 *    `cleanTasksFor` / `resetTasksFor`.
 *  · `Mark All Clean & Move to QC` was enabled at `0 / 30` → the workspace
 *    computes eligibility per item (§9.1/§9.2), asserted in the component,
 *    not here.
 *
 * Both invariants below are checked at module load and **throw**, mirroring
 * `packing.ts`'s `GROUP_SUM` check: a silently-broken checklist here would
 * make a gate lie about being satisfied, which is worse than a blank screen.
 */

import type { JobName } from '../lib/workflow'

/* ── §3.1 / §7.1 — the two small vocabularies this job introduces ────────── */

/**
 * The Reset job's own internal progress states. Deliberately **not**
 * `workflow.ts`'s `ItemState` (`Ready · Picked Up · Returned · Missing`) —
 * that layer already resolved to `Returned` before this workspace ever opens
 * (§1.4: retired stage 9 "Cleaning" maps to status **Returned** + job
 * **Reset** `In Progress`). These four are private to the Reset job, the way
 * `packing.ts`'s `LineState` is private to Pack. Foundation §1.1's three
 * layers stay three layers; this is not a fourth.
 */
export type QueueState = 'Waiting' | 'Cleaning' | 'QC' | 'Ready'

/** §7.1 — the "Any Problems?" quad. Set **per item**, never per batch. */
export type ProblemState = 'No Problems' | 'Missing Item' | 'Needs Repair' | 'Damaged'

/** §7.1 — where a non-default problem routes, and the record it opens. */
export const PROBLEM_ROUTE: Record<Exclude<ProblemState, 'No Problems'>, string> = {
  'Missing Item': 'Routed to Warehouse investigation — item flagged Missing',
  'Needs Repair': 'Routed to the Maintenance queue',
  Damaged: 'Raises a "Damage found post-inspection" case for Manager review',
}

export type Category = 'Camera' | 'Lens' | 'Battery' | 'Media' | 'Monitor' | 'Rig' | 'Audio' | 'Accessory'

export interface Unit {
  id: string
  category: Category
  name: string
  serial: string
  required: boolean
  location: string
  /** §8 — an item needing only cleaning is done after cleaning; a camera needs both. */
  needsClean: boolean
  needsReset: boolean
  assignedTo: string
  /**
   * How long this unit has been sitting in the queue.
   *
   * ⚠ **The last survivor of §4's priority table, and the only one that was
   * ever real.** `demand`, `vip` and `rush` sat beside it until 16 Aug 2026,
   * hand-typed per unit because — as the comment here used to admit — §4's
   * table is forward-looking, about the *next* booking a unit is needed for,
   * and no next-booking schedule existed to derive them from. PLAN.md §4.31(3)
   * dropped all three rather than keep inventing them.
   *
   * This one stayed because it is about *this* queue and it has a real source.
   * It is rendered as Queue Time, with `queueTimeTone` carrying the urgency
   * the Priority flag used to duplicate.
   */
  waitingMinutes: number
  /** Photos already attached. §11 — optional for routine cleaning. */
  evidence: number
}

/* ── §6.1 — the checklists. Category checklist IS the checklist ──────────── */

/** Tasks that happen to appear in every category's *clean* list — not a separate list. */
export const SHARED_CLEAN_TASKS = ['Clean exterior body', 'Check accessories', 'Put in case and close'] as const

const CATEGORY_CLEAN_EXTRA: Record<Category, readonly string[]> = {
  Camera: ['Clean sensor', 'Clean viewfinder / screen', 'Clean ports & connectors'],
  Lens: ['Clean front element', 'Clean rear element'],
  Battery: ['Clean contacts'],
  Media: ['Clean card contacts'],
  Monitor: ['Clean screen', 'Clean ports'],
  Rig: ['Clean mounting points'],
  Audio: ['Clean grille / windscreen'],
  Accessory: [],
}

/** §8 Reset mode — configuration, not touched by cleaning. No shared subset: format/reset tasks are inherently device-specific. */
const CATEGORY_RESET_EXTRA: Partial<Record<Category, readonly string[]>> = {
  Camera: [
    'Format memory cards',
    'Reset camera / device settings',
    'Reset white balance & picture profile',
    'Reset timecode',
    'Clear user presets',
    'Clear metadata',
    'Firmware check',
  ],
  Battery: ['Charge to 100%', 'Battery health check'],
  Media: ['Format memory card', 'Verify card health'],
  Monitor: ['Reset monitor settings', 'Firmware check'],
}

export function cleanTasksFor(u: Unit): string[] {
  return u.needsClean ? [...SHARED_CLEAN_TASKS, ...CATEGORY_CLEAN_EXTRA[u.category]] : []
}
export function resetTasksFor(u: Unit): string[] {
  return u.needsReset ? [...(CATEGORY_RESET_EXTRA[u.category] ?? [])] : []
}
/** The task list for the mode currently on display — a filter, not the gate. */
export function tasksFor(u: Unit, mode: 'Clean' | 'Reset'): string[] {
  return mode === 'Clean' ? cleanTasksFor(u) : resetTasksFor(u)
}
/**
 * §6.3's denominator and §9.1's completion test both read the **union** of
 * both modes — "Stage 9 completes only when both modes are done for every
 * item that requires them" (§8). The mode toggle only changes which half of
 * this list the panel is currently showing for ticking.
 */
export function allTasksFor(u: Unit): string[] {
  return [...cleanTasksFor(u), ...resetTasksFor(u)]
}

/* ── §4 priority — REMOVED 16 Aug 2026, PLAN.md §4.31(3) ──────────────────────
 *
 * `PriorityTier`, `priorityTier` and `isPriority` used to live here. All three
 * are gone, and this note stands in their place because their absence is a
 * ruling and not an oversight.
 *
 * `priorityTier` had four inputs: `demand`, `vip`, `rush` and `waitingMinutes`.
 * **Three of them had no column anywhere in the schema** — they were typed by
 * hand onto all 18 seed units, and §4's table they came from is forward-looking
 * (about the *next* booking a unit is needed for) with no next-booking schedule
 * to derive them from. The ruling dropped them rather than keep a queue whose
 * ordering nobody could explain or reproduce.
 *
 * That left `waitingMinutes > 240` as the only surviving clause — which is
 * exactly `queueTimeTone(m) === 'danger'`, already rendered on every row as
 * Queue Time. So a Priority flag reduced to that clause would have been a
 * second control saying precisely what the first one says, and the queue lost
 * nothing by dropping it: the urgency is still on screen, in the column that
 * was always derived from real data.
 *
 * ⚠ If prioritisation is wanted back, `queueTimeTone` is NOT the thing to
 * extend. Derive it from the next booking's pickup date — `queue entry →
 * product_units.id → inventory_reservations.asset_id → bookings.pickup_at` —
 * which is the alternative §4.31(3) passed over and the one that needs no new
 * column. Do not re-add a hand-set flag.
 */

/** Queue Time colour, §4: red past 4h, amber past 2h, gray below. */
export function queueTimeTone(minutes: number): 'danger' | 'progress' | 'neutral' {
  if (minutes > 240) return 'danger'
  if (minutes > 120) return 'progress'
  return 'neutral'
}

/* ── the 18 units on B-715 — same booking, same package as packing.ts ─
 * Reuses no import from packing.ts on purpose: this file needs its own shape
 * (category, needsClean/needsReset, queue timing) that packing's `Unit` does
 * not carry, exactly as `returnInspection.ts` keeps its own `ReturnUnit`
 * rather than reshaping packing's. Names/serials are kept identical to
 * packing.ts's UNITS so the same physical inventory reads the same on every
 * workspace — u10 (NISI 85mm) is the exact item packing.ts's blocker note
 * points at ("In Cleaning until 16:00"): this is that cleaning.
 */
export const UNITS: Unit[] = [
  { id: 'u01', category: 'Camera', name: 'Sony FX3 Camera Body', serial: 'SN102', required: true, location: 'A2-01', needsClean: true, needsReset: true, assignedTo: 'Sagar Maharjan', waitingMinutes: 320, evidence: 0 },
  { id: 'u02', category: 'Battery', name: 'NP-FZ100 Battery', serial: 'SN-BAT-001', required: true, location: 'B1-01', needsClean: true, needsReset: true, assignedTo: 'Sagar Maharjan', waitingMinutes: 250, evidence: 0 },
  { id: 'u03', category: 'Battery', name: 'NP-FZ100 Battery', serial: 'SN-BAT-002', required: true, location: 'B1-02', needsClean: true, needsReset: true, assignedTo: 'Bikash Thapa', waitingMinutes: 95, evidence: 0 },
  { id: 'u04', category: 'Battery', name: 'NP-FZ100 Battery', serial: 'SN-BAT-003', required: true, location: 'B1-03', needsClean: true, needsReset: true, assignedTo: 'Bikash Thapa', waitingMinutes: 60, evidence: 0 },
  { id: 'u05', category: 'Battery', name: 'NP-FZ100 Battery', serial: 'SN-BAT-004', required: true, location: 'B1-04', needsClean: true, needsReset: true, assignedTo: 'Niraj Karki', waitingMinutes: 40, evidence: 0 },
  { id: 'u06', category: 'Media', name: '256GB CFexpress Type A', serial: 'SN-CFX-001', required: true, location: 'B2-01', needsClean: true, needsReset: true, assignedTo: 'Niraj Karki', waitingMinutes: 50, evidence: 0 },
  { id: 'u07', category: 'Media', name: '256GB CFexpress Type A', serial: 'SN-CFX-002', required: true, location: 'B2-02', needsClean: true, needsReset: true, assignedTo: 'Niraj Karki', waitingMinutes: 45, evidence: 0 },
  { id: 'u08', category: 'Lens', name: 'NISI 35mm T1.9', serial: 'SN-LEN-035', required: true, location: 'C1-01', needsClean: true, needsReset: false, assignedTo: 'Bikash Thapa', waitingMinutes: 30, evidence: 0 },
  { id: 'u09', category: 'Lens', name: 'NISI 50mm T1.9', serial: 'SN-LEN-050', required: true, location: 'C1-02', needsClean: true, needsReset: false, assignedTo: 'Sagar Maharjan', waitingMinutes: 28, evidence: 0 },
  // §7.2 continuity — this is the unit packing.ts's u10 calls "In Cleaning until 16:00".
  { id: 'u10', category: 'Lens', name: 'NISI 85mm T1.9', serial: 'SN-LEN-085', required: true, location: 'C1-03', needsClean: true, needsReset: false, assignedTo: 'Bikash Thapa', waitingMinutes: 15, evidence: 0 },
  { id: 'u11', category: 'Monitor', name: 'Portkeys BM5 III', serial: 'SN-MON-001', required: true, location: 'D1-03', needsClean: true, needsReset: true, assignedTo: 'Niraj Karki', waitingMinutes: 20, evidence: 0 },
  { id: 'u12', category: 'Rig', name: 'Monitor Arm', serial: 'SN-MON-002', required: false, location: 'D1-03', needsClean: true, needsReset: false, assignedTo: 'Niraj Karki', waitingMinutes: 18, evidence: 0 },
  { id: 'u13', category: 'Rig', name: 'SmallRig Cage', serial: 'SN-RIG-001', required: true, location: 'E1-01', needsClean: true, needsReset: false, assignedTo: 'Sagar Maharjan', waitingMinutes: 12, evidence: 0 },
  { id: 'u14', category: 'Rig', name: 'Top Handle', serial: 'SN-RIG-002', required: false, location: 'E1-01', needsClean: true, needsReset: false, assignedTo: 'Bikash Thapa', waitingMinutes: 10, evidence: 0 },
  { id: 'u15', category: 'Audio', name: 'Rode NTG5 Shotgun', serial: 'SN-AUD-001', required: true, location: 'F1-02', needsClean: true, needsReset: false, assignedTo: 'Bikash Thapa', waitingMinutes: 25, evidence: 0 },
  { id: 'u16', category: 'Audio', name: 'Boom Pole', serial: 'SN-AUD-002', required: false, location: 'F1-02', needsClean: true, needsReset: false, assignedTo: 'Niraj Karki', waitingMinutes: 22, evidence: 0 },
  { id: 'u17', category: 'Accessory', name: 'BNC Cable 3m', serial: '—', required: true, location: 'G1-05', needsClean: true, needsReset: false, assignedTo: 'Sagar Maharjan', waitingMinutes: 8, evidence: 0 },
  { id: 'u18', category: 'Accessory', name: 'Pelican 1610 Case', serial: 'SN-ACC-002', required: true, location: 'G1-05', needsClean: true, needsReset: false, assignedTo: 'Bikash Thapa', waitingMinutes: 5, evidence: 0 },
]

export const TOTAL_ITEMS = UNITS.length

/** §5-style derivation — counts computed from the unit list, never hand-listed (mirrors packing.ts's GROUPS). */
export const CATEGORIES: Array<{ name: Category; count: number }> = Object.entries(
  UNITS.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.category]: (acc[u.category] ?? 0) + 1 }), {}),
).map(([name, count]) => ({ name: name as Category, count }))

const CATEGORY_SUM = CATEGORIES.reduce((a, c) => a + c.count, 0)

/**
 * §6.3's arithmetic, asserted the way `packing.ts` asserts `GROUP_SUM`: hand
 * count the expected total once, then report the moment a category task
 * list or a unit's clean/reset flags drift out of sync with it — the exact
 * "0 / 30 is correct arithmetic" trap §6.3 warns about, caught before it ships.
 */
export const TOTAL_TASKS = UNITS.reduce((sum, u) => sum + allTasksFor(u).length, 0)
const EXPECTED_TOTAL_TASKS = 97

/**
 * ⛔ Both checks above used to `throw` at module scope. A module-evaluation
 * throw is **uncatchable** — it runs before React mounts, so no boundary can
 * catch it and the operator gets a blank white screen with nothing in it.
 * `lib/money.ts` hit exactly this and fixed it by *reporting* the failure
 * instead of throwing; the same pattern is used here.
 *
 * Both invariants still run on every load, and both are still reported — the
 * value is exported so the screen can state it, and logged so a broken seed is
 * never silent even before a screen reads it.
 */
export const RESET_SEED_ERROR: string | null = (() => {
  const problems: string[] = []
  if (CATEGORY_SUM !== TOTAL_ITEMS) {
    problems.push(`the category tree sums to ${CATEGORY_SUM} units but the booking has ${TOTAL_ITEMS} items`)
  }
  if (TOTAL_TASKS !== EXPECTED_TOTAL_TASKS) {
    problems.push(`the checklist sums to ${TOTAL_TASKS} tasks, expected ${EXPECTED_TOTAL_TASKS}`)
  }
  return problems.length === 0
    ? null
    : `Reset seed data does not reconcile: ${problems.join('; ')}. Counts on this screen cannot be trusted — see src/data/reset.ts.`
})()

if (RESET_SEED_ERROR) console.error(RESET_SEED_ERROR)

/* ── misc seed reference data ─────────────────────────────────────────────── */

/** §12 — Warehouse performs Clean, Reset and QC; never sees or enters cost. */
export const STAFF = ['Sagar Maharjan', 'Bikash Thapa', 'Niraj Karki'] as const

/** §10 — QC is performed by someone other than the cleaner by default. */
export function defaultQcBy(actor: string): string {
  return STAFF.find((s) => s !== actor) ?? actor
}

/**
 * Opening snapshot — the three items already `Cleaning · In Progress` when
 * the workspace is opened, matching the render's initial selection. Every
 * other unit starts `Waiting`. This is what lets the component demonstrate
 * §4.3's fix live: these three are High priority (today / >4h wait) **and**
 * already started, so the corrected Next Priority panel (Waiting-only) must
 * not list them — unlike the render, which offered `Start` on a no-op.
 */
export const SEED_CLEANING: readonly string[] = ['u01', 'u02', 'u10']
export const SEED_QC: readonly string[] = ['u13', 'u15']
export const SEED_READY: readonly string[] = ['u17', 'u18']

export const QUEUE_FILTERS: Array<'All' | QueueState> = ['All', 'Waiting', 'Cleaning', 'QC', 'Ready']

export const DAMAGE_TYPES = ['Cosmetic', 'Functional', 'Structural'] as const
export const SEVERITIES = ['Low', 'Medium', 'High'] as const

/** The one job this whole workspace is. Re-exported so the component never repeats the literal. */
export const JOB_NAME: JobName = 'Reset'
