import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ErrorBanner, LoadingSkeleton } from '../../components/ui/StateViews'
import { Badge } from '../../components/ui/Badge'
import { useViewport } from '../../lib/device'
import type { Viewport } from '../../lib/device'
import { BAR_BOX } from '../../components/shell/BottomBar'
import { STATUS, STATUS_ICON, BRAND, BRAND_ON, BRAND_TEXT, PAYMENT_STATUS_TONE } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { BOOKING_STATUS, STATUS_ORDER } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import OperationsShell from '../operations/OperationsShell'
import { Unavailable } from '../../components/ui/Unavailable'
import { useAuth } from '../../lib/auth'
import { newClientUuid } from '../../lib/supabase'
import { gateContext, canViewMoneyField } from '../../lib/fieldGating'
import {
  canRecordPayment,
  canIssueInvoice,
  canPerformOperations,
  canWriteBookingDesk,
  canCloseRental,
} from '../../lib/rbac'
import { IntelCard } from '../../components/ui/IntelCard'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, grouped, toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { formatAdDateTime, toBs, formatBs } from '../../lib/bs'
import { paymentGlance, paymentDetailGroups } from '../../data/bookingIntel'
import { ExtendRentalModal } from './modals/ExtendRentalModal'
import { AssignCrewModal } from './modals/AssignCrewModal'
import { CreateSubRentalModal } from './modals/CreateSubRentalModal'
import { RecordPaymentModal } from '../finance/modals/RecordPaymentModal'
import { CreateInvoiceModal } from '../finance/modals/CreateInvoiceModal'
import type { ActionContext } from '../../actions/core'
import { useList } from '../../lib/queries/useList'
import { listBookings, fetchFloorBooking } from '../../lib/queries/bookings'
import type { BookingListOptions, BookingListRow, FloorBooking, FloorLine } from '../../lib/queries/bookings'
import { listInvoices, invoicesForBooking, listPayments, paymentsForBooking } from '../../lib/queries/finance'
import type { InvoiceListRow, PaymentListRow } from '../../lib/queries/finance'
import { listBookingNotes, notesForBooking } from '../../lib/queries/bookingNotes'
import type { BookingNoteRow, BookingNoteType } from '../../lib/queries/bookingNotes'
import { addBookingNote } from '../../actions/notes/addBookingNote'
import { getClient } from '../../lib/queries/clients'
import { whatsappActionsFor } from '../../lib/whatsappActions'
import { paymentReceipt } from '../../lib/whatsappTemplates'
import { buildWaLink } from '../../lib/whatsapp'
import { openWaLink } from '../../lib/whatsapp'
import { readSettings } from '../../lib/settingsStore'
import { releaseBookingLineUnit } from '../../actions/rentals/releaseBookingLineUnit'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { isSubRentedLine, isSubRentalBooking } from '../../data/booking'
import type { PaymentHistoryRow } from '../../data/booking'
import { deliveryTypeLabel } from '../../lib/format'
import { rentalDaysBetween, formatRentalDays } from '../../lib/rentalDays'

/**
 * # Booking Detail — live, for ANY `:bookingNo`
 *
 * Until 21 Aug 2026 this screen rendered one seeded record (`data/booking.ts`'s
 * B-715) under whatever number the URL carried, with an amber banner admitting
 * the mismatch. It now reads the booking the URL names, through the same query
 * modules its siblings already use (Law 2 — nothing here hand-rolls
 * `supabase.from`):
 *
 *  - **head + deposit** — `listBookings` filtered on `booking_no`, with
 *    `withDeposit` so the figure comes through `bookings_deposit_v` (0061),
 *    exactly as Rentals List reads it. The view NULLs it for a money-blind
 *    session; this screen additionally never asks for it without
 *    `canBookingMoney` (Law 6 — omitted, not masked).
 *  - **lines + units** — `fetchFloorBooking`, the per-booking read the floor
 *    workspaces were built for. It names no money column, so the equipment
 *    table carries no per-line rate — see Block 2's note.
 *  - **money** — `listInvoices(invoicesForBooking(id))` and
 *    `listPayments(paymentsForBooking(id))`, the same reads Finance renders.
 *    An unknown booking number gets `PageBody`'s empty state, never another
 *    booking's figures.
 *
 * ## What is honestly NOT live yet (rendered as stated gaps, never invented)
 *
 * crew (`booking_crew_lines` has no query module) · transport detail
 * (`booking_transport` has none) · documents (`document_registry` has none) ·
 * alerts (no alerts engine) · activity timeline (`booking_stage_transitions`
 * has none) · deposit received/pending (`security_deposits` is deliberately
 * outside `queries/finance.ts`, Law 5) · the late-return panel (needs a
 * per-booking day rate no sanctioned read supplies yet) · inline edit (session
 * -local edits over live rows would render values that revert on reload, which
 * is a fabricated write — removed until a real save exists).
 *
 * ## Mock mode
 *
 * The mimic serves `bookings`, `booking_lines`, `invoices` and `payments`, so
 * the page works end-to-end. `bookings_deposit_v` and `bank_accounts` come back
 * `[]` (loudly, `mock/client.ts:100-106`), so the deposit reads "Not recorded"
 * and the payment modal offers no accounts — both the same honest rendering a
 * live database with no rows would get.
 */

/**
 * ## Sub-rented gear — rulings §11.1, and Law 11 beside it
 *
 * The line carries the fact (`booking_lines.line_type = 'Sub-rental'`), the
 * booking derives it — `isSubRentalBooking` over the same lines the table
 * renders, so the header chip and the gold-outlined rows cannot disagree.
 *
 * **Law 11 — never colour alone.** The gold is one of four carriers: the
 * outline, `STATUS.ext`'s `external_link` icon, the word "Sub-rented", and an
 * accessible name that says the same thing.
 */
const SUB_RENTED_LABEL = 'Sub-rented — external gear borrowed in for this booking'

/**
 * The gold mark, from `EXT_MARK` via `<Badge tone="ext">` — the same renderer
 * `RentalsList.tsx` and `SubRental.tsx` now use. Three screens hand-rolled this
 * and three screens drifted: this copy was radius 4 at weight 700 against §4's
 * radius 6 at weight 600. The weight matters more than it looks — §4 keeps the
 * gold mark at 600 and un-uppercased precisely so it can never be mistaken for
 * a yellow status, and a 700 chip erodes exactly that distance.
 *
 * The outer span stays: <Badge> takes no `aria-label` or `title`, and
 * `SUB_RENTED_LABEL` is the sentence a screen reader and a tooltip both get —
 * the fourth carrier Law 11 counts. Wrapping keeps the accessible name where it
 * was rather than teaching <Badge> a prop for one caller.
 */
function SubRentedMark({ label = 'Sub-rented' }: { label?: string }) {
  return (
    <span aria-label={SUB_RENTED_LABEL} title={SUB_RENTED_LABEL} style={{ display: 'inline-flex', flexShrink: 0 }}>
      <Badge tone="ext" label={label} icon={<Icon name="external_link" size={10} />} size="sm" />
    </span>
  )
}

/** The line's own gold outline. Fires only where `line_type` says so. */
function subRentedRowStyle(line: { lineType?: string | undefined }) {
  return isSubRentedLine(line) ? { boxShadow: `inset 0 0 0 1px ${STATUS.ext.border ?? 'var(--border)'}` } : {}
}

/**
 * The signed-in session as an `ActionContext`, or nothing at all. Returning
 * `undefined` with no session is deliberate: the dispatcher refuses the call
 * by name rather than this screen acting as somebody who is not signed in.
 */
function actionCtx(user: { id: string; role: ActionContext['role'] } | null | undefined): ActionContext | undefined {
  return user ? { userId: user.id, role: user.role } : undefined
}

/** Off-screen but in the accessibility tree — no global `.sr-only` exists in this build. */
const srOnly = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap' as const,
  border: 0,
}

/**
 * Line-type marker beside an item name (Bundle / Service / Accessory …).
 *
 * **Deliberately NOT a <Badge>, and deliberately not a hue.** Everything else
 * on this screen that was painting itself now delegates to the one status
 * renderer; this one does not, because what it labels is not a status.
 *
 * §2's table is law for STATE: "a hue never means two things; a status never
 * uses a hue outside its meaning." `line_type` is not state — a line is a
 * Bundle or an Accessory for its whole life, and nothing it does changes that.
 * The old skin spent two of the seven hues on it anyway: `--st-progress-*`
 * (yellow, which §2 reserves for "being worked in-house / waiting") on Bundle,
 * and `--st-primary-*` (blue, "committed · scheduled") on required. A reader
 * scanning the line table by colour was being told a bundle row was in the
 * workshop and a required row was booked, neither of which the field means.
 * Reading those `--st-*` variables directly, rather than through `lib/status`,
 * is what let it happen quietly.
 *
 * So the marker moves off the status vocabulary entirely: one neutral surface
 * with a border for every kind, distinguished by its WORD, which is the only
 * thing that ever carried the fact. That leaves all seven hues meaning exactly
 * one thing each on this screen — which is the whole point of §2.
 *
 * The `kind` prop is kept rather than deleted: it still records which axis a
 * marker sits on, and it is the hook a future non-hue differentiator (an icon,
 * a dotted vs solid border) would hang from. It simply no longer picks a
 * colour. Note `'required'` currently has no call site in this file.
 */
function ItemBadge({ text }: { text: string; kind?: 'bundle' | 'required' | 'count' }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 16,
        padding: '0 5px',
        borderRadius: 'var(--r-chip)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        flexShrink: 0,
        background: 'var(--card2)',
        color: 'var(--text2)',
        border: '1px solid var(--border)',
      }}
    >
      {text}
    </span>
  )
}

/**
 * §4.2's six-step stepper — Quote → Booked → Packed → On Rent → Returned →
 * Closed, read from `lib/workflow.ts`'s canonical `STATUS_ORDER` rather than
 * re-typed. **Law 11:** every node carries fill state, the stage's icon, and
 * the stage's name; the current step carries `aria-current="step"`.
 */
const STAGE_ICON: Record<BookingStatus, IconName> = {
  Quote: 'file',
  Booked: 'check',
  Packed: 'box',
  'On Rent': 'truck',
  Returned: 'return_arrow',
  Closed: 'lock',
}

function Stepper({ status, dots }: { status: BookingStatus; dots: boolean }) {
  const current = BOOKING_STATUS[status].order

  if (dots) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {STATUS_ORDER.map((s) => (
            <span
              key={s}
              style={{
                width: 9,
                height: 9,
                borderRadius: 'var(--r-badge)',
                background:
                  BOOKING_STATUS[s].order <= current ? BRAND[dotTone(s, status)] : 'transparent',
                border: `1px solid ${BOOKING_STATUS[s].order <= current ? 'transparent' : 'var(--border)'}`,
              }}
            />
          ))}
        </span>
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
          Step <span className="figure">{current + 1}</span> of{' '}
          <span className="figure">{STATUS_ORDER.length}</span> — {status}
        </span>
      </div>
    )
  }

  return (
    <ol
      aria-label="Booking stages"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${STATUS_ORDER.length}, minmax(0,1fr))`,
        listStyle: 'none',
        margin: 0,
        padding: 0,
      }}
    >
      {STATUS_ORDER.map((s, i) => {
        const order = BOOKING_STATUS[s].order
        const state = order < current ? 'done' : order === current ? 'current' : 'ahead'
        const reached = state !== 'ahead'
        const tone = BRAND[dotTone(s, status)]
        return (
          <li
            key={s}
            {...(state === 'current' ? { 'aria-current': 'step' as const } : {})}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}
          >
            <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <span
                aria-hidden
                style={{
                  flex: 1,
                  height: 2,
                  background: i === 0 ? 'transparent' : reached ? tone : 'var(--disabled)',
                }}
              />
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  borderRadius: 'var(--r-badge)',
                  display: 'grid',
                  placeItems: 'center',
                  background: reached ? tone : 'transparent',
                  color: reached ? BRAND_ON[dotTone(s, status)] : 'var(--muted)',
                  border: reached ? '2px solid transparent' : '2px solid var(--border)',
                  boxShadow: state === 'current' ? '0 0 0 3px var(--nav-active-bg)' : 'none',
                }}
              >
                <Icon name={STAGE_ICON[s]} size={12} />
              </span>
              <span
                aria-hidden
                style={{
                  flex: 1,
                  height: 2,
                  background:
                    i === STATUS_ORDER.length - 1
                      ? 'transparent'
                      : order < current
                        ? tone
                        : 'var(--disabled)',
                }}
              />
            </span>
            <span
              style={{
                marginTop: 6,
                fontSize: 'var(--t-meta)',
                fontWeight: state === 'current' ? 700 : 500,
                color: state === 'ahead' ? 'var(--muted)' : 'var(--text)',
                textAlign: 'center',
              }}
            >
              {s}
            </span>
            <span style={srOnly}>
              {state === 'done' ? ' — done' : state === 'current' ? ' — current stage' : ' — not reached'}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** The stepper's fill tone, matching `lib/status.ts`'s solid/soft green split. */
function dotTone(stage: BookingStatus, current: BookingStatus): BrandKey {
  if (BOOKING_STATUS[stage].order > BOOKING_STATUS[current].order) return 'neutral'
  switch (stage) {
    case 'Quote':
      return 'neutral'
    case 'Booked':
      return 'primary'
    case 'Packed':
      return 'progress'
    case 'On Rent':
      return 'success'
    case 'Returned':
      return 'success'
    case 'Closed':
      return 'neutral'
  }
}

/**
 * Operations launcher — opens the operations shell, which navigates to the
 * four workspace routes.
 *
 * ⚠ It takes the ANSWER, not the question. This used to compute
 * `status === 'Quote'` for itself, which is how the page ended up giving two
 * answers to one question on one screen: the header launcher was disabled with
 * "Operations open once this booking is Booked" while the rail's Quick Actions
 * rendered its own live `Open Operations` button beside it, on the same Quote
 * booking (BD-04). Both call sites now render this component and both are
 * handed the one `operationsUnavailable` predicate, so they cannot disagree —
 * whatever it comes to include (Quote today, cancellation since BD-03).
 */
function OperationsLauncher({
  label,
  icon,
  primary,
  unavailable,
  onOpen,
}: {
  label: string
  icon: IconName
  primary: boolean
  /** The reason this is refused, or `null` when it is offered. */
  unavailable: string | null
  onOpen: () => void
}) {
  const button = (
    <Button icon={icon} variant={primary ? 'primary' : 'secondary'} onClick={onOpen} disabled={unavailable !== null}>
      {label}
    </Button>
  )

  if (unavailable === null) return button
  return <Unavailable reason={unavailable}>{button}</Unavailable>
}

/**
 * §4.2's header `[⋮]` — one primary, one launcher, everything else behind an
 * overflow. Nothing was deleted to get there (Law 3): Extend, Assign Crew,
 * Sub-Rental and Save Draft still open the same modals.
 */
interface OverflowItem {
  label: string
  icon: IconName
  onClick: () => void
  /** §4.2: disabled entries stay visible and greyed with the reason on hover/focus/long-press. */
  unavailable?: string
  /**
   * A nested group, opened in place rather than as a second floating layer.
   *
   * WHATSAPP_LINKS_SPEC v1.0 §3 asks for **one** "Message client" entry with a
   * stage-aware submenu, and this is why: a booking can offer four messages at
   * once, and spreading them flat pushes Extend and Assign Crew — the verbs
   * people actually open this menu for — off the top. One entry that expands
   * keeps the overflow's shape fixed however many messages apply.
   */
  submenu?: { label: string; onClick: () => void; unavailable?: string }[]
}

function OverflowMenu({ items }: { items: OverflowItem[] }) {
  const [open, setOpen] = useState(false)
  /** Which submenu is expanded, by label. One at a time. */
  const [expanded, setExpanded] = useState<string | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /* A submenu left expanded would re-open with the menu, showing a stale group
     for a booking whose stage may have moved on since. */
  useEffect(() => {
    if (!open) setExpanded(null)
  }, [open])

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="More booking actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          // Law 15 — 44×44 at every width, desktop included.
          width: 44,
          height: 44,
          borderRadius: 'var(--r-btn)',
          border: '1px solid var(--btn-secondary-border)',
          background: open ? 'var(--hover-card)' : 'var(--btn-secondary-bg)',
          color: 'var(--text2)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
        }}
      >
        <Icon name="more_vert" size={16} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 48,
            minWidth: 210,
            padding: 6,
            borderRadius: 'var(--r-btn)',
            background: 'var(--dropdown)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-modal)',
            zIndex: 30,
          }}
        >
          {items.map((it) => {
            const rowStyle = {
              display: 'flex' as const,
              alignItems: 'center' as const,
              gap: 9,
              width: '100%',
              height: 44,
              padding: '0 9px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              background: 'transparent',
              color: it.unavailable ? 'var(--muted)' : 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontFamily: 'inherit',
              textAlign: 'left' as const,
              cursor: it.unavailable ? ('not-allowed' as const) : ('pointer' as const),
            }
            const body = (
              <>
                <Icon
                  name={it.icon}
                  size={15}
                  style={{ color: it.unavailable ? 'var(--disabled)' : 'var(--text2)' }}
                />
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.unavailable && <Icon name="close" size={12} style={{ color: 'var(--disabled)' }} />}
              </>
            )
            if (it.unavailable) {
              return (
                <Unavailable key={it.label} reason={it.unavailable}>
                  <button type="button" role="menuitem" disabled aria-disabled style={rowStyle}>
                    {body}
                  </button>
                </Unavailable>
              )
            }
            if (it.submenu) {
              const isOpen = expanded === it.label
              return (
                <div key={it.label}>
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : it.label)}
                    style={rowStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-card)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {body}
                    <Icon name="chevron_right" size={12} style={{ color: 'var(--text2)' }} />
                  </button>
                  {isOpen &&
                    it.submenu.map((sub) => {
                      const subStyle = {
                        ...rowStyle,
                        paddingLeft: 33,
                        color: sub.unavailable ? 'var(--muted)' : 'var(--text)',
                        cursor: sub.unavailable ? ('not-allowed' as const) : ('pointer' as const),
                      }
                      if (sub.unavailable) {
                        return (
                          <Unavailable key={sub.label} reason={sub.unavailable}>
                            <button type="button" role="menuitem" disabled aria-disabled style={subStyle}>
                              <span style={{ flex: 1 }}>{sub.label}</span>
                              <Icon name="close" size={12} style={{ color: 'var(--disabled)' }} />
                            </button>
                          </Unavailable>
                        )
                      }
                      return (
                        <button
                          key={sub.label}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpen(false)
                            sub.onClick()
                          }}
                          style={subStyle}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-card)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ flex: 1 }}>{sub.label}</span>
                        </button>
                      )
                    })}
                </div>
              )
            }
            return (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  it.onClick()
                }}
                style={rowStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-card)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {body}
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}

/**
 * §4.2's phone segmented control — `[Items][Money][Docs]`. **`Money` is
 * omitted, not disabled**, for a money-blind role (Law 6): the caller builds
 * the segment list from the same gate the blocks themselves use.
 */
type PhoneSegment = 'Items' | 'Money' | 'Docs'

function Segmented({
  segments,
  active,
  onPick,
}: {
  segments: readonly PhoneSegment[]
  active: PhoneSegment
  onPick: (s: PhoneSegment) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Booking sections"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${segments.length}, minmax(0,1fr))`,
        gap: 'var(--sp-xs)',
        padding: 3,
        borderRadius: 10,
        background: 'var(--card2)',
        border: '1px solid var(--border)',
      }}
    >
      {segments.map((s) => {
        const on = s === active
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onPick(s)}
            style={{
              height: 40,
              borderRadius: 7,
              border: 'none',
              background: on ? 'var(--card)' : 'transparent',
              color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: on ? 700 : 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: on ? 'var(--shadow-card)' : 'none',
            }}
          >
            {s}
          </button>
        )
      })}
    </div>
  )
}

/** Numbered block header — the render splits the page into five of these. */
function Block({ no, title, children, action }: { no: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section style={{ ...cardStyle, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <span
          className="figure"
          aria-hidden
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-fg)',
            fontSize: 'var(--t-meta)',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {no}
        </span>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        {action && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{action}</span>}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  )
}

const th = {
  textAlign: 'left' as const,
  padding: '8px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token instead of padding arithmetic. The
 * horizontal padding is untouched — this raises the row, nothing else.
 *
 * Why it is a data-integrity fix rather than a density preference: this one
 * `td` dresses both tables on the page, and both put a target inside the row.
 * The lines table links every serial through to `/inventory/:serial`, and the
 * payments table hands its date cell to `IntelCard`, which is `role="button"`.
 * Neither carries an inflated 44px target yet, and at 9 + 17 + 9 = 35px there
 * was nowhere to put one: a 44px target in a 35px row overhangs ~4px into the
 * rows above and below, the two neighbours then overlap by ~9px, and an
 * absolutely positioned target wins the hit test — with the LATER row in the
 * DOM taking the tap. That opens the wrong unit on the lines table and peeks
 * the wrong payment below it. Commit 7d38cdf fixed exactly this shape on the
 * four floor workspaces; `components/ui/TouchTarget.tsx` carries the full
 * vertical case.
 *
 * At 56px a 44px target sits inside the row with 6px of margin each side, so
 * the row can pay Law 15 without borrowing from its neighbour. `th` is left
 * alone on purpose: the header rows here are plain column labels with no row
 * action, and a header owes the 44px rule only when it holds a control.
 */
const td = { height: 'var(--row-min-h)', padding: '9px 10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

/**
 * ── Notes — `booking_notes`' first UI (the "notes somewhere" of the 30 Aug
 * request) ──────────────────────────────────────────────────────────────────
 *
 * Reading is all-staff (`booking_notes_select` = `auth_is_staff()`), so the
 * list renders for every signed-in role; WRITING mirrors `booking_notes_all`
 * through `note.create` → `canWriteBookingDesk`, so the composer is omitted —
 * not disabled — for a role outside that set (`Accounts`, `Technician`).
 *
 * The type toggle offers Booking | Internal only. `History` is the enum's
 * system-written member; `addBookingNote.validate` refuses it by name and the
 * UI simply never offers it. Internal's chip says what the schema enforces
 * elsewhere: a database view excludes Internal notes from every print path
 * (0002:764) — nothing this screen must (or could) do.
 *
 * Law 8: the idempotency key is minted on the FIRST press and reused across
 * retries of the same content; editing the body OR the type mints a fresh
 * intent. Errors render inline in the card (§12 — errors inline, toasts for
 * successes only).
 */
function NotesCard({
  bookingId,
  ctx,
  canWrite,
  rows,
  loading,
  error,
  onRetry,
  onSaved,
}: {
  bookingId: string
  ctx: ActionContext | null
  canWrite: boolean
  rows: BookingNoteRow[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onSaved: () => void
}) {
  const [body, setBody] = useState('')
  const [noteType, setNoteType] = useState<Exclude<BookingNoteType, 'History'>>('Booking')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /* Law 8 — one key per intent, held across retries, dropped when the text changes. */
  const pendingUuid = useRef<string | null>(null)

  const submit = async () => {
    if (!ctx || saving) return
    setSaving(true)
    setFormError(null)
    const clientUuid = pendingUuid.current ?? (pendingUuid.current = newClientUuid())
    try {
      await addBookingNote({ bookingId, noteType, body, clientUuid }, ctx)
      pendingUuid.current = null
      setBody('')
      onSaved()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const typeChip = (t: Exclude<BookingNoteType, 'History'>, hint: string) => (
    <button
      key={t}
      type="button"
      onClick={() => {
        setNoteType(t)
        /* New TYPE is a new intent too — without this, a retry after a
           committed-but-unconfirmed press reuses the old key, and
           `idempotentInsert`'s 23505 re-fetch would return the OLD row as a
           success reported under the NEW type. The type decides whether the
           note prints (0002:764), so a mislabel here is not cosmetic. */
        pendingUuid.current = null
      }}
      aria-pressed={noteType === t}
      title={hint}
      className="tap"
      style={{
        height: 28,
        padding: '0 12px',
        borderRadius: 'var(--r-badge)',
        /* SELECTED is a control state, not a booking status. This used
           `--st-primary-*` — §2's blue for "committed / scheduled" — so a
           pressed toggle was painted in the vocabulary the stage blocks use.
           `--nav-active-*` is the pair this build already spends on a chosen
           control: `Payments.tsx`'s filter chips use exactly this bg + accent
           + border trio, and the Segmented control above takes its on-state ink
           from the same accent. `aria-pressed` carries the state to a screen
           reader either way, so nothing rests on the colour. */
        border: `1px solid ${noteType === t ? 'var(--nav-active-accent)' : 'var(--border)'}`,
        background: noteType === t ? 'var(--nav-active-bg)' : 'var(--card2)',
        color: noteType === t ? 'var(--nav-active-accent)' : 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {t}
    </button>
  )

  return (
    <Card title="Notes">
      {error ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
          {/* --danger-text: bare error copy on a card, with no red fill behind
              it, so it needs the text-safe red rather than --st-danger-fg
              (white ink for a solid block — invisible on the light card). */}
          <p role="alert" style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>{error}</p>
          <Button icon="refresh" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Loading notes…</p>
      ) : rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          No notes on this booking yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {rows.map((n) => (
            <div
              key={n.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '8px 10px',
                borderRadius: 'var(--r-xs)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/*
                  ⛔ This read `--st-progress-*` (yellow, §2's "being worked
                  in-house / waiting") for Internal and `--st-primary-*` (blue,
                  "committed / scheduled") for Booking — two of the seven
                  one-meaning hues spent on a field that is not a state. A note
                  is Internal or Booking for its whole life and nothing it does
                  changes that; a reader scanning the card by colour was being
                  told an internal note was in the workshop. Exactly the case
                  `ItemBadge` above already documents for `line_type`, and the
                  same resolution: one neutral surface, distinguished by its
                  word — plus a padlock on Internal, so the distinction that
                  matters (it never prints) has a second carrier and does not
                  rest on reading the label.
                */}
                <span
                  title={n.noteType === 'Internal' ? 'Internal — never printed or exported' : undefined}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '1px 8px',
                    borderRadius: 'var(--r-chip)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    background: 'var(--card)',
                    color: 'var(--text2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {n.noteType === 'Internal' && <Icon name="lock" size={10} />}
                  {n.noteType}
                </span>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{formatAdDateTime(n.createdAtAd)}</span>
              </div>
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {n.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {canWrite && ctx && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', marginTop: 'var(--sp-md)' }}>
          <div role="group" aria-label="Note type" style={{ display: 'flex', gap: 6 }}>
            {typeChip('Booking', 'Visible on booking paperwork')}
            {typeChip('Internal', 'Internal — never printed or exported')}
          </div>
          {noteType === 'Internal' && (
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Internal notes never print or export — a database view keeps them off every document.
            </p>
          )}
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              /* New text is a new intent — a retry of it gets a fresh key. */
              pendingUuid.current = null
            }}
            placeholder="Write a note for this booking…"
            aria-label="Note text"
            rows={3}
            style={{
              padding: '9px 10px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: 44,
            }}
          />
          {formError && (
            /* role="alert" — the page's own convention for inline errors (the
               confirm-dispatch error above, and every modal this card's Quick
               Actions launch); without it a failed save is silent to a
               screen reader, and no toast fires on failure (§12). Since this
               line IS the only failure signal, it also has to be legible:
               --danger-text, not the solid-fill ink --st-danger-fg. */
            <p role="alert" style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>{formError}</p>
          )}
          <div>
            <Button icon="plus" variant="primary" onClick={() => void submit()} disabled={saving || body.trim() === ''}>
              {saving ? 'Saving…' : 'Add Note'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/**
 * What this screen knows about the client's contact number.
 *
 * Four states, and the two in the middle are the point: `'ready'` with a `null`
 * phone is *"asked, and this client has no number on file"*, while `'loading'`
 * and `'failed'` are *"not asked yet"* and *"could not ask"*. A `string | null`
 * cannot tell them apart, and collapsing them is how a failed read came to
 * render as a statement about the client's record (Law 12).
 */
type ClientContact =
  /** The booking carries no `client_id` — nothing to read. */
  | { kind: 'absent' }
  | { kind: 'loading' }
  /** Read completed. `phone` is `null` when the client genuinely has none. */
  | { kind: 'ready'; phone: string | null }
  /** `getClient` threw — network, RLS refusal, anything. The reason is kept to be shown. */
  | { kind: 'failed'; message: string }

/** A muted in-card paragraph for a surface whose read genuinely does not exist yet. */
function NotWiredNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        margin: 0,
        fontSize: 'var(--t-meta)',
        color: 'var(--muted)',
        lineHeight: 1.5,
      }}
    >
      <Icon name="info" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{children}</span>
    </p>
  )
}

/* ── Named Unavailable reasons — never a control that silently does nothing ── */

/*
 * ⚠ This said "raise one from Finance" and cited `invoices.invoice_no`. Both
 * halves are now out of date: R-01 makes Booking Detail an invoice entry point
 * in its own right and this screen now carries the launcher, and `recordPayment`
 * settles by `invoices.id` because R-15 gives a Draft no number at all.
 */
const NO_INVOICE_PAYMENT_UNAVAILABLE =
  'No invoice has been raised for this booking yet, and a payment settles against an invoice. ' +
  'Use Create Invoice to raise the Draft first — it stays a Draft, so an advance can be taken against it.'
const ITEM_EDIT_UNAVAILABLE =
  'Adding, searching or filtering booking lines is not wired yet — booking_lines has no write path from this screen.'
const CREW_ADD_UNAVAILABLE = 'Crew assignment writes are not wired — the crew.assign action is still a stub.'
const TRANSPORT_EDIT_UNAVAILABLE =
  'Transport details are read-only: booking_transport has no query or write path from this screen yet.'
const ADD_DOCUMENT_UNAVAILABLE = 'Document uploads are not wired — document_registry has no write path from this screen.'
const SEND_QUOTE_UNAVAILABLE = 'Quote sending is not wired yet — no action exists behind this button.'

/**
 * What the Hover Intel card says under "Recorded by" (BD-19).
 *
 * Deliberately not `'Not on file'`, which `paymentDetailGroups` would fall back
 * to on an absent value: `payments.received_by` is `uuid not null`, so somebody
 * IS recorded and saying otherwise is the fabrication in the opposite
 * direction. The sentence separates "no record" from "no way to read it".
 */
const RECORDED_BY_UNRESOLVED = 'On file — this screen cannot resolve a staff id to a name'

/**
 * `payment_status` → the hue that status means (BD-16).
 *
 * ⛔ The Payment History cell painted `STATUS.in` — solid green, "settled" —
 * for EVERY row, whatever `payments.status` said. The enum is
 * `Received | Refunded | Failed | Cancelled` (`0001_enums.sql`), and `Failed`
 * and `Cancelled` are both writable — `queries/finance.ts`'s PAYMENT STATUS
 * note: they *"can only ever be set at INSERT time, which is a legitimate way
 * to record a bounced transfer."* A bounced transfer therefore rendered
 * exactly like money that arrived. That is not a colour slip; it is a false
 * statement about money, and the one carrier meant to be the fallback — the
 * word — was the only thing that ever contradicted it.
 *
 * `Refunded` is in the map for exhaustiveness, not because a row can reach it:
 * the same note records that it is derived from a reversal row and that a
 * status UPDATE would breach Law 4.
 *
 * The values are `modules/finance/Payments.tsx`'s `STATUS_TONE`, copied
 * deliberately rather than diverged: Finance's ledger and this booking's
 * history render the same `payments` rows and must not disagree about one.
 * Per-module maps are the house pattern for a domain enum — `Expenses.tsx`
 * keeps its own `STATUS_TOKEN` the same way — with `<Badge>` owning the paint
 * so the §4 block anatomy is never re-assembled by hand.
 *
 * Keyed off `PaymentListRow['status']`, so a new enum member is a compile
 * error here rather than an `undefined` lookup at render.
 */
/* `PAYMENT_STATUS_TONE` moved to `lib/status.ts` — see its header. This file,
   `modules/finance/Payments.tsx` and `data/bookingIntel.ts` all paint the same
   payment rows, and the third one disagreed. */

/** Blank BS cell meaning: `lib/bs.ts` can only vouch for Shrawan 2083; outside it there is no BS label, not a wrong one. */
function bsOrDash(iso: string): string {
  const bs = toBs(new Date(iso))
  return bs ? formatBs(bs) : '—'
}

/*
 * ⛔ A private `rentalDays()` stood here — `Math.max(1, Math.round(ms /
 * 86_400_000))`, computed on the page. A booking's length in days is what
 * `booking_lines` multiplies a rate by, so Law 1 puts it in an engine; it now
 * comes from `lib/rentalDays.ts`, which also carries the TODO(decision) about
 * the rule (elapsed hours here, calendar days in `civilDaysBetween`, overage
 * bands in `lateFee()` — three counts, no spec choosing between them).
 *
 * The behaviour is unchanged except at the edge: the local copy answered `1`
 * for an unparseable instant, and `rentalDaysBetween` answers `null`, which
 * this screen renders as "—". "1 Day" for dates the screen does not have is a
 * fabricated fact indistinguishable from a genuine one-day hire.
 */

export default function BookingDetail() {
  const { bookingNo } = useParams()
  const id = bookingNo ?? ''
  const [shellOpen, setShellOpen] = useState(false)
  const [showExtendModal, setShowExtendModal] = useState(false)
  const [showCrewModal, setShowCrewModal] = useState(false)
  const [showSubRentalModal, setShowSubRentalModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const { showSuccessToast } = useToast()
  const viewport = useViewport()

  /*
   * Law 6 / HIS v2.1 §4.1. `canBookingMoney` covers booking/invoice/payment
   * money — Coordinator included; `canCrewMoney` is `asset-finance`, which
   * excludes Coordinator ("no crew pay"). `gctx` is memoised so the payment
   * rows' intel cards are not rebuilt on unrelated renders.
   */
  const { user } = useAuth()
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  const canBookingMoney = canViewMoneyField(gctx, 'booking')
  const canCrewMoney = canViewMoneyField(gctx, 'asset-finance')

  /* Seeing money and MOVING money are two different questions — the figure
     containers gate on `canBookingMoney`, the payment buttons additionally on
     `rbac.canRecordPayment` (the rule the dispatcher itself resolves
     `payment.create` through). Absent, not disabled. */
  const canTakePayment = user ? canRecordPayment(user.role) : false
  /*
   * **R-01** — *"Invoice creation … Manual only, from **Finance** and from
   * **Booking Detail**. Nothing generates an invoice at Confirm."* This screen
   * is the second of those two entry points and had no launcher at all.
   *
   * `rbac.canIssueInvoice` — R-05's Owner · Admin · Manager · Accounts — is the
   * predicate `actions/core.ts` itself resolves `invoice.create` through, so the
   * gate mirrors the rule the dispatcher will apply rather than approximating it.
   */
  const canRaiseInvoice = user ? canIssueInvoice(user.role) : false
  const canOperate = user ? canPerformOperations(user.role) : false

  /* ── the booking head — `listBookings`, filtered to this one number ──────
   *
   * The same query and the same row shape Rentals List renders, so the list
   * and this detail page cannot disagree about a booking (the exact
   * list-vs-detail split the wiring plan names). `withDeposit` fetches
   * through `bookings_deposit_v` (0061) and is only asked for by a session
   * that may see the figure — for everyone else the key is simply absent
   * from the row (Law 6, omitted).
   *
   * `withDeposit` rides inside the filters object (BookingListOptions extends
   * ListFilters) so a role change re-keys the fetch instead of being trapped
   * in a stale closure.
   */
  const headFilters = useMemo<BookingListOptions>(
    () => ({ chips: { booking_no: [id] }, withDeposit: canBookingMoney }),
    [id, canBookingMoney],
  )
  const head = useList<BookingListRow>(listBookings, headFilters, { baseline: headFilters })
  const refetchHead = head.refetch
  const booking = head.rows[0]
  const bookingId = booking?.id ?? null

  /* ── lines + units — `fetchFloorBooking`, the per-booking read ────────────
   * Not a list, so it does not go through `useList`; same cancellation rule.
   */
  const [floor, setFloor] = useState<FloorBooking | null>(null)
  const [floorLoading, setFloorLoading] = useState(true)
  const [floorError, setFloorError] = useState<string | null>(null)
  /** Bumped after a unit release so the chip row re-reads what the database
   *  now says, instead of this screen editing its own copy of the truth. */
  const [floorVersion, setFloorVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    setFloorLoading(true)
    setFloorError(null)
    fetchFloorBooking(id)
      .then((b) => {
        if (cancelled) return
        setFloor(b)
        setFloorLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFloorError(err instanceof Error ? err.message : String(err))
        setFloorLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, floorVersion])

  /* ── unit release — §4.38 ruled (a), the serial chip's × ──────────────────
   *
   * Gate mirrors `unit.release`'s rule (`canWriteBookingDesk` =
   * `booking_line_units_all`'s five roles) so the × is never drawn live for a
   * session the dispatcher would refuse. v2.5 §10.4's confirm applies when the
   * booking is PAST Packed — the stage order is Foundation's own, so "past" is
   * an index comparison, not a status list this file could let drift.
   *
   * Law 8: the key is minted at the press and kept per unit row until that
   * unit's release succeeds, so a retry of a failed press replays the SAME
   * write rather than minting a second action.
   */
  const canReleaseUnits = user ? canWriteBookingDesk(user.role) : false
  const [releasingUnitId, setReleasingUnitId] = useState<string | null>(null)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [confirmRelease, setConfirmRelease] = useState<{ unitRowId: string; label: string } | null>(null)
  const releaseKeys = useRef<Map<string, string>>(new Map())

  const floorStage = floor?.stage ?? null
  const pastPacked =
    floorStage !== null &&
    STATUS_ORDER.indexOf(floorStage as BookingStatus) > STATUS_ORDER.indexOf('Packed')

  const doReleaseUnit = useCallback(
    async (unitRowId: string, label: string) => {
      const ctx = actionCtx(user)
      if (!ctx || releasingUnitId) return
      const key =
        releaseKeys.current.get(unitRowId) ?? (() => {
          const k = newClientUuid()
          releaseKeys.current.set(unitRowId, k)
          return k
        })()
      setReleasingUnitId(unitRowId)
      setReleaseError(null)
      try {
        await releaseBookingLineUnit({ unitRowId, unitLabel: label, clientUuid: key }, ctx)
        releaseKeys.current.delete(unitRowId)
        // §12 — a success is a toast; the chip clears when the refetch lands.
        showSuccessToast(`${label} released — the unit is back in the pool.`)
        setFloorVersion((v) => v + 1)
      } catch (err) {
        // §12 — inline and persistent, above the lines table. The chip stays,
        // because the database says the assignment still stands.
        setReleaseError(err instanceof Error ? err.message : String(err))
      } finally {
        setReleasingUnitId(null)
      }
    },
    [user, releasingUnitId, showSuccessToast],
  )

  const requestReleaseUnit = useCallback(
    (unitRowId: string, label: string) => {
      if (pastPacked) {
        setConfirmRelease({ unitRowId, label })
        return
      }
      void doReleaseUnit(unitRowId, label)
    },
    [pastPacked, doReleaseUnit],
  )

  /* ── money — the same reads Finance renders ──────────────────────────────
   *
   * Both fetchers no-op until the booking row (and its uuid) has arrived, and
   * no-op entirely for a money-blind session: `invoices`/`payments` are
   * whole-row RLS-gated (queries/finance.ts header), so a blind session would
   * get `[]` anyway — but not asking is both cheaper and the Law 6 shape,
   * since every surface that would render the answer is omitted for that
   * session. When `bookingId` lands the filter key changes, which re-runs the
   * fetch with the closure that can see it.
   */
  const invFilters = useMemo(() => (bookingId ? invoicesForBooking(bookingId) : {}), [bookingId])
  const invoicesList = useList<InvoiceListRow>(
    (f) => (bookingId && canBookingMoney ? listInvoices(f) : Promise.resolve({ rows: [] })),
    invFilters,
    { baseline: invFilters },
  )
  const payFilters = useMemo(() => (bookingId ? paymentsForBooking(bookingId) : {}), [bookingId])
  const paymentsList = useList<PaymentListRow>(
    (f) => (bookingId && canBookingMoney ? listPayments(f) : Promise.resolve({ rows: [] })),
    payFilters,
    { baseline: payFilters },
  )

  /* ── notes — `booking_notes`' first consumer ─────────────────────────────
   * Read is all-staff (`booking_notes_select`), so no money gate: every
   * signed-in role sees the list. The COMPOSER gates on `note.create`'s rule
   * (`canWriteBookingDesk`, mirroring `booking_notes_all`) — omitted, not
   * disabled, for Accounts and Technician. Same no-op-until-uuid shape as the
   * money reads above.
   */
  const canWriteNotes = user ? canWriteBookingDesk(user.role) : false
  const notesFilters = useMemo(() => (bookingId ? notesForBooking(bookingId) : {}), [bookingId])
  const notesList = useList<BookingNoteRow>(
    (f) => (bookingId ? listBookingNotes(f) : Promise.resolve({ rows: [] })),
    notesFilters,
    { baseline: notesFilters },
  )

  /* Law 3 — a voided invoice still exists, but its money is settled by its
     credit note, so the totals this page states are over the live ones. */
  const liveInvoices = useMemo(() => invoicesList.rows.filter((r) => !r.isVoid), [invoicesList.rows])

  /**
   * ## "No invoice" is a THIRD state, not the absence of a first (Law 12)
   *
   * `hasInvoice` was `liveInvoices.length > 0` and nothing else, so a read that
   * had not answered yet — or one that had FAILED — was indistinguishable from
   * a booking with no invoice. Every surface that branches on it then stated
   * absence as a settled fact: the Facts strip printed "No invoice raised yet",
   * the rail said "no Rental Total to state yet", and the Record Payment
   * launcher offered `NO_INVOICE_PAYMENT_UNAVAILABLE` — all while the request
   * was still in flight, which is the app claiming to know something about a
   * client's money that it has not asked for yet.
   *
   * `useList` starts `loading: true` and re-raises it on every filter change
   * (`queries/useList.ts` — `setLoading(true)` at the top of the fetch effect),
   * and on failure it KEEPS the rows it had, so `error` has to be read too:
   * a failed refresh leaves a stale-but-plausible row set behind.
   *
   * `bookingId !== null` is the third clause. Both money fetchers no-op to
   * `{ rows: [] }` until the booking's uuid has arrived, and that settled empty
   * result is about nothing at all — it must not read as "this booking has no
   * invoice".
   *
   * The rendering convention is this file's own, from the Review Summary's
   * Equipment row: an unknown value renders "Loading…", never the negative.
   */
  const invoicesKnown = bookingId !== null && !invoicesList.loading && invoicesList.error === null
  const hasInvoice = invoicesKnown && liveInvoices.length > 0
  /** The reason the invoice question is unanswered, or `null` when it is answered. */
  const invoicesUnknownReason: string | null = invoicesKnown
    ? null
    : invoicesList.error !== null
      ? `This booking’s invoices could not be read, so whether one exists is unknown — not absent. ${invoicesList.error}`
      : 'This booking’s invoices are still being read, so whether one exists is not known yet.'
  /**
   * The same three states in the one-word form the Review Summary's value
   * column takes. "No invoice" is reserved for the case the app has actually
   * established; the other two say which question is open.
   */
  const noInvoiceCell = invoicesKnown ? 'No invoice' : invoicesList.error !== null ? 'Not read' : 'Loading…'

  /* One booking can carry several invoices; the page's Rental Total / Paid /
     Outstanding are their sums — a MERGE of already-fetched rows, not a second
     computation of money (the figures themselves are the invoice columns
     `sync_payment_to_invoice()` maintains; nothing here re-prices anything). */
  const totals = useMemo(() => {
    let subtotal = 0
    let discount = 0
    let taxable = 0
    let vat = 0
    let total = 0
    let paid = 0
    let outstanding = 0
    for (const r of liveInvoices) {
      subtotal += r.subtotal
      discount += r.discountAmount
      taxable += r.taxableAmount
      vat += r.vatAmount
      total += r.totalAmount
      paid += r.paidAmount
      outstanding += r.outstandingAmount
    }
    return { subtotal, discount, taxable, vat, total, paid, outstanding }
  }, [liveInvoices])
  const money = (n: number) => formatMoney(n as Paisa)

  /* The invoice a Record Payment settles by default: the first still owed,
     else the newest (the list arrives issue_date desc).

     'Draft' joined that set with MONEY-05. R-02 keeps an invoice in Draft for
     the whole rental and R-14 leaves it in Draft when a payment lands, so a
     Draft is the invoice carrying the running balance for most of a booking's
     life — preferring an issued one over it would only ever apply to a booking
     past return. */
  const primaryInvoice =
    liveInvoices.find((r) => r.status === 'Draft' || r.status === 'Sent' || r.status === 'Partially Paid') ??
    liveInvoices[0]

  /*
   * Payment History rows — live `payments` mapped into the display shape the
   * Hover Intel builders take. Every field is a real column: `method` is
   * `bank_accounts.channel_group` through the embed, and '—' means "no
   * account recorded on this payment" (never inferred as Cash — 'Cash' is a
   * channel group of its own).
   *
   * ## "Recorded by" — a uuid is honest and still unreadable (BD-19)
   *
   * `recordedBy` used to be `p.receivedById` verbatim, so the Hover Intel
   * card's Linked group printed a raw `users.id` — `3f7c…` — under the label
   * "Recorded by". True, and useless: no operator can turn it into a person,
   * and it is an internal key in front of a client-facing panel.
   *
   * The name is NOT substituted, because this build cannot resolve it. `users`
   * has exactly one SELECT policy — `users_select_own`
   * (`0020_role_lookup_and_staff_retrofit.sql:55`, widened by `0059` to accept
   * `auth.uid()` as well) — so a lookup or an embed answers for the VIEWER's
   * own row and null for everybody else's. That is why `queries/finance.ts`
   * does not join `received_by` in the first place, and its note says so in the
   * same words: *"An id is honest; a mostly-null name is not."* The one
   * directory read that does exist, `queries/staff.ts`'s
   * `fetchStaffDirectory`, is Owner-only and refuses outright in mock mode.
   * Inventing a lookup, or printing the signed-in user's own name beside
   * somebody else's payment, would be a fabricated fact.
   *
   * So the field says what is true: the column is `not null` (0006:191), the
   * person IS on file, and this screen cannot name them.
   *
   * TODO(decision) — PLAN.md §4: should a staff id be resolvable to a name for
   * every staff role, and if so through what? The options are a narrow
   * `users_public_v` (id + full_name, readable by `auth_is_staff()`), or an
   * embed on the payments read. Both are new surfaces on a table whose current
   * policy is self-scoped, which is an access decision, not a display one.
   */
  const paymentRows = useMemo(
    () =>
      paymentsList.rows.map((p) => {
        const display: PaymentHistoryRow = {
          date: formatAdDateTime(p.paymentDateAd),
          type: p.paymentType,
          amount: grouped(toRupees(p.amount)),
          method: p.channelGroup ? `${p.channelGroup}${p.bankName ? ` · ${p.bankName}` : ''}` : '—',
          status: p.status,
          ref: p.transactionRef ?? p.paymentNo,
          recordedBy: RECORDED_BY_UNRESOLVED,
        }
        return {
          key: p.id,
          /* Read from the typed enum, not from `display.status` — that field is
             a plain `string` on `PaymentHistoryRow` and would lose the
             exhaustiveness the map above depends on. */
          tone: PAYMENT_STATUS_TONE[p.status],
          payment: display,
          glance: paymentGlance(display, id, gctx),
          detail: paymentDetailGroups(display, id, gctx),
        }
      }),
    [paymentsList.rows, id, gctx],
  )

  /* ── Confirm Booking — the one write this screen dispatches ─────────────
   *
   * Rendered at stage Quote (the stage `confirmRental`'s transition leaves).
   * The old gate read `BOOKING.flags.includes('Draft')` off the seed, which no
   * interaction could ever satisfy — the implemented action was unreachable
   * (page doc §7.1). `booking_flags` has no query module yet, so the flag
   * cannot be read here; the action itself re-reads the booking and refuses a
   * confirm that is not legal, so this gate errs visible-and-refusable rather
   * than invisible.
   */
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const confirmBooking = useCallback(() => {
    const ctx = actionCtx(user)
    if (!ctx) {
      setConfirmError(
        'Not confirmed — you are not signed in, so this confirmation cannot be attributed to anyone. ' +
          'Sign in and confirm again.',
      )
      return
    }
    setConfirmError(null)
    setConfirming(true)
    // Law 8 — minted HERE, at the press, and reused by every retry of this one press.
    const clientUuid = newClientUuid()
    void import('../../actions/rentals/confirmRental')
      .then((m) => m.confirmRental({ id, clientUuid }, ctx))
      .then((res) => {
        showSuccessToast('Booking Confirmed', `${res.bookingNo} is now ${res.stage.to}`)
        // The stage moved in the database (the trigger is the sole writer of
        // bookings.stage); re-read rather than patch local state.
        refetchHead()
      })
      .catch((err: unknown) => {
        setConfirmError(`Not confirmed — ${err instanceof Error ? err.message : String(err)}`)
      })
      .finally(() => setConfirming(false))
  }, [id, user, showSuccessToast, refetchHead])

  /* -- Close Rental — R-07 / R-08 -----------------------------------------
   *
   * Rendered at stage Returned, the stage `closeRental`'s transition leaves.
   *
   * `closeRental` was written on 4 Sep, is 343 lines, reads all four R-07 gates
   * from live tables — and was never exported from the actions barrel, so it had
   * ZERO importers. The lifecycle could be driven as far as Returned and no
   * further: no control anywhere in the product could close a rental, deposits
   * were never released and no rental was ever financially settled. The action
   * needed no change; it needed a caller.
   *
   * R-07 keeps Close a HARD gate (unlike handover, which R-06 makes a warning),
   * so this dispatches and lets the action refuse. `canCloseRental` is R-08's
   * set — Owner, Admin, Manager, Accounts — and is narrower than the database
   * policy, which is the safe direction.
   */
  const [closeError, setCloseError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  const closeBooking = useCallback(() => {
    const ctx = actionCtx(user)
    if (!ctx) {
      setCloseError(
        'Not closed — you are not signed in, so this close cannot be attributed to anyone. ' +
          'Sign in and close again.',
      )
      return
    }
    setCloseError(null)
    setClosing(true)
    // Law 8 — minted HERE, at the press, and reused by every retry of this one press.
    const clientUuid = newClientUuid()
    void import('../../actions/rentals/closeRental')
      .then((m) => m.closeRental({ bookingNo: id, clientUuid }, ctx))
      .then((res) => {
        showSuccessToast('Rental Closed', `${res.bookingNo} is now ${res.stage}`)
        // The trigger is the sole writer of bookings.stage; re-read, never patch.
        refetchHead()
      })
      .catch((err: unknown) => {
        setCloseError(`Not closed — ${err instanceof Error ? err.message : String(err)}`)
      })
      .finally(() => setClosing(false))
  }, [id, user, showSuccessToast, refetchHead])

  const segments: PhoneSegment[] = canBookingMoney ? ['Items', 'Money', 'Docs'] : ['Items', 'Docs']
  const [segment, setSegment] = useState<PhoneSegment>('Items')
  const onPhone = viewport === 'phone'
  const activeSegment: PhoneSegment = segments.includes(segment) ? segment : 'Items'
  /** On phone each segment owns the page; at every other width all three show. */
  const showSegment = (s: PhoneSegment) => !onPhone || activeSegment === s

  // Facts strip — 5-up only on desktop; the money column is omitted from the
  // TEMPLATE (not left visually empty) when this role can't see booking money.
  const factsCols =
    viewport === 'desktop'
      ? canBookingMoney
        ? 'repeat(4, minmax(0,1fr)) minmax(0,1.1fr)'
        : 'repeat(4, minmax(0,1fr))'
      : viewport === 'tablet'
        ? 'repeat(2, minmax(0,1fr))'
        : '1fr'

  /* ── WhatsApp compose links — WHATSAPP_LINKS_SPEC v1.0 §3 ────────────────
   *
   * ⚠ These three hooks sit ABOVE the `if (!booking)` guard below, and must
   * stay there. Placed after it they run only on the loaded branch, which is a
   * conditional hook call — React throws on the very first render of a booking
   * that is still loading, taking the whole screen down for a courtesy menu.
   *
   * The recipient's number is the one field this screen's queries do not
   * carry: `BookingListRow` has `clientId` but no phone, by design — a booking
   * row is not a contact record. So it is read once from the canonical client
   * query.
   *
   * ## Four states, because a nullable string could only hold two (BD-08, BD-19)
   *
   * This was `useState<string | null>(null)` with the failure swallowed —
   * `.catch(() => setClientPhone(null))` — and the old note beside it called
   * that "the same honest end state as a client who has no number". It is not
   * the same state at all. `getClient` throws on any Postgres error, RLS
   * refusal included (`queries/clients.ts` — `throw new Error('getClient
   * failed: …')`), so a network drop or a policy denial rendered every WhatsApp
   * entry disabled with `NO_PHONE_REASON`: *"No valid phone on this client —
   * add one on the client record first."* The app does not know there is no
   * phone; it knows it failed to ask, and telling an operator to go add a
   * number that is already on file is a fabricated fact (Law 12).
   *
   * The second bug the two-state version carried: the effect returned early on
   * a missing `clientId` and on a CHANGED one it started the fetch without
   * clearing what was there, so both left the PREVIOUS client's number in
   * state. Navigating detail → detail therefore composed booking B's messages
   * against client A's phone until the new read landed — a wrong recipient on
   * a live `wa.me` link, and a leak of one client's number into another
   * client's screen. Setting `{ kind: 'loading' }` synchronously inside the
   * effect is what closes it: the number is cleared the moment the id changes,
   * not when the answer arrives.
   */
  const [contact, setContact] = useState<ClientContact>({ kind: 'loading' })
  useEffect(() => {
    const cid = booking?.clientId
    if (!cid) {
      setContact({ kind: 'absent' })
      return
    }
    let cancelled = false
    setContact({ kind: 'loading' })
    getClient(cid)
      .then((c) => {
        if (!cancelled) setContact({ kind: 'ready', phone: c?.phone ?? null })
      })
      .catch((err: unknown) => {
        if (!cancelled) setContact({ kind: 'failed', message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [booking?.clientId])

  /* Only a completed read yields a number. Every other state is "not known",
     and `whatsappActionsFor` is told so by the menu below rather than by a
     null it would translate into NO_PHONE_REASON. */
  const clientPhone = contact.kind === 'ready' ? contact.phone : null

  const waActions = useMemo(() => {
    if (!booking || !user) return []
    const s = readSettings()
    return whatsappActionsFor({
      role: user.role,
      clientPhone,
      settings: {
        businessName: String(s.organisationName),
        businessPhone: String(s.businessPhone),
        defaultPickupTime: String(s.defaultPickupTime),
        defaultReturnTime: String(s.defaultReturnTime),
      },
      facts: {
        clientName: booking.clientName,
        bookingNo: booking.bookingNo,
        stage: booking.stage,
        startIso: booking.pickupAtAd,
        endIso: booking.returnAtAd,
        itemCount: booking.itemCount,
        /* Read from `floor` rather than the `lines` const below, which is
           re-created every render and would re-read localStorage with it.
           Three is what fits one line before it reads as a packing list. */
        topLines: (floor?.lines ?? [])
          .slice(0, 3)
          .map((l) => l.productName ?? l.description)
          .filter((x): x is string => !!x),
        /* Past its return date and not yet back — the same read the page's own
           overdue chip uses, not a second definition of late. */
        isOverdue:
          /* Same definition as the list's `overdue()` set: only a booking that
             is OUT can be late back. Without the stage clause a Booked booking
             whose pickup never happened read as overdue here and not on the
             list (BUG_AUDIT_LIFECYCLE BD-01). */
          booking.stage === 'On Rent' &&
          !booking.isClosed &&
          !booking.isCancelled &&
          booking.actualReturnAtAd === null &&
          new Date(booking.returnAtAd) < new Date(),
        /* Law 6 — a session that may not see these figures is handed nulls,
           and `whatsappActionsFor` refuses to state a total it does not have
           rather than printing a zero. */
        total: canBookingMoney && hasInvoice ? (totals.total as Paisa) : null,
        advance: canBookingMoney && hasInvoice ? (totals.paid as Paisa) : null,
        deposit: canBookingMoney ? booking.depositRequired : null,
        balance: canBookingMoney && hasInvoice ? (totals.outstanding as Paisa) : null,
      },
    })
  }, [booking, user, clientPhone, floor, canBookingMoney, hasInvoice, totals])

  if (!booking) {
    /*
     * Loading / error / not-found, through PageBody's fixed ladder. An unknown
     * booking number is the EMPTY state — the honest sibling of the floor
     * workspaces' BookingNotLoaded: nothing is broken, the number simply
     * matches no bookings row, and rendering any other booking's data under
     * this number is the defect this conversion removed.
     */
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader title={id || 'Booking'} />
        <PageBody
          loading={head.loading}
          error={head.error}
          onRetry={head.refetch}
          empty={head.isEmpty}
          noun={`booking ${id}`}
          skeleton="card"
          emptyTitle={`No booking numbered ${id}`}
          emptyMessage={
            'No bookings row carries this number. If it was just created, the list it came from may be stale — ' +
            'go back to Rentals and reopen it. Nothing else is shown here because showing another booking under ' +
            'this number would be worse than showing nothing.'
          }
        >
          {null}
        </PageBody>
      </div>
    )
  }

  /* Both vocabularies are the canonical six (0015; pinned against the
     generated types in queries/bookings.ts's header), so the DB stage IS the
     workflow status. */
  const stage = booking.stage as BookingStatus

  /* ── Cancelled — the mark and the refusal (BD-03) ────────────────────────
   *
   * §1.3 keeps Cancelled orthogonal to the six stages: it is `cancelled_at`,
   * a flag, so a cancelled booking's `stage` still reads Quote or On Rent and
   * every stage-driven verb on this page stayed live on it.
   *
   * The rule is not invented here (Law 1). It is the one the RENTALS LIST
   * already applies to the same row — `RentalsList.tsx`'s row menu computes
   * `!row.isCancelled && o.enabledAt.includes(row.status)` and shows
   * "`{bookingNo}` is cancelled — no operation runs on it" — and it is the one
   * the DISPATCHERS themselves enforce — for the three that are built:
   * `confirmRental.ts` refuses on `cancelled_at !== null` before it writes,
   * `floorVerb.ts` refuses every floor job the same way, and `closeRental.ts`
   * refuses too (citing PLAN.md §4.16, which leaves whether a cancelled booking
   * may still be walked to Closed unruled).
   *
   * Be exact about the other three, because an earlier draft of this comment was
   * not: `extendRental.ts`, `crew/bookCrew.ts` and `subrentals/createSubRental.ts`
   * contain no `cancelled_at` check at all. They refuse for a different reason —
   * each is `implemented: false`, so `createAction` turns them away before any
   * body runs (BD-09/BD-10/BD-11 are the open TODOs for that). The conclusion is
   * the same for all six — every press could only ever fail — but only half of it
   * is the cancellation rule. **When those three are built they must check
   * `cancelled_at` themselves**; this screen's guard is not a substitute, because
   * the list and the API can both reach them by another route.
   *
   * Law 3 wants the terminal action VISIBLE, not merely obeyed — so the mark
   * goes on the header and on the Rental Days fact beside the stage block,
   * and disabling is the consequence of the mark rather than a substitute for
   * it.
   *
   * What is deliberately NOT refused: taking money. A cancelled booking can
   * still carry an unsettled invoice, `FLAGS.Cancelled.blocks` is empty, and
   * §4.16 is open — refusing a payment here would be inventing that ruling.
   * Notes stay writable for the same reason.
   */
  const cancelledReason: string | null = booking.isCancelled
    ? `${booking.bookingNo} is cancelled — no operation runs on it`
    : null

  /**
   * ONE predicate for "may operations be opened", read by BOTH launchers
   * (BD-04). The Quote clause keeps the wording the header launcher already
   * carried, so nothing a user has read changes; the cancelled clause is
   * BD-03's, and it comes first because a cancelled Quote is refused for the
   * more fundamental reason.
   */
  const operationsUnavailable: string | null =
    cancelledReason ?? (stage === 'Quote' ? 'Operations open once this booking is Booked' : null)

  /**
   * What the overflow's "Message client" row offers — or the true reason it
   * cannot (BD-08).
   *
   * ⚠ The CONTACT READ's own state answers first, and that ordering is the
   * whole fix. `whatsappActionsFor` is handed `clientPhone`, and for a `null`
   * it returns `NO_PHONE_REASON` — *"No valid phone on this client — add one on
   * the client record first."* That sentence is a claim about the client's
   * record, so it may only be reached once the record has actually been read.
   * Before this, a failed or in-flight `getClient` produced exactly that
   * sentence, telling an operator to go and add a number that may already be
   * on file (Law 12).
   */
  const messageClient: { unavailable: string } | { submenu: NonNullable<OverflowItem['submenu']> } =
    contact.kind === 'failed'
      ? {
          unavailable:
            'This client’s record could not be read, so no number is known — which is not the same as no number ' +
            `being on file. Retry from the client page. ${contact.message}`,
        }
      : contact.kind === 'loading'
        ? { unavailable: 'Still reading this client’s record — the number is not known yet.' }
        : contact.kind === 'absent'
          ? { unavailable: 'This booking carries no client record, so there is nobody to message.' }
          : waActions.length === 0
            ? {
                unavailable:
                  'No message applies at this stage — a quote has nothing to confirm, and a returned booking has nothing to chase.',
              }
            : {
                submenu: waActions.map((a) => ({
                  label: a.label,
                  onClick: () => {
                    if (a.href) openWaLink(a.href)
                  },
                  ...(a.unavailable ? { unavailable: a.unavailable } : {}),
                })),
              }

  const days = rentalDaysBetween(booking.pickupAtAd, booking.returnAtAd)
  const lines: FloorLine[] = floor?.lines ?? []
  const allUnits = lines.flatMap((l) => l.units)
  const subRental = isSubRentalBooking(lines.map((l) => ({ lineType: l.lineType })))

  /* The roll-up beneath the tree — counted from the same units the rows
     render. Zero counts stay visible: "0 Missing" is the reassurance. */
  const tally = [
    { label: 'Total Items', value: String(booking.itemCount), tone: 'neutral' as BrandKey },
    { label: 'Packed', value: String(allUnits.filter((u) => u.packed).length), tone: 'success' as BrandKey },
    { label: 'Missing', value: String(allUnits.filter((u) => u.unitState === 'Missing').length), tone: 'neutral' as BrandKey },
    { label: 'Returned', value: String(allUnits.filter((u) => u.unitState === 'Returned').length), tone: 'neutral' as BrandKey },
    { label: 'Damaged', value: String(allUnits.filter((u) => u.damaged).length), tone: 'danger' as BrandKey },
  ]

  /* Booking Summary rows — invoice figures plus the 0061 deposit. Law 5: the
     two ledgers are never summed; deposit received/pending are NOT shown at
     all because `security_deposits` has no sanctioned read yet — absent, not
     zero. */
  const summaryRows = [
    ...(hasInvoice
      ? [
          { label: 'Rental Total', value: money(totals.total) },
          { label: 'Rental Paid', value: money(totals.paid), tone: 'success' as BrandKey },
          { label: 'Rental Outstanding', value: money(totals.outstanding), tone: 'danger' as BrandKey },
        ]
      : []),
    {
      label: 'Deposit Required',
      value: booking.depositRequired !== null ? formatMoney(booking.depositRequired) : 'Not recorded',
    },
  ]

  const recordPaymentButton = (label: string) => {
    /* Three reasons, not one. `NO_INVOICE_PAYMENT_UNAVAILABLE` is a statement
       about this booking; while the read is in flight or after it failed the
       app does not know that yet, and saying it anyway is the Law 12 defect. */
    const reason = hasInvoice ? null : (invoicesUnknownReason ?? NO_INVOICE_PAYMENT_UNAVAILABLE)
    return reason === null ? (
      <Button icon="dollar" variant="primary" onClick={() => setShowPaymentModal(true)}>
        {label}
      </Button>
    ) : (
      <Unavailable reason={reason}>
        <Button icon="dollar" variant="primary" disabled>
          {label}
        </Button>
      </Unavailable>
    )
  }

  /**
   * **Create Invoice** — R-01's second entry point.
   *
   * Same shape as `recordPaymentButton` above and for the same reason: every
   * branch that cannot offer the control says WHY, and the three reasons are
   * kept apart. "This booking already has one" is a fact about the booking;
   * "still reading" and "the read failed" are facts about the app, and stating
   * either as the first is the Law 12 defect this file already documents.
   *
   * The already-invoiced refusal is R-03 (*"One invoice per rental"*) and it
   * mirrors `createInvoice`'s own precondition, which refuses on ANY existing
   * invoice — a voided one included. Offering a control the dispatcher will
   * refuse is the shape MONEY-01 exists to remove.
   */
  const createInvoiceButton = (label: string) => {
    const reason =
      cancelledReason ??
      invoicesUnknownReason ??
      (hasInvoice
        ? `${booking.bookingNo} already has an invoice (${
            liveInvoices[0]?.invoiceNo ?? 'a Draft'
          }). One invoice per rental — damage and late fees append as lines to it, and a correction after issue is ` +
          'a Void plus a Credit Note.'
        : null)
    return reason === null ? (
      <Button icon="invoice" onClick={() => setShowCreateInvoice(true)}>
        {label}
      </Button>
    ) : (
      <Unavailable reason={reason}>
        <Button icon="invoice" disabled>
          {label}
        </Button>
      </Unavailable>
    )
  }

  const railBody = (
    <>
      {/* Same booking-money figures as the Facts strip and Block 4 — gated the
          same way, omitted rather than masked. On phone this card is the
          `Money` segment's rail content. */}
      {canBookingMoney && showSegment('Money') && (
        <Card title="Booking Summary">
          <SummaryRows rows={summaryRows} />
          {!hasInvoice && (
            <p style={{ margin: '8px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              {invoicesUnknownReason ??
                'No invoice has been raised for this booking, so there is no Rental Total to state yet.'}
            </p>
          )}
          <p
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 5,
              margin: '10px 0 0',
              fontSize: 'var(--t-th)',
              color: 'var(--muted)',
            }}
          >
            <Icon name="info" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Deposit is a liability. It never enters Rental Total and never reduces Outstanding.</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', marginTop: 12 }}>
            {canRaiseInvoice && createInvoiceButton('Create Invoice')}
            {canTakePayment && recordPaymentButton('Receive Payment')}
          </div>
        </Card>
      )}

      {showSegment('Docs') && (
        <>
          {/* Real verbs only (30 Aug rework; the Dashboard quick panel is the
              precedent). The three buttons this replaced — Print / Share /
              More — had no onClick: dead controls dressed as actions, the
              exact shape Law 16's discipline elsewhere on this page refuses.
              Each action below reuses a launcher that already works, under
              the SAME gates its other launchers carry — money visibility AND
              capability, omitted not disabled. */}
          <Card title="Quick Actions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              {canBookingMoney && canRaiseInvoice && createInvoiceButton('Create Invoice')}
              {canBookingMoney && canTakePayment && recordPaymentButton('Receive Payment')}
              {/* BD-04 — the SAME `operationsUnavailable` the header launcher
                  reads, through the same component. This was a bare live
                  <Button> and gave the opposite answer to the header's disabled
                  one on the very same Quote booking. */}
              <OperationsLauncher
                label="Open Operations"
                icon="queues"
                primary={false}
                unavailable={operationsUnavailable}
                onOpen={() => setShellOpen(true)}
              />
              {canBookingMoney &&
                canOperate &&
                (cancelledReason ? (
                  <Unavailable reason={cancelledReason}>
                    <Button icon="calendar" disabled>
                      Extend Rental
                    </Button>
                  </Unavailable>
                ) : (
                  <Button icon="calendar" onClick={() => setShowExtendModal(true)}>
                    Extend Rental
                  </Button>
                ))}
              {canCrewMoney &&
                canOperate &&
                (cancelledReason ? (
                  <Unavailable reason={cancelledReason}>
                    <Button icon="users" disabled>
                      Assign Crew
                    </Button>
                  </Unavailable>
                ) : (
                  <Button icon="users" onClick={() => setShowCrewModal(true)}>
                    Assign Crew
                  </Button>
                ))}
            </div>
          </Card>

          <NotesCard
            bookingId={bookingId ?? ''}
            ctx={user ? { userId: user.id, role: user.role } : null}
            canWrite={canWriteNotes}
            rows={notesList.rows}
            loading={notesList.loading}
            error={notesList.error}
            onRetry={notesList.refetch}
            onSaved={() => {
              showSuccessToast('Note Added', `Recorded against ${booking.bookingNo}`)
              notesList.refetch()
            }}
          />

          <Card title="Alerts">
            {/* The seed carried three invented alerts. There is no alerts
                engine and no alerts table read — an empty card that SAYS why
                beats three plausible fabrications (Law 16). */}
            <NotWiredNote>
              Alerts are not computed from live data yet — there is no alerts engine behind this booking. This is a
              statement about the wiring, not a claim that nothing needs attention.
            </NotWiredNote>
          </Card>

          <Card title="Activity Timeline">
            {/* `booking_stage_transitions` holds the real history and has no
                query module yet — stated rather than seeded. */}
            <NotWiredNote>
              The stage history lives in booking_stage_transitions, which has no query module yet. Nothing is shown
              rather than a seeded timeline that belongs to no booking.
            </NotWiredNote>
          </Card>
        </>
      )}
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', position: 'relative' }}>
      <PageHeader
        title={booking.bookingNo}
        description={`${booking.clientName}${booking.project ? ` · ${booking.project}` : ''}${
          booking.pickupLocation ? ` · ${booking.pickupLocation}` : ''
        }`}
        actions={
          <>
            {/* §8 step 2 — the stage block is <Badge>'s. This assembled it
                here from `STATUS[statusToken(stage)]`, on `--r-badge` (999,
                which §3.3 reserves for numeric count badges) and with no glyph
                at all, so the header's own status was colour + word only.
                Passing `status` gets the §4 hue, the word and the icon in one
                move and cannot be half-done. */}
            <Badge status={stage} />
            {/* Law 3 — the terminal action, on screen. `stage` cannot carry it:
                Cancelled is `cancelled_at`, orthogonal to the six, so a
                cancelled booking's block still reads Quote / On Rent. The word,
                the icon and the hue all come from <Badge>'s `flag` path
                (FLAGS.Cancelled, token `danger`) — never assembled here. */}
            {booking.isCancelled && <Badge flag="Cancelled" />}
            {/* §11.1 — computed from the QUERIED lines on every render; there
                is no stored `bookings.is_sub_rental` and there must not be. */}
            {subRental && <SubRentedMark label="Sub-rental" />}
            {stage === 'Returned' &&
              canCloseRental(gctx.role) &&
              (cancelledReason ? (
                <Unavailable reason={cancelledReason}>
                  <Button icon="check" variant="primary" disabled>
                    Close Rental
                  </Button>
                </Unavailable>
              ) : (
                <Button icon="check" variant="primary" onClick={closeBooking} disabled={closing}>
                  {closing ? 'Closing…' : 'Close Rental'}
                </Button>
              ))}
              {stage === 'Quote' && (
              <>
                <Unavailable reason={SEND_QUOTE_UNAVAILABLE}>
                  <Button icon="arrow_right" variant="secondary" disabled>
                    Send Quote
                  </Button>
                </Unavailable>
                {/* `confirmRental` refuses a cancelled booking by name before it
                    writes anything, so a live Confirm here is a press that can
                    only end in the error banner below the header. */}
                {cancelledReason ? (
                  <Unavailable reason={`${booking.bookingNo} is cancelled — a cancelled booking is not confirmed.`}>
                    <Button icon="plus" variant="primary" disabled>
                      Confirm Booking
                    </Button>
                  </Unavailable>
                ) : (
                  <Button icon="plus" variant="primary" onClick={confirmBooking} disabled={confirming}>
                    {confirming ? 'Confirming…' : 'Confirm Booking'}
                  </Button>
                )}
              </>
            )}
            <OperationsLauncher
              label="Operations"
              icon="external_link"
              primary={!['Quote', 'Closed'].includes(stage)}
              unavailable={operationsUnavailable}
              onOpen={() => setShellOpen(true)}
            />
            {/* Two gates, both required: money visibility ("may this role see
                this figure") AND capability ("may this role do this").
                `canPerformOperations` remains the narrowest EXISTING rule —
                the capability matrix TODO(decision) lives with core.ts. */}
            <OverflowMenu
              items={[
                /* §3 — ONE "Message client" entry with a stage-aware submenu.
                   WhatsApp is never the primary verb and never a row verb
                   (RAIL_AND_QUICK_ACTIONS F5); it lives here, behind one row,
                   so a booking offering four messages cannot push the
                   operational verbs down. A message that cannot be composed
                   stays VISIBLE and disabled with its reason (§4.2). */
                {
                  label: 'Message client',
                  icon: 'message' as const,
                  onClick: () => undefined,
                  ...messageClient,
                },
                /* BD-03 — the three operational verbs carry the SAME refusal
                   the rentals list gives this row, so a cancelled booking
                   cannot be extended, crewed or sub-rented from here. Visible
                   and greyed with the reason (§4.2), never removed: Law 3 is
                   about what happened to the booking, and hiding the verbs
                   would hide that it happened. */
                ...(canBookingMoney && canOperate
                  ? [
                      {
                        label: 'Extend rental',
                        icon: 'calendar' as const,
                        onClick: () => setShowExtendModal(true),
                        ...(cancelledReason ? { unavailable: cancelledReason } : {}),
                      },
                    ]
                  : []),
                ...(canCrewMoney && canOperate
                  ? [
                      {
                        label: 'Assign crew',
                        icon: 'users' as const,
                        onClick: () => setShowCrewModal(true),
                        ...(cancelledReason ? { unavailable: cancelledReason } : {}),
                      },
                    ]
                  : []),
                ...(canCrewMoney && canOperate
                  ? [
                      {
                        label: 'Create sub-rental',
                        icon: 'box' as const,
                        onClick: () => setShowSubRentalModal(true),
                        ...(cancelledReason ? { unavailable: cancelledReason } : {}),
                      },
                    ]
                  : []),
                {
                  label: 'Save draft',
                  icon: 'file',
                  onClick: () => undefined,
                  unavailable:
                    'Draft saving has no write path — booking edits from this screen are not persisted yet.',
                },
              ]}
            />
          </>
        }
      />

      <div style={{ ...cardStyle, padding: onPhone ? '12px 14px' : '16px 18px' }}>
        <Stepper status={stage} dots={onPhone} />
      </div>

      {onPhone && <Segmented segments={segments} active={activeSegment} onPick={setSegment} />}

      {/* Facts strip — schedule on the left, money on the right. */}
      <div
        style={{
          ...cardStyle,
          display: 'grid',
          gridTemplateColumns: factsCols,
          alignItems: 'stretch',
        }}
      >
        <Fact icon="users" label="Client" viewport={viewport}>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
            {booking.clientName}
          </span>
        </Fact>

        {[
          { label: 'Pickup', iso: booking.pickupAtAd },
          { label: 'Return', iso: booking.returnAtAd },
        ].map((m) => (
          <Fact key={m.label} icon="calendar" label={m.label} viewport={viewport}>
            {/* F2 — BS leads, AD follows. '—' when the instant is outside the
                one month `lib/bs.ts` can vouch for: no BS label, never a wrong
                one. */}
            <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
              {bsOrDash(m.iso)}
            </span>
            <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {formatAdDateTime(m.iso)}
            </span>
          </Fact>
        ))}

        <Fact icon="timer" label="Rental Days" viewport={viewport}>
          <span className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
            {days ?? '—'}
          </span>
          {/* The unit is dropped with the figure: "— Days" reads as a count of
              nothing rather than as an unknown length. */}
          {days !== null && (
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginLeft: 5 }}>
              Day{days === 1 ? '' : 's'}
            </span>
          )}
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {/* The second copy of the header's block, in the Rental Days fact.
                Same delegation, `size="sm"` because it sits in the denser fact
                strip — the weight, casing and tracking that ARE a status block
                do not scale away with it. */}
            <Badge status={stage} size="sm" />
            {/* Law 3 — wherever the stage block appears, the cancellation
                appears with it. A strip that shows "ON RENT" alone on a
                cancelled booking is the reading BD-03 is about. */}
            {booking.isCancelled && <Badge flag="Cancelled" size="sm" />}
          </span>
        </Fact>

        {canBookingMoney && (
          <div
            style={{
              padding: '14px 16px',
              gridColumn: viewport === 'desktop' ? undefined : '1 / -1',
              borderRadius: viewport === 'desktop' ? '0 var(--r-card) var(--r-card) 0' : '0 0 var(--r-card) var(--r-card)',
            }}
          >
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Outstanding</div>
            <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--danger-text)', letterSpacing: '-0.02em' }}>
              {hasInvoice ? money(totals.outstanding) : '—'}
            </div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 6 }}>
              {/* The dash above says "no figure". This line must say WHY, and
                  "No invoice raised yet" is only one of the three reasons. */}
              {hasInvoice
                ? 'From this booking’s invoices'
                : invoicesList.error !== null
                  ? 'Invoices could not be read — no figure is stated'
                  : !invoicesKnown
                    ? 'Reading this booking’s invoices…'
                    : 'No invoice raised yet'}
              {' · Deposit Required '}
              <span className="figure" style={{ color: 'var(--progress-text)', fontWeight: 600 }}>
                {booking.depositRequired !== null ? formatMoney(booking.depositRequired) : 'not recorded'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* The confirm dispatch's own failure, persistent until the next attempt
          (Law 12 — errors inline, toasts for successes only). */}
      {confirmError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--sp-sm)',
            padding: '10px 12px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--danger)',
            background: 'var(--st-danger-bg)',
            fontSize: 'var(--t-meta)',
            color: 'var(--danger-text)',
          }}
        >
          <Icon name="alert_triangle" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{confirmError}</span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1fr) auto' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {showSegment('Items') && (
            <Block no="1" title="Client & Schedule">
              {/* Read-only. The inline-edit mode this block used to carry
                  edited a module constant for the session and persisted
                  nothing; over live rows that becomes values that silently
                  revert on reload — a fabricated write, so it is gone until a
                  real booking-update action exists. */}
              <SummaryRows
                rows={[
                  { label: 'Client', value: booking.clientName },
                  { label: 'Project', value: booking.project ?? 'Not recorded' },
                  { label: 'Pickup Location', value: booking.pickupLocation ?? 'Not recorded' },
                  { label: 'Return Location', value: booking.returnLocation ?? 'Not recorded' },
                  /* `formatRentalDays` also fixes the unpluralised "1 Days"
                     this row printed on a one-day hire. */
                  { label: 'Rental Days', value: formatRentalDays(days, 'Not recorded') },
                ]}
              />
              {/* BD-08 — inline and persistent, in the block this failure is
                  ABOUT (§12: errors inline, toasts for successes only). Without
                  it the only trace of a failed client read was a greyed row
                  inside a closed overflow menu, and the sentence it carried
                  there blamed the client's record.

                  The copy says "until the booking is reopened" and not "until it
                  loads" because THIS SCREEN CANNOT RETRY: the contact effect has
                  one dependency, `booking?.clientId`, and nothing else re-runs
                  it — the two retry controls on the page call
                  `invoicesList.refetch()` and `paymentsList.refetch()`. Only a
                  remount re-reads the client. A retry control here would be the
                  better fix; it is not in this change's scope, so the sentence
                  states what is true today rather than promising a recovery that
                  never arrives. TODO(decision) is NOT needed — this is a build
                  task, not a ruling. */}
              {contact.kind === 'failed' && (
                <p
                  role="alert"
                  style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', lineHeight: 1.5 }}
                >
                  This client’s record could not be read, so their phone number is <strong>unknown</strong>, not
                  absent. WhatsApp messages and the payment receipt stay unavailable until the booking is reopened.{' '}
                  {contact.message}
                </p>
              )}
            </Block>
          )}

          {showSegment('Items') && (
            <Block
              no="2"
              title="Equipment, Bundles & Services"
              action={
                <Unavailable reason={ITEM_EDIT_UNAVAILABLE}>
                  <Button icon="plus" variant="primary" disabled>
                    Add Item
                  </Button>
                </Unavailable>
              }
            >
              {/* §12 — a failed release is inline and persistent, above the
                  table whose chip refused to clear. Success is a toast. */}
              {releaseError && (
                <div style={{ marginBottom: 'var(--sp-sm)' }}>
                  <ErrorBanner title="Could not release the unit" message={releaseError} />
                </div>
              )}
              {floorError ? (
                <ErrorBanner title="Could not load this booking's items" message={floorError} />
              ) : floorLoading ? (
                <LoadingSkeleton type="table" rows={4} label="Loading items…" />
              ) : lines.length === 0 ? (
                <NotWiredNote>
                  {floor && floor.linesPresence === 'present'
                    ? 'This booking has no live lines — every line is either voided or none were ever added.'
                    : 'The lines embed did not come back for this booking, which is a query fault, not an empty booking.'}
                </NotWiredNote>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        {/*
                          ⚠ No `Rate / Day` and no `Total` for ANY role — not a
                          Law 6 gate but a source gate: this read is
                          `fetchFloorBooking`, which deliberately names no money
                          column (`booking_lines.rate` is in 0019's revoked
                          set; the masked read is `booking_lines_v`, which has
                          no query module yet). The booking's money lives in
                          Block 4, from the invoice. Rendering a per-line rate
                          here again means a `booking_lines_v` fetcher, not a
                          seed.
                        */}
                        {/* Five columns, not six. The sixth was an unlabelled
                            spacer for the ⋮ glyph removed below (BD-05). */}
                        {['Item', 'Serial / ID', 'Qty', 'Status', 'Location'].map((h, i) => (
                          <th key={h} style={{ ...th, textAlign: i === 2 ? 'right' : 'left' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const depth = l.parentLineId ? 1 : 0
                        const packedCount = l.units.filter((u) => u.packed).length
                        const lineState =
                          l.units.length === 0
                            ? null
                            : packedCount === l.units.length
                              ? ('Packed' as const)
                              : packedCount > 0
                                ? ('Partial' as const)
                                : null
                        return (
                          <tr
                            key={l.id}
                            style={{ borderBottom: '1px solid var(--border)', ...subRentedRowStyle({ lineType: l.lineType }) }}
                          >
                            <td style={{ ...td, paddingLeft: 10 + depth * 18 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Icon name={depth === 0 ? 'chevron_down' : 'dot'} size={depth === 0 ? 13 : 8} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                                <span style={{ fontWeight: depth === 0 ? 700 : 500 }}>
                                  {l.productName ?? l.description ?? '(no description)'}
                                </span>
                                {l.lineType !== 'Equipment' && !isSubRentedLine({ lineType: l.lineType }) && (
                                  <ItemBadge text={l.lineType} kind={l.lineType === 'Bundle' ? 'bundle' : 'count'} />
                                )}
                                {/* Law 11 — the gold outline never travels alone. */}
                                {isSubRentedLine({ lineType: l.lineType }) && <SubRentedMark />}
                              </span>
                              {l.units.length > 0 && (
                                <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2, paddingLeft: 19 }}>
                                  {l.units.length} unit{l.units.length === 1 ? '' : 's'} assigned
                                </span>
                              )}
                            </td>
                            <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                              {/*
                                Chips, not a comma list — v2.5 §10.4's ruled shape for
                                creation-time serial assignments. The × is VISIBLE, never
                                hover-revealed (§10.4 observed Booqable's hover-only × and
                                ruled "do not copy"), and LIVE since §4.39 was ruled (a):
                                the press RELEASES the assignment — `released_at`/
                                `released_by` on the row (migration 0076), never a DELETE,
                                which 0044's Law 3 backstop rejects for every role. Past
                                Packed the press asks first (§10.4's confirm); the role
                                gate mirrors `unit.release` = `booking_line_units_all`'s
                                five, and for everyone else the control is ABSENT, not
                                disabled — the same shape as the payment buttons (Law 6's
                                omitted-not-masked direction applied to a verb).
                              */}
                              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {l.units
                                  .filter((u) => u.serial || u.assetTag)
                                  .map((u) => {
                                    const label = u.serial ?? u.assetTag ?? ''
                                    return (
                                      <span
                                        key={u.id}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 2,
                                          border: '1px solid var(--border)',
                                          borderRadius: 'var(--r-chip)',
                                          background: 'var(--card2)',
                                          padding: canReleaseUnits ? '1px 2px 1px 7px' : '1px 7px',
                                        }}
                                      >
                                        <Link to={`/inventory/${label}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                          {label}
                                        </Link>
                                        {canReleaseUnits && (
                                          <button
                                            type="button"
                                            onClick={() => requestReleaseUnit(u.id, label)}
                                            disabled={releasingUnitId !== null}
                                            aria-label={`Release ${label}`}
                                            title={
                                              pastPacked
                                                ? `Release ${label} — this booking is past Packed, so you will be asked to confirm`
                                                : `Release ${label} from this booking`
                                            }
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              width: 20,
                                              height: 20,
                                              padding: 0,
                                              border: 'none',
                                              background: 'transparent',
                                              color: releasingUnitId === u.id ? 'var(--disabled)' : 'var(--muted)',
                                              cursor: releasingUnitId !== null ? 'wait' : 'pointer',
                                              borderRadius: 'var(--r-xs)',
                                            }}
                                          >
                                            <Icon name="close" size={12} />
                                          </button>
                                        )}
                                      </span>
                                    )
                                  })}
                              </span>
                            </td>
                            <td className="figure" style={{ ...td, textAlign: 'right' }}>{l.qty}</td>
                            <td style={td}>
                              {lineState && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 'var(--sp-xs)',
                                    fontSize: 'var(--t-meta)',
                                    fontWeight: 600,
                                    color: lineState === 'Packed' ? 'var(--success-text)' : 'var(--progress-text)',
                                  }}
                                >
                                  <Icon name={lineState === 'Packed' ? 'dot' : 'alert_triangle'} size={11} />
                                  {lineState}
                                </span>
                              )}
                            </td>
                            <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                              {l.units.map((u) => u.location).find((loc) => loc !== null) ?? ''}
                            </td>
                            {/*
                              ⛔ A sixth cell held a bare `more_vert` glyph here:
                              an <Icon>, not a button, with no handler and no
                              menu anywhere in this file to open. It sat alone
                              in a 26px last column under an unlabelled header —
                              the position and the glyph of a row menu — so it
                              read as one and did nothing when pressed. A fake
                              affordance (BD-05).

                              Nothing was lost with it. The only row-level verb
                              this screen has is the unit release, which is the
                              × on each serial chip in the Serial/ID cell — the
                              second of the five columns, not the neighbour of
                              the sixth this removed; line writes
                              have no path at all, which is what the Add Item
                              button's `ITEM_EDIT_UNAVAILABLE` says. Removing
                              dead UI is not a Law 3 deletion — Law 3 governs
                              entities and data, and no line, unit or booking is
                              touched here.
                            */}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {lines.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-lg)',
                    flexWrap: 'wrap',
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)',
                    fontSize: 'var(--t-meta)',
                  }}
                >
                  {tally.map((t) => (
                    <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span className="figure" style={{ fontWeight: 700, color: BRAND_TEXT[t.tone] }}>
                        {t.value}
                      </span>
                      <span style={{ color: 'var(--text2)' }}>{t.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </Block>
          )}

          {showSegment('Items') && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1.05fr) minmax(0,1fr)' : '1fr',
                gap: 'var(--sp-md)',
              }}
            >
              <Block
                no="3"
                title="Crew & Transport"
                action={
                  <Unavailable reason={CREW_ADD_UNAVAILABLE}>
                    <Button icon="plus" disabled>
                      Add Member
                    </Button>
                  </Unavailable>
                }
              >
                {/* `booking_crew_lines` has no query module. The seed printed
                    three invented crew members with invented day rates to every
                    booking — absence stated beats a fabricated roster. */}
                <NotWiredNote>
                  Crew assignments live in booking_crew_lines, which has no query module yet — this booking&apos;s
                  crew cannot be read from here, so none is shown.
                </NotWiredNote>
              </Block>

              <Card
                title="Transport & Delivery"
                action={
                  <Unavailable reason={TRANSPORT_EDIT_UNAVAILABLE}>
                    <Button variant="ghost" icon="tool" disabled>
                      Edit
                    </Button>
                  </Unavailable>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>Delivery Type</span>
                    {/*
                      ⛔ This carried `STATUS.in` — the green §2 reserves for
                      "home & ready / settled". `delivery_type` is not a status:
                      it is how the gear travels, it is chosen at creation and
                      nothing the booking does changes it. Painting it green
                      told a reader scanning the card by colour that a Courier
                      delivery was settled, and spent one of the seven
                      one-meaning hues on a field that has no state.

                      Same resolution `ItemBadge` above reached for `line_type`:
                      one neutral surface with a border, distinguished by its
                      WORD, which is the only thing that ever carried the fact.
                    */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: 20,
                        padding: '0 8px',
                        borderRadius: 'var(--r-chip)',
                        background: 'var(--card2)',
                        color: 'var(--text2)',
                        border: '1px solid var(--border)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                      }}
                    >
                      {deliveryTypeLabel(booking.deliveryType)}
                    </span>
                  </div>
                  {[
                    { label: 'Pickup Location', value: booking.pickupLocation ?? 'Not recorded' },
                    { label: 'Return Location', value: booking.returnLocation ?? 'Not recorded' },
                  ].map((t) => (
                    <div key={t.label} style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{t.label}</span>
                      <span style={{ color: 'var(--text)', textAlign: 'right', maxWidth: 170 }}>{t.value}</span>
                    </div>
                  ))}
                  <NotWiredNote>
                    Vehicle, driver and delivery instructions live in booking_transport, which has no query module
                    yet.
                  </NotWiredNote>
                </div>
              </Card>
            </div>
          )}

          {/* Law 6 — the whole money block is omitted outright for a role that
              can't see it, not masked field by field. */}
          {canBookingMoney && showSegment('Money') && (
            <Block no="4" title="Pricing & Payments">
              {invoicesList.error || paymentsList.error ? (
                <ErrorBanner
                  title="Could not load this booking's money"
                  message={invoicesList.error ?? paymentsList.error ?? ''}
                  onRetry={() => {
                    invoicesList.refetch()
                    paymentsList.refetch()
                  }}
                />
              ) : invoicesList.loading || paymentsList.loading ? (
                <LoadingSkeleton type="card" label="Loading invoices and payments…" />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: viewport === 'desktop' ? 'repeat(3, minmax(0,1fr))' : '1fr',
                    gap: 'var(--sp-md)',
                  }}
                >
                  <div>
                    <h3 style={sub}>Rental Charges</h3>
                    {/* The figures are the invoice's own columns — computed by
                        the DB chain (`recalculate_invoice_totals`,
                        `sync_payment_to_invoice`), summed here across this
                        booking's live invoices, never re-priced (Law 1). */}
                    {hasInvoice ? (
                      <>
                        {[
                          { label: 'Subtotal', value: grouped(toRupees(totals.subtotal as Paisa)) },
                          { label: 'Discount', value: `-${grouped(toRupees(totals.discount as Paisa))}` },
                          { label: 'Taxable Amount', value: grouped(toRupees(totals.taxable as Paisa)) },
                          { label: 'VAT', value: grouped(toRupees(totals.vat as Paisa)) },
                        ].map((t) => (
                          <div key={t.label} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '4px 0', fontSize: 'var(--t-meta)' }}>
                            <span style={{ color: 'var(--text2)', flex: 1 }}>{t.label}</span>
                            <span className="figure" style={{ fontWeight: 600 }}>{t.value}</span>
                          </div>
                        ))}
                        <div
                          style={{
                            display: 'flex',
                            gap: 'var(--sp-sm)',
                            marginTop: 6,
                            paddingTop: 8,
                            borderTop: '1px solid var(--border)',
                            fontSize: 'var(--t-ui)',
                            fontWeight: 700,
                          }}
                        >
                          <span style={{ flex: 1 }}>Rental Total</span>
                          <span className="figure">{money(totals.total)}</span>
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                          From {liveInvoices.length === 1 ? `invoice ${liveInvoices[0]?.invoiceNo}` : `${liveInvoices.length} live invoices`}.
                        </p>
                      </>
                    ) : (
                      <NotWiredNote>
                        No invoice has been raised against this booking, so there is no charge breakdown to show.
                        Raise one from Finance — the totals here are the invoice&apos;s own columns, never a figure
                        this screen computes.
                      </NotWiredNote>
                    )}
                  </div>

                  <div>
                    <h3 style={sub}>Deposit</h3>
                    <SummaryRows
                      rows={[
                        {
                          label: 'Deposit Required',
                          value: booking.depositRequired !== null ? formatMoney(booking.depositRequired) : 'Not recorded',
                        },
                      ]}
                    />
                    <NotWiredNote>
                      Received and pending live in security_deposits / deposit_movements, which have no query module
                      yet (Law 5 keeps them out of the payments ledger) — absent here, not zero.
                    </NotWiredNote>
                    <p
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 5,
                        margin: '8px 0 0',
                        fontSize: 'var(--t-th)',
                        color: 'var(--muted)',
                      }}
                    >
                      <Icon name="info" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>
                        A liability held on the client&apos;s behalf. It is never part of Rental Total and never
                        reduces Outstanding — the two columns are deliberately not summed.
                      </span>
                    </p>
                    {hasInvoice && (
                      <>
                        <h3 style={{ ...sub, marginTop: 16 }}>Payments (Rental Only)</h3>
                        <SummaryRows
                          rows={[
                            { label: 'Rental Paid', value: money(totals.paid), tone: 'success' as BrandKey },
                            { label: 'Rental Outstanding', value: money(totals.outstanding), tone: 'danger' as BrandKey },
                          ]}
                        />
                      </>
                    )}
                    {/* §2.2 — payments and deposit movements are immutable
                        (Law 4); the correction is a reversal row, never an
                        edit. The late-return panel that stood here ran on
                        three seeded instants and a seeded day rate; it returns
                        when a per-booking day rate has a sanctioned read. */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 12, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      <Icon name="lock" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>
                        Payments and deposit movements are immutable. Correct one with a reversal row or a credit
                        note — never by editing the figure.
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 style={sub}>Payment History (Rental)</h3>
                    {paymentRows.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        No payments have been recorded against this booking.
                      </p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--th-bg)' }}>
                            {['Date', 'Type', 'Amount', 'Method', 'Status'].map((h) => (
                              <th key={h} style={th}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paymentRows.map(({ key, tone, payment: p, glance, detail }) => (
                            <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)' }}>
                                <IntelCard
                                  glance={glance}
                                  detail={detail}
                                  detailTitle={`${p.type} payment`}
                                  detailSubtitle={`${id} · ${p.date}`}
                                >
                                  {p.date}
                                </IntelCard>
                              </td>
                              <td style={{ ...td, fontSize: 'var(--t-meta)' }}>{p.type}</td>
                              <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)' }}>{p.amount}</td>
                              {/* '—' = no bank account recorded on the row. It
                                  is NOT read as Cash — 'Cash' is a channel
                                  group of its own. New payments carry the
                                  account picked in the modal. */}
                              <td style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{p.method}</td>
                              <td style={{ ...td, fontSize: 'var(--t-meta)' }}>
                                {/* The row's OWN status, through the one status
                                    renderer. Hand-assembling the chip here is
                                    how it came to be green regardless of what
                                    it said (BD-16). */}
                                <Badge tone={tone} label={p.status} icon={<Icon name={STATUS_ICON[tone]} size={11} />} size="sm" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {canTakePayment && <div style={{ marginTop: 10 }}>{recordPaymentButton('Record Payment')}</div>}
                  </div>
                </div>
              )}
            </Block>
          )}

          {showSegment('Docs') && (
            <Block no="5" title="Documents & Review">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1.2fr) minmax(0,1fr)' : '1fr',
                  gap: 'var(--sp-md)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                  {/* The five seeded document tiles belonged to no booking.
                      `document_registry` / `booking_documents` have no query
                      module yet. */}
                  <NotWiredNote>
                    This booking&apos;s documents live in document_registry, which has no query module yet — nothing
                    is listed rather than five tiles that belong to no booking.
                  </NotWiredNote>
                  <span>
                    <Unavailable reason={ADD_DOCUMENT_UNAVAILABLE}>
                      <Button icon="plus" disabled>
                        Add Document
                      </Button>
                    </Unavailable>
                  </span>
                </div>

                <div>
                  <h3 style={sub}>Review Summary</h3>
                  {/* Derived from the same queried rows the blocks above
                      render — a merge, not a second query. The Pricing row is
                      dropped, not blanked, for a money-blind role (Law 6). */}
                  {[
                    { label: 'Client & Schedule', value: booking.clientName ? 'Completed' : 'Missing', ok: !!booking.clientName },
                    {
                      label: 'Equipment',
                      value: floorLoading ? 'Loading…' : `${booking.itemCount} Item${booking.itemCount === 1 ? '' : 's'}`,
                      ok: booking.itemCount > 0,
                    },
                    ...(canBookingMoney
                      ? [
                          {
                            label: 'Pricing',
                            value: hasInvoice ? money(totals.total) : noInvoiceCell,
                            ok: hasInvoice,
                          },
                          {
                            label: 'Payments',
                            value: hasInvoice ? (totals.outstanding > 0 ? 'Attention' : 'Settled') : noInvoiceCell,
                            ok: hasInvoice && totals.outstanding <= 0,
                          },
                        ]
                      : []),
                  ].map((r) => (
                    <div key={r.label} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '5px 0', fontSize: 'var(--t-meta)', alignItems: 'center' }}>
                      <Icon
                        name={r.ok ? 'dot' : 'alert_triangle'}
                        size={12}
                        style={{ color: r.ok ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0 }}
                      />
                      <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{r.label}</span>
                      <span style={{ color: r.ok ? 'var(--text)' : 'var(--progress-text)', fontWeight: 600 }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Block>
          )}
        </div>

        {/* Rulings §7 — rails reflow below 1280, never hide. */}
        {viewport === 'desktop' ? (
          <Rail>{railBody}</Rail>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>{railBody}</div>
        )}

        {/* The close dispatch's own failure. R-07 keeps Close a HARD gate, so a
            refusal here is the normal, expected answer when money is outstanding
            or the deposit is unresolved — it must be readable, not a toast
            (Law 12 — errors inline, toasts for successes only). */}
        {closeError && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--sp-sm)',
              padding: '10px 12px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--danger)',
              background: 'var(--st-danger-bg)',
              fontSize: 'var(--t-meta)',
              color: 'var(--danger-text)',
            }}
          >
            <Icon name="alert_triangle" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{closeError}</span>
          </div>
        )}
      </div>

      {/* §4.2's tablet/phone sticky bar — entirely money, so a money-blind
          session gets NO bar (Law 6, omitted not greyed), and a booking with
          no invoice gets none either: there is no Rental Total to state. */}
      {viewport !== 'desktop' && canBookingMoney && hasInvoice && (
        <div
          style={{
            position: 'sticky',
            bottom: viewport === 'phone' ? BAR_BOX : 0,
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-md)',
            padding: '10px 14px',
            borderRadius: 'var(--r-card)',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Rental Total</span>
            <span
              className="figure"
              style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}
            >
              {money(totals.total)}
            </span>
          </span>
          {canTakePayment && recordPaymentButton('Record Payment')}
        </div>
      )}

      <FooterNote extra={['Deposits are liabilities and never offset Rental Outstanding']} />

      <OperationsShell bookingNo={id} bookingStatus={stage} isOpen={shellOpen} onClose={() => setShellOpen(false)} />

      {/*
        Create Invoice — R-01's second entry point, which this screen did not
        have. The modal is a read-only PREVIEW of the lines `createInvoice` will
        snapshot off this booking; nothing on it is typed, because nothing on an
        invoice raised this way is a screen's to choose (§4.46(a), derived from
        R-03 + SPEC-P0-1 §3.1 — see the modal's header).

        Mounted only while open, like the payment modal beside it: the modal
        reads the booking's lines when it opens, so a persistent mount would hold
        one booking's bill across a navigation. `canRaiseInvoice` is repeated on
        the mount so a mid-session role change cannot leave an orphaned money
        form.

        After a confirmed create both money lists are refetched. The new Draft
        appears because the DATABASE returned it — never prepended here, which is
        what would let a row that was not written stay on screen.
      */}
      {canRaiseInvoice && showCreateInvoice && (
        <CreateInvoiceModal
          isOpen={showCreateInvoice}
          onClose={() => setShowCreateInvoice(false)}
          bookingNo={booking.bookingNo}
          onSuccess={() => {
            invoicesList.refetch()
            paymentsList.refetch()
          }}
        />
      )}

      {/*
        The shared payment modal. RULED 12 Aug 2026: a payment posts against
        the BOOKING and settles against an invoice — but `recordPayment`
        resolves its target by `invoices.invoice_no` and has NO booking-number
        path (its own header, facts 1–5), so this screen now hands it the
        booking's real invoice(s) instead of the booking number the audit
        caught it passing (the modal then failed on every submit with "No
        invoice numbered B-715 exists"). When the booking has no invoice the
        launchers render Unavailable with the reason, and this modal is not
        mounted at all — an open form that can only refuse is worse than a
        stated gate. Whether a payment may be taken BEFORE any invoice exists
        remains the open TODO(decision) recorded in recordPayment.ts; it is
        not closed from here.

        Mounted only while open (P0-1, BUG_SWEEP_REGISTER_v1.0): the modal
        captures `initialInvoiceId` on first mount. `canTakePayment` is
        repeated on the mount so a mid-session role change cannot leave an
        orphaned payment form. After a recorded payment both money lists are
        refetched — `sync_payment_to_invoice()` has moved the invoice's paid/
        outstanding and this screen re-reads rather than recomputes (Law 1).
      */}
      {canTakePayment && showPaymentModal && primaryInvoice && (
        <RecordPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          /* `id` is the invoice's UUID, not its number (MONEY-05): a Draft has
             no number (R-15) and this screen's invoices are Drafts for most of
             a booking's life, so the number path could never settle one. The
             number rides along as the picker's label and is null on a Draft. */
          invoices={liveInvoices.map((inv) => ({
            id: inv.id,
            invoiceNo: inv.invoiceNo,
            client: inv.clientName,
            amount: formatMoney(inv.totalAmount),
            status: inv.status,
            booking: inv.bookingNo,
          }))}
          initialInvoiceId={primaryInvoice.id}
          onSuccess={(p) => {
            paymentsList.refetch()
            invoicesList.refetch()

            /*
             * WHATSAPP_LINKS_SPEC v1.0 §5.3 — "Send receipt" rides the success
             * toast (a toast carrying a follow-on to something that SUCCEEDED
             * is still Law 12).
             *
             * ⚠ The toast is raised AFTER a fresh invoice read, not before,
             * and that ordering is the whole correctness of this handler. The
             * receipt states a remaining balance. `totals.outstanding` in this
             * closure is the PRE-payment figure — the refetch above has not
             * landed — so composing from it would tell a client they still owe
             * the money they just handed over. The alternative, subtracting
             * the amount here, is the UI doing money arithmetic that
             * `sync_payment_to_invoice()` owns (Law 2). So the balance is READ
             * back from the invoices, and the ~100ms that costs is invisible
             * next to a wrong figure in writing.
             *
             * Composing the URL up front is also what lets the toast offer a
             * real anchor rather than a click handler: `window.open` after an
             * await has left its user gesture behind and is blocked.
             */
            void (async () => {
              const label = `${formatMoney(p.amountPaisa)} against ${p.invoiceId}`
              /* Law 6 — a session that may not see money never composes a
                 receipt, and the no-phone case simply has nowhere to send it. */
              if (!bookingId || !canBookingMoney || !clientPhone) {
                showSuccessToast('Payment Recorded', label)
                return
              }
              try {
                const fresh = await listInvoices(invoicesForBooking(bookingId))
                const live = fresh.rows.filter((r) => !r.isVoid)
                const balance = live.reduce((sum, r) => sum + r.outstandingAmount, 0) as Paisa
                const s = readSettings()
                const href = buildWaLink(
                  clientPhone,
                  paymentReceipt(
                    {
                      clientName: booking.clientName,
                      bookingNo: booking.bookingNo,
                      amount: p.amountPaisa,
                      method: p.method,
                      balance,
                    },
                    { businessName: String(s.organisationName), businessPhone: String(s.businessPhone) },
                  ),
                )
                showSuccessToast(
                  'Payment Recorded',
                  label,
                  href ? { label: 'Send receipt on WhatsApp', href } : undefined,
                )
              } catch {
                /* The payment IS recorded — that is what the toast reports. A
                   receipt that cannot be composed loses the offer, not the
                   confirmation, and never turns a success into an error. */
                showSuccessToast('Payment Recorded', label)
              }
            })()
          }}
        />
      )}

      {/* v2.5 §10.4 — release confirms when the booking is past Packed. The
          dialog only ever mounts from `requestReleaseUnit`, which asked the
          stage question; before Packed the press releases directly. */}
      <ConfirmDialog
        isOpen={confirmRelease !== null}
        onClose={() => setConfirmRelease(null)}
        onConfirm={() => {
          if (!confirmRelease) return
          const { unitRowId, label } = confirmRelease
          setConfirmRelease(null)
          void doReleaseUnit(unitRowId, label)
        }}
        title={`Release ${confirmRelease?.label ?? 'this unit'}?`}
        description={`This booking is ${floorStage ?? 'past Packed'} — the unit has already been through packing. Releasing it marks the assignment ended (the row is kept, Law 3) and the serial leaves this booking's floor lists.`}
        confirmLabel="Release unit"
        variant="danger"
        isSubmitting={releasingUnitId !== null}
      />

      <ExtendRentalModal
        isOpen={showExtendModal}
        onClose={() => setShowExtendModal(false)}
        bookingId={id}
        client={booking.clientName}
        /* The queried return instant — the prop whose absence made this modal
           structurally un-submittable from this page (page doc §7.6). The
           action behind it is still a stub that fails closed; the modal now at
           least states THAT reason instead of a missing-prop one. */
        currentReturnDate={booking.returnAtAd}
        onSuccess={(ext) => {
          showSuccessToast('Rental Extended', `${ext.days} day${ext.days === 1 ? '' : 's'} added — new return ${ext.newReturnDate}`)
        }}
      />

      <AssignCrewModal
        isOpen={showCrewModal}
        onClose={() => setShowCrewModal(false)}
        bookingId={id}
        onSuccess={(crew) => {
          showSuccessToast('Crew Assigned', `${crew.name} — ${crew.role}`)
        }}
      />

      <CreateSubRentalModal
        isOpen={showSubRentalModal}
        onClose={() => setShowSubRentalModal(false)}
        bookingId={id}
        onSuccess={(subR) => {
          showSuccessToast('Sub-Rental Created', `${subR.itemName} — ${subR.vendor}`)
        }}
      />
    </div>
  )
}

function Fact({
  icon,
  label,
  children,
  viewport,
}: {
  icon: 'users' | 'calendar' | 'timer'
  label: string
  children: React.ReactNode
  viewport: Viewport
}) {
  const divider = viewport === 'desktop' ? { borderRight: '1px solid var(--border)' } : { borderBottom: '1px solid var(--border)' }
  return (
    <div style={{ padding: '14px 16px', minWidth: 0, ...divider }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 6 }}>
        <Icon name={icon} size={14} style={{ color: 'var(--muted)' }} />
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}

const sub = {
  margin: '0 0 8px',
  fontSize: 'var(--t-meta)',
  fontWeight: 700,
  color: 'var(--text)',
} as const
