/**
 * Calendar Workspace seed data.
 *
 * ⚠ **Spec-derived** — `03 Core Modules/Calendar.md` v3.2 (Build Locked), now
 * reconciled against the two `03 Core Modules` renders (`Calendar.PNG` and
 * `Calendar - Full View.PNG`).
 *
 * Three deliberate departures from those renders, each forced by Foundation:
 *
 *  1. **No purple.** §4.2 bans purple / violet / cyan / teal / indigo outright.
 *     The renders draw Sub-Rental bars and the Utilization KPI in purple. Both
 *     move to an allowed family — sub-rental to the **gold outline** that §4.2
 *     reserves for exactly that ("Gold, outline only — sub-rental, partner
 *     equipment"), Utilization to `progress`.
 *  2. **Dates are AD instants, never pre-rendered BS strings.** The renders
 *     label the same week "10–16 Shrawan"; the Date Engine's anchor
 *     (16 Jul 2026 = 1 Shrawan 2083) makes it 11–17. Nothing here stores a BS
 *     string — every BS label is produced by `lib/bs.ts` at render time, so the
 *     screen cannot disagree with the rest of the product.
 *  3. **No money.** Foundation §8.3 — the Warehouse role sees no financial
 *     figure anywhere. The one money-adjacent row (`Payment Due`) is marked
 *     `money: true` so the screen can omit it structurally rather than mask it.
 */

import type { IconName } from '../components/ui/Icon'
import { TODAY } from '../lib/bs'

/* ── time ──────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000

/**
 * Plain **AD** day arithmetic, relative to the one `TODAY` in `lib/bs.ts`.
 * Nepali date maths never happens here — `toBs` is the only converter and it is
 * called at render time.
 */
export function adDay(offset: number): Date {
  return new Date(TODAY.getTime() + offset * DAY_MS)
}

/** Whole days between two UTC-midnight AD dates. */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

/* ── views ─────────────────────────────────────────────────────────────── */

export const VIEWS = ['Resource Timeline', 'Month', 'Week', 'Day'] as const
export type ViewName = (typeof VIEWS)[number]

/** §3 — Resource Timeline rows are grouped by resource type, in render order. */
export const ROW_TYPES = ['Equipment', 'Vehicles', 'Crew', 'Warehouse Bays'] as const
export type RowType = (typeof ROW_TYPES)[number]

/** Zoom steps, in days rendered. "Fit" returns to 7. */
export const ZOOM_STEPS = [3, 5, 7, 10, 14, 21] as const
export const DEFAULT_ZOOM = 7

/* ── bars ──────────────────────────────────────────────────────────────── */

/**
 * §6 — every bar type appears in the legend; the build the spec reviewed ended
 * its legend in "More".
 *
 * TODO(decision): `Crew Duty` is drawn in both renders (Sunil's "Warehouse Duty
 * · Morning Shift" band) but `Calendar.md` §6's legend does not enumerate it,
 * so its tone is a guess — it borrows `progress`, which also carries Cleaning.
 * Needs a ruling: is a crew shift a calendar bar at all, or roster furniture?
 */
export type BarKind =
  | 'Available'
  | 'Reserved'
  | 'On Rent'
  | 'Cleaning'
  | 'Maintenance'
  | 'Crew Duty'
  | 'Blocked'
  | 'Sub-Rental Out'
  | 'Sub-Rental In'
  | 'Conflict'
  | 'Quote Expiry'
  | 'Case Escalation'

export interface BarSkin {
  bg: string
  fg: string
  /** Outline colour; also the legend swatch. */
  line: string
  dash?: boolean
  icon?: IconName
}

export const BAR_STYLE: Record<BarKind, BarSkin> = {
  Available: { bg: 'transparent', fg: 'var(--success-text)', line: 'var(--success)', dash: true },
  Reserved: { bg: 'var(--st-primary-bg)', fg: 'var(--st-primary-fg)', line: 'var(--st-primary-fg)', icon: 'calendar_event' },
  /* §4.2 — "solid = out, soft = in". On Rent is the solid weight, always. */
  'On Rent': { bg: 'var(--st-out-bg)', fg: 'var(--st-out-fg)', line: 'var(--st-out-bg)', icon: 'calendar_event' },
  Cleaning: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', line: 'var(--st-progress-fg)', icon: 'refresh' },
  /* Was byte-identical to Cleaning, so a repair bench and a reset queue drew the
     same bar and the legend had two rows sharing one swatch. Same family, other
     weight: Cleaning fills, Maintenance outlines. */
  Maintenance: { bg: 'transparent', fg: 'var(--progress-text)', line: 'var(--progress)', icon: 'tool' },
  'Crew Duty': { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', line: 'var(--st-progress-fg)', icon: 'crew' },
  Blocked: { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)', line: 'var(--st-neutral-fg)', icon: 'package' },
  /* §4.2 — gold, outline only. The renders draw these purple; purple is banned. */
  'Sub-Rental Out': { bg: 'transparent', fg: 'var(--ext-fg)', line: 'var(--ext-line)', icon: 'external_link' },
  'Sub-Rental In': { bg: 'transparent', fg: 'var(--ext-fg)', line: 'var(--ext-line)', dash: true, icon: 'return_arrow' },
  Conflict: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', line: 'var(--danger)', icon: 'alert_triangle' },
  'Quote Expiry': { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', line: 'var(--st-progress-fg)', icon: 'timer' },
  'Case Escalation': { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', line: 'var(--danger)', icon: 'flag' },
}

export const BAR_KINDS = Object.keys(BAR_STYLE) as BarKind[]

export interface Bar {
  /** Stable key; also the selection key for the Selected Event panel. */
  id: string
  kind: BarKind
  /** Bold first line — a booking number, or the event name. */
  label: string
  /** Second line — client / project / reason. */
  sub?: string
  /** Inclusive AD start day (UTC midnight). */
  from: Date
  /** Inclusive AD end day (UTC midnight). */
  to: Date
  /** Client, when the bar belongs to one. Drives the Client filter. */
  client?: string
  /** Trailing chip, e.g. a sub-rental return-by promise. Never a date. */
  note?: string
  /**
   * The AD instant the `note` refers to. The BS day is appended by the screen
   * through `lib/bs.ts` — this used to read `note: 'Return by 20 Shrawan'`, a
   * typed-in BS string that contradicted this file's own header and would have
   * drifted the moment `TODAY` or the offsets moved.
   */
  noteAt?: Date
  /** Right-edge dot — a flag needing attention on this bar. */
  dot?: 'danger' | 'progress' | 'primary' | 'success'
}

export interface ResourceRow {
  id: string
  type: RowType
  name: string
  /** Serial / crew code / bay code — rendered in the identifier face. */
  code?: string
  /** Third line: unit count, or the resource's own state. */
  meta: string
  metaTone?: 'success' | 'primary' | 'muted' | 'progress'
  icon: IconName
  bars: Bar[]
}

/**
 * Row roster and bar placement transcribed from `Calendar.PNG`, with every bar
 * anchored to `TODAY` rather than to a hand-written column index — so the
 * `‹ ›` range controls actually move the picture.
 */
export const ROWS: ResourceRow[] = [
  {
    id: 'eq-fx3',
    type: 'Equipment',
    name: 'Sony FX3',
    code: 'SN-CAM-0102',
    meta: '1 unit',
    metaTone: 'success',
    icon: 'camera',
    bars: [
      { id: 'bk-0715-fx3', kind: 'On Rent', label: 'BK-2026-0715', sub: 'Himalayan Films', client: 'Himalayan Films', from: adDay(-1), to: adDay(1), dot: 'success' },
      { id: 'cl-fx3', kind: 'Cleaning', label: 'Cleaning', sub: 'Maya Production', client: 'Maya Production', from: adDay(3), to: adDay(3), dot: 'progress' },
      { id: 'rs-fx3', kind: 'Reserved', label: 'Reserved', sub: 'Pixel Studio', client: 'Pixel Studio', from: adDay(4), to: adDay(5) },
      { id: 'bk-0702-fx3', kind: 'On Rent', label: 'BK-2026-0702', sub: 'Classic Media', client: 'Classic Media', from: adDay(-6), to: adDay(-4) },
      { id: 'bk-0731-fx3', kind: 'Reserved', label: 'BK-2026-0731', sub: 'Himalayan Films', client: 'Himalayan Films', from: adDay(8), to: adDay(10) },
    ],
  },
  {
    id: 'eq-komodo',
    type: 'Equipment',
    name: 'RED Komodo X',
    code: 'SN-CAM-0201',
    meta: '1 unit',
    metaTone: 'success',
    icon: 'video',
    bars: [
      { id: 'bk-0712-kmx', kind: 'On Rent', label: 'BK-2026-0712', sub: 'Classic Media', client: 'Classic Media', from: adDay(0), to: adDay(2), dot: 'success' },
      { id: 'cf-kmx', kind: 'Conflict', label: 'CONFLICT', sub: 'Double Booking', from: adDay(3), to: adDay(3), dot: 'danger' },
      { id: 'bk-0718-kmx', kind: 'On Rent', label: 'BK-2026-0718', sub: 'Nepal Docs Lab', client: 'Nepal Docs Lab', from: adDay(4), to: adDay(5) },
      { id: 'mt-kmx', kind: 'Maintenance', label: 'Sensor Clean', sub: 'Service Center', from: adDay(-5), to: adDay(-4) },
    ],
  },
  {
    id: 'eq-aputure',
    type: 'Equipment',
    name: 'Aputure 600D Pro',
    code: 'SN-LGT-0013',
    meta: '2 units',
    metaTone: 'primary',
    icon: 'battery',
    bars: [
      { id: 'bl-ap6', kind: 'Blocked', label: 'Blocked', sub: 'Demo Shoot', from: adDay(-1), to: adDay(-1) },
      { id: 'bk-0716-ap6', kind: 'On Rent', label: 'BK-2026-0716', sub: 'Maya Production', client: 'Maya Production', from: adDay(1), to: adDay(2), dot: 'success' },
      { id: 'mt-ap6', kind: 'Maintenance', label: 'Maintenance', sub: 'Service Center', from: adDay(5), to: adDay(5), dot: 'progress' },
      { id: 'qt-ap6', kind: 'Quote Expiry', label: 'QT-2026-0088', sub: 'Expires today', client: 'Pixel Studio', from: adDay(7), to: adDay(7), dot: 'progress' },
    ],
  },
  {
    id: 'eq-rs4',
    type: 'Equipment',
    name: 'DJI RS 4 Pro',
    code: 'SN-GIM-0004',
    meta: '2 units',
    metaTone: 'success',
    icon: 'tool',
    bars: [
      { id: 'bk-0715-rs4', kind: 'On Rent', label: 'BK-2026-0715', sub: 'Himalayan Films', client: 'Himalayan Films', from: adDay(-1), to: adDay(1), dot: 'progress' },
      { id: 'bk-0720-rs4', kind: 'On Rent', label: 'BK-2026-0720', sub: 'Pixel Studio', client: 'Pixel Studio', from: adDay(3), to: adDay(5) },
      { id: 'av-rs4', kind: 'Available', label: 'Available', from: adDay(-5), to: adDay(-2) },
    ],
  },
  {
    id: 'eq-athena',
    type: 'Equipment',
    name: 'NISI Athena Prime Set',
    code: 'SN-LEN-0501',
    meta: '1 set',
    metaTone: 'muted',
    icon: 'photo',
    bars: [
      { id: 'sr-out-ath', kind: 'Sub-Rental Out', label: 'Sub-Rental Out', sub: 'Filmgear Rentals', client: 'Filmgear Rentals', from: adDay(0), to: adDay(2), note: 'Return by', noteAt: adDay(4), dot: 'primary' },
      { id: 'sr-in-ath', kind: 'Sub-Rental In', label: 'Sub-Rental In', sub: 'Filmgear Rentals', client: 'Filmgear Rentals', from: adDay(4), to: adDay(5), note: 'Expected', noteAt: adDay(4), dot: 'primary' },
      { id: 'cs-ath', kind: 'Case Escalation', label: 'CASE-2026-0041', sub: 'Lens element haze', from: adDay(9), to: adDay(9), dot: 'danger' },
    ],
  },
  {
    id: 'vh-van',
    type: 'Vehicles',
    name: 'Camera Van',
    code: 'VH-01-BA-5920',
    meta: '1 unit',
    metaTone: 'primary',
    icon: 'truck',
    bars: [
      { id: 'bk-0712-van', kind: 'On Rent', label: 'BK-2026-0712', sub: 'Classic Media', client: 'Classic Media', from: adDay(-1), to: adDay(1), dot: 'success' },
      { id: 'bk-0718-van', kind: 'On Rent', label: 'BK-2026-0718', sub: 'Nepal Docs Lab', client: 'Nepal Docs Lab', from: adDay(3), to: adDay(4) },
      { id: 'mt-van', kind: 'Maintenance', label: 'Servicing', sub: 'Workshop', from: adDay(8), to: adDay(9) },
    ],
  },
  {
    id: 'cr-001',
    type: 'Crew',
    name: 'Ramesh (DIT)',
    code: 'CR-001',
    meta: 'On Duty',
    metaTone: 'success',
    icon: 'crew',
    bars: [
      { id: 'bk-0715-cr1', kind: 'Reserved', label: 'BK-2026-0715', sub: 'Full Day', client: 'Himalayan Films', from: adDay(-1), to: adDay(1), dot: 'primary' },
      { id: 'bk-0720-cr1', kind: 'Reserved', label: 'BK-2026-0720', sub: 'Full Day', client: 'Pixel Studio', from: adDay(3), to: adDay(5), dot: 'primary' },
    ],
  },
  {
    id: 'cr-002',
    type: 'Crew',
    name: 'Sunil (Warehouse)',
    code: 'CR-002',
    meta: 'On Duty',
    metaTone: 'success',
    icon: 'crew',
    bars: [
      { id: 'duty-cr2', kind: 'Crew Duty', label: 'Warehouse Duty', sub: 'Morning Shift', from: adDay(-1), to: adDay(5) },
    ],
  },
  {
    id: 'wb-studio-a',
    type: 'Warehouse Bays',
    name: 'Studio Floor A',
    code: 'BAY-A',
    meta: 'Warehouse',
    metaTone: 'muted',
    icon: 'box',
    bars: [
      { id: 'bl-studio-a', kind: 'Blocked', label: 'Closed', sub: 'Dashain Holiday (Warehouse Closed)', from: adDay(-3), to: adDay(-1) },
      { id: 'cl-studio-a', kind: 'Cleaning', label: 'Reset & QC', sub: 'Return queue', from: adDay(1), to: adDay(2) },
    ],
  },
  {
    id: 'wb-prep-2',
    type: 'Warehouse Bays',
    name: 'Prep Bay 2',
    code: 'BAY-P2',
    meta: 'Warehouse',
    metaTone: 'muted',
    icon: 'package',
    bars: [
      { id: 'pk-prep2', kind: 'Reserved', label: 'Packing', sub: 'BK-2026-0718', client: 'Nepal Docs Lab', from: adDay(2), to: adDay(3) },
      { id: 'bl-prep2', kind: 'Blocked', label: 'Blocked', sub: 'Tihar (Laxmi Puja)', from: adDay(11), to: adDay(12) },
    ],
  },
]

/* ── filters ───────────────────────────────────────────────────────────── */

export const CLIENTS: string[] = Array.from(
  new Set(ROWS.flatMap((r) => r.bars.map((b) => b.client).filter((c): c is string => Boolean(c)))),
).sort()

export interface SavedView {
  name: string
  /** Applied verbatim when the view is picked — no dead entries. */
  rowType: 'All' | RowType
  kinds: BarKind[]
  /** The one marked default in the render. */
  starred?: boolean
}

export const SAVED_VIEWS: SavedView[] = [
  { name: 'My Bookings', rowType: 'All', kinds: ['On Rent', 'Reserved'] },
  { name: 'Warehouse View', rowType: 'Warehouse Bays', kinds: [] },
  { name: 'Equipment View', rowType: 'Equipment', kinds: [], starred: true },
  { name: 'Crew Schedule', rowType: 'Crew', kinds: [] },
  { name: 'Conflict View', rowType: 'All', kinds: ['Conflict', 'Case Escalation'] },
]

/* ── KPI band ──────────────────────────────────────────────────────────── */

export interface CalendarKpi {
  label: string
  value: string
  icon: IconName
  /** §4.2's five families only — `purple` is not among them. */
  accent: 'success' | 'primary' | 'progress' | 'danger'
  note: string
  delta?: { text: string; direction: 'up' | 'down'; good: boolean }
  link?: { label: string; to: string }
  /** Renders the ⓘ affordance the render shows on Utilization. */
  hint?: string
}

export const KPIS: CalendarKpi[] = [
  {
    label: 'Active Bookings',
    value: '52',
    icon: 'calendar',
    accent: 'success',
    note: 'Across all dates',
    delta: { text: '8%', direction: 'up', good: true },
  },
  {
    label: "Today's Operations",
    value: '18',
    icon: 'file',
    accent: 'primary',
    note: 'Pickup · Return · Cleaning',
    link: { label: 'View Today', to: '/today' },
  },
  {
    // The render tints this one purple. §4.2 bans the hue outright.
    label: 'Equipment Utilization',
    value: '84%',
    icon: 'chart',
    accent: 'progress',
    note: 'This month',
    hint: 'Matches Today & Inventory',
  },
  {
    label: 'Schedule Conflicts',
    value: '4',
    icon: 'alert_triangle',
    accent: 'danger',
    note: 'Requires attention',
  },
]

/* ── right rail ────────────────────────────────────────────────────────── */

/**
 * Festivals are stored as **AD** ranges; the BS label beside them is rendered by
 * `lib/bs.ts`, so the list can never drift from the grid above it.
 */
export interface Holiday {
  name: string
  from: Date
  to: Date
}

export const HOLIDAYS: Holiday[] = [
  { name: 'Dashain', from: new Date(Date.UTC(2026, 6, 28)), to: new Date(Date.UTC(2026, 6, 30)) },
  { name: 'Buddha Jayanti', from: new Date(Date.UTC(2026, 7, 8)), to: new Date(Date.UTC(2026, 7, 8)) },
  { name: 'Tihar (Laxmi Puja)', from: new Date(Date.UTC(2026, 7, 11)), to: new Date(Date.UTC(2026, 7, 12)) },
]

export function holidayOn(d: Date): Holiday | null {
  const t = d.getTime()
  return HOLIDAYS.find((h) => t >= h.from.getTime() && t <= h.to.getTime()) ?? null
}

export interface CountRow {
  label: string
  value: number
  tone: string
  icon?: IconName
  /** §8.3 — omitted entirely for a role that may not see money. */
  money?: boolean
}

export const TODAY_SUMMARY: CountRow[] = [
  { label: 'Pickup', value: 3, tone: 'var(--primary)' },
  { label: 'Return', value: 5, tone: 'var(--progress)' },
  { label: 'Cleaning', value: 4, tone: 'var(--success)' },
  { label: 'Maintenance', value: 2, tone: 'var(--danger)' },
  { label: 'Sub-Rental Return', value: 2, tone: 'var(--ext-line)' },
]

export const UPCOMING: CountRow[] = [
  { label: 'Bookings', value: 12, tone: 'var(--primary-text)', icon: 'calendar_event' },
  { label: 'Sub-Rental Returns', value: 2, tone: 'var(--ext-fg)', icon: 'return_arrow' },
  { label: 'Quote Expiry', value: 3, tone: 'var(--progress-text)', icon: 'timer' },
  { label: 'Case Escalations', value: 1, tone: 'var(--danger-text)', icon: 'alert_triangle' },
  { label: 'Payment Due', value: 4, tone: 'var(--progress-text)', icon: 'dollar', money: true },
]

/**
 * The render's four tiles. `to` is a route that exists; `unavailable` states the
 * reason instead of pretending — §0 forbids a control that goes nowhere.
 */
export interface QuickAction {
  label: string
  icon: IconName
  to?: string
  /** In-page action key, handled by the screen. */
  action?: 'conflicts'
  unavailable?: string
}

export const QUICK_ACTIONS: QuickAction[] = [
  { label: 'New Rental', icon: 'plus', to: '/rentals/new' },
  { label: 'Block Equipment', icon: 'package', unavailable: 'The Block dialog is not built yet' },
  { label: 'New Maintenance', icon: 'tool', to: '/inventory' },
  { label: 'View Conflicts', icon: 'alert_triangle', action: 'conflicts' },
]

/**
 * The event-marker key along the bottom of the render's timeline card. These
 * are *point* markers on a day, distinct from the bar kinds above.
 */
export const EVENT_MARKERS: CountRow[] = [
  { label: 'Pickup', value: 0, tone: 'var(--success-text)', icon: 'arrow_up' },
  { label: 'Return', value: 0, tone: 'var(--primary-text)', icon: 'arrow_down' },
  { label: 'Handover', value: 0, tone: 'var(--text2)', icon: 'crew' },
  { label: 'Return Session', value: 0, tone: 'var(--text2)', icon: 'return_arrow' },
  { label: 'Cleaning', value: 0, tone: 'var(--progress-text)', icon: 'refresh' },
  { label: 'Maintenance', value: 0, tone: 'var(--progress-text)', icon: 'tool' },
  { label: 'Sub-Rental Out', value: 0, tone: 'var(--ext-fg)', icon: 'external_link' },
  { label: 'Sub-Rental In', value: 0, tone: 'var(--ext-fg)', icon: 'return_arrow' },
  { label: 'Case Escalation', value: 0, tone: 'var(--danger-text)', icon: 'flag' },
  { label: 'Quote Expiry', value: 0, tone: 'var(--progress-text)', icon: 'timer' },
  { label: 'Payment Due', value: 0, tone: 'var(--danger-text)', icon: 'dollar', money: true },
]

export const SHORTCUTS: Array<{ key: string; label: string }> = [
  { key: 'F', label: 'Full Calendar' },
  { key: 'T', label: 'Today' },
  { key: 'R', label: 'Resource Timeline' },
  { key: '?', label: 'Shortcuts Help' },
]

/* ── selected event ────────────────────────────────────────────────────── */

/**
 * Detail for the one booking the render opens. Every date is an AD instant —
 * the panel renders BS above AD from `lib/bs.ts`, never from a stored string.
 */
export interface EventDetail {
  bookingNo: string
  status: string
  client: string
  project: string
  equipment: Array<{ name: string; code: string; icon: IconName }>
  pickup: { at: Date; time: string }
  return: { at: Date; time: string }
  handoverSession: { at: Date; time: string }
  returnSession: { at: Date; time: string }
  crew: string[]
  vehicle: string
  notes: string
}

export const EVENT_DETAIL: Record<string, EventDetail> = {
  'BK-2026-0715': {
    bookingNo: 'BK-2026-0715',
    status: 'On Rent',
    client: 'Himalayan Films',
    project: 'Documentary Project',
    equipment: [
      { name: 'Sony FX3', code: 'SN-CAM-0102', icon: 'camera' },
      { name: 'DJI RS 4 Pro', code: 'SN-GIM-0004', icon: 'tool' },
    ],
    pickup: { at: adDay(-1), time: '08:00' },
    return: { at: adDay(1), time: '18:00' },
    handoverSession: { at: adDay(-1), time: '07:00' },
    returnSession: { at: adDay(1), time: '19:00' },
    crew: ['Ramesh (DIT)', 'Sunil (Warehouse)', 'Anita (Driver)', 'Bikash (AC)', 'Prakash (Gaffer)'],
    vehicle: 'Camera Van (VH-01-BA-5920)',
    notes: 'Outdoor shoot in Dolpa. Weather dependent.',
  },
}

/** §8.2 — a booking is cancelled, never deleted, so no action here deletes. */
export const EVENT_ACTIONS: Array<{ label: string; icon: IconName; to?: string; unavailable?: string }> = [
  { label: 'Edit Booking', icon: 'file' },
  { label: 'Duplicate', icon: 'package', unavailable: 'Duplicate needs the booking draft flow' },
  { label: 'Move / Drag', icon: 'arrow_right', unavailable: 'Drag-to-reschedule is not wired yet' },
  { label: 'More Actions', icon: 'more_vert', unavailable: 'The booking action menu lives on the booking page' },
]
