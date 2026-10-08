/**
 * `sumDepositsHeld` — the closing's deposit liability (FI-01).
 *
 * Pinned here because the reader it replaced (`listClients`) was wrong in two
 * quiet ways — it dropped deactivated clients and it stopped at 100 rows — and
 * both produced a plausible, smaller number that was then signed into
 * `daily_closings.deposits_held`. The assertions are on the calls the query
 * makes, not on a database: no `deactivated_at` filter, a `.range()` page at
 * PostgREST's `max_rows`, and a refusal to return a total the count disagrees
 * with.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => {
  interface Page {
    rows: Array<{ id: string; deposit_held_amount: number | null }>
    count: number | null
    error?: { message: string }
  }
  const state = {
    table: '',
    selects: [] as Array<[string, unknown]>,
    calls: [] as Array<[string, ...unknown[]]>,
    pages: [] as Page[],
    served: 0,
  }
  function reset(): void {
    state.table = ''
    state.selects = []
    state.calls = []
    state.pages = []
    state.served = 0
  }
  const builder = {
    select(columns: string, options?: unknown) {
      state.selects.push([columns, options])
      return builder
    },
    is(column: string, value: unknown) {
      state.calls.push(['is', column, value])
      return builder
    },
    order(column: string, options?: unknown) {
      state.calls.push(['order', column, options])
      return builder
    },
    limit(n: number) {
      state.calls.push(['limit', n])
      return builder
    },
    range(from: number, to: number) {
      state.calls.push(['range', from, to])
      return builder
    },
    then(onFulfilled: (value: { data: unknown[] | null; error: unknown; count: number | null }) => unknown): void {
      const page = state.pages[state.served] ?? { rows: [], count: null }
      state.served += 1
      onFulfilled({ data: page.rows, error: page.error ?? null, count: page.count })
    },
  }
  const supabase = {
    from(table: string) {
      state.table = table
      return builder
    },
  }
  return { state, reset, supabase }
})

vi.mock('../../supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

const { sumDepositsHeld } = await import('../clients')

const rowsOf = (n: number, held: number | null, prefix = 'c') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${String(i).padStart(5, '0')}`, deposit_held_amount: held }))

beforeEach(() => {
  db.reset()
})

describe('sumDepositsHeld — every client, not the first hundred active ones', () => {
  it('reads the directory view with no deactivated_at filter and no limit', async () => {
    db.state.pages = [{ rows: rowsOf(3, 100), count: 3 }]
    await sumDepositsHeld()
    expect(db.state.table).toBe('client_directory_v')
    expect(db.state.calls.find((c) => c[0] === 'is')).toBeUndefined()
    expect(db.state.calls.find((c) => c[0] === 'limit')).toBeUndefined()
  })

  it('asks for the exact count and pages on the unique id', async () => {
    db.state.pages = [{ rows: rowsOf(2, 50), count: 2 }]
    await sumDepositsHeld()
    expect(db.state.selects[0]?.[1]).toEqual({ count: 'exact' })
    expect(db.state.calls).toContainEqual(['order', 'id', { ascending: true }])
    expect(db.state.calls).toContainEqual(['range', 0, 999])
  })

  it('pages until a short page arrives and sums across pages, in paisa', async () => {
    db.state.pages = [
      { rows: rowsOf(1000, 10, 'a'), count: 1250 },
      { rows: rowsOf(250, 2.5, 'b'), count: 1250 },
    ]
    const out = await sumDepositsHeld()
    expect(out.clients).toBe(1250)
    // 1000 × Rs 10 + 250 × Rs 2.50 = Rs 10,625 → paisa
    expect(out.total).toBe(10_625 * 100)
    expect(db.state.calls.filter((c) => c[0] === 'range')).toEqual([
      ['range', 0, 999],
      ['range', 1000, 1999],
    ])
  })

  it('returns a zero liability for an empty directory, and says it read nothing', async () => {
    db.state.pages = [{ rows: [], count: 0 }]
    expect(await sumDepositsHeld()).toEqual({ total: 0, clients: 0 })
  })

  it('refuses a total the server count disagrees with', async () => {
    // A page came back short of the count — a transport cap, a moved row, a
    // truncated response. Whatever it was, the sum is over fewer clients than
    // exist, and that is a liability understated.
    db.state.pages = [{ rows: rowsOf(4, 100), count: 7 }]
    await expect(sumDepositsHeld()).rejects.toThrow(/7 clients in the directory but 4 were read/)
  })

  it('refuses to sum a money-blind read as zero (Law 6)', async () => {
    // The view NULLs the column for a role that may not see money. That is not
    // "nothing held", and a closing built from it would sign a false zero.
    db.state.pages = [{ rows: rowsOf(3, null), count: 3 }]
    await expect(sumDepositsHeld()).rejects.toThrow(/may not view money/)
  })

  it('surfaces a query error by name rather than as an empty liability', async () => {
    db.state.pages = [{ rows: [], count: null, error: { message: 'permission denied' } }]
    await expect(sumDepositsHeld()).rejects.toThrow(/sumDepositsHeld failed: permission denied/)
  })
})
