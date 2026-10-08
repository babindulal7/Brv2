import { useCallback, useEffect, useRef, useState } from 'react'
import { filterKey, sanitiseSearchTerm, type ListFilters } from './listQuery'

/**
 * The one hook every converted list screen uses.
 *
 * `useClients` was written by hand for one screen. Writing 33 more of those is
 * how the four states end up drawn 33 different ways — which is the shape of
 * defect this codebase has already produced elsewhere. This generalises it.
 *
 * ## What it deliberately does not do
 *
 * No cache, no deduplication, no background refetch. Those belong to TanStack
 * Query, which the architecture locks in and `package.json` does not yet carry.
 * When it lands, this file changes and no screen does.
 *
 * It also does not write sentences. See `error` below — the hook reports the
 * failure, the view says it in English.
 */
export interface ListResult<T> {
  rows: T[]
  loading: boolean
  /**
   * The REASON the load failed — a bare detail like `listBookings failed: JWT
   * expired`, **not a finished sentence**.
   *
   * ⚠ This is half of a contract with `components/ui/PageBody.tsx`, which
   * composes `Could not load ${noun}` as the banner TITLE and renders this
   * string as the message underneath. If this ever goes back to setting
   * `Could not load ${noun}. ${detail}` the operator reads the same sentence
   * twice — "Could not load rentals" over "Could not load rentals. JWT
   * expired" — which is exactly what it used to do. Change one side and you
   * must change the other.
   *
   * The split is this way round, rather than the hook owning the whole
   * sentence, because the same failure has to read correctly on a screen that
   * does NOT use `PageBody`: `modules/clients/Clients.tsx:211` already pairs
   * `useClients`' raw `e.message` with `<ErrorBanner title="Could not load
   * clients">` by hand, and `useClients` itself returns the bare message. A
   * hook that pre-composed the sentence could not be rendered that way without
   * the title being said twice, and the hook is the layer that does not know
   * where it is being drawn.
   *
   * Law 12 — rendered inline and persistently. Never a toast.
   */
  error: string | null
  /** True only once loading has finished and the query genuinely matched nothing. */
  isEmpty: boolean
  /** Whether the emptiness came from filters, which decides whether the empty state offers Add or Clear filters. */
  isFiltered: boolean
  /** Total matching rows when the query asked for a count; null when it did not. */
  total: number | null
  refetch: () => void
  /**
   * When `rows` last came back from a SUCCESSFUL read; null until the first.
   * A failed refresh leaves it alone — the rows on screen are that old. Read
   * by `DataAgeBadge` (PLAN.md Phase 9, "network-first reads with an age
   * badge"). From main's Phase 9 work, ported 8 Oct 2026.
   */
  lastFetchedAt: Date | null
}

export interface ListQueryResult<T> {
  rows: T[]
  total?: number | null
}

export interface UseListOptions {
  /**
   * The list's own STRUCTURAL predicates — the part of `filters` that is what
   * the list MEANS rather than something the operator chose. Pass the named
   * filter set exactly as `queries/bookings.ts` returns it:
   *
   * ```ts
   * const base = todaysOutgoing(dayAd)
   * const list = useList(listBookings, { ...base, search }, { baseline: base })
   * ```
   *
   * Only `isFiltered` reads this; the query still runs on `filters`, which must
   * remain the complete set. Omit it on a screen whose filters are all the
   * operator's own (a plain directory) — see `isFiltered` below for what
   * omitting it costs on a screen that does have a baseline.
   */
  baseline?: ListFilters | undefined
  /**
   * Force `isFiltered`. For the screen whose "did the user narrow this" answer
   * genuinely is not derivable from the filter set — usually the same boolean
   * that already decides whether its "Clear filters" chip is live.
   */
  isFilteredOverride?: boolean | undefined
}

/**
 * The parts of a filter set that actually NARROW the result, canonicalised.
 *
 * Two filter sets with the same narrowing key select the same rows, so
 * comparing a live set against its baseline answers "did the user narrow this"
 * without either side having to enumerate which keys are structural.
 *
 * What is dropped, and why each one would otherwise produce a false positive:
 *
 * - `sort` and `page` — reordering or paging is not narrowing. Page 3 of an
 *   unfiltered list is still an unfiltered list.
 * - `searchColumns` — plumbing for `search`, no constraint of its own.
 * - an empty chip group — `applyListFilters` treats `[]` as "no constraint,
 *   NOT match-nothing" (the "All" chip). A filter bar that always passes
 *   `chips: { stage: selected }` therefore sends `{ stage: [] }` when nothing
 *   is selected, and comparing raw objects would call that filtered.
 * - a blank or punctuation-only `search` — run through the very same
 *   `sanitiseSearchTerm` that decides whether a search constraint is sent at
 *   all, so `isFiltered` cannot disagree with the query about whether the
 *   search box is doing anything. `'  ,,  '` narrows nothing.
 * - a `dateRange` with neither end set, and an `undefined` presence flag —
 *   both are ignored by `applyListFilters` for the same reason.
 */
function narrowingKey(filters: ListFilters): string {
  const narrowing: ListFilters = {}

  const term = filters.search ? sanitiseSearchTerm(filters.search) : ''
  if (term) narrowing.search = term

  const chips: Record<string, readonly string[]> = {}
  for (const [group, values] of Object.entries(filters.chips ?? {})) {
    if (values && values.length > 0) chips[group] = values
  }
  if (Object.keys(chips).length > 0) narrowing.chips = chips

  const range = filters.dateRange
  if (range && (range.fromAd || range.toAd)) narrowing.dateRange = range

  const presence: Record<string, boolean> = {}
  for (const [column, wanted] of Object.entries(filters.presence ?? {})) {
    if (wanted !== undefined) presence[column] = wanted
  }
  if (Object.keys(presence).length > 0) narrowing.presence = presence

  // `filterKey` is used rather than `JSON.stringify` so key order and nested key
  // order do not matter: a screen that rebuilds its chip groups in a different
  // order than the named set built them must not read as filtered.
  return filterKey(narrowing)
}

/**
 * ⚠ There is deliberately no `noun` parameter.
 *
 * There used to be one, and its only job was to build `Could not load ${noun}.`
 * into `error` — the half of the sentence `PageBody` also writes. The noun is a
 * label: it belongs to whatever draws the screen, which is where "Loading
 * rentals…" and "Could not load rentals" are both composed. Adding it back here
 * means adding back the doubled sentence.
 *
 * Removing it also took it out of the fetch effect's dependencies, where it had
 * no business being: renaming a label is not a reason to re-query Postgres.
 */
export function useList<T>(
  /** Runs the query. Receives the filters so the fetch is server-side, not an array filter. */
  fetcher: (filters: ListFilters) => Promise<ListQueryResult<T>>,
  /** The COMPLETE filter set — structural predicates and the operator's own, merged. */
  filters: ListFilters = {},
  options: UseListOptions = {},
): ListResult<T> {
  const [rows, setRows] = useState<T[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [nonce, setNonce] = useState(0)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Filters are almost always a fresh object literal from the screen's render,
  // so a reference dependency would refetch forever. The value is what matters.
  const key = filterKey(filters)

  // The fetcher is usually an arrow defined inline too. Held in a ref so a new
  // identity does not retrigger — only a real filter change does.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetcherRef
      .current(JSON.parse(key) as ListFilters)
      .then((res) => {
        if (cancelled || !mounted.current) return
        setRows(res.rows)
        setTotal(res.total ?? null)
        setLastFetchedAt(new Date())
      })
      .catch((err: unknown) => {
        if (cancelled || !mounted.current) return
        // The bare reason, not a sentence — see `ListResult.error`. `useClients`
        // reports the same way (`e instanceof Error ? e.message : String(e)`),
        // and `PageBody` writes the "Could not load rentals" half.
        setError(err instanceof Error ? err.message : String(err))
        // Rows are left as they were. A failed refresh must not blank a list
        // someone is reading — that looks like deletion, not like an error.
        // `PageBody` honours this: pass it `hasRows` and the banner renders
        // ABOVE the surviving rows instead of replacing them.
      })
      .finally(() => {
        if (cancelled || !mounted.current) return
        setLoading(false)
      })

    // A filter change mid-flight must not let the older, slower response win.
    return () => {
      cancelled = true
    }
  }, [key, nonce])

  /**
   * Did the USER narrow this list?
   *
   * `PageBody` turns this into two different sentences — "No rentals match
   * these filters / Clear filters" versus "No rentals yet / Add" — so getting
   * it wrong offers a Clear button that clears nothing.
   *
   * ⚠ It used to be a heuristic over `filters` alone, and it could not be
   * anything but wrong: it answered `true` whenever any presence flag was set,
   * and EVERY named filter set in `queries/bookings.ts` carries
   * `presence: { cancelled_at: false }` — a structural predicate ('Cancelled'
   * is a flag, not a stage), not a filter anybody chose. Today, Operation and
   * Overdue therefore offered "No rentals match these filters · Clear filters"
   * on a genuinely empty table, with a button that cleared nothing. The same
   * was true of their `chips: { stage: [...] }` and their `dateRange`: those
   * are what "Today ▸ Outgoing" MEANS, and no amount of inspecting a single
   * merged object can tell them from a chip the operator clicked.
   *
   * So the hook is told, once, what the untouched set looks like — and the flag
   * becomes a comparison rather than a guess: the operator narrowed this list
   * iff the live filters constrain something the baseline did not.
   *
   * ## Why here and not in `ListFilters`
   *
   * The alternative was to carry structural predicates separately in the filter
   * shape itself (a `base` sub-object that `applyListFilters` applies first).
   * That is a wider change — `listQuery`, every named set in `bookings.ts` and
   * every screen — and it buys nothing this does not, because the merge is
   * still the screen's: `{ ...todaysOutgoing(day), search }` is the natural way
   * to write it and stays legal. Doing it in the hook costs a screen one extra
   * word (`{ baseline: base }`) and no new merge semantics — in particular, no
   * invented rule for what a user chip that collides with a structural chip on
   * the same column should mean. If `ListFilters` ever does grow that shape,
   * this option becomes redundant and can be deleted; nothing here blocks it.
   *
   * ## What is NOT solved
   *
   * A screen that has a baseline and forgets to declare it is back to the old
   * false positive. There is no way for this hook to detect that — the whole
   * point is that a structural predicate and a chosen one are indistinguishable
   * once merged. The baseline object is already in the screen's hand (it built
   * the filters from it), so the correct call is a one-word addition, and this
   * is the note that says why it is not optional in practice.
   */
  const isFiltered = options.isFilteredOverride ?? narrowingKey(filters) !== narrowingKey(options.baseline ?? {})

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  return {
    rows,
    loading,
    error,
    isEmpty: !loading && !error && rows.length === 0,
    isFiltered,
    total,
    refetch,
    lastFetchedAt,
  }
}
