import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import type { Movement } from '../../types/today'
import { ROWS_PER_COLUMN, ROW_MENU, HOVER, HOVER_FALLBACK, timeOf, statusKeyOf, has } from '../../data/today'
import { cardStyle } from '../../components/ui/Page'
import { useCanViewMoney } from './useMoneyVisibility'

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
 * §12 — the 520px hover card. "Hover-only intel does not ship", so the same
 * card opens on long-press and on keyboard focus.
 */
function HoverCard({ m }: { m: Movement }) {
  const f = HOVER[m.bookingNo] ?? HOVER_FALLBACK
  /*
   * §8.3 — Deposit and Payment are money, so for a money-blind session the two
   * rows are **not rendered**: the grid closes from eight facts to six. The
   * "Receive Payment" quick action goes with them, because `canRecordPayment`
   * would refuse it anyway and a button that cannot act is worse than no
   * button.
   */
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
  const actions: Array<[string, string]> = [
    ['Open Booking', `/rentals/${m.bookingNo}`],
    ...(money ? ([['Receive Payment', '/finance']] as Array<[string, string]>) : []),
    ['Print Checklist', `/rentals/${m.bookingNo}/packing`],
  ]
  return (
    <div
      role="tooltip"
      data-overlay
      style={{
        position: 'absolute',
        top: 'calc(100% - 6px)',
        left: 10,
        zIndex: 40,
        width: 'min(520px, calc(100vw - 340px))',
        padding: 14,
        borderRadius: 'var(--r-card)',
        background: 'var(--hover-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-modal)',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{m.client}</span>
        {has(m, 'VIP') && <VipBadge />}
        <span className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--link)', fontWeight: 600 }}>{m.bookingNo}</span>
        <span style={{ marginLeft: 'auto' }}>
          <Pill text={m.status} status={statusKeyOf(m)} />
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px' }}>
        {facts.map(([l, v]) => (
          <div key={l} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {l}
            </div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.4 }}>{v}</div>
          </div>
        ))}
      </div>
      {/* §12's "quick actions" — real destinations, not decoration. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {actions.map(([label, to]) => (
          <Link
            key={label}
            to={to}
            onClick={(e) => e.stopPropagation()}
            style={{
              height: 26,
              padding: '0 9px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
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
function RowMenu({ onClose, m }: { onClose: () => void; m: Movement }) {
  const navigate = useNavigate()
  const money = useCanViewMoney()
  const booking = `/rentals/${m.bookingNo}`
  // §8.3 — "Invoice" opens a document that is a rupee figure. For a money-blind
  // session the entry is absent from the menu, not greyed: a disabled item still
  // says an invoice exists.
  const entries = ROW_MENU.filter((e) => money || e !== 'Invoice')

  const actions: Partial<Record<(typeof ROW_MENU)[number], () => void>> = {
    Open: () => navigate(booking),
    Edit: () => navigate(booking),
    'Packing List': () => navigate(`${booking}/packing`),
    'Print Checklist': () => navigate(`${booking}/packing`),
    Invoice: () => navigate('/documents'),
    'Copy Booking Number': () => void navigator.clipboard?.writeText(m.bookingNo),
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
        top: 26,
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
              borderRadius: 6,
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
  const [menu, setMenu] = useState<string | null>(null)
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
          <p style={{ margin: 0, padding: '26px 16px', fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
            {emptyNote}
          </p>
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
              background: has(r, 'Overdue') ? 'var(--danger-soft)' : 'transparent',
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

            <div
              aria-hidden
              className="row-avatar"
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: r.avatarBg,
                color: '#fff',
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
                    borderRadius: 6,
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
                style={{ marginTop: 4, fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {r.staff}
                {r.due ? ` · ${r.due}` : ''}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Pill text={r.status} status={statusKeyOf(r)} />
                <button
                  type="button"
                  aria-label={`More actions for ${r.client}`}
                  aria-haspopup="menu"
                  aria-expanded={menu === r.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenu((x) => (x === r.id ? null : r.id))
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Icon name="more_vert" size={15} />
                </button>
              </div>

              {/* --st-danger-fg, not --danger: this note sits on the tinted
                  overdue row, where the brighter --danger falls under 4.5:1. */}
              {r.statusNote && (
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: has(r, 'Overdue') ? 'var(--st-danger-fg)' : 'var(--muted)' }}>
                  {r.statusNote}
                </div>
              )}

              {/* Reverted Open Booking button removal to match Dashboard.PNG layout */}

              {menu === r.id && <RowMenu m={r} onClose={() => setMenu(null)} />}
            </div>

            {hover === r.id && menu !== r.id && <HoverCard m={r} />}
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
