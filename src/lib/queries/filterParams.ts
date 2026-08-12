import type { ListFilters } from './listQuery'

/**
 * # Filters ⇄ the query string  ·  Filter System v1.0 §18
 *
 * `/rentals?stage=Booked&stage=Packed` — the one item in the filter spec with
 * no implementation, and the most valuable one in it. Three things fall out of
 * it that nothing else gives:
 *
 * - **Refresh keeps the filters.** Today F5 on a narrowed list silently widens
 *   it back to everything, and the rows that reappear look like new data.
 * - **Back works.** A chip becomes an undoable step rather than a dead end.
 * - **A filtered list is a link.** "Here are the four overdue Kathmandu
 *   bookings" stops being a screenshot.
 *
 * It is built here, before the pages are converted, because retrofitting URL
 * state into 34 already-converted screens is far worse than converting them
 * with it.
 *
 * ## Why a page declares its columns
 *
 * Parsing cannot just treat every unknown query param as a chip group: pages
 * carry `?tab=`, `?ref=` and analytics junk, and a filter layer that swallowed
 * those would send `tab IN ('money')` to Postgres. So a caller names the
 * columns it owns, and everything else on the URL is left strictly alone —
 * `write` preserves foreign params untouched.
 *
 * ## Repeated keys, not comma lists
 *
 * `?stage=Booked&stage=Packed`, not `?stage=Booked,Packed`. Chip values are
 * mostly enum-ish today, but "mostly" is how `listQuery.ts`'s search sanitiser
 * came to exist: a client called `Karki, Rupesh` is an ordinary thing to type,
 * and a comma-delimited list would split them into two filters. Repeated keys
 * have no delimiter to collide with.
 */

/**
 * Param names this module owns outright. A chip column may not be called any of
 * these — `RESERVED` is asserted against the declared columns in dev so the
 * clash surfaces at the callsite rather than as a filter that silently never
 * round-trips.
 */
export const RESERVED_PARAMS = ['q', 'on', 'from', 'to', 'sort', 'dir', 'page'] as const

const PRESENCE_PREFIX = 'has_'

export interface FilterParamSchema {
  /** Chip groups that round-trip. Each becomes a repeated param under its own column name. */
  chips?: readonly string[] | undefined
  /** Presence columns. Each becomes `has_<column>=1|0`. */
  presence?: readonly string[] | undefined
  /** The single date-range column this page filters on, if it has one. */
  dateColumn?: string | undefined
  /** Sort columns the page will accept from a URL. A `?sort=` naming anything else is ignored. */
  sortColumns?: readonly string[] | undefined
  /** Whether `?page=` round-trips, and the page size to rebuild the offset with. */
  pageSize?: number | undefined
  /**
   * Params that narrow the list but are **not** columns — a quick-filter chip,
   * a saved view, a rows-per-page.
   *
   * Rentals is the case that forced these to exist. Its twelve quick-filter
   * chips are named presets, not values of a column: `Overdue` means "out now,
   * past its return time, never actually returned", which is a date comparison
   * and two presence flags. Putting `view` in `chips` would have sent
   * `view IN ('Overdue')` to Postgres against a column that does not exist.
   *
   * So an extra round-trips through the URL and is offered to the page as a
   * plain string, and the page decides what it means. It never reaches
   * `ListFilters` and nothing here interprets it. It IS a filter to the
   * operator, though, so `useFilters` counts it in the badge, shows it in the
   * chip row, and clears it with Clear all.
   */
  extras?: readonly string[] | undefined
  /**
   * The values a param is allowed to carry, keyed by chip column or extra name.
   * A value not on the list is dropped as though it were not there.
   *
   * Without this a hand-edited `?stage=Nonsense` produces a filter that the
   * page validates away before querying but that the badge still counts and the
   * chip row still shows — "2 filters" over a list narrowed by nothing, which
   * is the same class of lie as a badge reading 2 beside three lit chips.
   * Dropping it here means the count, the chips and the query read one
   * vocabulary.
   *
   * Omit an entry and that param accepts anything — right for free text, wrong
   * for anything with a fixed set behind it.
   */
  allow?: Record<string, readonly string[] | undefined> | undefined
}

/**
 * A column name a page must not use for a chip group, because this module
 * already means something by it. Exported for the assertion in `useFilters`.
 */
export function conflictingColumns(schema: FilterParamSchema): string[] {
  const reserved = new Set<string>(RESERVED_PARAMS)
  const chips = new Set(schema.chips ?? [])
  const out: string[] = []
  for (const c of schema.chips ?? []) {
    if (reserved.has(c) || c.startsWith(PRESENCE_PREFIX)) out.push(c)
  }
  // An extra that shadows a chip column is worse than a reserved clash: both
  // sides would read the same param and each would think it owned it.
  for (const e of schema.extras ?? []) {
    if (reserved.has(e) || e.startsWith(PRESENCE_PREFIX) || chips.has(e)) out.push(e)
  }
  return out
}

/** The non-column params a page declared, as plain strings. Absent keys are simply absent. */
export function parseExtras(params: URLSearchParams, schema: FilterParamSchema): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of schema.extras ?? []) {
    const value = params.get(key)
    const allowed = schema.allow?.[key]
    if (!value) continue
    if (allowed && !allowed.includes(value)) continue
    out[key] = value
  }
  return out
}

/**
 * Reads the filters a URL is carrying.
 *
 * Everything is defensive, because a query string is user input in the most
 * literal sense — it arrives from a bookmark someone edited by hand, a link
 * that was truncated by a chat client, or an old URL whose columns no longer
 * exist. Nothing here throws; an unreadable value is simply not a filter.
 */
export function parseFilterParams(params: URLSearchParams, schema: FilterParamSchema): ListFilters {
  const filters: ListFilters = {}

  const q = params.get('q')
  if (q) filters.search = q

  const chips: Record<string, readonly string[]> = {}
  for (const column of schema.chips ?? []) {
    const allowed = schema.allow?.[column]
    const values = params
      .getAll(column)
      .filter((v) => v !== '' && (!allowed || allowed.includes(v)))
    // De-duplicated: `?stage=Booked&stage=Booked` is one filter, and a doubled
    // value would render two identical chips with one removal between them.
    if (values.length > 0) chips[column] = [...new Set(values)]
  }
  if (Object.keys(chips).length > 0) filters.chips = chips

  const presence: Record<string, boolean> = {}
  for (const column of schema.presence ?? []) {
    const raw = params.get(`${PRESENCE_PREFIX}${column}`)
    if (raw === '1') presence[column] = true
    else if (raw === '0') presence[column] = false
  }
  if (Object.keys(presence).length > 0) filters.presence = presence

  if (schema.dateColumn) {
    // `on` is honoured when present so a link keeps meaning what it meant even
    // if the page later changes which column it ranges over, but the schema's
    // column is what is trusted when they disagree.
    const column = schema.dateColumn
    const fromAd = params.get('from') ?? undefined
    const toAd = params.get('to') ?? undefined
    if (fromAd || toAd) {
      filters.dateRange = { column, ...(fromAd ? { fromAd } : {}), ...(toAd ? { toAd } : {}) }
    }
  }

  const sort = params.get('sort')
  if (sort && (schema.sortColumns ?? []).includes(sort)) {
    filters.sort = { column: sort, ascending: params.get('dir') !== 'desc' }
  }

  if (schema.pageSize) {
    const raw = Number(params.get('page'))
    // 1-based in the URL because that is what the pager shows; a hand-typed 0
    // or -3 is not an error worth reporting, it is page 1.
    if (Number.isInteger(raw) && raw > 1) filters.page = { index: raw - 1, size: schema.pageSize }
  }

  return filters
}

/**
 * Writes the filters onto a copy of the current query string.
 *
 * Params this module owns are cleared first and then rewritten, so dropping a
 * filter drops its param — the alternative leaves `?stage=Booked` on a URL
 * whose Stage group is empty, and the next refresh silently reapplies a filter
 * the user removed. Foreign params are preserved exactly.
 */
export function writeFilterParams(
  current: URLSearchParams,
  filters: ListFilters,
  schema: FilterParamSchema,
  /**
   * Declared extras to write.
   *
   * **Omit it and the extras already on the URL are left exactly as they are** —
   * they look like any other foreign param to the code above. Pass it and this
   * function takes ownership of them: every declared extra is cleared and only
   * what is passed is written back. That is what makes Clear all able to drop a
   * quick-filter chip in the same write as the filters, instead of a second
   * navigation the Back button would then have to walk through twice.
   */
  extras?: Record<string, string | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(current)

  if (extras) {
    for (const key of schema.extras ?? []) next.delete(key)
    for (const key of schema.extras ?? []) {
      const value = extras[key]
      if (value) next.set(key, value)
    }
  }

  next.delete('q')
  for (const column of schema.chips ?? []) next.delete(column)
  for (const column of schema.presence ?? []) next.delete(`${PRESENCE_PREFIX}${column}`)
  next.delete('on')
  next.delete('from')
  next.delete('to')
  next.delete('sort')
  next.delete('dir')
  next.delete('page')

  if (filters.search) next.set('q', filters.search)

  for (const column of schema.chips ?? []) {
    for (const value of filters.chips?.[column] ?? []) next.append(column, value)
  }

  for (const column of schema.presence ?? []) {
    const wanted = filters.presence?.[column]
    if (wanted !== undefined) next.set(`${PRESENCE_PREFIX}${column}`, wanted ? '1' : '0')
  }

  const range = filters.dateRange
  if (schema.dateColumn && range && (range.fromAd || range.toAd)) {
    next.set('on', range.column)
    if (range.fromAd) next.set('from', range.fromAd)
    if (range.toAd) next.set('to', range.toAd)
  }

  if (filters.sort && (schema.sortColumns ?? []).includes(filters.sort.column)) {
    next.set('sort', filters.sort.column)
    // Ascending is the default on read, so it is left off — a URL should carry
    // what someone changed, not a restatement of every default.
    if (filters.sort.ascending === false) next.set('dir', 'desc')
  }

  if (schema.pageSize && filters.page && filters.page.index > 0) {
    next.set('page', String(filters.page.index + 1))
  }

  // Sorted so the same filter set always produces the same string. `useFilters`
  // compares this against the live URL to tell its own writes apart from a Back
  // button, and an unstable key order would make every render look like a
  // navigation.
  next.sort()
  return next
}
