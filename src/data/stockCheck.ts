import type { IconName } from '../components/ui/Icon'

export type StockCheckScopeType = 'Location' | 'Category' | 'Fleet Item' | 'Full Warehouse'
export type StockCheckStatus = 'In Progress' | 'Paused' | 'Completed' | 'Cancelled'

export interface ExpectedUnit {
  serial: string
  assetCode: string
  name: string
  category: string
  location: string
  condition: 'Excellent' | 'Good' | 'Fair' | 'Damaged' | 'Lost'
  scanned: boolean
  scannedAt?: string
  scannedBy?: string
  status: 'In Stock' | 'Maintenance' | 'Inspection' | 'Cleaning'
  isUnverified?: boolean
  flaggedNotHere?: boolean
  notes?: string
}

export interface StockCheckSession {
  id: string
  sessionNo: string
  scopeType: StockCheckScopeType
  scopeDetail: string
  warehouse: string
  totalExpected: number
  totalScanned: number
  totalExcludedOnRent: number
  totalUnverified: number
  totalConfirmedMissing: number
  status: StockCheckStatus
  startedBy: string
  startedAtAD: string
  startedAtBS: string
  completedAtAD?: string
  completedAtBS?: string
  notes?: string
  units: ExpectedUnit[]
}

export const STOCK_CHECK_KPIS = [
  { label: 'Units Unverified', value: '7', change: 'Awaiting scan / lookup', icon: 'alert_triangle' as IconName, accent: 'amber' as const },
  { label: 'Open Checks', value: '1', change: 'Zone A Cinema Bodies in progress', icon: 'queues' as IconName, accent: 'blue' as const },
  { label: 'Last Full Check', value: '4 Shrawan 2083', change: '20 Jul 2026 AD · 100% verified', icon: 'calendar' as IconName, accent: 'green' as const },
  { label: 'Confirmed Missing (FY)', value: '1', change: 'CASE-2026-0038 · Lens cap/hood', icon: 'error' as IconName, accent: 'danger' as const },
]

export const SAMPLE_STOCK_CHECKS: StockCheckSession[] = [
  {
    id: 'sc-01',
    sessionNo: 'SC-2083-004',
    scopeType: 'Location',
    scopeDetail: 'Zone A (Cinema Bodies) — Kathmandu HQ',
    warehouse: 'Kathmandu Main Hub (HQ)',
    totalExpected: 14,
    totalScanned: 11,
    totalExcludedOnRent: 6,
    totalUnverified: 3,
    totalConfirmedMissing: 0,
    status: 'In Progress',
    startedBy: 'Ramesh Karki (Warehouse Officer)',
    startedAtAD: '2026-08-06 09:00',
    startedAtBS: '2083-04-22 09:00',
    notes: 'Routine weekly verification of main cinema bodies vault.',
    units: [
      { serial: 'SN-FX3-001', assetCode: 'EQ000234', name: 'Sony FX3 Cinema Camera', category: 'Camera', location: 'Rack 01 · Shelf 02 · Bin A-1', condition: 'Excellent', scanned: true, scannedAt: '09:12', status: 'In Stock' },
      { serial: 'SN-FX3-002', assetCode: 'EQ000234', name: 'Sony FX3 Cinema Camera', category: 'Camera', location: 'Rack 01 · Shelf 02 · Bin A-1', condition: 'Good', scanned: true, scannedAt: '09:14', status: 'In Stock' },
      { serial: 'SN-FX3-003', assetCode: 'EQ000234', name: 'Sony FX3 Cinema Camera', category: 'Camera', location: 'Rack 01 · Shelf 02 · Bin A-1', condition: 'Excellent', scanned: true, scannedAt: '09:15', status: 'In Stock' },
      { serial: 'SN-FX3-004', assetCode: 'EQ000234', name: 'Sony FX3 Cinema Camera', category: 'Camera', location: 'Rack 01 · Shelf 02 · Bin A-1', condition: 'Good', scanned: false, status: 'In Stock', isUnverified: true },
      { serial: 'SN-FX6-001', assetCode: 'EQ000236', name: 'Sony FX6 Full-Frame Cinema Camera', category: 'Camera', location: 'Rack 01 · Shelf 03 · Bin A-2', condition: 'Excellent', scanned: true, scannedAt: '09:20', status: 'In Stock' },
      { serial: 'SN-FX6-002', assetCode: 'EQ000236', name: 'Sony FX6 Full-Frame Cinema Camera', category: 'Camera', location: 'Rack 01 · Shelf 03 · Bin A-2', condition: 'Good', scanned: true, scannedAt: '09:22', status: 'In Stock' },
      { serial: 'SN-FX6-003', assetCode: 'EQ000236', name: 'Sony FX6 Full-Frame Cinema Camera', category: 'Camera', location: 'Rack 01 · Shelf 03 · Bin A-2', condition: 'Excellent', scanned: false, status: 'In Stock', isUnverified: true },
      { serial: 'SN-RED-0001', assetCode: 'EQ000230', name: 'RED V-Raptor 8K VV Body', category: 'Camera', location: 'Rack 01 · Shelf 01 · Safe Bay 1', condition: 'Excellent', scanned: true, scannedAt: '09:30', status: 'In Stock' },
      { serial: 'SN-RED-0002', assetCode: 'EQ000230', name: 'RED V-Raptor 8K VV Body', category: 'Camera', location: 'Rack 01 · Shelf 01 · Safe Bay 1', condition: 'Good', scanned: true, scannedAt: '09:32', status: 'In Stock' },
      { serial: 'SN-BMP-0001', assetCode: 'EQ000238', name: 'Blackmagic Pocket Cinema 6K Pro', category: 'Camera', location: 'Rack 01 · Shelf 04 · Bin A-3', condition: 'Good', scanned: true, scannedAt: '09:40', status: 'In Stock' },
      { serial: 'SN-BMP-0002', assetCode: 'EQ000238', name: 'Blackmagic Pocket Cinema 6K Pro', category: 'Camera', location: 'Rack 01 · Shelf 04 · Bin A-3', condition: 'Good', scanned: true, scannedAt: '09:42', status: 'In Stock' },
      { serial: 'SN-BMP-0003', assetCode: 'EQ000238', name: 'Blackmagic Pocket Cinema 6K Pro', category: 'Camera', location: 'Rack 01 · Shelf 04 · Bin A-3', condition: 'Fair', scanned: false, status: 'In Stock', isUnverified: true, flaggedNotHere: true, notes: 'Checked shelf 4 twice, might be in prep room' },
    ],
  },
  {
    id: 'sc-02',
    sessionNo: 'SC-2083-003',
    scopeType: 'Full Warehouse',
    scopeDetail: 'Kathmandu Main Hub (HQ)',
    warehouse: 'Kathmandu Main Hub (HQ)',
    totalExpected: 210,
    totalScanned: 206,
    totalExcludedOnRent: 45,
    totalUnverified: 4,
    totalConfirmedMissing: 0,
    status: 'Completed',
    startedBy: 'Rajesh Shrestha (Manager)',
    startedAtAD: '2026-07-20 08:30',
    startedAtBS: '2083-04-04 08:30',
    completedAtAD: '2026-07-20 16:45',
    completedAtBS: '2083-04-04 16:45',
    notes: 'Monthly physical stock audit. All 4 unverified units cleared in subsequent packing scans.',
    units: [],
  },
]
