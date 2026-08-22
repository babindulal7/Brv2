import { rupees, type Paisa } from '../lib/money'

/**
 * Crew Assist — Crew Booking UI/UX Specification v3.2.
 *
 * Extracted out of `modules/crew/CrewBooking.tsx` (previously inline) so the
 * screen reads seed data the same way every other module does — `data/cases.ts`,
 * `data/today.ts` — rather than carrying its own literal array.
 *
 * §11 — four assignment states, plus a flag: `Cancelled` is not a fifth state,
 * it is a boolean on top of whichever state a booking died at ("a booking
 * reads `Confirmed · Cancelled`, so you can still see what was cancelled and
 * when"). §11 also splits payout status (Babin → crew) from the client's
 * invoice payment status (production → Babin) — "two ledgers, never one
 * column" — so this file's `PayoutStatus` is deliberately not named
 * `PaymentStatus`.
 */

export type CrewRole =
  | 'Director of Photography'
  | '1st AC'
  | '2nd AC'
  | 'Gaffer'
  | 'Sound Recordist'
  | 'Drone Operator'
  | 'DIT'
  | 'Grip'

export type AssignmentStatus = 'Draft' | 'Tentative' | 'Confirmed' | 'Completed'
export type PayoutStatus = 'Not due' | 'Due' | 'Paid'
/** §5.3 — mutually exclusive, summing to the roster. */
export type RosterState = 'Available' | 'Booked' | 'On Leave' | 'Off Duty'

export interface CrewAssignment {
  id: string
  /** Links to `CREW_ROSTER`. A booking is about a person, not just a name string. */
  crewId: string
  name: string
  role: CrewRole
  phone: string
  production: string
  linkedBooking: string
  /** §5.2 — travel-feasibility check needs a shoot location per assignment. */
  location: string
  startDateBs: string
  endDateBs: string
  startDateAd: string
  endDateAd: string
  days: number
  dayRatePaisa: Paisa
  totalCostPaisa: Paisa
  status: AssignmentStatus
  /** §11 — a flag, not a fifth status value. */
  cancelled: boolean
  payoutStatus: PayoutStatus
  isInternalStaff: boolean
  /**
   * Hover Intel System v2.1 (Crew card) — "Free 28–30 Jul" in the Glance.
   * No availability calendar exists in this build, so this is NOT derived
   * for every crew member; it is only ever the day after (and, if known,
   * before) a *real* assignment on file for that person. Every other row
   * leaves both fields `undefined` and the card states "Availability not
   * tracked" rather than guessing a date.
   */
  availableFromAd?: string
  availableToAd?: string
}

export interface CrewMember {
  id: string
  name: string
  role: CrewRole
  phone: string
  state: RosterState
  /**
   * Base day rate — matches how the real schema models it (`crew_members.day_rate`,
   * `crew_profiles_v2.daily_rate`, `supabase/migrations/0003`/`0009`), not a per-
   * assignment-only figure. A booking may still negotiate a different rate per
   * `CrewAssignment.dayRatePaisa`; this is the default a picker starts from.
   */
  dayRatePaisa: Paisa
}

/** §5.4 — fill rate needs a real (small) set of unfilled requests, not a fabricated ratio. */
export interface OpenRoleRequest {
  id: string
  role: CrewRole
  production: string
  neededFromAd: string
}

/* ── roster — people, distinct from assignments (§5.3) ──────────────────── */

/**
 * Base day rates match the rate each person already carries on their real
 * assignments in `CREW_DATA` below where one exists (e.g. Bikram Rai's
 * CB-2026-0001/0009 both use Rs 25,000) — kept consistent rather than
 * independently invented. The four people with no assignment on file
 * (Kabita Gurung, Ramesh Dulal, Prakash Thapa, Anita Shrestha) get a rate
 * matched to the nearest same-role peer's tier.
 */
export const CREW_ROSTER: CrewMember[] = [
  { id: 'CR-001', name: 'Bikram Rai', role: 'Director of Photography', phone: '+977 980-1739284', state: 'Booked', dayRatePaisa: rupees(25000) },
  { id: 'CR-002', name: 'Sita Tamang', role: '1st AC', phone: '+977 981-2938475', state: 'Booked', dayRatePaisa: rupees(15000) },
  { id: 'CR-003', name: 'Arjun Magar', role: 'Gaffer', phone: '+977 982-4857392', state: 'Booked', dayRatePaisa: rupees(12000) },
  { id: 'CR-004', name: 'Nima Sherpa', role: 'Drone Operator', phone: '+977 984-3921847', state: 'Available', dayRatePaisa: rupees(18000) },
  { id: 'CR-005', name: 'Sagar Maharjan', role: 'Sound Recordist', phone: '+977 985-7264193', state: 'Booked', dayRatePaisa: rupees(13000) },
  { id: 'CR-006', name: 'Kabita Gurung', role: '2nd AC', phone: '+977 986-9182736', state: 'Available', dayRatePaisa: rupees(12000) },
  { id: 'CR-007', name: 'Ramesh Dulal', role: 'Grip', phone: '+977 987-2846193', state: 'On Leave', dayRatePaisa: rupees(11000) },
  { id: 'CR-008', name: 'Prakash Thapa', role: 'DIT', phone: '+977 988-5739284', state: 'Available', dayRatePaisa: rupees(14000) },
  { id: 'CR-009', name: 'Manisha Karki', role: '1st AC', phone: '+977 989-3827164', state: 'Off Duty', dayRatePaisa: rupees(14000) },
  { id: 'CR-010', name: 'Bishal Lama', role: 'Gaffer', phone: '+977 981-6293847', state: 'Available', dayRatePaisa: rupees(12000) },
  { id: 'CR-011', name: 'Anita Shrestha', role: 'Sound Recordist', phone: '+977 982-8371946', state: 'Available', dayRatePaisa: rupees(13000) },
  { id: 'CR-012', name: 'Deepak Adhikari', role: 'Drone Operator', phone: '+977 983-4728193', state: 'Booked', dayRatePaisa: rupees(18000) },
]

/* ── assignments ──────────────────────────────────────────────────────────
 * CB-2026-0009/0010 are a deliberate Confirmed×Confirmed overlap on the same
 * person (Bikram Rai) so §5.1's conflict detection has a real positive to
 * find, not just an absence to prove. CB-2026-0011/0012 are a deliberate
 * different-location adjacent-booking pair (Sagar Maharjan: Pokhara then
 * Kathmandu with a one-day gap) for §5.2's travel-feasibility warning.
 */
export const CREW_DATA: CrewAssignment[] = [
  {
    id: 'CB-2026-0001',
    crewId: 'CR-001',
    name: 'Bikram Rai',
    role: 'Director of Photography',
    phone: '+977 980-1739284',
    production: 'Kathmandu Cinema Works - TVC',
    linkedBooking: 'B-715',
    location: 'Kathmandu',
    startDateBs: '2083/04/10',
    endDateBs: '2083/04/14',
    startDateAd: '25 Jul 2026',
    endDateAd: '29 Jul 2026',
    days: 5,
    dayRatePaisa: rupees(25000),
    totalCostPaisa: rupees(125000),
    status: 'Confirmed',
    cancelled: false,
    payoutStatus: 'Due',
    isInternalStaff: false,
    availableFromAd: '30 Jul 2026',
  },
  {
    id: 'CB-2026-0002',
    crewId: 'CR-002',
    name: 'Sita Tamang',
    role: '1st AC',
    phone: '+977 981-2938475',
    production: 'Kathmandu Cinema Works - TVC',
    linkedBooking: 'B-715',
    location: 'Kathmandu',
    startDateBs: '2083/04/10',
    endDateBs: '2083/04/14',
    startDateAd: '25 Jul 2026',
    endDateAd: '29 Jul 2026',
    days: 5,
    dayRatePaisa: rupees(15000),
    totalCostPaisa: rupees(75000),
    status: 'Confirmed',
    cancelled: false,
    payoutStatus: 'Due',
    isInternalStaff: true,
  },
  {
    id: 'CB-2026-0003',
    crewId: 'CR-003',
    name: 'Arjun Magar',
    role: 'Gaffer',
    phone: '+977 982-4857392',
    production: 'Himalayan Films - Doc',
    linkedBooking: 'B-708',
    location: 'Bhaktapur',
    startDateBs: '2083/04/12',
    endDateBs: '2083/04/15',
    startDateAd: '27 Jul 2026',
    endDateAd: '30 Jul 2026',
    days: 4,
    dayRatePaisa: rupees(12000),
    totalCostPaisa: rupees(48000),
    status: 'Tentative',
    cancelled: false,
    payoutStatus: 'Not due',
    isInternalStaff: false,
  },
  {
    id: 'CB-2026-0004',
    crewId: 'CR-004',
    name: 'Nima Sherpa',
    role: 'Drone Operator',
    phone: '+977 984-3921847',
    production: 'Red Dot Films - Corporate',
    linkedBooking: 'B-695',
    location: 'Kathmandu',
    startDateBs: '2083/03/25',
    endDateBs: '2083/03/26',
    startDateAd: '09 Jul 2026',
    endDateAd: '10 Jul 2026',
    days: 2,
    dayRatePaisa: rupees(18000),
    totalCostPaisa: rupees(36000),
    status: 'Completed',
    cancelled: false,
    payoutStatus: 'Paid',
    isInternalStaff: false,
    availableFromAd: '11 Jul 2026',
  },
  {
    id: 'CB-2026-0005',
    crewId: 'CR-005',
    name: 'Sagar Maharjan',
    role: 'Sound Recordist',
    phone: '+977 985-7264193',
    production: 'Mandala Film Productions - Feature',
    linkedBooking: 'B-712',
    location: 'Kathmandu',
    startDateBs: '2083/04/08',
    endDateBs: '2083/04/09',
    startDateAd: '23 Jul 2026',
    endDateAd: '24 Jul 2026',
    days: 2,
    dayRatePaisa: rupees(13000),
    totalCostPaisa: rupees(26000),
    status: 'Completed',
    cancelled: false,
    payoutStatus: 'Paid',
    isInternalStaff: false,
  },
  {
    id: 'CB-2026-0006',
    crewId: 'CR-009',
    name: 'Manisha Karki',
    role: '1st AC',
    phone: '+977 989-3827164',
    production: 'Studio Nine - Music Video',
    linkedBooking: 'B-703',
    location: 'Lalitpur',
    startDateBs: '2083/04/01',
    endDateBs: '2083/04/02',
    startDateAd: '16 Jul 2026',
    endDateAd: '17 Jul 2026',
    days: 2,
    dayRatePaisa: rupees(14000),
    totalCostPaisa: rupees(28000),
    status: 'Confirmed',
    cancelled: true,
    payoutStatus: 'Not due',
    isInternalStaff: true,
  },
  {
    id: 'CB-2026-0007',
    crewId: 'CR-012',
    name: 'Deepak Adhikari',
    role: 'Drone Operator',
    phone: '+977 983-4728193',
    production: 'Sunrise Events - Wedding',
    linkedBooking: 'B-720',
    location: 'Kathmandu',
    startDateBs: '2083/04/16',
    endDateBs: '2083/04/16',
    startDateAd: '31 Jul 2026',
    endDateAd: '31 Jul 2026',
    days: 1,
    dayRatePaisa: rupees(18000),
    totalCostPaisa: rupees(18000),
    status: 'Draft',
    cancelled: false,
    payoutStatus: 'Not due',
    isInternalStaff: false,
  },
  {
    id: 'CB-2026-0008',
    crewId: 'CR-010',
    name: 'Bishal Lama',
    role: 'Gaffer',
    phone: '+977 981-6293847',
    production: 'Himalayan Films - Doc',
    linkedBooking: 'B-708',
    location: 'Bhaktapur',
    startDateBs: '2083/04/12',
    endDateBs: '2083/04/15',
    startDateAd: '27 Jul 2026',
    endDateAd: '30 Jul 2026',
    days: 4,
    dayRatePaisa: rupees(12000),
    totalCostPaisa: rupees(48000),
    status: 'Tentative',
    cancelled: false,
    payoutStatus: 'Not due',
    isInternalStaff: false,
  },
  // Deliberate Confirmed×Confirmed overlap on Bikram Rai — §5.1.
  {
    id: 'CB-2026-0009',
    crewId: 'CR-001',
    name: 'Bikram Rai',
    role: 'Director of Photography',
    phone: '+977 980-1739284',
    production: 'Vision Production - TVC',
    linkedBooking: 'B-710',
    location: 'Kathmandu',
    startDateBs: '2083/04/11',
    endDateBs: '2083/04/13',
    startDateAd: '26 Jul 2026',
    endDateAd: '28 Jul 2026',
    days: 3,
    dayRatePaisa: rupees(25000),
    totalCostPaisa: rupees(75000),
    status: 'Confirmed',
    cancelled: false,
    payoutStatus: 'Not due',
    isInternalStaff: false,
  },
  // Deliberate travel-infeasible adjacent pair on Sagar Maharjan — §5.2.
  {
    id: 'CB-2026-0010',
    crewId: 'CR-005',
    name: 'Sagar Maharjan',
    role: 'Sound Recordist',
    phone: '+977 985-7264193',
    production: 'Feature Film - Pokhara Unit',
    linkedBooking: 'B-713',
    location: 'Pokhara',
    startDateBs: '2083/04/13',
    endDateBs: '2083/04/14',
    startDateAd: '28 Jul 2026',
    endDateAd: '29 Jul 2026',
    days: 2,
    dayRatePaisa: rupees(13000),
    totalCostPaisa: rupees(26000),
    status: 'Confirmed',
    cancelled: false,
    payoutStatus: 'Not due',
    isInternalStaff: false,
  },
  {
    id: 'CB-2026-0011',
    crewId: 'CR-005',
    name: 'Sagar Maharjan',
    role: 'Sound Recordist',
    phone: '+977 985-7264193',
    production: 'Web Series - KTM Unit',
    linkedBooking: 'B-716',
    location: 'Kathmandu',
    startDateBs: '2083/04/15',
    endDateBs: '2083/04/15',
    startDateAd: '30 Jul 2026',
    endDateAd: '30 Jul 2026',
    days: 1,
    dayRatePaisa: rupees(13000),
    totalCostPaisa: rupees(13000),
    status: 'Confirmed',
    cancelled: false,
    payoutStatus: 'Not due',
    isInternalStaff: false,
  },
]

/** §5.4 — a small, real set of unfilled requests, so fill rate is computed, not invented. */
export const OPEN_ROLE_REQUESTS: OpenRoleRequest[] = [
  { id: 'OR-001', role: 'Gaffer', production: 'Creative Dot - Corporate Video', neededFromAd: '3 Aug 2026' },
  { id: 'OR-002', role: 'DIT', production: 'Altitude Studios - Web Series', neededFromAd: '5 Aug 2026' },
]

/* ── §2 · financial model ────────────────────────────────────────────────
 * Settings ▸ Finance value (mirrored for reference in Settings.tsx's
 * "Taxes & fiscal year" section, same convention as VAT rate) — never a
 * magic number at the call site. Rs 1,000 is the spec's proposed default
 * (§2.2), not yet a confirmed figure; see PLAN.md §4 for the open decision.
 *
 * TODO(decision) — WIREFRAME_RULINGS_2026-08-12.md §9.11, left open on
 * purpose: `FEE_PER_CREW_DAY_PAISA` is declared **twice** — here at Rs 1,000
 * (the figure PLAN.md:839 records) and again at `data/settings.ts:8` at
 * Rs 500, dead but exported under the identical name. Whoever splits Settings
 * into eight files will otherwise import the wrong one by name and halve a
 * billed rate. Not resolved here: §9 items are explicitly not for a page
 * agent to settle, and `data/settings.ts` is another agent's file.
 */
export const FEE_PER_CREW_DAY_PAISA: Paisa = rupees(1000)

/**
 * §2.3's expense figure (meals/travel/hotel/fuel/misc, this month) — no
 * per-line expense data model exists in this build yet (that's Expenses'
 * own screen), so this is one named seed total rather than an invented
 * per-line breakdown. Recharged at cost under Model A (§2.3 decision A).
 */
export const CREW_EXPENSES_THIS_MONTH_PAISA: Paisa = rupees(329300)

/* ── §5.1 · conflict detection — derived, never stored ───────────────────
 * Confirmed×Confirmed on the same person is a hard block; Tentative×Confirmed
 * is a warning; both are surfaced here as the same "conflict" concept the
 * table/rail render, distinguished by `severity`.
 */
export interface CrewConflict {
  crewId: string
  name: string
  a: CrewAssignment
  b: CrewAssignment
  severity: 'Critical' | 'Warning'
}

function parseAd(s: string): number {
  const [d, mon, y] = s.trim().split(/\s+/)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = mon ? MONTHS.indexOf(mon) : -1
  if (!d || month < 0 || !y) return NaN
  return Date.UTC(Number(y), month, Number(d))
}

function overlaps(a: CrewAssignment, b: CrewAssignment): boolean {
  const aStart = parseAd(a.startDateAd)
  const aEnd = parseAd(a.endDateAd)
  const bStart = parseAd(b.startDateAd)
  const bEnd = parseAd(b.endDateAd)
  if ([aStart, aEnd, bStart, bEnd].some((n) => Number.isNaN(n))) return false
  return aStart <= bEnd && bStart <= aEnd
}

/** §5.1's rule table: Confirmed×Confirmed blocked, Tentative×Confirmed warned, cancelled bookings never conflict. */
export function detectConflicts(assignments: CrewAssignment[] = CREW_DATA): CrewConflict[] {
  const conflicts: CrewConflict[] = []
  const byPerson = new Map<string, CrewAssignment[]>()
  for (const a of assignments) {
    if (a.cancelled) continue
    const list = byPerson.get(a.crewId) ?? []
    list.push(a)
    byPerson.set(a.crewId, list)
  }
  for (const [crewId, list] of byPerson) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i] as CrewAssignment
        const b = list[j] as CrewAssignment
        if (!overlaps(a, b)) continue
        const bothConfirmed = a.status === 'Confirmed' && b.status === 'Confirmed'
        const oneTentative =
          (a.status === 'Tentative' && b.status === 'Confirmed') || (a.status === 'Confirmed' && b.status === 'Tentative')
        if (bothConfirmed) conflicts.push({ crewId, name: a.name, a, b, severity: 'Critical' })
        else if (oneTentative) conflicts.push({ crewId, name: a.name, a, b, severity: 'Warning' })
      }
    }
  }
  return conflicts
}

/** The set of assignment IDs sitting inside at least one conflict — for row-level highlighting. */
export function conflictedAssignmentIds(conflicts: CrewConflict[]): Set<string> {
  const ids = new Set<string>()
  for (const c of conflicts) {
    ids.add(c.a.id)
    ids.add(c.b.id)
  }
  return ids
}

/* ── §5.2 · travel feasibility — a warning, never a block ────────────────
 * Simplified: same person, different location, adjacent bookings with less
 * than `MIN_GAP_DAYS` clear between them. The real per-location-pair travel
 * time table (§5.2: "configurable per location pair in Settings") doesn't
 * exist yet — this uses one fixed default gap rather than inventing a table.
 */
export interface TravelWarning {
  crewId: string
  name: string
  from: CrewAssignment
  to: CrewAssignment
  gapDays: number
}

const MIN_GAP_DAYS = 1

export function detectTravelWarnings(assignments: CrewAssignment[] = CREW_DATA): TravelWarning[] {
  const warnings: TravelWarning[] = []
  const byPerson = new Map<string, CrewAssignment[]>()
  for (const a of assignments) {
    if (a.cancelled) continue
    const list = byPerson.get(a.crewId) ?? []
    list.push(a)
    byPerson.set(a.crewId, list)
  }
  for (const [crewId, list] of byPerson) {
    const sorted = [...list].sort((a, b) => parseAd(a.startDateAd) - parseAd(b.startDateAd))
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i] as CrewAssignment
      const to = sorted[i + 1] as CrewAssignment
      if (from.location === to.location) continue
      const gapMs = parseAd(to.startDateAd) - parseAd(from.endDateAd)
      if (Number.isNaN(gapMs)) continue
      const gapDays = gapMs / 86400000
      if (gapDays >= 0 && gapDays <= MIN_GAP_DAYS) {
        warnings.push({ crewId, name: from.name, from, to, gapDays })
      }
    }
  }
  return warnings
}

/* ── §5.3 · roster reconciliation — asserted, never trusted silently ────── */

export function rosterSummary(roster: CrewMember[] = CREW_ROSTER) {
  const available = roster.filter((c) => c.state === 'Available').length
  const booked = roster.filter((c) => c.state === 'Booked').length
  const onLeave = roster.filter((c) => c.state === 'On Leave').length
  const offDuty = roster.filter((c) => c.state === 'Off Duty').length
  const total = roster.length
  const reconciles = available + booked + onLeave + offDuty === total
  return { available, booked, onLeave, offDuty, total, reconciles }
}

/* ── the chip row's three states over the model's four ───────────────────
 * Spec 06 §6.1 draws `(All)(Available)(Booked)(Unavailable)`. The model has
 * four mutually-exclusive states summing to the roster, and `rosterSummary`'s
 * reconciliation invariant depends on all four existing separately.
 *
 * So `Unavailable` is a **view**, not a state: the union of On Leave and Off
 * Duty, collapsed in the chip row **only**. The rail still breaks the two out,
 * and nothing here narrows `RosterState`. Kept in this file rather than in the
 * screen so the union is defined once (law 1 — pages never implement business
 * logic) and the chip count can never drift from what the chip selects.
 */

export type RosterChip = 'All' | 'Available' | 'Booked' | 'Unavailable'

export const ROSTER_CHIPS: readonly RosterChip[] = ['All', 'Available', 'Booked', 'Unavailable'] as const

/** The underlying states a chip selects. `null` means "no constraint" (All). */
export function rosterStatesFor(chip: RosterChip): RosterState[] | null {
  if (chip === 'All') return null
  if (chip === 'Unavailable') return ['On Leave', 'Off Duty']
  return [chip]
}

export function matchesRosterChip(member: CrewMember, chip: RosterChip): boolean {
  const states = rosterStatesFor(chip)
  return states === null || states.includes(member.state)
}

/** Counts for the chip row, derived from the same summary the rail renders. */
export function rosterChipCounts(roster: CrewMember[] = CREW_ROSTER): Record<RosterChip, number> {
  const s = rosterSummary(roster)
  return { All: s.total, Available: s.available, Booked: s.booked, Unavailable: s.onLeave + s.offDuty }
}

/* ── date predicates over an assignment, shared by the screen ────────────
 * `parseAd` above is private and the screen had its own copy of it. One
 * parser, exported, so a day-strip box and a conflict check can never
 * disagree about which days an assignment covers.
 */

/** `'25 Jul 2026'` → a UTC day number, or `NaN` when the seed string is malformed. */
export function adDayMs(s: string): number {
  return parseAd(s)
}

export function assignmentCoversDay(a: CrewAssignment, dayMs: number): boolean {
  const s = parseAd(a.startDateAd)
  const e = parseAd(a.endDateAd)
  if (Number.isNaN(s) || Number.isNaN(e)) return false
  return dayMs >= s && dayMs <= e
}

export function assignmentOverlapsRange(a: CrewAssignment, startMs: number, endMs: number): boolean {
  const s = parseAd(a.startDateAd)
  const e = parseAd(a.endDateAd)
  if (Number.isNaN(s) || Number.isNaN(e)) return false
  return s <= endMs && startMs <= e
}

/* ── §5.1 applied to a *prospective* booking ─────────────────────────────
 * `detectConflicts` compares two assignments that already exist.
 * `prospectiveConflicts` asks the same rule table about a range someone is
 * about to book onto a person: a Confirmed overlap is the hard block spec 06's
 * Notes require ("a conflict blocks inline; it is never a toast"), a Tentative
 * overlap is the warning. Same rule, same file — the screen states the outcome
 * and decides nothing.
 */
export function prospectiveConflicts(
  crewId: string,
  startMs: number,
  endMs: number,
  assignments: CrewAssignment[] = CREW_DATA,
): { blocking: CrewAssignment[]; warning: CrewAssignment[] } {
  const mine = assignments.filter((a) => a.crewId === crewId && !a.cancelled && assignmentOverlapsRange(a, startMs, endMs))
  return {
    blocking: mine.filter((a) => a.status === 'Confirmed'),
    warning: mine.filter((a) => a.status === 'Tentative'),
  }
}

/* ── §5.4 · crew-days and fill rate — replaces utilization entirely ─────── */

export function crewDaysBooked(assignments: CrewAssignment[] = CREW_DATA): number {
  return assignments.filter((a) => !a.cancelled && (a.status === 'Confirmed' || a.status === 'Completed')).reduce((sum, a) => sum + a.days, 0)
}

/** "Filled" = assignments actually staffed (Confirmed/Completed, not cancelled) — counted, never guessed. */
export function fillRate(
  assignments: CrewAssignment[] = CREW_DATA,
  requests: OpenRoleRequest[] = OPEN_ROLE_REQUESTS,
): { filled: number; requested: number; pct: number } {
  const filled = assignments.filter((a) => !a.cancelled && (a.status === 'Confirmed' || a.status === 'Completed')).length
  const requested = filled + requests.length
  return { filled, requested, pct: requested === 0 ? 0 : Math.round((filled / requested) * 100) }
}

/* ── §3 · the payout ledger — only the figures that exist ────────────────
 * Spec 06 §6.1 draws a PAYOUT LEDGER card, money roles only. Two of its
 * figures are real and two are not:
 *
 *  - **Gross** is real: `CrewAssignment.totalCostPaisa` per assignment, and
 *    the `PayoutStatus` split (Not due · Due · Paid) is a stored field.
 *  - **TDS and net are not.** PLAN.md §4.12 records the spec declining to
 *    supply a rate — *"your accountant's call"* — so there is no rate
 *    anywhere in this repo to withhold at.
 *
 * `tdsPaisa` and `netPaisa` are therefore `null`, and the screen renders
 * "not tracked yet". They are returned as fields rather than omitted so that
 * a caller cannot quietly compute their own: the shape says the figure is
 * known to be absent.
 *
 * TODO(decision) — PLAN.md §4.12 / rulings §8: the TDS rate and the
 * registered-vs-unregistered treatment. Until one is ruled, **never** derive a
 * net from an assumed rate.
 */
export interface PayoutLedger {
  count: number
  grossPaisa: Paisa
  byStatus: Array<{ status: PayoutStatus; count: number; grossPaisa: Paisa }>
  /** No ruled TDS rate exists — `null` means "not tracked yet", never zero. */
  tdsPaisa: null
  /** Cannot be derived without a TDS rate. `null`, never a plausible default. */
  netPaisa: null
}

export const PAYOUT_STATUSES: readonly PayoutStatus[] = ['Not due', 'Due', 'Paid'] as const

export function payoutLedger(assignments: CrewAssignment[] = CREW_DATA): PayoutLedger {
  // A cancelled assignment is still on file (law 3) but owes nobody anything.
  const live = assignments.filter((a) => !a.cancelled)
  const sum = (rows: CrewAssignment[]) => rows.reduce((t, a) => t + a.totalCostPaisa, 0) as Paisa
  return {
    count: live.length,
    grossPaisa: sum(live),
    byStatus: PAYOUT_STATUSES.map((status) => {
      const rows = live.filter((a) => a.payoutStatus === status)
      return { status, count: rows.length, grossPaisa: sum(rows) }
    }),
    tdsPaisa: null,
    netPaisa: null,
  }
}

/* ── ⛔ a second `crewBilling` was deleted here (item 3.6, 22 Aug 2026) ────
 *
 * This file carried its own `crewBilling()` under the same name as
 * `lib/money.ts:crewBilling` — different field names (`feeTotalPaisa` vs
 * `coordinationFeePaisa`), a required `feePerCrewDayPaisa` where the engine's
 * is optional ("Not configured, never zero"), and no null path at all. Nothing
 * imported it — `CrewBooking.tsx` and `lib/__tests__/money.test.ts` both use
 * the engine's — so it was exactly the §4.35 class of defect: duplication
 * between engines, each copy right in isolation, waiting for an importer to
 * pick the wrong one by name. The Financial Engine's version in `lib/money.ts`
 * is canonical; billing maths does not belong in a seed-data file.
 */
