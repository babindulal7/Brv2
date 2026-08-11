import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import Placeholder from '../Placeholder'
import { STATUS, BRAND } from '../../lib/status'
import type { StatusKey, BrandKey } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import { formatAd, TODAY } from '../../lib/bs'
import { canViewMoney } from '../../lib/rbac'
import type { Role as SystemRole } from '../../lib/rbac'
import { STATUS_ORDER } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import { useAuth } from '../../lib/auth'
import { useTabularLayout } from '../../lib/device'
import { gateContext } from '../../lib/fieldGating'
import type { GateContext } from '../../lib/fieldGating'
import { IntelCard } from '../../components/ui/IntelCard'
import { bookingGlance, bookingDetailGroups, quoteGlance, quoteDetailGroups } from '../../data/bookingIntel'
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
import { PRODUCTIONS } from '../../data/productions'
import { productionGlance, productionDetailGroups, isReallyConfirmed } from '../../data/productionIntel'
import { CREW_DATA } from '../../data/crew'

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
              borderRadius: 'var(--r-badge)',
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
        borderRadius: 'var(--r-badge)',
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
  borderRadius: 'var(--r-sm)',
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
 * It reads `data/booking.ts`'s `OPERATIONS` table directly. That table is
 * **not** shared with Booking Detail's own header menu any more — a 9 Aug
 * shell rewire moved Booking Detail onto `OperationsShell`
 * (`modules/operations/OperationsShell.tsx`), which derives its job list from
 * `lib/workflow.ts`'s `JOBS`/`JOB_ORDER` engine instead. The two tables happen
 * to still agree today (both encode the same four-step Packing/Handover/
 * Return/Reset sequence at the same booking statuses), so this menu and
 * Booking Detail's currently show the same entries — but that agreement is
 * coincidental, not structural: editing one table no longer updates the
 * other, so a future change to either can drift silently. Two consequences
 * the render does not show, still true of `OPERATIONS` on its own:
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
          borderRadius: 'var(--r-xs)',
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
          borderRadius: 'var(--r-xs)',
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
 * Filter rail, collapsed by default.
 *
 * `SideRail`/`CollapsibleAside` (`Page.tsx`) only default-collapse below the
 * phone breakpoint — at the app's own 1280px baseline this rail stayed
 * expanded at 210px, and that plus the table's own width pushed the row
 * Operations menu (§ `RowOperations` above) off the edge of its scroll
 * container. Only Status of the eleven groups below is wired to the list
 * (see the `TODO(decision)` beside the rest), so starting collapsed loses no
 * functionality most sessions will reach for — the toggle still opens it on
 * demand, it just doesn't eat width by default.
 */
function FilterRailToggle({ children, label = 'Filters' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', width: 32 }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Expand ${label}`}
          title={`Expand ${label}`}
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text2)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Icon name="chevron_right" size={14} />
        </button>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0, width: 210, position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={`Collapse ${label}`}
        title={`Collapse ${label}`}
        style={{
          position: 'absolute',
          top: 0,
          right: -12,
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--text2)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          zIndex: 2,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <Icon name="chevron_left" size={12} />
      </button>
      {children}
    </div>
  )
}

/**
 * The one real facet in the Filters rail — an accordion over `STATUS_ORDER`
 * (Foundation's six stages, `lib/workflow.ts`), checkbox per stage. Renders in
 * place of the disabled row `filterGroups.map` below gives every other group,
 * so it has to carry its own open/count/chevron rather than reuse that inert
 * markup.
 */
function StatusFilterGroup({
  icon,
  selected,
  toggle,
}: {
  icon: Parameters<typeof Icon>[0]['name']
  selected: Set<BookingStatus>
  toggle: (s: BookingStatus) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: '100%',
          height: 34,
          padding: '0 8px',
          borderRadius: 'var(--r-sm)',
          border: 'none',
          background: open ? 'var(--hover-card)' : 'transparent',
          color: 'var(--text)',
          fontSize: 'var(--t-meta)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = 'var(--hover-card)'
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'transparent'
        }}
      >
        <Icon name={icon} size={15} style={{ color: selected.size > 0 ? 'var(--nav-active-accent)' : 'var(--text2)', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left', fontWeight: selected.size > 0 ? 700 : 400 }}>
          Status{selected.size > 0 ? ` (${selected.size})` : ''}
        </span>
        <Icon name={open ? 'chevron_up' : 'chevron_down'} size={13} style={{ color: 'var(--text2)' }} />
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '2px 4px 6px 30px' }}>
          {STATUS_ORDER.map((s) => (
            <label
              key={s}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                height: 30,
                fontSize: 'var(--t-meta)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={selected.has(s)} onChange={() => toggle(s)} />
              <span style={{ flex: 1 }}>{s}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * §1.2 — Quote is one value of `BookingStatus`, not a separate card type; the
 * booking-number cell's Intel Card just has to pick the right builder for the
 * row it is on. `bookingGlance`/`bookingDetailGroups` assume a committed
 * booking (pickup/return crew, packing, deposit ledger); `quoteGlance`/
 * `quoteDetailGroups` know a Quote holds nothing and has no ITEMS breakdown
 * outside `BOOKING.no`.
 */
function intelGlanceFor(r: RentalRow, gctx: GateContext) {
  return r.status === 'Quote' ? quoteGlance(r, gctx) : bookingGlance(r, gctx)
}
function intelDetailFor(r: RentalRow, gctx: GateContext) {
  return r.status === 'Quote' ? quoteDetailGroups(r, gctx) : bookingDetailGroups(r, gctx)
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
  /**
   * `gateContext()` returns a fresh object literal on every call (no opts are
   * passed here, so it is a pure function of `role`) — left unmemoized, this
   * new reference on every render would break the `useMemo` below on `gctx`
   * identity alone, recomputing all row intel on any unrelated state change
   * (a checkbox, `hiddenCols`, pagination, …). Stable per `role`.
   */
  const gctx = useMemo(() => gateContext(role), [role])

  const [tab, setTab] = useState<(typeof RENTAL_TABS)[number]>('Bookings')
  const [chip, setChip] = useState<ChipKey>('Today')
  const [view, setView] = useState<(typeof VIEWS)[number]>('Table')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  /**
   * The one real facet in the Filters rail (see `FilterRailToggle` below) — the
   * rest of `FILTER_GROUPS` stay disabled pending the `TODO(decision)` beside
   * them. `RentalRow.status` is a real `BookingStatus`, so this narrows the
   * same `rows` array the quick-filter chips and the Custom date range do,
   * rather than a facet with nothing behind it.
   */
  const [statusFilter, setStatusFilter] = useState<Set<BookingStatus>>(new Set())
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
    const byChip = chip !== 'Custom' ? base : base.filter((r) => withinRange(r, isoToDate(from), isoToDate(to)))
    return statusFilter.size === 0 ? byChip : byChip.filter((r) => statusFilter.has(r.status))
  }, [chip, from, to, statusFilter])

  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pageCount)
  const visible = useMemo(
    () => rows.slice((current - 1) * perPage, current * perPage),
    [rows, current, perPage],
  )

  /**
   * `intelGlanceFor`/`intelDetailFor` construct a full field-gated object
   * graph per row (role/PII/money filtering included) — expensive enough that
   * calling them inline inside a `.map()` reran the builder on every render
   * of this component, even when neither `visible` nor `gctx` had changed
   * (e.g. a search-box keystroke that only touches unrelated state). This
   * computes glance/detail once per row per relevant dependency change; both
   * render views below read `.glance`/`.detail` instead of calling the
   * builders themselves.
   */
  const rowsWithIntel = useMemo(
    () =>
      visible.map((r) => ({
        row: r,
        glance: intelGlanceFor(r, gctx),
        detail: intelDetailFor(r, gctx),
      })),
    [visible, gctx],
  )

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
  const colCount = headers.length + 1 // actions

  function pickChip(c: ChipKey) {
    setChip(c)
    setPage(1)
  }

  function toggleStatus(s: BookingStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
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

      <div style={{ display: 'flex', gap: 'var(--sp-xs)', borderBottom: '1px solid var(--border)' }}>
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

      {tab === 'Productions' && <ProductionsTab gctx={gctx} />}
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
                    borderRadius: 'var(--r-sm)',
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
                gap: 'var(--sp-xs)',
                padding: 3,
                borderRadius: 10,
                background: 'var(--card2)',
                border: '1px solid var(--border)',
              }}
            >
              {VIEWS.map((v) => {
                const on = view === v
                const unbuilt = v === 'Timeline'
                const btnStyle = {
                  display: 'inline-flex' as const,
                  alignItems: 'center' as const,
                  gap: 5,
                  height: 28,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: 'none',
                  background: on ? 'var(--card)' : 'transparent',
                  color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: on ? 600 : 500,
                  cursor: unbuilt ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: on ? 'var(--shadow-card)' : 'none',
                }
                // Table and Cards are real — Cards renders the same
                // `rowsWithIntel` data the table does (see `view === 'Cards'`
                // below). Timeline has no such build behind it, so unlike the
                // other two it doesn't get a live `onClick`: it discloses why
                // up front through `Unavailable` instead of switching to a
                // view that only then admits it isn't built.
                if (unbuilt) {
                  return (
                    <Unavailable key={v} reason="Timeline view is not built yet — the render only specifies the Table view in detail.">
                      <button type="button" disabled aria-pressed={on} style={btnStyle}>
                        <Icon name="timer" size={14} />
                        {v}
                      </button>
                    </Unavailable>
                  )
                }
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={on}
                    style={btnStyle}
                  >
                    <Icon name={v === 'Table' ? 'checklist' : 'queues'} size={14} />
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
                gap: 'var(--sp-sm)',
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
            <FilterRailToggle label="Filters">
            <Card
              title="Filters"
              action={
                statusFilter.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStatusFilter(new Set())}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 600,
                      color: 'var(--link)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      padding: 0,
                    }}
                  >
                    Clear all
                  </button>
                ) : (
                  /* Muted, not link-blue: link-blue reads as clickable, and there
                     is nothing behind it until Status has a selection or the
                     other groups below are wired. */
                  <span
                    style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', cursor: 'not-allowed' }}
                    aria-disabled
                    title="Nothing to clear yet — pick a Status below, or use the quick filters above."
                  >
                    Clear all
                  </span>
                )
              }
              bodyStyle={{ padding: 'var(--sp-sm)' }}
            >
              {/* Status is the one real facet — `RentalRow.status` is a genuine
                  `BookingStatus`, so it narrows `rows` for real (see the
                  `statusFilter` state above). TODO(decision): every other group
                  needs its facet values settled — the row shape carries no
                  rental type, client type, equipment category or tag to filter
                  on, so wiring them is a product decision, not a build task.
                  Until then they stay visibly unavailable rather than
                  accordions that open onto nothing. */}
              {filterGroups.map((g) =>
                g.label === 'Status' ? (
                  <StatusFilterGroup key={g.label} icon={g.icon} selected={statusFilter} toggle={toggleStatus} />
                ) : (
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
                      borderRadius: 'var(--r-sm)',
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
                ),
              )}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                <Unavailable reason="Saved filters are not built yet — there is no filter state to save while the groups above are unwired.">
                  <Button icon="flag" disabled>
                    Save as new filter
                  </Button>
                </Unavailable>
              </div>
            </Card>
            </FilterRailToggle>

            {view === 'Timeline' ? (
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
                {(view === 'Cards' || !tabular) && (
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
                      rowsWithIntel.map(({ row: r, glance, detail }) => (
                        <div
                          key={r.bookingNo}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--sp-sm)',
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

                          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                            <IntelCard
                              glance={glance}
                              detail={detail}
                              detailTitle={r.bookingNo}
                              detailSubtitle={`${r.client} · ${r.status}`}
                            >
                              <Link
                                to={`/rentals/${r.bookingNo}`}
                                className="identifier"
                                style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--link)', textDecoration: 'none' }}
                              >
                                {r.bookingNo}
                              </Link>
                            </IntelCard>
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
                          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginTop: 2 }}>
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

                {view === 'Table' && tabular && (
                <div data-table-scroll style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
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
                        rowsWithIntel.map(({ row: r, glance, detail }) => (
                          <tr key={r.bookingNo} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={td}>
                              <IntelCard
                                glance={glance}
                                detail={detail}
                                detailTitle={r.bookingNo}
                                detailSubtitle={`${r.client} · ${r.status}`}
                              >
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
                              </IntelCard>
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
                                    gap: 'var(--sp-xs)',
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
                    gap: 'var(--sp-md)',
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

/**
 * Productions tab — Hover Intel System v2.1 Tier 3. §5.1 declares this tab;
 * it rendered `<Placeholder>` until now because no data/screen concept for
 * "a production" existed anywhere in the build.
 *
 * `data/productions.ts`'s own header documents the grounding judgment call:
 * the wave brief expected 2–3 real `ROWS` bookings to group under one
 * shared client, but no client in the current `ROWS` has 2+ bookings by
 * ROWS's own `client` field, so each production below covers exactly one
 * real, ROWS-verified booking rather than a relabeled cross-file grouping.
 *
 * Crew counts are a *real* cross-reference against `data/crew.ts`'s
 * `CREW_DATA` (matched by `linkedBooking`), not a guess — a production with
 * no matching `CrewAssignment` row says so rather than showing a 0/0.
 * (`data/crew.ts` is Crew Assist's own data file; a concurrent session
 * finished extracting it out of `modules/crew/CrewBooking.tsx` while this
 * tab was being built — see `productionIntel.ts`'s header.)
 */
function ProductionsTab({ gctx }: { gctx: GateContext }) {
  /**
   * Same builder-in-render-loop cost as the Bookings tab above, plus the
   * `CREW_DATA.filter(...)` cross-reference re-run per row on every render —
   * memoized together per production so an unrelated re-render (e.g. the
   * Bookings tab's search state, since this component only remounts on tab
   * switch, not per keystroke) doesn't redo either.
   */
  const productionsWithIntel = useMemo(
    () =>
      PRODUCTIONS.map((p) => {
        const crew = CREW_DATA.filter((c) => p.linkedBookingIds.includes(c.linkedBooking))
        const confirmed = crew.filter(isReallyConfirmed).length
        return {
          production: p,
          crew,
          confirmed,
          glance: productionGlance(p, crew),
          detail: productionDetailGroups(p, crew, gctx),
        }
      }),
    [gctx],
  )

  return (
    <Card
      title={`${PRODUCTIONS.length} ${PRODUCTIONS.length === 1 ? 'Production' : 'Productions'}`}
      bodyStyle={{ padding: 0 }}
    >
      {PRODUCTIONS.length === 0 ? (
        <div style={{ padding: '24px 16px' }}>
          <EmptyState
            title="No productions yet"
            description="Productions are grouped from real bookings that share a client — none currently do."
          />
        </div>
      ) : (
        <div data-table-scroll style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--th-bg)' }}>
                <th style={th}>Production</th>
                <th style={th}>Client</th>
                <th style={th}>Dates (AD)</th>
                <th style={th}>Linked Bookings</th>
                <th style={th}>Crew</th>
              </tr>
            </thead>
            <tbody>
              {productionsWithIntel.map(({ production: p, crew, confirmed, glance, detail }) => {
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>
                      <IntelCard
                        glance={glance}
                        detail={detail}
                        detailTitle={p.name}
                        detailSubtitle={p.client}
                      >
                        <span
                          className="identifier"
                          style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', cursor: 'default' }}
                        >
                          {p.name}
                        </span>
                      </IntelCard>
                    </td>
                    <td style={td}>{p.client}</td>
                    <td style={td}>
                      <span className="figure">
                        {formatAd(p.startAd)} – {formatAd(p.endAd)}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {p.linkedBookingIds.map((id) => (
                          <Link
                            key={id}
                            to={`/rentals/${id}`}
                            className="identifier"
                            style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
                          >
                            {id}
                          </Link>
                        ))}
                      </span>
                    </td>
                    <td style={td}>
                      {crew.length > 0 ? (
                        <span className="figure">{confirmed}/{crew.length} confirmed</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>No crew linked yet</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}
