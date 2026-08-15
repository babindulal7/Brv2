import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ActionNotImplementedError, ActionPermissionError } from '../../core'
import { BOOKING_STATUS, STATUS_ORDER, jobThatSets, type BookingStatus } from '../../../lib/workflow'
import { canPerformOperations } from '../../../lib/rbac'

/**
 * # CONFIRM_RENTAL — what this suite pins
 *
 * Confirm is the transition every other screen depends on: nothing is packed,
 * handed over, returned or invoiced against a Quote. The failures it can have
 * are all silent from the outside — the modal closes either way — so each one
 * is asserted here:
 *
 *  1. **It is an INSERT into `booking_stage_transitions` and never an UPDATE of
 *     `bookings`.** `0021:199` revokes the column; a regression is invisible in
 *     the UI until Postgres rejects it in production.
 *  2. **The pair it writes is `Quote → Booked`, read out of `workflow.ts`'s own
 *     order** rather than two re-typed literals — and it is the same pair
 *     `next_booking_stage('Quote')` returns in the database, where the trigger
 *     rejects anything else.
 *  3. **The stage guard is the replay guard.** A second Confirm finds the
 *     booking at `Booked` and is refused by name, before any write. The live
 *     trigger refuses it too ("from_stage does not match … Stale read or
 *     concurrent write"), which is what makes the client-side check a courtesy
 *     rather than the protection.
 *  4. **A queued write is not a confirmed booking.** `applyBookingTransition`
 *     reports the *plan*, not the row, so the action re-reads `bookings.stage`;
 *     if it did not move, the operator is told the booking is not confirmed.
 *  5. **Law 6.** Confirm reads and writes no money. `bookings.deposit_required`
 *     is unmasked on the base table, so a `select('*')` here would hand a rupee
 *     figure to every role that can confirm a booking.
 *  6. **The dispatcher still denies it**, because `rental.confirm` resolves to
 *     no rule in `lib/rbac` — and denies it with `ActionPermissionError`, NOT
 *     `ActionNotImplementedError`. That difference is the whole TODO(decision):
 *     the body is built, the capability is not ruled.
 *
 * Two module boundaries are replaced and nothing reaches a database:
 * `lib/supabase` for the reads and `lib/dataAccess` for the writes — which also
 * captures what `lib/bookingTransition` and `lib/audit` write, since both go
 * through `idempotentInsert`.
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
  }

  function nextRows(table: string): unknown[] {
    const queue = state.responses[table]
    if (queue === undefined || queue.length === 0) return []
    return queue.length === 1 ? (queue[0] as unknown[]) : (queue.shift() as unknown[])
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
      is(...a: unknown[]) {
        call.ops.push(['is', ...a])
        return builder
      },
      maybeSingle() {
        const rows = nextRows(table)
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      then(onOk: unknown, onErr: unknown) {
        return Promise.resolve({ data: nextRows(table), error: null }).then(onOk as never, onErr as never)
      },
    }
    return builder
  }

  function reset(): void {
    state.calls = []
    state.responses = {}
  }

  return { state, from, reset }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: db.from },
  newClientUuid: () => 'test-action-key',
}))

/* ── The write side ─────────────────────────────────────────────────────── */

const writes = vi.hoisted(() => {
  const state = {
    ops: [] as Array<{ kind: 'insert' | 'update'; table: string; id: string | null; payload: Record<string, unknown> }>,
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
    writes.state.ops.push({ kind: 'insert', table, id: null, payload })
    return { data: { id: payload['id'] ?? `${table}-row`, ...payload }, error: null }
  },
  safeUpdate: async (table: string, id: string, payload: Record<string, unknown>) => {
    writes.state.ops.push({ kind: 'update', table, id, payload })
    return { data: { ...payload, id }, error: null }
  },
}))

/* ── Auto Assign Serials ────────────────────────────────────────────────────
 *
 * Stubbed here on purpose. `lib/availability` (the rule) and
 * `lib/queries/availability` (the range round-trip) each have their own suite
 * driven by execution; what THIS file has to prove is the ORDERING Confirm
 * imposes on them — reserve first, move the stage second, and give the units
 * back if the stage does not move. Reproducing a unit corpus through the `db`
 * stub would test the stub.
 */
const assign = vi.hoisted(() => {
  const state = {
    /** Set false to simulate a line that cannot be covered. */
    complete: true,
    /** Reservation ids handed back by a successful reserve. */
    reservationIds: ['res-1', 'res-2'] as string[],
    /** Ordered log of every availability call, for interleaving assertions. */
    calls: [] as string[],
    /** Rows released, with the reason given. */
    released: [] as Array<{ ids: readonly string[]; reason: string }>,
  }
  function reset(): void {
    state.complete = true
    state.reservationIds = ['res-1', 'res-2']
    state.calls = []
    state.released = []
  }
  return { state, reset }
})

vi.mock('../../../lib/queries/availability', () => {
  class AssignmentIncompleteError extends Error {
    plan: unknown
    constructor(plan: unknown) {
      super('cannot be confirmed: not every line has units free for these dates.')
      this.name = 'AssignmentIncompleteError'
      this.plan = plan
    }
  }
  return {
    AssignmentIncompleteError,
    planAssignment: async (bookingId: string) => {
      assign.state.calls.push('plan')
      return { bookingId, bookingNo: 'B-715', lines: [], skipped: [], complete: assign.state.complete }
    },
    reserveAssignedUnits: async () => {
      assign.state.calls.push('reserve')
      return { reservationIds: assign.state.reservationIds, units: assign.state.reservationIds.length }
    },
    releaseReservations: async (ids: readonly string[], reason: string) => {
      assign.state.calls.push('release')
      assign.state.released.push({ ids, reason })
    },
  }
})

const { confirmRental, confirmRentalConfig } = await import('../confirmRental')

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const OWNER = { userId: 'usr-owner', role: 'Owner' as const, isOnline: true }
const BOOKING_ID = '11111111-2222-4333-8444-555555555555'
const BRANCH_ID = '99999999-8888-4777-8666-555555555555'
const CLIENT_ID = '77777777-6666-4555-8444-333333333333'
const LINE_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const LINE_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const ACTION_KEY = '55555555-5555-4555-8555-555555555555'

/** The stage Confirm targets, derived exactly as the action derives it. */
const CONFIRM_TO = STATUS_ORDER[BOOKING_STATUS['Quote'].order + 1] as BookingStatus

function bookingAt(stage: string): Record<string, unknown> {
  return {
    id: BOOKING_ID,
    booking_no: 'B-715',
    branch_id: BRANCH_ID,
    client_id: CLIENT_ID,
    stage,
    cancelled_at: null,
    closed_at: null,
  }
}

/**
 * A Quote with one live line, and a database that reports the stage moved.
 * `bookings` is read twice — the head, then the stage re-read after the write.
 */
function setUpConfirmable(lines: Array<{ id: string; qty: number }> = [{ id: LINE_A, qty: 2 }]): void {
  db.state.responses['bookings'] = [[bookingAt('Quote')], [{ stage: CONFIRM_TO }]]
  db.state.responses['booking_lines'] = [lines]
}

/** Drives the action body directly — see the TODO(decision) on `confirmRentalConfig`. */
async function confirm(input: Parameters<typeof confirmRentalConfig.validate>[0], ctx = OWNER) {
  await confirmRentalConfig.validate(input)
  return confirmRentalConfig.execute(input, ctx)
}

function insertsOn(table: string) {
  return writes.state.ops.filter((o) => o.table === table && o.kind === 'insert')
}

beforeEach(() => {
  db.reset()
  writes.reset()
  assign.reset()
})

/* ── 1 · The row it writes ──────────────────────────────────────────────── */

describe('the stage moves through the transition trigger and nothing else', () => {
  it('writes ONE booking_stage_transitions row and never touches the bookings table', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(insertsOn('booking_stage_transitions')).toHaveLength(1)
    // `0021:199` revokes update (stage, closed_at) on bookings from authenticated.
    expect(writes.state.ops.filter((o) => o.table === 'bookings')).toHaveLength(0)
  })

  it('moves Quote → the next stage in workflow.ts order, which is Booked', async () => {
    setUpConfirmable()
    const { result } = await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    const row = insertsOn('booking_stage_transitions')[0]?.payload
    expect(row?.['from_stage']).toBe('Quote')
    expect(row?.['to_stage']).toBe(CONFIRM_TO)
    // Stated twice on purpose: the derivation, and the value it must produce.
    expect(CONFIRM_TO).toBe('Booked')
    expect(result.stage).toEqual({ from: 'Quote', to: 'Booked' })
  })

  it('is not a reversal, and carries the actor snapshot and the denormalised branch', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    const row = insertsOn('booking_stage_transitions')[0]?.payload
    // A reversal needs approver + reason + audit_event_id together (0002:447).
    expect(row?.['is_reversal']).toBe(false)
    expect(row?.['approved_by']).toBeUndefined()
    // Snapshotted, never re-read later (0002:478).
    expect(row?.['actor_id']).toBe(OWNER.userId)
    expect(row?.['actor_role']).toBe(OWNER.role)
    expect(row?.['branch_id']).toBe(BRANCH_ID)
    expect(row?.['source']).toBe('os-native')
  })

  it('carries the caller action key onto client_uuid — a double-submitted Confirm may not advance two stages', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })
    expect(insertsOn('booking_stage_transitions')[0]?.payload['client_uuid']).toBe(ACTION_KEY)
  })

  it('mints a key when the caller has none rather than sending the row without one', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715' })
    // NOT NULL and unique (0002:429/:444) — an absent key would be a 23502.
    expect(insertsOn('booking_stage_transitions')[0]?.payload['client_uuid']).toBe('gen-0001')
  })

  it('sends the caller occurred_at, which is the value causal-order validation compares', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY, occurredAt: '2026-08-12T04:15:00.000Z' })
    expect(insertsOn('booking_stage_transitions')[0]?.payload['occurred_at']).toBe('2026-08-12T04:15:00.000Z')
  })

  it('writes the audit row after the transition, never before it', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })
    expect(writes.state.ops.map((o) => o.table)).toEqual(['booking_stage_transitions', 'audit_events'])
  })

  it('resolves a uuid by id and a B- number by booking_no', async () => {
    setUpConfirmable()
    await confirm({ id: BOOKING_ID, clientUuid: ACTION_KEY })
    expect(db.state.calls[0]?.ops[0]).toEqual(['eq', 'id', BOOKING_ID])

    db.reset()
    writes.reset()
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })
    expect(db.state.calls[0]?.ops[0]).toEqual(['eq', 'booking_no', 'B-715'])
  })
})

/* ── 2 · Confirm is a decision, not a job ───────────────────────────────── */

describe('Confirm is reached by a decision, so it opens no session', () => {
  it('writes no operation_sessions row, and workflow.ts agrees no job sets Booked', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(writes.state.ops.filter((o) => o.table === 'operation_sessions')).toHaveLength(0)
    expect(writes.state.ops.filter((o) => o.table === 'session_line_movements')).toHaveLength(0)
    // §1.5 read backwards: Quote and Booked are reached by decisions, not jobs.
    expect(jobThatSets('Booked')).toBeNull()
  })
})

/* ── 3 · What it reports, from what it read ─────────────────────────────── */

describe('the result reports what was actually committed to', () => {
  it('counts live lines as rows and units as sum(qty)', async () => {
    setUpConfirmable([
      { id: LINE_A, qty: 5 },
      { id: LINE_B, qty: 1 },
    ])
    const { result } = await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(result.lines).toBe(2)
    // "Alexa Mini ×5" is 5 units, not 1 — the same sum listBookings makes.
    expect(result.units).toBe(6)
    expect(result.bookingId).toBe(BOOKING_ID)
    expect(result.bookingNo).toBe('B-715')
    expect(result.clientId).toBe(CLIENT_ID)
  })

  it('reads only live lines — a voided line is not a booked line (Law 3)', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })
    const lineRead = db.state.calls.find((c) => c.table === 'booking_lines')
    expect(lineRead?.ops).toContainEqual(['is', 'voided_at', null])
  })

  it('emits RENTAL_CONFIRMED once, carrying what landed', async () => {
    setUpConfirmable()
    const { events } = await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('rental.confirmed')
    expect(events[0]?.payload).toMatchObject({
      bookingId: BOOKING_ID,
      bookingNo: 'B-715',
      from: 'Quote',
      to: CONFIRM_TO,
      lines: 1,
      units: 2,
      userId: OWNER.userId,
    })
  })
})

/* ── 4 · The refusals, each of which must write nothing ─────────────────── */

describe('the refusals that precede every write', () => {
  it('refuses a booking reference that resolves to nothing', async () => {
    db.state.responses['bookings'] = [[]]
    await expect(confirm({ id: 'B-9999' })).rejects.toThrow(/No booking matches B-9999/)
    expect(writes.state.ops).toHaveLength(0)
  })

  it('refuses a cancelled booking', async () => {
    db.state.responses['bookings'] = [[{ ...bookingAt('Quote'), cancelled_at: '2026-08-01T00:00:00Z' }]]
    await expect(confirm({ id: 'B-715' })).rejects.toThrow(/was cancelled/)
    expect(writes.state.ops).toHaveLength(0)
  })

  it('refuses a Closed booking', async () => {
    db.state.responses['bookings'] = [[{ ...bookingAt('Quote'), closed_at: '2026-08-02T00:00:00Z' }]]
    await expect(confirm({ id: 'B-715' })).rejects.toThrow(/Closed is final/)
    expect(writes.state.ops).toHaveLength(0)
  })

  it('refuses every stage but Quote, and names the repeat submit', async () => {
    for (const stage of STATUS_ORDER.filter((s) => s !== 'Quote')) {
      db.reset()
      writes.reset()
      db.state.responses['bookings'] = [[bookingAt(stage)]]
      await expect(confirm({ id: 'B-715' })).rejects.toThrow(
        new RegExp(`is at ${stage.replace(' ', ' ')}\\.`),
      )
      expect(writes.state.ops).toHaveLength(0)
    }

    db.reset()
    writes.reset()
    db.state.responses['bookings'] = [[bookingAt('Booked')]]
    await expect(confirm({ id: 'B-715' })).rejects.toThrow(/the first one already landed/)
  })

  it('refuses a Quote with no live lines — Booked commits gear that is not there', async () => {
    db.state.responses['bookings'] = [[bookingAt('Quote')]]
    db.state.responses['booking_lines'] = [[]]
    await expect(confirm({ id: 'B-715' })).rejects.toThrow(/no live lines/)
    expect(writes.state.ops).toHaveLength(0)
  })

  it('refuses offline when the context says so, before reading anything', async () => {
    setUpConfirmable()
    await expect(
      confirm({ id: 'B-715' }, { userId: 'u-1', role: 'Owner', isOnline: false }),
    ).rejects.toThrow(/offline/i)
    expect(writes.state.ops).toHaveLength(0)
    // Nothing at all reached the network.
    expect(db.state.calls).toHaveLength(0)
  })

  it('refuses offline when the device says so, whatever ctx claims', async () => {
    setUpConfirmable()
    vi.stubGlobal('navigator', { onLine: false })
    try {
      await expect(confirm({ id: 'B-715' })).rejects.toThrow(/offline/i)
      expect(writes.state.ops).toHaveLength(0)
      expect(db.state.calls).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refuses a write the database did not apply — a queued confirm is not a confirmed booking', async () => {
    // `applyBookingTransition` returns the plan, not the row, so the ONLY signal
    // that the trigger ran is the stage itself. Here it did not move.
    db.state.responses['bookings'] = [[bookingAt('Quote')], [{ stage: 'Quote' }]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]

    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow(/NOT confirmed/)
    // The insert was attempted — this is a verification failure, not a refusal.
    expect(insertsOn('booking_stage_transitions')).toHaveLength(1)
  })

  it('refuses when the booking vanished between the write and the verification', async () => {
    db.state.responses['bookings'] = [[bookingAt('Quote')], []]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow(/unreadable stage/)
  })
})

/* ── 5 · validate — before execute, before any read ─────────────────────── */

describe('validate refuses what cannot be sent, before anything is read', () => {
  it('refuses an empty booking reference', async () => {
    await expect(confirm({ id: '   ' })).rejects.toThrow(/booking reference is required/)
    expect(db.state.calls).toHaveLength(0)
  })

  it('refuses an idempotency key that is present but empty', async () => {
    await expect(confirm({ id: 'B-715', clientUuid: '  ' })).rejects.toThrow(/idempotency key/)
    expect(db.state.calls).toHaveLength(0)
  })

  it('refuses an occurredAt that is not a parseable instant', async () => {
    // `Date.parse('12 Aug')` succeeds, so the regex is the check, not the parse.
    await expect(confirm({ id: 'B-715', occurredAt: '12 Aug' })).rejects.toThrow(/full ISO instant/)
    expect(db.state.calls).toHaveLength(0)
  })

  it('refuses an instant with no offset — it would be read as the device local time', async () => {
    await expect(confirm({ id: 'B-715', occurredAt: '2026-08-12T09:00:00' })).rejects.toThrow(
      /no offset/,
    )
    expect(db.state.calls).toHaveLength(0)
  })

  it('accepts a Z instant and a +05:45 one — both carry their offset', async () => {
    for (const at of ['2026-08-12T04:15:00.000Z', '2026-08-12T10:00:00+05:45']) {
      db.reset()
      writes.reset()
      setUpConfirmable()
      await confirm({ id: 'B-715', clientUuid: ACTION_KEY, occurredAt: at })
      expect(insertsOn('booking_stage_transitions')[0]?.payload['occurred_at']).toBe(at)
    }
  })
})

/* ── 6 · Law 6 — Confirm touches no money ───────────────────────────────── */

describe('Law 6 — no money column is read or written', () => {
  const MONEY = [
    'deposit_required',
    'rate',
    'discount_amount',
    'supplier_cost',
    'markup_amount',
    'line_total',
    'amount',
    'approved_credit_limit',
  ]

  it('names no money column in any SELECT, and carries none in any write payload', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(db.state.calls.length).toBeGreaterThan(0)
    for (const call of db.state.calls) {
      const columns = call.columns.split(',').map((c) => c.trim())
      for (const money of MONEY) expect(columns).not.toContain(money)
    }

    expect(writes.state.ops.length).toBeGreaterThan(0)
    for (const op of writes.state.ops) {
      for (const money of MONEY) expect(Object.keys(op.payload)).not.toContain(money)
    }
  })
})

/* ── 7 · The dispatcher wiring ──────────────────────────────────────────── */

describe('the dispatcher — implemented, and ruled 15 Aug 2026', () => {
  it('is no longer a stub: it does NOT throw ActionNotImplementedError', async () => {
    setUpConfirmable()
    await expect(confirmRental({ id: 'B-715' }, OWNER)).resolves.not.toBeInstanceOf(
      ActionNotImplementedError,
    )
  })

  /*
   * This block previously pinned the opposite: every role denied, Owner
   * included, because `rental.confirm` resolved to no rule in `lib/rbac`. Its
   * comment said ruling the matrix should flip a red assertion rather than be
   * forgotten — and it did, on 15 Aug 2026. The list below is the same one that
   * comment named, because both were read off the same live policy:
   *
   *     policy booking_stage_transitions_insert with check (
   *       auth_user_role() = any (array['Owner','Admin','Manager','Coordinator','Warehouse'])
   *       and actor_id = nullif(current_setting('app.current_user_id', true), '')::uuid )
   */
  it.each(['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'] as const)(
    'admits %s — the roles the RLS policy on booking_stage_transitions admits',
    async (role) => {
      setUpConfirmable()
      await expect(confirmRental({ id: 'B-715' }, { userId: 'u-1', role })).resolves.toMatchObject({
        success: true,
      })
    },
  )

  it.each(['Technician', 'Accounts', 'Driver', 'Client'] as const)(
    'denies %s, and writes nothing',
    async (role) => {
      setUpConfirmable()
      await expect(confirmRental({ id: 'B-715' }, { userId: 'u-1', role })).rejects.toBeInstanceOf(
        ActionPermissionError,
      )
      expect(writes.state.ops).toHaveLength(0)
    },
  )

  /*
   * Technician is the one worth stating twice. `operations.perform` — the
   * capability the four floor verbs use — admits them, and this one must not:
   * the header of `confirmRental.ts` refused to borrow that capability for
   * exactly this reason, and the database would reject the row anyway.
   */
  it('denies Technician although operations.perform admits them to the floor verbs', async () => {
    setUpConfirmable()
    expect(canPerformOperations('Technician')).toBe(true)
    await expect(confirmRental({ id: 'B-715' }, { userId: 'u-1', role: 'Technician' })).rejects.toThrow(
      /requires rental\.confirm/,
    )
  })

  it('refuses a call with no session context — a confirm has an actor or it is not recorded', async () => {
    await expect(confirmRental({ id: 'B-715' })).rejects.toThrow(/session context/)
    expect(writes.state.ops).toHaveLength(0)
  })
})

/* ── Auto Assign Serials — the ordering Confirm imposes ─────────────────────
 *
 * Added 16 Aug 2026 with the feature (PLAN.md §4.30). Until then Confirm moved
 * the stage and assigned nothing, so every booking it confirmed reached the
 * floor with no units behind it — the blocker sitting under Packing, Handover,
 * Return, Reset and Evidence equally.
 *
 * The ordering is the part that can only be wrong here, and it is wrong in a
 * way no type catches: reserve-then-transition leaves a Quote untouched when
 * gear is short, transition-then-reserve leaves a Booked booking with nothing
 * behind it. Booked is the stage the floor acts on, so the difference is real.
 */
describe('Auto Assign Serials', () => {
  it('reserves BEFORE moving the stage, so a shortfall leaves the booking at Quote', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(assign.state.calls).toEqual(['plan', 'reserve'])
    /* The stage row is written after both — insertsOn reads the write log,
       which is only appended to by applyBookingTransition. */
    expect(insertsOn('booking_stage_transitions')).toHaveLength(1)
  })

  it('refuses the confirm when a line cannot be covered, and writes no stage row', async () => {
    assign.state.complete = false
    setUpConfirmable()

    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow(/not every line has units free/)
    /* 0003:1478 — "If reservation fails on any line, Confirm is rejected with
       the conflicting line named." Rejected means nothing moved. */
    expect(insertsOn('booking_stage_transitions')).toHaveLength(0)
    expect(assign.state.calls).toEqual(['plan'])
  })

  it('never reserves when the booking is not a Quote — the stage guard runs first', async () => {
    db.state.responses['bookings'] = [[bookingAt(CONFIRM_TO)]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]

    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow(/is at/)
    /* A repeat submit must not take a second set of units off the shelf. */
    expect(assign.state.calls).toEqual([])
  })

  it('never reserves for a booking with no live lines', async () => {
    setUpConfirmable([])
    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow(/no live lines/)
    expect(assign.state.calls).toEqual([])
  })

  it('reports units reserved separately from qty, because a bundle line has no serial', async () => {
    assign.state.reservationIds = ['res-1']
    setUpConfirmable([{ id: LINE_A, qty: 2 }, { id: LINE_B, qty: 3 }])

    const { result } = await confirm({ id: 'B-715', clientUuid: ACTION_KEY })
    expect(result.units).toBe(5)
    expect(result.unitsReserved).toBe(1)
  })

  /*
   * The compensation path. This is NOT atomicity — PostgREST gives a browser no
   * transaction — but a refused transition must still give the units back, or a
   * booking that was never confirmed keeps a camera off the shelf until someone
   * finds it by hand.
   */
  it('releases the held units when the stage transition is refused', async () => {
    /* A Quote whose stage re-read never reports the move: applyBookingTransition
       returns ok, then the persistence check fails. */
    db.state.responses['bookings'] = [[bookingAt('Quote')], [{ stage: 'Quote' }]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]

    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow(/treat the booking as NOT confirmed/)
    expect(assign.state.calls).toContain('release')
    expect(assign.state.released[0]?.ids).toEqual(['res-1', 'res-2'])
  })

  it('names the booking in the release reason, so a stray hold is traceable', async () => {
    db.state.responses['bookings'] = [[bookingAt('Quote')], [{ stage: 'Quote' }]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]

    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow()
    expect(assign.state.released[0]?.reason).toContain('B-715')
  })

  it('does not release anything on a confirm that succeeds', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })
    expect(assign.state.released).toEqual([])
  })
})
