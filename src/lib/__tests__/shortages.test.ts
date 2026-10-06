import { describe, expect, it } from 'vitest'
import type { QuantityHold, RentalWindow } from '../availability'
import { findShortages, type ShortageProduct } from '../shortages'

/* C7 — over-committed products for a period. Same arithmetic as migration 0045's capacity trigger. */

const day = (d: number, h = 0) => new Date(Date.UTC(2026, 9, d, h)).toISOString()
const win = (a: number, b: number): RentalWindow => ({ fromAd: day(a), toAd: day(b) })
const hold = (no: string, qty: number, a: number, b: number): QuantityHold => ({
  bookingId: `id-${no}`,
  bookingNo: no,
  qty,
  window: win(a, b),
})
const product = (id: string, totalQuantity: number): ShortageProduct => ({
  id,
  name: `Product ${id}`,
  assetCode: `EQ00000${id}`,
  totalQuantity,
})
const run = (products: ShortageProduct[], holds: Record<string, QuantityHold[]>, w = win(1, 30)) =>
  findShortages({ window: w, products, holdsByProduct: new Map(Object.entries(holds)), bounds: 'half-open' })

describe('findShortages', () => {
  it('reports nothing when every product is within its stock', () => {
    expect(run([product('1', 3)], { '1': [hold('B1', 2, 2, 5), hold('B2', 1, 3, 6)] })).toEqual([])
  })

  it('reports a product whose overlapping holds exceed its stock, with how far over', () => {
    const rows = run([product('1', 2)], { '1': [hold('B1', 2, 2, 8), hold('B2', 1, 4, 6)] })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ productId: '1', totalQuantity: 2, peakHeld: 3, over: 1 })
  })

  it('does not add holds that never overlap, however many there are', () => {
    expect(run([product('1', 1)], { '1': [hold('B1', 1, 2, 4), hold('B2', 1, 4, 6), hold('B3', 1, 6, 8)] })).toEqual([])
  })

  it('names the bookings holding stock at the peak, not every booking in the period', () => {
    const rows = run([product('1', 1)], { '1': [hold('B1', 1, 2, 10), hold('B2', 1, 5, 7), hold('B3', 1, 20, 22)] })
    expect(rows[0]?.holders.map((h) => h.bookingNo).sort()).toEqual(['B1', 'B2'])
    expect(rows[0]?.peakAtAd).toBe(day(5))
  })

  it('ignores holds outside the chosen period', () => {
    expect(run([product('1', 1)], { '1': [hold('B1', 1, 2, 10), hold('B2', 1, 3, 9)] }, win(20, 25))).toEqual([])
  })

  it('treats touching windows as free under half-open bounds (ruled §4.30(b))', () => {
    expect(run([product('1', 1)], { '1': [hold('B1', 1, 2, 5), hold('B2', 1, 5, 8)] })).toEqual([])
  })

  it('treats a product with no stock on record as short by everything held', () => {
    const rows = run([product('1', 0)], { '1': [hold('B1', 2, 2, 5)] })
    expect(rows[0]).toMatchObject({ totalQuantity: 0, peakHeld: 2, over: 2 })
  })

  it('skips a product with no holds and sorts the worst shortage first', () => {
    const rows = run([product('1', 1), product('2', 1), product('3', 5)], {
      '1': [hold('B1', 2, 2, 5)],
      '2': [hold('B2', 4, 2, 5)],
    })
    expect(rows.map((r) => [r.productId, r.over])).toEqual([['2', 3], ['1', 1]])
  })

  it('refuses a stock level it cannot read rather than inventing capacity', () => {
    expect(() => run([product('1', Number.NaN)], { '1': [hold('B1', 1, 2, 5)] })).toThrow()
  })
})
