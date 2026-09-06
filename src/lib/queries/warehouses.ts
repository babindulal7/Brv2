import { supabase } from '../supabase'
import type { ListFilters } from './listQuery'
import { useList, type ListQueryResult, type ListResult } from './useList'
import type { StockTransfer, TransferStatus, TransferType } from '../../data/warehouse'

/**
 * # Stock transfers, the real ones
 *
 * `modules/inventory/Warehouses.tsx` read `data/warehouse.ts`'s `TRANSFERS` —
 * hand-written rows, and the screen admits it at `:905` — while
 * `actions/inventory/createStockTransfer.ts` inserted real `stock_transfers` and
 * `stock_transfer_lines` (`:300`, `:340`). An operator raised a transfer and the
 * list never changed. Same read-frozen / write-live split as Bundles and
 * Purchase Requests, and this module is the read half.
 *
 * ## Why this covers the transfers and NOT the warehouse cards
 *
 * `stock_transfers` (`0004:433`) and `stock_transfer_lines` (`0004:487`) carry
 * everything the transfer list prints — both endpoints, both zones, the four
 * actors, the four timestamps, notes, and the lines with their product and unit.
 * `transfer_status`' seven members are `TransferStatus` exactly.
 *
 * The rest of that screen has no schema behind it, so it is deliberately left on
 * its seed rather than half-wired (PLAN.md §4.45(c)):
 *
 * | Surface | Why it cannot be read |
 * |---|---|
 * | `capacity` · `occupancy` · `availableSpace` | no column on `warehouses` or `storage_zones`. The only `capacity_slots` is on `containers` (`0004:162`) — transit cases and bags, so it counts what fits in a flight case, not a building |
 * | the rack map (`STORAGE_LOCATIONS`) | `storage_zones` (`0007:76`) has no room, rack, shelf, bin, capacity or used column — **none of the map's fields exist** |
 * | `accuracyPct` · `manager` · `phone` · `image` | no column anywhere |
 *
 * Mixing a live transfer list with seeded occupancy on one screen is honest only
 * because the seeded half is already labelled as seeded. Wiring the cards would
 * mean deleting most of what the screen shows, which is a product decision.
 */

/* ── the facility list ─────────────────────────────────────────────────── */

/**
 * The warehouses themselves — id and name, nothing more.
 *
 * The table above explains why this module cannot wire the warehouse CARDS:
 * capacity, occupancy and the rack map have no columns. The **list** is a
 * different matter, and it had a live consequence: Add Equipment's warehouse
 * picker was built from `data/warehouse.ts`'s four seed names
 * ('Kathmandu Main Hub (HQ)', 'Patan Studio Depository', 'Pokhara Regional Hub',
 * 'Bhaktapur Heavy Grip & Rigging'), and **none of them is a row in
 * `warehouses`** — which holds 'Central Camera Vault' and 'Lakeside Equipment
 * Hub'. `product_units.warehouse_id` is NOT NULL, so `createEquipment` resolves
 * the chosen name against the table and refuses when it is absent: every attempt
 * to register serialised equipment failed after the form had reported
 * "Ready to Rent — all gates clear".
 *
 * So the picker reads this instead. `is_active` is filtered here rather than by
 * the caller: a decommissioned warehouse is not somewhere new stock can be put.
 */
export interface WarehouseOption {
  id: string
  name: string
  code: string
  branchId: string
}

interface WarehouseOptionRow {
  id: string
  name: string
  warehouse_code: string | null
  branch_id: string
}

export async function listWarehouses(): Promise<WarehouseOption[]> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name, warehouse_code, branch_id')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    throw new Error(`Could not read the warehouse list: ${error.message}`)
  }

  return ((data ?? []) as unknown as WarehouseOptionRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    code: r.warehouse_code ?? '',
    branchId: r.branch_id,
  }))
}

async function fetchWarehouses(): Promise<ListQueryResult<WarehouseOption>> {
  const rows = await listWarehouses()
  return { rows, total: rows.length }
}

export function useWarehouses(): ListResult<WarehouseOption> {
  return useList<WarehouseOption>(fetchWarehouses, {}, { isFilteredOverride: false })
}

/* ── transfers ─────────────────────────────────────────────────────────── */

interface TransferRow {
  id: string
  transfer_no: string
  transfer_type: string
  status: string
  notes: string | null
  requested_at: string
  dispatched_at: string | null
  received_at: string | null
  source_warehouse_id: string
  destination_warehouse_id: string
  source_zone_id: string | null
  destination_zone_id: string | null
  requested_by: string
  approved_by: string | null
}

interface TransferLineRow {
  transfer_id: string
  product_id: string
  product_unit_id: string | null
  condition_on_receipt: string | null
}

/**
 * `transfer_kind`'s members are plural (`'Branch Transfers'`); the screen's
 * `TransferType` is singular. A rename, not a translation — the five members
 * correspond one to one, so an unknown value is passed through rather than
 * defaulted, which would silently relabel a row.
 */
const TYPE_LABEL: Record<string, TransferType> = {
  'Branch Transfers': 'Branch Transfer',
  'Warehouse Transfers': 'Warehouse Transfer',
  'Zone Transfers': 'Zone Transfer',
  'Temporary Holding': 'Temporary Holding',
  Transit: 'Transit',
}

export async function listStockTransfers(limit = 200): Promise<StockTransfer[]> {
  const { data, error } = await supabase
    .from('stock_transfers')
    .select(
      'id, transfer_no, transfer_type, status, notes, requested_at, dispatched_at, received_at, ' +
        'source_warehouse_id, destination_warehouse_id, source_zone_id, destination_zone_id, ' +
        'requested_by, approved_by',
    )
    .order('requested_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`listStockTransfers failed: ${error.message}`)

  const rows = (data ?? []) as unknown as TransferRow[]
  if (rows.length === 0) return []

  const lines = await readLines(rows.map((r) => r.id))
  const [warehouses, zones, users, products, units] = await Promise.all([
    readNames('warehouses', [...rows.map((r) => r.source_warehouse_id), ...rows.map((r) => r.destination_warehouse_id)]),
    readNames('storage_zones', [
      ...rows.map((r) => r.source_zone_id),
      ...rows.map((r) => r.destination_zone_id),
    ].filter((v): v is string => v !== null)),
    readUserNames([...rows.map((r) => r.requested_by), ...rows.map((r) => r.approved_by).filter((v): v is string => v !== null)]),
    readProductFacts([...lines.values()].flat().map((l) => l.product_id)),
    readUnitFacts([...lines.values()].flat().map((l) => l.product_unit_id).filter((v): v is string => v !== null)),
  ])

  return rows.map((r): StockTransfer => {
    const mine = lines.get(r.id) ?? []
    return {
      id: r.id,
      transferNo: r.transfer_no,
      type: TYPE_LABEL[r.transfer_type] ?? (r.transfer_type as TransferType),
      sourceWarehouse: warehouses.get(r.source_warehouse_id) ?? 'Unreadable warehouse',
      /* A transfer between warehouses names no zone; the screen prints a dash. */
      sourceZone: (r.source_zone_id === null ? null : zones.get(r.source_zone_id)) ?? '—',
      destinationWarehouse: warehouses.get(r.destination_warehouse_id) ?? 'Unreadable warehouse',
      destinationZone: (r.destination_zone_id === null ? null : zones.get(r.destination_zone_id)) ?? '—',
      assetCount: mine.length,
      items: mine.map((l) => {
        const unit = l.product_unit_id === null ? undefined : units.get(l.product_unit_id)
        const product = products.get(l.product_id)
        return {
          /* A quantity-tracked line names no unit, so it has no asset tag or
             serial. Stated, not blanked — an empty cell reads as a render fault. */
          assetCode: unit?.assetTag ?? 'Not serialised',
          name: product?.name ?? `Unreadable product ${l.product_id.slice(0, 8)}`,
          serial: unit?.serialNo ?? '—',
          category: product?.category ?? 'Uncategorised',
          /* Only set once a receipt has recorded it. */
          condition: l.condition_on_receipt ?? '—',
        }
      }),
      status: r.status as TransferStatus,
      requestedBy: users.get(r.requested_by) ?? 'Unknown',
      ...(r.approved_by === null ? {} : { approvedBy: users.get(r.approved_by) ?? 'Unknown' }),
      ...(r.dispatched_at === null ? {} : { dispatchedAt: r.dispatched_at }),
      ...(r.received_at === null ? {} : { receivedAt: r.received_at }),
      ...(r.notes === null ? {} : { notes: r.notes }),
      dateAD: r.requested_at.slice(0, 10),
    }
  })
}

async function readLines(transferIds: readonly string[]): Promise<Map<string, TransferLineRow[]>> {
  const out = new Map<string, TransferLineRow[]>()
  if (transferIds.length === 0) return out

  const { data, error } = await supabase
    .from('stock_transfer_lines')
    .select('transfer_id, product_id, product_unit_id, condition_on_receipt')
    .in('transfer_id', [...transferIds])

  if (error) throw new Error(`listStockTransfers could not read the transfer lines: ${error.message}`)

  for (const row of (data ?? []) as unknown as TransferLineRow[]) {
    const list = out.get(row.transfer_id) ?? []
    list.push(row)
    out.set(row.transfer_id, list)
  }
  return out
}

async function readNames(table: string, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out

  const { data, error } = await supabase.from(table).select('id, name').in('id', [...new Set(ids)])
  if (error) throw new Error(`listStockTransfers could not read ${table}: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{ id: string; name: string }>) out.set(row.id, row.name)
  return out
}

async function readUserNames(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out

  const { data, error } = await supabase.from('users').select('id, full_name').in('id', [...new Set(ids)])
  if (error) throw new Error(`listStockTransfers could not read who raised these transfers: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{ id: string; full_name: string | null }>) {
    if (row.full_name !== null) out.set(row.id, row.full_name)
  }
  return out
}

/** `products_v`, never `products` — 0062 revokes table SELECT on the base table. */
async function readProductFacts(ids: readonly string[]): Promise<Map<string, { name: string; category: string | null }>> {
  const out = new Map<string, { name: string; category: string | null }>()
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('products_v')
    .select('id, name, category:inventory_categories ( name )')
    .in('id', [...new Set(ids)])

  if (error) throw new Error(`listStockTransfers could not read the transferred products: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{ id: string; name: string; category: { name: string } | null }>) {
    out.set(row.id, { name: row.name, category: row.category?.name ?? null })
  }
  return out
}

/** `product_units_v` for the same reason. */
async function readUnitFacts(ids: readonly string[]): Promise<Map<string, { assetTag: string; serialNo: string | null }>> {
  const out = new Map<string, { assetTag: string; serialNo: string | null }>()
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('product_units_v')
    .select('id, asset_tag, serial_no')
    .in('id', [...new Set(ids)])

  if (error) throw new Error(`listStockTransfers could not read the transferred units: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{ id: string; asset_tag: string; serial_no: string | null }>) {
    out.set(row.id, { assetTag: row.asset_tag, serialNo: row.serial_no })
  }
  return out
}

/* ── hooks ─────────────────────────────────────────────────────────────── */

async function fetchTransfers(_f: ListFilters): Promise<ListQueryResult<StockTransfer>> {
  const rows = await listStockTransfers()
  return { rows, total: rows.length }
}

export function useStockTransfers(): ListResult<StockTransfer> {
  return useList<StockTransfer>(fetchTransfers, {}, { isFilteredOverride: false })
}
