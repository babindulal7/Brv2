import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, PageHeader, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { AppSidePanel } from '../../components/shell/AppSidePanel'
import { WorkspaceLeftPanel } from '../../components/shell/WorkspacePortal'
import { Pagination } from '../../components/ui/Pagination'
import { AppPageToolbar } from '../../components/ui/AppPageToolbar'
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
import { IntelCard } from '../../components/ui/IntelCard'
import { Bundles } from './Bundles'
import { Maintenance } from './Maintenance'
import StockCheck from './StockCheck'
import { LoadingSkeleton } from '../../components/ui/StateViews'
const AddEquipment = lazy(() => import('./AddEquipment'))
import { FloatingBulkActionBar } from '../../components/ui/QuickActionPanel'
import { BarcodeLookupModal } from '../rentals/modals/BarcodeLookupModal'
import { PrintLabelModal } from '../../components/ui/PrintLabelModal'
import type { LabelData } from '../../lib/labelPrinter'
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
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 7,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        color: 'var(--muted)',
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
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={td} />
      <td style={td} />
      <td style={{ ...td, paddingLeft: 22 }}>
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
                className="identifier"
                style={{ fontSize: 'var(--t-meta)', color: 'var(--link)', textDecoration: 'none', fontWeight: 600 }}
              >
                {unit.assetTag}
              </Link>
            </span>
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              {unit.serialNo === null ? 'No serial on file' : `Serial ${unit.serialNo}`} · Unit {index + 1} of {count}
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
        <Unavailable reason="Row actions are not built — no row action in §7.1 has a screen yet, and §4.1 rules out the status edit outright.">
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
  density,
  columns,
  checked,
  onToggle,
  onInspect,
}: {
  row: InventoryListRow
  money: boolean
  gctx: GateContext
  density: Density
  columns: number
  checked: boolean
  onToggle: () => void
  onInspect: (row: InventoryListRow) => void
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
      <tr style={{ borderBottom: '1px solid var(--border)', background: open ? 'var(--card2)' : 'transparent' }}>
        <td style={{ ...td, width: 26 }}>
          <input
            type="checkbox"
            aria-label={`Select ${row.name}`}
            checked={checked}
            onChange={onToggle}
            style={{ accentColor: 'var(--nav-active-accent)' }}
          />
        </td>
        <td style={{ ...td, width: 26 }}>
          {serialised ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${row.name}`}
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                border: 'none',
                background: 'transparent',
                color: 'var(--text2)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={open ? 'chevron_down' : 'chevron_right'} size={14} />
            </button>
          ) : (
            <span aria-hidden style={{ display: 'inline-block', width: 20 }} />
          )}
        </td>
        <td style={td}>
          <IntelCard glance={glance} detail={detail} detailTitle={row.name} detailSubtitle={category}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Thumb category={category} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <Link
                  to={`/inventory/${encodeURIComponent(row.assetCode)}`}
                  style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--link)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text)')}
                >
                  {row.name}
                </Link>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CategoryChip category={category} />
                  <Link
                    to={`/inventory/${encodeURIComponent(row.assetCode)}`}
                    className="identifier"
                    style={{ fontSize: 'var(--t-th)', color: 'var(--link)', textDecoration: 'none' }}
                  >
                    {row.assetCode}
                  </Link>
                  {!serialised && (
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
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {row.trackingMode}
                    </span>
                  )}
                </span>
              </span>
            </span>
          </IntelCard>
        </td>
        <td style={{ ...td, color: 'var(--text2)' }}>{category}</td>
        <td className="figure" style={td}>
          {stockLabel(row)}
        </td>
        {/* §3.1 — the parent never carries a single status badge. */}
        <td style={{ ...td, minWidth: 170 }}>
          <StatusBreakdown breakdown={breakdown} />
        </td>
        {/*
          Location has no parent-level column. It lives on `product_units` as
          rack / shelf / bin (0004:205-207) and is shown per unit below, so the
          model row states an explicit non-value rather than the mock's "Mixed",
          which was a claim about units nobody had loaded.
        */}
        <td style={{ ...td, color: 'var(--muted)' }} title="Location is a per-unit field — expand the row to see each unit's rack · shelf · bin.">
          —
        </td>
        <td style={td}>
          <ConditionBadge condition={conditionOf(row)} />
        </td>
        {money && (
          <td className="figure" style={{ ...td, fontWeight: 600, textAlign: 'right' }}>
            {row.replacementValue === null ? <span style={{ color: 'var(--muted)' }}>—</span> : formatMoney(row.replacementValue)}
          </td>
        )}
        <td style={{ ...td, width: 30, color: 'var(--muted)' }}>
          <button
            type="button"
            onClick={() => onInspect(row)}
            aria-label={`Quick view ${row.name}`}
            title="Quick view"
            style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', width: 30, height: 30, display: 'grid', placeItems: 'center' }}
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
  money,
  checked,
  onToggle,
}: {
  row: InventoryListRow
  glance: ReturnType<typeof inventoryGlance>
  detail: ReturnType<typeof inventoryDetailGroups>
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-sm)',
        padding: '13px 14px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input
          type="checkbox"
          aria-label={`Select ${row.name}`}
          checked={checked}
          onChange={onToggle}
          style={{ accentColor: 'var(--nav-active-accent)', marginTop: 'var(--sp-xs)', flexShrink: 0, width: 18, height: 18 }}
        />
        <Thumb category={category} />
        <IntelCard glance={glance} detail={detail} detailTitle={row.name} detailSubtitle={category}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', minWidth: 0 }}>
            <Link
              to={`/inventory/${encodeURIComponent(row.assetCode)}`}
              style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}
            >
              {row.name}
            </Link>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <CategoryChip category={category} />
              <Link
                to={`/inventory/${encodeURIComponent(row.assetCode)}`}
                className="identifier"
                style={{ fontSize: 'var(--t-th)', color: 'var(--link)', textDecoration: 'none' }}
              >
                {row.assetCode}
              </Link>
              {!serialised && (
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
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {row.trackingMode}
                </span>
              )}
            </span>
          </span>
        </IntelCard>
        <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--muted)' }}>
          <Unavailable reason="Row actions are not built — no row action in §7.1 has a screen yet, and §4.1 rules out the status edit outright.">
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
            gap: 5,
            alignSelf: 'flex-start',
            height: 30,
            padding: '0 9px',
            borderRadius: 'var(--r-btn)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
            color: 'var(--text2)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Icon name={open ? 'chevron_down' : 'chevron_right'} size={13} />
          {open ? 'Hide' : 'Show'} units
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '9px 10px',
        marginLeft: 28,
        borderLeft: '2px solid var(--border)',
        background: 'var(--card2)',
        borderRadius: 'var(--r-btn)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Icon name="queues" size={12} style={{ color: 'var(--muted)' }} />
        <Link
          to={`/inventory/${encodeURIComponent(unit.assetTag)}`}
          className="identifier"
          style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
        >
          {unit.assetTag}
        </Link>
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          {unit.serialNo === null ? 'No serial on file' : `Serial ${unit.serialNo}`} · Unit {index + 1} of {count}
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
        <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
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
  const tabParam = params.get('tab')
  const isNew = tabParam === 'new'
  const tab = tabFromSlug(tabParam)
  const setTab = useCallback(
    (next: InventoryTab) => {
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
   * rule: flicking chips must not build a back stack. The facet rail stays
   * local state — multi-set facets are a working selection, not an address.
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
  const [facets, setFacets] = useState<Facets>({})
  /* The rail became an overlay — see the drawer below for why. */
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState<SortKey>('Equipment A–Z')
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [density, setDensity] = useState<Density>('comfortable')
  const [rowsPerPage, setRowsPerPage] = useState<number>(25)
  const [page, setPage] = useState(1)
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

  const activeFacetCount = Object.values(facets).reduce((a, s) => a + s.size, 0)
  const filtersOn = activeFacetCount > 0 || chip.kind !== 'all'

  const toggleFacet = (key: FacetKey, value: string) => {
    setFacets((prev) => {
      const next: Facets = { ...prev }
      const set = new Set(prev[key] ?? [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      if (set.size === 0) delete next[key]
      else next[key] = set
      return next
    })
    setPage(1)
  }

  // `setChip` in the deps: it closes over the current search params, and a
  // stale copy would write yesterday's URL back.
  const clearFilters = useCallback(() => {
    setFacets({})
    setChip(EQUIPMENT_CHIPS[0]!)
    setPage(1)
  }, [setChip])

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
  const categoryCounts = useFacetCounts(countRows, query.filters, FACET_COLUMN.Category, PRODUCT_CATEGORIES, filtersOpen)
  const statusCounts = useFacetCounts(countRows, query.filters, FACET_COLUMN.Status, INV_ORDER, filtersOpen)
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
  const listFilters: ListFilters = { ...query.filters, page: { index: page - 1, size: rowsPerPage } }
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
    refetchModels()
    refetchInStock()
    refetchOnRent()
    refetchReserved()
    refetchMaintenance()
    refetchMissing()
  }, [refetchList, refetchModels, refetchInStock, refetchOnRent, refetchReserved, refetchMaintenance, refetchMissing])

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
  const tableColumns = money ? 10 : 9
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
    tab === 'Equipment' ? (
      <>
        <Button icon="refresh" onClick={refreshAll} aria-label="Refresh equipment">
          {phone ? '' : 'Refresh'}
        </Button>
        {!phone && (
          <Unavailable reason="Import is not built — there is no catalogue intake pipeline in this release.">
            <Button icon="upload" disabled>
              Import
            </Button>
          </Unavailable>
        )}
        {/* `Button` takes no `title`, so the scope note sits on a wrapper —
            the file is the PAGE, and the label and the tooltip both say so. */}
        <span
          style={{ display: 'inline-flex' }}
          title={`Exports the ${list.rows.length} models on this page. The list is paged server-side, so the file is the page, not the catalogue.`}
        >
          <Button icon="download" onClick={() => exportCsv(list.rows, money)} aria-label="Export equipment on this page">
            {phone ? '' : 'Export'}
          </Button>
        </span>
        <Button
          icon="search"
          onClick={() => setBarcodeLookupOpen(true)}
          aria-label="Scan or search barcode"
        >
          {phone ? '' : 'Scan Barcode'}
        </Button>
        <Button
          icon="plus"
          variant="primary"
          aria-label="Add Equipment"
          onClick={() => {
            const p = new URLSearchParams(params)
            p.set('tab', 'new')
            setParams(p, { replace: true })
          }}
        >
          {phone ? '' : 'Add Equipment'}
        </Button>
      </>
    ) : null;

  return (
    <PageShell>
      <PageHeader
        title="Inventory"
        description="Find equipment, check availability, and manage stock."
        actions={equipmentActions}
      />
      <WorkspaceLeftPanel>
        <AppSidePanel id="inventory-filters" side="left" title="Filters" isOpen={filtersOpen && tab === 'Equipment' && !isNew} onClose={() => setFiltersOpen(false)}>
          <FilterRail
            facets={facets}
            onToggle={toggleFacet}
            onReset={clearFilters}
            money={money}
            activeCount={activeFacetCount}
            counts={facetCounts}
          />
        </AppSidePanel>
      </WorkspaceLeftPanel>

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
        <Bundles />
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
        <>
          <KpiStrip items={kpis} columns={6} />

          {/*
            §7.1 — `(All)(Available)(On Rent)(Maintenance)(Damaged)(Missing)`.
            Six chips over two dimensions; `EQUIPMENT_CHIPS` holds them and says
            why Damaged is the Condition facet rather than a seventh status.

            §4.3's counted chips are still uncounted chips. A chip is a filter;
            the integer beside it was a fleet-wide `group by status` over
            `product_units_v` that no query returns, and a per-model count in its
            place would over-count every model that has units in two states.

            Chips scroll rather than wrap, matching the tab strip above and the
            tablet/phone drawings ("chips scroll").
          */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div
              className="rsp-chip-scroll"
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                flexWrap: 'nowrap',
                overflowX: 'auto',
                overflowY: 'hidden',
                minWidth: 0,
                flex: 1,
                paddingBottom: 2,
              }}
            >
              {EQUIPMENT_CHIPS.map((c) => {
                const key = chipKey(c)
                const on = chipKey(chip) === key
                const tone =
                  c.kind === 'all'
                    ? 'var(--text2)'
                    : c.kind === 'status'
                      ? INV_DOT[c.status]
                      : /* `CONDITION_INK`, not `STATUS[…].fg`: a `-fg` token is
                           a block's on-colour and painted this chip white on
                           `--card`. See the note on `CONDITION_INK`. */
                        CONDITION_INK[c.condition]
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setChip(c)
                      setPage(1)
                    }}
                    aria-pressed={on}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      flexShrink: 0,
                      minHeight: 44,
                      padding: '0 12px',
                      borderRadius: 'var(--r-sm)',
                      border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                      background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                      color: on ? 'var(--nav-active-accent)' : tone,
                      fontSize: 'var(--t-meta)',
                      fontWeight: on ? 600 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {/* Law 11 — never colour alone. The chips carry an icon as
                        well as the tone, and the Damaged one says which
                        dimension it filters. */}
                    {c.kind === 'status' && <Icon name={INV_STYLE[c.status].icon} size={12} />}
                    {c.kind === 'condition' && <Icon name="eye" size={12} />}
                    {c.label}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={clearFilters}
              disabled={!filtersOn}
              title={filtersOn ? 'Clear the status chip and every filter' : 'No filters are applied'}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid transparent',
                background: 'transparent',
                color: filtersOn ? 'var(--link)' : 'var(--muted)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                cursor: filtersOn ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              <Icon name="refresh" size={13} />
              {phone ? '' : 'Clear Filters'}
            </button>
          </div>

          {/*
            A state chip narrows to models that HAVE a unit in that state, and a
            quantity-tracked SKU has no unit rows at all — so it disappears from
            every state chip. That is a property of the schema (state lives on
            `product_units`), not of the query, and it is said out loud rather
            than left to be discovered as a missing cable.

            The Damaged chip says something different, because it is a different
            dimension: it selects models with a Damaged UNIT, and a model can be
            Damaged and Available at once.
          */}
          {chip.kind !== 'all' && (
            <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              <Icon name="info" size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              {chip.kind === 'condition' ? (
                <>
                  “{chip.label}” is a <strong>condition</strong>, not a status — it filters the Condition facet, so a model can
                  be Damaged and Available at the same time. Quantity- and consumable-tracked SKUs carry no unit rows, so it
                  cannot reach them.
                </>
              ) : (
                <>
                  “{chip.label}” selects models with at least one unit in that state. Quantity- and consumable-tracked SKUs
                  carry no unit rows, so no state chip can reach them.
                </>
              )}
            </p>
          )}

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
            <Card
              title={countedTitle}
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  {/* Sort dropdown */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    <Icon name="chevron_down" size={13} style={{ color: 'var(--muted)' }} />
                    <span style={{ fontWeight: 500 }}>Sort:</span>
                    <select
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value as SortKey)
                        setPage(1)
                      }}
                      aria-label="Sort equipment"
                      style={{
                        height: 32,
                        padding: '0 26px 0 10px',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 500,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                      }}
                    >
                      {SORTS.map((s) => {
                        const blocked = SORT_UNAVAILABLE[s]
                        return (
                          <option key={s} value={s} disabled={Boolean(blocked)} title={blocked}>
                            {blocked ? `${s} — unavailable` : s}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  {/* Density toggle */}
                  <button
                    type="button"
                    onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
                    aria-pressed={density === 'compact'}
                    title={density === 'compact' ? 'Compact rows — click for comfortable' : 'Comfortable rows — click for compact'}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)',
                      background: density === 'compact' ? 'var(--nav-active-bg)' : 'var(--card)',
                      color: density === 'compact' ? 'var(--nav-active-accent)' : 'var(--text2)',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Icon name={density === 'compact' ? 'chevron_up' : 'chevron_down'} size={15} />
                  </button>

                  {/* View layout SegmentedControl */}
                  <SegmentedControl
                    size="sm"
                    ariaLabel="View layout"
                    options={[
                      { id: 'table', label: 'Table', icon: 'checklist' },
                      { id: 'grid', label: 'Cards', icon: 'queues' },
                    ]}
                    value={view}
                    onChange={(v) => setView(v as 'table' | 'grid')}
                  />
                </div>
              }
              bodyStyle={{ padding: 0 }}
            >
              {total !== null && (
                <AppPageToolbar
                  pagination={
                    <Pagination
                      page={page}
                      total={total}
                      pageSize={rowsPerPage}
                      pageSizeOptions={[25, 50, 100]}
                      onPageChange={setPage}
                      onPageSizeChange={setRowsPerPage}
                    />
                  }
                />
              )}
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
                    : filtersOn
                      ? 'Nothing in the catalogue satisfies the status chip and filter rail together.'
                      : 'No equipment has been added to the catalogue yet.'
                }
                {...(filtersOn ? {} : { emptyActionLabel: 'Add Equipment', onEmptyAction: () => navigate('/inventory/new') })}
              >
                {!tabular ? (
                  /* Below 768px the 1060px-wide table is a horizontal scrollbar,
                     not a layout — forced to the card presentation regardless of
                     the `view` toggle (Law 13: capability, not a platform check). */
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {rowsWithIntel.map(({ row: p, glance, detail }) => (
                      <ParentCardView
                        key={p.id}
                        row={p}
                        glance={glance}
                        detail={detail}
                        money={money}
                        checked={selected.has(p.id)}
                        onToggle={() => toggleRow(p.id)}
                      />
                    ))}
                  </div>
                ) : view === 'grid' ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                      gap: 'var(--sp-md)',
                      padding: 'var(--sp-md)',
                    }}
                  >
                    {rowsWithIntel.map(({ row: p, glance, detail }) => (
                      <article key={p.id} style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                        <IntelCard glance={glance} detail={detail} detailTitle={p.name} detailSubtitle={p.category ?? '—'}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <Thumb category={p.category ?? '—'} size={38} />
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
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
                  <DataTableShell ariaLabel="Equipment inventory" style={{ overflowX: 'auto' }}>
                    <table className="operations-table" aria-label="Equipment inventory" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1060 }}>
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
                          {['Stock', 'Status', 'Location', 'Condition'].map((h) => (
                            <th key={h} style={th}>
                              {h}
                            </th>
                          ))}
                          {/* §8.3 — omitted entirely for Warehouse, not blanked.
                              "/ unit" because `products_v.replacement_value` is
                              the SKU's own figure; the mock's parent value was a
                              sum of its children and the schema states no such
                              rule. */}
                          {money && <th style={{ ...th, textAlign: 'right' }}>Replacement / unit (NPR)</th>}
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
                            density={density}
                            columns={tableColumns}
                            checked={selected.has(p.id)}
                            onToggle={() => toggleRow(p.id)}
                            onInspect={setInspectingEquipment}
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

          <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            Status is written by the Status Engine from booking and workspace events. There is no manual status
            control in Inventory — not in a row menu, not in bulk.
          </p>
        </>
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
              <h3 id="equipment-quick-view-stock" style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>Stock</h3>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-2) var(--space-4)', margin: 'var(--space-3) 0 0' }}>
                <dt style={{ color: 'var(--muted)' }}>Availability</dt><dd className="figure" style={{ margin: 0 }}>{stockLabel(inspectingEquipment)}</dd>
                <dt style={{ color: 'var(--muted)' }}>Tracking</dt><dd style={{ margin: 0 }}>{inspectingEquipment.trackingMode}</dd>
                <dt style={{ color: 'var(--muted)' }}>Category</dt><dd style={{ margin: 0 }}>{inspectingEquipment.category ?? '—'}</dd>
              </dl>
            </section>
            <section aria-labelledby="equipment-quick-view-status">
              <h3 id="equipment-quick-view-status" style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>Status breakdown</h3>
              <div style={{ marginTop: 'var(--space-3)' }}><StatusBreakdown breakdown={breakdownOf(inspectingEquipment)} /></div>
            </section>
            {money && (
              <section aria-labelledby="equipment-quick-view-finance">
                <h3 id="equipment-quick-view-finance" style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 600 }}>Replacement value</h3>
                <p className="figure" style={{ margin: 'var(--space-3) 0 0', color: 'var(--text)', fontWeight: 700 }}>{inspectingEquipment.replacementValue === null ? '—' : formatMoney(inspectingEquipment.replacementValue)}</p>
              </section>
            )}
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link
                to={`/inventory/${encodeURIComponent(inspectingEquipment.assetCode)}`}
                style={{ textDecoration: 'none' }}
              >
                <Button
                  variant="primary"
                  size="sm"
                  style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 6 }}
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
                style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 6 }}
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

      <FooterNote extra={['Equipment is retired, never deleted']} />
    </PageShell>
  )
}
