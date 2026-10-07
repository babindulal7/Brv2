import { describe, expect, it, vi } from 'vitest'

/*
 * 7 Oct 2026 — found by driving New Rental against live: a bundle of quantity-tracked components read
 * "Unavailable · 9 of 9 items unavailable" while each component read "10 of 10 free". These pin that a
 * bulk component is answered from stock less overlapping holds, shared within the bundle.
 */

const BULK = 'p-bulk'
const SERIAL = 'p-serial'

vi.mock('../../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
  },
}))

vi.mock('../bundles', () => ({
  listBundlesWithItems: () =>
    Promise.resolve([
      {
        id: 'b-1', bundleCode: 'BND-1', name: 'Kit', description: null, category: 'Camera', categoryId: null,
        dailyRate: 0, weeklyRate: 0, isActive: true,
        items: [
          { itemId: 'i1', productId: BULK, productName: 'ND filter', category: 'Accessory', brand: null, quantity: 2, days: 1, isMandatory: true, sortOrder: 0, dailyRate: null },
          { itemId: 'i2', productId: BULK, productName: 'ND filter (spare)', category: 'Accessory', brand: null, quantity: 2, days: 1, isMandatory: true, sortOrder: 1, dailyRate: null },
          { itemId: 'i3', productId: SERIAL, productName: 'Camera', category: 'Camera', brand: null, quantity: 1, days: 1, isMandatory: true, sortOrder: 2, dailyRate: null },
        ],
      },
    ]),
}))

const window = { fromAd: '2026-10-07T09:00:00+05:45', toAd: '2026-10-08T18:00:00+05:45' }

vi.mock('../availability', () => ({
  availabilityRules: () => ({ disqualifyingStates: new Set<string>(), bounds: 'half-open' }),
  readCandidates: () => Promise.resolve(new Map()),
  readHolds: () => Promise.resolve([]),
  readProductModes: () =>
    Promise.resolve(
      new Map([
        [BULK, { trackingMode: 'Quantity', totalQuantity: 10 }],
        [SERIAL, { trackingMode: 'Serialised', totalQuantity: 0 }],
      ]),
    ),
  readQuantityHolds: () =>
    Promise.resolve(
      new Map([[BULK, [{ bookingId: 'x', bookingNo: '880', qty: 7, window }]]]),
    ),
}))

import { listBundleRecords } from '../bundleRecords'

describe('listBundleRecords — quantity-tracked components', () => {
  it('a bulk component is free stock less overlapping holds, not 0 for having no unit rows', async () => {
    const [b] = await listBundleRecords(window)
    const [first, second] = b!.lines
    expect(first).toMatchObject({ unitsStock: 10, unitsAvailable: 3 })
    expect(first!.blockedBy).toBeUndefined()
    // The second line names the same product: only the 1 unit the first line did not take is left.
    expect(second).toMatchObject({ unitsAvailable: 1, blockedBy: 'Reserved' })
  })

  it('a serialised component with no units is unchanged — still 0, the unit path answers it', async () => {
    const [b] = await listBundleRecords(window)
    expect(b!.lines[2]).toMatchObject({ unitsStock: 0, unitsAvailable: 0 })
  })
})
