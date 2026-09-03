/**
 * NR-02 (BUG_AUDIT_LIFECYCLE) — the booking write carries what the screen
 * prices. Crew and transport are written AFTER `create_booking`, each row with
 * its own Law 8 key, and a failure there names the Quote that does exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => ({
  reply: { data: {} as unknown, error: null as { message: string; code?: string } | null },
}))

const writes = vi.hoisted(() => ({
  rows: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  failOn: null as string | null,
}))

let uuidSeq = 0
vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: () => Promise.resolve(rpc.reply) },
  newClientUuid: () => `minted-${String(++uuidSeq).padStart(3, '0')}`,
}))
vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    if (writes.failOn === table) throw new Error(`${table}: refused by the fake database`)
    writes.rows.push({ table, payload })
    return { data: null, error: null }
  },
}))

const { createRentalConfig, CreateRentalPartialError } = await import('../createRental')

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
  rpc.reply = { data: { booking_id: 'b-uuid-1', booking_no: 'B-9', stage: 'Quote', line_count: 1, replayed: false }, error: null }
  writes.rows = []
  writes.failOn = null
  uuidSeq = 0
})

describe('createRental — crew and transport ride the write (NR-02)', () => {
  it('writes one booking_crew_lines row per crew member and one booking_transport row, each with its own key', async () => {
    const res = await run({
      crew: [
        { clientUuid: 'crew-key-1', name: 'Arjun Magar', role: 'Gaffer', phone: '+977 98', dayRate: 4000, days: 2 },
        { name: 'Sagar Maharjan', role: 'Sound Recordist', dayRate: 3500, days: 2, meals: 500 },
      ],
      transport: { clientUuid: 'transport-key', deliveryCharge: 1500, fuelCharge: 700 },
    })
    expect(res.result.crewLines).toBe(2)
    expect(res.result.transportWritten).toBe(true)

    const crew = writes.rows.filter((w) => w.table === 'booking_crew_lines')
    expect(crew).toHaveLength(2)
    expect(crew[0]?.payload).toMatchObject({ client_uuid: 'crew-key-1', booking_id: 'b-uuid-1', crew_role: 'Gaffer', day_rate: 4000, days: 2, created_by: 'usr-owner' })
    // A row without a caller key mints its own — never the action's key, which is unique on the header.
    expect(crew[1]?.payload['client_uuid']).toMatch(/^minted-/)
    expect(crew[1]?.payload).toMatchObject({ meals: 500, overtime: 0, accommodation: 0 })

    const transport = writes.rows.filter((w) => w.table === 'booking_transport')
    expect(transport).toHaveLength(1)
    expect(transport[0]?.payload).toMatchObject({ client_uuid: 'transport-key', booking_id: 'b-uuid-1', delivery_charge: 1500, fuel_charge: 700 })
  })

  it('writes nothing extra when neither crew nor transport is given', async () => {
    const res = await run()
    expect(res.result.crewLines).toBe(0)
    expect(res.result.transportWritten).toBe(false)
    expect(writes.rows).toHaveLength(0)
  })

  it('refuses a crew role the crew_role enum does not carry, by name, before any write', async () => {
    await expect(run({ crew: [{ name: 'Bikram Rai', role: 'Director of Photography', dayRate: 8000, days: 2 }] })).rejects.toThrow(
      /"Director of Photography" is not a crew_role the database accepts/,
    )
    expect(writes.rows).toHaveLength(0)
  })

  it('refuses a negative transport charge before any write', async () => {
    await expect(run({ transport: { deliveryCharge: -1, fuelCharge: 0 } })).rejects.toThrow(/non-negative/)
    expect(writes.rows).toHaveLength(0)
  })

  it('names the Quote that exists when a crew row fails after the header landed', async () => {
    writes.failOn = 'booking_crew_lines'
    const err = await run({ crew: [{ name: 'Arjun Magar', role: 'Gaffer', dayRate: 4000, days: 2 }] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CreateRentalPartialError)
    const partial = err as InstanceType<typeof CreateRentalPartialError>
    expect(partial.bookingNo).toBe('B-9')
    expect(partial.bookingId).toBe('b-uuid-1')
    expect(partial.message).toMatch(/Booking B-9 was created as a Quote, but its crew lines \(0 of 1 written\) could not be written/)
  })
})
