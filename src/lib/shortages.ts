import {
  capacityFor,
  windowContains,
  type BoundConvention,
  type QuantityHold,
  type RentalWindow,
} from './availability'

/**
 * # Over-committed products for a period (C7)
 *
 * One list of the products whose live holds, at their worst moment inside a
 * window, exceed the stock the product owns.
 *
 * ## "Over-committed" means the database's own ceiling
 *
 * `capacityFor` is the preview of migration 0045's capacity trigger: the largest
 * quantity held at any one instant, against `products.total_quantity`. This
 * module asks the same question over a whole period instead of for one new line,
 * so the report and the trigger cannot disagree about what a shortage is.
 *
 * The trigger refuses a NEW hold that would breach the ceiling, so a shortage
 * can only arise after the fact: stock was written down (lost, sold, a
 * correction) below what is already promised, or an overbooking override went
 * through. That is exactly when a coordinator needs the list.
 *
 * ## What it does not see
 *
 * Units in Maintenance, Missing or Retired are not subtracted: the ceiling is
 * `total_quantity`, as it is at the database. A fleet short because gear is in
 * the workshop is therefore under-reported here, not over-reported. Stated on
 * the report, not hidden.
 */

export interface ShortageProduct {
  readonly id: string
  readonly name: string
  readonly assetCode: string
  /** `products.total_quantity`. */
  readonly totalQuantity: number
}

export interface ShortageHolder {
  readonly bookingId: string
  readonly bookingNo: string
  readonly qty: number
}

export interface ShortageRow {
  readonly productId: string
  readonly name: string
  readonly assetCode: string
  readonly totalQuantity: number
  /** The most held at any one instant in the window. */
  readonly peakHeld: number
  /** `peakHeld − totalQuantity`, always above zero on a row. */
  readonly over: number
  /** When that peak occurs, as the ISO text the hold carried. */
  readonly peakAtAd: string
  /** Bookings holding stock at the peak. */
  readonly holders: readonly ShortageHolder[]
}

export interface FindShortagesInput {
  readonly window: RentalWindow
  readonly products: readonly ShortageProduct[]
  /** Live holds per product id. Serial holds must be present as `qty: 1` entries (0045's `live` CTE). */
  readonly holdsByProduct: ReadonlyMap<string, readonly QuantityHold[]>
  readonly bounds: BoundConvention
}

export function findShortages({ window, products, holdsByProduct, bounds }: FindShortagesInput): ShortageRow[] {
  const rows: ShortageRow[] = []

  for (const product of products) {
    const holds = holdsByProduct.get(product.id) ?? []
    if (holds.length === 0) continue

    /* qtyRequested 1 only to satisfy capacityFor's contract; we read `peakHeld`. */
    const outcome = capacityFor({
      window,
      holds,
      totalQuantity: product.totalQuantity,
      qtyRequested: 1,
      bounds,
    })

    if (outcome.peakHeld <= product.totalQuantity || outcome.peakAtAd === null) continue

    const peakAtAd = outcome.peakAtAd
    const holders = holds
      .filter((hold) => windowContains(hold.window, peakAtAd, bounds))
      .map((hold) => ({ bookingId: hold.bookingId, bookingNo: hold.bookingNo, qty: hold.qty }))

    rows.push({
      productId: product.id,
      name: product.name,
      assetCode: product.assetCode,
      totalQuantity: product.totalQuantity,
      peakHeld: outcome.peakHeld,
      over: outcome.peakHeld - product.totalQuantity,
      peakAtAd,
      holders,
    })
  }

  /* Worst first; ties by name so the order is stable between renders. */
  return rows.sort((a, b) => b.over - a.over || a.name.localeCompare(b.name))
}
