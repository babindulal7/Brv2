import { Fragment, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../../components/ui/Icon'
import type { IconName } from '../../../components/ui/Icon'
import { Card, Button, SummaryRows, cardStyle } from '../../../components/ui/Page'
import { thStyle as th } from '../../../components/ui/TableHeaderCell'
import { ErrorBanner } from '../../../components/ui/StateViews'
import { Donut, Legend } from '../../../components/ui/Charts'
import { STATUS } from '../../../lib/status'
import type { BrandKey } from '../../../lib/status'
import { formatMoney, grouped } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { useTabularLayout } from '../../../lib/device'
import Warehouses from '../../inventory/Warehouses'
import {
  BRANCHES,
  BRANCH_STATUS_TOKEN,
  BRANCH_ALERTS,
  BRANCH_ACTIVITY,
  BRANCH_QUICK_ACTIONS,
  GROUP_FINANCE,
  TRANSFER_STAGES,
  RACKS_NOT_TRACKED,
  STORAGE_VOCABULARY_TODO,
  equipmentSlices,
  totalsOf,
  warehousesOfBranch,
} from '../../../lib/queries/settings'
import type { Branch, BranchStatus, BranchActionKind, Dest } from '../../../lib/queries/settings'
import type { Warehouse } from '../../../lib/queries/warehouses'
import {
  ActivityList,
  DestControl,
  KeyFigures,
  Meter,
  NotBuilt,
  OpenDecision,
  ToneChip,
  controlStyle,
  downloadCsv,
  quickTileStyle,
  td,
  useVisible,
} from './shared'
import type { KpiSpec } from './shared'

/**
 * **Settings ▸ Branches & Warehouses** — §11.3, *the new home for Warehouses*.
 *
 * `07_INVENTORY.md` line 4 moved Warehouse Management out of Inventory and
 * §11.3 named this tab as where it lands. Two surfaces, one tab:
 *
 *  - **Branches & warehouses** — §11.3's own drawing: a branch row that expands
 *    into its warehouses, `branch │ code │ city │ manager │ warehouses` over
 *    `└ warehouse │ code │ racks │ zones`.
 *  - **Warehouse management** — the existing `modules/inventory/Warehouses.tsx`
 *    mounted whole. It is not edited or forked here; the Inventory pass left it
 *    in place deliberately, and `/inventory/warehouses` still resolves (Law 3).
 *    It brings its own header and rail, which is why it is a *view* of this tab
 *    rather than a card inside the branch list.
 *
 * **The seeds did not reconcile, and §11.3 is what forced the issue.**
 * `BRANCHES` declares 2 / 1 / 1 warehouses; `data/warehouse.ts` keyed its four
 * warehouses to a free-text branch *name* that matches no `Branch.name`, giving
 * Head Office one warehouse and inventing a "Bhaktapur" branch. The old guard
 * asserted only the total (4), which passed by coincidence — so this table
 * would have drawn a branch with an empty child list and nothing would have
 * complained. `data/settings.ts` now carries the join keyed on warehouse id and
 * asserts it **per branch**; the two TODO(decision)s it raises are rendered at
 * the foot of this section rather than left in a comment.
 *
 * Rulings §1 keeps the KPI strip and `BranchesRail`: §11.3 draws neither and
 * removes neither in prose. `CONFLICTS.md` §11.7 recommends dropping the strip;
 * the register outranks it, so the conflict is noted and nothing is deleted.
 */

const R = (to: string): Dest => ({ kind: 'route', to })
const N = (why: string): Dest => ({ kind: 'none', why })

const BRANCH_STATUS_ICON: Record<BranchStatus, IconName> = {
  Active: 'check',
  'Under Setup': 'timer',
  Inactive: 'dot',
  Archived: 'dot',
}

function BranchStatusChip({ status }: { status: BranchStatus }) {
  return (
    <ToneChip tone={BRANCH_STATUS_TOKEN[status]} icon={BRANCH_STATUS_ICON[status]}>
      {status}
    </ToneChip>
  )
}

const STATUS_FILTERS: Array<'All' | BranchStatus> = ['All', 'Active', 'Under Setup', 'Inactive', 'Archived']

/**
 * One writer for the branch export, so the header button and the Branch List
 * button cannot drift apart — and so Law 6 is obeyed once: for a money-blind
 * session the Revenue column is never pushed into the header, which means the
 * file has no column to leave blank.
 */
export function branchCsvRows(rows: Branch[], money: boolean): string[][] {
  const header = ['Branch', 'Code', 'Manager', 'City', 'Phone', 'Staff', 'Warehouses', 'Equipment']
  if (money) header.push('Revenue (This Month)')
  header.push('Utilization', 'Status')
  const body = rows.map((b) => {
    const cells = [b.name, b.code, b.manager, b.city, b.phone, String(b.staff), String(b.warehouses), String(b.equipment)]
    if (money) cells.push(formatMoney(b.revenue))
    cells.push(`${b.utilization}%`, b.status)
    return cells
  })
  return [header, ...body]
}

/* ── sorting ───────────────────────────────────────────────────────────── */

type SortKey = 'name' | 'code' | 'city' | 'manager' | 'warehouses' | 'staff' | 'equipment' | 'revenue' | 'utilization' | 'status'

interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

/**
 * A total map, so a sortable header cannot be added without giving it something
 * to sort on. Paisa sorts as the integer it is — never as its formatted string,
 * which would order Rs 8,74,200 above Rs 12,45,300.
 */
const SORT_VALUE: Record<SortKey, (b: Branch) => string | number> = {
  name: (b) => b.name,
  code: (b) => b.code,
  city: (b) => b.city,
  manager: (b) => b.manager,
  warehouses: (b) => b.warehouses,
  staff: (b) => b.staff,
  equipment: (b) => b.equipment,
  revenue: (b) => b.revenue,
  utilization: (b) => b.utilization,
  status: (b) => b.status,
}

function sortBranches(rows: Branch[], sort: SortState | null): Branch[] {
  if (!sort) return rows
  const read = SORT_VALUE[sort.key]
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = read(a)
    const bv = read(b)
    const n =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true })
    return n * dir
  })
}

/**
 * Three states, not two: ascending → descending → **off**, so the seed order the
 * render shows is always one more click away rather than lost for the session.
 */
function nextSort(current: SortState | null, key: SortKey): SortState | null {
  if (current === null || current.key !== key) return { key, dir: 'asc' }
  if (current.dir === 'asc') return { key, dir: 'desc' }
  return null
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  sort: SortState | null
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const on = sort !== null && sort.key === sortKey
  const dir = on && sort !== null ? sort.dir : null

  return (
    <th
      scope="col"
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
      style={{ ...th, padding: 0, textAlign: align }}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={dir === 'asc' ? `Sorted by ${label}, ascending — click for descending` : dir === 'desc' ? `Sorted by ${label}, descending — click to clear` : `Sort by ${label}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
          gap: 'var(--sp-xs)',
          width: '100%',
          minHeight: 34,
          padding: '9px 10px',
          border: 'none',
          background: 'transparent',
          font: 'inherit',
          fontSize: 'var(--t-th)',
          fontWeight: on ? 700 : 600,
          color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <Icon
          name={dir === 'desc' ? 'arrow_down' : dir === 'asc' ? 'arrow_up' : 'chevron_down'}
          size={11}
          style={{ color: on ? 'var(--nav-active-accent)' : 'var(--muted)', opacity: on ? 1 : 0.5, flexShrink: 0 }}
        />
      </button>
    </th>
  )
}

/* ── the §11.3 nested list ─────────────────────────────────────────────── */

/** `└ warehouse │ code │ racks │ zones` — the child row, at table width. */
function WarehouseChildRow({ w, columns, onOpen }: { w: Warehouse; columns: number; onOpen: () => void }) {
  return (
    <tr>
      <td colSpan={columns} style={{ ...td, padding: 0, background: 'var(--card2)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-md)',
            flexWrap: 'wrap',
            padding: '8px 10px 8px 34px',
          }}
        >
          <span aria-hidden style={{ color: 'var(--muted)', marginLeft: -18, marginRight: -6 }}>
            └
          </span>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', minWidth: 180 }}>{w.name}</span>
          <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
            {w.code}
          </span>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Racks <span title={RACKS_NOT_TRACKED}>not tracked yet</span>
          </span>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
            Zones <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>{w.zonesCount}</span>
          </span>
          {/* 28px of paint keeps this inside the warehouse sub-row without
              stretching it; `tap` is what makes the target legal. The label
              carries it past 44 across, so only the short axis inflates, and
              the sub-row is the last thing in its cell — nothing sits under the
              extra 8px but the row's own padding. */}
          <button
            type="button"
            className="tap"
            onClick={onOpen}
            style={{ ...controlStyle, minHeight: 28, padding: '0 9px', fontSize: 'var(--t-th)', marginLeft: 'auto' }}
          >
            <Icon name="box" size={12} />
            Warehouse management
          </button>
        </div>
      </td>
    </tr>
  )
}

/** Phone: *"branch card, warehouses nested beneath, one primary each."* */
function BranchCardRow({
  b,
  money,
  onProfile,
  onOpenWarehouses,
}: {
  b: Branch
  money: boolean
  onProfile: () => void
  onOpenWarehouses: () => void
}) {
  const kids = warehousesOfBranch(b.id)
  return (
    <article style={{ ...cardStyle, padding: 12, display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{b.name}</span>
        <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
          {b.code}
        </span>
        <BranchStatusChip status={b.status} />
      </div>
      <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
        {b.city} · Manager {b.manager}
      </div>
      {money && (
        <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
          {formatMoney(b.revenue)} this month
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        {kids.length === 0 ? (
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>No warehouse under this branch yet.</span>
        ) : (
          kids.map((w) => (
            <span key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
              <span aria-hidden style={{ color: 'var(--muted)' }}>
                └
              </span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{w.name}</span>
              <span className="identifier">{w.code}</span>
              <span style={{ marginLeft: 'auto' }}>
                {w.zonesCount} zones · racks <span title={RACKS_NOT_TRACKED}>not tracked</span>
              </span>
            </span>
          ))
        )}
      </div>

      {/* One primary each, per §11.3's phone note. */}
      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        <Button variant="primary" onClick={onProfile}>
          Branch profile
        </Button>
        <Button onClick={onOpenWarehouses}>Warehouses</Button>
      </div>
    </article>
  )
}

/* ── the pane ──────────────────────────────────────────────────────────── */

type View = 'branches' | 'warehouses'

export function BranchesPane({
  money,
  rows,
  setRows,
  addOpen,
  setAddOpen,
}: {
  money: boolean
  /** Held by the page, not the pane — the rail and the header export read the
      same list, so a branch added this session shows up in all three. */
  rows: Branch[]
  setRows: (next: Branch[]) => void
  addOpen: boolean
  setAddOpen: (v: boolean) => void
}) {
  const tabular = useTabularLayout()
  const [params, setParams] = useSearchParams()
  const viewParam = params.get('view')
  const view: View = viewParam === 'warehouses' ? 'warehouses' : 'branches'
  const setView = (next: View) => {
    const p = new URLSearchParams(params)
    if (next === 'branches') {
      p.delete('view')
    } else {
      p.set('view', next)
    }
    setParams(p, { replace: true })
  }
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'All' | BranchStatus>('All')
  const [sort, setSort] = useState<SortState | null>(null)
  const [perPage, setPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [focused, setFocused] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string[]>(() => BRANCHES.map((b) => b.id))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((b) => {
      if (status !== 'All' && b.status !== status) return false
      if (!q) return true
      return (
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.manager.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.phone.toLowerCase().includes(q) ||
        warehousesOfBranch(b.id).some((w) => w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q))
      )
    })
  }, [rows, query, status])

  const ordered = useMemo(() => sortBranches(filtered, sort), [filtered, sort])
  const t = useMemo(() => totalsOf(filtered), [filtered])
  const slices = useMemo(() => equipmentSlices(), [])
  const pageCount = Math.max(1, Math.ceil(ordered.length / perPage))
  const current = Math.min(page, pageCount)
  const shown = ordered.slice((current - 1) * perPage, current * perPage)

  const onSort = (key: SortKey) => {
    setSort((s) => nextSort(s, key))
    setPage(1)
  }
  const focusedBranch = focused ? rows.find((b) => b.id === focused) : undefined
  const scoped = status !== 'All' || query.trim() !== ''
  const toggle = (id: string) => setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]))

  const kpis: KpiSpec[] = [
    {
      label: 'Total Branches',
      value: String(t.branches),
      icon: 'home',
      accent: 'primary',
      note: scoped ? 'Matching this filter' : 'All branches',
      linkLabel: 'View all',
      onAction: () => {
        setStatus('All')
        setQuery('')
        setPage(1)
      },
    },
    {
      label: 'Active Branches',
      value: String(t.activeBranches),
      icon: 'check',
      accent: 'success',
      note: `${t.branches === 0 ? 0 : Math.round((t.activeBranches / t.branches) * 100)}% active`,
      linkLabel: 'View active',
      onAction: () => {
        setStatus('Active')
        setPage(1)
      },
    },
    {
      label: 'Warehouses',
      value: String(t.warehouses),
      icon: 'box',
      accent: 'primary',
      note: 'Across the selection',
      linkLabel: 'Warehouse management',
      onAction: () => setView('warehouses'),
    },
    {
      label: 'Active Staff',
      value: String(t.staff),
      icon: 'users',
      accent: 'progress',
      note: 'Across the selection',
      linkLabel: 'View staff',
      dest: R('/crew'),
    },
  ]

  /*
   * Law 6 — money is STRUCTURALLY ABSENT for Warehouse, Technician, Driver and
   * Client. The two money tiles are never pushed into the array, the Revenue
   * column never enters the header, and the Branch Performance card is not
   * rendered at all. Nothing is masked, blurred or dashed.
   */
  if (money) {
    kpis.push(
      {
        label: 'Equipment Value',
        value: formatMoney(GROUP_FINANCE.equipmentValue),
        icon: 'package',
        accent: 'primary',
        note: 'Total book value, all branches',
        linkLabel: 'View details',
        dest: R('/inventory'),
      },
      {
        label: 'Monthly Revenue',
        value: formatMoney(t.revenue),
        icon: 'dollar',
        accent: 'success',
        note: 'vs last month',
        linkLabel: 'View report',
        dest: R('/reports/pulse'),
        delta: { direction: t.growthPercent >= 0 ? 'up' : 'down', text: `${Math.abs(t.growthPercent).toFixed(1)}%` },
      },
    )
  }

  /** Exports what the table is actually showing — this filter, this sort order. */
  const exportCsv = () => downloadCsv('babin-branches.csv', branchCsvRows(ordered, money))

  const addBranch = (b: Branch) => {
    setRows([...rows, b])
    setAddOpen(false)
    setFocused(null)
    setStatus('All')
    setQuery('')
    setSort(null)
    setExpanded((e) => [...e, b.id])
    setPage(Math.ceil((rows.length + 1) / perPage))
  }

  const columns = money ? 8 : 7

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      {/* Two surfaces of one tab, so the mounted Warehouse Management screen —
          which carries its own page header and rail — never renders inside the
          branch list. */}
      <div role="tablist" aria-label="Branches and warehouses" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(
          [
            { key: 'branches' as const, label: 'Branches & warehouses', icon: 'home' as IconName },
            { key: 'warehouses' as const, label: 'Warehouse management', icon: 'box' as IconName },
          ]
        ).map((v) => {
          const on = view === v.key
          return (
            /* Grown rather than coated. The tablist wraps, and once it does the
               two tabs stack 6px apart — at the old 34px paint that is a pitch
               of 40, so two 44px pseudo-elements would have overlapped in a 4px
               band and the later tab in the DOM would have won presses along it.
               There is no density argument for keeping these small either: they
               are the pane's top-level view switch with a whole row to
               themselves, which is precisely the button §5 says should be 44 in
               the first place. */
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(v.key)}
              style={{
                ...controlStyle,
                minHeight: 'var(--tap)',
                borderColor: on ? 'var(--nav-active-accent)' : 'var(--border)',
                background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
              }}
            >
              <Icon name={v.icon} size={13} />
              {v.label}
            </button>
          )
        })}
      </div>

      {view === 'warehouses' ? (
        <>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.55 }}>
            Warehouse Management moved out of Inventory into this tab (`07_INVENTORY.md` line 4, §11.3). This is the same
            screen, mounted here unchanged —{' '}
            <Link to="/inventory/warehouses" style={{ color: 'var(--link)', fontWeight: 600 }}>
              /inventory/warehouses
            </Link>{' '}
            still resolves, because nothing is deleted.
          </p>
          <Warehouses />
        </>
      ) : (
        <>
          <KeyFigures kpis={kpis} />

          {/* Branch cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--sp-md)' }}>
            {rows.map((b) => (
              <article key={b.id} style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'flex-start' }}>
                  {/* The render puts a storefront photograph here; no image asset exists. */}
                  <span
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 10,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'var(--card2)',
                      border: '1px solid var(--border)',
                      color: 'var(--nav-active-accent)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="home" size={24} fill />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{b.name}</span>
                      <BranchStatusChip status={b.status} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                      <span
                        className="identifier"
                        style={{
                          fontSize: 'var(--t-th)',
                          fontWeight: 700,
                          color: 'var(--nav-active-accent)',
                          background: 'var(--nav-active-bg)',
                          borderRadius: 'var(--r-badge)',
                          padding: '1px 7px',
                        }}
                      >
                        {b.code}
                      </span>
                      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Manager · {b.manager}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                      <Icon name="home" size={12} style={{ color: 'var(--muted)' }} />
                      {b.address}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                      <Icon name="phone" size={12} style={{ color: 'var(--muted)' }} />
                      {b.phone}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: money ? 'repeat(4, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))',
                    gap: 'var(--sp-sm)',
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <Stat icon="box" label="Warehouses" value={String(b.warehouses)} />
                  <Stat icon="users" label="Staff" value={String(b.staff)} />
                  <Stat icon="package" label="Equipment" value={grouped(b.equipment)} />
                  {money && <Stat icon="dollar" label="Revenue (This Month)" value={formatMoney(b.revenue)} />}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', flexShrink: 0 }}>Utilization</span>
                  <span style={{ flex: 1, minWidth: 40 }}>
                    <Meter percent={b.utilization} />
                  </span>
                  <span className="figure" style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text)' }}>
                    {b.utilization}%
                  </span>
                </div>

                {/* The card's one action, full width and last in the card, so
                    it can simply be 44 — no pseudo-element needed and nothing
                    below it to overlap. This is the phone/tablet path (tables
                    become card rows under 768), which is exactly where a thumb
                    is doing the pressing. */}
                <button
                  type="button"
                  onClick={() => {
                    setFocused(b.id)
                    setPage(1)
                  }}
                  style={{ ...controlStyle, width: '100%', justifyContent: 'center', minHeight: 'var(--tap)', background: 'var(--card2)' }}
                >
                  View Branch Profile
                  <Icon name="arrow_right" size={13} />
                </button>
              </article>
            ))}
          </div>

          {/* Branch profile — partial, and says so */}
          {focusedBranch && (
            <Card
              title={`Branch Profile — ${focusedBranch.name}`}
              action={
                /* A card-header action: 28px so it sits inside the header band
                   rather than inflating it, `tap` so the way out of the branch
                   profile is not a 28px strip. The header is 52px tall and this
                   is the only control in it, so the 44px target lands entirely
                   inside the header. */
                <button
                  type="button"
                  className="tap"
                  onClick={() => setFocused(null)}
                  style={{ ...controlStyle, minHeight: 28, fontSize: 'var(--t-th)' }}
                >
                  <Icon name="chevron_left" size={12} />
                  Back to all branches
                </button>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 'var(--sp-md)' }}>
                <SummaryRows
                  rows={[
                    { label: 'Branch code', value: focusedBranch.code },
                    { label: 'Status', value: focusedBranch.status },
                    { label: 'Manager', value: focusedBranch.manager },
                    { label: 'City', value: focusedBranch.city },
                    { label: 'Address', value: focusedBranch.address },
                    { label: 'Phone', value: focusedBranch.phone },
                  ]}
                />
                <SummaryRows
                  rows={[
                    { label: 'Warehouses', value: String(focusedBranch.warehouses) },
                    { label: 'Staff', value: String(focusedBranch.staff) },
                    { label: 'Equipment', value: grouped(focusedBranch.equipment) },
                    { label: 'Utilization', value: `${focusedBranch.utilization}%` },
                    ...(money
                      ? [
                          { label: 'Revenue (This Month)', value: formatMoney(focusedBranch.revenue), tone: 'success' as BrandKey },
                          {
                            label: 'Growth vs last month',
                            value: `${focusedBranch.growthPercent >= 0 ? '+' : ''}${focusedBranch.growthPercent}%`,
                            tone: (focusedBranch.growthPercent >= 0 ? 'success' : 'danger') as BrandKey,
                          },
                        ]
                      : []),
                  ]}
                />
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.55 }}>
                  This is every field the branch record holds. The rest of the profile in the spec — province and ward, GPS,
                  company registration and branch licence, the warehouse and staff rosters, financial summary, documents and
                  audit history — has no data behind it in this build, so it is not shown rather than shown empty.
                </p>
              </div>
            </Card>
          )}

          {/* §11.3 — branch │ code │ city │ manager │ warehouses, expanding into
              └ warehouse │ code │ racks │ zones */}
          <Card
            title="Branches & warehouses"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="search" size={13} style={{ color: 'var(--muted)' }} />
                  <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    Search branch or warehouse
                  </span>
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Search branch, code, manager, city, warehouse…"
                    style={{
                      minHeight: 30,
                      width: 236,
                      padding: '0 9px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                      fontFamily: 'inherit',
                    }}
                  />
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as 'All' | BranchStatus)
                    setPage(1)
                  }}
                  aria-label="Filter by status"
                  style={{
                    minHeight: 30,
                    padding: '0 8px',
                    borderRadius: 'var(--r-input)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontFamily: 'inherit',
                  }}
                >
                  {STATUS_FILTERS.map((s) => (
                    <option key={s} value={s}>
                      {s === 'All' ? 'All status' : s}
                    </option>
                  ))}
                </select>
                {/* 30px to line up with the search box and status select it
                    shares the header band with — a button standing 14px taller
                    than the two filters beside it would read as a different
                    class of control. `tap` for the rest. It is wider than 44,
                    so the target grows only up and down, never the 8px across
                    into the status select. Note the band wraps below ~768: once
                    it does, the three sit 8px apart in a column and the 44px
                    target clears the select above by exactly 1px — it holds,
                    but it is the seam to re-measure if either filter is ever
                    given a target of its own. */}
                <button
                  type="button"
                  className="tap"
                  onClick={exportCsv}
                  style={{ ...controlStyle, minHeight: 30, fontSize: 'var(--t-th)' }}
                >
                  <Icon name="download" size={12} />
                  Export CSV
                </button>
              </div>
            }
          >
            {/* Shell rule — "tables become card rows below 768". */}
            {!tabular ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {shown.map((b) => (
                  <BranchCardRow
                    key={b.id}
                    b={b}
                    money={money}
                    onProfile={() => setFocused(b.id)}
                    onOpenWarehouses={() => setView('warehouses')}
                  />
                ))}
                {shown.length === 0 && (
                  <p style={{ margin: 0, padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>
                    No branch matches this search.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th scope="col" style={{ ...th, width: 34 }}>
                        <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                          Expand warehouses
                        </span>
                      </th>
                      <SortHeader label="Branch" sortKey="name" sort={sort} onSort={onSort} />
                      <SortHeader label="Code" sortKey="code" sort={sort} onSort={onSort} />
                      <SortHeader label="City" sortKey="city" sort={sort} onSort={onSort} />
                      <SortHeader label="Manager" sortKey="manager" sort={sort} onSort={onSort} />
                      <SortHeader label="Warehouses" sortKey="warehouses" sort={sort} onSort={onSort} align="right" />
                      {/* Law 6 — the column is absent for a money-blind session,
                          so its sort key is unreachable rather than disabled. */}
                      {money && <SortHeader label="Revenue (This Month)" sortKey="revenue" sort={sort} onSort={onSort} align="right" />}
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((b) => {
                      const kids = warehousesOfBranch(b.id)
                      const open = expanded.includes(b.id)
                      return (
                        <Fragment key={b.id}>
                          <tr>
                            <td style={{ ...td, padding: '0 0 0 4px' }}>
                              {/* 26x26 was the whole target — a third of the
                                  required area on the control that opens a
                                  branch's warehouses. It stays 26 on screen
                                  because a 44px disclosure glyph would set the
                                  width of the first column and push every row
                                  sideways; `tap` grows BOTH axes here, since
                                  unlike the labelled buttons this one is square
                                  and under 44 in each direction.

                                  ⚠ These rows pitch at about 39px, short of the
                                  §7.3 "rows >= 56" floor, so this target and the
                                  one in the row below overlap in a band of
                                  roughly 5px and the lower row wins it. Raising
                                  the row height is the fix and it belongs to
                                  `td`, which several screens share — flagged
                                  rather than forced from inside this file. */}
                              {/*
                                No `className="tap"` here, deliberately.

                                It WAS applied, and an adversarial check showed
                                the ::after being clipped: the table sits in a
                                `<div style={{ overflowX: 'auto' }}>` (line
                                ~797), and a non-visible `overflow-x` makes
                                `overflow-y` compute to `auto` too — a real
                                scroll container that clips on both axes. With
                                the first `td` at `padding: '0 0 0 4px'`, the
                                26px button sits 4px inside the scrollport edge,
                                so the 44px pseudo-element lost 5px off its left
                                and the true target measured 39x44.

                                A pseudo-element cannot escape a scrollport, so
                                the box grows instead. `minWidth`/`minHeight`
                                are real layout, which the container cannot clip.
                              */}
                              <button
                                type="button"
                                onClick={() => toggle(b.id)}
                                aria-expanded={open}
                                aria-label={`${open ? 'Collapse' : 'Expand'} the warehouses under ${b.name}`}
                                style={{
                                  ...controlStyle,
                                  // Real layout, not a pseudo-element — see the
                                  // note above. The scrollport clips ::after but
                                  // cannot clip the box itself.
                                  minHeight: 'var(--tap)',
                                  minWidth: 'var(--tap)',
                                  width: 'var(--tap)',
                                  padding: 0,
                                  justifyContent: 'center',
                                  border: 'none',
                                  background: 'transparent',
                                }}
                              >
                                <Icon name={open ? 'chevron_down' : 'chevron_right'} size={14} style={{ color: 'var(--muted)' }} />
                              </button>
                            </td>
                            <td style={{ ...td, fontWeight: 600 }}>{b.name}</td>
                            <td style={td}>
                              <span className="identifier" style={{ color: 'var(--text2)' }}>
                                {b.code}
                              </span>
                            </td>
                            <td style={td}>{b.city}</td>
                            <td style={td}>{b.manager}</td>
                            <td style={{ ...td, textAlign: 'right' }} className="figure">
                              {kids.length}
                            </td>
                            {money && (
                              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} className="figure">
                                {formatMoney(b.revenue)}
                              </td>
                            )}
                            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {/* §11.3 draws a `⋮`. One built action does not
                                  need a menu, and a menu of unbuilt rows would
                                  be four dead controls. */}
                              {/* Same trade as the disclosure glyph: the paint
                                  stays 28 so the row does not grow, `tap` makes
                                  the target legal, and the label keeps it past
                                  44 across so only the short axis moves. Same
                                  row-pitch caveat too — until rows reach 56,
                                  this target and the Profile button one row
                                  down share a ~5px band. */}
                              <button
                                type="button"
                                className="tap"
                                onClick={() => {
                                  setFocused(b.id)
                                  setPage(1)
                                }}
                                title={`Open the ${b.name} profile`}
                                style={{ ...controlStyle, minHeight: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}
                              >
                                <Icon name="eye" size={12} />
                                Profile
                              </button>
                            </td>
                          </tr>
                          {open && kids.length === 0 && (
                            <tr>
                              <td colSpan={columns} style={{ ...td, background: 'var(--card2)', color: 'var(--muted)', paddingLeft: 34 }}>
                                No warehouse joins this branch yet.
                              </td>
                            </tr>
                          )}
                          {open &&
                            kids.map((w) => (
                              <WarehouseChildRow key={w.id} w={w} columns={columns} onOpen={() => setView('warehouses')} />
                            ))}
                        </Fragment>
                      )
                    })}
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={columns} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: '28px 10px' }}>
                          No branch matches this search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', flexWrap: 'wrap', marginTop: 'var(--sp-md)' }}>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                Showing {filtered.length === 0 ? 0 : (current - 1) * perPage + 1} to {Math.min(current * perPage, filtered.length)} of{' '}
                {filtered.length} branches
              </span>
              <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                Rows per page
                <select
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value))
                    setPage(1)
                  }}
                  style={{
                    minHeight: 28,
                    padding: '0 6px',
                    borderRadius: 'var(--r-input)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontFamily: 'inherit',
                  }}
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {/* The pagination pair is the case §5 wrote the exception for:
                    28x28 arrows in a dense strip, kept compact on screen and
                    given their 44 underneath. Square and under 44 both ways, so
                    `tap` inflates both axes — 8px of reach on each side. That
                    is checked against its neighbours rather than assumed: the
                    "Rows per page" select sits 12px away and the two arrows are
                    84px apart centre to centre with the page count between
                    them, so nothing overlaps. */}
                <button
                  type="button"
                  className="tap"
                  onClick={() => setPage(current - 1)}
                  disabled={current === 1}
                  aria-label="Previous page"
                  style={{ ...controlStyle, minHeight: 28, width: 28, padding: 0, justifyContent: 'center', opacity: current === 1 ? 0.45 : 1 }}
                >
                  <Icon name="chevron_left" size={13} />
                </button>
                <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600, minWidth: 46, textAlign: 'center' }}>
                  {current} / {pageCount}
                </span>
                <button
                  type="button"
                  className="tap"
                  onClick={() => setPage(current + 1)}
                  disabled={current === pageCount}
                  aria-label="Next page"
                  style={{ ...controlStyle, minHeight: 28, width: 28, padding: 0, justifyContent: 'center', opacity: current === pageCount ? 0.45 : 1 }}
                >
                  <Icon name="chevron_right" size={13} />
                </button>
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'var(--sp-md)', paddingTop: 'var(--sp-sm)', borderTop: '1px solid var(--border)' }}>
              <OpenDecision text={STORAGE_VOCABULARY_TODO} />
              <OpenDecision text="TODO(decision) — Rulings §9.12: is “Bhaktapur Heavy Grip & Rigging” a fourth BRANCH or a fourth WAREHOUSE of an existing one? It joins to Head Office here because that is the only assignment under which the branch records’ own declared counts (2 / 1 / 1) reconcile. If it is really a fourth branch, every group total on this tab moves with it." />
            </div>
          </Card>

          {/* Analytics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(272px, 1fr))', gap: 'var(--sp-md)' }}>
            <Card title="Equipment Summary" action={<span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>All branches</span>}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <Donut
                  slices={slices}
                  centreLabel="Total"
                  centreValue={`${grouped(slices.reduce((s, x) => s + x.value, 0))} items`}
                  size={142}
                />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <Legend slices={slices} />
                </div>
              </div>
            </Card>

            <Card title="Inventory Transfers">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {TRANSFER_STAGES.map((s) => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <ToneChip tone={s.tone} icon={s.icon}>
                      {s.label}
                    </ToneChip>
                    <span className="figure" style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                      {s.count}
                    </span>
                  </div>
                ))}
                {/* Last thing in the card, under a list of transfer counts that
                    are text and chips rather than controls, so the 6px this
                    target reaches upward crosses nothing clickable. `tap` and
                    not a taller box only because `controlStyle`'s 32 is what
                    every other "see the rest of this" link on the page paints
                    at, and one of them standing 44 tall would look like the
                    card's primary action. */}
                <button
                  type="button"
                  className="tap"
                  onClick={() => setView('warehouses')}
                  style={{ ...controlStyle, justifyContent: 'center', marginTop: 'var(--sp-xs)' }}
                >
                  View all transfers
                  <Icon name="arrow_right" size={13} />
                </button>
              </div>
            </Card>

            {/* Law 6 — Revenue and revenue growth are the whole card, so a
                money-blind session does not get an emptied version of it. */}
            {money && (
              <Card title="Branch Performance" action={<span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>This month</span>}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th scope="col" style={th}>Branch</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Revenue</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Utilization</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Growth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => (
                      <tr key={b.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{b.name}</td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} className="figure">
                          {formatMoney(b.revenue)}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }} className="figure">
                          {b.utilization}%
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontWeight: 700,
                              fontSize: 'var(--t-th)',
                              color: b.growthPercent >= 0 ? 'var(--success-text)' : 'var(--danger-text)',
                            }}
                          >
                            <Icon name={b.growthPercent >= 0 ? 'arrow_up' : 'arrow_down'} size={11} fill />
                            {Math.abs(b.growthPercent)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {/*
              The fourth analytics card was **AI Branch Insights** — four
              hand-written sentences under a title claiming a model wrote them,
              plus an "Ask the assistant" link. Deleted per PLAN.md Law 16 and
              Rulings §7. `data/warehouse.ts:insightsOf()` is the shape to copy
              if branch observations are wanted back: rules over the rows,
              re-runnable by hand, titled as what they are.
            */}
          </div>
        </>
      )}

      {addOpen && <AddBranchModal existing={rows} onClose={() => setAddOpen(false)} onAdd={addBranch} />}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        <Icon name={icon} size={11} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div
        className="figure"
        style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginTop: 2, whiteSpace: 'nowrap' }}
      >
        {value}
      </div>
    </div>
  )
}

/* ── Add Branch ────────────────────────────────────────────────────────── */

/**
 * A real control, not a decorative one. It writes to session state exactly as
 * `Warehouses.tsx` does for a stock transfer — every KPI, the table, the
 * pagination footer and the CSV recompute from it. A new branch opens with
 * nothing in it: zero warehouses, zero staff, zero equipment, Rs 0 and 0%
 * utilisation, in `Under Setup`. Seeding it with figures nobody supplied would
 * be inventing a product decision.
 */
function AddBranchModal({
  existing,
  onClose,
  onAdd,
}: {
  existing: Branch[]
  onClose: () => void
  onAdd: (b: Branch) => void
}) {
  const nextCode = useMemo(() => {
    const max = existing.reduce((m, b) => Math.max(m, Number(b.code.replace(/\D/g, '')) || 0), 0)
    return `BR${String(max + 1).padStart(3, '0')}`
  }, [existing])

  const [name, setName] = useState('')
  const [code, setCode] = useState(nextCode)
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [manager, setManager] = useState('')
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)

  const errors: string[] = []
  if (!name.trim()) errors.push('Branch name is required.')
  /* `BR` is the BRANCH token in `data/numbering.ts:210` and belongs to nothing
     else — the booking, client, invoice, quote, bundle and membership prefixes
     are issued from the registry and never typed. */
  if (!/^BR\d{3}$/.test(code)) errors.push('Branch code must be BR followed by three digits, e.g. BR004.')
  else if (existing.some((b) => b.code === code)) errors.push(`${code} is already in use.`)
  if (!city.trim()) errors.push('City is required.')
  if (!manager.trim()) errors.push('A branch manager is required.')

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
      <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        /* Law 15 — the law is the hit area and `--tap` is the token. One field
           per line in the Add Branch form, so it just grows. */
        style={{
          minHeight: 'var(--tap)',
          padding: '0 9px',
          borderRadius: 'var(--r-input)',
          border: '1px solid var(--input-border)',
          background: 'var(--input-bg)',
          color: 'var(--text)',
          fontSize: 'var(--t-meta)',
          fontFamily: 'inherit',
        }}
      />
    </label>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add branch"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 9000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, width: 520, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', boxShadow: 'var(--shadow-modal)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Add Branch</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {field('Branch name', name, setName, 'Biratnagar Branch')}
          {field('Branch code', code, setCode, nextCode)}
          {field('City', city, setCity, 'Biratnagar')}
          {field('Address', address, setAddress, 'Main Road, Biratnagar')}
          {field('Branch manager', manager, setManager, 'Full name')}
          {field('Phone', phone, setPhone, '+977 …')}
        </div>

        {touched && errors.length > 0 && (
          <div style={{ padding: '0 14px 10px' }}>
            <ErrorBanner
              message={
                <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              }
            />
          </div>
        )}

        <p style={{ margin: 0, padding: '0 14px 12px', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          The branch opens in <strong style={{ color: 'var(--text2)' }}>Under Setup</strong> with no warehouses, staff, equipment
          or revenue — those arrive as it is stocked. It is held for this session only; no backend is connected.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)', padding: '0 14px 14px' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              setTouched(true)
              if (errors.length > 0) return
              onAdd({
                id: `br-${code.toLowerCase()}`,
                code,
                name: name.trim(),
                city: city.trim(),
                address: address.trim() || city.trim(),
                manager: manager.trim(),
                phone: phone.trim() || '—',
                warehouses: 0,
                staff: 0,
                equipment: 0,
                revenue: 0 as Paisa,
                utilization: 0,
                growthPercent: 0,
                status: 'Under Setup',
              })
            }}
          >
            Add branch
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── rail ──────────────────────────────────────────────────────────────── */

export function BranchesRail({
  money,
  branches,
  onAdd,
  onExport,
}: {
  money: boolean
  branches: Branch[]
  onAdd: () => void
  onExport: () => void
}) {
  const t = totalsOf(branches)
  const alerts = useVisible(BRANCH_ALERTS)
  const rows: Array<{ label: string; value: string; tone?: BrandKey }> = []
  if (money) {
    rows.push(
      { label: 'Monthly Revenue', value: formatMoney(t.revenue), tone: 'success' },
      { label: 'Monthly Profit', value: formatMoney(GROUP_FINANCE.monthlyProfit), tone: 'success' },
      { label: 'Equipment Value', value: formatMoney(GROUP_FINANCE.equipmentValue) },
    )
  }
  rows.push(
    { label: 'Active Staff', value: String(t.staff) },
    { label: 'Warehouses', value: String(t.warehouses) },
    { label: 'Average Utilization', value: `${t.utilization}%` },
  )

  /*
   * Total by construction: every kind either has a handler here or a `dest` in
   * the data file, and the branch below covers both — so a tile cannot be added
   * that renders as a live control and does nothing.
   */
  const handlers: Record<BranchActionKind, (() => void) | null> = {
    'add-branch': onAdd,
    'transfer-equipment': null,
    'export-report': onExport,
    'print-labels': null,
  }

  return (
    <>
      <Card title="Branch Summary" action={<span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>All branches</span>}>
        <SummaryRows rows={rows} />
      </Card>

      <Card title="Alerts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((a) => (
            <DestControl
              key={a.label}
              dest={a.dest}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                width: '100%',
                minHeight: 32,
                padding: '7px 9px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontWeight: 500,
                fontFamily: 'inherit',
                textAlign: 'left',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon name={a.icon} size={14} style={{ color: STATUS[a.tone].fg, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{a.label}</span>
              <span className="figure" style={{ fontWeight: 700, color: STATUS[a.tone].fg }}>
                {a.count}
              </span>
            </DestControl>
          ))}
          {/* ⚠ The tightest seam in this file. The alert rows above stack 6px
              apart with `marginTop: 2` under the last one, so this target's 6px
              of upward reach stops 2px short of the alert box — it clears, but
              only just. The alert rows are 32px tall themselves and are still
              short of Law 15; whoever gives them their target must open this gap
              first, or the two will start trading clicks. Their style is a local
              object rather than `controlStyle`, which is why they are not fixed
              in this pass. */}
          <Link to="/operations" className="tap" style={{ ...controlStyle, justifyContent: 'center', width: '100%', marginTop: 2 }}>
            View all alerts
            <Icon name="arrow_right" size={13} />
          </Link>
        </div>
      </Card>

      <Card title="Quick Actions">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-sm)' }}>
          {BRANCH_QUICK_ACTIONS.map((a) => {
            const run = handlers[a.kind]
            const glyph = <Icon name={a.icon} size={18} style={{ color: 'var(--nav-active-accent)' }} />
            const label = <span style={{ lineHeight: 1.25 }}>{a.label}</span>

            if (run) {
              return (
                <button key={a.kind} type="button" onClick={run} style={quickTileStyle}>
                  {glyph}
                  {label}
                </button>
              )
            }
            const dest: Dest = a.dest ?? N(`${a.label} has no destination in this build.`)
            return (
              <DestControl key={a.kind} dest={dest} style={quickTileStyle}>
                {glyph}
                {label}
                {dest.kind === 'none' && <NotBuilt why={dest.why} />}
              </DestControl>
            )
          })}
        </div>
      </Card>

      <Card title="Recent Activity">
        <ActivityList entries={BRANCH_ACTIVITY} moreDest={R('/admin/audit')} />
      </Card>
    </>
  )
}
