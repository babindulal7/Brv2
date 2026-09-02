import type { ReactNode } from 'react'
import { LoadingSkeleton, ErrorBanner, EmptyState, RestrictedState } from './StateViews'

/**
 * Picks between the four non-happy states so a screen does not have to.
 *
 * All four components already existed in `StateViews.tsx`. What did not exist
 * was anything that *chose* between them: 39 files import `StateViews` directly
 * and each decides the precedence itself. `modules/reports/ExpenseReports.tsx`
 * is the closest thing to prior art — it hand-writes restricted → error → empty
 * inline — and that hand-written ladder is what this component generalises.
 *
 * The ordering below is the whole point and is not configurable:
 *
 *   restricted → error → loading → empty → children
 *
 * Restricted outranks everything because a role that may not see this data must
 * not learn from a spinner that the data exists. Error outranks loading so a
 * failed refetch shows the failure rather than spinning forever. Empty is last
 * because "nothing matched" is only true once a successful query has returned.
 *
 * ## The error state has two shapes, and `hasRows` picks between them
 *
 * `useList` deliberately keeps the previous rows when a refresh fails ("a failed
 * refresh must not blank a list someone is reading"). This component used to
 * discard them anyway — `error` outranks `children`, and nothing told it whether
 * `children` held a populated table or nothing at all — so a background refresh
 * failure replaced a working table with a full-page error. That is the opposite
 * of what Law 12's inline-and-persistent errors are for: an error about a
 * REFRESH must not destroy data already on screen.
 *
 * So `hasRows` says whether `children` currently holds data, and the error state
 * renders as:
 *
 *   - `hasRows` false → the full-page banner. Nothing is underneath it, and a
 *     first load that failed has genuinely nothing to show.
 *   - `hasRows` true  → the banner ABOVE `children`, both on screen. The rows
 *     are stale but true; the banner says so and stays until it is fixed.
 *
 * Note what this does NOT do: it does not reorder anything. Error still outranks
 * loading, empty and children in both shapes — `hasRows` chooses the shape of
 * the error state, never its rank. The fixed ladder above is unchanged for the
 * genuine first-load case, which is the case every one of these states was
 * written for.
 *
 * ## `hasRows` shapes the loading state the same way
 *
 * The old limitation here — "a `loading` refetch still blanks a good list" —
 * is resolved by the same discriminator. A `loading` that arrives while rows
 * are on screen is by definition a refetch (`useList` keeps the previous rows
 * for its whole duration, exactly as it does across a failed refresh), so:
 *
 *   - `hasRows` false → the skeleton. A first load has nothing else to show.
 *   - `hasRows` true  → `children`, marked `aria-busy`. The rows are stale but
 *     true; swapping a table someone is reading for a skeleton on every manual
 *     Refresh (Rentals List, Inventory, Payments) told them less, not more.
 *
 * No visual "refreshing…" affordance is invented here — that is still an open
 * design call (it must be neither a skeleton nor a toast, since toasts carry
 * successes only). `aria-busy` on a box-less wrapper is the machine-readable
 * placeholder until it is ruled. As with the error state, `hasRows` chooses
 * the SHAPE, never the rank: restricted and error still outrank loading, and
 * loading still outranks empty and children whenever nothing is on screen yet.
 *
 * ## One limitation the conversion waves must know about
 *
 * **`skeletonRows` only affects `skeleton="table"`.** `LoadingSkeleton`
 * hardcodes 4 tiles for `kpi` and one block for `card`; the prop is accepted
 * and ignored for both. That is `StateViews`' behaviour, restated here so a
 * screen does not tune a number that does nothing.
 */
export interface PageBodyProps {
  loading?: boolean
  /**
   * The REASON the load failed, NOT a finished sentence — `JWT expired`, not
   * `Could not load rentals. JWT expired`.
   *
   * ⚠ This component composes the sentence: the banner's title is
   * `Could not load ${noun}` and this string is the message beneath it. Pass a
   * sentence that already names the failure and the operator reads it twice.
   * `useList` returns exactly this shape (`ListResult.error`) and says so on its
   * own side; the two comments are a pair, so neither drifts alone.
   */
  error?: string | null
  onRetry?: () => void
  /**
   * Whether `children` currently holds data — on a list screen, `rows.length > 0`.
   *
   * Read in the error and loading states, where it decides whether the state
   * replaces the content (first load) or coexists with it (refresh). See the
   * header. Default `false`, which is the conservative reading: a screen that
   * has not said it has rows is assumed to have nothing to protect, and gets
   * the old full-page behaviour.
   */
  hasRows?: boolean
  /** True only when a successful query returned nothing. */
  empty?: boolean
  /**
   * Whether the emptiness came from filters. The two empty states are different
   * questions: someone who filtered to zero wants Clear filters, not Add.
   */
  emptyIsFiltered?: boolean
  onClearFilters?: () => void
  /** What is being loaded, in words — "rentals", "clients". Becomes the skeleton's label. */
  noun?: string
  /** Set when the session's role may not view this surface at all. */
  restricted?: boolean
  restrictedReason?: string
  /**
   * The role that *would* be allowed, rendered as a "Requires Owner" chip.
   * §2.5 asks the restricted state to "name who to ask", and `RestrictedState`
   * already supports it — without this passthrough a converted screen could not
   * reach it.
   */
  restrictedRequiredRole?: string
  /** Shape of the skeleton, so it resembles what is arriving. */
  skeleton?: 'card' | 'table' | 'kpi'
  /** Skeleton row count. Honoured by `skeleton="table"` only — see limitation 2. */
  skeletonRows?: number
  /** Empty-state overrides. Defaults are derived from `noun`. */
  emptyTitle?: string
  emptyMessage?: string
  /**
   * Label for the filtered empty state's action. Defaults to "Clear filters",
   * which is only the right sentence when filters are what narrowed the list —
   * a page whose PERIOD moved (Dashboard on "Tomorrow", chips untouched) resets
   * the same state but should say where the button goes ("Back to Today").
   */
  clearLabel?: string
  /** Label for the empty state's one action, e.g. "Add client". Both this and `onEmptyAction` are needed for it to render. */
  emptyActionLabel?: string
  onEmptyAction?: () => void
  children: ReactNode
}

export function PageBody({
  loading = false,
  error = null,
  onRetry,
  hasRows = false,
  empty = false,
  emptyIsFiltered = false,
  onClearFilters,
  noun = 'records',
  restricted = false,
  restrictedReason,
  restrictedRequiredRole,
  skeleton = 'table',
  skeletonRows = 5,
  emptyTitle,
  emptyMessage,
  clearLabel,
  emptyActionLabel,
  onEmptyAction,
  children,
}: PageBodyProps) {
  // Every optional prop below is spread conditionally rather than passed as a
  // possibly-`undefined` value. `exactOptionalPropertyTypes` is on and none of
  // the wrapped props are declared `| undefined`, so `reason={maybeUndefined}`
  // is a type error and would also stomp each component's own default.
  if (restricted) {
    return (
      <RestrictedState
        {...(restrictedReason ? { reason: restrictedReason } : {})}
        {...(restrictedRequiredRole ? { requiredRole: restrictedRequiredRole } : {})}
      />
    )
  }

  if (error) {
    // `error` is a REASON — the title is written here, once. See the prop doc:
    // if this ever renders a string that already says "Could not load rentals",
    // the operator gets the sentence twice.
    //
    // The two titles differ because the two situations are different facts.
    // With nothing on screen the load did not happen at all; with rows already
    // there, they are real rows that could not be brought up to date, and
    // "Could not load" over a visible table reads as a contradiction.
    const banner = (
      <ErrorBanner
        title={hasRows ? `Could not refresh ${noun}` : `Could not load ${noun}`}
        message={error}
        {...(onRetry ? { onRetry } : {})}
      />
    )

    // Rows on screen: the error joins them rather than replacing them. `empty`
    // and `loading` are skipped either way — error outranks both, exactly as
    // before; only the shape changed.
    return hasRows ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {banner}
        {children}
      </div>
    ) : (
      banner
    )
  }

  if (loading) {
    // First load: nothing is on screen yet, so the skeleton is the only honest
    // render. Refetch (`hasRows`): the rows on screen survive for the query's
    // duration — see the header. `empty` is skipped in the refetch shape on
    // purpose: rows exist, so "nothing matched" would be a contradiction.
    if (!hasRows) {
      return <LoadingSkeleton type={skeleton} rows={skeletonRows} label={`Loading ${noun}…`} />
    }
    // `display: contents` so the wrapper contributes no box — children keep
    // whatever layout their parent gave them; the div exists only to carry
    // `aria-busy` over the stale rows.
    return (
      <div style={{ display: 'contents' }} aria-busy="true">
        {children}
      </div>
    )
  }

  if (empty) {
    // The two empty states are different questions. Someone who filtered to zero
    // wants Clear filters; someone with a genuinely empty table wants Add.
    // `EmptyState` renders its button only when BOTH actionLabel and onAction
    // are present, so each pair is spread together or not at all.
    return emptyIsFiltered ? (
      <EmptyState
        title={emptyTitle ?? `No ${noun} match these filters`}
        description={emptyMessage ?? 'Clear the filters to see everything again.'}
        {...(onClearFilters ? { actionLabel: clearLabel ?? 'Clear filters', onAction: onClearFilters } : {})}
      />
    ) : (
      <EmptyState
        title={emptyTitle ?? `No ${noun} yet`}
        description={emptyMessage ?? 'Nothing has been added here.'}
        {...(emptyActionLabel && onEmptyAction ? { actionLabel: emptyActionLabel, onAction: onEmptyAction } : {})}
      />
    )
  }

  return <>{children}</>
}
