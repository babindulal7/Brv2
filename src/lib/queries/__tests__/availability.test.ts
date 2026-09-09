import { beforeEach, describe, it, expect, vi } from 'vitest'
import {
  parseTstzRange,
  toTstzRangeLiteral,
  planAssignment,
  findCollidingHolds,
  describeCollisions,
  readHeldForBooking,
  availabilityRules,
  AssignmentIncompleteError,
} from '../availability'
import { windowsOverlap, RENTAL_WINDOW_BOUNDS, type RentalWindow } from '../../availability'

/**
 * The two text-format functions, which are where a range round-trip goes wrong
 * silently. Everything else in `queries/availability.ts` is IO and is exercised
 * against the live project rather than mocked.
 *
 * A `tstzrange` read back wrong is the unsafe direction twice over: a hold that
 * fails to parse is DROPPED, so the unit reads as free.
 */
describe('parseTstzRange', () => {
  /**
   * ⭐ **Captured from the live database, 16 Aug 2026 — not composed here.**
   *
   * The reservation write path was driven against project `sxguwvgoserhdolewibb`
   * inside a transaction rolled back by `raise exception`, so nothing committed.
   * A row was inserted with exactly the literal `toTstzRangeLiteral` produces,
   * and `period::text` was read straight back. This is that value, verbatim:
   *
   *     ["2026-08-03 00:15:00+00","2026-08-05 00:15:00+00")
   *
   * It matters because every other case in this file states the shape the
   * parser was *designed* for. This one states the shape the database actually
   * returns — which is the thing that can silently disagree, and the disagreement
   * is unsafe in one direction: a hold that fails to parse is DROPPED, so the
   * unit reads as free and gets double-booked.
   *
   * Note what the round trip does NOT preserve: the literal written was
   * `[2026-08-03T00:15:00+00:00,…)` — `T` separator, `+00:00` offset. Postgres
   * normalised both. Same instants, different text, which is exactly why this
   * module compares parsed instants and never strings.
   */
  it('reads the exact text the live database returned for a written period', () => {
    const fromLiveDb = '["2026-08-03 00:15:00+00","2026-08-05 00:15:00+00")'
    const parsed = parseTstzRange(fromLiveDb)

    expect(parsed).not.toBeNull()
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse('2026-08-03T00:15:00Z'))
    expect(Date.parse(parsed?.toAd ?? '')).toBe(Date.parse('2026-08-05T00:15:00Z'))

    /* And the round trip closes: what was written parses back to what it meant. */
    const written = toTstzRangeLiteral(
      { fromAd: '2026-08-03T00:15:00+00:00', toAd: '2026-08-05T00:15:00+00:00' },
      'half-open',
    )
    expect(Date.parse(parseTstzRange(written)?.fromAd ?? '')).toBe(Date.parse(parsed?.fromAd ?? ''))
  })

  /* Postgres's own text output: a space instead of `T`, `+00` instead of `Z`,
     and a half-open upper bound. This exact string shape is what PostgREST
     hands back for a tstzrange column. */
  it("reads Postgres's text output, spaces and +00 and all", () => {
    const parsed = parseTstzRange('["2026-08-16 03:15:00+00","2026-08-18 12:15:00+00")')
    expect(parsed).not.toBeNull()
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse('2026-08-16T03:15:00Z'))
    expect(Date.parse(parsed?.toAd ?? '')).toBe(Date.parse('2026-08-18T12:15:00Z'))
  })

  it('reads it without the quotes, which Postgres omits when unambiguous', () => {
    const parsed = parseTstzRange('[2026-08-16 03:15:00+00,2026-08-18 12:15:00+00)')
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse('2026-08-16T03:15:00Z'))
  })

  it('reads a four-digit offset, which is what +05:45 comes back as', () => {
    const parsed = parseTstzRange('["2026-08-16 09:00:00+0545","2026-08-18 18:00:00+0545")')
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse('2026-08-16T09:00:00+05:45'))
  })

  it('accepts a closed upper bound too, so the convention can be re-ruled', () => {
    expect(parseTstzRange('["2026-08-16 03:15:00+00","2026-08-18 12:15:00+00"]')).not.toBeNull()
  })

  it('returns null rather than a wrong window for anything it cannot read', () => {
    expect(parseTstzRange('empty')).toBeNull()
    expect(parseTstzRange('')).toBeNull()
    expect(parseTstzRange('["2026-08-16 03:15:00+00",)')).toBeNull()
  })

  /*
   * The round trip is the property that matters: what this module writes, it
   * must be able to read back as the same two instants. A mismatch here means
   * a booking's own hold stops being recognisable as its own.
   */
  it('round-trips a window written by toTstzRangeLiteral', () => {
    const window: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }
    const parsed = parseTstzRange(toTstzRangeLiteral(window, RENTAL_WINDOW_BOUNDS))

    expect(parsed).not.toBeNull()
    expect(Date.parse(parsed?.fromAd ?? '')).toBe(Date.parse(window.fromAd))
    expect(Date.parse(parsed?.toAd ?? '')).toBe(Date.parse(window.toAd))
  })

  it('produces a window the overlap engine accepts', () => {
    const window: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }
    const parsed = parseTstzRange('["2026-08-17 03:15:00+00","2026-08-19 12:15:00+00")')

    expect(parsed).not.toBeNull()
    /* The engine rejects an instant with no offset (Law 7), so this also proves
       the parser restores one rather than handing over a naive timestamp. */
    expect(windowsOverlap(window, parsed as RentalWindow, RENTAL_WINDOW_BOUNDS)).toBe(true)
  })
})

describe('toTstzRangeLiteral', () => {
  const window: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }

  /* PLAN.md §4.30(b) ruled half-open, and the literal's closing bracket is
     where that ruling physically reaches the database.

     `bounds` is passed explicitly at every call below because the parameter no
     longer has a default — removed 16 Aug 2026 once `rentalTurnaround` became a
     Settings key, so that a period can never be WRITTEN under the ruled default
     while the availability check that produced it RAN under the owner's choice. */
  it('writes the ruled bound convention into the bracket', () => {
    expect(toTstzRangeLiteral(window, RENTAL_WINDOW_BOUNDS)).toBe(
      '[2026-08-16T09:00:00+05:45,2026-08-18T18:00:00+05:45)',
    )
  })

  it('tracks RENTAL_WINDOW_BOUNDS rather than hardcoding a bracket', () => {
    const expected = RENTAL_WINDOW_BOUNDS === 'closed' ? ']' : ')'
    expect(toTstzRangeLiteral(window, RENTAL_WINDOW_BOUNDS).endsWith(expected)).toBe(true)
  })

  it('can be asked for the other convention explicitly', () => {
    expect(toTstzRangeLiteral(window, 'closed').endsWith(']')).toBe(true)
    expect(toTstzRangeLiteral(window, 'half-open').endsWith(')')).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
 * THE PLAN AND THE WRITE — INV-02 and INV-05
 *
 * The header above says the IO half of this module is "exercised against the
 * live project rather than mocked". That held while the only thing it decided
 * was which serial to pick. It does not hold for the two things below, and
 * neither can be driven against the live project at all:
 *
 *  - the TRACKING-MODE SPLIT (INV-02) needs a Serialised product and a Quantity
 *    product on one booking, and the live catalogue is 204 of 204 Quantity;
 *  - the EXACT-COUNT contract (INV-05) is about a write path that reports
 *    success having written nothing, which cannot be provoked against a
 *    database that is working.
 *
 * So `lib/supabase` and `lib/dataAccess` are replaced by a small in-memory store
 * carrying the same filter vocabulary the module actually uses. It is a store,
 * not a stub handing back canned rows: the reads run their real predicates over
 * it, so a query that stops meaning what it says fails here rather than passing.
 *
 * ⚠ What no case below can prove, stated once and loudly: **the arbiters are not
 * emulated.** `enforce_inventory_reservation_capacity()` and
 * `inventory_reservations_no_double_booking` live in Postgres. Everything here
 * exercises the app-side PREVIEW of their answer, and a green run is not evidence
 * that the ceiling holds under two operators at once.
 * ══════════════════════════════════════════════════════════════════════════ */

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>

  const state = {
    tables: {} as Record<string, Row[]>,
    /** Every payload handed to `insertViaSourceSwitch`, in order. */
    inserts: [] as Array<{ table: string; payload: Row }>,
    /**
     * Ids the insert helper hands back, shifted per call. A `null` entry
     * reproduces `idempotentInsert`'s two silent branches — the offline queue and
     * the `'Failed to fetch'` / 408 retry — which echo the payload, carry no
     * `id`, and write no row (INV-05). An empty queue means "mint one and write
     * the row".
     */
    insertIds: [] as Array<string | null>,
    /** Ids written with `released_at` already set: an id came back, the row is not live. */
    ghostIds: new Set<string>(),
    /** Insert calls that should throw, by 1-based call number. */
    insertThrowsOn: new Map<number, string>(),
    /** Ids whose release UPDATE returns an error, so the hold is left stranded. */
    releaseErrors: new Set<string>(),
    seq: 0,
  }

  function rows(table: string): Row[] {
    const existing = state.tables[table]
    if (existing !== undefined) return existing
    const fresh: Row[] = []
    state.tables[table] = fresh
    return fresh
  }

  function reset(): void {
    state.tables = {}
    state.inserts = []
    state.insertIds = []
    state.ghostIds = new Set()
    state.insertThrowsOn = new Map()
    state.releaseErrors = new Set()
    state.seq = 0
  }

  function from(table: string) {
    const preds: Array<(r: Row) => boolean> = []
    let patch: Row | null = null
    let eqId: string | null = null

    function settle(): { data: unknown; error: { message: string } | null } {
      const hit = rows(table).filter((r) => preds.every((f) => f(r)))
      if (patch === null) return { data: hit, error: null }
      if (eqId !== null && state.releaseErrors.has(eqId)) {
        return { data: null, error: { message: `simulated failure releasing ${eqId}` } }
      }
      for (const r of hit) Object.assign(r, patch)
      return { data: hit, error: null }
    }

    const builder: Record<string, unknown> = {
      select() {
        return builder
      },
      update(next: Row) {
        patch = next
        return builder
      },
      eq(column: string, value: unknown) {
        if (column === 'id') eqId = String(value)
        preds.push((r) => r[column] === value)
        return builder
      },
      neq(column: string, value: unknown) {
        preds.push((r) => r[column] !== value)
        return builder
      },
      is(column: string, value: unknown) {
        preds.push((r) => (r[column] ?? null) === value)
        return builder
      },
      not(column: string, _operator: string, value: unknown) {
        preds.push((r) => (r[column] ?? null) !== value)
        return builder
      },
      in(column: string, values: unknown[]) {
        preds.push((r) => values.includes(r[column]))
        return builder
      },
      order() {
        return builder
      },
      maybeSingle() {
        const settled = settle()
        const list = (settled.data ?? []) as Row[]
        return Promise.resolve({ data: list[0] ?? null, error: settled.error })
      },
      then(onOk: unknown, onErr: unknown) {
        return Promise.resolve(settle()).then(onOk as never, onErr as never)
      },
    }
    return builder
  }

  return { state, rows, reset, from }
})

vi.mock('../../supabase', () => ({
  supabase: { from: db.from },
  newClientUuid: () => `key-${String(++db.state.seq).padStart(4, '0')}`,
  IS_MOCK: true,
}))

vi.mock('../../monitoring', () => ({ captureError: () => undefined }))

/* The two ruled defaults, stated rather than read out of `localStorage`, which
   does not exist in this suite's `node` environment. `boundsForTurnaround`
   resolves this label to `half-open` — PLAN.md §4.30(b). */
vi.mock('../../settingsStore', () => ({
  getSetting: (key: string) =>
    key === 'unitAvailabilityRule' ? 'Condition only' : 'Same-instant handover allowed',
}))

vi.mock('../../dataAccess', () => ({
  insertViaSourceSwitch: async (table: string, payload: Record<string, unknown>) => {
    db.state.inserts.push({ table, payload })
    const call = db.state.inserts.length
    const boom = db.state.insertThrowsOn.get(call)
    if (boom !== undefined) throw new Error(`[DataAccess] Insert failed on ${table}: ${boom}`)

    const queued = db.state.insertIds.length > 0 ? db.state.insertIds.shift() : `res-${call}`
    /* The INV-05 branch: the helper echoes the payload it was handed and reports
       no error, having QUEUED the write rather than made it. No id, no row. */
    if (queued === null || queued === undefined) return { data: { ...payload }, error: null }

    const row = {
      id: queued,
      ...payload,
      released_at: db.state.ghostIds.has(queued) ? '2026-09-07T00:00:00.000Z' : null,
      released_reason: db.state.ghostIds.has(queued) ? 'taken by something else' : null,
    }
    db.rows(table).push(row)
    return { data: row, error: null }
  },
}))

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const BOOKING_ID = '11111111-2222-4333-8444-555555555555'
const LINE_SERIAL = 'aaaaaaaa-0000-4000-8000-000000000001'
const LINE_QTY = 'bbbbbbbb-0000-4000-8000-000000000002'
const LINE_QTY_2 = 'eeeeeeee-0000-4000-8000-000000000005'
const P_SERIAL = 'cccccccc-0000-4000-8000-000000000003'
const P_QTY = 'dddddddd-0000-4000-8000-000000000004'

const PICKUP = '2026-08-16T09:00:00+05:45'
const RETURN = '2026-08-18T18:00:00+05:45'
/** Postgres's own text form, and a window that swallows the booking's whole. */
const OVERLAPPING = '["2026-08-10 04:00:00+00","2026-08-25 04:00:00+00")'

interface LineSpec {
  lineId: string
  productId: string
  qty: number
  description: string
}

/**
 * One Quote booking, its lines, and the catalogue rows behind them. A Serialised
 * product gets unit rows; a Quantity one gets none, which is what
 * `tracking_mode = 'Quantity'` MEANS (0001:504) and is exactly the live shape.
 */
function seed(options: { lines: LineSpec[]; serialUnits?: number; quantityTotal?: number }): void {
  db.reset()
  const serialUnits = options.serialUnits ?? 3
  db.rows('bookings').push({ id: BOOKING_ID, booking_no: 'B-715', pickup_at: PICKUP, return_at: RETURN })
  for (const line of options.lines) {
    db.rows('booking_lines').push({
      id: line.lineId,
      booking_id: BOOKING_ID,
      product_id: line.productId,
      qty: line.qty,
      line_type: 'Equipment',
      description: line.description,
      voided_at: null,
    })
  }
  db.rows('products_v').push(
    { id: P_SERIAL, tracking_mode: 'Serialised', total_quantity: serialUnits },
    { id: P_QTY, tracking_mode: 'Quantity', total_quantity: options.quantityTotal ?? 5 },
  )
  for (let n = 1; n <= serialUnits; n += 1) {
    db.rows('product_units_v').push({
      id: `unit-${n}`,
      asset_tag: `EQ000001-U0${n}`,
      serial_no: `SN-00${n}`,
      product_id: P_SERIAL,
      status: 'In Stock',
      retired_at: null,
    })
  }
}

/** One live PRODUCT-level hold on the bulk product, across the booking's window. */
function holdBulk(qty: number, bookingNo = 'B-880'): void {
  db.rows('inventory_reservations').push({
    id: `existing-${bookingNo}-${qty}`,
    booking_id: `other-${bookingNo}`,
    booking_line_id: 'other-line',
    asset_id: null,
    product_id: P_QTY,
    qty,
    period: OVERLAPPING,
    released_at: null,
    bookings: { booking_no: bookingNo },
  })
}

const SERIAL_LINE: LineSpec = { lineId: LINE_SERIAL, productId: P_SERIAL, qty: 1, description: 'Sony FX3' }
const QTY_LINE: LineSpec = { lineId: LINE_QTY, productId: P_QTY, qty: 2, description: 'BNC Cable 3m' }

/* ── The split ───────────────────────────────────────────────────────────── */

describe('planAssignment — the tracking-mode split (INV-02)', () => {
  beforeEach(() => {
    db.reset()
  })

  /**
   * ⭐ The defect, stated as a test. Before 7 Sep 2026 this booking was refused:
   * a `Quantity` product has no `product_units` rows, `readCandidates` returned
   * an empty pool, and `selectUnitsForLine` reported a shortfall equal to the
   * whole line. On the live project every one of 204 products is in this state,
   * so this is every booking.
   */
  it('plans a quantity line by capacity instead of demanding serials it cannot have', async () => {
    seed({ lines: [QTY_LINE], quantityTotal: 5 })
    holdBulk(3)

    const plan = await planAssignment(BOOKING_ID)

    expect(plan.complete).toBe(true)
    expect(plan.lines).toHaveLength(1)
    const line = plan.lines[0]
    if (line === undefined || line.kind !== 'quantity') throw new Error('expected one quantity line')
    expect(line.capacity.peakHeld).toBe(3)
    expect(line.capacity.free).toBe(2)
    expect(line.capacity.shortfall).toBe(0)
    expect(line.problem).toBeNull()
  })

  it('refuses it inline, naming the shortfall and the booking, when one more is held', async () => {
    seed({ lines: [QTY_LINE], quantityTotal: 5 })
    holdBulk(4)

    const plan = await planAssignment(BOOKING_ID)

    expect(plan.complete).toBe(false)
    expect(plan.lines[0]?.problem).toContain('BNC Cable 3m')
    expect(plan.lines[0]?.problem).toContain('B-880')
    expect(new AssignmentIncompleteError(plan).message).toContain('B-715 cannot be confirmed')
  })

  it('leaves a serialised line on the unit path, untouched', async () => {
    seed({ lines: [SERIAL_LINE], serialUnits: 3 })

    const plan = await planAssignment(BOOKING_ID)

    const line = plan.lines[0]
    if (line === undefined || line.kind !== 'serialised') throw new Error('expected one serialised line')
    expect(line.outcome.assigned.map((unit) => unit.assetTag)).toEqual(['EQ000001-U01'])
    expect(line.outcome.shortfall).toBe(0)
  })

  /** One booking, both modes — the case neither half of the engine sees alone. */
  it('plans a mixed booking, one line down each path, in one plan', async () => {
    seed({ lines: [SERIAL_LINE, QTY_LINE], serialUnits: 2, quantityTotal: 5 })
    holdBulk(3)

    const plan = await planAssignment(BOOKING_ID)

    expect(plan.complete).toBe(true)
    expect(plan.lines.map((entry) => entry.kind)).toEqual(['serialised', 'quantity'])
  })

  /**
   * Two lines naming the same bulk product must not both be told the same five
   * are free. Nothing in the database would catch it until the second row hit
   * 0045's ceiling — the same reasoning the `claimed` unit set carries on the
   * serialised side.
   */
  it('does not promise the same bulk stock to two lines of one booking', async () => {
    seed({
      lines: [
        { lineId: LINE_QTY, productId: P_QTY, qty: 3, description: 'BNC Cable 3m' },
        { lineId: LINE_QTY_2, productId: P_QTY, qty: 3, description: 'BNC Cable 3m' },
      ],
      quantityTotal: 5,
    })

    const plan = await planAssignment(BOOKING_ID)

    expect(plan.lines[0]?.problem).toBeNull()
    expect(plan.complete).toBe(false)
    expect(plan.lines[1]?.problem).toContain('an earlier line on this booking')
  })

  /**
   * A line naming a product the catalogue cannot return is REFUSED, not skipped.
   * `skipped` lines do not count against `complete`, so skipping would confirm a
   * booking carrying a line whose stock was never checked and never held.
   */
  it('refuses outright when a line names a product it cannot read', async () => {
    seed({ lines: [QTY_LINE] })
    db.state.tables['products_v'] = []

    await expect(planAssignment(BOOKING_ID)).rejects.toThrow(/could not be read from the catalogue/)
  })

  /** A bundle line still names no product and is still reported, not guessed at. */
  it('still reports a product-less line as skipped rather than planning it', async () => {
    seed({ lines: [] })
    db.rows('booking_lines').push({
      id: 'ffffffff-0000-4000-8000-000000000006',
      booking_id: BOOKING_ID,
      product_id: null,
      qty: 1,
      line_type: 'Bundle',
      description: 'Lens Set',
      voided_at: null,
    })

    const plan = await planAssignment(BOOKING_ID)

    expect(plan.lines).toHaveLength(0)
    expect(plan.skipped).toHaveLength(1)
  })
})

/* ── The courtesy check that replaced the write (R-26) ───────────────────── */

/**
 * RULING 2026-09-08 (R-26). Everything that used to be below this line —
 * `reserveAssignedUnits` and `releaseReservations`, fourteen cases across three
 * describes — tested an application write path into `inventory_reservations`
 * that no longer exists. Postgres writes the holds now, from the Booked
 * transition (`0100_reservations_written_by_transition.sql`).
 *
 * Those cases are not re-homed here and should not be: they proved that the app
 * wrote the right ROWS, and the header above already said what they could never
 * prove — *"the arbiters are not emulated"*. The behaviour they stood in for is
 * now tested where it can actually be executed, against a real Postgres, in
 * `scripts/e2e-lifecycle.mjs` (`npm run check:lifecycle`, R-27): L2 asserts one
 * reservation appears at Booked, L3 that an overlapping second confirm is
 * refused and the booking stays a Quote, L5 that the quantity ceiling refuses,
 * and L7 that a return releases.
 *
 * What is left on this side is a READ, and reads are what this suite is for.
 */
describe('findCollidingHolds — the same question the constraint asks', () => {
  const BOUNDS = availabilityRules().bounds
  const WINDOW = { fromAd: PICKUP, toAd: RETURN }

  beforeEach(() => {
    db.reset()
  })

  /** One live SERIAL hold, as `readHolds` reads it back (embedded booking_no). */
  function holdUnit(unitId: string, bookingNo: string, period = OVERLAPPING, released = false): void {
    db.rows('inventory_reservations').push({
      id: `hold-${bookingNo}-${unitId}`,
      booking_id: `other-${bookingNo}`,
      booking_line_id: 'other-line',
      asset_id: unitId,
      product_id: null,
      qty: 1,
      period,
      released_at: released ? '2026-09-07T00:00:00.000Z' : null,
      bookings: { booking_no: bookingNo },
    })
  }

  it('says nothing when no live hold names a unit this booking wants', async () => {
    expect(await findCollidingHolds(['unit-1', 'unit-2'], WINDOW, BOUNDS, BOOKING_ID)).toEqual([])
  })

  it('names the booking already holding a wanted unit over an overlapping window', async () => {
    holdUnit('unit-1', 'B-912')

    const collisions = await findCollidingHolds(['unit-1'], WINDOW, BOUNDS, BOOKING_ID)

    expect(collisions).toEqual([{ unitId: 'unit-1', bookingNo: 'B-912' }])
  })

  it('ignores a released hold — Law 3 keeps the row, and a released row holds nothing', async () => {
    holdUnit('unit-1', 'B-912', OVERLAPPING, true)

    expect(await findCollidingHolds(['unit-1'], WINDOW, BOUNDS, BOOKING_ID)).toEqual([])
  })

  it('ignores a hold on a unit this plan did not ask for', async () => {
    holdUnit('unit-3', 'B-912')

    expect(await findCollidingHolds(['unit-1'], WINDOW, BOUNDS, BOOKING_ID)).toEqual([])
  })

  /**
   * The bracket, end to end. `RENTAL_WINDOW_BOUNDS` is `half-open` and `0100`
   * writes `tstzrange(pickup_at, return_at, '[)')`; a hold starting exactly when
   * this window ends therefore does not collide. If this case ever flips, the app
   * and the constraint have stopped asking the same question.
   */
  it('does not collide with a hold that starts exactly when this window ends', async () => {
    holdUnit('unit-1', 'B-912', '["2026-08-18 12:15:00+00","2026-08-20 04:00:00+00")')

    expect(await findCollidingHolds(['unit-1'], WINDOW, BOUNDS, BOOKING_ID)).toEqual([])
  })

  it('never reports the booking against itself — its own holds are excluded', async () => {
    db.rows('inventory_reservations').push({
      id: 'own-hold',
      booking_id: BOOKING_ID,
      booking_line_id: LINE_SERIAL,
      asset_id: 'unit-1',
      product_id: null,
      qty: 1,
      period: OVERLAPPING,
      released_at: null,
      bookings: { booking_no: 'B-715' },
    })

    expect(await findCollidingHolds(['unit-1'], WINDOW, BOUNDS, BOOKING_ID)).toEqual([])
  })

  it('asks nothing at all when the plan wants no serials — the live catalogue case', async () => {
    holdUnit('unit-1', 'B-912')

    expect(await findCollidingHolds([], WINDOW, BOUNDS, BOOKING_ID)).toEqual([])
  })
})

describe('describeCollisions — the sentence an operator can act on', () => {
  it('is null when nothing collides, so the caller has one thing to test', () => {
    expect(describeCollisions([])).toBeNull()
  })

  it('names one booking once however many of its units are in the way', () => {
    const sentence = describeCollisions([
      { unitId: 'unit-1', bookingNo: 'B-912' },
      { unitId: 'unit-2', bookingNo: 'B-912' },
    ])

    expect(sentence).toBe('2 units are already held for these dates by booking B-912.')
  })

  it('lists every booking involved, sorted, so the operator knows who to ring', () => {
    const sentence = describeCollisions([
      { unitId: 'unit-2', bookingNo: 'B-920' },
      { unitId: 'unit-1', bookingNo: 'B-912' },
    ])

    expect(sentence).toBe('2 units are already held for these dates by bookings B-912, B-920.')
  })

  it('says "1 unit is" rather than "1 units are"', () => {
    expect(describeCollisions([{ unitId: 'unit-1', bookingNo: 'B-912' }])).toBe(
      '1 unit is already held for these dates by booking B-912.',
    )
  })
})

describe('readHeldForBooking — what the DATABASE holds, read back', () => {
  beforeEach(() => {
    db.reset()
  })

  it('reports zeroes for a booking holding nothing', async () => {
    expect(await readHeldForBooking(BOOKING_ID)).toEqual({
      units: 0,
      quantityHolds: 0,
      quantityReserved: 0,
    })
  })

  /**
   * The two shapes are counted separately for the reason the result type gives:
   * one product row can hold forty cables, and a cable held by a count is not a
   * body with a serial on it.
   */
  it('counts serial holds as rows and quantity holds as rows AND items', async () => {
    db.rows('inventory_reservations').push(
      { booking_id: BOOKING_ID, asset_id: 'unit-1', product_id: null, qty: 1, released_at: null },
      { booking_id: BOOKING_ID, asset_id: 'unit-2', product_id: null, qty: 1, released_at: null },
      { booking_id: BOOKING_ID, asset_id: null, product_id: P_QTY, qty: 40, released_at: null },
    )

    expect(await readHeldForBooking(BOOKING_ID)).toEqual({
      units: 2,
      quantityHolds: 1,
      quantityReserved: 40,
    })
  })

  it('leaves released rows out — they are history, not stock off the shelf', async () => {
    db.rows('inventory_reservations').push(
      { booking_id: BOOKING_ID, asset_id: 'unit-1', product_id: null, qty: 1, released_at: null },
      {
        booking_id: BOOKING_ID,
        asset_id: 'unit-2',
        product_id: null,
        qty: 1,
        released_at: '2026-09-07T00:00:00.000Z',
      },
    )

    expect((await readHeldForBooking(BOOKING_ID)).units).toBe(1)
  })

  it('counts only this booking, never the whole table', async () => {
    db.rows('inventory_reservations').push(
      { booking_id: BOOKING_ID, asset_id: 'unit-1', product_id: null, qty: 1, released_at: null },
      { booking_id: 'other-booking', asset_id: 'unit-9', product_id: null, qty: 1, released_at: null },
    )

    expect((await readHeldForBooking(BOOKING_ID)).units).toBe(1)
  })
})
