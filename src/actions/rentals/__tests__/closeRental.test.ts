import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * # CLOSE_RENTAL — the three gates that passed on the wrong question
 *
 * Every case here exists because a gate went green for a rental that was not
 * finished. The audit filed them separately; they are one defect three times:
 * **a predicate that is vacuous, or that measures a different column than the
 * one it is named after.**
 *
 *  1. **MONEY-13** — `outstanding = 0` is a sum over the booking's invoices. A
 *     rental nobody invoiced has no invoices, the sum is `0`, and the gate
 *     calls it settled. R-01 makes invoicing manual and R-02 issues it at
 *     return, so an un-invoiced `Returned` booking is ordinary — 246 bookings
 *     and 0 invoices on the live project as this was written. `Closed` is
 *     terminal (R-09's reopen is stage-only), so the revenue is simply gone.
 *  2. **RL-05** — the deposit gate read `security_deposits.pending_amount`,
 *     which `sync_deposit_balances` derives as `greatest(required − received, 0)`.
 *     That is what the client still OWES. The gate is supposed to ask what
 *     Cine Sewa still HOLDS. A deposit collected in full and never returned
 *     read as `0` and closed the rental with the client's money inside it.
 *  3. **RL-06** — the damage gate was the literal `0`, with a comment saying
 *     nothing wrote `damage_findings`. Both writers — Return and Reset — landed
 *     in `e6c306e` on 4 Sep, the same day as `closeRental`'s own `58846c3`,
 *     from a different session; neither commit knew about the other.
 *
 * Each assertion below checks the REFUSAL TEXT as well as the refusal, because
 * a gate that fails without naming its figure is a dead end for the operator
 * (law 12: inline, specific, actionable).
 *
 * ## What this suite cannot prove
 *
 * That the DATABASE refuses any of the three. It does not: the live
 * `validate_booking_gates` `Closed` branch has two money branches reading the
 * same two wrong expressions, and **no damage or case branch at all**. These
 * corrections are app-side only, so a direct PostgREST write or an offline
 * replay still closes past them (audit DB-02 / SEC-06). Migration
 * `0084_close_gates_complete` is the other half and is not written.
 *
 * Nor can any of it be exercised against production: 200 of 246 live bookings
 * carry no `booking_lines`, every floor table is empty, and there are 0
 * invoices and 0 deposits (audit DATA-17). These are unit proofs over a mocked
 * PostgREST, not observations of live behaviour.
 */

/* ── The read side ──────────────────────────────────────────────────────── */

const db = vi.hoisted(() => {
  interface Call {
    table: string
    columns: string
    ops: Array<[string, ...unknown[]]>
  }

  const state = {
    calls: [] as Call[],
    /** Per table, the row sets to hand back in order. The last one repeats. */
    responses: {} as Record<string, unknown[][]>,
    /** Per table, a PostgREST error to fail the read with instead. */
    errors: {} as Record<string, { message: string }>,
  }

  function nextRows(table: string): unknown[] {
    const queue = state.responses[table]
    if (queue === undefined || queue.length === 0) return []
    return queue.length === 1 ? (queue[0] as unknown[]) : (queue.shift() as unknown[])
  }

  function result(table: string): { data: unknown[] | null; error: { message: string } | null } {
    const error = state.errors[table]
    return error === undefined ? { data: nextRows(table), error: null } : { data: null, error }
  }

  function from(table: string) {
    const call: Call = { table, columns: '', ops: [] }
    state.calls.push(call)

    const builder: Record<string, unknown> = {
      select(columns: string) {
        call.columns = columns
        return builder
      },
      eq(...a: unknown[]) {
        call.ops.push(['eq', ...a])
        return builder
      },
      neq(...a: unknown[]) {
        call.ops.push(['neq', ...a])
        return builder
      },
      in(...a: unknown[]) {
        call.ops.push(['in', ...a])
        return builder
      },
      is(...a: unknown[]) {
        call.ops.push(['is', ...a])
        return builder
      },
      maybeSingle() {
        const { data, error } = result(table)
        return Promise.resolve({ data: (data ?? [])[0] ?? null, error })
      },
      then(onOk: unknown, onErr: unknown) {
        return Promise.resolve(result(table)).then(onOk as never, onErr as never)
      },
    }
    return builder
  }

  function reset(): void {
    state.calls = []
    state.responses = {}
    state.errors = {}
  }

  return { state, from, reset }
})

/* Settings are device-local (localStorage); this suite runs in node, so the one
   key the action reads is a controllable stand-in. The DATABASE is what enforces
   the skip — see lifecycle step L30. */
const settings = vi.hoisted(() => ({ allowDepositSkipOnClose: 'Off' }))
vi.mock('../../../lib/settingsStore', () => ({
  getSetting: (key: string) => (key === 'allowDepositSkipOnClose' ? settings.allowDepositSkipOnClose : ''),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: db.from },
  newClientUuid: () => 'test-action-key',
}))

/* ── The write side ─────────────────────────────────────────────────────── */

const writes = vi.hoisted(() => {
  const state = {
    ops: [] as Array<{ kind: 'insert' | 'update'; table: string; payload: Record<string, unknown> }>,
    seq: 0,
  }
  function reset(): void {
    state.ops = []
    state.seq = 0
  }
  return { state, reset }
})

vi.mock('../../../lib/dataAccess', () => ({
  generateClientUuid: () => `gen-${String(++writes.state.seq).padStart(4, '0')}`,
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    writes.state.ops.push({ kind: 'insert', table, payload })
    return { data: { id: `${table}-row`, ...payload }, error: null }
  },
  safeUpdate: async (table: string, id: string, payload: Record<string, unknown>) => {
    writes.state.ops.push({ kind: 'update', table, payload: { ...payload, id } })
    return { data: { ...payload, id }, error: null }
  },
}))

const { closeRental } = await import('../closeRental')
type ActionContext = Parameters<typeof closeRental>[1] & object

/* ── Fixtures ───────────────────────────────────────────────────────────── */

/** R-08: Owner · Admin · Manager · Accounts may confirm a close. */
const ACCOUNTS: ActionContext = { userId: 'usr-accounts', role: 'Accounts', isOnline: true }
const WAREHOUSE: ActionContext = { userId: 'usr-wh', role: 'Warehouse', isOnline: true }

const BOOKING_ID = '11111111-2222-4333-8444-555555555555'
const BRANCH_ID = '99999999-8888-4777-8666-555555555555'
const ACTION_KEY = '55555555-5555-4555-8555-555555555555'
const SESSION_ID = 'aaaaaaaa-0000-4000-8000-000000000011'
const RETURN_LINE_ID = 'bbbbbbbb-0000-4000-8000-000000000022'
const CLEANING_ENTRY_ID = 'cccccccc-0000-4000-8000-000000000033'

const RETURNED_BOOKING = {
  id: BOOKING_ID,
  booking_no: 'B-880',
  branch_id: BRANCH_ID,
  stage: 'Returned',
  closed_at: null,
  cancelled_at: null,
}

/**
 * A booking whose four gates all pass, then a database that reports the move.
 *
 * Note what "passes" now requires: an **issued** invoice (`Sent`), a deposit
 * whose received amount has been fully released, no open case, and no pending
 * finding on either parent.
 */
function setUpCloseable(): void {
  db.state.responses['bookings'] = [[RETURNED_BOOKING], [{ stage: 'Closed', closed_at: '2026-09-07T04:00:00Z' }]]
  db.state.responses['invoices'] = [[{ outstanding_amount: 0, status: 'Paid' }]]
  db.state.responses['security_deposits'] = [
    [{ received_amount: 25000, refunded_amount: 25000, applied_amount: 0 }],
  ]
  db.state.responses['cases'] = [[]]
  db.state.responses['operation_sessions'] = [[{ id: SESSION_ID }]]
  db.state.responses['return_lines'] = [[{ id: RETURN_LINE_ID }]]
  db.state.responses['cleaning_queue_entries'] = [[]]
  db.state.responses['damage_findings'] = [[]]
}

/** Every read the action issued against one table, in order. */
function callsOn(table: string) {
  return db.state.calls.filter((c) => c.table === table)
}

function transitions() {
  return writes.state.ops.filter((o) => o.table === 'booking_stage_transitions' && o.kind === 'insert')
}

const close = (ctx: ActionContext = ACCOUNTS) => closeRental({ bookingNo: 'B-880', clientUuid: ACTION_KEY }, ctx)

/** The thrown refusal, so one run can be asserted on from several angles. */
const refusal = async (ctx: ActionContext = ACCOUNTS): Promise<string> => {
  const error = (await close(ctx).catch((e: unknown) => e)) as Error
  expect(error).toBeInstanceOf(Error)
  return error.message
}

beforeEach(() => {
  db.reset()
  writes.reset()
})

/* ── 0 · the happy path, so every refusal below means something ─────────── */

describe('a rental that really is finished closes', () => {
  it('writes one transition row and reports the gates as they stood', async () => {
    setUpCloseable()
    const result = await close()

    expect(result.stage).toBe('Closed')
    expect(transitions()).toHaveLength(1)
    expect(transitions()[0]?.payload['to_stage']).toBe('Closed')
    expect(result.gates).toEqual({
      rentalInvoiced: true,
      rentalOutstandingPaisa: 0,
      depositHeldPaisa: 0,
      openCases: 0,
      damageChargesPendingApproval: 0,
    })
  })

  it('is refused for a role R-08 does not name, before any read', async () => {
    setUpCloseable()
    await expect(close(WAREHOUSE)).rejects.toThrow()
    expect(transitions()).toHaveLength(0)
  })
})

/* ── 1 · MONEY-13 · billed, not merely un-owing ─────────────────────────── */

describe('MONEY-13 — a rental nobody invoiced is unbilled, not settled', () => {
  it('refuses a booking with no invoice at all, and says the sum was empty', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [[]]

    await expect(close()).rejects.toThrow(/nothing has been invoiced for this rental/i)
    expect(transitions()).toHaveLength(0)
  })

  it('names the booking and says nothing was written', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [[]]

    const message = await refusal()
    expect(message).toMatch(/B-880 cannot be closed yet/)
    expect(message).toMatch(/Nothing was written/)
  })

  it('refuses a booking whose only invoice is still a Draft (R-02 issues at return)', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [[{ outstanding_amount: 0, status: 'Draft' }]]

    await expect(close()).rejects.toThrow(/nothing has been invoiced/i)
  })

  it('closes on an issued invoice that is fully paid', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [[{ outstanding_amount: 0, status: 'Sent' }]]

    const result = await close()
    expect(result.gates.rentalInvoiced).toBe(true)
    expect(result.gates.rentalOutstandingPaisa).toBe(0)
  })

  it('still counts a Draft balance as outstanding — a working figure is not nothing', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [
      [
        { outstanding_amount: 0, status: 'Paid' },
        { outstanding_amount: '1500.50', status: 'Draft' },
      ],
    ]

    await expect(close()).rejects.toThrow(/Rs 1,500.50 still outstanding/)
  })

  it('excludes Void invoices from the read, so a credit note cannot block a close', async () => {
    setUpCloseable()
    await close()

    const read = callsOn('invoices')[0]
    expect(read?.columns).toContain('status')
    expect(read?.ops).toContainEqual(['neq', 'status', 'Void'])
  })

  it('without override, an unbilled rental cannot be closed by anyone (R-07)', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [[]]

    for (const role of ['Owner', 'Admin', 'Manager', 'Accounts'] as const) {
      db.reset()
      writes.reset()
      setUpCloseable()
      db.state.responses['invoices'] = [[]]
      await expect(closeRental({ bookingNo: 'B-880', clientUuid: ACTION_KEY }, { userId: 'u', role, isOnline: true }))
        .rejects.toThrow(/nothing has been invoiced/i)
    }
  })

  it('refuses an override with an empty or sub-10 character reason', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [[]]

    await expect(
      closeRental(
        { bookingNo: 'B-880', clientUuid: ACTION_KEY, override: { reason: 'Short' } },
        { userId: 'u', role: 'Owner', isOnline: true },
      ),
    ).rejects.toThrow(/at least 10 characters/i)
  })

  it('refuses an override attempted by Manager or Accounts', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [[]]

    for (const role of ['Manager', 'Accounts'] as const) {
      db.reset()
      writes.reset()
      setUpCloseable()
      db.state.responses['invoices'] = [[]]
      await expect(
        closeRental(
          {
            bookingNo: 'B-880',
            clientUuid: ACTION_KEY,
            override: { reason: 'Internal shoot with zero rental fees' },
          },
          { userId: 'u', role, isOnline: true },
        ),
      ).rejects.toThrow(/restricted to Owner and Admin/i)
    }
  })

  it('allows Owner or Admin to close an unbilled zero-value rental with a valid reason (§4.51)', async () => {
    for (const role of ['Owner', 'Admin'] as const) {
      db.reset()
      writes.reset()
      setUpCloseable()
      db.state.responses['invoices'] = [[]]

      const result = await closeRental(
        {
          bookingNo: 'B-880',
          clientUuid: ACTION_KEY,
          override: { reason: 'Sponsored NGO documentary production with zero rental fees' },
        },
        { userId: 'usr-exec', role, isOnline: true },
      )

      expect(result.stage).toBe('Closed')
      expect(result.gates.isZeroValueOverride).toBe(true)
      expect(result.gates.rentalInvoiced).toBe(false)
      expect(transitions()).toHaveLength(1)
      expect(transitions()[0]?.payload['reason']).toBe('Sponsored NGO documentary production with zero rental fees')
    }
  })

  it('still enforces other gates (deposit, case, damage) even when zero-value override is provided', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [[]]
    db.state.responses['security_deposits'] = [
      [{ received_amount: 10000, refunded_amount: 0, applied_amount: 0 }],
    ]

    await expect(
      closeRental(
        {
          bookingNo: 'B-880',
          clientUuid: ACTION_KEY,
          override: { reason: 'Sponsored NGO documentary production with zero rental fees' },
        },
        { userId: 'u', role: 'Owner', isOnline: true },
      ),
    ).rejects.toThrow(/deposit is still held/i)
  })
})

/* ── 2 · RL-05 · held, not uncollected ──────────────────────────────────── */

describe('RL-05 — the deposit gate asks what is still held', () => {
  it('reads received/refunded/applied and never pending_amount', async () => {
    setUpCloseable()
    await close()

    const read = callsOn('security_deposits')[0]
    expect(read?.columns).toBe('received_amount, refunded_amount, applied_amount')
    // `pending_amount` is `greatest(required − received, 0)` — the other liability.
    expect(read?.columns).not.toContain('pending_amount')
  })

  it('refuses a close while the deposit is still held, and names the figure', async () => {
    setUpCloseable()
    db.state.responses['security_deposits'] = [
      [{ received_amount: 25000, refunded_amount: 0, applied_amount: 0 }],
    ]

    await expect(close()).rejects.toThrow(/Rs 25,000 of the client's deposit is still held/)
    expect(transitions()).toHaveLength(0)
  })

  it('is exactly the case the old predicate passed: required 25000, received 25000, nothing back', async () => {
    setUpCloseable()
    db.state.responses['security_deposits'] = [
      // pending_amount here would be greatest(25000 − 25000, 0) = 0 → "resolved".
      [{ received_amount: '25000.00', refunded_amount: '0.00', applied_amount: '0.00' }],
    ]

    const message = await refusal()
    expect(message).toMatch(/Deposit resolved/)
    expect(message).toMatch(/Rs 25,000/)
  })

  it('passes once the deposit is applied to a charge rather than refunded', async () => {
    setUpCloseable()
    db.state.responses['security_deposits'] = [
      [{ received_amount: 25000, refunded_amount: 5000, applied_amount: 20000 }],
    ]

    const result = await close()
    expect(result.gates.depositHeldPaisa).toBe(0)
  })

  it('passes when no deposit was ever required — a booking with no deposit row holds nothing', async () => {
    setUpCloseable()
    db.state.responses['security_deposits'] = [[]]

    const result = await close()
    expect(result.gates.depositHeldPaisa).toBe(0)
  })

  it('refuses rather than passes when the deposit read fails, and names the table', async () => {
    setUpCloseable()
    db.state.errors['security_deposits'] = { message: 'permission denied for table security_deposits' }

    await expect(close()).rejects.toThrow(/Could not read the deposit for B-880/)
    expect(transitions()).toHaveLength(0)
  })
})

/* ── 3 · RL-06 · the count that used to be a constant ───────────────────── */

/* ── RULING 2026-10-06 · close over a held deposit, on a written reason ──── */

describe('depositSkip — Manager and above, switched on, with a reason; moves no money', () => {
  const MANAGER: ActionContext = { userId: 'usr-mgr', role: 'Manager', isOnline: true }
  const REASON = 'Client collects the deposit in person next week'
  const skip = (ctx: ActionContext = MANAGER, reason = REASON) =>
    closeRental({ bookingNo: 'B-880', clientUuid: ACTION_KEY, depositSkip: { reason } }, ctx)

  function holdDeposit(): void {
    setUpCloseable()
    db.state.responses['security_deposits'] = [[{ received_amount: 25000, refunded_amount: 0, applied_amount: 0 }]]
  }

  beforeEach(() => {
    settings.allowDepositSkipOnClose = 'Off'
  })

  it('refuses while Settings has it Off (the default), and writes nothing', async () => {
    holdDeposit()
    await expect(skip()).rejects.toThrow(/switched off in Settings/i)
    expect(transitions()).toHaveLength(0)
  })

  it('closes a Manager over a held deposit and carries the reason onto the transition row', async () => {
    settings.allowDepositSkipOnClose = 'On'
    holdDeposit()
    const result = await skip()

    expect(result.stage).toBe('Closed')
    expect(transitions()).toHaveLength(1)
    expect(transitions()[0]?.payload['deposit_skip_reason']).toBe(REASON)
    // The deposit is still reported as held: the skip settles nothing (Law 5).
    expect(result.gates.depositHeldPaisa).toBe(2_500_000)
  })

  it('refuses a role below Manager before any read', async () => {
    settings.allowDepositSkipOnClose = 'On'
    holdDeposit()
    await expect(skip(ACCOUNTS)).rejects.toThrow(/restricted to Manager and above/i)
    expect(transitions()).toHaveLength(0)
  })

  it('refuses a reason under 10 characters, sending nothing', async () => {
    settings.allowDepositSkipOnClose = 'On'
    holdDeposit()
    await expect(skip(MANAGER, 'later')).rejects.toThrow(/at least 10 characters/i)
    expect(transitions()).toHaveLength(0)
  })

  it('does not excuse any other gate — an open case still blocks', async () => {
    settings.allowDepositSkipOnClose = 'On'
    holdDeposit()
    db.state.responses['cases'] = [[{ id: 'c1', status: 'Open' }]]
    await expect(skip()).rejects.toThrow(/No open Case/)
    expect(transitions()).toHaveLength(0)
  })

  it('a plain close with no skip is unchanged: the held deposit still blocks', async () => {
    settings.allowDepositSkipOnClose = 'On'
    holdDeposit()
    await expect(close(MANAGER)).rejects.toThrow(/still held/)
    expect(transitions()).toHaveLength(0)
  })
})

describe('RL-06 — damage findings are counted through both parents', () => {
  it('refuses on an unapproved finding written at Return, and counts it', async () => {
    setUpCloseable()
    db.state.responses['damage_findings'] = [[{ id: 'df-return-1' }]]

    await expect(close()).rejects.toThrow(/1 damage finding awaiting approval/)
    expect(transitions()).toHaveLength(0)
  })

  it('walks return_lines through the booking’s operation sessions, not a booking FK', async () => {
    setUpCloseable()
    db.state.responses['damage_findings'] = [[{ id: 'df-return-1' }]]
    await close().catch(() => undefined)

    expect(callsOn('operation_sessions')[0]?.ops).toContainEqual(['eq', 'booking_id', BOOKING_ID])
    expect(callsOn('return_lines')[0]?.ops).toContainEqual(['in', 'session_id', [SESSION_ID]])
    const finding = callsOn('damage_findings')[0]
    expect(finding?.ops).toContainEqual(['in', 'return_line_id', [RETURN_LINE_ID]])
    expect(finding?.ops).toContainEqual(['eq', 'approval_state', 'Pending Approval'])
    expect(finding?.ops).toContainEqual(['is', 'voided_at', null])
  })

  it('refuses on an unapproved finding written at Reset, through cleaning_queue_entries', async () => {
    setUpCloseable()
    // No sessions at all, so the Return leg contributes nothing.
    db.state.responses['operation_sessions'] = [[]]
    db.state.responses['cleaning_queue_entries'] = [[{ id: CLEANING_ENTRY_ID }]]
    db.state.responses['damage_findings'] = [[{ id: 'df-reset-1' }, { id: 'df-reset-2' }]]

    await expect(close()).rejects.toThrow(/2 damage findings awaiting approval/)
    expect(callsOn('cleaning_queue_entries')[0]?.ops).toContainEqual(['eq', 'booking_id', BOOKING_ID])
    expect(callsOn('damage_findings')[0]?.ops).toContainEqual(['in', 'cleaning_queue_entry_id', [CLEANING_ENTRY_ID]])
  })

  it('adds the two parents rather than choosing one', async () => {
    setUpCloseable()
    db.state.responses['cleaning_queue_entries'] = [[{ id: CLEANING_ENTRY_ID }]]
    db.state.responses['damage_findings'] = [[{ id: 'df-return-1' }], [{ id: 'df-reset-1' }]]

    await expect(close()).rejects.toThrow(/2 damage findings awaiting approval/)
  })

  it('never asks damage_findings about an empty parent list', async () => {
    setUpCloseable()
    db.state.responses['operation_sessions'] = [[]]
    db.state.responses['cleaning_queue_entries'] = [[]]

    await close()
    expect(callsOn('damage_findings')).toHaveLength(0)
    expect(callsOn('return_lines')).toHaveLength(0)
  })

  it('refuses rather than passes when the findings read fails, and names the booking', async () => {
    setUpCloseable()
    db.state.errors['damage_findings'] = { message: 'relation "damage_findings" does not exist' }

    await expect(close()).rejects.toThrow(/Could not read the damage findings for B-880/)
    expect(transitions()).toHaveLength(0)
  })
})

/* ── 4 · all three at once, which is the state the audit describes ──────── */

describe('the refusal lists every failing gate, not the first', () => {
  it('names the empty bill, the held deposit and the pending finding in one message', async () => {
    setUpCloseable()
    db.state.responses['invoices'] = [[]]
    db.state.responses['security_deposits'] = [
      [{ received_amount: 50000, refunded_amount: 0, applied_amount: 0 }],
    ]
    db.state.responses['damage_findings'] = [[{ id: 'df-1' }]]

    const message = await refusal()
    expect(message).toMatch(/nothing has been invoiced/i)
    expect(message).toMatch(/Rs 50,000 of the client's deposit is still held/)
    expect(message).toMatch(/1 damage finding awaiting approval/)
    expect(transitions()).toHaveLength(0)
  })
})
