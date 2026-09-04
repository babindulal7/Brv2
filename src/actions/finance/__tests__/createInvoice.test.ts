/**
 * CREATE_INVOICE — what actually reaches the bill.
 *
 * These assertions exist because the failure they pin is **invisible**: an
 * invoice that omits the crew is a well-formed invoice. It renders, it totals,
 * it can be issued and paid. Nothing on screen says a third of the job is
 * missing — only a test comparing the bill against the booking can tell.
 *
 * The defect they were written for: `createInvoice` read `booking_lines` alone.
 * Crew charges live in `booking_crew_lines` and transport in `booking_transport`,
 * so both were dropped from every invoice this application has ever created.
 * Measured on the reference corpus: 120 crew lines worth NPR 2,817,300 across 79
 * bookings, none of which could reach an invoice.
 *
 * The second defect: `LINE_KIND_BY_TYPE` was keyed on `Crew` and `Transport`,
 * which are not members of `booking_line_type`, while `Bundle`, `Accessory` and
 * `Manual item` — which are — had no entry and fell through a silent fallback.
 *
 * The mocked boundaries are `lib/dataAccess` (the writes) and `lib/supabase`
 * (every read), matching `recordPayment.test.ts`. None of the action's own logic
 * is stubbed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const access = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  insertResult: { data: {} as unknown, error: null as unknown },
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    access.inserts.push({ table, payload })
    return access.insertResult
  },
  safeUpdate: async () => {
    throw new Error('createInvoice must not update anything on the happy path')
  },
}))

const db = vi.hoisted(() => {
  /** Per-table rows. A builder resolves to whatever its table was given. */
  const state = {
    rows: {} as Record<string, unknown>,
    tablesRead: [] as string[],
  }

  const makeBuilder = (table: string) => {
    const result = () => {
      const r = state.rows[table]
      return { data: r === undefined ? null : r, error: null }
    }
    const builder: Record<string, unknown> = {}
    builder['select'] = () => builder
    builder['eq'] = () => builder
    builder['order'] = () => builder
    builder['limit'] = () => builder
    builder['maybeSingle'] = async () => result()
    builder['single'] = async () => result()
    // A bare `await` on the builder (no maybeSingle) — used for the list reads.
    builder['then'] = (resolve: (v: unknown) => unknown) => resolve(result())
    return builder
  }

  return {
    state,
    supabase: {
      from: (table: string) => {
        state.tablesRead.push(table)
        return makeBuilder(table)
      },
      rpc: async () => ({ data: 'INV-121', error: null }),
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-00000000000f',
}))

const { createInvoice } = await import('../createInvoice')

const CTX = { userId: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'Owner' as const, isOnline: true }

const BOOKING = {
  id: '22222222-2222-4222-8222-222222222222',
  booking_no: '880',
  client_id: '33333333-3333-4333-8333-333333333333',
  branch_id: '44444444-4444-4444-8444-444444444444',
  stage: 'Returned',
  cancelled_at: null,
}

/** One of every `booking_line_type` member, so no mapping can hide. */
const EQUIPMENT_LINES = [
  { id: 'l1', client_uuid: 'u1', line_type: 'Equipment', description: 'RED Komodo', qty: 1, days: 3, rate: 5000, discount_amount: 0, sort_order: 0, voided_at: null },
  { id: 'l2', client_uuid: 'u2', line_type: 'Bundle', description: 'Lighting kit', qty: 1, days: 3, rate: 2000, discount_amount: 0, sort_order: 1, voided_at: null },
  { id: 'l3', client_uuid: 'u3', line_type: 'Accessory', description: 'V-mount', qty: 2, days: 3, rate: 300, discount_amount: 0, sort_order: 2, voided_at: null },
  { id: 'l4', client_uuid: 'u4', line_type: 'Service', description: 'Cleaning', qty: 1, days: 1, rate: 1500, discount_amount: 0, sort_order: 3, voided_at: null },
  { id: 'l5', client_uuid: 'u5', line_type: 'Sub-rental', description: 'Cross-hired dolly', qty: 1, days: 2, rate: 4000, discount_amount: 0, sort_order: 4, voided_at: null },
  { id: 'l6', client_uuid: 'u6', line_type: 'Manual item', description: 'Gaffer tape', qty: 4, days: 1, rate: 250, discount_amount: 0, sort_order: 5, voided_at: null },
  // Law 3 keeps the row; a voided line is not billable.
  { id: 'l7', client_uuid: 'u7', line_type: 'Equipment', description: 'Cancelled body', qty: 1, days: 3, rate: 9000, discount_amount: 0, sort_order: 6, voided_at: '2026-09-01T00:00:00Z' },
]

const CREW_LINES = [
  { client_uuid: 'c1', name: 'Suman Rai', crew_role: 'Gaffer', day_rate: 8000, days: 3, overtime: 2000, accommodation: 1500, meals: 500, voided_at: null },
  { client_uuid: 'c2', name: 'Nisha Maharjan', crew_role: 'AC', day_rate: 6000, days: 3, overtime: null, accommodation: null, meals: null, voided_at: null },
  { client_uuid: 'c3', name: 'Voided crew', crew_role: 'Grip', day_rate: 5000, days: 2, overtime: 0, accommodation: 0, meals: 0, voided_at: '2026-09-01T00:00:00Z' },
]

const TRANSPORT = [
  { client_uuid: 't1', vehicle: 'Bolero BA-2-KHA-1234', delivery_charge: 3000, fuel_charge: 1200 },
  // A logistics record with no charge is not a bill line.
  { client_uuid: 't2', vehicle: 'Client collected', delivery_charge: 0, fuel_charge: 0 },
]

const linesWritten = () =>
  access.inserts.filter((i) => i.table === 'invoice_lines').map((i) => i.payload)

beforeEach(() => {
  access.inserts.length = 0
  access.insertResult = { data: { id: '99999999-9999-4999-8999-999999999999', invoice_no: null }, error: null }
  db.state.tablesRead.length = 0
  db.state.rows = {
    bookings: BOOKING,
    clients: { id: BOOKING.client_id, payment_terms: 7 },
    invoices: [],
    booking_lines: EQUIPMENT_LINES,
    booking_crew_lines: CREW_LINES,
    booking_transport: TRANSPORT,
    booking_discounts: null,
  }
})

describe('createInvoice — the whole job reaches the bill', () => {
  it('READS the crew and transport tables at all — the P0 was that it never did', async () => {
    await createInvoice({ bookingNo: '880', vatPercent: 13, clientUuid: 'k1' }, CTX).catch(() => undefined)
    expect(db.state.tablesRead).toContain('booking_crew_lines')
    expect(db.state.tablesRead).toContain('booking_transport')
  })

  it('bills every crew member, at Crew Charges', async () => {
    await createInvoice({ bookingNo: '880', vatPercent: 13, clientUuid: 'k2' }, CTX).catch(() => undefined)
    const crew = linesWritten().filter((l) => l['line_kind'] === 'Crew Charges')
    // Two live crew rows; the voided one is not billable.
    expect(crew).toHaveLength(2)
    expect(crew.map((l) => l['description'])).toEqual(['Suman Rai - Gaffer', 'Nisha Maharjan - AC'])
  })

  it("a crew member's line total is their true cost, extras included", async () => {
    await createInvoice({ bookingNo: '880', vatPercent: 13, clientUuid: 'k3' }, CTX).catch(() => undefined)
    const gaffer = linesWritten().find((l) => l['description'] === 'Suman Rai - Gaffer')
    // 8000 x 3 days + 2000 overtime + 1500 accommodation + 500 meals = 28 000.
    expect(Number(gaffer?.['quantity']) * Number(gaffer?.['days']) * Number(gaffer?.['unit_rate'])).toBeCloseTo(28_000, 6)
    expect(Number(gaffer?.['line_total'])).toBeCloseTo(28_000, 6)
  })

  it('bills transport that carries a charge, and skips the one that does not', async () => {
    await createInvoice({ bookingNo: '880', vatPercent: 13, clientUuid: 'k4' }, CTX).catch(() => undefined)
    const transport = linesWritten().filter((l) => l['line_kind'] === 'Transport')
    expect(transport).toHaveLength(1)
    expect(Number(transport[0]?.['line_total'])).toBe(4200) // 3000 delivery + 1200 fuel
  })

  it('maps every booking_line_type member explicitly — nothing falls through', async () => {
    await createInvoice({ bookingNo: '880', vatPercent: 13, clientUuid: 'k5' }, CTX).catch(() => undefined)
    const byDescription = Object.fromEntries(linesWritten().map((l) => [l['description'], l['line_kind']]))
    expect(byDescription['RED Komodo']).toBe('Equipment Rental')
    expect(byDescription['Lighting kit']).toBe('Equipment Rental')
    expect(byDescription['V-mount']).toBe('Equipment Rental')
    expect(byDescription['Cleaning']).toBe('Services')
    expect(byDescription['Cross-hired dolly']).toBe('Sub-Rental')
    expect(byDescription['Gaffer tape']).toBe('Equipment Rental')
    // Law 3 — the voided line is kept in the table and kept off the bill.
    expect(byDescription['Cancelled body']).toBeUndefined()
  })

  it('bills the whole job: six live equipment lines, two crew, one transport', async () => {
    await createInvoice({ bookingNo: '880', vatPercent: 13, clientUuid: 'k6' }, CTX).catch(() => undefined)
    expect(linesWritten()).toHaveLength(9)
    /*
     * The number that matters.
     *
     *   equipment  15 000 + 6 000 + 1 800 + 1 500 + 8 000 + 1 000 = 33 300
     *   crew       28 000 (gaffer, extras included) + 18 000 (AC)  = 46 000
     *   transport  3 000 delivery + 1 200 fuel                     =  4 200
     *                                                                ------
     *                                                                83 500
     *
     * Before the fix this booking billed 33 300 — equipment alone — against
     * 83 500 owed. A 60% under-bill, on an invoice that looked entirely normal.
     */
    const total = linesWritten().reduce((sum, l) => sum + Number(l['line_total']), 0)
    expect(total).toBeCloseTo(83_500, 6)

    // And the half that used to be missing is the majority of the bill.
    const nonEquipment = linesWritten()
      .filter((l) => l['line_kind'] === 'Crew Charges' || l['line_kind'] === 'Transport')
      .reduce((sum, l) => sum + Number(l['line_total']), 0)
    expect(nonEquipment).toBeCloseTo(50_200, 6)
  })
})
