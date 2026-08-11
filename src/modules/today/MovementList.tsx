import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import type { Movement } from '../../types/today'
import { ROWS_PER_COLUMN, ROW_MENU, HOVER, HOVER_FALLBACK, timeOf, statusKeyOf, has } from '../../data/today'
import { cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { shouldFlipUp } from '../../lib/menuFlip'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../lib/auth'
import type { SystemRole } from '../../types/database'

interface MovementListProps {
  title: string
  badge: string
  badgeStatus: StatusKey
  rows: Movement[]
  moreNoun: string
  viewAll: string
  /** What to say when the filters leave nothing — never a blank panel. */
  emptyNote: string
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
 * Complete Pickup and Complete Return — the two most-used buttons on the floor,
 * reachable from both the hover card and the row menu, which is why the dispatch
 * lives here once instead of four times.
 *
 * Two things it refuses to invent:
 *
 * 1. **The identity.** The previous `user?.id ?? 'USR-001'` / `user?.role ??
 *    'Manager'` pair stamped a made-up operator on a movement record whenever no
 *    one was signed in. There is no fallback now — no session, no dispatch.
 * 2. **The equipment.** `equipmentIds` was `['EQP-101']`, one real-looking unit
 *    asserted on every booking. A `Movement` row carries no equipment ids
 *    (`types/today.ts`), so there is nothing true to send; the empty array is
 *    passed and the action's own `validate` rejects it. That refusal is correct
 *    — the unit selection has to come from a screen that actually knows it.
 *
 * Both actions are still stubs, so `createAction` rejects them before `execute`
 * either way. The success toast now fires only on a resolved promise, which for
 * these two means: not until they persist something.
 */
function runMovementAction(
  kind: 'pickup' | 'return',
  bookingNo: string,
  user: { id: string; role: SystemRole } | null,
  onDone: () => void,
) {
  if (!user) {
    console.error(
      `[${kind}] not dispatched: no signed-in session. The dispatcher no longer substitutes a default identity.`,
    )
    return
  }

  const ctx = { userId: user.id, role: user.role }
  const input = { rentalId: bookingNo, equipmentIds: [] as string[] }

  const load =
    kind === 'pickup'
      ? import('../../actions/rentals/completePickup').then((mod) => mod.completePickup)
      : import('../../actions/rentals/returnRental').then((mod) => mod.completeReturn)

  load
    .then((action) => action(input, ctx))
    .then(onDone)
    .catch((err) => console.error(`complete ${kind} failed:`, err))
}

/**
 * §12 — the 520px hover card. "Hover-only intel does not ship", so the same
 * card opens on long-press and on keyboard focus.
 */
function HoverCard({ m }: { m: Movement }) {
  const { showSuccessToast } = useToast()
  const { user } = useAuth()
  const f = HOVER[m.bookingNo] ?? HOVER_FALLBACK
  const money = useCanViewMoney()
  const facts: Array<[string, string]> = [
    ['Project', f.project],
    ['Duration', f.duration],
    ...(money ? ([['Deposit', f.deposit], ['Payment', f.payment]] as Array<[string, string]>) : []),
    ['Equipment', f.equipment],
    ['Documents', f.documents],
    ['Staff', f.staff],
    ['Notes', f.notes],
  ]
  const actions: Array<{ label: string, to?: string, onClick?: () => void }> = [
    { label: 'Open Booking', to: `/rentals/${m.bookingNo}` },
    ...(money ? ([{ label: 'Receive Payment', to: '/finance' }]) : []),
    ...(m.kind === 'Pickup' ? [{
      label: 'Complete Pickup',
      onClick: () => runMovementAction('pickup', m.bookingNo, user, () =>
        showSuccessToast('Pickup Completed', `Booking ${m.bookingNo} handed over.`),
      )
    }] : []),
    ...(m.kind === 'Return' ? [{
      label: 'Complete Return',
      onClick: () => runMovementAction('return', m.bookingNo, user, () =>
        showSuccessToast('Return Completed', `Booking ${m.bookingNo} received & returned.`),
      )
    }] : []),
    { label: 'Print Checklist', to: `/rentals/${m.bookingNo}/packing` },
  ]
  return (
    <div
      role="tooltip"
      data-overlay
      style={{
        position: 'absolute',
        top: 'calc(100% - 4px)',
        left: 10,
        zIndex: 45,
        width: 'min(520px, calc(100vw - 340px))',
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
        {has(m, 'VIP') && <VipBadge />}
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
            height: 28,
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

/** §6 — "VIP badge, never a star." */
function VipBadge() {
  return (
    <span
      style={{
        flexShrink: 0,
        height: 17,
        padding: '0 6px',
        borderRadius: 4,
        background: 'var(--st-progress-bg)',
        color: 'var(--st-progress-fg)',
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        letterSpacing: '0.03em',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      VIP
    </span>
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
 * `WhatsApp`, `Call` and `Email` are disabled because the movements query does
 * not carry a client contact yet; inventing one would put a fake number behind
 * a `tel:` link.
 */
function RowMenu({ onClose, m, up }: { onClose: () => void; m: Movement; up: boolean }) {
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const booking = `/rentals/${m.bookingNo}`

  const entries = ROW_MENU.filter((e) => money || e !== 'Invoice')

  const actions: Partial<Record<(typeof ROW_MENU)[number], () => void>> = {
    Open: () => navigate(booking),
    Edit: () => navigate(booking),
    'Packing List': () => navigate(`${booking}/packing`),
    'Print Checklist': () => navigate(`${booking}/packing`),
    Invoice: () => navigate('/documents'),
    'Copy Booking Number': () => {
      void navigator.clipboard?.writeText(m.bookingNo)
      showSuccessToast('Copied', `Booking number ${m.bookingNo} copied to clipboard.`)
    },
    'Complete Pickup': () =>
      runMovementAction('pickup', m.bookingNo, user, () =>
        showSuccessToast('Pickup Completed', `Booking ${m.bookingNo} handed over.`),
      ),
    'Complete Return': () =>
      runMovementAction('return', m.bookingNo, user, () =>
        showSuccessToast('Return Completed', `Booking ${m.bookingNo} received & returned.`),
      )
  }
  const why: Partial<Record<(typeof ROW_MENU)[number], string>> = {
    QR: 'QR rendering lands with the Evidence matcher',
    WhatsApp: 'No client contact on the movements query yet',
    Call: 'No client contact on the movements query yet',
    Email: 'No client contact on the movements query yet',
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
 * §6: time on one line (not stacked), VIP as a badge (never a star), and the
 * row's primary action is **Open Booking** — stated, not implied.
 * §7: an overdue row carries a left border in `--bad`. Nothing else does, so
 * the border discriminates rather than decorates.
 * §6 again: "Minimum 6 rows visible per column before '+ N more'." The count in
 * the more-link is derived from the same list, so it can never say "5 more"
 * over a list of fourteen the way the reference render did.
 */
export default function MovementList({ title, badge, badgeStatus, rows, moreNoun, viewAll, emptyNote }: MovementListProps) {
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; up: boolean } | null>(null)
  const press = useRef<number | null>(null)
  const suppress = useRef(false)

  const shown = rows.slice(0, ROWS_PER_COLUMN)
  const rest = rows.length - shown.length

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

      <div style={{ flex: 1 }}>
        {shown.length === 0 && (
          <div style={{ padding: '20px 16px' }}>
            <EmptyState title="No movements to show" description={emptyNote} />
          </div>
        )}
        {shown.map((r, i) => (
          <div
            key={r.id}
            className="movement-row"
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
            /* The grid itself is in theme.css so the 1560px breakpoint can win. */
            style={{
              position: 'relative',
              gap: 10,
              padding: '10px 12px 10px 10px',
              borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none',
              borderLeft: has(r, 'Overdue') ? '2px solid var(--danger)' : r.kind === 'Pickup' || r.kind === 'Delivery' ? '2px solid var(--primary)' : has(r, 'Due Soon') ? '2px solid var(--warn)' : '2px solid transparent',
              background: 'transparent',
              alignItems: 'start',
              cursor: 'pointer',
            }}
          >
            <div
              className="figure"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', paddingTop: 2 }}
            >
              <span>{timeOf(r).split(' ')[0]}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: -2 }}>{timeOf(r).split(' ')[1]}</span>
            </div>

            {/*
              §4.2 — the tint is a token pair, resolved here exactly as
              `RentalsList`'s `Avatar` resolves it, so the same client cannot be
              one colour on Today and another on Rentals. This carried a raw hex
              fill with `color: '#fff'` on top; both are forbidden, and the
              white also had to be right in two themes by luck rather than by
              the token layer.
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
              {/*
                One token, not two stacked. §4.3.6 puts the floor at 12px, and
                two 12px lines do not fit a 34px circle — the second clipped.
                The full client name is on the row beside it, so the monogram
                only has to be a recognisable mark, not a readable abbreviation.
              */}
              <span>{r.avatar[0]}</span>
            </div>

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
                {has(r, 'VIP') && <VipBadge />}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, minWidth: 0 }}>
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
                <span
                  style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {r.category}
                </span>
              </div>

              {/* The package gets its own line — sharing one with the staff note
                  clipped "RED Komodo X Package" at 1920px, and a truncated
                  package name is the one thing a warehouse row cannot afford. */}
              <div style={{ marginTop: 5, minWidth: 0 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 21,
                    padding: '0 7px',
                    borderRadius: 'var(--r-xs)',
                    background: STATUS[r.kitStatus].bg,
                    color: STATUS[r.kitStatus].fg,
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    maxWidth: '100%',
                    minWidth: 0,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.kit}</span>
                </span>
              </div>

              <div
                style={{ marginTop: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {r.staff}
                {r.due ? ` · ${r.due}` : ''}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
                <Pill text={r.status} status={statusKeyOf(r)} />
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
                    width: 22,
                    height: 22,
                    borderRadius: 'var(--r-xs)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Icon name="more_vert" size={15} />
                </button>
              </div>

              {/* --st-danger-fg, not --danger: measured 5.98:1 against --card,
                  --danger measures 4.40:1 — under the 4.5:1 floor for this text
                  size. The row itself stays the plain card surface; only the
                  border-left and this note carry the overdue signal. */}
              {r.statusNote && (
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: has(r, 'Overdue') ? 'var(--st-danger-fg)' : 'var(--muted)' }}>
                  {r.statusNote}
                </div>
              )}

              {menu?.id === r.id && <RowMenu m={r} onClose={() => setMenu(null)} up={menu.up} />}
            </div>

            {/* `menu` is `{ id, up } | null`, so the old `menu !== r.id` compared an
                object to a string and was always true — the 520px hover card rendered
                straight through the open row menu. Compare the id, not the object. */}
            {hover === r.id && menu?.id !== r.id && <HoverCard m={r} />}
          </div>
        ))}
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
          {rest} more {moreNoun}
        </Link>
      )}
    </section>
  )
}
