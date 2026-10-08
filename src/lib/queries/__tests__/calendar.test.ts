import { beforeEach, describe, expect, it, vi } from 'vitest'

import { calendarWindow, fetchCalendarBars, listCalendarBookings, listCalendarDrafts } from '../calendar'

/**
 * # What this suite pins
 *
 * `lib/queries/calendar.ts` is the Calendar Workspace's only read, and it is the
 * one query in the app that asks an OVERLAP rather than a range. Three things
 * can break it silently:
 *
 *  1. **The overlap collapsing to a single-column range.** `pickup_at <= close`
 *     without `return_at >= open` (or the reverse) still returns rows and still
 *     draws a plausible calendar — it just loses the bookings that started
 *     before the window and are still out, which are the ones an operator most
 *     needs. Nothing errors. The `gte`/`lte` pair is asserted by column and by
 *     value.
 *  2. **A money column reaching the select.** The Calendar is a Warehouse
 *     surface (Foundation §8.3) and the module's guarantee is structural: the
 *     projection names no money column. A column added in passing would not
 *     fail anything.
 *  3. **A stage gaining a bar it has no legend kind for.** `Returned` and
 *     `Closed` are 190 of the 246 live bookings; drawing them as `Reserved` or
 *     `On Rent` would put 190 wrong bars on the grid, each of them looking
 *     exactly like a real one.
 *
 * The `supabase` module is replaced wholesale, in the same shape
 * `bookings.test.ts` uses, so the assertions are on the arguments the builder
 * receives — the only place a wrong column name is still visible as text.
 * Nothing here reaches a database.
 */

const db = vi.hoisted(() => {
  interface State {
    table: string
    columns: string
    /** The second argument to `select` — where `{ count: 'exact' }` lands. */
    selectOptions: unknown
    calls: Array<[string, ...unknown[]]>
    rows: unknown[]
    draftRows: unknown[]
    /** What PostgREST reports as the full matching count, independent of `rows`. */
    count: number | null
    error: { message: string } | null
  }

  const state: State = { table: '', columns: '', selectOptions: undefined, calls: [], rows: [], draftRows: [], count: null, error: null }

  function reset(): void {
    state.table = ''
    state.columns = ''
    state.selectOptions = undefined
    state.calls = []
    state.rows = []
    state.draftRows = []
    state.count = null
    state.error = null
  }

  const builder = {
    select(columns: string, options?: unknown) {
      state.columns = columns
      state.selectOptions = options
      return builder
    },
    limit(n: number) {
      state.calls.push(['limit', n])
      return builder
    },
    eq(column: string, value: unknown) {
      state.calls.push(['eq', column, value])
      return builder
    },
    in(column: string, values: readonly unknown[]) {
      state.calls.push(['in', column, [...values]])
      return builder
    },
    gte(column: string, value: unknown) {
      state.calls.push(['gte', column, value])
      return builder
    },
    lte(column: string, value: unknown) {
      state.calls.push(['lte', column, value])
      return builder
    },
    is(column: string, value: unknown) {
      state.calls.push(['is', column, value])
      return builder
    },
    order(column: string, options?: unknown) {
      state.calls.push(['order', column, options])
      return builder
    },
    then(
      onFulfilled: (value: { data: unknown[] | null; error: { message: string } | null; count: number | null }) => unknown,
    ): void {
      onFulfilled({ data: state.table === 'rental_drafts' ? state.draftRows : state.rows, error: state.error, count: state.table === 'rental_drafts' ? state.draftRows.length : state.count })
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

vi.mock('../../supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

beforeEach(() => {
  db.reset()
})

/**
 * The operational day starts at 06:00 by default (D4, ruled 30 Aug 2026), so a
 * window of 1–7 Sep opens at 06:00 on the 1st and closes at 05:59:59.999 on the
 * 8th — both stamped `+05:45`. These are the same boundaries `todaysOutgoing`
 * builds, which is where the module lifts them from rather than re-deriving
 * Nepal's offset.
 */
const WINDOW = { from: '2026-09-01', to: '2026-09-07' }
const WINDOW_OPEN = '2026-09-01T06:00:00.000+05:45'
const WINDOW_CLOSE = '2026-09-08T05:59:59.999+05:45'

function rawBooking(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    booking_no: 'B-918',
    project: 'Documentary Project',
    stage: 'Booked',
    // 04:00Z is 09:45 in Kathmandu on 3 Sep, which is inside the 3 Sep
    // operational day whichever way the 06:00 start is applied.
    pickup_at: '2026-09-03T04:00:00.000Z',
    return_at: '2026-09-05T10:00:00.000Z',
    cancelled_at: null,
    clients: { name: 'Himalayan Films' },
    ...over,
  }
}

function callFor(verb: string, column: string): [string, ...unknown[]] | undefined {
  return db.state.calls.find((c) => c[0] === verb && c[1] === column)
}

describe('listCalendarBookings — the query', () => {
  it('reads the bookings table', async () => {
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(db.state.table).toBe('bookings')
  })

  it('asks an OVERLAP: pickup_at <= the window close AND return_at >= the window open', async () => {
    // The whole reason this module exists. A booking that started in August and
    // is still out in September has `pickup_at` before the window and
    // `return_at` after it; only the pair of bounds, on two DIFFERENT columns,
    // selects it. `ListFilters.dateRange` carries one column and cannot.
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(callFor('lte', 'pickup_at')).toEqual(['lte', 'pickup_at', WINDOW_CLOSE])
    expect(callFor('gte', 'return_at')).toEqual(['gte', 'return_at', WINDOW_OPEN])
  })

  it('never bounds one column at both ends, which is the shape that loses in-flight bookings', async () => {
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(callFor('gte', 'pickup_at')).toBeUndefined()
    expect(callFor('lte', 'return_at')).toBeUndefined()
  })

  it('asks only for the stages that have a bar kind', async () => {
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(callFor('in', 'stage')).toEqual(['in', 'stage', ['Quote', 'Booked', 'Packed', 'On Rent', 'Returned', 'Closed']])
  })

  it('excludes cancellations by the flag, never by a stage', async () => {
    // Law 3 / 0015 — 'Cancelled' is a timestamp, not a member of `booking_stage`.
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(callFor('is', 'cancelled_at')).toEqual(['is', 'cancelled_at', null])
  })

  it('orders totally, so two reads of one window agree on the sequence', async () => {
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(db.state.calls.filter((c) => c[0] === 'order')).toEqual([
      ['order', 'pickup_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
    ])
  })

  it('caps the read explicitly instead of inheriting PostgREST’s silent row ceiling', async () => {
    // Without a `.limit()` the platform applies its own and says nothing about
    // it: a short array, a 200 status, and a month drawn with bookings missing.
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    const limit = db.state.calls.find((c) => c[0] === 'limit')
    expect(limit).toBeDefined()
    expect(typeof limit?.[1]).toBe('number')
  })

  it('asks for the exact count, so a truncated window is detectable', async () => {
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(db.state.selectOptions).toEqual({ count: 'exact' })
  })

  it('reports the exact count as `total`, not the number of rows that came back', async () => {
    // The whole point: `total > rows.length` is how the screen learns it is
    // drawing a partial window. `total = rows.length` could never say so.
    db.state.rows = [rawBooking()]
    db.state.count = 1200
    const { rows, total } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows).toHaveLength(1)
    expect(total).toBe(1200)
  })

  it('falls back to the row count when the server reports none, rather than inventing a total', async () => {
    db.state.rows = [rawBooking()]
    db.state.count = null
    const { total } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(total).toBe(1)
  })

  it('selects no money column', async () => {
    // Foundation §8.3 — the Warehouse role sees no financial figure. The
    // guarantee is that the projection cannot carry one, so it is checked as
    // text rather than trusted from the caller.
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    for (const money of [
      'deposit_required',
      'rate',
      'total',
      'subtotal',
      'vat',
      'discount',
      'paid_amount',
      'outstanding',
      'amount',
    ]) {
      expect(db.state.columns).not.toContain(money)
    }
  })

  it('selects every column the mapping reads', async () => {
    await listCalendarBookings(WINDOW.from, WINDOW.to)
    for (const column of ['id', 'booking_no', 'project', 'stage', 'pickup_at', 'return_at', 'cancelled_at']) {
      expect(db.state.columns).toContain(column)
    }
    expect(db.state.columns).toContain('clients ( name )')
  })

  it('rethrows a query failure rather than returning an empty calendar', async () => {
    // An empty grid and a failed read look identical to an operator. They must
    // not be the same value here.
    db.state.error = { message: 'JWT expired' }
    await expect(listCalendarBookings(WINDOW.from, WINDOW.to)).rejects.toThrow(/JWT expired/)
  })
})

describe('listCalendarBookings — booking → bar', () => {
  it('carries the booking number as the label AND as bookingNo', async () => {
    db.state.rows = [rawBooking()]
    const { rows } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows[0]?.label).toBe('B-918')
    // The screen decides whether a bar can be opened from this field, not by
    // pattern-matching the label.
    expect(rows[0]?.bookingNo).toBe('B-918')
  })

  it('keys the bar on the row uuid, not on the number', async () => {
    db.state.rows = [rawBooking()]
    const { rows } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows[0]?.id).toBe('bk-11111111-1111-4111-8111-111111111111')
  })

  it('maps Booked and Packed to Reserved, and On Rent to On Rent', async () => {
    db.state.rows = [
      rawBooking({ id: 'a', stage: 'Booked' }),
      rawBooking({ id: 'b', stage: 'Packed' }),
      rawBooking({ id: 'c', stage: 'On Rent' }),
    ]
    const { rows } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows.map((r) => r.kind)).toEqual(['Reserved', 'Reserved', 'On Rent'])
  })

  it('puts the client and the project on the sub-line, and the client on the filter field', async () => {
    db.state.rows = [rawBooking()]
    const { rows } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows[0]?.sub).toBe('Himalayan Films · Documentary Project')
    expect(rows[0]?.client).toBe('Himalayan Films')
  })

  it('drops the separator when a booking has no project', async () => {
    db.state.rows = [rawBooking({ project: null })]
    const { rows } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows[0]?.sub).toBe('Himalayan Films')
  })

  it('says so when the client join is missing rather than printing a dash', async () => {
    db.state.rows = [rawBooking({ clients: null, project: null })]
    const { rows } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows[0]?.sub).toBe('Client not recorded')
  })

  it('lands from/to on UTC midnight of the operational day each instant belongs to', async () => {
    // `Bar.from` / `Bar.to` are UTC-midnight AD days — the shape `place()` and
    // `coversDay()` on the screen compare against. An instant here would put
    // every bar a fraction of a column out.
    db.state.rows = [rawBooking()]
    const { rows } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows[0]?.from.toISOString()).toBe('2026-09-03T00:00:00.000Z')
    expect(rows[0]?.to.toISOString()).toBe('2026-09-05T00:00:00.000Z')
  })

  it('keeps a same-day booking one day wide, not zero', async () => {
    db.state.rows = [rawBooking({ return_at: '2026-09-03T11:00:00.000Z' })]
    const { rows } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows[0]?.from.getTime()).toBe(rows[0]?.to.getTime())
  })

  it('clamps a return recorded before its pickup instead of dropping the bar', async () => {
    // The database does not forbid it, and a negative span renders as nothing —
    // a booking that silently vanishes from the grid is worse than a short one.
    db.state.rows = [rawBooking({ return_at: '2026-09-01T10:00:00.000Z' })]
    const { rows } = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(rows[0]?.to.getTime()).toBe(rows[0]?.from.getTime())
  })
})

describe('calendarWindow / fetchCalendarBars — the useList adapter', () => {
  it('shows finished bookings quietly and quotes without claiming a reservation', async () => {
    db.state.rows = [rawBooking({ stage: 'Returned' }), rawBooking({ id: 'b', stage: 'Closed' }), rawBooking({ id: 'c', stage: 'Quote' })]
    const result = await listCalendarBookings(WINDOW.from, WINDOW.to)
    expect(result.rows.map(row => row.kind)).toEqual(['Completed', 'Completed', 'Quote'])
    expect(result.rows[2]?.sub).toContain('not reserved')
    expect(db.state.calls.some(call => ['insert', 'update', 'rpc'].includes(call[0]))).toBe(false)
  })

  it('shows provisional draft dates without reading their money snapshot or creating reservations', async () => {
    db.state.draftRows = [{ id: 'draft-uuid', booking_no: '3', client_name: 'Babin', project: '', pickup: '2026-09-03', return_date: '2026-09-05' }]
    const result = await listCalendarDrafts(WINDOW.from, WINDOW.to)
    expect(result.rows[0]).toMatchObject({ kind: 'Draft', draftId: 'draft-uuid', label: 'Draft #3', sub: 'Babin · not reserved' })
    expect(result.rows[0]?.from.toISOString()).toBe('2026-09-03T00:00:00.000Z')
    expect(db.state.columns.split(',').map(column => column.trim())).not.toContain('data')
    expect(db.state.columns).not.toMatch(/rate|total|deposit|amount|discount/)
  })

  it('round-trips the window through the filter set', async () => {
    await fetchCalendarBars(calendarWindow(WINDOW.from, WINDOW.to))
    expect(callFor('lte', 'pickup_at')).toEqual(['lte', 'pickup_at', WINDOW_CLOSE])
    expect(callFor('gte', 'return_at')).toEqual(['gte', 'return_at', WINDOW_OPEN])
  })

  it('refuses a filter set with no window rather than fetching every booking', async () => {
    await expect(fetchCalendarBars({})).rejects.toThrow(/needs a window/)
    expect(db.state.table).toBe('')
  })
})
