import { supabase } from '../supabase'
import type { QuantityHold } from '../availability'
import { parseTstzRange } from './availability'
import type { ShortageProduct } from '../shortages'

/**
 * The reads behind the shortage list (C7, see `lib/shortages.ts`).
 *
 * Three reads rather than one embed, for the reason `queries/bundles.ts`
 * documents: a failed embed surfaces as a null column, which here would read as
 * "no hold" — stock that looks free. Each read names itself on failure.
 *
 * 1. every LIVE reservation (`released_at is null`) — the trigger's own liveness
 *    test — product-level and serial alike;
 * 2. the product behind each serial hold (`product_units.product_id`);
 * 3. the products' names and stock, from `products_v`. None of those columns is
 *    money, so the list is for every staff role that can read inventory.
 */

export interface ShortageInputs {
  products: ShortageProduct[]
  holdsByProduct: Map<string, QuantityHold[]>
}

type ReservationRow = {
  product_id: string | null
  asset_id: string | null
  qty: number | null
  booking_id: string
  period: string
  bookings: { booking_no: string } | { booking_no: string }[] | null
}

export async function readShortageInputs(): Promise<ShortageInputs> {
  const { data: resData, error: resError } = await supabase
    .from('inventory_reservations')
    .select('product_id, asset_id, qty, booking_id, period, bookings ( booking_no )')
    .is('released_at', null)

  if (resError) throw new Error(`Could not read the live reservations, so no shortage list was built: ${resError.message}`)

  const reservations = (resData ?? []) as unknown as ReservationRow[]

  const assetIds = [...new Set(reservations.map((r) => r.asset_id).filter((id): id is string => id !== null))]
  const productOfAsset = new Map<string, string>()
  if (assetIds.length > 0) {
    const { data: unitData, error: unitError } = await supabase
      .from('product_units_v')
      .select('id, product_id')
      .in('id', assetIds)
    if (unitError) {
      throw new Error(`Could not read the units behind the serial holds, so no shortage list was built: ${unitError.message}`)
    }
    for (const unit of (unitData ?? []) as unknown as Array<{ id: string; product_id: string }>) {
      productOfAsset.set(unit.id, unit.product_id)
    }
  }

  const holdsByProduct = new Map<string, QuantityHold[]>()
  for (const row of reservations) {
    const productId = row.product_id ?? (row.asset_id === null ? null : (productOfAsset.get(row.asset_id) ?? null))
    const window = parseTstzRange(row.period)
    if (productId === null || window === null) throw new Error('A live reservation could not be matched to its product or dates. Refresh shortages before relying on this list.')
    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
    const list = holdsByProduct.get(productId) ?? []
    list.push({
      bookingId: row.booking_id,
      bookingNo: booking?.booking_no ?? row.booking_id,
      /* A serial hold is one unit (`serialised_hold_is_one`). A null quantity on a
         product hold is a failed read: NaN, which `capacityFor` refuses, rather
         than a defaulted 1 that would under-count promised stock. */
      qty: row.asset_id !== null ? 1 : (row.qty ?? Number.NaN),
      window,
    })
    holdsByProduct.set(productId, list)
  }

  const productIds = [...holdsByProduct.keys()]
  const products: ShortageProduct[] = []
  if (productIds.length > 0) {
    const { data: prodData, error: prodError } = await supabase
      .from('products_v')
      .select('id, name, asset_code, total_quantity')
      .in('id', productIds)
    if (prodError) throw new Error(`Could not read the products, so no shortage list was built: ${prodError.message}`)
    for (const p of (prodData ?? []) as unknown as Array<{
      id: string
      name: string
      asset_code: string
      total_quantity: number | null
    }>) {
      products.push({
        id: p.id,
        name: p.name,
        assetCode: p.asset_code,
        /* `integer not null` at the database; a null is a failed read, and
           `capacityFor` refuses NaN rather than inventing stock. */
        totalQuantity: p.total_quantity ?? Number.NaN,
      })
    }
  }

  /* A hold whose product could not be read is stock we cannot count; saying
     "no shortage" over it would be the unsafe answer. */
  const known = new Set(products.map((p) => p.id))
  const unread = productIds.filter((id) => !known.has(id))
  if (unread.length > 0) {
    throw new Error(
      `${unread.length} product${unread.length === 1 ? ' has' : 's have'} live holds but could not be read, so no shortage list was built.`,
    )
  }

  return { products, holdsByProduct }
}
