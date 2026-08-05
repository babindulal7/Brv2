import type { Kpi } from '../components/ui/Page'

/**
 * Inventory Workspace seed data.
 *
 * ⚠ **Spec-derived, not render-derived.** No screenshot in the reference set
 * shows Inventory; this is built from `03 Core Modules/Inventory.md` v3.0
 * (Build Locked). Marked as such in `SCREENS.md` so the distinction stays
 * visible — screenshots govern where they exist.
 */

/** §4.1 — ten statuses, exclusive, derived. `On Shoot` is deleted. */
export type InvStatus =
  | 'In Stock'
  | 'Reserved'
  | 'Packed'
  | 'On Rent'
  | 'Returning'
  | 'Inspection'
  | 'Cleaning'
  | 'Maintenance'
  | 'Missing'
  | 'Retired'

/**
 * §4.2 — colour. `On Rent` is **green, never red**: an item out earning money
 * is the business working, and rendering it the same red as Missing makes a
 * healthy fleet look like a crisis. Where a token repeats, the label and icon
 * separate the states.
 */
export const INV_STYLE: Record<InvStatus, { bg: string; fg: string; icon: 'box' | 'calendar' | 'checklist' | 'truck' | 'return_arrow' | 'eye' | 'sparkles' | 'tool' | 'alert_triangle' | 'close' }> = {
  'In Stock': { bg: 'transparent', fg: 'var(--success-text)', icon: 'box' },
  Reserved: { bg: 'var(--st-primary-bg)', fg: 'var(--st-primary-fg)', icon: 'calendar' },
  Packed: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', icon: 'checklist' },
  'On Rent': { bg: 'var(--st-out-bg)', fg: 'var(--st-out-fg)', icon: 'truck' },
  Returning: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)', icon: 'return_arrow' },
  Inspection: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', icon: 'eye' },
  Cleaning: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', icon: 'sparkles' },
  Maintenance: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)', icon: 'tool' },
  Missing: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', icon: 'alert_triangle' },
  Retired: { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)', icon: 'close' },
}

/** §5.5 — five conditions, five colours. */
export const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'] as const
export type Condition = (typeof CONDITIONS)[number] | 'Mixed'

export const TABS = ['Inventory', 'Bundles', 'Sub Rental', 'Maintenance', 'Cases'] as const

/** §4.3 — chips carry counts and must reconcile. */
export const CHIP_COUNTS: Array<{ label: 'All' | InvStatus; count: number }> = [
  { label: 'All', count: 2486 },
  { label: 'In Stock', count: 1204 },
  { label: 'Reserved', count: 218 },
  { label: 'Packed', count: 96 },
  { label: 'On Rent', count: 642 },
  { label: 'Returning', count: 84 },
  { label: 'Inspection', count: 112 },
  { label: 'Cleaning', count: 74 },
  { label: 'Maintenance', count: 38 },
  { label: 'Missing', count: 18 },
  { label: 'Retired', count: 63 },
]

/**
 * §4.3 Count Invariant: `Σ status counts = Total, excluding Retired`.
 *
 * The spec calls out a build where the chips summed 186 over the total: "the
 * chip row reconciles on every load, or the numbers are not trusted." So it is
 * checked here rather than trusted.
 */
const TOTAL = CHIP_COUNTS.find((c) => c.label === 'All')?.count ?? 0
const SUM_EXCL_RETIRED = CHIP_COUNTS.filter((c) => c.label !== 'All' && c.label !== 'Retired').reduce((a, c) => a + c.count, 0)
if (SUM_EXCL_RETIRED !== TOTAL) {
  throw new Error(`Inventory chip counts do not reconcile: ${SUM_EXCL_RETIRED} vs total ${TOTAL}`)
}

/** §4.4 — four KPIs, deliberately not a reprint of the chips. */
export const KPIS: Kpi[] = [
  { label: 'Total Equipment', value: '2,486', icon: 'box', accent: 'primary', note: 'Excludes retired' },
  { label: 'Available', value: '1,204', icon: 'checklist', accent: 'success', note: 'In Stock only' },
  { label: 'On Rent', value: '642', icon: 'truck', accent: 'success', note: 'Across 128 bookings' },
  { label: 'Maintenance', value: '38', icon: 'tool', accent: 'progress', note: 'In the repair queue' },
]

export interface ChildRow {
  serial: string
  status: InvStatus
  booking: string
  location: string
  condition: Condition
  replacement: string
}

export interface ParentRow {
  name: string
  category: string
  /** Serialised parents state units; non-serialised state `142 of 200`. */
  stock: string
  /** §3.1 — a summary, never one badge. Non-serialised summarise by quantity. */
  statusSummary: string
  bookings: string
  location: string
  condition: Condition
  replacement: string
  /** §3.4 — non-serialised SKUs are a parent with no children. */
  children?: ChildRow[]
}

export const PARENTS: ParentRow[] = [
  {
    name: 'Sony FX6 Cinema Camera',
    category: 'Camera',
    stock: '3 units',
    statusSummary: '1 In Stock · 1 Reserved · 1 On Rent',
    bookings: '2 Active',
    location: 'Mixed',
    condition: 'Mixed',
    replacement: 'Rs 12,60,000',
    children: [
      { serial: 'FX6-0123', status: 'In Stock', booking: '—', location: 'Shelf A1', condition: 'Excellent', replacement: 'Rs 4,20,000' },
      { serial: 'FX6-0124', status: 'Reserved', booking: 'BK-2026-0716', location: 'Shelf A1', condition: 'Excellent', replacement: 'Rs 4,20,000' },
      { serial: 'FX6-0125', status: 'On Rent', booking: 'BK-2026-0710', location: 'With Client › Vision Production', condition: 'Good', replacement: 'Rs 4,20,000' },
    ],
  },
  {
    name: 'RED Komodo X',
    category: 'Camera',
    stock: '2 units',
    statusSummary: '1 Packed · 1 Inspection',
    bookings: '1 Active',
    location: 'Mixed',
    condition: 'Excellent',
    replacement: 'Rs 16,40,000',
    children: [
      { serial: 'KMX-0041', status: 'Packed', booking: 'BK-2026-0715', location: 'Prep Bay 2', condition: 'Excellent', replacement: 'Rs 8,20,000' },
      { serial: 'KMX-0042', status: 'Inspection', booking: '—', location: 'Return QC', condition: 'Excellent', replacement: 'Rs 8,20,000' },
    ],
  },
  {
    name: 'NISI Athena Prime Set',
    category: 'Lens',
    stock: '3 units',
    statusSummary: '2 On Rent · 1 Cleaning',
    bookings: '2 Active',
    location: 'Mixed',
    condition: 'Good',
    replacement: 'Rs 9,60,000',
    children: [
      { serial: 'ATH-0011', status: 'On Rent', booking: 'BK-2026-0710', location: 'With Client › Vision Production', condition: 'Good', replacement: 'Rs 3,20,000' },
      { serial: 'ATH-0012', status: 'On Rent', booking: 'BK-2026-0713', location: 'With Client › Mirage Weddings', condition: 'Good', replacement: 'Rs 3,20,000' },
      { serial: 'ATH-0013', status: 'Cleaning', booking: '—', location: 'Cleaning Bay', condition: 'Fair', replacement: 'Rs 3,20,000' },
    ],
  },
  {
    name: 'Aputure 600D Pro',
    category: 'Lighting',
    stock: '4 units',
    statusSummary: '2 In Stock · 1 Returning · 1 Maintenance',
    bookings: '1 Active',
    location: 'Mixed',
    condition: 'Mixed',
    replacement: 'Rs 6,80,000',
    children: [
      { serial: 'AP6-0201', status: 'In Stock', booking: '—', location: 'Shelf C3', condition: 'Excellent', replacement: 'Rs 1,70,000' },
      { serial: 'AP6-0202', status: 'In Stock', booking: '—', location: 'Shelf C3', condition: 'Good', replacement: 'Rs 1,70,000' },
      { serial: 'AP6-0203', status: 'Returning', booking: 'BK-2026-0711', location: 'With Client › Inside Out Films', condition: 'Good', replacement: 'Rs 1,70,000' },
      { serial: 'AP6-0204', status: 'Maintenance', booking: '—', location: 'Repair Bench', condition: 'Poor', replacement: 'Rs 1,70,000' },
    ],
  },
  {
    name: 'DJI Ronin 4D',
    category: 'Support',
    stock: '2 units',
    statusSummary: '1 In Stock · 1 Missing',
    bookings: '—',
    location: 'Mixed',
    condition: 'Mixed',
    replacement: 'Rs 11,00,000',
    children: [
      { serial: 'DR4D-0004', status: 'In Stock', booking: '—', location: 'Shelf B2', condition: 'Excellent', replacement: 'Rs 5,50,000' },
      { serial: 'DR4D-0005', status: 'Missing', booking: '—', location: 'Unaccounted', condition: 'Damaged', replacement: 'Rs 5,50,000' },
    ],
  },
  {
    // §3.4 — non-serialised SKU: no children, quantity-based stock and status.
    name: 'BNC Cable 3m',
    category: 'Accessory',
    stock: '142 of 200',
    statusSummary: '12 on rent · 130 in stock',
    bookings: '4 Active',
    location: 'Bin D4',
    condition: 'Good',
    replacement: 'Rs 60,000',
  },
]

/** §7.5 — paginate parents, state both counts. */
export const SHOWING = 'Showing 1 to 6 of 418 models · 2,486 units'

export const FILTERS = ['All Categories', 'All Locations', 'All Conditions', 'All Suppliers', 'Serialised (All)']
