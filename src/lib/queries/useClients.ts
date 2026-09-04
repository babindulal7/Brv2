import { listClientRecords, listMembershipPlans, getClientRecord } from './clients'
import type { ClientProfile, MembershipPlanRow } from './clients'
import type { ListFilters } from './listQuery'
import { useList, type ListQueryResult, type ListResult } from './useList'
import type { ClientRecord } from '../../data/clients'

/**
 * The clients hooks.
 *
 * ## Why these are wrappers over `useList` and not their own fetch loops
 *
 * `useClients` used to hold its own `useState`/`useEffect`/cancelled-flag
 * machine — written before `useList` existed, and `useList`'s own header names
 * it as the thing it generalises ("`useClients` was written by hand for one
 * screen. Writing 33 more of those is how the four states end up drawn 33
 * different ways"). Two more screens now need the same machine, so the choice
 * was to copy it twice more or to delete it once. It is deleted: every hook
 * below is a thin adapter over `useList`, and the fetch, the cancellation, the
 * mid-flight-supersede guard and the "a failed refresh must not blank rows
 * someone is reading" behaviour exist exactly once, in `useList`.
 *
 * The `{ clients, loading, error, refresh }` surface is kept because it is what
 * `Clients.tsx` already consumes, and because a screen reading *the clients*
 * should not have to know that a list hook is underneath. `isEmpty` is added —
 * `PageBody` needs it and the old hook could not answer it without the caller
 * re-deriving `!loading && !error && rows.length === 0`, which is precisely the
 * re-derivation that produces four different empty states.
 */

/**
 * The whole directory, unfiltered.
 *
 * ⚠ **The directory's search, chips, sort and paging are still client-side**,
 * inside `ClientsDirectory.tsx`, over the 500 rows this returns. Moving them
 * server-side means giving that component a `ListFilters` and letting
 * `applyListFilters` narrow the query — it is the natural next step and this
 * hook is already shaped for it (pass the filters through instead of `{}`), but
 * the filter state lives in a component outside this change's scope. Stated so
 * the 500-row ceiling is understood as a known bound, not an accident: client
 * 501 is invisible to the search box today.
 */
const NO_FILTERS: ListFilters = {}

async function fetchClients(): Promise<ListQueryResult<ClientRecord>> {
  const rows = await listClientRecords({ limit: 500 })
  // `total` stays null rather than `rows.length`: the query asked for no count,
  // and reporting a page size as a total is how a list claims 500 is all there
  // is. `useList` documents null as "the query did not ask".
  return { rows, total: null }
}

export interface UseClientsResult {
  clients: ClientRecord[]
  loading: boolean
  /** The bare REASON, not a sentence — `PageBody` writes "Could not load clients". */
  error: string | null
  /** True only once a successful query returned nothing. Never true while loading or errored. */
  isEmpty: boolean
  /** Re-read after a write, so a newly created client appears without a page reload. */
  refresh: () => void
}

export function useClients(): UseClientsResult {
  // No baseline and no override: this list has no structural predicate and no
  // operator filters at this level, so `isFiltered` is false and stays false —
  // which is the right answer for `PageBody`, whose "clear filters" empty state
  // would offer a button that clears nothing.
  const list = useList<ClientRecord>(fetchClients, NO_FILTERS)

  return {
    clients: list.rows,
    loading: list.loading,
    error: list.error,
    isEmpty: list.isEmpty,
    refresh: list.refetch,
  }
}

/**
 * One client, by the code in the URL.
 *
 * Modelled as a one-row list rather than as a bespoke hook so the four states
 * come from the same place as every other screen's. "Not found" then arrives as
 * `isEmpty` — a successful query that matched nothing — which is exactly what a
 * bad `/clients/:id` link is, and is a different fact from `error` (the read
 * failed) that the old `CLIENTS_DATA.find(...) ?? null` could not distinguish.
 *
 * The reference travels in `chips` so `useList` re-queries when the route param
 * changes: the fetcher is held in a ref and only the filter VALUE retriggers.
 * An absent reference short-circuits to zero rows without touching the network —
 * `in(client_code, [])` would return every row, not none.
 *
 * The chip key is `client_ref`, NOT `client_code`. Everywhere else a chip key
 * IS a column name — `listQuery.ts:152` builds `.eq(column, …)` straight out of
 * `Object.entries(filters.chips)`. Here it is only a cache key: the value may be
 * a `client_code` or a `clients.id` uuid, `getClientRecord` decides which column
 * to read, and no column named `client_ref` exists. Naming it `client_code`
 * claimed the narrower of the two, which is the mistake this pair of files was
 * fixed for on 4 Sep 2026.
 */
async function fetchClientProfile(filters: ListFilters): Promise<ListQueryResult<ClientProfile>> {
  const ref = filters.chips?.['client_ref']?.[0]
  if (!ref) return { rows: [], total: 0 }
  const profile = await getClientRecord(ref)
  return { rows: profile ? [profile] : [], total: profile ? 1 : 0 }
}

/** @param ref a `client_code` (`C-0001`) or a `clients.id` uuid — either resolves. */
export function useClientProfile(ref: string | undefined): ListResult<ClientProfile> {
  return useList<ClientProfile>(
    fetchClientProfile,
    { chips: { client_ref: ref ? [ref] : [] } },
    // A profile is addressed, not filtered. Without this the empty state would
    // offer "Clear filters" for a client that does not exist.
    { isFilteredOverride: false },
  )
}

/**
 * The membership plans — the Credit tab's policy table.
 *
 * Money columns arrive `null` for a money-blind session (`membership_plans_v`
 * masks column-wise), and the view is `where auth_is_staff()`, so a Client
 * session gets zero rows. The Credit tab is money-only and absent for those
 * roles anyway, but the null is still load-bearing: it means withheld, not zero.
 */
async function fetchMembershipPlans(): Promise<ListQueryResult<MembershipPlanRow>> {
  const rows = await listMembershipPlans()
  return { rows, total: rows.length }
}

export function useMembershipPlans(): ListResult<MembershipPlanRow> {
  return useList<MembershipPlanRow>(fetchMembershipPlans, NO_FILTERS)
}
