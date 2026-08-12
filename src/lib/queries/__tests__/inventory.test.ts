import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CATEGORY_COLUMN,
  INVENTORY_CHIPS,
  INVENTORY_STATES,
  RECORD_STATE_COLUMN,
  SERIALISATION_COLUMN,
  UNIT_CONDITIONS,
  UNIT_CONDITION_COLUMN,
  UNIT_STATE_COLUMN,
  catalogue,
  inventoryChip,
  inventorySort,
  listInventory,
  listUnits,
  ofCategory,
  ofTrackingMode,
  unitsInCondition,
  unitsInState,
  type InventoryListRow,
  type InventoryUnitRow,
} from '../inventory'
import { SORTS } from '../../../data/inventory'

/**
 * # What this suite pins
 *
 * Three things in `inventory.ts` can break every inventory surface at once and
 * are invisible to `listQuery.test.ts`, which tests the builder in isolation and
 * never sees a column name:
 *
 *  1. **The SELECT string.** A column dropped from it does not error — it
 *     arrives `undefined` and renders as a blank cell. A money column ADDED to
 *     it is a Law 6 question. And two of its fragments are conditional
 *     `!inner` semi-joins whose presence has to track a chip group exactly:
 *     present without a filter deletes every quantity-tracked SKU from the
 *     catalogue, absent with a filter is a PostgREST 400.
 *  2. **`toRow`**, where a raw snake_case row becomes the view model — in
 *     particular the per-state counts, which are the numbers the chip row and
 *     §4.3's count invariant are read from.
 *  3. **The enum literals in the named filter sets.** PostgREST hands an
 *     unknown enum value straight to Postgres, which answers `22P02 invalid
 *     input value for enum inventory_state` — a 400 that blanks the screen.
 *     Verified live on 12 Aug 2026 with `status=in.(Sub-rented)`.
 *
 * The `supabase` module is replaced wholesale rather than stubbed at the network
 * layer: this file asserts on the exact arguments the query builder receives,
 * which is the only place a wrong column name is still visible as text. Nothing
 * here reaches a database.
 */

const db = vi.hoisted(() => {
  interface State {
    /** The relation `from()` was called with — must be a `_v` view, never a base table. */
    table: string
    /** The literal string handed to `.select()` — the thing a dropped column disappears from. */
    columns: string
    /** `.select()`'s second argument: `{ count: 'exact' }` or `undefined`. */
    selectOptions: unknown
    /** Every filter call, in order, exactly as it was made. */
    calls: Array<[string, ...unknown[]]>
    /** Whether the builder was touched at all — a short-circuit must not touch it. */
    touched: boolean
    rows: unknown[]
    count: number | null
    error: { message: string } | null
  }

  const state: State = {
    table: '',
    columns: '',
    selectOptions: undefined,
    calls: [],
    touched: false,
    rows: [],
    count: null,
    error: null,
  }

  function reset(): void {
    state.table = ''
    state.columns = ''
    state.selectOptions = undefined
    state.calls = []
    state.touched = false
    state.rows = []
    state.count = null
    state.error = null
  }

  /**
   * A recording stand-in for the postgrest builder. Deliberately *thenable*
   * rather than a promise: the query functions `await` the object they have been
   * chaining onto.
   */
  const builder = {
    select(columns: string, options?: unknown) {
      state.columns = columns
      state.selectOptions = options
      return builder
    },
    eq(column: string, value: unknown) {
      state.calls.push(['eq', column, value])
      return builder
    },
    or(filters: string) {
      state.calls.push(['or', filters])
      return builder
    },
    in(column: string, values: readonly unknown[]) {
      state.calls.push(['in', column, [...values]])
      return builder
    },
    gte(column: string, value: unknown) {
      state.calls.push(['gte', column, value])
      return builder
    },
    lte(column: string, value: unknown) {
      state.calls.push(['lte', column, value])
      return builder
    },
    is(column: string, value: unknown) {
      state.calls.push(['is', column, value])
      return builder
    },
    not(column: string, operator: string, value: unknown) {
      state.calls.push(['not', column, operator, value])
      return builder
    },
    order(column: string, options?: unknown) {
      state.calls.push(['order', column, options])
      return builder
    },
    range(from: number, to: number) {
      state.calls.push(['range', from, to])
      return builder
    },
    then(
      onFulfilled: (value: {
        data: unknown[] | null
        error: { message: string } | null
        count: number | null
      }) => unknown,
    ): void {
      onFulfilled({ data: state.rows, error: state.error, count: state.count })
    },
  }

  const supabase = {
    from(table: string) {
      state.table = table
      state.touched = true
      return builder
    },
  }

  return { state, reset, supabase }
})

vi.mock('../../supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

beforeEach(() => {
  db.reset()
})

/**
 * Split the select string into its top-level tokens. The embeds keep their own
 * internal commas, which is fine — none of them is a bare column name, and they
 * are asserted with `toContain` instead.
 */
function selectTokens(): string[] {
  return db.state.columns.split(',').map((t) => t.trim())
}

function occurrences(column: string): number {
  return selectTokens().filter((t) => t === column).length
}

/**
 * The nine money columns `0048_view_row_predicates.sql:616-651` masks on
 * `products_v`, and the two it masks on `product_units_v`
 * (`0048:575-582`). `daily_rate` and `replacement_value` are the only two this
 * module ever names, and only behind `withMoney`.
 */
const PRODUCT_MONEY_COLUMNS = [
  'purchase_price',
  'replacement_value',
  'daily_rate',
  'weekly_rate',
  'monthly_rate',
  'hourly_rate',
  'weekend_rate',
  'deposit_percent',
  'deposit_fixed',
] as const

const MONEY_COLUMNS_NEVER_SELECTED = [
  'weekly_rate',
  'monthly_rate',
  'hourly_rate',
  'weekend_rate',
  'deposit_percent',
  'deposit_fixed',
] as const

/* ── BASE_COLUMNS ─────────────────────────────────────────────────────────── */

describe('the SELECT string', () => {
  it('reads products_v, never the products base table', async () => {
    // 0019:60-70 — reading the base table makes that migration's entire
    // protection dead code.
    await listInventory()
    expect(db.state.table).toBe('products_v')
  })

  it('names every parent column exactly once', async () => {
    // Once, not "at least once": a duplicated column is not an error PostgREST
    // reports, it is a wider request that quietly survives the next edit.
    await listInventory()
    for (const column of [
      'id',
      'asset_code',
      'name',
      'short_name',
      'brand',
      'model',
      'category_id',
      'tracking_mode',
      'status',
      'total_quantity',
      'quantity_unit',
      'is_active',
      'created_at',
    ]) {
      expect(occurrences(column)).toBe(1)
    }
  })

  it('embeds the category with !inner and the units without it', async () => {
    await listInventory()
    // `!inner` on a NOT NULL FK whose table shares products_v's row predicate,
    // so it cannot drop a product — and it is what makes the category facet
    // filterable server-side.
    expect(db.state.columns).toContain('category:inventory_categories!inner ( code, name )')
    // NOT `!inner`: a quantity-tracked SKU has no unit rows, and an inner join
    // here would delete every non-serialised product from the catalogue.
    expect(db.state.columns).toContain('units:product_units_v ( status, condition )')
    expect(db.state.columns).not.toContain('units:product_units_v!inner')
  })

  it('reads the units through product_units_v, never the base table', async () => {
    await listInventory()
    expect(db.state.columns).toContain('product_units_v')
    expect(db.state.columns).not.toMatch(/product_units[^_]/)
  })

  it('names no money column at all by default', async () => {
    // Law 6. Not asking is the first line; the view's mask is the second.
    await listInventory()
    for (const column of PRODUCT_MONEY_COLUMNS) {
      expect(db.state.columns).not.toContain(column)
    }
  })

  it('adds exactly daily_rate and replacement_value when withMoney is set', async () => {
    await listInventory({ withMoney: true })
    expect(occurrences('daily_rate')).toBe(1)
    expect(occurrences('replacement_value')).toBe(1)
    // The other seven masked columns are never selected by any code path here:
    // nothing on the list renders them, and a wider select is how a masked
    // column leaks back in.
    for (const column of MONEY_COLUMNS_NEVER_SELECTED) {
      expect(db.state.columns).not.toContain(column)
    }
    expect(db.state.columns).not.toContain('purchase_price')
  })

  it('disturbs nothing else when withMoney is set', async () => {
    await listInventory({ withMoney: true })
    expect(occurrences('name')).toBe(1)
    expect(db.state.columns).toContain('category:inventory_categories!inner ( code, name )')
    expect(db.state.columns).toContain('units:product_units_v ( status, condition )')
  })

  it('asks for a count only when withCount is set', async () => {
    await listInventory()
    expect(db.state.selectOptions).toBeUndefined()

    db.reset()
    await listInventory({ withCount: true })
    expect(db.state.selectOptions).toEqual({ count: 'exact' })
  })
})

/* ── The conditional !inner semi-joins ────────────────────────────────────── */

describe('the !inner semi-joins track their chip group exactly', () => {
  it('omits the unit_state join when no state chip is set', async () => {
    // Present-without-a-filter is not a harmless extra join: an inner join on
    // product_units_v deletes every Quantity and Consumable SKU from the
    // catalogue, because those have no unit rows to match.
    await listInventory(catalogue())
    expect(db.state.columns).not.toContain('unit_state')
  })

  it('omits the unit_state join for an EMPTY chip group — the All chip', async () => {
    // `[]` means no constraint, never "match nothing". The SELECT and the
    // filters read the same emptiness, so they cannot disagree.
    await listInventory({ chips: { [UNIT_STATE_COLUMN]: [] } })
    expect(db.state.columns).not.toContain('unit_state')
    expect(db.state.calls.map((c) => c[0])).not.toContain('in')
  })

  it('adds the unit_state join exactly when the group narrows', async () => {
    await listInventory(inventoryChip('Missing'))
    expect(db.state.columns).toContain('unit_state:product_units_v!inner ( id )')
    expect(db.state.calls).toContainEqual(['in', UNIT_STATE_COLUMN, ['Missing']])
  })

  it('uses a SEPARATE alias for condition, so the two facets AND across units', async () => {
    // One alias carrying both filters would mean "has a unit that is both In
    // Stock AND Damaged". Two aliases mean "has an In Stock unit, and has a
    // Damaged unit" — which is how the rail reads.
    await listInventory({
      chips: { [UNIT_STATE_COLUMN]: ['In Stock'], [UNIT_CONDITION_COLUMN]: ['Damaged'] },
    })
    expect(db.state.columns).toContain('unit_state:product_units_v!inner ( id )')
    expect(db.state.columns).toContain('unit_condition:product_units_v!inner ( id )')
    expect(db.state.calls).toContainEqual(['in', UNIT_STATE_COLUMN, ['In Stock']])
    expect(db.state.calls).toContainEqual(['in', UNIT_CONDITION_COLUMN, ['Damaged']])
  })

  it('adds the condition join alone when only the condition facet is set', async () => {
    await listInventory(unitsInCondition(['Lost']))
    expect(db.state.columns).toContain('unit_condition:product_units_v!inner ( id )')
    expect(db.state.columns).not.toContain('unit_state')
  })

  it('leaves the unfiltered units embed in place alongside the semi-join', async () => {
    // The whole point of the second alias: the breakdown must stay complete
    // while the parent list narrows. Filtering the `units` embed itself would
    // trim each row's array and report a 4-unit SKU as having 1 unit.
    await listInventory(inventoryChip('On Rent'))
    expect(db.state.columns).toContain('units:product_units_v ( status, condition )')
  })
})

/* ── toRow ────────────────────────────────────────────────────────────────── */

/**
 * A complete raw row, shaped exactly as PostgREST returns it. Every value is
 * distinct so a mapping that reads the wrong field fails rather than
 * coincidentally matching.
 */
const RAW = {
  id: 'a3c9f0e2-1111-4222-8333-444455556666',
  asset_code: 'EQ000234',
  name: 'Sony FX9 Cinema Camera',
  short_name: 'FX9',
  brand: 'Sony',
  model: 'PXW-FX9',
  category_id: 'cat-0001-4000-8000-000000000001',
  tracking_mode: 'Serialised' as const,
  status: 'Active' as const,
  total_quantity: 3,
  quantity_unit: null,
  is_active: true,
  created_at: '2026-07-02T04:15:00+00:00',
  category: { code: 'camera', name: 'Camera' as const },
  units: [
    { status: 'In Stock' as const, condition: 'Good' as const },
    { status: 'In Stock' as const, condition: 'Excellent' as const },
    { status: 'On Rent' as const, condition: 'Good' as const },
    { status: 'Retired' as const, condition: 'Damaged' as const },
  ],
}

async function mapOne(raw: unknown, opts: Parameters<typeof listInventory>[0] = {}): Promise<InventoryListRow> {
  db.state.rows = [raw]
  const { rows } = await listInventory(opts)
  const row = rows[0]
  if (!row) throw new Error('expected exactly one mapped row')
  return row
}

describe('toRow — raw DB row → InventoryListRow', () => {
  it('maps every parent column onto its view-model field', async () => {
    const row = await mapOne(RAW)
    expect(row).toMatchObject({
      id: RAW.id,
      assetCode: 'EQ000234',
      name: 'Sony FX9 Cinema Camera',
      shortName: 'FX9',
      brand: 'Sony',
      model: 'PXW-FX9',
      categoryId: RAW.category_id,
      category: 'Camera',
      categoryCode: 'camera',
      trackingMode: 'Serialised',
      recordState: 'Active',
      isActive: true,
      totalQuantity: 3,
      quantityUnit: null,
      createdAtAd: RAW.created_at,
    })
  })

  it('counts units by state, with a zero for every state that has none', async () => {
    const row = await mapOne(RAW)
    expect(row.unitsByState).toEqual({
      'In Stock': 2,
      Reserved: 0,
      Packed: 0,
      'On Rent': 1,
      Returning: 0,
      Inspection: 0,
      Cleaning: 0,
      Maintenance: 0,
      Missing: 0,
      Retired: 1,
    })
    expect(row.unitCount).toBe(4)
  })

  it('carries every one of the ten states as a key, in enum order', async () => {
    // The chip row reads this record. A sparse map would render a blank where
    // it means nought, and a key missing here is a chip with no number.
    const row = await mapOne(RAW)
    expect(Object.keys(row.unitsByState)).toEqual([...INVENTORY_STATES])
  })

  it('reports §4.3s total-excluding-Retired beside the raw count', async () => {
    // data/inventory.ts:113-121 — "Σ status counts = Total, excluding Retired".
    // Derived from the state counts, never from `retired_at`: nothing in the
    // schema ties `status = 'Retired'` to `retired_at is not null`.
    const row = await mapOne(RAW)
    expect(row.unitCount).toBe(4)
    expect(row.unitCountExcludingRetired).toBe(3)
    expect(row.unitCount - row.unitsByState.Retired).toBe(row.unitCountExcludingRetired)
  })

  it('does NOT drop retired units — Retired is one of the eleven chips', async () => {
    const row = await mapOne(RAW)
    expect(row.unitsByState.Retired).toBe(1)
  })

  it('returns the DISTINCT conditions in severity order, not alphabetically', async () => {
    // `unit_condition` is declared Excellent, Good, Fair, Damaged, Lost
    // (0001:541-547). Sorting alphabetically would put Damaged first and read
    // as a ranking that means nothing.
    const row = await mapOne(RAW)
    expect(row.unitConditions).toEqual(['Excellent', 'Good', 'Damaged'])
  })

  it('handles a quantity-tracked SKU with no units at all', async () => {
    // Real state, not a missing join: `tracking_mode = 'Quantity'` products
    // have no product_units rows. Nothing here may invent a breakdown for them.
    const row = await mapOne({
      ...RAW,
      asset_code: 'EQ000240',
      name: 'BNC Cable 3m',
      tracking_mode: 'Quantity',
      total_quantity: 200,
      quantity_unit: 'piece',
      units: [],
    })
    expect(row.unitCount).toBe(0)
    expect(row.unitCountExcludingRetired).toBe(0)
    expect(row.unitConditions).toEqual([])
    expect(Object.values(row.unitsByState).every((n) => n === 0)).toBe(true)
    // `total_quantity` is the ONLY quantity column that exists. There is no
    // available/on-hand column anywhere in the schema, so nothing derives one.
    expect(row.totalQuantity).toBe(200)
  })

  it('treats a null units array the same as an empty one', async () => {
    const row = await mapOne({ ...RAW, units: null })
    expect(row.unitCount).toBe(0)
    expect(row.unitsByState['In Stock']).toBe(0)
  })

  it('withholds money unless the caller asked, and never renders it as zero', async () => {
    // `null` means "not asked for" or "this session may not see money". It never
    // means free — `rupees(0)` would state that a camera rents for nothing.
    const row = await mapOne(RAW)
    expect(row.dailyRate).toBeNull()
    expect(row.replacementValue).toBeNull()
  })

  it('converts numeric rupees to integer paisa when money was requested', async () => {
    // 0047:63 seeds `daily_rate` as 6500.00 rupees; lib/money.ts works in paisa.
    // The wrong direction renders every rate 100x too small.
    const row = await mapOne({ ...RAW, daily_rate: 6500, replacement_value: 1450000 }, { withMoney: true })
    expect(row.dailyRate).toBe(650000)
    expect(row.replacementValue).toBe(145000000)
  })

  it('keeps a masked money column null rather than collapsing it to zero', async () => {
    // What a Warehouse session receives from products_v: the column is present
    // and NULL, because auth_can_view_money() failed.
    const row = await mapOne({ ...RAW, daily_rate: null, replacement_value: null }, { withMoney: true })
    expect(row.dailyRate).toBeNull()
    expect(row.replacementValue).toBeNull()
  })

  it('passes an unresolved category join through as null rather than inventing one', async () => {
    // `category_id` is NOT NULL against a FK and the embed is !inner, so this is
    // a query bug, not a data state — and it must be visible as one, not
    // papered over with the id or with 'Other'.
    const row = await mapOne({ ...RAW, category: null })
    expect(row.category).toBeNull()
    expect(row.categoryCode).toBeNull()
    expect(row.categoryId).toBe(RAW.category_id)
  })

  it('surfaces a query error rather than returning an empty list', async () => {
    db.state.error = { message: 'permission denied for column daily_rate' }
    await expect(listInventory()).rejects.toThrow(/listInventory failed/)
  })
})

/* ── Named filter sets ────────────────────────────────────────────────────── */

describe('named filter sets → ListFilters', () => {
  it('catalogue excludes Archived and keeps Draft', async () => {
    // Archived is the catalogue's Law 3 terminal state — there is no delete.
    // Draft is products.status' DEFAULT (0004:96), so excluding it would hide
    // freshly added equipment from the screen that just added it.
    const states = catalogue().chips?.[RECORD_STATE_COLUMN] ?? []
    expect([...states].sort()).toEqual(['Active', 'Draft'])
    expect(states).not.toContain('Archived')
  })

  it('catalogue sorts by name and asserts nothing else', () => {
    expect(catalogue()).toEqual({
      chips: { [RECORD_STATE_COLUMN]: ['Draft', 'Active'] },
      sort: { column: 'name', ascending: true },
    })
  })

  it('inventoryChip("All") returns the baseline UNCHANGED, with no unit_state key', () => {
    // Not an empty group: omitting the key entirely is what makes useList's
    // narrowingKey read the All chip as identical to the baseline, so an empty
    // catalogue offers "Add" rather than a "Clear filters" button that clears
    // nothing.
    expect(inventoryChip('All')).toEqual(catalogue())
    expect(Object.keys(inventoryChip('All').chips ?? {})).not.toContain(UNIT_STATE_COLUMN)
  })

  it('inventoryChip narrows on the unit state while keeping the record-state baseline', () => {
    expect(inventoryChip('Maintenance')).toEqual({
      chips: {
        [RECORD_STATE_COLUMN]: ['Draft', 'Active'],
        [UNIT_STATE_COLUMN]: ['Maintenance'],
      },
      sort: { column: 'name', ascending: true },
    })
  })

  it('has exactly eleven chips: All plus the ten inventory_state members', () => {
    // The brief for this module said six. There are eleven
    // (data/inventory.ts:99-111).
    expect(INVENTORY_CHIPS).toHaveLength(11)
    expect(INVENTORY_CHIPS[0]).toBe('All')
    expect(INVENTORY_CHIPS.slice(1)).toEqual([...INVENTORY_STATES])
  })

  it('every one of the eleven chips produces a filter set with a real column', () => {
    for (const chip of INVENTORY_CHIPS) {
      const set = inventoryChip(chip)
      const states = set.chips?.[UNIT_STATE_COLUMN]
      if (chip === 'All') {
        expect(states).toBeUndefined()
      } else {
        expect(states).toEqual([chip])
        expect(INVENTORY_STATES).toContain(chip)
      }
      // The catalogue baseline survives every chip.
      expect(set.chips?.[RECORD_STATE_COLUMN]).toEqual(['Draft', 'Active'])
    }
  })

  it('never emits a state that inventory_state does not have', () => {
    // PostgREST hands an unknown member straight to Postgres: 22P02, a 400 that
    // blanks the screen. 'Sub-rented' reads plausible and is not a member.
    for (const chip of INVENTORY_CHIPS) {
      const states = inventoryChip(chip).chips?.[UNIT_STATE_COLUMN] ?? []
      for (const state of states) expect(INVENTORY_STATES).toContain(state)
      expect(states).not.toContain('Sub-rented')
    }
  })

  it('unitsInState keeps an empty selection as an empty group, never as match-nothing', () => {
    expect(unitsInState([])).toEqual({ chips: { [UNIT_STATE_COLUMN]: [] } })
    expect(unitsInState(['Packed', 'Returning'])).toEqual({
      chips: { [UNIT_STATE_COLUMN]: ['Packed', 'Returning'] },
    })
  })

  it('unitsInCondition, ofCategory and ofTrackingMode target their real columns', () => {
    expect(unitsInCondition(['Fair'])).toEqual({ chips: { [UNIT_CONDITION_COLUMN]: ['Fair'] } })
    expect(ofCategory(['Camera', 'Lens'])).toEqual({ chips: { [CATEGORY_COLUMN]: ['Camera', 'Lens'] } })
    expect(ofTrackingMode(['Quantity', 'Consumable'])).toEqual({
      chips: { [SERIALISATION_COLUMN]: ['Quantity', 'Consumable'] },
    })
  })

  it('names the two status columns apart so they cannot collide in one filter set', () => {
    // Two different columns called `status`, on two different tables, in one
    // screen: products.status (product_record_state) and product_units.status
    // (inventory_state).
    expect(RECORD_STATE_COLUMN).toBe('status')
    expect(UNIT_STATE_COLUMN).toBe('unit_state.status')
    expect(RECORD_STATE_COLUMN).not.toBe(UNIT_STATE_COLUMN)
  })
})

/* ── The calls that actually reach the builder ────────────────────────────── */

describe('named filter sets → the calls the builder receives', () => {
  it('a chip sends both IN filters, the default sort and the tiebreak', async () => {
    await listInventory(inventoryChip('Missing'))
    expect(db.state.calls).toEqual([
      ['in', RECORD_STATE_COLUMN, ['Draft', 'Active']],
      ['in', UNIT_STATE_COLUMN, ['Missing']],
      ['order', 'name', { ascending: true }],
      // Deterministic paging — `name` is not unique, so without this a paged
      // catalogue can repeat one row and drop another.
      ['order', 'id', { ascending: true }],
    ])
  })

  it('the category facet filters through the embed alias', async () => {
    await listInventory(ofCategory(['Lighting']))
    expect(db.state.calls).toContainEqual(['in', 'category.name', ['Lighting']])
  })

  it('defaults the search columns to the four that exist on products_v', async () => {
    // `serial_no` is deliberately absent — it is on product_units, a different
    // table, and searching it is listUnits' job.
    await listInventory({ search: 'FX9' })
    expect(db.state.calls).toContainEqual([
      'or',
      'name.ilike.*FX9*,asset_code.ilike.*FX9*,brand.ilike.*FX9*,model.ilike.*FX9*',
    ])
    expect(db.state.columns).not.toContain('serial_no')
  })

  it('pages with a deterministic order', async () => {
    await listInventory({ ...catalogue(), page: { index: 2, size: 25 } })
    expect(db.state.calls).toContainEqual(['range', 50, 74])
    expect(db.state.calls).toContainEqual(['order', 'id', { ascending: true }])
  })

  it('lets a caller override the sort without losing the tiebreak', async () => {
    await listInventory({ sort: { column: 'asset_code', ascending: false } })
    expect(db.state.calls).toContainEqual(['order', 'asset_code', { ascending: false }])
    // The tiebreak follows the primary sort's direction, so flipping a header
    // reverses the list exactly.
    expect(db.state.calls).toContainEqual(['order', 'id', { ascending: false }])
  })
})

/* ── inventorySort ────────────────────────────────────────────────────────── */

describe('inventorySort — the five sort options', () => {
  it('maps the three that have a column', () => {
    expect(inventorySort('Equipment A–Z')).toEqual({ column: 'name', ascending: true })
    expect(inventorySort('Equipment Z–A')).toEqual({ column: 'name', ascending: false })
    // PostgREST spells embedded ordering `alias(column)`; `alias.column` is a
    // 400 PGRST100. Verified live, both spellings.
    expect(inventorySort('Category A–Z')).toEqual({ column: 'category(name)', ascending: true })
  })

  it('returns null for the two that have none, rather than a plausible substitute', () => {
    // 'Units, most first' is count(*) over product_units grouped by product_id —
    // there is no materialised count on products, and `total_quantity` is 0 on
    // every serialised SKU. 'Needs attention first' is a weighted sum whose
    // weights live in the app, not the schema.
    expect(inventorySort('Units, most first')).toBeNull()
    expect(inventorySort('Needs attention first')).toBeNull()
  })

  it('handles every SortKey the screen can produce', () => {
    // If a sixth option is added to SORTS, the switch stops being exhaustive and
    // this fails rather than silently returning undefined.
    for (const key of SORTS) {
      const result = inventorySort(key)
      expect(result === null || typeof result.column === 'string').toBe(true)
    }
  })
})

/* ── listUnits ────────────────────────────────────────────────────────────── */

const RAW_UNIT = {
  id: 'u1111111-1111-4111-8111-111111111111',
  product_id: RAW.id,
  serial_no: 'SN-CAM-0001',
  asset_tag: 'EQ000234-U01',
  barcode: '8901234567890',
  qr_code: 'QR-FX9-01',
  status: 'Packed' as const,
  condition: 'Excellent' as const,
  branch_id: 'b0000000-0000-4000-8000-000000000001',
  warehouse_id: 'w0000000-0000-4000-8000-000000000001',
  storage_zone_id: 'z0000000-0000-4000-8000-000000000001',
  rack: 'R-04',
  shelf: 'A1',
  bin: 'D4',
  container_id: 'c0000000-0000-4000-8000-000000000001',
  running_hours: 412.5,
  last_maintenance_at: '2026-05-01T06:00:00+00:00',
  next_maintenance_at: '2026-11-01T06:00:00+00:00',
  warranty_expires_at: '2027-03-31',
  insurance_expires_at: '2026-12-31',
  retired_at: null,
  retirement_reason: null,
}

async function mapOneUnit(raw: unknown, opts: Parameters<typeof listUnits>[1] = {}): Promise<InventoryUnitRow> {
  db.state.rows = [raw]
  const { rows } = await listUnits(RAW.id, opts)
  const row = rows[0]
  if (!row) throw new Error('expected exactly one mapped unit')
  return row
}

describe('listUnits — the per-serial expansion', () => {
  it('reads product_units_v, never the base table', async () => {
    await listUnits(RAW.id)
    expect(db.state.table).toBe('product_units_v')
  })

  it('scopes to the product and orders by the NOT NULL asset_tag', async () => {
    await listUnits(RAW.id)
    expect(db.state.calls).toEqual([
      ['eq', 'product_id', RAW.id],
      // `serial_no` is nullable (0004:194); sorting on it would bunch every
      // untagged unit at one end under a rule Postgres, not this app, chose.
      ['order', 'asset_tag', { ascending: true }],
      ['order', 'id', { ascending: true }],
    ])
  })

  it('short-circuits an empty product id WITHOUT touching the builder', async () => {
    // `.eq('product_id', '')` is a Postgres 400 (invalid uuid), surfaced as a
    // failed panel on a row somebody merely expanded.
    const result = await listUnits('')
    expect(result).toEqual({ rows: [], total: 0 })
    expect(db.state.touched).toBe(false)
  })

  it('names no money column by default and exactly two with withMoney', async () => {
    await listUnits(RAW.id)
    expect(db.state.columns).not.toContain('purchase_price')
    expect(db.state.columns).not.toContain('replacement_value')

    db.reset()
    await listUnits(RAW.id, { withMoney: true })
    expect(occurrences('purchase_price')).toBe(1)
    expect(occurrences('replacement_value')).toBe(1)
  })

  it('searches the three identifier columns, since serial_no is nullable', async () => {
    await listUnits(RAW.id, { search: 'SN-CAM' })
    expect(db.state.calls).toContainEqual([
      'or',
      'serial_no.ilike.*SN-CAM*,asset_tag.ilike.*SN-CAM*,barcode.ilike.*SN-CAM*',
    ])
  })

  it('maps every unit column onto its view-model field', async () => {
    const unit = await mapOneUnit(RAW_UNIT)
    expect(unit).toEqual({
      id: RAW_UNIT.id,
      productId: RAW.id,
      serialNo: 'SN-CAM-0001',
      assetTag: 'EQ000234-U01',
      barcode: '8901234567890',
      qrCode: 'QR-FX9-01',
      state: 'Packed',
      condition: 'Excellent',
      branchId: RAW_UNIT.branch_id,
      warehouseId: RAW_UNIT.warehouse_id,
      storageZoneId: RAW_UNIT.storage_zone_id,
      rack: 'R-04',
      shelf: 'A1',
      bin: 'D4',
      containerId: RAW_UNIT.container_id,
      runningHours: 412.5,
      lastMaintenanceAtAd: RAW_UNIT.last_maintenance_at,
      nextMaintenanceAtAd: RAW_UNIT.next_maintenance_at,
      warrantyExpiresAd: '2027-03-31',
      insuranceExpiresAd: '2026-12-31',
      retiredAtAd: null,
      retirementReason: null,
      purchasePrice: null,
      replacementValue: null,
    })
  })

  it('passes a null serial through, inventing nothing from the asset tag', async () => {
    // `serial_no` is nullable in the schema; the mock's ChildRow.serial is not.
    // Substituting the asset tag would print a manufacturer serial that does not
    // exist. `assetTag` is the NOT NULL, unique column and is the correct key.
    const unit = await mapOneUnit({ ...RAW_UNIT, serial_no: null })
    expect(unit.serialNo).toBeNull()
    expect(unit.assetTag).toBe('EQ000234-U01')
  })

  it('reports retirement without reconciling it against the state', async () => {
    // Nothing in the schema ties `status = 'Retired'` to `retired_at is not
    // null` — no trigger, no CHECK. Both are returned as they are.
    const unit = await mapOneUnit({
      ...RAW_UNIT,
      status: 'Missing',
      retired_at: '2026-06-01T09:00:00+00:00',
      retirement_reason: 'Written off after flood damage',
    })
    expect(unit.state).toBe('Missing')
    expect(unit.retiredAtAd).toBe('2026-06-01T09:00:00+00:00')
    expect(unit.retirementReason).toBe('Written off after flood damage')
  })

  it('converts unit money rupees → paisa, preserving a masked null', async () => {
    const unit = await mapOneUnit({ ...RAW_UNIT, purchase_price: 1450000, replacement_value: null }, { withMoney: true })
    expect(unit.purchasePrice).toBe(145000000)
    expect(unit.replacementValue).toBeNull()
  })

  it('surfaces a query error rather than returning an empty list', async () => {
    db.state.error = { message: 'JWT expired' }
    await expect(listUnits(RAW.id)).rejects.toThrow(/listUnits failed/)
  })

  it('asks for a count only when withCount is set', async () => {
    await listUnits(RAW.id)
    expect(db.state.selectOptions).toBeUndefined()

    db.reset()
    await listUnits(RAW.id, { withCount: true })
    expect(db.state.selectOptions).toEqual({ count: 'exact' })
  })
})

/* ── Enum coverage ────────────────────────────────────────────────────────── */

describe('enum coverage', () => {
  it('lists the ten inventory_state members in the enum/chip order', () => {
    // 0001_enums.sql:527-538. The declaration order IS the chip order, which is
    // why one constant can be both.
    expect([...INVENTORY_STATES]).toEqual([
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
    ])
  })

  it('lists the five unit_condition members in severity order', () => {
    // 0001_enums.sql:541-547.
    expect([...UNIT_CONDITIONS]).toEqual(['Excellent', 'Good', 'Fair', 'Damaged', 'Lost'])
  })

  it('keeps the state list and the counts record in step', async () => {
    // Two independent guards on the same fact: `satisfies` proves each member of
    // INVENTORY_STATES is real, and the counts record's annotation proves the
    // set is complete. This checks they describe the same ten.
    const row = await mapOne(RAW)
    expect(Object.keys(row.unitsByState).sort()).toEqual([...INVENTORY_STATES].sort())
  })
})
