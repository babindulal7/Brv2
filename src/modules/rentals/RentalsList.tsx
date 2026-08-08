import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle, SideRail } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import Placeholder from '../Placeholder'
import { STATUS, BRAND } from '../../lib/status'
import type { StatusKey, BrandKey } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import { formatAd, TODAY } from '../../lib/bs'
import { canViewMoney } from '../../lib/rbac'
import type { Role as SystemRole } from '../../lib/rbac'
import { useAuth } from '../../lib/auth'
import { useTabularLayout } from '../../lib/device'
import { OPERATIONS } from '../../data/booking'
import {
  VIEWS,
  ROWS,
  ROWS_PER_PAGE,
  OPTIONAL_COLUMNS,
  kpisFor,
  chipsFor,
  filterGroupsFor,
  matchesChip,
  withinRange,
} from '../../data/rentals'
import type { RentalRow, ChipKey, OptionalColumn } from '../../data/rentals'

/**
 * §5.1 declares three tabs on Rentals: Bookings · Productions · Sub-Rental.
 * Only Bookings existed — the screen simply had no tab bar, so Productions and
 * Sub-Rental were unreachable rather than merely unbuilt. `Placeholder` says so
 * honestly instead of a convincing-looking empty table.
 */
const RENTAL_TABS = ['Bookings', 'Productions', 'Sub-Rental'] as const

/**
 * `lib/auth.tsx` carries eight *shift* roles; `lib/rbac.ts` is written against
 * Foundation §11's six *system* roles. The unions are not the same shape, so
 * this maps rather than casts — a cast would hand `canViewMoney` a string it
 * has no rule for, and it would answer `true`.
 *
 * The three floor roles collapse onto Warehouse. `Header.tsx` already treats
 * Warehouse / Technician / Driver as one group (they are the roles that need a
 * shift handover before logout), and §8.3's rule is about the warehouse floor,
 * not about one job title.
 *
 * TODO(decision): Coordinator and Client have no §11 row. Coordinator is read
 * as Manager and Client as Viewer below; both need settling. The map itself
 * belongs in `lib/rbac.ts` beside `canViewMoney`, not on a list page — it is
 * duplicated the moment a second screen needs it.
 */

function Tag({ text, status }: { text: string; status: StatusKey }) {
  const c = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 18,
        padding: '0 6px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

/**
 * Four-step pipeline indicator — Booked → Packed → On Rent → Returned.
 *
 * It is never the only signal: the status pill beside it names the state in
 * words, so the dots add glanceable progress without carrying meaning alone.
 */
function Track({ step, tone }: { step: number; tone: BrandKey }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6 }} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : '0 0 auto' }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              flexShrink: 0,
              background: i < step ? BRAND[tone] : 'var(--disabled)',
            }}
          />
          {i < 3 && (
            <span
              style={{ flex: 1, height: 2, background: i < step - 1 ? BRAND[tone] : 'var(--disabled)', minWidth: 8 }}
            />
          )}
        </span>
      ))}
    </span>
  )
}

/**
 * The render fills these circles with per-client hexes, one of them violet.
 * §4.2 bans both the hue and the hardcoding, so the tint is a status token pair
 * and the theme decides what it looks like.
 */
function Avatar({ row }: { row: RentalRow }) {
  const c = STATUS[row.avatarTone]
  return (
    <span
      aria-hidden
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: c.border ? `1px solid ${c.border}` : undefined,
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        lineHeight: 1.05,
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {/* One token — 12px is the §4.3.6 floor and two lines overflow the circle. */}
      <span>{row.avatar[0]}</span>
    </span>
  )
}

/** Closes a popover on outside click and on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

const menuStyle = {
  position: 'absolute' as const,
  right: 0,
  top: 30,
  minWidth: 226,
  padding: 6,
  borderRadius: 'var(--r-btn)',
  background: 'var(--dropdown)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-modal)',
  zIndex: 30,
}

const menuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  width: '100%',
  height: 34,
  padding: '0 9px',
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
  textAlign: 'left' as const,
  textDecoration: 'none',
}

/**
 * Row Operations menu — the same dropdown `Rentals - Operations Menu.PNG`
 * annotates on the booking header, brought to the row so the list's `⋮` is a
 * real control instead of a decoration.
 *
 * It reads the **same `OPERATIONS` table the Booking Detail header reads**, so
 * the list cannot drift from the workflow engine. Two consequences the render
 * does not show:
 *   - the render's fifth entry, **Cleaning, is absent** — §1.5 ruled four verbs,
 *     not five ("Reset absorbs Cleaning"), and the separate Cleaning workspace
 *     is deleted rather than disabled;
 *   - entries the row's stage does not allow stay **visible and greyed with the
 *     reason on hover and focus** (§4.2), never hidden.
 */
/** Tallest the menu gets — Open Booking, the rule, and the four operations. */
const OPS_MENU_H = 200

function RowOperations({ row }: { row: RentalRow }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const cancelled = row.flags.includes('Cancelled')

  /**
   * The table scrolls horizontally, and CSS resolves the *other* axis to `auto`
   * alongside it — so that wrapper clips this menu vertically as well. On the
   * bottom rows a downward menu opens straight into the clip and is cut off, so
   * it flips upward when there is no room below and there is room above.
   */
  function toggle() {
    if (!open) {
      const anchor = ref.current?.getBoundingClientRect()
      const clip = ref.current?.closest<HTMLElement>('[data-table-scroll]')?.getBoundingClientRect()
      setUp(!!anchor && !!clip && anchor.bottom + OPS_MENU_H > clip.bottom && anchor.top - OPS_MENU_H > clip.top)
    }
    setOpen((o) => !o)
  }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={`Operations for ${row.bookingNo}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        style={{
          border: 'none',
          background: open ? 'var(--hover-card)' : 'transparent',
          color: 'var(--muted)',
          cursor: 'pointer',
          width: 26,
          height: 26,
          borderRadius: 6,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="more_vert" size={15} />
      </button>

      {open && (
        <div role="menu" style={up ? { ...menuStyle, top: 'auto', bottom: 30 } : menuStyle}>
          <Link
            to={`/rentals/${row.bookingNo}`}
            role="menuitem"
            style={{ ...menuItemStyle, color: 'var(--text)', cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-card)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="external_link" size={15} style={{ color: 'var(--text2)' }} />
            <span style={{ flex: 1 }}>Open Booking</span>
          </Link>

          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />

          {OPERATIONS.map((o) => {
            const enabled = !cancelled && o.enabledAt.includes(row.status)
            const why = cancelled
              ? `${row.bookingNo} is cancelled — no operation runs on it`
              : `Available at ${o.enabledAt.join(' or ')} — this booking is ${row.status}`
            const body = (
              <>
                <Icon name={o.icon} size={15} style={{ color: enabled ? 'var(--text2)' : 'var(--disabled)' }} />
                <span style={{ flex: 1 }}>{o.label}</span>
                {!enabled && <Icon name="close" size={12} style={{ color: 'var(--disabled)' }} />}
              </>
            )
            const style = {
              ...menuItemStyle,
              color: enabled ? 'var(--text)' : 'var(--muted)',
              cursor: enabled ? 'pointer' : 'not-allowed',
            }
            return enabled ? (
              <Link
                key={o.label}
                to={`/rentals/${row.bookingNo}/${o.path}`}
                role="menuitem"
                style={style}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-card)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {body}
              </Link>
            ) : (
              <span key={o.label} role="menuitem" aria-disabled title={why} tabIndex={0} style={style}>
                {body}
              </span>
            )
          })}
        </div>
      )}
    </span>
  )
}

/**
 * The gear the render puts at the right end of the header row. It is a column
 * chooser — the only reading of a gear on a table header — and it really hides
 * columns rather than sitting there as an ornament.
 */
function ColumnMenu({
  columns,
  hidden,
  toggle,
}: {
  columns: readonly OptionalColumn[]
  hidden: Set<OptionalColumn>
  toggle: (c: OptionalColumn) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="Choose columns"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          border: 'none',
          background: open ? 'var(--hover-card)' : 'transparent',
          color: 'var(--muted)',
          cursor: 'pointer',
          width: 24,
          height: 24,
          borderRadius: 6,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="settings" size={15} />
      </button>
      {open && (
        <div role="menu" style={{ ...menuStyle, minWidth: 190 }}>
          <div style={{ padding: '4px 9px 6px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>
            Columns
          </div>
          {columns.map((c) => (
            <label
              key={c}
              style={{ ...menuItemStyle, color: 'var(--text)', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-card)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <input type="checkbox" checked={!hidden.has(c)} onChange={() => toggle(c)} />
              <span style={{ flex: 1 }}>{c}</span>
            </label>
          ))}
        </div>
      )}
    </span>
  )
}

/**
 * A control the render draws that nothing yet implements.
 *
 * CLAUDE.md forbids a no-op `onClick` and an `href="#"`: a control that looks
 * live and does nothing is a worse claim than one that says it is not ready.
 * These render **visibly unavailable and state the reason** on hover and focus
 * instead. Each becomes a real control the moment its behaviour is specified.
 */
function Unavailable({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <span title={reason} style={{ display: 'inline-flex' }}>
      {children}
    </span>
  )
}

/** `<input type="date">` speaks ISO; the seed and `lib/bs.ts` speak `Date`. */
function isoToDate(v: string): Date | null {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * Rentals List — Page Type: List. Built from render `77B52333` / `Rentals.PNG`.
 *
 * **Warehouse sees no money (§8.3).** The Payment Due KPI card, the whole
 * Payment column, the "Payment Due" chip and the money filter groups are
 * removed from the arrays *before* they are rendered, so for a warehouse
 * session there is no masked cell, no blurred figure and no dashed placeholder
 * to un-hide — the markup simply does not contain them.
 */
export default function RentalsList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const role: SystemRole = user ? user.role : 'Client'
  const money = canViewMoney(role)

  const [tab, setTab] = useState<(typeof RENTAL_TABS)[number]>('Bookings')
  const [chip, setChip] = useState<ChipKey>('Today')
  const [view, setView] = useState<(typeof VIEWS)[number]>('Table')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hiddenCols, setHiddenCols] = useState<Set<OptionalColumn>>(new Set())
  const [perPage, setPerPage] = useState<number>(20)
  const [page, setPage] = useState(1)
  /**
   * DEVICES.md §7 build order item 1 — Rentals is one of the three screens
   * whose table (`minWidth: 1040`) produces a horizontal scrollbar rather than
   * a layout below 768px. `useTabularLayout()` reads only capability, never a
   * platform name (Law 13), so this is the same branch a desktop window
   * narrowed past 768px takes.
   */
  const tabular = useTabularLayout()

  const kpis = useMemo(() => kpisFor(money), [money])
  const chips = useMemo(() => chipsFor(money), [money])
  const filterGroups = useMemo(() => filterGroupsFor(money), [money])

  /** §8.3 — Payment is not offerable as a column when money is not visible. */
  const optionalColumns = useMemo(
    () => OPTIONAL_COLUMNS.filter((c) => c !== 'Payment' || money),
    [money],
  )

  const rows = useMemo(() => {
    const base = ROWS.filter((r) => matchesChip(r, chip, TODAY))
    if (chip !== 'Custom') return base
    return base.filter((r) => withinRange(r, isoToDate(from), isoToDate(to)))
  }, [chip, from, to])

  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * perPage, current * perPage)

  const show = (c: OptionalColumn) => !hiddenCols.has(c) && (c !== 'Payment' || money)
  const headers: string[] = [
    'Booking',
    'Client / Project',
    ...(show('Package / Items') ? ['Package / Items'] : []),
    ...(show('Pickup') ? ['Pickup'] : []),
    ...(show('Return') ? ['Return'] : []),
    'Status',
    ...(show('Payment') ? ['Payment'] : []),
  ]
  const colCount = headers.length + 2 // select + actions

  const allOnPageSelected = visible.length > 0 && visible.every((r) => selected.has(r.bookingNo))

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) visible.forEach((r) => next.delete(r.bookingNo))
      else visible.forEach((r) => next.add(r.bookingNo))
      return next
    })
  }

  function toggleRow(no: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(no)) next.delete(no)
      else next.add(no)
      return next
    })
  }

  function pickChip(c: ChipKey) {
    setChip(c)
    setPage(1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Rentals"
        description="Manage all bookings and their current status"
        actions={
          <>
            <Button icon="plus" variant="primary" onClick={() => navigate('/rentals/new')}>
              New Rental
            </Button>
            {/* Import brings a file in, Export sends one out — the render draws
                two different arrows and the old build used `download` twice.
                Neither pipeline exists yet, so neither pretends to run. */}
            <Unavailable reason="Import is not built yet — no booking import pipeline or column mapping exists.">
              <Button icon="upload" variant="secondary" disabled>
                Import
              </Button>
            </Unavailable>
            <Unavailable reason="Export is not built yet — nothing settles the file format, or which columns a role may export.">
              <Button icon="download" variant="secondary" disabled>
                Export
              </Button>
            </Unavailable>
          </>
        }
      />

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        {RENTAL_TABS.map((t) => {
          const on = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={on ? 'page' : undefined}
              style={{
                height: 36,
                padding: '0 4px',
                marginBottom: -1,
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--text)' : 'var(--text2)',
                fontSize: 'var(--t-ui)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      {tab === 'Productions' && <Placeholder title="Productions" />}
      {tab === 'Sub-Rental' && <Placeholder title="Sub-Rental" />}

      {tab === 'Bookings' && (
        <>
          <KpiStrip items={kpis} columns={kpis.length} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {chips.map((c) => {
              const on = chip === c.label
              const tint =
                c.tone === 'danger' ? 'var(--danger-text)' : c.tone === 'progress' ? 'var(--progress-text)' : undefined
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => pickChip(c.label)}
                  aria-pressed={on}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 8,
                    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                    background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                    color: on ? 'var(--nav-active-accent)' : (tint ?? 'var(--text2)'),
                    fontSize: 'var(--t-meta)',
                    fontWeight: on || tint ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.label === 'Custom' && <Icon name="calendar" size={14} />}
                  {c.label}
                </button>
              )
            })}

            <span
              style={{
                marginLeft: 'auto',
                display: 'flex',
                gap: 4,
                padding: 3,
                borderRadius: 10,
                background: 'var(--card2)',
                border: '1px solid var(--border)',
              }}
            >
              {VIEWS.map((v) => {
                const on = view === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={on}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      height: 28,
                      padding: '0 11px',
                      borderRadius: 7,
                      border: 'none',
                      background: on ? 'var(--card)' : 'transparent',
                      color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: on ? 600 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: on ? 'var(--shadow-card)' : 'none',
                    }}
                  >
                    <Icon name={v === 'Table' ? 'checklist' : v === 'Cards' ? 'queues' : 'timer'} size={14} />
                    {v}
                  </button>
                )
              })}
            </span>
          </div>

          {/* The render draws `Custom` as a bare chip. A chip that selects a
              range has to be able to state the range, so it opens inline. */}
          {chip === 'Custom' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
              }}
            >
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value)
                    setPage(1)
                  }}
                  style={dateInput}
                />
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value)
                    setPage(1)
                  }}
                  style={dateInput}
                />
              </label>
              {(from || to) && (
                <Button
                  icon="close"
                  onClick={() => {
                    setFrom('')
                    setTo('')
                  }}
                >
                  Clear range
                </Button>
              )}
              <span style={{ color: 'var(--muted)' }}>
                Matches a booking whose pickup or return falls inside the range.
              </span>
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0,1fr)',
              gap: 'var(--sp-md)',
              alignItems: 'start',
            }}
          >
            <SideRail width={210} label="Filters">
            <Card
              title="Filters"
              action={
                /* Muted, not link-blue: link-blue reads as clickable, and there
                   is nothing behind it until the groups below are wired. */
                <span
                  style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', cursor: 'not-allowed' }}
                  aria-disabled
                  title="Nothing to clear yet — the filter groups below are not wired to the list."
                >
                  Clear all
                </span>
              }
              bodyStyle={{ padding: 8 }}
            >
              {/* TODO(decision): each group needs its facet values settled — the
                  row shape carries no rental type, client type, equipment
                  category or tag to filter on, so wiring them is a product
                  decision, not a build task. Until then they are visibly
                  unavailable rather than accordions that open onto nothing. */}
              {filterGroups.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  disabled
                  title={`The ${g.label} filter is not wired to the list yet — use the quick filters above.`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    width: '100%',
                    height: 34,
                    padding: '0 8px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--muted)',
                    fontSize: 'var(--t-meta)',
                    cursor: 'not-allowed',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name={g.icon} size={15} style={{ color: 'var(--disabled)', flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{g.label}</span>
                  <Icon name="chevron_down" size={13} style={{ color: 'var(--disabled)' }} />
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                <Unavailable reason="Saved filters are not built yet — there is no filter state to save while the groups above are unwired.">
                  <Button icon="flag" disabled>
                    Save as new filter
                  </Button>
                </Unavailable>
              </div>
            </Card>
            </SideRail>

            {view !== 'Table' ? (
              <div style={{ ...cardStyle, padding: 18, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                The <strong style={{ color: 'var(--text)' }}>{view}</strong> view is not built yet — the render only
                specifies the Table view in detail.{' '}
                <button
                  type="button"
                  onClick={() => setView('Table')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--link)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                >
                  Back to Table
                </button>
              </div>
            ) : (
              <Card
                title={`${rows.length} ${rows.length === 1 ? 'Rental' : 'Rentals'} found`}
                action={
                  <>
                    <Unavailable reason="No filter drawer exists yet — nothing settles which facets it would hold beyond the rail on the left.">
                      <Button icon="queues" disabled>
                        More Filters
                      </Button>
                    </Unavailable>
                    <Unavailable reason="Saved views are not built yet — nothing settles where a view is stored or who it is shared with.">
                      <Button icon="flag" disabled>
                        Save View
                      </Button>
                    </Unavailable>
                  </>
                }
                bodyStyle={{ padding: 0 }}
              >
                {selected.size > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 14px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--nav-active-bg)',
                      fontSize: 'var(--t-meta)',
                      color: 'var(--text)',
                      fontWeight: 600,
                    }}
                  >
                    <span className="figure">{selected.size} selected</span>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      style={{
                        marginLeft: 'auto',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--link)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Clear selection
                    </button>
                  </div>
                )}

                {!tabular && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {visible.length === 0 ? (
                      <div style={{ padding: '24px 16px' }}>
                        <EmptyState
                          title="No bookings match this filter"
                          description={`No rentals found in "${chip}". Try switching to another quick filter.`}
                          actionLabel="Reset to Today"
                          onAction={() => pickChip('Today')}
                        />
                      </div>
                    ) : (
                      visible.map((r) => (
                        <div
                          key={r.bookingNo}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            padding: '13px 14px',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <Avatar row={r} />
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                                {r.client}
                              </span>
                              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 1 }}>
                                {r.project}
                              </span>
                            </span>
                            {/* §12's masking rule, restated for the card face: omitted, never shown blank. */}
                            {show('Payment') && r.amount !== undefined && (
                              <span style={{ textAlign: 'right', flexShrink: 0 }}>
                                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                                  {formatMoney(r.amount)}
                                </span>
                                {r.due !== undefined && (
                                  <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: r.due === 0 ? 'var(--st-in-fg)' : 'var(--st-progress-fg)', fontWeight: 600 }}>
                                    {r.due === 0 ? 'Paid' : `Due ${formatMoney(r.due)}`}
                                  </span>
                                )}
                              </span>
                            )}
                          </span>

                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Link
                              to={`/rentals/${r.bookingNo}`}
                              className="identifier"
                              style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--link)', textDecoration: 'none' }}
                            >
                              {r.bookingNo}
                            </Link>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: 20,
                                padding: '0 8px',
                                borderRadius: 'var(--r-badge)',
                                background: STATUS[r.statusKey].bg,
                                color: STATUS[r.statusKey].fg,
                                fontSize: 'var(--t-meta)',
                                fontWeight: 600,
                              }}
                            >
                              {r.status}
                            </span>
                            {r.tag && <Tag text={r.tag.text} status={r.tag.status} />}
                          </span>

                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                            <Icon name="box" size={12} style={{ color: 'var(--muted)' }} />
                            {r.kit}
                          </span>

                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                            <Icon name="calendar" size={12} style={{ color: 'var(--muted)' }} />
                            Pickup <span className="figure">{formatAd(r.pickup.ad)}</span> {r.pickup.time}
                          </span>

                          {/* §7: "one primary button each" on a phone card row. */}
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                            <Link
                              to={`/rentals/${r.bookingNo}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                height: 40,
                                flex: 1,
                                borderRadius: 'var(--r-btn)',
                                border: '1px solid var(--border)',
                                background: 'var(--card2)',
                                color: 'var(--text)',
                                fontSize: 'var(--t-ui)',
                                fontWeight: 600,
                                textDecoration: 'none',
                              }}
                            >
                              <Icon name="external_link" size={14} />
                              Open Booking
                            </Link>
                            <span style={{ flexShrink: 0 }}>
                              <RowOperations row={r} />
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {tabular && (
                <div data-table-scroll style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        <th style={{ ...th, width: 30 }}>
                          <input
                            type="checkbox"
                            aria-label="Select all rentals on this page"
                            checked={allOnPageSelected}
                            onChange={toggleAll}
                          />
                        </th>
                        {headers.map((h) => (
                          <th key={h} style={th}>
                            {h}
                          </th>
                        ))}
                        <th style={{ ...th, textAlign: 'right' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            Actions
                            <ColumnMenu
                              columns={optionalColumns}
                              hidden={hiddenCols}
                              toggle={(c) =>
                                setHiddenCols((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(c)) next.delete(c)
                                  else next.add(c)
                                  return next
                                })
                              }
                            />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 ? (
                        <tr>
                          <td colSpan={colCount} style={{ padding: '24px 16px' }}>
                            <EmptyState
                              title="No bookings match this filter"
                              description={`No rentals found in "${chip}". Try switching to another quick filter.`}
                              actionLabel="Reset to Today"
                              onAction={() => pickChip('Today')}
                            />
                          </td>
                        </tr>
                      ) : (
                        visible.map((r) => (
                          <tr key={r.bookingNo} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ ...td, width: 30 }}>
                              <input
                                type="checkbox"
                                aria-label={`Select ${r.bookingNo}`}
                                checked={selected.has(r.bookingNo)}
                                onChange={() => toggleRow(r.bookingNo)}
                              />
                            </td>

                            <td style={td}>
                              {/* Booking Detail exists, so this is a real link. */}
                              <Link
                                to={`/rentals/${r.bookingNo}`}
                                className="identifier"
                                style={{
                                  fontSize: 'var(--t-meta)',
                                  fontWeight: 700,
                                  color: 'var(--link)',
                                  textDecoration: 'none',
                                }}
                              >
                                {r.bookingNo}
                              </Link>
                              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                                {r.bookedOn}
                              </div>
                              {r.tag && (
                                <div style={{ marginTop: 4 }}>
                                  <Tag text={r.tag.text} status={r.tag.status} />
                                </div>
                              )}
                            </td>

                            <td style={td}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <Avatar row={r} />
                                <span style={{ minWidth: 0 }}>
                                  <span
                                    style={{
                                      display: 'block',
                                      fontSize: 'var(--t-meta)',
                                      fontWeight: 700,
                                      color: 'var(--text)',
                                    }}
                                  >
                                    {r.client}
                                  </span>
                                  <span
                                    style={{
                                      display: 'block',
                                      fontSize: 'var(--t-meta)',
                                      color: 'var(--text2)',
                                      marginTop: 1,
                                    }}
                                  >
                                    {r.project}
                                  </span>
                                  <span
                                    style={{
                                      display: 'block',
                                      fontSize: 'var(--t-meta)',
                                      color: 'var(--muted)',
                                      marginTop: 1,
                                    }}
                                  >
                                    {r.location} · {r.crew}
                                  </span>
                                </span>
                              </span>
                            </td>

                            {show('Package / Items') && (
                              <td style={td}>
                                <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                                  {r.kit}
                                </span>
                                <span
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 'var(--t-meta)',
                                    color: 'var(--muted)',
                                    marginTop: 3,
                                  }}
                                >
                                  <Icon name="box" size={12} />
                                  <span className="figure">{r.items}</span> items
                                </span>
                              </td>
                            )}

                            {(['Pickup', 'Return'] as const)
                              .filter((c) => show(c))
                              .map((c) => {
                                const m = c === 'Pickup' ? r.pickup : r.ret
                                return (
                                  <td key={c} style={td}>
                                    <span
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        fontSize: 'var(--t-meta)',
                                        color: 'var(--text)',
                                      }}
                                    >
                                      <Icon name="calendar" size={12} style={{ color: 'var(--muted)' }} />
                                      {/* §3 — AD rendering belongs to lib/bs.ts. */}
                                      <span className="figure">{formatAd(m.ad)}</span>
                                    </span>
                                    <span
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        fontSize: 'var(--t-meta)',
                                        color: 'var(--text2)',
                                        marginTop: 3,
                                      }}
                                    >
                                      <Icon name="timer" size={12} style={{ color: 'var(--muted)' }} />
                                      <span className="figure">{m.time}</span>
                                    </span>
                                    <span
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        fontSize: 'var(--t-meta)',
                                        color: 'var(--text2)',
                                        marginTop: 3,
                                      }}
                                    >
                                      <Icon name="crew" size={12} style={{ color: 'var(--muted)' }} />
                                      {m.who}
                                    </span>
                                  </td>
                                )
                              })}

                            <td style={{ ...td, minWidth: 116 }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  height: 22,
                                  padding: '0 9px',
                                  borderRadius: 'var(--r-badge)',
                                  background: STATUS[r.statusKey].bg,
                                  color: STATUS[r.statusKey].fg,
                                  fontSize: 'var(--t-meta)',
                                  fontWeight: 600,
                                }}
                              >
                                {r.status}
                              </span>
                              {/* The stage is one of Foundation's six; anything else
                                  the row needs to say — "Overdue", "Returning
                                  today" — is a note, never a renamed status. */}
                              {r.statusNote && (
                                <span
                                  style={{
                                    display: 'block',
                                    marginTop: 4,
                                    fontSize: 'var(--t-meta)',
                                    fontWeight: 600,
                                    color: r.progressTone === 'danger' ? 'var(--danger-text)' : 'var(--text2)',
                                  }}
                                >
                                  {r.statusNote}
                                </span>
                              )}
                              <Track step={r.progress} tone={r.progressTone} />
                            </td>

                            {/* §8.3 — the cell is omitted, not emptied. */}
                            {show('Payment') && (
                              <td style={td}>
                                <span
                                  className="figure"
                                  style={{
                                    display: 'block',
                                    fontSize: 'var(--t-meta)',
                                    fontWeight: 700,
                                    color: 'var(--text)',
                                  }}
                                >
                                  {r.amount === undefined ? '—' : formatMoney(r.amount)}
                                </span>
                                {r.due !== undefined && (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      height: 19,
                                      padding: '0 7px',
                                      borderRadius: 5,
                                      marginTop: 4,
                                      background: r.due === 0 ? 'var(--st-in-bg)' : 'var(--st-progress-bg)',
                                      color: r.due === 0 ? 'var(--st-in-fg)' : 'var(--st-progress-fg)',
                                      fontSize: 'var(--t-meta)',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {r.due === 0 ? 'Paid' : `Due ${formatMoney(r.due)}`}
                                  </span>
                                )}
                                {r.deposit !== undefined && (
                                  <span
                                    style={{
                                      display: 'block',
                                      fontSize: 'var(--t-meta)',
                                      color: 'var(--muted)',
                                      marginTop: 3,
                                    }}
                                  >
                                    Deposit: {formatMoney(r.deposit)}
                                  </span>
                                )}
                              </td>
                            )}

                            <td style={{ ...td, width: 34, textAlign: 'right' }}>
                              <RowOperations row={r} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 14px',
                    flexWrap: 'wrap',
                    fontSize: 'var(--t-meta)',
                    color: 'var(--text2)',
                  }}
                >
                  <span>
                    {rows.length === 0
                      ? 'Showing 0 rentals'
                      : `Showing ${(current - 1) * perPage + 1} to ${Math.min(current * perPage, rows.length)} of ${rows.length} rentals`}
                  </span>

                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <PageBtn label="‹" disabled={current === 1} onClick={() => setPage(current - 1)} />
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                      <PageBtn key={p} label={String(p)} active={p === current} onClick={() => setPage(p)} />
                    ))}
                    <PageBtn label="›" disabled={current === pageCount} onClick={() => setPage(current + 1)} />
                  </span>

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    Rows per page
                    <select
                      value={perPage}
                      onChange={(e) => {
                        setPerPage(Number(e.target.value))
                        setPage(1)
                      }}
                      className="figure"
                      style={{
                        height: 28,
                        padding: '0 6px',
                        borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: 'var(--input-bg)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                        fontFamily: 'inherit',
                      }}
                    >
                      {ROWS_PER_PAGE.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Card>
            )}
          </div>
        </>
      )}

      <FooterNote
        extra={[
          'Cancelled bookings are retained, never deleted',
          `Quick filters are relative to ${formatAd(TODAY)}`,
        ]}
      />
    </div>
  )
}

function PageBtn({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      style={{
        minWidth: 26,
        height: 26,
        borderRadius: 7,
        border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
        background: active ? 'var(--btn-primary-bg)' : 'transparent',
        color: active ? 'var(--btn-primary-fg)' : 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: active ? 700 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

const th = {
  textAlign: 'left' as const,
  padding: '9px 12px',
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}

const td = {
  padding: '11px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'top' as const,
  whiteSpace: 'nowrap' as const,
}

const dateInput = {
  height: 30,
  padding: '0 8px',
  borderRadius: 8,
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}
