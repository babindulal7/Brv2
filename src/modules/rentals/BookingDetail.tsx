import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { EditableRows } from '../../components/ui/EditableRows'
import { useEditMode } from '../../lib/edit/useEditMode'
import type { FieldSpec } from '../../lib/edit/useEditMode'
import { LateFeePanel } from './LateFeePanel'
import { lateFee } from '../../lib/lateFee'
import type { LateFeeOutcome } from '../../lib/lateFee'
import { useViewport } from '../../lib/device'
import type { Viewport } from '../../lib/device'
import { BAR_BOX } from '../../components/shell/BottomBar'
import { STATUS, BRAND, BRAND_ON, BRAND_TEXT } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { statusToken, BOOKING_STATUS, STATUS_ORDER } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import OperationsShell from '../operations/OperationsShell'
import { Unavailable } from '../../components/ui/Unavailable'
import { useAuth } from '../../lib/auth'
import { newClientUuid } from '../../lib/supabase'
import { gateContext, canViewMoneyField } from '../../lib/fieldGating'
import { canRecordPayment, canPerformOperations } from '../../lib/rbac'
import { IntelCard } from '../../components/ui/IntelCard'
import { useToast } from '../../components/ui/Toast'
import { formatMoney } from '../../lib/money'
import { paymentGlance, paymentDetailGroups } from '../../data/bookingIntel'
import { ExtendRentalModal } from './modals/ExtendRentalModal'
import { AssignCrewModal } from './modals/AssignCrewModal'
import { CreateSubRentalModal } from './modals/CreateSubRentalModal'
import { RecordPaymentModal } from '../finance/modals/RecordPaymentModal'
import type { ActionContext } from '../../actions/core'
import {
  BOOKING,
  RETURN_AT,
  ACTUAL_RETURN_AT,
  DAY_RATE_PAISA,
  DAY_RATE_BASIS,
  SUMMARY,
  ITEMS,
  ITEM_TALLY,
  EQUIPMENT_SUBTOTAL,
  CREW,
  CREW_SUBTOTAL,
  TRANSPORT,
  CHARGES,
  TOTALS,
  RENTAL_TOTAL,
  DEPOSIT_LEDGER,
  RENTAL_PAYMENTS,
  PAYMENT_HISTORY,
  DOCUMENTS,
  REVIEW,
  NOTES,
  NOTES_BY,
  NOTES_AT,
  ALERTS,
  TIMELINE,
} from '../../data/booking'

/**
 * The signed-in session as an `ActionContext`, or nothing at all.
 *
 * Both dispatch sites on this screen passed
 * `{ userId: user?.name ?? 'unknown', role: user?.role ?? 'unknown' }` — the
 * user's *display name* where an id belongs, and `'unknown'`, which is not a
 * member of `SystemRole`. Now that `ActionContext.role` is typed that no longer
 * compiles, and the fabricated fallback has nowhere to hide.
 *
 * Returning `undefined` with no session is deliberate: the dispatcher refuses
 * the call by name (`"..." was called without a session context`) rather than
 * this screen acting as somebody who is not signed in.
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

/** Bundle / Required / count marker beside an item name. */
function ItemBadge({ text, kind }: { text: string; kind: 'bundle' | 'required' | 'count' }) {
  const skin =
    kind === 'bundle'
      ? { background: 'var(--st-progress-bg)', color: 'var(--st-progress-fg)' }
      : kind === 'required'
        ? { background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)' }
        : { background: 'var(--card2)', color: 'var(--text2)' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 16,
        padding: '0 5px',
        borderRadius: 4,
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        flexShrink: 0,
        ...skin,
      }}
    >
      {text}
    </span>
  )
}

/**
 * ## §4.2's six-step stepper — Quote → Booked → Packed → On Rent → Returned → Closed
 *
 * ```
 *  ◉──────◉──────◉──────○──────○──────○
 * Quote  Booked Packed OnRent Returned Closed
 * ```
 *
 * The six are `lib/workflow.ts`'s canonical `STATUS_ORDER`, read rather than
 * re-typed, so a seventh stage cannot appear here without appearing in the
 * engine first. Position comes from `BOOKING_STATUS[stage].order`, so the
 * stepper cannot disagree with the badge beside it.
 *
 * **Law 11 — never colour alone.** Every node carries three signals: the fill
 * state, the stage's own icon, and the stage's name in words. The current step
 * additionally carries `aria-current="step"`, and each node's accessible name
 * says which of the three states it is in — done, current, or not reached — so
 * the sequence survives a screen reader and a monochrome print.
 *
 * Phone drops the connectors and the per-node labels for the dot row §4.2
 * draws (`● ● ● ○ ○ ○`), and states the position in words beside them, because
 * six unlabelled dots are exactly the colour-alone encoding Law 11 forbids.
 */
/**
 * The stage's own icon, typed against the icon REGISTRY.
 *
 * ⚠ `lib/status.ts`'s `STATUS_ICON` is typed `Record<StatusKey, string>` — a
 * bare `string`, not `IconName` — and two of its seven values name icons the
 * registry does not have: `neutral: 'circle_dashed'` and `progress:
 * 'progress'`. `Icon` looks the name up in `REGISTRY` and renders `undefined`,
 * which React throws on ("Element type is invalid"). So this map is written
 * against `IconName`, where `tsc` checks every entry, rather than casting
 * `STATUS_ICON`'s string and finding out at runtime.
 *
 * (The two bad entries in `lib/status.ts` are reported, not patched here —
 * that file is outside this pass's ownership.)
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
              {/* Half-connectors either side keep the node centred over its own
                  label instead of drifting left as the labels change width. */}
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
            {/* The state in words, for anything that cannot see the fill. */}
            <span style={srOnly}>
              {state === 'done' ? ' — done' : state === 'current' ? ' — current stage' : ' — not reached'}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The stepper's fill tone. Reached stages take the stage's own brand tone; the
 * two green stages read as one family, matching `lib/status.ts`'s solid/soft
 * split rather than inventing a seventh hue.
 */
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
 * Operations menu — Booking Workflow §4.
 *
 * §4.2: each entry is enabled only at specific stages, and **disabled entries
 * stay visible and greyed with the reason on hover and focus** rather than
 * being hidden. §4.3: they open full-screen routes, never modals.
 */
/**
 * Operations launcher — opens the operations popup shell (wire-up brief,
 * 9 Aug), which mounts the four existing workspace pages
 * (Packing/Handover/Return/Reset) unchanged; step selection happens inside
 * the shell, so this button carries no submenu.
 *
 * Disabled only on `Quote` status. The disabled reason is wrapped in
 * `Unavailable` (the shared reason-on-hover-or-focus-or-long-press pattern
 * already adopted elsewhere) rather than a bare `title` attribute, which is
 * inert for keyboard and touch users — a native `disabled` button is pulled
 * out of the tab order and `title` never fires on touch.
 */
function OperationsLauncher({ primary, onOpen }: { primary: boolean; onOpen: () => void }) {
  const disabled = BOOKING.status === 'Quote'
  const button = (
    <Button icon="external_link" variant={primary ? 'primary' : 'secondary'} onClick={onOpen} disabled={disabled}>
      Operations
    </Button>
  )

  if (!disabled) return button
  return <Unavailable reason="Operations open once this booking is Booked">{button}</Unavailable>
}

/**
 * §4.2's header `[⋮]`.
 *
 * The drawing is `← BR-…   badge   [Operations ▾]  [⋮]`. The `←` is shorthand
 * for "this is a sub-page" and stays a breadcrumb (rulings §4 — breadcrumbs
 * everywhere, no Back buttons; the shell's `HeaderBar` already draws the
 * trail). What the `⋮` gives is the ARRANGEMENT: one primary, one launcher,
 * and everything else behind an overflow.
 *
 * ⚠ Nothing is deleted to get there (Law 3). Extend, Assign Crew, Sub-Rental
 * and Save Draft all still exist, still open the same modals; they moved off
 * the header strip, which carried five same-weight buttons and no hierarchy.
 */
interface OverflowItem {
  label: string
  icon: IconName
  onClick: () => void
  /**
   * Present when the entry cannot run. §4.2: disabled entries stay **visible
   * and greyed with the reason on hover, focus and long-press** — never hidden,
   * and never a control that silently does nothing when pressed.
   */
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
 * §4.2's phone segmented control — `[Items][Money][Docs]`.
 *
 * ⚠ **`Money` is omitted, not disabled**, for a money-blind role (Law 6 and
 * §4.2's own Notes: "money blocks are omitted entirely for money-blind roles,
 * not greyed"). The caller builds the segment list from the same gate the
 * blocks themselves use, so the tab cannot outlive its content.
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

/**
 * Booking Detail — built from render `05AFD275`.
 *
 * The header strip carries the money figures because Foundation keeps deposit
 * and rental separate: a deposit is a **liability**, never part of Rental Total
 * or Outstanding. The two columns in the summary card stay separate for that
 * reason and must not be summed into one "balance".
 */
/** Reads a labelled row out of the `TRANSPORT` display list. */
function transportValue(label: string): string {
  return TRANSPORT.find((t) => t.label === label)?.value ?? ''
}

const BOOKING_FIELDS: FieldSpec[] = [
  { key: 'place', validate: (v) => (String(v ?? '').trim() ? null : 'A booking needs a location.') },
  {
    key: 'days',
    validate: (v) => {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 1) return 'Rental days must be at least 1.'
      return null
    },
  },
  /* §2.1 — a delivery that names a vehicle but no driver, or a driver but no
     vehicle, is the halfway state per-field saving would otherwise persist.
     They go in one write; a failing member blocks the group. */
  { key: 'deliveryType', group: 'transport' },
  {
    key: 'vehicle',
    group: 'transport',
    validate: (v) => (String(v ?? '').trim() ? null : 'Name the vehicle, or set Delivery Type to client pickup.'),
  },
  { key: 'driver', group: 'transport' },
  { key: 'instructions' },
]

export default function BookingDetail() {
  /*
   * The route is `/rentals/:bookingNo` and this screen ignored it — every
   * booking link in the app opened B-715's data under B-715's
   * title, so a list of 120 rentals had one destination. Until the repository
   * layer exists there is still only one seeded record, but the *identity*
   * shown now comes from the URL, so a wrong link is visible as a mismatch
   * rather than silently serving the wrong booking's money.
   */
  const { bookingNo } = useParams()
  const navigate = useNavigate()
  const id = bookingNo ?? BOOKING.no
  const isSeeded = id === BOOKING.no
  const [shellOpen, setShellOpen] = useState(false)
  const [showExtendModal, setShowExtendModal] = useState(false)
  const [showCrewModal, setShowCrewModal] = useState(false)
  const [showSubRentalModal, setShowSubRentalModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const { showSuccessToast } = useToast()
  const viewport = useViewport()

  /*
   * ── inline edit ────────────────────────────────────────────────────────
   *
   * `BOOKING` and `TRANSPORT` are module constants, so the editable slice is
   * lifted into component state. Only the fields this screen owns are here —
   * client, status and the money figures are set by flows that own them, and
   * the payment and deposit ledgers are immutable rows, not fields.
   */
  const [editable, setEditable] = useState({
    place: BOOKING.place,
    days: BOOKING.days,
    deliveryType: transportValue('Delivery Type'),
    vehicle: transportValue('Vehicle'),
    driver: transportValue('Driver'),
    instructions: transportValue('Delivery Instructions'),
  })
  const [leaveError, setLeaveError] = useState<string | null>(null)

  /* §4.2 — computed, never charged. `lateFee` is the engine `money.ts` already
     owns; the decision to apply or waive is the operator's and lives in
     `lib/lateFee.ts`. Held in state because nothing persists a settlement yet. */
  const lateFeeResult = useMemo(
    () => lateFee({ scheduledReturnAt: RETURN_AT, actualReturnAt: ACTUAL_RETURN_AT, dayRatePaisa: DAY_RATE_PAISA }),
    [],
  )
  const [lateFeeOutcome, setLateFeeOutcome] = useState<LateFeeOutcome | null>(null)

  const onSaveBooking = useCallback(async (patch: Record<string, unknown>) => {
    /* Seed data; every action under `src/actions/` is still a stub. Same note
       as `ClientDetail` — the edit lands here and the screen says so. */
    setEditable((e) => ({ ...e, ...patch }) as typeof e)
  }, [])

  const edit = useEditMode({ record: editable, fields: BOOKING_FIELDS, onSave: onSaveBooking })

  /*
   * Law 6 / HIS v2.1 §4.1 — this screen had no money gating anywhere
   * (RentalsList.tsx, the list page one level up, already gates correctly).
   * `canBookingMoney` covers booking/invoice/payment money — Coordinator
   * included, per §4.1's "Coordinator = booking-level money + client
   * balance/deposit only". `canCrewMoney` covers crew day-rate/payout, which
   * §4.1 explicitly excludes Coordinator from ("no crew pay") — the stricter
   * of the two, so it is checked separately rather than folded into the
   * first.
   */
  const { user } = useAuth()
  // Stable identity across renders, not just a stable value — `gateContext`
  // returns a fresh object literal on every call, so without memoizing it
  // here the `paymentRows` memo below would see a new `gctx` reference on
  // every render (Extend/Assign Crew/Sub-Rental modal toggles, the
  // domain-event listeners, an unrelated keystroke elsewhere) and rebuild
  // every payment row's Glance/Detail card anyway, defeating that memo.
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  const canBookingMoney = canViewMoneyField(gctx, 'booking')
  const canCrewMoney = canViewMoneyField(gctx, 'asset-finance')

  /*
   * ⛔ Seeing the money and being allowed to MOVE it are two different
   * questions, and this screen was answering only the first. All three payment
   * launchers below were gated on `canBookingMoney` — money *visibility*, which
   * admits Admin and Manager. `rbac.canRecordPayment` is Owner / Coordinator /
   * Accounts, and it is the rule the dispatcher actually resolves
   * `recordPayment`'s `permissions: ['payment.create']` through
   * (`actions/core.ts` → `lib/rbac`). So an Admin got a Record Payment button,
   * typed an amount into the modal, and collected an inline
   * `ActionPermissionError` — a refusal that was correct but should have been
   * unreachable.
   *
   * The two gates are kept separate, not collapsed: a Manager may legitimately
   * READ Rental Total / Paid / Outstanding, so `canBookingMoney` still guards
   * every figure and the Money segment. `canTakePayment` guards only the
   * action. Both are required for a launcher — the figure-bearing containers
   * are money-gated, and the button inside them is additionally
   * capability-gated.
   *
   * Absent, not disabled — `MovementList.tsx:307` drops the forbidden menu
   * entry rather than greying it, because a disabled control still announces
   * that the thing exists.
   *
   * `isOnline` is deliberately not passed, matching `UnifiedInbox.tsx:163`:
   * `RecordPaymentModal` dispatches without it, so the dispatcher evaluates
   * `canRecordPayment` with the same online default. Hiding the button offline
   * while the action would still accept the payment is the mismatch worth
   * avoiding; wiring `useNetwork()` through both belongs to the payment path.
   */
  const canTakePayment = user ? canRecordPayment(user.role) : false

  /* The capability half of the `[⋮]` gate — see the comment on OverflowMenu
     below for why this rule and not a newly-invented one. No session, no
     capability: `false` rather than a default identity. */
  const canOperate = user ? canPerformOperations(user.role) : false

  /* ── Confirm Booking — the one write this screen dispatches ─────────────
   *
   * The dispatch used to be a fire-and-forget `.catch(console.error)`: a
   * refused confirm — an unruled capability, a booking already past Quote, an
   * offline device — left the screen looking exactly as it did before, with the
   * reason in a console nobody has open. Law 12: errors are inline and
   * persistent; the toast stays on the resolved path and reports what the
   * action says landed, not what this screen assumed.
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
    /*
     * Law 8 — minted HERE, at the press, and reused by every retry of this one
     * press. `booking_stage_transitions.client_uuid` is unique and 0002's
     * comment on it is this exact case: "A double-submitted Confirm may not
     * advance two stages."
     */
    const clientUuid = newClientUuid()
    void import('../../actions/rentals/confirmRental')
      .then((m) => m.confirmRental({ id, clientUuid }, ctx))
      .then((res) => {
        showSuccessToast('Booking Confirmed', `${res.bookingNo} is now ${res.stage.to}`)
      })
      .catch((err: unknown) => {
        setConfirmError(`Not confirmed — ${err instanceof Error ? err.message : String(err)}`)
      })
      .finally(() => setConfirming(false))
  }, [id, user, showSuccessToast])

  // Hover Intel System — Payment History (Rental) rows, Block 4. `paymentGlance`/
  // `paymentDetailGroups` (Booking + Payment card, HIS v2.1 §4.1) each build a
  // full role/PII/money-gated object graph; calling them straight inside the
  // `.map()` below reran both builders, per row, on every re-render of this
  // page regardless of whether that row's data or `gctx` had changed.
  // Computed once per `id`/`gctx` change instead — every value the builders
  // read (`payment`, `id`, `gctx`) is in the dependency array.
  const paymentRows = useMemo(
    () =>
      PAYMENT_HISTORY.filter((p) => p.type !== 'Deposit').map((p) => ({
        payment: p,
        glance: paymentGlance(p, id, gctx),
        detail: paymentDetailGroups(p, id, gctx),
      })),
    [id, gctx],
  )

  // Facts strip — the 5-up desktop layout only has room on desktop; below
  // that every value (client name, "Rs 1,19,069" outstanding) ellipsizes
  // into unreadable fragments, so it collapses to fewer columns per Law 14.
  // The money column itself is one of the five — omitted from the template
  // (not just left visually empty) when this role can't see booking money.
  const factsCols =
    viewport === 'desktop'
      ? canBookingMoney
        ? 'repeat(4, minmax(0,1fr)) minmax(0,1.1fr)'
        : 'repeat(4, minmax(0,1fr))'
      : viewport === 'tablet'
        ? 'repeat(2, minmax(0,1fr))'
        : '1fr'

  /*
   * §4.2's phone segments — `[Items][Money][Docs]`.
   *
   * `Money` is built from `canBookingMoney`, the same gate Block 4 and the
   * summary card use, so a money-blind session gets a TWO-segment control
   * rather than a third tab that opens onto nothing. Law 6 / §4.2 Notes:
   * omitted, not greyed.
   */
  /*
   * ⛔ Law 6, found 12 Aug 2026 by rendering this screen as Warehouse: the
   * Alerts card printed "Deposit **Rs 25,000** pending" and offered "Receive
   * Deposit" / "Receive Payment" to a money-blind role. Both are money — the
   * figure by itself, and the actions because they open the payment modal.
   *
   * The inventory alert stays: the floor is exactly who needs "only 2 left this
   * week", and it carries no figure.
   *
   * ⚠ This is a predicate over the seed's `action` label, because `ALERTS`
   * (`data/booking.ts`) has no typed money flag to read. That is the honest
   * shape of what is available, not a good long-term rule.
   * TODO(decision): alerts need a `money: boolean` on the row (or a role-scoped
   * alerts engine), so gating is a property of the alert rather than of its
   * button's wording. Belongs to whoever owns the alerts source, not to this
   * screen.
   */
  const visibleAlerts = canBookingMoney ? ALERTS : ALERTS.filter((a) => !a.action.startsWith('Receive'))

  const segments: PhoneSegment[] = canBookingMoney ? ['Items', 'Money', 'Docs'] : ['Items', 'Docs']
  const [segment, setSegment] = useState<PhoneSegment>('Items')
  const onPhone = viewport === 'phone'
  /*
   * A role change (or a sign-out) can retire the segment that is currently
   * selected. Falling through to `Items` is the safe direction: the alternative
   * is a phone rendering nothing at all, which reads as a broken screen rather
   * than as a permission.
   */
  const activeSegment: PhoneSegment = segments.includes(segment) ? segment : 'Items'
  /** On phone each segment owns the page; at every other width all three show. */
  const showSegment = (s: PhoneSegment) => !onPhone || activeSegment === s

  /**
   * §4.2's SUMMARY rail, lifted to a variable so one set of cards serves both
   * the desktop aside and the below-1180 reflow.
   *
   * On phone the cards split across the segmented control: the money card
   * belongs to `Money`, the rest to `Docs`. At tablet `showSegment` is always
   * true, so all four render inline beneath the list.
   */
  const railBody = (
    <>
    {/* Same booking-money figures as the Facts strip and Block 4 —
        gated the same way, omitted rather than masked. On phone this
        card is the `Money` segment's rail content. */}
    {canBookingMoney && showSegment('Money') && (
      <Card title="Booking Summary">
        <SummaryRows rows={SUMMARY} />
        {/*
          Law 5, restated where the six rows sit next to each other:
          Rental Total / Paid / Outstanding and Deposit Required /
          Received / Pending are two independent ledgers. §4.2 draws the
          rail line as "Deposit (liability, never in Outstanding)".
        */}
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
        {/*
          One booking screen carried two payment buttons calling two different
          `recordPayment` implementations — this one reached the placeholder
          `actions/payments/recordPayment` (input `{ id }`, no amount anywhere),
          which is now deleted. Both buttons open the same modal: one door per job.

          The card itself stays for anyone who may READ booking money; only the
          button is `canTakePayment`-gated. See the gate's definition above for
          why visibility and capability are answered separately.
        */}
        {canTakePayment && (
          <div style={{ marginTop: 12 }}>
            <Button
              icon="dollar"
              variant="primary"
              onClick={() => setShowPaymentModal(true)}
            >
              Receive Payment
            </Button>
          </div>
        )}
      </Card>
    )}

    {/* Quick Actions, Alerts and the Activity Timeline are the `Docs`
        segment's rail content on phone; all three render at every other
        width. */}
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

    <Card title={`Alerts (${visibleAlerts.length})`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleAlerts.map((a) => (
          <div
            key={a.text}
            style={{
              padding: 10,
              borderRadius: 'var(--r-btn)',
              background: a.tone === 'danger' ? 'var(--st-danger-bg)' : 'var(--st-progress-bg)',
            }}
          >
            <div style={{ display: 'flex', gap: 7, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
              <Icon
                name="alert_triangle"
                size={13}
                style={{ color: a.tone === 'danger' ? 'var(--st-danger-fg)' : 'var(--st-progress-fg)', flexShrink: 0, marginTop: 1 }}
              />
              <span style={{ color: a.tone === 'danger' ? 'var(--st-danger-fg)' : 'var(--st-progress-fg)', fontWeight: 500 }}>
                {a.text}
              </span>
            </div>
            {/*
              The `Receive Payment` / `Receive Deposit` alert buttons are the
              same action as the three real launchers, so they follow the same
              capability gate — the alert TEXT stays for anyone who may see
              booking money (a Manager still needs to know a deposit is
              pending), only the button they cannot act on is dropped.

              ⚠ These buttons are inert today: nothing but `Check Inventory`
              carries an `onClick`. The gate is here anyway so that whoever
              finally wires `Receive Payment` to `setShowPaymentModal` inherits
              the permission instead of reopening the hole.
            */}
            {(!a.action.startsWith('Receive') || canTakePayment) && (
              <div style={{ marginTop: 7 }}>
                <Button {...(a.action === 'Check Inventory' ? { onClick: () => navigate('/inventory') } : {})}>{a.action}</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>

    <Card title="Activity Timeline">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {TIMELINE.map((t) => (
          <div key={t.what} style={{ display: 'flex', gap: 9 }}>
            <span
              aria-hidden
              style={{ width: 7, height: 7, borderRadius: 'var(--r-badge)', background: 'var(--link)', flexShrink: 0, marginTop: 4 }}
            />
            <span style={{ minWidth: 0 }}>
              <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {t.at}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>
                {t.what}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{t.who}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
    </>
    )}
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', position: 'relative' }}>
      {!isSeeded && (
        <p
          role="status"
          style={{
            margin: 0,
            padding: '9px 12px',
            borderRadius: 'var(--r-btn)',
            background: 'var(--st-progress-bg)',
            color: 'var(--st-progress-fg)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
          }}
        >
          Showing the seeded record for {BOOKING.no}. Only that booking exists until the repository layer lands —
          this is stated rather than silently serving another booking&apos;s money.
        </p>
      )}

      <PageHeader
        title={id}
        description={`${BOOKING.client} · ${BOOKING.kind} · ${BOOKING.place}`}
        actions={
          <>
            {/*
              §4.1 — the primary action is stage-driven, and there is only ever
              one. At Quote it is Send Quote; at Draft, Confirm Booking; at
              stages 2–9 **Operations is the primary** and Confirm is gone.
            */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 30,
                padding: '0 10px',
                borderRadius: 'var(--r-badge)',
                background: STATUS[statusToken(BOOKING.status)].bg,
                color: STATUS[statusToken(BOOKING.status)].fg,
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
              }}
            >
              {BOOKING.status}
            </span>
            {BOOKING.status === 'Quote' && <Button icon="arrow_right" variant="primary">Send Quote</Button>}
            {/* §1.4 — the retired `Draft` is now status Quote carrying a Draft flag. */}
            {BOOKING.flags.includes('Draft') && (
              <Button icon="plus" variant="primary" onClick={confirmBooking} disabled={confirming}>
                {confirming ? 'Confirming…' : 'Confirm Booking'}
              </Button>
            )}
            {/*
              §4.2 draws `[Operations ▾]`. It stays the LAUNCHER the 12 Aug
              ruling settled (rulings §3 — operations are routes, and
              `OperationsShell` is now the launcher that navigates to them), so
              it carries no submenu of its own; the disclosure the `▾` promises
              is the launcher panel itself. That file is another agent's this
              pass — this button is deliberately left pointing at the shell.
            */}
            <OperationsLauncher
              primary={!['Quote', 'Closed'].includes(BOOKING.status)}
              onOpen={() => setShellOpen(true)}
            />
            {/*
              §4.2's `[⋮]`. Nothing was removed to build it — see OverflowMenu.

              ⛔ These three entries carried NO gate of any kind — not
              `canBookingMoney`, not `canPerformOperations`. All three are
              money-or-operations actions on a booking: Extend adds a rental
              charge, Assign crew schedules a payout, Create sub-rental raises a
              vendor payable against a client charge. A Warehouse tablet and a
              Driver's phone both got the full set.

              Two questions, two gates, and BOTH are required — exactly as the
              payment launchers above: the money-visibility gate answers "may
              this role see this figure at all" and the capability gate answers
              "may this role do this". Neither substitutes for the other, and
              adding the second must not drop the first.

              TODO(decision): the capability side is the narrowest EXISTING
              rule, not a new one. `lib/rbac` has no `canExtendRental`,
              `canAssignCrew` or `canCreateSubRental`, and the actions'
              own permission strings (`rental.extend`, `crew.assign`,
              `subrental.create`) have no case in `actions/core.ts`'s
              `checkCapability`, so the dispatcher denies all three by default.
              `canPerformOperations` is the closest ruled neighbour — it is the
              booking-floor capability — and it is used here rather than
              inventing a rule, which CLAUDE.md forbids. Intersected with the
              money gate it resolves to Owner/Admin/Manager for all three
              (Warehouse and Technician are money-blind, so the money gate
              excludes them; Coordinator and Accounts cannot perform
              operations). Whoever rules the real matrix should replace the
              `canOperate` half, not the money half.

              Absent, not disabled — `MovementList.tsx:307`'s rule: a greyed
              entry still announces that the thing exists. `unavailable` is for
              a control nobody may use (Save draft, below), not for one this
              role in particular may not.
            */}
            <OverflowMenu
              items={[
                /* Extension money is booking money — the charge lands on this
                   booking's own total. */
                ...(canBookingMoney && canOperate
                  ? [{ label: 'Extend rental', icon: 'calendar' as const, onClick: () => setShowExtendModal(true) }]
                  : []),
                /* Crew pay is `asset-finance`, which §4.1 excludes Coordinator
                   from by name ("no crew pay") — hence `canCrewMoney`, the
                   stricter gate this screen already computes, and not
                   `canBookingMoney`. */
                ...(canCrewMoney && canOperate
                  ? [{ label: 'Assign crew', icon: 'users' as const, onClick: () => setShowCrewModal(true) }]
                  : []),
                /* A sub-rental's figure is a supplier margin, which §4.1
                   excludes Coordinator from in the same breath as crew pay —
                   the same `asset-finance` category, so the same gate. */
                ...(canCrewMoney && canOperate
                  ? [{ label: 'Create sub-rental', icon: 'box' as const, onClick: () => setShowSubRentalModal(true) }]
                  : []),
                /*
                  ⛔ `Save Draft` used to be a header `<Button>` with **no
                  onClick at all** — a control that did nothing when pressed.
                  It is not deleted (it may well come back with the repository
                  layer); it is stated. `SUCCESS_FABRICATION_REGISTER_2026-08-12`
                  exists because silence is how a screen ends up claiming a
                  write it never made.
                */
                {
                  label: 'Save draft',
                  icon: 'file',
                  onClick: () => undefined,
                  unavailable:
                    'Bookings are not persisted yet — every action under src/actions is a stub, so there is nothing for a draft save to write to. Edits made here live for this session only.',
                },
              ]}
            />
          </>
        }
      />

      {/*
        §4.2's six-step stepper, directly under the header exactly as drawn.
        Phone gets the dot row the phone wireframe draws; both read the same
        `BOOKING.status`, so they cannot disagree with the badge above.
      */}
      <div style={{ ...cardStyle, padding: onPhone ? '12px 14px' : '16px 18px' }}>
        <Stepper status={BOOKING.status} dots={onPhone} />
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
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{BOOKING.client}</span>
          {BOOKING.vip && (
            <span
              style={{
                marginLeft: 6,
                display: 'inline-flex',
                alignItems: 'center',
                height: 17,
                padding: '0 6px',
                borderRadius: 4,
                background: 'var(--st-progress-bg)',
                color: 'var(--st-progress-fg)',
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
              }}
            >
              VIP
            </span>
          )}
        </Fact>

        {[
          { label: 'Pickup', d: BOOKING.pickup },
          { label: 'Return', d: BOOKING.ret },
        ].map((m) => (
          <Fact key={m.label} icon="calendar" label={m.label} viewport={viewport}>
            {/* F2 — BS leads, AD follows. Foundation's locked order; the render had them reversed. */}
            <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
              {m.d.bs}
            </span>
            <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {m.d.ad} · {m.d.time}
            </span>
          </Fact>
        ))}

        <Fact icon="timer" label="Rental Days" viewport={viewport}>
          <span className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
            {BOOKING.days}
          </span>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginLeft: 5 }}>Days</span>
          <span style={{ display: 'block', marginTop: 6 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 21,
                padding: '0 9px',
                borderRadius: 'var(--r-badge)',
                background: STATUS.primary.bg,
                color: STATUS.primary.fg,
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
              }}
            >
              {BOOKING.status}
            </span>
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
              {BOOKING.outstanding}
            </div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 6 }}>
              Deposit Pending{' '}
              <span className="figure" style={{ color: 'var(--progress-text)', fontWeight: 600 }}>
                {BOOKING.depositPending}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* The confirm dispatch's own failure, persistent until the next attempt.
          It stays on screen because the sentences it carries are actionable:
          "is at Packed", "you are not signed in", "this device is offline",
          "your role cannot perform CONFIRM_RENTAL". A toast would take all four
          away after four seconds, and Law 12 gives toasts to successes only. */}
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

      {/* Law: errors inline, toasts for successes only — a refused exit from
          edit mode names the fields rather than firing a toast. */}
      {leaveError && (
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
          <span>{leaveError} Save or cancel each before leaving edit mode.</span>
        </div>
      )}

      {edit.editing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--sp-sm)',
            padding: '10px 12px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
          }}
        >
          <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
          <span>Editing this session only — bookings are not persisted yet.</span>
        </div>
      )}

      {/* Below desktop the Rail has no room beside content — same viewport
          variable the facts strip above already computes, collapsed to a
          single column so the Rail moves below content instead of squeezing
          it to a sliver. */}
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
          <Block no="1" title="Client & Schedule" action={<Icon name="chevron_down" size={16} style={{ color: 'var(--muted)' }} />}>
            <EditableRows
              edit={edit}
              rows={[
                /* Client and Project Type are set when the booking is created
                   and changed by re-quoting, not by typing over them here. */
                { label: 'Client', value: BOOKING.client },
                { label: 'Project Type', value: BOOKING.kind },
                { key: 'place', label: 'Location', value: editable.place },
                { key: 'days', label: 'Rental Days', value: `${editable.days} Days`, as: 'number' },
              ]}
            />
          </Block>
          )}

          {showSegment('Items') && (
          <Block
            no="2"
            title="Equipment, Bundles & Services"
            action={
              <>
                <Button icon="search">Search</Button>
                <Button icon="queues">Filters</Button>
                <Button icon="plus" variant="primary">
                  Add Item
                </Button>
              </>
            }
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {/*
                      ⛔ Law 6 defect, found 12 Aug 2026 by rendering this screen
                      as Warehouse: `Rate / Day` and `Total` were printed on
                      every line to every role. The block-level gate below
                      covers Pricing & Payments, and the facts strip has its
                      own — but the equipment table had none, so the packing
                      list handed the floor `Rs 20,250` and `Rs 60,750`.

                      Law 6 is "Warehouse sees no money", and
                      `HandoverWorkspace.tsx:63-75` states the standard this
                      follows: a money field shown masked still violates it,
                      the field must be ABSENT. So the two columns are dropped
                      from the header array and from every row — omitted, not
                      dashed.

                      `Days` stays: it is schedule, not money, and Law 9 wants
                      it explicit wherever a line is shown.
                    */}
                    {[
                      'Item / Accessory',
                      'Serial / ID',
                      'Qty',
                      'Status',
                      'Availability',
                      'Location',
                      'Days',
                      ...(canBookingMoney ? ['Rate / Day', 'Total'] : []),
                      '',
                    ].map((h, i) => (
                      <th key={h || i} style={{ ...th, textAlign: i === 2 || i >= 6 ? 'right' : 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ITEMS.map((it, i) => (
                    <tr key={`${it.name}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, paddingLeft: 10 + it.depth * 18 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Depth is shown by a disclosure caret plus indent, not indent alone. */}
                          <Icon
                            name={it.depth === 2 ? 'dot' : 'chevron_down'}
                            size={it.depth === 2 ? 8 : 13}
                            style={{ color: 'var(--muted)', flexShrink: 0 }}
                          />
                          <span style={{ fontWeight: it.depth === 0 ? 700 : it.depth === 1 ? 600 : 500 }}>{it.name}</span>
                          {it.badge && <ItemBadge {...it.badge} />}
                        </span>
                        {it.serial && it.depth === 0 && (
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2, paddingLeft: 19 }}>
                            {it.serial}
                          </span>
                        )}
                      </td>
                      <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        {it.depth === 2 && it.serial && it.serial !== '—' ? (
                          <Link to={`/inventory/${it.serial}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            {it.serial}
                          </Link>
                        ) : (
                          it.depth === 0 ? '' : (it.serial ?? '')
                        )}
                      </td>
                      <td className="figure" style={{ ...td, textAlign: 'right' }}>{it.qty}</td>
                      <td style={td}>
                        {it.packed && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 'var(--sp-xs)',
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                              color: it.packed === 'Packed' ? 'var(--success-text)' : 'var(--progress-text)',
                            }}
                          >
                            <Icon name={it.packed === 'Packed' ? 'dot' : 'alert_triangle'} size={11} />
                            {it.packed}
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        {it.availability && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 19,
                              padding: '0 7px',
                              borderRadius: 5,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                              background:
                                it.availability.key === 'in'
                                  ? 'var(--st-in-bg)'
                                  : it.availability.key === 'primary'
                                    ? 'var(--st-primary-bg)'
                                    : 'var(--st-danger-bg)',
                              color:
                                it.availability.key === 'in'
                                  ? 'var(--st-in-fg)'
                                  : it.availability.key === 'primary'
                                    ? 'var(--st-primary-fg)'
                                    : 'var(--st-danger-fg)',
                            }}
                          >
                            {it.availability.text}
                          </span>
                        )}
                      </td>
                      <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{it.location ?? ''}</td>
                      {/* F3 / Law 9 — days explicit on every priced line, never left to be inferred from the header's Rental Days. */}
                      <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{it.days ?? ''}</td>
                      {/* Law 6 — the two money cells are absent, not masked.
                          See the header array above. */}
                      {canBookingMoney && (
                        <>
                          <td className="figure" style={{ ...td, textAlign: 'right' }}>
                            {it.wasRate && (
                              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', textDecoration: 'line-through' }}>
                                {it.wasRate}
                              </span>
                            )}
                            {it.rate ?? ''}
                          </td>
                          <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{it.total ?? ''}</td>
                        </>
                      )}
                      <td style={{ ...td, width: 26, color: 'var(--muted)' }}>
                        <Icon name="more_vert" size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Roll-up. Zero counts stay visible — "0 Missing" is the reassurance. */}
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
              {ITEM_TALLY.map((t) => (
                <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span className="figure" style={{ fontWeight: 700, color: BRAND_TEXT[t.tone] }}>
                    {t.value}
                  </span>
                  <span style={{ color: 'var(--text2)' }}>{t.label}</span>
                </span>
              ))}
              {/* Law 6 — same gate as the two columns above. The counts stay:
                  "17 Packed · 1 Partial · 0 Missing" is the floor's own tally
                  and carries no figure. */}
              {canBookingMoney && (
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text2)' }}>Equipment Subtotal</span>
                  <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>
                    {EQUIPMENT_SUBTOTAL}
                  </span>
                </span>
              )}
            </div>
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
            <Block no="3" title="Crew & Transport" action={<Button icon="plus">Add Member</Button>}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {(canCrewMoney ? ['Name', 'Role', 'Day Rate', 'Days', 'Amount (Rs)'] : ['Name', 'Role']).map((h, i) => (
                      <th key={h} style={{ ...th, textAlign: i >= 2 ? 'right' : 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CREW.map((c) => (
                    <tr key={c.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}>{c.name}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{c.role}</td>
                      {/* §4.1 — crew day-rate/payout is 'asset-finance', not 'booking': Coordinator sees the booking's rental total but never this figure. */}
                      {canCrewMoney && (
                        <>
                          <td className="figure" style={{ ...td, textAlign: 'right' }}>{c.rate}</td>
                          <td className="figure" style={{ ...td, textAlign: 'right' }}>{c.days}</td>
                          <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{c.amount}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {canCrewMoney && (
                    <tr>
                      <td colSpan={4} style={{ ...td, fontWeight: 600, color: 'var(--text2)' }}>
                        Crew Subtotal
                      </td>
                      <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                        {CREW_SUBTOTAL}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Block>

            <Card
              title="Transport & Delivery"
              /* Was `<Button variant="ghost">Edit</Button>` with no onClick at
                 all — a control that did nothing when pressed. It now unlocks
                 the page, the same single unlock the header uses. */
              action={
                edit.editing ? (
                  <Button
                    variant="ghost"
                    icon="check"
                    onClick={() => {
                      const outcome = edit.stopEditing()
                      setLeaveError(outcome.ok ? null : `Unsaved: ${outcome.unsaved.join(', ')}.`)
                    }}
                  >
                    Done
                  </Button>
                ) : (
                  <Button variant="ghost" icon="tool" onClick={() => edit.startEditing()}>
                    Edit
                  </Button>
                )
              }
            >
              {edit.editing ? (
                <EditableRows
                  edit={edit}
                  rows={[
                    { key: 'deliveryType', label: 'Delivery Type', value: editable.deliveryType, hint: 'Saves together with Vehicle and Driver.' },
                    { key: 'vehicle', label: 'Vehicle', value: editable.vehicle },
                    { key: 'driver', label: 'Driver', value: editable.driver },
                    ...(canBookingMoney ? [{ label: 'Transport Charge', value: transportValue('Transport Charge') }] : []),
                    { key: 'instructions', label: 'Delivery Instructions', value: editable.instructions, as: 'textarea' as const },
                  ]}
                />
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {/* Read mode reads the same state edit mode writes, so a saved
                    change is visible here instead of reverting to the seed. */}
                {[
                  { label: 'Delivery Type', value: editable.deliveryType, pill: true },
                  { label: 'Vehicle', value: editable.vehicle },
                  { label: 'Driver', value: editable.driver },
                  ...(canBookingMoney ? [{ label: 'Transport Charge', value: transportValue('Transport Charge'), pill: false }] : []),
                  { label: 'Delivery Instructions', value: editable.instructions },
                ].map((t) => (
                  <div key={t.label} style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{t.label}</span>
                    {t.pill ? (
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
                        {t.value}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text)', textAlign: 'right', maxWidth: 170 }}>{t.value}</span>
                    )}
                  </div>
                ))}
              </div>
              )}
            </Card>
          </div>
          )}

          {/* Law 6 — Charges, Totals, Deposit ledger and Payment History are
              all booking money, so the block that carries them is omitted
              outright for a role that can't see it, not masked field by
              field. Mirrors how RentalsList.tsx already omits its whole
              Payment column rather than dashing out each cell. */}
          {canBookingMoney && showSegment('Money') && (
          <Block no="4" title="Pricing & Payments">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: viewport === 'desktop' ? 'repeat(3, minmax(0,1fr))' : '1fr',
                gap: 'var(--sp-md)',
              }}
            >
              <div>
                <h3 style={sub}>Rental Charges</h3>
                {CHARGES.map((c) => (
                  <div key={c.label} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '6px 0', fontSize: 'var(--t-meta)' }}>
                    <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{c.label}</span>
                    <span className="figure" style={{ fontWeight: 600 }}>{c.amount}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                  {TOTALS.map((t) => (
                    <div key={t.label} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '4px 0', fontSize: 'var(--t-meta)' }}>
                      <span style={{ color: 'var(--text2)', flex: 1 }}>{t.label}</span>
                      <span className="figure" style={{ fontWeight: 600, color: t.tone ? BRAND_TEXT[t.tone] : 'var(--text)' }}>
                        {t.value}
                      </span>
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
                    <span className="figure">{RENTAL_TOTAL}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 style={sub}>Deposit</h3>
                <SummaryRows rows={DEPOSIT_LEDGER} />
                {/*
                  Law 5, stated on the surface that could break it. §4.2 draws
                  the rail line as "Deposit (liability, never in Outstanding)",
                  and this is the panel where a reader would otherwise assume
                  the two columns add up. They do not, and must not: the deposit
                  is custody of the client's money, not revenue, so it never
                  enters Rental Total and never reduces Outstanding.
                */}
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
                    A liability held on the client&apos;s behalf. It is never part of Rental Total and never reduces
                    Outstanding — the two columns are deliberately not summed.
                  </span>
                </p>
                <h3 style={{ ...sub, marginTop: 16 }}>Payments (Rental Only)</h3>
                <SummaryRows rows={RENTAL_PAYMENTS} />

                {/* §4.2 — the late fee lives here, not on the Return workspace:
                    that screen is the Warehouse's and Foundation §8.3 keeps
                    every Rs figure off it. Return shows the overage and the
                    band; the money and the decision are here, already behind
                    `canBookingMoney`. */}
                <div style={{ marginTop: 14 }}>
                  <h3 style={{ ...sub, marginTop: 0 }}>Late return</h3>
                  {/* `staffName` was `?? 'Unknown staff'`. A waiver is money
                      forgiven and must name who forgave it, so it has no
                      fallback now. The empty string is not a placeholder name:
                      `validateWaiver` refuses on it — "A waiver is recorded
                      against a name. Sign in before waiving." — and LateFeePanel
                      already renders that refusal as its inline `role="alert"`
                      line, so no session means no waiver. */}
                  <LateFeePanel
                    result={lateFeeResult}
                    dayRateBasis={DAY_RATE_BASIS}
                    staffName={user?.name ?? ''}
                    outcome={lateFeeOutcome}
                    onSettle={setLateFeeOutcome}
                  />
                </div>

                {/* §2.2 — `deposit_movements` and `payments` are immutable at
                    `dataAccess.ts:102`, so inline edit never offers a pencil on
                    either. Saying which correction *is* available is the point:
                    a control that throws on save is worse than no control. */}
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
                    {/* F1 — this panel is Payment History (Rental): payments only. The
                        two deposit movements belong in the Deposit panel to its left,
                        which already carries Required/Received/Pending as its own
                        custody register — a deposit is a liability, never a payment row. */}
                    {paymentRows.map(({ payment: p, glance, detail }) => (
                      <tr key={p.type} style={{ borderBottom: '1px solid var(--border)' }}>
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
                {/*
                  This dispatched `recordPayment({ bookingId: id, amountPaisa: 500000 })` —
                  a hardcoded Rs 5,000 nobody typed, on a money screen — and then showed a
                  success toast for it. It opens the shared `RecordPaymentModal` instead,
                  which is where the amount, method and reference are actually collected,
                  so no figure on this screen can originate in an onClick handler again.

                  Block 4's payment HISTORY above stays on `canBookingMoney` —
                  reading the ledger is not recording against it. Only the
                  button takes the capability gate.
                */}
                {canTakePayment && (
                  <div style={{ marginTop: 10 }}>
                    <Button
                      icon="dollar"
                      variant="primary"
                      onClick={() => setShowPaymentModal(true)}
                    >
                      Record Payment
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Block>
          )}

          {showSegment('Docs') && (
          <Block no="5" title="Documents & Review">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,1fr)' : '1fr',
                gap: 'var(--sp-md)',
              }}
            >
              <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                {DOCUMENTS.map((d) => (
                  <div
                    key={d.name}
                    style={{
                      width: 96,
                      padding: '11px 9px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      textAlign: 'center',
                    }}
                  >
                    <Icon
                      name="file"
                      size={19}
                      style={{ color: d.ready ? 'var(--link)' : 'var(--disabled)' }}
                    />
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 6, lineHeight: 1.25 }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{d.kind}</div>
                  </div>
                ))}
                <button
                  type="button"
                  style={{
                    width: 96,
                    padding: '11px 9px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px dashed var(--border)',
                    background: 'transparent',
                    color: 'var(--link)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name="plus" size={17} />
                  <div style={{ marginTop: 6 }}>Add Document</div>
                </button>
              </div>

              <div>
                <h3 style={sub}>Review Summary</h3>
                {/* ⛔ Law 6, same class as the equipment table above: the
                    `Pricing` row's value is `formatMoney(MONEY.rentalTotal)`,
                    so this list printed `Rs 1,39,506` to a money-blind role
                    inside a block that has no money gate of its own. The ROW is
                    dropped, not blanked. `Payments — Attention` stays: it names
                    a state, not a figure. */}
                {REVIEW.filter((r) => canBookingMoney || r.label !== 'Pricing').map((r) => (
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

              <div>
                <h3 style={sub}>Notes</h3>
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{NOTES}</p>
                <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  {NOTES_BY}
                  <br />
                  {NOTES_AT}
                </p>
              </div>
            </div>
          </Block>
          )}
        </div>

        {/*
          Rulings §7 — "right rails collapse below 1180" means **reflow**, not
          hide. Below desktop the same cards leave the aside and become the
          grid's second row, still visible and still reading the same state.
          Deliberately NOT wrapped in `CollapsibleAside` there, and
          `CollapsibleAside`'s own defaults are untouched — other pages
          depend on them.
        */}
        {viewport === 'desktop' ? (
          <Rail>{railBody}</Rail>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>{railBody}</div>
        )}
      </div>

      {/*
        §4.2's tablet and phone footer — `Total …  [Record Pay]`.

        "Summary rail collapses to a sticky bottom bar below 1180" (§4.2 Notes).
        The bar is the ACTION; the rail's own cards still reflow above it, so
        nothing is hidden — the bar is a shortcut to the same modal, not a
        replacement for the summary.

        ⚠ **Law 6 — omitted, not greyed.** Every element of this bar is booking
        money (the total, and a control that records a payment), so a
        money-blind session gets no bar at all rather than a disabled one. Same
        gate as Block 4 and the summary card.

        `bottom` clears the phone nav: `BAR_BOX` is `BottomBar.tsx`'s own
        expression for its 58px plus the home-indicator inset, read rather than
        re-typed so the two cannot drift.
      */}
      {viewport !== 'desktop' && canBookingMoney && (
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
              {RENTAL_TOTAL}
            </span>
          </span>
          {/*
            The same shared modal both other buttons open — one door per job,
            and now one permission for all three.

            The bar stays for a money-visible session because `Rental Total` is
            a figure a Manager may read; the button is dropped for a session
            that may not record against it, leaving the bar as a persistent
            total rather than a dead control.
          */}
          {canTakePayment && (
            <Button icon="dollar" variant="primary" onClick={() => setShowPaymentModal(true)}>
              Record Payment
            </Button>
          )}
        </div>
      )}

      <FooterNote extra={['Deposits are liabilities and never offset Rental Outstanding']} />

      <OperationsShell bookingNo={id} bookingStatus={BOOKING.status} isOpen={shellOpen} onClose={() => setShellOpen(false)} />

      {/*
        The shared payment modal, reached by both money buttons above — the only
        place on this screen where an amount is entered. Mounted only while open,
        the pattern Finance.tsx documents: the modal captures `initialInvoiceId`
        into `useState` on first mount, so a permanently mounted one would keep
        posting against the booking it first saw when the route param changes
        without a remount (P0-1, BUG_SWEEP_REGISTER_v1.0).

        RULED 12 Aug 2026 — a payment posts against the BOOKING, and settles
        against an invoice if one is raised later. It does not wait for a
        document to exist.

        So this booking having no invoice (`data/booking.ts` lists "Invoice —
        Not generated") does not block recording a payment, and handing the
        booking to the modal is the correct row, not a stand-in.

        The schema already assumed this: `payments.booking_id` is **NOT NULL**
        and `payments.invoice_id` is **NULLABLE**, so a payment with no invoice
        is a first-class row. `UnifiedInbox.tsx` records the same ruling at its
        own mount — the two screens must not diverge on it.

        The success toast lives in `onSuccess`, which the modal only calls after
        the action resolves. `recordPayment` is still a stub, so today it
        rejects and the modal shows the reason inline; nothing on this screen
        claims a payment that was not written.
      */}
      {/*
        `canTakePayment` is repeated on the modal, not just on the three
        buttons that set this state. A role change mid-session (or a sign-out)
        would otherwise leave an open payment form belonging to a session that
        may no longer post it.
      */}
      {canTakePayment && showPaymentModal && (
        <RecordPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          invoices={[{ id, client: BOOKING.client, amount: RENTAL_TOTAL, status: BOOKING.status, booking: id }]}
          initialInvoiceId={id}
          onSuccess={(p) => showSuccessToast('Payment Recorded', `${formatMoney(p.amountPaisa)} against ${id}`)}
        />
      )}

      <ExtendRentalModal
        isOpen={showExtendModal}
        onClose={() => setShowExtendModal(false)}
        bookingId={id}
        client={BOOKING.client}
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
        onSuccess={(sub) => {
          showSuccessToast('Sub-Rental Created', `${sub.itemName} — ${sub.vendor}`)
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
