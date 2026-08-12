import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { filterKey, type ListFilters } from './listQuery'
import {
  conflictingColumns,
  parseExtras,
  parseFilterParams,
  RESERVED_PARAMS,
  writeFilterParams,
  type FilterParamSchema,
} from './filterParams'
import type { ActiveFilter } from '../../components/ui/FilterDrawer'

/**
 * Holds a page's filter state and derives everything the drawer UI needs from
 * it — the active count for the badge, the removable chips, and the clear
 * actions.
 *
 * The alternative is each page tracking "how many filters are on" by hand
 * beside the filters themselves, which is how a badge ends up saying 2 while
 * three chips are lit. One source, three readings.
 *
 * ## Live by default  ·  §15's Apply is opt-in
 *
 * Every setter changes `filters` immediately, `useList` re-queries on the new
 * `filterKey`, and the drawer's header count moves. That is what was chosen for
 * every screen built so far.
 *
 * §15 specifies a hybrid — instant for chips, an `Apply Filters (3)` button for
 * date ranges and large reports — and the reasoning holds for exactly one case:
 * a 45-report page re-querying on every keystroke of a date is expensive. But a
 * hybrid *inside one panel* means two behaviours the user has to tell apart by
 * control. So the line is drawn at the PAGE instead: `mode: 'apply'` switches a
 * whole screen to deferred, and nobody has to guess which control is which.
 *
 * In `'apply'` mode the setters write to `draft`; `filters` — the thing the
 * list actually queries — does not move until `apply()`. `chips` and
 * `activeCount` keep describing `filters`, so the chip row and the badge never
 * advertise a filter that has not run.
 *
 * ## URL sync (§18) is opt-in per page, and it is the source of truth
 *
 * Pass `url` and the query string becomes the state: refresh keeps the filters,
 * Back undoes the last one, and a narrowed list is a link. See
 * `filterParams.ts` for the wire format and why a page declares its columns.
 *
 * ⚠ This hook calls `useSearchParams` unconditionally, so it must be rendered
 * inside a Router — with or without `url`. Every screen already is; a test is
 * not, and has to wrap in `MemoryRouter`.
 */

export type FilterMode = 'live' | 'apply'

export interface UseFiltersOptions {
  /**
   * Starting filters, and the page's structural scaffolding — `searchColumns`,
   * `tiebreak`, the page size. With `url` on, anything here that the URL schema
   * OWNS is a seed for an unfiltered URL only: once the query string is in
   * play it is authoritative, so clearing a filter cannot be undone by a
   * default quietly reasserting itself on the next render.
   */
  initial?: ListFilters
  /**
   * Human labels for chip groups, so a chip reads "Stage: Booked" rather than
   * "stage: Booked". Keyed by column name.
   */
  labels?: Record<string, string>
  /** §18. Which params this page owns. Omit for a page whose filters do not round-trip. */
  url?: FilterParamSchema | undefined
  /** §15. `'apply'` defers every change until `apply()`. Defaults to live. */
  mode?: FilterMode
}

export interface UseFiltersResult {
  /** What the list should query. In `'apply'` mode this is the last APPLIED set. */
  filters: ListFilters
  /**
   * What the panel's controls edit. Identical to `filters` in live mode; in
   * `'apply'` mode it runs ahead of it until `apply()` lands.
   */
  draft: ListFilters
  /** Panel open state. Persisted nowhere — a filter panel should not reopen itself on every visit. */
  open: boolean
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  /**
   * How many filter GROUPS are active. Drives the button badge.
   *
   * Filter System v1.0 §6 rules this explicitly and works the example: Status =
   * Open, Category = Camera, Location = Kathmandu reads `Filters 3` — and
   * "Not: Filters 5" if Status has multiple values selected.
   *
   * The reasoning holds up: the badge answers "how many things am I filtering
   * on", and selecting a second stage does not add a dimension. The chip row
   * below still shows every individual value, so nothing is hidden.
   */
  activeCount: number
  /** One entry per active value, each able to remove itself. */
  chips: ActiveFilter[]
  /**
   * The page's non-column params — a quick-filter chip, a saved view. Declared
   * in `url.extras`; see `FilterParamSchema.extras` for why they cannot be
   * chip groups. Empty for a page that declared none.
   */
  extras: Record<string, string>
  /** Sets or (with `undefined`) drops one extra. Resets to page 1, like any other filter. */
  setExtra: (key: string, value: string | undefined) => void
  /** 1-based, for the pager. Every filter change resets it to 1. */
  page: number
  setPage: (page: number) => void
  setSearch: (term: string) => void
  /** Turns one value of a chip group on or off. */
  toggleChip: (column: string, value: string) => void
  /** Replaces a whole group — for a dropdown, where picking B unpicks A. */
  setChipGroup: (column: string, values: readonly string[]) => void
  setDateRange: (column: string, fromAd?: string, toAd?: string) => void
  setPresence: (column: string, wanted: boolean | undefined) => void
  setSort: (column: string, ascending?: boolean) => void
  clearAll: () => void
  /**
   * §15. Commits `draft`. A no-op in live mode, where there is never anything
   * uncommitted.
   */
  applyDraft: () => void
  /** How many groups differ between `draft` and `filters` — the number on the Apply button. */
  pendingCount: number
}

/** The parts of a filter set the URL schema does NOT own, which survive a parse. */
function scaffolding(filters: ListFilters, schema: FilterParamSchema | undefined): ListFilters {
  if (!schema) return filters
  const owned = new Set(schema.chips ?? [])
  const ownedPresence = new Set(schema.presence ?? [])

  const out: ListFilters = {}
  if (filters.searchColumns) out.searchColumns = filters.searchColumns
  if (filters.tiebreak) out.tiebreak = filters.tiebreak

  const chips: Record<string, readonly string[] | undefined> = {}
  for (const [column, values] of Object.entries(filters.chips ?? {})) {
    if (!owned.has(column) && values && values.length > 0) chips[column] = values
  }
  if (Object.keys(chips).length > 0) out.chips = chips

  const presence: Record<string, boolean | undefined> = {}
  for (const [column, wanted] of Object.entries(filters.presence ?? {})) {
    if (!ownedPresence.has(column) && wanted !== undefined) presence[column] = wanted
  }
  if (Object.keys(presence).length > 0) out.presence = presence

  if (filters.dateRange && filters.dateRange.column !== schema.dateColumn) out.dateRange = filters.dateRange
  if (filters.sort && !(schema.sortColumns ?? []).includes(filters.sort.column)) out.sort = filters.sort

  return out
}

/** Groups, not values — §6. Search, each non-empty chip group, the range, each set presence flag. */
function countGroups(filters: ListFilters): number {
  let n = 0
  if (filters.search) n += 1
  for (const values of Object.values(filters.chips ?? {})) if (values && values.length > 0) n += 1
  if (filters.dateRange?.fromAd || filters.dateRange?.toAd) n += 1
  for (const wanted of Object.values(filters.presence ?? {})) if (wanted !== undefined) n += 1
  return n
}

export function useFilters({
  initial = {},
  labels = {},
  url,
  mode = 'live',
}: UseFiltersOptions = {}): UseFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)

  /**
   * `initial` is a fresh object literal on nearly every render, so it is read
   * once and then held. A page default is a starting position, not something
   * that keeps reasserting itself — see `UseFiltersOptions.initial`.
   */
  const initialRef = useRef(initial)
  const schemaRef = useRef(url)
  schemaRef.current = url

  /**
   * A chip column that collides with a param this module owns would silently
   * never round-trip — the filter would work in-session and vanish on refresh,
   * which is the hardest kind of bug to notice. Reported rather than thrown: a
   * broken URL contract should not blank the screen, and the message names the
   * fix.
   */
  if (import.meta.env.DEV) {
    const clashes = url ? conflictingColumns(url) : []
    if (clashes.length > 0) {
      console.error(
        `useFilters: chip column(s) ${clashes.join(', ')} collide with a reserved query param, ` +
          `so they will not survive a refresh. Reserved: ${RESERVED_PARAMS.join(', ')}, and the has_ prefix.`,
      )
    }
  }

  /** State when the URL is not carrying it. */
  const [localFilters, setLocalFilters] = useState<ListFilters>(() => initialRef.current)

  /**
   * The applied set — what the list queries.
   *
   * With `url` on this is DERIVED from the query string rather than mirrored
   * into state, which is what makes Back work for free: react-router re-renders
   * with new params on popstate, and this recomputes. A mirrored copy would
   * need an effect to notice the navigation, and that effect is where the
   * classic "Back moves the URL but not the UI" bug lives.
   */
  const applied = useMemo<ListFilters>(() => {
    if (!url) return localFilters
    return { ...scaffolding(initialRef.current, url), ...parseFilterParams(searchParams, url) }
  }, [url, localFilters, searchParams])

  const appliedKey = filterKey(applied)

  /**
   * The non-column params, derived from the URL for the same reason `applied`
   * is. Always `{}` without a schema — an extra has nowhere to live but a query
   * string, so there is no local-state equivalent to fall back to.
   */
  const extras = useMemo<Record<string, string>>(
    () => (url ? parseExtras(searchParams, url) : {}),
    [url, searchParams],
  )
  const extrasKey = JSON.stringify(extras)

  /** Read by the setters, which must see the newest applied set without being rebuilt on each one. */
  const appliedRef = useRef(applied)
  appliedRef.current = applied
  const extrasRef = useRef(extras)
  extrasRef.current = extras

  /** §15's uncommitted copy. Untouched — and therefore equal to `applied` — in live mode. */
  const [draft, setDraft] = useState<ListFilters>(applied)
  const draftRef = useRef(draft)
  draftRef.current = draft

  /**
   * A Back button, or another control on the page, moved the applied set out
   * from under an uncommitted draft. The draft is dropped rather than merged:
   * merging would leave the panel showing a mixture of where the user just
   * navigated to and what they had half-typed before, which is not a state
   * either of them asked for.
   */
  useEffect(() => {
    if (mode !== 'apply') return
    setDraft(applied)
    // `appliedKey` rather than `applied`: the object is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey, mode])

  /**
   * Seed an empty URL from the page's defaults, once.
   *
   * Only when the URL carries none of the params this page owns — otherwise a
   * default would reappear the moment someone cleared it, which is the whole
   * failure mode `scaffolding()` exists to prevent.
   */
  const seeded = useRef(false)
  useEffect(() => {
    if (!url || seeded.current) return
    seeded.current = true
    const seed = writeFilterParams(new URLSearchParams(), initialRef.current, url)
    if (seed.toString() === '') return

    // `bare` is the current URL with every owned param stripped. If that is the
    // whole of the current URL, the page is carrying no filters and the default
    // may seed it. Both sides are sorted before comparing — `writeFilterParams`
    // sorts and a hand-written `?b=2&a=1` does not, and comparing those raw
    // would read a filterless URL as already filtered.
    const bare = writeFilterParams(searchParams, {}, url)
    const currentSorted = new URLSearchParams(searchParams)
    currentSorted.sort()
    if (bare.toString() !== currentSorted.toString()) return

    setSearchParams(writeFilterParams(searchParams, initialRef.current, url), { replace: true })
  }, [url, searchParams, setSearchParams])

  /**
   * Commits a filter set.
   *
   * `replace` is the interesting argument. Typing in the search box changes the
   * filters on every keystroke, and pushing each one would bury the page the
   * user arrived from under twelve history entries — Back would stop being a
   * way out. Discrete changes (a chip, a date, a clear) push, so Back undoes
   * ONE decision; the search box replaces.
   */
  const commit = useCallback(
    (next: ListFilters, replace = false, nextExtras?: Record<string, string | undefined>) => {
      const schema = schemaRef.current
      if (!schema) {
        setLocalFilters(next)
        return
      }
      // `nextExtras` omitted leaves whatever extras are on the URL alone; passed,
      // it takes ownership of them — see `writeFilterParams`.
      setSearchParams((current) => writeFilterParams(current, next, schema, nextExtras), { replace })
    },
    [setSearchParams],
  )

  /**
   * An extra is a filter to the operator and not a column to the query, so it
   * changes the URL and the badge and nothing else. Page resets with it, for
   * the same reason every other filter does.
   */
  const setExtra = useCallback(
    (key: string, value: string | undefined) => {
      const next = { ...appliedRef.current }
      delete next.page
      commit(next, false, { ...extrasRef.current, [key]: value })
    },
    [commit],
  )

  /**
   * One update path for every setter.
   *
   * `page` is dropped on every filter change: a stale page 4 against a
   * freshly-narrowed two-page list asks Postgres for rows that do not exist and
   * renders an empty table under a live pager. Resetting here means no screen
   * has to remember to.
   */
  const put = useCallback(
    (update: (previous: ListFilters) => ListFilters, replace = false) => {
      const from = mode === 'apply' ? draftRef.current : appliedRef.current
      const reset = { ...update(from) }
      delete reset.page
      if (mode === 'apply') setDraft(reset)
      else commit(reset, replace)
    },
    [mode, commit],
  )

  /**
   * The first keystroke pushes; the rest of the burst replaces.
   *
   * Replacing every one of them looks right and is not: the entry being
   * overwritten is whatever came before the search — a chip, usually — so Back
   * skips past that too and lands wherever the user was before they started
   * filtering at all. Pushing every one is the other failure, twelve entries
   * deep for one word.
   *
   * Starting to type and clearing the box are both discrete decisions, so both
   * push; only the middle of a burst — non-empty to non-empty — replaces. One
   * word of typing is one Back.
   */
  const setSearch = useCallback(
    (term: string) => {
      const from = mode === 'apply' ? draftRef.current : appliedRef.current
      const midBurst = Boolean(from.search) && Boolean(term)
      put((f) => ({ ...f, search: term || undefined }), midBurst)
    },
    [put, mode],
  )

  const toggleChip = useCallback(
    (column: string, value: string) =>
      put((f) => {
        const current = f.chips?.[column] ?? []
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
        return { ...f, chips: { ...f.chips, [column]: next.length ? next : undefined } }
      }),
    [put],
  )

  const setChipGroup = useCallback(
    (column: string, values: readonly string[]) =>
      put((f) => ({ ...f, chips: { ...f.chips, [column]: values.length ? [...values] : undefined } })),
    [put],
  )

  const setDateRange = useCallback(
    (column: string, fromAd?: string, toAd?: string) =>
      put((f) =>
        fromAd || toAd
          ? { ...f, dateRange: { column, ...(fromAd ? { fromAd } : {}), ...(toAd ? { toAd } : {}) } }
          : { ...f, dateRange: undefined },
      ),
    [put],
  )

  const setPresence = useCallback(
    (column: string, wanted: boolean | undefined) =>
      put((f) => ({ ...f, presence: { ...f.presence, [column]: wanted } })),
    [put],
  )

  /**
   * Sort is not a filter, so it commits even in `'apply'` mode — a column
   * header that reorders nothing until you find the Apply button in a panel you
   * did not open reads as broken. It is also cheap: reordering is an `ORDER BY`
   * change, not the expensive re-scan §15 was protecting against.
   */
  const setSort = useCallback(
    (column: string, ascending = true) => {
      const next = { ...appliedRef.current, sort: { column, ascending } }
      delete next.page
      commit(next)
      if (mode === 'apply') setDraft((d) => ({ ...d, sort: { column, ascending } }))
    },
    [commit, mode],
  )

  const setPage = useCallback(
    (page: number) => {
      const schema = schemaRef.current
      const size = schema?.pageSize ?? appliedRef.current.page?.size
      if (!size) return
      const next: ListFilters =
        page <= 1
          ? { ...appliedRef.current, page: undefined }
          : { ...appliedRef.current, page: { index: page - 1, size } }
      // Paging replaces rather than pushes: a Back out of page 7 should leave
      // the list, not walk back through six pages of it.
      commit(next, true)
    },
    [commit],
  )

  const clearAll = useCallback(() => {
    // Sort is not a filter and survives a clear — someone who sorted by return
    // date and then cleared their filters did not ask for the order back.
    const cleared: ListFilters = appliedRef.current.sort ? { sort: appliedRef.current.sort } : {}
    if (mode === 'apply') {
      setDraft(draftRef.current.sort ? { sort: draftRef.current.sort } : {})
      return
    }
    // Extras go in the SAME write, not a second one. Two navigations would make
    // Clear all take two presses of Back to undo, which is not one action.
    commit(cleared, false, {})
  }, [mode, commit])

  const applyDraft = useCallback(() => {
    if (mode !== 'apply') return
    commit(draftRef.current)
  }, [mode, commit])

  const chips = useMemo<ActiveFilter[]>(() => {
    const label = (column: string) => labels[column] ?? column
    const out: ActiveFilter[] = []

    if (applied.search) {
      out.push({ key: `search:${applied.search}`, label: `Search: ${applied.search}`, onRemove: () => setSearch('') })
    }

    for (const [column, values] of Object.entries(applied.chips ?? {})) {
      for (const v of values ?? []) {
        out.push({ key: `${column}:${v}`, label: `${label(column)}: ${v}`, onRemove: () => toggleChip(column, v) })
      }
    }

    if (applied.dateRange?.fromAd || applied.dateRange?.toAd) {
      const { column, fromAd, toAd } = applied.dateRange
      const text =
        fromAd && toAd ? `${fromAd.slice(0, 10)} → ${toAd.slice(0, 10)}` : (fromAd ?? toAd ?? '').slice(0, 10)
      out.push({ key: `date:${column}`, label: `${label(column)}: ${text}`, onRemove: () => setDateRange(column) })
    }

    for (const [column, wanted] of Object.entries(applied.presence ?? {})) {
      if (wanted === undefined) continue
      out.push({
        key: `presence:${column}`,
        label: `${label(column)}: ${wanted ? 'set' : 'not set'}`,
        onRemove: () => setPresence(column, undefined),
      })
    }

    // A preset is not a column, but it is unmistakably a filter to whoever
    // picked it — so it appears in the row with the rest, removable like them.
    for (const [key, value] of Object.entries(extras)) {
      out.push({ key: `extra:${key}`, label: `${label(key)}: ${value}`, onRemove: () => setExtra(key, undefined) })
    }

    return out
    // `extrasKey` rather than `extras`: the object is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, labels, extrasKey, setSearch, toggleChip, setDateRange, setPresence, setExtra])

  const activeCount = useMemo(
    () => countGroups(applied) + Object.keys(extras).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applied, extrasKey],
  )

  /**
   * How many groups the draft would change. Zero in live mode by construction,
   * which is what disables the Apply button rather than a separate flag.
   */
  const pendingCount = useMemo(() => {
    if (mode !== 'apply') return 0
    let n = 0
    const groups = new Set([
      ...Object.keys(draft.chips ?? {}),
      ...Object.keys(applied.chips ?? {}),
    ])
    for (const g of groups) {
      const a = [...(applied.chips?.[g] ?? [])].sort().join(' ')
      const b = [...(draft.chips?.[g] ?? [])].sort().join(' ')
      if (a !== b) n += 1
    }
    if ((applied.search ?? '') !== (draft.search ?? '')) n += 1
    if (filterKey({ dateRange: applied.dateRange }) !== filterKey({ dateRange: draft.dateRange })) n += 1
    const presenceColumns = new Set([
      ...Object.keys(draft.presence ?? {}),
      ...Object.keys(applied.presence ?? {}),
    ])
    for (const c of presenceColumns) {
      if (applied.presence?.[c] !== draft.presence?.[c]) n += 1
    }
    return n
  }, [mode, draft, applied])

  return {
    filters: applied,
    draft: mode === 'apply' ? draft : applied,
    open,
    setOpen,
    toggleOpen: useCallback(() => setOpen((o) => !o), []),
    activeCount,
    chips,
    extras,
    setExtra,
    page: (applied.page?.index ?? 0) + 1,
    setPage,
    setSearch,
    toggleChip,
    setChipGroup,
    setDateRange,
    setPresence,
    setSort,
    clearAll,
    applyDraft,
    pendingCount,
  }
}
