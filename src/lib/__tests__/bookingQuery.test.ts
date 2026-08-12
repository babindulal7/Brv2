import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchCanonicalBooking,
  priceCanonicalBooking,
  type CanonicalBooking,
  type RawBooking,
  type RawDiscount,
  type RawLine,
  type SuppliedPriceInputs,
} from '../bookingQuery'
import { DISCOUNT_CAP, rupees, toRupees } from '../money'
import { BOOKING_STATUS } from '../workflow'

/**
 * # What this suite pins
 *
 * `bookingQuery.ts` is the Single Query Rule's detail query. The version this
 * replaced read six columns that do not exist on `booking_lines` and three that
 * do not exist on `bookings`, and none of that was visible anywhere except in
 * the SELECT string. So the two things pinned hardest here are:
 *
 *  (a) **the literal select string** — a wrong column name is not an error the
 *      type system can see; it is text handed to PostgREST, and the only place
 *      it is still text is the argument this suite records; and
 *  (b) **the mapper**, where a raw snake_case row becomes the view model, a
 *      masked NULL must stay `null`, and a bundle parent/child pair must sum
 *      exactly once.
 *
 * The `supabase` module is replaced wholesale, the same way
 * `queries/__tests__/bookings.test.ts` does it. Nothing here reaches a database.
 */

const db = vi.hoisted(() => {
  interface State {
    table: string
    /** The literal string handed to `.select()` — the thing a dropped column disappears from. */
    columns: string
    /** Every filter call, in order. */
    calls: Array<[string, ...unknown[]]>
    row: unknown
    error: { message: string } | null
  }

  const state: State = { table: '', columns: '', calls: [], row: null, error: null }

  function reset(): void {
    state.table = ''
    state.columns = ''
    state.calls = []
    state.row = null
    state.error = null
  }

  const builder = {
    select(columns: string) {
      state.columns = columns
      return builder
    },
    is(column: string, value: unknown) {
      state.calls.push(['is', column, value])
      return builder
    },
    eq(column: string, value: unknown) {
      state.calls.push(['eq', column, value])
      return builder
    },
    maybeSingle() {
      return Promise.resolve({ data: state.row, error: state.error })
    },
  }

  const supabase = {
    from(table: string) {
      state.table = table
      return builder
    },
  }

  return { state, reset, supabase }
})

vi.mock('../supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

beforeEach(() => {
  db.reset()
})

/** Top-level tokens of the select string. Embeds keep their own commas, which is fine — none of them is a bare column name. */
function selectTokens(): string[] {
  return db.state.columns.split(',').map((t) => t.trim())
}

function occurrences(column: string): number {
  return selectTokens().filter((t) => t === column).length
}

const BOOKING_ID = '8f1d1a56-0b6a-4f0e-9d3c-2f4b6c7a9e11'

const CLIENT = {
  id: 'c0ffee00-1111-4222-8333-444455556666',
  client_code: 'CL-2026-0034',
  name: 'Himalaya Films',
  phone: '+9779812345678',
  email: 'ops@himalaya.example',
  pan_vat: '623587106',
  type_parent: 'Organisation' as const,
  status: 'Active' as const,
}

/** One live Equipment line: 2 units × Rs 5,000 × 3 days − Rs 1,000 discount. */
const LINE_EQUIPMENT: RawLine = {
  id: 'line-equip',
  line_type: 'Equipment',
  parent_line_id: null,
  description: 'Alexa Mini',
  qty: 2,
  days: 3,
  rate: 5000,
  discount_amount: 1000,
  is_included: false,
  service_basis: null,
  sort_order: 1,
  voided_at: null,
  booking_line_units: [
    { id: 'u1', qty: 1, unit_state: 'Ready', is_required: true, packed: true, damaged: false },
    { id: 'u2', qty: 1, unit_state: 'Damaged', is_required: true, packed: true, damaged: true },
  ],
}

function rawBooking(over: Partial<RawBooking> = {}): RawBooking {
  return {
    id: BOOKING_ID,
    booking_no: 'BK-2026-0715',
    client_id: CLIENT.id,
    project: 'FX3 Documentary',
    stage: 'Booked',
    pickup_at: '2026-08-14T04:15:00+00:00',
    return_at: '2026-08-18T10:30:00+00:00',
    actual_return_at: null,
    delivery_type: 'Customer Pickup',
    pickup_location: 'Thamel warehouse',
    return_location: 'Lalitpur yard',
    quote_expires_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    closed_at: null,
    version: 4,
    created_at: '2026-07-12T09:41:00+00:00',
    clients: CLIENT,
    booking_lines_v: [LINE_EQUIPMENT],
    ...over,
  }
}

async function fetchOne(
  raw: RawBooking,
  opts?: Parameters<typeof fetchCanonicalBooking>[1],
): Promise<CanonicalBooking> {
  db.state.row = raw
  const booking = await fetchCanonicalBooking(BOOKING_ID, opts)
  if (!booking) throw new Error('expected a booking')
  return booking
}

/* ── The select string ───────────────────────────────────────────────────── */

describe('the SELECT string', () => {
  it('reads the bookings table', async () => {
    await fetchOne(rawBooking())
    expect(db.state.table).toBe('bookings')
  })

  it('reads line money through booking_lines_v and NEVER the base table', async () => {
    // 0019:153 revokes select(rate, discount_amount, supplier_cost, markup_amount)
    // on booking_lines from `authenticated`. Naming the base table here is not a
    // style slip — it is a hard permission error for every session including Owner.
    await fetchOne(rawBooking())
    expect(db.state.columns).toContain('booking_lines_v (')
    expect(db.state.columns).not.toContain('booking_lines (')
  })

  it('names every booking_lines column by its real name', async () => {
    await fetchOne(rawBooking())
    for (const column of [
      'line_type',
      'parent_line_id',
      'description',
      'days',
      'rate',
      'discount_amount',
      'is_included',
      'service_basis',
      'sort_order',
      'voided_at',
    ]) {
      expect(occurrences(column)).toBe(1)
    }
    // `qty` is legitimately named twice — once on the line, once on the unit.
    expect(occurrences('qty')).toBe(2)
  })

  it('names none of the six columns the old version invented on booking_lines', async () => {
    // Left column of the table in the module header. Not one of these exists.
    await fetchOne(rawBooking())
    for (const ghost of ['line_kind', 'quantity', 'daily_rate', 'discount_percent', 'line_total', 'item_state']) {
      expect(db.state.columns).not.toContain(ghost)
    }
  })

  it('names none of the columns the old version invented on bookings', async () => {
    await fetchOne(rawBooking())
    for (const ghost of [
      'delivery_method',
      'pickup_datetime',
      'return_datetime',
      'project_title',
      'shoot_type',
      'stage_number',
    ]) {
      expect(db.state.columns).not.toContain(ghost)
    }
    // The real names, once each.
    for (const column of ['delivery_type', 'pickup_at', 'return_at', 'actual_return_at', 'project', 'version']) {
      expect(occurrences(column)).toBe(1)
    }
  })

  it('asks for item state from booking_line_units, not from the line', async () => {
    // A line has no state column. State is per physical unit (0002:229).
    await fetchOne(rawBooking())
    expect(db.state.columns).toContain('booking_line_units ( id, qty, unit_state, is_required, packed, damaged )')
  })

  it('names the client columns that exist, and none that do not', async () => {
    await fetchOne(rawBooking())
    expect(db.state.columns).toContain('clients ( id, client_code, name, phone, email, pan_vat, type_parent, status )')
    for (const ghost of ['client_no', 'full_name', 'company_name', 'mobile', 'pan_vat_no', 'is_vip', 'credit_limit']) {
      expect(db.state.columns).not.toContain(ghost)
    }
  })

  it('does NOT name deposit_required unless the caller opted in', async () => {
    // Law 6. `deposit_required` is unmasked on the base table and
    // `bookings_select` is auth_is_staff(), which includes the money-blind
    // floor roles — the default select is the only thing standing between a
    // Warehouse session and a rupee figure.
    await fetchOne(rawBooking())
    expect(db.state.columns).not.toContain('deposit_required')

    db.reset()
    await fetchOne(rawBooking({ deposit_required: 25000 }), { withDeposit: true })
    expect(occurrences('deposit_required')).toBe(1)
  })

  it('does NOT embed booking_discounts unless the caller opted in', async () => {
    await fetchOne(rawBooking())
    expect(db.state.columns).not.toContain('booking_discounts')

    db.reset()
    await fetchOne(rawBooking({ booking_discounts: [] }), { withDiscounts: true })
    expect(db.state.columns).toContain('booking_discounts (')
  })
})

/* ── The live-lines filter and the lookup key ────────────────────────────── */

describe('filters', () => {
  it('excludes voided lines — Law 3, nothing is deleted', async () => {
    await fetchOne(rawBooking())
    expect(db.state.calls).toContainEqual(['is', 'booking_lines_v.voided_at', null])
  })

  it('looks up by id when given a uuid', async () => {
    await fetchOne(rawBooking())
    expect(db.state.calls).toEqual([
      ['is', 'booking_lines_v.voided_at', null],
      ['eq', 'id', BOOKING_ID],
    ])
  })

  it('looks up by booking_no when given a BK- reference', async () => {
    db.state.row = rawBooking()
    await fetchCanonicalBooking('BK-2026-0715')
    expect(db.state.calls).toContainEqual(['eq', 'booking_no', 'BK-2026-0715'])
    expect(db.state.calls.map((c) => c[1])).not.toContain('id')
  })
})

/* ── The mapper ──────────────────────────────────────────────────────────── */

describe('booking header → CanonicalBooking', () => {
  it('maps the real columns onto the view model', async () => {
    const b = await fetchOne(rawBooking())
    expect(b).toMatchObject({
      id: BOOKING_ID,
      bookingNo: 'BK-2026-0715',
      stage: 'Booked',
      stageNumber: BOOKING_STATUS.Booked.order + 1,
      project: 'FX3 Documentary',
      pickupAtAd: '2026-08-14T04:15:00+00:00',
      returnAtAd: '2026-08-18T10:30:00+00:00',
      actualReturnAtAd: null,
      deliveryType: 'Customer Pickup',
      pickupLocation: 'Thamel warehouse',
      returnLocation: 'Lalitpur yard',
      version: 4,
      isCancelled: false,
      isClosed: false,
    })
  })

  it('leaves depositRequired null when it was not requested — "not asked", not "no deposit"', async () => {
    const b = await fetchOne(rawBooking())
    expect(b.depositRequired).toBeNull()
  })

  it('converts deposit rupees to paisa when it was requested', async () => {
    const b = await fetchOne(rawBooking({ deposit_required: 25000 }), { withDeposit: true })
    expect(b.depositRequired).toBe(rupees(25000))
    // Rupees → paisa, ×100. The other direction would render it 100x too small.
    expect(b.depositRequired).toBe(2_500_000)
  })

  it('maps the client onto its real column names and invents no type_parent', async () => {
    const b = await fetchOne(rawBooking({ clients: { ...CLIENT, type_parent: null, email: null } }))
    expect(b.client).toEqual({
      id: CLIENT.id,
      clientCode: 'CL-2026-0034',
      name: 'Himalaya Films',
      phone: '+9779812345678',
      email: null,
      panVat: '623587106',
      // Nullable in the schema. The old version defaulted it to 'Individual',
      // which changes the identity-document, VAT, deposit and credit rules.
      typeParent: null,
      status: 'Active',
    })
  })

  it('throws rather than rendering a booking with no client', async () => {
    db.state.row = rawBooking({ clients: null })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/no client embed/)
  })

  it('surfaces a query error instead of reporting the booking as missing', async () => {
    // The old version returned null for `error || !booking`, so "permission
    // denied" and "column does not exist" both rendered as Not Found.
    db.state.error = { message: 'column booking_lines.line_kind does not exist' }
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/fetchCanonicalBooking failed/)
  })

  it('returns null only when the booking genuinely does not exist', async () => {
    db.state.row = null
    await expect(fetchCanonicalBooking(BOOKING_ID)).resolves.toBeNull()
  })
})

/* ── Line arithmetic ─────────────────────────────────────────────────────── */

describe('line totals — qty × rate × days − discount_amount', () => {
  it('computes the schema constraint formula, in paisa', async () => {
    const b = await fetchOne(rawBooking())
    const line = b.lines[0]!
    expect(line.qty).toBe(2)
    expect(line.days).toBe(3)
    expect(line.rate).toBe(rupees(5000))
    // discount_amount is an AMOUNT, not a percent.
    expect(line.discountAmount).toBe(rupees(1000))
    // 2 × 5,000 × 3 = 30,000 − 1,000 = 29,000
    expect(line.netTotal).toBe(rupees(29000))
    expect(toRupees(line.netTotal!)).toBe(29000)
  })

  it('sums a bundle parent and its children exactly once', async () => {
    // 0002:172 — a bundle child prices at 0 by CHECK; the Bundle line carries
    // the rate. So summing every live line cannot double-count the bundle.
    const parent: RawLine = {
      ...LINE_EQUIPMENT,
      id: 'bundle-parent',
      line_type: 'Bundle',
      description: 'Doc Kit',
      qty: 1,
      days: 2,
      rate: 10000,
      discount_amount: 0,
      sort_order: 1,
      booking_line_units: [],
    }
    const child: RawLine = {
      ...LINE_EQUIPMENT,
      id: 'bundle-child',
      line_type: 'Equipment',
      parent_line_id: 'bundle-parent',
      description: 'Alexa Mini (in kit)',
      qty: 3,
      days: 2,
      rate: 0,
      discount_amount: 0,
      sort_order: 2,
      booking_line_units: [],
    }

    const b = await fetchOne(rawBooking({ booking_lines_v: [parent, child] }))
    const [p, c] = b.lines
    expect(p!.isBundleChild).toBe(false)
    expect(c!.isBundleChild).toBe(true)
    expect(p!.netTotal).toBe(rupees(20000)) // 1 × 10,000 × 2
    expect(c!.netTotal).toBe(rupees(0))
    // Rs 20,000 once — not Rs 20,000 + the children's notional value.
    expect(b.engineInput.linesSubtotal).toBe(rupees(20000))
    expect(b.engineInput.equipment).toBe(rupees(20000))
  })

  it('buckets line types by the enum that exists, not the invoice one', async () => {
    const sub: RawLine = { ...LINE_EQUIPMENT, id: 'sub', line_type: 'Sub-rental', qty: 1, days: 1, rate: 4000, discount_amount: 0, sort_order: 2 }
    const svc: RawLine = { ...LINE_EQUIPMENT, id: 'svc', line_type: 'Service', service_basis: 'Flat', qty: 1, days: 1, rate: 2500, discount_amount: 0, sort_order: 3 }

    const b = await fetchOne(rawBooking({ booking_lines_v: [LINE_EQUIPMENT, sub, svc] }))
    // The old version compared against 'Equipment Rental' / 'Sub-Rental' /
    // 'Services' — members of `line_kind`, which shares no value with
    // `booking_line_type`. Every branch was unreachable and every bucket was 0.
    expect(b.engineInput.equipment).toBe(rupees(29000))
    expect(b.engineInput.subRental).toBe(rupees(4000))
    expect(b.engineInput.services).toBe(rupees(2500))
    expect(b.engineInput.linesSubtotal).toBe(rupees(35500))
  })

  it('sorts lines by sort_order', async () => {
    const second: RawLine = { ...LINE_EQUIPMENT, id: 'b', sort_order: 5 }
    const first: RawLine = { ...LINE_EQUIPMENT, id: 'a', sort_order: 0 }
    const b = await fetchOne(rawBooking({ booking_lines_v: [second, first] }))
    expect(b.lines.map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('refuses a line missing a NOT NULL operational column rather than defaulting it', async () => {
    // Defaulting qty to 1 or days to 1 turns a query defect into a wrong price.
    db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, qty: null }] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/missing id, line_type, qty or days/)
  })
})

/* ── Law 6 · a masked NULL is never a zero ───────────────────────────────── */

describe('money-blind roles — masked columns arrive NULL', () => {
  /** What `booking_lines_v` returns to Warehouse / Technician / Driver / Client. */
  const MASKED: RawLine = { ...LINE_EQUIPMENT, rate: null, discount_amount: null }

  it('keeps a masked rate and discount as null, never 0', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [MASKED] }))
    const line = b.lines[0]!
    expect(line.rate).toBeNull()
    expect(line.discountAmount).toBeNull()
    expect(line.rate).not.toBe(0)
    expect(line.discountAmount).not.toBe(0)
  })

  it('does not compute a line total from a masked rate', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [MASKED] }))
    expect(b.lines[0]!.netTotal).toBeNull()
  })

  it('propagates unknown to every bucket instead of summing the visible half', async () => {
    // One visible line plus one masked line must NOT produce a subtotal of just
    // the visible one — that is the most convincing wrong number here: right
    // order of magnitude, self-consistent, short by whatever was hidden.
    const b = await fetchOne(rawBooking({ booking_lines_v: [LINE_EQUIPMENT, MASKED] }))
    expect(b.engineInput.equipment).toBeNull()
    expect(b.engineInput.linesSubtotal).toBeNull()
  })

  it('still reports the operational half of a masked line', async () => {
    // Law 6 hides money, not work. Warehouse must still see what to pack.
    const b = await fetchOne(rawBooking({ booking_lines_v: [MASKED] }))
    const line = b.lines[0]!
    expect(line.qty).toBe(2)
    expect(line.days).toBe(3)
    expect(line.units.committedQty).toBe(2)
  })
})

/* ── Item state · counts, not a winner ───────────────────────────────────── */

describe('unit states', () => {
  const units = [
    { id: 'u1', qty: 3, unit_state: 'Ready' as const, is_required: true, packed: true, damaged: false },
    { id: 'u2', qty: 1, unit_state: 'Damaged' as const, is_required: true, packed: true, damaged: true },
  ]

  it('reports 3 Ready + 1 Damaged as counts, losing neither', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: units }] }))
    const s = b.lines[0]!.units
    expect(s.byState).toEqual({ Ready: 3, 'Picked Up': 0, Returned: 0, Missing: 0, Damaged: 1 })
    expect(s.committedQty).toBe(4)
    expect(s.damagedQty).toBe(1)
  })

  it('counts units, not unit rows — one non-serialised row can be 12 units', async () => {
    const b = await fetchOne(
      rawBooking({
        booking_lines_v: [
          {
            ...LINE_EQUIPMENT,
            booking_line_units: [
              { id: 'bulk', qty: 12, unit_state: 'Ready', is_required: true, packed: false, damaged: false },
            ],
          },
        ],
      }),
    )
    expect(b.lines[0]!.units.committedQty).toBe(12)
    expect(b.units.committedQty).toBe(12)
  })

  it('treats zero committed units as a real state, not an error', async () => {
    // A Quote has no serials assigned yet.
    const b = await fetchOne(rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: [] }] }))
    expect(b.lines[0]!.units.committedQty).toBe(0)
    expect(b.gates.requiredUnitsPacked).toBe(true)
  })

  it('derives the gates the schema actually defines', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: units }] }))
    expect(b.gates.requiredUnitsPacked).toBe(true)
    expect(b.gates.hasDamagedUnit).toBe(true)
    expect(b.gates.hasMissingUnit).toBe(false)
    expect(b.gates.itemsWithClient).toBe(false)
  })

  it('fails the packing gate while a required unit is neither packed nor Missing', async () => {
    const b = await fetchOne(
      rawBooking({
        booking_lines_v: [
          {
            ...LINE_EQUIPMENT,
            booking_line_units: [
              { id: 'u1', qty: 1, unit_state: 'Ready', is_required: true, packed: false, damaged: false },
            ],
          },
        ],
      }),
    )
    expect(b.gates.requiredUnitsPacked).toBe(false)
  })

  it('has no single summary state field to collapse the counts into', async () => {
    const b = await fetchOne(rawBooking())
    expect(b.lines[0]).not.toHaveProperty('itemState')
  })
})

/* ── The discount seam ───────────────────────────────────────────────────── */

describe('booking-level discount', () => {
  it('is null — not 0 — when the rows were not requested', async () => {
    const b = await fetchOne(rawBooking())
    expect(b.discounts).toBeNull()
    expect(b.engineInput.discountPercent).toBeNull()
    expect(b.engineInput.discountPercent).not.toBe(0)
  })

  it('is 0 when the rows WERE requested and there are none', async () => {
    const b = await fetchOne(rawBooking({ booking_discounts: [] }), { withDiscounts: true })
    expect(b.engineInput.discountPercent).toBe(0)
  })

  it('sums stacked rows — booking_discounts is the sole home of the step-7 percentage', async () => {
    const b = await fetchOne(
      rawBooking({
        booking_discounts: [
          { id: 'd1', discount_source: 'Membership', percent: 5, reason: null, approver_id: null, applied_at: '2026-08-01T00:00:00+00:00', coupon_id: null },
          { id: 'd2', discount_source: 'Coupon', percent: 2, reason: null, approver_id: null, applied_at: '2026-08-02T00:00:00+00:00', coupon_id: 'cp1' },
        ],
      }),
      { withDiscounts: true },
    )
    expect(b.engineInput.discountPercent).toBe(7)
    expect(b.discounts).toHaveLength(2)
    expect(b.discounts![0]).toMatchObject({ source: 'Membership', percent: 5 })
  })

  it('never back-computes a percentage from the lines’ discount_amount', async () => {
    // 0002:201 — the line discount is "subtracted inside step 1. Entirely
    // separate from the booking-level percentage at step 7." Back-computing
    // would charge it twice. LINE_EQUIPMENT carries a Rs 1,000 line discount
    // and no booking_discounts row; the percentage must still be 0.
    const b = await fetchOne(rawBooking({ booking_discounts: [] }), { withDiscounts: true })
    expect(b.lines[0]!.discountAmount).toBe(rupees(1000))
    expect(b.engineInput.discountPercent).toBe(0)
  })

  it('leaves vatPercent, crew, transport and payments unsourced', async () => {
    const b = await fetchOne(rawBooking())
    expect(b.engineInput.vatPercent).toBeNull()
    expect(b.engineInput.crew).toBeNull()
    expect(b.engineInput.transport).toBeNull()
    expect(b.engineInput.payments).toBeNull()
  })
})

/* ── priceCanonicalBooking · refuses rather than guessing ────────────────── */

describe('priceCanonicalBooking', () => {
  /** Foundation §2.8's reference case, expressed as one booking line. */
  const REFERENCE_LINE: RawLine = {
    ...LINE_EQUIPMENT,
    qty: 1,
    days: 1,
    rate: 132750,
    discount_amount: 0,
    booking_line_units: [],
  }

  const SUPPLIED = { vatPercent: 13, crew: rupees(0), transport: rupees(0), payments: rupees(15000) }

  it('reproduces the §2.8 reference figures through the engine', async () => {
    const b = await fetchOne(
      rawBooking({
        booking_lines_v: [REFERENCE_LINE],
        booking_discounts: [
          { id: 'd1', discount_source: 'Manual', percent: 7, reason: null, approver_id: null, applied_at: '2026-08-01T00:00:00+00:00', coupon_id: null },
        ],
      }),
      { withDiscounts: true },
    )
    const totals = priceCanonicalBooking(b, SUPPLIED)
    expect(totals.ok).toBe(true)
    if (!totals.ok) return
    expect(toRupees(totals.breakdown.discount)).toBe(9293)
    expect(toRupees(totals.breakdown.taxable)).toBe(123457)
    expect(toRupees(totals.breakdown.vat)).toBe(16049)
    expect(toRupees(totals.breakdown.rentalTotal)).toBe(139506)
    expect(toRupees(totals.breakdown.outstanding)).toBe(124506)
  })

  it('refuses when any line is masked, rather than pricing the visible half', async () => {
    const b = await fetchOne(
      rawBooking({ booking_lines_v: [{ ...REFERENCE_LINE, rate: null, discount_amount: null }], booking_discounts: [] }),
      { withDiscounts: true },
    )
    const totals = priceCanonicalBooking(b, SUPPLIED)
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/not visible to this account/)
  })

  it('refuses when the discount rows were never read', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [REFERENCE_LINE] }))
    const totals = priceCanonicalBooking(b, SUPPLIED)
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/withDiscounts/)
  })

  it('refuses rather than assuming 13% when no VAT rate is supplied', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [REFERENCE_LINE], booking_discounts: [] }), {
      withDiscounts: true,
    })
    const totals = priceCanonicalBooking(b, { ...SUPPLIED, vatPercent: Number.NaN })
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/Settings ▸ Finance/)
  })
})

/* ── service_basis · a Flat service is not charged per day ───────────────── */

describe('service_basis governs whether days multiplies', () => {
  /** Rs 2,500 flat, days stored as 1 — the shape 0001:305 describes. */
  const FLAT: RawLine = {
    ...LINE_EQUIPMENT,
    id: 'svc-flat',
    line_type: 'Service',
    service_basis: 'Flat',
    description: 'Kit prep',
    qty: 1,
    days: 1,
    rate: 2500,
    discount_amount: 0,
    booking_line_units: [],
  }

  it('charges a Flat service once, not once per day', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [{ ...FLAT, qty: 2 }] }))
    // 2 × 2,500 — NOT × days.
    expect(b.lines[0]!.netTotal).toBe(rupees(5000))
  })

  it('charges a Per day service for every day', async () => {
    const b = await fetchOne(
      rawBooking({ booking_lines_v: [{ ...FLAT, service_basis: 'Per day', qty: 2, days: 4 }] }),
    )
    expect(b.lines[0]!.netTotal).toBe(rupees(20000)) // 2 × 2,500 × 4
  })

  it('refuses a Flat line that stores days > 1 rather than picking a reading', async () => {
    // 0001:305 ("A Flat service still stores days = 1 explicitly") is a SQL
    // COMMENT, not a CHECK — verified across all 55 migrations — so this row is
    // reachable. Charging once and charging four times are both defensible and
    // give different money, so neither is chosen here.
    const b = await fetchOne(rawBooking({ booking_lines_v: [{ ...FLAT, days: 4 }] }))
    const line = b.lines[0]!
    expect(line.netTotal).toBeNull()
    // Not Rs 2,500 and not Rs 10,000 — no number at all.
    expect(line.netTotal).not.toBe(rupees(2500))
    expect(line.netTotal).not.toBe(rupees(10000))
    expect(line.netTotalRefusal).toMatch(/Flat but stores 4 days/)
  })

  it('propagates a refused line to the bucket and the subtotal — never drops it', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [LINE_EQUIPMENT, { ...FLAT, days: 4 }] }))
    // The equipment line is still priced, but the booking has no subtotal: a
    // total missing one line is the convincing wrong number.
    expect(b.engineInput.services).toBeNull()
    expect(b.engineInput.linesSubtotal).toBeNull()
  })

  it('refuses a Service line carrying no basis at all', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [{ ...FLAT, service_basis: null }] }))
    expect(b.lines[0]!.netTotal).toBeNull()
    expect(b.lines[0]!.netTotalRefusal).toMatch(/flat or per day/)
  })

  it('says WHY it cannot price, rather than blaming the account’s permissions', async () => {
    const b = await fetchOne(
      rawBooking({ booking_lines_v: [{ ...FLAT, days: 4 }], booking_discounts: [] }),
      { withDiscounts: true },
    )
    const totals = priceCanonicalBooking(b, {
      vatPercent: 13,
      crew: rupees(0),
      transport: rupees(0),
      payments: rupees(0),
    })
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    // A role change cannot fix a contradictory line, so the masked-money reason
    // would send the operator to the wrong place.
    expect(totals.reason).toMatch(/Flat but stores 4 days/)
    expect(totals.reason).not.toMatch(/not visible to this account/)
  })
})

/* ── is_included · documented as free, so never charged ──────────────────── */

describe('is_included', () => {
  it('prices an included line at 0 when its rate agrees', async () => {
    const b = await fetchOne(
      rawBooking({
        booking_lines_v: [
          { ...LINE_EQUIPMENT, line_type: 'Accessory', is_included: true, rate: 0, discount_amount: 0 },
        ],
      }),
    )
    expect(b.lines[0]!.isIncluded).toBe(true)
    expect(b.lines[0]!.netTotal).toBe(rupees(0))
    expect(b.lines[0]!.netTotalRefusal).toBeNull()
  })

  it('never charges a line it calls included, even when the row carries a rate', async () => {
    // Unlike bundle children (booking_lines_bundle_child_is_free, a real CHECK),
    // NOTHING in any migration ties is_included to rate = 0. So this row exists,
    // and the previous version billed it 2 × 5,000 × 3 − 1,000 = Rs 29,000 for a
    // line the same object describes as supplied free.
    const b = await fetchOne(
      rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, line_type: 'Accessory', is_included: true }] }),
    )
    const line = b.lines[0]!
    expect(line.netTotal).not.toBe(rupees(29000))
    // And not a confident Rs 0 either — that would discard a rate someone typed.
    expect(line.netTotal).toBeNull()
    expect(line.netTotalRefusal).toMatch(/marked as included/)
  })

  it('refuses a row with no is_included rather than assuming it is chargeable', async () => {
    db.state.row = rawBooking({
      booking_lines_v: [{ ...LINE_EQUIPMENT, is_included: null }],
    })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/no is_included/)
  })

  it('distinguishes a masked line from a refused one', async () => {
    // Both have netTotal null. Only one has something to show the operator.
    const b = await fetchOne(
      rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, rate: null, discount_amount: null }] }),
    )
    expect(b.lines[0]!.netTotal).toBeNull()
    expect(b.lines[0]!.netTotalRefusal).toBeNull()
  })
})

/* ── The packing gate · counted over required units only ─────────────────── */

describe('the packing gate — 0002:288', () => {
  function withUnits(units: RawLine['booking_line_units']): Promise<CanonicalBooking> {
    return fetchOne(rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: units }] }))
  }

  it('does NOT let a packed optional unit satisfy an unpacked required one', async () => {
    // THE DEFECT, minimally. Old gate: packedQty(1) + Missing(0) >= requiredQty(1)
    // → true. The camera body was never packed; the lens cap was. Handover
    // releasing gear that was never packed is the concrete harm.
    const b = await withUnits([
      { id: 'body', qty: 1, unit_state: 'Ready', is_required: true, packed: false, damaged: false },
      { id: 'cap', qty: 1, unit_state: 'Ready', is_required: false, packed: true, damaged: false },
    ])
    expect(b.gates.requiredUnitsPacked).toBe(false)
    expect(b.units.requiredUnpackedQty).toBe(1)
  })

  it('does NOT let an optional Missing unit satisfy an unpacked required one', async () => {
    // Same defect through the other term: byState.Missing was also unrestricted.
    const b = await withUnits([
      { id: 'body', qty: 1, unit_state: 'Ready', is_required: true, packed: false, damaged: false },
      { id: 'cap', qty: 1, unit_state: 'Missing', is_required: false, packed: false, damaged: false },
    ])
    expect(b.gates.requiredUnitsPacked).toBe(false)
  })

  it('passes when every required unit is packed', async () => {
    const b = await withUnits([
      { id: 'body', qty: 1, unit_state: 'Ready', is_required: true, packed: true, damaged: false },
      { id: 'cap', qty: 1, unit_state: 'Ready', is_required: false, packed: false, damaged: false },
    ])
    expect(b.gates.requiredUnitsPacked).toBe(true)
    expect(b.units.requiredUnpackedQty).toBe(0)
  })

  it('accepts a required unit that is Missing — the schema forces a reason on it', async () => {
    // booking_line_units_missing_needs_reason (0002:256) makes a reasonless
    // Missing row impossible, so the gate need not re-check missing_reason.
    const b = await withUnits([
      { id: 'body', qty: 1, unit_state: 'Missing', is_required: true, packed: false, damaged: false },
    ])
    expect(b.gates.requiredUnitsPacked).toBe(true)
  })

  it('counts units, not rows — a bulk row short by 11 still blocks', async () => {
    const b = await withUnits([
      { id: 'bulk', qty: 12, unit_state: 'Ready', is_required: true, packed: false, damaged: false },
    ])
    expect(b.units.requiredUnpackedQty).toBe(12)
    expect(b.gates.requiredUnitsPacked).toBe(false)
  })

  it('does not let one line’s packing cover another line’s unpacked required units', async () => {
    const packed: RawLine = {
      ...LINE_EQUIPMENT,
      id: 'packed-line',
      sort_order: 1,
      booking_line_units: [
        { id: 'a', qty: 4, unit_state: 'Ready', is_required: true, packed: true, damaged: false },
      ],
    }
    const unpacked: RawLine = {
      ...LINE_EQUIPMENT,
      id: 'unpacked-line',
      sort_order: 2,
      booking_line_units: [
        { id: 'b', qty: 1, unit_state: 'Ready', is_required: true, packed: false, damaged: false },
      ],
    }
    const b = await fetchOne(rawBooking({ booking_lines_v: [packed, unpacked] }))
    expect(b.gates.requiredUnitsPacked).toBe(false)
  })
})

/* ── bucketOf · an unknown line type refuses, it does not vanish ─────────── */

describe('unknown booking_line_type', () => {
  it('throws rather than dropping the line out of the subtotal', async () => {
    // If src/types/supabase.ts lags a migration that adds an enum member, the
    // switch stops being exhaustive at runtime while still compiling. Returning
    // undefined made the line match no bucket, so its money disappeared and a
    // smaller — still self-consistent — total rendered.
    db.state.row = rawBooking({
      booking_lines_v: [{ ...LINE_EQUIPMENT, line_type: 'Insurance' as RawLine['line_type'] }],
    })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/unknown booking_line_type/)
  })
})

/* ── Law 3 · the mapper enforces the live-lines filter itself ────────────── */

describe('voided lines — Law 3 enforced in the mapper, not only in the query', () => {
  // The mock's `.is()` records the call and filters nothing, so every row here
  // reaches the mapper — exactly the position a caller is in when it uses the
  // exported `toCanonical` on rows fetched some other way.
  const VOIDED: RawLine = {
    ...LINE_EQUIPMENT,
    id: 'removed',
    sort_order: 2,
    voided_at: '2026-08-09T06:00:00+00:00',
  }

  it('excludes a voided line from the lines, the totals and the unit counts', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [LINE_EQUIPMENT, VOIDED] }))
    expect(b.lines.map((l) => l.id)).toEqual(['line-equip'])
    // Rs 29,000 once — the removed line does not rejoin the subtotal.
    expect(b.engineInput.linesSubtotal).toBe(rupees(29000))
    expect(b.units.committedQty).toBe(2)
  })

  it('still pins the query-side filter — both enforcements are load-bearing', async () => {
    await fetchOne(rawBooking())
    expect(db.state.calls).toContainEqual(['is', 'booking_lines_v.voided_at', null])
  })

  it('refuses a row with no voided_at rather than guessing either way', async () => {
    // Assuming live re-admits removed lines; assuming voided drops every line
    // and reports a fully-formed Rs 0.
    const { voided_at: _dropped, ...noVoidedAt } = LINE_EQUIPMENT
    db.state.row = rawBooking({ booking_lines_v: [noVoidedAt as RawLine] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/cannot be shown to be live/)
  })
})

/* ══ Absent is not zero ═══════════════════════════════════════════════════
 *
 * The four groups below are one rule seen from four sides: a zero is a CLAIM
 * ("nothing was charged"); null or a refusal is the truth ("this cannot be
 * answered from what was fetched, or you may not see it"). Each `it` pins a
 * case where the module previously produced a confident, fully-formed, wrong
 * number instead — and, just as importantly, the neighbouring case where a real
 * zero must still price, so the guards cannot be "fixed" by refusing everything.
 * ═══════════════════════════════════════════════════════════════════════ */

/** Supplied inputs that are all legitimately known, so only the field under test varies. */
const PRICEABLE: SuppliedPriceInputs = {
  vatPercent: 13,
  crew: rupees(0),
  transport: rupees(0),
  payments: rupees(0),
}

/* ── Defect 1 · "no lines returned" vs "zero live lines" ─────────────────── */

describe('the line embed — not returned vs returned-and-empty', () => {
  it('reports linesPresence absent when the embed comes back null', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: null }))
    expect(b.linesPresence).toBe('absent')
  })

  it('reports linesPresence absent when the key is missing entirely', async () => {
    // PostgREST can omit an embed as well as null it. Both are "not returned".
    const { booking_lines_v: _droppedEmbed, ...withoutEmbed } = rawBooking()
    const b = await fetchOne(withoutEmbed as RawBooking)
    expect(b.linesPresence).toBe('absent')
  })

  it('makes EVERY money bucket null when the lines were not returned — not Rs 0', async () => {
    // ⛔ The defect verbatim: `raw.booking_lines_v ?? []`, then `sumNet([])`
    // returned `0 as Paisa`. NON-NULL. So the refusal guard, which tests for
    // null, never fired and the engine got three confident zeroes.
    const b = await fetchOne(rawBooking({ booking_lines_v: null }))
    for (const bucket of [
      b.engineInput.equipment,
      b.engineInput.subRental,
      b.engineInput.services,
      b.engineInput.linesSubtotal,
    ]) {
      expect(bucket).toBeNull()
      expect(bucket).not.toBe(0)
    }
  })

  it('REFUSES to price a booking whose lines were not returned', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: null, booking_discounts: [] }), {
      withDiscounts: true,
    })
    const totals = priceCanonicalBooking(b, PRICEABLE)
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/were not returned by the query/)
    // It must NOT reuse the Law 6 sentence: the remedy here is a re-fetch, and
    // sending the operator to ask for a permission they already hold is its own
    // confidently-wrong answer.
    expect(totals.reason).not.toMatch(/not visible to this account/)
  })

  it('says in the refusal that this is not a booking worth Rs 0', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: null, booking_discounts: [] }), {
      withDiscounts: true,
    })
    const totals = priceCanonicalBooking(b, PRICEABLE)
    if (totals.ok) throw new Error('expected a refusal')
    expect(totals.reason).toMatch(/not a booking worth Rs 0/)
  })

  it('leaves the line-derived gates null rather than passing them', async () => {
    // `[].every(...)` is `true` for any predicate, so an absent collection used
    // to report requiredUnitsPacked: true — a green tick sourced from nothing,
    // in front of an operator about to hand over gear.
    const b = await fetchOne(rawBooking({ booking_lines_v: null }))
    expect(b.gates.requiredUnitsPacked).toBeNull()
    expect(b.gates.hasDamagedUnit).toBeNull()
    expect(b.gates.hasMissingUnit).toBeNull()
    // Derived from stage, which is always present, so it stays a boolean.
    expect(b.gates.itemsWithClient).toBe(false)
  })

  /* ── the other half of the rule: a REAL Rs 0 must still price ─────────── */

  it('treats an empty-but-returned collection as a real Rs 0, not an absence', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [] }))
    expect(b.linesPresence).toBe('present')
    expect(b.engineInput.equipment).toBe(rupees(0))
    expect(b.engineInput.subRental).toBe(rupees(0))
    expect(b.engineInput.services).toBe(rupees(0))
    expect(b.engineInput.linesSubtotal).toBe(rupees(0))
  })

  it('PRICES a booking with zero live lines — the guard must not over-refuse', async () => {
    // A Quote with nothing added yet is a real Rs 0 and must render as one.
    // Refusing it would be the opposite failure: hiding a figure that is known.
    const b = await fetchOne(rawBooking({ booking_lines_v: [], booking_discounts: [] }), {
      withDiscounts: true,
    })
    const totals = priceCanonicalBooking(b, PRICEABLE)
    expect(totals.ok).toBe(true)
    if (!totals.ok) return
    expect(toRupees(totals.breakdown.subtotal)).toBe(0)
    expect(toRupees(totals.breakdown.vat)).toBe(0)
    expect(toRupees(totals.breakdown.rentalTotal)).toBe(0)
  })

  it('still evaluates the gates on an empty-but-returned collection', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [] }))
    expect(b.gates.requiredUnitsPacked).toBe(true)
    expect(b.gates.hasDamagedUnit).toBe(false)
    expect(b.gates.hasMissingUnit).toBe(false)
  })

  it('treats a booking whose every line is voided as a real Rs 0 too', async () => {
    // Law 3 — the lines came back and none of them is live. That is Rs 0,
    // knowably, and must price rather than refuse.
    const b = await fetchOne(
      rawBooking({
        booking_lines_v: [{ ...LINE_EQUIPMENT, voided_at: '2026-08-09T06:00:00+00:00' }],
        booking_discounts: [],
      }),
      { withDiscounts: true },
    )
    expect(b.linesPresence).toBe('present')
    expect(b.lines).toHaveLength(0)
    expect(b.engineInput.linesSubtotal).toBe(rupees(0))
    expect(priceCanonicalBooking(b, PRICEABLE).ok).toBe(true)
  })

  it('keeps the two Rs 0 cases distinguishable all the way to the caller', async () => {
    // The single fact this whole defect turns on, stated once.
    const absent = await fetchOne(rawBooking({ booking_lines_v: null }))
    const empty = await fetchOne(rawBooking({ booking_lines_v: [] }))
    expect(absent.engineInput.linesSubtotal).toBeNull()
    expect(empty.engineInput.linesSubtotal).toBe(rupees(0))
    expect(absent.linesPresence).not.toBe(empty.linesPresence)
  })

  it('applies the same rule to the discount embed — requested is not returned', async () => {
    // `withDiscounts: true` records that the rows were ASKED for. If they did
    // not come back, `?? []` would have made that a confident 0% and produced a
    // full-price total on a possibly-discounted booking.
    const b = await fetchOne(rawBooking({ booking_discounts: null }), { withDiscounts: true })
    expect(b.discounts).toBeNull()
    expect(b.engineInput.discountPercent).toBeNull()
    expect(b.engineInput.discountPercent).not.toBe(0)
    expect(b.discountIntegrity).toBeNull()
  })
})

/* ── Defect 2 · every value entering price() is validated ────────────────── */

describe('supplied engine inputs are validated at the boundary', () => {
  const LINE: RawLine = { ...LINE_EQUIPMENT, booking_line_units: [] }

  async function priced(supplied: SuppliedPriceInputs) {
    const b = await fetchOne(rawBooking({ booking_lines_v: [LINE], booking_discounts: [] }), {
      withDiscounts: true,
    })
    return priceCanonicalBooking(b, supplied)
  }

  function refusal(totals: Awaited<ReturnType<typeof priced>>): string {
    if (totals.ok) throw new Error('expected a refusal, got a breakdown')
    return totals.reason
  }

  it('prices the baseline, so every refusal below is caused by the field it changes', async () => {
    const totals = await priced(PRICEABLE)
    expect(totals.ok).toBe(true)
    if (!totals.ok) return
    // 2 × 5,000 × 3 − 1,000 = 29,000
    expect(toRupees(totals.breakdown.subtotal)).toBe(29000)
  })

  /* null — "not read" is now expressible, and is refused rather than assumed 0 */

  it('refuses a null crew rather than treating it as Rs 0', async () => {
    expect(refusal(await priced({ ...PRICEABLE, crew: null }))).toMatch(/Crew charges has not been read/)
  })

  it('refuses a null transport rather than treating it as Rs 0', async () => {
    expect(refusal(await priced({ ...PRICEABLE, transport: null }))).toMatch(
      /Transport charges has not been read/,
    )
  })

  it('refuses null payments — an unread payment history is not "nothing paid"', async () => {
    // The most dangerous of the three: Rs 0 payments reports the FULL rental as
    // Outstanding, and `payments` is gated more narrowly than money visibility
    // (0011:61), so a Coordinator legitimately gets zero rows from a paid booking.
    expect(refusal(await priced({ ...PRICEABLE, payments: null }))).toMatch(
      /Payments received has not been read/,
    )
  })

  it('refuses a null VAT rate rather than assuming 13%', async () => {
    expect(refusal(await priced({ ...PRICEABLE, vatPercent: null }))).toMatch(/Settings ▸ Finance/)
  })

  /* NaN — the value that satisfies the Paisa brand and renders as a total */

  it('refuses a NaN crew instead of producing a NaN total', async () => {
    // Every downstream figure would be NaN: `NaN + 5` is NaN, and `NaN === null`
    // is false, so no null guard anywhere catches it.
    expect(refusal(await priced({ ...PRICEABLE, crew: Number.NaN as never }))).toMatch(
      /Crew charges is not a usable amount/,
    )
  })

  it('refuses an Infinity transport', async () => {
    expect(refusal(await priced({ ...PRICEABLE, transport: Number.POSITIVE_INFINITY as never }))).toMatch(
      /Transport charges is not a usable amount/,
    )
  })

  it('refuses a NaN VAT rate — the one check that already existed, kept', async () => {
    expect(refusal(await priced({ ...PRICEABLE, vatPercent: Number.NaN }))).toMatch(/Settings ▸ Finance/)
  })

  /* negatives — each field's own rule */

  it('refuses negative crew charges', async () => {
    expect(refusal(await priced({ ...PRICEABLE, crew: -1 as never }))).toMatch(/Crew charges is negative/)
  })

  it('refuses negative payments — Outstanding must never exceed the Rental Total', async () => {
    expect(refusal(await priced({ ...PRICEABLE, payments: rupees(-500) }))).toMatch(
      /Payments received is negative/,
    )
  })

  it('refuses a negative VAT rate', async () => {
    expect(refusal(await priced({ ...PRICEABLE, vatPercent: -13 }))).toMatch(/outside the permitted range/)
  })

  it('refuses a VAT rate above 100% — VAT cannot exceed the taxable amount', async () => {
    expect(refusal(await priced({ ...PRICEABLE, vatPercent: 130 }))).toMatch(/outside the permitted range/)
  })

  /* fractional paisa — §2.3's "every total reconciles exactly" is structural */

  it('refuses a fractional paisa, which would put a later total out by a paisa', async () => {
    expect(refusal(await priced({ ...PRICEABLE, transport: 150.5 as never }))).toMatch(/not a whole paisa/)
  })

  /* the zeroes that ARE legitimate — the guards must not over-refuse */

  it('accepts Rs 0 payments — the ordinary state of an unpaid booking', async () => {
    const totals = await priced({ ...PRICEABLE, payments: rupees(0) })
    expect(totals.ok).toBe(true)
    if (!totals.ok) return
    expect(toRupees(totals.breakdown.outstanding)).toBe(toRupees(totals.breakdown.rentalTotal))
  })

  it('accepts Rs 0 transport — §2.1 requires exactly that on client pickup', async () => {
    expect((await priced({ ...PRICEABLE, transport: rupees(0) })).ok).toBe(true)
  })

  it('accepts a 0% VAT rate — zero-rated is a claim the caller may make', async () => {
    const totals = await priced({ ...PRICEABLE, vatPercent: 0 })
    expect(totals.ok).toBe(true)
    if (!totals.ok) return
    expect(toRupees(totals.breakdown.vat)).toBe(0)
  })

  it('accepts a fractional VAT rate — percentages stay numeric on purpose', async () => {
    expect((await priced({ ...PRICEABLE, vatPercent: 13.5 })).ok).toBe(true)
  })

  it('never returns a breakdown for a bad input, whichever field it is', async () => {
    // The property behind every case above, so a fifth supplied field cannot be
    // added unguarded without this failing.
    const bad: Array<Partial<SuppliedPriceInputs>> = [
      { crew: Number.NaN as never },
      { transport: Number.NaN as never },
      { payments: Number.NaN as never },
      { vatPercent: Number.NaN },
      { crew: null },
      { transport: null },
      { payments: null },
      { vatPercent: null },
    ]
    for (const patch of bad) {
      const totals = await priced({ ...PRICEABLE, ...patch })
      if (totals.ok) throw new Error(`priced a booking from ${JSON.stringify(patch)}`)
      expect(totals.reason.length).toBeGreaterThan(0)
    }
  })
})

/* ── Defect 3 · the booking discount is capped, surfaced, never clamped ──── */

describe('the booking discount cap', () => {
  const LINE: RawLine = { ...LINE_EQUIPMENT, booking_line_units: [] }

  function discount(over: Partial<RawDiscount> = {}): RawDiscount {
    return {
      id: 'd1',
      discount_source: 'Manual',
      percent: 5,
      reason: null,
      approver_id: null,
      applied_at: '2026-08-01T00:00:00+00:00',
      coupon_id: null,
      ...over,
    }
  }

  async function withDiscountRows(rows: RawDiscount[]): Promise<CanonicalBooking> {
    return fetchOne(rawBooking({ booking_lines_v: [LINE], booking_discounts: rows }), {
      withDiscounts: true,
    })
  }

  it('takes the cap from money.ts rather than re-typing 25', () => {
    // If DISCOUNT_CAP ever moves, the module and this suite move together.
    expect(DISCOUNT_CAP).toBe(25)
  })

  it('prices a stacked discount that lands exactly on the cap', async () => {
    const b = await withDiscountRows([
      discount({ id: 'd1', percent: 20 }),
      discount({ id: 'd2', discount_source: 'Membership', percent: 5 }),
    ])
    expect(b.engineInput.discountPercent).toBe(25)
    expect(b.discountIntegrity?.violation).toBeNull()
    expect(priceCanonicalBooking(b, PRICEABLE).ok).toBe(true)
  })

  it('REFUSES a stacked discount one point over the cap', async () => {
    // Neither row breaks the per-row cap; the SUM does. 0002:610 — "Capped at 25
    // per row and at 25 summed across stacked rows."
    const b = await withDiscountRows([
      discount({ id: 'd1', percent: 20 }),
      discount({ id: 'd2', discount_source: 'Membership', percent: 6 }),
    ])
    const totals = priceCanonicalBooking(b, PRICEABLE)
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/26% discount, above the 25% cap/)
  })

  it('does NOT clamp — the stored sum is reported unchanged', async () => {
    // Clamping to 25 would invent a number matching neither the rows (40) nor
    // the rules (which say 40 cannot be there at all), and would erase a data
    // defect on the very screen most likely to catch it.
    const b = await withDiscountRows([discount({ percent: 40 })])
    expect(b.engineInput.discountPercent).toBe(40)
    expect(b.discountIntegrity?.sumPercent).toBe(40)
    expect(b.discountIntegrity?.sumPercent).not.toBe(DISCOUNT_CAP)
  })

  it('makes the violation visible on the booking, not only inside the refusal', async () => {
    // A refusal alone hides WHAT is wrong from the screen; the flag alone would
    // still let a total render. Both directions, or the inconsistency is not
    // actually visible.
    const b = await withDiscountRows([discount({ percent: 40 })])
    expect(b.discountIntegrity?.violation).toBe('Over cap')
    expect(b.discountIntegrity?.cap).toBe(DISCOUNT_CAP)
    expect(b.discountIntegrity?.message).toMatch(/not clamped/)
  })

  it('refuses a negative discount, which would ADD to the Rental Total', async () => {
    const b = await withDiscountRows([discount({ percent: -5 })])
    expect(b.discountIntegrity?.violation).toBe('Negative')
    const totals = priceCanonicalBooking(b, PRICEABLE)
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/negative/)
  })

  it('refuses a percent that is not a number rather than counting it as 0%', async () => {
    // `0 + null` is `0` in JavaScript, so a NULL percent would otherwise vanish
    // into a smaller, confident total.
    const b = await withDiscountRows([
      discount({ id: 'd1', percent: 5 }),
      discount({ id: 'd2', discount_source: 'Membership', percent: null as unknown as number }),
    ])
    expect(b.discountIntegrity?.violation).toBe('Not a number')
    expect(priceCanonicalBooking(b, PRICEABLE).ok).toBe(false)
  })

  it('refuses a NaN percent', async () => {
    const b = await withDiscountRows([discount({ percent: Number.NaN })])
    expect(b.discountIntegrity?.violation).toBe('Not a number')
    expect(priceCanonicalBooking(b, PRICEABLE).ok).toBe(false)
  })

  it('reports no violation and no message when the rows are consistent', async () => {
    const b = await withDiscountRows([discount({ percent: 7 })])
    expect(b.discountIntegrity).toEqual({
      sumPercent: 7,
      cap: DISCOUNT_CAP,
      violation: null,
      message: null,
    })
  })

  it('leaves discountIntegrity null when the rows were never read — not "no violation"', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [LINE] }))
    expect(b.discountIntegrity).toBeNull()
  })

  it('caps the value that actually reaches price(), not only the one it inspected', async () => {
    // A CanonicalBooking assembled by hand — a fixture, a cached payload, a
    // realtime patch — where discountPercent and discountIntegrity disagree.
    const b = await withDiscountRows([discount({ percent: 7 })])
    const tampered: CanonicalBooking = {
      ...b,
      engineInput: { ...b.engineInput, discountPercent: 60 },
    }
    const totals = priceCanonicalBooking(tampered, PRICEABLE)
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/outside the permitted range of 0% to 25%/)
  })
})

/* ── Defect 4 · a non-finite value never becomes a Paisa ─────────────────── */

describe('non-finite values are refused at the numeric boundary', () => {
  it('throws rather than turning a NaN rate into rupees(NaN)', async () => {
    // `rupees(NaN)` is `Math.round(NaN * 100)` = NaN, and NaN satisfies the
    // Paisa brand — the brand is a compile-time tag, not a validation.
    db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, rate: Number.NaN }] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/booking_lines_v\.rate came back as/)
  })

  it('throws on a NaN discount_amount', async () => {
    db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, discount_amount: Number.NaN }] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(
      /booking_lines_v\.discount_amount came back as/,
    )
  })

  it('throws on an Infinity rate', async () => {
    db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, rate: Number.POSITIVE_INFINITY }] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/neither NULL nor a finite number/)
  })

  it('throws on a non-numeric rate rather than coercing it', async () => {
    // `'5000' * 100` is 500000 — it would have worked by accident, which is
    // worse than failing, because the day it arrives as '5,000' it is silently NaN.
    db.state.row = rawBooking({
      booking_lines_v: [{ ...LINE_EQUIPMENT, rate: '5000' as unknown as number }],
    })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/neither NULL nor a finite number/)
  })

  it('throws on a NaN deposit_required — the same guard, on the booking header', async () => {
    db.state.row = rawBooking({ deposit_required: Number.NaN })
    await expect(fetchCanonicalBooking(BOOKING_ID, { withDeposit: true })).rejects.toThrow(
      /bookings\.deposit_required came back as/,
    )
  })

  it('still keeps a masked NULL as null — the guard did not swallow Law 6', async () => {
    const b = await fetchOne(
      rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, rate: null, discount_amount: null }] }),
    )
    expect(b.lines[0]!.rate).toBeNull()
    expect(b.lines[0]!.netTotal).toBeNull()
  })

  it('throws on a NaN qty, which would poison the line total silently', async () => {
    db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, qty: Number.NaN }] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/qty to a positive integer/)
  })

  it('throws on a fractional qty', async () => {
    db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, qty: 2.5 }] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/qty to a positive integer/)
  })

  it('throws on qty 0 — the schema constrains qty > 0 (0002:152)', async () => {
    db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, qty: 0 }] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/qty to a positive integer/)
  })

  it('throws on days 0 — the schema constrains days >= 1 (0002:155)', async () => {
    db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, days: 0 }] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/days to at least 1/)
  })

  it('throws on a NaN days', async () => {
    db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, days: Number.NaN }] })
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/days to at least 1/)
  })

  it('never lets a non-finite value reach a rendered total by any route', async () => {
    // The property, stated once: no arrangement of non-finite inputs produces a
    // breakdown. Either the mapper throws or the pricer refuses — never a number.
    const poisons: Array<Partial<RawLine>> = [
      { rate: Number.NaN },
      { discount_amount: Number.NaN },
      { qty: Number.NaN },
      { days: Number.NaN },
      { rate: Number.POSITIVE_INFINITY },
    ]
    for (const poison of poisons) {
      db.reset()
      db.state.row = rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, ...poison }] })
      await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow()
    }
  })
})

/* ══ Defect 5 · a bundle child whose parent is not live ═══════════════════
 *
 * `booking_lines_bundle_child_is_free` (0002:172) proves the sum cannot
 * DOUBLE-count a bundle. It says nothing about the sum being SHORT one, and
 * NOTHING cascades voided_at from a bundle parent to its children — verified
 * across 0001-0055: parent_line_id appears only as the column (0002:130), that
 * CHECK, booking_lines_not_own_parent (:190), a comment (:195), and two view
 * column lists. So voiding a Bundle line leaves live Rs 0 children, the
 * bundle's whole rate leaves the subtotal, and the booking still composes a
 * smaller, self-consistent, confident total.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('orphaned bundle children', () => {
  const PARENT: RawLine = {
    ...LINE_EQUIPMENT,
    id: 'bundle-parent',
    line_type: 'Bundle',
    parent_line_id: null,
    description: 'Doc Kit',
    qty: 1,
    days: 2,
    rate: 10000,
    discount_amount: 0,
    sort_order: 1,
    booking_line_units: [],
  }
  /** Rs 0 by CHECK — the bundle line is where the Rs 20,000 lives. */
  const CHILD: RawLine = {
    ...LINE_EQUIPMENT,
    id: 'bundle-child',
    line_type: 'Equipment',
    parent_line_id: 'bundle-parent',
    description: 'Alexa Mini (in kit)',
    qty: 3,
    days: 2,
    rate: 0,
    discount_amount: 0,
    sort_order: 2,
    booking_line_units: [],
  }

  /* ── the parent is ABSENT from the returned set, not present-and-voided ─ */

  it('detects an orphan when the parent never came back at all', async () => {
    // The query filters live lines AT THE DATABASE
    // (`.is('booking_lines_v.voided_at', null)`), so a voided parent is simply
    // not in the payload. There is no row to inspect and no voided_at to read —
    // the check has to be "is my parent among the live ids", which is what this
    // pins. A test that only voided the parent in place would pass against an
    // implementation that reads the parent's voided_at and still be wrong live.
    const b = await fetchOne(rawBooking({ booking_lines_v: [CHILD] }))
    expect(b.lines).toHaveLength(1)
    expect(b.lines[0]!.isBundleParentLive).toBe(false)
    expect(b.bundleIntegrity?.orphanedChildIds).toEqual(['bundle-child'])
  })

  it('detects an orphan when the parent came back voided', async () => {
    // The other route to the same state: the mapper's own Law 3 filter drops
    // the parent, so by the time the check runs the parent is equally absent.
    const b = await fetchOne(
      rawBooking({
        booking_lines_v: [{ ...PARENT, voided_at: '2026-08-09T06:00:00+00:00' }, CHILD],
      }),
    )
    expect(b.lines.map((l) => l.id)).toEqual(['bundle-child'])
    expect(b.lines[0]!.isBundleParentLive).toBe(false)
  })

  /* ── the outcome is visible, never a smaller total that looks fine ────── */

  it('does NOT price the orphan at Rs 0 — a 0 is the claim that hides the loss', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [CHILD] }))
    const line = b.lines[0]!
    expect(line.netTotal).toBeNull()
    expect(line.netTotal).not.toBe(rupees(0))
    expect(line.netTotalRefusal).toMatch(/parent line is not among/)
  })

  it('makes the subtotal unknown rather than short by the whole bundle', async () => {
    // ⛔ THE DEFECT, minimally. Without the guard this reads rupees(0): the
    // child prices at 0 by CHECK, the Rs 20,000 parent is gone, and the booking
    // reports a complete Rs 0 subtotal with the kit still listed on screen.
    const b = await fetchOne(rawBooking({ booking_lines_v: [CHILD] }))
    expect(b.engineInput.linesSubtotal).toBeNull()
    expect(b.engineInput.linesSubtotal).not.toBe(rupees(0))
    expect(b.engineInput.equipment).toBeNull()
  })

  it('REFUSES to price a booking holding an orphan, naming the line', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [CHILD], booking_discounts: [] }), {
      withDiscounts: true,
    })
    const totals = priceCanonicalBooking(b, PRICEABLE)
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/Alexa Mini \(in kit\)/)
    expect(totals.reason).toMatch(/parent line is not among/)
    // A role change cannot restore a voided bundle line, so the Law 6 sentence
    // would send the operator to the wrong place.
    expect(totals.reason).not.toMatch(/not visible to this account/)
  })

  it('reports the orphan on the booking too, not only inside the refusal', async () => {
    // Both directions, the same rule the discount cap follows: a refusal alone
    // hides WHICH line is wrong from the screen, and a flag alone would still
    // let a total render.
    const b = await fetchOne(rawBooking({ booking_lines_v: [CHILD] }))
    expect(b.bundleIntegrity?.message).toMatch(/parent line is not live/)
    expect(b.bundleIntegrity?.orphanedChildIds).toContain('bundle-child')
  })

  it('keeps both reasons when an orphan is also contradictory', async () => {
    // Orphaned AND marked included while carrying a rate. Both are true, both
    // are actionable, so neither sentence is dropped in favour of the other.
    const b = await fetchOne(
      rawBooking({
        booking_lines_v: [{ ...CHILD, line_type: 'Accessory', is_included: true, rate: 500 }],
      }),
    )
    const refusal = b.lines[0]!.netTotalRefusal!
    expect(refusal).toMatch(/parent line is not among/)
    expect(refusal).toMatch(/marked as included/)
  })

  it('counts every orphan, not just the first', async () => {
    const b = await fetchOne(
      rawBooking({
        booking_lines_v: [CHILD, { ...CHILD, id: 'bundle-child-2', description: 'Tripod', sort_order: 3 }],
      }),
    )
    expect(b.bundleIntegrity?.orphanedChildIds).toEqual(['bundle-child', 'bundle-child-2'])
    expect(b.bundleIntegrity?.message).toMatch(/^2 lines/)
  })

  /* ── the other half: a well-formed bundle must still price ───────────── */

  it('does not accuse a child whose parent is live', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [PARENT, CHILD], booking_discounts: [] }), {
      withDiscounts: true,
    })
    const [p, c] = b.lines
    expect(p!.isBundleParentLive).toBeNull() // not a child at all
    expect(c!.isBundleParentLive).toBe(true)
    expect(c!.netTotal).toBe(rupees(0))
    expect(c!.netTotalRefusal).toBeNull()
    expect(b.bundleIntegrity).toEqual({ orphanedChildIds: [], message: null })
    // Rs 20,000 once — the guard must not refuse a healthy bundle.
    expect(b.engineInput.linesSubtotal).toBe(rupees(20000))
    expect(priceCanonicalBooking(b, PRICEABLE).ok).toBe(true)
  })

  it('leaves isBundleParentLive null on a line that is not a child', async () => {
    const b = await fetchOne(rawBooking())
    expect(b.lines[0]!.isBundleParentLive).toBeNull()
  })

  it('leaves bundleIntegrity null when the lines were never returned — not "no orphan"', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: null }))
    expect(b.bundleIntegrity).toBeNull()
  })

  it('caps the value that actually reaches price(), not only the one it inspected', async () => {
    // A CanonicalBooking assembled by hand whose lines lost their refusal — a
    // fixture, a cached payload, a realtime patch. bundleIntegrity still refuses.
    const healthy = await fetchOne(rawBooking({ booking_lines_v: [PARENT, CHILD], booking_discounts: [] }), {
      withDiscounts: true,
    })
    const tampered: CanonicalBooking = {
      ...healthy,
      bundleIntegrity: { orphanedChildIds: ['bundle-child'], message: 'A bundle parent line is not live.' },
    }
    const totals = priceCanonicalBooking(tampered, PRICEABLE)
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/bundle parent line is not live/)
  })
})

/* ══ Defect 6 · the unit embed, absent vs returned-and-empty ══════════════
 *
 * The same `?? []` the lines path was fixed to stop applying, one level down.
 * An absent unit collection counted as zero units, and the packing gate is
 * `requiredUnpackedQty === 0` — so absence read as a PASS.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('the unit embed — not returned vs returned-and-empty', () => {
  it('reports unitsPresence absent when a line’s unit embed comes back null', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: null }] }))
    expect(b.lines[0]!.unitsPresence).toBe('absent')
    expect(b.unitsPresence).toBe('absent')
  })

  it('reports unitsPresence absent when the key is missing entirely', async () => {
    // PostgREST can omit an embed as well as null it. Both are "not returned".
    const { booking_line_units: _dropped, ...withoutUnits } = LINE_EQUIPMENT
    const b = await fetchOne(rawBooking({ booking_lines_v: [withoutUnits as RawLine] }))
    expect(b.lines[0]!.unitsPresence).toBe('absent')
    expect(b.unitsPresence).toBe('absent')
  })

  it('does NOT pass the packing gate from an absent unit collection', async () => {
    // ⛔ THE DEFECT, minimally. `units ?? []` made every count 0, and the gate
    // is `requiredUnpackedQty === 0`, so 0 === 0 read as PASSED — a green tick
    // derived from an embed that never arrived, in front of an operator about
    // to hand over gear.
    const b = await fetchOne(rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: null }] }))
    expect(b.gates.requiredUnitsPacked).toBeNull()
    expect(b.gates.requiredUnitsPacked).not.toBe(true)
    expect(b.gates.hasDamagedUnit).toBeNull()
    expect(b.gates.hasMissingUnit).toBeNull()
  })

  it('lets ONE line with no units make the booking-wide gates unknown', async () => {
    // The counts are additive, so a line that contributed nothing is invisible
    // in the roll-up — the booking would report a confident pass off the other
    // line's units alone.
    const packed: RawLine = {
      ...LINE_EQUIPMENT,
      id: 'packed-line',
      sort_order: 1,
      booking_line_units: [{ id: 'a', qty: 4, unit_state: 'Ready', is_required: true, packed: true, damaged: false }],
    }
    const unknown: RawLine = { ...LINE_EQUIPMENT, id: 'unknown-line', sort_order: 2, booking_line_units: null }
    const b = await fetchOne(rawBooking({ booking_lines_v: [packed, unknown] }))
    expect(b.unitsPresence).toBe('absent')
    expect(b.gates.requiredUnitsPacked).toBeNull()
  })

  it('treats lines-absent as units-absent too, so the flag never reads present off nothing', async () => {
    const b = await fetchOne(rawBooking({ booking_lines_v: null }))
    expect(b.linesPresence).toBe('absent')
    expect(b.unitsPresence).toBe('absent')
  })

  /* ── the other half of the rule: a real "no units" must still count ──── */

  it('treats an empty-but-returned unit collection as a real zero', async () => {
    // A Quote has no serials assigned yet. That IS zero units, knowably.
    const b = await fetchOne(rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: [] }] }))
    expect(b.lines[0]!.unitsPresence).toBe('present')
    expect(b.unitsPresence).toBe('present')
    expect(b.lines[0]!.units.committedQty).toBe(0)
    expect(b.gates.requiredUnitsPacked).toBe(true)
  })

  it('keeps the two zero-unit cases distinguishable all the way to the caller', async () => {
    const absent = await fetchOne(
      rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: null }] }),
    )
    const empty = await fetchOne(rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: [] }] }))
    expect(absent.units.committedQty).toBe(empty.units.committedQty) // both 0 — the shape cannot carry it
    expect(absent.unitsPresence).not.toBe(empty.unitsPresence) // this field can
    expect(absent.gates.requiredUnitsPacked).toBeNull()
    expect(empty.gates.requiredUnitsPacked).toBe(true)
  })

  it('still prices a booking whose unit embed is absent — units are not money', async () => {
    // Law 6 hides money, not work; and the converse holds too. An unknown
    // packing state must not suppress a rental figure that IS known, or the
    // guard would be the opposite failure: hiding a figure that is knowable.
    const b = await fetchOne(
      rawBooking({ booking_lines_v: [{ ...LINE_EQUIPMENT, booking_line_units: null }], booking_discounts: [] }),
      { withDiscounts: true },
    )
    const totals = priceCanonicalBooking(b, PRICEABLE)
    expect(totals.ok).toBe(true)
    if (!totals.ok) return
    expect(toRupees(totals.breakdown.subtotal)).toBe(29000)
  })
})

/* ══ Defect 7 · unit qty is validated exactly as line qty is ══════════════ */

describe('booking_line_units.qty is validated at the boundary', () => {
  function withUnitQty(qty: number): void {
    db.state.row = rawBooking({
      booking_lines_v: [
        {
          ...LINE_EQUIPMENT,
          booking_line_units: [
            { id: 'u1', qty, unit_state: 'Ready', is_required: true, packed: false, damaged: false },
          ],
        },
      ],
    })
  }

  it('throws on a NaN unit qty, which would poison every count derived from it', async () => {
    // requiredUnpackedQty becomes NaN, and `NaN === 0` is false, so the gate
    // reports BLOCKED for a booking that may be fully packed — a fully-formed
    // wrong answer, with no error anywhere.
    withUnitQty(Number.NaN)
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/booking_line_units row u1 returned qty=/)
  })

  it('throws on a fractional unit qty', async () => {
    withUnitQty(2.5)
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/qty to a positive integer/)
  })

  it('throws on unit qty 0 — the schema constrains qty > 0 (0002:254)', async () => {
    withUnitQty(0)
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/qty to a positive integer/)
  })

  it('throws on a negative unit qty, which can cancel a genuinely blocking unit', async () => {
    // The dangerous direction: −1 subtracts from requiredUnpackedQty and can
    // bring a blocked booking back to 0, which reports the packing gate PASSED.
    withUnitQty(-1)
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/qty to a positive integer/)
  })

  it('throws on a non-numeric unit qty rather than coercing it', async () => {
    withUnitQty('3' as unknown as number)
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/qty to a positive integer/)
  })

  it('still accepts a bulk row — the guard must not over-refuse', async () => {
    withUnitQty(12)
    const b = await fetchCanonicalBooking(BOOKING_ID)
    expect(b!.units.committedQty).toBe(12)
  })
})

/* ══ Defect 8 · an unknown item_quantity_state, handled ONE way ═══════════
 *
 * It used to be handled two ways that disagreed: at line level
 * `byState[unknown] += qty` wrote a NEW key holding NaN, while `addUnitStates`
 * walks the accumulator's five known keys and so DROPPED those units from the
 * booking roll-up entirely. One route invents a NaN, the other loses the units.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('unknown item_quantity_state', () => {
  function withState(state: string): void {
    db.state.row = rawBooking({
      booking_lines_v: [
        {
          ...LINE_EQUIPMENT,
          booking_line_units: [
            {
              id: 'u1',
              qty: 2,
              unit_state: state as never,
              is_required: true,
              packed: false,
              damaged: false,
            },
          ],
        },
      ],
    })
  }

  it('throws rather than writing a NaN into byState or dropping the units', async () => {
    // Reachable for the same reason bucketOf's default is: ItemQuantityStateDb
    // comes from the GENERATED src/types/supabase.ts, so a migration adding a
    // sixth member leaves the compiler believing five are exhaustive while
    // Postgres returns a sixth.
    withState('Quarantined')
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/unknown item_quantity_state/)
  })

  it('names the offending value and the row', async () => {
    withState('Quarantined')
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/"Quarantined"/)
  })

  it('does not accept a prototype member as a state', async () => {
    // `unit_state in EMPTY_STATE_COUNTS` would be TRUE for 'toString', and
    // `byState.toString += 2` is NaN over a function. hasOwnProperty, not `in`.
    withState('toString')
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/unknown item_quantity_state/)
  })

  it('refuses a null unit_state rather than counting it', async () => {
    withState(null as unknown as string)
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow(/unknown item_quantity_state/)
  })

  it('is ONE behaviour — the line and the booking roll-up cannot disagree', async () => {
    // The point of the fix: previously the line gained a sixth NaN key and the
    // booking silently lost the units, so a reader comparing the two saw two
    // different answers. Now neither exists, because neither is produced.
    withState('Quarantined')
    await expect(fetchCanonicalBooking(BOOKING_ID)).rejects.toThrow()
  })

  it('still counts all five real members — the guard must not over-refuse', async () => {
    const b = await fetchOne(
      rawBooking({
        booking_lines_v: [
          {
            ...LINE_EQUIPMENT,
            booking_line_units: [
              { id: 'a', qty: 1, unit_state: 'Ready', is_required: true, packed: true, damaged: false },
              { id: 'b', qty: 1, unit_state: 'Picked Up', is_required: true, packed: true, damaged: false },
              { id: 'c', qty: 1, unit_state: 'Returned', is_required: true, packed: true, damaged: false },
              { id: 'd', qty: 1, unit_state: 'Missing', is_required: true, packed: false, damaged: false },
              { id: 'e', qty: 1, unit_state: 'Damaged', is_required: true, packed: true, damaged: true },
            ],
          },
        ],
      }),
    )
    expect(b.units.byState).toEqual({ Ready: 1, 'Picked Up': 1, Returned: 1, Missing: 1, Damaged: 1 })
    expect(Object.keys(b.units.byState)).toHaveLength(5)
    expect(b.units.committedQty).toBe(5)
  })
})

/* ══ Defect 9 · withDiscounts proves nothing, and the docs now say so ═════
 *
 * The flag is a caller-asserted boolean meaning "ask for the discount rows".
 * This module holds no session and verifies nothing about the caller. What
 * keeps a money-blind session's wrong 0% out of a rendered total is a SEPARATE
 * fact — 0019's line-level money masking — and these tests pin that
 * co-dependency, because the doc now names it as load-bearing.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('withDiscounts is a request, not a proof of money visibility', () => {
  /** What booking_lines_v returns to Warehouse / Technician / Driver / Client. */
  const MASKED: RawLine = { ...LINE_EQUIPMENT, rate: null, discount_amount: null }

  it('accepts the flag from a caller that proved nothing at all', async () => {
    // No session, no role, no ActionContext — the option is a bare boolean and
    // nothing here refuses it. Pinned so the doc cannot drift back to claiming
    // the caller "proved money visibility" by passing it.
    const b = await fetchOne(rawBooking({ booking_lines_v: [MASKED], booking_discounts: [] }), {
      withDiscounts: true,
    })
    // And the possibly-wrong figure IS produced: booking_discounts_money_blind
    // (0036:132) hands a money-blind session `[]`, which the flag reads as 0%.
    expect(b.engineInput.discountPercent).toBe(0)
  })

  it('is line-level masking, NOT the flag, that keeps the wrong 0% out of a total', async () => {
    // ⚠ The load-bearing pair. 0019:153 masks rate/discount_amount for exactly
    // the four money-blind roles, so every live line's netTotal is null, every
    // bucket is null, and the refusal fires before the 0% is multiplied by
    // anything. If line masking is ever relaxed without gating withDiscounts,
    // this test is what fails.
    const b = await fetchOne(rawBooking({ booking_lines_v: [MASKED], booking_discounts: [] }), {
      withDiscounts: true,
    })
    expect(b.engineInput.linesSubtotal).toBeNull()
    const totals = priceCanonicalBooking(b, PRICEABLE)
    expect(totals.ok).toBe(false)
    if (totals.ok) return
    expect(totals.reason).toMatch(/not visible to this account/)
  })

  it('leaves the discount unknown when the flag is off, whatever the session', async () => {
    // The one guarantee the flag really does carry: not asking keeps the answer
    // null rather than a confident, possibly wrong 0.
    const b = await fetchOne(rawBooking({ booking_lines_v: [MASKED] }))
    expect(b.engineInput.discountPercent).toBeNull()
    expect(b.discountIntegrity).toBeNull()
  })
})
