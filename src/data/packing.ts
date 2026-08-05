/**
 * Packing Workspace seed data — `04 Operations/Packing Workflow.md` v2.1
 * (Build Locked), with the render's defects corrected rather than copied.
 *
 * §0 "Found in the screen" lists what the reference screenshots got wrong. The
 * one that shapes this file: **the bundle tree's group counts summed to 25 on
 * an 18-item booking** (1+4+2+3+3+3+3+6). So groups are not hand-listed here —
 * they are *derived* from the unit list, and asserted. The invariant cannot be
 * violated by editing data.
 */

/** §6 — six line states. No more. Blockers are reasons on a Pending row. */
export type LineState = 'Pending' | 'Packed' | 'Partial' | 'Missing' | 'Not Required' | 'Replaced'

export type Condition = 'Good' | 'Damaged'

export interface Unit {
  id: string
  group: string
  /**
   * The physical case this unit is packed into.
   *
   * ⭐ RULED — evidence **is** mandatory before Complete Packing, at the
   * granularity Evidence Workspace §14 proposes: **one photo per packed case,
   * not per item.** That gate is per-case, so cases have to be modelled; a
   * per-item rule would mean 18 photos for one booking.
   */
  case: string
  name: string
  /** Non-serialised lines (cables, gels) have no serial. */
  serial: string
  required: boolean
  location: string
  /** Photos attached to this line — §6 Evidence column. */
  evidence: number
  /** A reason this line cannot be packed yet. Shown on a Pending row, §6. */
  blocker?: string
}

/**
 * The 18 units on FX3 Documentary Package. Group counts come from this list.
 */
export const UNITS: Unit[] = [
  { id: 'u01', group: 'Camera', case: 'Pelican 1610', name: 'Sony FX3 Camera Body', serial: 'SN102', required: true, location: 'A2-01', evidence: 3 },
  { id: 'u02', group: 'Batteries', case: 'Pelican 1610', name: 'NP-FZ100 Battery', serial: 'SN-BAT-001', required: true, location: 'B1-01', evidence: 2 },
  { id: 'u03', group: 'Batteries', case: 'Pelican 1610', name: 'NP-FZ100 Battery', serial: 'SN-BAT-002', required: true, location: 'B1-02', evidence: 2 },
  { id: 'u04', group: 'Batteries', case: 'Pelican 1610', name: 'NP-FZ100 Battery', serial: 'SN-BAT-003', required: true, location: 'B1-03', evidence: 2 },
  { id: 'u05', group: 'Batteries', case: 'Pelican 1610', name: 'NP-FZ100 Battery', serial: 'SN-BAT-004', required: true, location: 'B1-04', evidence: 2 },
  { id: 'u06', group: 'Cards', case: 'Pelican 1610', name: '256GB CFexpress Type A', serial: 'SN-CFX-001', required: true, location: 'B2-01', evidence: 2 },
  { id: 'u07', group: 'Cards', case: 'Pelican 1610', name: '256GB CFexpress Type A', serial: 'SN-CFX-002', required: true, location: 'B2-02', evidence: 2 },
  { id: 'u08', group: 'Lens Set — NISI Athena Prime', case: 'Lens Case', name: 'NISI 35mm T1.9', serial: 'SN-LEN-035', required: true, location: 'C1-01', evidence: 2 },
  { id: 'u09', group: 'Lens Set — NISI Athena Prime', case: 'Lens Case', name: 'NISI 50mm T1.9', serial: 'SN-LEN-050', required: true, location: 'C1-02', evidence: 2 },
  {
    id: 'u10',
    group: 'Lens Set — NISI Athena Prime',
    case: 'Lens Case',
    name: 'NISI 85mm T1.9',
    serial: 'SN-LEN-085',
    required: true,
    location: 'C1-03',
    evidence: 0,
    // §6 — a blocker is a *reason on a Pending row*, never a seventh status.
    blocker: 'In Cleaning until 16:00',
  },
  { id: 'u11', group: 'Monitor Kit — Portkeys', case: 'Accessories Case', name: 'Portkeys BM5 III', serial: 'SN-MON-001', required: true, location: 'D1-03', evidence: 1 },
  { id: 'u12', group: 'Monitor Kit — Portkeys', case: 'Accessories Case', name: 'Monitor Arm', serial: 'SN-MON-002', required: false, location: 'D1-03', evidence: 0 },
  { id: 'u13', group: 'Support & Rigging', case: 'Accessories Case', name: 'SmallRig Cage', serial: 'SN-RIG-001', required: true, location: 'E1-01', evidence: 1 },
  { id: 'u14', group: 'Support & Rigging', case: 'Accessories Case', name: 'Top Handle', serial: 'SN-RIG-002', required: false, location: 'E1-01', evidence: 0 },
  { id: 'u15', group: 'Audio Kit', case: 'Accessories Case', name: 'Rode NTG5 Shotgun', serial: 'SN-AUD-001', required: true, location: 'F1-02', evidence: 1 },
  { id: 'u16', group: 'Audio Kit', case: 'Accessories Case', name: 'Boom Pole', serial: 'SN-AUD-002', required: false, location: 'F1-02', evidence: 0 },
  { id: 'u17', group: 'Accessories & Cables', case: 'Accessories Case', name: 'BNC Cable 3m', serial: '—', required: true, location: 'G1-05', evidence: 1 },
  { id: 'u18', group: 'Accessories & Cables', case: 'Accessories Case', name: 'Pelican 1610 Case', serial: 'SN-ACC-002', required: true, location: 'G1-05', evidence: 4 },
]

export const PACKAGE = { name: 'FX3 Documentary Package', note: '10% bundle discount' }

/** §5 — derived, never hand-listed. */
export const GROUPS: Array<{ name: string; count: number }> = Object.entries(
  UNITS.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.group]: (acc[u.group] ?? 0) + 1 }), {}),
).map(([name, count]) => ({ name, count }))

/** §5 invariant — the sum of group counts equals the package item count. */
export const TOTAL_ITEMS = UNITS.length
const GROUP_SUM = GROUPS.reduce((a, g) => a + g.count, 0)
if (GROUP_SUM !== TOTAL_ITEMS) {
  throw new Error(`Packing tree does not reconcile: groups sum to ${GROUP_SUM}, package has ${TOTAL_ITEMS}`)
}

/** Cases in packing order — derived, like the groups. */
export const CASES: string[] = [...new Set(UNITS.map((u) => u.case))]

/** §9 — Evidence panel. The matching engine already exists; this reports it. */
export const EVIDENCE = { total: 34, matched: 28, review: 4, unknown: 2 }

export const NOTES = {
  body: 'Checked all items and packed in cases. All good.',
  by: 'Ramesh Shrestha',
  at: '16 Jul 2026, 10:30 AM',
}

/** §6 filters. */
export const FILTERS: Array<'All' | LineState> = ['All', 'Pending', 'Packed', 'Partial', 'Missing', 'Not Required']
