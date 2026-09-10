import { describe, expect, it, vi } from 'vitest'

/**
 * # What this suite pins
 *
 * The Today conversion has exactly two joints where a silent wrong answer is
 * possible, and neither is reachable from the existing suites:
 *
 * 1. **raw `BookingListRow` → `MovementRow`.** A booking becomes a row on four
 *    panels here. Getting `at` wrong by 5h45m puts a 06:00 pickup on
 *    yesterday's rail; getting `kind` wrong puts a return in the Pickups
 *    column; getting `Overdue` wrong turns a red border on or off. None of the
 *    three throws — they all render a plausible screen.
 * 2. **chip → `ListFilters`.** Four of the six period chips used to return `[]`
 *    from a client-side filter. They are now date ranges the DATABASE applies,
 *    and the one thing that must never happen is an empty `chips.stage`
 *    reaching `applyListFilters`, which reads `[]` as "no constraint" and would
 *    answer a narrowing question by returning MORE rows.
 *
 * `lib/supabase` is replaced because importing `data/today.ts` reaches
 * `queries/bookings.ts` reaches the client, which throws without env vars.
 * Nothing here performs a query — every assertion is on the filter object that
 * WOULD be sent, or on a row object built from a literal.
 */
vi.mock('../../../lib/supabase', () => ({
  supabase: {},
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

import { NPT_OFFSET_MIN, getBusinessToday } from '../../../lib/bs'
import {
  FILTER_SUPPORT,
  MORE_FILTERS,
  businessDayAd,
  businessNowAd,
  clockNowMinutes,
  TODAY_DAY_AD,
  avatarToneFor,
  civilDaysBetween,
  eventDaysOf,
  kathmanduMinutes,
  mergeByTime,
  monogramOf,
  overdueAlert,
  periodRange,
  pickedStages,
  pickupsQuery,
  quoteLapsedAlert,
  returnsQuery,
  toMovementRow,
} from '../../../data/today'
import { overdue, todaysIncoming, todaysOutgoing, type BookingListRow } from '../../../lib/queries/bookings'

/*
 * The anchor these mapping tests pass in.
 *
 * It was `data/today.ts`'s exported `NOW_AD`, which X-06 removed: that constant
 * held midnight UTC of the operating day — a DAY MARKER, and 05:45 in Kathmandu
 * — where every consumer needed an instant. The tests below that use it are
 * asserting field mappings (`at`, `kind`, `due`, `atDayAd`) that do not depend
 * on the anchor at all, so they keep the same shape with the real instant; the
 * ones that DO depend on it already state their own (`NOW_5_AUG`, `NOW_1_AUG`),
 * which is the pattern the rest of this file follows.
 */
const NOW_AD = businessNowAd()

type Raw = BookingListRow

/** A booking that leaves 31 Jul at 09:00 NPT and is due back 2 Aug at 06:00 NPT. */
/**
 * A Kathmandu calendar day, `n` days from the operating day, as `YYYY-MM-DD`.
 * The period chips promise a relationship to today, not a fixed date; written
 * as literals these expectations only held while the operating day was frozen.
 */
const day = (n: number) => new Date(getBusinessToday().getTime() + n * 86_400_000).toISOString().slice(0, 10)

function raw(over: Partial<Raw> = {}): Raw {
  return {
    id: 'b1',
    bookingNo: 'B-715',
    clientId: 'c-abc',
    clientName: 'ABC Films',
    project: 'Daraz Dashain TVC',
    stage: 'Packed',
    // 03:15Z + 05:45 = 09:00 in Kathmandu.
    pickupAtAd: '2026-07-31T03:15:00.000Z',
    // 00:15Z + 05:45 = 06:00 in Kathmandu.
    returnAtAd: '2026-08-02T00:15:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    pickupLocation: 'Boudha',
    returnLocation: null,
    quoteExpiresAtAd: null,
    createdAtAd: '2026-07-20T04:00:00.000Z',
    itemCount: 18,
    depositRequired: null,
    isCancelled: false,
    isClosed: false,
    ...over,
  }
}

describe('kathmanduMinutes', () => {
  it('reads the clock in Kathmandu, not in UTC', () => {
    // The whole point: 03:15Z is 09:00 on the floor, not 03:15.
    expect(kathmanduMinutes('2026-07-31T03:15:00.000Z')).toBe(9 * 60)
    expect(kathmanduMinutes('2026-08-02T00:15:00.000Z')).toBe(6 * 60)
  })

  it('uses the Date Engine offset rather than a second copy of it', () => {
    // Midnight UTC is NPT_OFFSET_MIN past midnight in Kathmandu, by definition.
    expect(kathmanduMinutes('2026-07-31T00:00:00.000Z')).toBe(NPT_OFFSET_MIN)
  })

  it('wraps rather than reporting a negative or >24h clock', () => {
    // 19:00Z is already 00:45 the NEXT morning in Kathmandu.
    expect(kathmanduMinutes('2026-07-31T19:00:00.000Z')).toBe(45)
  })

  it('refuses an unparseable instant instead of producing NaN', () => {
    expect(() => kathmanduMinutes('not a date')).toThrow(/ISO instant/)
  })
})

describe('toMovementRow · which instant the row sits at', () => {
  it('puts an outgoing row at its pickup_at', () => {
    expect(toMovementRow(raw(), 'outgoing', NOW_AD).at).toBe(9 * 60)
  })

  it('puts an incoming row at its return_at', () => {
    expect(toMovementRow(raw(), 'incoming', NOW_AD).at).toBe(6 * 60)
  })
})

describe('toMovementRow · kind', () => {
  it('separates Pickup from Delivery on delivery_type', () => {
    expect(toMovementRow(raw({ deliveryType: 'Client Pickup' }), 'outgoing', NOW_AD).kind).toBe('Pickup')
    expect(toMovementRow(raw({ deliveryType: 'Babin Delivery' }), 'outgoing', NOW_AD).kind).toBe('Delivery')
    expect(toMovementRow(raw({ deliveryType: 'Courier' }), 'outgoing', NOW_AD).kind).toBe('Delivery')
    expect(toMovementRow(raw({ deliveryType: 'Third Party' }), 'outgoing', NOW_AD).kind).toBe('Delivery')
  })

  it('takes Return-ness from the query, not from the row', () => {
    // Same row, same delivery_type, opposite side.
    expect(toMovementRow(raw({ deliveryType: 'Babin Delivery' }), 'incoming', NOW_AD).kind).toBe('Return')
  })
})

describe('toMovementRow · Overdue, and the flags that are not derived', () => {
  const NOW_5_AUG = '2026-08-05T00:00:00.000Z'

  it('flags a booking due before now and never returned', () => {
    const row = toMovementRow(raw(), 'incoming', NOW_5_AUG)
    expect(row.flags).toEqual(['Overdue'])
    expect(row.statusNote).toBe('3 days late')
  })

  it('does not flag one that came back', () => {
    const row = toMovementRow(raw({ actualReturnAtAd: '2026-08-02T01:00:00.000Z' }), 'incoming', NOW_5_AUG)
    expect(row.flags).toEqual([])
    expect(row.statusNote).toBeUndefined()
  })

  it('does not flag one still in the future', () => {
    /* An instant BEFORE the fixture's 2 Aug return, stated here rather than
       taken from the clock: `businessNowAd()` is the real instant, so on any day
       after 2 Aug 2026 this fixture is overdue and the test would be asserting
       the opposite of what it says. */
    const NOW_1_AUG = '2026-08-01T00:00:00.000Z'
    expect(toMovementRow(raw(), 'incoming', NOW_1_AUG).flags).toEqual([])
  })

  it('says "Late today" rather than "0 days late"', () => {
    const row = toMovementRow(raw({ returnAtAd: '2026-08-04T23:00:00.000Z' }), 'incoming', NOW_5_AUG)
    expect(row.statusNote).toBe('Late today')
  })

  it('singularises one day', () => {
    const row = toMovementRow(raw({ returnAtAd: '2026-08-04T00:15:00.000Z' }), 'incoming', NOW_5_AUG)
    expect(row.statusNote).toBe('1 day late')
  })

  it('never invents VIP or Due Soon — neither has a column', () => {
    for (const now of [NOW_AD, NOW_5_AUG]) {
      for (const side of ['outgoing', 'incoming'] as const) {
        const { flags } = toMovementRow(raw(), side, now)
        expect(flags).not.toContain('VIP')
        expect(flags).not.toContain('Due Soon')
      }
    }
  })
})

describe('toMovementRow · the fields that survived, and the shapes of the ones that changed', () => {
  it('carries the booking through unaltered where a column exists', () => {
    const row = toMovementRow(raw(), 'outgoing', NOW_AD)
    expect(row.id).toBe('b1')
    expect(row.bookingNo).toBe('B-715')
    expect(row.client).toBe('ABC Films')
    expect(row.status).toBe('Packed')
    expect(row.itemCount).toBe(18)
    expect(row.project).toBe('Daraz Dashain TVC')
    expect(row.pickupLocation).toBe('Boudha')
  })

  it('passes a null project through as null — the render decides the non-value', () => {
    expect(toMovementRow(raw({ project: null }), 'outgoing', NOW_AD).project).toBeNull()
    expect(toMovementRow(raw({ returnLocation: null }), 'outgoing', NOW_AD).returnLocation).toBeNull()
  })

  it('formats the due stamp in Kathmandu', () => {
    expect(toMovementRow(raw(), 'outgoing', NOW_AD).due).toBe('Due 2 Aug 2026 · 06:00 AM')
  })

  it('states the duration as two dates and does NOT count rental days', () => {
    // Law 1 — a rental-day count is the Financial Engine's figure, not a page's.
    const { duration } = toMovementRow(raw(), 'outgoing', NOW_AD)
    expect(duration).toBe('31 Jul 2026 → 2 Aug 2026')
    expect(duration).not.toMatch(/day/)
  })

  it('carries the Kathmandu day of its OWN side, not of the booking', () => {
    // The pickup is 31 Jul in Kathmandu; the return is 2 Aug. One booking, two
    // rows, two days — which is what lets the mini-month mark both honestly.
    expect(toMovementRow(raw(), 'outgoing', NOW_AD).atDayAd).toBe('2026-07-31')
    expect(toMovementRow(raw(), 'incoming', NOW_AD).atDayAd).toBe('2026-08-02')
  })

  it('reads that day in Kathmandu, not in UTC', () => {
    // 19:00Z on 31 Jul is already 00:45 on 1 Aug in Kathmandu. Slicing the ISO
    // string would have answered 2026-07-31 and marked the wrong square.
    const row = toMovementRow(raw({ pickupAtAd: '2026-07-31T19:00:00.000Z' }), 'outgoing', NOW_AD)
    expect(row.atDayAd).toBe('2026-08-01')
  })
})

/**
 * The mini-month's dots.
 *
 * ⛔ These were `[3, 8, 14, 22, 27]` — five day numbers with no query behind
 * them, drawn inside the same card as a queried day list and announced as "has
 * movements". The set is now derived from the rows on screen, so a dot is a
 * booking or it is not there.
 */
describe('eventDaysOf · a dot is a booking, never a seeded day number', () => {
  const on = (atDayAd: string) => ({ atDayAd })

  it('marks the day-of-month of every row it is given', () => {
    expect(eventDaysOf([on('2026-07-31'), on('2026-07-03')])).toEqual([3, 31])
  })

  it('deduplicates a busy day and sorts, so the grid lookup is stable', () => {
    expect(eventDaysOf([on('2026-07-14'), on('2026-07-14'), on('2026-07-08')])).toEqual([8, 14])
  })

  it('ignores a day the mini-month does not draw rather than marking the wrong square', () => {
    // August rows arrive whenever the period reaches past 31 Jul. Day 2 of
    // August must not light day 2 of July.
    expect(eventDaysOf([on('2026-08-02'), on('2026-06-30')])).toEqual([])
  })

  it('marks nothing at all when there are no rows — no floor of seeded days', () => {
    expect(eventDaysOf([])).toEqual([])
  })

  it('never reproduces the five retired seed days from an empty period', () => {
    for (const seeded of [3, 8, 14, 22, 27]) {
      expect(eventDaysOf([])).not.toContain(seeded)
    }
  })
})

describe('avatarToneFor · identity, and a closed ramp', () => {
  const RAMP = ['neutral', 'primary', 'progress', 'in']

  it('gives one client one tone, every time', () => {
    expect(avatarToneFor('c-abc')).toBe(avatarToneFor('c-abc'))
  })

  it('never reaches danger, out or ext — each means something else on this screen', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `client-${i}-uuid`)
    for (const id of ids) expect(RAMP).toContain(avatarToneFor(id))
  })

  it('does not collapse every client onto one tone', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => avatarToneFor(`c-${i}`)))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('monogramOf', () => {
  it('initialises the client name', () => {
    expect(monogramOf('Mountain Stories')).toBe('MS')
    expect(monogramOf('ABC Films')).toBe('AF')
    expect(monogramOf('Nepal Film Development Board')).toBe('NFD')
  })

  it('handles one word and stray whitespace', () => {
    expect(monogramOf('Everest')).toBe('E')
    expect(monogramOf('  Rara   Pictures  ')).toBe('RP')
  })

  it('renders a non-value rather than an empty disc', () => {
    expect(monogramOf('   ')).toBe('—')
  })
})

describe('civilDaysBetween', () => {
  it('counts Kathmandu calendar days, not 24-hour blocks', () => {
    // 23:00Z on 4 Aug is already 5 Aug in Kathmandu, so this is ONE day, not two.
    expect(civilDaysBetween('2026-08-04T23:00:00.000Z', '2026-08-05T20:00:00.000Z')).toBe(1)
  })
})

describe('periodRange · all six chips are real ranges', () => {
  it('All is no constraint at all, not an empty range', () => {
    expect(periodRange('All', TODAY_DAY_AD)).toBeNull()
  })

  it('Today is the anchor day', () => {
    expect(periodRange('Today', '2026-07-31')).toEqual({ from: '2026-07-31', to: '2026-07-31' })
  })

  it('Tomorrow crosses the month end without producing 2026-07-32', () => {
    expect(periodRange('Tomorrow', '2026-07-31')).toEqual({ from: '2026-08-01', to: '2026-08-01' })
  })

  it('Next 7 Days is today plus the next six — seven days including today', () => {
    expect(periodRange('Next 7 Days', '2026-07-31')).toEqual({ from: '2026-07-31', to: '2026-08-06' })
  })

  it('This Week runs Monday to Sunday around the anchor', () => {
    // 31 Jul 2026 is a Friday.
    expect(periodRange('This Week', '2026-07-31')).toEqual({ from: '2026-07-27', to: '2026-08-02' })
    // Monday itself must not walk back a whole week.
    expect(periodRange('This Week', '2026-07-27')).toEqual({ from: '2026-07-27', to: '2026-08-02' })
    // Sunday is the last day of its own week, not the first of the next.
    expect(periodRange('This Week', '2026-08-02')).toEqual({ from: '2026-07-27', to: '2026-08-02' })
  })

  it('Next Month is the next AD calendar month, first to last', () => {
    expect(periodRange('Next Month', '2026-07-31')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    // A 30-day month, and a year rollover.
    expect(periodRange('Next Month', '2026-03-15')).toEqual({ from: '2026-04-01', to: '2026-04-30' })
    expect(periodRange('Next Month', '2026-12-05')).toEqual({ from: '2027-01-01', to: '2027-01-31' })
    // February, from a day that does not exist in it.
    expect(periodRange('Next Month', '2028-01-31')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})

describe('pickupsQuery / returnsQuery · the filter set that reaches Postgres', () => {
  it('leaves the named set untouched on Today with nothing picked', () => {
    expect(pickupsQuery('Today', []).filters).toEqual(todaysOutgoing(TODAY_DAY_AD))
    expect(returnsQuery('Today', []).filters).toEqual(todaysIncoming(TODAY_DAY_AD))
  })

  it('spans a multi-day chip from the first day\'s start to the last day\'s end', () => {
    const range = pickupsQuery('Next 7 Days', []).filters.dateRange
    expect(range?.column).toBe('pickup_at')
    // Both bounds carry Nepal's offset, taken from the named set rather than
    // rebuilt here — a UTC-bounded "today" runs 05:45 to 05:45. Since D4 the
    // day is the OPERATIONAL day (default 06:00 → 06:00), so a 7-day chip runs
    // 06:00 on day 0 to 05:59:59.999 on the morning AFTER day 6.
    expect(range?.fromAd).toBe(`${day(0)}T06:00:00.000+05:45`)
    expect(range?.toAd).toBe(`${day(7)}T05:59:59.999+05:45`)
  })

  it('returns are ranged on return_at, pickups on pickup_at', () => {
    expect(returnsQuery('Tomorrow', []).filters.dateRange?.column).toBe('return_at')
    expect(returnsQuery('Tomorrow', []).filters.dateRange?.fromAd).toBe(`${day(1)}T06:00:00.000+05:45`)
  })

  it('All drops the date range and keeps everything else', () => {
    const set = pickupsQuery('All', []).filters
    expect(set.dateRange).toBeUndefined()
    expect(set.chips).toEqual({ stage: ['Booked', 'Packed'] })
    expect(set.presence).toEqual({ cancelled_at: false })
    expect(set.sort).toEqual({ column: 'pickup_at', ascending: true })
  })

  it('keeps the structural predicates every period — Law 3, Cancelled is a flag', () => {
    for (const period of ['All', 'Today', 'Tomorrow', 'Next 7 Days', 'This Week', 'Next Month'] as const) {
      expect(pickupsQuery(period, []).filters.presence).toEqual({ cancelled_at: false })
      expect(returnsQuery(period, []).filters.presence).toEqual({ cancelled_at: false, actual_return_at: false })
    }
  })
})

describe('Status chips · intersection, never replacement', () => {
  it('narrows the column rather than widening it', () => {
    const set = pickupsQuery('Today', ['Packed'])
    expect(set.filters.chips).toEqual({ stage: ['Packed'] })
    expect(set.impossible).toBe(false)
  })

  it('keeps both when both are picked', () => {
    expect(pickupsQuery('Today', ['Booked', 'Packed']).filters.chips).toEqual({ stage: ['Booked', 'Packed'] })
  })

  it('reports impossible rather than sending an empty chip group', () => {
    // ⚠ `applyListFilters` reads [] as NO CONSTRAINT. Sending this set would
    // answer "show me Quotes" by returning every stage in the table.
    const set = pickupsQuery('Today', ['Quote'])
    expect(set.impossible).toBe(true)
    expect(set.filters.chips).toEqual({ stage: [] })
  })

  it('is impossible on one column and fine on the other for the same chip', () => {
    // 'On Rent' is what a return IS and what a pickup is not.
    expect(returnsQuery('Today', ['On Rent']).impossible).toBe(false)
    expect(pickupsQuery('Today', ['On Rent']).impossible).toBe(true)
  })

  it('ignores picked options that carry no stage', () => {
    // 'Camera' is unavailable and cannot be picked through the UI; if one ever
    // reached the state it must not be mistaken for an empty stage set.
    expect(pickupsQuery('Today', ['Camera']).filters.chips).toEqual({ stage: ['Booked', 'Packed'] })
    expect(pickupsQuery('Today', ['Camera']).impossible).toBe(false)
  })

  it('does not disturb the period range', () => {
    expect(pickupsQuery('Tomorrow', ['Packed']).filters.dateRange?.fromAd).toBe(`${day(1)}T06:00:00.000+05:45`)
  })
})

describe('pickedStages', () => {
  it('maps only the options that name a real stage', () => {
    expect(pickedStages(['Booked', 'VIP', 'Camera', 'On Rent'])).toEqual(['Booked', 'On Rent'])
  })

  it('maps Inspection onto the Returned stage — §1.4', () => {
    expect(pickedStages(['Inspection'])).toEqual(['Returned'])
  })

  it('does not repeat a stage two options both name', () => {
    expect(pickedStages(['Returned', 'Inspection'])).toEqual(['Returned'])
  })
})

describe('FILTER_SUPPORT · every option is either live or says why not', () => {
  const options = [...new Set(MORE_FILTERS.flatMap((g) => g.options))]

  it('covers all 32 distinct options', () => {
    expect(options.length).toBe(32)
    for (const o of options) expect(FILTER_SUPPORT[o]).toBeDefined()
  })

  it('never leaves an unavailable option without a reason', () => {
    for (const o of options) {
      const support = FILTER_SUPPORT[o]
      if (support?.kind === 'unavailable') expect(support.reason.length).toBeGreaterThan(20)
    }
  })

  it('marks exactly the six stages plus Inspection as live', () => {
    const live = options.filter((o) => FILTER_SUPPORT[o]?.kind === 'stage').sort()
    expect(live).toEqual(['Booked', 'Closed', 'Inspection', 'On Rent', 'Packed', 'Quote', 'Returned'])
  })

  it('does not silently claim the flag filters work', () => {
    for (const o of ['Late', 'Overdue', 'Expected', 'VIP', 'Damage', 'Missing', 'Camera', 'Freelancer']) {
      expect(FILTER_SUPPORT[o]?.kind).toBe('unavailable')
    }
  })
})

describe('mergeByTime', () => {
  it('interleaves the two columns chronologically', () => {
    const pickups = [toMovementRow(raw({ id: 'p' }), 'outgoing', NOW_AD)]
    const returns = [toMovementRow(raw({ id: 'r' }), 'incoming', NOW_AD)]
    // 09:00 pickup, 06:00 return — the return leads.
    expect(mergeByTime(pickups, returns).map((m) => m.id)).toEqual(['r', 'p'])
  })
})

describe('alerts · built from rows, never typed', () => {
  it('turns an overdue booking into its Critical row', () => {
    const alert = overdueAlert(raw(), '2026-08-05T00:00:00.000Z')
    expect(alert).toEqual({
      icon: 'error',
      statusKey: 'danger',
      title: 'Return Overdue',
      detail: 'ABC Films · B-715',
      right: '3 days late',
      rightTone: 'danger',
      action: 'Open Booking',
      to: '/rentals/B-715',
      priority: 'Critical',
    })
  })

  it('carries no rupee figure and no money action — nothing for Law 6 to strip', () => {
    const alert = overdueAlert(raw(), '2026-08-05T00:00:00.000Z')
    expect(alert.right.startsWith('Rs')).toBe(false)
    expect(alert.action).not.toBe('Receive Payment')
  })

  it('states a quote date rather than ruling the quote dead', () => {
    const alert = quoteLapsedAlert(raw({ stage: 'Quote', quoteExpiresAtAd: '2026-07-28T04:00:00.000Z' }))
    expect(alert.priority).toBe('High')
    expect(alert.right).toBe('28 Jul 2026')
    // 0002:37 leaves "does a quote lapse" unresolved; the row must not answer it.
    expect(alert.title).not.toMatch(/expired|lapsed|dead/i)
  })

  it('renders an explicit non-value when the date is missing', () => {
    expect(quoteLapsedAlert(raw({ quoteExpiresAtAd: null })).right).toBe('—')
  })
})

/* ── X-06 / AR-03 · the anchor ───────────────────────────────────────────── */

/**
 * The register's X-06: `NOW_AD` was `getBusinessToday().toISOString()`, which is
 * midnight **UTC** of the Kathmandu civil date — 05:45 that morning in
 * Kathmandu, and a DAY MARKER where `overdue()` documents that it needs an
 * INSTANT. Everything fed from it (the Rentals Overdue chip and KPI, the
 * Dashboard's Overdue count, Operations' Critical alerts) therefore stopped
 * seeing anything that fell due after 05:45 today.
 *
 * These pin the difference in both directions, so a day marker cannot creep
 * back in under a name that reads like an instant.
 */
describe('the Overdue anchor is an INSTANT, not the operating day', () => {
  /** 5 Aug 2026, 16:00 in Kathmandu. */
  const at4pm = new Date('2026-08-05T10:15:00.000Z')
  /** A booking that fell due at 09:00 that same morning — seven hours late. */
  const dueThisMorning = Date.parse('2026-08-05T03:15:00.000Z')

  it('sweeps in a booking that fell due earlier the same day', () => {
    const toAd = overdue(businessNowAd(at4pm)).dateRange?.toAd
    expect(toAd).toBeDefined()
    expect(dueThisMorning).toBeLessThan(Date.parse(toAd as string))
  })

  it('⛔ the old day-marker anchor did not — this is the defect, stated', () => {
    /* Exactly what `NOW_AD` held: midnight UTC of the operating day. */
    const dayMarker = `${businessDayAd(at4pm)}T00:00:00.000Z`
    const toAd = overdue(dayMarker).dateRange?.toAd
    expect(dueThisMorning).toBeGreaterThan(Date.parse(toAd as string))
  })

  it('AR-03 — the Timeline clock reads the clock, and not 05:45 forever', () => {
    expect(clockNowMinutes(at4pm)).toBe(16 * 60)
    /* What the old `NOW = kathmanduMinutes(NOW_AD)` produced, at every hour of
       every day: the offset itself, mistaken for a time of day. */
    expect(kathmanduMinutes(`${businessDayAd(at4pm)}T00:00:00.000Z`)).toBe(5 * 60 + 45)
  })
})
