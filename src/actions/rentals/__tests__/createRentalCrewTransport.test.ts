/**
 * Crew and transport ride the ONE `create_booking` transaction (0132,
 * Audit-01 P1-02 / RULING 2026-09-21).
 *
 * This file used to pin NR-02's half-state: crew and transport written AFTER
 * the RPC, with `CreateRentalPartialError` naming the Quote that existed
 * without them. That class is gone because the state it described is gone —
 * a booking is created whole or not at all. What is pinned now:
 *
 *  1. The payload the RPC receives carries crew and transport rows, each with
 *     its own Law 8 key.
 *  2. The result reports what the transaction reports — never what the caller
 *     asked for on a replay.
 *  3. An RPC failure is a TOTAL failure: no partial booking exists to mop up.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; payload: Record<string, unknown> }>,
  reply: { data: {} as unknown, error: null as { message: string; code?: string } | null },
}))

let uuidSeq = 0
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpc.calls.push({ name, payload: args['p_payload'] as Record<string, unknown> })
      return Promise.resolve(rpc.reply)
    },
  },
  newClientUuid: () => `minted-${String(++uuidSeq).padStart(3, '0')}`,
}))

const { createRentalConfig } = await import('../createRental')

const OWNER = { userId: 'usr-owner', role: 'Owner' as const, isOnline: true }
const CLIENT_ID = '11111111-2222-4333-8444-555555555555'
const BRANCH_ID = '99999999-8888-4777-8666-555555555555'
const PRODUCT_ID = '77777777-6666-4555-8444-333333333333'

function input(over: Record<string, unknown> = {}) {
  return {
    clientUuid: 'action-key',
    clientId: CLIENT_ID,
    branchId: BRANCH_ID,
    pickupAt: '2026-09-10T09:00:00+05:45',
    returnAt: '2026-09-12T18:00:00+05:45',
    deliveryType: 'Babin Delivery' as const,
    lines: [{ lineType: 'Equipment' as const, productId: PRODUCT_ID, qty: 1, days: 2, rate: 5000 }],
    ...over,
  }
}

async function run(over: Record<string, unknown> = {}) {
  const built = input(over)
  await createRentalConfig.validate(built as never)
  return createRentalConfig.execute(built as never, OWNER)
}

beforeEach(() => {
  rpc.calls = []
  rpc.reply = {
    data: {
      booking_id: 'b-uuid-1',
      booking_no: 'B-9',
      stage: 'Quote',
      line_count: 1,
      crew_lines: 0,
      transport_written: false,
      replayed: false,
    },
    error: null,
  }
  uuidSeq = 0
})

describe('createRental — crew and transport ride the one transaction (0132)', () => {
  it('carries every crew row and the transport row in the create_booking payload, each with its own key', async () => {
    rpc.reply = {
      data: {
        booking_id: 'b-uuid-1',
        booking_no: 'B-9',
        stage: 'Quote',
        line_count: 1,
        crew_lines: 2,
        transport_written: true,
        replayed: false,
      },
      error: null,
    }

    const res = await run({
      crew: [
        { clientUuid: 'crew-key-1', name: 'Arjun Magar', role: 'Gaffer', phone: '+977 98', dayRate: 4000, days: 2 },
        { name: 'Sagar Maharjan', role: 'Sound Recordist', dayRate: 3500, days: 2, meals: 500 },
      ],
      transport: { clientUuid: 'transport-key', deliveryCharge: 1500, fuelCharge: 700, vehicle: 'Van 2' },
    })

    expect(res.result.crewLines).toBe(2)
    expect(res.result.transportWritten).toBe(true)

    expect(rpc.calls).toHaveLength(1)
    const payload = rpc.calls[0]!.payload

    const crew = payload['crew'] as Array<Record<string, unknown>>
    expect(crew).toHaveLength(2)
    expect(crew[0]).toMatchObject({
      client_uuid: 'crew-key-1',
      name: 'Arjun Magar',
      crew_role: 'Gaffer',
      day_rate: 4000,
      days: 2,
      overtime: 0,
      accommodation: 0,
      meals: 0,
    })
    // A row without a caller key mints its own — never the action's key.
    expect(crew[1]!['client_uuid']).toMatch(/^minted-/)
    expect(crew[1]).toMatchObject({ name: 'Sagar Maharjan', crew_role: 'Sound Recordist', meals: 500 })

    const transport = payload['transport'] as Record<string, unknown>
    expect(transport).toMatchObject({
      client_uuid: 'transport-key',
      delivery_charge: 1500,
      fuel_charge: 700,
      vehicle: 'Van 2',
      number_plate: null,
    })
  })

  it('sends an empty crew array and a null transport when neither is given', async () => {
    const res = await run()
    expect(res.result.crewLines).toBe(0)
    expect(res.result.transportWritten).toBe(false)

    const payload = rpc.calls[0]!.payload
    expect(payload['crew']).toEqual([])
    expect(payload['transport']).toBeNull()
  })

  it('reports a replay as writing nothing on any axis', async () => {
    rpc.reply = {
      data: { booking_id: 'b-uuid-1', booking_no: 'B-9', stage: 'Quote', replayed: true },
      error: null,
    }

    const res = await run({
      crew: [{ name: 'Arjun Magar', role: 'Gaffer', dayRate: 4000, days: 2 }],
      transport: { deliveryCharge: 1500, fuelCharge: 700 },
    })

    expect(res.result.replayed).toBe(true)
    expect(res.result.crewLines).toBe(0)
    expect(res.result.transportWritten).toBe(false)
  })

  it('an RPC failure is a TOTAL failure — no partial booking exists to name', async () => {
    rpc.reply = { data: null, error: { message: 'boom: the database said no', code: 'P0001' } }

    await expect(
      run({ crew: [{ name: 'Arjun Magar', role: 'Gaffer', dayRate: 4000, days: 2 }] }),
    ).rejects.toThrow(/The booking was not created: boom: the database said no/)

    // Nothing beyond the one refused call is reachable — there is no follow-up
    // write path left for crew or transport to half-land on.
    expect(rpc.calls).toHaveLength(1)
  })

  it('refuses a crew role the crew_role enum does not carry, by name, before any call', async () => {
    await expect(
      run({ crew: [{ name: 'Bikram Rai', role: 'Director of Photography', dayRate: 8000, days: 2 }] }),
    ).rejects.toThrow(/"Director of Photography" is not a crew_role the database accepts/)
    expect(rpc.calls).toHaveLength(0)
  })

  it('refuses a negative transport charge before any call', async () => {
    await expect(run({ transport: { deliveryCharge: -1, fuelCharge: 0 } })).rejects.toThrow(/non-negative/)
    expect(rpc.calls).toHaveLength(0)
  })
})
