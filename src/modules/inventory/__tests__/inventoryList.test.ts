import { describe, expect, it, vi } from 'vitest'

/**
 * # Inventory list — the vocabulary, the filter set and the row mapping, pinned
 *
 * This screen used to touch no database at all: eight hand-typed `PARENTS`
 * rows, a `.filter()` over them inside a `useMemo`, a five-way `switch` of
 * `.sort()` calls and a `.slice()` for paging — under eleven chips whose counts
 * summed to **2486** and a six-card KPI strip read out of the same eleven
 * integers, above a table of seventeen units.
 *
 * What replaced it is three things, and each fails SILENTLY when it is wrong:
 *
 *  1. **the vocabulary** — the options a facet offers. `inventory_state`,
 *     `unit_condition`, `product_category` and `product_tracking_mode` are real
 *     Postgres enums, so a value that is not a member is `22P02 invalid input
 *     value for enum` — a 400 that blanks the screen rather than an empty list.
 *     The mock's own vocabulary was wrong in two places that would do exactly
 *     that: the Serialisation facet offered `'Non-serialised'`, which is not a
 *     `product_tracking_mode`, and the Category facet offered seven values
 *     derived from eight hand-typed rows for a seventeen-member enum.
 *  2. **chip + rail + sort → `ListFilters`** — where the failure is quieter
 *     still. `applyListFilters` reads an EMPTY chip array as "no constraint", so
 *     a narrowing that collapses to nothing returns the entire catalogue: the
 *     widest possible answer to the narrowest possible question, with no error
 *     anywhere.
 *  3. **row → what the table may say** — the mapping decides what the screen is
 *     allowed to claim. The shape it replaced carried `stock: '142 of 200'`
 *     (the 142 has no column in any of the 54 migrations), `bookings: '2
 *     Active'` (three joins away), `location: 'Mixed'` (five columns, not one)
 *     and a `condition` typed onto a SKU that has no units to have one. Every
 *     one looked completely ordinary on screen.
 *
 * ## Why `lib/supabase` is mocked
 *
 * `Inventory.tsx` imports `lib/queries/inventory.ts` for the named filter sets
 * and the column constants, and that module reaches the supabase client — which
 * THROWS at import when the env vars are absent. Replaced wholesale, exactly as
 * `queries/__tests__/inventory.test.ts` and `rentals/__tests__/
 * rentalsList.test.ts` do. Nothing here reaches a database and no query is
 * executed: every assertion is on a plain object or a string.
 */
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

import { FACET_COLUMN, INVENTORY_KPI_FILTERS, inventoryQuery } from '../Inventory'
import {
  CATEGORY_ICON,
  CONDITIONS,
  FILTER_RAIL,
  INV_ORDER,
  INV_STYLE,
  INV_TONE,
  PRODUCT_CATEGORIES,
  SORTS,
  SORT_UNAVAILABLE,
  TRACKING_MODES,
  breakdownOf,
  conditionOf,
  inventoryDetailGroups,
  inventoryGlance,
  stockLabel,
  unitLocationOf,
} from '../../../data/inventory'
import type { FacetKey, SortKey } from '../../../data/inventory'
import {
  CATEGORY_COLUMN,
  INVENTORY_CHIPS,
  INVENTORY_STATES,
  RECORD_STATE_COLUMN,
  SERIALISATION_COLUMN,
  UNIT_CONDITIONS,
  UNIT_CONDITION_COLUMN,
  UNIT_STATE_COLUMN,
  inventorySort,
} from '../../../lib/queries/inventory'
import type { InventoryChip, InventoryListRow, InventoryUnitRow } from '../../../lib/queries/inventory'
import type { ListFilters } from '../../../lib/queries/listQuery'
import type { IntelGlance } from '../../../components/ui/IntelCard'
import { gateContext } from '../../../lib/fieldGating'
import { formatMoney, rupees } from '../../../lib/money'

type Facets = Partial<Record<FacetKey, Set<string>>>

const NO_FACETS: Facets = {}
const A_Z: SortKey = 'Equipment A–Z'

function groupOf(filters: ListFilters, column: string): readonly string[] | undefined {
  return filters.chips?.[column]
}

/** Every state at nought, which is what a quantity-tracked SKU genuinely has. */
function noUnits(): InventoryListRow['unitsByState'] {
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

function row(over: Partial<InventoryListRow> = {}): InventoryListRow {
  const { unitsByState: states, ...rest } = over
  const unitsByState = { ...noUnits(), ...states }
  const unitCount = Object.values(unitsByState).reduce((a, n) => a + n, 0)
  return {
    id: 'p-1',
    assetCode: 'EQ000234',
    name: 'Sony FX9 Cinema Camera',
    shortName: null,
    brand: 'Sony',
    model: 'PXW-FX9',
    categoryId: 'c-1',
    category: 'Camera',
    categoryCode: 'camera',
    trackingMode: 'Serialised',
    recordState: 'Active',
    isActive: true,
    totalQuantity: 0,
    quantityUnit: null,
    createdAtAd: '2026-08-01T04:15:00.000Z',
    unitCount,
    unitCountExcludingRetired: unitCount - unitsByState.Retired,
    unitsByState,
    unitConditions: [],
    dailyRate: null,
    replacementValue: null,
    ...rest,
  }
}

function unit(over: Partial<InventoryUnitRow> = {}): InventoryUnitRow {
  return {
    id: 'u-1',
    productId: 'p-1',
    serialNo: 'SN-CAM-0001',
    assetTag: 'EQ000234-U01',
    barcode: null,
    qrCode: null,
    state: 'In Stock',
    condition: 'Good',
    branchId: 'b-1',
    warehouseId: 'w-1',
    storageZoneId: null,
    rack: null,
    shelf: null,
    bin: null,
    containerId: null,
    runningHours: 0,
    lastMaintenanceAtAd: null,
    nextMaintenanceAtAd: null,
    warrantyExpiresAd: null,
    insuranceExpiresAd: null,
    retiredAtAd: null,
    retirementReason: null,
    purchasePrice: null,
    replacementValue: null,
    ...over,
  }
}

/* ── 1. The vocabulary is the database's, not the mock's ─────────────────── */

describe('the facet vocabularies come from the enums, not from eight hand-typed rows', () => {
  it('INV_ORDER is exactly `inventory_state`, in the enum’s own order', () => {
    // The screen's order and the database's are the same list or the chip row
    // is offering a value Postgres will reject with 22P02.
    expect(INV_ORDER).toEqual([...INVENTORY_STATES])
  })

  it('INV_STYLE covers every state, so no chip can render without a colour and an icon', () => {
    expect(Object.keys(INV_STYLE).sort()).toEqual([...INVENTORY_STATES].sort())
    for (const s of INVENTORY_STATES) {
      expect(INV_TONE[s]).toBeTruthy()
    }
  })

  it('the eleven chips are All plus the ten states', () => {
    expect(INVENTORY_CHIPS).toEqual(['All', ...INV_ORDER])
    expect(INVENTORY_CHIPS).toHaveLength(11)
  })

  it('CONDITIONS is exactly `unit_condition`, worst-last', () => {
    expect([...CONDITIONS]).toEqual([...UNIT_CONDITIONS])
  })

  it('the Serialisation facet offers the three tracking modes, not the mock’s two', () => {
    expect(TRACKING_MODES).toEqual(['Serialised', 'Quantity', 'Consumable'])
    // ⛔ The value the rail used to offer. It is not a `product_tracking_mode`
    // member, so sending it is a 400 rather than an empty list.
    expect(TRACKING_MODES).not.toContain('Non-serialised')
  })

  it('the Category facet offers all seventeen `product_category` members', () => {
    expect(PRODUCT_CATEGORIES).toHaveLength(17)
    expect(PRODUCT_CATEGORIES).toContain('Vehicle')
    expect(PRODUCT_CATEGORIES).toContain('Other')
    expect(new Set(PRODUCT_CATEGORIES).size).toBe(17)
  })

  it('every CATEGORY_ICON key is a real category — an icon for a category that does not exist is dead code', () => {
    for (const key of Object.keys(CATEGORY_ICON)) {
      expect(PRODUCT_CATEGORIES).toContain(key)
    }
    // And the nine without one fall back to the box glyph rather than breaking.
    expect(Object.keys(CATEGORY_ICON).length).toBeLessThan(PRODUCT_CATEGORIES.length)
  })
})

/* ── 2. The filter rail ──────────────────────────────────────────────────── */

describe('FILTER_RAIL — four facets reach a column, ten state why they cannot', () => {
  const live = FILTER_RAIL.filter((r) => r.kind === 'live')
  const blocked = FILTER_RAIL.filter((r) => r.kind === 'blocked')

  it('keeps all fourteen groups of the mockup, in its order', () => {
    expect(FILTER_RAIL).toHaveLength(14)
    expect(FILTER_RAIL.map((r) => r.label)).toEqual([
      'Category',
      'Brand',
      'Status',
      'Location',
      'Warehouse',
      'Case',
      'Booking',
      'Supplier',
      'Purchase Date',
      'Purchase Value',
      'Condition',
      'Serialisation',
      'Tags',
      'Saved Views',
    ])
  })

  it('exactly four are live, and each has a column behind it', () => {
    expect(live.map((r) => r.label)).toEqual(['Category', 'Status', 'Condition', 'Serialisation'])
    for (const r of live) {
      if (r.kind !== 'live') continue
      expect(FACET_COLUMN[r.key]).toBeTruthy()
    }
  })

  it('⛔ Location and Booking are BLOCKED — they filtered the mock and nothing else', () => {
    // Both were `kind: 'live'` and both were wrong: Location is five columns
    // (rack/shelf/bin + warehouse_id + storage_zone_id), Booking is three joins
    // through a money-masked view. A regression here means the screen is
    // filtering on a value it invented.
    for (const label of ['Location', 'Booking']) {
      const r = FILTER_RAIL.find((x) => x.label === label)
      expect(r?.kind).toBe('blocked')
    }
  })

  it('every blocked group states a reason, and none of them is one of the stale claims', () => {
    // The old reasons were factually wrong about the schema and would send the
    // next reader looking for a column that has been there since 0004.
    const stale = [
      'has no brand field',
      'Multi-warehouse is not modelled',
      'not part of the equipment seed',
      'Suppliers arrive with Sub Rental',
      'lives on the Cases tab',
    ]
    for (const r of blocked) {
      if (r.kind !== 'blocked') continue
      expect(r.reason.length).toBeGreaterThan(40)
      for (const claim of stale) expect(r.reason).not.toContain(claim)
    }
  })

  it('Purchase Value is the only money-gated group, so it is the only one a Warehouse session loses', () => {
    const moneyRows = blocked.filter((r) => r.kind === 'blocked' && r.money)
    expect(moneyRows.map((r) => r.label)).toEqual(['Purchase Value'])
  })

  it('every live option is a member of the vocabulary its column accepts', () => {
    const domain: Record<FacetKey, readonly string[]> = {
      Category: PRODUCT_CATEGORIES,
      Status: INV_ORDER,
      Condition: CONDITIONS,
      Serialisation: TRACKING_MODES,
    }
    for (const r of live) {
      if (r.kind !== 'live') continue
      expect(r.options.length).toBeGreaterThan(0)
      for (const o of r.options) expect(domain[r.key]).toContain(o)
    }
  })
})

/* ── 3. chip + rail + sort → ListFilters ─────────────────────────────────── */

describe('inventoryQuery — the chip row', () => {
  it('All is the ABSENCE of a state constraint, never an empty array', () => {
    const q = inventoryQuery('All', NO_FACETS, A_Z)
    // ⛔ `{ 'unit_state.status': [] }` would be read as "no constraint" and
    // return everything — right answer, wrong reason, and it would also put an
    // unfiltered `!inner` join in the SELECT, which deletes every
    // quantity-tracked SKU from the catalogue.
    expect(groupOf(q.filters, UNIT_STATE_COLUMN)).toBeUndefined()
    expect(q.impossible).toBe(false)
  })

  it('each of the ten states narrows on `product_units_v.status` through the semi-join alias', () => {
    for (const state of INVENTORY_STATES) {
      const q = inventoryQuery(state, NO_FACETS, A_Z)
      expect(groupOf(q.filters, UNIT_STATE_COLUMN)).toEqual([state])
      expect(q.impossible).toBe(false)
    }
  })

  it('Retired is a chip like any other — retired units are NOT filtered out', () => {
    // The obvious reading of Law 3 (filter the tombstone out) makes this chip
    // permanently empty, which reads as "nothing has ever been retired".
    const q = inventoryQuery('Retired', NO_FACETS, A_Z)
    expect(groupOf(q.filters, UNIT_STATE_COLUMN)).toEqual(['Retired'])
    expect(q.filters.presence?.['retired_at']).toBeUndefined()
  })

  it('every chip keeps the catalogue baseline — Archived is excluded, Draft is not', () => {
    for (const chip of INVENTORY_CHIPS) {
      const q = inventoryQuery(chip, NO_FACETS, A_Z)
      expect(groupOf(q.filters, RECORD_STATE_COLUMN)).toEqual(['Draft', 'Active'])
    }
  })

  it('no chip ever sends an empty group for any column', () => {
    for (const chip of INVENTORY_CHIPS) {
      const q = inventoryQuery(chip, NO_FACETS, A_Z)
      for (const [column, values] of Object.entries(q.filters.chips ?? {})) {
        expect(values, `${chip} sent an empty group for ${column}`).not.toHaveLength(0)
      }
    }
  })
})

describe('inventoryQuery — the filter rail', () => {
  it('sends the Category facet to `category.name`', () => {
    const q = inventoryQuery('All', { Category: new Set(['Camera', 'Lens']) }, A_Z)
    expect(groupOf(q.filters, CATEGORY_COLUMN)).toEqual(['Camera', 'Lens'])
  })

  it('sends the Condition facet to its OWN `!inner` alias, not the state one', () => {
    const q = inventoryQuery('All', { Condition: new Set(['Damaged']) }, A_Z)
    expect(groupOf(q.filters, UNIT_CONDITION_COLUMN)).toEqual(['Damaged'])
    // Two facets over two aliases mean "has a Damaged unit AND has an In Stock
    // unit" — possibly different units. One alias would mean one unit that is
    // both, which is not how the rail reads.
    expect(UNIT_CONDITION_COLUMN).not.toBe(UNIT_STATE_COLUMN)
  })

  it('sends the Serialisation facet to the parent’s own `tracking_mode` — no join at all', () => {
    const q = inventoryQuery('All', { Serialisation: new Set(['Quantity', 'Consumable']) }, A_Z)
    expect(groupOf(q.filters, SERIALISATION_COLUMN)).toEqual(['Quantity', 'Consumable'])
  })

  it('ANDs across groups and ORs inside one, which is how a filter rail reads', () => {
    const q = inventoryQuery(
      'All',
      { Category: new Set(['Camera']), Condition: new Set(['Good', 'Fair']), Serialisation: new Set(['Serialised']) },
      A_Z,
    )
    expect(groupOf(q.filters, CATEGORY_COLUMN)).toEqual(['Camera'])
    expect(groupOf(q.filters, UNIT_CONDITION_COLUMN)).toEqual(['Good', 'Fair'])
    expect(groupOf(q.filters, SERIALISATION_COLUMN)).toEqual(['Serialised'])
  })

  it('a facet the operator emptied sends NO group — never `in(col, [])`', () => {
    const q = inventoryQuery('All', { Category: new Set(), Condition: new Set() }, A_Z)
    expect(groupOf(q.filters, CATEGORY_COLUMN)).toBeUndefined()
    expect(groupOf(q.filters, UNIT_CONDITION_COLUMN)).toBeUndefined()
    expect(q.impossible).toBe(false)
  })

  it('produces the same object for the same input whatever order the facets were built in', () => {
    // `useList` keys its fetch on `filterKey(filters)`. Two spellings of one
    // filter set must not refetch on every render.
    const a = inventoryQuery('Packed', { Category: new Set(['Camera']), Condition: new Set(['Good']) }, A_Z)
    const b = inventoryQuery('Packed', { Condition: new Set(['Good']), Category: new Set(['Camera']) }, A_Z)
    expect(JSON.stringify(a.filters)).toBe(JSON.stringify(b.filters))
  })
})

describe('inventoryQuery — the chip and the Status facet are two controls over ONE column', () => {
  it('intersects them rather than letting the later one win', () => {
    const q = inventoryQuery('On Rent', { Status: new Set(['On Rent', 'Missing']) }, A_Z)
    expect(groupOf(q.filters, UNIT_STATE_COLUMN)).toEqual(['On Rent'])
    expect(q.impossible).toBe(false)
  })

  it('⛔ a disjoint pair is `impossible`, and does NOT become an empty group', () => {
    const q = inventoryQuery('Packed', { Status: new Set(['Missing']) }, A_Z)
    expect(q.impossible).toBe(true)
    // The trap: an empty array is "no constraint", so sending it would return
    // the WHOLE catalogue for a filter pair that can match nothing. The screen
    // short-circuits on `impossible` and never calls the query.
    expect(groupOf(q.filters, UNIT_STATE_COLUMN)).not.toHaveLength(0)
  })

  it('the Status facet alone narrows without the chip', () => {
    const q = inventoryQuery('All', { Status: new Set(['Missing', 'Maintenance']) }, A_Z)
    expect(groupOf(q.filters, UNIT_STATE_COLUMN)).toEqual(['Missing', 'Maintenance'])
  })
})

describe('inventoryQuery — sorting', () => {
  it('maps the three sorts that have a column', () => {
    expect(inventoryQuery('All', NO_FACETS, 'Equipment A–Z').filters.sort).toEqual({ column: 'name', ascending: true })
    expect(inventoryQuery('All', NO_FACETS, 'Equipment Z–A').filters.sort).toEqual({ column: 'name', ascending: false })
    // PostgREST spells an embedded order `alias(column)`. The sibling
    // `category.name` is a 400 PGRST100.
    expect(inventoryQuery('All', NO_FACETS, 'Category A–Z').filters.sort).toEqual({
      column: 'category(name)',
      ascending: true,
    })
  })

  it('the two sorts with no column say so, and fall back to name rather than sorting the page', () => {
    for (const key of ['Units, most first', 'Needs attention first'] as const) {
      const q = inventoryQuery('All', NO_FACETS, key)
      expect(q.sortUnavailable).toBeTruthy()
      expect(q.sortUnavailable?.length).toBeGreaterThan(40)
      expect(q.filters.sort).toEqual({ column: 'name', ascending: true })
    }
  })

  it('SORT_UNAVAILABLE covers exactly the sorts the query module cannot map', () => {
    for (const key of SORTS) {
      const mapped = inventorySort(key)
      expect(Boolean(SORT_UNAVAILABLE[key]), `${key}`).toBe(mapped === null)
      expect(inventoryQuery('All', NO_FACETS, key).sortUnavailable === null).toBe(mapped !== null)
    }
  })
})

/* ── 4. The KPI strip ────────────────────────────────────────────────────── */

describe('INVENTORY_KPI_FILTERS — six counts of MODELS', () => {
  const entries = Object.entries(INVENTORY_KPI_FILTERS) as Array<[string, ListFilters]>

  it('is six named sets, each asking for one row and reading the count', () => {
    expect(entries).toHaveLength(6)
    for (const [name, filters] of entries) {
      expect(filters.page, name).toEqual({ index: 0, size: 1 })
      expect(groupOf(filters, RECORD_STATE_COLUMN), name).toEqual(['Draft', 'Active'])
    }
  })

  it('the catalogue card carries no state constraint; the five state cards carry exactly one each', () => {
    expect(groupOf(INVENTORY_KPI_FILTERS.models, UNIT_STATE_COLUMN)).toBeUndefined()
    const states = [
      INVENTORY_KPI_FILTERS.inStock,
      INVENTORY_KPI_FILTERS.onRent,
      INVENTORY_KPI_FILTERS.reserved,
      INVENTORY_KPI_FILTERS.maintenance,
      INVENTORY_KPI_FILTERS.missing,
    ]
    const picked = states.map((f) => groupOf(f, UNIT_STATE_COLUMN))
    expect(picked).toEqual([['In Stock'], ['On Rent'], ['Reserved'], ['Maintenance'], ['Missing']])
    // Five different questions, so five different filter sets.
    expect(new Set(states.map((f) => JSON.stringify(f))).size).toBe(5)
    for (const s of picked) expect(INVENTORY_STATES).toContain(s?.[0])
  })
})

/* ── 5. Row → what the table is allowed to say ───────────────────────────── */

describe('stockLabel — and the figure that does not exist', () => {
  it('a serialised model states its live units', () => {
    expect(stockLabel(row({ unitsByState: { ...noUnits(), 'In Stock': 1, Reserved: 1, 'On Rent': 1 } }))).toBe('3 units')
  })

  it('says "1 unit", not "1 units"', () => {
    expect(stockLabel(row({ unitsByState: { ...noUnits(), 'In Stock': 1 } }))).toBe('1 unit')
  })

  it('states retired units separately, so the figure and the breakdown beside it reconcile', () => {
    const r = row({ unitsByState: { ...noUnits(), 'In Stock': 2, Retired: 1 } })
    expect(stockLabel(r)).toBe('2 units · 1 retired')
    // The breakdown still lists all three, so the two cells agree.
    expect(breakdownOf(r).reduce((a, b) => a + b.count, 0)).toBe(3)
  })

  it('a quantity-tracked SKU states its total and its unit of measure', () => {
    expect(stockLabel(row({ trackingMode: 'Quantity', totalQuantity: 200, quantityUnit: 'piece' }))).toBe('200 pieces')
    expect(stockLabel(row({ trackingMode: 'Quantity', totalQuantity: 1, quantityUnit: 'roll' }))).toBe('1 roll')
    expect(stockLabel(row({ trackingMode: 'Consumable', totalQuantity: 96, quantityUnit: null }))).toBe('96')
  })

  it('⛔ never renders "142 of 200" — the 142 has no column', () => {
    // `products` carries `total_quantity` and `reorder_level` and nothing else;
    // no migration defines available_quantity / qty_available / on_hand /
    // stock_level. Defaulting the available figure to the total would read as
    // "all 200 are on the shelf" on a line that has 58 out.
    const shapes = [
      row({ trackingMode: 'Quantity', totalQuantity: 200, quantityUnit: 'piece' }),
      row({ trackingMode: 'Consumable', totalQuantity: 96, quantityUnit: null }),
      row({ unitsByState: { ...noUnits(), 'In Stock': 3 } }),
    ]
    for (const r of shapes) expect(stockLabel(r)).not.toContain(' of ')
  })
})

describe('breakdownOf — §3.1, a breakdown and never one badge', () => {
  it('lists only the non-zero states, in the enum’s order', () => {
    const r = row({ unitsByState: { ...noUnits(), Missing: 1, 'In Stock': 2, 'On Rent': 3 } })
    expect(breakdownOf(r)).toEqual([
      { status: 'In Stock', count: 2 },
      { status: 'On Rent', count: 3 },
      { status: 'Missing', count: 1 },
    ])
  })

  it('is empty for a SKU with no unit rows, which the cell renders as an explicit non-value', () => {
    expect(breakdownOf(row({ trackingMode: 'Quantity', totalQuantity: 200 }))).toEqual([])
  })
})

describe('conditionOf — Mixed is a rendering decision, not a stored value', () => {
  it('returns the one condition when the units agree', () => {
    expect(conditionOf(row({ unitConditions: ['Good'] }))).toBe('Good')
  })

  it('returns Mixed when they differ', () => {
    expect(conditionOf(row({ unitConditions: ['Good', 'Fair'] }))).toBe('Mixed')
  })

  it('⛔ returns null for a SKU with no units — the mock typed "Good" onto the BNC cable', () => {
    expect(conditionOf(row({ trackingMode: 'Quantity', unitConditions: [] }))).toBeNull()
  })
})

describe('unitLocationOf — the three columns that actually hold a place', () => {
  it('joins the parts that are set', () => {
    expect(unitLocationOf(unit({ rack: 'Rack 01', shelf: 'A1', bin: 'D4' }))).toBe('Rack 01 · A1 · D4')
    expect(unitLocationOf(unit({ shelf: 'A1' }))).toBe('A1')
  })

  it('returns null when the unit has no place recorded — all three are nullable', () => {
    expect(unitLocationOf(unit())).toBeNull()
    expect(unitLocationOf(unit({ rack: '   ' }))).toBeNull()
  })
})

/* ── 6. Law 6 — the hover card is money-gated at the field, not by hiding ── */

describe('inventoryGlance / inventoryDetailGroups — Law 6', () => {
  const owner = gateContext('Owner')
  const warehouse = gateContext('Warehouse')
  const priced = row({ unitConditions: ['Good'], dailyRate: rupees(6500), replacementValue: rupees(1450000) })

  /**
   * `IntelGlance.lines` is optional. Asserting it is non-empty first matters:
   * an absent `lines` would make every `not.toContain` below pass for entirely
   * the wrong reason.
   */
  function linesOf(glance: IntelGlance): string {
    const lines = glance.lines ?? []
    expect(lines.length).toBeGreaterThan(0)
    return lines.join(' ')
  }

  it('shows the replacement figure to a role that may see money', () => {
    expect(linesOf(inventoryGlance(priced, owner))).toContain(formatMoney(rupees(1450000)))
  })

  it('⛔ never shows a rupee figure to a money-blind session, even if one reaches the row', () => {
    // `products_v` masks the nine money columns and this screen does not pass
    // `withMoney` for a money-blind session — but the gate is asserted HERE
    // rather than trusted, because a gate that only works when the query
    // behaves is not a gate.
    const glance = linesOf(inventoryGlance(priced, warehouse))
    expect(glance).not.toContain('1,450,000')
    expect(glance).not.toContain('6,500')
    expect(inventoryDetailGroups(priced, warehouse).map((g) => g.title)).not.toContain('Money')
    expect(inventoryDetailGroups(priced, owner).map((g) => g.title)).toContain('Money')
  })

  it('a masked or unrequested figure states the gap — never Rs 0, which is a price', () => {
    const money = inventoryDetailGroups(row(), owner).find((g) => g.title === 'Money')
    expect(money?.fields.map((f) => f.value)).toEqual([
      'Not available to this session',
      'Not available to this session',
    ])
    expect(money?.fields.map((f) => f.value).join(' ')).not.toContain('0')
  })

  it('states both liveness flags rather than collapsing them into one invented boolean', () => {
    // `products.status` and `products.is_active` have no CHECK, trigger or
    // comment relating them. Nothing here derives either from the other.
    const state = inventoryDetailGroups(row({ recordState: 'Draft', isActive: false }), owner).find(
      (g) => g.title === 'State',
    )
    const labels = state?.fields.map((f) => f.label) ?? []
    expect(labels).toContain('Record state')
    expect(labels).toContain('Active flag')
  })

  it('⛔ claims no booking and no location — the two the mock invented', () => {
    const groups = inventoryDetailGroups(priced, owner)
    const labels = groups.flatMap((g) => g.fields.map((f) => f.label))
    expect(labels).not.toContain('Bookings')
    expect(labels).not.toContain('Location')
    expect(groups.flatMap((g) => g.fields.map((f) => f.value))).not.toContain('Mixed')
  })

  it('names the reason a quantity-tracked SKU is missing from every state chip', () => {
    const bnc = row({ trackingMode: 'Quantity', totalQuantity: 200, quantityUnit: 'piece', unitConditions: [] })
    expect(linesOf(inventoryGlance(bnc, owner))).toContain('no unit rows')
    expect(inventoryGlance(bnc, owner).statusDot).toBe('neutral')
  })
})

/* ── 7. The chip a quantity SKU cannot answer, stated as a type ──────────── */

describe('the chip union is the database’s union', () => {
  it('accepts every enum member and nothing else', () => {
    // A compile-time check with a runtime witness: `InventoryChip` is
    // `'All' | inventory_state`, so this array cannot be written with a value
    // the enum does not have.
    const every: InventoryChip[] = ['All', ...INVENTORY_STATES]
    expect(every).toHaveLength(11)
    expect(new Set(every).size).toBe(11)
  })
})
