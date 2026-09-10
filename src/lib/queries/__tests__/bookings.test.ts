import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listBookings,
  operationalToday,
  operationQueue,
  overdue,
  quotesExpiring,
  todaysIncoming,
  todaysOutgoing,
  type BookingListRow,
} from '../bookings'
import { filterKey } from '../listQuery'
import { BOOKING_STATUS } from '../../workflow'
import { bookingsCreatedOn } from '../closing'
import { getBusinessToday } from '../../bs'

/**
 * # What this suite pins
 *
 * `bookings.ts` is the Single Query Rule's one list query, so the two things
 * that can silently break every screen at once are (a) the SELECT string — a
 * column dropped from it does not error, it arrives `undefined` and renders as
 * a blank cell — and (b) `toRow`, where a raw snake_case row becomes the view
 * model. Neither is reachable from `listQuery.test.ts`, which tests the
 * builder in isolation and never sees a column name.
 *
 * The `supabase` module is replaced wholesale rather than stubbed at the
 * network layer: this file asserts on the exact arguments the query builder
 * receives, which is the only place a wrong column name is still visible as
 * text. Nothing here reaches a database.
 */

const db = vi.hoisted(() => {
  interface State {
    /** The table `from()` was called with — the LAST one, if there were several. */
    table: string
    /**
     * Every table `from()` was called with, in order. `listBookings({ withDeposit })`
     * makes two calls now — `bookings`, then `bookings_deposit_v` (0061) — and a
     * single `table` field cannot show the second one happening at all.
     */
    tables: string[]
    /** The literal string handed to `.select()` — the thing a dropped column disappears from. */
    columns: string
    /** `.select()`'s second argument: `{ count: 'exact' }` or `undefined`. */
    selectOptions: unknown
    /** Every filter call, in order, exactly as `applyListFilters` made it. */
    calls: Array<[string, ...unknown[]]>
    /** What the awaited query resolves to. */
    rows: unknown[]
    count: number | null
    error: { message: string } | null
  }

  const state: State = {
    table: '',
    tables: [],
    columns: '',
    selectOptions: undefined,
    calls: [],
    rows: [],
    count: null,
    error: null,
  }

  function reset(): void {
    state.table = ''
    state.tables = []
    state.columns = ''
    state.selectOptions = undefined
    state.calls = []
    state.rows = []
    state.count = null
    state.error = null
  }

  /**
   * A recording stand-in for the postgrest builder. It is deliberately
   * *thenable* rather than a promise: `listBookings` does `await query`, so the
   * object it has been chaining onto is what gets awaited.
   */
  const builder = {
    select(columns: string, options?: unknown) {
      state.columns = columns
      state.selectOptions = options
      return builder
    },
    or(filters: string) {
      state.calls.push(['or', filters])
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
    not(column: string, operator: string, value: unknown) {
      state.calls.push(['not', column, operator, value])
      return builder
    },
    order(column: string, options?: unknown) {
      state.calls.push(['order', column, options])
      return builder
    },
    range(from: number, to: number) {
      state.calls.push(['range', from, to])
      return builder
    },
    then(
      onFulfilled: (value: {
        data: unknown[] | null
        error: { message: string } | null
        count: number | null
      }) => unknown,
    ): void {
      onFulfilled({ data: state.rows, error: state.error, count: state.count })
    },
  }

  const supabase = {
    from(table: string) {
      state.table = table
      state.tables.push(table)
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

/** Split the select string into its top-level tokens. Embeds keep their own commas, which is fine — none of them is a bare column name. */
function selectTokens(): string[] {
  return db.state.columns.split(',').map((t) => t.trim())
}

function occurrences(column: string): number {
  return selectTokens().filter((t) => t === column).length
}

/**
 * The four columns added on 12 Aug 2026, each verified in
 * `supabase/migrations/0002_bookings.sql` before being named:
 * `pickup_location` :35, `return_location` :36, `quote_expires_at` :37,
 * `created_at` :46 — and cross-checked against the generated
 * `src/types/supabase.ts` `bookings.Row`.
 */
const NEW_COLUMNS = ['pickup_location', 'return_location', 'quote_expires_at', 'created_at'] as const

describe('BASE_COLUMNS — the select string', () => {
  it('reads the bookings table', async () => {
    await listBookings()
    expect(db.state.table).toBe('bookings')
  })

  it('names each new column exactly once', async () => {
    // Once, not "at least once": a duplicated column is not an error PostgREST
    // reports, it is a wider request that quietly survives the next edit and
    // makes the next duplication invisible.
    await listBookings()
    for (const column of NEW_COLUMNS) {
      expect(occurrences(column)).toBe(1)
    }
  })

  it('keeps every column the list already selected', async () => {
    await listBookings()
    for (const column of [
      'id',
      'booking_no',
      'client_id',
      'project',
      'stage',
      'pickup_at',
      'return_at',
      'actual_return_at',
      'delivery_type',
      'cancelled_at',
      'closed_at',
    ]) {
      expect(occurrences(column)).toBe(1)
    }
    // The two embeds, which carry their own internal commas.
    expect(db.state.columns).toContain('clients ( name )')
    expect(db.state.columns).toContain('booking_lines ( id, qty )')
  })

  /*
   * Rewritten 16 Aug 2026. This pair used to assert that `withDeposit` ADDED
   * `deposit_required` to the base select. It no longer does: the column comes
   * from `bookings_deposit_v` (0061), which masks it per role, so the property
   * worth pinning is now the stronger one — **this module never names the column
   * on the base table, whatever the caller asks for.**
   *
   * `0062` IS applied on live now (28 Aug 2026), so the grant hides the column
   * at the database. This test stays anyway: "no module names it" is the second,
   * independent layer, and a test is the only thing that keeps it true — a
   * future migration that widened the grant would otherwise silently make the
   * query the leak again.
   */
  it('never names deposit_required on the base table — not even with withDeposit', async () => {
    await listBookings()
    expect(db.state.columns).not.toContain('deposit_required')

    db.reset()
    await listBookings({ withDeposit: true })
    expect(db.state.columns).not.toContain('deposit_required')
  })

  it('reads the deposit from bookings_deposit_v, and only when asked', async () => {
    /* A row is required: the second query is skipped for an empty page, since
       there would be no ids to ask about. */
    const page = [{ id: 'b-1', booking_no: 'B-715', clients: null, booking_lines: null }]

    db.state.rows = page
    await listBookings()
    expect(db.state.tables).not.toContain('bookings_deposit_v')

    db.reset()
    db.state.rows = page
    await listBookings({ withDeposit: true })
    expect(db.state.tables).toContain('bookings_deposit_v')
  })

  it('skips the deposit query entirely for an empty page', async () => {
    db.state.rows = []
    await listBookings({ withDeposit: true })
    expect(db.state.tables).toEqual(['bookings'])
  })

  it('leaves every other column undisturbed when withDeposit is set', async () => {
    await listBookings({ withDeposit: true })
    for (const column of NEW_COLUMNS) {
      expect(occurrences(column)).toBe(1)
    }
  })

  it('asks for a count only when withCount is set', async () => {
    await listBookings()
    expect(db.state.selectOptions).toBeUndefined()

    db.reset()
    await listBookings({ withCount: true })
    expect(db.state.selectOptions).toEqual({ count: 'exact' })
  })
})

/**
 * A complete raw row, shaped exactly as PostgREST returns it. Every value is
 * distinct so a mapping that reads the wrong field fails rather than
 * coincidentally matching.
 */
const RAW = {
  id: '8f1d1a56-0b6a-4f0e-9d3c-2f4b6c7a9e11',
  booking_no: 'B-715',
  client_id: 'c0ffee00-1111-4222-8333-444455556666',
  project: 'FX3 Documentary',
  stage: 'Quote' as const,
  pickup_at: '2026-08-14T04:15:00+00:00',
  return_at: '2026-08-18T10:30:00+00:00',
  actual_return_at: null,
  delivery_type: 'Client Pickup' as const,
  pickup_location: 'Thamel warehouse',
  return_location: 'Lalitpur yard',
  quote_expires_at: '2026-08-20T18:15:00+00:00',
  cancelled_at: null,
  closed_at: null,
  created_at: '2026-07-12T09:41:00+00:00',
  clients: { name: 'Himalaya Films' },
  booking_lines: [
    { id: 'l1', qty: 5 },
    { id: 'l2', qty: 2 },
  ],
}

async function mapOne(raw: unknown): Promise<BookingListRow> {
  db.state.rows = [raw]
  const { rows } = await listBookings()
  const row = rows[0]
  if (!row) throw new Error('expected exactly one mapped row')
  return row
}

describe('toRow — raw DB row → BookingListRow', () => {
  it('maps each new column onto its view-model field', async () => {
    const row = await mapOne(RAW)
    expect(row.pickupLocation).toBe('Thamel warehouse')
    expect(row.returnLocation).toBe('Lalitpur yard')
    expect(row.quoteExpiresAtAd).toBe('2026-08-20T18:15:00+00:00')
    expect(row.createdAtAd).toBe('2026-07-12T09:41:00+00:00')
  })

  it('does not disturb the fields that were already mapped', async () => {
    const row = await mapOne(RAW)
    expect(row).toMatchObject({
      id: RAW.id,
      bookingNo: 'B-715',
      clientId: RAW.client_id,
      clientName: 'Himalaya Films',
      project: 'FX3 Documentary',
      stage: 'Quote',
      pickupAtAd: RAW.pickup_at,
      returnAtAd: RAW.return_at,
      actualReturnAtAd: null,
      deliveryType: 'Client Pickup',
      itemCount: 7, // units, not lines — 5 + 2
      depositRequired: null, // not requested, so not known
      isCancelled: false,
      isClosed: false,
    })
  })

  it('passes the three nullable new columns through as null, inventing nothing', async () => {
    // All three are nullable in the schema, and a null is a real state: no
    // location was recorded, no expiry was set. Coalescing to '' would read as
    // "recorded as blank" and coalescing a location to the branch name would be
    // a fabricated figure. The screen renders the non-value; the query does not
    // manufacture one.
    const row = await mapOne({
      ...RAW,
      pickup_location: null,
      return_location: null,
      quote_expires_at: null,
    })
    expect(row.pickupLocation).toBeNull()
    expect(row.returnLocation).toBeNull()
    expect(row.quoteExpiresAtAd).toBeNull()
    // `created_at` is NOT NULL in the schema, so it has no null case to test.
    expect(row.createdAtAd).toBe(RAW.created_at)
  })

  it('surfaces a query error rather than returning an empty list', async () => {
    db.state.error = { message: 'permission denied for column deposit_required' }
    await expect(listBookings()).rejects.toThrow(/listBookings failed/)
  })
})

/* ── Named filter sets ───────────────────────────────────────────────────── */

const CANONICAL_SIX = Object.keys(BOOKING_STATUS)

/** Every stage literal a named set can emit, so a retired name cannot slip back in. */
function stagesOf(filters: { chips?: Record<string, readonly string[] | undefined> | undefined }): readonly string[] {
  return filters.chips?.['stage'] ?? []
}

describe('named filter sets → ListFilters', () => {
  it('quotesExpiring pins stage, the expiry bound, the cancellation baseline and the sort', () => {
    const now = '2026-08-12T09:00:00.000Z'
    expect(quotesExpiring(now)).toEqual({
      dateRange: { column: 'quote_expires_at', toAd: now },
      chips: { stage: ['Quote'] },
      presence: { cancelled_at: false },
      sort: { column: 'quote_expires_at', ascending: true },
    })
  })

  it('quotesExpiring takes an INSTANT, and does not normalise it to a day boundary', () => {
    // Unlike todaysOutgoing/Incoming, no day boundary is involved — the bound is
    // compared against a timestamptz directly. Passing the instant through
    // untouched is the whole contract; rounding it to a Kathmandu midnight would
    // sweep in quotes that lapse later today.
    const now = '2026-08-12T09:00:00.000Z'
    expect(quotesExpiring(now).dateRange?.toAd).toBe(now)
    expect(quotesExpiring(now).dateRange?.fromAd).toBeUndefined()
  })

  it('todaysOutgoing bounds a Kathmandu OPERATIONAL day — 06:00 → 06:00 by default (D4)', () => {
    expect(todaysOutgoing('2026-08-12')).toEqual({
      dateRange: {
        column: 'pickup_at',
        // D4, ruled 30 Aug 2026: the day starts at operationalDayStart
        // (default 06:00), so "12 Aug" runs to 05:59:59.999 on the 13th.
        fromAd: '2026-08-12T06:00:00.000+05:45',
        toAd: '2026-08-13T05:59:59.999+05:45',
      },
      chips: { stage: ['Booked', 'Packed'] },
      presence: { cancelled_at: false },
      sort: { column: 'pickup_at', ascending: true },
    })
  })

  it('todaysIncoming filters on return_at and excludes anything already returned', () => {
    expect(todaysIncoming('2026-08-12')).toEqual({
      dateRange: {
        column: 'return_at',
        fromAd: '2026-08-12T06:00:00.000+05:45',
        toAd: '2026-08-13T05:59:59.999+05:45',
      },
      chips: { stage: ['On Rent'] },
      presence: { cancelled_at: false, actual_return_at: false },
      sort: { column: 'return_at', ascending: true },
    })
  })

  it('overdue takes an instant and bounds only the upper end', () => {
    const now = '2026-08-12T09:00:00.000Z'
    expect(overdue(now)).toEqual({
      dateRange: { column: 'return_at', toAd: now },
      chips: { stage: ['On Rent'] },
      presence: { cancelled_at: false, actual_return_at: false },
      sort: { column: 'return_at', ascending: true },
    })
  })

  it('operationQueue maps each floor verb to its stage and its date column', () => {
    expect(operationQueue('packing')).toEqual({
      chips: { stage: ['Booked'] },
      presence: { cancelled_at: false },
      sort: { column: 'pickup_at', ascending: true },
    })
    expect(operationQueue('handover').chips).toEqual({ stage: ['Packed'] })
    expect(operationQueue('return').sort).toEqual({ column: 'return_at', ascending: true })
    expect(operationQueue('reset').chips).toEqual({ stage: ['Returned'] })
  })

  it('every stage literal any named set emits is a member of the canonical six', () => {
    // Rule 5. A retired name ('Inspection', 'Completed', 'Ready', 'Late Return')
    // must never reach the builder.
    //
    // The rationale this test carried until 12 Aug 2026 was wrong and is
    // corrected here: it said such a name "does not error — `stage IN ('Ready')`
    // matches nothing and the screen renders a plausible empty day". It does
    // error. `bookings.stage` is the real Postgres enum `booking_stage`, so the
    // literal is never coerced:
    //
    //     ERROR:  22P02: invalid input value for enum booking_stage: "Ready"
    //
    // (run against the live database, 12 Aug 2026). PostgREST returns 400,
    // `listBookings` rethrows as `listBookings failed: …`, and `PageBody` shows
    // its error state — the screen breaks outright rather than lying quietly.
    //
    // The test is worth keeping either way. A blank screen in production is a
    // worse way to learn about a typo than a red line here, and this is still
    // the only place a retired literal is visible as text before it ships.
    const sets = [
      quotesExpiring('2026-08-12T09:00:00.000Z'),
      todaysOutgoing('2026-08-12'),
      todaysIncoming('2026-08-12'),
      overdue('2026-08-12T09:00:00.000Z'),
      operationQueue('packing'),
      operationQueue('handover'),
      operationQueue('return'),
      operationQueue('reset'),
    ]
    for (const set of sets) {
      const stages = stagesOf(set)
      expect(stages.length).toBeGreaterThan(0)
      for (const stage of stages) expect(CANONICAL_SIX).toContain(stage)
    }
    // 'Cancelled' is a flag (0015), never a stage — it is expressed as presence.
    for (const set of sets) expect(stagesOf(set)).not.toContain('Cancelled')
  })
})

describe('named filter sets → the calls that actually reach the builder', () => {
  it('quotesExpiring sends stage IN, quote_expires_at <=, cancelled_at IS NULL and a deterministic order', async () => {
    const now = '2026-08-12T09:00:00.000Z'
    await listBookings(quotesExpiring(now))
    expect(db.state.calls).toEqual([
      // Law 3 — voided lines are excluded from the item count, applied before the filters.
      ['is', 'booking_lines.voided_at', null],
      ['in', 'stage', ['Quote']],
      ['lte', 'quote_expires_at', now],
      ['is', 'cancelled_at', null],
      ['order', 'quote_expires_at', { ascending: true }],
      // The tiebreak, defaulted to the primary key so offset paging is stable.
      ['order', 'id', { ascending: true }],
    ])
  })

  it('quotesExpiring never sends a lower bound, so a quote with no expiry cannot be swept in', async () => {
    // `quote_expires_at` is nullable and `lte` on NULL is NULL, not true, so an
    // undated quote is simply absent. Asserting the absence of a `gte` is what
    // keeps that reasoning true.
    await listBookings(quotesExpiring('2026-08-12T09:00:00.000Z'))
    expect(db.state.calls.map((c) => c[0])).not.toContain('gte')
  })

  it('todaysOutgoing sends both day bounds with the +05:45 offset', async () => {
    await listBookings(todaysOutgoing('2026-08-12'))
    expect(db.state.calls).toEqual([
      ['is', 'booking_lines.voided_at', null],
      ['in', 'stage', ['Booked', 'Packed']],
      ['gte', 'pickup_at', '2026-08-12T06:00:00.000+05:45'],
      ['lte', 'pickup_at', '2026-08-13T05:59:59.999+05:45'],
      ['is', 'cancelled_at', null],
      ['order', 'pickup_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
    ])
  })

  it('sends NO stage constraint for an empty chip group — the "All" chip', async () => {
    // An empty array means "no constraint", never "match nothing". Sending
    // `in('stage', [])` would return zero rows and look like an empty day.
    await listBookings({ chips: { stage: [] }, presence: { cancelled_at: false } })
    expect(db.state.calls).toEqual([
      ['is', 'booking_lines.voided_at', null],
      ['is', 'cancelled_at', null],
      // The default sort survives an otherwise-empty filter set.
      ['order', 'pickup_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
    ])
    expect(db.state.calls.map((c) => c[0])).not.toContain('in')
  })

  it('keeps a non-empty sibling group when one group is cleared', async () => {
    await listBookings({ chips: { stage: [], delivery_type: ['Courier'] } })
    expect(db.state.calls).toContainEqual(['in', 'delivery_type', ['Courier']])
    expect(db.state.calls).not.toContainEqual(['in', 'stage', []])
  })

  it('defaults the search columns to the two that exist on bookings', async () => {
    await listBookings({ search: 'FX3' })
    expect(db.state.calls).toContainEqual(['or', 'booking_no.ilike.*FX3*,project.ilike.*FX3*'])
  })
})

/**
 * The two "now" helpers are the only ones in this module fed a live clock, and
 * `useList` keys its fetch effect on `filterKey(filters)` recomputed every
 * render. So an unquantised instant here is not a rounding question — it is an
 * unbounded refetch loop against Postgres that shows as nothing on the client.
 * These pin the property that prevents it.
 */
describe('overdue / quotesExpiring — stable across renders', () => {
  it('produces an identical filter key for two instants in the same minute', () => {
    const a = overdue('2026-08-12T09:31:00.000Z')
    const b = overdue('2026-08-12T09:31:59.999Z')
    // Same key => useList's effect does not re-run => no loop.
    expect(filterKey(a)).toBe(filterKey(b))
    expect(a.dateRange?.toAd).toBe('2026-08-12T09:31:00.000Z')
  })

  it('still moves to the next minute, so the list does not freeze', () => {
    const a = overdue('2026-08-12T09:31:59.999Z')
    const b = overdue('2026-08-12T09:32:00.000Z')
    expect(filterKey(a)).not.toBe(filterKey(b))
  })

  it('quantises quotesExpiring the same way', () => {
    const a = quotesExpiring('2026-08-12T09:31:02.500Z')
    const b = quotesExpiring('2026-08-12T09:31:44.100Z')
    expect(filterKey(a)).toBe(filterKey(b))
    expect(a.dateRange?.toAd).toBe('2026-08-12T09:31:00.000Z')
  })

  it('refuses a bare day rather than letting Postgres read it as midnight UTC', () => {
    // A YYYY-MM-DD here would silently miss everything due earlier the same day
    // in Kathmandu. Fail where the mistake is, not 5h45m later in the results.
    expect(() => overdue('not-an-instant')).toThrow(/full ISO instant/)
  })

  it('accepts what its own doc tells callers to pass', () => {
    expect(() => overdue(new Date().toISOString())).not.toThrow()
    expect(() => quotesExpiring(new Date().toISOString())).not.toThrow()
  })
})

/**
 * # `operationalToday` — the day a screen is allowed to call "today"
 *
 * This block exists because of a live defect, not a hypothetical one. Daily
 * Closing built its day as `getBusinessToday().toISOString()` and every figure
 * on the screen — outgoing, incoming, new bookings, payments — was answered for
 * the day BEFORE. It is the nastiest shape a date bug takes: a DAY MARKER
 * dressed as an INSTANT. The callee cannot tell the two apart, `nepalDay` does
 * exactly the right thing with it, and the screen is signed by an operator.
 */
describe('operationalToday — a day marker is not an instant', () => {
  /** Kathmandu is UTC+05:45, so an NPT wall clock maps to UTC by subtracting it. */
  const npt = (iso: string) => new Date(`${iso}+05:45`)

  it('names the day that has not ended yet before the 06:00 start', () => {
    // 05:50 in Kathmandu: the floor is still working the 11th's shift.
    expect(operationalToday(npt('2026-08-12T05:50:00.000'))).toBe('2026-08-11')
  })

  it('turns over at the operational start, not at midnight', () => {
    expect(operationalToday(npt('2026-08-12T06:10:00.000'))).toBe('2026-08-12')
  })

  it('is date-only, so nepalDay passes it through instead of re-resolving it', () => {
    expect(operationalToday(npt('2026-08-12T12:00:00.000'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  /*
   * ⛔ The regression itself. Both expressions below mean "today" to a reader.
   * At noon on the 12th one of them says the 11th.
   */
  it('does not report yesterday where getBusinessToday().toISOString() did', () => {
    const noon = npt('2026-08-12T12:00:00.000')

    // What the screen used to send: UTC midnight of the civil day = 05:45 NPT,
    // which is genuinely inside the 11th's operational day.
    const dayMarkerAsInstant = getBusinessToday(noon).toISOString()
    expect(dayMarkerAsInstant).toBe('2026-08-12T00:00:00.000Z')
    expect(todaysOutgoing(dayMarkerAsInstant).dateRange?.fromAd).toBe('2026-08-11T06:00:00.000+05:45')

    // What it sends now.
    expect(todaysOutgoing(operationalToday(noon)).dateRange?.fromAd).toBe('2026-08-12T06:00:00.000+05:45')
  })

  it('keeps every figure on the Daily Closing screen on ONE day', () => {
    const noon = npt('2026-08-12T12:00:00.000')
    const day = operationalToday(noon)
    const from = '2026-08-12T06:00:00.000+05:45'
    expect(todaysOutgoing(day).dateRange?.fromAd).toBe(from)
    expect(todaysIncoming(day).dateRange?.fromAd).toBe(from)
    expect(bookingsCreatedOn(day).dateRange?.fromAd).toBe(from)
  })
})
