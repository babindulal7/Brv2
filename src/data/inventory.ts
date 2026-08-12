import type { IconName } from '../components/ui/Icon'
import type { IntelField, IntelGlance, IntelGroup } from '../components/ui/IntelCard'
import type { StatusKey } from '../lib/status'
import { rupees, formatMoney, grouped, type Paisa } from '../lib/money'
import { canViewMoneyField } from '../lib/fieldGating'
import type { GateContext } from '../lib/fieldGating'
import type { Database } from '../types/supabase'
import type { InventoryListRow, InventoryUnitRow } from '../lib/queries/inventory'
import type { Condition as UnitCondition } from './returnInspection'

/* ── The database's own vocabularies ──────────────────────────────────────────
 *
 * Every list this screen offers as a filter option is the value domain of a real
 * column, so each one is declared against the GENERATED enum rather than derived
 * from the eight hand-typed `PARENTS` rows below. Derived options are how the
 * Category facet came to offer seven values for a seventeen-member enum.
 *
 * ⚠ These are **type-only** imports of `lib/queries/inventory`. That is
 * deliberate and must stay that way: a value import would pull `lib/supabase`
 * into every consumer of this file — `NewRental.tsx`, `itemCatalogue.ts`,
 * `addEquipment.ts`, `pulse.ts`, `rackIntel.ts`, `AssetDetail.tsx` — and
 * `lib/supabase.ts` THROWS at import time when the env vars are absent. The
 * filter-set builder that does need those values lives in `Inventory.tsx`.
 */
type InventoryStateDb = Database['public']['Enums']['inventory_state']
type UnitConditionDb = Database['public']['Enums']['unit_condition']
type TrackingModeDb = Database['public']['Enums']['product_tracking_mode']
type ProductCategoryDb = Database['public']['Enums']['product_category']

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
 * The ten statuses in the order the chip row and every breakdown render them.
 *
 * It is `INV_STYLE`'s key order rather than a twelfth hand-typed list, and that
 * is not a saving — `INV_STYLE` is a `Record<InvStatus, …>`, so the compiler
 * already refuses a missing or misspelled member, and there is no second list to
 * drift. The order it happens to carry IS `inventory_state`'s declaration order
 * (`0001_enums.sql:527-538`), which the `satisfies` below half-checks: it proves
 * every status here is a real member of the enum. The other half — that the enum
 * has no member this list omits — cannot be checked from a type, so
 * `__tests__/inventoryList.test.ts` pins it against `INVENTORY_STATES` in
 * `lib/queries/inventory.ts`, which is generated-type-checked in both
 * directions.
 */
export const INV_ORDER = (Object.keys(INV_STYLE) as InvStatus[]) satisfies readonly InventoryStateDb[]

/**
 * Status → the tone its glance dot and avatar wear.
 *
 * ⚠ `data/equipmentIntel.ts:20-31` holds a byte-identical PRIVATE copy of this
 * map, built for the `ParentRow` mock path. It is not exported, so this is a
 * second copy rather than a reuse. Both should collapse into this one when the
 * mock path is deleted; until then a change to either must be made to both.
 */
export const INV_TONE: Record<InvStatus, StatusKey> = {
  'In Stock': 'in',
  Reserved: 'primary',
  Packed: 'progress',
  'On Rent': 'out',
  Returning: 'in',
  Inspection: 'progress',
  Cleaning: 'progress',
  Maintenance: 'progress',
  Missing: 'danger',
  Retired: 'neutral',
}

/**
 * Worst-first, so a glance dot never reads "healthy" over a Missing unit.
 * Same ordering `equipmentIntel.ts:34` applies to the mock rows.
 */
const ALARM_ORDER: readonly InvStatus[] = [
  'Missing',
  'Maintenance',
  'Inspection',
  'Cleaning',
  'Reserved',
  'Packed',
  'On Rent',
  'In Stock',
  'Returning',
  'Retired',
]

/**
 * §5.5 — five conditions, five colours, and they are **the set Return &
 * Inspection already owns**: "the same set Return & Inspection v2.1 sets and
 * this page only displays." So the union is imported rather than re-declared —
 * a second local list is how `Poor` (which no spec defines) and a missing
 * `Lost` got into this file in the first place.
 */
export const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Damaged', 'Lost'] as const satisfies readonly (UnitCondition &
  UnitConditionDb)[]
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

/**
 * `07_INVENTORY.md` line 3 — **Equipment · Bundles · Stock Check · Maintenance.**
 *
 * Line 4 disposes of the rest in prose, which is what makes these removals real
 * rather than an omission in an ASCII box (`WIREFRAME_RULINGS_2026-08-12.md` §1):
 *
 *  - *"Sub-Rental and Cases dropped as duplicates"* — both were tabs here and
 *    both keep their own routes (`/operations/sub-rental`, `/operations/cases`).
 *    Nothing is deleted; they simply stop being reachable twice.
 *  - *"Warehouses moved to Settings"* — see the note on
 *    `modules/inventory/Warehouses.tsx`. The file and its route stay put.
 *  - Purchase Requests is *"archived"* (line 5). Its screen leaves Inventory's
 *    surface; `/inventory/purchase-requests` still resolves and the table and
 *    the auto-draft rule stay in the schema, untouched.
 *
 * The first tab is **Equipment**, not "Inventory": the page is Inventory, the
 * tab is what it lists. Matches `data/nav.ts`'s `SPEC_TABS['/inventory']`,
 * which `data/nav.test.ts:236` pins.
 */
export const TABS = ['Equipment', 'Bundles', 'Stock Check', 'Maintenance'] as const
export type InventoryTab = (typeof TABS)[number]

/**
 * The tab in the URL.
 *
 * §7.2/§7.3/§7.4 each draw a breadcrumb (`Inventory ▸ Bundles`) and §7.3's phone
 * panel draws a page header, neither of which a tab pane with only local state
 * can carry — and three files already deep-link into this screen
 * (`data/caseIntel.ts:202`, `data/rackIntel.ts:197`,
 * `modules/reports/ProductReports.tsx:452`). A query parameter resolves both:
 * `/inventory?tab=stock-check` is a real address, so it can be linked, shared,
 * bookmarked and crumbed, and the route table does not gain four entries.
 *
 * `/inventory/stock-check` and `/inventory/purchase-requests` remain routes in
 * `App.tsx` and are deliberately NOT redirected here — those three deep links
 * must keep resolving.
 */
export const TAB_SLUG: Record<InventoryTab, string> = {
  Equipment: 'equipment',
  Bundles: 'bundles',
  'Stock Check': 'stock-check',
  Maintenance: 'maintenance',
}

/** `?tab=` → the tab, or `Equipment` for a missing or unknown value. */
export function tabFromSlug(slug: string | null): InventoryTab {
  return TABS.find((t) => TAB_SLUG[t] === slug) ?? 'Equipment'
}

/* ── the word on screen ──────────────────────────────────────────────────── */

/**
 * Status → the word the operator reads.
 *
 * §7.1's chip row says `(Available)`; `Bundles.tsx:483` already cites a ruling
 * for the other tab in this same page — *"`Availables` is not a word. The card
 * is Available, matching its chip"* — and `CONFLICTS.md` §07.4 records the
 * defect: **two words for one state, inside one page.** The word is now
 * `Available` on both tabs.
 *
 * ⚠ **The union member is not renamed, and must not be.** `InvStatus` is pinned
 * to the generated `inventory_state` enum by the `satisfies` on `INV_ORDER`
 * below, `'In Stock'` is that enum's first member (`0001_enums.sql:527`), and
 * the value travels to Postgres verbatim through
 * `lib/queries/inventory.ts`'s `UNIT_STATE_COLUMN` filters. Renaming the member
 * would send `'Available'` to a real Postgres enum and earn a `22P02` on every
 * chip press — and it would break six files this module does not own
 * (`itemCatalogue.ts`, `NewRental.tsx`, `AddItemPanel.tsx`, `equipmentIntel.ts`,
 * `lib/queries/inventory.ts`, `lib/booqable/map/stock.ts`), each of which
 * compares against the enum value rather than a label.
 *
 * So the rename is at the render boundary, where the conflict actually lives:
 * one word on screen, one value on the wire. Everything that prints a status —
 * badge, dot breakdown, chip, KPI label, CSV column — goes through here.
 */
export const INV_LABEL: Record<InvStatus, string> = {
  'In Stock': 'Available',
  Reserved: 'Reserved',
  Packed: 'Packed',
  'On Rent': 'On Rent',
  Returning: 'Returning',
  Inspection: 'Inspection',
  Cleaning: 'Cleaning',
  Maintenance: 'Maintenance',
  Missing: 'Missing',
  Retired: 'Retired',
}

/** The label for any status, including the ones a caller holds as a raw enum value. */
export function invLabel(status: InvStatus): string {
  return INV_LABEL[status]
}

/* ── §7.1's six chips ────────────────────────────────────────────────────── */

/**
 * `(All)(Available)(On Rent)(Maintenance)(Damaged)(Missing)`.
 *
 * **`Damaged` is a CONDITION, not a status**, and this is the whole reason the
 * row is a discriminated union rather than a list of `InvStatus`:
 *
 *  - `lib/workflow.ts:141` — *"A condition on the Returned quantity, never added
 *    to the total."*
 *  - `data/inventory.ts` asserted `Σ status counts = Total` for as long as it
 *    counted; a chip row mixing a condition into a status count cannot reconcile.
 *  - `WIREFRAME_RULINGS_2026-08-12.md` §7 rules it outright: *"Filter facet on
 *    Condition. Do **not** add a `Damaged` status enum member."*
 *
 * So the Damaged chip drives the **Condition** facet the filter rail already
 * carries (`FILTER_RAIL`'s `Condition` row, `CONDITIONS`), over
 * `UNIT_CONDITION_COLUMN`. It is a second dimension over the same units, which
 * is exactly what `lib/queries/inventory.ts:475` says two aliases mean: *"has an
 * In Stock unit, and has a Damaged unit"* — not one unit that is both.
 *
 * TODO(decision) — the spec's six chips silently retire six live statuses:
 * Reserved, Packed, Returning, Inspection, Cleaning and Retired. All six are
 * written by the Status Engine from workspace events and all six stay in the
 * model and in the filter rail's Status facet, per `CONFLICTS.md` §07.3
 * ("If they are removed, that is a Status Engine change, not an Inventory screen
 * change"). Whether the chip row is meant to be the *complete* status vocabulary
 * on this screen, or a shortcut over a rail that still offers all ten, is not
 * ruled anywhere. Not resolved here.
 */
export type EquipmentChip =
  | { kind: 'all'; label: 'All' }
  | { kind: 'status'; label: string; status: InvStatus }
  | { kind: 'condition'; label: string; condition: (typeof CONDITIONS)[number] }

export const EQUIPMENT_CHIPS: readonly EquipmentChip[] = [
  { kind: 'all', label: 'All' },
  { kind: 'status', label: INV_LABEL['In Stock'], status: 'In Stock' },
  { kind: 'status', label: INV_LABEL['On Rent'], status: 'On Rent' },
  { kind: 'status', label: INV_LABEL.Maintenance, status: 'Maintenance' },
  { kind: 'condition', label: 'Damaged', condition: 'Damaged' },
  { kind: 'status', label: INV_LABEL.Missing, status: 'Missing' },
]

/** Stable key for a chip — the label is not unique across the two dimensions. */
export function chipKey(c: EquipmentChip): string {
  return c.kind === 'all' ? 'all' : c.kind === 'status' ? `status:${c.status}` : `condition:${c.condition}`
}

/* ── ⛔ `CHIP_COUNTS`, `INVENTORY_SEED_ERROR` and `KPIS` were deleted here ─────
 *
 * They were eleven hardcoded integers summing to 2486, plus six KPI strings read
 * out of them, rendered above a table of eight hand-typed rows carrying
 * seventeen units. The reconciliation between them (`Σ status counts = Total,
 * excluding Retired`) held perfectly — because both sides were typed by the same
 * hand. It said nothing about the catalogue.
 *
 * A fleet-wide count per status is `select status, count(*) from product_units_v
 * group by status`. That is an AGGREGATE over the whole table, and no function in
 * `lib/queries/inventory.ts` returns one: `withCount` counts matching PRODUCTS,
 * and `InventoryListRow.unitsByState` is one row's own units. So there are two
 * honest options and no third — count something real, or count nothing — and
 * this build takes one of each:
 *
 *  - **The chips carry no count.** A chip is a filter now. Putting a product
 *    count on it would also break §4.3's invariant rather than satisfy it: a
 *    model with an In Stock unit AND an On Rent unit is counted under both
 *    chips, so the chips would sum to more than the catalogue holds.
 *  - **The KPI strip counts MODELS**, from six real count queries, and every
 *    card says so in its own note. `INVENTORY_KPI_FILTERS` in `Inventory.tsx`
 *    holds them.
 *
 * TODO(persistence): a `product_unit_counts` view (`product_id, status,
 * count(*)`) makes the unit figures — and the two blocked sorts below — real.
 */

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

  /* ---- Hover Intel System v2.1 (9 Aug 2026) additions --------------- */
  /** §2 Identity: "internal ref + manufacturer serial" [RM] — distinct from `serial` above, which is the manufacturer's. e.g. `CAM-003` beside `SN 41213`. */
  internalRef?: string
  /** §2 State: "clean/tested/battery chips · Unverified (Stock Check)". */
  flags?: Array<'Clean' | 'Tested' | 'Battery OK' | 'Unverified'>
  /** §2 History: "every BR#, client, dates, days out". Not seeded for most units — same reasoning as `usageHours` above, this is a real business record nobody has supplied for the mock layer yet. */
  history?: Array<{ bookingNo: string; client: string; ad: string; days: number }>
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
  /**
   * The rental rate New Booking's equipment picker reads — this catalogue
   * previously carried no price at all (replacement value is a different
   * figure: what the item costs to replace, not what it rents for). Every
   * row below is seeded; optional only so a future SKU without a set rate
   * yet doesn't need a fabricated number to type-check.
   */
  dailyRatePaisa?: Paisa
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

  /* ---- Hover Intel System v2.1 (9 Aug 2026) additions ----------------
   * Unlike `utilizationPct`/`recoveryPct` above, these are not derived
   * figures awaiting a computation-source ruling — they are facts (a
   * purchase price paid, a warranty card, a supplier name) that simply
   * were not part of the original Asset Detail seed. Safe to seed
   * directly; still optional and left unseeded on most rows. */
  supplier?: string
  purchasePricePaisa?: Paisa
  warranty?: { status: 'Active' | 'Expired' | 'None'; expiryAd?: string }
  lastServiceAd?: string
  nextServiceDueAd?: string
  maintenanceTicketsOpen?: number
  damageCasesOpen?: number
  /** §2 Structure: "parent bundle(s) it belongs to" / "substitutes of same type". */
  bundles?: string[]
  substitutes?: string[]

  /* ---- Money tab + history — flagged during Hover Intel v2.1 review, fixed
   * 9 Aug 2026 ---------------------------------------------------------
   * `AssetDetail.tsx`'s Money/Maintenance/Activity tabs rendered the same
   * hardcoded figures for every asset. Like `utilizationPct`/`recoveryPct`
   * above, these four need a computation source nothing in this build
   * provides yet, not just a missing seed value — declared and left
   * unseeded rather than invented. TODO(decision) — PLAN.md §4.9. */
  /** Total rental income this asset has generated. Needs a revenue engine
   * summing `booking_lines`/payments per asset; nothing aggregates that today. */
  lifetimeEarningsPaisa?: Paisa
  /** Cumulative cost of every repair recorded against this asset.
   * `maintenanceTicketsOpen` above counts open tickets — it was never costed. */
  repairsToDatePaisa?: Paisa
  /** Per-event service record. Distinct from `lastServiceAd`/`nextServiceDueAd`
   * above, which are summary facts with no backing event log. */
  serviceHistory?: Array<{ dateAd: string; unit: string; type: string; details: string; costPaisa: Paisa; downtime: string; tech: string }>
  /** Immutable per-asset audit trail (stock checks, QC passes, dispatches,
   * resets). No audit-log engine exists yet to populate this. */
  activityLog?: Array<{ whenAd: string; event: string; by: string; note: string }>
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
    dailyRatePaisa: rupees(6000),
    purchasePricePaisa: rupees(1350000),
    warranty: { status: 'Active', expiryAd: '14 Feb 2027' },
    lastServiceAd: '02 Jun 2026',
    nextServiceDueAd: '02 Dec 2026',
    bundles: ['FX6 Documentary Kit'],
    substitutes: ['Sony FX3', 'Canon C300 Mark III'],
    children: [
      { serial: 'FX6-0123', internalRef: 'CAM-014', status: 'In Stock', booking: '—', location: 'Shelf A1', condition: 'Excellent', replacement: rupees(420000), flags: ['Clean', 'Tested', 'Battery OK'] },
      { serial: 'FX6-0124', internalRef: 'CAM-015', status: 'Reserved', booking: 'B-716', location: 'Shelf A1', condition: 'Excellent', replacement: rupees(420000), flags: ['Clean', 'Tested'] },
      {
        serial: 'FX6-0125',
        internalRef: 'CAM-016',
        status: 'On Rent',
        booking: 'B-710',
        location: 'With Client › Vision Production',
        condition: 'Good',
        replacement: rupees(420000),
        history: [
          { bookingNo: 'B-710', client: 'Vision Production', ad: '17 Jul 2026', days: 5 },
          { bookingNo: 'B-698', client: 'Kathmandu Cinema Works', ad: '02 Jul 2026', days: 3 },
        ],
      },
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
    // '0 Active' — the child unit below no longer claims B-715 (that
    // booking's real equipment, per data/booking.ts and 4 other workflow
    // files, is the Sony FX3 / FX3 Documentary Package, not this camera).
    bookings: '0 Active',
    location: 'Mixed',
    condition: 'Excellent',
    replacement: rupees(1640000),
    dailyRatePaisa: rupees(12000),
    purchasePricePaisa: rupees(1750000),
    warranty: { status: 'Expired', expiryAd: '30 Apr 2026' },
    lastServiceAd: '11 May 2026',
    nextServiceDueAd: '11 Nov 2026',
    maintenanceTicketsOpen: 0,
    damageCasesOpen: 1,
    substitutes: ['Sony FX6 Cinema Camera'],
    children: [
      { serial: 'KMX-0041', internalRef: 'CAM-021', status: 'Packed', booking: '—', location: 'Prep Bay 2', condition: 'Excellent', replacement: rupees(820000), flags: ['Clean', 'Tested', 'Battery OK'] },
      { serial: 'KMX-0042', internalRef: 'CAM-022', status: 'Inspection', booking: '—', location: 'Return QC', condition: 'Excellent', replacement: rupees(820000), flags: ['Unverified'] },
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
    dailyRatePaisa: rupees(4500),
    isSubRented: true,
    supplier: 'Kathmandu Lens Collective',
    bundles: ['Athena Cine Package'],
    children: [
      { serial: 'ATH-0011', internalRef: 'LNS-007', status: 'On Rent', booking: 'B-710', location: 'With Client › Vision Production', condition: 'Good', replacement: rupees(320000) },
      { serial: 'ATH-0012', internalRef: 'LNS-008', status: 'On Rent', booking: 'B-713', location: 'With Client › Mirage Weddings', condition: 'Good', replacement: rupees(320000) },
      { serial: 'ATH-0013', internalRef: 'LNS-009', status: 'Cleaning', booking: '—', location: 'Cleaning Bay', condition: 'Fair', replacement: rupees(320000) },
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
    dailyRatePaisa: rupees(1700),
    children: [
      { serial: 'AP6-0201', status: 'In Stock', booking: '—', location: 'Shelf C3', condition: 'Excellent', replacement: rupees(170000) },
      { serial: 'AP6-0202', status: 'In Stock', booking: '—', location: 'Shelf C3', condition: 'Good', replacement: rupees(170000) },
      { serial: 'AP6-0203', status: 'Returning', booking: 'B-711', location: 'With Client › Inside Out Films', condition: 'Good', replacement: rupees(170000) },
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
    dailyRatePaisa: rupees(4500),
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
    dailyRatePaisa: rupees(50),
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
    dailyRatePaisa: rupees(1800),
    children: [
      { serial: 'MKH-0301', status: 'In Stock', booking: '—', location: 'Shelf D1', condition: 'Excellent', replacement: rupees(130000) },
      { serial: 'MKH-0302', status: 'In Stock', booking: '—', location: 'Shelf D1', condition: 'Excellent', replacement: rupees(130000) },
      { serial: 'MKH-0303', status: 'Reserved', booking: 'B-718', location: 'Shelf D1', condition: 'Good', replacement: rupees(130000) },
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
    dailyRatePaisa: rupees(300),
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

/**
 * The four facets that reach a column.
 *
 * ⛔ `'Location'` and `'Booking'` were live members of this union and are not
 * any more. Both filtered the eight mock rows perfectly and neither survives
 * contact with the schema — see `FILTER_RAIL` for each one's reason. They are
 * still rendered, still in the mockup's position, and now say why they cannot
 * run instead of quietly filtering a page.
 */
export type FacetKey = 'Category' | 'Status' | 'Condition' | 'Serialisation'

const uniqueSorted = (xs: string[]) => Array.from(new Set(xs)).sort((a, b) => a.localeCompare(b))

/**
 * ⚠ Derived from the eight mock rows, and still exported ONLY because
 * `modules/rentals/booking/itemCatalogue.ts:59,436` composes it into New
 * Booking's own category list. The Inventory rail no longer uses it: seven
 * values derived from eight hand-typed rows are not the value domain of
 * `inventory_categories.name`, which is the seventeen-member `product_category`
 * enum. `PRODUCT_CATEGORIES` below is what the facet offers.
 */
export const CATEGORY_OPTIONS = uniqueSorted(PARENTS.map((p) => p.category))

/**
 * `product_category`, all seventeen members (`0001_enums.sql:484-502`).
 *
 * Written as a `Record<ProductCategoryDb, true>` and then keyed, rather than as
 * an array with a `satisfies`, because a Record is exhaustive in BOTH
 * directions: a member the enum gains and this list lacks is a compile error,
 * and so is a value here the enum does not have. An array could only ever prove
 * the second. `Object.keys` preserves declaration order, which is the enum's
 * own — a more useful sequence for a facet than alphabetical, and the same one
 * `order=category(name).asc` produces.
 *
 * Nine of the seventeen have no `CATEGORY_ICON` entry and fall back to the box
 * glyph. That is a missing icon, not a missing category.
 */
const CATEGORY_PRESENT: Record<ProductCategoryDb, true> = {
  Camera: true,
  Lens: true,
  Lighting: true,
  Grip: true,
  Support: true,
  Audio: true,
  Drone: true,
  Monitor: true,
  Power: true,
  Media: true,
  Computing: true,
  Case: true,
  Bag: true,
  Accessory: true,
  Consumable: true,
  Vehicle: true,
  Other: true,
}
export const PRODUCT_CATEGORIES = Object.keys(CATEGORY_PRESENT) as ProductCategoryDb[]

/**
 * `product_tracking_mode` (`0001_enums.sql:505-509`).
 *
 * ⛔ The rail used to offer two values, `Serialised | Non-serialised`, derived
 * from whether a mock row had children. The column has THREE, and
 * "Non-serialised" is two of them glued together — a Consumable and a
 * Quantity-tracked SKU are different things to the schema, and the facet now
 * says which one it means.
 */
const TRACKING_PRESENT: Record<TrackingModeDb, true> = { Serialised: true, Quantity: true, Consumable: true }
export const TRACKING_MODES = Object.keys(TRACKING_PRESENT) as TrackingModeDb[]

/**
 * The mockup's filter rail, row for row — fourteen groups, four of them live.
 *
 * Every `reason` below was rewritten on 12 Aug 2026, because ten of the twelve
 * old ones were **factually wrong about the schema** and would have sent the
 * next reader looking for a column that has been there since migration 0004:
 * "The catalogue has no brand field yet" (`products.brand` is `text not null`,
 * 0004:90), "Multi-warehouse is not modelled" (`product_units.warehouse_id`,
 * 0004:203), "Purchase records are not part of the equipment seed"
 * (`products.purchase_date` 0004:102, `products_v.purchase_price` 0048:616).
 *
 * The columns exist. What is missing is different in each case, and each row now
 * names its own blocker, because "no data" and "no query for the data" are
 * different problems with different fixes:
 *
 *  - **a distinct-value list** (Brand) — the facet needs the SET of brands in
 *    the catalogue. `listInventory` filters; nothing enumerates.
 *  - **a name for a uuid** (Warehouse, Case, Supplier) — the column holds an
 *    id, the rail must show a name, and no query joins those tables.
 *  - **a control this rail does not have** (Purchase Date, Purchase Value) —
 *    both are ranges. `RailRow` models a checkbox list and nothing else.
 *  - **more than one column** (Location) — the schema splits the idea five ways.
 *  - **three joins** (Booking) — a second query, not a facet.
 *  - **genuinely nothing** (Tags, Saved Views) — no column in any of the 54
 *    migrations.
 */
export type RailRow =
  | { kind: 'live'; key: FacetKey; label: string; icon: IconName; options: readonly string[] }
  | { kind: 'blocked'; label: string; icon: IconName; reason: string; money?: true }

export const FILTER_RAIL: RailRow[] = [
  { kind: 'live', key: 'Category', label: 'Category', icon: 'queues', options: PRODUCT_CATEGORIES },
  {
    kind: 'blocked',
    label: 'Brand',
    icon: 'flag',
    reason:
      'products.brand is a real column (0004:90) — what is missing is the list of brands to tick. That is a distinct-value query, and lib/queries/inventory.ts filters the catalogue rather than enumerating it.',
  },
  { kind: 'live', key: 'Status', label: 'Status', icon: 'activity', options: INV_ORDER },
  {
    kind: 'blocked',
    label: 'Location',
    icon: 'package',
    reason:
      'The database splits location across product_units.rack, .shelf and .bin plus warehouse_id and storage_zone_id (0004:203-207). A single free-text value like “Shelf A1” maps onto no one of them, and deciding it means shelf=“A1” rather than rack=“Shelf A1” would be an invention. Every unit shows its own rack · shelf · bin when the row is expanded.',
  },
  {
    kind: 'blocked',
    label: 'Warehouse',
    icon: 'home',
    reason:
      'product_units.warehouse_id exists (0004:203), but it is a uuid and this rail must offer warehouse NAMES. No query joins warehouses to the catalogue.',
  },
  {
    kind: 'blocked',
    label: 'Case',
    icon: 'box',
    reason:
      'product_units.container_id exists (0004:208), but it is a uuid and this rail must offer container names. No query joins containers to the catalogue.',
  },
  {
    kind: 'blocked',
    label: 'Booking',
    icon: 'calendar',
    reason:
      'Reaching a booking from a unit is three hops — product_units → booking_line_units → booking_lines → bookings (0002:229, FK 0004:258) — and the middle one must go through the money-masked booking_lines_v. That is a second query, not a column on this list.',
  },
  {
    kind: 'blocked',
    label: 'Supplier',
    icon: 'truck',
    reason:
      'products.supplier_id exists (0004:125), but it is a uuid and this rail must offer supplier names. No query joins suppliers to the catalogue.',
  },
  {
    kind: 'blocked',
    label: 'Purchase Date',
    icon: 'calendar_event',
    reason:
      'products.purchase_date is a real column (0004:102). A date facet is a RANGE, and this rail draws checkbox lists — ListFilters carries dateRange, but no control here emits one.',
  },
  {
    kind: 'blocked',
    label: 'Purchase Value',
    icon: 'dollar',
    reason:
      'products_v.purchase_price is a real, money-masked column (0048:616-619). Like Purchase Date it needs a range control this rail does not have — and the query module deliberately never names purchase_price in a select.',
    money: true,
  },
  { kind: 'live', key: 'Condition', label: 'Condition', icon: 'eye', options: CONDITIONS },
  { kind: 'live', key: 'Serialisation', label: 'Serialisation', icon: 'checklist', options: TRACKING_MODES },
  {
    kind: 'blocked',
    label: 'Tags',
    icon: 'flag',
    reason: 'Tagging is not built — no tag column or table exists in any of the 54 migrations.',
  },
  {
    kind: 'blocked',
    label: 'Saved Views',
    icon: 'file',
    reason: 'Saved views are not built — there is nowhere to store one.',
  },
]

/* ── raw row → what the table is allowed to say ───────────────────────────────
 *
 * The mock's `ParentRow` carried four fields that `InventoryListRow` does not,
 * and each was a sentence the database cannot produce:
 *
 * | Dropped | Why |
 * |---|---|
 * | `stock: '142 of 200'` | the 142 has NO COLUMN. `products` carries `total_quantity` (0004:97) and `reorder_level` (0004:98) and nothing else; a grep of all 54 migrations for `available_quantity` / `qty_available` / `on_hand` / `stock_level` finds nothing. Defaulting it to the total would read as "all 200 are on the shelf" on a line that has 58 out |
 * | `bookings: '2 Active'` | three joins away, through a money-masked view — see the Booking rail row |
 * | `location: 'Mixed'` | five columns, not one — see the Location rail row |
 * | `replacement` as a SUM of the children | `products_v.replacement_value` is the SKU's own figure, not Σ units. §3.3's "Σ child replacement = parent replacement" is not a rule the schema states, and multiplying it by a unit count would invent money |
 */

/**
 * The Stock cell.
 *
 * A serialised SKU states its LIVE unit rows and, only when there are any, its
 * retired ones separately — so the figure and the status breakdown beside it
 * reconcile instead of disagreeing by the retired count. A quantity-tracked SKU
 * states `total_quantity` and its unit of measure, and states nothing about how
 * many are on the shelf, because nothing knows.
 */
export function stockLabel(row: InventoryListRow): string {
  if (row.trackingMode === 'Serialised') {
    const live = row.unitCountExcludingRetired
    const retired = row.unitsByState.Retired
    const units = `${grouped(live)} unit${live === 1 ? '' : 's'}`
    return retired > 0 ? `${units} · ${grouped(retired)} retired` : units
  }
  const measure = row.quantityUnit ? ` ${row.quantityUnit}${row.totalQuantity === 1 ? '' : 's'}` : ''
  return `${grouped(row.totalQuantity)}${measure}`
}

/**
 * §3.1 — a parent states a breakdown, never one badge.
 *
 * Only the non-zero states, in `INV_ORDER`. `unitsByState` is dense (every one
 * of the ten, including the noughts) so that a chip row cannot render a blank
 * where it means zero; a table row wants the opposite.
 */
export function breakdownOf(row: InventoryListRow): StatusCount[] {
  return INV_ORDER.filter((s) => row.unitsByState[s] > 0).map((s) => ({ status: s, count: row.unitsByState[s] }))
}

/**
 * §5.5 — the shared condition, or `Mixed` where the units differ.
 *
 * `null` when the SKU has no unit rows at all, which is every quantity-tracked
 * product. That is a real state and renders as an explicit non-value; the mock
 * papered over it by typing `condition: 'Good'` onto the BNC cable.
 */
export function conditionOf(row: InventoryListRow): Condition | null {
  const [first] = row.unitConditions
  if (first === undefined) return null
  return row.unitConditions.length === 1 ? first : 'Mixed'
}

/**
 * A unit's place, from the three free-text columns that actually hold it
 * (`rack` / `shelf` / `bin`, 0004:205-207). All three are nullable and the
 * values are shown as stored — nothing here decides that "A1" is a shelf.
 */
export function unitLocationOf(unit: InventoryUnitRow): string | null {
  const parts = [unit.rack, unit.shelf, unit.bin].filter((p): p is string => Boolean(p && p.trim()))
  return parts.length > 0 ? parts.join(' · ') : null
}

/* ── Hover Intel System v2.1 §2, over the real row ───────────────────────────
 *
 * `equipmentIntel.ts`'s `equipmentGlance`/`equipmentDetailGroups` take a
 * `ParentRow` and cannot be reused here: `ParentRow.replacement` is a
 * NON-optional `Paisa` and `ParentRow.condition` a non-optional `Condition`, so
 * adapting an `InventoryListRow` into one would mean typing a rupee figure for a
 * money-blind session and a condition for a SKU that has no units. Both are
 * exactly the fabrication this conversion exists to remove, so these are written
 * against the real row instead. `equipmentIntel.ts` still serves the mock path
 * (`AssetDetail.tsx`, `rackIntel.ts`, `pulse.ts`) and is untouched.
 */

function dominantStatus(row: InventoryListRow): InvStatus | null {
  return ALARM_ORDER.find((s) => row.unitsByState[s] > 0) ?? null
}

/** Money, or an explicit non-value. Never `formatMoney(0)`, which states a price. */
function moneyOrGap(value: Paisa | null): string {
  return value === null ? 'Not available to this session' : formatMoney(value)
}

export function inventoryGlance(row: InventoryListRow, gctx: GateContext): IntelGlance {
  const status = dominantStatus(row)
  const breakdown = breakdownOf(row)
  const condition = conditionOf(row)

  const lines: string[] = [stockLabel(row)]
  if (row.trackingMode !== 'Serialised') {
    // Named, not hidden: a state chip cannot reach this SKU, because the state
    // lives on `product_units` and this product has no unit rows.
    lines.push(`${row.trackingMode}-tracked · no unit rows, so no status`)
  }
  if (condition) lines.push(`Condition ${condition}`)
  if (canViewMoneyField(gctx, 'asset-finance') && row.replacementValue !== null) {
    lines.push(`Replacement ${formatMoney(row.replacementValue)}`)
  }

  return {
    avatarLabel: (row.category ?? row.name).slice(0, 2).toUpperCase(),
    avatarIcon: 'package',
    avatarTone: status ? INV_TONE[status] : 'neutral',
    title: row.name,
    statusDot: status ? INV_TONE[status] : 'neutral',
    subtitle: row.category ?? '—',
    badges: breakdown.slice(0, 2).map((b) => ({ label: `${b.count} ${b.status}` })),
    lines,
  }
}

export function inventoryDetailGroups(row: InventoryListRow, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []
  const condition = conditionOf(row)

  groups.push({
    title: 'Identity',
    fields: [
      { label: 'Name', value: row.name },
      { label: 'Asset code', value: row.assetCode },
      { label: 'Category', value: row.category ?? '—' },
      { label: 'Brand', value: row.brand },
      { label: 'Model', value: row.model ?? '—' },
      { label: 'Short name', value: row.shortName ?? '—' },
    ],
  })

  groups.push({
    title: 'State',
    fields: [
      { label: 'Tracking', value: row.trackingMode },
      { label: 'Condition', value: condition ?? '—' },
      { label: 'Stock', value: stockLabel(row) },
      ...breakdownOf(row).map((b): IntelField => ({ label: b.status, value: String(b.count) })),
      /*
       * Two liveness flags with nothing in the schema relating them — no CHECK,
       * no trigger, no comment (`products.status` 0004:96, `products.is_active`
       * 0004:132). Both are stated; neither is derived from the other, and the
       * card does not collapse them into one invented "is this live".
       * TODO(decision): which of the two governs catalogue visibility.
       */
      { label: 'Record state', value: row.recordState },
      { label: 'Active flag', value: row.isActive ? 'Yes' : 'No' },
    ],
  })

  if (canViewMoneyField(gctx, 'asset-finance')) {
    groups.push({
      title: 'Money',
      fields: [
        { label: 'Daily rate', value: moneyOrGap(row.dailyRate) },
        { label: 'Replacement value', value: moneyOrGap(row.replacementValue) },
      ],
    })
  }

  groups.push({
    title: 'Units',
    fields: [
      row.trackingMode === 'Serialised'
        ? { label: 'Serials', value: 'Expand the row to load this model’s units' }
        : { label: 'Serials', value: `None — ${row.trackingMode}-tracked products carry no unit rows` },
    ],
  })

  return groups
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

/**
 * Two of the five sorts have no column, so they cannot be moved server-side —
 * `inventorySort` (`lib/queries/inventory.ts`) returns `null` for both.
 *
 * ⛔ The tempting fix is to sort the fetched rows in the screen. On a PAGED list
 * that sorts the page, not the catalogue: "Needs attention first" over page 1 of
 * 12 puts the worst of twenty-five models at the top and calls it the worst of
 * three hundred. That is the exact defect this conversion removes, so the two
 * options are rendered DISABLED with the reason rather than silently reordering
 * a page.
 *
 * `attentionScore()` — the weighted sum `Missing×3 + Maintenance×2 +
 * Inspection×1 + Cleaning×1` these reasons refer to — was deleted along with the
 * in-memory sort it fed. The weights lived in the app and in nothing else.
 *
 * TODO(persistence): a `product_unit_counts` view (`product_id, status,
 * count(*)`) joined into `products_v` makes both real.
 */
export const SORT_UNAVAILABLE: Partial<Record<SortKey, string>> = {
  'Units, most first':
    'There is no unit count on products to order by. total_quantity (0004:97) is the quantity-tracking figure and is 0 on every serialised SKU, so ordering by it would sort the serialised catalogue by a column that is zero for all of it. Sorting the page instead would rank twenty-five models and call it the catalogue.',
  'Needs attention first':
    'The attention score is a weighted sum over a model’s unit states (Missing×3, Maintenance×2, Inspection, Cleaning). The weights live in the app and there is no column or view carrying the result, so the database cannot order by it — and sorting the page would rank the rows in hand rather than the catalogue.',
}

export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const
