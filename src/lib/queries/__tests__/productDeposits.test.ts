import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  response: { data: [] as unknown[], error: null as { message: string } | null },
  calls: [] as Array<{ table: string; columns: string; ids: unknown }>,
}))

vi.mock('../../supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => ({
        in: async (_col: string, ids: unknown) => {
          db.calls.push({ table, columns, ids })
          return db.response
        },
      }),
    }),
  },
}))
vi.mock('../../monitoring', () => ({ captureError: vi.fn() }))

const { fetchProductDepositTerms } = await import('../productDeposits')

beforeEach(() => {
  db.response = { data: [], error: null }
  db.calls = []
})

describe('fetchProductDepositTerms (C6)', () => {
  it('reads the masked view, never the base table, and only the three deposit columns', async () => {
    db.response = { data: [], error: null }
    await fetchProductDepositTerms(['a'])
    expect(db.calls[0]?.table).toBe('products_v')
    expect(db.calls[0]?.columns).toBe('id, replacement_value, deposit_percent, deposit_fixed')
  })

  it('converts rupees to paisa and keeps the percent as a plain number', async () => {
    db.response = {
      data: [{ id: 'a', replacement_value: '50000.00', deposit_percent: '20', deposit_fixed: null }],
      error: null,
    }
    const terms = await fetchProductDepositTerms(['a'])
    expect(terms.get('a')).toEqual({ fixedPaisa: null, percent: 20, replacementPaisa: 5_000_000 })
  })

  it('keeps a masked (null) figure as null — "not allowed to see", never zero', async () => {
    db.response = { data: [{ id: 'a', replacement_value: null, deposit_percent: null, deposit_fixed: null }], error: null }
    const terms = await fetchProductDepositTerms(['a'])
    expect(terms.get('a')).toEqual({ fixedPaisa: null, percent: null, replacementPaisa: null })
  })

  it('asks once per distinct product id, and not at all for an empty list', async () => {
    await fetchProductDepositTerms(['a', 'a', 'b', ''])
    expect(db.calls[0]?.ids).toEqual(['a', 'b'])
    db.calls = []
    expect((await fetchProductDepositTerms([])).size).toBe(0)
    expect(db.calls).toHaveLength(0)
  })

  it('throws on a failed read rather than quietly weakening the deposit', async () => {
    db.response = { data: [], error: { message: 'permission denied' } }
    await expect(fetchProductDepositTerms(['a'])).rejects.toThrow(/permission denied/)
  })
})
