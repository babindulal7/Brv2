import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import type { IconName } from './Icon'
import { Modal } from './Modal'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { useCapability, useViewport } from '../../lib/device'
import { shouldFlipUp } from '../../lib/menuFlip'

/**
 * Worst-case Glance footprint (avatar row, badges, up to ~6 body lines, the
 * primary-action footer) and its CSS-capped width — used to decide whether
 * the card would clip against the viewport before it's actually painted.
 * LP-03: "hover-intel card goes off-screen" near the top/left/right edges.
 */
const GLANCE_H = 320
const GLANCE_W = 360

/**
 * Hover Intel System v2.1 — the reusable Glance/Detail card.
 *
 * "Glance (≤6 lines, 2-second read) vs Detail (the peek)" — the Glance tier
 * opens the same way `Unavailable.tsx`'s reason popover does (hover devices
 * get real hover; `!hasHover` devices get a long-press), because that is the
 * one place in the app where hover/focus/long-press already works correctly.
 * `MovementList.tsx`'s older hover card is NOT the template: it has no
 * `onFocus` handling at all despite `PROGRESS.md` claiming otherwise, and its
 * long-press-then-click suppression is copied here because it *is* correct —
 * SCREENS.md logs the touch-emits-a-click defect this guards against.
 *
 * The Detail tier ("the peek") is reached from an explicit button inside the
 * Glance card, never from clicking the trigger itself — the trigger usually
 * already has its own click behaviour (row navigation, row expand), and this
 * component must not fight it for the click.
 *
 * Gating is entirely the caller's job. This component renders whatever
 * `glance`/`detail` it is given — a group or field that a role cannot see
 * must never be constructed by the caller in the first place, per HIS v2.1
 * §4.5: "Gated blocks are omitted from the payload, not CSS-hidden."
 */

const LONG_PRESS_MS = 450

export interface IntelBadge {
  label: string
  tone?: StatusKey
}

export interface IntelTrigger {
  label: string
  to: string
}

export interface IntelGlance {
  avatarLabel: string
  avatarTone?: StatusKey
  avatarIcon?: IconName
  title: string
  statusDot?: StatusKey
  subtitle?: string
  badges?: IntelBadge[]
  /**
   * Body lines, already gated by the caller — a money or PII line simply is
   * not in this array when the viewing role/context can't see it. Keep
   * subtitle + badges + lines to roughly six for a 2-second read.
   */
  lines?: string[]
  primaryAction?: IntelTrigger
}

export interface IntelField {
  label: string
  value: ReactNode
  /** "Currently booked items (list, each a trigger)" — a field that navigates rather than just displays. */
  trigger?: IntelTrigger
}

export interface IntelGroup {
  title: string
  fields: IntelField[]
}

export interface IntelCardProps {
  /** The row/element that reveals the Glance card on hover, focus, or long-press. */
  children: ReactNode
  glance: IntelGlance
  detailTitle: string
  detailSubtitle?: string
  /** Field groups already gated by the caller for the current role and context. */
  detail: IntelGroup[]
  className?: string
}

export function IntelCard({ children, glance, detailTitle, detailSubtitle, detail, className }: IntelCardProps) {
  const { hasHover } = useCapability()
  const viewport = useViewport()
  const [open, setOpen] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const [flip, setFlip] = useState({ up: false, alignRight: false })
  const press = useRef<number | null>(null)
  const suppress = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const glanceId = useId()

  useLayoutEffect(() => {
    if (!open) return
    const anchor = wrapperRef.current?.getBoundingClientRect()
    if (!anchor) return
    setFlip({
      up: shouldFlipUp(anchor, GLANCE_H),
      alignRight: anchor.left + GLANCE_W > window.innerWidth - 12,
    })
  }, [open])

  const holdStart = () => {
    if (hasHover) return
    suppress.current = false
    press.current = window.setTimeout(() => {
      suppress.current = true
      setOpen(true)
    }, LONG_PRESS_MS)
  }
  const holdEnd = () => {
    if (press.current !== null) window.clearTimeout(press.current)
    press.current = null
  }

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-intel-overlay]')) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  useEffect(() => holdEnd, [])

  return (
    <div
      ref={wrapperRef}
      className={className}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-describedby={open ? glanceId : undefined}
      style={{ position: 'relative', display: 'inline-flex', minWidth: 0, maxWidth: '100%' }}
      onMouseEnter={() => hasHover && setOpen(true)}
      onMouseLeave={() => hasHover && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // Moving focus from the trigger to the peek button inside the same
        // card must not close it out from under the user.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setOpen(false)
      }}
      onTouchStart={holdStart}
      onTouchMove={holdEnd}
      onTouchEnd={holdEnd}
      onTouchCancel={holdEnd}
      onKeyDown={(e) => {
        // Enter/Space matches the hover/focus behaviour already above —
        // it opens the Glance, it does not fight the row's own click. Stop
        // the event here so a keyboard-reachable parent row (ClientsDirectory's
        // <tr>) does not also treat this same keypress as its own activation.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }
      }}
      onClick={(e) => {
        // A completed long-press also emits a synthetic click on lift; left
        // unswallowed it falls through to the row's own onClick and
        // navigates away the instant the card opens (SCREENS.md).
        if (suppress.current) {
          suppress.current = false
          e.stopPropagation()
        }
      }}
    >
      {children}
      {open && (
        <Glance
          id={glanceId}
          glance={glance}
          up={flip.up}
          alignRight={flip.alignRight}
          onPeek={() => {
            setOpen(false)
            setPeeking(true)
          }}
        />
      )}
      <Modal
        isOpen={peeking}
        onClose={() => setPeeking(false)}
        title={detailTitle}
        size="lg"
        sheet={viewport === 'phone'}
        {...(detailSubtitle !== undefined ? { subtitle: detailSubtitle } : {})}
      >
        <DetailGroups groups={detail} />
      </Modal>
    </div>
  )
}

function Glance({
  id,
  glance,
  up,
  alignRight,
  onPeek,
}: {
  id: string
  glance: IntelGlance
  up: boolean
  alignRight: boolean
  onPeek: () => void
}) {
  const avatarTone = glance.avatarTone ? STATUS[glance.avatarTone] : undefined
  return (
    <div
      id={id}
      role="tooltip"
      data-intel-overlay
      style={{
        position: 'absolute',
        ...(up ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
        ...(alignRight ? { right: 0 } : { left: 0 }),
        zIndex: 50,
        width: 'min(360px, calc(100vw - 48px))',
        padding: 'var(--sp-md)',
        borderRadius: 'var(--r-card)',
        background: 'var(--hover-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-modal)',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <div
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--r-badge)',
            flexShrink: 0,
            background: avatarTone?.bg ?? 'var(--st-primary-bg)',
            color: avatarTone?.fg ?? 'var(--st-primary-fg)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 'var(--t-meta)',
            fontWeight: 700,
          }}
        >
          {glance.avatarIcon ? <Icon name={glance.avatarIcon} size={16} /> : glance.avatarLabel}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
              {glance.title}
            </span>
            {glance.statusDot && (
              <span
                aria-hidden
                style={{ width: 7, height: 7, borderRadius: 'var(--r-badge)', background: STATUS[glance.statusDot].fg, flexShrink: 0 }}
              />
            )}
          </div>
          {glance.subtitle && (
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 1 }}>{glance.subtitle}</div>
          )}
        </div>
        {/* The visible button stays 26x26 so it doesn't dominate the Glance
            card, but its hit area is the project's 44x44 floor (Law 15) —
            an absolutely-positioned overlay centered on the same spot, so
            the reserved layout footprint (the outer span) doesn't change. */}
        <span style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
          <button
            type="button"
            aria-label="View full details"
            title="View full details"
            onClick={(e) => {
              e.stopPropagation()
              onPeek()
            }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 44,
              height: 44,
              padding: 0,
              border: 'none',
              background: 'transparent',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 26,
                height: 26,
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text2)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="eye" size={14} />
            </span>
          </button>
        </span>
      </div>

      {glance.badges && glance.badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'var(--sp-sm)' }}>
          {glance.badges.map((b) => {
            const bTone = b.tone ? STATUS[b.tone] : undefined
            return (
              <span
                key={b.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 20,
                  padding: '0 7px',
                  borderRadius: 'var(--r-badge)',
                  background: bTone?.bg ?? 'var(--card2)',
                  color: bTone?.fg ?? 'var(--text2)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {b.label}
              </span>
            )
          })}
        </div>
      )}

      {glance.lines && glance.lines.length > 0 && (
        <div style={{ marginTop: 'var(--sp-sm)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {glance.lines.map((l, i) => (
            <div key={i} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.4 }}>
              {l}
            </div>
          ))}
        </div>
      )}

      {glance.primaryAction && (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
          <Link
            to={glance.primaryAction.to}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              // Law 15 — 44×44 at every width, the same rule the peek button
              // above this one already carries.
              minHeight: 44,
              padding: '0 11px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-fg)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {glance.primaryAction.label}
          </Link>
        </div>
      )}
    </div>
  )
}

function DetailGroups({ groups }: { groups: IntelGroup[] }) {
  if (groups.length === 0) {
    return <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Nothing to show for this role.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map((g) => (
        <div key={g.title}>
          <div
            style={{
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              color: 'var(--muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 'var(--sp-sm)',
            }}
          >
            {g.title}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px 16px' }}>
            {g.fields.map((f) => (
              <div key={f.label} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{f.label}</div>
                <div style={{ fontSize: 'var(--t-ui)', color: 'var(--text)', marginTop: 2, lineHeight: 1.4 }}>
                  {f.trigger ? (
                    <Link to={f.trigger.to} style={{ color: 'var(--link)', textDecoration: 'none', fontWeight: 600 }}>
                      {f.value}
                    </Link>
                  ) : (
                    f.value
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
