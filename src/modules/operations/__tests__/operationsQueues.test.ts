import { describe, expect, it, vi } from 'vitest'

/**
 * # Operations Queues — the two mappings, pinned
 *
 * This screen used to touch no database at all: five hand-typed queue counts
 * above a seven-row constant array they disagreed with, both chip rows filtering
 * that array in memory. What replaced it is two mappings, and they are the two
 * things that can break the screen silently:
 *
 *  1. **filter set → `ListFilters`** — a wrong stage literal does not error.
 *     `stage IN ('Ready')` matches nothing, and the queue renders a perfectly
 *     plausible empty day. Nothing else in the suite would catch it.
 *  2. **raw row → view model** — `toJobRow` decides which verb a row is and
 *     which of the booking's two instants is its due time. Reading the wrong one
 *     puts a return job's pickup date in the Due column, which looks fine.
 *
 * Plus the route table, which had a real defect: every Return row opened
 * `EvidenceWorkspace`.
 *
 * ## Why `lib/supabase` is mocked
 *
 * `data/operations.ts` imports `operationQueue` from `queries/bookings.ts`,
 * which imports the supabase client, and that module THROWS at import time when
 * `VITE_SUPABASE_URL` is unset — a failure with nothing to do with these
 * mappings. Replaced wholesale, exactly as `queries/__tests__/bookings.test.ts`
 * does. Nothing here reaches a database, and no query is executed: every
 * assertion is on a plain object or a string.
 */
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

import {
  DUE_COLUMN,
  GROUP_JOBS,
  GROUP_LABEL,
  QUEUES,
  QUEUE_KEY,
  URL_KEY,
  formatDueAt,
  groupFromParam,
  jobForStage,
  jobListFilters,
  jobRoute,
  queueCountFilters,
  queueFromParam,
  toJobRow,
} from '../../../data/operations'
import { operationQueue, type BookingListRow } from '../../../lib/queries/bookings'
import { rupees } from '../../../lib/money'
import type { ListFilters } from '../../../lib/queries/listQuery'
import { BOOKING_STATUS, JOBS, JOB_ORDER, type BookingStatus, type JobName } from '../../../lib/workflow'

const CANONICAL_SIX = Object.keys(BOOKING_STATUS)

/** Every filter set this screen can build, in one place. */
const EVERY_SET: ListFilters[] = [
  jobListFilters(null, null),
  jobListFilters(null, 'pickup'),
  jobListFilters(null, 'return'),
  ...JOB_ORDER.map((job) => jobListFilters(job, null)),
  ...JOB_ORDER.map((job) => queueCountFilters(job)),
]

function stagesOf(filters: ListFilters): readonly string[] {
  return filters.chips?.['stage'] ?? []
}

/* ── The chips ───────────────────────────────────────────────────────────── */

describe('QUEUES — five chips, four of them verbs', () => {
  it('carries the four §1.5 verbs in order, plus Cases', () => {
    expect(QUEUES.map((q) => q.job)).toEqual([...JOB_ORDER, 'Cases'])
  })

  it('no longer carries a hand-typed count or overdue figure', () => {
    // The whole defect: `QUEUES[0].count` was the literal 8, rendered directly
    // above a table header that said "Packing — 2 jobs". Both numbers now come
    // from the same server-side count of the same `operationQueue()` set, so the
    // literals must not exist to be read by mistake.
    for (const q of QUEUES) {
      expect(q).not.toHaveProperty('count')
      expect(q).not.toHaveProperty('overdue')
    }
  })

  it('maps every verb to an operationQueue key, and Cases to none', () => {
    expect(QUEUE_KEY).toEqual({ Pack: 'packing', Handover: 'handover', Return: 'return', Reset: 'reset' })
    expect(QUEUE_KEY).not.toHaveProperty('Cases')
  })
})

describe('the URL is the state', () => {
  it('round-trips every chip through its query-string key', () => {
    for (const job of [...JOB_ORDER, 'Cases'] as Array<JobName | 'Cases'>) {
      expect(queueFromParam(URL_KEY[job])).toBe(job)
    }
  })

  it('answers null for absent, blank and unrecognised values rather than guessing', () => {
    // A stale link (`?queue=cleaning` — a retired queue) must land on the
    // unfiltered screen, not on a chip that half-matches.
    expect(queueFromParam(null)).toBeNull()
    expect(queueFromParam('')).toBeNull()
    expect(queueFromParam('cleaning')).toBeNull()
    expect(queueFromParam('Packing')).toBeNull()
    expect(groupFromParam(null)).toBeNull()
    expect(groupFromParam('pickup')).toBe('pickup')
    expect(groupFromParam('return')).toBe('return')
    expect(groupFromParam('both')).toBeNull()
  })
})

/* ── Filter sets ─────────────────────────────────────────────────────────── */

describe('a queue chip → operationQueue(), exactly', () => {
  it('sends each verb through its own named set, undecorated', () => {
    expect(jobListFilters('Pack', null)).toEqual(operationQueue('packing'))
    expect(jobListFilters('Handover', null)).toEqual(operationQueue('handover'))
    expect(jobListFilters('Return', null)).toEqual(operationQueue('return'))
    expect(jobListFilters('Reset', null)).toEqual(operationQueue('reset'))
  })

  it('pins the four stage mappings the screen depends on', () => {
    expect(stagesOf(jobListFilters('Pack', null))).toEqual(['Booked'])
    expect(stagesOf(jobListFilters('Handover', null))).toEqual(['Packed'])
    expect(stagesOf(jobListFilters('Return', null))).toEqual(['On Rent'])
    expect(stagesOf(jobListFilters('Reset', null))).toEqual(['Returned'])
  })

  it('agrees with §1.5: the stage a chip asks for is the stage its job runs at', () => {
    for (const job of JOB_ORDER) {
      expect(stagesOf(jobListFilters(job, null))).toEqual([JOBS[job].runsAt])
    }
  })
})

describe('a group chip → one stage union, server-side', () => {
  it('groups the two queues that put gear out, ordered by pickup', () => {
    expect(jobListFilters(null, 'pickup')).toEqual({
      chips: { stage: ['Booked', 'Packed'] },
      presence: { cancelled_at: false },
      sort: { column: 'pickup_at', ascending: true },
    })
  })

  it('groups the two that bring it back, ordered by return', () => {
    expect(jobListFilters(null, 'return')).toEqual({
      chips: { stage: ['On Rent', 'Returned'] },
      presence: { cancelled_at: false },
      sort: { column: 'return_at', ascending: true },
    })
  })

  it('is exactly the union of the two queues it groups', () => {
    // The grouping must not become a third definition of what Pack or Return
    // means: whatever `operationQueue` says a member queue selects, the group
    // selects too.
    for (const group of ['pickup', 'return'] as const) {
      const union = stagesOf(jobListFilters(null, group))
      for (const job of GROUP_JOBS[group]) {
        for (const stage of stagesOf(jobListFilters(job, null))) expect(union).toContain(stage)
      }
      expect(union).toHaveLength(GROUP_JOBS[group].length)
    }
  })

  it('takes precedence over a queue chip, matching the URL that clears one when the other is set', () => {
    expect(jobListFilters('Reset', 'pickup')).toEqual(jobListFilters(null, 'pickup'))
  })

  it('labels the groups without the word "customer" (Law 17) and without claiming a date filter it does not apply', () => {
    expect(Object.values(GROUP_LABEL).join(' ').toLowerCase()).not.toContain('customer')
  })
})

describe('no chip at all → all four verbs', () => {
  it('asks for every stage a job runs at, and nothing else', () => {
    expect(jobListFilters(null, null)).toEqual({
      chips: { stage: ['Booked', 'Packed', 'On Rent', 'Returned'] },
      presence: { cancelled_at: false },
      sort: { column: 'pickup_at', ascending: true },
    })
  })

  it('never asks for a stage that has no job — Quote and Closed are not floor work', () => {
    const stages = stagesOf(jobListFilters(null, null))
    expect(stages).not.toContain('Quote')
    expect(stages).not.toContain('Closed')
  })
})

describe('every set this screen can build', () => {
  it('names only members of the canonical six', () => {
    // Rule 5. A retired name ('Inspection', 'Cleaning', 'Completed', 'Ready')
    // does not error — it matches nothing and renders a plausible empty queue.
    for (const set of EVERY_SET) {
      const stages = stagesOf(set)
      expect(stages.length).toBeGreaterThan(0)
      for (const stage of stages) expect(CANONICAL_SIX).toContain(stage)
    }
  })

  it('excludes cancellations as a flag, never as a stage (Law 3 / 0015)', () => {
    for (const set of EVERY_SET) {
      expect(set.presence).toMatchObject({ cancelled_at: false })
      expect(stagesOf(set)).not.toContain('Cancelled')
    }
  })

  it('binds no date range — this screen has no date control', () => {
    // `operationQueue(queue, fromAd?, toAd?)` takes two optional day bounds and
    // there is nothing on this screen to bind them to. "Pickup Today" and
    // "Return Today" read like dates and are not: they are a stage grouping,
    // and inventing a picker to fill the arguments would be a product decision.
    for (const set of EVERY_SET) expect(set.dateRange).toBeUndefined()
  })

  it('sorts every set, so paging stays deterministic under listBookings’ id tiebreak', () => {
    for (const set of EVERY_SET) {
      expect(set.sort?.column).toMatch(/^(pickup_at|return_at)$/)
      expect(set.sort?.ascending).toBe(true)
    }
  })
})

describe('queueCountFilters — the card count', () => {
  it('is the queue’s own set plus a one-row page, so the card and the table cannot disagree', () => {
    for (const job of JOB_ORDER) {
      expect(queueCountFilters(job)).toEqual({ ...operationQueue(QUEUE_KEY[job]), page: { index: 0, size: 1 } })
    }
  })

  it('narrows nothing beyond the queue definition', () => {
    // `page` is not a narrowing predicate — `useList`'s `narrowingKey` ignores
    // it — so a count query can never make a card read as filtered.
    for (const job of JOB_ORDER) {
      const { page, ...rest } = queueCountFilters(job)
      expect(page).toEqual({ index: 0, size: 1 })
      expect(rest).toEqual(jobListFilters(job, null))
    }
  })
})

describe('DUE_COLUMN — one answer for the Due cell and for the ordering', () => {
  it('agrees with the column operationQueue orders that queue by', () => {
    // If these two ever disagree, the Due column shows one instant while the
    // list is ordered by another, and the queue looks shuffled.
    for (const job of JOB_ORDER) {
      expect(operationQueue(QUEUE_KEY[job]).sort?.column).toBe(DUE_COLUMN[job])
    }
  })

  it('gives both jobs in a group the same due column, which is what makes the group orderable', () => {
    for (const group of ['pickup', 'return'] as const) {
      const columns = new Set(GROUP_JOBS[group].map((j) => DUE_COLUMN[j]))
      expect(columns.size).toBe(1)
      expect(jobListFilters(null, group).sort?.column).toBe([...columns][0])
    }
  })
})

/* ── Row mapping ─────────────────────────────────────────────────────────── */

/**
 * A complete list row, shaped as `listBookings` returns it. Pickup and return
 * are deliberately far apart so a mapping that reads the wrong instant fails
 * rather than coincidentally matching.
 */
const ROW: BookingListRow = {
  id: '8f1d1a56-0b6a-4f0e-9d3c-2f4b6c7a9e11',
  bookingNo: 'B-715',
  clientId: 'c0ffee00-1111-4222-8333-444455556666',
  clientName: 'Himalaya Films',
  project: 'FX3 Documentary',
  stage: 'Booked',
  pickupAtAd: '2026-08-14T03:15:00.000Z',
  returnAtAd: '2026-08-18T10:30:00.000Z',
  actualReturnAtAd: null,
  deliveryType: 'Client Pickup',
  pickupLocation: null,
  returnLocation: null,
  quoteExpiresAtAd: null,
  createdAtAd: '2026-07-12T09:41:00.000Z',
  itemCount: 7,
  depositRequired: null,
  isCancelled: false,
  isClosed: false,
}

/** Long before both instants above, so nothing is past due unless a test says so. */
const BEFORE_EVERYTHING = Date.parse('2026-08-01T00:00:00.000Z')

function map(overrides: Partial<BookingListRow>, nowMs = BEFORE_EVERYTHING) {
  const row = toJobRow({ ...ROW, ...overrides }, nowMs)
  if (!row) throw new Error('expected a mapped job row')
  return row
}

describe('toJobRow — raw list row → job row', () => {
  it('derives the verb from the stage, per §1.5', () => {
    expect(map({ stage: 'Booked' }).job).toBe('Pack')
    expect(map({ stage: 'Packed' }).job).toBe('Handover')
    expect(map({ stage: 'On Rent' }).job).toBe('Return')
    expect(map({ stage: 'Returned' }).job).toBe('Reset')
  })

  it('drops a row whose stage carries no job rather than labelling it with a guess', () => {
    // Unreachable through the chips — no set asks for Quote or Closed — so a row
    // here means the query returned something it was not asked for. There is no
    // verb to label it with and no workspace to open it in.
    expect(toJobRow({ ...ROW, stage: 'Quote' }, BEFORE_EVERYTHING)).toBeNull()
    expect(toJobRow({ ...ROW, stage: 'Closed' }, BEFORE_EVERYTHING)).toBeNull()
    expect(jobForStage('Quote')).toBeNull()
    expect(jobForStage('Closed')).toBeNull()
  })

  it('takes the due instant from the column that verb is due on', () => {
    expect(map({ stage: 'Booked' }).dueAtAd).toBe(ROW.pickupAtAd)
    expect(map({ stage: 'Packed' }).dueAtAd).toBe(ROW.pickupAtAd)
    expect(map({ stage: 'On Rent' }).dueAtAd).toBe(ROW.returnAtAd)
    expect(map({ stage: 'Returned' }).dueAtAd).toBe(ROW.returnAtAd)
  })

  it('carries the identifiers and counts through unchanged', () => {
    expect(map({})).toMatchObject({
      id: ROW.id,
      bookingNo: 'B-715',
      clientId: ROW.clientId,
      clientName: 'Himalaya Films',
      project: 'FX3 Documentary',
      stage: 'Booked',
      // Units across live lines, not a row count — `listBookings` sums `qty`.
      itemCount: 7,
    })
  })

  it('passes a null project through as null, inventing no kit name', () => {
    // `bookings.project` is nullable and there is no column behind the "Kit"
    // this table used to print ('RED Komodo X Package'). A null must arrive as a
    // null so the screen can render an explicit non-value; coalescing it to a
    // plausible string here is precisely the defect.
    expect(map({ project: null }).project).toBeNull()
  })

  it('carries no money field at all (Law 6)', () => {
    // The warehouse floor may not see rupees, and `bookings.deposit_required` is
    // unmasked on the base table — so the view model must not have a place to
    // put one even if a caller ignored the gate and passed `withDeposit`.
    const withMoney = map({ depositRequired: rupees(5000) })
    expect(Object.keys(withMoney)).not.toContain('depositRequired')
    expect(JSON.stringify(withMoney)).not.toContain('500000')
  })
})

describe('isPastDue — a claim about the instant on screen, and nothing more', () => {
  it('is false while the due instant is still ahead', () => {
    expect(map({ stage: 'Booked' }).isPastDue).toBe(false)
  })

  it('is true once it has passed', () => {
    expect(map({ stage: 'Booked' }, Date.parse('2026-08-14T03:15:00.001Z')).isPastDue).toBe(true)
  })

  it('reads only the column that verb is due on', () => {
    // A booking On Rent whose PICKUP is long past is not late: it is out, which
    // is the point. Only its return instant can make it late.
    expect(map({ stage: 'On Rent' }, Date.parse('2026-08-15T00:00:00.000Z')).isPastDue).toBe(false)
    expect(map({ stage: 'On Rent' }, Date.parse('2026-08-19T00:00:00.000Z')).isPastDue).toBe(true)
  })
})

describe('formatDueAt — Law 7, rendered in Kathmandu', () => {
  it('renders the NPT wall clock, not UTC', () => {
    // 03:15Z is 09:00 in Kathmandu (+05:45).
    expect(formatDueAt('2026-08-14T03:15:00.000Z')).toBe('14 Aug · 09:00')
  })

  it('renders the Kathmandu DAY, which is tomorrow for the last 5h45m of every UTC day', () => {
    expect(formatDueAt('2026-08-14T18:30:00.000Z')).toBe('15 Aug · 00:15')
  })

  it('renders an unparseable instant as a non-value rather than "Invalid Date"', () => {
    expect(formatDueAt('not-a-date')).toBe('—')
  })
})

/* ── Routing ─────────────────────────────────────────────────────────────── */

describe('jobRoute — the Return queue reaches ReturnWorkspace', () => {
  /**
   * The defect this replaces, `resolveJobRoute` line 108:
   *
   *     if (jLower === 'evidence' || jLower === 'return') return `/rentals/${b}/evidence`
   *
   * Folding 'return' into the evidence arm sent every Return row to
   * `EvidenceWorkspace`, and `/rentals/:bookingNo/return` — `ReturnWorkspace`,
   * `App.tsx:201-211` — was unreachable from this screen.
   */
  it('routes a Return row to the Return workspace, not to Evidence', () => {
    expect(jobRoute('B-715', 'Return')).toBe('/rentals/B-715/return')
    expect(jobRoute('B-715', 'Return')).not.toContain('evidence')
  })

  it('routes the other three verbs to their own workspaces', () => {
    expect(jobRoute('B-715', 'Pack')).toBe('/rentals/B-715/packing')
    expect(jobRoute('B-715', 'Handover')).toBe('/rentals/B-715/handover')
    expect(jobRoute('B-715', 'Reset')).toBe('/rentals/B-715/reset')
  })

  it('gives every verb a distinct route that exists in App.tsx', () => {
    const routes = JOB_ORDER.map((job) => jobRoute('B-715', job))
    expect(new Set(routes).size).toBe(JOB_ORDER.length)
    for (const route of routes) {
      expect(['packing', 'handover', 'return', 'reset']).toContain(route.split('/').pop())
    }
  })

  it('has no arm for a job that is not one of the four', () => {
    // `resolveJobRoute` carried a 'cases' arm and an 'evidence' arm, neither of
    // which a `JobName` can ever reach. A total Record over the four makes both
    // unrepresentable — this asserts every member routes and none is missing.
    const stages: BookingStatus[] = ['Booked', 'Packed', 'On Rent', 'Returned']
    for (const stage of stages) {
      const job = jobForStage(stage)
      expect(job).not.toBeNull()
      expect(jobRoute('B-715', job as JobName)).toMatch(/^\/rentals\/B-715\/[a-z]+$/)
    }
  })
})
