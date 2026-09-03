/**
 * # Filters → a database query
 *
 * Every list screen in this app filters the same way: an array of constants
 * held in `useState`, narrowed with `.filter()` in a `useMemo`. There are ~190
 * of those calls across 34 screens. They work only because the array is small
 * and local; the moment the rows come from Postgres they are wrong — a chip
 * would filter the page you fetched, not the table.
 *
 * This module is the replacement, and it is deliberately ONE module: a filter
 * bar is the same problem on Rentals, Inventory, Clients and every report, so
 * it gets solved once. Screens describe what they want; nothing here knows
 * which screen is asking.
 *
 * ## Why not TanStack Query
 *
 * The architecture lock names TanStack Query for data and offline, and it is
 * NOT in `package.json`. This module deliberately does not depend on it — it
 * builds the query, it does not cache it — so installing TanStack later changes
 * `useList`, not this file and not a single screen.
 */

/** Anything shaped like a supabase-js filter builder. Kept structural so this module never imports the client. */
export interface FilterBuilder<T> {
  or(filters: string, opts?: { referencedTable?: string }): T
  in(column: string, values: readonly unknown[]): T
  gte(column: string, value: unknown): T
  lte(column: string, value: unknown): T
  is(column: string, value: null | boolean): T
  not(column: string, operator: string, value: unknown): T
  order(column: string, opts?: { ascending?: boolean }): T
  range(from: number, to: number): T
}

export interface ListFilters {
  /** Free text. Matched case-insensitively against every column in `searchColumns`. */
  search?: string | undefined
  searchColumns?: readonly string[] | undefined
  /**
   * Chip groups. `{ stage: ['Booked', 'Packed'] }` means stage IN (…).
   * Several groups AND together; values inside one group OR together — which is
   * exactly how a chip row reads to a user.
   * An empty array means "no constraint", NOT "match nothing" — an "All" chip
   * clears the group rather than sending an impossible filter.
   */
  chips?: Record<string, readonly string[] | undefined> | undefined
  /** AD range. Law 7: dates are stored in UTC and BS is rendered, never queried. */
  dateRange?: { column: string; fromAd?: string | undefined; toAd?: string | undefined } | undefined
  /**
   * Presence flags. `true` → column IS NOT NULL, `false` → IS NULL.
   * This is how "Cancelled", "Closed" and "Sub-Rental" read in the schema —
   * they are timestamps and links, not enum values.
   */
  presence?: Record<string, boolean | undefined> | undefined
  sort?: { column: string; ascending?: boolean } | undefined
  /**
   * A **unique** column appended to the sort so paging is deterministic. See the
   * PAGINATION note on `applyListFilters` — without it, offset pagination over a
   * non-unique sort key can show the same row twice or skip it entirely.
   *
   * The caller supplies it because only the caller knows its table. That is not
   * a burden here: every one of the 121 `create table` statements in
   * `supabase/migrations` declares a single-column primary key, and all but two
   * (`sequence_key` in 0007, `entity` in 0040) name it `id`. A query module that
   * passes `'id'` is therefore correct for 119 of 121 tables, and the other two
   * name their own.
   *
   * Absent means no tiebreaker, which is only safe on a list that is never
   * paged.
   */
  tiebreak?: string | undefined
  /** Zero-based page index. Absent means no pagination — use only where the row count is bounded. */
  page?: { index: number; size: number } | undefined
}

/**
 * PostgREST's `or=` takes a comma-separated list inside a single string, so a
 * search term containing `,` `(` `)` or `.` changes the SHAPE of the filter
 * rather than its value. That is a query-injection hazard with a friendly face:
 * a client called "Karki, Rupesh" is a perfectly ordinary thing to type.
 *
 * Stripping is chosen over escaping because PostgREST has no escape for these
 * inside `or`, and because a search that quietly ignores a comma is a far
 * better failure than one that returns the wrong rows.
 *
 * ## What survives, and why that is deliberate
 *
 * Audited 12 Aug 2026 against postgrest-js 2.112.0, whose `or()` is
 * `url.searchParams.append('or', '(' + filters + ')')` — so the server decodes
 * the value exactly ONCE. A user typing `%2C` therefore arrives as the literal
 * text `%2C`, not as a comma; only a raw `,` could ever separate clauses, and
 * it is stripped above. With `,` `(` `)` `.` gone, user text cannot leave the
 * value segment of `column.ilike.value`, so no input changes the filter's
 * SHAPE. That was checked against 43 adversarial terms, including
 * `x*),stage.eq.Closed,(booking_no.ilike.*` and `",stage.eq.Closed,"`.
 *
 * `%` and `_` are NOT stripped, and that is a decision rather than an
 * oversight. They are LIKE wildcards, so they widen the match — but they widen
 * it to a SUPERSET that still contains the row the user meant. Stripping them
 * would do the opposite: a search for `Project_X` would become `ProjectX` and
 * find nothing, turning a mild over-match into a silent miss. For a search box
 * the superset is the safer failure, which is the same reasoning that chose
 * stripping over escaping above.
 */
export function sanitiseSearchTerm(raw: string): string {
  return (
    raw
      .replace(/[,().*:"'\\]/g, ' ')
      // Control characters, NUL included. JavaScript's `\s` does not match NUL,
      // and a NUL reaching Postgres is a 400 rather than a result set — an
      // error the operator cannot act on, from text they cannot see.
      // eslint-disable-next-line no-control-regex -- the control range IS the target
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  )
}

/**
 * Applies the whole filter set to a query builder, in a fixed order so two
 * screens asking for the same thing produce the same SQL.
 *
 * Returns the builder — chainable, and the caller still owns `.select()`.
 *
 * ## PAGINATION · why `tiebreak` exists
 *
 * Every sort this app offers is a NON-UNIQUE column: `pickup_at`, `return_at`,
 * a stage, a client name. Paging is offset-based (`range` below → PostgREST
 * `Range:` → `LIMIT/OFFSET`). SQL gives no guarantee about the relative order of
 * rows an `ORDER BY` cannot separate, and the two page requests are two
 * independent scans that may be planned differently — so with ten bookings
 * sharing one `pickup_at`, a row can be returned on page 1 AND page 2, while
 * another is returned on neither. Nothing errors; the list just quietly holds a
 * duplicate and quietly loses a booking, which on the packing queue means a job
 * nobody is shown.
 *
 * Appending a unique column makes the ordering total, so every request agrees on
 * the same sequence and `OFFSET n` means the same thing twice. This is the only
 * fix — a bigger page size or a count check does not make an ambiguous order
 * unambiguous.
 */
export function applyListFilters<T extends FilterBuilder<T>>(query: T, filters: ListFilters): T {
  let q = query

  // 1. Search — one `or` across the named columns.
  const term = filters.search ? sanitiseSearchTerm(filters.search) : ''
  if (term && filters.searchColumns?.length) {
    q = q.or(filters.searchColumns.map((c) => `${c}.ilike.*${term}*`).join(','))
  }

  // 2. Chip groups. An empty group is no constraint at all.
  for (const [column, values] of Object.entries(filters.chips ?? {})) {
    if (values && values.length > 0) q = q.in(column, values)
  }

  // 3. Date range, half-open at neither end — a user picking 1–7 means both.
  if (filters.dateRange) {
    const { column, fromAd, toAd } = filters.dateRange
    if (fromAd) q = q.gte(column, fromAd)
    if (toAd) q = q.lte(column, toAd)
  }

  // 4. Presence flags.
  for (const [column, wanted] of Object.entries(filters.presence ?? {})) {
    if (wanted === true) q = q.not(column, 'is', null)
    else if (wanted === false) q = q.is(column, null)
  }

  // 5. Sort.
  if (filters.sort) {
    q = q.order(filters.sort.column, { ascending: filters.sort.ascending ?? true })
  }

  // 5b. Tiebreaker — see PAGINATION above. Applied even when there is no sort at
  // all, because an unsorted paged query is the least stable case of the lot.
  //
  // It follows the primary sort's direction rather than always ascending, so
  // flipping a column header reverses the whole list exactly: `pickup_at desc,
  // id desc` is the precise reverse of `pickup_at asc, id asc`, whereas
  // `pickup_at desc, id asc` is not the reverse of anything. Either choice
  // fixes the paging bug; this one also keeps the two directions consistent.
  if (filters.tiebreak) {
    q = q.order(filters.tiebreak, { ascending: filters.sort?.ascending ?? true })
  }

  // 6. Page. `range` is inclusive at both ends, so the last index is size-1 past the first.
  if (filters.page) {
    const from = filters.page.index * filters.page.size
    q = q.range(from, from + filters.page.size - 1)
  }

  return q
}

/**
 * A stable string for a filter set, for use as a hook dependency.
 * `JSON.stringify` alone is not enough: `{a:1,b:2}` and `{b:2,a:1}` are the same
 * filter and must not re-fetch, and a screen that rebuilds its filter object on
 * every render would otherwise loop.
 */
export function filterKey(filters: ListFilters): string {
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, sortDeep(val)]),
      )
    }
    return v
  }
  return JSON.stringify(sortDeep(filters))
}
