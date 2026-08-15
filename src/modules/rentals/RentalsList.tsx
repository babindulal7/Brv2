import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ActiveFilterChips, FilterButton, FilterDrawer } from '../../components/ui/FilterDrawer'
import { Unavailable } from '../../components/ui/Unavailable'
import { STATUS, STATUS_ICON, BRAND } from '../../lib/status'
import type { IconName } from '../../components/ui/Icon'
import type { StatusKey, BrandKey } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import { formatAd, TODAY } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import type { Role as SystemRole } from '../../lib/rbac'
import { STATUS_ORDER, statusToken } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { gateContext } from '../../lib/fieldGating'
import { IntelCard } from '../../components/ui/IntelCard'
import { OPERATIONS } from '../../data/booking'
import { listBookings, type BookingListRow } from '../../lib/queries/bookings'
import { useList, type ListQueryResult } from '../../lib/queries/useList'
import { useFilters } from '../../lib/queries/useFilters'
import type { ListFilters } from '../../lib/queries/listQuery'
import { NOW_AD } from '../../data/today'
import {
  VIEWS,
  ROWS_PER_PAGE,
  OPTIONAL_COLUMNS,
  CHIP_MEANS,
  RENTAL_DEPOSIT_NOTE,
  RENTAL_KPI_FILTERS,
  SUB_RENTAL_NOTE,
  SUB_RENTAL_PENDING,
  SUB_RENTAL_UNANSWERED,
  chipsFor,
  filterGroupsFor,
  rentalGlance,
  rentalDetailGroups,
  rentalsQuery,
  subRentalBookingIds,
  toRentalListRow,
  withSubRental,
} from '../../data/rentals'
import type { ChipKey, OptionalColumn, RentalListRow } from '../../data/rentals'

/**
 * ## No tabs, and no Productions — `04_RENTALS.md` line 3
 *
 * > "Bookings only. **Productions removed.** Sub-Rental is a filter chip."
 *
 * That sentence is one of the eight genuine removals in
 * `WIREFRAME_RULINGS_2026-08-12.md` §1 (a panel survives unless a spec removes
 * it *in prose* — this one does). So, on 12 Aug 2026:
 *
 *  - the three-tab strip is gone. `src/data/nav.ts` already carried the ruling
 *    (`SPEC_TABS['/rentals'] = []`, asserted by `nav.test.ts:222`); the screen
 *    now agrees with it.
 *  - `ProductionsTab`, `src/data/productions.ts` and `src/data/productionIntel.ts`
 *    are **deleted**. `productions` was never a real table — `PLAN.md §6.27`
 *    records that `crew_bookings.production_id`'s FK was dropped for that exact
 *    reason — so nothing was wired to a database and nothing loses a source.
 *    The `TODO(decision)` it left ("what `productions` should be") is closed in
 *    `PLAN.md §4.21` as *dissolved by 04_RENTALS.md line 3*, so a later session
 *    does not resurrect it from Foundation §5.1.
 *  - Sub-Rental becomes a chip in the row below, next to the view toggle.
 *    Rulings §11.1 (13 Aug 2026) then made it a LIVE chip: sub-rental is a
 *    line-level property and the booking-level answer is derived from the
 *    lines, never stored. The chip narrows on that derivation, server-side —
 *    see `data/rentals.ts`'s `subRentalBookingIds`.
 *
 * **Kept**, because no prose removes them (rulings §1): the KPI strip, the
 * pagination footer, the Filters rail (ten of eleven groups inert) and the
 * disabled Timeline toggle. The last two are the register's own named deletion
 * candidates; they are flagged there, not deleted here.
 */

/** Law 11 — colour + icon + label. The glyph comes from the token (`lib/status.ts:52`), so no call site can ship a bare colour chip. */
function Tag({ text, status }: { text: string; status: StatusKey }) {
  const c = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
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
      <Icon name={STATUS_ICON[status] as IconName} size={10} />
      {text}
    </span>
  )
}

/**
 * ## External / sub-rented gear — the gold outline, plus the two things Law 11
 * requires beside it
 *
 * §4.1's legend reads "gold outline row = external gear" and §4.2's Notes say
 * "sub-rented lines carry the gold outline; that is the only gold in the page".
 * `PLAN.md` §0 Law 11 outranks both drawings: **never colour alone — every
 * status is icon + label + colour.** The token layer already anticipated this —
 * `lib/status.ts` gives `ext` a border (the gold outline, never a fill) and
 * pairs it with `external_link`.
 *
 * ⚠ The icon name is written out rather than read from `lib/status.ts`'s
 * `STATUS_ICON`, which is typed `Record<StatusKey, string>` — a bare `string`.
 * Two of its seven values (`neutral: 'circle_dashed'`, `progress: 'progress'`)
 * name icons the `Icon` REGISTRY does not have, so indexing it and casting to
 * `IconName` compiles and then renders `undefined`, which React throws on.
 * Typing against `IconName` here makes `tsc` check the name instead. The two
 * bad entries are reported, not patched here — that file is outside this pass.
 *
 * So the marker is all three at once: the outline, the icon, and the word
 * "Sub-rented", which is also its accessible name. A screen reader and a
 * monochrome print both get the fact; the gold is the fourth carrier, not the
 * only one.
 *
 * ⚠ It fires on `isExternal === true` and on nothing else. `null` is "the set
 * has not arrived / could not be read", and rendering those rows as *not*
 * external would be a fabricated figure — see `RentalListRow.isExternal`.
 */
const EXTERNAL_LABEL = 'Sub-rented — external gear'
const EXTERNAL_ICON: IconName = 'external_link'

/** Stage chip icons, typed against the REGISTRY — see `ExternalGearMark` above. */
const STAGE_ICON: Record<BookingStatus, IconName> = {
  Quote: 'file',
  Booked: 'check',
  Packed: 'box',
  'On Rent': 'truck',
  Returned: 'return_arrow',
  Closed: 'lock',
}

function ExternalGearMark() {
  return (
    <span
      aria-label={EXTERNAL_LABEL}
      title={EXTERNAL_LABEL}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 18,
        padding: '0 6px',
        borderRadius: 5,
        // §4.2 — gold is an outline, never a fill.
        background: STATUS.ext.bg,
        color: STATUS.ext.fg,
        border: `1px solid ${STATUS.ext.border ?? 'var(--border)'}`,
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={EXTERNAL_ICON} size={11} />
      Sub-rented
    </span>
  )
}

/** The row's own outline. Applied only when the row actually says `true`. */
function externalRowStyle(isExternal: boolean | null) {
  return isExternal === true
    ? { boxShadow: `inset 0 0 0 1px ${STATUS.ext.border ?? 'var(--border)'}` }
    : {}
}

/**
 * §4.1's stage chips — `(All)(Quote)(Booked)(Packed)(On Rent)(Returned)(Closed)`.
 * Same skin as the quick-filter chips below them so the row reads as one strip
 * at every width. 32px tall inside a 44px-tall row (Law 15 is satisfied by the
 * row's own padding, not by the chip alone).
 */
function stageChipStyle(on: boolean) {
  return {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 5,
    height: 32,
    padding: '0 12px',
    borderRadius: 'var(--r-sm)',
    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
    background: on ? 'var(--nav-active-bg)' : 'var(--card)',
    color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
    fontSize: 'var(--t-meta)',
    fontWeight: on ? 600 : 500,
    cursor: 'pointer' as const,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  }
}

/**
 * Four-step pipeline indicator — Booked → Packed → On Rent → Returned.
 *
 * It is never the only signal: the status pill beside it names the state in
 * words, so the dots add glanceable progress without carrying meaning alone.
 * The step comes from `BOOKING_STATUS[stage].order`, so it cannot disagree with
 * the pill it sits under.
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
 * and the theme decides what it looks like. The tone is a pure function of
 * `clients.id` (`avatarToneFor`), so one client wears one tone on every screen.
 */
function Avatar({ row }: { row: RentalListRow }) {
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
      <span>{row.monogram}</span>
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
 * It reads `data/booking.ts`'s `OPERATIONS` table directly, which is **not**
 * shared with Booking Detail's own header menu any more — a 9 Aug shell rewire
 * moved Booking Detail onto `OperationsShell`, which derives its job list from
 * `lib/workflow.ts`'s `JOBS`/`JOB_ORDER` engine instead. The two tables happen
 * to agree today, but that agreement is coincidental, not structural.
 *
 * Two consequences the render does not show:
 *   - the render's fifth entry, **Cleaning, is absent** — §1.5 ruled four verbs,
 *     not five ("Reset absorbs Cleaning");
 *   - entries the row's stage does not allow stay **visible and greyed with the
 *     reason on hover and focus** (§4.2), never hidden.
 */
/** Tallest the menu gets — Open Booking, the rule, and the four operations. */
const OPS_MENU_H = 200

function RowOperations({ row }: { row: RentalListRow }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))

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
            // Law 3 — cancellation is `cancelled_at`, and a cancelled booking
            // runs no operation.
            const enabled = !row.isCancelled && o.enabledAt.includes(row.status)
            const why = row.isCancelled
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
 * The one real facet in the Filters rail — an accordion over `STATUS_ORDER`
 * (Foundation's six stages, `lib/workflow.ts`), checkbox per stage. It is sent
 * to the server as one `chips: { stage: [...] }` group, INTERSECTED with the
 * quick-filter chip's own stage set (`rentalsQuery`), never replacing it.
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
 * A figure, or an explicit non-value while it is unknown.
 *
 * A KPI reading `0` during the first load, or after the query failed, is a
 * WRONG figure rather than a missing one — and "0 overdue" is a sentence the
 * floor would act on. Same helper, same reasoning, as `Today.tsx`.
 */
function countOf(list: { loading: boolean; error: string | null }, value: number | null): string {
  return list.loading || list.error !== null || value === null ? '—' : String(value)
}

/**
 * The pager's visible page numbers.
 *
 * ⛔ This used to be `Array.from({ length: pageCount })` — every page number,
 * always. Over a client-side array of eight rows that was one button; over a
 * server-side count it is one button per twenty bookings, so a real table would
 * render a wrapping wall of them. A fixed window keeps the control the same size
 * whatever the count is.
 */
function pageWindow(current: number, pageCount: number, span = 5): number[] {
  const start = Math.max(1, Math.min(current - Math.floor(span / 2), pageCount - span + 1))
  const end = Math.min(pageCount, start + span - 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

/**
 * Rentals List — Page Type: List. Built from render `77B52333` / `Rentals.PNG`.
 *
 * ## What this screen used to be
 *
 * It touched no database at all. Eight hardcoded rows in `data/rentals.ts`,
 * three `.filter()` calls and a `.slice()` over them, and a six-card KPI strip
 * of hand-typed strings that agreed with none of it (52 active rentals over
 * eight rows). Everything below is now a server-side predicate: the twelve
 * quick-filter chips, the Filters rail's Status accordion and the pager all
 * reach Postgres through `listBookings`, Law 2's one booking query. There is no
 * `.filter()` over fetched rows anywhere in this file.
 *
 * ## Law 6 — the only money this screen asks for
 *
 * `withDeposit` is passed **only** behind `useCanViewMoney()`. That is not a
 * formality: `bookings.deposit_required` is unmasked on the base table (there is
 * no `bookings_v`) and `bookings_select` is `auth_is_staff()`, which includes
 * Warehouse, Technician and Driver — so the query refusing to ask is the only
 * thing standing between the floor and a rupee figure. The Deposit column, the
 * money filter groups and the Payment Due chip are removed from their arrays
 * *before* render, so a money-blind session has no masked cell to un-hide.
 */
export default function RentalsList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const role: SystemRole = user ? user.role : 'Client'
  /** The single money gate. Mirrors `auth_can_view_money()` — see Law 6 above. */
  const money = useCanViewMoney()
  /**
   * `gateContext()` returns a fresh object literal on every call, so left
   * unmemoized it would break the row-intel memo on identity alone. Stable per
   * `role`.
   */
  const gctx = useMemo(() => gateContext(role), [role])

  const [view, setView] = useState<(typeof VIEWS)[number]>('Table')
  const [hiddenCols, setHiddenCols] = useState<Set<OptionalColumn>>(new Set())

  /**
   * Rows-per-page rides the URL, but NOT through `useFilters`.
   *
   * It has to be on the query string or `?page=4` means different rows after a
   * refresh — page 4 of 20 is not page 4 of 50. It is not a *filter* though:
   * it narrows nothing, so it must not reach the Filters badge or the chip row,
   * which is what declaring it as an extra would do.
   *
   * Undeclared params are preserved untouched by `writeFilterParams`, so the
   * page can own this one directly and the two writers compose.
   */
  const [rawParams, setRawParams] = useSearchParams()
  const perPage = useMemo(() => {
    const n = Number(rawParams.get('per'))
    return (ROWS_PER_PAGE as readonly number[]).includes(n) ? n : 20
  }, [rawParams])

  /**
   * §18 — this screen's filters ARE the query string.
   *
   * Refresh keeps them, Back undoes one, and "the four overdue Kathmandu
   * bookings" is a link rather than a screenshot.
   *
   * `quick` is an **extra**, not a chip group, and that distinction is the whole
   * reason extras exist: `Overdue` means "out now, past its return time, never
   * actually returned" — a date comparison and two presence flags that
   * `rentalsQuery` expands. There is no `view` column to put it in, and sending
   * `view IN ('Overdue')` to Postgres would be a 400 at best.
   */
  const urlSchema = useMemo(
    () => ({
      chips: ['stage'],
      dateColumn: 'pickup_at',
      /* `sub` is §11.1's chip. An extra rather than a chip group for the same
         reason `quick` is one: there is no `sub_rental` column to put in an
         `in ()`, because the fact is line-level and the booking-level answer is
         derived (`data/rentals.ts`'s `subRentalBookingIds`). It rides the URL so
         a refresh keeps it and "the sub-rented bookings out this week" is a
         link (§18). */
      extras: ['quick', 'sub'],
      pageSize: perPage,
      /* A query string is user input in the most literal sense — a bookmark
         someone edited, a link a chat client truncated, a URL from before a
         stage was renamed. Declaring the vocabulary means `?stage=Nonsense` is
         dropped at the parser, so the badge, the chip row and the query all
         agree it is not a filter. Validating it only on the way to
         `rentalsQuery` would leave the first two counting it. */
      allow: { stage: STATUS_ORDER, quick: Object.keys(CHIP_MEANS), sub: ['on'] },
    }),
    [perPage],
  )
  const f = useFilters({
    url: urlSchema,
    labels: { stage: 'Stage', quick: 'Quick filter', sub: 'Sub-Rental', pickup_at: 'Pickup' },
  })
  const page = f.page
  const setPage = f.setPage

  const setPerPage = useCallback(
    (n: number) => {
      setRawParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set('per', String(n))
          // Page 4 of 20 rows is not page 4 of 50 — resizing the page has to
          // return to the top or the pager points at rows that moved.
          next.delete('page')
          next.sort()
          return next
        },
        { replace: true },
      )
    },
    [setRawParams],
  )

  /**
   * A query string is user input in the most literal sense — a bookmark someone
   * edited, a link a chat client truncated, a URL from before a stage was
   * renamed. Both of these are validated against the real vocabulary rather
   * than cast, so `?quick=DropTable&stage=Nonsense` narrows to nothing odd: it
   * is simply not a filter.
   */
  const chip = useMemo<ChipKey>(() => {
    const raw = f.extras['quick']
    return raw && raw in CHIP_MEANS ? (raw as ChipKey) : 'All'
  }, [f.extras])

  /** §11.1's chip. `?sub=on` or nothing — no third state to validate. */
  const subOn = f.extras['sub'] === 'on'

  /**
   * ## Which bookings are sub-rental — asked once, read by both surfaces
   *
   * Rulings §11.1: a booking is sub-rental **if any of its lines is**, and the
   * booking-level answer is never stored. `subRentalBookingIds()` evaluates
   * that derivation over `booking_lines_v` and returns the set of booking ids.
   *
   * One request, two consumers, so they cannot disagree:
   *   - the `(Sub-Rental)` chip narrows the list query by it (server-side, as
   *     `chips: { id: [...] }`, so the count and the pager stay honest);
   *   - `withSubRental` marks each rendered row from the same set, which is
   *     what fires the gold outline.
   *
   * `ids === null` means **"not answered"** and never "none". It is the state
   * before the request lands and after it fails, and in both the chip refuses
   * to select rather than reporting an empty result it did not compute.
   */
  const [subIds, setSubIds] = useState<readonly string[] | null>(null)
  const [subPending, setSubPending] = useState(true)

  useEffect(() => {
    let live = true
    setSubPending(true)
    void subRentalBookingIds()
      .then((ids) => {
        if (!live) return
        setSubIds(ids)
      })
      /* A rejected promise must not leave the chip spinning forever: `null` and
         `pending: false` is the error state, and the chip says so (Law 12). */
      .catch(() => {
        if (live) setSubIds(null)
      })
      .finally(() => {
        if (live) setSubPending(false)
      })
    return () => {
      live = false
    }
  }, [])

  /** The same answer as a set, for the per-row marking. */
  const subIdSet = useMemo(() => (subIds === null ? null : new Set(subIds)), [subIds])

  const statusKey = (f.filters.chips?.stage ?? []).join(' ')
  const statuses = useMemo(
    () => (statusKey ? statusKey.split(' ').filter((s): s is BookingStatus => (STATUS_ORDER as readonly string[]).includes(s)) : []),
    [statusKey],
  )
  const statusFilter = useMemo(() => new Set(statuses), [statuses])

  const from = f.filters.dateRange?.fromAd ?? ''
  const to = f.filters.dateRange?.toAd ?? ''
  /**
   * The filter panel is now an overlay, not a column.
   *
   * It used to be a `SideRail`-shaped rail in this page's grid, and even
   * collapsed it held a 32px track that content could not reflow into — the
   * larger version of which is on record here: expanded at the app's own 1280px
   * baseline it pushed the row Operations menu off the edge of its scroll
   * container. `FilterDrawer` is `position: fixed`, so it costs zero layout at
   * every width, open or closed, and the table gets all of it back.
   */
  const [filtersOpen, setFiltersOpen] = useState(false)
  /**
   * The three layouts §4.1 draws, from one width reading (Law 14 — width
   * decides, never orientation; Law 13 — capability, never a platform name).
   *
   *  - **desktop ≥1180** — the full table beside the Filters rail.
   *  - **tablet 768–1179** — fewer columns (`BR# │ client │ dates │ badge │
   *    [prim]⋮`), chips in one scrolling row, and the Filters rail REFLOWED
   *    below the list rather than hidden (rulings §7: "collapse" means reflow).
   *  - **phone <768** — card rows, one primary action each.
   */
  const viewport = useViewport()
  const tabular = viewport !== 'phone'

  const chips = useMemo(() => chipsFor(money), [money])
  const filterGroups = useMemo(() => filterGroupsFor(money), [money])

  /** §8.3 — Deposit is not offerable as a column when money is not visible. */
  const optionalColumns = useMemo(() => OPTIONAL_COLUMNS.filter((c) => c !== 'Deposit' || money), [money])

  /*
   * The whole filter set: one chip plus the Status accordion, intersected.
   *
   * `impossible` is the case `ListFilters` cannot express — the operator's
   * Status picks do not intersect the chip's own stages. `applyListFilters`
   * treats an empty chip array as "no constraint", so sending it would return
   * EVERY stage. The set is not sent at all; the empty state renders instead.
   */
  const query = useMemo(
    () => rentalsQuery(chip, { from, to }, statuses, NOW_AD, { on: subOn, bookingIds: subIds }),
    [chip, from, to, statuses, subOn, subIds],
  )

  /* §6 — groups, not values. Three stages ticked is ONE thing being filtered
     on. `useFilters` counts the quick-filter extra alongside them, because it
     narrows the list exactly as the others do. */
  const isFiltered = f.activeCount > 0

  const clearFilters = f.clearAll

  /*
   * ⛔ `withDeposit` is the one dangerous argument in this file. See Law 6 in
   * the header — it is spread conditionally on `money` so a money-blind session
   * does not merely hide the column, it never names it in the select.
   */
  const fetchRentals = useCallback(
    async (filters: ListFilters): Promise<ListQueryResult<RentalListRow>> => {
      if (query.impossible) return { rows: [], total: 0 }
      const res = await listBookings({ ...filters, withCount: true, ...(money ? { withDeposit: true } : {}) })
      return { rows: res.rows.map((r) => toRentalListRow(r, NOW_AD)), total: res.total ?? null }
    },
    [query.impossible, money],
  )

  /* Server-side paging. `withCount: true` is what makes "Showing X to Y of Z"
     a count of the whole matching set rather than of the page in hand. */
  const listFilters: ListFilters = { ...query.filters, page: { index: page - 1, size: perPage } }
  const list = useList<RentalListRow>(fetchRentals, listFilters, { isFilteredOverride: isFiltered })

  const total = list.total
  const pageCount = total === null ? 1 : Math.max(1, Math.ceil(total / perPage))

  /*
   * A stale page past the end of a freshly-narrowed list would ask Postgres for
   * rows that do not exist and render a blank table with a live pager. Every
   * filter control already resets to page 1; this is the net under them.
   *
   * ⚠ `total === null` is not "no rows", it is "the count has not arrived".
   * `pageCount` collapses to 1 while it is null, so without this guard the very
   * first render of `/rentals?page=4` would clamp to page 1 and rewrite the URL
   * before the count could disagree — §18's "refresh keeps where you were"
   * would hold for every filter except the page number. Harmless while `page`
   * started life at 1 in local state; reachable the moment it comes from a URL.
   */
  useEffect(() => {
    if (total === null) return
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount, total, setPage])

  /*
   * The four KPI counts, four fixed calls in a fixed order — never a loop, so
   * the hook order cannot change between renders. Each asks for a single row
   * (`page` size 1) and reads `total`, so the cost is four counts, not four
   * lists. `isFilteredOverride: false` because a KPI is never "filtered": its
   * set is the card's own definition and no operator input reaches it.
   *
   * NONE of them passes `withDeposit`.
   */
  const countFetcher = useCallback((filters: ListFilters) => listBookings({ ...filters, withCount: true }), [])
  const activeKpi = useList<BookingListRow>(countFetcher, RENTAL_KPI_FILTERS.active, { isFilteredOverride: false })
  const pickupsKpi = useList<BookingListRow>(countFetcher, RENTAL_KPI_FILTERS.pickups, { isFilteredOverride: false })
  const returnsKpi = useList<BookingListRow>(countFetcher, RENTAL_KPI_FILTERS.returns, { isFilteredOverride: false })
  const overdueKpi = useList<BookingListRow>(countFetcher, RENTAL_KPI_FILTERS.overdue, { isFilteredOverride: false })

  const refreshAll = useCallback(() => {
    list.refetch()
    activeKpi.refetch()
    pickupsKpi.refetch()
    returnsKpi.refetch()
    overdueKpi.refetch()
  }, [list.refetch, activeKpi.refetch, pickupsKpi.refetch, returnsKpi.refetch, overdueKpi.refetch])

  /*
   * ⛔ Six hardcoded cards became four counted ones.
   *
   * `Payment Due` (Rs 142,000) and `Utilization` (84%) are ABSENT rather than
   * dashed: no query in `lib/queries/` produces either, and a card whose value
   * can only ever be a dash is a promise the screen cannot keep. Both already
   * live in Reports ▸ Pulse. The hand-typed sub-lines ("8 Pending • 6
   * Completed", "4 Overdue • 7 Expected") and the "6 since yesterday" delta are
   * gone for the same reason — each note now states the card's own predicate,
   * which is a fact about the query rather than a second figure.
   */
  const kpis: Kpi[] = [
    { label: 'Active Rentals', value: countOf(activeKpi, activeKpi.total), icon: 'briefcase', accent: 'primary', note: 'On Rent now' },
    { label: 'Today Pickups', value: countOf(pickupsKpi, pickupsKpi.total), icon: 'truck', accent: 'primary', note: 'Booked and Packed' },
    { label: 'Today Returns', value: countOf(returnsKpi, returnsKpi.total), icon: 'return_arrow', accent: 'progress', note: 'Due back today, still out' },
    { label: 'Overdue', value: countOf(overdueKpi, overdueKpi.total), icon: 'alert_triangle', accent: 'danger', note: 'Past due, never returned' },
  ]

  /*
   * §11.1 — the derived sub-rental answer is applied HERE rather than in
   * `fetchRentals`, because the id set and the page of rows come from two
   * independent requests and either can land first. `useList` holds its fetcher
   * in a ref and re-runs only when the FILTERS change, so a set that arrives
   * after the rows would never reach them if the marking happened at fetch
   * time. `withSubRental` returns the row untouched when the answer has not
   * moved, so this does not churn.
   */
  const rowsWithIntel = useMemo(
    () =>
      list.rows.map((raw) => {
        const r = withSubRental(raw, subIdSet)
        return {
          row: r,
          glance: rentalGlance(r, gctx),
          detail: rentalDetailGroups(r, gctx),
        }
      }),
    [list.rows, subIdSet, gctx],
  )

  /**
   * §4.1's tablet table is `BR# │ client │ dates │ badge │ [prim]⋮` — four
   * columns, not seven. Items and Return are dropped at that width so the
   * remaining ones stay legible instead of every cell ellipsizing.
   *
   * ⚠ **Deposit is NOT dropped by width.** Money visibility is a ROLE rule
   * (Law 6), and this codebase branches money on width nowhere else; doing it
   * here would quietly invent a second, weaker rule beside the real one. It is
   * still available through the column chooser at every width, gated only on
   * `money`.
   */
  const NARROW_COLUMNS = new Set<OptionalColumn>(['Items', 'Return'])
  const show = (c: OptionalColumn) =>
    !hiddenCols.has(c) && (c !== 'Deposit' || money) && !(viewport === 'tablet' && NARROW_COLUMNS.has(c))
  const headers: string[] = [
    'Booking',
    'Client / Project',
    ...(show('Items') ? ['Items'] : []),
    ...(show('Pickup') ? ['Pickup'] : []),
    ...(show('Return') ? ['Return'] : []),
    'Status',
    ...(show('Deposit') ? ['Deposit'] : []),
  ]

  /* `All` is the absence of a quick filter, not a value of one — it drops the
     param rather than writing `?quick=All`, so an unfiltered list has a clean
     URL and the badge does not count a filter that filters nothing. */
  function pickChip(c: ChipKey) {
    f.setExtra('quick', c === 'All' ? undefined : c)
  }

  /* Both `useFilters` setters reset to page 1 themselves — see the hook's
     `put`. That is why neither of these calls `setPage`. */
  function toggleStatus(s: BookingStatus) {
    f.toggleChip('stage', s)
  }

  function setRange(fromAd: string, toAd: string) {
    f.setDateRange('pickup_at', fromAd || undefined, toAd || undefined)
  }

  const firstOnPage = (page - 1) * perPage + 1
  const lastOnPage = firstOnPage + list.rows.length - 1
  const countedTitle = total === null ? 'Rentals' : `${total} ${total === 1 ? 'Rental' : 'Rentals'} found`

  /**
   * The Filters panel's card.
   *
   * ⚠ This block used to claim the card "can sit in the grid's left track on
   * desktop and inline beneath the list below 1180". It cannot and does not:
   * `filtersCard` has exactly one render site, inside `<FilterDrawer>` near
   * the bottom of this file, which is `position: fixed` and opens from the
   * Filters button at **every** width. The accurate account is the earlier
   * comment on `filtersOpen` — "the filter panel is now an overlay, not a
   * column… it costs zero layout at every width" — and that is the single
   * account of this screen now.
   *
   * Why that does not breach Rulings §7: §7 governs the **right** rails whose
   * tablet drawings put rail content *below the list, still visible*. This is
   * a left filter panel, and spec 04's tablet drawing shows it as a `⌣`
   * disclosure rather than an always-visible band — a drawer is that
   * disclosure, reachable identically at all three widths. `CollapsibleAside`
   * is not involved either way, and its defaults are untouched.
   *
   * ⚠ Rulings §1 names this rail (ten of eleven groups inert) and the disabled
   * Timeline toggle as the strongest deletion candidates now that Status has
   * moved into the chip row. It says **leave them; raise separately** — so
   * they are both still here, flagged, not deleted. Its Status accordion reads
   * and writes the same `statusFilter` set the chip row does, so the two
   * surfaces are one filter with two doors, not two filters.
   */
  const filtersCard = (
    <Card
      title="Filters"
      action={
        isFiltered ? (
          <button
            type="button"
            onClick={clearFilters}
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
             is nothing behind it until something is actually narrowing. */
          <span
            style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', cursor: 'not-allowed' }}
            aria-disabled
            title="Nothing to clear yet — pick a stage chip above, or one of the quick filters beside it."
          >
            Clear all
          </span>
        )
      }
      bodyStyle={{ padding: 'var(--sp-sm)' }}
    >
      {/* Status is the one real facet: `bookings.stage` is a real column
          and the six values are Foundation's own, so the group goes to
          the server. TODO(decision): every other group needs a column or
          a join `listBookings` does not make — Rental Type and Tags have
          no column at all, Equipment Category is
          bookings → booking_lines → products.category_id, Client Type is
          clients.type_parent, Staff has no assignment table reaching a
          booking, and Location is free text rather than a facet. Each
          needs an embed-scoped filter `applyListFilters` cannot build.
          Until then they stay visibly unavailable rather than accordions
          that open onto nothing. */}
      {filterGroups.map((g) =>
        g.label === 'Status' ? (
          <StatusFilterGroup key={g.label} icon={g.icon} selected={statusFilter} toggle={toggleStatus} />
        ) : (
          <button
            key={g.label}
            type="button"
            disabled
            title={`The ${g.label} filter is not wired to the list yet — no column or join on the bookings list query carries it. Use the chips above.`}
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
        <Unavailable reason="Saved filters are not built yet — there is nowhere to store one and nothing settles who it is shared with.">
          <Button icon="flag" disabled>
            Save as new filter
          </Button>
        </Unavailable>
      </div>
    </Card>
  )

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
            <Button icon="refresh" onClick={refreshAll}>
              Refresh
            </Button>
            {/* ⛔ The Import button is GONE — §4.1 draws `[＋ New Rental]
                [Export]` and no third control. Nothing is lost: it was disabled
                with a reason and had no pipeline behind it.

                Export stays, and stays honestly disabled. The spec draws the
                button, not a built pipeline, and `CLAUDE.md`'s hard rule
                forbids inventing the two product decisions it needs — the file
                format, and which columns a role may export (a CSV of every
                column walks straight around Law 6's money masking). Recorded
                in `PLAN.md §4.22` rather than answered here. */}
            <Unavailable reason="Export is not built yet — nothing settles the file format, or which columns a role may export. A full-column export would also walk around Law 6's money masking, so it needs a role rule before it needs code.">
              <Button icon="download" variant="secondary" disabled>
                Export
              </Button>
            </Unavailable>
          </>
        }
      />

      {/* §4.1 — "one list, no tabs". The strip that used to sit here is gone
          with Productions; see the file header. */}
      <KpiStrip items={kpis} columns={kpis.length} />

      {/*
        ## The chip row — §4.1's two lines
        ```
        (All)(Quote)(Booked)(Packed)(On Rent)(Returned)(Closed)
        (Sub-Rental)  ← filter chip, not a tab   [▤ Table][▦ Cards]
        ```
        Line 1 is the **Status facet, moved out of the Filters rail** — the
        move rulings §1 anticipated. It is the same `statusFilter` state the
        rail's accordion writes, not a second copy, so the two surfaces
        cannot disagree; `rentalsQuery` still INTERSECTS it with the quick
        filter's own stage set (never replaces it), and reports an empty
        intersection as `impossible` rather than sending `[]`, which
        `applyListFilters` reads as "no constraint".

        Below 1180 the whole row scrolls horizontally instead of wrapping —
        §4.1's tablet note is "filter chips in one scrolling row" and its
        phone note is "chips scroll".
      */}
      <div
        role="group"
        aria-label="Filter by stage"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          ...(viewport === 'desktop'
            ? { flexWrap: 'wrap' as const }
            : { overflowX: 'auto' as const, paddingBottom: 2 }),
        }}
      >
        <button
          type="button"
          /* Empties the group rather than sending an empty `in()` — which
             `applyListFilters` reads as "no constraint", not "match nothing". */
          onClick={() => f.setChipGroup('stage', [])}
          aria-pressed={statusFilter.size === 0}
          style={stageChipStyle(statusFilter.size === 0)}
        >
          All
        </button>
        {STATUS_ORDER.map((s) => {
          const on = statusFilter.has(s)
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              aria-pressed={on}
              style={stageChipStyle(on)}
            >
              {/* Law 11 — the stage's own icon beside its own word. */}
              <Icon
                name={STAGE_ICON[s]}
                size={13}
                style={{ color: on ? 'var(--nav-active-accent)' : STATUS[statusToken(s)].fg }}
              />
              {s}
            </button>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          ...(viewport === 'desktop'
            ? { flexWrap: 'wrap' as const }
            : { overflowX: 'auto' as const, paddingBottom: 2 }),
        }}
      >
        {/*
          (Sub-Rental) — §4.1 line 40, "a filter chip, not a tab", and now a
          LIVE one: rulings §11.1 ruled the question it was disabled waiting
          on. It narrows on the derived set (`subIds`), AND-ed with whichever
          stage and quick filters are on, because it sits on its own line in
          §4.1's drawing rather than inside the twelve.

          It refuses to select in exactly two states, and never selects and
          quietly returns the unfiltered list: while the set is still in
          flight, and if reading it failed. `null` is "not answered", never
          "none" — see `subIds`.
        */}
        {subIds === null ? (
          <Unavailable reason={subPending ? SUB_RENTAL_PENDING : SUB_RENTAL_UNANSWERED}>
            <button
              type="button"
              disabled
              aria-busy={subPending}
              aria-label={`Sub-Rental — unavailable. ${subPending ? SUB_RENTAL_PENDING : SUB_RENTAL_UNANSWERED}`}
              style={{ ...stageChipStyle(false), color: 'var(--muted)', cursor: 'not-allowed', opacity: 0.65 }}
            >
              <Icon name="external_link" size={13} style={{ color: 'var(--disabled)' }} />
              Sub-Rental
            </button>
          </Unavailable>
        ) : (
          <button
            type="button"
            onClick={() => f.setExtra('sub', subOn ? undefined : 'on')}
            aria-pressed={subOn}
            title={SUB_RENTAL_NOTE}
            style={stageChipStyle(subOn)}
          >
            {/* Law 11 — the gold outline is never the only carrier, so the chip
                that turns it on carries the same icon and the same word. */}
            <Icon
              name="external_link"
              size={13}
              style={{ color: subOn ? 'var(--nav-active-accent)' : STATUS.ext.fg }}
            />
            Sub-Rental
          </button>
        )}

        <span aria-hidden style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        {chips.map((c) => {
          const on = chip === c.label
          const tint =
            c.tone === 'danger' ? 'var(--danger-text)' : c.tone === 'progress' ? 'var(--progress-text)' : undefined
          const style = {
            display: 'inline-flex' as const,
            alignItems: 'center' as const,
            gap: 5,
            height: 32,
            padding: '0 12px',
            borderRadius: 'var(--r-sm)',
            border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
            background: on ? 'var(--nav-active-bg)' : 'var(--card)',
            color: c.unavailable ? 'var(--muted)' : on ? 'var(--nav-active-accent)' : (tint ?? 'var(--text2)'),
            fontSize: 'var(--t-meta)',
            fontWeight: on || (tint && !c.unavailable) ? 600 : 500,
            cursor: c.unavailable ? ('not-allowed' as const) : ('pointer' as const),
            fontFamily: 'inherit',
            whiteSpace: 'nowrap' as const,
            opacity: c.unavailable ? 0.65 : 1,
            // The row scrolls rather than wraps below 1180 (§4.1 tablet and
            // phone both say "chips scroll"), so a chip must not be squeezed.
            flexShrink: 0,
          }

          /* A chip with no query behind it is genuinely `disabled` and
             carries the reason, rather than selecting and quietly returning
             the unfiltered list. `Unavailable` puts the sentence on hover,
             on focus and on long-press. */
          if (c.unavailable) {
            return (
              <Unavailable key={c.label} reason={c.unavailable}>
                <button type="button" disabled aria-label={`${c.label} — unavailable. ${c.unavailable}`} style={style}>
                  {c.label}
                </button>
              </Unavailable>
            )
          }

          return (
            <button key={c.label} type="button" onClick={() => pickChip(c.label)} aria-pressed={on} style={style}>
              {c.label === 'Custom' && <Icon name="calendar" size={14} />}
              {c.label}
            </button>
          )
        })}

        <span
          role="group"
          aria-label="List view"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 'var(--sp-xs)',
            padding: 3,
            borderRadius: 10,
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            flexShrink: 0,
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
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={on} style={btnStyle}>
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
              onChange={(e) => setRange(e.target.value, to)}
              style={dateInput}
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setRange(from, e.target.value)}
              style={dateInput}
            />
          </label>
          {(from || to) && (
            <Button icon="close" onClick={() => setRange('', '')}>
              Clear range
            </Button>
          )}
          {/* ⛔ This used to read "pickup **or** return". It cannot: a
              `ListFilters.dateRange` names one column, and `applyListFilters`
              has no way to OR two ranges across two columns. The sentence
              says what the query does. */}
          <span style={{ color: 'var(--muted)' }}>
            Matches a booking whose <strong style={{ color: 'var(--text2)' }}>pickup</strong> falls inside the range.
            A return-date range needs a second dateRange the shared filter shape does not carry.
          </span>
        </div>
      )}

      {/* Which filters are on, and a one-click way off each of them — straight
          from the hook, so the row, the badge and the query cannot disagree.
          Renders nothing when the list is unfiltered. */}
      <ActiveFilterChips filters={f.chips} {...(isFiltered ? { onClearAll: clearFilters } : {})} />

      <div
        style={{
          display: 'grid',
          /* One track at every width now. The rail used to take a column here
             — `auto minmax(0,1fr)` on desktop, reflowing under the list below
             1180 — and the drawer replaced both: it is `position: fixed`, so
             there is no track to give it and no reflow rule to write. */
          gridTemplateColumns: 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
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
            title={countedTitle}
            action={
              <>
                {/* Was a disabled "More Filters" whose reason read *"no filter
                    drawer exists yet"*. One does now, and it holds the same
                    facets the rail held — this is that button, enabled. */}
                <FilterButton
                  onClick={() => setFiltersOpen((o) => !o)}
                  activeCount={f.activeCount}
                  controls="rentals-filters"
                  expanded={filtersOpen}
                />
                <Unavailable reason="Saved views are not built yet — nothing settles where a view is stored or who it is shared with.">
                  <Button icon="flag" disabled>
                    Save View
                  </Button>
                </Unavailable>
              </>
            }
            bodyStyle={{ padding: 0 }}
          >
            {/*
              Fixed ladder: restricted → error → loading → empty → children.

              `hasRows` is what keeps a failed REFRESH from blanking a list
              someone is reading: with rows on screen the banner renders
              above them instead of replacing them, which is the shape
              `PageBody` documents for exactly this case.

              `empty` also covers `query.impossible` — the Status picks that
              do not intersect the chip. Nothing was sent to Postgres, and
              "no rentals match these filters" is the true answer.
            */}
            <PageBody
              /* With `?sub=on` the screen is waiting on TWO requests, and the
                 derived set is the one the chip cannot narrow without. Holding
                 the skeleton up until it lands is what stops a "no rentals
                 match these filters" flashing over a question still in flight —
                 `query.impossible` is true for that whole window by design. */
              loading={list.loading || (subOn && subPending)}
              /* Law 12 — inline and persistent. A sub-rental read that failed
                 is a real error on a screen filtering by it, not a silent
                 empty list. */
              error={subOn && !subPending && subIds === null ? SUB_RENTAL_UNANSWERED : list.error}
              onRetry={refreshAll}
              hasRows={list.rows.length > 0}
              empty={list.isEmpty || query.impossible}
              emptyIsFiltered={list.isFiltered}
              onClearFilters={clearFilters}
              noun="rentals"
              skeleton="table"
              skeletonRows={6}
              emptyTitle={isFiltered ? 'No rentals match these filters' : 'No rentals yet'}
              emptyMessage={
                /* Three different emptinesses, and saying which one it is
                   matters: an empty derived set is a fact about the corpus, an
                   empty stage intersection is a fact about the filters, and
                   neither is "nothing exists". */
                subOn && subIds !== null && subIds.length === 0
                  ? 'No booking carries a sub-rented line. Sub-Rental is derived from booking_lines.line_type — a booking counts when any of its lines does — and no line in this corpus is one.'
                  : query.impossible
                    ? `The “${chip}” chip covers ${CHIP_MEANS[chip]}, and none of the stages you ticked is in it.`
                    : isFiltered
                      ? `“${chip}” covers ${CHIP_MEANS[chip]}${subOn ? ', narrowed to bookings carrying a sub-rented line' : ''}. Nothing matches right now.`
                      : 'No booking has been created yet.'
              }
            >
              {(view === 'Cards' || !tabular) && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {rowsWithIntel.map(({ row: r, glance, detail }) => (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--sp-sm)',
                        padding: '13px 14px',
                        borderBottom: '1px solid var(--border)',
                        // §4.1 — "gold outline row = external gear". Fires
                        // only on a real `true`; `null` is "not answered" and
                        // leaves the row unmarked (§11.1, Law 11).
                        ...externalRowStyle(r.isExternal),
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <Avatar row={r} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                            {r.client}
                          </span>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 1 }}>
                            {r.project ?? '—'}
                          </span>
                        </span>
                        {/* §8.3 — omitted, never shown blank. `deposit` is
                            null when the query did not ask, which is the
                            money-blind case. */}
                        {show('Deposit') && (
                          <span style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                              {r.deposit === null ? '—' : formatMoney(r.deposit)}
                            </span>
                            <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                              Deposit
                            </span>
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
                            gap: 4,
                            background: STATUS[r.statusKey].bg,
                            color: STATUS[r.statusKey].fg,
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                          }}
                        >
                          {/* Law 11 — `STAGE_ICON` was declared for this and used
                              only by the filter chips, so the row's own status
                              was colour + word alone. */}
                          <Icon name={STAGE_ICON[r.status]} size={11} />
                          {r.status}
                        </span>
                        {r.isOverdue && <Tag text="Overdue" status="danger" />}
                        {r.isCancelled && <Tag text="Cancelled" status="danger" />}
                        {/* Law 11 — the gold outline never travels alone. */}
                        {r.isExternal === true && <ExternalGearMark />}
                      </span>

                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <Icon name="box" size={12} style={{ color: 'var(--muted)' }} />
                        <span className="figure">{r.itemCount}</span> item{r.itemCount === 1 ? '' : 's'}
                      </span>

                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <Icon name="calendar" size={12} style={{ color: 'var(--muted)' }} />
                        Pickup <span className="figure">{r.pickup.date}</span> {r.pickup.time}
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
                  ))}
                </div>
              )}

              {view === 'Table' && tabular && (
                /*
                  §4.1, last line of the desktop box:
                  "← action column stays visible; table scrolls horizontally"

                  That is a real requirement, not decoration — the row's `⋮`
                  is the only way to reach an operation from the list, and a
                  1040px-wide table on a 900px tablet scrolls it off the
                  right edge exactly when the floor needs it.

                  `position: sticky` on the last cell of each row pins it to
                  the scroller's right edge. Two details make it work rather
                  than merely apply:
                    - the cell needs its OWN opaque background, or the
                      columns sliding underneath show through it;
                    - `borderCollapse: collapse` drops a sticky cell's own
                      border in several engines, so the divider is a
                      `boxShadow` instead.
                  `minWidth` narrows at tablet because two columns are
                  dropped there (see `NARROW_COLUMNS`).
                */
                <div data-table-scroll style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      minWidth: viewport === 'tablet' ? 720 : 1040,
                    }}
                  >
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        {headers.map((h) => (
                          <th key={h} style={th}>
                            {h}
                          </th>
                        ))}
                        <th style={stickyTh}>
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
                      {rowsWithIntel.map(({ row: r, glance, detail }) => (
                        <tr
                          key={r.id}
                          style={{ borderBottom: '1px solid var(--border)', ...externalRowStyle(r.isExternal) }}
                        >
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
                              {/* ⛔ "Booked 12 Jul" became "Created …".
                                  `created_at` is the row's insert instant,
                                  not the Booked-stage transition — a quote
                                  confirmed a week later would carry the
                                  quote's date. */}
                              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                                Created <span className="figure">{r.createdOn}</span>
                              </div>
                              {(r.isOverdue || r.isCancelled || r.isExternal === true) && (
                                <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {r.isOverdue && <Tag text="Overdue" status="danger" />}
                                  {r.isCancelled && <Tag text="Cancelled" status="danger" />}
                                  {/* Law 11 — outline + icon + label, never
                                      the gold on its own. */}
                                  {r.isExternal === true && <ExternalGearMark />}
                                </div>
                              )}
                            </IntelCard>
                          </td>

                          <td style={td}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <Avatar row={r} />
                              <span style={{ minWidth: 0 }}>
                                <Link
                                  to={`/clients/${r.clientId}`}
                                  style={{
                                    display: 'block',
                                    fontSize: 'var(--t-meta)',
                                    fontWeight: 700,
                                    color: 'var(--text)',
                                    textDecoration: 'none',
                                  }}
                                >
                                  {r.client}
                                </Link>
                                {/* `project` is nullable (0002:28). A null
                                    renders as an explicit non-value — never
                                    as a kit name, which is what this cell
                                    used to invent. */}
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: 'var(--t-meta)',
                                    color: 'var(--text2)',
                                    marginTop: 1,
                                  }}
                                >
                                  {r.project ?? '—'}
                                </span>
                                {/* `pickup_location` is free text and
                                    nullable. The crew label that used to sit
                                    beside it had no column at all. */}
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: 'var(--t-meta)',
                                    color: 'var(--muted)',
                                    marginTop: 1,
                                  }}
                                >
                                  {r.pickupLocation ?? '—'}
                                </span>
                              </span>
                            </span>
                          </td>

                          {show('Items') && (
                            <td style={td}>
                              <span
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 'var(--sp-xs)',
                                  fontSize: 'var(--t-meta)',
                                  color: 'var(--text)',
                                }}
                              >
                                <Icon name="box" size={12} style={{ color: 'var(--muted)' }} />
                                {/* Units across live lines — `sum(qty)`, not
                                    a count of rows. */}
                                <span className="figure">{r.itemCount}</span> item{r.itemCount === 1 ? '' : 's'}
                              </span>
                            </td>
                          )}

                          {(['Pickup', 'Return'] as const)
                            .filter((c) => show(c))
                            .map((c) => {
                              const m = c === 'Pickup' ? r.pickup : r.ret
                              const place = c === 'Pickup' ? r.pickupLocation : r.returnLocation
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
                                    {/* §3 / Law 7 — AD rendering belongs to
                                        lib/bs.ts, in Kathmandu. */}
                                    <span className="figure">{m.date}</span>
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
                                  {/* The named handler this cell used to show
                                      ("Ramesh") had no column and no join.
                                      The location does. */}
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
                                    <Icon name="home" size={12} style={{ color: 'var(--muted)' }} />
                                    {place ?? '—'}
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
                                gap: 4,
                                background: STATUS[r.statusKey].bg,
                                color: STATUS[r.statusKey].fg,
                                fontSize: 'var(--t-meta)',
                                fontWeight: 600,
                              }}
                            >
                              <Icon name={STAGE_ICON[r.status]} size={11} />
                              {r.status}
                            </span>
                            {/* The stage is one of Foundation's six; the only
                                note that survives is the one `overdue()`
                                defines. "Preparing" / "Ready for pickup" /
                                "Awaiting inspection" restated the pill. */}
                            {r.statusNote && (
                              <span
                                style={{
                                  display: 'block',
                                  marginTop: 4,
                                  fontSize: 'var(--t-meta)',
                                  fontWeight: 600,
                                  color: 'var(--danger-text)',
                                }}
                              >
                                {r.statusNote}
                              </span>
                            )}
                            <Track step={r.progress} tone={r.progressTone} />
                          </td>

                          {/* §8.3 — the cell is omitted, not emptied. */}
                          {show('Deposit') && (
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
                                {r.deposit === null ? '—' : formatMoney(r.deposit)}
                              </span>
                            </td>
                          )}

                          {/* §4.1 — stays visible while the table scrolls. */}
                          <td style={stickyTd}>
                            <RowOperations row={r} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PageBody>

            {/* The pager reports the SERVER's count, not the array's length.
                Rendered only once rows have arrived — "Showing 0 rentals"
                over a skeleton is a claim, not a placeholder. */}
            {list.rows.length > 0 && (
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
                  {total === null
                    ? `Showing ${firstOnPage} to ${lastOnPage} rentals`
                    : `Showing ${firstOnPage} to ${lastOnPage} of ${total} rentals`}
                </span>

                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <PageBtn label="‹" disabled={page === 1} onClick={() => setPage(page - 1)} />
                  {pageWindow(page, pageCount).map((p) => (
                    <PageBtn key={p} label={String(p)} active={p === page} onClick={() => setPage(p)} />
                  ))}
                  <PageBtn label="›" disabled={page >= pageCount} onClick={() => setPage(page + 1)} />
                </span>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  Rows per page
                  <select
                    value={perPage}
                    /* `setPerPage` drops `?page=` itself — page 4 of 20 rows is
                       not page 4 of 50, so resizing has to return to the top. */
                    onChange={(e) => setPerPage(Number(e.target.value))}
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
            )}
          </Card>
        )}

      </div>

      {/*
        The same card the rail held, in an overlay that costs no layout.

        `resultCount` is not decoration: on phone the panel covers the list, and
        on desktop it covers the left third of it, so the header count is what
        makes live filtering legible while you cannot see the rows move.

        Rulings §7 — "rails collapse below 1180" means reflow, not hide — is
        satisfied differently now and better: there is no rail to collapse, and
        the panel is reachable at every width from the same button.
      */}
      <FilterDrawer
        id="rentals-filters"
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        resultCount={list.loading ? null : total}
        noun={total === 1 ? 'rental' : 'rentals'}
        activeCount={f.activeCount}
        onClearAll={clearFilters}
      >
        {filtersCard}
      </FilterDrawer>

      <FooterNote
        extra={[
          'Cancelled bookings are retained, never deleted',
          `Quick filters are relative to ${formatAd(TODAY)}`,
          'Date chips narrow by pickup date — a return-date range needs a second dateRange the shared filter shape does not carry',
          SUB_RENTAL_NOTE,
          ...(money ? [RENTAL_DEPOSIT_NOTE] : []),
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

/**
 * The action column, pinned to the right edge of the horizontal scroller —
 * §4.1's "action column stays visible; table scrolls horizontally".
 *
 * Each cell carries its own opaque background because a sticky cell floats over
 * the columns sliding beneath it; without one they read straight through. The
 * divider is a `boxShadow` rather than a `borderLeft` because
 * `borderCollapse: collapse` drops a sticky cell's own border in several
 * engines, and `zIndex` keeps the pinned cell above the scrolled ones without
 * competing with `RowOperations`' own menu (`zIndex: 30`).
 */
const stickyTh = {
  ...th,
  textAlign: 'right' as const,
  position: 'sticky' as const,
  right: 0,
  zIndex: 2,
  background: 'var(--th-bg)',
  boxShadow: 'inset 1px 0 0 var(--border)',
}

const stickyTd = {
  ...td,
  width: 34,
  textAlign: 'right' as const,
  position: 'sticky' as const,
  right: 0,
  zIndex: 1,
  background: 'var(--card)',
  boxShadow: 'inset 1px 0 0 var(--border)',
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
