import { supabase } from '../supabase'
import { rupees } from '../money'
import type { Paisa } from '../money'
import type { ListFilters } from './listQuery'
import { useList, type ListQueryResult, type ListResult } from './useList'
import type { PurchaseRequest, PRStatus, PRReason } from '../../data/purchaseRequests'

/**
 * # Purchase requests, the real ones
 *
 * `modules/inventory/PurchaseRequests.tsx` read `data/purchaseRequests.ts`'s
 * `PURCHASE_REQUESTS` — hand-written rows — while its approve/reject decisions
 * wrote to Postgres (`PurchaseRequests.tsx:257`). An operator approved a request
 * and the list never changed. Same read-frozen / write-live split as the Bundles
 * list, fixed the same way.
 *
 * ## Four reads, not one embed
 *
 * `purchase_requests` names a product, a supplier, a requester and an approver.
 * Only the product is awkward: **`0062_law6_column_grants_arm_the_mask.sql`
 * revokes table-level SELECT on `products`**, so the name and category are
 * reachable only through `products_v` — the same reason `queries/bundles.ts`
 * splits its reads rather than embedding, and its header is the long version of
 * this note.
 *
 * `requested_by` and `approved_by` are **two FKs to the same table**, which
 * PostgREST can only disambiguate with explicit constraint hints and the mock
 * engine's `REL` map cannot express at all (it is keyed `parent.table`). Reading
 * `users` once by id set sidesteps that instead of encoding a fragile hint.
 *
 * ## What has no source, and is therefore absent
 *
 * The spec's §6 priority formula is
 * `(refused_bookings × 2) + sub_rental_events + (sub_rental_cost / cost × 10)`.
 * **None of its three inputs exists.** There is no refused-booking table, no
 * sub-rental table, and no column on `purchase_requests` holding either count —
 * checked across every migration.
 *
 * So `priority` and `priorityScore` come back **`null`**, and the screen says
 * "Not scored" rather than printing `Low`. That is not a missing feature being
 * hidden: scoring every live request `Low` would rank a genuinely urgent
 * purchase below a trivial one, which is worse than declining to rank. The
 * evidence arrays are empty for the same reason, and the panel that lists them
 * says so.
 *
 * `notes` has no column either. `dateDecided*` is deliberately NOT taken from
 * `updated_at`: that column moves on any edit, so using it would date a decision
 * to the last time anyone touched the row.
 */

interface PurchaseRequestRow {
  id: string
  pr_no: string
  product_id: string
  supplier_id: string | null
  quantity: number
  estimated_unit_cost: number | null
  total_estimated_cost: number | null
  reason_type: string
  urgency: string
  status: string
  requested_by: string
  approved_by: string | null
  rejection_reason: string | null
  created_at: string
}

const PR_COLUMNS =
  'id, pr_no, product_id, supplier_id, quantity, estimated_unit_cost, total_estimated_cost, ' +
  'reason_type, urgency, status, requested_by, approved_by, rejection_reason, created_at'

/** `products_v` — never `products`; see the header on 0062. */
async function readProductFacts(ids: readonly string[]): Promise<Map<string, { name: string; category: string | null }>> {
  const out = new Map<string, { name: string; category: string | null }>()
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('products_v')
    .select('id, name, category:inventory_categories ( name )')
    .in('id', [...new Set(ids)])

  if (error) throw new Error(`listPurchaseRequests could not read the requested products: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{
    id: string
    name: string
    category: { name: string } | null
  }>) {
    out.set(row.id, { name: row.name, category: row.category?.name ?? null })
  }
  return out
}

async function readSupplierNames(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out

  const { data, error } = await supabase.from('suppliers').select('id, name').in('id', [...new Set(ids)])
  if (error) throw new Error(`listPurchaseRequests could not read the suppliers: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{ id: string; name: string }>) out.set(row.id, row.name)
  return out
}

async function readUserNames(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out

  const { data, error } = await supabase.from('users').select('id, full_name').in('id', [...new Set(ids)])
  if (error) throw new Error(`listPurchaseRequests could not read who raised these requests: ${error.message}`)

  for (const row of (data ?? []) as unknown as Array<{ id: string; full_name: string | null }>) {
    if (row.full_name !== null) out.set(row.id, row.full_name)
  }
  return out
}

const money = (v: number | null): Paisa => rupees(v ?? 0)

/**
 * Every purchase request, newest first.
 *
 * Law 3 — nothing is filtered out by status. `Rejected` and `Cancelled` are
 * terminal states a request KEEPS, and the screen has chips for both; hiding
 * them here would make the chip counts lie.
 */
export async function listPurchaseRequests(limit = 200): Promise<PurchaseRequest[]> {
  const { data, error } = await supabase
    .from('purchase_requests')
    .select(PR_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`listPurchaseRequests failed: ${error.message}`)

  const rows = (data ?? []) as unknown as PurchaseRequestRow[]
  if (rows.length === 0) return []

  const [products, suppliers, users] = await Promise.all([
    readProductFacts(rows.map((r) => r.product_id)),
    readSupplierNames(rows.map((r) => r.supplier_id).filter((v): v is string => v !== null)),
    readUserNames([
      ...rows.map((r) => r.requested_by),
      ...rows.map((r) => r.approved_by).filter((v): v is string => v !== null),
    ]),
  ])

  return rows.map((r): PurchaseRequest => {
    const product = products.get(r.product_id)
    const supplierName = r.supplier_id === null ? undefined : suppliers.get(r.supplier_id)
    const decidedBy = r.approved_by === null ? undefined : users.get(r.approved_by)

    return {
      id: r.id,
      prNo: r.pr_no,
      fleetItemId: r.product_id,
      /* Named, never blank. A request whose product row this session cannot read
         is a real RLS state, and the operator must see that rather than an empty
         cell that looks like a rendering fault. */
      fleetItemName: product?.name ?? `Unreadable product ${r.product_id.slice(0, 8)}`,
      category: product?.category ?? 'Uncategorised',
      requestedQty: r.quantity,
      /* The enum's members are these three strings exactly (`0001:645`), so the
         cast is a narrowing, not a translation. */
      reason: r.reason_type as PRReason,
      estimatedUnitCost: money(r.estimated_unit_cost),
      totalEstimatedCost: money(r.total_estimated_cost),
      /* No source — see the header. Zero here means "no evidence recorded",
         which is why `priority` is null rather than the `Low` these would score. */
      totalSubRentPaid: rupees(0),
      refusedCount: 0,
      subRentCount: 0,
      priorityScore: null,
      priority: null,
      ...(supplierName === undefined ? {} : { suggestedSupplier: supplierName }),
      status: r.status as PRStatus,
      requestedBy: users.get(r.requested_by) ?? 'Unknown',
      ...(decidedBy === undefined ? {} : { decidedBy }),
      ...(r.rejection_reason === null ? {} : { decisionReason: r.rejection_reason }),
      dateCreatedAD: r.created_at.slice(0, 10),
      /* BS is rendered, never stored — the screen converts for display. */
      dateCreatedBS: '',
      refusedBookings: [],
      subRentals: [],
    }
  })
}

async function fetchPurchaseRequests(_filters: ListFilters): Promise<ListQueryResult<PurchaseRequest>> {
  const rows = await listPurchaseRequests()
  return { rows, total: rows.length }
}

/** The screen's rows. Filtering and chips are the screen's own, over the full set. */
export function usePurchaseRequests(): ListResult<PurchaseRequest> {
  return useList<PurchaseRequest>(fetchPurchaseRequests, {}, { isFilteredOverride: false })
}
