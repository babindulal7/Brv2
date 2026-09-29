import { beforeEach, describe, expect, it, vi } from 'vitest'

import { packRental } from '../packRental'
import { handoverRental } from '../handoverRental'
import { completeReturn } from '../returnRental'
import { completeReset } from '../completeReset'
import { notReturnedDecisionEndsLine } from '../floorVerb'
import { ActionPermissionError } from '../../core'
import { JOBS, JOB_ORDER, type JobName } from '../../../lib/workflow'
import type { NotReturnedDecision } from '../../../types/database'

/**
 * # What this suite pins
 *
 * The four floor verbs are one shape applied four times, so the things that can
 * break silently are the things the shape is responsible for:
 *
 *  1. **The stage guard.** Each verb runs at exactly one stage — `JOBS[j].runsAt`
 *     — and that clause is also the replay guard. Asserted against `JOBS`
 *     itself, not against four re-typed literals, so a change to §1.5 fails
 *     here rather than drifting.
 *  2. **`bookings.stage` is never written directly.** `0021:199` revokes the
 *     column; the only legal stage write is a `booking_stage_transitions`
 *     insert. A regression here is invisible in the UI until Postgres rejects
 *     it in production.
 *  3. **Law 6.** These verbs are money-blind. Every SELECT column list and every
 *     write payload is scanned for a money column, because "we didn't select
 *     `rate`" is exactly the kind of claim that quietly stops being true.
 *  4. **The write ORDER.** Session opened `In Progress` → lines and movements →
 *     stage → session `Completed`. That order is what makes a partial failure
 *     leave a truthful residue instead of a booking that moved on unrecorded
 *     work, and nothing else in the codebase can check it. The last two swapped
 *     on 6 Sep 2026 (PK-05): sealing before the stage moved meant a refused
 *     transition spent the one Packing session `0003:152` allows a booking, and
 *     the booking could never be packed again.
 *  5. **The refusals.** Every `throw` below stands in for a row Postgres would
 *     reject — a reason under ten characters, a Not Returned line with no
 *     decision, a line that belongs to another booking.
 *
 * Two module boundaries are replaced and nothing reaches a database:
 * `lib/supabase` for the reads (the same seam `queries/bookings.test.ts` mocks
 * at) and `lib/dataAccess` for the writes — which also captures the writes made
 * by `lib/bookingTransition` and `lib/audit`, since both go through
 * `idempotentInsert` too.
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

    // Deliberately thenable rather than a promise: `floorVerb.ts` awaits the
    // object it has been chaining onto, exactly as postgrest-js allows.
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
      in(...a: unknown[]) {
        call.ops.push(['in', ...a])
        return builder
      },
      order(...a: unknown[]) {
        call.ops.push(['order', ...a])
        return builder
      },
      limit(...a: unknown[]) {
        call.ops.push(['limit', ...a])
        return builder
      },
      maybeSingle() {
        const rows = nextRows(table)
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      then(onOk: unknown, onErr: unknown) {
        return Promise.resolve({ data: nextRows(table), error: null }).then(
          onOk as never,
          onErr as never,
        )
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
    ops: [] as Array<{ kind: 'insert' | 'update'; table: string; id: string | null; payload: Record<string, unknown>; clientUuid?: string }>,
    seq: 0,
    /**
     * One table whose INSERT the database refuses.
     *
     * `idempotentInsert` rethrows every error that is not a `client_uuid`
     * duplicate (`dataAccess.ts`), so this is exactly what a rejected
     * `booking_stage_transitions` row looks like from inside `floorVerb` — a
     * gate raised by `0090`, a stage-order or causal-order check from `0021`,
     * or the table's own RLS. It is the only way to reach the PK-05 path.
     */
    refuseInsertOn: null as string | null,
    legacyPickupEnum: false,
    rejectedPickupInserts: 0,
  }
  function reset(): void {
    state.ops = []
    state.seq = 0
    state.refuseInsertOn = null
    state.legacyPickupEnum = false
    state.rejectedPickupInserts = 0
  }
  return { state, reset }
})

vi.mock('../../../lib/dataAccess', () => ({
  generateClientUuid: () => `gen-${String(++writes.state.seq).padStart(4, '0')}`,
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    if (table === 'operation_sessions' && writes.state.legacyPickupEnum && payload['delivery_method'] === 'Client Pickup') {
      writes.state.rejectedPickupInserts += 1
      throw new Error('[DataAccess] Insert failed on operation_sessions: invalid input value for enum delivery_method: "Client Pickup"')
    }
    if (writes.state.refuseInsertOn === table) {
      throw new Error(`[DataAccess] Insert failed on ${table}: Gate Check Failure (simulated).`)
    }
    writes.state.ops.push({ kind: 'insert', table, id: null, payload })
    return { data: { id: payload['id'] ?? `${table}-row`, ...payload }, error: null }
  },
  safeUpdate: async (table: string, id: string, payload: Record<string, unknown>, clientUuid?: string) => {
    writes.state.ops.push({ kind: 'update', table, id, payload, ...(clientUuid === undefined ? {} : { clientUuid }) })
    return { data: { ...payload, id }, error: null }
  },
}))

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const OWNER = { userId: 'usr-owner', role: 'Owner' as const }
const BOOKING_ID = '11111111-2222-4333-8444-555555555555'
const BRANCH_ID = '99999999-8888-4777-8666-555555555555'
const LINE_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const LINE_B = 'bbbbbbbb-0000-4000-8000-000000000002'

function bookingAt(stage: string): Record<string, unknown> {
  return {
    id: BOOKING_ID,
    booking_no: 'B-715',
    branch_id: BRANCH_ID,
    stage,
    delivery_type: 'Babin Delivery',
    cancelled_at: null,
    closed_at: null,
  }
}

/** The line table each verb owns, and the state that satisfies it. */
const LINE_TABLE: Record<Exclude<JobName, 'Reset'>, string> = {
  Pack: 'packing_lines',
  Handover: 'handover_lines',
  Return: 'return_lines',
}
const SATISFIED: Record<Exclude<JobName, 'Reset'>, string> = {
  Pack: 'Packed',
  Handover: 'Picked Up',
  Return: 'Returned',
}

function opsOn(table: string) {
  return writes.state.ops.filter((o) => o.table === table)
}
function insertsOn(table: string) {
  return opsOn(table).filter((o) => o.kind === 'insert')
}

beforeEach(() => {
  db.reset()
  writes.reset()
})

/* ── 1 · The stage guard, read off JOBS ─────────────────────────────────── */

describe('each verb runs at exactly one stage — JOBS[j].runsAt, not a re-typed literal', () => {
  const call: Record<JobName, (ref: string) => Promise<unknown>> = {
    Pack: (ref) => packRental({ id: ref, lines: [{ bookingLineId: LINE_A }] }, OWNER),
    Handover: (ref) => handoverRental({ bookingId: ref, lines: [{ bookingLineId: LINE_A }] }, OWNER),
    Return: (ref) => completeReturn({ rentalId: ref, lines: [{ bookingLineId: LINE_A }] }, OWNER),
    Reset: (ref) => completeReset({ id: ref, unitIds: ['unit-1'] }, OWNER),
  }

  for (const job of JOB_ORDER) {
    it(`${job} refuses a booking that is not at ${JOBS[job].runsAt}, and writes nothing`, async () => {
      // Every stage except the one this verb runs at.
      const wrong = JOB_ORDER.map((j) => JOBS[j].runsAt).find((s) => s !== JOBS[job].runsAt)
      db.state.responses['bookings'] = [[bookingAt(wrong as string)]]

      await expect(call[job]('B-715')).rejects.toThrow(
        new RegExp(`${job} runs at stage ${JOBS[job].runsAt}`),
      )
      expect(writes.state.ops).toHaveLength(0)
    })
  }

  it('refuses a cancelled booking, and a Closed one, before any write', async () => {
    db.state.responses['bookings'] = [[{ ...bookingAt('Booked'), cancelled_at: '2026-08-01T00:00:00Z' }]]
    await expect(packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A }] }, OWNER)).rejects.toThrow(
      /was cancelled/,
    )

    db.reset()
    db.state.responses['bookings'] = [[{ ...bookingAt('Booked'), closed_at: '2026-08-02T00:00:00Z' }]]
    await expect(packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A }] }, OWNER)).rejects.toThrow(
      /Closed is final/,
    )

    expect(writes.state.ops).toHaveLength(0)
  })

  it('refuses a booking reference that resolves to nothing', async () => {
    db.state.responses['bookings'] = [[]]
    await expect(packRental({ id: 'B-9999', lines: [{ bookingLineId: LINE_A }] }, OWNER)).rejects.toThrow(
      /No booking matches B-9999/,
    )
    expect(writes.state.ops).toHaveLength(0)
  })

  it('resolves a uuid by id and a B- number by booking_no', async () => {
    db.state.responses['bookings'] = [[bookingAt('Returned')]]
    db.state.responses['cleaning_queue_entries'] = [
      [{ id: 'cq-1', unit_id: 'unit-1', requires_reset: true, reset_completed_at: null }],
    ]
    await completeReset({ id: BOOKING_ID, unitIds: ['unit-1'] }, OWNER)
    expect(db.state.calls[0]?.ops[0]).toEqual(['eq', 'id', BOOKING_ID])

    db.reset()
    writes.reset()
    db.state.responses['bookings'] = [[bookingAt('Returned')]]
    db.state.responses['cleaning_queue_entries'] = [
      [{ id: 'cq-1', unit_id: 'unit-1', requires_reset: true, reset_completed_at: null }],
    ]
    await completeReset({ id: 'B-715', unitIds: ['unit-1'] }, OWNER)
    expect(db.state.calls[0]?.ops[0]).toEqual(['eq', 'booking_no', 'B-715'])
  })
})

/* ── 2 · Pack, end to end, in order ─────────────────────────────────────── */

describe('Pack — the whole shape, in the order that makes a partial failure truthful', () => {
  beforeEach(() => {
    /* The second element is what the stage READ-BACK in `advanceStage`
       (RL-08 / Audit-01 P0-01) must see after the transition — `nextRows`
       repeats the last entry forever, so a one-element queue would report
       'Booked' for the persisted stage and the verb would rightly refuse to
       seal. Refusal paths below never reach the read-back, so the extra row
       changes nothing for them. */
    db.state.responses['bookings'] = [[bookingAt('Booked')], [bookingAt('Packed')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 2 }]]
    db.state.responses['operation_sessions'] = [[]]
    db.state.responses['packing_lines'] = [
      [], // before the write: no row for this line yet
      [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Packed' }], // after
    ]
  })

  it('opens the session In Progress, fills it, moves the stage, and seals it last', async () => {
    const result = await packRental(
      {
        id: 'B-715',
        clientUuid: 'action-key-1',
        lines: [{ bookingLineId: LINE_A, unitIds: ['unit-1', 'unit-2'] }],
      },
      OWNER,
    )

    const sequence = writes.state.ops
      .filter((o) => o.table !== 'audit_events')
      .map((o) => `${o.kind}:${o.table}:${String(o.payload['state'] ?? '')}`)

    /* PK-05 — the seal is LAST. Everything above it can be re-attempted; a seal
       that lands before the stage cannot be taken back, and on Pack it costs the
       booking the only Packing session `0003:152` allows it. */
    expect(sequence).toEqual([
      'insert:operation_sessions:In Progress',
      'insert:packing_lines:Packed',
      'insert:session_line_movements:',
      'insert:session_line_movements:',
      'insert:booking_stage_transitions:',
      'update:operation_sessions:Completed',
    ])

    expect(result.sessionId).not.toBeNull()
    expect(result.lines).toBe(1)
    expect(result.movements).toBe(2)
    expect(result.stage).toEqual({ from: 'Booked', to: 'Packed' })
    expect(result.stageHeldBy).toEqual([])
  })

  it('carries the caller action key onto operation_sessions.client_uuid — Law 8', async () => {
    await packRental(
      { id: 'B-715', clientUuid: 'action-key-1', lines: [{ bookingLineId: LINE_A, unitIds: ['unit-1', 'unit-2'] }] },
      OWNER,
    )
    expect(insertsOn('operation_sessions')[0]?.payload['client_uuid']).toBe('action-key-1')
    // The same key is what closes the session, so an offline replay of the
    // action queues under one envelope rather than two.
    expect(opsOn('operation_sessions')[1]?.clientUuid).toBe('action-key-1')
  })

  it('writes a Packing session, never a Reset or Cleaning one, and no delivery_method', async () => {
    await packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1', 'u2'] }] }, OWNER)
    const session = insertsOn('operation_sessions')[0]?.payload
    expect(session?.['operation']).toBe('Packing')
    // CHECK 0003:91 is an equivalence — a non-Handover session must carry none.
    expect(session?.['delivery_method']).toBeNull()
    expect(session?.['session_no']).toBe(1)
    expect(session?.['warehouse_staff_id']).toBe(OWNER.userId)
  })

  it('leaves resulting_item_state NULL on packing movements — packing moves nothing out', async () => {
    await packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1', 'u2'] }] }, OWNER)
    for (const movement of insertsOn('session_line_movements')) {
      expect(movement.payload['resulting_item_state']).toBeNull()
    }
  })

  it('calls a short-packed line Partial, not Packed, and holds the stage', async () => {
    db.state.responses['packing_lines'] = [[], [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Partial' }]]

    const result = await packRental(
      { id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['unit-1'] }] },
      OWNER,
    )

    expect(insertsOn('packing_lines')[0]?.payload['state']).toBe('Partial')
    expect(result.stage).toBeNull()
    expect(result.stageHeldBy).toEqual([LINE_A])
    expect(insertsOn('booking_stage_transitions')).toHaveLength(0)
  })

  it('leaves that short-packed session In Progress — a booking gets one Packing session, ever', async () => {
    db.state.responses['packing_lines'] = [[], [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Partial' }]]

    const result = await packRental(
      { id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['unit-1'] }] },
      OWNER,
    )

    // `operation_sessions_one_packing_per_booking` (0003:156) is a unique index
    // on booking_id, and 0003:174 forbids closing a Packing session short of
    // every line. Closing here would spend the only session the booking is
    // allowed: the next Complete Packing would be refused by a unique-constraint
    // violation rather than by any rule an operator can read.
    expect(opsOn('operation_sessions').map((o) => o.kind)).toEqual(['insert'])
    expect(result.sessionClosed).toBe(false)
  })

  it('resumes that open session on the next pack instead of opening a second one', async () => {
    db.state.responses['operation_sessions'] = [[{ id: 'sess-1', session_no: 1, state: 'In Progress' }]]
    db.state.responses['packing_lines'] = [
      [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Partial' }], // what the first pass left
      [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Packed' }], // what this one leaves
    ]

    const result = await packRental(
      { id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['unit-1', 'unit-2'] }] },
      OWNER,
    )

    expect(insertsOn('operation_sessions')).toHaveLength(0)
    // The movements land inside the session that is still open — 0003:235 admits
    // them only while the parent session is In Progress.
    expect(insertsOn('session_line_movements')[0]?.payload['session_id']).toBe('sess-1')
    expect(opsOn('packing_lines')[0]).toMatchObject({ kind: 'update', id: 'pl-1' })
    // Now every line is terminal, so this pass is what closes it and moves the stage.
    expect(opsOn('operation_sessions')[0]).toMatchObject({ kind: 'update', id: 'sess-1' })
    expect(result.sessionClosed).toBe(true)
    expect(result.stage).toEqual({ from: 'Booked', to: 'Packed' })
  })

  it('appends a note typed on the resumed pass rather than dropping or overwriting it', async () => {
    db.state.responses['operation_sessions'] = [
      [{ id: 'sess-1', session_no: 1, state: 'In Progress', notes: 'first pass: 1 of 2' }],
    ]
    db.state.responses['packing_lines'] = [
      [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Partial' }],
      [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Packed' }],
    ]

    await packRental(
      {
        id: 'B-715',
        notes: 'second pass: the last one',
        lines: [{ bookingLineId: LINE_A, unitIds: ['unit-1', 'unit-2'] }],
      },
      OWNER,
    )

    // A resumed session has no insert for the note to ride in on, and writing
    // over the earlier one would lose the first pass's words.
    expect(opsOn('operation_sessions')[0]?.payload['notes']).toBe(
      'first pass: 1 of 2\nsecond pass: the last one',
    )
  })

  it('records the entered count on a non-serialised line and NULL on a serialised one', async () => {
    await packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, qty: 2 }] }, OWNER)
    expect(insertsOn('packing_lines')[0]?.payload['qty_packed_entered']).toBe(2)
    // One quantity movement, no unit resolved (0003:238).
    const movements = insertsOn('session_line_movements')
    expect(movements).toHaveLength(1)
    expect(movements[0]?.payload['qty']).toBe(2)
    expect(movements[0]?.payload['unit_id']).toBeUndefined()

    writes.reset()
    db.state.responses['bookings'] = [[bookingAt('Booked')], [bookingAt('Packed')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 2 }]]
    db.state.responses['operation_sessions'] = [[]]
    db.state.responses['packing_lines'] = [[], [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Packed' }]]

    await packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1', 'u2'] }] }, OWNER)
    expect(insertsOn('packing_lines')[0]?.payload['qty_packed_entered']).toBeNull()
  })

  it('refuses a line that is not a live line of this booking', async () => {
    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_B }] }, OWNER),
    ).rejects.toThrow(/not live lines of B-715/)
    // The session is opened only after the line check, so nothing was written.
    expect(writes.state.ops).toHaveLength(0)
  })

  it('reads only live lines — a voided line is not packed (Law 3)', async () => {
    await packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1', 'u2'] }] }, OWNER)
    const lineRead = db.state.calls.find((c) => c.table === 'booking_lines')
    expect(lineRead?.ops).toContainEqual(['is', 'voided_at', null])
  })
})

/* ── 2b · PK-05 — a refused transition must not cost the one Packing session ─ */

/**
 * `operation_sessions_one_packing_per_booking` (`0003:152`) gives a booking
 * exactly one Packing session, ever, and only an `'In Progress'` session is
 * resumable. So the pair of facts below is the whole bug: seal, then fail to
 * move the stage, and the booking is unpackable forever with no rule an
 * operator can read.
 *
 * `0094` (written 6 Sep 2026) does not make the refusal itself more likely — it
 * guards *direct* writes to `bookings.stage` and exempts the SECURITY DEFINER
 * transition function. What it removes is the escape hatch: `0021`'s column
 * REVOKE was inert, so until now a refused transition could be papered over
 * with a PATCH. From here, a refusal is simply a booking that did not move.
 */
describe('PK-05 — a refused stage transition leaves the session resumable', () => {
  beforeEach(() => {
    // resolve → read-back (see the Pack suite's note on the second element)
    db.state.responses['bookings'] = [[bookingAt('Booked')], [bookingAt('Packed')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 2 }]]
    db.state.responses['operation_sessions'] = [[]]
    db.state.responses['packing_lines'] = [[], [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Packed' }]]
  })

  it('does not seal the Packing session when the transition is refused', async () => {
    writes.state.refuseInsertOn = 'booking_stage_transitions'

    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1', 'u2'] }] }, OWNER),
    ).rejects.toThrow(/still open/)

    // Opened, never sealed: the update to 'Completed' is the write that would
    // have spent the session.
    expect(opsOn('operation_sessions').map((o) => o.kind)).toEqual(['insert'])
    expect(insertsOn('operation_sessions')[0]?.payload['state']).toBe('In Progress')
  })

  it('does not seal when the stage cannot be read back at the new value — RL-08 / Audit-01 P0-01', async () => {
    /* The transition INSERT resolves (the one-element bookings queue repeats
       'Booked' forever, so the read-back after it still sees 'Booked'), yet
       the verb must NOT seal or claim the move: a stage the database cannot
       be SEEN to have reached is a refused stage. */
    db.state.responses['bookings'] = [[bookingAt('Booked')]]

    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1', 'u2'] }] }, OWNER),
    ).rejects.toThrow(/still open/)

    // Opened, never sealed — same residue as a refusal, because it is one.
    expect(opsOn('operation_sessions').map((o) => o.kind)).toEqual(['insert'])
    expect(insertsOn('operation_sessions')[0]?.payload['state']).toBe('In Progress')
  })

  it('still records the pass that happened — lines, movements and an audit row', async () => {
    writes.state.refuseInsertOn = 'booking_stage_transitions'

    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1', 'u2'] }] }, OWNER),
    ).rejects.toThrow()

    expect(insertsOn('packing_lines')).toHaveLength(1)
    expect(insertsOn('session_line_movements')).toHaveLength(2)
    // The audit row states the state the session is ACTUALLY in — not the one
    // the verb was aiming at. A row saying 'Completed' here would be the lie.
    const audit = insertsOn('audit_events').find((o) => o.payload['table_name'] === 'operation_sessions')
    expect((audit?.payload['new_values'] as Record<string, unknown>)['state']).toBe('In Progress')
  })

  it('the next pack resumes that open session instead of opening a second one', async () => {
    // What the refused pass left behind, read back on the retry.
    db.state.responses['operation_sessions'] = [[{ id: 'sess-1', session_no: 1, state: 'In Progress' }]]
    db.state.responses['packing_lines'] = [
      [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Packed' }],
      [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Packed' }],
    ]

    const result = await packRental(
      { id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1', 'u2'] }] },
      OWNER,
    )

    expect(insertsOn('operation_sessions')).toHaveLength(0)
    expect(result.sessionId).toBe('sess-1')
    expect(result.sessionClosed).toBe(true)
    expect(result.stage).toEqual({ from: 'Booked', to: 'Packed' })
  })

  it('refuses by name when the booking has already spent its one Packing session', async () => {
    // The state the OLD order could strand a booking in, and which no code path
    // in this repo can undo. It must read as a sentence, not as a unique-index
    // violation from Postgres.
    db.state.responses['operation_sessions'] = [[{ id: 'sess-1', session_no: 1, state: 'Completed' }]]

    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1', 'u2'] }] }, OWNER),
    ).rejects.toThrow(/exactly one, ever/)

    expect(writes.state.ops).toHaveLength(0)
  })

  it('a Handover whose transition is refused also stays open, rather than sealing a handover that did not happen', async () => {
    // Handover may close short (0003:129 — staggered collection), so it would
    // have sealed on the old order and left a Completed session claiming a
    // pickup the client never took.
    db.state.responses['bookings'] = [[bookingAt('Packed')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
    db.state.responses['handover_lines'] = [[], [{ id: 'hl-1', booking_line_id: LINE_A, state: 'Picked Up' }]]
    writes.state.refuseInsertOn = 'booking_stage_transitions'

    await expect(
      handoverRental({ bookingId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] }, OWNER),
    ).rejects.toThrow(/still open/)

    expect(opsOn('operation_sessions').map((o) => o.kind)).toEqual(['insert'])
  })

  it('a Handover that leaves lines Remaining still seals — the refusal changes nothing there', async () => {
    db.state.responses['bookings'] = [[bookingAt('Packed')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 2 }]]
    db.state.responses['handover_lines'] = [[], [{ id: 'hl-1', booking_line_id: LINE_A, state: 'Remaining' }]]

    const result = await handoverRental(
      { bookingId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] },
      OWNER,
    )

    expect(result.stage).toBeNull()
    expect(result.sessionClosed).toBe(true)
    expect(opsOn('operation_sessions')[1]?.payload['state']).toBe('Completed')
  })
})

/* ── 3 · bookings.stage is never written directly ───────────────────────── */

describe('the stage moves through the transition trigger and nothing else', () => {
  it('never writes the bookings table, and the transition it does write matches JOBS', async () => {
    // resolve → stage read-back (RL-08) — the second element is the moved stage
    db.state.responses['bookings'] = [[bookingAt('Packed')], [bookingAt('On Rent')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
    db.state.responses['operation_sessions'] = [[]]
    db.state.responses['handover_lines'] = [[], [{ id: 'hl-1', booking_line_id: LINE_A, state: 'Picked Up' }]]

    await handoverRental({ bookingId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] }, OWNER)

    expect(opsOn('bookings')).toHaveLength(0)

    const transition = insertsOn('booking_stage_transitions')[0]?.payload
    expect(transition?.['from_stage']).toBe(JOBS.Handover.runsAt)
    expect(transition?.['to_stage']).toBe(JOBS.Handover.sets)
    expect(transition?.['is_reversal']).toBe(false)
    // Snapshotted, never re-read later (0002:478).
    expect(transition?.['actor_id']).toBe(OWNER.userId)
    expect(transition?.['actor_role']).toBe(OWNER.role)
    expect(transition?.['branch_id']).toBe(BRANCH_ID)
  })

  it('writes signatures to signatures table before stage transition when provided', async () => {
    db.state.responses['bookings'] = [[bookingAt('Packed')], [bookingAt('On Rent')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
    db.state.responses['operation_sessions'] = [[]]
    db.state.responses['handover_lines'] = [[], [{ id: 'hl-1', booking_line_id: LINE_A, state: 'Picked Up' }]]

    const nowIso = new Date().toISOString()
    await handoverRental(
      {
        bookingId: 'B-715',
        lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }],
        signatures: [
          { role: 'Receiver', signerName: 'Alice Client', signedAt: nowIso, isRequired: true },
          { role: 'Warehouse staff', signerName: 'Bob Staff', signedAt: nowIso, isRequired: true },
        ],
      },
      OWNER,
    )

    const sigWrites = insertsOn('signatures')
    expect(sigWrites).toHaveLength(2)
    expect(sigWrites[0]?.payload['signature_role']).toBe('Receiver')
    expect(sigWrites[0]?.payload['signer_name']).toBe('Alice Client')
    expect(sigWrites[0]?.payload['created_by']).toBe(OWNER.userId)

    expect(sigWrites[1]?.payload['signature_role']).toBe('Warehouse staff')
    expect(sigWrites[1]?.payload['signer_name']).toBe('Bob Staff')

    // Signatures written before booking_stage_transitions
    const sigIndex = writes.state.ops.findIndex((o) => o.table === 'signatures')
    const transitionIndex = writes.state.ops.findIndex((o) => o.table === 'booking_stage_transitions')
    expect(sigIndex).toBeGreaterThan(-1)
    expect(transitionIndex).toBeGreaterThan(sigIndex)
  })
})

/* ── 4 · Law 6 — money is neither read nor written ──────────────────────── */

describe('Law 6 — the floor verbs touch no money', () => {
  const MONEY = [
    'rate',
    'discount_amount',
    'supplier_cost',
    'markup_amount',
    'deposit_required',
    'amount',
    'estimated_cost',
    'replacement_cost',
    'line_total',
    'daily_rate',
  ]

  it('names no money column in any SELECT, and carries none in any write payload', async () => {
    db.state.responses['bookings'] = [[bookingAt('On Rent')], [bookingAt('Returned')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
    db.state.responses['operation_sessions'] = [[]]
    db.state.responses['return_lines'] = [[], [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Returned' }]]

    await completeReturn(
      { rentalId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'], condition: 'Good' }] },
      OWNER,
    )

    expect(db.state.calls.length).toBeGreaterThan(0)
    for (const call of db.state.calls) {
      const columns = call.columns.split(',').map((c) => c.trim())
      for (const money of MONEY) expect(columns).not.toContain(money)
    }

    expect(writes.state.ops.length).toBeGreaterThan(0)
    for (const op of writes.state.ops) {
      // `audit_events` carries the verb's own newValues blob; it is written by
      // `lib/audit` from what this file hands it, so it is scanned too.
      for (const money of MONEY) expect(Object.keys(op.payload)).not.toContain(money)
    }
  })
})

/* ── 5 · Handover ───────────────────────────────────────────────────────── */

describe('Handover', () => {
  beforeEach(() => {
    // resolve → stage read-back (RL-08); the staged/partial flows below simply
    // never consume the second element, because no transition is attempted.
    db.state.responses['bookings'] = [[bookingAt('Packed')], [bookingAt('On Rent')]]
    db.state.responses['booking_lines'] = [
      [
        { id: LINE_A, qty: 2 },
        { id: LINE_B, qty: 1 },
      ],
    ]
    db.state.responses['operation_sessions'] = [[]]
  })

  it('copies the booking delivery type onto the session — CHECK 0003:91 demands one', async () => {
    db.state.responses['handover_lines'] = [
      [],
      [
        { id: 'hl-1', booking_line_id: LINE_A, state: 'Picked Up' },
        { id: 'hl-2', booking_line_id: LINE_B, state: 'Picked Up' },
      ],
    ]
    await handoverRental(
      {
        bookingId: 'B-715',
        lines: [
          { bookingLineId: LINE_A, unitIds: ['u1', 'u2'] },
          { bookingLineId: LINE_B, unitIds: ['u3'] },
        ],
      },
      OWNER,
    )
    const session = insertsOn('operation_sessions')[0]?.payload
    expect(session?.['operation']).toBe('Handover')
    expect(session?.['delivery_method']).toBe('Babin Delivery')
  })

  it('retries Client Pickup with the legacy session enum only when that enum rejects it', async () => {
    db.state.responses['bookings'] = [
      [{ ...bookingAt('Packed'), delivery_type: 'Client Pickup' }],
      [bookingAt('On Rent')],
    ]
    db.state.responses['handover_lines'] = [
      [],
      [
        { id: 'hl-1', booking_line_id: LINE_A, state: 'Picked Up' },
        { id: 'hl-2', booking_line_id: LINE_B, state: 'Picked Up' },
      ],
    ]
    writes.state.legacyPickupEnum = true

    await handoverRental({
      bookingId: 'B-715',
      lines: [
        { bookingLineId: LINE_A, unitIds: ['u1', 'u2'] },
        { bookingLineId: LINE_B, unitIds: ['u3'] },
      ],
    }, OWNER)

    expect(writes.state.rejectedPickupInserts).toBe(1)
    expect(insertsOn('operation_sessions')).toHaveLength(1)
    expect(insertsOn('operation_sessions')[0]?.payload['delivery_method']).toBe('Customer Pickup')
  })

  it('writes Client Pickup directly when the session enum accepts it', async () => {
    db.state.responses['bookings'] = [
      [{ ...bookingAt('Packed'), delivery_type: 'Client Pickup' }],
      [bookingAt('On Rent')],
    ]
    db.state.responses['handover_lines'] = [
      [],
      [
        { id: 'hl-1', booking_line_id: LINE_A, state: 'Picked Up' },
        { id: 'hl-2', booking_line_id: LINE_B, state: 'Picked Up' },
      ],
    ]

    await handoverRental({
      bookingId: 'B-715',
      lines: [
        { bookingLineId: LINE_A, unitIds: ['u1', 'u2'] },
        { bookingLineId: LINE_B, unitIds: ['u3'] },
      ],
    }, OWNER)

    expect(writes.state.rejectedPickupInserts).toBe(0)
    expect(insertsOn('operation_sessions')[0]?.payload['delivery_method']).toBe('Client Pickup')
  })

  it('marks movements Picked Up, one row per scanned unit, with its serial', async () => {
    db.state.responses['handover_lines'] = [
      [],
      [
        { id: 'hl-1', booking_line_id: LINE_A, state: 'Picked Up' },
        { id: 'hl-2', booking_line_id: LINE_B, state: 'Picked Up' },
      ],
    ]
    await handoverRental(
      {
        bookingId: 'B-715',
        lines: [
          { bookingLineId: LINE_A, unitIds: ['u1', 'u2'], serials: ['SN-1', 'SN-2'] },
          { bookingLineId: LINE_B, unitIds: ['u3'] },
        ],
      },
      OWNER,
    )
    const movements = insertsOn('session_line_movements')
    expect(movements).toHaveLength(3)
    for (const m of movements) {
      expect(m.payload['resulting_item_state']).toBe('Picked Up')
      expect(m.payload['qty']).toBe(1)
    }
    expect(movements[0]?.payload['serial']).toBe('SN-1')
    expect(movements[2]?.payload['serial']).toBeNull()
  })

  it('a staggered collection stays Remaining and does NOT move the booking to On Rent', async () => {
    // Line A short, line B untouched — 0003:340's condition is unmet twice over.
    db.state.responses['handover_lines'] = [
      [],
      [{ id: 'hl-1', booking_line_id: LINE_A, state: 'Remaining' }],
    ]

    const result = await handoverRental(
      { bookingId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] },
      OWNER,
    )

    expect(insertsOn('handover_lines')[0]?.payload['state']).toBe('Remaining')
    // Only a completed line stamps the session that took the last unit.
    expect(insertsOn('handover_lines')[0]?.payload['completed_session_id']).toBeUndefined()
    expect(result.stage).toBeNull()
    expect(result.stageHeldBy).toEqual([LINE_A, LINE_B])
    expect(insertsOn('booking_stage_transitions')).toHaveLength(0)
    // But the session itself still completed — a partial pickup is not a failure.
    expect(opsOn('operation_sessions')[1]?.payload['state']).toBe('Completed')
    expect(result.sessionClosed).toBe(true)
  })

  it('opens the evening collection beside the completed morning one, never inside it', async () => {
    // Where Pack resumes an unfinished session, Handover does not: 0003:129 makes
    // the morning collection 1 and the evening 2, and a Completed session is
    // sealed (0003:157). Same shape, one flag apart — CLOSES_WHILE_INCOMPLETE.
    db.state.responses['operation_sessions'] = [[{ id: 'sess-1', session_no: 1, state: 'Completed' }]]
    db.state.responses['handover_lines'] = [
      [{ id: 'hl-1', booking_line_id: LINE_A, state: 'Remaining' }],
      [
        { id: 'hl-1', booking_line_id: LINE_A, state: 'Picked Up' },
        { id: 'hl-2', booking_line_id: LINE_B, state: 'Picked Up' },
      ],
    ]

    const result = await handoverRental(
      {
        bookingId: 'B-715',
        lines: [
          { bookingLineId: LINE_A, unitIds: ['u1', 'u2'] },
          { bookingLineId: LINE_B, unitIds: ['u3'] },
        ],
      },
      OWNER,
    )

    const opened = insertsOn('operation_sessions')
    expect(opened).toHaveLength(1)
    expect(opened[0]?.payload['session_no']).toBe(2)
    expect(insertsOn('session_line_movements')[0]?.payload['session_id']).not.toBe('sess-1')
    expect(result.sessionClosed).toBe(true)
    expect(result.stage).toEqual({ from: 'Packed', to: 'On Rent' })
  })

  it('updates the existing line row on a second session rather than inserting a duplicate', async () => {
    // `handover_lines` is unique on booking_line_id (0003:323), so the second
    // session must UPDATE what the first one wrote.
    db.state.responses['handover_lines'] = [
      [{ id: 'hl-1', booking_line_id: LINE_A, state: 'Remaining' }],
      [
        { id: 'hl-1', booking_line_id: LINE_A, state: 'Picked Up' },
        { id: 'hl-2', booking_line_id: LINE_B, state: 'Picked Up' },
      ],
    ]
    db.state.responses['operation_sessions'] = [[{ session_no: 1 }]]

    await handoverRental(
      {
        bookingId: 'B-715',
        lines: [
          { bookingLineId: LINE_A, unitIds: ['u1', 'u2'] },
          { bookingLineId: LINE_B, unitIds: ['u3'] },
        ],
      },
      OWNER,
    )

    const lineOps = opsOn('handover_lines')
    expect(lineOps.map((o) => o.kind)).toEqual(['update', 'insert'])
    expect(lineOps[0]?.id).toBe('hl-1')
    // first_session_id is NOT in the update — the first session to touch the
    // line is a fact the second must not overwrite.
    expect(Object.keys(lineOps[0]?.payload ?? {})).not.toContain('first_session_id')
    // session_no is read, not assumed.
    expect(insertsOn('operation_sessions')[0]?.payload['session_no']).toBe(2)
  })
})

/* ── 6 · Return ─────────────────────────────────────────────────────────── */

describe('Return', () => {
  beforeEach(() => {
    // resolve → stage read-back (RL-08); holds short of terminal never read it.
    db.state.responses['bookings'] = [[bookingAt('On Rent')], [bookingAt('Returned')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
    db.state.responses['operation_sessions'] = [[]]
  })

  it('sets condition, inspector and time together — CHECK 0003:382 takes all three or none', async () => {
    db.state.responses['return_lines'] = [[], [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Returned' }]]

    await completeReturn(
      {
        rentalId: 'B-715',
        occurredAt: '2026-08-12T04:15:00.000Z',
        lines: [{ bookingLineId: LINE_A, unitIds: ['u1'], condition: 'Damaged' }],
      },
      OWNER,
    )

    const line = insertsOn('return_lines')[0]?.payload
    expect(line?.['state']).toBe('Returned')
    expect(line?.['inspection_state']).toBe('Inspected')
    expect(line?.['condition']).toBe('Damaged')
    expect(line?.['inspected_by']).toBe(OWNER.userId)
    expect(line?.['inspected_at']).toBe('2026-08-12T04:15:00.000Z')
    // 0003:225 — a Damaged return lands the movement in 'Damaged', not 'Returned'.
    expect(insertsOn('session_line_movements')[0]?.payload['resulting_item_state']).toBe('Damaged')
  })

  it('leaves an uninspected line Pending and raises INSPECTION_REQUIRED for it only', async () => {
    db.state.responses['booking_lines'] = [
      [
        { id: LINE_A, qty: 1 },
        { id: LINE_B, qty: 1 },
      ],
    ]
    db.state.responses['return_lines'] = [
      [],
      [
        { id: 'rl-1', booking_line_id: LINE_A, state: 'Returned' },
        { id: 'rl-2', booking_line_id: LINE_B, state: 'Returned' },
      ],
    ]

    await completeReturn(
      {
        rentalId: 'B-715',
        lines: [
          { bookingLineId: LINE_A, unitIds: ['u1'], condition: 'Good' },
          { bookingLineId: LINE_B, unitIds: ['u2'] },
        ],
      },
      OWNER,
    )

    const rows = insertsOn('return_lines')
    expect(rows[0]?.payload['inspection_state']).toBe('Inspected')
    expect(rows[1]?.payload['inspection_state']).toBeUndefined() // column default: 'Pending'
  })

  /* ── RT-02 · damage found at Return becomes a row, not a note ─────────── */

  it('raises one damage_findings row per damaged unit, parented on the return line', async () => {
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 2 }]]
    db.state.responses['return_lines'] = [[], [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Returned' }]]

    const result = await completeReturn(
      {
        rentalId: 'B-715',
        lines: [
          {
            bookingLineId: LINE_A,
            unitIds: ['u1', 'u2'],
            condition: 'Damaged',
            damage: [
              { unitId: 'u1', condition: 'Damaged', description: '  Lens mount cracked; will not seat.  ' },
              { unitId: 'u2', condition: 'Lost', description: 'Battery door missing on return.' },
            ],
          },
        ],
      },
      OWNER,
    )

    const found = insertsOn('damage_findings')
    expect(found).toHaveLength(2)
    expect(result.damageFindings).toBe(2)

    const returnLineId = insertsOn('return_lines')[0]?.payload['id']
    expect(returnLineId).toBeDefined()

    const first = found[0]?.payload ?? {}
    expect(first['source']).toBe('Return inspection')
    // 0003:471 — exactly one parent, and it must match the source.
    expect(first['return_line_id']).toBe(returnLineId)
    expect(first['cleaning_queue_entry_id']).toBeUndefined()
    expect(first['unit_id']).toBe('u1')
    expect(first['damage_type']).toBe('Damaged')
    expect(first['description']).toBe('Lens mount cracked; will not seat.')
    // Law 6 / 0003:488 — the approver's field, never written by a floor verb.
    expect(first['estimated_cost']).toBeUndefined()
    // The column default is 'Pending Approval'; the verb does not restate it.
    expect(first['approval_state']).toBeUndefined()
    expect(String(first['severity'])).toMatch(/no severity scale is ruled/)

    expect(found[1]?.payload['unit_id']).toBe('u2')
    expect(found[1]?.payload['damage_type']).toBe('Lost')
  })

  it('raises nothing when no unit was damaged', async () => {
    db.state.responses['return_lines'] = [[], [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Returned' }]]
    const result = await completeReturn(
      { rentalId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'], condition: 'Good' }] },
      OWNER,
    )
    expect(insertsOn('damage_findings')).toHaveLength(0)
    expect(result.damageFindings).toBe(0)
  })

  it('does not await a Consumable-tracked line with no return row (0141)', async () => {
    db.state.responses['booking_lines'] = [
      [
        { id: LINE_A, qty: 1, line_type: 'Equipment', product_id: 'p-a', products: null },
        { id: LINE_B, qty: 2, line_type: 'Equipment', product_id: 'p-b', products: { tracking_mode: 'Consumable' } },
      ],
    ]
    db.state.responses['return_lines'] = [[], [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Returned' }]]

    const result = await completeReturn(
      { rentalId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'], condition: 'Good' }] },
      OWNER,
    )
    // The gaffer tape has no return row and is not named in stageHeldBy: it
    // was consumed at Handover (0142) and the Return gate agrees (0141).
    expect(result.stageHeldBy).toEqual([])
  })

  it('refuses a damage finding with no description — that is a NOT NULL column, not a form rule', async () => {
    await expect(
      completeReturn(
        {
          rentalId: 'B-715',
          lines: [{ bookingLineId: LINE_A, unitIds: ['u1'], damage: [{ unitId: 'u1', condition: 'Damaged', description: '   ' }] }],
        },
        OWNER,
      ),
    ).rejects.toThrow(/no description/)
    expect(insertsOn('damage_findings')).toHaveLength(0)
  })

  it('refuses two findings against the same unit on one line', async () => {
    await expect(
      completeReturn(
        {
          rentalId: 'B-715',
          lines: [
            {
              bookingLineId: LINE_A,
              unitIds: ['u1'],
              damage: [
                { unitId: 'u1', condition: 'Damaged', description: 'Cracked housing.' },
                { unitId: 'u1', condition: 'Lost', description: 'Also the cap.' },
              ],
            },
          ],
        },
        OWNER,
      ),
    ).rejects.toThrow(/two damage findings/)
  })

  it('records a Not Returned line with its reason and decision, and moves nothing', async () => {
    db.state.responses['return_lines'] = [
      [],
      [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Not Returned', not_returned_decision: 'Write off' }],
    ]

    const result = await completeReturn(
      {
        rentalId: 'B-715',
        lines: [
          {
            bookingLineId: LINE_A,
            outcome: 'missing',
            reason: 'Client confirms it was destroyed on site',
            notReturnedDecision: 'Write off',
          },
        ],
      },
      OWNER,
    )

    const line = insertsOn('return_lines')[0]?.payload
    expect(line?.['state']).toBe('Not Returned')
    expect(line?.['not_returned_decision']).toBe('Write off')
    // Absence is never converted into a state (0003:630) — nothing moved.
    expect(insertsOn('session_line_movements')).toHaveLength(0)
    // 'Write off' ends the line, so the booking's return is finished.
    expect(result.stage).toEqual({ from: 'On Rent', to: 'Returned' })
  })

  it('refuses a damage finding on a verb that is not Return', async () => {
    await expect(
      packRental(
        {
          id: 'B-715',
          lines: [{ bookingLineId: LINE_A, damage: [{ unitId: 'u1', condition: 'Damaged', description: 'Cracked housing.' }] }],
        },
        OWNER,
      ),
    ).rejects.toThrow(/Return inspection only/)
  })

  it('holds the stage while a line is still Outstanding', async () => {
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 4 }]]
    db.state.responses['return_lines'] = [[], [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Outstanding' }]]

    const result = await completeReturn(
      { rentalId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] },
      OWNER,
    )
    expect(insertsOn('return_lines')[0]?.payload['state']).toBe('Outstanding')
    expect(result.stage).toBeNull()
    expect(result.stageHeldBy).toEqual([LINE_A])
    // RT-01 — the gear is still out, so no actual-return instant is stamped.
    expect(opsOn('bookings')).toHaveLength(0)
  })

  it('stamps bookings.actual_return_at once, at the session that moves the booking to Returned (RT-01)', async () => {
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
    db.state.responses['return_lines'] = [[], [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Returned' }]]

    const result = await completeReturn(
      { rentalId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }], occurredAt: '2026-08-12T05:00:00.000Z', clientUuid: 'act-1' },
      OWNER,
    )
    expect(result.stage).toEqual({ from: 'On Rent', to: 'Returned' })
    const stamps = opsOn('bookings')
    expect(stamps).toHaveLength(1)
    expect(stamps[0]).toMatchObject({ kind: 'update', payload: { actual_return_at: '2026-08-12T05:00:00.000Z' }, clientUuid: 'act-1' })
  })
})

/* ── 6b · RT-03 — "Not Returned" is not always finished ─────────────────── */

/**
 * # The positive control
 *
 * Restoring the rule this replaces — terminality read off `return_lines.state`
 * alone, i.e. `TERMINAL_LINE_STATES.Return.includes(row.state)` as the whole
 * answer — turns the first two cases below red: the stage moves to Returned,
 * `stageHeldBy` empties, and `bookings.actual_return_at` is stamped on gear that
 * is still with the client. That is the defect, and these are the tests that
 * would have caught it.
 *
 * The rule is `0003:399` — "any unresolved Not Returned blocks Stage 10
 * Completed" — with `0015:116` mapping the retired `'Completed'` onto the
 * canonical `Returned`. The last case is the half that makes the fix safe rather
 * than merely correct: the booking is left On Rent, so the Return workspace
 * still opens and the expected item can actually be received. A booking that
 * could not leave Returned is what this replaces; a booking that cannot leave On
 * Rent would be the same bug wearing a different stage.
 */
describe('RT-03 — a line that is still expected back is not a finished line', () => {
  beforeEach(() => {
    db.state.responses['bookings'] = [[bookingAt('On Rent')], [bookingAt('Returned')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
    db.state.responses['operation_sessions'] = [[]]
  })

  it("holds the stage on a Not Returned line whose decision is 'Still expected'", async () => {
    db.state.responses['return_lines'] = [
      [],
      [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Not Returned', not_returned_decision: 'Still expected' }],
    ]

    const result = await completeReturn(
      {
        rentalId: 'B-715',
        lines: [
          {
            bookingLineId: LINE_A,
            outcome: 'missing',
            reason: 'Still on the shoot floor, client bringing it tomorrow',
            notReturnedDecision: 'Still expected',
          },
        ],
      },
      OWNER,
    )

    expect(insertsOn('return_lines')[0]?.payload['not_returned_decision']).toBe('Still expected')
    expect(result.stage).toBeNull()
    expect(result.stageHeldBy).toEqual([LINE_A])
    // The gear is still out, so no actual-return instant is stamped (RT-01's rule).
    expect(opsOn('bookings')).toHaveLength(0)
    // Return is multi-session (0003:129): this session is a finished session.
    expect(result.sessionClosed).toBe(true)
  })

  it('reads the decision off the line table, so an earlier session holds the stage too', async () => {
    // Nothing about LINE_A is named in THIS call — it was declared Not Returned
    // / Still expected by an earlier session and the row is still that. The
    // terminality question asks about every live line, not only the named ones.
    db.state.responses['booking_lines'] = [
      [
        { id: LINE_A, qty: 1 },
        { id: LINE_B, qty: 1 },
      ],
    ]
    db.state.responses['return_lines'] = [
      [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Not Returned', not_returned_decision: 'Still expected' }],
      [
        { id: 'rl-1', booking_line_id: LINE_A, state: 'Not Returned', not_returned_decision: 'Still expected' },
        { id: 'rl-2', booking_line_id: LINE_B, state: 'Returned', not_returned_decision: null },
      ],
    ]

    const result = await completeReturn(
      { rentalId: 'B-715', lines: [{ bookingLineId: LINE_B, unitIds: ['u2'], condition: 'Good' }] },
      OWNER,
    )

    expect(result.stage).toBeNull()
    expect(result.stageHeldBy).toEqual([LINE_A])
    expect(opsOn('bookings')).toHaveLength(0)
  })

  it('holds the stage on a Not Returned line with no decision at all', async () => {
    /* `return_lines_not_returned_needs_reason_and_decision` (0003:378) should
       make this row impossible, so this pins the DIRECTION of the defensive
       branch rather than a reachable state: nothing has been decided, so nothing
       is resolved. Holding at On Rent is the recoverable side — the line can
       still be received or re-declared. */
    db.state.responses['return_lines'] = [
      [],
      [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Not Returned', not_returned_decision: null }],
    ]

    const result = await completeReturn(
      {
        rentalId: 'B-715',
        lines: [
          {
            bookingLineId: LINE_A,
            outcome: 'missing',
            reason: 'Not on the van and not on the shelf',
            notReturnedDecision: 'Still expected',
          },
        ],
      },
      OWNER,
    )

    expect(result.stage).toBeNull()
    expect(result.stageHeldBy).toEqual([LINE_A])
  })

  it('the three decisions that end the line still move the stage', async () => {
    for (const decision of ['Charge replacement', 'Insurance claim', 'Write off'] as const) {
      db.reset()
      writes.reset()
      db.state.responses['bookings'] = [[bookingAt('On Rent')], [bookingAt('Returned')]]
      db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
      db.state.responses['operation_sessions'] = [[]]
      db.state.responses['return_lines'] = [
        [],
        [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Not Returned', not_returned_decision: decision }],
      ]

      const result = await completeReturn(
        {
          rentalId: 'B-715',
          lines: [
            {
              bookingLineId: LINE_A,
              outcome: 'missing',
              reason: `Decision recorded on the floor: ${decision}`,
              notReturnedDecision: decision,
            },
          ],
        },
        OWNER,
      )

      expect(result.stage).toEqual({ from: 'On Rent', to: 'Returned' })
      expect(result.stageHeldBy).toEqual([])
    }
  })

  it('a later session receives the expected item, and THAT session moves the stage', async () => {
    // The state the first session left: one Return session, Completed, and a
    // return_lines row still Not Returned / Still expected.
    db.state.responses['operation_sessions'] = [[{ id: 'sess-1', session_no: 1, state: 'Completed', notes: null }]]
    db.state.responses['return_lines'] = [
      [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Not Returned', not_returned_decision: 'Still expected' }],
      [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Returned', not_returned_decision: 'Still expected' }],
    ]

    const result = await completeReturn(
      {
        rentalId: 'B-715',
        lines: [{ bookingLineId: LINE_A, unitIds: ['u1'], condition: 'Good' }],
        occurredAt: '2026-09-07T09:00:00.000Z',
        clientUuid: 'act-2',
      },
      OWNER,
    )

    // A second session beside the first, not a resumed one (0003:85).
    expect(insertsOn('operation_sessions')[0]?.payload['session_no']).toBe(2)
    // The line row is UPDATEd — `unique (booking_line_id)` (0003:376) means
    // there is one row per line for the whole booking, not one per session.
    expect(insertsOn('return_lines')).toHaveLength(0)
    expect(opsOn('return_lines')[0]).toMatchObject({ kind: 'update', id: 'rl-1', payload: { state: 'Returned' } })

    expect(result.stage).toEqual({ from: 'On Rent', to: 'Returned' })
    expect(opsOn('bookings')).toHaveLength(1)
    expect(opsOn('bookings')[0]).toMatchObject({ payload: { actual_return_at: '2026-09-07T09:00:00.000Z' } })
  })

  it('names the decision column in the return_lines read, and no money column with it', async () => {
    db.state.responses['return_lines'] = [
      [],
      [{ id: 'rl-1', booking_line_id: LINE_A, state: 'Returned', not_returned_decision: null }],
    ]
    await completeReturn(
      { rentalId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'], condition: 'Good' }] },
      OWNER,
    )

    const reads = db.state.calls.filter((c) => c.table === 'return_lines')
    expect(reads.length).toBeGreaterThan(0)
    for (const read of reads) {
      const columns = read.columns.split(',').map((c) => c.trim())
      expect(columns).toContain('not_returned_decision')
      // Law 6 — the extra column is an enum, and the list is still spelled out.
      expect(read.columns).not.toContain('*')
    }
  })

  it('every member of not_returned_decision has an answer, and only one of them holds the line', () => {
    /* Keyed on the enum in `floorVerb.ts`, so a fifth member fails `tsc` there.
       This pins the VALUES: flipping 'Still expected' back to terminal — the
       whole of RT-03 — fails here as well as in the behaviour tests above. */
    const decisions: readonly NotReturnedDecision[] = [
      'Still expected',
      'Charge replacement',
      'Insurance claim',
      'Write off',
    ]
    const holds = decisions.filter((d) => !notReturnedDecisionEndsLine(d))
    expect(holds).toEqual(['Still expected'])
    expect(notReturnedDecisionEndsLine(null)).toBe(false)
  })
})

/* ── 7 · The refusals that stand in for DB CHECKs ───────────────────────── */

describe('validate refuses what Postgres would reject, before anything is written', () => {
  it('refuses an empty line list on all three session verbs', async () => {
    await expect(packRental({ id: 'B-715', lines: [] }, OWNER)).rejects.toThrow(/needs the booking lines/)
    await expect(handoverRental({ bookingId: 'B-715', lines: [] }, OWNER)).rejects.toThrow(
      /needs the booking lines/,
    )
    await expect(completeReturn({ rentalId: 'B-715', lines: [] }, OWNER)).rejects.toThrow(
      /needs the booking lines/,
    )
    expect(writes.state.ops).toHaveLength(0)
    // Nothing was even read: validate runs before execute.
    expect(db.state.calls).toHaveLength(0)
  })

  it('refuses an empty unit list on Reset — the queue is per item, not per booking', async () => {
    await expect(completeReset({ id: 'B-715', unitIds: [] }, OWNER)).rejects.toThrow(/per item, not per booking/)
    expect(db.state.calls).toHaveLength(0)
  })

  it('refuses a missing line whose reason is under ten characters', async () => {
    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, outcome: 'missing', reason: 'lost' }] }, OWNER),
    ).rejects.toThrow(/at least 10 characters/)
  })

  it('refuses a Not Returned line with no decision', async () => {
    await expect(
      completeReturn(
        {
          rentalId: 'B-715',
          lines: [{ bookingLineId: LINE_A, outcome: 'missing', reason: 'Never came back with the van' }],
        },
        OWNER,
      ),
    ).rejects.toThrow(/needs both a reason and a decision/)
  })

  it('refuses the same booking line twice — each line table holds one row per line', async () => {
    await expect(
      handoverRental(
        { bookingId: 'B-715', lines: [{ bookingLineId: LINE_A }, { bookingLineId: LINE_A }] },
        OWNER,
      ),
    ).rejects.toThrow(/appears twice/)
  })

  it('refuses a condition anywhere but Return', async () => {
    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, condition: 'Good' }] }, OWNER),
    ).rejects.toThrow(/condition is recorded at Return inspection only/)
  })
})

/* ── 8 · Reset — no session, no stage ───────────────────────────────────── */

describe('Reset — the verb that opens no session and moves no stage', () => {
  beforeEach(() => {
    db.state.responses['bookings'] = [[bookingAt('Returned')]]
  })

  it('sets reset_completed_at per entry and writes no session and no transition', async () => {
    db.state.responses['cleaning_queue_entries'] = [
      [
        { id: 'cq-1', unit_id: 'unit-1', requires_reset: true, reset_completed_at: null },
        { id: 'cq-2', unit_id: 'unit-2', requires_reset: true, reset_completed_at: null },
      ],
    ]

    const result = await completeReset(
      { id: 'B-715', unitIds: ['unit-1', 'unit-2'], occurredAt: '2026-08-12T05:00:00.000Z' },
      OWNER,
    )

    expect(result.sessionId).toBeNull()
    expect(result.unitsReset).toBe(2)
    // §1.5 — Reset blocks the item, never the booking.
    expect(result.stage).toBeNull()
    expect(JOBS.Reset.sets).toBeNull()
    expect(opsOn('operation_sessions')).toHaveLength(0)
    expect(opsOn('booking_stage_transitions')).toHaveLength(0)

    const updates = opsOn('cleaning_queue_entries')
    expect(updates.map((o) => o.id)).toEqual(['cq-1', 'cq-2'])
    expect(updates[0]?.payload['reset_completed_at']).toBe('2026-08-12T05:00:00.000Z')
    // It does not claim the item is Ready — that needs a checklist this verb never saw.
    expect(Object.keys(updates[0]?.payload ?? {})).not.toContain('state')
  })

  it('records a Reset exception and raises a Cleaning damage finding', async () => {
    db.state.responses['cleaning_queue_entries'] = [
      [
        { id: 'cq-1', unit_id: 'u1', requires_clean: true, requires_reset: true, clean_completed_at: null, reset_completed_at: null },
        { id: 'cq-2', unit_id: 'u2', requires_clean: true, requires_reset: true, clean_completed_at: null, reset_completed_at: null },
      ],
    ]

    const result = await completeReset(
      {
        id: 'B-715',
        resetEntries: [
          { unitId: 'u1' },
          {
            unitId: 'u2',
            problemState: 'Damaged',
            damageType: 'Structural',
            damageSeverity: 'High',
            problemReason: 'Tripod collar cracked through; will not hold.',
          },
        ],
      },
      OWNER,
    )

    // The exception is routed, so it is NOT counted as reset — but it IS recorded.
    expect(result.unitsReset).toBe(1)
    expect(result.damageFindings).toBe(1)

    const updates = opsOn('cleaning_queue_entries')
    const routed = updates.find((o) => o.id === 'cq-2')
    expect(routed?.payload['problem_state']).toBe('Damaged')
    // 0003:895 — a routed item is not stamped reset.
    expect(routed?.payload['reset_completed_at']).toBeUndefined()
    expect(updates.find((o) => o.id === 'cq-1')?.payload['reset_completed_at']).toBeDefined()

    const finding = insertsOn('damage_findings')[0]?.payload ?? {}
    expect(finding['source']).toBe('Cleaning')
    // 0003:474 — a Cleaning finding hangs off the queue entry, never a return line.
    expect(finding['cleaning_queue_entry_id']).toBe('cq-2')
    expect(finding['return_line_id']).toBeUndefined()
    expect(finding['unit_id']).toBe('u2')
    expect(finding['damage_type']).toBe('Structural')
    expect(finding['severity']).toBe('High')
    expect(finding['description']).toBe('Tripod collar cracked through; will not hold.')
    expect(finding['estimated_cost']).toBeUndefined()
    // TODO(decision) in the engine: no case is raised because nothing creates one.
    expect(finding['case_id']).toBeUndefined()
  })

  it('refuses a Damaged reset entry with no description', async () => {
    await expect(
      completeReset({ id: 'B-715', resetEntries: [{ unitId: 'u1', problemState: 'Damaged', problemReason: '  ' }] }, OWNER),
    ).rejects.toThrow(/marked Damaged with no description/)
    expect(insertsOn('damage_findings')).toHaveLength(0)
  })

  it('records Missing Item and Needs Repair without raising a damage finding', async () => {
    db.state.responses['cleaning_queue_entries'] = [
      [
        { id: 'cq-1', unit_id: 'u1', requires_clean: true, requires_reset: true, clean_completed_at: null, reset_completed_at: null },
        { id: 'cq-2', unit_id: 'u2', requires_clean: true, requires_reset: true, clean_completed_at: null, reset_completed_at: null },
      ],
    ]

    const result = await completeReset(
      {
        id: 'B-715',
        resetEntries: [
          { unitId: 'u1', problemState: 'Missing Item' },
          { unitId: 'u2', problemState: 'Needs Repair' },
        ],
      },
      OWNER,
    )

    expect(result.unitsReset).toBe(0)
    expect(result.damageFindings).toBe(0)
    expect(opsOn('cleaning_queue_entries').map((o) => o.payload['problem_state'])).toEqual(['Missing Item', 'Needs Repair'])
  })

  it('refuses a unit that is not in this booking reset queue', async () => {
    db.state.responses['cleaning_queue_entries'] = [
      [{ id: 'cq-1', unit_id: 'unit-1', requires_reset: true, reset_completed_at: null }],
    ]
    await expect(completeReset({ id: 'B-715', unitIds: ['unit-1', 'unit-9'] }, OWNER)).rejects.toThrow(
      /not in B-715's reset queue — unit-9/,
    )
    expect(writes.state.ops).toHaveLength(0)
  })

  it('refuses an item that does not require a reset — CHECK 0003:895 would reject it', async () => {
    db.state.responses['cleaning_queue_entries'] = [
      [{ id: 'cq-1', unit_id: 'unit-1', requires_reset: false, reset_completed_at: null }],
    ]
    await expect(completeReset({ id: 'B-715', unitIds: ['unit-1'] }, OWNER)).rejects.toThrow(
      /do not require a reset/,
    )
    expect(writes.state.ops).toHaveLength(0)
  })

  it('refuses a repeat submit rather than stamping a second completion time', async () => {
    db.state.responses['cleaning_queue_entries'] = [
      [{ id: 'cq-1', unit_id: 'unit-1', requires_reset: true, reset_completed_at: '2026-08-11T00:00:00Z' }],
    ]
    await expect(completeReset({ id: 'B-715', unitIds: ['unit-1'] }, OWNER)).rejects.toThrow(
      /already reset/,
    )
    expect(writes.state.ops).toHaveLength(0)
  })
})

/* ── 9 · The dispatcher wiring ──────────────────────────────────────────── */

describe('the dispatcher — implemented, and gated on a capability that actually resolves', () => {
  function setUpPack(): void {
    db.state.responses['bookings'] = [[bookingAt('Booked')], [bookingAt('Packed')]]
    db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
    db.state.responses['operation_sessions'] = [[]]
    db.state.responses['packing_lines'] = [[], [{ id: 'pl-1', booking_line_id: LINE_A, state: 'Packed' }]]
  }

  it('lets Warehouse perform the floor verbs — canPerformOperations, not a local matrix', async () => {
    setUpPack()
    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] }, { userId: 'w-1', role: 'Warehouse' }),
    ).resolves.toMatchObject({ success: true })
  })

  it('refuses Coordinator — operations.perform does not reach the booking desk', async () => {
    setUpPack()
    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A }] }, { userId: 'c-1', role: 'Coordinator' }),
    ).rejects.toBeInstanceOf(ActionPermissionError)
    expect(writes.state.ops).toHaveLength(0)
  })

  it('refuses every verb called without a session context — no default identity', async () => {
    await expect(packRental({ id: 'B-715' })).rejects.toThrow(/session context/)
    await expect(handoverRental({ bookingId: 'B-715' })).rejects.toThrow(/session context/)
    await expect(completeReturn({ rentalId: 'B-715' })).rejects.toThrow(/session context/)
    await expect(completeReset({ id: 'B-715' })).rejects.toThrow(/session context/)
  })

  it('no verb is still a stub — none throws ActionNotImplementedError', async () => {
    setUpPack()
    // A successful Pack proves the flag for the shape all four share; the other
    // three reach `validate` (asserted above), which a stub never would.
    await expect(
      packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] }, OWNER),
    ).resolves.toMatchObject({ success: true })
  })
})

/* ── 10 · The shape itself ──────────────────────────────────────────────── */

describe('one shape, four verbs', () => {
  it('every session verb writes its own line table and no other', async () => {
    const cases: Array<{ job: Exclude<JobName, 'Reset'>; run: () => Promise<unknown> }> = [
      { job: 'Pack', run: () => packRental({ id: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] }, OWNER) },
      { job: 'Handover', run: () => handoverRental({ bookingId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] }, OWNER) },
      { job: 'Return', run: () => completeReturn({ rentalId: 'B-715', lines: [{ bookingLineId: LINE_A, unitIds: ['u1'] }] }, OWNER) },
    ]

    for (const { job, run } of cases) {
      db.reset()
      writes.reset()
      // resolve (runsAt) → stage read-back (the stage the verb sets)
      db.state.responses['bookings'] = [[bookingAt(JOBS[job].runsAt)], [bookingAt(JOBS[job].sets as string)]]
      db.state.responses['booking_lines'] = [[{ id: LINE_A, qty: 1 }]]
      db.state.responses['operation_sessions'] = [[]]
      db.state.responses[LINE_TABLE[job]] = [
        [],
        [{ id: 'x-1', booking_line_id: LINE_A, state: SATISFIED[job] }],
      ]

      await run()

      const tables = new Set(writes.state.ops.map((o) => o.table))
      expect(tables.has(LINE_TABLE[job])).toBe(true)
      for (const other of Object.values(LINE_TABLE)) {
        if (other !== LINE_TABLE[job]) expect(tables.has(other)).toBe(false)
      }
      /*
       * The cleaning queue is RETURN's to fill, and only Return's.
       *
       * This asserted `false` for all three verbs until 25 Aug 2026, which was
       * right when nothing raised queue rows at all. `floorVerb.ts` §5b then
       * gave Return that job, for a stated reason: `completeResetQueue` has
       * always required a queue row to exist before it will record a reset,
       * nothing created one, so Complete Reset was refused on every real
       * booking and a rental could not be closed. Gear coming back is what puts
       * an item in the queue, so Return is where the row belongs — and the
       * `queued` field on the verb's result documents it as "Return only".
       *
       * So the invariant is not "nobody writes it", it is "only Return does".
       * Kept as a real guard rather than deleted: Pack and Handover raising a
       * queue row would mean gear entering the cleaning queue before it has
       * left the warehouse.
       */
      expect(tables.has('cleaning_queue_entries')).toBe(job === 'Return')
    }
  })
})
