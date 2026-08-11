import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { useViewport } from '../../lib/device'
import type { Viewport } from '../../lib/device'
import { STATUS, BRAND_TEXT } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import OperationsShell from '../operations/OperationsShell'
import { Unavailable } from '../../components/ui/Unavailable'
import { useAuth } from '../../lib/auth'
import { gateContext, canViewMoneyField } from '../../lib/fieldGating'
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
export default function BookingDetail() {
  /*
   * The route is `/rentals/:bookingNo` and this screen ignored it — every
   * booking link in the app opened BK-2026-0715's data under BK-2026-0715's
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
            <Button>Save Draft</Button>
            {BOOKING.status === 'Quote' && <Button icon="arrow_right" variant="primary">Send Quote</Button>}
            {/* §1.4 — the retired `Draft` is now status Quote carrying a Draft flag. */}
            {BOOKING.flags.includes('Draft') && (
              <Button 
                icon="plus" 
                variant="primary" 
                onClick={() => {
                  import('../../actions/rentals/confirmRental').then(({ confirmRental }) => {
                    confirmRental({ id }, actionCtx(user))
                      .then(() => showSuccessToast('Booking Confirmed', `${id} is now Booked`))
                      .catch((err) => console.error('confirmRental failed:', err))
                  })
                }}
              >
                Confirm Booking
              </Button>
            )}
            <OperationsLauncher
              primary={!['Quote', 'Closed'].includes(BOOKING.status)}
              onOpen={() => setShellOpen(true)}
            />
            <Button icon="calendar" onClick={() => setShowExtendModal(true)}>
              Extend
            </Button>
            <Button icon="users" onClick={() => setShowCrewModal(true)}>
              Assign Crew
            </Button>
            <Button icon="box" onClick={() => setShowSubRentalModal(true)}>
              Sub-Rental
            </Button>
          </>
        }
      />

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
          <Block no="1" title="Client & Schedule" action={<Icon name="chevron_down" size={16} style={{ color: 'var(--muted)' }} />}>
            <SummaryRows
              rows={[
                { label: 'Client', value: BOOKING.client },
                { label: 'Project Type', value: BOOKING.kind },
                { label: 'Location', value: BOOKING.place },
                { label: 'Rental Days', value: `${BOOKING.days} Days` },
              ]}
            />
          </Block>

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
                    {['Item / Accessory', 'Serial / ID', 'Qty', 'Status', 'Availability', 'Location', 'Days', 'Rate / Day', 'Total', ''].map(
                      (h, i) => (
                        <th key={h || i} style={{ ...th, textAlign: i === 2 || i >= 6 ? 'right' : 'left' }}>
                          {h}
                        </th>
                      ),
                    )}
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
                      <td className="figure" style={{ ...td, textAlign: 'right' }}>
                        {it.wasRate && (
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', textDecoration: 'line-through' }}>
                            {it.wasRate}
                          </span>
                        )}
                        {it.rate ?? ''}
                      </td>
                      <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{it.total ?? ''}</td>
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
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
                <span style={{ color: 'var(--text2)' }}>Equipment Subtotal</span>
                <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {EQUIPMENT_SUBTOTAL}
                </span>
              </span>
            </div>
          </Block>

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

            <Card title="Transport & Delivery" action={<Button variant="ghost">Edit</Button>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {TRANSPORT.filter((t) => t.label !== 'Transport Charge' || canBookingMoney).map((t) => (
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
            </Card>
          </div>

          {/* Law 6 — Charges, Totals, Deposit ledger and Payment History are
              all booking money, so the block that carries them is omitted
              outright for a role that can't see it, not masked field by
              field. Mirrors how RentalsList.tsx already omits its whole
              Payment column rather than dashing out each cell. */}
          {canBookingMoney && (
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
                <h3 style={{ ...sub, marginTop: 16 }}>Payments (Rental Only)</h3>
                <SummaryRows rows={RENTAL_PAYMENTS} />
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
                <div style={{ marginTop: 10 }}>
                  {/*
                    This dispatched `recordPayment({ bookingId: id, amountPaisa: 500000 })` —
                    a hardcoded Rs 5,000 nobody typed, on a money screen — and then showed a
                    success toast for it. It opens the shared `RecordPaymentModal` instead,
                    which is where the amount, method and reference are actually collected,
                    so no figure on this screen can originate in an onClick handler again.
                  */}
                  <Button
                    icon="dollar"
                    variant="primary"
                    onClick={() => setShowPaymentModal(true)}
                  >
                    Record Payment
                  </Button>
                </div>
              </div>
            </div>
          </Block>
          )}

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
                {REVIEW.map((r) => (
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
        </div>

        <Rail>
          {/* Same booking-money figures as the Facts strip and Block 4 —
              gated the same way, omitted rather than masked. */}
          {canBookingMoney && (
            <Card title="Booking Summary">
              <SummaryRows rows={SUMMARY} />
              <div style={{ marginTop: 12 }}>
                {/*
                  One booking screen carried two payment buttons calling two different
                  `recordPayment` implementations — this one reached the placeholder
                  `actions/payments/recordPayment` (input `{ id }`, no amount anywhere),
                  which is now deleted. Both buttons open the same modal: one door per job.
                */}
                <Button
                  icon="dollar"
                  variant="primary"
                  onClick={() => setShowPaymentModal(true)}
                >
                  Receive Payment
                </Button>
              </div>
            </Card>
          )}

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

          <Card title={`Alerts (${ALERTS.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ALERTS.map((a) => (
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
                  <div style={{ marginTop: 7 }}>
                    <Button {...(a.action === 'Check Inventory' ? { onClick: () => navigate('/inventory') } : {})}>{a.action}</Button>
                  </div>
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
        </Rail>
      </div>

      <FooterNote extra={['Deposits are liabilities and never offset Rental Outstanding']} />

      <OperationsShell bookingNo={id} bookingStatus={BOOKING.status} isOpen={shellOpen} onClose={() => setShellOpen(false)} />

      {/*
        The shared payment modal, reached by both money buttons above — the only
        place on this screen where an amount is entered. Mounted only while open,
        the pattern Finance.tsx documents: the modal captures `initialInvoiceId`
        into `useState` on first mount, so a permanently mounted one would keep
        posting against the booking it first saw when the route param changes
        without a remount (P0-1, BUG_SWEEP_REGISTER_v1.0).

        TODO(decision): this booking has no invoice (`data/booking.ts` lists
        "Invoice — Not generated"), so the row handed to an invoice-shaped modal
        is the booking itself. Whether a payment may be recorded against a
        booking before an invoice exists — and what it posts against if so — is
        unruled, and guessing it here would be inventing the rule.

        The success toast lives in `onSuccess`, which the modal only calls after
        the action resolves. `recordPayment` is still a stub, so today it
        rejects and the modal shows the reason inline; nothing on this screen
        claims a payment that was not written.
      */}
      {showPaymentModal && (
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
