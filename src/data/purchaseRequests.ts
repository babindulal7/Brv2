import type { IconName } from '../components/ui/Icon'
import { rupees, type Paisa } from '../lib/money'

export type PRStatus = 'Draft' | 'Submitted' | 'Approved' | 'Ordered' | 'Received' | 'Rejected' | 'Cancelled'
export type PRPriority = 'High' | 'Medium' | 'Low'
export type PRReason = 'Demand exceeded' | 'Sub-rent event' | 'Manual'

export interface RefusedBookingEvidence {
  bookingId: string
  bookingRef: string
  client: string
  startDate: string
  endDate: string
  quantityShort: number
}

export interface SubRentalEvidence {
  subRentalId: string
  subRentalRef: string
  supplier: string
  costPaid: Paisa
  date: string
}

export interface PurchaseRequest {
  id: string
  prNo: string
  fleetItemId: string
  fleetItemName: string
  category: string
  requestedQty: number
  reason: PRReason
  estimatedUnitCost: Paisa
  totalEstimatedCost: Paisa
  totalSubRentPaid: Paisa
  refusedCount: number
  subRentCount: number
  priorityScore: number
  priority: PRPriority
  suggestedSupplier?: string
  status: PRStatus
  requestedBy: string
  decidedBy?: string
  decisionReason?: string
  dateCreatedAD: string
  dateCreatedBS: string
  dateDecidedAD?: string
  dateDecidedBS?: string
  notes?: string
  refusedBookings: RefusedBookingEvidence[]
  subRentals: SubRentalEvidence[]
}

/**
 * Derived priority formula per locked spec §6:
 * priority_score = (refused_bookings * 2) + sub_rental_events + (sub_rental_cost / estimated_purchase_cost * 10)
 * High >= 8, Medium 4-7, Low < 4
 */
export function calculatePRPriority(refused: number, subRents: number, subCost: number, unitCost: number): { score: number; priority: PRPriority } {
  const costRatio = unitCost > 0 ? (subCost / unitCost) * 10 : 0
  const score = Math.round(((refused * 2) + subRents + costRatio) * 10) / 10
  let priority: PRPriority = 'Low'
  if (score >= 8) priority = 'High'
  else if (score >= 4) priority = 'Medium'
  return { score, priority }
}

export const PURCHASE_REQUESTS: PurchaseRequest[] = [
  {
    id: 'pr-001',
    prNo: 'PR-2026-0012',
    fleetItemId: 'EQ000234',
    fleetItemName: 'Sony FX3 Cinema Camera Body',
    category: 'Camera',
    requestedQty: 2,
    reason: 'Demand exceeded',
    estimatedUnitCost: rupees(465000),
    totalEstimatedCost: rupees(930000),
    totalSubRentPaid: rupees(168000),
    refusedCount: 4,
    subRentCount: 3,
    priorityScore: 14.6,
    priority: 'High',
    suggestedSupplier: 'Camera Zone Nepal (Putalisadak)',
    status: 'Submitted',
    requestedBy: 'Sunil Sharma (Coordinator)',
    dateCreatedAD: '2026-08-01',
    dateCreatedBS: '2083-04-17',
    notes: 'Shortfall observed across 4 commercial shoots in Shrawan. Sub-renting frequently.',
    refusedBookings: [
      { bookingId: 'b-089', bookingRef: 'B-189', client: 'Gorkha Productions', startDate: '2026-08-10', endDate: '2026-08-14', quantityShort: 1 },
      { bookingId: 'b-092', bookingRef: 'B-192', client: 'Himal Media Works', startDate: '2026-08-12', endDate: '2026-08-15', quantityShort: 1 },
      { bookingId: 'b-095', bookingRef: 'B-195', client: 'Blackbox Films', startDate: '2026-08-18', endDate: '2026-08-22', quantityShort: 1 },
      { bookingId: 'b-098', bookingRef: 'B-198', client: 'Kathmandu Visuals', startDate: '2026-08-20', endDate: '2026-08-23', quantityShort: 1 },
    ],
    subRentals: [
      { subRentalId: 'sr-011', subRentalRef: 'SUB-2026-0031', supplier: 'Everest Cine Partner', costPaid: rupees(56000), date: '2026-07-22' },
      { subRentalId: 'sr-014', subRentalRef: 'SUB-2026-0034', supplier: 'Everest Cine Partner', costPaid: rupees(62000), date: '2026-07-29' },
      { subRentalId: 'sr-018', subRentalRef: 'SUB-2026-0038', supplier: 'Pokhara Cine Equip', costPaid: rupees(50000), date: '2026-08-03' },
    ],
  },
  {
    id: 'pr-002',
    prNo: 'PR-2026-0011',
    fleetItemId: 'EQ000410',
    fleetItemName: 'Aputure LS 600d Pro Light Storm',
    category: 'Lighting',
    requestedQty: 1,
    reason: 'Sub-rent event',
    estimatedUnitCost: rupees(285000),
    totalEstimatedCost: rupees(285000),
    totalSubRentPaid: rupees(85000),
    refusedCount: 2,
    subRentCount: 2,
    priorityScore: 8.9,
    priority: 'High',
    suggestedSupplier: 'Studio Tech Pvt Ltd',
    status: 'Approved',
    requestedBy: 'Rajesh Shrestha (Manager)',
    decidedBy: 'Babin (Owner)',
    dateCreatedAD: '2026-07-28',
    dateCreatedBS: '2083-04-13',
    dateDecidedAD: '2026-08-02',
    dateDecidedBS: '2083-04-18',
    notes: 'Approved by Owner. Sub-rental costs have surpassed 30% of asset value.',
    refusedBookings: [
      { bookingId: 'b-081', bookingRef: 'B-181', client: 'Music Video Collective', startDate: '2026-07-30', endDate: '2026-08-01', quantityShort: 1 },
      { bookingId: 'b-085', bookingRef: 'B-185', client: 'Red Panda Creative', startDate: '2026-08-05', endDate: '2026-08-07', quantityShort: 1 },
    ],
    subRentals: [
      { subRentalId: 'sr-008', subRentalRef: 'SUB-2026-0028', supplier: 'Lalitpur Lighting Co', costPaid: rupees(45000), date: '2026-07-15' },
      { subRentalId: 'sr-012', subRentalRef: 'SUB-2026-0032', supplier: 'Lalitpur Lighting Co', costPaid: rupees(40000), date: '2026-07-25' },
    ],
  },
  {
    id: 'pr-003',
    prNo: 'PR-2026-0010',
    fleetItemId: 'EQ000301',
    fleetItemName: 'DJI RS3 Pro Gimbal Stabilizer',
    category: 'Grip',
    requestedQty: 1,
    reason: 'Manual',
    estimatedUnitCost: rupees(145000),
    totalEstimatedCost: rupees(145000),
    totalSubRentPaid: rupees(22000),
    refusedCount: 1,
    subRentCount: 1,
    priorityScore: 4.5,
    priority: 'Medium',
    status: 'Draft',
    requestedBy: 'Pooja Thapa (Coordinator)',
    dateCreatedAD: '2026-08-04',
    dateCreatedBS: '2083-04-20',
    notes: 'Backup stabilizer needed for wedding season peak.',
    refusedBookings: [
      { bookingId: 'b-099', bookingRef: 'B-199', client: 'Weddings Nepal', startDate: '2026-08-25', endDate: '2026-08-27', quantityShort: 1 },
    ],
    subRentals: [
      { subRentalId: 'sr-020', subRentalRef: 'SUB-2026-0040', supplier: 'Pokhara Cine Equip', costPaid: rupees(22000), date: '2026-08-02' },
    ],
  },
]

/**
 * The KPI strip, COUNTED from `PURCHASE_REQUESTS` rather than typed beside it.
 *
 * ## What this replaced
 *
 * These tiles used to be hardcoded strings: Draft `'3'`, Pending `'2'`,
 * Approved `'2'` — claiming **seven** requests directly above a list holding
 * **three** (one Draft, one Submitted, one Approved). Every count was wrong, and
 * wrong in the direction that flatters: a fuller pipeline than exists.
 *
 * A hardcoded count beside the array it describes cannot survive that array
 * changing, and nothing makes the drift visible — the strip and the list read as
 * one screen, so the operator sees a total its own rows contradict with no way
 * to tell which is lying.
 *
 * It got sharper when Law 6 landed here: the money tile is omitted for
 * Warehouse / Technician / Driver / Client, which left those sessions looking at
 * *nothing but* the three false counts.
 *
 * Counting here means the tiles cannot disagree with the rows again. When
 * `PURCHASE_REQUESTS` becomes a query this is one `count(*)` per status and no
 * screen moves.
 *
 * `Sub-Rent Cost Avoidance` is deliberately GONE rather than recomputed. It was
 * a projection ("Projected annual ROI"), not a count of anything in this file —
 * no `PurchaseRequest` carries an avoided-cost figure to sum, and inventing one
 * would put a fabricated rupee total back on a money tile, which is the defect
 * this pass exists to remove. TODO(decision): what avoided cost means and where
 * it is sourced. Until that is ruled the tile stays absent rather than guessed.
 *
 * Declared AFTER `PURCHASE_REQUESTS` on purpose: `countByStatus` reads that
 * array at module-evaluation time, so placing this above it puts the array in
 * its temporal dead zone and the import throws a `ReferenceError` before a
 * single screen renders. Derived values come after what they derive from.
 */
const countByStatus = (status: PRStatus): string =>
  String(PURCHASE_REQUESTS.filter((r) => r.status === status).length)

export const PURCHASE_REQUEST_KPIS = [
  { label: 'Draft Requests', value: countByStatus('Draft'), change: 'Accumulating evidence', icon: 'file' as IconName, accent: 'blue' as const },
  { label: 'Pending Approval', value: countByStatus('Submitted'), change: 'Awaiting a decision', icon: 'queues' as IconName, accent: 'amber' as const },
  { label: 'Approved / In Flight', value: countByStatus('Approved'), change: 'Cleared to purchase', icon: 'check' as IconName, accent: 'green' as const },
]
