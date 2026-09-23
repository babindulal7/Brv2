/**
 * `previewInvoiceForBooking` — what `createInvoice` will write, read first.
 *
 * ## Why this suite exists
 *
 * MONEY-01 wired `CreateInvoiceModal` to `createInvoice` and made the modal a
 * read-only preview of the bill about to be raised. A preview is only worth
 * showing if it is the SAME bill, and the two are assembled by two files that
 * must be kept in step by hand (the action cannot import this module yet — see
 * that module's header). Nothing on screen would reveal a drift: the numbers
 * would simply be plausible and different from the invoice the operator then
 * receives.
 *
 * So every assertion below is on a shaping rule copied from
 * `actions/finance/createInvoice.ts`, chosen because getting it wrong produces a
 * WRONG BILL rather than an error:
 *
 *  · crew and transport are billed at all — the two the action itself used to
 *    drop, worth NPR 2,817,300 across 79 bookings on the reference corpus;
 *  · a crew member's overtime/accommodation/meals fold into the unit rate, so
 *    qty × days × rate is their true cost;
 *  · a line's own discount comes off before the booking-level percentage;
 *  · a voided line is not billed (Law 3 keeps the row, it is not billable);
 *  · a transport row with no charge is a logistics record, not a bill line;
 *  · a booking that already has ANY invoice refuses — a voided one included,
 *    which is stricter than SPEC-P0-1 §3.1 and matches the action, whose line
 *    keys would otherwise collide on `invoice_lines_client_uuid_key`.
 *
 * Assertions are on the calls and the shaping, never on a database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const db = vi.hoisted(() => {
  const state = {
    /** Per table: the rows a select on it resolves to. */
    tables: new Map<string, Row[]>(),
    /** Per table: an error to return instead. */
    errors: new Map<string, { message: string }>(),
    /** Every `from()` in order, so a missing read is visible. */
    reads: [] as string[],
    /** Per table, the column list the caller asked for. */
    selects: new Map<string, string>(),
  }

  function reset(): void {
    state.tables = new Map()
    state.errors = new Map()
    state.reads = []
    state.selects = new Map()
  }

  function makeBuilder(table: string) {
    const rowsFor = () => state.tables.get(table) ?? []
    const result = () => ({ data: rowsFor(), error: state.errors.get(table) ?? null })
    const builder = {
      select(columns: string) {
        state.selects.set(table, columns)
        return builder
      },
      eq() {
        return builder
      },
      order() {
        return builder
      },
      maybeSingle() {
        const err = state.errors.get(table)
        if (err) return Promise.resolve({ data: null, error: err })
        return Promise.resolve({ data: rowsFor()[0] ?? null, error: null })
      },
      then(onFulfilled: (value: { data: Row[] | null; error: unknown }) => unknown): void {
        onFulfilled(result())
      },
    }
    return builder
  }

  const supabase = {
    from(table: string) {
      state.reads.push(table)
      return makeBuilder(table)
    },
  }
  return { state, reset, supabase }
})

vi.mock('../../supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

const { previewInvoiceForBooking } = await import('../invoicePreview')

const BOOKING_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
/** A fixed "now" so the due date under test is arithmetic, not the clock. */
const NOW = new Date('2026-09-07T06:00:00Z')

function seedBooking(over: Row = {}): void {
  db.state.tables.set('bookings', [
    {
      id: BOOKING_ID,
      booking_no: 'B-715',
      client_id: CLIENT_ID,
      stage: 'Booked',
      cancelled_at: null,
      clients: { name: 'ABC Films Pvt. Ltd.' },
      ...over,
    },
  ])
  db.state.tables.set('clients_v', [{ id: CLIENT_ID, payment_terms: '15 days' }])
  db.state.tables.set('invoices', [])
  db.state.tables.set('booking_lines_v', [])
  db.state.tables.set('booking_crew_lines_v', [])
  db.state.tables.set('booking_transport_v', [])
  db.state.tables.set('booking_discounts', [])
}

function equipmentLine(over: Row = {}): Row {
  return {
    client_uuid: 'aaaaaaaa-0000-4000-8000-000000000001',
    line_type: 'Equipment',
    description: 'Sony FX9 body',
    qty: 2,
    days: 3,
    rate: 5000,
    discount_amount: 0,
    sort_order: 0,
    voided_at: null,
    ...over,
  }
}

beforeEach(() => {
  db.reset()
})

describe('previewInvoiceForBooking — it bills the booking, not a form', () => {
  it('prices an equipment line as qty × days × rate, less the line’s own discount', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [
      equipmentLine(),
      equipmentLine({
        client_uuid: 'aaaaaaaa-0000-4000-8000-000000000002',
        description: 'Tripod',
        qty: 1,
        rate: 2000,
        discount_amount: 500,
        sort_order: 1,
      }),
    ])

    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    expect(p.kind).toBe('preview')
    if (p.kind !== 'preview') return
    expect(p.lines.map((l) => l.netPaisa)).toEqual([3_000_000, 550_000])
    expect(p.buckets.equipment).toBe(3_550_000)
  })

  it('bills crew and transport, which the invoice write used to drop entirely', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [equipmentLine()])
    db.state.tables.set('booking_crew_lines_v', [
      {
        client_uuid: 'bbbbbbbb-0000-4000-8000-000000000001',
        name: 'Ramesh',
        crew_role: 'Gaffer',
        day_rate: 4000,
        days: 3,
        // Per-ENGAGEMENT totals, not per day — folded into the unit rate so
        // qty × days × rate is the crew member's true cost.
        overtime: 1500,
        accommodation: 0,
        meals: 600,
        voided_at: null,
      },
    ])
    db.state.tables.set('booking_transport_v', [
      {
        client_uuid: 'cccccccc-0000-4000-8000-000000000001',
        vehicle: 'Mini Truck',
        delivery_charge: 3000,
        fuel_charge: 500,
      },
    ])

    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
    // 3 × 4,000 = 12,000 plus 2,100 of extras.
    expect(p.buckets.crew).toBe(1_410_000)
    expect(p.buckets.transport).toBe(350_000)
    expect(p.lines.map((l) => l.kind)).toEqual(['Equipment Rental', 'Crew Charges', 'Transport'])
    expect(p.lines[1]?.description).toBe('Ramesh - Gaffer')
    expect(p.lines[2]?.description).toBe('Transport - Mini Truck')
  })

  it('bills no voided line, and no transport row that carries no charge', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [
      equipmentLine(),
      equipmentLine({
        client_uuid: 'aaaaaaaa-0000-4000-8000-000000000003',
        description: 'Removed light',
        voided_at: '2026-09-01T00:00:00.000Z',
      }),
    ])
    db.state.tables.set('booking_crew_lines_v', [
      {
        client_uuid: 'bbbbbbbb-0000-4000-8000-000000000002',
        name: 'Sita',
        crew_role: 'Grip',
        day_rate: 3000,
        days: 2,
        overtime: 0,
        accommodation: 0,
        meals: 0,
        voided_at: '2026-09-01T00:00:00.000Z',
      },
    ])
    // A client-pickup booking: §2.1 charges Rs 0, and a Rs 0 transport row is a
    // logistics record rather than a line on a client's bill.
    db.state.tables.set('booking_transport_v', [
      { client_uuid: 'cccccccc-0000-4000-8000-000000000002', vehicle: null, delivery_charge: 0, fuel_charge: 0 },
    ])

    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
    expect(p.lines).toHaveLength(1)
    expect(p.buckets.crew).toBe(0)
    expect(p.buckets.transport).toBe(0)
  })

  it('maps every booking_line_type onto the invoice’s own line_kind', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [
      equipmentLine({ client_uuid: 'l1', line_type: 'Bundle', description: 'Doc Kit' }),
      equipmentLine({ client_uuid: 'l2', line_type: 'Accessory', description: 'Batteries' }),
      equipmentLine({ client_uuid: 'l3', line_type: 'Service', description: 'Setup' }),
      equipmentLine({ client_uuid: 'l4', line_type: 'Sub-rental', description: 'Hired jib' }),
      equipmentLine({ client_uuid: 'l5', line_type: 'Manual item', description: 'Ad-hoc' }),
    ])

    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
    expect(p.lines.map((l) => l.kind)).toEqual([
      'Equipment Rental',
      'Equipment Rental',
      'Services',
      'Sub-Rental',
      'Equipment Rental',
    ])
    // The buckets `price()` takes are partitioned by that same value, so a
    // mis-map moves money between buckets rather than losing it — which is why
    // this is asserted on both sides.
    expect(p.buckets.services).toBe(3_000_000)
    expect(p.buckets.subRental).toBe(3_000_000)
    expect(p.buckets.equipment).toBe(9_000_000)
  })

  it('names a line by its type when the booking line carries no description', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [equipmentLine({ description: null })])
    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
    // `invoice_lines.description` is NOT NULL, and the type says what the charge
    // is for without inventing a product name nobody typed.
    expect(p.lines[0]?.description).toBe('Equipment')
  })

  it('takes the due date from the client’s payment terms, in UTC', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [equipmentLine()])
    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
    expect(p.paymentTerms).toBe('15 days')
    expect(p.dueDateAd).toBe('2026-09-22')
  })

  it('falls back to Immediate when the terms cannot be read — due today, not 30 days of credit', async () => {
    seedBooking()
    db.state.tables.set('clients_v', [])
    db.state.tables.set('booking_lines_v', [equipmentLine()])
    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
    expect(p.paymentTerms).toBe('Immediate')
    expect(p.dueDateAd).toBe('2026-09-07')
  })

  it('reads the booking-level discount as a PERCENTAGE (R-17), never an amount', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [equipmentLine()])
    db.state.tables.set('booking_discounts', [{ percent: 10, discount_source: 'Manager' }])
    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
    expect(p.discountPercent).toBe(10)
  })
})

describe('previewInvoiceForBooking — it refuses exactly where createInvoice refuses', () => {
  it('shows the existing invoice rather than offering a second (R-03)', async () => {
    seedBooking()
    db.state.tables.set('invoices', [
      {
        id: '99999999-9999-4999-8999-999999999999',
        invoice_no: null,
        status: 'Draft',
        voided_at: null,
        total_amount: 51867,
        paid_amount: 25000,
        outstanding_amount: 26867,
        due_date: '2026-09-22',
      },
    ])
    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    expect(p.kind).toBe('already-invoiced')
    if (p.kind !== 'already-invoiced') return
    // R-15 — a Draft carries no number at all. `null`, never a placeholder.
    expect(p.existing.invoiceNo).toBeNull()
    expect(p.existing.outstandingPaisa).toBe(2_686_700)
  })

  it('refuses on a VOIDED prior invoice too, which is stricter than the spec and matches the action', async () => {
    seedBooking()
    db.state.tables.set('invoices', [
      {
        id: '99999999-9999-4999-8999-999999999999',
        invoice_no: 'INV-492',
        status: 'Void',
        voided_at: '2026-09-02T00:00:00.000Z',
        total_amount: 1000,
        paid_amount: 0,
        outstanding_amount: 0,
        due_date: '2026-09-22',
      },
    ])
    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    expect(p.kind).toBe('already-invoiced')
    if (p.kind !== 'already-invoiced') return
    expect(p.existing.isVoid).toBe(true)
  })

  it('refuses a cancelled booking and cites the open ruling rather than deciding it', async () => {
    seedBooking({ cancelled_at: '2026-09-01T00:00:00.000Z' })
    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    expect(p.kind).toBe('refused')
    if (p.kind !== 'refused') return
    expect(p.reason).toContain('§4.16')
  })

  it('refuses a booking with no billable lines rather than raising a permanent Rs 0 invoice', async () => {
    seedBooking()
    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    expect(p.kind).toBe('refused')
    if (p.kind !== 'refused') return
    expect(p.reason).toContain('no billable lines')
  })

  it('refuses when the rate is masked — Law 6 is an omission, never a Rs 0 line', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [equipmentLine({ rate: null, discount_amount: null })])
    const p = await previewInvoiceForBooking('B-715', 'Owner', NOW)
    expect(p.kind).toBe('refused')
    if (p.kind !== 'refused') return
    expect(p.reason).toContain('not visible to this account')
  })

  it('says a missing booking is missing, and asks for one when nothing was named', async () => {
    seedBooking()
    db.state.tables.set('bookings', [])
    const missing = await previewInvoiceForBooking('B-999', 'Owner', NOW)
    expect(missing.kind).toBe('refused')
    if (missing.kind === 'refused') expect(missing.reason).toContain('No booking numbered B-999')

    const empty = await previewInvoiceForBooking('   ', 'Owner', NOW)
    expect(empty.kind).toBe('refused')
  })

  it('THROWS on a read failure — a broken query is not "this booking has no lines"', async () => {
    seedBooking()
    db.state.errors.set('booking_lines_v', { message: 'column booking_lines_v.rate does not exist' })
    await expect(previewInvoiceForBooking('B-715', 'Owner', NOW)).rejects.toThrow(
      'column booking_lines_v.rate does not exist',
    )
  })
})

describe('previewInvoiceForBooking — transport is not readable by every role that may invoice', () => {
  /*
   * `booking_transport_v` and `booking_transport_driver_read` both end in
   * `auth_user_role() = any (array['Owner','Admin','Coordinator','Warehouse',
   * 'Driver'])`. R-05 lets Owner · Admin · **Manager** · **Accounts** raise an
   * invoice, and `create_invoice` is SECURITY DEFINER so it bills the transport
   * either way. The two lists disagree, and only the PREVIEW can be wrong about
   * it — which is what `transportKnown` exists to say.
   */
  it('reports transportKnown for a role the policy admits', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [equipmentLine()])
    for (const role of ['Owner', 'Admin', 'Coordinator'] as const) {
      const p = await previewInvoiceForBooking('B-715', role, NOW)
      if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
      expect(p.transportKnown).toBe(true)
    }
  })

  it('reports transportKnown FALSE for Manager and Accounts, whom the policy excludes', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [equipmentLine()])
    for (const role of ['Manager', 'Accounts'] as const) {
      const p = await previewInvoiceForBooking('B-715', role, NOW)
      if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
      // Rs 0 for an UNKNOWN reason, which is why no total built on it may be
      // presented as the invoice total.
      expect(p.transportKnown).toBe(false)
      expect(p.buckets.transport).toBe(0)
    }
  })

  it('takes the cautious answer when no role is known', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [equipmentLine()])
    const p = await previewInvoiceForBooking('B-715', null, NOW)
    if (p.kind !== 'preview') throw new Error(`expected a preview, got ${p.kind}`)
    expect(p.transportKnown).toBe(false)
  })

  it('does not tell a Manager to "add the lines" to a delivery-only booking it cannot see', async () => {
    seedBooking()
    const p = await previewInvoiceForBooking('B-715', 'Manager', NOW)
    expect(p.kind).toBe('refused')
    if (p.kind !== 'refused') return
    // The refusal must not send an operator to fix a booking that is already
    // right. The distinction is the whole point of the branch.
    expect(p.reason).toContain('transport is not readable by your role')
    expect(p.reason).not.toContain('Add the lines to the booking first')
  })
})

describe('previewInvoiceForBooking — it reads what the action reads', () => {
  it('goes to the masked line VIEW and to the crew, transport and discount tables', async () => {
    seedBooking()
    db.state.tables.set('booking_lines_v', [equipmentLine()])
    await previewInvoiceForBooking('B-715', 'Owner', NOW)

    // `booking_lines_v`, not `booking_lines`: Law 6's masking lives in the view
    // and a SCREEN's read goes through it. Crew and transport have no view that
    // both live and mock serve, so those are the base tables the action reads —
    // the same rows for every role that can reach this modal.
    expect(db.state.reads).toContain('booking_lines_v')
    expect(db.state.reads).toContain('booking_crew_lines_v')
    expect(db.state.reads).toContain('booking_transport_v')
    expect(db.state.reads).toContain('booking_discounts')

    /*
     * ⚠ The BASE tables are pinned as never touched, and this is the assertion
     * that matters most in the file. Probed live on 7 Sep: 0062 revoked
     * table-level SELECT on `booking_lines` and `booking_transport` and granted
     * back only the non-money columns, so
     * `has_column_privilege('authenticated','booking_lines','rate','SELECT')` is
     * FALSE for every signed-in session, Owner included. A preview that reached
     * for a base table would not error visibly — it would come back without the
     * money and render a smaller bill.
     */
    expect(db.state.reads).not.toContain('booking_lines')
    expect(db.state.reads).not.toContain('booking_transport')

    // The crew columns are the LIVE ones (`name`, `crew_role`), verified against
    // the project on 7 Sep. The mock corpus writes `crew_name`/`role` instead and
    // so renders every crew line as the fallback "Crew" — a mock defect, not a
    // preview one, and one this assertion is here to stop being "fixed" in the
    // wrong file.
    expect(db.state.selects.get('booking_crew_lines_v')).toContain('crew_role')
    expect(db.state.selects.get('booking_crew_lines_v')).toContain('name')
  })
})
