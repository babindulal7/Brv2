// @vitest-environment jsdom
/**
 * `useFilters`, driven.
 *
 * The badge, the chips and the query all read from one state. These assert they
 * agree — a badge saying 2 beside three lit chips is the failure this hook
 * exists to make impossible — and then that the query string is that state
 * rather than a copy of it (§18).
 *
 * `@testing-library/react` is not a dependency and is not being added to test
 * one hook. `Probe` below is the whole of `renderHook`: a component that calls
 * the hook and publishes its return value, on React 18's own `act` +
 * `createRoot`, which is already the convention in `useList.test.tsx`.
 *
 * The `MemoryRouter` wrapper is not optional scaffolding — `useFilters` calls
 * `useSearchParams` unconditionally, so it needs a Router with or without URL
 * sync, exactly as every screen already provides.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { useFilters, type UseFiltersOptions, type UseFiltersResult } from '../useFilters'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement | null = null
let root: Root | null = null

interface Harness {
  result: { current: UseFiltersResult }
  /** The live query string, so a test can assert what a refresh would restore. */
  search: () => string
  back: () => void
  unmount: () => void
}

function render(options: UseFiltersOptions = {}, initialEntries: string[] = ['/rentals']): Harness {
  const box = { current: undefined as unknown as UseFiltersResult }
  let search = ''
  let goBack: (() => void) | null = null

  function Probe() {
    box.current = useFilters(options)
    search = useLocation().search
    const navigate = useNavigate()
    goBack = () => navigate(-1)
    return null as unknown as ReactNode
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(MemoryRouter, { initialEntries }, createElement(Probe)))
  })

  return {
    result: box,
    search: () => search,
    back: () => act(() => goBack?.()),
    unmount: () => {
      act(() => root!.unmount())
      container?.remove()
      root = null
      container = null
    },
  }
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

describe('useFilters — the state', () => {
  it('starts clean', () => {
    const { result } = render()
    expect(result.current.activeCount).toBe(0)
    expect(result.current.chips).toEqual([])
    expect(result.current.filters).toEqual({})
  })

  it('counts GROUPS not values — two stages read as 1, per §6', () => {
    const { result } = render()
    act(() => result.current.toggleChip('stage', 'Booked'))
    act(() => result.current.toggleChip('stage', 'Packed'))
    // The badge says 1 (one dimension being filtered on)...
    expect(result.current.activeCount).toBe(1)
    // ...while the chip row still shows both values, so nothing is hidden.
    expect(result.current.chips).toHaveLength(2)
    expect(result.current.filters.chips?.stage).toEqual(['Booked', 'Packed'])
  })

  it('counts three different groups as 3 — the §6 worked example', () => {
    const { result } = render()
    act(() => result.current.toggleChip('stage', 'Open'))
    act(() => result.current.toggleChip('category', 'Camera'))
    act(() => result.current.toggleChip('location', 'Kathmandu'))
    expect(result.current.activeCount).toBe(3)
    act(() => result.current.toggleChip('stage', 'Packed'))
    // A fourth value in an existing group must NOT make it 4.
    expect(result.current.activeCount).toBe(3)
    expect(result.current.chips).toHaveLength(4)
  })

  it('toggles a value off, and clears the group when it empties', () => {
    const { result } = render()
    act(() => result.current.toggleChip('stage', 'Booked'))
    act(() => result.current.toggleChip('stage', 'Booked'))
    expect(result.current.activeCount).toBe(0)
    // Undefined, not [] — an empty array would mean "match nothing" downstream.
    expect(result.current.filters.chips?.stage).toBeUndefined()
  })

  it('lets a chip remove itself, which is the point of showing it', () => {
    const { result } = render()
    act(() => result.current.toggleChip('stage', 'Booked'))
    act(() => result.current.chips[0]!.onRemove())
    expect(result.current.activeCount).toBe(0)
  })

  it('labels a chip with the human column name', () => {
    const { result } = render({ labels: { stage: 'Stage' } })
    act(() => result.current.toggleChip('stage', 'Booked'))
    expect(result.current.chips[0]!.label).toBe('Stage: Booked')
  })

  it('treats a blank search as no filter rather than an empty term', () => {
    const { result } = render()
    act(() => result.current.setSearch('fx3'))
    expect(result.current.activeCount).toBe(1)
    act(() => result.current.setSearch(''))
    expect(result.current.filters.search).toBeUndefined()
    expect(result.current.activeCount).toBe(0)
  })

  it('replaces a whole group with setChipGroup — a dropdown unpicks its old value', () => {
    const { result } = render()
    act(() => result.current.toggleChip('stage', 'Booked'))
    act(() => result.current.setChipGroup('stage', ['Packed']))
    expect(result.current.filters.chips?.stage).toEqual(['Packed'])
    expect(result.current.activeCount).toBe(1)
  })

  it('counts a date range as one filter, whichever end is set', () => {
    const { result } = render()
    act(() => result.current.setDateRange('pickup_at', '2026-08-01'))
    expect(result.current.activeCount).toBe(1)
    act(() => result.current.setDateRange('pickup_at', '2026-08-01', '2026-08-07'))
    expect(result.current.activeCount).toBe(1)
  })

  it('drops the range entirely when both ends are cleared', () => {
    const { result } = render()
    act(() => result.current.setDateRange('pickup_at', '2026-08-01'))
    act(() => result.current.setDateRange('pickup_at'))
    expect(result.current.filters.dateRange).toBeUndefined()
    expect(result.current.activeCount).toBe(0)
  })

  it('ignores an undefined presence flag but counts a set one', () => {
    const { result } = render()
    act(() => result.current.setPresence('cancelled_at', false))
    expect(result.current.activeCount).toBe(1)
    act(() => result.current.setPresence('cancelled_at', undefined))
    expect(result.current.activeCount).toBe(0)
  })

  it('clears every filter but KEEPS the sort', () => {
    const { result } = render()
    act(() => result.current.setSort('return_at', false))
    act(() => result.current.toggleChip('stage', 'Booked'))
    act(() => result.current.setSearch('fx3'))
    act(() => result.current.clearAll())
    expect(result.current.activeCount).toBe(0)
    // Someone who sorted by return date and then cleared filters did not ask
    // for the original order back.
    expect(result.current.filters.sort).toEqual({ column: 'return_at', ascending: false })
  })

  it('does not persist the panel open — a filter panel should not reopen itself', () => {
    const first = render()
    act(() => first.result.current.setOpen(true))
    expect(first.result.current.open).toBe(true)
    first.unmount()
    const second = render()
    expect(second.result.current.open).toBe(false)
  })
})

const URL_SCHEMA = { chips: ['stage'], sortColumns: ['return_at'], pageSize: 20 } as const

describe('useFilters — URL sync, §18', () => {
  it('reads the filters off the URL on mount, before any query could fire', () => {
    // The whole point: `useList` keys its first fetch off these, so they must be
    // right on the FIRST render rather than after an effect.
    const { result } = render({ url: URL_SCHEMA }, ['/rentals?stage=Booked&stage=Packed'])
    expect(result.current.filters.chips?.stage).toEqual(['Booked', 'Packed'])
    expect(result.current.activeCount).toBe(1)
  })

  it('writes a chip to the query string, so a refresh keeps it', () => {
    const h = render({ url: URL_SCHEMA })
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    expect(h.search()).toBe('?stage=Booked')
  })

  it('removes the param when the filter goes', () => {
    const h = render({ url: URL_SCHEMA }, ['/rentals?stage=Booked'])
    act(() => h.result.current.clearAll())
    expect(h.search()).toBe('')
    expect(h.result.current.filters.chips?.stage).toBeUndefined()
  })

  it('leaves a param it does not own alone', () => {
    const h = render({ url: URL_SCHEMA }, ['/rentals?tab=money'])
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    expect(h.search()).toContain('tab=money')
  })

  it('Back undoes one chip', () => {
    const h = render({ url: URL_SCHEMA })
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    act(() => h.result.current.toggleChip('stage', 'Packed'))
    expect(h.result.current.filters.chips?.stage).toEqual(['Booked', 'Packed'])
    h.back()
    // Derived from the URL rather than mirrored into state, so a navigation
    // moves the UI with it — no effect involved.
    expect(h.result.current.filters.chips?.stage).toEqual(['Booked'])
  })

  it('does NOT push a history entry per keystroke of the search box', () => {
    const h = render({ url: URL_SCHEMA })
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    act(() => h.result.current.setSearch('f'))
    act(() => h.result.current.setSearch('fx'))
    act(() => h.result.current.setSearch('fx3'))
    // One Back should land on the chip, not walk back through three keystrokes.
    h.back()
    expect(h.result.current.filters.search).toBeUndefined()
    expect(h.result.current.filters.chips?.stage).toEqual(['Booked'])
  })

  it('resets to page 1 when a filter changes', () => {
    // A stale page 4 against a freshly-narrowed two-page list asks Postgres for
    // rows that do not exist and renders an empty table under a live pager.
    const h = render({ url: URL_SCHEMA }, ['/rentals?page=4'])
    expect(h.result.current.page).toBe(4)
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    expect(h.result.current.page).toBe(1)
    expect(h.search()).not.toContain('page=')
  })

  it('does not let a page default undo a deliberate clear', () => {
    // Seeding an EMPTY url from `initial` is right; reasserting it after the
    // user clears the group is the bug that rule exists to prevent.
    const h = render({ url: URL_SCHEMA, initial: { chips: { stage: ['Booked'] } } })
    expect(h.result.current.filters.chips?.stage).toEqual(['Booked'])
    act(() => h.result.current.clearAll())
    expect(h.result.current.filters.chips?.stage).toBeUndefined()
    expect(h.search()).toBe('')
  })

  it('keeps scaffolding the URL does not carry', () => {
    const h = render({ url: URL_SCHEMA, initial: { searchColumns: ['booking_no'], tiebreak: 'id' } })
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    expect(h.result.current.filters.searchColumns).toEqual(['booking_no'])
    expect(h.result.current.filters.tiebreak).toBe('id')
  })
})

const EXTRA_SCHEMA = { chips: ['stage'], extras: ['view', 'per'], pageSize: 20 } as const

describe('useFilters — non-column extras', () => {
  it('round-trips a preset that is not a column', () => {
    // Rentals' `Overdue` chip means "out now, past its return time, never
    // actually returned" — a date comparison and two presence flags, not a
    // value of any column. It must never reach `chips`.
    const h = render({ url: EXTRA_SCHEMA }, ['/rentals?view=Overdue'])
    expect(h.result.current.extras['view']).toBe('Overdue')
    expect(h.result.current.filters.chips).toBeUndefined()
  })

  it('counts as a filter and shows in the chip row, because it is one to the user', () => {
    const h = render({ url: EXTRA_SCHEMA, labels: { view: 'Quick filter' } }, ['/rentals?view=Overdue'])
    expect(h.result.current.activeCount).toBe(1)
    expect(h.result.current.chips.map((c) => c.label)).toEqual(['Quick filter: Overdue'])
  })

  it('drops from the URL when set to undefined', () => {
    const h = render({ url: EXTRA_SCHEMA }, ['/rentals?view=Overdue'])
    act(() => h.result.current.setExtra('view', undefined))
    expect(h.search()).toBe('')
  })

  it('resets the page, like every other filter', () => {
    const h = render({ url: EXTRA_SCHEMA }, ['/rentals?page=4'])
    act(() => h.result.current.setExtra('view', 'Overdue'))
    expect(h.result.current.page).toBe(1)
  })

  it('clears in the SAME write as the filters, so one Back undoes one Clear all', () => {
    const h = render({ url: EXTRA_SCHEMA }, ['/rentals?view=Overdue&stage=Booked'])
    act(() => h.result.current.clearAll())
    expect(h.search()).toBe('')
    h.back()
    // One press, and both are back — not the chip first and the preset after.
    expect(h.result.current.extras['view']).toBe('Overdue')
    expect(h.result.current.filters.chips?.stage).toEqual(['Booked'])
  })

  it('leaves other extras alone when one changes', () => {
    const h = render({ url: EXTRA_SCHEMA }, ['/rentals?per=50'])
    act(() => h.result.current.setExtra('view', 'Overdue'))
    expect(h.result.current.extras['per']).toBe('50')
    expect(h.result.current.extras['view']).toBe('Overdue')
  })

  it('is empty on a page that declared none', () => {
    const h = render({ url: URL_SCHEMA }, ['/rentals?view=Overdue'])
    // Undeclared, so it stays a foreign param: not read, not counted, not touched.
    expect(h.result.current.extras).toEqual({})
    expect(h.result.current.activeCount).toBe(0)
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    expect(h.search()).toContain('view=Overdue')
  })
})

describe('useFilters — §15 apply mode', () => {
  it('holds a change in the draft until it is applied', () => {
    const h = render({ mode: 'apply' })
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    // The list has not moved...
    expect(h.result.current.filters.chips?.stage).toBeUndefined()
    expect(h.result.current.activeCount).toBe(0)
    // ...and the chip row does not advertise a filter that has not run.
    expect(h.result.current.chips).toEqual([])
    // ...but the panel's controls show it, and the button has a number.
    expect(h.result.current.draft.chips?.stage).toEqual(['Booked'])
    expect(h.result.current.pendingCount).toBe(1)

    act(() => h.result.current.applyDraft())
    expect(h.result.current.filters.chips?.stage).toEqual(['Booked'])
    expect(h.result.current.pendingCount).toBe(0)
  })

  it('counts pending GROUPS, matching the badge rule', () => {
    const h = render({ mode: 'apply' })
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    act(() => h.result.current.toggleChip('stage', 'Packed'))
    expect(h.result.current.pendingCount).toBe(1)
    act(() => h.result.current.setSearch('fx3'))
    expect(h.result.current.pendingCount).toBe(2)
  })

  it('commits a sort immediately even though filters defer', () => {
    // A column header that reorders nothing until you find an Apply button in a
    // panel you did not open reads as broken.
    const h = render({ mode: 'apply' })
    act(() => h.result.current.setSort('return_at', false))
    expect(h.result.current.filters.sort).toEqual({ column: 'return_at', ascending: false })
  })

  it('is inert in live mode — there is never anything uncommitted', () => {
    const h = render()
    act(() => h.result.current.toggleChip('stage', 'Booked'))
    expect(h.result.current.pendingCount).toBe(0)
    expect(h.result.current.draft).toEqual(h.result.current.filters)
  })
})
