import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { recordExport } from '../../lib/exportAudit'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, PageHeader, PageActions, KpiStrip } from '../../components/ui/Page'
import { GlobalAddMenu } from '../../components/ui/creation/GlobalAddMenu'
import { PageShell } from '../../components/ui/PageShell'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { FilterButton, FilterDrawer } from '../../components/ui/FilterDrawer'
import { Pagination } from '../../components/ui/Pagination'
import { ListControlRow, ListWorkspace } from '../../components/ui/ListWorkspace'
import { SearchInput } from '../../components/ui/SearchInput'
import { useFacetCounts } from '../../lib/queries/facetCounts'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ContextDrawer } from '../../components/ui/ContextDrawer'
import { DataTableShell } from '../../components/ui/DataTable'
import { Unavailable } from '../../components/ui/Unavailable'
import { Badge } from '../../components/ui/Badge'
import { formatMoney, grouped } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import { useTabularLayout, useViewport } from '../../lib/device'
import { canViewMoneyField, gateContext } from '../../lib/fieldGating'
import type { GateContext } from '../../lib/fieldGating'
import type { SystemRole } from '../../types/database'
import { IntelCard } from '../../components/ui/IntelCard'
import { Bundles } from './Bundles'
import { SubRental } from '../operations/SubRental'
import { Maintenance } from './Maintenance'
import StockCheck from './StockCheck'
import { LoadingSkeleton } from '../../components/ui/StateViews'
const AddEquipment = lazy(() => import('./AddEquipment'))
import { FloatingBulkActionBar } from '../../components/ui/QuickActionPanel'
import { BarcodeLookupModal } from '../rentals/modals/BarcodeLookupModal'
import { PrintLabelModal } from '../../components/ui/PrintLabelModal'
import type { LabelData } from '../../lib/labelPrinter'
import './inventory.css'
import {
  listInventory,
  listUnits,
  catalogue,
  inventoryChip,
  inventorySort,
  CATEGORY_COLUMN,
  SERIALISATION_COLUMN,
  UNIT_CONDITION_COLUMN,
  UNIT_STATE_COLUMN,
} from '../../lib/queries/inventory'
import type { InventoryChip, InventoryListRow, InventoryUnitRow } from '../../lib/queries/inventory'
import { useList } from '../../lib/queries/useList'
import type { ListQueryResult } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import {
  TABS,
  TAB_SLUG,
  tabFromSlug,
  EQUIPMENT_CHIPS,
  chipKey,
  INV_STYLE,
  INV_DOT,
  INV_LABEL,
  INV_TONE,
  CONDITION_TONE,
  CONDITION_INK,
  CATEGORY_ICON,
  FILTER_RAIL,
  /* The option lists the two countable facets probe. Same arrays `FILTER_RAIL`
     renders from, so a count can never be offered for an option the panel does
     not show, or withheld from one it does. */
  PRODUCT_CATEGORIES,
  INV_ORDER,
  SORTS,
  SORT_UNAVAILABLE,
  breakdownOf,
  conditionOf,
  stockLabel,
  unitLocationOf,
  inventoryGlance,
  inventoryDetailGroups,
  type InvStatus,
  type Condition,
  type EquipmentChip,
  type FacetKey,
  type InventoryTab,
  type SortKey,
  type StatusCount,
} from '../../lib/queries/inventory'

/* ── shared cell geometry ──────────────────────────────────────────────── */

type Density = 'comfortable' | 'compact'

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}

const tdFor = (d: Density) => ({
  padding: d === 'compact' ? '5px 10px' : '10px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap' as const,
  verticalAlign: 'top' as const,
})



/* ── the filter set ────────────────────────────────────────────────────────
 *
 * ## What this screen used to be
 *
 * `PARENTS.filter(...)` over eight hand-typed rows inside a `useMemo`, with a
 * five-way `switch` of `.sort()` calls after it and a `.slice()` for paging —
 * under eleven chips whose counts summed to 2486 and a six-card KPI strip read
 * out of the same eleven integers. The chips, the KPIs and the table agreed with
 * each other and with nothing else.
 *
 * Everything below is now a server-side predicate. There is no `.filter()`,
 * `.sort()` or `.slice()` over fetched rows anywhere in this file.
 *
 * ## Law 6 — the only money this screen asks for
 *
 * `withMoney` is passed **only** behind `useCanViewMoney()`, and the six KPI
 * count queries never pass it at all. `products_v` already masks the nine money
 * columns for a money-blind session, so this is belt and braces — but the mask
 * resolves `auth_can_view_money()` → `auth_user_role()` → the GUC PostgREST sets
 * per request, which is three moving parts. Not asking depends on none of them.
 */

/**
 * The facets that reach a column, and which column each one reaches.
 *
 * `Status` deliberately shares `UNIT_STATE_COLUMN` with the chip row: they are
 * two controls over one column, so `inventoryQuery` INTERSECTS them rather than
 * letting the later one win.
 */
export const FACET_COLUMN: Record<FacetKey, string> = {
  Category: CATEGORY_COLUMN,
  Status: UNIT_STATE_COLUMN,
  Condition: UNIT_CONDITION_COLUMN,
  Serialisation: SERIALISATION_COLUMN,
}

type Facets = Partial<Record<FacetKey, Set<string>>>

export interface InventoryQuery {
  /** The complete set sent to Postgres — structural predicates and the operator's, merged. */
  filters: ListFilters
  /** What "the catalogue" means before anyone touches a control. `useList` compares against it. */
  baseline: ListFilters
  /**
   * The chip and the Status facet select DISJOINT sets, so nothing can match.
   *
   * ⛔ This cannot be expressed as a filter and must not be sent as one:
   * `applyListFilters` reads an empty chip array as "no constraint", so
   * `{ 'unit_state.status': [] }` would return the ENTIRE catalogue — the widest
   * possible answer to the narrowest possible question. The screen renders its
   * empty state without querying.
   */
  impossible: boolean
  /** Set when the chosen sort has no column; the reason, verbatim, for the operator. */
  sortUnavailable: string | null
}

/**
 * Chip + rail + sort → one `ListFilters`.
 *
 * Pure, and exported for `__tests__/inventoryList.test.ts`: a wrong column name
 * or a wrong enum literal here does not throw — it either 400s the whole screen
 * (`inventory_state` and `product_category` are real Postgres enums, so a bogus
 * value is `22P02`, not an empty result) or, worse, quietly stops narrowing.
 */
export function inventoryQuery(chip: InventoryChip, facets: Facets, sort: SortKey): InventoryQuery {
  const baseline = catalogue()
  const base = inventoryChip(chip)

  const chips: Record<string, readonly string[]> = {}
  for (const [column, values] of Object.entries(base.chips ?? {})) {
    if (values && values.length > 0) chips[column] = values
  }

  let impossible = false
  // Iterating `FACET_COLUMN` rather than `facets` keeps the order fixed, so two
  // identical filter sets produce byte-identical `filterKey`s and `useList` does
  // not refetch on a re-render that merely rebuilt the object.
  for (const key of Object.keys(FACET_COLUMN) as FacetKey[]) {
    const chosen = facets[key]
    if (!chosen || chosen.size === 0) continue
    const column = FACET_COLUMN[key]
    const picked = [...chosen]
    const existing = chips[column]
    if (!existing) {
      chips[column] = picked
      continue
    }
    const both = picked.filter((v) => existing.includes(v))
    if (both.length === 0) impossible = true
    else chips[column] = both
  }

  const mapped = inventorySort(sort)

  return {
    baseline,
    impossible,
    sortUnavailable: mapped ? null : (SORT_UNAVAILABLE[sort] ?? null),
    filters: { ...base, chips, sort: mapped ?? { column: 'name', ascending: true } },
  }
}

/**
 * The KPI strip, as six count queries.
 *
 * Each is a named filter set plus a one-row page: the card wants `total`, not
 * the rows. `page` is not a narrowing predicate — `useList`'s `narrowingKey`
 * ignores it — so a count query can never make a card read as "filtered".
 *
 * ⚠ **These count MODELS, not units**, and every card's `note` says so. A model
 * with an In Stock unit and an On Rent unit is counted by both cards, which is
 * why the five state cards do not sum to the first one and are not presented as
 * if they should. The unit figures the mockup showed (2486 · 1204 · 642 …) are
 * `select status, count(*) from product_units_v group by status`, an aggregate
 * no function in `lib/queries/inventory.ts` returns.
 *
 * None of the six passes `withMoney`.
 */
const COUNT_PAGE: ListFilters['page'] = { index: 0, size: 1 }

export const INVENTORY_KPI_FILTERS = {
  /** The catalogue itself — Draft and Active, Archived excluded. */
  models: { ...catalogue(), page: COUNT_PAGE },
  inStock: { ...inventoryChip('In Stock'), page: COUNT_PAGE },
  onRent: { ...inventoryChip('On Rent'), page: COUNT_PAGE },
  reserved: { ...inventoryChip('Reserved'), page: COUNT_PAGE },
  maintenance: { ...inventoryChip('Maintenance'), page: COUNT_PAGE },
  missing: { ...inventoryChip('Missing'), page: COUNT_PAGE },
} as const satisfies Record<string, ListFilters>

/**
 * A figure, or an explicit non-value while it is unknown.
 *
 * A KPI reading `0` during the first load, or after the query failed, is a WRONG
 * figure rather than a missing one — "0 missing" is a sentence the floor would
 * act on. Same helper, same reasoning, as `RentalsList.tsx` and `Today.tsx`.
 */
function countOf(list: { loading: boolean; error: string | null }, value: number | null): string {
  return list.loading || list.error !== null || value === null ? '—' : grouped(value)
}

/**
 * The pager's visible page numbers.
 *
 * ⛔ This used to be `Array.from({ length: pageCount })` — every page number,
 * always. Over a client-side array of eight rows that was one button; over a
 * server-side count it is one button per twenty-five models.
 */
/* ── small pieces ──────────────────────────────────────────────────────── */

/**
 * Status badge.
 *
 * Delegates to `<Badge>` — DESIGN_DIRECTION_SPEC_v4.1 §8 step 2: "one
 * component rendering the §4 map from lib/status; every screen inherits. No
 * screen colours a status itself."
 *
 * It used to assemble the chip here, and the assembly carried three deviations
 * from §4's block anatomy: `--r-badge` (a 999 pill, which §3.3 reserves for
 * numeric COUNT badges), weight 600, and sentence case. It also carried an
 * `outlined = s.bg === 'transparent'` branch that drew a green OUTLINE for `In
 * Stock` — the §2 violation now fixed at its source in `data/inventory.ts`.
 * With that fixed the branch could only ever be false, so it goes rather than
 * sitting here waiting for a transparent skin to come back.
 *
 * What the wrapper still owns, and why it is kept rather than inlined at the
 * two call sites:
 *
 *  - **The word comes from `INV_LABEL`, never from the union member** — §7.1's
 *    chip says `Available` where the enum says `In Stock`. That is an
 *    Inventory vocabulary decision and not something `<Badge>` should know.
 *  - **The icon comes from `INV_STYLE`** — §7.4, never colour alone. Four
 *    statuses share the yellow token, so the icon is doing real work, and
 *    `<Badge>`'s own icon table is keyed on booking statuses and flags, which
 *    these are not.
 *
 * `size="sm"` because these sit in dense equipment rows: it lands at roughly
 * the 21px the hand-rolled version had, without giving up the weight, casing
 * or tracking that ARE the identity of a status block.
 */
function StatusBadge({ status }: { status: InvStatus }) {
  return (
    <Badge
      tone={INV_TONE[status]}
      label={INV_LABEL[status]}
      icon={<Icon name={INV_STYLE[status].icon} size={11} />}
      size="sm"
    />
  )
}

/**
 * The mockup badges Condition. Tones come from `CONDITION_TONE` — see its note.
 *
 * Same delegation as `StatusBadge` above; what stays here is the one thing
 * `<Badge>` must not decide — a quantity-tracked SKU has no unit rows and
 * therefore no condition, and the honest render of that is an em dash, not a
 * chip. The mock typed `condition: 'Good'` onto the BNC cable; this states the
 * gap instead.
 */
function ConditionBadge({ condition }: { condition: Condition | null }) {
  if (condition === null) return <span style={{ color: 'var(--muted)' }}>—</span>
  return <Badge tone={CONDITION_TONE[condition]} label={condition} size="sm" />
}

/** Stands in for the mockup's product photograph — see `CATEGORY_ICON`. */
function Thumb({ category, size = 34 }: { category: string; size?: number }) {
  const icon: IconName = CATEGORY_ICON[category] ?? 'box'
  const isSm = size < 30
  return (
    <span
      aria-hidden
      className={`inventory-thumb ${isSm ? 'inventory-thumb-sm' : ''}`}
      style={{
        width: size,
        height: size,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  )
}

/** §3.1 — the parent never carries a single status badge; it states a breakdown. */
function StatusBreakdown({ breakdown }: { breakdown: StatusCount[] }) {
  if (breakdown.length === 0) {
    return (
      <span style={{ color: 'var(--muted)' }} title="No unit rows — status lives on product_units, and this SKU is quantity-tracked.">
        —
      </span>
    )
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {breakdown.map((b) => (
        <span key={b.status} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span
            aria-hidden
            style={{ width: 7, height: 7, borderRadius: 'var(--r-badge)', flexShrink: 0, background: INV_DOT[b.status] }}
          />
          <span className="figure" style={{ color: INV_DOT[b.status], fontWeight: 600 }}>
            {b.count}
          </span>
          <span style={{ color: 'var(--text2)' }}>{INV_LABEL[b.status]}</span>
        </span>
      ))}
    </span>
  )
}

function CategoryChip({ category }: { category: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 17,
        padding: '0 6px',
        borderRadius: 4,
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        color: 'var(--text2)',
        fontSize: 'var(--t-th)',
        fontWeight: 600,
      }}
    >
      {category}
    </span>
  )
}

/* ── per-serial units, fetched when the row is opened ──────────────────── */

export interface UnitsOnDemand {
  rows: InventoryUnitRow[] | null
  loading: boolean
  error: string | null
  retry: () => void
}

/**
 * The rows behind the expand chevron.
 *
 * **Nothing is fetched until `open` goes true**, and that is the whole point of
 * a second query rather than a wider embed: the expansion is per-row and opened
 * one row at a time, so pulling every unit of every model to satisfy the one
 * somebody clicked is the wrong shape at any fleet size. `useList` cannot be
 * used here — it fires on mount, which is precisely what must not happen.
 *
 * The result is kept after the row is collapsed, keyed on `product|money`, so
 * re-opening the same row does not re-query and a change of session role does.
 */
export function useUnitsOnDemand(productId: string, open: boolean, money: boolean): UnitsOnDemand {
  const [rows, setRows] = useState<InventoryUnitRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const key = `${productId}|${money ? 'money' : 'blind'}`
  const requested = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (requested.current === key) return
    requested.current = key

    let cancelled = false
    setRows(null)
    setError(null)
    setLoading(true)

    // Law 6 — `withMoney` is spread on the gate, never passed as a literal.
    listUnits(productId, money ? { withMoney: true } : {})
      .then((res) => {
        if (cancelled) return
        setRows(res.rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // The bare reason, not a sentence — the row writes "Could not load units".
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, key, productId, money, nonce])

  const retry = useCallback(() => {
    requested.current = null
    setNonce((n) => n + 1)
  }, [])

  return { rows, loading, error, retry }
}

/* ── rows ──────────────────────────────────────────────────────────────── */

function ChildRowView({
  unit,
  index,
  count,
  category,
  money,
  density,
}: {
  unit: InventoryUnitRow
  index: number
  count: number
  category: string
  money: boolean
  density: Density
}) {
  const td = tdFor(density)
  const place = unitLocationOf(unit)
  return (
    <tr className="inventory-child-row">
      <td style={td} />
      <td style={td} />
      <td className="inventory-child-indent" style={{ ...td, paddingLeft: 28 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
          <Thumb category={category} size={26} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="queues" size={12} style={{ color: 'var(--muted)' }} />
              {/*
                `asset_tag` is the identifier, not `serial_no`. The mock had it
                the other way round and typed a serial onto every unit; in the
                schema `serial_no` is NULLABLE (0004:194) and `asset_tag` is the
                NOT NULL unique key (0004:195, :233). A unit can be tagged
                without carrying a manufacturer serial, and inventing one from
                the tag would print a serial that does not exist.
              */}
              <Link
                to={`/inventory/${encodeURIComponent(unit.assetTag)}`}
                className="inventory-asset-code"
                style={{ fontSize: 'var(--t-meta)' }}
              >
                {unit.assetTag}
              </Link>
            </span>
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              {unit.serialNo === null ? 'No serial on file' : <>Serial <span className="figure">{unit.serialNo}</span></>} · Unit <span className="figure">{index + 1}</span> of <span className="figure">{count}</span>
            </span>
          </span>
        </span>
      </td>
      <td style={{ ...td, color: 'var(--muted)' }}>{category}</td>
      {/* §5.3 keeps the Stock cell empty on a unit row: a fraction under a
          *Stock* heading reads as availability, which is not what it means. */}
      <td style={td} />
      <td style={td}>
        <StatusBadge status={unit.state} />
      </td>
      <td style={{ ...td, color: 'var(--text2)', whiteSpace: 'normal', minWidth: 150 }}>
        {place ?? <span style={{ color: 'var(--muted)' }}>—</span>}
      </td>
      <td style={td}>
        <ConditionBadge condition={unit.condition} />
      </td>
      {money && (
        <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>
          {unit.replacementValue === null ? <span style={{ color: 'var(--muted)' }}>—</span> : formatMoney(unit.replacementValue)}
        </td>
      )}
      {/* §7.1's row menu has no screen behind it yet, so it states that rather than
          rendering a control that swallows the click. */}
      <td style={{ ...td, width: 30, color: 'var(--muted)' }}>
        <Unavailable reason={/* Row actions are not built — no row action in §7.1 has a screen yet, and §4.1 rules out the status edit outright. */ "Open the equipment record to see available actions."}>
          <Icon name="more_vert" size={14} />
        </Unavailable>
      </td>
    </tr>
  )
}

/** One full-width row inside the expansion, for the three states that are not rows. */
function UnitsNoteRow({ columns, children }: { columns: number; children: ReactNode }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
      <td colSpan={columns} style={{ padding: '9px 10px 9px 58px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        {children}
      </td>
    </tr>
  )
}

function ParentRowView({
  row,
  money,
  gctx,
  actionContext,
  density,
  columns,
  showUnitColumns,
  showReplacement,
  checked,
  onToggle,
  onInspect,
  isInspected = false,
}: {
  row: InventoryListRow
  money: boolean
  gctx: GateContext
  actionContext: { userId: string; role: SystemRole } | null
  density: Density
  columns: number
  showUnitColumns: boolean
  showReplacement: boolean
  checked: boolean
  onToggle: () => void
  onInspect: (row: InventoryListRow) => void
  isInspected?: boolean
}) {
  const [open, setOpen] = useState(false)
  const td = tdFor(density)
  const serialised = row.trackingMode === 'Serialised'
  const category = row.category ?? '—'
  const units = useUnitsOnDemand(row.id, open, money)

  // Hover Intel is a gated field-filtering object graph — built once per
  // (row, gctx) change rather than on every render of this row.
  const { glance, detail } = useMemo(
    () => ({ glance: inventoryGlance(row, gctx), detail: inventoryDetailGroups(row, gctx) }),
    [row, gctx],
  )
  const breakdown = useMemo(() => breakdownOf(row), [row])

  return (
    <>
      <tr
        role="row"
        tabIndex={0}
        aria-label={`Inspect ${row.name}`}
        onClick={() => onInspect(row)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
            if (tag !== 'input' && tag !== 'button' && tag !== 'a') {
              e.preventDefault()
              onInspect(row)
            }
          }
        }}
        className={[
          'inventory-parent-row',
          isInspected ? 'is-inspected' : '',
          open ? 'is-open' : '',
          checked ? 'is-selected' : '',
        ].filter(Boolean).join(' ')}
      >
        <td style={{ ...td, width: 26 }} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select ${row.name}`}
            checked={checked}
            onChange={onToggle}
            style={{ accentColor: 'var(--nav-active-accent)' }}
          />
        </td>
        <td style={{ ...td, width: 34 }} onClick={(e) => e.stopPropagation()}>
          {serialised ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${row.name}`}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: open ? 'var(--nav-active-bg)' : 'var(--card2)',
                color: open ? 'var(--nav-active-accent)' : 'var(--text2)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                transition: 'all var(--dur-fast) var(--ease)',
              }}
            >
              <Icon name={open ? 'chevron_down' : 'chevron_right'} size={14} />
            </button>
          ) : (
            <span aria-hidden style={{ display: 'inline-block', width: 28 }} />
          )}
        </td>
        <td style={td}>
          <IntelCard glance={glance} detail={detail} detailTitle={row.name} detailSubtitle={category} entityType="equipment" entityId={row.id} context="inventory" gateContext={gctx} actionContext={actionContext}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Thumb category={category} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <Link
                  data-intel-identifier
                  to={`/inventory/${encodeURIComponent(row.assetCode)}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--link)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text)')}
                >
                  {row.name}
                </Link>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Link
                    to={`/inventory/${encodeURIComponent(row.assetCode)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inventory-asset-code"
                  >
                    {row.assetCode}
                  </Link>

                </span>
              </span>
            </span>
          </IntelCard>
        </td>
        <td style={{ ...td, color: 'var(--text2)' }}>{category}</td>
        <td className="figure" style={td}>
          {stockLabel(row)}
        </td>
        {showUnitColumns && <>
        {/* §3.1 — the parent never carries a single status badge. */}
        <td style={{ ...td, minWidth: 170 }}>
          <StatusBreakdown breakdown={breakdown} />
        </td>
        {/* Location is shown on actual unit rows only. */}
        <td style={td}>
          <ConditionBadge condition={conditionOf(row)} />
        </td>
        </>}
        {money && showReplacement && (
          <td className="figure" style={{ ...td, fontWeight: 600, textAlign: 'right' }}>
            {row.replacementValue === null ? <span style={{ color: 'var(--muted)' }}>—</span> : formatMoney(row.replacementValue)}
          </td>
        )}
        <td style={{ ...td, width: 36, color: 'var(--muted)' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onInspect(row)}
            aria-label={`Quick view ${row.name}`}
            title="Quick view"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-btn)',
              background: 'var(--card2)',
              color: 'var(--text2)',
              cursor: 'pointer',
              width: 32,
              height: 32,
              display: 'grid',
              placeItems: 'center',
              transition: 'all var(--dur-fast) var(--ease)',
            }}
          >
            <Icon name="eye" size={14} />
          </button>
        </td>
      </tr>

      {open && units.loading && <UnitsNoteRow columns={columns}>Loading units…</UnitsNoteRow>}
      {open && units.error !== null && (
        <UnitsNoteRow columns={columns}>
          <span style={{ color: 'var(--danger-text)' }}>Could not load the units of {row.name}. {units.error}</span>{' '}
          <button
            type="button"
            onClick={units.retry}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--link)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Retry
          </button>
        </UnitsNoteRow>
      )}
      {open && units.rows !== null && units.rows.length === 0 && (
        <UnitsNoteRow columns={columns}>This model has no unit rows yet.</UnitsNoteRow>
      )}
      {open &&
        units.rows?.map((u, i) => (
          <ChildRowView
            key={u.id}
            unit={u}
            index={i}
            count={units.rows?.length ?? 0}
            category={category}
            money={money}
            density={density}
          />
        ))}
    </>
  )
}

/* ── phone cards ───────────────────────────────────────────────────────── */

/**
 * Below 768px the equipment table (`minWidth: 1060`, the widest table in the
 * app) is not a table — it is a horizontal scrollbar hiding the columns that
 * matter. `RentalsList.tsx`'s card row is the locked pattern (§7): one card per
 * model, essential columns on the face, and serialised models keep their expand
 * action — the same lazy `listUnits` call the desktop row makes.
 */
function ParentCardView({
  row,
  glance,
  detail,
  gctx,
  actionContext,
  money,
  checked,
}: {
  row: InventoryListRow
  glance: ReturnType<typeof inventoryGlance>
  detail: ReturnType<typeof inventoryDetailGroups>
  gctx: GateContext
  actionContext: { userId: string; role: SystemRole } | null
  money: boolean
  checked: boolean
  onToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  const serialised = row.trackingMode === 'Serialised'
  const category = row.category ?? '—'
  const units = useUnitsOnDemand(row.id, open, money)

  return (
    <div
      className={['inventory-model-card', checked ? 'is-selected' : ''].filter(Boolean).join(' ')}
    >
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Thumb category={category} />
        <IntelCard glance={glance} detail={detail} detailTitle={row.name} detailSubtitle={category} entityType="equipment" entityId={row.id} context="inventory" gateContext={gctx} actionContext={actionContext}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', minWidth: 0 }}>
            <Link
              data-intel-identifier
              to={`/inventory/${encodeURIComponent(row.assetCode)}`}
              style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}
            >
              {row.name}
            </Link>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <CategoryChip category={category} />
              <Link
                to={`/inventory/${encodeURIComponent(row.assetCode)}`}
                className="inventory-asset-code"
              >
                {row.assetCode}
              </Link>

            </span>
          </span>
        </IntelCard>
        <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--muted)' }}>
          <Unavailable reason={/* Row actions are not built — no row action in §7.1 has a screen yet, and §4.1 rules out the status edit outright. */ "Open the equipment record to see available actions."}>
            <Icon name="more_vert" size={16} />
          </Unavailable>
        </span>
      </span>

      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-lg)', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="box" size={12} style={{ color: 'var(--muted)' }} />
          Stock <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>{stockLabel(row)}</span>
        </span>
        {/* §8.3 — the rate is omitted for Warehouse, not masked. `dailyRate` is
            null when the query did not ask, which is the money-blind case. */}
        {money && row.dailyRate !== null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="dollar" size={12} style={{ color: 'var(--muted)' }} />
            <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
              {formatMoney(row.dailyRate)}
            </span>
            /day
          </span>
        )}
      </span>

      {/* Essential column: Availability — §3.1's breakdown, never one badge. */}
      <StatusBreakdown breakdown={breakdownOf(row)} />

      {serialised && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} the units of ${row.name}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            minHeight: 44,
            padding: '0 14px',
            borderRadius: 'var(--r-btn)',
            border: '1px solid var(--border)',
            background: open ? 'var(--nav-active-bg)' : 'var(--card2)',
            color: open ? 'var(--nav-active-accent)' : 'var(--text)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all var(--dur-fast) var(--ease)',
          }}
        >
          <Icon name={open ? 'chevron_down' : 'chevron_right'} size={14} />
          {open ? 'Hide units' : 'Show units'}
        </button>
      )}

      {open && units.loading && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Loading units…</span>}
      {open && units.error !== null && (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
          Could not load the units of {row.name}. {units.error}
        </span>
      )}
      {open && units.rows !== null && units.rows.length === 0 && (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>This model has no unit rows yet.</span>
      )}
      {open &&
        units.rows?.map((u, i) => (
          <ChildCardView key={u.id} unit={u} index={i} count={units.rows?.length ?? 0} money={money} />
        ))}
    </div>
  )
}

/** Phone equivalent of `ChildRowView` — a nested unit card instead of a table row. */
function ChildCardView({
  unit,
  index,
  count,
  money,
}: {
  unit: InventoryUnitRow
  index: number
  count: number
  money: boolean
}) {
  const place = unitLocationOf(unit)
  return (
    <div className="inventory-unit-card">
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Icon name="queues" size={12} style={{ color: 'var(--muted)' }} />
        <Link
          to={`/inventory/${encodeURIComponent(unit.assetTag)}`}
          className="inventory-asset-code"
          style={{ fontSize: 'var(--t-meta)' }}
        >
          {unit.assetTag}
        </Link>
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          {unit.serialNo === null ? 'No serial on file' : <>Serial <span className="figure">{unit.serialNo}</span></>} · Unit <span className="figure">{index + 1}</span> of <span className="figure">{count}</span>
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        <StatusBadge status={unit.state} />
        <ConditionBadge condition={unit.condition} />
      </span>
      <span style={{ fontSize: 'var(--t-meta)', color: place === null ? 'var(--muted)' : 'var(--text2)' }}>
        {place ?? 'No rack, shelf or bin recorded'}
      </span>
      {money && unit.replacementValue !== null && (
        <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
          Replacement {formatMoney(unit.replacementValue)}
        </span>
      )}
    </div>
  )
}

/* ── filter rail ───────────────────────────────────────────────────────── */

function FilterRail({
  facets,
  onToggle,
  onReset,
  money,
  activeCount,
  counts,
}: {
  facets: Facets
  onToggle: (key: FacetKey, value: string) => void
  onReset: () => void
  money: boolean
  activeCount: number
  /** `{ facetKey: { option: rowsRemaining } }`. Absent group = not countable. */
  counts?: Partial<Record<FacetKey, Record<string, number | null>>>
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(['Category', 'Status']))
  const toggleGroup = (label: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })

  /*
   * Law 14 / §7.3 — 44px floor on the PAINT.
   *
   * These are the facet accordion headers (Category, Status, …), stacked with a
   * 2px gap. §5's compact-34-plus-invisible-target escape needs somewhere for
   * the invisible half to go; in a stacked list there is nowhere — a 44px target
   * on a 34px row with a 2px gap overlaps the row above and below by 4px each,
   * and the later one in the DOM wins, so tapping the bottom of Category would
   * open Status. Growing the paint costs a few pixels of rail height and no
   * correctness.
   */
  const rowBase = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-sm)',
    width: '100%',
    minHeight: 'var(--tap)',
    padding: '0 4px',
    border: 'none',
    background: 'transparent',
    fontSize: 'var(--t-meta)',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
  }

  return (
    <Card bodyStyle={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Filters</h2>
        <button
          type="button"
          onClick={onReset}
          disabled={activeCount === 0}
          title={activeCount === 0 ? 'No filters are applied' : `Clear ${activeCount} filter values`}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: activeCount === 0 ? 'var(--muted)' : 'var(--link)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: activeCount === 0 ? 'not-allowed' : 'pointer',
            padding: 0,
          }}
        >
          Reset
        </button>
      </div>

      {FILTER_RAIL.filter((r) => !(r.kind === 'blocked' && r.money && !money)).map((r) => {
        if (r.kind === 'blocked') {
          return (
            <div
              key={r.label}
              aria-disabled
              title={r.reason}
              style={{ ...rowBase, color: 'var(--disabled)', cursor: 'not-allowed' }}
            >
              <Icon name={r.icon} size={14} />
              <span style={{ flex: 1, minWidth: 0 }}>{r.label}</span>
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--disabled)' }}>no query</span>
            </div>
          )
        }

        const chosen = facets[r.key]
        const isOpen = open.has(r.label)
        return (
          <div key={r.label}>
            <button
              type="button"
              onClick={() => toggleGroup(r.label)}
              aria-expanded={isOpen}
              style={{ ...rowBase, color: 'var(--text)', cursor: 'pointer' }}
            >
              <Icon name={r.icon} size={14} style={{ color: 'var(--nav-icon)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>{r.label}</span>
              {chosen && chosen.size > 0 && (
                <span
                  className="figure"
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 'var(--r-badge)',
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--nav-active-bg)',
                    color: 'var(--nav-active-accent)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 700,
                  }}
                >
                  {chosen.size}
                </span>
              )}
              <Icon name={isOpen ? 'chevron_down' : 'chevron_right'} size={13} style={{ color: 'var(--muted)' }} />
            </button>

            {isOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0 8px 6px' }}>
                {r.options.map((o) => (
                  <label
                    key={o}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      fontSize: 'var(--t-meta)',
                      color: 'var(--text2)',
                      cursor: 'pointer',
                      padding: '2px 0',
                    }}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Filter by ${o}`}
                      checked={Boolean(chosen?.has(o))}
                      onChange={() => onToggle(r.key, o)}
                      style={{ accentColor: 'var(--nav-active-accent)' }}
                    />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o}</span>
                    {/*
                      P6 — "filters carry live counts on every option". The
                      group header already showed how many options were TICKED;
                      this is the different and more useful number: how many
                      rows each option would leave. `counts` is undefined for a
                      group whose column the query cannot count, and a value in
                      flight renders as a dash rather than a stale figure —
                      `FilterOptionList` §10's rule, applied to this rail.
                    */}
                    {r.kind === 'live' && counts?.[r.key] && (
                      <span
                        className="figure"
                        style={{
                          flexShrink: 0,
                          fontSize: 'var(--t-th)',
                          color: 'var(--muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {counts[r.key]?.[o] ?? '—'}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/*
        ⛔ This used to read "Greyed filters need catalogue fields this build does
        not store yet". That was wrong about eight of the ten: brand, warehouse,
        case, supplier, purchase date and purchase value are all real columns.
        What each one lacks is a different thing, and each row now says its own.
      */}
      <p style={{ margin: '8px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
        Greyed filters have no query behind them — most of their columns exist. Hover one for its own reason.
      </p>

      <Unavailable reason="Saved views are not built — there is nowhere to store one.">
        <Button icon="file" disabled>
          Save Current View
        </Button>
      </Unavailable>
    </Card>
  )
}

/* ── export ────────────────────────────────────────────────────────────── */

/**
 * §8.3 — the export is generated from the same `money` flag the table is, so a
 * Warehouse download carries no value column at all rather than a blanked one.
 *
 * ⚠ It exports the rows **on screen**, and the button says so. It used to take
 * the whole `filtered` array, which was every matching row because every row was
 * in memory; with server-side paging the screen holds one page, and a file
 * silently containing 25 of 300 models would be worse than one that names its
 * own scope.
 */
function exportCsv(rows: InventoryListRow[], money: boolean) {
  const head = ['Equipment', 'Asset code', 'Category', 'Brand', 'Model', 'Tracking', 'Stock', 'Status', 'Condition']
  if (money) head.push('Daily rate (NPR)', 'Replacement / unit (NPR)')
  const body = rows.map((r) => {
    const cells = [
      r.name,
      r.assetCode,
      r.category ?? '',
      r.brand,
      r.model ?? '',
      r.trackingMode,
      stockLabel(r),
      breakdownOf(r)
        .map((b) => `${b.count} ${INV_LABEL[b.status]}`)
        .join(' · '),
      conditionOf(r) ?? '',
    ]
    // A masked or unrequested figure exports as an empty cell, never as 0.
    if (money) {
      cells.push(r.dailyRate === null ? '' : formatMoney(r.dailyRate))
      cells.push(r.replacementValue === null ? '' : formatMoney(r.replacementValue))
    }
    return cells
  })
  const csv = [head, ...body]
    .map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  recordExport({ list: 'inventory', module: 'Inventory', rowCount: rows.length, columns: head })
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'inventory-page.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 3.7 — the `?chip=` spelling of a chip. The label is unique within
 * `EQUIPMENT_CHIPS` (chipKey's caveat is about the two *dimensions* in
 * general, not this fixed row) and reads well in a shared URL:
 * `?chip=available`, `?chip=on-rent`, `?chip=damaged`.
 */
function chipSlug(c: EquipmentChip): string {
  return c.label.toLowerCase().replace(/\s+/g, '-')
}

const FACET_PARAM_MAP: Record<FacetKey, string> = {
  Category: 'category',
  Status: 'status',
  Condition: 'condition',
  Serialisation: 'serialisation',
}

function parseFacetsFromParams(searchParams: URLSearchParams): Facets {
  const result: Facets = {}
  for (const [key, paramName] of Object.entries(FACET_PARAM_MAP) as [FacetKey, string][]) {
    const val = searchParams.get(paramName)
    if (val) {
      const items = val.split(',').map((s) => s.trim()).filter(Boolean)
      if (items.length > 0) {
        result[key] = new Set(items)
      }
    }
  }
  return result
}

/* ── screen ────────────────────────────────────────────────────────────── */

/**
 * **Inventory Workspace** — `Inventory.md` v3.0 (Build Locked), reconciled
 * against `03 Core Modules/Inventory.PNG`.
 *
 * Rules enforced rather than trusted:
 *  · §4.1 **there is no manual status control anywhere** — not in a row menu,
 *    not in bulk. Status is written by the Status Engine from events, so this
 *    screen deliberately offers no way to set it, and `Bulk Actions` stays inert
 *    for that reason rather than for want of a menu.
 *  · §8.3 **Warehouse sees no money — and neither does Coordinator.** One gate,
 *    `canViewMoneyField(gctx, 'asset-finance')` (the hover card's own), removes
 *    the value columns and the value export fields outright, and stops the query
 *    naming a rate at all; nothing is masked, because a masked cell still tells
 *    you a number exists.
 *  · §4.3's chip-count invariant is **gone with the counts it guarded** — see the
 *    note where `CHIP_COUNTS` used to be in `data/inventory.ts`.
 */
export default function Inventory() {
  /*
   * §7 — four tab panes under `/inventory`, **with the active tab in the URL**.
   *
   * The spec calls them tabs (line 3) and then draws `Inventory ▸ Bundles`
   * breadcrumbs on three of them, which a pane with only local state cannot
   * have. A search parameter is the shape that satisfies both: one route, four
   * addressable panes. `data/inventory.ts`'s `TAB_SLUG` holds the mapping and
   * says why.
   *
   * `replace` on the setter so flicking between tabs does not build a back
   * stack the operator has to walk out of.
   */
  const [params, setParams] = useSearchParams()
  const searchTerm = params.get('q') ?? ''
  const tabParam = params.get('tab')
  const isNew = tabParam === 'new'
  const tab = tabFromSlug(tabParam)
  const setTab = useCallback(
    (next: InventoryTab) => {
      setFiltersOpen(false)
      const p = new URLSearchParams(params)
      if (next === 'Equipment') p.delete('tab')
      else p.set('tab', TAB_SLUG[next])
      setParams(p, { replace: true })
    },
    [params, setParams],
  )

  /*
   * 3.7 — the chip row is the Equipment pane's sibling-tab filter, so like the
   * tab itself it lives in the URL (`?chip=available`), validated against the
   * real row and falling back to All for anything stale. Same `replace: true`
   * rule: flicking chips must not build a back stack. Active facets also sync to
   * the URL query string (`?category=...&condition=...`) so refresh/sharing preserves them.
   */
  const chipParam = params.get('chip')
  const chip: EquipmentChip = useMemo(
    () => EQUIPMENT_CHIPS.find((c) => chipSlug(c) === chipParam) ?? EQUIPMENT_CHIPS[0]!,
    [chipParam],
  )
  const setChip = useCallback(
    (next: EquipmentChip) => {
      const p = new URLSearchParams(params)
      if (next.kind === 'all') p.delete('chip')
      else p.set('chip', chipSlug(next))
      setParams(p, { replace: true })
    },
    [params, setParams],
  )
  const facets: Facets = useMemo(() => parseFacetsFromParams(params), [params])
  const [showStats, setShowStats] = useState(false)
  const PRIMARY_EQUIPMENT_CHIPS = useMemo(
    () => EQUIPMENT_CHIPS.filter((c) => c.kind === 'all' || (c.kind === 'status' && (c.status === 'In Stock' || c.status === 'On Rent'))),
    []
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState<SortKey>('Equipment A–Z')
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [density, setDensity] = useState<Density>('comfortable')
  const [rowsPerPage, setRowsPerPage] = useState<number>(25)
  const [page, setPage] = useState(1)
  const setSearchTerm = useCallback((value: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value.trim()) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
    setPage(1)
  }, [setParams])
  /** Keyed on `products.id`, the primary key — the mock keyed on `name`, which is not unique. */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inspectingEquipment, setInspectingEquipment] = useState<InventoryListRow | null>(null)
  const [barcodeLookupOpen, setBarcodeLookupOpen] = useState(false)
  const [printingLabel, setPrintingLabel] = useState<LabelData | null>(null)

  const navigate = useNavigate()
  const { user } = useAuth()
  /**
   * DEVICES.md §7 — the equipment table (`minWidth: 1060`) produced a horizontal
   * scrollbar rather than a layout below 768px. `useTabularLayout()` reads only
   * capability, never a platform name (Law 13).
   */
  const tabular = useTabularLayout()
  /** Width only, Law 14 — 768 / 1280. The rail reflows below 1280, never hides. */
  const viewport = useViewport()
  const role = user?.role ?? 'Client'
  const gctx = useMemo(() => gateContext(role), [role])
  /**
   * One money gate for the whole screen. The table column, the CSV export, the
   * query's `withMoney` and the hover card's Money group all read this — and it
   * is the hover card's own predicate (`canViewMoneyField(gctx, 'asset-finance')`),
   * because daily rate and replacement value are asset finance, which HIS §4.1
   * excludes from Coordinator's booking-and-client-balance scope. The screen
   * previously read `useCanViewMoney()` here, which admits Coordinator, so the
   * table showed a replacement value the card built from the same row withheld.
   */
  const money = canViewMoneyField(gctx, 'asset-finance')

  const activeFacetCount = useMemo(
    () => Object.values(facets).reduce((a, s) => a + (s?.size ?? 0), 0),
    [facets],
  )
  const filtersOn = activeFacetCount > 0 || chip.kind !== 'all' || searchTerm.trim() !== ''

  const toggleFacet = useCallback(
    (key: FacetKey, value: string) => {
      const paramName = FACET_PARAM_MAP[key]
      const curSet = new Set(facets[key] ?? [])
      if (curSet.has(value)) {
        curSet.delete(value)
      } else {
        curSet.add(value)
      }
      const p = new URLSearchParams(params)
      if (curSet.size === 0) {
        p.delete(paramName)
      } else {
        p.set(paramName, Array.from(curSet).join(','))
      }
      setParams(p, { replace: true })
      setPage(1)
    },
    [facets, params, setParams],
  )

  // `setChip` in the deps: it closes over the current search params, and a
  // stale copy would write yesterday's URL back.
  const clearFilters = useCallback(() => {
    const p = new URLSearchParams(params)
    p.delete('chip')
    p.delete('q')
    for (const paramName of Object.values(FACET_PARAM_MAP)) {
      p.delete(paramName)
    }
    setParams(p, { replace: true })
    setPage(1)
  }, [params, setParams])

  /*
   * §7.1's chip row spans **two dimensions**, so it resolves into two things
   * before it reaches `inventoryQuery`:
   *
   *  - a status chip narrows `UNIT_STATE_COLUMN` (Available · On Rent ·
   *    Maintenance · Missing);
   *  - **Damaged is a condition**, so it narrows `UNIT_CONDITION_COLUMN` — the
   *    Condition facet the rail already carries — and leaves the status column
   *    alone. `workflow.ts:141` and `WIREFRAME_RULINGS_2026-08-12.md` §7 both
   *    forbid a `Damaged` status enum member; this is the ruled alternative, and
   *    it costs nothing because `inventoryQuery` already INTERSECTS a chip with
   *    a facet over the same column.
   *
   * `inventoryQuery`'s signature is unchanged, so the chip stays one control
   * over one column and `__tests__/inventoryList.test.ts` still describes it.
   */
  const statusChip: InventoryChip = chip.kind === 'status' ? chip.status : 'All'
  const effectiveFacets: Facets = useMemo(() => {
    if (chip.kind !== 'condition') return facets
    const merged: Facets = { ...facets }
    merged.Condition = new Set([...(facets.Condition ?? []), chip.condition])
    return merged
  }, [chip, facets])

  const query = useMemo(
    () => inventoryQuery(statusChip, effectiveFacets, sort),
    [statusChip, effectiveFacets, sort],
  )
  const searchFilters = useMemo<ListFilters>(
    () => ({ ...query.filters, ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}) }),
    [query.filters, searchTerm],
  )

  /*
   * ── P6 facet counts ────────────────────────────────────────────────────
   *
   * The rail already showed a badge per GROUP: how many options are ticked.
   * That is not the number P6 asks for. This is the other one — how many rows
   * each option would leave — and it is the difference between reading the
   * panel and guessing at it.
   *
   * `useFacetCounts` drops the counted column from the filter set before
   * issuing its probes (`countableBase`), so ticking one Category leaves the
   * other categories reporting what they would give instead of collapsing to
   * zero. Gated on `filtersOpen`: this is one count query PER OPTION, and a
   * closed panel must not spend them.
   */
  const countRows = useCallback(
    async (filters: ListFilters): Promise<number | null> => {
      if (query.impossible) return 0
      const res = await listInventory({ ...filters, headOnly: true })
      return res.total ?? null
    },
    [query.impossible],
  )
  const categoryCounts = useFacetCounts(countRows, searchFilters, FACET_COLUMN.Category, PRODUCT_CATEGORIES, filtersOpen)
  const statusCounts = useFacetCounts(countRows, searchFilters, FACET_COLUMN.Status, INV_ORDER, filtersOpen)
  const facetCounts = useMemo(
    () => ({ Category: categoryCounts.counts, Status: statusCounts.counts }),
    [categoryCounts.counts, statusCounts.counts],
  )

  /*
   * ⛔ `withMoney` is the one dangerous argument in this file. Spread on the
   * gate so a money-blind session does not merely hide the column — the select
   * never names `daily_rate` or `replacement_value`.
   */
  const fetchInventory = useCallback(
    async (filters: ListFilters): Promise<ListQueryResult<InventoryListRow>> => {
      if (query.impossible) return { rows: [], total: 0 }
      return listInventory({ ...filters, withCount: true, ...(money ? { withMoney: true } : {}) })
    },
    [query.impossible, money],
  )

  /* Server-side paging. `withCount: true` is what makes "Showing X to Y of Z" a
     count of the whole matching set rather than of the page in hand. */
  const listFilters: ListFilters = { ...searchFilters, page: { index: page - 1, size: rowsPerPage } }
  const list = useList<InventoryListRow>(fetchInventory, listFilters, {
    baseline: query.baseline,
    isFilteredOverride: filtersOn,
  })

  /*
   * The six KPI counts — six fixed calls in a fixed order, never a loop, so the
   * hook order cannot change between renders. Each asks for one row and reads
   * `total`. `isFilteredOverride: false` because a KPI is never "filtered": its
   * set is the card's own definition and no operator input reaches it.
   */
  const countFetcher = useCallback((filters: ListFilters) => listInventory({ ...filters, headOnly: true }), [])
  const modelsKpi = useList<InventoryListRow>(countFetcher, INVENTORY_KPI_FILTERS.models, { isFilteredOverride: false })
  const inStockKpi = useList<InventoryListRow>(countFetcher, INVENTORY_KPI_FILTERS.inStock, { isFilteredOverride: false })
  const onRentKpi = useList<InventoryListRow>(countFetcher, INVENTORY_KPI_FILTERS.onRent, { isFilteredOverride: false })
  const reservedKpi = useList<InventoryListRow>(countFetcher, INVENTORY_KPI_FILTERS.reserved, { isFilteredOverride: false })
  const maintenanceKpi = useList<InventoryListRow>(countFetcher, INVENTORY_KPI_FILTERS.maintenance, { isFilteredOverride: false })
  const missingKpi = useList<InventoryListRow>(countFetcher, INVENTORY_KPI_FILTERS.missing, { isFilteredOverride: false })

  // Count the three visible chips against the whole filtered registry, never this page.
  const countChips = useCallback(async (filters: ListFilters) => {
    const rows = await Promise.all(PRIMARY_EQUIPMENT_CHIPS.map(async (item) => {
      const predicate = inventoryQuery(item.kind === 'status' ? item.status : 'All', facets, sort)
      const id = chipSlug(item)
      if (predicate.impossible) return { id, count: 0 }
      try {
        const result = await listInventory({ ...predicate.filters, ...(filters.search ? { search: filters.search } : {}), headOnly: true })
        return { id, count: result.total }
      } catch {
        return { id, count: null }
      }
    }))
    return { rows, total: rows.length }
  }, [PRIMARY_EQUIPMENT_CHIPS, facets, sort])
  const chipCounts = useList(countChips, { ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}), ...(query.filters.chips ? { chips: query.filters.chips } : {}) })
  const { refetch: refetchChips } = chipCounts

  /* `useList` memoises `refetch`; naming them keeps the callback keyed on
     the functions rather than on the whole list objects, which are fresh
     literals every render (react-hooks/exhaustive-deps, TODO_SWEEP A13). */
  const { refetch: refetchList } = list
  const { refetch: refetchModels } = modelsKpi
  const { refetch: refetchInStock } = inStockKpi
  const { refetch: refetchOnRent } = onRentKpi
  const { refetch: refetchReserved } = reservedKpi
  const { refetch: refetchMaintenance } = maintenanceKpi
  const { refetch: refetchMissing } = missingKpi
  const refreshAll = useCallback(() => {
    refetchList()
    refetchChips()
    refetchModels()
    refetchInStock()
    refetchOnRent()
    refetchReserved()
    refetchMaintenance()
    refetchMissing()
  }, [refetchList, refetchChips, refetchModels, refetchInStock, refetchOnRent, refetchReserved, refetchMaintenance, refetchMissing])

  /*
   * ⛔ Six hand-typed figures became six counted ones — and every label and note
   * changed with them, because they no longer count the same thing. "Available
   * 1,204" meant units; this is models with at least one In Stock unit, which is
   * what a query over `products_v` can answer. Renaming was not cosmetic: the
   * five state cards overlap (one model can be In Stock and On Rent at once) and
   * do not sum to the first, so presenting them as unit totals would be a set of
   * numbers that cannot be reconciled.
   */
  const kpis: Kpi[] = [
    {
      label: 'Equipment models',
      value: countOf(modelsKpi, modelsKpi.total),
      icon: 'box',
      accent: 'primary',
      note: 'Draft and Active · Archived excluded',
    },
    // One word for one state — `Available`, not `In Stock`. See `INV_LABEL`.
    { label: `Models ${INV_LABEL['In Stock']}`, value: countOf(inStockKpi, inStockKpi.total), icon: 'checklist', accent: 'success', note: `At least one unit ${INV_LABEL['In Stock']}` },
    { label: `Models ${INV_LABEL['On Rent']}`, value: countOf(onRentKpi, onRentKpi.total), icon: 'truck', accent: 'success', note: `At least one unit ${INV_LABEL['On Rent']}` },
    { label: `Models ${INV_LABEL.Reserved}`, value: countOf(reservedKpi, reservedKpi.total), icon: 'calendar', accent: 'primary', note: `At least one unit ${INV_LABEL.Reserved}` },
    { label: 'In Maintenance', value: countOf(maintenanceKpi, maintenanceKpi.total), icon: 'tool', accent: 'progress', note: 'At least one unit in Maintenance' },
    { label: 'With a unit Missing', value: countOf(missingKpi, missingKpi.total), icon: 'alert_triangle', accent: 'danger', note: 'Action required' },
  ]

  const total = list.total
  const pageCount = total === null ? 1 : Math.max(1, Math.ceil(total / rowsPerPage))

  /*
   * A stale page past the end of a freshly-narrowed list would ask Postgres for
   * rows that do not exist and render a blank table with a live pager. Every
   * filter control already resets to page 1; this is the net under them.
   */
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const rowsWithIntel = useMemo(
    () =>
      list.rows.map((r) => ({
        row: r,
        glance: inventoryGlance(r, gctx),
        detail: inventoryDetailGroups(r, gctx),
      })),
    [list.rows, gctx],
  )

  const allOnPageSelected = list.rows.length > 0 && list.rows.every((p) => selected.has(p.id))
  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) list.rows.forEach((p) => next.delete(p.id))
      else list.rows.forEach((p) => next.add(p.id))
      return next
    })
  }
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /** Checkbox, chevron, Equipment, Category, Stock, Status, Location, Condition, [money], Actions. */
  const showUnitColumns = list.rows.some(row => breakdownOf(row).length > 0 || conditionOf(row) !== null)
  const showReplacement = money && list.rows.some(row => row.replacementValue !== null)
  const tableColumns = 6 + (showUnitColumns ? 2 : 0) + (showReplacement ? 1 : 0)
  /** Units on THIS PAGE. Never presented as a fleet total — see the KPI note. */
  const countedTitle = total === null ? 'Equipment' : `${grouped(total)} ${total === 1 ? 'Model' : 'Models'} found`

  /*
   * §7.1 draws the action cluster in the PAGE header (`[＋ Add Equipment]
   * [Export]`), above the tab strip — not inside it, as the older mockup did.
   * At phone width the drawing collapses it to a bare `＋`, so the labels go and
   * the icons stay.
   */
  const phone = viewport === 'phone'
  const equipmentActions =
    tab === 'Equipment' && !isNew ? (
      <PageActions
        primary={<GlobalAddMenu module="inventory" />}
        // RULING 2026-10-13: on a phone, Refresh and Export live in More so the title and Add keep the header.
        secondary={phone ? [] : [
          <Button key="refresh" icon="refresh" onClick={refreshAll} aria-label="Refresh equipment">
            Refresh
          </Button>,
          <span
            key="export"
            style={{ display: 'inline-flex' }}
            title={`Exports the ${list.rows.length} models on this page. The list is paged server-side, so the file is the page, not the catalogue.`}
          >
            <Button icon="download" onClick={() => exportCsv(list.rows, money)} aria-label="Export equipment on this page">
              Export
            </Button>
          </span>,
        ]}
        overflow={[
          ...(phone ? [
            { label: 'Refresh equipment', icon: 'refresh' as const, onClick: refreshAll },
            { label: 'Export this page', icon: 'download' as const, onClick: () => exportCsv(list.rows, money) },
          ] : []),
          {
            label: 'Warranty Tracker',
            icon: 'check',
            onClick: () => navigate('/inventory/warranty'),
          },
        ]}
      />
    ) : tab === 'Bundles' && params.get('action') !== 'new' ? (
      <PageActions
        primary={<GlobalAddMenu module="bundles" />}
      />
    ) : null;

  return (
    <PageShell>
      <PageHeader
        {...((tab === 'Equipment' || tab === 'Bundles') && !isNew && params.get('action') !== 'new' ? {
          leading: (
            <FilterButton
              onClick={() => setFiltersOpen((open) => !open)}
              activeCount={tab === 'Equipment' ? activeFacetCount : 0}
              controls={tab === 'Equipment' ? 'inventory-filters' : 'bundle-filters'}
              expanded={filtersOpen}
            />
          ),
        } : {})}
        title="Inventory"
        status={
          tab === 'Equipment' && !isNew && !list.loading ? (
            <span
              className="eyebrow-pill"
              style={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 'var(--t-meta, 13px)',
                letterSpacing: 'normal',
              }}
            >
              {list.total ?? list.rows.length} models
            </span>
          ) : null
        }
        search={
          tab === 'Equipment' && !isNew
            ? {
                value: searchTerm,
                onChange: setSearchTerm,
                placeholder: 'Search equipment or asset code (press /)',
                onClear: () => setSearchTerm(''),
                ariaLabel: 'Search inventory',
              }
            : undefined
        }
        description="Find equipment, check availability, and manage stock."
        actions={equipmentActions}
      />
      <FilterDrawer
        id="inventory-filters"
        open={filtersOpen && tab === 'Equipment' && !isNew}
        onClose={() => setFiltersOpen(false)}
        desktopMode="overlay"
        resultCount={list.loading ? null : list.total}
        noun="equipment models"
        activeCount={activeFacetCount}
        onClearAll={clearFilters}
        standardFooter
        onApply={() => setFiltersOpen(false)}
      >
          <FilterRail
            facets={facets}
            onToggle={toggleFacet}
            onReset={clearFilters}
            money={money}
            activeCount={activeFacetCount}
            counts={facetCounts}
          />
      </FilterDrawer>

      {/*
        §7 closing note — **"Tabs scroll horizontally rather than wrapping at any
        width."** So `flexWrap` is `nowrap` and the strip is its own scroll
        container at every width, not just below 768: a wrapped second row of
        tabs moves the content under it, which is the thing the note forbids.

        `Warehouses` and `Purchase Requests` are gone from this strip and from
        the action cluster. Neither screen is deleted and neither route changes —
        see `data/inventory.ts`'s `TABS` note and the header of
        `Warehouses.tsx` / `PurchaseRequests.tsx`.
      */}
      <div style={{ overflowX: 'auto', paddingBottom: 2, maxWidth: '100%' }}>
        <SegmentedControl
          ariaLabel="Inventory sections"
          size={phone ? 'sm' : 'md'}
          options={[
            ...TABS.map((t) => ({ id: t, label: t })),
            ...(isNew ? [{ id: 'new', label: 'Add Equipment' }] : []),
          ]}
          value={isNew ? 'new' : tab}
          onChange={(selectedId) => {
            if (isNew && selectedId !== 'new') {
              const p = new URLSearchParams(params)
              p.delete('tab')
              setParams(p, { replace: true })
            }
            if (selectedId !== 'new') {
              setTab(selectedId as InventoryTab)
            }
          }}
        />
      </div>

      {isNew ? (
        <Suspense fallback={<LoadingSkeleton type="card" label="Loading equipment form…" />}>
          <AddEquipment
            embedded
            onDone={() => {
              const p = new URLSearchParams(params)
              p.delete('tab')
              setParams(p, { replace: true })
            }}
          />
          </Suspense>
      ) : tab === 'Bundles' ? (
        <Bundles filtersOpen={filtersOpen} onFiltersClose={() => setFiltersOpen(false)} />
      ) : tab === 'Sub-Rentals' ? (
        <SubRental embedded />
      ) : tab === 'Maintenance' ? (
        <Maintenance />
      ) : tab === 'Stock Check' ? (
        /*
         * §7.3 as a pane. The same component still serves
         * `/inventory/stock-check`, which three files deep-link
         * (`data/caseIntel.ts:202`, `data/rackIntel.ts:197`,
         * `modules/reports/ProductReports.tsx:452`) and which must keep
         * resolving. `embedded` drops the page header the pane already has
         * above it; nothing else differs.
         */
        <StockCheck embedded />
      ) : (
        <ListWorkspace className="inventory-v2">
          {showStats && (
            <div style={{ marginBottom: 'var(--sp-sm)' }}>
              <KpiStrip items={kpis} columns={6} />
            </div>
          )}

          <div className="inventory-list-toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ order: 0, flex: '1 1 180px', maxWidth: 360, minWidth: 0 }}>
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                onClear={() => setSearchTerm('')}
                placeholder="Search equipment or asset code"
                aria-label="Search inventory"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowStats((s) => !s)}
              aria-expanded={showStats}
              aria-label={showStats ? 'Hide inventory statistics' : 'Show inventory statistics'}
              style={{
                order: 2,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                padding: '0 14px',
                borderRadius: 'var(--r-btn, 8px)',
                border: `1px solid ${showStats ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: showStats ? 'var(--nav-active-bg)' : 'var(--card)',
                color: showStats ? 'var(--nav-active-accent)' : 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all var(--dur-fast) var(--ease)',
              }}
            >
              <Icon name="chart" size={14} />
              {!phone && <span>{showStats ? 'Hide Stats' : 'Stats'}</span>}
            </button>

            {filtersOn && <button
              type="button"
              onClick={clearFilters}
              title="Clear the status chip and every filter"
              style={{
                order: 3,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 'var(--r-btn, 8px)',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'var(--link)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all var(--dur-fast) var(--ease)',
              }}
            >
              <Icon name="refresh" size={13} />
              {phone ? '' : 'Clear Filters'}
            </button>}
          <ListControlRow
            sort={<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Sort
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value as SortKey); setPage(1) }}
                aria-label="Sort equipment"
                style={{ minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', font: 'inherit' }}
              >
                {SORTS.filter((s) => !SORT_UNAVAILABLE[s]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>}
            view={!phone ? <>
              <button
                type="button"
                onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
                aria-pressed={density === 'compact'}
                aria-label={density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
                title={density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
                style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: density === 'compact' ? 'var(--nav-active-bg)' : 'var(--card)', color: density === 'compact' ? 'var(--nav-active-accent)' : 'var(--text2)', cursor: 'pointer' }}
              >
                <Icon name={density === 'compact' ? 'chevron_up' : 'chevron_down'} size={15} />
              </button>
              <SegmentedControl
                size="sm"
                ariaLabel="View layout"
                options={[{ id: 'table', label: 'Table', icon: 'checklist' }, { id: 'grid', label: 'Cards', icon: 'queues' }]}
                value={view}
                onChange={(v) => setView(v as 'table' | 'grid')}
              />
            </> : undefined}
          />
          </div>

          {/*
            §7.1 desktop: a filter rail on the left, the table to its right.

            Below 1280 the rail **reflows**, it does not hide
            (`WIREFRAME_RULINGS_2026-08-12.md` §7): one column, with the rail's
            content rendered inline BENEATH the list, still visible and still
            operable. It is deliberately not wrapped in `CollapsibleAside` —
            other pages depend on that component's collapse-by-default and this
            page must not change it.
          */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 'var(--sp-md)',
              alignItems: 'start',
            }}
          >
            {/*
              The 216px rail and its below-1280 reflow copy are both gone, and
              §7's rule ("collapse means reflow, not hide") is met better than
              either managed: there is one panel, reachable from one Filters
              button, identical at every width — so the tablet no longer reads
              the same fourteen groups in a different place from the desktop.
              `FilterDrawer` is `position: fixed`, so the grid is one column and
              the table keeps the width the rail was taking.
            */}
            <div className="inventory-chip-track" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              {PRIMARY_EQUIPMENT_CHIPS.map((c) => {
                const key = chipKey(c)
                const on = chipKey(chip) === key
                const tone = c.kind === 'all' ? 'var(--text2)' : c.kind === 'status' ? INV_DOT[c.status] : CONDITION_INK[c.condition]
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setChip(c); setPage(1) }}
                    aria-pressed={on}
                    className={`inventory-filter-chip ${on ? 'is-active' : ''}`}
                    style={!on && tone ? { color: tone } : undefined}
                  >
                    {c.kind === 'status' && <Icon name={INV_STYLE[c.status].icon} size={12} />}
                    {c.kind === 'condition' && <Icon name="eye" size={12} />}
                    {c.label}
                    <span className="figure" style={{ color: 'var(--muted)' }}>{chipCounts.loading || chipCounts.error ? '—' : chipCounts.rows.find(row => row.id === chipSlug(c))?.count ?? '—'}</span>
                  </button>
                )
              })}
            </div>
            <Card title={countedTitle} bodyStyle={{ padding: 0 }}>
              {selected.size > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 14px',
                    background: 'var(--hover-card)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 'var(--t-meta)',
                    flexWrap: 'wrap',
                    gap: 'var(--sp-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {selected.size} model{selected.size === 1 ? '' : 's'} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--link)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Clear selection
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                    <Button
                      icon="download"
                      size="sm"
                      onClick={() => {
                        const selRows = list.rows.filter((r) => selected.has(r.id))
                        exportCsv(selRows, money)
                      }}
                      aria-label={`Export ${selected.size} selected items`}
                    >
                      Export ({selected.size})
                    </Button>
                  </div>
                </div>
              )}

              {/* The safety net under the disabled options — a sort with no column
                  must never look as though it ran. */}
              {query.sortUnavailable !== null && (
                <p style={{ margin: 0, padding: '9px 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}>
                  <strong style={{ color: 'var(--text)' }}>“{sort}” cannot be ordered by the database.</strong>{' '}
                  {query.sortUnavailable} The list is ordered by name instead.
                </p>
              )}

              {/*
                Fixed ladder: restricted → error → loading → empty → children.

                `hasRows` is what keeps a failed REFRESH from blanking a list
                someone is reading: with rows on screen the banner renders above
                them instead of replacing them.

                `empty` also covers `query.impossible` — a Status facet that does
                not intersect the chip. Nothing was sent to Postgres, and "no
                equipment matches these filters" is the true answer.
              */}
              <PageBody
                loading={list.loading}
                error={list.error}
                onRetry={refreshAll}
                hasRows={list.rows.length > 0}
                empty={list.isEmpty || query.impossible}
                emptyIsFiltered={list.isFiltered}
                onClearFilters={clearFilters}
                noun="equipment"
                skeleton="table"
                skeletonRows={6}
                emptyTitle={filtersOn ? 'No equipment matches these filters' : 'No equipment yet'}
                emptyMessage={
                  query.impossible
                    ? `The “${chip.label}” chip and the Status filter do not overlap, so nothing can match both.`
                    : searchTerm.trim()
                      ? 'Try another equipment name or asset code.'
                      : filtersOn
                        ? 'Try adjusting or clearing the filters.'
                      : 'No equipment has been added to the catalogue yet.'
                }
                {...(filtersOn ? {} : { emptyActionLabel: 'Add Equipment', onEmptyAction: () => navigate('/inventory/new') })}
              >
                {!tabular ? (
                  /* Below 768px the 1060px-wide table is a horizontal scrollbar,
                     not a layout — forced to the card presentation regardless of
                     the `view` toggle (Law 13: capability, not a platform check). */
                  <div className="inventory-card-grid">
                    {rowsWithIntel.map(({ row: p, glance, detail }) => (
                      <ParentCardView
                        key={p.id}
                        row={p}
                        glance={glance}
                        detail={detail}
                        gctx={gctx}
                        actionContext={user ? { userId: user.id, role: user.role } : null}
                        money={money}
                        checked={selected.has(p.id)}
                        onToggle={() => toggleRow(p.id)}
                      />
                    ))}
                  </div>
                ) : view === 'grid' ? (
                  <div className="inventory-desktop-grid">
                    {rowsWithIntel.map(({ row: p, glance, detail }) => (
                      <article key={p.id} className="inventory-grid-item">
                        <IntelCard glance={glance} detail={detail} detailTitle={p.name} detailSubtitle={p.category ?? '—'} entityType="equipment" entityId={p.id} context="inventory" gateContext={gctx} actionContext={user ? { userId: user.id, role: user.role } : null}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <Thumb category={p.category ?? '—'} size={38} />
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                              <span data-intel-identifier style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
                              <CategoryChip category={p.category ?? '—'} />
                            </span>
                          </span>
                        </IntelCard>
                        <span style={{ fontSize: 'var(--t-meta)' }}>
                          <StatusBreakdown breakdown={breakdownOf(p)} />
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                          <span className="figure">{stockLabel(p)}</span>
                          <ConditionBadge condition={conditionOf(p)} />
                        </span>
                        {money && p.replacementValue !== null && (
                          <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                            {formatMoney(p.replacementValue)}
                          </span>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <DataTableShell ariaLabel="Equipment inventory" className="inventory-table-shell" style={{ overflowX: 'auto' }}>
                    <table className="inventory-table operations-table" aria-label="Equipment inventory" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1060 }}>
                      <thead>
                        <tr style={{ background: 'var(--th-bg)' }}>
                          <th style={{ ...th, width: 26 }}>
                            <input
                              type="checkbox"
                              aria-label="Select every model on this page"
                              checked={allOnPageSelected}
                              onChange={toggleAllOnPage}
                              style={{ accentColor: 'var(--nav-active-accent)' }}
                            />
                          </th>
                          <th style={{ ...th, width: 26 }} />
                          <th style={th}>
                            <button
                              type="button"
                              onClick={() => {
                                setSort((s) => (s === 'Equipment A–Z' ? 'Equipment Z–A' : 'Equipment A–Z'))
                                setPage(1)
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                color: 'inherit',
                                font: 'inherit',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Equipment / Unit
                              <Icon name={sort === 'Equipment Z–A' ? 'arrow_down' : 'arrow_up'} size={11} />
                            </button>
                          </th>
                          <th style={th}>
                            <button
                              type="button"
                              onClick={() => {
                                setSort((s) => (s === 'Category A–Z' ? 'Equipment A–Z' : 'Category A–Z'))
                                setPage(1)
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                color: 'inherit',
                                font: 'inherit',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Category
                              {sort === 'Category A–Z' && <Icon name="arrow_up" size={11} />}
                            </button>
                          </th>
                          {['Stock', ...(showUnitColumns ? ['Status', 'Condition'] : [])].map((h) => (
                            <th key={h} style={th}>
                              {h}
                            </th>
                          ))}
                          {/* §8.3 — omitted entirely for Warehouse, not blanked.
                              "/ unit" because `products_v.replacement_value` is
                              the SKU's own figure; the mock's parent value was a
                              sum of its children and the schema states no such
                              rule. */}
                          {showReplacement && <th style={{ ...th, textAlign: 'right' }}>Replacement / unit (NPR)</th>}
                          <th style={{ ...th, width: 30 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.rows.map((p) => (
                          <ParentRowView
                            key={p.id}
                            row={p}
                            money={money}
                            gctx={gctx}
                            actionContext={user ? { userId: user.id, role: user.role } : null}
                            density={density}
                            columns={tableColumns}
                            showUnitColumns={showUnitColumns}
                            showReplacement={showReplacement}
                            checked={selected.has(p.id)}
                            onToggle={() => toggleRow(p.id)}
                            onInspect={setInspectingEquipment}
                            isInspected={inspectingEquipment?.id === p.id}
                          />
                        ))}
                      </tbody>
                    </table>
                  </DataTableShell>
                )}
              </PageBody>

              {/* §7.5 — state both counts; the table paginates models, not units. */}
              {list.rows.length > 0 && total !== null && (
                <div style={{ padding: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
                  <Pagination
                    page={page}
                    total={total}
                    pageSize={rowsPerPage}
                    pageSizeOptions={[25, 50, 100]}
                    onPageChange={setPage}
                    onPageSizeChange={setRowsPerPage}
                  />
                </div>
              )}
            </Card>

            {/*
              The below-1280 reflow copy of the rail stood here. It is gone
              because the drawer above serves every width from one place — two
              copies of fourteen groups meant a tablet operator found them under
              the list while a desktop operator found them beside it.
            */}
          </div>
        </ListWorkspace>
      )}

      <ContextDrawer
        id="equipment-quick-view"
        open={Boolean(inspectingEquipment)}
        onClose={() => setInspectingEquipment(null)}
        title={inspectingEquipment?.name ?? 'Equipment'}
        subtitle={inspectingEquipment ? `${inspectingEquipment.category ?? 'Uncategorised'} · ${inspectingEquipment.assetCode}` : undefined}
        status={inspectingEquipment ? <ConditionBadge condition={conditionOf(inspectingEquipment)} /> : undefined}
      >
        {inspectingEquipment && (
          <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
            <section aria-labelledby="equipment-quick-view-stock">
              <h3 id="equipment-quick-view-stock" style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>Stock & Identity</h3>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, margin: 'var(--space-3) 0 0' }}>
                <div style={{ padding: '8px 10px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                  <dt style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)' }}>Availability</dt>
                  <dd className="figure" style={{ margin: '3px 0 0', fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{stockLabel(inspectingEquipment)}</dd>
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                  <dt style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)' }}>Tracking</dt>
                  <dd style={{ margin: '3px 0 0', fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{inspectingEquipment.trackingMode}</dd>
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                  <dt style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)' }}>Category</dt>
                  <dd style={{ margin: '3px 0 0', fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{inspectingEquipment.category ?? '—'}</dd>
                </div>
                {inspectingEquipment.brand && (
                  <div style={{ padding: '8px 10px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                    <dt style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)' }}>Brand</dt>
                    <dd style={{ margin: '3px 0 0', fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{inspectingEquipment.brand}</dd>
                  </div>
                )}
                {money && inspectingEquipment.dailyRate !== null && (
                  <div style={{ padding: '8px 10px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                    <dt style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)' }}>Daily Rate</dt>
                    <dd className="figure" style={{ margin: '3px 0 0', fontWeight: 700, fontSize: '13px', color: 'var(--nav-active-accent)' }}>
                      {formatMoney(inspectingEquipment.dailyRate)}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
            <section aria-labelledby="equipment-quick-view-status">
              <h3 id="equipment-quick-view-status" style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>Status breakdown</h3>
              <div style={{ marginTop: 'var(--space-3)', padding: '10px 12px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                <StatusBreakdown breakdown={breakdownOf(inspectingEquipment)} />
              </div>
            </section>
            {money && (
              <section aria-labelledby="equipment-quick-view-finance">
                <h3 id="equipment-quick-view-finance" style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>Replacement value</h3>
                <div style={{ marginTop: 'var(--space-3)', padding: '10px 14px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                  <p className="figure" style={{ margin: 0, color: 'var(--text)', fontWeight: 700, fontSize: '15px' }}>
                    {inspectingEquipment.replacementValue === null ? '—' : formatMoney(inspectingEquipment.replacementValue)}
                  </p>
                </div>
              </section>
            )}
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link
                to={`/rentals/new?item=${encodeURIComponent(inspectingEquipment.id)}`}
                style={{ textDecoration: 'none' }}
              >
                <Button
                  variant="primary"
                  size="sm"
                  style={{ width: '100%', minHeight: 44, display: 'flex', justifyContent: 'center', gap: 6 }}
                >
                  <Icon name="plus" size={14} /> Start Rental with this Model
                </Button>
              </Link>
              <Link
                to={`/inventory/${encodeURIComponent(inspectingEquipment.assetCode)}`}
                style={{ textDecoration: 'none' }}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  style={{ width: '100%', minHeight: 44, display: 'flex', justifyContent: 'center', gap: 6 }}
                >
                  <Icon name="eye" size={14} /> Full Asset Details
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPrintingLabel({
                    assetCode: inspectingEquipment.assetCode,
                    title: inspectingEquipment.name,
                    subtitle: inspectingEquipment.brand || '',
                    barcodeValue: inspectingEquipment.assetCode,
                    orgName: 'BABIN RENTALS OS',
                  })
                }}
                style={{ width: '100%', minHeight: 44, display: 'flex', justifyContent: 'center', gap: 6 }}
              >
                <Icon name="barcode" size={14} /> Print Thermal Asset Tag
              </Button>
            </div>
          </div>
        )}
      </ContextDrawer>

      <FloatingBulkActionBar
        selectedCount={selected.size}
        totalCount={list.rows.length}
        onClearSelection={() => setSelected(new Set())}
        noun="items"
        actions={[
          {
            id: 'bulk-export',
            label: 'Export Selected CSV',
            icon: 'download',
            onClick: () => {
              const selRows = list.rows.filter((r) => selected.has(r.id))
              exportCsv(selRows, money)
            },
          },
          {
            id: 'bulk-print-tag',
            label: 'Print Thermal Tag',
            icon: 'barcode',
            onClick: () => {
              const selRow = list.rows.find((r) => selected.has(r.id))
              if (selRow) {
                setPrintingLabel({
                  assetCode: selRow.assetCode,
                  title: selRow.name,
                  subtitle: selRow.brand || '',
                  barcodeValue: selRow.assetCode,
                  orgName: 'BABIN RENTALS OS',
                })
              }
            },
          },
          {
            id: 'bulk-stock-check',
            label: 'Stock Check',
            icon: 'check',
            onClick: () => {
              const p = new URLSearchParams(params)
              p.set('tab', 'stock-check')
              setParams(p, { replace: true })
            },
            variant: 'primary',
          },
          {
            id: 'bulk-scan',
            label: 'Scan Barcode',
            icon: 'search',
            onClick: () => setBarcodeLookupOpen(true),
          },
        ]}
      />

      <BarcodeLookupModal
        isOpen={barcodeLookupOpen}
        onClose={() => setBarcodeLookupOpen(false)}
      />

      {printingLabel && (
        <PrintLabelModal
          isOpen={Boolean(printingLabel)}
          onClose={() => setPrintingLabel(null)}
          labelData={printingLabel}
        />
      )}

    </PageShell>
  )
}
