/**
 * # The expense write path — `lib/queries/finance.ts`, unblocked by 0054
 *
 * `expenses` carried a SELECT policy and no write policy at all until migration
 * 0054 added `expenses_insert_finance` and `expenses_update_finance`. Everything
 * below is the code that first uses them, and each test pins one way it goes
 * quietly wrong:
 *
 *  1. **A number minted in the browser.** `expense_no` is NOT NULL and unique.
 *     `next_document_number('expense')` takes a row lock on `number_sequences`,
 *     so it is the only thing that can hand two simultaneous operators different
 *     numbers. A client-side counter cannot, and would not fail visibly.
 *  2. **Rupees vs paisa the wrong way round.** The column is `numeric(14,2)` in
 *     RUPEES; the app works in integer paisa. Backwards writes a cost 100× wrong
 *     that still looks like a plausible figure.
 *  3. **A replayed submit recording the cost twice.** Law 8 — the `client_uuid`
 *     is the idempotency key, and a 23505 on it means "this already landed",
 *     not "this failed".
 *  4. **A status update that rewrites history.** Law 4's shape: `setExpenseStatus`
 *     must send `status` and nothing else, and must refuse a transition nothing
 *     ruled.
 *
 * `lib/supabase` is replaced wholesale — the same boundary
 * `lib/queries/__tests__/finance.test.ts` mocks at. Nothing here reaches a
 * database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rupees, toRupees } from '../../../lib/money'

const db = vi.hoisted(() => {
  interface State {
    table: string
    /** The literal object handed to `.insert()` — where a wrong or missing column is still visible. */
    inserted: Record<string, unknown> | null
    /** The literal object handed to `.update()`. A second key here is a history rewrite. */
    updated: Record<string, unknown> | null
    /** `.eq()` calls in order, which is how the compare-and-set is proved. */
    eqs: Array<[string, unknown]>
    /** Sequence keys `rpc('next_document_number')` was asked for. */
    rpcKeys: string[]
    rpcResult: { data: string | null; error: { message: string } | null }
    result: { data: unknown; error: { message: string; code?: string } | null }
  }

  const state: State = {
    table: '',
    inserted: null,
    updated: null,
    eqs: [],
    rpcKeys: [],
    rpcResult: { data: 'EXP-2026-0001', error: null },
    result: { data: null, error: null },
  }

  function reset(): void {
    state.table = ''
    state.inserted = null
    state.updated = null
    state.eqs = []
    state.rpcKeys = []
    state.rpcResult = { data: 'EXP-2026-0001', error: null }
    state.result = { data: null, error: null }
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    insert(payload: Record<string, unknown>) {
      state.inserted = payload
      return builder
    },
    update(payload: Record<string, unknown>) {
      state.updated = payload
      return builder
    },
    eq(column: string, value: unknown) {
      state.eqs.push([column, value])
      return builder
    },
    order: () => builder,
    single: () => Promise.resolve(state.result),
    maybeSingle: () => Promise.resolve(state.result),
    then(onFulfilled: (value: unknown) => unknown): void {
      onFulfilled(state.result)
    },
  }

  return {
    state,
    reset,
    supabase: {
      from(table: string) {
        state.table = table
        return builder
      },
      rpc(name: string, args: { p_sequence_key: string }) {
        if (name !== 'next_document_number') throw new Error(`unexpected rpc ${name}`)
        state.rpcKeys.push(args.p_sequence_key)
        return Promise.resolve(state.rpcResult)
      },
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

const {
  createExpense,
  setExpenseStatus,
  listExpenseCategories,
  listExpenseBranches,
  EXPENSE_TRANSITIONS,
  EXPENSE_ENTRY_STATUSES,
} = await import('../../../lib/queries/finance')

const CLIENT_UUID = '99999999-9999-4999-8999-999999999999'

function raw(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    expense_no: 'EXP-2026-0001',
    expense_date: '2026-07-26',
    amount: 1234.5,
    vendor_name: 'Sagarmatha Camera Service',
    description: 'Sensor clean, two bodies',
    category_id: '00000000-0000-0000-0000-000000000401',
    branch_id: '00000000-0000-0000-0000-000000000201',
    status: 'Draft',
    booking_id: null,
    receipt_url: null,
    receipt_size: null,
    created_at: '2026-07-26T04:15:00.000Z',
    expense_categories: { code: 'EXP-MAINT', name: 'Equipment Maintenance & Repair' },
    branches: { name: 'Boudha' },
    bookings: null,
    ...overrides,
  }
}

const INPUT = {
  categoryId: '00000000-0000-0000-0000-000000000401',
  branchId: '00000000-0000-0000-0000-000000000201',
  vendorName: '  Sagarmatha Camera Service  ',
  description: '  Sensor clean, two bodies  ',
  amount: rupees(1234.5),
  expenseDateAd: '2026-07-26',
  status: 'Draft' as const,
  createdBy: '00000000-0000-0000-0000-000000000101',
}

beforeEach(() => {
  db.reset()
})

describe('createExpense — the number comes from the database', () => {
  it('asks next_document_number for the expense sequence, and never builds one', async () => {
    db.state.result = { data: raw(), error: null }
    await createExpense(INPUT, CLIENT_UUID)

    expect(db.state.rpcKeys).toEqual(['expense'])
    expect(db.state.inserted?.['expense_no']).toBe('EXP-2026-0001')
  })

  it('refuses to insert when the allocator fails, rather than writing an unnumbered cost', async () => {
    db.state.rpcResult = { data: null, error: { message: 'permission denied for table number_sequences' } }
    await expect(createExpense(INPUT, CLIENT_UUID)).rejects.toThrow(/allocate a number/)
    expect(db.state.inserted).toBeNull()
  })

  it('refuses when the allocator returns nothing at all', async () => {
    db.state.rpcResult = { data: null, error: null }
    await expect(createExpense(INPUT, CLIENT_UUID)).rejects.toThrow(/returned nothing/)
    expect(db.state.inserted).toBeNull()
  })
})

describe('createExpense — money crosses the boundary once, in the right direction', () => {
  it('writes RUPEES to a numeric column from PAISA in the app', async () => {
    db.state.result = { data: raw(), error: null }
    await createExpense(INPUT, CLIENT_UUID)

    // 1234.5 rupees in, 1234.5 rupees written — not 123450, and not 12.345.
    expect(db.state.inserted?.['amount']).toBe(1234.5)
    expect(db.state.inserted?.['amount']).toBe(toRupees(INPUT.amount))
  })

  it('reads the row back as PAISA, so the round trip is lossless', async () => {
    db.state.result = { data: raw(), error: null }
    const row = await createExpense(INPUT, CLIENT_UUID)
    expect(toRupees(row.amount)).toBe(1234.5)
  })
})

describe('createExpense — Law 8, a replay does not record the cost twice', () => {
  it('sends the caller’s client_uuid rather than minting one per attempt', async () => {
    db.state.result = { data: raw(), error: null }
    await createExpense(INPUT, CLIENT_UUID)
    expect(db.state.inserted?.['client_uuid']).toBe(CLIENT_UUID)
  })

  it('returns the row the first submit created when the unique key rejects the replay', async () => {
    let attempt = 0
    const original = db.supabase.from
    db.supabase.from = ((table: string) => {
      attempt += 1
      const b = original(table) as Record<string, unknown>
      if (attempt === 1) {
        db.state.result = {
          data: null,
          error: { message: 'duplicate key value violates unique constraint "expenses_client_uuid_key"', code: '23505' },
        }
      } else {
        db.state.result = { data: raw({ expense_no: 'EXP-2026-0001' }), error: null }
      }
      return b
    }) as typeof db.supabase.from

    const row = await createExpense(INPUT, CLIENT_UUID)
    db.supabase.from = original

    // No throw, and the row is the one already in the ledger.
    expect(row.expenseNo).toBe('EXP-2026-0001')
    // The lookup was by the idempotency key, not by the number.
    expect(db.state.eqs).toContainEqual(['client_uuid', CLIENT_UUID])
  })
})

describe('createExpense — the payload is exactly the columns that exist', () => {
  it('trims the free-text columns and sends no column the table does not have', async () => {
    db.state.result = { data: raw(), error: null }
    await createExpense(INPUT, CLIENT_UUID)

    expect(db.state.table).toBe('expenses')
    expect(db.state.inserted?.['vendor_name']).toBe('Sagarmatha Camera Service')
    expect(db.state.inserted?.['description']).toBe('Sensor clean, two bodies')

    /*
     * The four fields §9.4 draws that have no column. If any of these ever
     * appears in the payload, PostgREST answers 400 — but the more likely
     * failure is that somebody adds it here and a migration later, and the two
     * disagree about what it means. Pinned as absent.
     */
    for (const absent of ['vat_amount', 'vat_rate', 'payment_method', 'method', 'paid_by', 'cost_centre']) {
      expect(Object.keys(db.state.inserted ?? {})).not.toContain(absent)
    }
  })

  it('offers only the two statuses an entry can create', async () => {
    // Nothing on a create form may write an approval nobody gave.
    expect([...EXPENSE_ENTRY_STATUSES]).toEqual(['Draft', 'Pending Approval'])
    expect([...EXPENSE_ENTRY_STATUSES]).not.toContain('Approved')
    expect([...EXPENSE_ENTRY_STATUSES]).not.toContain('Paid')
  })
})

describe('setExpenseStatus — the workflow moves, the history does not', () => {
  it('sends status and nothing else', async () => {
    db.state.result = { data: raw({ status: 'Pending Approval' }), error: null }
    await setExpenseStatus('11111111-1111-4111-8111-111111111111', 'Draft', 'Pending Approval')

    expect(db.state.updated).toEqual({ status: 'Pending Approval' })
    // A second key here would mean a recorded cost could be rewritten, which is
    // what expense_reversals exists to replace.
    expect(Object.keys(db.state.updated ?? {})).toHaveLength(1)
  })

  it('is a compare-and-set, so a stale click cannot overwrite someone else’s decision', async () => {
    db.state.result = { data: raw({ status: 'Approved' }), error: null }
    await setExpenseStatus('11111111-1111-4111-8111-111111111111', 'Pending Approval', 'Approved')

    expect(db.state.eqs).toContainEqual(['id', '11111111-1111-4111-8111-111111111111'])
    expect(db.state.eqs).toContainEqual(['status', 'Pending Approval'])
  })

  it('tells the operator when the row moved under them, rather than reporting success', async () => {
    db.state.result = { data: null, error: null }
    await expect(
      setExpenseStatus('11111111-1111-4111-8111-111111111111', 'Pending Approval', 'Approved'),
    ).rejects.toThrow(/no longer Pending Approval/)
  })

  it('refuses a transition nothing ruled, without touching the database', async () => {
    await expect(
      setExpenseStatus('11111111-1111-4111-8111-111111111111', 'Approved', 'Paid'),
    ).rejects.toThrow(/Approved is terminal/)
    expect(db.state.updated).toBeNull()

    await expect(
      setExpenseStatus('11111111-1111-4111-8111-111111111111', 'Draft', 'Approved'),
    ).rejects.toThrow(/only moves are Pending Approval/)
    expect(db.state.updated).toBeNull()
  })

  it('declares a transition list for every member of expense_status', async () => {
    // A missing key would make `EXPENSE_TRANSITIONS[row.status]` undefined and
    // crash the row menu on a status nobody thought about.
    expect(Object.keys(EXPENSE_TRANSITIONS).sort()).toEqual(
      ['Approved', 'Cancelled', 'Draft', 'Paid', 'Pending Approval', 'Rejected'].sort(),
    )
    // Paid and Cancelled are readable and filterable, never written here.
    for (const from of Object.keys(EXPENSE_TRANSITIONS) as Array<keyof typeof EXPENSE_TRANSITIONS>) {
      expect(EXPENSE_TRANSITIONS[from]).not.toContain('Paid')
      expect(EXPENSE_TRANSITIONS[from]).not.toContain('Cancelled')
    }
  })
})

describe('the two lookups the entry form needs', () => {
  it('reads only ACTIVE categories, so a retired one cannot be chosen for a new expense', async () => {
    db.state.result = { data: [{ id: 'a', code: 'EXP-FUEL', name: 'Vehicle Fuel & Transport', description: null }], error: null }
    const rows = await listExpenseCategories()

    expect(db.state.table).toBe('expense_categories')
    expect(db.state.eqs).toContainEqual(['is_active', true])
    expect(rows[0]?.code).toBe('EXP-FUEL')
  })

  it('reads branches unfiltered — expenses.branch_id is NOT NULL and every branch is a legal target', async () => {
    db.state.result = { data: [{ id: 'b', name: 'Boudha' }], error: null }
    const rows = await listExpenseBranches()

    expect(db.state.table).toBe('branches')
    expect(rows[0]?.name).toBe('Boudha')
  })
})
