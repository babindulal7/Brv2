import { supabase } from '../supabase'
import { rupees } from '../money'
import type { Paisa } from '../money'

/**
 * # Bundles, with their components — the real ones
 *
 * New Rental persistence spec §22 C2. `AddItemPanel`'s Bundles tab read
 * `src/data/bundles.ts`'s `ACTIVE_BUNDLES` — nine hand-written records whose
 * ids are `BND-23` codes and whose component lines name models by string. None
 * of it can be written to `booking_lines`, which wants `bundles.id` and
 * `products.id` uuids.
 *
 * This is the query that answers the same question from the database:
 * `bundles` + `bundle_items` + the products those items name, plus the unit
 * counts the availability verdict is derived from.
 *
 * ## Three reads, not one embed
 *
 * `bundles → bundle_items` is a real FK and embeds cleanly. `bundle_items →
 * products` is a real FK too, **but `0062_law6_column_grants_arm_the_mask.sql`
 * revokes table-level SELECT on `products`** and hands back the non-money
 * columns only; `daily_rate` — the one figure a bundle component needs — is
 * reachable exclusively through `products_v`. Embedding the base table would
 * therefore work today and 403 the day 0062 lands, which is the failure mode
 * `queries/inventory.ts`'s header already documents for `product_units`.
 *
 * So: bundles+items in one call, then `products_v` for the named products, then
 * `product_units_v` for their units. Three round trips for a list that is
 * fetched once when the booking workspace mounts.
 *
 * ## Money is `Paisa | null`, and the null is load-bearing
 *
 * A `null` `dailyRate` means EITHER "this caller did not ask for money"
 * (`withMoney` false) OR "this session may not see money" (the view masked it).
 * It never means free. Same contract as `InventoryListRow.dailyRate` and
 * `ClientListItem.outstanding`; a screen gates on the role before rendering and
 * must not coerce it to 0 for display.
 *
 * `bundles.daily_rate` is NOT masked — `bundles` is not one of the four tables
 * 0062 revokes — so the bundle's own advertised rate is always readable. That
 * asymmetry is real and is left visible rather than flattened.
 */

/** `bundle_items` joined to the product it names. */
export interface BundleComponent {
  /** `bundle_items.id`. */
  itemId: string
  /** `bundle_items.product_id` — a **uuid**, and what a child booking line stores. */
  productId: string
  /** `products.name`, or a stated placeholder when the product could not be read. */
  productName: string
  /** `inventory_categories.name`, the `product_category` enum. Null when unresolved. */
  category: string | null
  brand: string | null
  /** `bundle_items.quantity` — units of this product ONE bundle requires. */
  quantity: number
  /** `bundle_items.days`. Carried but not used as the line's days: the booking's window decides. */
  days: number
  /** `bundle_items.is_mandatory`. An optional component may be toggled off before adding. */
  isMandatory: boolean
  sortOrder: number
  /** `products_v.daily_rate`. **Money** — see the header; null is not zero. */
  dailyRate: Paisa | null
  /** `products.tracking_mode`. */
  trackingMode: string | null
  /** Unit rows this product has, retired included. `0` for a quantity-tracked SKU. */
  unitsTotal: number
  /** Units whose `product_units_v.status` is `In Stock` — present tense, not window-aware. */
  unitsInStock: number
}

export interface BundleWithItems {
  /** `bundles.id` — a **uuid**, and what a Bundle parent line stores in `bundle_id`. */
  id: string
  /** `bundles.bundle_code` — `BND-23`. What the operator reads and searches. */
  bundleCode: string
  name: string
  description: string | null
  category: string | null
  /** `bundles.daily_rate` — the advertised rate the Bundle parent line carries. Never masked. */
  dailyRate: Paisa
  weeklyRate: Paisa
  /**
   * `bundles.is_active`. Law 3 — a retired bundle is `false`, never a deleted
   * row, so "archived" is a value this list carries rather than an absence the
   * caller has to infer. Only populated when `includeArchived` was asked for;
   * without it every row is `true` by construction.
   */
  isActive: boolean
  items: BundleComponent[]
}

interface BundleRow {
  id: string
  bundle_code: string
  name: string
  description: string | null
  daily_rate: number | null
  weekly_rate: number | null
  is_active: boolean
  category: { name: string } | null
  items:
    | Array<{
        id: string
        product_id: string
        quantity: number
        days: number
        is_mandatory: boolean
        sort_order: number
      }>
    | null
}

const BUNDLE_COLUMNS =
  'id, bundle_code, name, description, daily_rate, weekly_rate, is_active, ' +
  'category:inventory_categories ( name ), ' +
  'items:bundle_items ( id, product_id, quantity, days, is_mandatory, sort_order )'

export interface ListBundlesOptions {
  /**
   * Include each component's `daily_rate`. **Money.** Pass the caller's own
   * money gate — never a literal `true`. Without it every `dailyRate` is null,
   * which is the honest reading of "this caller did not ask".
   */
  withMoney?: boolean
  limit?: number
  /**
   * Return retired bundles (`is_active = false`) alongside live ones, tagged by
   * `isActive`. The Bundles pane needs them: its chip row has an **Archived**
   * shelf, and Law 3 means those rows still exist and must still be openable.
   * Default `false` keeps the New Rental picker — the original caller — showing
   * only bundles that can actually be sold.
   */
  includeArchived?: boolean
  /**
   * Narrow to ONE bundle, by `bundle_code` (`BND-23`) **or** `bundles.id` (a uuid).
   *
   * Dispatching on the shape of the reference is this codebase's ruled answer to
   * "the caller may hold either" — `queries/clients.ts:getClientRecord`,
   * `queries/availability.ts:147` and `queries/bookings.ts:1021` all do it, and
   * the 4 Sep P0 (eight links passing a uuid into a code-only lookup) is why.
   *
   * Nothing produces a bundle uuid for the UI today: `bundleRecords.ts` maps
   * `id: b.bundleCode` and drops the uuid, so every link carries a code. The
   * uuid branch costs one regex and means a future caller holding the uuid
   * cannot reintroduce that bug.
   */
  bundleRef?: string
}

/** `bundles.id` is a uuid; `bundle_code` is `^BND-[0-9]+$`. They cannot collide. */
const BUNDLE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Active bundles with their components resolved to real products.
 *
 * Law 3 — an inactive bundle is retained, never deleted, so it is filtered here
 * rather than expected to be absent. Archived/retired bundles are simply
 * `is_active = false`.
 */
export async function listBundlesWithItems(opts: ListBundlesOptions = {}): Promise<BundleWithItems[]> {
  let query = supabase.from('bundles').select(BUNDLE_COLUMNS)
  /* Law 3 — an inactive bundle is retained, never deleted, so it is filtered
     here rather than expected to be absent. `includeArchived` lifts the filter
     for the Bundles pane, which has a shelf for exactly these. */
  if (opts.includeArchived !== true) query = query.eq('is_active', true)
  if (opts.bundleRef !== undefined) {
    query = query.eq(BUNDLE_UUID_RE.test(opts.bundleRef) ? 'id' : 'bundle_code', opts.bundleRef)
  }

  const { data, error } = await query
    .order('name', { ascending: true })
    .limit(opts.limit ?? 200)

  if (error) throw new Error(`listBundlesWithItems failed: ${error.message}`)

  const bundles = (data ?? []) as unknown as BundleRow[]
  if (bundles.length === 0) return []

  const productIds = [
    ...new Set(bundles.flatMap((b) => (b.items ?? []).map((i) => i.product_id)).filter(Boolean)),
  ]

  const [products, units] = await Promise.all([
    readProducts(productIds, opts.withMoney === true),
    readUnitCounts(productIds),
  ])

  return bundles.map((b) => ({
    id: b.id,
    bundleCode: b.bundle_code,
    name: b.name,
    description: b.description,
    category: b.category?.name ?? null,
    dailyRate: rupees(b.daily_rate ?? 0),
    weeklyRate: rupees(b.weekly_rate ?? 0),
    isActive: b.is_active,
    items: [...(b.items ?? [])]
      .sort((x, y) => x.sort_order - y.sort_order || x.id.localeCompare(y.id))
      .map((i): BundleComponent => {
        const p = products.get(i.product_id)
        const counts = units.get(i.product_id)
        return {
          itemId: i.id,
          productId: i.product_id,
          /* Named, never blank. A component whose product row could not be read
             is a real (RLS or deleted-catalogue) state, and the operator must
             see that the bundle references something this session cannot see —
             not an empty row that looks like a rendering bug. */
          productName: p?.name ?? `Unreadable product ${i.product_id.slice(0, 8)}`,
          category: p?.category ?? null,
          brand: p?.brand ?? null,
          quantity: i.quantity,
          days: i.days,
          isMandatory: i.is_mandatory,
          sortOrder: i.sort_order,
          dailyRate: p?.dailyRate ?? null,
          trackingMode: p?.trackingMode ?? null,
          unitsTotal: counts?.total ?? 0,
          unitsInStock: counts?.inStock ?? 0,
        }
      }),
  }))
}

interface ProductFacts {
  name: string
  brand: string | null
  category: string | null
  trackingMode: string | null
  dailyRate: Paisa | null
}

async function readProducts(ids: readonly string[], withMoney: boolean): Promise<Map<string, ProductFacts>> {
  const out = new Map<string, ProductFacts>()
  if (ids.length === 0) return out

  const columns =
    'id, name, brand, tracking_mode, category:inventory_categories ( name )' + (withMoney ? ', daily_rate' : '')

  const { data, error } = await supabase.from('products_v').select(columns).in('id', [...ids])
  if (error) throw new Error(`listBundlesWithItems could not read the component products: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{
    id: string
    name: string
    brand: string | null
    tracking_mode: string | null
    category: { name: string } | null
    daily_rate?: number | null
  }>) {
    out.set(row.id, {
      name: row.name,
      brand: row.brand,
      category: row.category?.name ?? null,
      trackingMode: row.tracking_mode,
      dailyRate: row.daily_rate === null || row.daily_rate === undefined ? null : rupees(row.daily_rate),
    })
  }
  return out
}

async function readUnitCounts(ids: readonly string[]): Promise<Map<string, { total: number; inStock: number }>> {
  const out = new Map<string, { total: number; inStock: number }>()
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('product_units_v')
    .select('id, product_id, status')
    .in('product_id', [...ids])

  if (error) throw new Error(`listBundlesWithItems could not read the component units: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{ product_id: string; status: string }>) {
    const entry = out.get(row.product_id) ?? { total: 0, inStock: 0 }
    entry.total += 1
    if (row.status === 'In Stock') entry.inStock += 1
    out.set(row.product_id, entry)
  }
  return out
}
