import type { IconName } from '../components/ui/Icon'
import type { StatusKey } from '../lib/status'
import { rupees, formatMoney } from '../lib/money'
import type { Paisa } from '../lib/money'
import { toBs, formatBs, getBusinessToday } from '../lib/bs'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/**
 * Cases (Incident Management) seed data — `04 Operations/Cases.md` v1.1
 * (Build Locked, supersedes v1.0), with the render's flagged defects (§0)
 * corrected rather than copied — the same convention `reset.ts` and
 * `packing.ts` follow for their own module specs.
 *
 * Cases is a **queue with its own owner, not a job** (Foundation §1.5,
 * `nav.ts`'s own comment on the point) — it deliberately does not live in
 * `lib/workflow.ts`'s `JobName`/`JobState` union. Its status, priority, flag
 * and disposition vocabularies are local to this file, exactly as
 * `reset.ts`'s `QueueState`/`ProblemState` are local to Reset rather than
 * overloading the 17-entry booking `Flag` registry.
 *
 * ── corrections carried from §0's table ─────────────────────────────────
 *  · #1 Evidence, Linked Records and Timeline were missing from the rail,
 *    and Evidence must sit **above** Resolution — "the single most
 *    important change in this version" (§6, §6.1). Implemented in the
 *    component; this file supplies the pickup/return pairs.
 *  · #2 `Open Cases` must be **derived** (`Open + Under Review + Awaiting
 *    Decision + In Progress`), not a stale hand-typed figure — see
 *    `openCasesCount()` / the module-load assertion below.
 *  · #3 Deposit Applied — and every other allocation bucket — is **zero**
 *    until a disposition is chosen; only the *projection* may preview a
 *    number pre-disposition (§7.1/§7.2). Asserted below, not just seeded
 *    correctly by luck.
 *  · #4 `Police Report Filed` is a **flag** (`CaseFlag`), never a
 *    disposition — CASE-2026-0035 carries it as a flag, and its
 *    disposition is drawn from the Theft set instead.
 *  · #5 The Vendor disposition is `Recover from Partner`, not the render's
 *    `Charge Partner` — used verbatim below (CASE-2026-0037).
 *  · #6 Every ID is four digits after the year, sub-rentals included
 *    (`SR-2026-0015`, not `SR-2026-015`) — asserted below.
 *  · #9 Critical and High are both red in the render with no way to tell
 *    them apart, and Low was green ("reads as good, not as not-urgent").
 *    §4.2's fix for On Rent/Returned — same hue, solid vs soft fill — is
 *    reused for Critical/High; Low moves to gray. See `CASE_PRIORITY_META`.
 *
 * ── the date engine ──────────────────────────────────────────────────────
 * §4.4 says the render's ages all resolve against one `today` and land on
 * 22 Jul 2026 — but Foundation's actual single clock (`lib/bs.ts`'s `TODAY`)
 * is fixed to 31 Jul 2026, the same value every other screen in this build
 * reads. Re-deriving a second, page-local "today" here would recreate
 * exactly the multi-`today` drift `bs.ts`'s own header warns about, so ages
 * below are computed against the real `TODAY` and land on different day
 * counts than the screenshot. `openedAd` dates are also kept inside
 * Shrawan 2083 (16 Jul – 16 Aug 2026) on purpose — `toBs` only vouches for
 * that month, and hand-rolling the Ashadh/Asar boundary is exactly the ⭐
 * open item §13 and §0 (#7) warn off doing here.
 */

/* ── §5.1 · type ───────────────────────────────────────────────────────── */

export type CaseType = 'Damage' | 'Missing' | 'Theft' | 'Dispute' | 'Vendor'
export const CASE_TYPES: CaseType[] = ['Damage', 'Missing', 'Theft', 'Dispute', 'Vendor']

export const CASE_TYPE_ICON: Record<CaseType, IconName> = {
  Damage: 'tool',
  Missing: 'box',
  Theft: 'error',
  Dispute: 'receipt',
  Vendor: 'briefcase',
}

/* ── §5.2 · dispositions, per type — closed sets, never mixed ────────────
 * §5.2's own text, verbatim as the source of truth. `Police Report Filed`
 * is deliberately absent (it is a flag, §5.3); `Recover from Partner` is
 * the corrected Vendor entry (#5).
 */
export const DISPOSITIONS_BY_TYPE: Record<CaseType, readonly string[]> = {
  Damage: ['Repair — Send to Maintenance', 'Charge Client', 'Warranty Claim', 'Insurance Claim', 'Write Off'],
  Missing: ['Found', 'Client Returned', 'Charge Client', 'Replace Item', 'Insurance Claim', 'Write Off'],
  Theft: ['Insurance Claim', 'Charge Client', 'Write Off'],
  /** ⭐ §13 — asserted build-locked by §5.2 but reopened in §13; built as specified, not invented. */
  Dispute: ['Charge Upheld', 'Partially Waived', 'Fully Waived', 'Escalated'],
  Vendor: ['Recover from Partner', 'Absorb', 'Escalate'],
}

/* ── §5.3 · flags — overlays, never counted, never a disposition ─────────── */

export type CaseFlag = 'Under Investigation' | 'Legal' | 'Police Report' | 'Insurance Notified'
export const CASE_FLAGS: CaseFlag[] = ['Under Investigation', 'Legal', 'Police Report', 'Insurance Notified']

export const CASE_FLAG_META: Record<CaseFlag, { token: StatusKey; icon: IconName }> = {
  'Under Investigation': { token: 'progress', icon: 'eye' },
  Legal: { token: 'primary', icon: 'file' },
  'Police Report': { token: 'danger', icon: 'info' },
  'Insurance Notified': { token: 'in', icon: 'info' },
}

/* ── §8.1 · status — a vocabulary local to Cases, distinct from BookingStatus ── */

export type CaseStatus = 'Open' | 'Under Review' | 'Awaiting Decision' | 'In Progress' | 'Resolved' | 'Closed' | 'Cancelled'
export const CASE_STATUSES: CaseStatus[] = ['Open', 'Under Review', 'Awaiting Decision', 'In Progress', 'Resolved', 'Closed', 'Cancelled']

/**
 * §8.1 + #9's fix. `token` repeats across a few statuses on purpose (Open /
 * Closed / Cancelled are all gray) — §4.3's rule for that case is "separated
 * by icon and label", so `icon` is never allowed to repeat within a shared
 * token. `solid` gives In Progress the same fill-weight trick §4.2 already
 * uses for On Rent vs Returned, so it reads apart from the softer Under
 * Review despite sharing the blue hue.
 */
export interface CaseStatusMeta {
  token: StatusKey
  icon: IconName
  solid?: boolean
  strike?: boolean
}
export const CASE_STATUS_META: Record<CaseStatus, CaseStatusMeta> = {
  Open: { token: 'neutral', icon: 'flag' },
  'Under Review': { token: 'primary', icon: 'eye' },
  'Awaiting Decision': { token: 'progress', icon: 'timer' },
  'In Progress': { token: 'primary', icon: 'activity', solid: true },
  Resolved: { token: 'in', icon: 'checklist' },
  Closed: { token: 'neutral', icon: 'folder' },
  Cancelled: { token: 'neutral', icon: 'close', strike: true },
}

/** §3 — the single definition of "open". The KPI, the chip highlight and the ageing note all read this so they cannot disagree about what counts. */
export const OPEN_STATUSES: CaseStatus[] = ['Open', 'Under Review', 'Awaiting Decision', 'In Progress']
export function isOpenStatus(s: CaseStatus): boolean {
  return (OPEN_STATUSES as CaseStatus[]).includes(s)
}
/** "settled" for §3's Recovered This Month card. */
export function isSettledStatus(s: CaseStatus): boolean {
  return s === 'Resolved' || s === 'Closed'
}

/* ── §8.2 · priority — #9's fix, no sixth hue invented ────────────────────── */

export type CasePriority = 'Critical' | 'High' | 'Medium' | 'Low'
export const CASE_PRIORITIES: CasePriority[] = ['Critical', 'High', 'Medium', 'Low']

export interface CasePriorityMeta {
  token: StatusKey
  icon: IconName
  /** Same solid/soft trick as `CaseStatusMeta` — Critical is filled, High is the same red at soft weight. */
  solid?: boolean
}
export const CASE_PRIORITY_META: Record<CasePriority, CasePriorityMeta> = {
  Critical: { token: 'danger', icon: 'alert_triangle', solid: true },
  High: { token: 'danger', icon: 'flag' },
  Medium: { token: 'progress', icon: 'dot' },
  /** Low was rendered green ("reads as good") — moved to neutral gray, §8.2's correction. */
  Low: { token: 'neutral', icon: 'arrow_down' },
}

/* ── counterparty ──────────────────────────────────────────────────────── */

export type CounterpartyKind = 'Client' | 'Partner' | 'Vendor'

/* ── evidence — reuses `data/evidence.ts`'s Photo shape, not a new one ───── */

export interface CaseEvidencePhoto {
  id: string
  file: string
  at: string
}
export interface CaseEvidence {
  /** Damage only (Evidence v1.1 §15) — the side-by-side comparison §6.1 restores. */
  pickup?: CaseEvidencePhoto[]
  return?: CaseEvidencePhoto[]
  /** Any other type's supporting photos (incident scene, a scanned police report, etc.). */
  general?: CaseEvidencePhoto[]
}

/* ── linked records (§6.3) — only the ones that apply to a given case ────── */

export interface LinkedRecords {
  linkedRecordKind: 'Booking' | 'Sub-Rental'
  linkedRecordId: string
  clientName?: string
  partnerName?: string
  maintenanceJobId?: string
  invoiceId?: string
  /** No ID format exists for this record type yet (§4.2's registry does not list one) — a status line, not a fabricated ID. */
  insuranceClaim?: string
}

export interface TimelineEntry {
  actor: string
  at: Date
  text: string
}

/* ── Hover Intel System v2.1 Tier 1 — Damage/Missing card additions ───────
 * Both fields below are genuinely absent on most of the 17 seed cases below
 * and are never back-filled with an invented value — `data/caseIntel.ts`
 * states a reason ("Not yet approved", "Not linked to a Stock-Check
 * session") wherever a case doesn't carry one, the same convention
 * `clients.ts`/`inventory.ts` already use for their own unseeded fields.
 */

/**
 * Damage cases' approval path: the Rs 25,000 assessed-value threshold itself
 * is derived from `assessedPaisa` (see `requiresOwnerApproval` in
 * `data/caseIntel.ts`) — this only records that sign-off actually happened.
 * `approvedBy` always reuses the case's own `owner`/the `OWNERS` roster,
 * never a new name.
 */
export interface CaseApproval {
  approvedBy: string
  approvedAd: Date
}

/* ── the allocation buckets — §7.3's equation, one field per term ────────── */

export interface Case {
  id: string
  type: CaseType
  title: string
  counterpartyKind: CounterpartyKind
  counterpartyName: string
  equipment: { name: string; serial: string }[] | 'Multiple'
  priority: CasePriority
  status: CaseStatus
  /** null until a Manager/Owner picks one from `DISPOSITIONS_BY_TYPE[type]` (§5.2). */
  disposition: string | null
  assessedPaisa: Paisa
  depositHeldPaisa: Paisa
  /** §7.3 allocation — all zero until `disposition` is set (asserted below). */
  chargedToClientPaisa: Paisa
  depositAppliedPaisa: Paisa
  insuranceClaimedPaisa: Paisa
  warrantyCoveredPaisa: Paisa
  recoveredFromPartnerPaisa: Paisa
  absorbedPaisa: Paisa
  openedAd: Date
  /** Resolved/Closed only — when the allocation was settled, for the Recovered This Month card. */
  settledAd?: Date
  owner: string
  ownerRole: 'Warehouse' | 'Manager' | 'Owner'
  flags: CaseFlag[]
  linked: LinkedRecords
  evidence: CaseEvidence
  timelineExtra?: TimelineEntry[]
  /** Damage only — undefined until a Manager/Owner has actually signed off. See `CaseApproval`. */
  approval?: CaseApproval
  /**
   * Missing only — the Stock-Check session (`data/stockCheck.ts`'s real
   * `sessionNo`) that surfaced or should verify this shortage. No
   * per-session route exists yet — `/inventory/stock-check` is a single
   * fixed-session page (`StockCheck.tsx`) — so this renders as text plus a
   * link to that one route, never a deep link to this specific session.
   */
  stockCheckSessionNo?: string
}

/* ── §7 · Financial Impact — derived, never stored as a total ────────────── */

export interface Allocation {
  chargedToClient: Paisa
  depositApplied: Paisa
  insuranceClaimed: Paisa
  warrantyCovered: Paisa
  recoveredFromPartner: Paisa
  absorbed: Paisa
}

export function allocationOf(c: Case): Allocation {
  return {
    chargedToClient: c.chargedToClientPaisa,
    depositApplied: c.depositAppliedPaisa,
    insuranceClaimed: c.insuranceClaimedPaisa,
    warrantyCovered: c.warrantyCoveredPaisa,
    recoveredFromPartner: c.recoveredFromPartnerPaisa,
    absorbed: c.absorbedPaisa,
  }
}

/** §7.3's left-hand sum. */
export function allocatedTotal(c: Case): Paisa {
  const a = allocationOf(c)
  return (a.chargedToClient + a.depositApplied + a.insuranceClaimed + a.warrantyCovered + a.recoveredFromPartner + a.absorbed) as Paisa
}

/** §7.1 — before a disposition, Outstanding is the full Assessed value; after, it is what the allocation has not yet covered. */
export function outstandingOf(c: Case): Paisa {
  return (c.assessedPaisa - allocatedTotal(c)) as Paisa
}

/** §7.2 — the read-only preview shown before a decision, specific to a Charge Client-shaped resolution. */
export function chargeClientProjection(c: Case): { depositApplied: Paisa; invoiced: Paisa } {
  const depositApplied = Math.min(c.depositHeldPaisa, c.assessedPaisa) as Paisa
  const invoiced = Math.max(c.assessedPaisa - c.depositHeldPaisa, 0) as Paisa
  return { depositApplied, invoiced }
}

/** §6.2 — "Selecting one shows what will happen before it happens." One sentence per disposition, computed from the case's own figures. */
export function resolutionPreview(c: Case, disposition: string): string {
  const rs = (p: Paisa) => formatMoney(p)
  switch (disposition) {
    case 'Charge Client': {
      const { depositApplied, invoiced } = chargeClientProjection(c)
      return invoiced > 0
        ? `Applies ${rs(depositApplied)} from the held deposit and invoices ${rs(invoiced)}.`
        : `Applies ${rs(depositApplied)} from the held deposit. No further invoice needed.`
    }
    case 'Replace Item':
      return `Charges the replacement cost of ${rs(c.assessedPaisa)} to the client.`
    case 'Repair — Send to Maintenance':
      return `Opens a Maintenance job for the affected equipment and holds the case until repair completes.`
    case 'Warranty Claim':
      return `Files a warranty claim covering ${rs(c.assessedPaisa)}. No charge to the client.`
    case 'Insurance Claim':
      return `Files an insurance claim for ${rs(c.assessedPaisa)}. Outstanding clears once the claim settles.`
    case 'Write Off':
      return `Absorbs ${rs(c.assessedPaisa)} as a business loss. No charge to the client or partner.`
    case 'Found':
    case 'Client Returned':
      return `Closes the case with no charge — the item is accounted for.`
    case 'Recover from Partner':
      return `Invoices the partner ${rs(c.assessedPaisa)} directly. No charge to the client.`
    case 'Absorb':
      return `Absorbs ${rs(c.assessedPaisa)} as a business cost. Nothing recovered.`
    case 'Escalate':
    case 'Escalated':
      return `Escalates to Owner for a final decision. No allocation is made yet.`
    case 'Charge Upheld':
      return `Upholds the original charge of ${rs(c.assessedPaisa)}. The client remains billed.`
    case 'Partially Waived':
      return `Waives part of the charge; the remaining balance stays invoiced to the client.`
    case 'Fully Waived':
      return `Waives the charge in full. Nothing is billed to the client.`
    default:
      return `Records ${disposition} against this case.`
  }
}

/* ── §4.3 dates — one engine, never hand-rolled ───────────────────────────
 * `toBs` only vouches for Shrawan 2083 (16 Jul – 16 Aug 2026), so every
 * `openedAd`/`settledAd` below is chosen inside that window — sidestepping
 * the ⭐ open Ashadh/Asar month-length conflict entirely rather than
 * guessing at it.
 */
export function openedBsLabel(d: Date): string {
  const bs = toBs(d)
  return bs ? formatBs(bs) : '—'
}
export function ageDays(openedAd: Date): number {
  const DAY = 86400000
  return Math.max(0, Math.round((TODAY.getTime() - openedAd.getTime()) / DAY))
}
/** §11 — escalates to Owner at 3+ days in Awaiting Decision; a Critical alert at 14+ days open. Both read the single `TODAY`/`ageDays` above. */
export function agingNote(c: Case): string | null {
  const age = ageDays(c.openedAd)
  if (!isOpenStatus(c.status)) return null
  if (age >= 14) return `${age} days open — escalated as a Critical alert on Today Operations`
  if (c.status === 'Awaiting Decision' && age >= 3) return `${age} days in Awaiting Decision — escalated to Owner`
  return null
}

/* ── seed ──────────────────────────────────────────────────────────────
 * 17 cases — every type, every priority, every status but Cancelled (kept
 * at zero, matching the chip the render itself shows: `Cancelled (0)`).
 * A smaller, fully-derived population rather than the render's 46: every
 * KPI, chip and pagination figure below is computed from this array, never
 * hand-typed to match the screenshot, so nothing here can go stale or point
 * a control at a page that does not exist — see the report for the
 * trade-off this makes against the render's row count.
 */
const d = (day: number) => new Date(Date.UTC(2026, 6, day)) // July 2026, inside Shrawan 2083

export const CASES: Case[] = [
  {
    id: 'CASE-2026-0041',
    type: 'Damage',
    title: 'Sony FX3 LCD Scratch',
    counterpartyKind: 'Client',
    counterpartyName: 'Himalayan Films',
    equipment: [{ name: 'Sony FX3', serial: 'SN-CAM-0102' }],
    priority: 'High',
    status: 'Awaiting Decision',
    disposition: null,
    assessedPaisa: rupees(18000),
    depositHeldPaisa: rupees(12500),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(29),
    owner: 'Sunil',
    ownerRole: 'Warehouse',
    flags: ['Under Investigation'],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-715', clientName: 'Himalayan Films' },
    evidence: {
      pickup: [{ id: 'ev-0041-p1', file: 'IMG_3301.JPG', at: '16 Jul 2026, 06:10 AM' }],
      return: [{ id: 'ev-0041-r1', file: 'IMG_3402.JPG', at: '19 Jul 2026, 05:40 PM' }],
    },
    timelineExtra: [
      { actor: 'Sunil', at: new Date(Date.UTC(2026, 6, 29, 6, 10)), text: 'Case opened from Return inspection — LCD scratch not present at pickup' },
      { actor: 'Sunil', at: new Date(Date.UTC(2026, 6, 29, 6, 25)), text: 'Flagged Under Investigation, evidence attached' },
      { actor: 'System', at: new Date(Date.UTC(2026, 6, 30, 9, 0)), text: 'Moved to Awaiting Decision — pending Manager review' },
    ],
  },
  {
    id: 'CASE-2026-0040',
    type: 'Missing',
    title: 'NP-FZ100 Battery (1 Pc)',
    counterpartyKind: 'Client',
    counterpartyName: 'Classic Media',
    equipment: [{ name: 'NP-FZ100 Battery', serial: 'SN-BAT-0211' }],
    priority: 'Medium',
    status: 'In Progress',
    disposition: 'Charge Client',
    assessedPaisa: rupees(7500),
    depositHeldPaisa: rupees(4500),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(4500),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(28),
    owner: 'Nabin',
    ownerRole: 'Warehouse',
    flags: [],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-714', clientName: 'Classic Media', invoiceId: 'INV-493' },
    evidence: { general: [{ id: 'ev-0040-g1', file: 'IMG_4110.JPG', at: '28 Jul 2026, 11:05 AM' }] },
  },
  {
    id: 'CASE-2026-0039',
    type: 'Damage',
    title: 'NISI 35mm Lens Front Element',
    counterpartyKind: 'Partner',
    counterpartyName: 'Lens Rental Nepal',
    equipment: [{ name: 'NISI 35mm T1.9', serial: 'SN-LEN-0035' }],
    priority: 'High',
    status: 'In Progress',
    disposition: 'Repair — Send to Maintenance',
    assessedPaisa: rupees(22000),
    depositHeldPaisa: rupees(0),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(12000),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(27),
    owner: 'Rajan',
    ownerRole: 'Manager',
    flags: [],
    linked: { linkedRecordKind: 'Sub-Rental', linkedRecordId: 'SR-2026-0015', partnerName: 'Lens Rental Nepal', maintenanceJobId: 'MT-2026-0043' },
    evidence: {
      pickup: [{ id: 'ev-0039-p1', file: 'IMG_5510.JPG', at: '10 Jul 2026, 09:00 AM' }],
      return: [{ id: 'ev-0039-r1', file: 'IMG_5601.JPG', at: '27 Jul 2026, 02:15 PM' }],
    },
  },
  {
    id: 'CASE-2026-0038',
    type: 'Dispute',
    title: 'Dispute on Damage Charge',
    counterpartyKind: 'Client',
    counterpartyName: 'Maya Production',
    equipment: 'Multiple',
    priority: 'Medium',
    status: 'Under Review',
    disposition: null,
    assessedPaisa: rupees(15000),
    depositHeldPaisa: rupees(15000),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(26),
    owner: 'Sunil',
    ownerRole: 'Warehouse',
    flags: [],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-710', clientName: 'Maya Production', invoiceId: 'INV-481' },
    evidence: {},
  },
  {
    id: 'CASE-2026-0037',
    type: 'Vendor',
    title: 'Late Return by Sub-rental Partner',
    counterpartyKind: 'Vendor',
    counterpartyName: 'Filmgear Rentals',
    equipment: 'Multiple',
    priority: 'Low',
    status: 'Resolved',
    disposition: 'Recover from Partner',
    assessedPaisa: rupees(5000),
    depositHeldPaisa: rupees(0),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(5000),
    absorbedPaisa: rupees(0),
    openedAd: d(25),
    settledAd: d(27),
    owner: 'Nabin',
    ownerRole: 'Warehouse',
    flags: [],
    linked: { linkedRecordKind: 'Sub-Rental', linkedRecordId: 'SR-2026-0014', partnerName: 'Filmgear Rentals' },
    evidence: {},
  },
  {
    id: 'CASE-2026-0036',
    type: 'Missing',
    title: 'HDMI Cable (Short)',
    counterpartyKind: 'Client',
    counterpartyName: 'Studio Frames',
    equipment: [{ name: 'HDMI Cable', serial: 'SN-CAB-1188' }],
    priority: 'Low',
    status: 'Resolved',
    disposition: 'Client Returned',
    assessedPaisa: rupees(1200),
    depositHeldPaisa: rupees(0),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(1200),
    openedAd: d(24),
    settledAd: d(26),
    owner: 'Rajan',
    ownerRole: 'Manager',
    flags: [],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-709', clientName: 'Studio Frames' },
    evidence: {},
  },
  {
    id: 'CASE-2026-0035',
    type: 'Theft',
    title: 'Aputure 600D Pro Stolen',
    counterpartyKind: 'Client',
    counterpartyName: 'Nepal Docs Lab',
    equipment: [{ name: 'Aputure 600D Pro', serial: 'SN-LGT-0013' }],
    priority: 'Critical',
    status: 'In Progress',
    // #4 — corrected: Police Report is a flag (below), not this case's disposition.
    disposition: 'Insurance Claim',
    assessedPaisa: rupees(95000),
    depositHeldPaisa: rupees(0),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(23),
    owner: 'Sunil',
    ownerRole: 'Warehouse',
    flags: ['Police Report', 'Insurance Notified'],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-706', clientName: 'Nepal Docs Lab', insuranceClaim: 'Filed with carrier — settlement pending' },
    evidence: { general: [{ id: 'ev-0035-g1', file: 'Police_Report_Scan.PDF', at: '23 Jul 2026, 04:20 PM' }] },
    timelineExtra: [
      { actor: 'Sunil', at: new Date(Date.UTC(2026, 6, 23, 16, 20)), text: 'Case opened — light not returned, client reports break-in at venue' },
      { actor: 'Sunil', at: new Date(Date.UTC(2026, 6, 23, 18, 0)), text: 'Police Report flag set — report filed at Kathmandu Metropolitan Police' },
      { actor: 'Sunil', at: new Date(Date.UTC(2026, 6, 24, 10, 0)), text: 'Insurance Notified flag set — carrier informed' },
      { actor: 'Sunil', at: new Date(Date.UTC(2026, 6, 25, 9, 0)), text: 'Disposition set to Insurance Claim — claim filed' },
    ],
  },
  {
    id: 'CASE-2026-0034',
    type: 'Damage',
    title: 'DJI RS 4 Pro Arm Bent',
    counterpartyKind: 'Client',
    counterpartyName: 'Pixel Studio',
    equipment: [{ name: 'DJI RS 4 Pro', serial: 'SN-ACC-0021' }],
    priority: 'Medium',
    status: 'Resolved',
    disposition: 'Warranty Claim',
    assessedPaisa: rupees(12500),
    depositHeldPaisa: rupees(8000),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(12500),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(22),
    settledAd: d(24),
    owner: 'Rajan',
    ownerRole: 'Manager',
    flags: [],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-705', clientName: 'Pixel Studio' },
    evidence: {
      pickup: [{ id: 'ev-0034-p1', file: 'IMG_6011.JPG', at: '18 Jul 2026, 08:30 AM' }],
      return: [{ id: 'ev-0034-r1', file: 'IMG_6098.JPG', at: '22 Jul 2026, 03:10 PM' }],
    },
    // Assessed (12,500) sits under the Rs 25,000 threshold, so this needed only
    // Manager sign-off — `owner`/`ownerRole` above already record Rajan as the
    // Manager on this case, and `settledAd` is the real day it closed, so
    // `approval` reuses both rather than inventing a new name or date.
    approval: { approvedBy: 'Rajan', approvedAd: d(24) },
  },
  {
    id: 'CASE-2026-0033',
    type: 'Missing',
    title: 'Rode Wireless GO II Missing',
    counterpartyKind: 'Client',
    counterpartyName: 'Anmol Productions',
    equipment: [{ name: 'Rode Wireless GO II', serial: 'SN-AUD-0044' }],
    priority: 'High',
    status: 'Open',
    disposition: null,
    assessedPaisa: rupees(8500),
    depositHeldPaisa: rupees(6000),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(30),
    owner: 'Sunil',
    ownerRole: 'Warehouse',
    flags: [],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-703', clientName: 'Anmol Productions' },
    evidence: {},
  },
  {
    id: 'CASE-2026-0032',
    type: 'Damage',
    title: 'Monitor Screen Cracked',
    counterpartyKind: 'Client',
    counterpartyName: 'Skyline Films',
    equipment: [{ name: 'Portkeys BM5 III', serial: 'SN-MON-0007' }],
    priority: 'High',
    status: 'Open',
    disposition: null,
    assessedPaisa: rupees(14000),
    depositHeldPaisa: rupees(10000),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(28),
    owner: 'Nabin',
    ownerRole: 'Warehouse',
    flags: ['Under Investigation'],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-701', clientName: 'Skyline Films' },
    evidence: {
      pickup: [{ id: 'ev-0032-p1', file: 'IMG_7210.JPG', at: '24 Jul 2026, 07:45 AM' }],
      return: [{ id: 'ev-0032-r1', file: 'IMG_7288.JPG', at: '28 Jul 2026, 06:30 PM' }],
    },
  },
  {
    id: 'CASE-2026-0031',
    type: 'Vendor',
    title: 'Partner Delivered Wrong Kit',
    counterpartyKind: 'Vendor',
    counterpartyName: 'Everest Grip House',
    equipment: 'Multiple',
    priority: 'Low',
    status: 'Open',
    disposition: null,
    assessedPaisa: rupees(2000),
    depositHeldPaisa: rupees(0),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(27),
    owner: 'Rajan',
    ownerRole: 'Manager',
    flags: [],
    linked: { linkedRecordKind: 'Sub-Rental', linkedRecordId: 'SR-2026-0011', partnerName: 'Everest Grip House' },
    evidence: {},
  },
  {
    id: 'CASE-2026-0030',
    type: 'Dispute',
    title: 'Client Disputes Late Fee',
    counterpartyKind: 'Client',
    counterpartyName: 'Everest Weddings',
    equipment: 'Multiple',
    priority: 'Medium',
    status: 'Under Review',
    disposition: null,
    assessedPaisa: rupees(3500),
    depositHeldPaisa: rupees(0),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(26),
    owner: 'Sunil',
    ownerRole: 'Warehouse',
    flags: ['Legal'],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-698', clientName: 'Everest Weddings', invoiceId: 'INV-470' },
    evidence: {},
  },
  {
    id: 'CASE-2026-0029',
    type: 'Missing',
    title: 'Sennheiser Wireless Kit Unaccounted',
    counterpartyKind: 'Client',
    counterpartyName: 'River Bend Media',
    equipment: [{ name: 'Sennheiser EW 500', serial: 'SN-AUD-0091' }],
    priority: 'Medium',
    status: 'Under Review',
    disposition: null,
    assessedPaisa: rupees(21000),
    depositHeldPaisa: rupees(15000),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(25),
    owner: 'Nabin',
    ownerRole: 'Warehouse',
    flags: ['Under Investigation'],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-695', clientName: 'River Bend Media' },
    evidence: {},
    // Opened 25 Jul, five days after `data/stockCheck.ts`'s real SC-2083-003
    // full-warehouse audit closed (20 Jul) — the audit last verified this kit
    // present, so it's the honest "last checked" session, not a fabricated
    // one. SC-2083-004 (the other real session) is deliberately not used
    // anywhere here: its own seed dates it as starting 6 Aug, after this
    // module's `TODAY` (31 Jul) — see the report for that cross-module gap.
    stockCheckSessionNo: 'SC-2083-003',
  },
  {
    id: 'CASE-2026-0028',
    type: 'Damage',
    title: 'Gimbal Motor Fault After Drop',
    counterpartyKind: 'Partner',
    counterpartyName: 'Grip Works Nepal',
    equipment: [{ name: 'Ronin 4D', serial: 'SN-GIM-0015' }],
    priority: 'High',
    status: 'Awaiting Decision',
    disposition: null,
    assessedPaisa: rupees(32000),
    depositHeldPaisa: rupees(20000),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(24),
    owner: 'Rajan',
    ownerRole: 'Manager',
    flags: ['Under Investigation'],
    linked: { linkedRecordKind: 'Sub-Rental', linkedRecordId: 'SR-2026-0009', partnerName: 'Grip Works Nepal' },
    evidence: {
      pickup: [{ id: 'ev-0028-p1', file: 'IMG_8110.JPG', at: '12 Jul 2026, 09:15 AM' }],
      return: [{ id: 'ev-0028-r1', file: 'IMG_8199.JPG', at: '24 Jul 2026, 05:00 PM' }],
    },
  },
  {
    id: 'CASE-2026-0027',
    type: 'Missing',
    title: 'Track Dolly Wheel Set Missing',
    counterpartyKind: 'Client',
    counterpartyName: 'Mountain Stories',
    equipment: [{ name: 'Dolly Wheel Set', serial: 'SN-RIG-0088' }],
    priority: 'Low',
    status: 'Awaiting Decision',
    disposition: null,
    assessedPaisa: rupees(6000),
    depositHeldPaisa: rupees(4000),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(0),
    openedAd: d(16),
    owner: 'Sunil',
    ownerRole: 'Warehouse',
    flags: [],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-691', clientName: 'Mountain Stories' },
    evidence: {},
  },
  {
    id: 'CASE-2026-0026',
    type: 'Vendor',
    title: 'Sub-Rental Partner Billing Error',
    counterpartyKind: 'Vendor',
    counterpartyName: 'Camera Co-op',
    equipment: 'Multiple',
    priority: 'Low',
    status: 'Closed',
    disposition: 'Absorb',
    assessedPaisa: rupees(1500),
    depositHeldPaisa: rupees(0),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(1500),
    openedAd: d(18),
    settledAd: d(20),
    owner: 'Nabin',
    ownerRole: 'Warehouse',
    flags: [],
    linked: { linkedRecordKind: 'Sub-Rental', linkedRecordId: 'SR-2026-0007', partnerName: 'Camera Co-op' },
    evidence: {},
  },
  {
    id: 'CASE-2026-0025',
    type: 'Damage',
    title: 'Lens Hood Cracked, Cosmetic Only',
    counterpartyKind: 'Client',
    counterpartyName: 'ABC Films',
    equipment: [{ name: 'NISI 50mm Hood', serial: 'SN-LEN-0050' }],
    priority: 'Low',
    status: 'Closed',
    disposition: 'Write Off',
    assessedPaisa: rupees(800),
    depositHeldPaisa: rupees(0),
    chargedToClientPaisa: rupees(0),
    depositAppliedPaisa: rupees(0),
    insuranceClaimedPaisa: rupees(0),
    warrantyCoveredPaisa: rupees(0),
    recoveredFromPartnerPaisa: rupees(0),
    absorbedPaisa: rupees(800),
    openedAd: d(17),
    settledAd: d(19),
    owner: 'Sunil',
    ownerRole: 'Warehouse',
    flags: [],
    linked: { linkedRecordKind: 'Booking', linkedRecordId: 'B-680', clientName: 'ABC Films' },
    evidence: {
      pickup: [{ id: 'ev-0025-p1', file: 'IMG_9010.JPG', at: '9 Jul 2026, 10:00 AM' }],
      return: [{ id: 'ev-0025-r1', file: 'IMG_9088.JPG', at: '17 Jul 2026, 04:45 PM' }],
    },
  },
]

/* ── §3 · KPI cards, §2 chips — derived from a case array, never hand-typed ──
 * Every function below defaults to the seed `CASES` but accepts any array,
 * so the component can re-derive the same figures against a locally-edited
 * copy (after "Confirm Disposition") without duplicating the formulas.
 */

export function statusCounts(cases: Case[] = CASES): Record<CaseStatus, number> {
  return CASE_STATUSES.reduce((acc, s) => ({ ...acc, [s]: cases.filter((c) => c.status === s).length }), {} as Record<CaseStatus, number>)
}

export function flagCounts(cases: Case[] = CASES): Record<CaseFlag, number> {
  return CASE_FLAGS.reduce((acc, f) => ({ ...acc, [f]: cases.filter((c) => c.flags.includes(f)).length }), {} as Record<CaseFlag, number>)
}

export const STATUS_COUNTS = statusCounts()
export const FLAG_COUNTS = flagCounts()

/** §3 — "Open Cases = Open + Under Review + Awaiting Decision + In Progress." */
export function openCasesCount(cases: Case[] = CASES): number {
  return cases.filter((c) => isOpenStatus(c.status)).length
}

/** §3 — "Assessed value of open cases." */
export function exposurePaisa(cases: Case[] = CASES): Paisa {
  return cases.filter((c) => isOpenStatus(c.status)).reduce((sum, c) => (sum + c.assessedPaisa) as Paisa, rupees(0))
}

/** §3 — "Charged + claimed + covered, settled this month." Partner recovery and Absorbed are deliberately excluded — the formula names three buckets, not six. */
export function recoveredThisMonthPaisa(cases: Case[] = CASES): Paisa {
  return cases
    .filter((c) => isSettledStatus(c.status) && c.settledAd && c.settledAd.getUTCFullYear() === TODAY.getUTCFullYear() && c.settledAd.getUTCMonth() === TODAY.getUTCMonth())
    .reduce((sum, c) => (sum + c.chargedToClientPaisa + c.insuranceClaimedPaisa + c.warrantyCoveredPaisa) as Paisa, rupees(0))
}

export function awaitingDecisionCount(cases: Case[] = CASES): number {
  return statusCounts(cases)['Awaiting Decision']
}

/**
 * The default allocation a disposition applies the moment it is confirmed
 * (§6.2's "before it happens" preview, made real). Charge Client applies
 * whatever deposit is held immediately; the remainder stays outstanding
 * until invoiced and paid, exactly like the seeded CASE-2026-0040.
 */
export function defaultAllocationFor(
  c: Case,
  disposition: string,
): Partial<Pick<Case, 'chargedToClientPaisa' | 'depositAppliedPaisa' | 'insuranceClaimedPaisa' | 'warrantyCoveredPaisa' | 'recoveredFromPartnerPaisa' | 'absorbedPaisa'>> {
  switch (disposition) {
    case 'Charge Client':
      return { depositAppliedPaisa: chargeClientProjection(c).depositApplied }
    case 'Warranty Claim':
      return { warrantyCoveredPaisa: c.assessedPaisa }
    case 'Found':
    case 'Client Returned':
    case 'Write Off':
    case 'Absorb':
    case 'Fully Waived':
      return { absorbedPaisa: c.assessedPaisa }
    case 'Recover from Partner':
      return { recoveredFromPartnerPaisa: c.assessedPaisa }
    default:
      return {}
  }
}

/** Resolved/Closed dispositions need no further work; everything else moves to In Progress once a decision is recorded. */
const TERMINAL_ON_CONFIRM = new Set(['Found', 'Client Returned', 'Write Off', 'Absorb', 'Fully Waived', 'Recover from Partner', 'Warranty Claim'])
export function statusAfterDisposition(disposition: string): CaseStatus {
  return TERMINAL_ON_CONFIRM.has(disposition) ? 'Resolved' : 'In Progress'
}

/* ── module-load assertions — mirrors `reset.ts`'s GROUP_SUM / TOTAL_TASKS checks ── */

/**
 * ⛔ Every check below used to `throw` at module scope. A module-evaluation
 * throw is **uncatchable** — it runs before React mounts, so no boundary can
 * catch it and the operator gets a blank white screen with nothing in it.
 * `lib/money.ts` hit exactly this and fixed it by *reporting* the failure
 * instead of throwing; the same pattern is used here.
 *
 * Every invariant still runs on every load — §2, §3, §4.2, §5.2, §7.1 and §7.3
 * are all still checked, and the loop now collects *all* violations rather than
 * stopping at the first, which is strictly more information than the throw gave.
 * The result is exported so the screen can state it, and logged so a broken seed
 * is never silent even before a screen reads it.
 */
export const CASES_SEED_ERROR: string | null = (() => {
  const problems: string[] = []

  const sumOfChips = CASE_STATUSES.reduce((s, k) => s + STATUS_COUNTS[k], 0)
  if (sumOfChips !== CASES.length) {
    problems.push(`§2 chip reconciliation violated: chips sum to ${sumOfChips}, CASES has ${CASES.length} rows`)
  }

  const openByFormula = STATUS_COUNTS.Open + STATUS_COUNTS['Under Review'] + STATUS_COUNTS['Awaiting Decision'] + STATUS_COUNTS['In Progress']
  const openByFilter = openCasesCount()
  if (openByFormula !== openByFilter) {
    problems.push(`§3 "Open Cases" formula violated: chip sum gives ${openByFormula}, isOpenStatus() filter gives ${openByFilter}`)
  }

  for (const c of CASES) {
    if (!/^CASE-\d{4}-\d{4}$/.test(c.id)) {
      problems.push(`§4.2 ID registry violated: "${c.id}" is not CASE-YYYY-NNNN (four digits)`)
    }
    if (c.linked.linkedRecordKind === 'Sub-Rental' && !/^SR-\d{4}-\d{4}$/.test(c.linked.linkedRecordId)) {
      problems.push(`§4.2 ID registry violated: "${c.linked.linkedRecordId}" is not SR-YYYY-NNNN (four digits) — §0 defect #6`)
    }
    if (c.disposition !== null && !DISPOSITIONS_BY_TYPE[c.type].includes(c.disposition)) {
      problems.push(`§5.2 violated: "${c.disposition}" is not a valid disposition for type ${c.type} on ${c.id}`)
    }
    // §7.1 / §0 defect #3 — no allocation before a disposition is set.
    if (c.disposition === null) {
      const a = allocationOf(c)
      const untouched = a.chargedToClient === 0 && a.depositApplied === 0 && a.insuranceClaimed === 0 && a.warrantyCovered === 0 && a.recoveredFromPartner === 0 && a.absorbed === 0
      if (!untouched || outstandingOf(c) !== c.assessedPaisa) {
        problems.push(`§7.1 violated: ${c.id} has no disposition yet but carries a non-zero allocation`)
      }
    }
    // §7.3 — allocation must balance before Closed.
    if (c.status === 'Closed' && allocatedTotal(c) !== c.assessedPaisa) {
      problems.push(`§7.3 violated: ${c.id} is Closed but Assessed ${String(c.assessedPaisa)} ≠ allocated ${String(allocatedTotal(c))}`)
    }
  }

  return problems.length === 0
    ? null
    : `Cases seed data does not reconcile: ${problems.join('; ')}. Figures on this screen cannot be trusted — see src/data/cases.ts.`
})()

if (CASES_SEED_ERROR) console.error(CASES_SEED_ERROR)

/* ── misc seed reference data ─────────────────────────────────────────── */

export const OWNERS = ['Sunil', 'Nabin', 'Rajan'] as const
export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50] as const

/** §9 — Case creation is a separate, undefined flow (only the queue+rail screen is in scope). */
export const NEW_CASE_UNAVAILABLE_REASON = 'Case creation is not built yet — only the queue and rail are in scope for this pass.'
/** No export pipeline exists — no cases report builder or CSV writer anywhere in the build. The old button toasted "Generating cases report…" while generating nothing (the exact fabrication src/actions/core.ts §1 names). */
export const CASES_EXPORT_UNAVAILABLE_REASON = 'Export is not built yet — no cases report or CSV generator exists in this build, so nothing can be downloaded from here.'
/** §10 — the workspace route has no field list yet; §12 checklist item "Case Workspace route defined and reachable" stays open until it does. */
export const CASE_WORKSPACE_ROUTE = (id: string) => `/operations/cases/${id}`
