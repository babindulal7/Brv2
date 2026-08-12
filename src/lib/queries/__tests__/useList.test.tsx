// @vitest-environment jsdom
/**
 * `useList`, driven.
 *
 * ## Why this file exists in the shape it does
 *
 * `@testing-library/react` is NOT a dependency and is not being added for a
 * test. It is not needed: `renderHook` is a component that calls the hook and
 * publishes the result, and React 18's own `act` + `createRoot` — already the
 * convention in `components/ui/__tests__/PageBody.test.tsx` — is enough to write
 * that component here. `Probe` below is exactly that and nothing more.
 *
 * The environment pragma is per `vitest.config.ts`, which keeps the suite on
 * `node` and documents this opt-in per file.
 *
 * ## Why the filter sets are written out rather than imported
 *
 * The shapes below mirror `queries/bookings.ts`'s named sets, but importing them
 * would pull in `lib/supabase.ts`, which THROWS at import time when
 * `VITE_SUPABASE_URL` is unset — a test run would fail for a reason that has
 * nothing to do with the hook. They are copied with the source named at each
 * site instead; if a named set changes shape, what breaks is a screen, and the
 * claim these tests make (structural predicates must not read as user filters)
 * is unaffected.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useList, type ListResult, type ListQueryResult, type UseListOptions } from '../useList'
import type { ListFilters } from '../listQuery'
import { PageBody } from '../../../components/ui/PageBody'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

interface Row {
  id: string
}

let container: HTMLDivElement
let root: Root
let latest: ListResult<Row> | null = null

interface ProbeProps {
  fetcher: (filters: ListFilters) => Promise<ListQueryResult<Row>>
  filters?: ListFilters
  options?: UseListOptions
}

/** The whole of `renderHook`, for one hook, with no new dependency. */
function Probe({ fetcher, filters, options }: ProbeProps) {
  latest = useList(fetcher, filters, options)
  return null
}

async function mount(props: ProbeProps) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Probe {...props} />)
  })
}

async function rerender(props: ProbeProps) {
  await act(async () => {
    root.render(<Probe {...props} />)
  })
}

/** The last hook result, with the null-check that `strict` demands stated once. */
function result(): ListResult<Row> {
  if (!latest) throw new Error('Probe has not rendered')
  return latest
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  latest = null
})

/** A fetcher that records what it was asked for. */
function recording(impl: (filters: ListFilters, call: number) => Promise<ListQueryResult<Row>>) {
  const calls: ListFilters[] = []
  const fetcher = (filters: ListFilters) => {
    calls.push(filters)
    return impl(filters, calls.length)
  }
  return Object.assign(fetcher, { calls })
}

const ok = (rows: Row[], total: number | null = null) =>
  recording(() => Promise.resolve({ rows, total }))

/* ── The filter sets, copied from `queries/bookings.ts` ────────────────────── */

/** `todaysOutgoing('2026-08-12')`. Every field here is the query's definition of the list. */
const TODAYS_OUTGOING: ListFilters = {
  dateRange: { column: 'pickup_at', fromAd: '2026-08-12T00:00:00.000+05:45', toAd: '2026-08-12T23:59:59.999+05:45' },
  chips: { stage: ['Booked', 'Packed'] },
  presence: { cancelled_at: false },
  sort: { column: 'pickup_at', ascending: true },
}

/** `operationQueue('packing')` with no date bounds — chips + presence only. */
const OPERATION_PACKING: ListFilters = {
  chips: { stage: ['Booked'] },
  presence: { cancelled_at: false },
  sort: { column: 'pickup_at', ascending: true },
}

describe('useList — the happy path', () => {
  it('reports rows, total and a finished load', async () => {
    await mount({ fetcher: ok([{ id: 'a' }, { id: 'b' }], 2) })
    expect(result().rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result().total).toBe(2)
    expect(result().loading).toBe(false)
    expect(result().error).toBeNull()
    expect(result().isEmpty).toBe(false)
  })

  it('calls isEmpty only on a successful query that matched nothing', async () => {
    await mount({ fetcher: ok([]) })
    expect(result().isEmpty).toBe(true)
  })

  it('does not refetch when an equivalent filter object is rebuilt', async () => {
    // The screen's filters are a fresh literal every render. A reference
    // dependency would loop forever; this is the guard on that.
    const fetcher = ok([{ id: 'a' }])
    await mount({ fetcher, filters: { chips: { stage: ['Booked'] }, search: 'FX3' } })
    await rerender({ fetcher, filters: { search: 'FX3', chips: { stage: ['Booked'] } } })
    expect(fetcher.calls).toHaveLength(1)
  })

  it('refetches when the filters genuinely change, and when asked to', async () => {
    const fetcher = ok([{ id: 'a' }])
    await mount({ fetcher, filters: { search: 'FX3' } })
    await rerender({ fetcher, filters: { search: 'FX6' } })
    expect(fetcher.calls).toHaveLength(2)

    await act(async () => {
      result().refetch()
    })
    expect(fetcher.calls).toHaveLength(3)
  })
})

describe('useList — the error is a REASON, not a sentence', () => {
  /**
   * DEFECT 1. The hook used to set `Could not load ${noun}. ${detail}`, while
   * `PageBody` renders `error` as the message UNDER a title it composes itself.
   * Paired as the kit intends, the operator read "Could not load rentals" over
   * "Could not load rentals. …". The hook now reports only the reason.
   */
  it('reports the thrown message verbatim, with no sentence wrapped around it', async () => {
    await mount({ fetcher: recording(() => Promise.reject(new Error('listBookings failed: JWT expired'))) })
    expect(result().error).toBe('listBookings failed: JWT expired')
    expect(result().error).not.toContain('Could not load')
  })

  it('stringifies a non-Error rejection rather than reporting [object Object]', async () => {
    await mount({ fetcher: recording(() => Promise.reject('the network vanished')) })
    expect(result().error).toBe('the network vanished')
  })

  it('is not empty while it is errored — the two are different facts', async () => {
    await mount({ fetcher: recording(() => Promise.reject(new Error('nope'))) })
    expect(result().rows).toEqual([])
    expect(result().isEmpty).toBe(false)
  })

  it('keeps the rows when a REFETCH fails, and clears the error when one succeeds', async () => {
    // The promise this leans on: a failed refresh must not blank a list someone
    // is reading. `PageBody`'s `hasRows` is what makes it visible on screen.
    const fetcher = recording((_f, call) =>
      call === 1 ? Promise.resolve({ rows: [{ id: 'a' }, { id: 'b' }], total: 2 }) : Promise.reject(new Error('offline')),
    )
    await mount({ fetcher })
    expect(result().rows).toHaveLength(2)

    await act(async () => {
      result().refetch()
    })
    expect(result().error).toBe('offline')
    expect(result().rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result().total).toBe(2)

    const healed = ok([{ id: 'a' }])
    await rerender({ fetcher: healed, filters: { search: 'x' } })
    expect(result().error).toBeNull()
  })
})

describe('useList — isFiltered means the USER narrowed this', () => {
  /**
   * DEFECT 2. `isFiltered` was a heuristic over the merged filter set, and every
   * named set in `bookings.ts` carries `presence: { cancelled_at: false }` — so
   * it answered `true` unconditionally and `PageBody` offered "No rentals match
   * these filters · Clear filters", with a button that cleared nothing, on a
   * genuinely empty table.
   */
  it('is FALSE when the filters are exactly the list’s own definition', async () => {
    await mount({ fetcher: ok([]), filters: TODAYS_OUTGOING, options: { baseline: TODAYS_OUTGOING } })
    expect(result().isFiltered).toBe(false)
  })

  it('is false for a chips+presence set with no dates either', async () => {
    await mount({ fetcher: ok([]), filters: OPERATION_PACKING, options: { baseline: OPERATION_PACKING } })
    expect(result().isFiltered).toBe(false)
  })

  it('is false when the baseline set is rebuilt with its keys in another order', async () => {
    const reordered: ListFilters = {
      sort: { ascending: true, column: 'pickup_at' },
      presence: { cancelled_at: false },
      chips: { stage: ['Booked'] },
    }
    await mount({ fetcher: ok([]), filters: reordered, options: { baseline: OPERATION_PACKING } })
    expect(result().isFiltered).toBe(false)
  })

  it('is TRUE once the user types a search on top of the baseline', async () => {
    await mount({
      fetcher: ok([]),
      filters: { ...TODAYS_OUTGOING, search: 'FX3' },
      options: { baseline: TODAYS_OUTGOING },
    })
    expect(result().isFiltered).toBe(true)
  })

  it('is TRUE when the user narrows a chip group the baseline had opened wider', async () => {
    await mount({
      fetcher: ok([]),
      filters: { ...TODAYS_OUTGOING, chips: { stage: ['Packed'] } },
      options: { baseline: TODAYS_OUTGOING },
    })
    expect(result().isFiltered).toBe(true)
  })

  it('is TRUE when the user adds a chip group of their own', async () => {
    await mount({
      fetcher: ok([]),
      filters: { ...OPERATION_PACKING, chips: { stage: ['Booked'], delivery_type: ['Courier'] } },
      options: { baseline: OPERATION_PACKING },
    })
    expect(result().isFiltered).toBe(true)
  })

  it('is TRUE when the user picks a date range the baseline did not have', async () => {
    await mount({
      fetcher: ok([]),
      filters: { ...OPERATION_PACKING, dateRange: { column: 'pickup_at', fromAd: '2026-08-01' } },
      options: { baseline: OPERATION_PACKING },
    })
    expect(result().isFiltered).toBe(true)
  })

  it('is TRUE when the user moves the date range the baseline set', async () => {
    await mount({
      fetcher: ok([]),
      filters: { ...TODAYS_OUTGOING, dateRange: { column: 'pickup_at', fromAd: '2026-08-01' } },
      options: { baseline: TODAYS_OUTGOING },
    })
    expect(result().isFiltered).toBe(true)
  })

  it('is TRUE when the user asks for a presence flag of their own', async () => {
    // A presence flag is not automatically structural — "Cancelled" and "Closed"
    // are timestamps, so a real user chip is expressed this way too. What makes
    // one structural is being in the baseline, not being a presence flag.
    await mount({
      fetcher: ok([]),
      filters: { ...OPERATION_PACKING, presence: { cancelled_at: false, closed_at: true } },
      options: { baseline: OPERATION_PACKING },
    })
    expect(result().isFiltered).toBe(true)
  })

  it('ignores sort and page — neither narrows anything', async () => {
    await mount({
      fetcher: ok([]),
      filters: { ...OPERATION_PACKING, sort: { column: 'return_at', ascending: false }, page: { index: 3, size: 25 } },
      options: { baseline: OPERATION_PACKING },
    })
    expect(result().isFiltered).toBe(false)
  })

  it('ignores searchColumns, which is plumbing for search rather than a constraint', async () => {
    await mount({
      fetcher: ok([]),
      filters: { ...OPERATION_PACKING, searchColumns: ['booking_no', 'project'] },
      options: { baseline: OPERATION_PACKING },
    })
    expect(result().isFiltered).toBe(false)
  })

  it('treats an emptied chip group as the "All" chip, not as a filter', async () => {
    // A filter bar that always passes `chips: { stage: selected }` sends `[]`
    // when nothing is selected. `applyListFilters` sends no constraint for it,
    // so neither may this.
    await mount({ fetcher: ok([]), filters: { chips: { stage: [] } } })
    expect(result().isFiltered).toBe(false)
  })

  it('treats a blank or punctuation-only search box as unfiltered', async () => {
    // Same sanitiser the query uses, so the flag cannot disagree with the SQL.
    await mount({ fetcher: ok([]), filters: { search: '  ,,  ' } })
    expect(result().isFiltered).toBe(false)
  })

  it('treats a date range with neither end set as unfiltered', async () => {
    await mount({ fetcher: ok([]), filters: { dateRange: { column: 'pickup_at' } } })
    expect(result().isFiltered).toBe(false)
  })

  it('still answers true for a plain directory screen that has no baseline', async () => {
    // The simple case must keep working without anyone declaring anything.
    await mount({ fetcher: ok([]), filters: { search: 'Karki' } })
    expect(result().isFiltered).toBe(true)

    await rerender({ fetcher: ok([]), filters: { chips: { blocked: ['yes'] } } })
    expect(result().isFiltered).toBe(true)
  })

  it('lets a screen override the answer in both directions', async () => {
    await mount({ fetcher: ok([]), filters: { search: 'Karki' }, options: { isFilteredOverride: false } })
    expect(result().isFiltered).toBe(false)

    await rerender({ fetcher: ok([]), filters: {}, options: { isFilteredOverride: true } })
    expect(result().isFiltered).toBe(true)
  })

  it('sends the whole filter set to the fetcher, baseline included', async () => {
    // `baseline` describes the filters; it must never subtract from them.
    const fetcher = ok([])
    await mount({ fetcher, filters: TODAYS_OUTGOING, options: { baseline: TODAYS_OUTGOING } })
    expect(fetcher.calls[0]).toEqual(TODAYS_OUTGOING)
  })
})

describe('useList + PageBody, paired as the kit intends', () => {
  /**
   * The pairing is the thing that was broken, so it is the thing under test:
   * neither half's own unit test can catch the sentence being said twice. This
   * mounts the real component on the real hook's real failure.
   */
  it('says the failure sentence exactly once', async () => {
    await mount({ fetcher: recording(() => Promise.reject(new Error('JWT expired'))) })

    const view = document.createElement('div')
    document.body.appendChild(view)
    const viewRoot = createRoot(view)
    await act(async () => {
      viewRoot.render(
        <PageBody error={result().error} noun="rentals" hasRows={result().rows.length > 0}>
          THE-REAL-TABLE
        </PageBody>,
      )
    })

    const text = view.textContent ?? ''
    expect(text.match(/Could not load rentals/g)).toHaveLength(1)
    expect(text).toContain('JWT expired')
    // The tell-tale of the old double sentence.
    expect(text).not.toContain('Could not load rentals. ')

    act(() => viewRoot.unmount())
    view.remove()
  })

  it('keeps a good table on screen when a refresh fails', async () => {
    const fetcher = recording((_f, call) =>
      call === 1 ? Promise.resolve({ rows: [{ id: 'a' }], total: 1 }) : Promise.reject(new Error('offline')),
    )
    await mount({ fetcher })
    await act(async () => {
      result().refetch()
    })

    const view = document.createElement('div')
    document.body.appendChild(view)
    const viewRoot = createRoot(view)
    await act(async () => {
      viewRoot.render(
        <PageBody error={result().error} noun="rentals" hasRows={result().rows.length > 0} empty={result().isEmpty}>
          THE-REAL-TABLE
        </PageBody>,
      )
    })

    const text = view.textContent ?? ''
    expect(text).toContain('THE-REAL-TABLE')
    expect(text).toContain('offline')
    expect(text).toContain('Could not refresh rentals')

    act(() => viewRoot.unmount())
    view.remove()
  })
})
