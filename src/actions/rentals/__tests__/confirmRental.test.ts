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

/* ── Availability: the two READS Confirm has left ───────────────────────────
 *
 * RULING 2026-09-08 (R-26). Until 8 Sep this stub also carried
 * `reserveAssignedUnits` and `releaseReservations`, because Confirm wrote the
 * holds itself and then compensated if the stage did not move. Postgres writes
 * them now, from the Booked transition (`0100`), so what is left on this side is
 * a plan, a courtesy collision check, and a read-back — and this file's job is
 * unchanged: prove the ORDER Confirm imposes on them, not re-test them.
 *
 * `describeCollisions` is reproduced faithfully rather than stubbed to a canned
 * string, because the sentence it builds is what an operator acts on and this
 * file asserts on it. The real one is pinned by execution in
 * `lib/queries/__tests__/availability.test.ts`.
 */
const assign = vi.hoisted(() => {
  const state = {
    /** Set false to simulate a line that cannot be covered. */
    complete: true,
    /** Unit ids the plan assigns — what the pre-check is then asked about. */
    wantedUnits: ['unit-1', 'unit-2'] as string[],
    /** Live holds the pre-check finds in the way. */
    collisions: [] as Array<{ unitId: string; bookingNo: string }>,
    /** What the database reports holding, read back after the transition. */
    held: { units: 2, quantityHolds: 0, quantityReserved: 0 },
    /** Ordered log of every availability call, for interleaving assertions. */
    calls: [] as string[],
    /** Arguments the pre-check was handed, so the question asked can be asserted. */
    precheckArgs: null as { assetIds: readonly string[]; excluded: string | null } | null,
  }
  function reset(): void {
    state.complete = true
    state.wantedUnits = ['unit-1', 'unit-2']
    state.collisions = []
    state.held = { units: 2, quantityHolds: 0, quantityReserved: 0 }
    state.calls = []
    state.precheckArgs = null
  }
  return { state, reset }
})

vi.mock('../../../lib/queries/availability', () => {
  class AssignmentIncompleteError extends Error {
    plan: unknown
    constructor(plan: unknown) {
      super('cannot be confirmed: not every line has stock free for these dates.')
      this.name = 'AssignmentIncompleteError'
      this.plan = plan
    }
  }
  return {
    AssignmentIncompleteError,
    availabilityRules: () => ({ disqualifyingStates: new Set<string>(), bounds: 'half-open' as const }),
    planAssignment: async (bookingId: string) => {
      assign.state.calls.push('plan')
      return {
        bookingId,
        bookingNo: 'B-715',
        window: { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' },
        bounds: 'half-open' as const,
        lines: assign.state.wantedUnits.map((unitId) => ({
          kind: 'serialised' as const,
          outcome: { assigned: [{ unitId, assetTag: unitId.toUpperCase() }] },
        })),
        skipped: [],
        complete: assign.state.complete,
      }
    },
    findCollidingHolds: async (assetIds: readonly string[], _w: unknown, _b: unknown, excluded: string | null) => {
      assign.state.calls.push('precheck')
      assign.state.precheckArgs = { assetIds, excluded }
      return assign.state.collisions
    },
    describeCollisions: (collisions: Array<{ unitId: string; bookingNo: string }>) => {
      if (collisions.length === 0) return null
      const bookings = [...new Set(collisions.map((c) => c.bookingNo))].sort()
      const units = collisions.length === 1 ? '1 unit is' : `${String(collisions.length)} units are`
      return `${units} already held for these dates by ${bookings.length === 1 ? 'booking' : 'bookings'} ${bookings.join(', ')}.`
    },
    readHeldForBooking: async () => {
      assign.state.calls.push('read-back')
      return assign.state.held
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
    project_type: 'Documentary',
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

  it('refuses a Quote with no project type — the type is required to confirm', async () => {
    db.state.responses['bookings'] = [[{ ...bookingAt('Quote'), project_type: null }]]
    await expect(confirm({ id: 'B-715' })).rejects.toThrow(/Select a project type before confirming/)
    expect(writes.state.ops).toHaveLength(0)
  })

  it('refuses a Quote whose project-type key predates 0144 — missing is missing', async () => {
    const { project_type: _dropped, ...legacy } = bookingAt('Quote')
    void _dropped
    db.state.responses['bookings'] = [[legacy]]
    await expect(confirm({ id: 'B-715' })).rejects.toThrow(/Select a project type before confirming/)
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

/* ── Reservations: R-26, the database writes them ──────────────────────────
 *
 * The ordering used to be the part that could only be wrong here: reserve then
 * transition left a Quote untouched when gear was short, transition then reserve
 * left a Booked booking with nothing behind it. `0100` removed the choice — the
 * hold and the stage move are one INSERT — so what this block pins now is that
 * the app does not write, does not compensate, and asks its two reads in the
 * right order and about the right things.
 */
describe('reservations are the database\'s to write (R-26)', () => {
  /**
   * The assertion R-26 names by hand. Not `expect(writes)` — a source scan, so a
   * future edit that reaches for `supabase.from('inventory_reservations').insert`
   * anywhere in `src/actions` fails here rather than in production, whether or
   * not this suite happens to exercise that line.
   */
  /**
   * The positive control for the scan below.
   *
   * A source grep that finds nothing is indistinguishable from a source grep
   * that cannot find anything, and this repo has published two dead-module
   * findings that were really broken greps. So the patterns are pinned against
   * the shapes they must catch AND the shapes they must not, in this file, next
   * to the test that uses them.
   */
  const WRITES_THE_TABLE =
    /\.from\(\s*['"`]inventory_reservations['"`]\s*\)[\s\S]{0,40}?\.(insert|upsert|update|delete)\(/
  const WRITES_VIA_HELPER =
    /(idempotentInsert|insertViaSourceSwitch|safeUpdate|updateViaSourceSwitch)\(\s*['"`]inventory_reservations['"`]/

  function writesReservations(source: string): boolean {
    return WRITES_THE_TABLE.test(source) || WRITES_VIA_HELPER.test(source)
  }

  it.each([
    ["await supabase.from('inventory_reservations').insert(row)", true],
    ["await supabase\n  .from('inventory_reservations')\n  .update({ released_at: at })\n  .eq('id', id)", true],
    ["await insertViaSourceSwitch('inventory_reservations', row)", true],
    ["await idempotentInsert('inventory_reservations', row)", true],
    ["await safeUpdate('inventory_reservations', id, { released_at: at })", true],
    ['/* the app no longer writes inventory_reservations at all */', false],
    ["supabase.from('inventory_reservations').select('asset_id').is('released_at', null)", false],
  ])('the write scan reads %j as %s', (source, expected) => {
    expect(writesReservations(source)).toBe(expected)
  })

  it('no action anywhere writes to inventory_reservations', () => {
    /* Vite `?raw`, NOT `node:fs`: this project ships no `@types/node`, so a
       suite under `src/` cannot import it and `npm run typecheck` is a gate.
       Same device `lib/__tests__/breakpoints.test.ts` uses to read a stylesheet. */
    const sources = import.meta.glob('../../**/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>

    const offenders = Object.entries(sources)
      .filter(([path]) => !path.includes('__tests__'))
      .filter(([, source]) => writesReservations(source))
      .map(([path]) => path)

    expect(offenders).toEqual([])
    /* A guard on the guard: if the glob ever stops matching, this test would
       pass by finding nothing at all rather than by finding nothing wrong. */
    expect(Object.keys(sources).length).toBeGreaterThan(20)
  })

  it('plans, then pre-checks, then writes the stage row — and writes nothing else', async () => {
    setUpConfirmable()
    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(assign.state.calls).toEqual(['plan', 'precheck', 'read-back'])
    expect(insertsOn('booking_stage_transitions')).toHaveLength(1)
    expect(insertsOn('inventory_reservations')).toHaveLength(0)
    expect(writes.state.ops.filter((o) => o.table === 'inventory_reservations')).toEqual([])
  })

  it('refuses the confirm when a line cannot be covered, and writes no stage row', async () => {
    assign.state.complete = false
    setUpConfirmable()

    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow(/not every line has stock free/)
    /* 0003:1478 — "If reservation fails on any line, Confirm is rejected with
       the conflicting line named." Rejected means nothing moved. */
    expect(insertsOn('booking_stage_transitions')).toHaveLength(0)
    expect(assign.state.calls).toEqual(['plan'])
  })

  /**
   * R-26's own test line: *"pre-check returns the colliding booking numbers"*.
   * The operator is told which booking to ring, not `23P01 conflicting key value
   * violates exclusion constraint`.
   */
  it('names the booking already holding a unit, and never reaches the transition', async () => {
    assign.state.collisions = [
      { unitId: 'unit-1', bookingNo: 'B-912' },
      { unitId: 'unit-2', bookingNo: 'B-920' },
    ]
    setUpConfirmable()

    const failure = await confirm({ id: 'B-715', clientUuid: ACTION_KEY }).catch((e: unknown) => e)

    expect(String(failure)).toContain('B-912')
    expect(String(failure)).toContain('B-920')
    expect(String(failure)).toContain('B-715 was not confirmed')
    expect(insertsOn('booking_stage_transitions')).toHaveLength(0)
  })

  it('asks the pre-check about the units the plan wants, and excludes the booking itself', async () => {
    assign.state.wantedUnits = ['unit-7', 'unit-8']
    setUpConfirmable()

    await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(assign.state.precheckArgs?.assetIds).toEqual(['unit-7', 'unit-8'])
    /* Its own holds are not a conflict with itself — a re-read of a booking that
       already holds its gear must not refuse the booking that holds it. */
    expect(assign.state.precheckArgs?.excluded).toBe(BOOKING_ID)
  })

  it('never pre-checks when the booking is not a Quote — the stage guard runs first', async () => {
    db.state.responses['bookings'] = [[bookingAt(CONFIRM_TO)]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]

    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow(/is at/)
    expect(assign.state.calls).toEqual([])
  })

  it('never pre-checks for a booking with no live lines', async () => {
    setUpConfirmable([])
    await expect(confirm({ id: 'B-715', clientUuid: ACTION_KEY })).rejects.toThrow(/no live lines/)
    expect(assign.state.calls).toEqual([])
  })

  /**
   * The read-back, not the plan. The trigger reserves from `booking_line_units`
   * and the line remainder; the plan is the app's intent. Where they differ the
   * table is the one that is true, so the number on the screen comes from the
   * table.
   */
  it('reports what the database holds, read back after the transition', async () => {
    assign.state.held = { units: 1, quantityHolds: 0, quantityReserved: 0 }
    setUpConfirmable([{ id: LINE_A, qty: 2 }, { id: LINE_B, qty: 3 }])

    const { result } = await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(result.units).toBe(5)
    expect(result.unitsReserved).toBe(1)
  })

  /**
   * ⭐ INV-02 from Confirm's side. On the live catalogue every product is
   * `tracking_mode = 'Quantity'` with no `product_units` rows, so `unitsReserved`
   * is 0 for every booking and `quantityReserved` is the number that says the
   * booking has stock behind it. Reporting only the first would read as "nothing
   * was held" on 204 of 204 products.
   */
  it('reports bulk stock held separately from serialised units', async () => {
    assign.state.held = { units: 0, quantityHolds: 1, quantityReserved: 40 }
    setUpConfirmable([{ id: LINE_A, qty: 40 }])

    const { result, events } = await confirm({ id: 'B-715', clientUuid: ACTION_KEY })

    expect(result.unitsReserved).toBe(0)
    expect(result.quantityHolds).toBe(1)
    expect(result.quantityReserved).toBe(40)
    /* The same two figures reach the bus, so a listener is not left inferring
       from `unitsReserved: 0` that the booking holds nothing. */
    expect(events[0]?.payload).toMatchObject({ quantityReserved: 40, quantityHolds: 1 })
  })

  /**
   * The compensation this file used to assert is gone, and its absence is the
   * assertion. A confirm the database did not apply wrote no holds either — one
   * INSERT carried both — so there is nothing to give back and nothing to strand.
   */
  it('strands nothing when the stage does not move, and says so', async () => {
    /* A Quote whose stage re-read never reports the move: applyBookingTransition
       returns ok, then the persistence check fails. */
    db.state.responses['bookings'] = [[bookingAt('Quote')], [{ stage: 'Quote' }]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]

    const failure = await confirm({ id: 'B-715', clientUuid: ACTION_KEY }).catch((e: unknown) => e)

    expect(String(failure)).toContain('treat the booking as NOT confirmed')
    expect(String(failure)).toContain('Nothing is held against it')
    expect(String(failure)).not.toContain('still live')
    /* No release call exists to make — the read-back never runs on this path. */
    expect(assign.state.calls).toEqual(['plan', 'precheck'])
  })
})
