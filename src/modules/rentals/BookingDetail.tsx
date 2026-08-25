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
import { STATUS, BRAND, BRAND_ON, BRAND_TEXT } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { BOOKING_STATUS, STATUS_ORDER } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import OperationsShell from '../operations/OperationsShell'
import { Unavailable } from '../../components/ui/Unavailable'
import { useAuth } from '../../lib/auth'
import { newClientUuid } from '../../lib/supabase'
import { gateContext, canViewMoneyField } from '../../lib/fieldGating'
import { canRecordPayment, canPerformOperations } from '../../lib/rbac'
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
import type { ActionContext } from '../../actions/core'
import { useList } from '../../lib/queries/useList'
import { listBookings, fetchFloorBooking } from '../../lib/queries/bookings'
import type { BookingListOptions, BookingListRow, FloorBooking, FloorLine } from '../../lib/queries/bookings'
import { listInvoices, invoicesForBooking, listPayments, paymentsForBooking } from '../../lib/queries/finance'
import type { InvoiceListRow, PaymentListRow } from '../../lib/queries/finance'
import { isSubRentedLine, isSubRentalBooking } from '../../data/booking'
import type { PaymentHistoryRow } from '../../data/booking'

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
 * four workspace routes. Disabled only at Quote; the status now comes from the
 * QUERIED booking rather than a module constant, so `/rentals/B-812` gates on
 * B-812's own stage.
 */
function OperationsLauncher({
  primary,
  status,
  onOpen,
}: {
  primary: boolean
  status: BookingStatus
  onOpen: () => void
}) {
  const disabled = status === 'Quote'
  const button = (
    <Button icon="external_link" variant={primary ? 'primary' : 'secondary'} onClick={onOpen} disabled={disabled}>
      Operations
    </Button>
  )

  if (!disabled) return button
  return <Unavailable reason="Operations open once this booking is Booked">{button}</Unavailable>
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
}

function OverflowMenu({ items }: { items: OverflowItem[] }) {
  const [open, setOpen] = useState(false)
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
const td = { padding: '9px 10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

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

const NO_INVOICE_PAYMENT_UNAVAILABLE =
  'No invoice has been raised for this booking yet. recordPayment settles against an invoice ' +
  '(invoices.invoice_no), so raise one from Finance before taking money against this booking.'
const ITEM_EDIT_UNAVAILABLE =
  'Adding, searching or filtering booking lines is not wired yet — booking_lines has no write path from this screen.'
const CREW_ADD_UNAVAILABLE = 'Crew assignment writes are not wired — the crew.assign action is still a stub.'
const TRANSPORT_EDIT_UNAVAILABLE =
  'Transport details are read-only: booking_transport has no query or write path from this screen yet.'
const ADD_DOCUMENT_UNAVAILABLE = 'Document uploads are not wired — document_registry has no write path from this screen.'
const SEND_QUOTE_UNAVAILABLE = 'Quote sending is not wired yet — no action exists behind this button.'

/** Blank BS cell meaning: `lib/bs.ts` can only vouch for Shrawan 2083; outside it there is no BS label, not a wrong one. */
function bsOrDash(iso: string): string {
  const bs = toBs(new Date(iso))
  return bs ? formatBs(bs) : '—'
}

/** The AD span between two instants, in whole days, floored at 1 (Law 9's days-explicit floor). */
function rentalDays(pickupIso: string, returnIso: string): number {
  const ms = Date.parse(returnIso) - Date.parse(pickupIso)
  if (!Number.isFinite(ms)) return 1
  return Math.max(1, Math.round(ms / 86_400_000))
}

export default function BookingDetail() {
  const { bookingNo } = useParams()
  const id = bookingNo ?? ''
  const [shellOpen, setShellOpen] = useState(false)
  const [showExtendModal, setShowExtendModal] = useState(false)
  const [showCrewModal, setShowCrewModal] = useState(false)
  const [showSubRentalModal, setShowSubRentalModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
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
  }, [id])

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

  /* Law 3 — a voided invoice still exists, but its money is settled by its
     credit note, so the totals this page states are over the live ones. */
  const liveInvoices = useMemo(() => invoicesList.rows.filter((r) => !r.isVoid), [invoicesList.rows])
  const hasInvoice = liveInvoices.length > 0

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
     else the newest (the list arrives issue_date desc). */
  const primaryInvoice =
    liveInvoices.find((r) => r.status === 'Sent' || r.status === 'Partially Paid') ?? liveInvoices[0]

  /*
   * Payment History rows — live `payments` mapped into the display shape the
   * Hover Intel builders take. Every field is a real column: `method` is
   * `bank_accounts.channel_group` through the embed, and '—' means "no
   * account recorded on this payment" (never inferred as Cash — 'Cash' is a
   * channel group of its own). `recordedBy` is a `users.id`: the users table
   * is self-scoped, so an id is honest where a mostly-null name would not be.
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
          recordedBy: p.receivedById,
        }
        return {
          key: p.id,
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
  const days = rentalDays(booking.pickupAtAd, booking.returnAtAd)
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

  const recordPaymentButton = (label: string) =>
    hasInvoice ? (
      <Button icon="dollar" variant="primary" onClick={() => setShowPaymentModal(true)}>
        {label}
      </Button>
    ) : (
      <Unavailable reason={NO_INVOICE_PAYMENT_UNAVAILABLE}>
        <Button icon="dollar" variant="primary" disabled>
          {label}
        </Button>
      </Unavailable>
    )

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
              No invoice has been raised for this booking, so there is no Rental Total to state yet.
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
          {canTakePayment && <div style={{ marginTop: 12 }}>{recordPaymentButton('Receive Payment')}</div>}
        </Card>
      )}

      {showSegment('Docs') && (
        <>
          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--sp-sm)' }}>
              {(['Print', 'Share', 'More'] as const).map((a, i) => (
                <button
                  key={a}
                  type="button"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 4px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name={i === 0 ? 'file' : i === 1 ? 'arrow_right' : 'more_vert'} size={17} style={{ color: 'var(--text2)' }} />
                  {a}
                </button>
              ))}
            </div>
          </Card>

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
            {/* §11.1 — computed from the QUERIED lines on every render; there
                is no stored `bookings.is_sub_rental` and there must not be. */}
            {subRental && <SubRentedMark label="Sub-rental" />}
            {stage === 'Quote' && (
              <>
                <Unavailable reason={SEND_QUOTE_UNAVAILABLE}>
                  <Button icon="arrow_right" variant="secondary" disabled>
                    Send Quote
                  </Button>
                </Unavailable>
                <Button icon="plus" variant="primary" onClick={confirmBooking} disabled={confirming}>
                  {confirming ? 'Confirming…' : 'Confirm Booking'}
                </Button>
              </>
            )}
            <OperationsLauncher
              primary={!['Quote', 'Closed'].includes(stage)}
              status={stage}
              onOpen={() => setShellOpen(true)}
            />
            {/* Two gates, both required: money visibility ("may this role see
                this figure") AND capability ("may this role do this").
                `canPerformOperations` remains the narrowest EXISTING rule —
                the capability matrix TODO(decision) lives with core.ts. */}
            <OverflowMenu
              items={[
                ...(canBookingMoney && canOperate
                  ? [{ label: 'Extend rental', icon: 'calendar' as const, onClick: () => setShowExtendModal(true) }]
                  : []),
                ...(canCrewMoney && canOperate
                  ? [{ label: 'Assign crew', icon: 'users' as const, onClick: () => setShowCrewModal(true) }]
                  : []),
                ...(canCrewMoney && canOperate
                  ? [{ label: 'Create sub-rental', icon: 'box' as const, onClick: () => setShowSubRentalModal(true) }]
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
            {days}
          </span>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginLeft: 5 }}>Days</span>
          <span style={{ display: 'block', marginTop: 6 }}>
            {/* The second copy of the header's block, in the Rental Days fact.
                Same delegation, `size="sm"` because it sits in the denser fact
                strip — the weight, casing and tracking that ARE a status block
                do not scale away with it. */}
            <Badge status={stage} size="sm" />
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
              {hasInvoice ? 'From this booking’s invoices' : 'No invoice raised yet'}
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
                  { label: 'Rental Days', value: `${days} Days` },
                ]}
              />
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
                        {['Item', 'Serial / ID', 'Qty', 'Status', 'Location', ''].map((h, i) => (
                          <th key={h || i} style={{ ...th, textAlign: i === 2 ? 'right' : 'left' }}>
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
                              {l.units
                                .filter((u) => u.serial || u.assetTag)
                                .map((u, i, arr) => {
                                  const label = u.serial ?? u.assetTag ?? ''
                                  return (
                                    <span key={u.id}>
                                      <Link to={`/inventory/${label}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                        {label}
                                      </Link>
                                      {i < arr.length - 1 ? ', ' : ''}
                                    </span>
                                  )
                                })}
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
                            <td style={{ ...td, width: 26, color: 'var(--muted)' }}>
                              <Icon name="more_vert" size={14} />
                            </td>
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
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: 20,
                        padding: '0 8px',
                        borderRadius: 'var(--r-badge)',
                        background: STATUS.in.bg,
                        color: STATUS.in.fg,
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                      }}
                    >
                      {booking.deliveryType}
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
                          {paymentRows.map(({ key, payment: p, glance, detail }) => (
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
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    height: 19,
                                    alignItems: 'center',
                                    padding: '0 7px',
                                    borderRadius: 5,
                                    background: STATUS.in.bg,
                                    color: STATUS.in.fg,
                                    fontSize: 'var(--t-meta)',
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.status}
                                </span>
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
                            value: hasInvoice ? money(totals.total) : 'No invoice',
                            ok: hasInvoice,
                          },
                          {
                            label: 'Payments',
                            value: hasInvoice ? (totals.outstanding > 0 ? 'Attention' : 'Settled') : 'No invoice',
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
          invoices={liveInvoices.map((inv) => ({
            id: inv.invoiceNo,
            client: inv.clientName,
            amount: formatMoney(inv.totalAmount),
            status: inv.status,
            booking: inv.bookingNo,
          }))}
          initialInvoiceId={primaryInvoice.invoiceNo}
          onSuccess={(p) => {
            showSuccessToast('Payment Recorded', `${formatMoney(p.amountPaisa)} against ${p.invoiceId}`)
            paymentsList.refetch()
            invoicesList.refetch()
          }}
        />
      )}

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
