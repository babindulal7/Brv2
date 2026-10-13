import { beforeEach, describe, expect, it, vi } from 'vitest'

type Resp = { data: unknown[]; error: { message: string } | null }
const db = vi.hoisted(() => ({ responses: {} as Record<string, Resp>, calls: [] as string[] }))

vi.mock('../../supabase', () => ({
  supabase: {
    from: (table: string) => {
      db.calls.push(table)
      const result = () => db.responses[table] ?? { data: [], error: null }
      const chain: Record<string, unknown> = {
        select: () => chain,
        is: () => Promise.resolve(result()),
        in: () => Promise.resolve(result()),
      }
      return chain
    },
  },
}))

const { readShortageInputs } = await import('../shortages')

const RANGE = '["2026-10-02 00:00:00+00","2026-10-08 00:00:00+00")'

beforeEach(() => {
  db.responses = {}
  db.calls = []
})

describe('readShortageInputs (C7)', () => {
  it('groups product holds and serial holds under their product, and reads stock from the masked view', async () => {
    db.responses['inventory_reservations'] = {
      error: null,
      data: [
        { product_id: 'p1', asset_id: null, qty: 3, booking_id: 'b1', period: RANGE, bookings: { booking_no: '1001' } },
        { product_id: null, asset_id: 'u1', qty: 1, booking_id: 'b2', period: RANGE, bookings: [{ booking_no: '1002' }] },
      ],
    }
    db.responses['product_units_v'] = { error: null, data: [{ id: 'u1', product_id: 'p1' }] }
    db.responses['products_v'] = {
      error: null,
      data: [{ id: 'p1', name: 'FX3', asset_code: 'EQ000001', total_quantity: 3 }],
    }

    const out = await readShortageInputs()
    expect(db.calls).toEqual(['inventory_reservations', 'product_units_v', 'products_v'])
    expect(out.products).toEqual([{ id: 'p1', name: 'FX3', assetCode: 'EQ000001', totalQuantity: 3 }])
    expect(out.holdsByProduct.get('p1')?.map((h) => [h.bookingNo, h.qty])).toEqual([['1001', 3], ['1002', 1]])
  })

  it('counts a serial hold as one unit whatever qty says', async () => {
    db.responses['inventory_reservations'] = {
      error: null,
      data: [{ product_id: null, asset_id: 'u1', qty: 9, booking_id: 'b', period: RANGE, bookings: null }],
    }
    db.responses['product_units_v'] = { error: null, data: [{ id: 'u1', product_id: 'p1' }] }
    db.responses['products_v'] = { error: null, data: [{ id: 'p1', name: 'X', asset_code: 'EQ000001', total_quantity: 1 }] }
    expect((await readShortageInputs()).holdsByProduct.get('p1')?.[0]?.qty).toBe(1)
  })

  it('returns an empty answer without reading units or products when nothing is held', async () => {
    db.responses['inventory_reservations'] = { error: null, data: [] }
    const out = await readShortageInputs()
    expect(db.calls).toEqual(['inventory_reservations'])
    expect(out.products).toEqual([])
  })

  it('refuses rather than answers "no shortage" when a held product cannot be read', async () => {
    db.responses['inventory_reservations'] = {
      error: null,
      data: [{ product_id: 'p1', asset_id: null, qty: 1, booking_id: 'b', period: RANGE, bookings: null }],
    }
    db.responses['products_v'] = { error: null, data: [] }
    await expect(readShortageInputs()).rejects.toThrow(/could not be read/)
  })

  it('names the read that failed', async () => {
    db.responses['inventory_reservations'] = { error: { message: 'boom' }, data: [] }
    await expect(readShortageInputs()).rejects.toThrow(/live reservations.*boom/)
  })

  it('refuses an unreadable serial hold instead of treating it as free stock', async () => {
    db.responses['inventory_reservations'] = {
      error: null, data: [{ product_id: null, asset_id: 'missing-unit', qty: 1, booking_id: 'b', period: RANGE, bookings: null }],
    }
    db.responses['product_units_v'] = { error: null, data: [] }
    await expect(readShortageInputs()).rejects.toThrow('could not be matched')
  })

  it('refuses a malformed held period instead of omitting it from the shortage count', async () => {
    db.responses['inventory_reservations'] = {
      error: null, data: [{ product_id: 'p1', asset_id: null, qty: 1, booking_id: 'b', period: 'bad-range', bookings: null }],
    }
    await expect(readShortageInputs()).rejects.toThrow('could not be matched')
  })
})
