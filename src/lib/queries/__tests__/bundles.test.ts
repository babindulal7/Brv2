import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ table: string; columns: string }>,
    responses: {} as Record<string, Array<{ data: unknown; error: { message: string } | null }>>,
  }
  const from = (table: string) => ({
    select(columns: string) {
      state.calls.push({ table, columns })
      return {
        eq() { return this },
        order() { return this },
        limit() { return Promise.resolve(state.responses[table]?.shift()) },
        in() { return Promise.resolve(state.responses[table]?.shift()) },
      }
    },
  })
  return { state, from }
})

vi.mock('../../supabase', () => ({ supabase: { from: db.from } }))

import { listBundlesWithItems } from '../bundles'

const component = {
  id: 'item-1', product_id: 'product-1', quantity: 1, days: 1,
  is_mandatory: true, sort_order: 0,
}
const bundle = {
  id: 'bundle-1', bundle_code: 'BND-1', name: 'Camera kit', description: null,
  daily_rate: 100, weekly_rate: 500, is_active: true, category_id: null,
  category: null,
}

beforeEach(() => {
  db.state.calls = []
  db.state.responses = {}
})

describe('listBundlesWithItems across bundle item schemas', () => {
  it('retries without is_active when the older database lacks that column', async () => {
    db.state.responses['bundles_v'] = [
      { data: null, error: { message: 'column bundle_items_1.is_active does not exist' } },
      { data: [{ ...bundle, items: [component] }], error: null },
    ]
    db.state.responses['products_v'] = [{ data: [{
      id: 'product-1', name: 'Camera', brand: null, tracking_mode: 'Serialized', category: null,
    }], error: null }]
    db.state.responses['product_units_v'] = [{ data: [], error: null }]

    const rows = await listBundlesWithItems()

    expect(db.state.calls.filter((call) => call.table === 'bundles_v')).toHaveLength(2)
    expect(db.state.calls[0]?.columns).toContain('sort_order, is_active')
    expect(db.state.calls[1]?.columns).not.toContain('sort_order, is_active')
    expect(rows[0]?.items).toHaveLength(1)
    expect(rows[0]?.items[0]?.productName).toBe('Camera')
  })

  it('keeps the soft-deactivation filter on the newer schema', async () => {
    db.state.responses['bundles_v'] = [{ data: [{
      ...bundle, items: [{ ...component, is_active: false }],
    }], error: null }]

    const rows = await listBundlesWithItems()

    expect(db.state.calls.filter((call) => call.table === 'bundles_v')).toHaveLength(1)
    expect(rows[0]?.items).toEqual([])
  })

  it('does not retry unrelated database errors', async () => {
    db.state.responses['bundles_v'] = [{ data: null, error: { message: 'permission denied for bundles_v' } }]

    await expect(listBundlesWithItems()).rejects.toThrow('permission denied for bundles_v')
    expect(db.state.calls.filter((call) => call.table === 'bundles_v')).toHaveLength(1)
  })
})
