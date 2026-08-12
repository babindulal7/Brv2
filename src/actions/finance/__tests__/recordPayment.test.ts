/**
 * RECORD_PAYMENT — the write, and the six ways it must refuse.
 *
 * Every assertion here exists because the failure it pins is INVISIBLE on the
 * screen. A payment that was never written, a payment written 100× too large,
 * and a payment written correctly all look identical to the operator: the modal
 * closes and a toast says "Payment Recorded". Only a test can tell them apart.
 *
 * The boundaries mocked are `lib/dataAccess` (the write) and `lib/supabase`
 * (the invoice lookup and the number allocator) — the same two seams
 * `lib/queries/__tests__/finance.test.ts` mocks. Nothing about the action's own
 * logic is stubbed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const access = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updateCalls: [] as unknown[][],
  /** What `idempotentInsert` hands back. Overridden per test to model its odd branches. */
  insertResult: { data: {} as unknown, error: null as unknown },
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    access.inserts.push({ table, payload })
    return access.insertResult
  },
  /*
   * Law 4. Present only so that a future edit which reaches for it fails loudly
   * here instead of at the database. `payments` is on `dataAccess`'s own
   * immutable list and `trg_payments_reject_update` (0046) is live, but a test
   * that says so is cheaper than a 500 an operator has to report.
   */
  safeUpdate: async (...args: unknown[]) => {
    access.updateCalls.push(args)
    throw new Error('safeUpdate must never be reached from a payment write — Law 4')
  },
}))

const db = vi.hoisted(() => {
  const state = {
    invoiceRow: null as Record<string, unknown> | null,
    invoiceError: null as { message: string } | null,
    rpc: { data: 'PAY-2026-0001' as unknown, error: null as { message: string } | null },
    tablesRead: [] as string[],
    invoiceNosQueried: [] as string[],
    rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  }

  const builder: Record<string, unknown> = {}
  builder['select'] = () => builder
  builder['eq'] = (column: string, value: string) => {
    if (column === 'invoice_no') state.invoiceNosQueried.push(value)
    return builder
  }
  builder['maybeSingle'] = async () => ({ data: state.invoiceRow, error: state.invoiceError })

  return {
    state,
    supabase: {
      from: (table: string) => {
        state.tablesRead.push(table)
        return builder
      },
      rpc: async (fn: string, args: unknown) => {
        state.rpcCalls.push({ fn, args })
        return state.rpc
      },
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

const { recordPayment } = await import('../recordPayment')

/** Owner is one of the three roles `rbac.canRecordPayment` admits. */
const CTX = { userId: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'Owner' as const, isOnline: true }

const LIVE_INVOICE = {
  id: '11111111-1111-4111-8111-111111111111',
  invoice_no: 'INV-492',
  booking_id: '22222222-2222-4222-8222-222222222222',
  client_id: '33333333-3333-4333-8333-333333333333',
  branch_id: '44444444-4444-4444-8444-444444444444',
  voided_at: null,
}

/** A well-formed submit. Rs 1,500 typed in the modal becomes 150 000 paisa. */
const INPUT = {
  invoiceNo: 'INV-492',
  amountPaisa: 150_000,
  paymentMethod: 'eSewa',
  reference: 'TXN-9948123',
  notes: 'Advance for the Pokhara shoot',
  clientUuid: '55555555-5555-4555-8555-555555555555',
}

beforeEach(() => {
  access.inserts.length = 0
  access.updateCalls.length = 0
  access.insertResult = {
    data: { id: '66666666-6666-4666-8666-666666666666', payment_no: 'PAY-2026-0001' },
    error: null,
  }
  db.state.invoiceRow = { ...LIVE_INVOICE }
  db.state.invoiceError = null
  db.state.rpc = { data: 'PAY-2026-0001', error: null }
  db.state.tablesRead.length = 0
  db.state.invoiceNosQueried.length = 0
  db.state.rpcCalls.length = 0
})

describe('recordPayment — the row it writes', () => {
  it('writes ONE row, into `payments`, and nothing else', async () => {
    await recordPayment(INPUT, CTX)
    expect(access.inserts).toHaveLength(1)
    expect(access.inserts[0]!.table).toBe('payments')
    // Law 1: the invoice's paid/outstanding/status are moved by
    // sync_payment_to_invoice() (0010:245-283), never by this action.
    expect(access.updateCalls).toHaveLength(0)
  })

  it('converts paisa → RUPEES exactly once — the 100× bug that still looks plausible', async () => {
    await recordPayment(INPUT, CTX)
    // `payments.amount` is numeric(14,2) in rupees. 150 000 paisa is Rs 1,500 —
    // NOT 150000, and NOT 15.
    expect(access.inserts[0]!.payload['amount']).toBe(1500)
  })

  it('takes `payment_no` from next_document_number(), never from the clock', async () => {
    await recordPayment(INPUT, CTX)
    expect(db.state.rpcCalls).toEqual([{ fn: 'next_document_number', args: { p_sequence_key: 'payment' } }])
    expect(access.inserts[0]!.payload['payment_no']).toBe('PAY-2026-0001')
  })

  it('carries the caller`s Law 8 key unchanged, so a replay dedups instead of double-charging', async () => {
    await recordPayment(INPUT, CTX)
    expect(access.inserts[0]!.payload['client_uuid']).toBe(INPUT.clientUuid)
  })

  it('fills every NOT NULL FK from the invoice, not from the caller', async () => {
    await recordPayment(INPUT, CTX)
    const payload = access.inserts[0]!.payload
    expect(db.state.invoiceNosQueried).toEqual(['INV-492'])
    expect(payload['invoice_id']).toBe(LIVE_INVOICE.id)
    expect(payload['booking_id']).toBe(LIVE_INVOICE.booking_id)
    expect(payload['client_id']).toBe(LIVE_INVOICE.client_id)
    expect(payload['branch_id']).toBe(LIVE_INVOICE.branch_id)
    expect(payload['received_by']).toBe(CTX.userId)
  })

  it('records an Advance Payment in status Received — Law 5 forbids the deposit type outright', async () => {
    await recordPayment(INPUT, CTX)
    const payload = access.inserts[0]!.payload
    expect(payload['payment_type']).toBe('Advance Payment')
    expect(payload['payment_type']).not.toBe('Security Deposit')
    // sync_payment_to_invoice() sums only 'Received' rows; any other status
    // writes a payment that never moves the invoice.
    expect(payload['status']).toBe('Received')
  })

  it('leaves the server to stamp payment_date and to choose no bank account', async () => {
    await recordPayment(INPUT, CTX)
    const payload = access.inserts[0]!.payload
    // Law 7 — the DB default is `now()` in UTC and cannot be skewed by the
    // operator's device clock.
    expect(payload).not.toHaveProperty('payment_date')
    // No mapping from the modal's six method labels to a real bank_accounts
    // row exists; guessing one credits an account nobody chose. See METHOD.
    expect(payload).not.toHaveProperty('bank_account_id')
  })

  it('puts the reference in transaction_ref and keeps the method visible in notes', async () => {
    await recordPayment(INPUT, CTX)
    const payload = access.inserts[0]!.payload
    expect(payload['transaction_ref']).toBe('TXN-9948123')
    expect(payload['notes']).toBe('Method: eSewa\nAdvance for the Pokhara shoot')
  })

  it('writes notes as NULL rather than an empty string when there is nothing to say', async () => {
    await recordPayment({ ...INPUT, paymentMethod: undefined, notes: '   ', reference: '  ' }, CTX)
    const payload = access.inserts[0]!.payload
    expect(payload['notes']).toBeNull()
    expect(payload['transaction_ref']).toBeNull()
  })

  it('returns the DB-generated row id, not a client-side string', async () => {
    const result = await recordPayment(INPUT, CTX)
    expect(result.paymentId).toBe('66666666-6666-4666-8666-666666666666')
    expect(result.paymentNo).toBe('PAY-2026-0001')
    expect(result.invoiceId).toBe(LIVE_INVOICE.id)
    expect(result.amountPaisa).toBe(150_000)
  })
})

describe('recordPayment — the refusals, each of which must write nothing', () => {
  it('refuses an invoice number that does not exist, and names it', async () => {
    db.state.invoiceRow = null
    await expect(recordPayment({ ...INPUT, invoiceNo: 'B-715' }, CTX)).rejects.toThrow(/No invoice numbered B-715/)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses a VOIDED invoice — a payment here would silently un-void it', async () => {
    db.state.invoiceRow = { ...LIVE_INVOICE, voided_at: '2026-08-01T00:00:00.000Z' }
    await expect(recordPayment(INPUT, CTX)).rejects.toThrow(/voided/i)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses when the number allocator fails, rather than inventing a payment_no', async () => {
    db.state.rpc = { data: null, error: { message: 'sequence locked' } }
    await expect(recordPayment(INPUT, CTX)).rejects.toThrow(/payment number/)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses a queued write — an optimistic payload is not a recorded payment', async () => {
    /*
     * `idempotentInsert` returns `{ data: <the payload it sent>, error: null }`
     * on its offline and 'Failed to fetch' branches (dataAccess.ts:39-53). That
     * object has no `id`, because only Postgres fills `gen_random_uuid()`. If
     * this action ever accepted it, the modal would close and a toast would
     * announce a payment the ledger had never seen — the exact defect the
     * dispatcher was built to kill, re-created one layer down.
     */
    access.insertResult = { data: { payment_no: 'PAY-2026-0001', amount: 1500 }, error: null }
    await expect(recordPayment(INPUT, CTX)).rejects.toThrow(/queued rather than written/)
  })

  it('refuses when the duplicate-replay re-select comes back with an error', async () => {
    // dataAccess.ts:56-58 is the one branch that returns a populated `error`.
    access.insertResult = { data: null, error: { message: 'permission denied for table payments' } }
    await expect(recordPayment(INPUT, CTX)).rejects.toThrow(/not recorded/)
  })

  it('refuses offline before touching dataAccess, whatever ctx claims', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    try {
      await expect(recordPayment(INPUT, CTX)).rejects.toThrow(/offline/i)
      expect(access.inserts).toHaveLength(0)
      // The lookup must not have run either — nothing at all reached the network.
      expect(db.state.rpcCalls).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refuses a zero, negative, non-finite or fractional-paisa amount', async () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(recordPayment({ ...INPUT, amountPaisa: bad }, CTX)).rejects.toThrow(/greater than zero/)
    }
    await expect(recordPayment({ ...INPUT, amountPaisa: 150.5 }, CTX)).rejects.toThrow(/whole number of paisa/)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses a submit with no Law 8 key rather than minting one at send time', async () => {
    await expect(recordPayment({ ...INPUT, clientUuid: '' }, CTX)).rejects.toThrow(/idempotency key/)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses a submit that names no invoice', async () => {
    await expect(recordPayment({ ...INPUT, invoiceNo: '  ' }, CTX)).rejects.toThrow(/name the invoice/)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses Warehouse — Law 6, through lib/rbac, before validate or execute', async () => {
    await expect(
      recordPayment(INPUT, { userId: 'u-2', role: 'Warehouse', isOnline: true }),
    ).rejects.toThrow(/payment\.create/)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses a caller with no session context — a payment has an actor or it is not recorded', async () => {
    await expect(recordPayment(INPUT)).rejects.toThrow(/session context/)
    expect(access.inserts).toHaveLength(0)
  })
})
