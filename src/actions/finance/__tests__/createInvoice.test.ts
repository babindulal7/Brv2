/**
 * CREATE_INVOICE — that it dispatches the transaction rather than sequencing it.
 *
 * ## Why these assertions changed shape
 *
 * The previous suite proved that the action built the right nine lines from the
 * booking, the crew and the transport. It proved it against a mocked Supabase
 * client, and that is precisely why it was green while the action could not run
 * at all:
 *
 *   · **DATA-01** — `0062` revoked table-level SELECT on `booking_lines` and
 *     `booking_transport` and granted back only the non-money columns, so the
 *     projections naming `rate`, `discount_amount`, `delivery_charge` and
 *     `fuel_charge` returned `42501` for *every* signed-in session, Owner
 *     included. The mock has no grants, so the mock never noticed.
 *   · **DB-03** — the header and the lines were separate PostgREST calls, so a
 *     failure between them left a header with some of its lines and totals that
 *     under-bill the job.
 *
 * Both are answered by moving the snapshot and both writes into
 * `create_invoice(jsonb)` (`0096`). The line arithmetic that used to live here
 * now lives in SQL and is asserted by that migration's own post-conditions,
 * which run against a real database and a real grant set — the only place those
 * claims can be tested honestly.
 *
 * So this suite tests what is left in TypeScript, and one thing more: a
 * **source-level guard** that this file never re-acquires a base-table money
 * read. That guard is the DATA-01 regression test; nothing else in the codebase
 * binds an action's projection to the live grant set.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const rpc = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> | undefined }>,
  result: { data: null as unknown, error: null as unknown },
}))

/*
 * `lib/dataAccess` is no longer imported by the action. It is mocked to THROW
 * so that a future edit which reaches for `idempotentInsert` again — the
 * multi-call shape DB-03 was filed against — fails here rather than in
 * production.
 */
vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async () => {
    throw new Error('createInvoice must not write tables directly; create_invoice(jsonb) owns the transaction.')
  },
  safeUpdate: async () => {
    throw new Error('createInvoice must not update anything.')
  },
}))

const db = vi.hoisted(() => ({
  tablesTouched: [] as string[],
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      db.tablesTouched.push(table)
      throw new Error(`createInvoice must not read ${table} from the browser; create_invoice(jsonb) reads it.`)
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpc.calls.push({ name, args })
      return rpc.result
    },
  },
  newClientUuid: () => '00000000-0000-4000-8000-00000000000f',
}))

const { createInvoice } = await import('../createInvoice')

const CTX = { userId: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'Owner' as const, isOnline: true }

const INPUT = { bookingNo: '880', vatPercent: 13, clientUuid: 'k-1' }

/** What `0096` returns for a booking with two equipment lines and one transport row. */
const WROTE = {
  invoice_id: '99999999-9999-4999-8999-999999999999',
  invoice_no: null,
  status: 'Draft',
  booking_id: '22222222-2222-4222-8222-222222222222',
  booking_no: '880',
  client_id: '33333333-3333-4333-8333-333333333333',
  due_date: '2026-09-14',
  line_count: 3,
  subtotal: 21000,
  discount_amount: 2100,
  taxable_amount: 18900,
  vat_amount: 2457,
  total: 21357,
  replayed: false,
}

const payloadOf = (i = 0) =>
  (rpc.calls[i]?.args?.['p_payload'] ?? {}) as Record<string, unknown>

beforeEach(() => {
  rpc.calls.length = 0
  db.tablesTouched.length = 0
  rpc.result = { data: WROTE, error: null }
})

describe('createInvoice — one transaction, dispatched not sequenced', () => {
  it('calls create_invoice exactly once and reads no table from the browser', async () => {
    await createInvoice(INPUT, CTX)
    expect(rpc.calls).toHaveLength(1)
    expect(rpc.calls[0]?.name).toBe('create_invoice')
    // DB-03: the header and the lines are no longer separate round trips, so
    // there is no window in which a header can exist without them.
    expect(db.tablesTouched).toEqual([])
  })

  it('sends the Law 8 key, the actor and the booking — and the VAT rate as a FRACTION', async () => {
    await createInvoice({ ...INPUT, vatPercent: 13 }, CTX)
    const payload = payloadOf()
    expect(payload['client_uuid']).toBe('k-1')
    expect(payload['created_by']).toBe(CTX.userId)
    expect(payload['booking_no']).toBe('880')
    // `invoices.vat_rate` is numeric(5,4). 13% is 0.13, never 13.
    expect(payload['vat_rate']).toBeCloseTo(0.13, 10)
  })

  it('sends no line data at all — the invoice bills the booking, not a form (SPEC-P0-1 §3.1)', async () => {
    await createInvoice(INPUT, CTX)
    const payload = payloadOf()
    expect(payload['lines']).toBeUndefined()
    // And no money column travels to the browser on the way to being written.
    const keys = Object.keys(payload)
    for (const forbidden of ['rate', 'discount_amount', 'delivery_charge', 'fuel_charge', 'supplier_cost']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('trims the booking number and drops an empty note to null', async () => {
    await createInvoice({ ...INPUT, bookingNo: '  880  ', notes: '   ' }, CTX)
    expect(payloadOf()['booking_no']).toBe('880')
    expect(payloadOf()['notes']).toBeNull()
  })

  it('returns the totals POSTGRES computed, in paisa', async () => {
    const result = await createInvoice(INPUT, CTX)
    expect(result.invoiceId).toBe(WROTE.invoice_id)
    expect(result.bookingId).toBe(WROTE.booking_id)
    expect(result.bookingNo).toBe('880')
    expect(result.clientId).toBe(WROTE.client_id)
    expect(result.status).toBe('Draft')
    expect(result.dueDateAd).toBe('2026-09-14')
    expect(result.linesWritten).toBe(3)
    expect(result.subtotalPaisa).toBe(2_100_000)
    expect(result.discountPaisa).toBe(210_000)
    expect(result.taxablePaisa).toBe(1_890_000)
    expect(result.vatPaisa).toBe(245_700)
    expect(result.totalPaisa).toBe(2_135_700)
  })

  it('accepts the numeric-as-string figures postgrest-js may hand back', async () => {
    rpc.result = { data: { ...WROTE, subtotal: '21000.00', total: '21357.00' }, error: null }
    const result = await createInvoice(INPUT, CTX)
    expect(result.subtotalPaisa).toBe(2_100_000)
    expect(result.totalPaisa).toBe(2_135_700)
  })

  it('R-15 — a Draft carries no number, and the event says so rather than omitting it', async () => {
    const result = await createInvoice(INPUT, CTX)
    expect(result).not.toHaveProperty('invoiceNo')
    expect(result.status).toBe('Draft')
  })
})

describe('createInvoice — Law 8 replay', () => {
  it('passes the replay through: the same id, and nothing was written', async () => {
    rpc.result = { data: { ...WROTE, replayed: true }, error: null }
    const result = await createInvoice(INPUT, CTX)

    expect(result.invoiceId).toBe(WROTE.invoice_id)
    expect(result.replayed).toBe(true)
    // A replay is still exactly one dispatch — the action never retries on its
    // own, because a retry it invented would carry the same key and prove
    // nothing about the one the operator pressed.
    expect(rpc.calls).toHaveLength(1)
  })

  it('two calls with the same key return the same invoice and write nothing twice', async () => {
    const first = await createInvoice(INPUT, CTX)
    rpc.result = { data: { ...WROTE, replayed: true }, error: null }
    const second = await createInvoice(INPUT, CTX)

    expect(second.invoiceId).toBe(first.invoiceId)
    expect(second.replayed).toBe(true)
    expect(first.replayed).toBe(false)
    // Both went to the same function with the same key; the database, not this
    // file, is what makes the second one write nothing.
    expect(rpc.calls.map((c) => c.name)).toEqual(['create_invoice', 'create_invoice'])
    expect(payloadOf(0)['client_uuid']).toBe(payloadOf(1)['client_uuid'])
  })

  it('refuses a replay whose invoice has left Draft — that is Void + Credit Note (R-04)', async () => {
    rpc.result = { data: { ...WROTE, status: 'Sent', invoice_no: 'INV-121', replayed: true }, error: null }
    await expect(createInvoice(INPUT, CTX)).rejects.toThrow(/no longer a Draft/i)
  })
})

describe('createInvoice — refusals name the cause, inline (Law 12)', () => {
  /*
   * Two layers refuse this, and `lib/rbac` gets there first: `invoice.create`
   * resolves through `canIssueInvoice`, which is itself offline-aware, so the
   * dispatcher rejects before `execute` is entered and the sentence the
   * operator sees is the permission one. The action's own guard (naming the
   * totals) is the backstop for a caller that reaches `execute` another way.
   * What matters at both layers is the same: nothing is dispatched.
   */
  it('offline: refuses without dispatching, because a queued invoice has no totals', async () => {
    await expect(createInvoice(INPUT, { ...CTX, isOnline: false })).rejects.toThrow()
    expect(rpc.calls).toHaveLength(0)
  })

  it('validates the Law 8 key before anything leaves the browser', async () => {
    await expect(createInvoice({ ...INPUT, clientUuid: '' }, CTX)).rejects.toThrow(/idempotency key/i)
    expect(rpc.calls).toHaveLength(0)
  })

  it('validates the booking and the VAT rate', async () => {
    await expect(createInvoice({ ...INPUT, bookingNo: '  ' }, CTX)).rejects.toThrow(/must name the booking/i)
    await expect(createInvoice({ ...INPUT, vatPercent: 130 }, CTX)).rejects.toThrow(/between 0 and 100/i)
    expect(rpc.calls).toHaveLength(0)
  })

  it('42883 — names 0096 rather than repeating "function does not exist"', async () => {
    rpc.result = { data: null, error: { code: '42883', message: 'function create_invoice(jsonb) does not exist' } }
    await expect(createInvoice(INPUT, CTX)).rejects.toThrow(/0096_create_invoice_rpc\.sql/)
  })

  it('23502 on invoice_no — names 0086 and R-15, not the column', async () => {
    rpc.result = { data: null, error: { code: '23502', message: 'null value in column "invoice_no" violates not-null constraint' } }
    await expect(createInvoice(INPUT, CTX)).rejects.toThrow(/0086_invoice_write_rights_and_draft_without_number/)
  })

  it('42501 — passes the role refusal through and points at 0086 for the RLS case', async () => {
    rpc.result = {
      data: null,
      error: { code: '42501', message: 'create_invoice: this session (Coordinator) may not raise an invoice.' },
    }
    await expect(createInvoice(INPUT, CTX)).rejects.toThrow(/may not raise an invoice/)
  })

  it('any other failure is reported as NOT raised, never as a partial success', async () => {
    rpc.result = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
    await expect(createInvoice(INPUT, CTX)).rejects.toThrow(/treat it as not raised/i)
  })

  it('a success that returned no invoice_id is treated as NOT created', async () => {
    rpc.result = { data: { replayed: false }, error: null }
    await expect(createInvoice(INPUT, CTX)).rejects.toThrow(/treat this as NOT created/i)
  })

  it('a null body from a backend that reported success is treated as NOT created', async () => {
    rpc.result = { data: null, error: null }
    await expect(createInvoice(INPUT, CTX)).rejects.toThrow(/treat this as NOT created/i)
  })
})

/**
 * The DATA-01 regression guard.
 *
 * Nothing else binds an action's SELECT projection to the live grant set: the
 * query layer carries the discipline by convention (`booking_lines_v`,
 * `booking_transport_v`) and `src/actions` has no rule, no lint and no type
 * that says a base-table projection may name only granted columns. A mocked
 * client normally cannot catch that, because a mock has no grants — so this
 * mock refuses `.from()` outright. Any re-acquired table read, on any path
 * exercised here, fails with the name of the table it reached for.
 *
 * ⚠ It can only speak for the paths these tests take. It is a floor, not a
 * proof; the proof is `0096`'s post-conditions, which run against a real grant
 * set. The stronger static check — reading this file's source and asserting it
 * names no revoked column — is not available: `tsconfig.json` carries no Node
 * types, so a suite under `src/` cannot import `node:fs`.
 */
describe('createInvoice — DATA-01 cannot come back', () => {
  it('reaches for no table on the happy path', async () => {
    await createInvoice(INPUT, CTX)
    expect(db.tablesTouched).toEqual([])
  })

  it('reaches for no table on a refusal either — not even to explain itself', async () => {
    rpc.result = { data: null, error: { code: '42501', message: 'refused' } }
    await expect(createInvoice(INPUT, CTX)).rejects.toThrow()
    expect(db.tablesTouched).toEqual([])
  })

  it('dispatches create_invoice and no other function', async () => {
    await createInvoice(INPUT, CTX)
    expect(rpc.calls.map((c) => c.name)).toEqual(['create_invoice'])
  })
})
