import type { IconName } from '../components/ui/Icon'

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
  costPaid: number
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
  estimatedUnitCost: number
  totalEstimatedCost: number
  totalSubRentPaid: number
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

export const PURCHASE_REQUEST_KPIS = [
  { label: 'Draft Requests', value: '3', change: 'Accumulating evidence', icon: 'file' as IconName, accent: 'blue' as const },
  { label: 'Pending Approval', value: '2', change: 'NPR 845,000 total', icon: 'queues' as IconName, accent: 'amber' as const },
  { label: 'Approved / In Flight', value: '2', change: 'Expected next week', icon: 'check' as IconName, accent: 'green' as const },
  { label: 'Sub-Rent Cost Avoidance', value: 'NPR 320,000', change: 'Projected annual ROI', icon: 'dollar' as IconName, accent: 'purple' as const },
]

export const PURCHASE_REQUESTS: PurchaseRequest[] = [
  {
    id: 'pr-001',
    prNo: 'PR-2026-0012',
    fleetItemId: 'EQ000234',
    fleetItemName: 'Sony FX3 Cinema Camera Body',
    category: 'Camera',
    requestedQty: 2,
    reason: 'Demand exceeded',
    estimatedUnitCost: 465000,
    totalEstimatedCost: 930000,
    totalSubRentPaid: 168000,
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
      { bookingId: 'b-089', bookingRef: 'BR-2026-0189', client: 'Gorkha Productions', startDate: '2026-08-10', endDate: '2026-08-14', quantityShort: 1 },
      { bookingId: 'b-092', bookingRef: 'BR-2026-0192', client: 'Himal Media Works', startDate: '2026-08-12', endDate: '2026-08-15', quantityShort: 1 },
      { bookingId: 'b-095', bookingRef: 'BR-2026-0195', client: 'Blackbox Films', startDate: '2026-08-18', endDate: '2026-08-22', quantityShort: 1 },
      { bookingId: 'b-098', bookingRef: 'BR-2026-0198', client: 'Kathmandu Visuals', startDate: '2026-08-20', endDate: '2026-08-23', quantityShort: 1 },
    ],
    subRentals: [
      { subRentalId: 'sr-011', subRentalRef: 'SUB-2026-0031', supplier: 'Everest Cine Partner', costPaid: 56000, date: '2026-07-22' },
      { subRentalId: 'sr-014', subRentalRef: 'SUB-2026-0034', supplier: 'Everest Cine Partner', costPaid: 62000, date: '2026-07-29' },
      { subRentalId: 'sr-018', subRentalRef: 'SUB-2026-0038', supplier: 'Pokhara Cine Equip', costPaid: 50000, date: '2026-08-03' },
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
    estimatedUnitCost: 285000,
    totalEstimatedCost: 285000,
    totalSubRentPaid: 85000,
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
      { bookingId: 'b-081', bookingRef: 'BR-2026-0181', client: 'Music Video Collective', startDate: '2026-07-30', endDate: '2026-08-01', quantityShort: 1 },
      { bookingId: 'b-085', bookingRef: 'BR-2026-0185', client: 'Red Panda Creative', startDate: '2026-08-05', endDate: '2026-08-07', quantityShort: 1 },
    ],
    subRentals: [
      { subRentalId: 'sr-008', subRentalRef: 'SUB-2026-0028', supplier: 'Lalitpur Lighting Co', costPaid: 45000, date: '2026-07-15' },
      { subRentalId: 'sr-012', subRentalRef: 'SUB-2026-0032', supplier: 'Lalitpur Lighting Co', costPaid: 40000, date: '2026-07-25' },
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
    estimatedUnitCost: 145000,
    totalEstimatedCost: 145000,
    totalSubRentPaid: 22000,
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
      { bookingId: 'b-099', bookingRef: 'BR-2026-0199', client: 'Weddings Nepal', startDate: '2026-08-25', endDate: '2026-08-27', quantityShort: 1 },
    ],
    subRentals: [
      { subRentalId: 'sr-020', subRentalRef: 'SUB-2026-0040', supplier: 'Pokhara Cine Equip', costPaid: 22000, date: '2026-08-02' },
    ],
  },
]
