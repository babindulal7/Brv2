import { listBundleRecords, getBundleRecord } from './bundleRecords'
import { listBundlesWithItems, type BundleWithItems } from './bundles'
import type { ListFilters } from './listQuery'
import { useList, type ListQueryResult, type ListResult } from './useList'
import type { BundleRecord } from '../../data/bundles'
import type { RentalWindow } from '../availability'

/**
 * The Bundles pane's records, for the window the operator has picked.
 *
 * **PLAN.md §4.44** — availability is measured against a window, so the window
 * is part of the filter set rather than a constant. It travels in `chips` for
 * the same reason `useClientProfile`'s reference does: `useList` holds the
 * fetcher in a ref and re-queries on the filter VALUE, so moving the dates
 * re-runs the query without remounting the pane.
 *
 * The chip keys are `window_from` / `window_to` / `with_money`, and **none of
 * them is a column name** — unlike everywhere else in `listQuery.ts`, where
 * `Object.entries(filters.chips)` builds `.eq(column, …)` directly. This fetcher
 * never hands its filters to that builder; it reads the three values and calls
 * `listBundleRecords`. Named with a `window_` prefix so the difference is
 * visible at the call site.
 *
 * An absent window short-circuits to zero rows without touching the network —
 * there is no sensible default, and inventing one is the thing §4.44 ruled out.
 */
async function fetchBundleRecords(filters: ListFilters): Promise<ListQueryResult<BundleRecord>> {
  const fromAd = filters.chips?.['window_from']?.[0]
  const toAd = filters.chips?.['window_to']?.[0]
  if (fromAd === undefined || toAd === undefined) return { rows: [], total: 0 }

  const rows = await listBundleRecords(
    { fromAd, toAd },
    { withMoney: filters.chips?.['with_money']?.[0] === 'yes' },
  )
  return { rows, total: rows.length }
}

/**
 * @param window the rental window to measure availability against, or `null`
 *   before one is known — which yields zero rows rather than a guess.
 * @param withMoney the caller's own money gate. **Never a literal `true`.**
 */
export function useBundleRecords(window: RentalWindow | null, withMoney: boolean): ListResult<BundleRecord> {
  return useList<BundleRecord>(
    fetchBundleRecords,
    {
      chips: {
        window_from: window ? [window.fromAd] : [],
        window_to: window ? [window.toAd] : [],
        with_money: [withMoney ? 'yes' : 'no'],
      },
    },
    // A catalogue is addressed, not filtered. Without this an empty result would
    // offer "Clear filters" for a window that genuinely has no bundles in it.
    { isFilteredOverride: false },
  )
}

/**
 * One bundle, addressed rather than filtered.
 *
 * `rows[0]` rather than a bespoke single-record hook, matching
 * `useClientProfile`: "no such bundle" arrives as `isEmpty` — a successful query
 * that matched nothing — and a failed read arrives as `error`. Collapsing both
 * into one "not found" screen would tell an operator their link was wrong when
 * the database was merely unreachable.
 *
 * The chip key is `bundle_ref`, NOT `bundle_code`: the value may be either a code
 * or a uuid, and `listQuery.ts:152` treats chip keys as column names everywhere
 * else, so claiming the narrower of the two would be the mistake `useClients.ts`
 * documents.
 */
async function fetchBundleRecord(filters: ListFilters): Promise<ListQueryResult<BundleRecord>> {
  const ref = filters.chips?.['bundle_ref']?.[0]
  const fromAd = filters.chips?.['window_from']?.[0]
  const toAd = filters.chips?.['window_to']?.[0]
  if (ref === undefined || fromAd === undefined || toAd === undefined) return { rows: [], total: 0 }

  const record = await getBundleRecord(ref, { fromAd, toAd }, {
    withMoney: filters.chips?.['with_money']?.[0] === 'yes',
  })
  return { rows: record ? [record] : [], total: record ? 1 : 0 }
}

/**
 * @param ref a `bundle_code` (`BND-23`) or a `bundles.id` uuid — either resolves.
 * @param window the rental window availability is measured against (§4.44).
 * @param withMoney the caller's own money gate. **Never a literal `true`.**
 */
export function useBundleRecord(
  ref: string | undefined,
  window: RentalWindow | null,
  withMoney: boolean,
): ListResult<BundleRecord> {
  return useList<BundleRecord>(
    fetchBundleRecord,
    {
      chips: {
        bundle_ref: ref ? [ref] : [],
        window_from: window ? [window.fromAd] : [],
        window_to: window ? [window.toAd] : [],
        with_money: [withMoney ? 'yes' : 'no'],
      },
    },
    // A bundle is addressed, not filtered — no "Clear filters" for a bad address.
    { isFilteredOverride: false },
  )
}

/**
 * One bundle as its **columns**, for the edit form.
 *
 * Deliberately not `useBundleRecord`. That hook returns a `BundleRecord` — the
 * pane's display shape, whose availability is computed against a window and
 * whose four-state line pools are derived, not stored. An edit form must post
 * back exactly the columns it was given, so it reads `BundleWithItems`: the
 * bundle's own row plus each `bundle_items` row with its `itemId`, which is the
 * id `updateBundle` writes against. Editing from the display shape would mean
 * mapping a derived pool back to a column, which is the direction that loses.
 *
 * `includeArchived` is on, because an archived bundle is exactly the one an
 * operator opens the editor to **restore**. Filtering it out would make the
 * un-archive control unreachable for every bundle that needs it.
 *
 * No window is taken. Nothing on this hook's result depends on one — the form
 * edits what the bundle *is*, not what is free.
 *
 * @param ref a `bundle_code` (`BND-23`) or a `bundles.id` uuid — either resolves.
 * @param withMoney the caller's own money gate. **Never a literal `true`.**
 */
async function fetchBundleWithItems(filters: ListFilters): Promise<ListQueryResult<BundleWithItems>> {
  const ref = filters.chips?.['bundle_ref']?.[0]
  if (ref === undefined) return { rows: [], total: 0 }

  const rows = await listBundlesWithItems({
    bundleRef: ref,
    includeArchived: true,
    withMoney: filters.chips?.['with_money']?.[0] === 'yes',
    limit: 1,
  })
  return { rows, total: rows.length }
}

export function useBundleWithItems(
  ref: string | undefined,
  withMoney: boolean,
): ListResult<BundleWithItems> {
  return useList<BundleWithItems>(
    fetchBundleWithItems,
    { chips: { bundle_ref: ref ? [ref] : [], with_money: [withMoney ? 'yes' : 'no'] } },
    // Addressed, not filtered — no "Clear filters" for a bad address.
    { isFilteredOverride: false },
  )
}
