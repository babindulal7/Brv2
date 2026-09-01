import { describe, expect, it, vi } from 'vitest'

/**
 * # Rentals List — the two mappings, pinned
 *
 * This screen used to touch no database at all: eight hardcoded rows, three
 * `.filter()` calls and a `.slice()` over them, under a six-card KPI strip of
 * hand-typed strings that agreed with none of it. What replaced it is two
 * mappings, and they are the two things that can break the screen silently:
 *
 *  1. **chip → `ListFilters`** — a wrong stage literal does not error.
 *     `stage IN ('Inspection')` matches nothing, and the list renders a
 *     perfectly plausible empty screen. Two of the twelve chip LABELS are
 *     retired stage names, so this is not a hypothetical here: `Inspection` and
 *     `Completed` were members of the old thirteen (`0001_enums.sql:261,263`)
 *     that `0015_canonical_six_stages.sql` deleted, and sending either literal
 *     is exactly the failure this suite exists to catch.
 *  2. **raw row → view model** — `toRentalListRow` decides what the table is
 *     allowed to say. The shape it replaced carried six fields with no column
 *     behind them (`crew`, `kit`, `pickup.who`, `ret.who`, `amount`, `due`), and
 *     a seventh, `bookedOn`, that labelled `created_at` as the Booked date. Each
 *     one looked completely ordinary on screen.
 *
 * Plus the two things `ListFilters` genuinely cannot express, which must fail
 * LOUDLY rather than quietly returning everything: an empty stage intersection
 * (`applyListFilters` reads `[]` as "no constraint"), and the `Payment Due`
 * chip, which has no money column to stand on.
 *
 * ## Why `lib/supabase` is mocked
 *
 * `data/rentals.ts` imports `queries/bookings.ts` for the named filter sets, and
 * that module reaches the supabase client. Replaced wholesale, exactly as
 * `queries/__tests__/bookings.test.ts` and `operations/__tests__/
 * operationsQueues.test.ts` do. Nothing here reaches a database and no query is
 * executed: every assertion is on a plain object or a string.
 */
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

import {
  CHIPS,
  CHIP_MEANS,
  OPTIONAL_COLUMNS,
  PAYMENT_DUE_UNAVAILABLE,
  RENTAL_KPI_FILTERS,
  ROWS,
  SUB_RENTAL_NOTE,
  withSubRental,
  chipsFor,
  filterGroupsFor,
  rentalDetailGroups,
  rentalGlance,
  rentalsQuery,
  toRentalListRow,
  type ChipKey,
} from '../../../data/rentals'
/* §11.1 — the rule itself lives beside the lines it is about, so the list's
   filter and the booking screen's outline read one predicate, not two. */
import {
  ITEMS,
  SUB_RENTAL_LINE_TYPES,
  isSubRentalBooking,
  isSubRentedLine,
} from '../../../data/booking'
import { overdue, todaysIncoming, todaysOutgoing, type BookingListRow } from '../../../lib/queries/bookings'
import type { ListFilters } from '../../../lib/queries/listQuery'
import { NOW_AD, TODAY_DAY_AD } from '../../../data/today'
import { getBusinessToday } from '../../../lib/bs'
import { gateContext } from '../../../lib/fieldGating'
import { rupees } from '../../../lib/money'
import { BOOKING_STATUS, type BookingStatus } from '../../../lib/workflow'

/**
 * A Kathmandu calendar day, `n` days from the operating day, as `YYYY-MM-DD`.
 *
 * These expectations used to be written as literals — `'2026-07-31'`,
 * `'2026-08-01'` — which passed only while `lib/bs.ts` froze the operating day
 * at 31 Jul 2026. A test that names a date cannot tell a chip that anchors on
 * today from one that anchors on a day in the past; it just goes red when the
 * product is fixed. What the chips actually promise is a relationship to
 * today, so that is what is asserted.
 */
const day = (n: number) => new Date(getBusinessToday().getTime() + n * 86_400_000).toISOString().slice(0, 10)

const CANONICAL_SIX = Object.keys(BOOKING_STATUS)

/** The retired vocabulary 0015 deleted. None of these may ever reach a query. */
const RETIRED_STAGE_NAMES = ['Draft', 'Confirmed', 'Preparing', 'Ready', 'Dispatched', 'Return Due', 'Inspection', 'Cleaning', 'Completed', 'Cancelled']

const NO_RANGE = { from: '', to: '' }
const ALL_CHIPS = CHIPS.map((c) => c.label)
/** Every chip that has a query behind it — `Payment Due` does not. */
const LIVE_CHIPS = CHIPS.filter((c) => !c.unavailable).map((c) => c.label)

function q(chip: ChipKey, statuses: readonly BookingStatus[] = [], custom = NO_RANGE) {
  return rentalsQuery(chip, custom, statuses, NOW_AD)
}

function stagesOf(filters: ListFilters): readonly string[] {
  return filters.chips?.['stage'] ?? []
}

/* ── The chip strip ──────────────────────────────────────────────────────── */

describe('CHIPS — twelve, and exactly one of them is a canonical stage', () => {
  it('carries all twelve labels from the render, in order', () => {
    expect(ALL_CHIPS).toEqual([
      'All',
      'Tomorrow',
      'Next 7 Days',
      'Upcoming',
      'On Rent',
      'Returning',
      'Inspection',
      'Completed',
      'Overdue',
      'Payment Due',
      'Cancelled',
      'Custom',
    ])
  })

  it('gives every chip a sentence saying what it selects', () => {
    // The empty state reads this, so "no rows" says which question was asked.
    for (const label of ALL_CHIPS) {
      expect(CHIP_MEANS[label].length).toBeGreaterThan(10)
    }
  })

  it('§8.3 — removes the money chip for a money-blind session', () => {
    expect(chipsFor(true).map((c) => c.label)).toContain('Payment Due')
    expect(chipsFor(false).map((c) => c.label)).not.toContain('Payment Due')
    // Removed from the ARRAY, so it is absent from the DOM rather than masked.
    expect(chipsFor(false)).toHaveLength(CHIPS.length - 1)
  })

  it('§8.3 — removes the three money filter groups too', () => {
    const blind = filterGroupsFor(false).map((g) => g.label)
    expect(blind).not.toContain('Payment')
    expect(blind).not.toContain('Deposit')
    expect(blind).not.toContain('Amount')
    expect(blind).toContain('Status')
  })
})

describe('Payment Due — the chip with no column behind it', () => {
  it('is the only unavailable chip, and it names what is missing', () => {
    const unavailable = CHIPS.filter((c) => c.unavailable)
    expect(unavailable.map((c) => c.label)).toEqual(['Payment Due'])
    expect(unavailable[0]?.unavailable).toBe(PAYMENT_DUE_UNAVAILABLE)
  })

  it('names the three places an outstanding balance is NOT', () => {
    // A disabled control has to say why, and "not built yet" is not why. The
    // reason has to be actionable by whoever wires it next.
    expect(PAYMENT_DUE_UNAVAILABLE).toContain('deposit_required')
    expect(PAYMENT_DUE_UNAVAILABLE).toContain('payments')
    expect(PAYMENT_DUE_UNAVAILABLE).toContain('Financial Engine')
  })

  it('never becomes a filter that quietly returns the unfiltered list', () => {
    // It cannot be selected — the chip renders `disabled` — but if it ever is,
    // the set must not silently widen to everything with a money-shaped label
    // on it. It carries no money predicate at all, because there is none to
    // carry.
    expect(JSON.stringify(q('Payment Due').filters)).not.toContain('deposit')
  })
})

/* ── chip → ListFilters ──────────────────────────────────────────────────── */

describe('the stage chips — retired labels, live stages', () => {
  it('Upcoming is the three pre-handover stages as one union', () => {
    expect(stagesOf(q('Upcoming').filters)).toEqual(['Quote', 'Booked', 'Packed'])
  })

  it('On Rent is the one chip whose label IS its stage', () => {
    expect(stagesOf(q('On Rent').filters)).toEqual(['On Rent'])
  })

  it('Inspection queries Returned — the stage that replaced it', () => {
    // `Inspection` was deleted by 0015. Sending the literal would match nothing
    // and render a plausible empty screen; the label is the operator's word for
    // the Returned stage, where inspection is the outstanding work.
    expect(stagesOf(q('Inspection').filters)).toEqual(['Returned'])
    expect(stagesOf(q('Inspection').filters)).not.toContain('Inspection')
  })

  it('Completed queries Closed — the stage that replaced it', () => {
    expect(stagesOf(q('Completed').filters)).toEqual(['Closed'])
    expect(stagesOf(q('Completed').filters)).not.toContain('Completed')
  })

  it('never sends a retired stage name from any chip', () => {
    for (const chip of ALL_CHIPS) {
      for (const stage of stagesOf(q(chip).filters)) {
        expect(CANONICAL_SIX).toContain(stage)
        expect(RETIRED_STAGE_NAMES).not.toContain(stage)
      }
    }
  })
})

describe('All — the default scope, not a date filter', () => {
  it('binds no date range at all', () => {
    // `matchesChip` was literally `return true` for this chip, and the render
    // shows rows dated 2 Jul – 2 Aug under it. It is the reset-to-everything
    // state — which is why `04_RENTALS.md` §4.1 draws it as `(All)` and why the
    // key was renamed from `Today` on 12 Aug 2026.
    expect(q('All').filters.dateRange).toBeUndefined()
    expect(stagesOf(q('All').filters)).toEqual([])
  })

  it('still excludes cancellations, which is structural rather than chosen', () => {
    expect(q('All').filters.presence).toEqual({ cancelled_at: false })
  })

  it('is no longer called Today, which was a label that ignored the date', () => {
    expect(ALL_CHIPS).not.toContain('Today')
    expect(CHIP_MEANS.All).toContain('every booking')
  })
})

describe('the date chips — Kathmandu day boundaries, read off the named sets', () => {
  it('Tomorrow is one Nepal OPERATIONAL day on pickup_at, inclusive at both ends', () => {
    // +05:45, never `Z`. Midnight UTC is 05:45 in Kathmandu, so a UTC-bounded
    // "tomorrow" would lose the early shift's pickups to today's list. Since
    // D4 (ruled 30 Aug 2026) the day runs 06:00 → 06:00 by default, so
    // tomorrow ends at 05:59:59.999 the morning after.
    expect(q('Tomorrow').filters.dateRange).toEqual({
      column: 'pickup_at',
      fromAd: `${day(1)}T06:00:00.000+05:45`,
      toAd: `${day(2)}T05:59:59.999+05:45`,
    })
  })

  it('Next 7 Days is today plus the next six, on pickup_at', () => {
    expect(q('Next 7 Days').filters.dateRange).toEqual({
      column: 'pickup_at',
      fromAd: `${day(0)}T06:00:00.000+05:45`,
      toAd: `${day(7)}T05:59:59.999+05:45`,
    })
  })

  it('anchors on lib/bs.ts’s single operating day, not on the wall clock', () => {
    // The app once held three opinions about what day it was. Rentals reads the
    // same anchor Today, the Calendar and Pulse read — and since 19 Aug 2026
    // that anchor is the clock in Kathmandu rather than a frozen constant.
    expect(TODAY_DAY_AD).toBe(day(0))
    expect(q('Next 7 Days').filters.dateRange?.fromAd?.slice(0, 10)).toBe(TODAY_DAY_AD)
  })

  it('binds pickup_at only, and never invents a second range for return_at', () => {
    // The seed predicate was `pickup OR return in the window`.
    // `ListFilters.dateRange` names ONE column and `applyListFilters` cannot OR
    // two ranges, so the chip narrows by pickup and the screen says so in words.
    // The dangerous alternative is silently sending both and getting an AND.
    for (const chip of ['Tomorrow', 'Next 7 Days', 'Custom'] as ChipKey[]) {
      const range = rentalsQuery(chip, { from: '2026-08-03', to: '2026-08-05' }, [], NOW_AD).filters.dateRange
      expect(range?.column).toBe('pickup_at')
    }
  })

  it('Custom sends no range at all until an end is picked', () => {
    expect(q('Custom').filters.dateRange).toBeUndefined()
  })

  it('Custom accepts one open end', () => {
    expect(q('Custom', [], { from: '2026-08-03', to: '' }).filters.dateRange).toEqual({
      column: 'pickup_at',
      fromAd: '2026-08-03T06:00:00.000+05:45',
    })
    expect(q('Custom', [], { from: '', to: '2026-08-05' }).filters.dateRange).toEqual({
      column: 'pickup_at',
      toAd: '2026-08-06T05:59:59.999+05:45',
    })
  })
})

describe('the return-side chips', () => {
  it('Overdue is queries/bookings.ts’s overdue(), reused rather than restated', () => {
    // Today's Overdue KPI, Today's Alerts column and this chip must not be able
    // to disagree about what "late" means.
    expect(q('Overdue').filters).toEqual(overdue(NOW_AD))
  })

  it('Returning is On Rent, still out, due back by the end of tomorrow', () => {
    expect(q('Returning').filters).toEqual({
      chips: { stage: ['On Rent'] },
      presence: { cancelled_at: false, actual_return_at: false },
      dateRange: { column: 'return_at', toAd: `${day(2)}T05:59:59.999+05:45` },
      sort: { column: 'return_at', ascending: true },
    })
  })

  it('orders both by return_at, so the column shown and the order agree', () => {
    expect(q('Returning').filters.sort?.column).toBe('return_at')
    expect(q('Overdue').filters.sort?.column).toBe('return_at')
  })
})

describe('Cancelled — a flag, never a stage (Law 3 / 0015)', () => {
  it('flips the presence flag rather than filtering the stage column', () => {
    expect(q('Cancelled').filters.presence).toEqual({ cancelled_at: true })
    expect(stagesOf(q('Cancelled').filters)).not.toContain('Cancelled')
  })

  it('is the ONLY chip that includes cancellations', () => {
    for (const chip of LIVE_CHIPS) {
      if (chip === 'Cancelled') continue
      expect(q(chip).filters.presence).toMatchObject({ cancelled_at: false })
    }
  })
})

describe('every set this screen can build', () => {
  /**
   * Every set the screen would actually SEND.
   *
   * `impossible` sets are deliberately excluded: their stage group is `[]` by
   * construction and the screen's contract is that it never sends them — which
   * is asserted directly in the Status-accordion block below.
   */
  const SENDABLE: ListFilters[] = [
    ...LIVE_CHIPS.map((c) => q(c)),
    ...LIVE_CHIPS.map((c) => q(c, ['Booked', 'On Rent', 'Returned'])),
    rentalsQuery('Custom', { from: '2026-08-01', to: '2026-08-09' }, [], NOW_AD),
  ]
    .filter((r) => !r.impossible)
    .map((r) => r.filters)
    .concat(Object.values(RENTAL_KPI_FILTERS))

  it('names only members of the canonical six', () => {
    for (const set of SENDABLE) {
      for (const stage of stagesOf(set)) expect(CANONICAL_SIX).toContain(stage)
    }
  })

  it('never sends an EMPTY stage group, which applyListFilters reads as “no constraint”', () => {
    // A group that came out empty must arrive as `impossible`, not be sent —
    // sending `[]` returns EVERY stage, the exact opposite of what was asked.
    for (const set of SENDABLE) {
      const stages = set.chips?.['stage']
      if (stages !== undefined) expect(stages.length).toBeGreaterThan(0)
    }
  })

  it('sorts every set, so paging stays deterministic under listBookings’ id tiebreak', () => {
    for (const set of SENDABLE) {
      expect(set.sort?.column).toMatch(/^(pickup_at|return_at)$/)
      expect(set.sort?.ascending).toBe(true)
    }
  })

  it('asks for no money column anywhere in the filter set', () => {
    for (const set of SENDABLE) expect(JSON.stringify(set)).not.toContain('deposit')
  })

  it('leaves pagination to the screen — a chip is not a page', () => {
    for (const chip of LIVE_CHIPS) expect(q(chip).filters.page).toBeUndefined()
  })
})

/* ── the Status accordion, intersected ───────────────────────────────────── */

describe('the Status facet narrows, never replaces — chip row and Filters rail alike', () => {
  it('sends the six canonical stages straight onto bookings.stage when no chip constrains them', () => {
    expect(stagesOf(q('All', ['Quote', 'Closed']).filters)).toEqual(['Quote', 'Closed'])
    expect(q('All', ['Quote', 'Closed']).impossible).toBe(false)
  })

  it('intersects with a chip that carries its own stages', () => {
    // `Upcoming` MEANS Quote/Booked/Packed. Ticking Booked narrows it; it must
    // not overwrite it and put On Rent under a chip labelled Upcoming.
    expect(stagesOf(q('Upcoming', ['Booked', 'On Rent']).filters)).toEqual(['Booked'])
  })

  it('reports an empty intersection as impossible rather than sending it', () => {
    // ⚠ The whole reason `impossible` exists. `{ stage: [] }` is "no
    // constraint" to `applyListFilters`, so an On Rent chip plus a Quote tick
    // would have returned every booking in the database.
    const picked = q('On Rent', ['Quote'])
    expect(picked.impossible).toBe(true)
    expect(stagesOf(picked.filters)).toEqual([])
  })

  it('is never impossible while nothing is ticked', () => {
    for (const chip of ALL_CHIPS) expect(q(chip).impossible).toBe(false)
  })

  it('keeps the chip’s own presence and sort while narrowing', () => {
    const narrowed = q('Returning', ['On Rent'])
    expect(narrowed.impossible).toBe(false)
    expect(narrowed.filters.presence).toEqual({ cancelled_at: false, actual_return_at: false })
    expect(narrowed.filters.sort).toEqual({ column: 'return_at', ascending: true })
  })
})

/* ── the KPI strip ───────────────────────────────────────────────────────── */

describe('RENTAL_KPI_FILTERS — four counts, replacing six hand-typed strings', () => {
  it('carries exactly the four cards that have a query behind them', () => {
    // ⛔ `Payment Due` (Rs 142,000) and `Utilization` (84%) are gone rather than
    // dashed: no query in lib/queries produces either, and a card whose value
    // can only ever be a dash is a promise the screen cannot keep.
    expect(Object.keys(RENTAL_KPI_FILTERS)).toEqual(['active', 'pickups', 'returns', 'overdue'])
  })

  it('is each named set plus a one-row page, so the card and the list cannot disagree', () => {
    const page = { index: 0, size: 1 }
    expect(RENTAL_KPI_FILTERS.pickups).toEqual({ ...todaysOutgoing(TODAY_DAY_AD), page })
    expect(RENTAL_KPI_FILTERS.returns).toEqual({ ...todaysIncoming(TODAY_DAY_AD), page })
    expect(RENTAL_KPI_FILTERS.overdue).toEqual({ ...overdue(NOW_AD), page })
    expect(RENTAL_KPI_FILTERS.active.chips).toEqual({ stage: ['On Rent'] })
  })

  it('asks for no money on any card', () => {
    for (const set of Object.values(RENTAL_KPI_FILTERS)) {
      expect(JSON.stringify(set)).not.toContain('deposit')
    }
  })
})

/* ── raw row → view model ────────────────────────────────────────────────── */

/**
 * A complete list row, shaped as `listBookings` returns it. Pickup and return
 * are deliberately far apart so a mapping that reads the wrong instant fails
 * rather than coincidentally matching.
 */
const ROW: BookingListRow = {
  id: '8f1d1a56-0b6a-4f0e-9d3c-2f4b6c7a9e11',
  bookingNo: 'B-715',
  clientId: 'c0ffee00-1111-4222-8333-444455556666',
  clientName: 'Mountain Stories',
  project: 'FX3 Documentary',
  stage: 'Booked',
  // 03:15Z is 09:00 in Kathmandu (+05:45).
  pickupAtAd: '2026-08-14T03:15:00.000Z',
  returnAtAd: '2026-08-18T10:30:00.000Z',
  actualReturnAtAd: null,
  deliveryType: 'Customer Pickup',
  pickupLocation: 'Kathmandu',
  returnLocation: null,
  quoteExpiresAtAd: null,
  createdAtAd: '2026-07-12T09:41:00.000Z',
  itemCount: 7,
  depositRequired: null,
  isCancelled: false,
  isClosed: false,
}

/** Before both instants above, so nothing is overdue unless a test says so. */
const BEFORE_EVERYTHING = '2026-08-01T00:00:00.000Z'

const map = (overrides: Partial<BookingListRow> = {}, nowAd = BEFORE_EVERYTHING) =>
  toRentalListRow({ ...ROW, ...overrides }, nowAd)

describe('toRentalListRow — the columns that survived', () => {
  it('carries the identifiers, the client and the unit count through unchanged', () => {
    expect(map()).toMatchObject({
      id: ROW.id,
      bookingNo: 'B-715',
      clientId: ROW.clientId,
      client: 'Mountain Stories',
      project: 'FX3 Documentary',
      status: 'Booked',
      // Units across live lines, not a row count — `listBookings` sums `qty`.
      itemCount: 7,
      pickupLocation: 'Kathmandu',
      returnLocation: null,
    })
  })

  it('renders both instants on the Kathmandu wall clock (Law 7)', () => {
    expect(map().pickup).toEqual({ date: '14 Aug 2026', time: '09:00 AM' })
    expect(map().ret).toEqual({ date: '18 Aug 2026', time: '04:15 PM' })
  })

  it('renders the Kathmandu DAY, which is tomorrow for the last 5h45m of every UTC day', () => {
    expect(map({ pickupAtAd: '2026-08-14T18:30:00.000Z' }).pickup).toEqual({
      date: '15 Aug 2026',
      time: '12:15 AM',
    })
  })

  it('passes a null project through as null, inventing no kit name', () => {
    // There is no column behind the "FX3 Documentary Package" this table used to
    // print. A null must arrive as a null so the screen renders an explicit
    // non-value; coalescing it to a plausible string here is precisely the bug.
    expect(map({ project: null }).project).toBeNull()
  })

  it('derives the monogram from the real client name', () => {
    expect(map().monogram).toBe('MS')
    expect(map({ clientName: 'ABC Films Pvt Ltd' }).monogram).toBe('AFP')
  })

  it('gives one client one avatar tone, deterministically and without claiming anything', () => {
    expect(map().avatarTone).toBe(map({ bookingNo: 'B-999' }).avatarTone)
    // The identity ramp excludes the tones that carry hard meaning on a list.
    expect(['neutral', 'primary', 'progress', 'in']).toContain(map().avatarTone)
  })

  it('derives the Track step from the stage’s own order, so the dots cannot contradict the pill', () => {
    expect(map({ stage: 'Quote' }).progress).toBe(0)
    expect(map({ stage: 'Booked' }).progress).toBe(1)
    expect(map({ stage: 'Packed' }).progress).toBe(2)
    expect(map({ stage: 'On Rent' }).progress).toBe(3)
    // Four dots, six stages — the last two both fill it.
    expect(map({ stage: 'Returned' }).progress).toBe(4)
    expect(map({ stage: 'Closed' }).progress).toBe(4)
  })
})

describe('toRentalListRow — created_at is NOT the Booked date', () => {
  it('renders the insert instant under its own name', () => {
    expect(map().createdOn).toBe('12 Jul 2026')
  })

  it('never labels it "Booked"', () => {
    // The seed's `bookedOn` read "Booked 12 Jul". `created_at` is the row's
    // insert instant, and stage history lives in `booking_stage_transitions` —
    // a booking created as a Quote and confirmed a week later would show the
    // quote's date. Asserting the name here keeps the gap visible.
    expect(map().createdOn).not.toContain('Booked')
    expect(JSON.stringify(map())).not.toContain('bookedOn')
  })
})

describe('toRentalListRow — Overdue is the one derived state, and it is derived exactly', () => {
  it('is false while the return instant is still ahead', () => {
    expect(map({ stage: 'On Rent' }).isOverdue).toBe(false)
    expect(map({ stage: 'On Rent' }).statusNote).toBeUndefined()
  })

  it('is true once it has passed, matching overdue()’s three clauses', () => {
    const late = map({ stage: 'On Rent' }, '2026-08-20T00:00:00.000Z')
    expect(late.isOverdue).toBe(true)
    expect(late.flags).toContain('Overdue')
    expect(late.statusNote).toBe('2 days late')
    expect(late.progressTone).toBe('danger')
  })

  it('is false once the gear is actually back, however late the due date was', () => {
    // `actual_return_at is not null` is the third clause of `overdue()`. A row
    // handed back late is not still late.
    expect(
      map({ stage: 'On Rent', actualReturnAtAd: '2026-08-19T00:00:00.000Z' }, '2026-08-20T00:00:00.000Z').isOverdue,
    ).toBe(false)
  })

  it('is false at any stage other than On Rent, however old the return date', () => {
    for (const stage of CANONICAL_SIX as BookingStatus[]) {
      if (stage === 'On Rent') continue
      expect(map({ stage }, '2026-09-01T00:00:00.000Z').isOverdue).toBe(false)
    }
  })

  it('carries no Due Soon and no VIP, because neither has a source', () => {
    // `Due Soon` needs a "how soon is soon" window no spec states; `VIP` needs a
    // client attribute the schema does not have. The seed carried both.
    for (const nowAd of [BEFORE_EVERYTHING, '2026-08-20T00:00:00.000Z']) {
      expect(map({ stage: 'On Rent' }, nowAd).flags).not.toContain('Due Soon')
      expect(map({ stage: 'On Rent' }, nowAd).flags).not.toContain('VIP')
    }
  })
})

describe('toRentalListRow — Law 3, and the fields that had no column', () => {
  it('reports cancellation from cancelled_at, and keeps it off the stage', () => {
    const cancelled = map({ isCancelled: true, stage: 'Quote' })
    expect(cancelled.isCancelled).toBe(true)
    expect(cancelled.flags).toContain('Cancelled')
    // 'Cancelled' is a flag, not a stage — the stage stays whatever it was.
    expect(cancelled.status).toBe('Quote')
  })

  it('carries none of the seven invented fields', () => {
    // Every one of these rendered on the old table and not one had a column:
    // crew ("Crew 8"), kit ("FX3 Documentary Package"), the named pickup/return
    // handlers, the rental total, the outstanding balance, and the VIP/Priority
    // row tag.
    const row = map() as unknown as Record<string, unknown>
    for (const gone of ['crew', 'kit', 'who', 'amount', 'due', 'tag', 'bookedOn', 'statusKeyNote']) {
      expect(row).not.toHaveProperty(gone)
    }
    expect(JSON.stringify(row)).not.toContain('Crew ')
    expect(JSON.stringify(row)).not.toContain('Package')
  })

  it('keeps only the Overdue status note — the three that restated the stage are gone', () => {
    for (const stage of CANONICAL_SIX as BookingStatus[]) {
      expect(map({ stage }).statusNote).toBeUndefined()
    }
  })
})

describe('toRentalListRow — Law 6, the deposit', () => {
  it('is null when the caller did not ask, which is not the same as “no deposit”', () => {
    expect(map({ depositRequired: null }).deposit).toBeNull()
  })

  it('carries the figure through unchanged when the caller did ask', () => {
    expect(map({ depositRequired: rupees(50_000) }).deposit).toBe(rupees(50_000))
  })

  it('is the ONLY money field on the row', () => {
    const row = map({ depositRequired: rupees(50_000) }) as unknown as Record<string, unknown>
    // Named rather than pattern-matched: `isOverdue` contains "due" and is a
    // date claim, not a figure. These eight are the money-shaped fields the seed
    // row carried, every one of which is the Financial Engine's.
    const MONEY_SHAPED = ['amount', 'due', 'rentalTotal', 'outstanding', 'paid', 'balance', 'rate', 'price']
    for (const key of MONEY_SHAPED) expect(row).not.toHaveProperty(key)
    expect(row).toHaveProperty('deposit')
  })
})

/* ── Hover Intel ─────────────────────────────────────────────────────────── */

const OWNER = gateContext('Owner')
const WAREHOUSE = gateContext('Warehouse')

describe('the Intel card is built from the queried row, not from the seed', () => {
  it('omits the deposit line entirely for a money-blind role', () => {
    // HIS v2.1 §4.5 — "gated blocks are omitted from the payload, not
    // CSS-hidden". The floor must not receive the string at all.
    const glance = rentalGlance(map({ depositRequired: rupees(50_000) }), WAREHOUSE)
    expect(JSON.stringify(glance)).not.toContain('Deposit')
    expect(JSON.stringify(rentalDetailGroups(map({ depositRequired: rupees(50_000) }), WAREHOUSE))).not.toContain('50,000')
  })

  it('shows it to a role that may see booking money', () => {
    const glance = rentalGlance(map({ depositRequired: rupees(50_000) }), OWNER)
    expect(glance.lines?.some((l) => l.includes('Deposit required'))).toBe(true)
  })

  it('states the rental total as absent by design rather than omitting the question', () => {
    const money = rentalDetailGroups(map(), OWNER).find((g) => g.title === 'Money')
    expect(money?.fields.some((f) => String(f.value).includes('Financial Engine'))).toBe(true)
  })

  it('renders a null project and a null location as explicit non-values', () => {
    const schedule = rentalDetailGroups(map({ project: null, pickupLocation: null }), OWNER).find(
      (g) => g.title === 'Schedule',
    )
    expect(schedule?.fields.find((f) => f.label === 'Project')?.value).toBe('—')
    expect(schedule?.fields.find((f) => f.label === 'Pickup location')?.value).toBe('—')
  })

  it('states an unset quote expiry rather than calling the quote lapsed', () => {
    // 0002:37 carries a TODO(decision) recording that whether a quote lapses at
    // all is unspecified, and nothing in the schema acts on the date.
    const quote = rentalDetailGroups(map({ stage: 'Quote', quoteExpiresAtAd: null }), OWNER).find(
      (g) => g.title === 'Quote',
    )
    expect(quote?.fields.find((f) => f.label === 'Valid until')?.value).toBe('No expiry recorded')
  })

  it('does not carry a Quote group on a booking that is not a Quote', () => {
    expect(rentalDetailGroups(map({ stage: 'On Rent' }), OWNER).map((g) => g.title)).not.toContain('Quote')
  })
})

/* ── Law 17 ──────────────────────────────────────────────────────────────── */

describe('Law 17 — the word "customer" appears in no UI copy', () => {
  it('is absent from every chip label, chip explanation and column name', () => {
    const copy = [...ALL_CHIPS, ...Object.values(CHIP_MEANS), ...OPTIONAL_COLUMNS, PAYMENT_DUE_UNAVAILABLE]
      .join(' ')
      .toLowerCase()
    expect(copy).not.toContain('customer')
  })

  it('leaves the delivery_type enum member alone, which is data and not copy', () => {
    // 'Customer Pickup' is a `delivery_type` value (0001:279). Renaming it would
    // be renaming a column value, not fixing UI copy.
    expect(map().deliveryType).toBe('Customer Pickup')
  })
})

/* ── Sub-Rental — rulings §11.1: line-level fact, derived booking flag ───── */

describe('the sub-rental predicate — one rule, in one place', () => {
  it('answers the LINE, and derives the booking from its lines', () => {
    expect(isSubRentedLine({ subRental: true })).toBe(true)
    expect(isSubRentedLine({ lineType: 'Sub-rental' })).toBe(true)
    expect(isSubRentedLine({ lineType: 'Equipment' })).toBe(false)
    expect(isSubRentedLine({})).toBe(false)

    // "A booking counts as sub-rental if ANY of its lines is" — §11.1.
    expect(isSubRentalBooking([{ lineType: 'Equipment' }, { subRental: true }])).toBe(true)
    expect(isSubRentalBooking([{ lineType: 'Equipment' }])).toBe(false)
    expect(isSubRentalBooking([])).toBe(false)
  })

  it('keeps the vocabulary the server filter sends and the predicate tests identical', () => {
    // The `.in()` in `subRentalBookingIds` and the predicate above both read
    // SUB_RENTAL_LINE_TYPES. Widening one without the other is how a filter and
    // a verdict start disagreeing about the same booking.
    for (const t of SUB_RENTAL_LINE_TYPES) {
      expect(isSubRentedLine({ lineType: t })).toBe(true)
    }
  })

  it('stores the booking-level answer nowhere — §11.1', () => {
    // ⛔ The failure this pins: a `subRental` field appearing on the row shape.
    // "Storing the same fact twice is how the two disagree."
    for (const row of ROWS) {
      expect(row).not.toHaveProperty('subRental')
      expect(row).not.toHaveProperty('isSubRental')
    }
  })

  it('seeds a realistic minority of lines, not half the corpus', () => {
    const sub = ITEMS.filter(isSubRentedLine)
    expect(sub.length).toBeGreaterThan(0)
    expect(sub.length).toBeLessThan(ITEMS.length / 2)
    expect(isSubRentalBooking(ITEMS)).toBe(true)
  })
})

describe('the Sub-Rental chip — narrows server-side on the derived set', () => {
  it('sends the derived booking ids as an ordinary id group', () => {
    const query = rentalsQuery('All', NO_RANGE, [], NOW_AD, { on: true, bookingIds: ['b1', 'b2'] })
    expect(query.impossible).toBe(false)
    expect(query.filters.chips?.['id']).toEqual(['b1', 'b2'])
  })

  it('ANDs with the stage chips rather than replacing them', () => {
    // §4.1 draws it on its own line beside the view toggle, not among the
    // twelve — so it narrows whatever they selected.
    const query = rentalsQuery('On Rent', NO_RANGE, [], NOW_AD, { on: true, bookingIds: ['b1'] })
    expect(stagesOf(query.filters)).toEqual(['On Rent'])
    expect(query.filters.chips?.['id']).toEqual(['b1'])
  })

  it('reports an empty derived set as impossible, never as an empty in()', () => {
    // ⛔ `applyListFilters` reads `[]` as "no constraint". Sending it would
    // return EVERY booking under a label reading Sub-Rental.
    const empty = rentalsQuery('All', NO_RANGE, [], NOW_AD, { on: true, bookingIds: [] })
    expect(empty.impossible).toBe(true)
    expect(empty.filters.chips?.['id']).toBeUndefined()
  })

  it('treats an unanswered set as impossible too — null is never “none”', () => {
    const unknown = rentalsQuery('All', NO_RANGE, [], NOW_AD, { on: true, bookingIds: null })
    expect(unknown.impossible).toBe(true)
    expect(unknown.filters.chips?.['id']).toBeUndefined()
  })

  it('adds nothing at all when the chip is off', () => {
    expect(rentalsQuery('All', NO_RANGE, [], NOW_AD, { on: false, bookingIds: ['b1'] }).filters.chips?.['id'])
      .toBeUndefined()
    expect(q('All').filters.chips?.['id']).toBeUndefined()
  })

  it('is still not one of the twelve quick chips', () => {
    expect(ALL_CHIPS).not.toContain('Sub-Rental')
    for (const chip of LIVE_CHIPS) {
      expect(JSON.stringify(q(chip).filters)).not.toContain('line_type')
    }
  })

  it('states the derivation in the sentence the footer shows', () => {
    expect(SUB_RENTAL_NOTE).toContain('booking_lines.line_type')
    expect(SUB_RENTAL_NOTE).toContain('any of its lines')
  })
})

describe('toRentalListRow — external gear is derived, and null still means “unanswered”', () => {
  it('reports null when no set was supplied', () => {
    // ⛔ `false` would be a fabricated figure: the screen would be asserting
    // "carries no external gear" about every booking in the database, from a
    // question nobody asked. The gold-outline treatment fires on `true` only.
    expect(map().isExternal).toBeNull()
    expect(map({ stage: 'On Rent' }).isExternal).toBeNull()
  })

  it('is not derived from any field that happens to be present', () => {
    // Nothing else on a list row correlates with sub-rental. Pinning this stops
    // a later "helpful" derivation from itemCount, project or delivery type.
    expect(map({ itemCount: 0, project: null }).isExternal).toBeNull()
    expect(map({ deliveryType: 'Third Party' }).isExternal).toBeNull()
  })

  it('answers true or false once the derived set is known', () => {
    expect(toRentalListRow(ROW, BEFORE_EVERYTHING, new Set([ROW.id])).isExternal).toBe(true)
    expect(toRentalListRow(ROW, BEFORE_EVERYTHING, new Set()).isExternal).toBe(false)
  })

  it('withSubRental applies the same answer to an already-mapped row', () => {
    const row = map()
    expect(withSubRental(row, new Set([ROW.id])).isExternal).toBe(true)
    expect(withSubRental(row, new Set()).isExternal).toBe(false)
    // Unchanged answer, unchanged identity — the render memo must not churn.
    expect(withSubRental(row, null)).toBe(row)
  })
})

/* ── the column set ──────────────────────────────────────────────────────── */

describe('OPTIONAL_COLUMNS — renamed to what the query can actually fill', () => {
  it('no longer offers a Package column or a Payment column', () => {
    // "Package / Items" promised a bundle name needing a booking_lines→bundle
    // join; "Payment" promised a rental total and an outstanding balance, both
    // of which are the Financial Engine's and deliberately off the list row.
    expect(OPTIONAL_COLUMNS).toEqual(['Items', 'Pickup', 'Return', 'Deposit'])
  })
})
