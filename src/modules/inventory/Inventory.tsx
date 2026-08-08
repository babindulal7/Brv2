import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { STATUS } from '../../lib/status'
import { formatMoney, grouped } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { Bundles } from './Bundles'
import { Maintenance } from './Maintenance'
import { SubRental } from '../operations/SubRental'
import { CasesWorkspace } from '../operations/CasesWorkspace'
import {
  TABS,
  CHIP_COUNTS,
  KPIS,
  PARENTS,
  INV_STYLE,
  INV_DOT,
  CONDITION_TONE,
  CATEGORY_ICON,
  FILTER_RAIL,
  SORTS,
  ROWS_PER_PAGE_OPTIONS,
  facetValuesOf,
  statusesOf,
  unitCountOf,
  attentionScore,
} from '../../data/inventory'
import type { InvStatus, ParentRow, ChildRow, Condition, FacetKey, SortKey } from '../../data/inventory'

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

const selectStyle = {
  height: 32,
  padding: '0 8px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

/* ── small pieces ──────────────────────────────────────────────────────── */

/**
 * Status badge. Every status carries its own icon as well as its colour —
 * §4.2 notes three statuses share the amber token, so the icon and label are
 * what separate them. Never colour alone.
 */
function StatusBadge({ status }: { status: InvStatus }) {
  const s = INV_STYLE[status]
  const outlined = s.bg === 'transparent'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 21,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: s.bg,
        color: s.fg,
        border: outlined ? `1px solid ${s.fg}` : '1px solid transparent',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={s.icon} size={11} />
      {status}
    </span>
  )
}

/** The mockup badges Condition. Tones come from `CONDITION_TONE` — see its note. */
function ConditionBadge({ condition }: { condition: Condition }) {
  const c = STATUS[CONDITION_TONE[condition]]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 8px',
        borderRadius: 6,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border ?? 'transparent'}`,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {condition}
    </span>
  )
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
function StatusBreakdown({ row }: { row: ParentRow }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {row.breakdown.map((b) => (
        <span key={b.status} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span
            aria-hidden
            style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: INV_DOT[b.status] }}
          />
          <span className="figure" style={{ color: INV_DOT[b.status], fontWeight: 600 }}>
            {b.count}
          </span>
          <span style={{ color: 'var(--text2)' }}>{b.status}</span>
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

/**
 * A control the mockup shows but this build cannot honour. Rendered visibly
 * inert with the reason on it, rather than as an `onClick={() => {}}`.
 */
function Unavailable({ children, reason }: { children: ReactNode; reason: string }) {
  return (
    <span title={reason} aria-label={reason} style={{ display: 'inline-flex', cursor: 'not-allowed' }}>
      {children}
    </span>
  )
}

/* ── rows ──────────────────────────────────────────────────────────────── */

function ChildRowView({
  row,
  child,
  index,
  money,
  density,
}: {
  row: ParentRow
  child: ChildRow
  index: number
  money: boolean
  density: Density
}) {
  const td = tdFor(density)
  const units = row.children?.length ?? 0
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={td} />
      <td style={td} />
      <td style={{ ...td, paddingLeft: 22 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Thumb category={row.category} size={26} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="queues" size={12} style={{ color: 'var(--muted)' }} />
              <span className="identifier" style={{ fontSize: 'var(--t-meta)' }}>
                {child.serial}
              </span>
            </span>
            {/*
              The mockup puts a "1 / 3" unit index in the Stock column. §5.3
              keeps that cell empty on a unit row, because a fraction under a
              *Stock* heading reads as availability — "1 of 3 available" — which
              is not what it means. Same information, stated where it cannot be
              misread.
            */}
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Unit {index + 1} of {units}
            </span>
          </span>
        </span>
      </td>
      <td style={{ ...td, color: 'var(--muted)' }}>{row.category}</td>
      <td style={td} />
      <td style={td}>
        <StatusBadge status={child.status} />
      </td>
      <td style={td}>
        {child.booking === '—' ? (
          <span style={{ color: 'var(--muted)' }}>—</span>
        ) : (
          <Link
            to={`/rentals/${child.booking}`}
            className="figure"
            style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--t-meta)' }}
          >
            {child.booking}
          </Link>
        )}
      </td>
      <td style={{ ...td, color: 'var(--text2)', whiteSpace: 'normal', minWidth: 150 }}>{child.location}</td>
      <td style={td}>
        <ConditionBadge condition={child.condition} />
      </td>
      {money && (
        <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>
          {formatMoney(child.replacement)}
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

function ParentRowView({
  row,
  money,
  density,
  checked,
  onToggle,
}: {
  row: ParentRow
  money: boolean
  density: Density
  checked: boolean
  onToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  const td = tdFor(density)
  const serialised = Boolean(row.children?.length)

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
          <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Thumb category={row.category} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{row.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <CategoryChip category={row.category} />
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
                    }}
                  >
                    NON-SERIALISED
                  </span>
                )}
              </span>
            </span>
          </span>
        </td>
        <td style={{ ...td, color: 'var(--text2)' }}>{row.category}</td>
        <td className="figure" style={td}>
          {row.stock}
        </td>
        {/* §3.1 — the parent never carries a single status badge. */}
        <td style={{ ...td, minWidth: 170 }}>
          <StatusBreakdown row={row} />
        </td>
        <td style={{ ...td, color: 'var(--text2)' }}>{row.bookings}</td>
        <td style={{ ...td, color: row.location === 'Mixed' ? 'var(--muted)' : 'var(--text2)' }}>{row.location}</td>
        <td style={td}>
          <ConditionBadge condition={row.condition} />
        </td>
        {money && (
          <td className="figure" style={{ ...td, fontWeight: 600, textAlign: 'right' }}>
            {formatMoney(row.replacement)}
          </td>
        )}
        <td style={{ ...td, width: 30, color: 'var(--muted)' }}>
          <Unavailable reason="Row actions are not built — no row action in §7.1 has a screen yet, and §4.1 rules out the status edit outright.">
            <Icon name="more_vert" size={14} />
          </Unavailable>
        </td>
      </tr>

      {open &&
        row.children?.map((c, i) => (
          <ChildRowView key={c.serial} row={row} child={c} index={i} money={money} density={density} />
        ))}
    </>
  )
}

/* ── filter rail ───────────────────────────────────────────────────────── */

type Facets = Partial<Record<FacetKey, Set<string>>>

function FilterRail({
  facets,
  onToggle,
  onReset,
  money,
  activeCount,
}: {
  facets: Facets
  onToggle: (key: FacetKey, value: string) => void
  onReset: () => void
  money: boolean
  activeCount: number
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(['Category', 'Status']))
  const toggleGroup = (label: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })

  const rowBase = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    height: 34,
    padding: '0 4px',
    border: 'none',
    background: 'transparent',
    fontSize: 'var(--t-meta)',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
  }

  return (
    <Card bodyStyle={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--disabled)' }}>no data</span>
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
                    borderRadius: 999,
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
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <p style={{ margin: '8px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
        Greyed filters need catalogue fields this build does not store yet — hover one for the reason.
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
 */
function exportCsv(rows: ParentRow[], money: boolean) {
  const head = ['Equipment', 'Category', 'Stock', 'Status', 'Bookings', 'Location', 'Condition']
  if (money) head.push('Replacement (NPR)')
  const body = rows.map((r) => {
    const cells = [
      r.name,
      r.category,
      r.stock,
      r.breakdown.map((b) => `${b.count} ${b.status}`).join(' · '),
      r.bookings,
      r.location,
      r.condition,
    ]
    if (money) cells.push(formatMoney(r.replacement))
    return cells
  })
  const csv = [head, ...body]
    .map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'inventory.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/* ── screen ────────────────────────────────────────────────────────────── */

/**
 * **Inventory Workspace** — `Inventory.md` v3.0 (Build Locked), reconciled
 * against `03 Core Modules/Inventory.PNG`.
 *
 * Rules enforced rather than trusted:
 *  · §4.3 the chip counts reconcile to the total, asserted in `data/inventory.ts`
 *  · §4.1 **there is no manual status control anywhere** — not in a row menu,
 *    not in bulk. Status is written by the Status Engine from events, so this
 *    screen deliberately offers no way to set it, and `Bulk Actions` stays inert
 *    for that reason rather than for want of a menu.
 *  · §8.3 **Warehouse sees no money.** `useCanViewMoney()` removes the value
 *    column, the value filter and the value export field outright; nothing is
 *    masked, because a masked cell still tells you a number exists.
 */
export default function Inventory() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Inventory')
  const [chip, setChip] = useState<'All' | InvStatus>('All')
  const [facets, setFacets] = useState<Facets>({})
  const [sort, setSort] = useState<SortKey>('Equipment A–Z')
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [density, setDensity] = useState<Density>('comfortable')
  const [rowsPerPage, setRowsPerPage] = useState<number>(25)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const money = useCanViewMoney()

  const activeFacetCount = Object.values(facets).reduce((a, s) => a + s.size, 0)
  const filtersOn = activeFacetCount > 0 || chip !== 'All'

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

  const clearFilters = () => {
    setFacets({})
    setChip('All')
    setPage(1)
  }

  const filtered = useMemo(() => {
    const rows = PARENTS.filter((p) => {
      if (chip !== 'All' && !statusesOf(p).includes(chip)) return false
      return (Object.keys(facets) as FacetKey[]).every((key) => {
        const chosen = facets[key]
        if (!chosen || chosen.size === 0) return true
        return facetValuesOf(p, key).some((v) => chosen.has(v))
      })
    })

    const sorted = [...rows]
    switch (sort) {
      case 'Equipment A–Z':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'Equipment Z–A':
        sorted.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'Category A–Z':
        sorted.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        break
      case 'Units, most first':
        sorted.sort((a, b) => unitCountOf(b) - unitCountOf(a))
        break
      case 'Needs attention first':
        sorted.sort((a, b) => attentionScore(b) - attentionScore(a) || a.name.localeCompare(b.name))
        break
    }
    return sorted
  }, [chip, facets, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * rowsPerPage
  const visible = filtered.slice(start, start + rowsPerPage)
  const unitTotal = filtered.reduce((a, p) => a + unitCountOf(p), 0)

  const allOnPageSelected = visible.length > 0 && visible.every((p) => selected.has(p.name))
  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) visible.forEach((p) => next.delete(p.name))
      else visible.forEach((p) => next.add(p.name))
      return next
    })
  }
  const toggleRow = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="box"
        title="Inventory"
        description="The master equipment database — every physical asset owned, sub-rented, repaired or transferred."
      />

      {/* §2 — Bundles, Sub Rental, Maintenance and Cases are tabs, not sidebar items. */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const on = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={on ? 'page' : undefined}
              style={{
                height: 34,
                padding: '0 13px',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
              }}
            >
              {t}
            </button>
          )
        })}

        {/* The mockup parks the action cluster at the right of the tab strip. */}
        {tab === 'Inventory' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
            <Unavailable reason="Import is not built — there is no catalogue intake pipeline in this release.">
              <Button icon="upload" disabled>
                Import
              </Button>
            </Unavailable>
            <Button icon="download" onClick={() => exportCsv(filtered, money)}>
              Export
            </Button>
            <Unavailable reason="Add Equipment is not built — the intake form has no screen yet.">
              <Button icon="plus" variant="primary" disabled>
                Add Equipment
              </Button>
            </Unavailable>
          </div>
        )}
      </div>

      {tab === 'Bundles' ? (
        <Bundles />
      ) : tab === 'Maintenance' ? (
        <Maintenance />
      ) : tab === 'Sub Rental' ? (
        <SubRental />
      ) : tab === 'Cases' ? (
        <CasesWorkspace />
      ) : (
        <>
          <KpiStrip items={KPIS} columns={6} />

          {/* §4.3 — status chips, counted, with the reconciliation asserted in data. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {CHIP_COUNTS.map((c) => {
              const on = chip === c.label
              const tone = c.label === 'All' ? 'var(--text2)' : INV_DOT[c.label]
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    setChip(c.label)
                    setPage(1)
                  }}
                  aria-pressed={on}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 30,
                    padding: '0 10px',
                    borderRadius: 8,
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
                  {c.label}
                  <span
                    className="figure"
                    style={{ fontSize: 'var(--t-meta)', color: on ? 'var(--nav-active-accent)' : 'var(--muted)' }}
                  >
                    {grouped(c.count)}
                  </span>
                </button>
              )
            })}

            <button
              type="button"
              onClick={clearFilters}
              disabled={!filtersOn}
              title={filtersOn ? 'Clear the status chip and every filter' : 'No filters are applied'}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
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
              Clear Filters
            </button>
          </div>

          {/* Mockup: a filter rail on the left, the table to its right. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 216px) minmax(0, 1fr)', gap: 'var(--sp-md)', alignItems: 'start' }}>
            <FilterRail
              facets={facets}
              onToggle={toggleFacet}
              onReset={clearFilters}
              money={money}
              activeCount={activeFacetCount}
            />

            <Card bodyStyle={{ padding: 0 }}>
              {/* toolbar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border)',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} models`}
                </span>
                {selected.size > 0 && (
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
                )}

                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Unavailable reason="§4.1 — status is written by the Status Engine, never by hand, so no bulk action is offered. Nothing else is built to act on a selection yet.">
                    <Button icon="chevron_down" disabled>
                      Bulk Actions
                    </Button>
                  </Unavailable>

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    Sort by
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortKey)}
                      style={selectStyle}
                      aria-label="Sort equipment"
                    >
                      {SORTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
                    aria-pressed={density === 'compact'}
                    title={density === 'compact' ? 'Compact rows — click for comfortable' : 'Comfortable rows — click for compact'}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--input-border)',
                      background: density === 'compact' ? 'var(--nav-active-bg)' : 'var(--input-bg)',
                      color: density === 'compact' ? 'var(--nav-active-accent)' : 'var(--text2)',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Icon name={density === 'compact' ? 'chevron_up' : 'chevron_down'} size={15} />
                  </button>

                  <span style={{ display: 'inline-flex', border: '1px solid var(--input-border)', borderRadius: 'var(--r-input)', overflow: 'hidden' }}>
                    {(['table', 'grid'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setView(v)}
                        aria-pressed={view === v}
                        aria-label={v === 'table' ? 'Table view' : 'Grid view'}
                        title={v === 'table' ? 'Table view' : 'Grid view'}
                        style={{
                          width: 32,
                          height: 32,
                          border: 'none',
                          background: view === v ? 'var(--nav-active-bg)' : 'var(--input-bg)',
                          color: view === v ? 'var(--nav-active-accent)' : 'var(--text2)',
                          cursor: 'pointer',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name={v === 'table' ? 'checklist' : 'queues'} size={15} />
                      </button>
                    ))}
                  </span>
                </span>
              </div>

              {visible.length === 0 ? (
                <div style={{ padding: '24px 16px' }}>
                  <EmptyState
                    title="No equipment matches these filters"
                    description="Nothing in the catalogue satisfies the status chip and filter rail together."
                    actionLabel="Clear filters"
                    onAction={clearFilters}
                  />
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
                  {visible.map((p) => (
                    <article key={p.name} style={{ ...cardStyle, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Thumb category={p.category} size={38} />
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
                          <CategoryChip category={p.category} />
                        </span>
                      </span>
                      <span style={{ fontSize: 'var(--t-meta)' }}>
                        <StatusBreakdown row={p} />
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <span className="figure">{p.stock}</span>
                        <ConditionBadge condition={p.condition} />
                      </span>
                      {money && (
                        <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                          {formatMoney(p.replacement)}
                        </span>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1060 }}>
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
                            onClick={() => setSort((s) => (s === 'Equipment A–Z' ? 'Equipment Z–A' : 'Equipment A–Z'))}
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
                            Equipment / Serial
                            <Icon name={sort === 'Equipment Z–A' ? 'arrow_down' : 'arrow_up'} size={11} />
                          </button>
                        </th>
                        {['Category', 'Stock', 'Status', 'Booking', 'Location', 'Condition'].map((h) => (
                          <th key={h} style={th}>
                            {h}
                          </th>
                        ))}
                        {/* §8.3 — omitted entirely for Warehouse, not blanked. */}
                        {money && <th style={{ ...th, textAlign: 'right' }}>Replacement (NPR)</th>}
                        <th style={{ ...th, width: 30 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((p) => (
                        <ParentRowView
                          key={p.name}
                          row={p}
                          money={money}
                          density={density}
                          checked={selected.has(p.name)}
                          onToggle={() => toggleRow(p.name)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* §7.5 — state both counts; the table paginates parents, not units. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  flexWrap: 'wrap',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text2)',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span>
                  Showing {filtered.length === 0 ? 0 : start + 1} to {start + visible.length} of {filtered.length} models ·{' '}
                  {grouped(unitTotal)} units
                </span>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Rows per page
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value))
                      setPage(1)
                    }}
                    style={selectStyle}
                    aria-label="Rows per page"
                  >
                    {ROWS_PER_PAGE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>

                <span style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'center' }}>
                  {[
                    { label: '«', to: 1, disabled: safePage === 1, name: 'First page' },
                    { label: '‹', to: safePage - 1, disabled: safePage === 1, name: 'Previous page' },
                  ].map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => setPage(b.to)}
                      disabled={b.disabled}
                      aria-label={b.name}
                      style={{
                        minWidth: 26,
                        height: 26,
                        borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: b.disabled ? 'var(--disabled)' : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        cursor: b.disabled ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {b.label}
                    </button>
                  ))}

                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
                    const on = n === safePage
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        aria-current={on ? 'page' : undefined}
                        style={{
                          minWidth: 26,
                          height: 26,
                          borderRadius: 7,
                          border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                          background: on ? 'var(--btn-primary-bg)' : 'transparent',
                          color: on ? 'var(--btn-primary-fg)' : 'var(--text2)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: on ? 700 : 500,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {n}
                      </button>
                    )
                  })}

                  {[
                    { label: '›', to: safePage + 1, disabled: safePage === pageCount, name: 'Next page' },
                    { label: '»', to: pageCount, disabled: safePage === pageCount, name: 'Last page' },
                  ].map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => setPage(b.to)}
                      disabled={b.disabled}
                      aria-label={b.name}
                      style={{
                        minWidth: 26,
                        height: 26,
                        borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: b.disabled ? 'var(--disabled)' : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        cursor: b.disabled ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {b.label}
                    </button>
                  ))}
                </span>
              </div>
            </Card>
          </div>

          <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            Status is written by the Status Engine from booking and workspace events. There is no manual status
            control in Inventory — not in a row menu, not in bulk.
          </p>
        </>
      )}

      <FooterNote extra={['Equipment is retired, never deleted']} />
    </div>
  )
}
