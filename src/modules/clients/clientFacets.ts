import type { ClientRecord, MembershipTier } from '../../data/clients'
import { MEMBERSHIP_TIERS } from '../../data/clients'
import { rupees, type Paisa } from '../../lib/money'
import type { IconName } from '../../components/ui/Icon'

/**
 * # Faceted filters for the client directory
 *
 * `BOOQABLE_DESIGN_PRINCIPLES.md` P6 — *"filters carry live counts on every
 * option"* — recorded **PARTIAL**, with faceted counts called out as "the
 * highest-value unbuilt item (19 Aug)". RentalsList got them; the directory did
 * not. What stood in its rail was `CLIENT_FILTER_GROUPS`, ten `{label, icon}`
 * pairs with **no options and no predicates**, rendered behind an `Unavailable`
 * reading *"Advanced filters (…) are not built yet"*. This file is the missing
 * half.
 *
 * ## Why the counting lives here and not in `queries/facetCounts.ts`
 *
 * `useFacetCounts` issues one `count` query per option against the server,
 * because RentalsList pages server-side through `ListFilters`. The directory
 * does not: it loads `listClientRecords()` once and filters the array in the
 * browser (the same choice its own header defends). So a facet count here is a
 * synchronous pass over rows already in memory — no query, no loading state, no
 * request per option. The *semantics* are deliberately identical to
 * `countableBase(filters, column)`:
 *
 * > **A facet's own selection is excluded when counting that facet.**
 *
 * That is what makes the numbers behave the way an operator expects. Selecting
 * `Membership: Elite` must not collapse every other membership row to 0 —
 * those counts answer *"and how many if I picked that one instead?"*. Every
 * OTHER facet does narrow it, so the count never widens beyond what the rest of
 * the filter bar already allows. FilterDrawer §10 states the same rule for the
 * server path.
 *
 * ## Options are derived from the rows, not declared
 *
 * `Location` and `Segment` read their options off the loaded corpus, so the
 * panel can only ever offer a value that some row actually has. A hardcoded
 * district list would offer 26 districts to a directory holding three, and
 * every empty one would be a dead control — the exact defect
 * `FUNCTIONAL_BUGS.md` exists to catch. Declared enums (`Membership`,
 * `Client Type`) stay declared, because their empty options are meaningful:
 * "no Elite clients yet" is a fact worth showing.
 *
 * ## Law 6
 *
 * Money-shaped facets carry `money: true` and are dropped for a money-blind
 * role by `clientFacetsFor(false)` — mirroring `clientFilterGroupsFor`, which
 * this replaces rather than extends. The predicate never runs for those roles,
 * so `outstandingPaisa` is not read on a Warehouse session even to count.
 */

export interface ClientFacetOption {
  value: string
  label: string
}

export interface ClientFacet {
  /** Stable key, used in state and in the `ActiveFilterChips` key space. */
  key: string
  label: string
  icon: IconName
  /** Dropped entirely for a money-blind role. */
  money?: boolean
  /** Fixed options, or `undefined` when they are derived from the rows. */
  options?: readonly ClientFacetOption[]
  /** Derive options from the loaded corpus, sorted for display. */
  derive?: (rows: readonly ClientRecord[]) => ClientFacetOption[]
  /** Does this row match this option value? */
  match: (row: ClientRecord, value: string) => boolean
}

/** Sorted unique non-empty strings, for a derived facet. */
function uniqueSorted(values: readonly (string | undefined)[]): ClientFacetOption[] {
  const seen = new Set<string>()
  for (const v of values) {
    const t = (v ?? '').trim()
    if (t) seen.add(t)
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }))
}

/**
 * Outstanding buckets in rupees. `rupees()` is the paisa constructor, so the
 * bounds are written in the unit an operator reads and converted once — never
 * a bare integer that a later reader has to guess the unit of.
 */
const OUTSTANDING_BUCKETS: ReadonlyArray<{ value: string; label: string; lo: Paisa; hi: Paisa | null }> = [
  { value: 'none', label: 'Nothing outstanding', lo: rupees(0), hi: rupees(0) },
  { value: 'under50k', label: 'Under Rs 50,000', lo: rupees(1), hi: rupees(50_000) },
  { value: '50kTo2l', label: 'Rs 50,000 – 2,00,000', lo: rupees(50_001), hi: rupees(200_000) },
  { value: 'over2l', label: 'Over Rs 2,00,000', lo: rupees(200_001), hi: null },
]

export const CLIENT_FACETS: readonly ClientFacet[] = [
  {
    key: 'status',
    label: 'Status',
    icon: 'queues',
    options: [
      { value: 'onRent', label: 'Has equipment out' },
      { value: 'vip', label: 'VIP' },
      { value: 'verified', label: 'Verified' },
      { value: 'unverified', label: 'Not verified' },
      { value: 'blocked', label: 'Blocked' },
    ],
    match: (c, v) => {
      if (v === 'onRent') return c.currentRentalsCount > 0
      if (v === 'vip') return Boolean(c.isVip)
      if (v === 'verified') return Boolean(c.isVerified)
      if (v === 'unverified') return !c.isVerified
      if (v === 'blocked') return Boolean(c.isBlocked)
      return false
    },
  },
  {
    key: 'membership',
    label: 'Membership Level',
    icon: 'card',
    options: MEMBERSHIP_TIERS.map((t: MembershipTier) => ({ value: t, label: t })),
    match: (c, v) => c.membership === v,
  },
  {
    key: 'clientType',
    label: 'Client Type',
    icon: 'users',
    options: [
      { value: 'Individual', label: 'Individual' },
      { value: 'Organisation', label: 'Organisation' },
      { value: 'Unassigned', label: 'Unassigned' },
    ],
    match: (c, v) => c.clientType === v,
  },
  {
    key: 'orgType',
    label: 'Organisation Type',
    icon: 'home',
    derive: (rows) => uniqueSorted(rows.map((c) => c.organisationType)),
    match: (c, v) => c.organisationType === v,
  },
  {
    key: 'district',
    label: 'Location',
    icon: 'home',
    derive: (rows) => uniqueSorted(rows.map((c) => c.district || c.city)),
    match: (c, v) => (c.district || c.city) === v,
  },
  {
    key: 'segment',
    label: 'Segment',
    icon: 'flag',
    derive: (rows) => uniqueSorted(rows.flatMap((c) => c.segment ?? [])),
    /* `segment` is an array — a client can be Wedding AND Corporate — so one
       row can satisfy several options of this facet at once. That is why the
       counts of one facet's options may sum to more than the row total, and
       why the panel must never present them as a partition. */
    match: (c, v) => (c.segment ?? []).includes(v as never),
  },
  {
    key: 'outstanding',
    label: 'Outstanding Amount',
    icon: 'card',
    money: true,
    options: OUTSTANDING_BUCKETS.map(({ value, label }) => ({ value, label })),
    match: (c, v) => {
      const b = OUTSTANDING_BUCKETS.find((x) => x.value === v)
      if (!b) return false
      return c.outstandingPaisa >= b.lo && (b.hi === null || c.outstandingPaisa <= b.hi)
    },
  },
  {
    key: 'deposit',
    label: 'Deposit Held',
    icon: 'box',
    money: true,
    options: [
      { value: 'held', label: 'Holding a deposit' },
      { value: 'none', label: 'No deposit held' },
    ],
    match: (c, v) => (v === 'held' ? c.depositHeldPaisa > 0 : c.depositHeldPaisa === 0),
  },
]

/** Law 6 — money-shaped facets never reach a money-blind role. */
export function clientFacetsFor(canViewMoney: boolean): readonly ClientFacet[] {
  return canViewMoney ? CLIENT_FACETS : CLIENT_FACETS.filter((f) => !f.money)
}

/** `{ facetKey: [selected values] }`. Absent key means nothing selected. */
export type FacetSelection = Readonly<Record<string, readonly string[]>>

/** Every selected value across every facet, for the "N active" badge. */
export function selectionCount(selection: FacetSelection): number {
  return Object.values(selection).reduce((n, vs) => n + vs.length, 0)
}

/**
 * Apply the whole selection, optionally skipping one facet.
 *
 * Within a facet, selected values are OR-ed (Elite **or** Creator); across
 * facets they are AND-ed (Elite **and** Kathmandu) — the standard faceted
 * search semantics, and the one users read without being told.
 */
export function applyFacets(
  rows: readonly ClientRecord[],
  facets: readonly ClientFacet[],
  selection: FacetSelection,
  skipKey?: string,
): ClientRecord[] {
  const active = facets.filter((f) => f.key !== skipKey && (selection[f.key]?.length ?? 0) > 0)
  if (active.length === 0) return rows as ClientRecord[]
  return rows.filter((row) =>
    active.every((f) => (selection[f.key] ?? []).some((v) => f.match(row, v))),
  )
}

/** The options a facet should offer, declared or derived. */
export function optionsOf(facet: ClientFacet, rows: readonly ClientRecord[]): readonly ClientFacetOption[] {
  return facet.options ?? facet.derive?.(rows) ?? []
}

/**
 * Counts for one facet's options, with every OTHER facet applied.
 *
 * See the header: excluding this facet's own selection is what makes
 * "and how many if I picked that one instead?" answerable.
 */
export function facetCountsOf(
  facet: ClientFacet,
  rows: readonly ClientRecord[],
  selection: FacetSelection,
): Record<string, number> {
  const base = applyFacets(rows, CLIENT_FACETS, selection, facet.key)
  const counts: Record<string, number> = {}
  for (const opt of optionsOf(facet, rows)) {
    let n = 0
    for (const row of base) if (facet.match(row, opt.value)) n += 1
    counts[opt.value] = n
  }
  return counts
}
