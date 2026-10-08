import { supabase } from '../supabase'
import { applyListFilters, sanitiseSearchTerm, type ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'
import type { StockCheckUnitState } from '../../data/stockCheck'

/**
 * # The stock-audit queries — `stock_audits` / `stock_audit_items`
 *
 * Law 2, the Single Query Rule: one module answers "what stock-take sessions
 * exist" and "what is on this session's manifest". The Stock Check screen
 * (`modules/inventory/StockCheck.tsx`) reads from here; no screen may hand-roll
 * a `supabase.from('stock_audits')`.
 *
 * ## Schema provenance — verified before any column was named
 *
 *  - `supabase/migrations/0004_inventory.sql` — `create table stock_audits`
 *    (:611-634) and `create table stock_audit_items` (:643-660).
 *  - The FKs land later: `branch_id`/`warehouse_id`/`audited_by` in
 *    `0042_deferred_cross_file_fks.sql` (cross-file forward refs, stated inline
 *    in 0004's comments).
 *  - The GENERATED `src/types/supabase.ts` — `stock_audits.Row` (:8710),
 *    `stock_audit_items.Row` (:8633) — including the Relationships arrays,
 *    which are how PostgREST's embed resolution is checked here without a
 *    live probe: `stock_audit_items.product_unit_id → product_units_v`
 *    (:8687-8693) and `product_units_v.product_id → products_v`
 *    (:11829-11835) are both listed, so the two-hop embed below is one the
 *    schema itself declares resolvable.
 *
 * ⚠ `stock_audits.status` is **`text not null default 'Draft'` with no CHECK**
 * (0004:618). It is not an enum and nothing constrains its vocabulary, so this
 * module types it `string` and asserts nothing about its members. Facts about a
 * session's lifecycle should be read off the timestamps (`started_at`,
 * `completed_at`), which are typed columns; the free-text status is carried for
 * display only.
 *
 * ## Who can read these tables — RESTRICTED, NOT EMPTY
 *
 * `stock_audits_select` and `stock_audit_items_select` are both
 * `auth_is_staff()` (0028:93-96, :104-107). The route `/inventory/stock-check`
 * has no role gate at all (it is not a money surface), so an external `Client`
 * session reaches the screen, gets HTTP 200 and **zero rows** — which is RLS,
 * not emptiness. Handed straight to `PageBody` that renders "No stock audits
 * yet", a claim about the business that is false. Gate the screen with
 * `stockAuditRestriction()` below — the `auditRestriction()` /
 * `financeRestriction()` pattern, mirroring the policy rather than inventing a
 * role list.
 *
 * ## The unit embed — why it reads through `product_units_v` / `products_v`
 *
 * A manifest line carries only `product_unit_id`; the serial, asset tag,
 * rack/shelf/bin and product name live on the unit and its product. Reads go
 * through the `_v` masking views, never the base tables (Law 6 and
 * `0019:60-70`'s stated obligation). Both views' row predicate is
 * `auth_is_staff()` (0048:557-596 for `product_units_v`, :598-671 for
 * `products_v`) — the SAME predicate as the audit tables themselves, so any
 * session that can see a manifest line can see its unit and product, and the
 * embed cannot null out for a session the line itself admits.
 *
 * The embeds are OUTER (no `!inner`) on the list read: `product_unit_id` is
 * `not null references product_units (id)` (0004:647) and DELETE is revoked on
 * `product_units` (0004:691-708), so the join genuinely cannot miss — but if a
 * query defect ever broke resolution, an `!inner` would silently DROP the
 * manifest line, and an audit line disappearing is a worse failure than a line
 * with a visibly unresolved name. Typed nullable so the bug is visible, never
 * fatal. (`findStockAuditItemByCode` is the one place `!inner` appears, because
 * there the embed filter must narrow the parent — a semi-join, exactly
 * `queries/inventory.ts`'s `UNIT_STATE_COLUMN` construction.)
 *
 * ## NO MONEY CROSSES THIS BOUNDARY
 *
 * `stock_audits` and `stock_audit_items` carry no money column, and the unit
 * embed deliberately does not name `purchase_price` or `replacement_value`
 * (the two masked columns on `product_units_v`). Nothing here calls
 * `rupees()`/`toRupees()` because no rupee figure is ever selected — Law 6 by
 * omission, which no view mask has to catch. Do not widen the embed's field
 * list without reading MONEY in `queries/inventory.ts` first.
 *
 * ## Mock mode
 *
 * Neither table is in the mock corpus (`lib/mock/corpus.ts` serves 13 tables)
 * and neither is in its `UNSERVED` list. The mock engine answers an unknown
 * table with `[]` plus a console warning (`lib/mock/client.ts:100-106`), so in
 * mock mode the screen renders an honest "No stock audits yet" empty state —
 * unannounced in the banner, stated here and in the screen's own notes.
 */

/* ── Enum aliases, all from the GENERATED types ─────────────────────────── */

/** `stock_check_scope` — Location | Category | Fleet item | Full warehouse. */
type StockCheckScopeDb = Database['public']['Enums']['stock_check_scope']
/** `stock_check_outcome` — Found | Confirmed missing | Left unverified. */
type StockCheckOutcomeDb = Database['public']['Enums']['stock_check_outcome']
/** `stock_check_exclusion` — On Rent | In Transit | Sub-rented out. */
type StockCheckExclusionDb = Database['public']['Enums']['stock_check_exclusion']
/** `inventory_state` — the ten unit states; see `queries/inventory.ts`. */
type InventoryStateDb = Database['public']['Enums']['inventory_state']
type SystemRoleDb = Database['public']['Enums']['system_role']

export type { StockCheckOutcomeDb, StockCheckScopeDb }

/* ── Restricted, not empty — the guard the Stock Check screen spreads ───── */

/**
 * Why the surface is closed, in words, for `RestrictedState`. Says the session
 * may not read the count — NOT that no counts exist. Mirrors
 * `stock_audits_select` = `auth_is_staff()` (0028:93-96): every staff role
 * reads, the external Client role does not.
 */
export const STOCK_AUDIT_RESTRICTED_REASON =
  'Stock-take sessions are an internal warehouse record, and reading them requires a staff role. ' +
  'This is not a statement about whether any audits exist.'

export interface StockAuditRestriction {
  restricted: boolean
  restrictedReason: string
}

/**
 * The `PageBody` props that turn an RLS-empty result into an honest restricted
 * state. Spread it; do not re-derive it. Fixed shape unconditionally (the
 * reason is inert when `restricted` is false) so `exactOptionalPropertyTypes`
 * stays happy — same contract as `auditRestriction()` / `financeRestriction()`.
 *
 * There is no `restrictedRequiredRole`: the policy admits every staff role, so
 * naming one would misstate the rule. `isStaff` in `lib/rbac.ts:53-55` is the
 * same predicate; it is restated here as data because the SCREEN gates on the
 * POLICY governing these tables, not on a general product notion of staff.
 */
export function stockAuditRestriction(role: SystemRoleDb | null | undefined): StockAuditRestriction {
  return {
    restricted: role == null || role === 'Client',
    restrictedReason: STOCK_AUDIT_RESTRICTED_REASON,
  }
}

/* ── Outcome ↔ screen-state, the single derivation in each direction ────── */

/**
 * DB `stock_check_outcome` → the screen's three-state vocabulary
 * (`data/stockCheck.ts`'s `StockCheckUnitState`, which `STOCK_CHECK_STATE_META`
 * keys the badges on). One total mapping, checked both ways by the compiler,
 * so a count, a filter chip and a badge can never disagree about what an
 * outcome means. §7.3's correctness rule survives the mapping intact:
 * `'Left unverified'` maps to `Unverified`, never to missing.
 */
const STATE_OF_OUTCOME: Record<StockCheckOutcomeDb, StockCheckUnitState> = {
  Found: 'Verified',
  'Confirmed missing': 'Confirmed missing',
  'Left unverified': 'Unverified',
}

export function unitStateOfOutcome(outcome: StockCheckOutcomeDb): StockCheckUnitState {
  return STATE_OF_OUTCOME[outcome]
}

/** The inverse — what outcome a screen-state filter chip asks the server for. */
export const OUTCOME_OF_STATE: Record<StockCheckUnitState, StockCheckOutcomeDb> = {
  Verified: 'Found',
  'Confirmed missing': 'Confirmed missing',
  Unverified: 'Left unverified',
}

/* ── Rows ────────────────────────────────────────────────────────────────── */

/** A stock-take session, as the session picker and header render it. */
export interface StockAuditListRow {
  id: string
  /** `stock_audits.audit_no` — `text not null`, unique (0004:614, :633). */
  auditNo: string
  scope: StockCheckScopeDb
  /** Free text, default `'Draft'`, NO CHECK (0004:618). Display only — lifecycle facts come from the timestamps. */
  status: string
  /** `scheduled_date` — a `date` column, `YYYY-MM-DD`, AD (0004:619). BS is rendered, never stored (Law 7). */
  scheduledDateAd: string
  startedAtAd: string | null
  completedAtAd: string | null
  /**
   * `audited_by` — nullable `users.id` (0004:622). NOT resolved to a name:
   * `users` is self-scoped (its only SELECT policy is `id = current_setting(…)`,
   * 0020:55), so a name embed would resolve for exactly one row — the viewer's
   * own — and render "unknown" beside every other session. Same refusal as
   * `queries/audit.ts`'s `AUDIT_ACTOR_ROLES` note.
   */
  auditedById: string | null
  branchId: string
  warehouseId: string
  /** `warehouses.name` via embed — `warehouses_select` is `auth_is_staff()` (0022:67-70), the same predicate as this table, so it cannot be withheld from a session that sees the row. Null = unresolved join, a query bug made visible. */
  warehouseName: string | null
  /**
   * The three stored totals (0004:623-625). ⚠ These are columns a WRITER
   * maintains, not aggregates the database derives — nothing reconciles them
   * with the actual `stock_audit_items` rows. The screen counts its KPIs from
   * the items (`auditItemKpiFilters`) and treats these as the writer's claim.
   */
  totalExpected: number
  totalScanned: number
  totalDiscrepancies: number
  notes: string | null
  createdAtAd: string
}

/** One manifest line, with its unit identity read through the masking views. */
export interface StockAuditItemRow {
  id: string
  stockAuditId: string
  productUnitId: string
  /** The unit's state when the manifest was drawn up (0004:648). */
  expectedState: InventoryStateDb
  /** The state observed at scan time; null until a scan is recorded (0004:649). */
  scannedState: InventoryStateDb | null
  /** `stock_check_outcome not null default 'Left unverified'` (0004:650) — the resting state, exactly §7.3's rule. */
  outcome: StockCheckOutcomeDb
  /** Why the line is out of scope for walking — On Rent | In Transit | Sub-rented out (0004:651). */
  exclusionReason: StockCheckExclusionDb | null
  discrepancyNotes: string | null
  scannedAtAd: string | null
  /** Nullable `users.id`. Not resolved to a name — see `StockAuditListRow.auditedById`. */
  scannedById: string | null
  /** `product_units.serial_no` — genuinely NULLABLE (0004:194); a unit can be tagged without a manufacturer serial. */
  serialNo: string | null
  /** `product_units.asset_tag` — NOT NULL, unique on the base table (0004:195, :233). Null here = unresolved embed, a query bug made visible rather than fatal. */
  assetTag: string | null
  barcode: string | null
  rack: string | null
  shelf: string | null
  bin: string | null
  /** `products.name` via the second hop. Null = unresolved embed, never substituted. */
  productName: string | null
  /** `products.asset_code` — the `EQ000000` code the Inventory route keys on. */
  productAssetCode: string | null
}

/* ── Filter column names ─────────────────────────────────────────────────── */

/** The one constraint a manifest read is meaningless without. */
export const ITEM_AUDIT_COLUMN = 'stock_audit_id'
/** The outcome narrowing the Verified/Unverified/Missing chips send. An enum column — a bogus value is a 400, not a silent no-match. */
export const ITEM_OUTCOME_COLUMN = 'outcome'

/** The alias the unit embed is given — appears in the SELECT and in `findStockAuditItemByCode`'s embed-scoped `or`, and the compiler checks neither. */
const UNIT_ALIAS = 'unit'

/* ── SELECT strings — every column named, `select('*')` never ───────────── */

const AUDIT_COLUMNS =
  'id, audit_no, branch_id, warehouse_id, scope, status, scheduled_date, ' +
  'started_at, completed_at, audited_by, total_expected, total_scanned, ' +
  'total_discrepancies, notes, created_at, ' +
  'warehouse:warehouses ( name )'

const ITEM_BASE_COLUMNS =
  'id, stock_audit_id, product_unit_id, expected_state, scanned_state, ' +
  'outcome, exclusion_reason, discrepancy_notes, scanned_at, scanned_by'

/**
 * The unit's identity fields and, nested, its product's name and code. NO money
 * columns — see the header. Both hops are declared in the generated
 * Relationships arrays (types/supabase.ts:8687-8693, :11829-11835).
 */
const UNIT_EMBED_FIELDS = 'serial_no, asset_tag, barcode, rack, shelf, bin, product:products_v ( name, asset_code )'

/** Outer embed for lists — a broken join shows as a null name, not a vanished audit line. */
const ITEM_COLUMNS = `${ITEM_BASE_COLUMNS}, ${UNIT_ALIAS}:product_units_v ( ${UNIT_EMBED_FIELDS} )`

/** `!inner` for the scan lookup ONLY — there the embed filter must narrow the PARENT (a semi-join), which an outer embed cannot do. */
const ITEM_LOOKUP_COLUMNS = `${ITEM_BASE_COLUMNS}, ${UNIT_ALIAS}:product_units_v!inner ( ${UNIT_EMBED_FIELDS} )`

/** What a free-text search of sessions covers. Both are `text` on the base table (0004:614, :626); neither is money. */
const AUDIT_SEARCH_COLUMNS = ['audit_no', 'notes'] as const

/* ── Raw row shapes ──────────────────────────────────────────────────────────
 *
 * Nullability below is the BASE tables' (0004:611-660), not the view-widened
 * one — the same call `queries/inventory.ts` documents at its raw shapes. The
 * embeds are typed nullable because an unresolved join must be visible rather
 * than crash the mapper.
 */

interface RawStockAuditRow {
  id: string
  audit_no: string
  branch_id: string
  warehouse_id: string
  scope: StockCheckScopeDb
  status: string
  scheduled_date: string
  started_at: string | null
  completed_at: string | null
  audited_by: string | null
  total_expected: number
  total_scanned: number
  total_discrepancies: number
  notes: string | null
  created_at: string
  warehouse: { name: string } | null
}

interface RawStockAuditItemRow {
  id: string
  stock_audit_id: string
  product_unit_id: string
  expected_state: InventoryStateDb
  scanned_state: InventoryStateDb | null
  outcome: StockCheckOutcomeDb
  exclusion_reason: StockCheckExclusionDb | null
  discrepancy_notes: string | null
  scanned_at: string | null
  scanned_by: string | null
  unit: {
    serial_no: string | null
    asset_tag: string
    barcode: string | null
    rack: string | null
    shelf: string | null
    bin: string | null
    product: { name: string; asset_code: string } | null
  } | null
}

/* ── Mapping ─────────────────────────────────────────────────────────────── */

function toAuditRow(r: RawStockAuditRow): StockAuditListRow {
  return {
    id: r.id,
    auditNo: r.audit_no,
    scope: r.scope,
    status: r.status,
    scheduledDateAd: r.scheduled_date,
    startedAtAd: r.started_at,
    completedAtAd: r.completed_at,
    auditedById: r.audited_by,
    branchId: r.branch_id,
    warehouseId: r.warehouse_id,
    // Null means the embed did not resolve — a query bug. Passed through as
    // null rather than substituted with the warehouse id, which would print a
    // uuid where the operator expects a facility name.
    warehouseName: r.warehouse?.name ?? null,
    totalExpected: r.total_expected,
    totalScanned: r.total_scanned,
    totalDiscrepancies: r.total_discrepancies,
    notes: r.notes,
    createdAtAd: r.created_at,
  }
}

function toItemRow(r: RawStockAuditItemRow): StockAuditItemRow {
  return {
    id: r.id,
    stockAuditId: r.stock_audit_id,
    productUnitId: r.product_unit_id,
    expectedState: r.expected_state,
    scannedState: r.scanned_state,
    outcome: r.outcome,
    exclusionReason: r.exclusion_reason,
    discrepancyNotes: r.discrepancy_notes,
    scannedAtAd: r.scanned_at,
    scannedById: r.scanned_by,
    serialNo: r.unit?.serial_no ?? null,
    assetTag: r.unit?.asset_tag ?? null,
    barcode: r.unit?.barcode ?? null,
    rack: r.unit?.rack ?? null,
    shelf: r.unit?.shelf ?? null,
    bin: r.unit?.bin ?? null,
    productName: r.unit?.product?.name ?? null,
    productAssetCode: r.unit?.product?.asset_code ?? null,
  }
}

/* ── The session list ────────────────────────────────────────────────────── */

export interface ListStockAuditsOptions extends ListFilters {
  /** Ask for the total matching count. Costs an extra planner pass, so it is opt-in. */
  withCount?: boolean
}

/**
 * The stock-take sessions, most recently scheduled first.
 *
 * ⚠ Returns `{ rows: [] }` for an external `Client` session — that is RLS, not
 * emptiness. Gate the screen with `stockAuditRestriction()`; read the header.
 */
export async function listStockAudits(opts: ListStockAuditsOptions = {}): Promise<ListQueryResult<StockAuditListRow>> {
  const { withCount, ...filters } = opts

  const base = supabase.from('stock_audits').select(AUDIT_COLUMNS, withCount ? { count: 'exact' } : undefined)

  const query = applyListFilters(base, {
    ...filters,
    searchColumns: filters.searchColumns ?? AUDIT_SEARCH_COLUMNS,
    // Newest scheduled first — an operator opening this screen is looking for
    // the current count, not the archive.
    sort: filters.sort ?? { column: 'scheduled_date', ascending: false },
    // Deterministic paging — see PAGINATION in `listQuery.ts`. `stock_audits.id`
    // is `uuid not null default gen_random_uuid() primary key` (0004:612).
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawStockAuditRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listStockAudits failed: ${error.message}`)

  return { rows: (data ?? []).map(toAuditRow), total: count ?? null }
}

/* ── Named filter sets ───────────────────────────────────────────────────── */

/**
 * The session picker's baseline — what the list MEANS before anyone touches a
 * control. Pass it to `useList` as `{ baseline }` so an empty result reads as
 * "no audits yet" rather than as over-filtered.
 */
export function recentAudits(): ListFilters {
  return { sort: { column: 'scheduled_date', ascending: false } }
}

/**
 * One audit's manifest.
 *
 * Sorted by `outcome` DESCENDING, which is Postgres enum declaration order
 * reversed — `Left unverified`, then `Confirmed missing`, then `Found`
 * (0001's declaration is Found · Confirmed missing · Left unverified, restated
 * by the generated `stock_check_outcome`). The units still to be walked come
 * first, which is the order a person holding a scanner reads the list in.
 *
 * An empty `auditId` produces an EMPTY chip group — no constraint sent, and
 * `listStockAuditItems` refuses to run without one (see its guard). It never
 * becomes `in.('')`, which Postgres would 400 as an invalid uuid.
 */
export function itemsOfAudit(auditId: string): ListFilters {
  return {
    chips: { [ITEM_AUDIT_COLUMN]: auditId ? [auditId] : [] },
    sort: { column: ITEM_OUTCOME_COLUMN, ascending: false },
  }
}

/** A manifest set narrowed to given outcomes — the Verified/Unverified/Missing chips, server-side. */
export function withOutcomes(base: ListFilters, outcomes: readonly StockCheckOutcomeDb[]): ListFilters {
  return { ...base, chips: { ...base.chips, [ITEM_OUTCOME_COLUMN]: [...outcomes] } }
}

/**
 * The KPI strip as count queries — one-row pages read for `total` only, the
 * `AUDIT_KPI_FILTERS` / `INVENTORY_KPI_FILTERS` pattern exactly. Counted from
 * the ITEMS, never read from `stock_audits`' stored totals, which nothing
 * reconciles (see `StockAuditListRow.totalExpected`).
 */
const COUNT_PAGE: ListFilters['page'] = { index: 0, size: 1 }

export function auditItemKpiFilters(
  auditId: string,
): Record<'expected' | 'found' | 'unverified' | 'missing', ListFilters> {
  const base = itemsOfAudit(auditId)
  return {
    expected: { ...base, page: COUNT_PAGE },
    found: { ...withOutcomes(base, ['Found'] satisfies StockCheckOutcomeDb[]), page: COUNT_PAGE },
    unverified: { ...withOutcomes(base, ['Left unverified'] satisfies StockCheckOutcomeDb[]), page: COUNT_PAGE },
    missing: { ...withOutcomes(base, ['Confirmed missing'] satisfies StockCheckOutcomeDb[]), page: COUNT_PAGE },
  }
}

/* ── The manifest list ───────────────────────────────────────────────────── */

export interface ListStockAuditItemsOptions extends ListFilters {
  withCount?: boolean
}

/**
 * One audit's manifest lines, unit identity resolved through the `_v` views.
 *
 * Refuses to run without a `stock_audit_id` constraint, and the refusal is a
 * short-circuit rather than an error: an unidentified audit has no manifest by
 * definition, `in.('')` would be a Postgres 400 (invalid uuid) surfaced to an
 * operator who merely has nothing selected yet, and an UNconstrained read
 * would fetch every audit's items — never what rendering one manifest means.
 * Same shape as `listUnits`' empty-`productId` guard in `queries/inventory.ts`.
 */
export async function listStockAuditItems(
  opts: ListStockAuditItemsOptions = {},
): Promise<ListQueryResult<StockAuditItemRow>> {
  const { withCount, ...filters } = opts

  const auditIds = (filters.chips?.[ITEM_AUDIT_COLUMN] ?? []).filter((v) => v)
  if (auditIds.length === 0) return { rows: [], total: 0 }

  const base = supabase.from('stock_audit_items').select(ITEM_COLUMNS, withCount ? { count: 'exact' } : undefined)

  const query = applyListFilters(base, {
    ...filters,
    // No search default: the base table's only searchable text is
    // `discrepancy_notes`, and matching a scanned code is `findStockAuditItemByCode`'s
    // job — exact, not a substring ilike.
    sort: filters.sort ?? { column: ITEM_OUTCOME_COLUMN, ascending: false },
    // `stock_audit_items.id` — `uuid not null default gen_random_uuid() primary key` (0004:644).
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawStockAuditItemRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listStockAuditItems failed: ${error.message}`)

  return { rows: (data ?? []).map(toItemRow), total: count ?? null }
}

/* ── The scan lookup ─────────────────────────────────────────────────────── */

/**
 * Is this scanned code on this audit's manifest? Exact match (case-insensitive)
 * against the unit's `serial_no`, `asset_tag` and `barcode` — the same three
 * columns `queries/inventory.ts` names for an operator scanning a barcode.
 *
 * Server-side, not a `.find()` over fetched rows, because the manifest list the
 * screen holds may be chip-narrowed to one outcome and a scan must be answered
 * against the WHOLE manifest.
 *
 * Mechanics: the unit embed is `!inner` and the `or` is scoped to it
 * (`referencedTable`), so a line whose unit matches none of the three columns
 * is dropped — the semi-join `queries/inventory.ts` verified live for its
 * `unit_state` alias. `ilike` WITHOUT wildcards is exact-but-case-insensitive;
 * the code passes through `sanitiseSearchTerm` first because the `or` string
 * has the same shape-injection hazard `listQuery.ts` documents, and a scanner
 * that quietly matches nothing on a comma is a better failure than one that
 * changes the filter's shape.
 *
 * Returns the matching line, or null for "not on this manifest" — which is a
 * statement about WHERE the scanned thing is, never that any expected unit is
 * missing (§7.3).
 */
export async function findStockAuditItemByCode(auditId: string, rawCode: string): Promise<StockAuditItemRow | null> {
  const code = sanitiseSearchTerm(rawCode)
  if (!auditId || !code) return null

  const query = supabase
    .from('stock_audit_items')
    .select(ITEM_LOOKUP_COLUMNS)
    .eq(ITEM_AUDIT_COLUMN, auditId)
    .or(
      ['serial_no', 'asset_tag', 'barcode'].map((c) => `${c}.ilike.${code}`).join(','),
      { referencedTable: UNIT_ALIAS },
    )
    .limit(1)

  const { data, error } = (await query) as unknown as {
    data: RawStockAuditItemRow[] | null
    error: { message: string } | null
  }

  if (error) throw new Error(`findStockAuditItemByCode failed: ${error.message}`)

  const row = (data ?? [])[0]
  return row ? toItemRow(row) : null
}

export { STOCK_CHECK_STATE_META, type StockCheckUnitState } from '../../data/stockCheck'
