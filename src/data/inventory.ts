import type { Kpi } from '../components/ui/Page'
import type { IconName } from '../components/ui/Icon'
import type { StatusKey } from '../lib/status'
import { rupees, grouped, type Paisa } from '../lib/money'
import type { Condition as UnitCondition } from './returnInspection'

/**
 * Inventory Workspace seed data.
 *
 * ⚠ **Spec-derived, then reconciled against the `Inventory.PNG` mockup.**
 * The mockup is an older generation: its sidebar is numbered, its Utilization
 * tile is purple and it says "customer". Those are corrected here and in
 * `Inventory.tsx`; the *structure* (six KPIs, filter rail, table columns,
 * toolbar, pagination) is followed.
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

/**
 * The dot the parent row draws beside each status in its breakdown. `On Rent`
 * uses a solid green *fill* token, so its text colour is white — unreadable as
 * a dot on a card. Text-safe equivalents only.
 */
export const INV_DOT: Record<InvStatus, string> = {
  'In Stock': 'var(--success-text)',
  Reserved: 'var(--primary-text)',
  Packed: 'var(--progress-text)',
  'On Rent': 'var(--success)',
  Returning: 'var(--success-text)',
  Inspection: 'var(--progress-text)',
  Cleaning: 'var(--progress-text)',
  Maintenance: 'var(--progress-text)',
  Missing: 'var(--danger-text)',
  Retired: 'var(--muted)',
}

/**
 * §5.5 — five conditions, five colours, and they are **the set Return &
 * Inspection already owns**: "the same set Return & Inspection v2.1 sets and
 * this page only displays." So the union is imported rather than re-declared —
 * a second local list is how `Poor` (which no spec defines) and a missing
 * `Lost` got into this file in the first place.
 */
export const CONDITIONS: readonly UnitCondition[] = ['Excellent', 'Good', 'Fair', 'Damaged', 'Lost'] as const
export type Condition = UnitCondition | 'Mixed'

/**
 * The mockup badges the Condition cell, so it is a badge here too.
 *
 * §5.5's table maps the five conditions onto `--green-600 · --blue-600 ·
 * --amber-600 · --red-600 · --gray-600` — which *are* Foundation §4.2's five
 * hues, reused. §4.2 caps the palette at five colours; it does not reserve them
 * for status alone, so there is no conflict to resolve here and nothing to
 * decide. Collapsing Excellent and Good onto one green is the specific defect
 * §0 #8 corrects: "the two most common values indistinguishable at a glance."
 */
export const CONDITION_TONE: Record<Condition, StatusKey> = {
  Excellent: 'in',
  Good: 'primary',
  Fair: 'progress',
  Damaged: 'danger',
  Lost: 'neutral',
  Mixed: 'neutral',
}

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

/**
 * ⛔ This check used to `throw`. A module-evaluation throw is **uncatchable** —
 * it runs while the module graph is still being built, before React mounts, so
 * no boundary exists to catch it and the operator gets a blank white screen
 * with nothing in it. `lib/money.ts` hit exactly this and fixed it by
 * *reporting* the failure instead of throwing; the same pattern is used here.
 *
 * The invariant still runs on every load — §4.3's "the chip row reconciles on
 * every load, or the numbers are not trusted" is not weakened. The failure is
 * exported so the screen can state it, and logged so a broken seed is never
 * silent even before a screen reads it.
 */
export const INVENTORY_SEED_ERROR: string | null =
  SUM_EXCL_RETIRED === TOTAL
    ? null
    : `Inventory chip counts do not reconcile: the status chips sum to ${SUM_EXCL_RETIRED}, but the All chip reads ${TOTAL}. §4.3 requires Σ status counts = Total, excluding Retired — see src/data/inventory.ts.`

if (INVENTORY_SEED_ERROR) console.error(INVENTORY_SEED_ERROR)

const chip = (label: 'All' | InvStatus) => CHIP_COUNTS.find((c) => c.label === label)?.count ?? 0
const pctOfTotal = (n: number) => `${((n / TOTAL) * 100).toFixed(1)}% of total`

/**
 * §4.4 / mockup — six KPIs across, in the mockup's order.
 *
 * The mockup's Reserved tile is **purple**; §4.2 bans the hue outright, so it
 * takes the primary blue instead. Every figure is read out of `CHIP_COUNTS`,
 * which is the set the reconciliation above guards — a KPI cannot drift away
 * from the chip it duplicates.
 */
export const KPIS: Kpi[] = [
  {
    label: 'Total Equipment',
    value: grouped(TOTAL),
    icon: 'box',
    accent: 'primary',
    delta: { direction: 'up', text: '+24 this month', good: true },
    note: 'Excludes retired',
  },
  { label: 'Available', value: grouped(chip('In Stock')), icon: 'checklist', accent: 'success', note: pctOfTotal(chip('In Stock')) },
  { label: 'On Rent', value: grouped(chip('On Rent')), icon: 'truck', accent: 'success', note: 'Across 128 bookings' },
  { label: 'Reserved', value: grouped(chip('Reserved')), icon: 'calendar', accent: 'primary', note: 'Upcoming bookings' },
  { label: 'Maintenance', value: grouped(chip('Maintenance')), icon: 'tool', accent: 'progress', note: 'Needs attention' },
  { label: 'Missing', value: grouped(chip('Missing')), icon: 'alert_triangle', accent: 'danger', note: 'Action required' },
]

export interface ChildRow {
  serial: string
  status: InvStatus
  booking: string
  location: string
  condition: Condition
  /**
   * §8 — Replacement Value, the figure a warehouse user needs when a unit is
   * lost or damaged. Integer paisa through `lib/money`, never a pre-formatted
   * string: §3.3 requires `Σ child replacement = parent replacement`, and a
   * string cannot be summed or checked.
   */
  replacement: Paisa

  /*
   * Asset Detail per-unit fields — declared, deliberately NOT seeded. See the
   * matching note on `ParentRow`; the same TODO(decision) governs them.
   */
  /** Physical tag stuck to the unit, distinct from the manufacturer serial. */
  assetTag?: string
  /** Metered running hours, where the unit reports them (cameras, generators). */
  usageHours?: number
  /** How many bookings this unit has been out on. */
  rentalCount?: number
  /** Accessories that belong to this unit rather than to the parent SKU. */
  childAccessories?: Array<{ id: string; name: string; quantity: number; required: boolean }>
  /** Last scan that saw this unit, AD. BS is rendered, never stored. */
  lastSeen?: Date
}

/** §3.1 — a parent states a *breakdown*, never one badge. */
export interface StatusCount {
  count: number
  status: InvStatus
}

export interface ParentRow {
  name: string
  category: string
  /** Serialised parents state units; non-serialised state `142 of 200`. */
  stock: string
  /** Non-serialised SKUs summarise by quantity; serialised, by unit. */
  breakdown: StatusCount[]
  bookings: string
  location: string
  /** §5.5 / §3.1 — the shared value, or `Mixed` where the children differ. */
  condition: Condition
  /** §8.2 — the sum of the children's. Paisa, so §3.3 can be checked. */
  replacement: Paisa
  /** §3.4 — non-serialised SKUs are a parent with no children. */
  children?: ChildRow[]

  /*
   * ── Asset Detail fields — declared, deliberately NOT seeded ──────────────
   *
   * `modules/inventory/AssetDetail.tsx` reads these. They are optional because
   * no row carries one yet: seeding them would mean inventing a purchase price,
   * a utilisation percentage and a recovery percentage per asset, which are
   * business facts nobody has supplied. The screen renders an honest gap where
   * a value is absent rather than a fabricated figure.
   *
   * TODO(decision) — PLAN.md §4: `Asset Detail.md` has no matching render in
   * `06 Inventory/`, so the field list is spec-only and unconfirmed. Settle the
   * source of `utilizationPct` and `recoveryPct` (derived from booking history,
   * or stored?) before seeding either.
   */
  /** Internal asset code, e.g. `EQ-00104`. Distinct from a unit's serial. */
  code?: string
  brand?: string
  /** Object-store key or data URI. No image is bundled with the seed. */
  image?: string
  /** True while the unit is on loan from a partner (§ Sub Rental). */
  isSubRented?: boolean
  /** Share of the period this asset was on rent. Derived, never typed. */
  utilizationPct?: number
  /** Share of purchase price recovered in rental income to date. */
  recoveryPct?: number
}

export const PARENTS: ParentRow[] = [
  {
    name: 'Sony FX6 Cinema Camera',
    category: 'Camera',
    stock: '3 units',
    breakdown: [
      { count: 1, status: 'In Stock' },
      { count: 1, status: 'Reserved' },
      { count: 1, status: 'On Rent' },
    ],
    bookings: '2 Active',
    location: 'Mixed',
    condition: 'Mixed',
    replacement: rupees(1260000),
    children: [
      { serial: 'FX6-0123', status: 'In Stock', booking: '—', location: 'Shelf A1', condition: 'Excellent', replacement: rupees(420000) },
      { serial: 'FX6-0124', status: 'Reserved', booking: 'BK-2026-0716', location: 'Shelf A1', condition: 'Excellent', replacement: rupees(420000) },
      { serial: 'FX6-0125', status: 'On Rent', booking: 'BK-2026-0710', location: 'With Client › Vision Production', condition: 'Good', replacement: rupees(420000) },
    ],
  },
  {
    name: 'RED Komodo X',
    category: 'Camera',
    stock: '2 units',
    breakdown: [
      { count: 1, status: 'Packed' },
      { count: 1, status: 'Inspection' },
    ],
    bookings: '1 Active',
    location: 'Mixed',
    condition: 'Excellent',
    replacement: rupees(1640000),
    children: [
      { serial: 'KMX-0041', status: 'Packed', booking: 'BK-2026-0715', location: 'Prep Bay 2', condition: 'Excellent', replacement: rupees(820000) },
      { serial: 'KMX-0042', status: 'Inspection', booking: '—', location: 'Return QC', condition: 'Excellent', replacement: rupees(820000) },
    ],
  },
  {
    name: 'NISI Athena Prime Set',
    category: 'Lens',
    stock: '3 units',
    breakdown: [
      { count: 2, status: 'On Rent' },
      { count: 1, status: 'Cleaning' },
    ],
    bookings: '2 Active',
    location: 'Mixed',
    // §5.5 — children read Good · Good · Fair, so the parent is Mixed.
    condition: 'Mixed',
    replacement: rupees(960000),
    children: [
      { serial: 'ATH-0011', status: 'On Rent', booking: 'BK-2026-0710', location: 'With Client › Vision Production', condition: 'Good', replacement: rupees(320000) },
      { serial: 'ATH-0012', status: 'On Rent', booking: 'BK-2026-0713', location: 'With Client › Mirage Weddings', condition: 'Good', replacement: rupees(320000) },
      { serial: 'ATH-0013', status: 'Cleaning', booking: '—', location: 'Cleaning Bay', condition: 'Fair', replacement: rupees(320000) },
    ],
  },
  {
    name: 'Aputure 600D Pro',
    category: 'Lighting',
    stock: '4 units',
    breakdown: [
      { count: 2, status: 'In Stock' },
      { count: 1, status: 'Returning' },
      { count: 1, status: 'Maintenance' },
    ],
    bookings: '1 Active',
    location: 'Mixed',
    condition: 'Mixed',
    replacement: rupees(680000),
    children: [
      { serial: 'AP6-0201', status: 'In Stock', booking: '—', location: 'Shelf C3', condition: 'Excellent', replacement: rupees(170000) },
      { serial: 'AP6-0202', status: 'In Stock', booking: '—', location: 'Shelf C3', condition: 'Good', replacement: rupees(170000) },
      { serial: 'AP6-0203', status: 'Returning', booking: 'BK-2026-0711', location: 'With Client › Inside Out Films', condition: 'Good', replacement: rupees(170000) },
      { serial: 'AP6-0204', status: 'Maintenance', booking: '—', location: 'Repair Bench', condition: 'Damaged', replacement: rupees(170000) },
    ],
  },
  {
    name: 'DJI Ronin 4D',
    category: 'Support',
    stock: '2 units',
    breakdown: [
      { count: 1, status: 'In Stock' },
      { count: 1, status: 'Missing' },
    ],
    bookings: '—',
    location: 'Mixed',
    condition: 'Mixed',
    replacement: rupees(1100000),
    children: [
      { serial: 'DR4D-0004', status: 'In Stock', booking: '—', location: 'Shelf B2', condition: 'Excellent', replacement: rupees(550000) },
      { serial: 'DR4D-0005', status: 'Missing', booking: '—', location: 'Unaccounted', condition: 'Damaged', replacement: rupees(550000) },
    ],
  },
  {
    // §3.4 — non-serialised SKU: no children, quantity-based stock and status.
    name: 'BNC Cable 3m',
    category: 'Accessory',
    stock: '142 of 200',
    breakdown: [
      { count: 130, status: 'In Stock' },
      { count: 12, status: 'On Rent' },
    ],
    bookings: '4 Active',
    location: 'Bin D4',
    condition: 'Good',
    replacement: rupees(60000),
  },
  {
    name: 'Sennheiser MKH 416',
    category: 'Audio',
    stock: '3 units',
    breakdown: [
      { count: 2, status: 'In Stock' },
      { count: 1, status: 'Reserved' },
    ],
    bookings: '1 Active',
    location: 'Mixed',
    // §5.5 — children read Excellent · Excellent · Good, so the parent is Mixed.
    condition: 'Mixed',
    replacement: rupees(390000),
    children: [
      { serial: 'MKH-0301', status: 'In Stock', booking: '—', location: 'Shelf D1', condition: 'Excellent', replacement: rupees(130000) },
      { serial: 'MKH-0302', status: 'In Stock', booking: '—', location: 'Shelf D1', condition: 'Excellent', replacement: rupees(130000) },
      { serial: 'MKH-0303', status: 'Reserved', booking: 'BK-2026-0718', location: 'Shelf D1', condition: 'Good', replacement: rupees(130000) },
    ],
  },
  {
    name: 'Core SWX NANO Micro 98',
    category: 'Power',
    stock: '86 of 96',
    breakdown: [
      { count: 60, status: 'In Stock' },
      { count: 26, status: 'On Rent' },
    ],
    bookings: '6 Active',
    location: 'Drawer D1',
    condition: 'Good',
    replacement: rupees(240000),
  },
]

/**
 * The mockup puts a product photograph in the first column. The catalogue
 * carries no image field, so the tile falls back to the category's glyph rather
 * than to a broken-image box.
 */
export const CATEGORY_ICON: Record<string, IconName> = {
  Camera: 'camera',
  Lens: 'photo',
  Lighting: 'sparkles',
  Audio: 'headset',
  Power: 'battery',
  Support: 'box',
  Accessory: 'package',
}

/* ── facets ────────────────────────────────────────────────────────────── */

export type FacetKey = 'Category' | 'Status' | 'Location' | 'Condition' | 'Booking' | 'Serialisation'

export function statusesOf(p: ParentRow): InvStatus[] {
  return p.breakdown.map((b) => b.status)
}

export function locationsOf(p: ParentRow): string[] {
  return p.children?.length ? Array.from(new Set(p.children.map((c) => c.location))) : [p.location]
}

export function conditionsOf(p: ParentRow): Condition[] {
  return p.children?.length ? Array.from(new Set(p.children.map((c) => c.condition))) : [p.condition]
}

export function bookingStateOf(p: ParentRow): string {
  return p.bookings === '—' ? 'No active booking' : 'Linked to a booking'
}

export function serialisationOf(p: ParentRow): string {
  return p.children?.length ? 'Serialised' : 'Non-serialised'
}

export function unitCountOf(p: ParentRow): number {
  return p.breakdown.reduce((a, b) => a + b.count, 0)
}

const uniqueSorted = (xs: string[]) => Array.from(new Set(xs)).sort((a, b) => a.localeCompare(b))

export const CATEGORY_OPTIONS = uniqueSorted(PARENTS.map((p) => p.category))
export const STATUS_OPTIONS = (Object.keys(INV_STYLE) as InvStatus[]).filter((s) =>
  PARENTS.some((p) => statusesOf(p).includes(s)),
)
export const LOCATION_OPTIONS = uniqueSorted(PARENTS.flatMap(locationsOf))
export const CONDITION_OPTIONS = uniqueSorted(PARENTS.flatMap(conditionsOf))

/**
 * The mockup's filter rail, row for row.
 *
 * Seven of its twelve groups filter on catalogue fields this build does not
 * store — brand, warehouse, case, supplier, purchase date, purchase value,
 * tags. They are kept in place, in the mockup's order, but rendered inert with
 * the reason stated: a control that looks live and does nothing is worse than
 * one that says why it cannot.
 */
export type RailRow =
  | { kind: 'live'; key: FacetKey; label: string; icon: IconName; options: readonly string[] }
  | { kind: 'blocked'; label: string; icon: IconName; reason: string; money?: true }

export const FILTER_RAIL: RailRow[] = [
  { kind: 'live', key: 'Category', label: 'Category', icon: 'queues', options: CATEGORY_OPTIONS },
  { kind: 'blocked', label: 'Brand', icon: 'flag', reason: 'The catalogue has no brand field yet.' },
  { kind: 'live', key: 'Status', label: 'Status', icon: 'activity', options: STATUS_OPTIONS },
  { kind: 'live', key: 'Location', label: 'Location', icon: 'package', options: LOCATION_OPTIONS },
  { kind: 'blocked', label: 'Warehouse', icon: 'home', reason: 'Multi-warehouse is not modelled in this build.' },
  { kind: 'blocked', label: 'Case', icon: 'box', reason: 'Case membership lives on the Cases tab, not on the item.' },
  { kind: 'live', key: 'Booking', label: 'Booking', icon: 'calendar', options: ['Linked to a booking', 'No active booking'] },
  { kind: 'blocked', label: 'Supplier', icon: 'truck', reason: 'Suppliers arrive with Sub Rental, which is blocked on open decisions.' },
  { kind: 'blocked', label: 'Purchase Date', icon: 'calendar_event', reason: 'Purchase records are not part of the equipment seed.' },
  { kind: 'blocked', label: 'Purchase Value', icon: 'dollar', reason: 'Purchase records are not part of the equipment seed.', money: true },
  { kind: 'live', key: 'Condition', label: 'Condition', icon: 'eye', options: CONDITION_OPTIONS },
  { kind: 'live', key: 'Serialisation', label: 'Serialisation', icon: 'checklist', options: ['Serialised', 'Non-serialised'] },
  { kind: 'blocked', label: 'Tags', icon: 'flag', reason: 'Tagging is not built.' },
  { kind: 'blocked', label: 'Saved Views', icon: 'file', reason: 'Saved views are not built.' },
]

export function facetValuesOf(p: ParentRow, key: FacetKey): string[] {
  switch (key) {
    case 'Category':
      return [p.category]
    case 'Status':
      return statusesOf(p)
    case 'Location':
      return locationsOf(p)
    case 'Condition':
      return conditionsOf(p)
    case 'Booking':
      return [bookingStateOf(p)]
    case 'Serialisation':
      return [serialisationOf(p)]
  }
}

/* ── table controls ────────────────────────────────────────────────────── */

export const SORTS = [
  'Equipment A–Z',
  'Equipment Z–A',
  'Category A–Z',
  'Units, most first',
  'Needs attention first',
] as const
export type SortKey = (typeof SORTS)[number]

/** Missing first, then Maintenance, then everything calm. */
const ATTENTION: Partial<Record<InvStatus, number>> = { Missing: 3, Maintenance: 2, Inspection: 1, Cleaning: 1 }

export function attentionScore(p: ParentRow): number {
  return p.breakdown.reduce((a, b) => a + (ATTENTION[b.status] ?? 0) * b.count, 0)
}

export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const
