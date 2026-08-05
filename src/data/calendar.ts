/**
 * Calendar Workspace seed data.
 *
 * ⚠ **Spec-derived** — `03 Core Modules/Calendar.md` v3.2 (Build Locked).
 * No render in the reference set covers this screen.
 */

export const VIEWS = ['Resource Timeline', 'Month', 'Week', 'Day'] as const

/** §3 — Resource Timeline rows are grouped by resource type. */
export const ROW_TYPES = ['Equipment', 'Crew', 'Vehicles', 'Warehouse Bays'] as const
export type RowType = (typeof ROW_TYPES)[number]

/**
 * §6 — every bar type appears in the legend; the build the spec reviewed ended
 * its legend in "More". Sub-Rental is a **blue outline with an icon**, not
 * purple (§6.2 correction 4), and On Rent renders green (§0).
 */
export type BarKind =
  | 'Available'
  | 'Reserved'
  | 'On Rent'
  | 'Cleaning'
  | 'Maintenance'
  | 'Blocked'
  | 'Sub-Rental Out'
  | 'Sub-Rental In'
  | 'Conflict'
  | 'Quote Expiry'
  | 'Case Escalation'

export const BAR_STYLE: Record<BarKind, { bg: string; fg: string; outline?: boolean; icon?: 'arrow_right' | 'return_arrow' | 'alert_triangle' | 'timer' | 'flag' }> = {
  Available: { bg: 'transparent', fg: 'var(--success)', outline: true },
  Reserved: { bg: 'var(--st-primary-bg)', fg: 'var(--st-primary-fg)' },
  'On Rent': { bg: 'var(--st-out-bg)', fg: 'var(--st-out-fg)' },
  Cleaning: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  // Was byte-identical to On Rent, so a repair bench and a revenue-earning
  // rental drew the same bar and the legend had two rows with one swatch.
  Maintenance: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  Blocked: { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)' },
  'Sub-Rental Out': { bg: 'var(--st-purple-bg)', fg: 'var(--st-purple-fg)', icon: 'arrow_right' },

  'Sub-Rental In': { bg: 'transparent', fg: 'var(--st-purple-fg)', outline: true, icon: 'return_arrow' },
  Conflict: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', icon: 'alert_triangle' },
  'Quote Expiry': { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', icon: 'timer' },
  'Case Escalation': { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', icon: 'flag' },
}

export interface Bar {
  id?: string
  kind: BarKind
  label: string
  /** Day index within the rendered range. */
  start: number
  /** §5.4 — bar length equals event duration; it must not span weeks. */
  span: number
  /** Sub-rental bars carry a return-by date. */
  note?: string
}

export interface ResourceRow {
  type: RowType
  name: string
  sub?: string
  bars: Bar[]
}

export const ROWS: ResourceRow[] = [
  { type: 'Equipment', name: 'Sony FX6 · FX6-0123', bars: [{ kind: 'Reserved', label: 'BK-2026-0716', start: 0, span: 2 }, { kind: 'On Rent', label: 'BK-2026-0710', start: 3, span: 3 }] },
  { type: 'Equipment', name: 'RED Komodo X · KMX-0041', bars: [{ id: 'bk-715', kind: 'On Rent', label: 'BK-2026-0715', start: 1, span: 4 }, { kind: 'Cleaning', label: 'Reset queue', start: 5, span: 1 }] },
  { type: 'Equipment', name: 'NISI Athena Set · ATH-0012', bars: [{ kind: 'Conflict', label: 'Double-booked', start: 2, span: 2 }, { kind: 'On Rent', label: 'BK-2026-0713', start: 4, span: 2 }] },
  { type: 'Equipment', name: 'Aputure 600D · AP6-0204', bars: [{ kind: 'Maintenance', label: 'Repair bench', start: 0, span: 3 }, { kind: 'Quote Expiry', label: 'QT-2026-0088', start: 5, span: 1 }] },
  { type: 'Equipment', name: 'Alexa Mini LF (sub-rented)', bars: [{ kind: 'Sub-Rental Out', label: 'From Lumen House', start: 1, span: 3, note: 'Return by 6 Shrawan' }, { kind: 'Sub-Rental In', label: 'Returned', start: 4, span: 1 }] },
  { type: 'Crew', name: 'Ramesh Dulal · Camera Assistant', bars: [{ id: 'bk-715', kind: 'On Rent', label: 'BK-2026-0715', start: 1, span: 3 }] },
  { type: 'Crew', name: 'Sagar Maharjan · DoP', bars: [{ kind: 'On Rent', label: 'BK-2026-0710', start: 2, span: 4 }, { kind: 'Case Escalation', label: 'CASE-2026-0041', start: 6, span: 1 }] },
  { type: 'Vehicles', name: 'Bolero Pickup · Ba 2 Cha 4471', bars: [{ kind: 'Reserved', label: 'Delivery run', start: 0, span: 1 }, { kind: 'On Rent', label: 'BK-2026-0716', start: 3, span: 2 }] },
  { type: 'Warehouse Bays', name: 'Prep Bay 2', bars: [{ kind: 'Blocked', label: 'Dashain closure', start: 4, span: 3 }] },
  { type: 'Warehouse Bays', name: 'Return QC', bars: [{ kind: 'Cleaning', label: 'Reset & QC', start: 1, span: 2 }, { kind: 'Maintenance', label: 'Scheduled service', start: 5, span: 1 }] },
]

/** §0 — bottom status bar. Utilization is marked as matching Inventory. */
export const STATUS_BAR = {
  summary: '12 out · 9 back',
  conflicts: '1',
  utilization: '84%',
  utilizationNote: 'Matches Inventory',
  upcoming: '5 in next 48h',
}

export const FILTERS = ['All Resource Types', 'All Categories', 'All Branches', 'All Crew', 'All Statuses']

/** §8.2 — bulk actions never include Delete. Bookings are cancelled. */
export const BULK_ACTIONS = ['Move', 'Reassign', 'Block', 'Cancel Booking']

export const METRICS = {
  activeBookings: { value: 52, trend: '+8%', trendLabel: 'vs last month' },
  operations: { value: 18, label: 'Pickup · Return · Cleaning' },
  utilization: { value: '84%', label: 'Matches Today & Inventory' },
  conflicts: { value: 4, label: 'Requires attention' }
}

export const SELECTED_EVENT = {
  id: 'bk-715',
  bookingId: 'BK-2026-0715',
  status: 'On Rent',
  project: 'Himalayan Films',
  equipment: [
    { name: 'Sony FX3', serial: 'SN-CAM-0102' }
  ],
  pickup: '26 Jul 2026, 08:00',
  pickupBs: '10 Shrawan 2083 BS',
  return: '30 Jul 2026, 18:00',
  returnBs: '14 Shrawan 2083 BS',
  handoverSession: { date: '26 Jul 2026, 07:00', bs: '10 Shrawan 2083 BS' },
  returnSession: { date: '30 Jul 2026, 19:00', bs: '14 Shrawan 2083 BS' },
  crew: [
    { name: 'Ramesh (DIT)', avatar: '' },
    { name: 'Sunil (Warehouse)', avatar: '' }
  ],
  vehicle: 'Camera Van (VH-01-BA-5920)',
  notes: 'Outdoor shoot in Dolpa. Weather dependent.'
}
