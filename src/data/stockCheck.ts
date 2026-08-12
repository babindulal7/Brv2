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
  /**
   * A **person** asserted this unit is missing, through `[Confirm missing]`.
   *
   * Never set by a scan, a filter, or `Reconcile & Complete`. This is the whole
   * of §7.3's correctness rule — *"unscanned = Unverified, never auto-Missing"* —
   * expressed as data: an unscanned unit is one nobody walked past, and writing a
   * loss into the record on the strength of an interrupted warehouse officer is
   * the failure this flag exists to prevent. A scan CLEARS it (finding the thing
   * is better evidence than not finding it); nothing sets it but a human.
   */
  confirmedMissing?: boolean
  /** @deprecated Derived, not stored — `unitState()` returns 'Unverified' for any unit that is neither scanned nor confirmed missing. Setting this has no effect. */
  isUnverified?: boolean
  /** @deprecated Superseded by `confirmedMissing`, which is the flag `unitState()` reads. Setting this has no effect. */
  flaggedNotHere?: boolean
  notes?: string
}

/**
 * The three states a unit in a stock check can be in.
 *
 * `Unverified` is the default AND the resting state, not a transitional one:
 * a check that ends with unscanned units ends with Unverified units, and that is
 * a correct outcome rather than an incomplete one.
 */
export type StockCheckUnitState = 'Verified' | 'Unverified' | 'Confirmed missing'

/**
 * The single derivation. `StockCheck.tsx` never re-derives a state inline, which
 * is what stops the count, the filter and the badge from ever disagreeing.
 *
 * Order matters and is the rule, not an implementation detail: **a scan wins.**
 * A unit someone confirmed missing and later scanned is Verified — evidence that
 * it exists outranks an earlier report that it did not. Only when there is no
 * scan does the human assertion decide, and absent both, the unit is Unverified.
 */
export function unitState(u: ExpectedUnit): StockCheckUnitState {
  if (u.scanned) return 'Verified'
  if (u.confirmedMissing) return 'Confirmed missing'
  return 'Unverified'
}

/**
 * Badge presentation per state. Tokens only — no hex (PLAN.md §5) — and every
 * entry carries an `icon` because Law 11 forbids colour alone.
 *
 * There is no `--st-*-border` token in the theme, so the border reuses the
 * state's own `fg`. That keeps the outline tied to the tone it belongs to
 * rather than introducing a fourth colour that could drift away from it.
 */
export const STOCK_CHECK_STATE_META: Record<
  StockCheckUnitState,
  { bg: string; fg: string; border: string; icon: IconName }
> = {
  Verified: {
    bg: 'var(--st-primary-bg)',
    fg: 'var(--st-primary-fg)',
    border: 'var(--st-primary-fg)',
    icon: 'check',
  },
  Unverified: {
    // Progress, deliberately NOT danger: "no scan yet" is an absence of
    // information, and conflating it with Missing is the mistake §7.3 names.
    bg: 'var(--st-progress-bg)',
    fg: 'var(--st-progress-fg)',
    border: 'var(--st-progress-fg)',
    icon: 'alert_triangle',
  },
  'Confirmed missing': {
    bg: 'var(--st-danger-bg)',
    fg: 'var(--st-danger-fg)',
    border: 'var(--st-danger-fg)',
    icon: 'error',
  },
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
