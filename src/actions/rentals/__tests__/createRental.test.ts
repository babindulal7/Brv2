import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionPermissionError } from '../../core'

/**
 * # CREATE_RENTAL — what this suite pins
 *
 * Creating a booking is the one write on this project that cannot be assembled
 * from PostgREST calls: `booking_discounts.audit_event_id` is NOT NULL, so each
 * discount needs its `audit_events` row first, and a browser has no transaction
 * to make that atomic. The whole payload therefore goes to one
 * `create_booking(p_payload jsonb)` — implemented twice, in
 * `0063_create_booking_function.sql` and in `lib/mock/client.ts`.
 *
 * So the things that can go wrong here are not "does it write the row" — the
 * function does that — but everything at the seam around it:
 *
 *  1. **The payload shape**, because two backends read it and a silent rename
 *     breaks one of them.
 *  2. **`p_payload` as the named parameter.** Passing the payload directly is
 *     refused by the function with "client_uuid is required", which points at
 *     the wrong thing entirely.
 *  3. **Law 8 per ROW, not per action.** `booking_lines.client_uuid` is unique,
 *     so lines reusing the action's key would collide.
 *  4. **A replay announces nothing.** Emitting RENTAL_CREATED on every retry
 *     makes every subscriber act twice on one booking.
 *  5. **The uuid guards**, because `NewRental.tsx` holds clients as `C-1`.
 */

const rpc = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ name: string; args: Record<string, unknown> | undefined }>,
    /** What the fake `create_booking` returns next. */
    reply: { data: {} as unknown, error: null as { message: string; code?: string } | null },
  }
  function reset(): void {
    state.calls = []
    state.reply = {
      data: { booking_id: 'b-uuid-1', booking_no: 'B-9', stage: 'Quote', line_count: 1, replayed: false },
      error: null,
    }
  }
  return { state, reset }
})

let uuidSeq = 0
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args?: Record<string, unknown>) => {
      rpc.state.calls.push({ name, args })
      return Promise.resolve(rpc.state.reply)
    },
  },
  newClientUuid: () => `minted-${String(++uuidSeq).padStart(3, '0')}`,
}))

const { createRental, createRentalConfig, deliveryTypeFromLabel } = await import('../createRental')

const OWNER = { userId: 'usr-owner', role: 'Owner' as const, isOnline: true }
const CLIENT_ID = '11111111-2222-4333-8444-555555555555'
const BRANCH_ID = '99999999-8888-4777-8666-555555555555'
const PRODUCT_ID = '77777777-6666-4555-8444-333333333333'

function input(over: Record<string, unknown> = {}) {
  return {
    clientUuid: 'action-key',
    clientId: CLIENT_ID,
    branchId: BRANCH_ID,
    project: 'Test',
    pickupAt: '2026-09-10T09:00:00+05:45',
    returnAt: '2026-09-12T18:00:00+05:45',
    deliveryType: 'Client Pickup' as const,
    lines: [{ lineType: 'Equipment' as const, productId: PRODUCT_ID, qty: 2, days: 3, rate: 5000 }],
    ...over,
  }
}

/** Drives the body directly, past the dispatcher's permission gate. */
async function run(over: Record<string, unknown> = {}, ctx = OWNER) {
  const built = input(over)
  await createRentalConfig.validate(built as never)
  return createRentalConfig.execute(built as never, ctx)
}

beforeEach(() => {
  rpc.reset()
  uuidSeq = 0
})

describe('deliveryTypeFromLabel — the Law 17 label crossing into a write', () => {
  /* PLAN.md §6.1: the word "customer" appears nowhere in the UI, so the label
     is "Client Pickup". 0113 renamed the enum member to 'Client Pickup'. */
  it('maps the UI label to the stored enum member', () => {
    expect(deliveryTypeFromLabel('Client Pickup')).toBe('Client Pickup')
    expect(deliveryTypeFromLabel('Customer Pickup')).toBe('Client Pickup')
  })

  it('passes the three labels that already match the enum', () => {
    expect(deliveryTypeFromLabel('Babin Delivery')).toBe('Babin Delivery')
    expect(deliveryTypeFromLabel('Courier')).toBe('Courier')
    expect(deliveryTypeFromLabel('Third Party')).toBe('Third Party')
  })

  it('refuses an unknown label rather than sending it to an enum column', () => {
    expect(() => deliveryTypeFromLabel('Pickup')).toThrow(/not a delivery type/)
  })
})

describe('the RPC call itself', () => {
  it('calls create_booking through the p_payload named parameter', async () => {
    await run()
    expect(rpc.state.calls).toHaveLength(1)
    expect(rpc.state.calls[0]?.name).toBe('create_booking')
    /* Passing the payload directly is refused by the function with
       "client_uuid is required", which names the wrong problem entirely. */
    expect(Object.keys(rpc.state.calls[0]?.args ?? {})).toEqual(['p_payload'])
  })

  it('sends snake_case keys, because the payload is read by SQL on both backends', async () => {
    await run()
    const p = (rpc.state.calls[0]?.args as { p_payload: Record<string, unknown> }).p_payload
    for (const key of ['client_uuid', 'created_by', 'branch_id', 'client_id', 'pickup_at', 'return_at', 'delivery_type']) {
      expect(Object.hasOwn(p, key)).toBe(true)
    }
    expect(p['created_by']).toBe(OWNER.userId)
  })

  it('forwards pre-allocated booking_no when provided (e.g. from draft confirmation)', async () => {
    await run({ bookingNo: '1052' })
    const p = (rpc.state.calls[0]?.args as { p_payload: Record<string, unknown> }).p_payload
    expect(p['booking_no']).toBe('1052')
  })

  it('passes project_type through, defaulting both keys to null', async () => {
    await run()
    const p = (rpc.state.calls[0]?.args as { p_payload: Record<string, unknown> }).p_payload
    expect(p['project_type']).toBeNull()
    expect(p['project_type_other']).toBeNull()
  })

  it('passes a Documentary type and an Other description', async () => {
    await run({ projectType: 'Documentary' })
    const p = (rpc.state.calls[0]?.args as { p_payload: Record<string, unknown> }).p_payload
    expect(p['project_type']).toBe('Documentary')
    await run({ projectType: 'Other', projectTypeOther: 'Live Theatre' })
    const q = (rpc.state.calls[1]?.args as { p_payload: Record<string, unknown> }).p_payload
    expect(q['project_type']).toBe('Other')
    expect(q['project_type_other']).toBe('Live Theatre')
  })

  it('refuses a value outside the allow-list before anything is sent', async () => {
    await expect(run({ projectType: 'doc shoot' })).rejects.toThrow(/Select a project type from the list/)
    expect(rpc.state.calls).toHaveLength(0)
  })

  it('refuses Other without its description, and a description without Other', async () => {
    await expect(run({ projectType: 'Other', projectTypeOther: '' })).rejects.toThrow(/Describe the project type/)
    await expect(run({ projectType: 'Wedding', projectTypeOther: 'Beach' })).rejects.toThrow(/only used with Other/)
    expect(rpc.state.calls).toHaveLength(0)
  })

  it('sends days and qty per line, unaltered — no pricing happens here', async () => {
    await run()
    const p = (rpc.state.calls[0]?.args as { p_payload: { lines: Array<Record<string, unknown>> } }).p_payload
    expect(p.lines[0]).toMatchObject({ qty: 2, days: 3, rate: 5000, line_type: 'Equipment' })
  })

  /* Law 8 is per ROW. `booking_lines.client_uuid` is unique, so two lines
     carrying the action's key would collide on the second insert. */
  it('mints a SEPARATE client_uuid for every line, never reusing the action key', async () => {
    await run({
      lines: [
        { lineType: 'Equipment', productId: PRODUCT_ID, qty: 1, days: 1 },
        { lineType: 'Equipment', productId: PRODUCT_ID, qty: 1, days: 1 },
      ],
    })
    const p = (rpc.state.calls[0]?.args as { p_payload: { client_uuid: string; lines: Array<{ client_uuid: string }> } }).p_payload
    const keys = p.lines.map((l) => l.client_uuid)
    expect(new Set(keys).size).toBe(2)
    expect(keys).not.toContain(p.client_uuid)
  })

  it('numbers sort_order from the array position when the caller does not', async () => {
    await run({
      lines: [
        { lineType: 'Equipment', productId: PRODUCT_ID, qty: 1, days: 1 },
        { lineType: 'Service', qty: 1, days: 1 },
      ],
    })
    const p = (rpc.state.calls[0]?.args as { p_payload: { lines: Array<{ sort_order: number }> } }).p_payload
    expect(p.lines.map((l) => l.sort_order)).toEqual([0, 1])
  })
})

describe('Law 8 — replay', () => {
  it('reports replayed and emits NOTHING, so subscribers do not act twice', async () => {
    rpc.state.reply = {
      data: { booking_id: 'b-uuid-1', booking_no: 'B-9', stage: 'Quote', replayed: true },
      error: null,
    }
    const { result, events } = await run()

    expect(result.replayed).toBe(true)
    expect(result.bookingNo).toBe('B-9')
    expect(events).toEqual([])
  })

  it('reports a zero line count on a replay — it wrote no lines', async () => {
    rpc.state.reply = { data: { booking_id: 'b-1', booking_no: 'B-9', stage: 'Quote', replayed: true }, error: null }
    const { result } = await run()
    /* Echoing the count the caller ASKED for would claim work this call did
       not do. The function reports none because it wrote none. */
    expect(result.lineCount).toBe(0)
  })

  it('emits RENTAL_CREATED exactly once on a real creation', async () => {
    const { events } = await run()
    expect(events).toHaveLength(1)
    expect(events[0]?.payload).toMatchObject({ bookingNo: 'B-9', clientId: CLIENT_ID })
  })

  it('reuses the caller key rather than minting one, so a retry is idempotent', async () => {
    await run({ clientUuid: 'pressed-once' })
    const p = (rpc.state.calls[0]?.args as { p_payload: { client_uuid: string } }).p_payload
    expect(p.client_uuid).toBe('pressed-once')
  })

  it('mints a key when the caller omits one, rather than refusing the write', async () => {
    const built = input()
    delete (built as Record<string, unknown>)['clientUuid']
    await createRentalConfig.validate(built as never)
    await createRentalConfig.execute(built as never, OWNER)
    const p = (rpc.state.calls[0]?.args as { p_payload: { client_uuid: string } }).p_payload
    expect(p.client_uuid).toMatch(/^minted-/)
  })
})

describe('refusals — each names the problem, and nothing is sent', () => {
  const sent = () => rpc.state.calls.length

  /* The one that would have bitten NewRental: its client list is data/clients.ts,
     whose ids are 'C-1'. Sent as client_id it fails the FK deep inside the
     function, three layers from the operator. */
  it('refuses a client CODE where a uuid belongs, and says which is which', async () => {
    await expect(run({ clientId: 'C-1' })).rejects.toThrow(/uuid, not a client code/)
    expect(sent()).toBe(0)
  })

  it('refuses a booking with no lines', async () => {
    await expect(run({ lines: [] })).rejects.toThrow(/at least one line/)
    expect(sent()).toBe(0)
  })

  it('refuses a line with no days — Law 9, never defaulted', async () => {
    await expect(run({ lines: [{ lineType: 'Equipment', productId: PRODUCT_ID, qty: 1 }] })).rejects.toThrow(/Law 9/)
    expect(sent()).toBe(0)
  })

  it('refuses a zero quantity', async () => {
    await expect(run({ lines: [{ lineType: 'Equipment', productId: PRODUCT_ID, qty: 0, days: 1 }] })).rejects.toThrow(
      /at least 1/,
    )
    expect(sent()).toBe(0)
  })

  it('refuses an instant with no offset — it would read as device-local time', async () => {
    await expect(run({ pickupAt: '2026-09-10T09:00:00' })).rejects.toThrow(/Law 7/)
    expect(sent()).toBe(0)
  })

  it('refuses a return that precedes its pickup', async () => {
    await expect(run({ returnAt: '2026-09-01T09:00:00+05:45' })).rejects.toThrow(/before the pickup/)
    expect(sent()).toBe(0)
  })

  it('refuses an empty idempotency key, which is neither present nor omitted', async () => {
    await expect(run({ clientUuid: '  ' })).rejects.toThrow(/neither/)
    expect(sent()).toBe(0)
  })
})

describe('D5 — serials assigned at creation (ruled 30 Aug 2026, spec A0)', () => {
  const UNIT_A = 'aaaaaaaa-1111-4111-8111-111111111111'
  const UNIT_B = 'bbbbbbbb-2222-4222-8222-222222222222'
  const sent = () => rpc.state.calls.length

  it('sends units per line, each unit carrying its OWN Law 8 key', async () => {
    await run({
      lines: [{ lineType: 'Equipment', productId: PRODUCT_ID, qty: 2, days: 3, rate: 5000, units: [UNIT_A, UNIT_B] }],
    })
    const p = (rpc.state.calls[0]?.args as { p_payload: { lines: Array<Record<string, unknown>> } }).p_payload
    const units = p.lines[0]?.['units'] as Array<{ client_uuid: string; asset_id: string }>
    expect(units.map((u) => u.asset_id)).toEqual([UNIT_A, UNIT_B])
    // One minted key per unit ROW — booking_line_units.client_uuid is UNIQUE,
    // so reuse of the line's (or the action's) key would collide.
    const keys = [String(p.lines[0]?.['client_uuid']), ...units.map((u) => u.client_uuid)]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('absent units is the D5 fallback and sends an empty array, not a guess', async () => {
    await run()
    const p = (rpc.state.calls[0]?.args as { p_payload: { lines: Array<Record<string, unknown>> } }).p_payload
    expect(p.lines[0]?.['units']).toEqual([])
  })

  it('refuses more units than qty — trimming would silently pick which serial to drop', async () => {
    await expect(
      run({ lines: [{ lineType: 'Equipment', productId: PRODUCT_ID, qty: 1, days: 3, units: [UNIT_A, UNIT_B] }] }),
    ).rejects.toThrow(/more serials than items/)
    expect(sent()).toBe(0)
  })

  it('refuses a unit that is not a product_units.id uuid', async () => {
    await expect(
      run({ lines: [{ lineType: 'Equipment', productId: PRODUCT_ID, qty: 1, days: 3, units: ['CAM-01'] }] }),
    ).rejects.toThrow(/not a product_units\.id uuid/)
    expect(sent()).toBe(0)
  })

  it('refuses the same physical unit on two lines — one serial covers one item', async () => {
    await expect(
      run({
        lines: [
          { lineType: 'Equipment', productId: PRODUCT_ID, qty: 1, days: 3, units: [UNIT_A] },
          { lineType: 'Equipment', productId: PRODUCT_ID, qty: 1, days: 3, units: [UNIT_A] },
        ],
      }),
    ).rejects.toThrow(/assigned to two lines/)
    expect(sent()).toBe(0)
  })
})

describe('the write is not reported unless the function reports it', () => {
  it('refuses a null answer even though no error was raised', async () => {
    rpc.state.reply = { data: null, error: null }
    await expect(run()).rejects.toThrow(/treat this as NOT created/)
  })

  it('refuses an answer with no booking_no — a shape that is not a booking', async () => {
    rpc.state.reply = { data: { booking_id: 'b-1' }, error: null }
    await expect(run()).rejects.toThrow(/treat this as NOT created/)
  })

  /* 0063 is parked unapplied, so against the live project this is the REAL
     response today. The message has to say why rather than leaking a raw
     Postgres error about a missing function. */
  it('explains a 42883 by naming the parked migration', async () => {
    rpc.state.reply = { data: null, error: { message: 'function create_booking(jsonb) does not exist', code: '42883' } }
    await expect(run()).rejects.toThrow(/parked unapplied/)
  })

  it('refuses to run offline — one RPC cannot be queued and replayed safely', async () => {
    await expect(run({}, { ...OWNER, isOnline: false })).rejects.toThrow(/offline/)
    expect(rpc.state.calls).toHaveLength(0)
  })

  it('populates line_note for Manual item to satisfy booking_lines_manual_item_needs_text', async () => {
    await run({
      lines: [
        {
          lineType: 'Manual item',
          description: 'Custom bracket fabrication',
          qty: 1,
          days: 2,
          rate: 1500,
        },
      ],
    })
    const p = (rpc.state.calls[0]?.args as { p_payload: { lines: Array<{ line_type: string; description: string; line_note: string }> } }).p_payload
    expect(p.lines[0]?.line_type).toBe('Manual item')
    expect(p.lines[0]?.description).toBe('Custom bracket fabrication')
    expect(p.lines[0]?.line_note).toBe('Custom bracket fabrication')
  })

  it('preserves custom lineNote when provided on Manual item', async () => {
    await run({
      lines: [
        {
          lineType: 'Manual item',
          description: 'Emergency replacement',
          lineNote: 'Director specifically requested this replacement',
          qty: 1,
          days: 1,
          rate: 500,
        },
      ],
    })
    const p = (rpc.state.calls[0]?.args as { p_payload: { lines: Array<{ line_type: string; line_note: string }> } }).p_payload
    expect(p.lines[0]?.line_note).toBe('Director specifically requested this replacement')
  })

  it('populates service_basis for Service and supplier_cost for Sub-rental to satisfy DB constraints', async () => {
    await run({
      lines: [
        {
          lineType: 'Service',
          description: 'Gimbal tuning service',
          qty: 1,
          days: 1,
          rate: 2000,
        },
        {
          lineType: 'Sub-rental',
          description: 'Arri Alexa Mini LF (GearHouse)',
          qty: 1,
          days: 3,
          rate: 12000,
        },
      ],
    })
    const p = (rpc.state.calls[0]?.args as { p_payload: { lines: Array<{ line_type: string; service_basis: string; supplier_cost: number }> } }).p_payload
    expect(p.lines[0]?.line_type).toBe('Service')
    expect(p.lines[0]?.service_basis).toBe('Per day')
    expect(p.lines[1]?.line_type).toBe('Sub-rental')
    expect(p.lines[1]?.supplier_cost).toBe(0)
  })
})

describe('the dispatcher gate', () => {
  /* Ruled 16 Aug 2026 (PLAN.md §4.29) by mirroring `bookings_insert`. Until
     that pass `rental.create` resolved to no rule, which the dispatcher reads
     as a denial for EVERY role — this action would have been unreachable the
     moment it got a body. */
  it('admits the booking desk, Coordinator included', async () => {
    await expect(createRental(input() as never, { userId: 'u', role: 'Coordinator' })).resolves.toMatchObject({
      success: true,
    })
  })

  it('denies Technician, whom bookings_insert excludes', async () => {
    await expect(createRental(input() as never, { userId: 'u', role: 'Technician' })).rejects.toBeInstanceOf(
      ActionPermissionError,
    )
  })

  it('denies the external Client role', async () => {
    await expect(createRental(input() as never, { userId: 'u', role: 'Client' })).rejects.toBeInstanceOf(
      ActionPermissionError,
    )
  })

  it('refuses a call with no session — a booking has an author or it is not written', async () => {
    await expect(createRental(input() as never)).rejects.toThrow(/session context/)
    expect(rpc.state.calls).toHaveLength(0)
  })
})
