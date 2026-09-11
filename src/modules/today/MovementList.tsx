import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { ROWS_PER_COLUMN, ROW_MENU, timeOf, statusKeyOf, has, type MovementRow } from '../../lib/queries/today'
import { cardStyle } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import type { ListResult } from '../../lib/queries/useList'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { canRecordPayment } from '../../lib/rbac'
import { shouldFlipUp } from '../../lib/menuFlip'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { deliveryTypeLabel } from '../../lib/format'

interface MovementListProps {
  title: string
  badge: string
  badgeStatus: StatusKey
  /** Straight from `useList` — the four states are `PageBody`'s to choose between. */
  list: ListResult<MovementRow>
  /**
   * Which of the two named queries filled this list. It decides the row's ONE
   * primary action (spec 02 §2.1 draws `[Pack]` / `[Hand]` on outgoing rows and
   * `[Ret.]` on incoming ones), and it is passed rather than sniffed off
   * `MovementRow.kind`, for the same reason `toMovementRow` takes it: Return-ness
   * is which query asked, not something the booking row says.
   */
  side: 'outgoing' | 'incoming'
  /** `PageBody`'s noun and the "+ N more" noun: "pickups" / "returns". */
  noun: string
  /** "today", "this week" — completes the unfiltered empty state's sentence. */
  periodLabel: string
  viewAll: string
  /** Restores the page's default view. Reached from the empty state's one action. */
  onClearFilters: () => void
  /**
   * Whether the operator picked CHIPS, as opposed to only moving the period.
   * `list.isFiltered` cannot tell the two apart — Today.tsx marks the page
   * filtered whenever the period leaves Today, so the way back is offered —
   * but the empty-state SENTENCE must: "No pickups match these filters" over
   * a bare period change blames filters nobody touched (1 Sep sweep, #7).
   */
  filteredByChips: boolean
}

/**
 * **The row's one primary action** — spec 02 Notes: *"One primary button per
 * row; everything else behind ⋮."*
 *
 * Each of these is a **navigation** to the parameterised workspace route
 * (`App.tsx:180-211`, rulings §3 — "operations are routes; the shell becomes a
 * launcher"). None of them writes: rulings §8 and
 * `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` forbid a page telling the floor a
 * write landed when nothing was written, and no action here is marked
 * `implemented`. Completing a pickup or a return stays in the ⋮ menu, where
 * `actions/core.ts` refuses it out loud.
 *
 * The label follows the stage, so the button always names the next real step:
 * `todaysOutgoing` selects Booked and Packed only, so a Booked booking is packed
 * and a Packed one is handed over. Anything else — reachable only if the stage
 * set ever widens — falls back to opening the booking rather than guessing.
 */
export function primaryFor(
  r: Pick<MovementRow, 'bookingNo' | 'status'>,
  side: 'outgoing' | 'incoming',
): { label: string; to: string; hint: string } {
  if (side === 'incoming') {
    return { label: 'Return', to: `/rentals/${r.bookingNo}/return`, hint: 'Open the Return workspace' }
  }
  if (r.status === 'Packed') {
    return { label: 'Handover', to: `/rentals/${r.bookingNo}/handover`, hint: 'Open the Handover workspace' }
  }
  if (r.status === 'Booked') {
    return { label: 'Pack', to: `/rentals/${r.bookingNo}/packing`, hint: 'Open the Packing workspace' }
  }
  return { label: 'Open', to: `/rentals/${r.bookingNo}`, hint: 'Open the booking' }
}

function Pill({ text, status }: { text: string; status: StatusKey }) {
  const c = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 21,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: c.bg,
        color: c.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

/**
 * ⛔ The Complete Pickup / Complete Return DISPATCH was deleted here (1 Sep
 * Dashboard sweep), and the two entries became unavailable-with-reason.
 *
 * They could not succeed FROM THIS PAGE, by construction, ever:
 *
 *  - `completePickup` is a stub (`implemented: false`) — `createAction`
 *    refuses it before `execute`, for every input and every role.
 *  - `completeReturn` is real, but it writes `session_line_movements`, whose
 *    `booking_line_id` is NOT NULL — and a `MovementRow` carries an item COUNT
 *    and no line or unit ids (`listBookings` embeds `booking_lines(id, qty)`).
 *    This page structurally cannot supply what the write needs, so `validate`
 *    refused every dispatch with `lines: []`.
 *
 * A menu entry that LOOKS live and always lands on a refusal banner is this
 * file's own named defect one comment down: "a menu item that looks live and
 * moves nothing is the same defect as a nav link that does not navigate." The
 * previous shape at least surfaced the refusal inline (Law 12); this shape is
 * honest one step earlier, before the press — the same doctrine as the PIN
 * button on Login and the dimmed More Filters chips.
 *
 * The REAL verbs live in the workspaces, which know their units: the row's
 * primary action already routes there (`primaryFor` — Pack / Handover /
 * Return), and the hover card now carries the same workspace link instead of
 * a dead "Complete" button. When a floor-side one-tap completion is genuinely
 * wanted from this list, it needs the unit list in the query first — that is
 * a data-shape change, not a dispatch away.
 */

/** An explicit non-value. Never an empty string, which reads as "recorded blank". */
const NONE = '—'

/**
 * §12 — the 520px hover card. "Hover-only intel does not ship", so the same
 * card opens on long-press and on keyboard focus.
 *
 * ## What this card used to say, and why it no longer says it
 *
 * It rendered `HOVER[m.bookingNo] ?? HOVER_FALLBACK` — eight hand-typed strings
 * per booking, seeded for 2 of the 25 rows, including two rupee figures
 * ("Rs 50,000 held", "Rs 1,24,506 outstanding") on a screen Warehouse,
 * Technician and Driver can all open. Every fact below now comes off the
 * booking row itself.
 *
 * Five facts are GONE rather than dashed, because this query never asks the
 * questions and "Not recorded" would claim it did:
 *
 *  - **Deposit** — `bookings.deposit_required` exists but is unmasked money on
 *    a base table (Law 6; `bookings.ts` DEPOSIT block). It would need
 *    `withDeposit` behind `useCanViewMoney()`, and it is the figure REQUIRED,
 *    not the figure held.
 *  - **Payment** — `payments` (0006:176) is not joined here, and a paid-vs-due
 *    total is the Financial Engine's to compute, never a list row's.
 *  - **Documents** — `booking_documents` is not embedded.
 *  - **Staff** — `crew_bookings` (0003:1126) is the assignment table; not joined.
 *  - **Notes** — no notes column is selected by `listBookings`.
 */
function HoverCard({ m }: { m: MovementRow }) {
  const { user } = useAuth()
  const money = useCanViewMoney()
  const facts: Array<[string, string]> = [
    ['Project', m.project ?? NONE],
    ['Duration', m.duration],
    // Units across the booking's live lines — "Alexa Mini ×5" counts 5.
    ['Equipment', `${m.itemCount} ${m.itemCount === 1 ? 'item' : 'items'}`],
    // `delivery_type`'s enum members are data, not UI copy (Law 17 note).
    ['Delivery mode', deliveryTypeLabel(m.deliveryType)],
    ['Collect from', m.pickupLocation ?? NONE],
    ['Return to', m.returnLocation ?? NONE],
  ]
  const actions: Array<{ label: string, to?: string, onClick?: () => void }> = [
    { label: 'Open Booking', to: `/rentals/${m.bookingNo}` },
    /*
     * This entry does not open `RecordPaymentModal` — it routes to `/finance`,
     * where the real launcher lives. It still takes the launcher's permission:
     * `rbac.canRecordPayment` is Owner / Coordinator / Accounts, so for an
     * Admin or a Manager this said "Receive Payment" and landed them on a page
     * that (as of the same change) no longer offers the button. A verb that
     * cannot be carried out at its destination is a broken promise, not a
     * permission check.
     *
     * `money` stays alongside it: both questions are asked, and the narrower
     * one does not replace the other anywhere else in this file.
     */
    ...(money && user && canRecordPayment(user.role) ? ([{ label: 'Receive Payment', to: '/finance' }]) : []),
    /*
     * The card used to offer "Complete Pickup" / "Complete Return" here — two
     * buttons that could never succeed from this page (see the deleted-dispatch
     * note above `HoverCard`). The card now carries the row's own primary verb
     * instead: the WORKSPACE that records the movement for real, from
     * `primaryFor`, so the card and the row cannot name two different next
     * steps for one booking.
     *
     * "Packing List" survives only when the primary is not already the packing
     * route (a Booked row's primary IS "Pack") — two labels on one destination
     * is the defect the old "Print Checklist" entry had. That label is gone
     * for a second reason too: it navigated and never printed.
     */
    ...(() => {
      const p = primaryFor(m, m.kind === 'Return' ? 'incoming' : 'outgoing')
      const packing = `/rentals/${m.bookingNo}/packing`
      return [
        { label: p.label, to: p.to },
        ...(p.to === packing ? [] : [{ label: 'Packing List', to: packing }]),
      ]
    })(),
  ]
  return (
    <div
      /* Was role="tooltip" — wrong role for a panel with links and buttons in
         it: ARIA tooltips are non-interactive by contract, so AT users were
         told there was nothing here to operate. A grouped, labelled region is
         the honest description; the row's own focus/long-press handling opens
         and closes it, and its controls sit in the natural tab order. */
      role="group"
      aria-label={`Preview of booking ${m.bookingNo} for ${m.client}`}
      data-overlay
      style={{
        position: 'absolute',
        top: 'calc(100% - 4px)',
        left: 10,
        zIndex: 45,
        /* 340px was the desktop nav rail plus the page gutter. Below 768 the
           nav is a bottom bar, so subtracting it left the long-press card 35px
           wide on a 375px phone — a card that only exists for touch, unreadable
           on the only devices that can open it. `max()` keeps the desktop
           measurement while giving the phone a real width. */
        width: 'min(520px, max(260px, calc(100vw - 340px)))',
        padding: 16,
        borderRadius: 'var(--r-card)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-modal)',
        textAlign: 'left',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 10 }}>
        <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{m.client}</span>
        <span className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--link)', fontWeight: 600 }}>{m.bookingNo}</span>
        <span style={{ marginLeft: 'auto' }}>
          <Pill text={m.status} status={statusKeyOf(m)} />
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
        {facts.map(([l, v]) => (
          <div key={l} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {l}
            </div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.4 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {actions.map(({ label, to, onClick }) => {
          const style = {
            // Law 15 — 44×44 at every width; these are the hover card's real actions.
            minHeight: 44,
            padding: '0 11px',
            borderRadius: 'var(--r-btn)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
            color: 'var(--text2)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }
          if (to) {
            return (
              <Link key={label} to={to} onClick={(e) => e.stopPropagation()} style={style} className="lift">
                {label}
              </Link>
            )
          }
          return (
            <button key={label} type="button" onClick={(e) => { e.stopPropagation(); onClick?.(); }} style={style} className="lift">
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Tallest the menu gets — all 14 `ROW_MENU` entries, one per row, plus padding. */
const ROW_MENU_H = 460

/**
 * §13 — the row menu. Open is first; it is also the row's primary action.
 *
 * Entries that can act, act. The rest are **explicitly** unavailable with a
 * reason rather than silently doing nothing — a menu item that looks live and
 * moves nothing is the same defect as a nav link that does not navigate.
 * `WhatsApp`, `Call` and `Email` are disabled because `listBookings` joins
 * `clients(name)` and nothing else; inventing a number would put a fake one
 * behind a `tel:` link.
 */
function RowMenu({ onClose, m, up }: { onClose: () => void; m: MovementRow; up: boolean }) {
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { showSuccessToast } = useToast()
  const booking = `/rentals/${m.bookingNo}`

  const entries = ROW_MENU.filter((e) => money || e !== 'Invoice')

  const actions: Partial<Record<(typeof ROW_MENU)[number], () => void>> = {
    Open: () => navigate(booking),
    'Packing List': () => navigate(`${booking}/packing`),
    Invoice: () => navigate('/documents'),
    'Copy Booking Number': () => {
      void navigator.clipboard?.writeText(m.bookingNo)
      showSuccessToast('Copied', `Booking number ${m.bookingNo} copied to clipboard.`)
    },
  }
  /*
   * 1 Sep sweep — three entries moved DOWN here from `actions`, because each
   * wore a verb it did not perform (this file's own rule, in the header above):
   *
   *  - **Edit** navigated to exactly where Open navigates. A second label on
   *    the same behaviour is not an action, and there is no booking-edit
   *    surface for it to open — the booking page's own controls (Extend,
   *    payments, notes) are the editing that exists.
   *  - **Print Checklist** printed nothing — it opened the Packing workspace,
   *    which "Packing List" one row down already does under an honest name.
   *  - **Complete Pickup / Complete Return** could never succeed from this
   *    page (stub action; no unit list in this query) — see the
   *    deleted-dispatch note above `HoverCard`. The workspaces the row's
   *    primary button opens are where these movements are recorded for real.
   */
  const why: Partial<Record<(typeof ROW_MENU)[number], string>> = {
    Edit: 'No booking-edit surface exists — Open shows the booking, whose own controls (Extend, payments, notes) are the editing that is built',
    'Print Checklist': 'Printing is not built anywhere — Packing List opens the workspace the checklist lives in',
    'Complete Pickup': 'This list cannot record a pickup — the Handover workspace (the row’s own button) records it with the actual units',
    'Complete Return': 'This list carries no unit list, and a return is written per unit — the Return workspace records it for real',
    QR: 'QR rendering lands with the Evidence matcher',
    WhatsApp: 'listBookings joins clients(name) only — no contact number',
    Call: 'listBookings joins clients(name) only — no contact number',
    Email: 'listBookings joins clients(name) only — no contact address',
    Duplicate: 'Needs the booking engine',
    Cancel: 'Cancelling is a confirmed, audited action — not a menu click',
  }

  return (
    <div
      role="menu"
      data-overlay
      style={{
        position: 'absolute',
        ...(up ? { bottom: 26 } : { top: 26 }),
        right: 0,
        zIndex: 45,
        minWidth: 190,
        padding: 5,
        borderRadius: 'var(--r-btn)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-modal)',
        textAlign: 'left',
      }}
    >
      {entries.map((entry) => {
        const act = actions[entry]
        return (
          <button
            key={entry}
            type="button"
            role="menuitem"
            aria-disabled={act ? undefined : true}
            title={act ? undefined : why[entry]}
            onClick={(e) => {
              e.stopPropagation()
              if (!act) return
              onClose()
              act()
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '5px 8px',
              border: 'none',
              borderRadius: 'var(--r-xs)',
              background: 'transparent',
              color: !act ? 'var(--muted)' : entry === 'Cancel' ? 'var(--danger-text)' : 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: entry === 'Open' ? 600 : 500,
              textAlign: 'left',
              cursor: act ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {entry}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Dashboard.md §6–§7 — the Pickups and Returns columns.
 *
 * §6: time on one line (not stacked), and the row's primary action is
 * **Open Booking** — stated, not implied.
 * §7: an overdue row carries a left border in `--bad`. Nothing else does, so
 * the border discriminates rather than decorates.
 * §6 again: "Minimum 6 rows visible per column before '+ N more'." The count in
 * the more-link is derived from the same list, so it can never say "5 more"
 * over a list of fourteen the way the reference render did.
 *
 * ## Fields the render lost when the seed did
 *
 * The seeded `Movement` carried six things `bookings` does not have a column
 * for, and none of them is faked here:
 *
 *  - **the package name** ("RED Komodo X Package") — the chip now shows
 *    `itemCount`, which is `sum(booking_lines.qty)` over live lines. A real
 *    number in place of an invented name, and labelled as what it is.
 *  - **`kitStatus`** — that chip's tint was a second status with no source. It
 *    is `neutral` for every row now: a tone, carrying no claim.
 *  - **`category`** ("Commercial Shoot") — replaced by `bookings.project`, the
 *    booking's own title, which is a different and real field. Null renders "—".
 *  - **`staff`** ("Pickup: Ramesh") — removed outright. `crew_bookings`
 *    (0003:1126) holds assignments and is not joined; a name here would be
 *    invented. The line now carries the due stamp alone.
 *  - **the VIP badge** — removed. `clients` carries `segments[]` and `tags[]`
 *    (0005:66,70) but no VIP member, so no row can honestly wear it.
 *  - **the "Due Soon" amber border** — removed. It needs a "how soon" window no
 *    spec in this repo states. Overdue (red) and outgoing (blue) survive
 *    because both are predicates the query itself already encodes.
 */
export default function MovementList({
  title,
  badge,
  badgeStatus,
  list,
  side,
  noun,
  periodLabel,
  viewAll,
  onClearFilters,
  filteredByChips,
}: MovementListProps) {
  const navigate = useNavigate()
  /* Law 14 — width decides. Below 768 the row is a card, not a table row; the
     `.movement-row` grid in `styles/theme.css` has no phone breakpoint and this
     file may not add one, so the arrangement branches here instead. */
  const phone = useViewport() === 'phone'
  const [hover, setHover] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; up: boolean } | null>(null)
  const press = useRef<number | null>(null)
  const suppress = useRef(false)

  const shown = list.rows.slice(0, ROWS_PER_COLUMN)
  const rest = list.rows.length - shown.length

  /**
   * §12 — long-press is the touch equivalent of hover.
   *
   * The timer alone was not enough: a touch that completes also emits a
   * synthetic click, so the row navigated the instant the card appeared and the
   * "touch equivalent" was unreachable on the only devices it exists for.
   * `suppress` swallows exactly that one click. A drag cancels the press, and
   * the card has a way out — outside tap or Escape — since a touch user has no
   * `mouseleave`.
   */
  const holdStart = (id: string) => {
    suppress.current = false
    press.current = window.setTimeout(() => {
      suppress.current = true
      setHover(id)
    }, 450)
  }
  const holdEnd = () => {
    if (press.current) window.clearTimeout(press.current)
    press.current = null
  }

  useEffect(() => {
    if (!hover && !menu) return
    const away = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-overlay]')) return
      setHover(null)
      setMenu(null)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setHover(null)
      setMenu(null)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [hover, menu])

  /*
   * `PageBody` draws the rows full-bleed and every other state inset, so the
   * padding is on the wrapper and conditional. `hasRows` is what keeps a failed
   * REFRESH from blanking a list someone is reading — the banner joins the rows
   * rather than replacing them (see `PageBody`'s header).
   */
  const stateful = list.loading || list.error !== null || list.isEmpty

  return (
    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '13px 15px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        <Pill text={badge} status={badgeStatus} />
        <Link
          to={viewAll}
          style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
        >
          View all
        </Link>
      </div>

      <div style={{ flex: 1, ...(stateful ? { padding: '14px 15px' } : {}) }}>
        <PageBody
          loading={list.loading}
          error={list.error}
          hasRows={list.rows.length > 0}
          onRetry={list.refetch}
          empty={list.isEmpty}
          emptyIsFiltered={list.isFiltered}
          onClearFilters={onClearFilters}
          noun={noun}
          skeleton="table"
          skeletonRows={ROWS_PER_COLUMN}
          {...(list.isFiltered && filteredByChips
            ? {} // chips picked — the default "match these filters" copy is true
            : list.isFiltered
              ? {
                  /* Only the PERIOD moved. "Match these filters" would blame
                     chips nobody touched; the honest sentence is the period's
                     own, and the way back says where it goes. */
                  emptyTitle: `No ${noun} ${periodLabel}`,
                  emptyMessage: 'Nothing is scheduled in this period.',
                  clearLabel: 'Back to Today',
                }
              : {
                  emptyTitle: `No ${noun} ${periodLabel}`,
                  emptyMessage: 'Nothing is scheduled in this period.',
                })}
        >
          {shown.map((r, i) => {
            /* Spec 02 Notes — one primary button per row. `primaryFor` picks the
               single next step and nothing else on the row is a filled button. */
            const primary = primaryFor(r, side)
            const clock = timeOf(r).split(' ')

            const bookingChip = (
              <Link
                to={`/rentals/${r.bookingNo}`}
                onClick={(e) => e.stopPropagation()}
                className="identifier"
                style={{
                  flexShrink: 0,
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  color: 'var(--st-primary-fg)',
                  background: 'var(--st-primary-bg)',
                  borderRadius: 5,
                  padding: '1px 6px',
                  textDecoration: 'none',
                }}
              >
                {r.bookingNo}
              </Link>
            )

            /* The ⋮ carries everything that is not the primary. The menu is
               anchored to this wrapper rather than to the row's right column,
               so the same markup works in both arrangements. */
            const kebab = (
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <button
                  type="button"
                  aria-label={`More actions for ${r.client}`}
                  aria-haspopup="menu"
                  aria-expanded={menu?.id === r.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    // Captured now, not read inside the updater below — a native event's
                    // `currentTarget` is nulled once dispatch finishes, and the updater
                    // runs after that.
                    const rect = e.currentTarget.getBoundingClientRect()
                    setMenu((x) => (x?.id === r.id ? null : { id: r.id, up: shouldFlipUp(rect, ROW_MENU_H) }))
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    /* Law 15 — "44×44 touch targets on every device, desktop
                       included". This used to be `phone ? 44 : 26` with a
                       comment deferring the pointer widths to an app-wide
                       sweep; that sweep is this one, and the law has no
                       pointer exemption to defer to. */
                    minWidth: 44,
                    minHeight: 44,
                    borderRadius: 'var(--r-xs)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name="more_vert" size={15} />
                </button>
                {menu?.id === r.id && (
                  <RowMenu m={r} onClose={() => setMenu(null)} up={menu.up} />
                )}
              </span>
            )

            const primaryButton = (
              <Link
                to={primary.to}
                onClick={(e) => e.stopPropagation()}
                aria-label={`${primary.hint} for ${r.client}, booking ${r.bookingNo}`}
                className="press"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  minWidth: phone ? 128 : 78,
                  padding: '0 14px',
                  borderRadius: 'var(--r-btn)',
                  background: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-fg)',
                  border: '1px solid transparent',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {primary.label}
              </Link>
            )

            /* --danger-text: the TEXT-SAFE red, which is what bare copy on a
               card needs. This used to read --st-danger-fg on the strength of a
               "measured 5.98:1 against --card" note — a measurement taken when
               --card was the dark rgba(11,22,34,0.85). --st-danger-fg resolves
               to --on-danger, which is #ffffff in BOTH themes because it is ink
               for a SOLID red fill; against the light card it is white on white
               (~1.02:1) and the overdue warning simply vanished on what is now
               the default theme. --danger-text is gated in both themes by
               scripts/check-contrast.cjs (6.75:1 light / 7.44:1 dark on
               surface). The row itself stays the plain card surface; only the
               border-left and this note carry the overdue signal. */
            const lateNote = r.statusNote ? (
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)' }}>
                {r.statusNote}
              </span>
            ) : null

            /*
             * `withBookingNo` is false only on the phone card, where spec 02
             * puts the booking number on the first line beside the time. It is
             * never dropped — one of the two places always renders it.
             */
            const main = (withBookingNo: boolean) => (
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span
                    style={{
                      fontSize: 'var(--t-ui)',
                      fontWeight: 700,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.client}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, minWidth: 0 }}>
                  {withBookingNo && bookingChip}
                  {/* `bookings.project` is nullable and a null is an ordinary
                      state, so it renders the non-value rather than nothing. */}
                  <span
                    style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {r.project ?? NONE}
                  </span>
                </div>

                {/* Where the package name used to sit. `itemCount` is
                    `sum(booking_lines.qty)` over live lines — units to pull, not
                    rows — and it is labelled so it cannot be read as anything
                    else. `neutral` because no column tints this chip. */}
                <div style={{ marginTop: 5, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 21,
                      padding: '0 7px',
                      borderRadius: 'var(--r-xs)',
                      background: STATUS['neutral'].bg,
                      color: STATUS['neutral'].fg,
                      fontSize: 'var(--t-meta)',
                      fontWeight: 600,
                      maxWidth: '100%',
                      minWidth: 0,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.itemCount} {r.itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                </div>

                <div
                  style={{ marginTop: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {r.due}
                </div>
              </div>
            )

            return (
              <div
                key={r.id}
                {...(phone ? {} : { className: 'movement-row' })}
                onClick={() => {
                  // The click a completed long-press emits must not navigate away
                  // from the card it just opened.
                  if (suppress.current) {
                    suppress.current = false
                    return
                  }
                  navigate(`/rentals/${r.bookingNo}`)
                }}
                onMouseEnter={() => setHover(r.id)}
                onMouseLeave={() => setHover((h) => (h === r.id ? null : h))}
                onTouchStart={() => holdStart(r.id)}
                onTouchMove={holdEnd}
                onTouchEnd={holdEnd}
                onTouchCancel={holdEnd}
                /* At ≥768 the grid itself is in theme.css so the 1560px
                   breakpoint can win. Below it, the row is a stacked card and
                   the inline `display` deliberately overrides that grid. */
                style={{
                  position: 'relative',
                  ...(phone ? { display: 'flex', flexDirection: 'column', gap: 8 } : { gap: 10, alignItems: 'start' }),
                  padding: '10px 12px 10px 10px',
                  borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none',
                  borderLeft: has(r, 'Overdue')
                    ? '2px solid var(--danger)'
                    : r.kind === 'Pickup' || r.kind === 'Delivery'
                      ? '2px solid var(--primary)'
                      : '2px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                {phone ? (
                  <>
                    {/* Spec 02 phone card — `time BR#`, then the client block,
                        then the one primary on its own line. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      {has(r, 'Overdue') ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '2px 6px',
                            borderRadius: 'var(--r-badge)',
                            background: 'rgba(245, 158, 11, 0.12)',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            color: 'var(--amber-text, #b45309)',
                            fontWeight: 700,
                            fontSize: 'var(--t-meta)',
                            whiteSpace: 'nowrap',
                          }}
                          title="Overdue return"
                        >
                          <Icon name="timer" size={12} style={{ color: 'var(--amber-text, #b45309)' }} />
                          <span>{clock[0]}</span>
                          <span style={{ fontSize: 10, opacity: 0.85 }}>{clock[1]}</span>
                        </span>
                      ) : (
                        <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {clock[0]} <span style={{ color: 'var(--muted)' }}>{clock[1]}</span>
                        </span>
                      )}
                      {bookingChip}
                      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
                        <Pill text={r.status} status={statusKeyOf(r)} />
                        {kebab}
                      </span>
                    </div>

                    {main(false)}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                      {lateNote}
                      <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>{primaryButton}</span>
                    </div>
                  </>
                ) : (
                  <>
                    {has(r, 'Overdue') ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 6px',
                          borderRadius: 'var(--r-badge)',
                          background: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          color: 'var(--amber-text, #b45309)',
                          fontWeight: 700,
                          fontSize: 'var(--t-meta)',
                          whiteSpace: 'nowrap',
                        }}
                        title="Overdue return"
                      >
                        <Icon name="timer" size={12} style={{ color: 'var(--amber-text, #b45309)' }} />
                        <span>{clock[0]}</span>
                        <span style={{ fontSize: 10, opacity: 0.85 }}>{clock[1]}</span>
                      </div>
                    ) : (
                      <div
                        className="figure"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', paddingTop: 2 }}
                      >
                        <span>{clock[0]}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: -2 }}>{clock[1]}</span>
                      </div>
                    )}

                    {/*
                      §4.2 — the tint is a token pair, resolved here exactly as
                      `RentalsList`'s `Avatar` resolves it. The tone is a pure
                      function of `clients.id` (`avatarToneFor`), so one client
                      cannot be two colours across the two lists the way the
                      seed once was.
                    */}
                    <div
                      aria-hidden
                      className="row-avatar"
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 'var(--r-badge)',
                        background: STATUS[r.avatarTone].bg,
                        color: STATUS[r.avatarTone].fg,
                        border: STATUS[r.avatarTone].border ? `1px solid ${STATUS[r.avatarTone].border}` : undefined,
                        placeItems: 'center',
                        textAlign: 'center',
                        lineHeight: 1.05,
                        fontSize: 'var(--t-meta)',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        flexShrink: 0,
                      }}
                    >
                      <span>{r.monogram}</span>
                    </div>

                    {main(true)}

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
                        <Pill text={r.status} status={statusKeyOf(r)} />
                        {kebab}
                      </div>
                      {primaryButton}
                      {lateNote}
                    </div>
                  </>
                )}

                {/* `menu` is `{ id, up } | null`, so the old `menu !== r.id` compared an
                    object to a string and was always true — the 520px hover card rendered
                    straight through the open row menu. Compare the id, not the object. */}
                {hover === r.id && menu?.id !== r.id && <HoverCard m={r} />}
              </div>
            )
          })}
        </PageBody>
      </div>

      {rest > 0 && (
        <Link
          to={viewAll}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 15px',
            borderTop: '1px solid var(--border)',
            color: 'var(--link)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <Icon name="plus" size={13} />
          {rest} more {noun}
        </Link>
      )}
    </section>
  )
}
