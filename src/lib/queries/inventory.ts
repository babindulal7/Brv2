import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import { applyListFilters, type ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'
import type { SortKey } from '../../data/inventory'

/**
 * # The inventory list query
 *
 * Law 2, the Single Query Rule: one inventory query serves every surface that
 * asks "what equipment do we have". Today `modules/inventory/Inventory.tsx`
 * filters `src/data/inventory.ts`'s eight hand-typed `PARENTS` rows in a
 * `useMemo` and imports nothing from `src/lib/queries/` at all; this is the
 * replacement for that memo.
 *
 * ## Schema provenance — read before changing a column name here
 *
 * Every column below was verified on 12 Aug 2026 in three places that agree:
 *
 *  - `supabase/migrations/0004_inventory.sql` — `create table products`
 *    (:83-149) and `create table product_units` (:190-239).
 *  - `supabase/migrations/0048_view_row_predicates.sql` — the LIVE definitions
 *    of `products_v` (:598-671) and `product_units_v` (:557-596), which
 *    supersede the ones 0019 first created.
 *  - the GENERATED `src/types/supabase.ts` — `products_v.Row` (:11866),
 *    `product_units_v.Row` (:11700), `inventory_categories.Row` (:5596).
 *
 * ⚠ `src/types/database.ts` is hand-written and does NOT agree with any of
 * them. Do not "make this file consistent" with it — it is the one that is
 * wrong. Use `src/types/supabase.ts`, which is generated from the schema.
 *
 * Additionally, the four PostgREST constructions this module depends on were
 * each executed against the live project (sxguwvgoserhdolewibb) on 12 Aug 2026
 * rather than assumed, with a deliberately malformed control alongside each so
 * a `200` could not be mistaken for a request the server had merely tolerated:
 *
 *  1. `products_v → inventory_categories` embed             → 200
 *     (control `products_v → bookings` → 400 PGRST200)
 *  2. `products_v → product_units_v` embed, aliased          → 200
 *     (control `select=no_such_col` → 400 42703)
 *  3. TWO independent `!inner` aliases on the same embedded view, each
 *     carrying its own filter                                → 200
 *  4. `order=category(name).asc`, ordering the parent by a to-one embed → 200
 *     (control `order=category.name.asc` → 400 PGRST100)
 *
 * That matters because PostgREST resolves embeds from a VIEW only when it can
 * trace the view's columns back to a base-table foreign key. `products_v`
 * projects `category_id`, and `product_units_v` projects `product_id`, so both
 * relationships resolve — but neither is something to take on faith, because a
 * relationship it cannot resolve is a 400 that takes the whole screen down.
 *
 * ## READS GO THROUGH `products_v` / `product_units_v`, NEVER THE BASE TABLES
 *
 * Law 6, and `0019_column_level_money_masking.sql:60-70` states the obligation
 * outright: "Whoever builds Phase 2's data layer MUST query the `_v` views for
 * these three tables, never the base tables directly, or this migration's
 * entire protection is dead code." Nine money columns on `products` and two on
 * `product_units` are revoked from `authenticated` and re-served through the
 * views as `CASE WHEN auth_can_view_money() THEN col ELSE NULL END`.
 *
 * `auth_can_view_money()` (0014:81-87, restated 0018:224-230) is
 * `auth_user_role() not in ('Warehouse','Technician','Driver','Client')` —
 * exactly Law 6's three money-blind floor roles. So a Warehouse session reading
 * `products_v.daily_rate` receives `null`, not a rupee figure. See MONEY below
 * for why this module still refuses to *ask* for it by default.
 *
 * ## THE ELEVEN CHIPS — which have a real column, and which do not
 *
 * The screen renders eleven chips (`src/data/inventory.ts:99-111`, rendered
 * `Inventory.tsx:1021-1059`): `All` plus the ten `InvStatus` values. The brief
 * for this module said six; there are eleven.
 *
 * | chip          | real column?                                              |
 * |---------------|-----------------------------------------------------------|
 * | All           | ✅ the ABSENCE of a constraint — see `inventoryChip`       |
 * | In Stock      | ✅ `product_units_v.status` = `'In Stock'`                 |
 * | Reserved      | ✅ `product_units_v.status` = `'Reserved'`                 |
 * | Packed        | ✅ `product_units_v.status` = `'Packed'`                   |
 * | On Rent       | ✅ `product_units_v.status` = `'On Rent'`                  |
 * | Returning     | ✅ `product_units_v.status` = `'Returning'`                |
 * | Inspection    | ✅ `product_units_v.status` = `'Inspection'`               |
 * | Cleaning      | ✅ `product_units_v.status` = `'Cleaning'`                 |
 * | Maintenance   | ✅ `product_units_v.status` = `'Maintenance'`              |
 * | Missing       | ✅ `product_units_v.status` = `'Missing'`                  |
 * | Retired       | ✅ `product_units_v.status` = `'Retired'`                  |
 *
 * All ten state chips map, one for one, onto members of the `inventory_state`
 * enum (`0001_enums.sql:527-538`) — and the enum's declaration order IS the
 * chip order, which is why `INVENTORY_STATES` below can be both.
 *
 * **But three things about those chips are NOT what the mock implies, and each
 * is a behaviour change the screen has to be written around:**
 *
 *  1. **A state chip silently excludes every non-serialised SKU.** The state
 *     lives on `product_units`, and a `tracking_mode` of `'Quantity'` or
 *     `'Consumable'` product has no unit rows to carry one. In the mock, "BNC
 *     Cable 3m — 142 of 200" has a `breakdown`; in the database it can have
 *     none. So `In Stock` narrows to serialised equipment only. This is a
 *     property of the schema, not of this query — there is nowhere else to read
 *     a quantity SKU's state from. Named here rather than hidden behind a
 *     plausible-looking result.
 *  2. **The chip COUNTS have no source in this query.** `CHIP_COUNTS` is
 *     eleven hardcoded integers summing to 2486 while the table renders 8 rows
 *     / 17 units. The real figure is `select status, count(*) from
 *     product_units_v group by status` — an aggregate over the WHOLE table, not
 *     over the page this function returns. `listInventory` deliberately does
 *     not invent it: `unitsByState` on a row is that row's units and nothing
 *     more, and `withCount` counts matching PRODUCTS, not units. Writing the
 *     aggregate needs either PostgREST's aggregate syntax or an RPC, and it is
 *     a separate function; it is not written here so that no caller can mistake
 *     a page-scoped number for a fleet-wide one.
 *  3. **`Retired` is a chip, so retired units are NOT filtered out.** See
 *     RETIREMENT below — this is the one place where the obvious reading of
 *     Law 3 produces a wrong query.
 *
 * ## WHAT IS NOT HERE, AND WHY
 *
 * - **No `stock` string.** The mock's `ParentRow.stock` is `'3 units'` or
 *   `'142 of 200'`. This module returns `trackingMode`, `totalQuantity`,
 *   `unitCount` and `unitsByState`; composing a sentence from them is the
 *   screen's job, and a query that returns pre-formatted text cannot be summed,
 *   sorted or checked.
 *
 *   ⛔ And the second half of `'142 of 200'` is worse than a formatting
 *   question: **`142` has no column.** `products` carries `total_quantity`
 *   (0004:97) and `reorder_level` (0004:98) and nothing else; a grep of all 54
 *   migrations for `available_quantity` / `qty_available` / `on_hand` /
 *   `stock_level` returns nothing. There is no on-hand figure for a
 *   quantity-tracked SKU anywhere in this schema. So `totalQuantity` is
 *   returned and the available count is not derived from it, not approximated
 *   from unit rows a quantity SKU does not have, and not defaulted to the
 *   total — which would read as "all 200 are on the shelf" on a line that has
 *   58 out.
 *   TODO(persistence): a quantity SKU needs an on-hand column or a movements
 *   ledger before `'142 of 200'` can be rendered truthfully.
 *
 * - **No booking reference.** `ParentRow.bookings` renders `'BR-1042'` or
 *   `'—'`, and the rail's `Booking` facet asks "linked to a booking / no active
 *   booking". The path exists — `product_units → booking_line_units.asset_id`
 *   (0002:229-232, FK added in 0004:258) `→ booking_lines → bookings` — but it
 *   is three hops, and the middle table's money columns are revoked (0019), so
 *   the hop must go through `booking_lines_v`. That is a second query, not a
 *   column, and guessing at it from the list would put a booking number on a
 *   row that has none.
 *
 * - **No `Location` facet.** The rail's `Location` values are single free-text
 *   strings (`'Shelf A1'`, `'Bin D4'`, `'Return QC'` — `data/inventory.ts:550`).
 *   The database splits the same idea across THREE nullable text columns,
 *   `product_units.rack` / `.shelf` / `.bin` (0004:205-207), plus
 *   `warehouse_id` and `storage_zone_id`. Deciding that `'Shelf A1'` means
 *   `shelf = 'A1'` rather than `rack = 'Shelf A1'` is an invention, so no
 *   mapping is made. All five columns are returned verbatim by `listUnits`,
 *   which is the honest thing this module can do.
 *
 *   (`product_units.rack` does exist, so the rack filter this module's brief
 *   expected is buildable the moment a screen has a control that emits a rack
 *   value. There is no such control today — the rail's facet is the free-text
 *   `Location` above.)
 *
 * - **No search input to serve.** `Inventory.tsx` has none: a full read of all
 *   1467 lines finds only checkboxes. `SEARCH_COLUMNS` is defaulted anyway
 *   because the same query serves the equipment pickers that DO search
 *   (`AddBundle.tsx:376`, New Booking), and because leaving it unset would push
 *   the column list into each of those call sites.
 */

/* ── Enum aliases, all from the GENERATED types ───────────────────────────── */

/** `0001_enums.sql:527-538`. Ten members, and their order IS the chip order. */
type InventoryStateDb = Database['public']['Enums']['inventory_state']
/** `0001_enums.sql:541-547`. Five members, declared worst-last. */
type UnitConditionDb = Database['public']['Enums']['unit_condition']
/** `0001_enums.sql:505-509` — Serialised | Quantity | Consumable. */
type TrackingModeDb = Database['public']['Enums']['product_tracking_mode']
/** `0001_enums.sql:520-524` — Draft | Active | Archived. NOT a unit state. */
type ProductRecordStateDb = Database['public']['Enums']['product_record_state']
/** `0001_enums.sql:484-502`. Seventeen members; `CATEGORY_ICON` covers seven. */
type ProductCategoryDb = Database['public']['Enums']['product_category']
/** `0001_enums.sql:512-517` — piece | metre | roll | pack. */
type UnitOfMeasureDb = Database['public']['Enums']['product_unit_of_measure']

/**
 * The ten unit states, in the order `inventory_state` declares them, which is
 * also the order the chip row renders them (`data/inventory.ts:99-111`).
 *
 * `satisfies` checks every member is real. It does NOT check the list is
 * complete — `emptyStateCounts()` below does that, because an object literal
 * annotated `Record<InventoryStateDb, number>` is exhaustiveness-checked by the
 * compiler in both directions. The two together mean a member added to the enum
 * and regenerated into `supabase.ts` breaks the build here rather than quietly
 * dropping a chip.
 */
export const INVENTORY_STATES = [
  'In Stock',
  'Reserved',
  'Packed',
  'On Rent',
  'Returning',
  'Inspection',
  'Cleaning',
  'Maintenance',
  'Missing',
  'Retired',
] as const satisfies readonly InventoryStateDb[]

/**
 * The five conditions in `unit_condition`'s declared order, which is severity
 * order (`0001_enums.sql:541-547`). Used to sort `unitConditions` — sorting
 * those alphabetically would put `Damaged` before `Excellent` and read as a
 * ranking that means nothing.
 */
export const UNIT_CONDITIONS = [
  'Excellent',
  'Good',
  'Fair',
  'Damaged',
  'Lost',
] as const satisfies readonly UnitConditionDb[]

/** What the chip row can be set to. `'All'` is not a state; it is the absence of one. */
export type InventoryChip = 'All' | InventoryStateDb

/** The eleven chips, in render order. `'All'` first, then the enum. */
export const INVENTORY_CHIPS: readonly InventoryChip[] = ['All', ...INVENTORY_STATES]

/* ── RETIREMENT · why Law 3 does NOT mean `.is('retired_at', null)` here ──────
 *
 * The obvious reading of Law 3 — nothing is deleted, so filter the tombstone
 * out — produces a WRONG query on this table, and it is worth being precise
 * about why.
 *
 * `Retired` is one of the eleven chips. An operator clicking it is asking to
 * SEE the retired units. A blanket `.is('retired_at', null)` would make that
 * chip return an empty list forever, which looks like "nothing has ever been
 * retired" rather than like a filter fighting itself.
 *
 * There is a second trap underneath. `product_units` carries retirement TWICE:
 *
 *   - `status = 'Retired'`, a member of `inventory_state` (0004:198)
 *   - `retired_at` / `retired_by` / `retirement_reason` (0004:223-226)
 *
 * and **nothing links them.** The only constraint on the trio is
 * `product_units_retirement_requires_reason` (0004:235-238), which forces the
 * three retirement columns to be all-set-or-all-null with a reason of at least
 * ten characters — it says nothing about `status`. A grep of all 54 migrations
 * finds no trigger, no generated column and no CHECK tying `status = 'Retired'`
 * to `retired_at is not null`. So the two CAN disagree, and this module refuses
 * to assert an equivalence the schema does not enforce: state counts are
 * grouped by `status`, `listUnits` returns `retiredAtAd` verbatim beside it,
 * and no code here derives either one from the other.
 *
 * What Law 3 does buy on this table is already in the schema and needs nothing
 * from this file: `revoke delete on ... products, product_units ... from
 * public, anon, authenticated` (0004:691-708). A row cannot be deleted, so no
 * query has to defend against one having been.
 *
 * §4.3's count invariant — "Σ status counts = Total, excluding Retired"
 * (`data/inventory.ts:113-121`) — is served by `unitCountExcludingRetired`
 * beside the raw `unitCount`, so the screen can state either without doing the
 * subtraction itself and getting a different answer than the next screen.
 */

/* ── MONEY · why the rates are opt-in even though the view already masks ──────
 *
 * `products_v` returns `null` for all nine money columns to a money-blind
 * session, so — unlike `bookings.deposit_required`, which is raw on a base
 * table with no view in front of it — naming a rate here is not itself a Law 6
 * breach. `withMoney` exists anyway, for three reasons:
 *
 *  1. **The select string is the first line, the view is the second.** The
 *     mask is a `CASE` over `auth_can_view_money()`, which resolves
 *     `auth_user_role()`, which reads the GUC `app.current_user_id` set by
 *     PostgREST's `db_pre_request` hook (migration 0041). That is three moving
 *     parts between a Warehouse session and a rupee figure. Not asking depends
 *     on none of them.
 *  2. **It puts the gate where it can be found.** A caller that wants rates has
 *     to write `withMoney: useCanViewMoney()` (`src/lib/moneyVisibility.ts`) at
 *     the call site, which is greppable. A money gate implemented as local
 *     component state is a bug, not a gate; this makes the correct spelling the
 *     easy one.
 *  3. **`0048:79-104` records that the masking is currently INERT at the base
 *     tables** — a column-level REVOKE cannot subtract from the table-level
 *     GRANT Supabase issues to `authenticated`, so any authenticated session
 *     can still read `products.purchase_price` straight off `products`. The
 *     repair is PLAN.md §6.32 and is explicitly gated on the app reading the
 *     `_v` views first. This module is the unblocking half of that fix, and it
 *     should not also be the file that normalises asking for money by default.
 *
 * Only TWO of the nine are ever selected — `daily_rate`, which the equipment
 * picker prices against, and `replacement_value`, which §8.2 renders on the
 * row. `purchase_price`, `weekly_rate`, `monthly_rate`, `hourly_rate`,
 * `weekend_rate`, `deposit_percent` and `deposit_fixed` are not named by any
 * code path in this module: nothing on the list renders them, and a wider
 * select is how a masked column leaks back in the next time someone reaches for
 * `*`.
 */

/**
 * A parent product row, as the Inventory list renders it.
 *
 * Money fields are `Paisa | null`, and the null is load-bearing: it means
 * EITHER "this caller did not ask" (no `withMoney`) OR "this session may not
 * see money" (the view masked it). It never means "free". A screen must gate on
 * `useCanViewMoney()` before rendering, exactly as the clients surfaces do.
 */
export interface InventoryListRow {
  id: string
  /** `products.asset_code` — `text not null`, unique, CHECK `~ '^EQ[0-9]{6}$'` (0004:86, :139-140). */
  assetCode: string
  name: string
  /** `products.short_name` — `text` nullable (0004:88). */
  shortName: string | null
  /** `products.brand` — `text` **not null** (0004:90). The rail's Brand facet is greyed out; the column is right here. */
  brand: string
  /** `products.model` — `text` nullable (0004:91). */
  model: string | null
  /** `products.category_id` — `uuid not null references inventory_categories` (0004:89). */
  categoryId: string
  /**
   * `inventory_categories.name` — the `product_category` ENUM (0004:90 of the
   * categories table), not free text. Seventeen members; the UI's
   * `CATEGORY_ICON` map covers seven, so nine categories have no icon.
   *
   * Never null in practice — `category_id` is NOT NULL against a FK and the
   * embed is `!inner` — so a null here means the join did not resolve, which is
   * a query bug rather than a data state. Typed nullable so that bug is visible
   * instead of crashing the mapper.
   */
  category: ProductCategoryDb | null
  /** `inventory_categories.code` — `text not null` (e.g. `camera`, `lens`), seeded by 0012:115. */
  categoryCode: string | null
  /** `products.tracking_mode` (0004:95). Serialised SKUs have unit rows; Quantity and Consumable do not. */
  trackingMode: TrackingModeDb
  /**
   * `products.status` — the `product_record_state` enum (0004:96), Draft |
   * Active | Archived.
   *
   * ⚠ This is the CATALOGUE record's state and has nothing to do with the ten
   * `inventory_state` chips, which live on the units. Two different columns
   * called `status`, on two different tables, in one screen. Named
   * `recordState` here so the two cannot be confused at a call site;
   * `UNIT_STATE_COLUMN` and `RECORD_STATE_COLUMN` keep them apart in filters.
   */
  recordState: ProductRecordStateDb
  /**
   * `products.is_active` — `boolean not null default true` (0004:132).
   *
   * A SECOND liveness flag alongside `recordState`, and **nothing in the schema
   * relates them**: there is no CHECK, trigger or comment saying an Archived
   * product must be inactive, or that an inactive one must be Archived. Both
   * are returned unreconciled rather than collapsed into one invented
   * "is this live" boolean.
   * TODO(decision): which of `status`/`is_active` governs catalogue visibility.
   * `catalogue()` below narrows on `status` only, and says why.
   */
  isActive: boolean
  /** `products.total_quantity` — `integer not null default 0`, CHECK ≥ 0 (0004:97, :142). */
  totalQuantity: number
  /** `products.quantity_unit` — `product_unit_of_measure` nullable (0004:99). */
  quantityUnit: UnitOfMeasureDb | null
  /** `products.created_at` — `timestamptz not null default now()` (0004:133). AD, UTC. */
  createdAtAd: string
  /**
   * Unit rows this product has, retired ones INCLUDED. `0` for a
   * quantity-tracked SKU, which is a real state and not a missing join.
   */
  unitCount: number
  /**
   * `unitCount` minus the units whose `status` is `'Retired'` — §4.3's "Σ status
   * counts = Total, excluding Retired". Derived from `unitsByState`, never from
   * `retired_at`; see RETIREMENT above for why those are not the same question.
   */
  unitCountExcludingRetired: number
  /**
   * Every one of the ten states, including the ones at zero. A dense record
   * rather than the mock's sparse `StatusCount[]` so a chip row cannot render
   * a blank where it means nought.
   */
  unitsByState: Record<InventoryStateDb, number>
  /**
   * The DISTINCT conditions across this product's units, in `unit_condition`'s
   * severity order. Empty for a SKU with no units.
   *
   * The mock collapses this to `Condition | 'Mixed'`. That collapse is a
   * rendering decision — `length > 1` is 'Mixed' — and it is left to the screen,
   * because the set is strictly more information and the query should not be the
   * place that throws it away.
   */
  unitConditions: UnitConditionDb[]
  /** `products_v.daily_rate`. **Money.** Null unless `withMoney` — see MONEY above. */
  dailyRate: Paisa | null
  /** `products_v.replacement_value`. **Money.** Null unless `withMoney`. */
  replacementValue: Paisa | null
}

/** A single serialised unit, as the per-serial expansion renders it. */
export interface InventoryUnitRow {
  id: string
  productId: string
  /**
   * `product_units.serial_no` — `text` **NULLABLE** (0004:194), unique.
   *
   * The mock's `ChildRow.serial` is required and is used as a React key. It is
   * not required in the database: a unit can be tagged without a manufacturer
   * serial. `assetTag` is the NOT NULL, unique column (0004:195, :233) and is
   * the correct key. No fallback is applied here — inventing a serial from the
   * asset tag would print a manufacturer serial that does not exist.
   */
  serialNo: string | null
  /** `product_units.asset_tag` — `text not null`, unique (0004:195, :233). */
  assetTag: string
  barcode: string | null
  qrCode: string | null
  /** `product_units.status` — the `inventory_state` enum the eleven chips are built from. */
  state: InventoryStateDb
  /** `product_units.condition` — `unit_condition not null default 'Good'` (0004:199). */
  condition: UnitConditionDb
  branchId: string
  warehouseId: string
  storageZoneId: string | null
  /** `product_units.rack` — `text` nullable (0004:205). See the Location note in the header. */
  rack: string | null
  shelf: string | null
  bin: string | null
  containerId: string | null
  /** `numeric(10,2) not null default 0` (0004:216). Hours, not money — no masking applies. */
  runningHours: number
  lastMaintenanceAtAd: string | null
  nextMaintenanceAtAd: string | null
  warrantyExpiresAd: string | null
  insuranceExpiresAd: string | null
  /** `timestamptz` nullable (0004:223). Independent of `state === 'Retired'` — see RETIREMENT. */
  retiredAtAd: string | null
  /** `text` nullable; when set, at least ten trimmed characters by CHECK (0004:235-238). */
  retirementReason: string | null
  /** `product_units_v.purchase_price`. **Money.** Null unless `withMoney`. */
  purchasePrice: Paisa | null
  /** `product_units_v.replacement_value`. **Money.** Null unless `withMoney`. */
  replacementValue: Paisa | null
}

/* ── Filter column names ──────────────────────────────────────────────────────
 *
 * Exported as constants because they are the one place a screen, a named filter
 * set and the SELECT string all have to agree, and two of them are embed-scoped
 * paths that no compiler checks. `'unit_state.status'` naming an alias the
 * select does not carry is a PostgREST 400 — loud, but at runtime.
 */

/**
 * The unit-state narrowing. Reads through a DEDICATED `!inner` alias, not
 * through the `units` embed the row is built from.
 *
 * ⛔ Filtering the `units` embed directly would be the obvious thing to write
 * and it is wrong twice over. PostgREST filters an embedded resource IN PLACE:
 * `units.status=in.(In Stock)` leaves every product in the result and merely
 * trims each one's `units` array — so the list would not narrow at all, and
 * every surviving row's `unitsByState` would collapse to just the chipped
 * state, silently reporting a 4-unit SKU as having 1 unit.
 *
 * A second, `!inner`, alias over the same view is a semi-join: it narrows the
 * PARENT to products having at least one matching unit — which is exactly the
 * mock's `statusesOf(p).includes(chip)` (`Inventory.tsx:875`) — while the
 * unfiltered `units` embed still returns the full breakdown.
 */
const UNIT_STATE_ALIAS = 'unit_state'
export const UNIT_STATE_COLUMN = `${UNIT_STATE_ALIAS}.status`

/**
 * The unit-condition narrowing, through its own separate `!inner` alias.
 *
 * Separate from `UNIT_STATE_COLUMN` on purpose, and the separation is what
 * makes the semantics right. Two filters on ONE alias would mean "has a unit
 * that is both In Stock AND Damaged". Two aliases mean "has an In Stock unit,
 * and has a Damaged unit" — possibly different units — which is how the rail
 * reads: OR inside a group, AND across groups, over the parent's value SETS
 * (`Inventory.tsx:876-879`).
 */
const UNIT_CONDITION_ALIAS = 'unit_condition'
export const UNIT_CONDITION_COLUMN = `${UNIT_CONDITION_ALIAS}.condition`

/**
 * The alias the category embed is given. One constant, because it has to appear
 * identically in the SELECT string, in the filter column and in the ORDER BY,
 * and the compiler checks none of the three.
 */
const CATEGORY_ALIAS = 'category'

/** The category facet. `inventory_categories.name` is an enum, so a bogus value 400s rather than matching nothing. */
export const CATEGORY_COLUMN = `${CATEGORY_ALIAS}.name`

/**
 * Ordering the parent by the to-one category embed. PostgREST spells this
 * `alias(column)`; the sibling `alias.column` is a 400 PGRST100. Verified live
 * on 12 Aug 2026, both spellings.
 */
const CATEGORY_ORDER_COLUMN = `${CATEGORY_ALIAS}(name)`

/** `products.tracking_mode` — the rail's Serialisation facet, straight off the parent. */
export const SERIALISATION_COLUMN = 'tracking_mode'

/** `products.status`, the `product_record_state`. NOT the unit state — see `InventoryListRow.recordState`. */
export const RECORD_STATE_COLUMN = 'status'

/* ── The SELECT strings ───────────────────────────────────────────────────── */

/**
 * `select('*')` on a joined query is how a masked column leaks back in, so
 * every column is named.
 *
 * `category:inventory_categories!inner ( code, name )` is `!inner`
 * unconditionally, which is safe here for two independent reasons and would not
 * be safe in general: `products.category_id` is `not null references
 * inventory_categories (id)` (0004:89), so every product has exactly one
 * category row; and `inventory_categories_select` (0028:34-37) is
 * `auth_is_staff()`, the SAME predicate `products_v` itself carries
 * (0048:670-671), so any session that can see a product can see its category.
 * The inner join therefore cannot drop a row — and it buys the server-side
 * category facet, which an outer embed could not filter on.
 *
 * `units:product_units_v ( status, condition )` is NOT `!inner`. It must not
 * be: a quantity-tracked SKU has no unit rows, and an inner join here would
 * delete every non-serialised product from the catalogue.
 *
 * Two fields only. The row needs a per-status count and a distinct condition
 * set and nothing else, and the embed is unbounded — PostgREST applies no
 * default limit to embedded rows, so a 40-unit SKU returns 40 objects per row.
 * At two scalar fields that is cheap; it is the same shape `queries/bookings.ts`
 * already uses to sum `booking_lines ( id, qty )`. If a fleet ever makes it
 * expensive the fix is PostgREST's aggregate syntax, not a wider select.
 */
const BASE_COLUMNS =
  'id, asset_code, name, short_name, brand, model, category_id, tracking_mode, status, ' +
  'total_quantity, quantity_unit, is_active, created_at, ' +
  `${CATEGORY_ALIAS}:inventory_categories!inner ( code, name ), ` +
  'units:product_units_v ( status, condition )'

/** The money variant. Two of the nine masked columns; never reached without `withMoney`. */
const COLUMNS_WITH_MONEY = `${BASE_COLUMNS}, daily_rate, replacement_value`

/** The semi-join that turns a state chip into a narrowing of the PARENT list. */
const UNIT_STATE_JOIN = `, ${UNIT_STATE_ALIAS}:product_units_v!inner ( id )`

/** The same trick for the condition facet, deliberately a second alias. */
const UNIT_CONDITION_JOIN = `, ${UNIT_CONDITION_ALIAS}:product_units_v!inner ( id )`

/**
 * Columns a free-text search covers. All four are real on `products_v`
 * (0004:86, 87, 90, 91) and none is money, so none 403s.
 *
 * `serial_no` is NOT here and cannot be: it is on `product_units`, a different
 * table. Searching a serial is `listUnits`' job. Stated so nobody assumes
 * typing `SN-CAM-0001` into an equipment picker finds the camera.
 */
const SEARCH_COLUMNS = ['name', 'asset_code', 'brand', 'model'] as const

/* ── Raw row shapes ───────────────────────────────────────────────────────────
 *
 * ⚠ The GENERATED `products_v.Row` and `product_units_v.Row` type EVERY column
 * as `| null`, including `id`, `name` and `asset_tag`. That is an artifact of
 * how Postgres reports nullability through a view — it cannot prove a
 * projection preserves a NOT NULL — not a state the data can be in. The base
 * tables declare `id`, `client_uuid`, `asset_code`, `name`, `category_id`,
 * `brand`, `tracking_mode`, `status`, `total_quantity`, `min_rental_days`,
 * `is_active` and the timestamps NOT NULL (0004:84-136) and `product_id`,
 * `asset_tag`, `status`, `condition`, `branch_id`, `warehouse_id`,
 * `running_hours` NOT NULL (0004:191-216).
 *
 * So these declare the base tables' real nullability rather than the view's
 * widened one — the same call `queries/clients.ts:80-83` makes on
 * `client_directory_v`. The genuinely nullable columns below are nullable
 * because the SCHEMA says so, or because the money mask NULLs them.
 */

interface RawInventoryRow {
  id: string
  asset_code: string
  name: string
  short_name: string | null
  brand: string
  model: string | null
  category_id: string
  tracking_mode: TrackingModeDb
  /** `product_record_state`. The catalogue record's state, not a unit's. */
  status: ProductRecordStateDb
  total_quantity: number
  quantity_unit: UnitOfMeasureDb | null
  is_active: boolean
  created_at: string
  /** `numeric(14,2)` — RUPEES. Absent from the row unless `withMoney` was set; NULL when the view masked it. */
  daily_rate?: number | null
  replacement_value?: number | null
  /** `!inner` to-one. Typed nullable only so an unresolved join is visible rather than fatal. */
  category: { code: string; name: ProductCategoryDb } | null
  /** Every unit of this product, retired included. `[]` / null for a quantity SKU. */
  units: Array<{ status: InventoryStateDb; condition: UnitConditionDb }> | null
}

interface RawUnitRow {
  id: string
  product_id: string
  /** NULLABLE in the schema (0004:194). */
  serial_no: string | null
  asset_tag: string
  barcode: string | null
  qr_code: string | null
  status: InventoryStateDb
  condition: UnitConditionDb
  branch_id: string
  warehouse_id: string
  storage_zone_id: string | null
  rack: string | null
  shelf: string | null
  bin: string | null
  container_id: string | null
  running_hours: number
  last_maintenance_at: string | null
  next_maintenance_at: string | null
  warranty_expires_at: string | null
  insurance_expires_at: string | null
  retired_at: string | null
  retirement_reason: string | null
  /** `numeric(14,2)` — RUPEES. Absent unless `withMoney`; NULL when masked. */
  purchase_price?: number | null
  replacement_value?: number | null
}

const UNIT_COLUMNS =
  'id, product_id, serial_no, asset_tag, barcode, qr_code, status, condition, ' +
  'branch_id, warehouse_id, storage_zone_id, rack, shelf, bin, container_id, ' +
  'running_hours, last_maintenance_at, next_maintenance_at, ' +
  'warranty_expires_at, insurance_expires_at, retired_at, retirement_reason'

const UNIT_COLUMNS_WITH_MONEY = `${UNIT_COLUMNS}, purchase_price, replacement_value`

/** `serial_no` is nullable, so an operator scanning a barcode needs all three. */
const UNIT_SEARCH_COLUMNS = ['serial_no', 'asset_tag', 'barcode'] as const

/* ── Mapping ──────────────────────────────────────────────────────────────── */

/**
 * `numeric` (rupees) → `Paisa`, preserving null rather than collapsing it to 0.
 *
 * 0004 stores money as `numeric(14,2)` in rupees — the seed writes
 * `daily_rate` as `6500.00` (0047:63) — and `lib/money.ts` works in integer
 * paisa, so rupees → paisa is the correct direction at this boundary. The same
 * conversion `queries/clients.ts:109` and `queries/bookings.ts:291` already
 * perform. Getting it backwards renders every rate 100× too small.
 *
 * The null must survive: it is "may not see money" or "not asked for", and
 * `rupees(0)` would state that a camera rents for nothing.
 */
function toPaisa(n: number | null | undefined): Paisa | null {
  return n === null || n === undefined ? null : rupees(n)
}

/**
 * A zero for every state.
 *
 * Annotating the literal `Record<InventoryStateDb, number>` makes the compiler
 * check it BOTH ways: a member of the enum with no key here is an error, and a
 * key here that is not a member is an error. That is the exhaustiveness guard
 * `INVENTORY_STATES`' `satisfies` cannot give on its own.
 */
function emptyStateCounts(): Record<InventoryStateDb, number> {
  return {
    'In Stock': 0,
    Reserved: 0,
    Packed: 0,
    'On Rent': 0,
    Returning: 0,
    Inspection: 0,
    Cleaning: 0,
    Maintenance: 0,
    Missing: 0,
    Retired: 0,
  }
}

function toRow(r: RawInventoryRow): InventoryListRow {
  const units = r.units ?? []
  const unitsByState = emptyStateCounts()
  const conditions = new Set<UnitConditionDb>()

  for (const unit of units) {
    unitsByState[unit.status] += 1
    conditions.add(unit.condition)
  }

  return {
    id: r.id,
    assetCode: r.asset_code,
    name: r.name,
    shortName: r.short_name,
    brand: r.brand,
    model: r.model,
    categoryId: r.category_id,
    // `!inner` on a NOT NULL FK, so this is present on every real row. A null
    // means the embed did not resolve — a query bug. Passed through as null
    // rather than substituted with the id or with 'Other', either of which
    // would put a wrong category on a real product.
    category: r.category?.name ?? null,
    categoryCode: r.category?.code ?? null,
    trackingMode: r.tracking_mode,
    recordState: r.status,
    isActive: r.is_active,
    totalQuantity: r.total_quantity,
    quantityUnit: r.quantity_unit,
    createdAtAd: r.created_at,
    unitCount: units.length,
    unitCountExcludingRetired: units.length - unitsByState.Retired,
    unitsByState,
    unitConditions: UNIT_CONDITIONS.filter((c) => conditions.has(c)),
    dailyRate: toPaisa(r.daily_rate),
    replacementValue: toPaisa(r.replacement_value),
  }
}

function toUnitRow(r: RawUnitRow): InventoryUnitRow {
  return {
    id: r.id,
    productId: r.product_id,
    serialNo: r.serial_no,
    assetTag: r.asset_tag,
    barcode: r.barcode,
    qrCode: r.qr_code,
    state: r.status,
    condition: r.condition,
    branchId: r.branch_id,
    warehouseId: r.warehouse_id,
    storageZoneId: r.storage_zone_id,
    rack: r.rack,
    shelf: r.shelf,
    bin: r.bin,
    containerId: r.container_id,
    runningHours: r.running_hours,
    lastMaintenanceAtAd: r.last_maintenance_at,
    nextMaintenanceAtAd: r.next_maintenance_at,
    warrantyExpiresAd: r.warranty_expires_at,
    insuranceExpiresAd: r.insurance_expires_at,
    retiredAtAd: r.retired_at,
    retirementReason: r.retirement_reason,
    purchasePrice: toPaisa(r.purchase_price),
    replacementValue: toPaisa(r.replacement_value),
  }
}

/* ── The list query ───────────────────────────────────────────────────────── */

export interface InventoryListOptions extends ListFilters {
  /** Ask for the total matching count. Costs an extra planner pass, so it is opt-in. */
  withCount?: boolean
  /**
   * Include `daily_rate` and `replacement_value`. **Money.** Read MONEY above,
   * then pass `useCanViewMoney()` from `src/lib/moneyVisibility.ts` — never a
   * literal `true`, and never a boolean held in component state.
   */
  withMoney?: boolean
}

/** True only when a chip group will actually constrain. `[]` is the "All" chip: no constraint. */
function narrows(filters: ListFilters, column: string): boolean {
  return (filters.chips?.[column]?.length ?? 0) > 0
}

/**
 * The catalogue list.
 *
 * The `!inner` semi-join aliases are added to the SELECT **only when the
 * matching chip group is non-empty**, and that conditionality is the whole
 * correctness argument, not an optimisation:
 *
 *  - Adding `unit_state:product_units_v!inner(id)` with no filter on it would
 *    delete every quantity-tracked and consumable SKU from the list, because
 *    those have no unit rows for the inner join to match. The BNC cable would
 *    vanish from the catalogue with nothing to indicate it had.
 *  - Omitting the alias while a filter names it is a PostgREST 400. Loud, and
 *    covered by the suite.
 *
 * `[]` means NO CONSTRAINT, never "match nothing" — `applyListFilters` skips an
 * empty group, and `narrows()` above reads the same emptiness, so the SELECT
 * and the filters cannot disagree about whether a chip is live.
 */
export async function listInventory(opts: InventoryListOptions = {}): Promise<ListQueryResult<InventoryListRow>> {
  const { withCount, withMoney, ...filters } = opts

  let columns = withMoney ? COLUMNS_WITH_MONEY : BASE_COLUMNS
  if (narrows(filters, UNIT_STATE_COLUMN)) columns += UNIT_STATE_JOIN
  if (narrows(filters, UNIT_CONDITION_COLUMN)) columns += UNIT_CONDITION_JOIN

  const base = supabase
    .from('products_v')
    .select(columns, withCount ? { count: 'exact' } : undefined)

  // No cast. `applyListFilters` is structurally typed against the postgrest
  // builder on purpose — see the long note at the equivalent call in
  // `queries/bookings.ts`; casting to `never` there threw away the only check
  // that `FilterBuilder` still matches the installed client.
  const query = applyListFilters(base, {
    ...filters,
    searchColumns: filters.searchColumns ?? SEARCH_COLUMNS,
    sort: filters.sort ?? { column: 'name', ascending: true },
    // Deterministic paging — see PAGINATION in `listQuery.ts`. `products.id` is
    // `uuid not null default gen_random_uuid() primary key` (0004:84), unique
    // and never null, which is the whole requirement. `name` is not unique, so
    // without this two pages of a paged catalogue can repeat a row and drop
    // another.
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawInventoryRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listInventory failed: ${error.message}`)

  return { rows: (data ?? []).map(toRow), total: count ?? null }
}

/* ── The per-serial expansion ─────────────────────────────────────────────── */

export interface InventoryUnitOptions extends ListFilters {
  withCount?: boolean
  /** Include `purchase_price` and `replacement_value`. **Money.** Gate on `useCanViewMoney()`. */
  withMoney?: boolean
}

/**
 * The units of one product — the rows behind the expand chevron
 * (`Inventory.tsx:403-406`).
 *
 * A separate function, and a separate table. It is deliberately NOT folded into
 * `listInventory`'s embed: the expansion is per-row and opened one at a time
 * (`ParentRowView`'s `open` is local state, `:293`), so fetching every unit of
 * every product to satisfy the one row somebody clicked would be the wrong
 * shape at any fleet size.
 *
 * Retired units are RETURNED. See RETIREMENT above — `Retired` is a chip, and
 * `retired_at` and `status` are independent columns that this module reports
 * rather than reconciles. A caller that wants only live units passes
 * `presence: { retired_at: false }`, which is a filter it has stated, not one
 * this function applied behind it.
 */
export async function listUnits(
  productId: string,
  opts: InventoryUnitOptions = {},
): Promise<ListQueryResult<InventoryUnitRow>> {
  const { withCount, withMoney, ...filters } = opts

  // Short-circuit rather than query. `.eq('product_id', '')` is a 400 from
  // Postgres (invalid uuid), surfaced to the operator as a failed panel on a
  // row they merely expanded. An unidentified product has no units by
  // definition, and saying so costs nothing.
  if (!productId) return { rows: [], total: 0 }

  const base = supabase
    .from('product_units_v')
    .select(withMoney ? UNIT_COLUMNS_WITH_MONEY : UNIT_COLUMNS, withCount ? { count: 'exact' } : undefined)
    .eq('product_id', productId)

  const query = applyListFilters(base, {
    ...filters,
    searchColumns: filters.searchColumns ?? UNIT_SEARCH_COLUMNS,
    // `asset_tag` rather than `serial_no`: it is NOT NULL and unique
    // (0004:195, :233), so it orders every unit. Sorting on the nullable
    // `serial_no` would bunch every untagged unit at one end under a rule
    // Postgres, not this app, chose.
    sort: filters.sort ?? { column: 'asset_tag', ascending: true },
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawUnitRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listUnits failed: ${error.message}`)

  return { rows: (data ?? []).map(toUnitRow), total: count ?? null }
}

/* ── One asset, by whatever reference a URL carries ────────────────────────── */

/** What `/inventory/:assetId` resolves to: the product plus every unit row it has. */
export interface AssetDetailRecord {
  product: InventoryListRow
  /** Every unit of the product, retired included, in `asset_tag` order. `[]` for a quantity SKU. */
  units: InventoryUnitRow[]
  /**
   * Set when the ref named a UNIT (a manufacturer serial or an asset tag)
   * rather than the product's own `asset_code` — the id of that unit, so the
   * screen can open on the row the link meant.
   */
  matchedUnitId: string | null
}

export interface AssetDetailOptions {
  /** Include the money columns. **Money.** Pass `useCanViewMoney()`, never a literal — see MONEY above. */
  withMoney?: boolean
}

/**
 * Resolves the reference in `/inventory/:assetId` to one product and its units.
 *
 * The links that land on this route carry THREE different vocabularies, all
 * live today: `StockCheck.tsx` links `assetCode || serial`, every floor
 * workspace and `BookingDetail` link a unit's serial, and the Inventory list's
 * own rows link the `asset_code`. So the ref is tried as, in order:
 *
 *  1. `products.asset_code` — the route's own primary vocabulary (`EQ......`).
 *  2. `product_units.serial_no` — nullable but unique (0004:194).
 *  3. `product_units.asset_tag` — the NOT NULL unique unit key (0004:195, :233).
 *
 * The order cannot mis-resolve: `asset_code` is CHECK-constrained to
 * `^EQ[0-9]{6}$` (0004:139-140) while an asset tag carries a suffix and a
 * serial a different prefix entirely, so no single string matches two steps.
 *
 * ⚠ Deliberately NOT narrowed by `catalogue()`: that filter set exists for the
 * list, where Archived means "left the catalogue". A DETAIL link from an old
 * booking or a stock-check row must keep resolving after the product is
 * archived — Law 3 keeps the row forever, and a page that 404s on it would
 * read as deletion. Retired units are likewise returned (see RETIREMENT).
 *
 * Returns `null` only when a genuinely successful query matched nothing —
 * a failed read THROWS, so "not found" and "could not load" stay two facts.
 */
export async function getAssetDetail(
  ref: string,
  opts: AssetDetailOptions = {},
): Promise<AssetDetailRecord | null> {
  const trimmed = ref.trim()
  if (!trimmed) return null

  const money = opts.withMoney ? { withMoney: true as const } : {}

  // 1. The product's own asset code. `chips` → `in(asset_code, [ref])`;
  //    `asset_code` is unique (0004:139), so this is zero rows or one.
  const byCode = await listInventory({ chips: { asset_code: [trimmed] }, ...money })
  let product = byCode.rows[0] ?? null
  let matchedUnitId: string | null = null

  // 2./3. A unit's serial, then its asset tag. Two `.eq` lookups rather than
  // one `.or`, because both columns are unique and the mock engine's `.or()`
  // only speaks ilike — and a lookup that silently skipped a clause there
  // would resolve links in production that 404 in every demo.
  if (!product) {
    for (const column of ['serial_no', 'asset_tag'] as const) {
      const { data, error } = (await supabase
        .from('product_units_v')
        .select('id, product_id')
        .eq(column, trimmed)
        .limit(1)) as unknown as {
        data: Array<{ id: string; product_id: string }> | null
        error: { message: string } | null
      }
      if (error) throw new Error(`getAssetDetail failed: ${error.message}`)
      const hit = data?.[0]
      if (hit) {
        matchedUnitId = hit.id
        const byId = await listInventory({ chips: { id: [hit.product_id] }, ...money })
        product = byId.rows[0] ?? null
        break
      }
    }
  }

  if (!product) return null

  // The units ride along rather than being a second fetch from the screen:
  // unlike the list's per-row expansion, this page renders every tab from the
  // full unit set (availability figures, maintenance dates, the units table),
  // so fetching them lazily would just serialise two round-trips.
  const units = await listUnits(product.id, money)

  return { product, units: units.rows, matchedUnitId }
}

/* ── Named filter sets ────────────────────────────────────────────────────────
 *
 * The screens differ only in which filters they pass. Naming them here rather
 * than in each screen is what stops the Inventory list, the equipment picker
 * and the bundle builder drifting apart about what "the catalogue" means.
 *
 * Every enum literal below is checked by `satisfies` against the GENERATED
 * types, which matters more than it looks: PostgREST hands an unknown enum
 * value straight to Postgres, which answers `22P02 invalid input value for enum
 * inventory_state` — a 400 that blanks the screen. (Verified live on 12 Aug
 * 2026 with `status=in.(Sub-rented)`, a member `inventory_state` does not have
 * even though the mock's vocabulary suggests it might.)
 */

/**
 * The catalogue baseline — what the Inventory list MEANS before the operator
 * touches anything. Pass it to `useList` as `{ baseline }` so an empty result
 * offers "No equipment yet · Add" rather than a "Clear filters" button that
 * clears nothing.
 *
 * Archived is excluded and Draft is not, and both halves are deliberate:
 *
 *  - **Archived** is the catalogue's Law 3 terminal state. There is no delete
 *    (0004:691-708 revokes it), so archiving is how a product leaves the
 *    catalogue, and a list that shows archived equipment is showing gear the
 *    business has retired from the catalogue as if it could be booked.
 *  - **Draft** is `products.status`' DEFAULT (0004:96). Every product created
 *    without an explicit status is a Draft, so narrowing to `['Active']` would
 *    make freshly added equipment invisible on the screen that just added it.
 *
 * Written as an enumeration of the members that REMAIN rather than as a "not
 * Archived", because `applyListFilters` has no `neq` and because the
 * enumeration is checkable — the suite pins it against `product_record_state`.
 *
 * TODO(decision): `products.is_active` is a second liveness flag with no stated
 * relationship to `status` (see `InventoryListRow.isActive`). This narrows on
 * `status` alone. Adding `presence`/`chips` for `is_active` here would assert a
 * precedence between the two that nothing has ruled.
 */
export function catalogue(): ListFilters {
  return {
    chips: { [RECORD_STATE_COLUMN]: ['Draft', 'Active'] satisfies ProductRecordStateDb[] },
    sort: { column: 'name', ascending: true },
  }
}

/**
 * The catalogue narrowed by one of the eleven chips.
 *
 * `'All'` returns the baseline UNCHANGED — no `unit_state` group at all, not an
 * empty one. Either spelling is handled correctly downstream (`applyListFilters`
 * skips an empty group, and `narrows()` keeps the `!inner` alias out of the
 * SELECT), but omitting the key entirely is what makes `useList`'s
 * `narrowingKey` see the All chip as identical to the baseline, so an empty
 * catalogue reads as empty rather than as over-filtered.
 */
export function inventoryChip(chip: InventoryChip): ListFilters {
  const base = catalogue()
  if (chip === 'All') return base
  return {
    ...base,
    chips: { ...base.chips, [UNIT_STATE_COLUMN]: [chip] satisfies InventoryStateDb[] },
  }
}

/**
 * The rail's Status facet — the multi-select form of the chips.
 *
 * An empty array is returned as an empty group rather than dropped, because
 * that is what "the operator deselected everything" produces and it must read
 * as no constraint (the All chip), never as `in(status, [])`, which matches
 * zero rows and renders a plausible empty catalogue.
 */
export function unitsInState(states: readonly InventoryStateDb[]): ListFilters {
  return { chips: { [UNIT_STATE_COLUMN]: [...states] } }
}

/** The rail's Condition facet. Its own `!inner` alias — see `UNIT_CONDITION_COLUMN`. */
export function unitsInCondition(conditions: readonly UnitConditionDb[]): ListFilters {
  return { chips: { [UNIT_CONDITION_COLUMN]: [...conditions] } }
}

/**
 * The rail's Category facet. `inventory_categories.name` is the
 * `product_category` enum, so the values are its seventeen members and not the
 * seven the mock's `CATEGORY_OPTIONS` derives from eight hand-typed rows.
 */
export function ofCategory(categories: readonly ProductCategoryDb[]): ListFilters {
  return { chips: { [CATEGORY_COLUMN]: [...categories] } }
}

/**
 * The rail's Serialisation facet. Straight off the parent — no join, no alias.
 *
 * The mock offers two values, `'Serialised' | 'Non-serialised'`, derived from
 * whether the row has children. The column has THREE
 * (`product_tracking_mode`: Serialised | Quantity | Consumable), and
 * 'Non-serialised' is the other two together. The screen must pass what it
 * means; collapsing Consumable into Quantity here would hide a distinction the
 * schema draws.
 */
export function ofTrackingMode(modes: readonly TrackingModeDb[]): ListFilters {
  return { chips: { [SERIALISATION_COLUMN]: [...modes] } }
}

/**
 * The five sort options (`data/inventory.ts:589`) mapped onto `.order()`.
 *
 * **Two of the five have no column and cannot be moved server-side.** Both
 * return `null`, and a null is not a soft failure to ignore — a caller that
 * sorts client-side on a PAGED list is sorting the page, not the catalogue,
 * which is the exact defect this whole module exists to remove.
 *
 *  - **`'Units, most first'`** — `unitCountOf(p)` is `Σ breakdown.count`, i.e.
 *    `count(*)` over `product_units` grouped by `product_id`. There is no
 *    materialised count on `products`: the table has `total_quantity`
 *    (0004:97), which is the QUANTITY-tracking figure and is `0` by default on
 *    a serialised SKU, so ordering by it would sort the serialised catalogue by
 *    a column that is zero for all of it. Ordering by an embedded aggregate is
 *    not something PostgREST expresses.
 *  - **`'Needs attention first'`** — `attentionScore` (`data/inventory.ts:595`)
 *    is a weighted sum, `Missing×3 + Maintenance×2 + Inspection×1 + Cleaning×1`,
 *    over the breakdown. The weights live in the app, not the schema; there is
 *    no column and no view exposing them.
 *
 * TODO(persistence): both become sortable with a `product_unit_counts` view
 * (`product_id, status, count(*)`) joined into `products_v`, which is a
 * migration and deliberately not written from a query module.
 *
 * `'Category A–Z'` DOES work server-side: `order=category(name).asc` orders the
 * parent by the to-one embed, verified live on 12 Aug 2026 (the sibling
 * spelling `category.name.asc` is a 400 PGRST100 — the parenthesised form is
 * the one PostgREST parses). Note it orders by the ENUM, so the sequence is
 * `product_category`'s declaration order (Camera, Lens, Lighting, Grip, …), not
 * alphabetical — which is a more useful order than A–Z and is not what the
 * label promises. Stated, not silently swapped.
 */
export function inventorySort(key: SortKey): { column: string; ascending: boolean } | null {
  switch (key) {
    case 'Equipment A–Z':
      return { column: 'name', ascending: true }
    case 'Equipment Z–A':
      return { column: 'name', ascending: false }
    case 'Category A–Z':
      return { column: CATEGORY_ORDER_COLUMN, ascending: true }
    case 'Units, most first':
    case 'Needs attention first':
      return null
  }
}
