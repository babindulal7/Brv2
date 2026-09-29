import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import type { IconName } from './Icon'
import { Modal } from './Modal'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { useCapability, useViewport } from '../../lib/device'
import { shouldFlipUp } from '../../lib/menuFlip'
import { INTEL_ADJACENT_DELAY_MS, INTEL_CARD_IN_MS, INTEL_CLOSE_DELAY_MS, INTEL_LONG_PRESS_MS, INTEL_OPEN_DELAY_MS } from '../../lib/intel/timing'
import { inTravelTriangle } from '../../lib/intel/safeTriangle'
import { intelClosed, intelOpened, intelReplaced, isIntelSessionActive, useIntelSession } from '../../lib/intel/store'
import type { IntelNavigationEntry } from '../../lib/intel/store'
import type { IntelContext, IntelEntityType } from '../../lib/intel/context'
import type { GateContext } from '../../lib/fieldGating'
import type { ActionContext } from '../../actions/core'
import { IntelDetailExtras } from '../intel/IntelDetailExtras'
import { loadIntelGlanceFields } from '../../lib/queries/intelExtras'

/**
 * Worst-case Glance footprint (avatar row, badges, up to ~6 body lines, the
 * primary-action footer) and its CSS-capped width — used to decide whether
 * the card would clip against the viewport before it's actually painted.
 * LP-03: "hover-intel card goes off-screen" near the top/left/right edges.
 */
const GLANCE_H = 320
const GLANCE_W = 360

/**
 * Hover Intel System — Smart Intel Cards v1 shell (spec §§2–4, 20–21, 34).
 *
 * ONE shell, TWO tiers: Glance (hover/long-press surface, ≤360×320) and
 * Detail (explicit peek → Modal, bottom sheet on phone). Entity builders in
 * `src/data/*Intel.ts` supply already-gated glance/detail — a group or field
 * a role cannot see must never be constructed by the caller (gated blocks are
 * omitted from the payload, not CSS-hidden).
 *
 * Interaction contract:
 * - Desktop: 250ms hover-intent open, 300ms close intent, safe-triangle
 *   travel from trigger into card, ~0ms adjacent switching while a session
 *   is active. Never auto-closes on a timer (WCAG 1.4.13).
 * - Pin: Space tap / Peek button pins the card (ignores mouseleave) until
 *   ESC, close button, or click-away. Space-hold is a temporary preview.
 * - Keyboard: Space/Enter opens immediately on focus; ESC closes and returns
 *   focus to the trigger; the card is hoverable and persistent.
 * - Touch: 500ms long-press opens the glance; short tap keeps the row's own
 *   action; the detail peek renders as a bottom sheet on phone.
 */

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
  /** Spec §33 — selects emphasis/action copy; defaults to inventory behaviour. */
  context?: IntelContext
  /** Spec §1 — carried for cross-entity navigation, not for branching the shell. */
  entityType?: IntelEntityType
  entityId?: string
  gateContext?: GateContext
  actionContext?: ActionContext | null
  onOpen?: () => void
}

export function IntelCard({ children, glance, detailTitle, detailSubtitle, detail, className, context, entityType, entityId, gateContext, actionContext, onOpen }: IntelCardProps) {
  const { hasHover, coarsePointer, reducedMotion } = useCapability()
  const viewport = useViewport()
  const session = useIntelSession()
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const [extraLines, setExtraLines] = useState<string[]>([])
  const [flip, setFlip] = useState({ up: false, alignRight: false })
  /* Fixed anchor point for the portaled Glance overlay (see below). */
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const press = useRef<number | null>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const suppress = useRef(false)
  const spaceHeld = useRef(false)
  const spaceHeldLong = useRef(false)
  const spaceTimer = useRef<number | null>(null)
  const leavePoint = useRef<{ x: number; y: number } | null>(null)
  const hoverOnIdentifier = useRef(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const cardId = useId()
  const entry: IntelNavigationEntry | undefined = context && entityType && entityId
    ? { context, entityType, entityId }
    : undefined

  useEffect(() => {
    if (!open || !entityType || !entityId || !gateContext) return
    let cancelled = false
    setExtraLines([])
    void loadIntelGlanceFields(entityType, entityId, gateContext).then((lines) => {
      if (!cancelled) setExtraLines(lines)
    })
    return () => { cancelled = true }
  }, [open, entityType, entityId, gateContext])

  const clearOpenTimer = () => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current)
    openTimer.current = null
  }
  const clearCloseTimer = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  const doOpen = () => {
    clearCloseTimer()
    clearOpenTimer()
    setOpen(true)
    onOpen?.()
    intelOpened(cardId, entry, 'hover', triggerRef.current)
  }

  const doClose = () => {
    clearOpenTimer()
    clearCloseTimer()
    setOpen(false)
    setPinned(false)
    intelClosed(cardId)
  }

  const scheduleOpen = () => {
    clearCloseTimer()
    if (open || pinned) return
    const delay = isIntelSessionActive() ? INTEL_ADJACENT_DELAY_MS : INTEL_OPEN_DELAY_MS
    if (delay <= 0) {
      doOpen()
      return
    }
    clearOpenTimer()
    openTimer.current = window.setTimeout(doOpen, delay)
  }

  const scheduleClose = () => {
    if (pinned) return
    clearOpenTimer()
    clearCloseTimer()
    closeTimer.current = window.setTimeout(() => {
      setOpen(false)
      intelClosed(cardId)
    }, INTEL_CLOSE_DELAY_MS)
  }

  const pointerAtIdentifier = (target: EventTarget | null): boolean => {
    const wrapper = wrapperRef.current
    if (!wrapper || !(target instanceof Element)) return false
    const identifier = wrapper.querySelector('[data-intel-identifier]')
    return identifier ? Boolean(target.closest('[data-intel-identifier]')) : true
  }

  const measureAnchor = () => {
    const r = wrapperRef.current?.getBoundingClientRect()
    if (!r) return
    const up = shouldFlipUp(r, GLANCE_H)
    const alignRight = r.left + GLANCE_W > window.innerWidth - 12
    setFlip({ up, alignRight })
    setAnchor({ x: alignRight ? r.right : r.left, y: up ? r.top : r.bottom })
  }

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null)
      return
    }
    measureAnchor()
  }, [open])

  /* Re-track the trigger while open so scrolling never detaches the card. */
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', measureAnchor, true)
    window.addEventListener('resize', measureAnchor)
    return () => {
      window.removeEventListener('scroll', measureAnchor, true)
      window.removeEventListener('resize', measureAnchor)
    }
  }, [open])

  const holdStart = () => {
    if (hasHover) return
    suppress.current = false
    if (press.current !== null) window.clearTimeout(press.current)
    press.current = window.setTimeout(() => {
      suppress.current = true
      clearOpenTimer()
      clearCloseTimer()
      setOpen(false)
      setPeeking(true)
      onOpen?.()
      intelReplaced(cardId, entry, 'bottom-sheet', triggerRef.current)
    }, INTEL_LONG_PRESS_MS)
  }
  const holdEnd = () => {
    if (press.current !== null) window.clearTimeout(press.current)
    press.current = null
  }

  useEffect(() => {
    if (session.openId === cardId || session.openId === null) return
    setOpen(false)
    setPinned(false)
    setPeeking(false)
    clearOpenTimer()
    clearCloseTimer()
    // A different identifier owns the singleton overlay now.
  }, [session.openId, cardId])

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-intel-overlay]')) return
      if (wrapperRef.current?.contains(e.target as Node)) return
      doClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        const wasPinned = pinned
        doClose()
        if (wasPinned || document.activeElement?.closest?.('[data-intel-overlay]')) {
          triggerRef.current?.focus()
        }
      }
    }
    const move = (e: PointerEvent) => {
      // Safe triangle: travelling from the trigger into the open card must
      // not close it even if the pointer briefly leaves both.
      if (!leavePoint.current || pinned) return
      const cardEl = cardRef.current?.getBoundingClientRect()
      if (!cardEl) return
      const inside = inTravelTriangle(
        { x: e.clientX, y: e.clientY },
        leavePoint.current,
        { left: cardEl.left, top: cardEl.top, right: cardEl.right, bottom: cardEl.bottom },
      )
      if (inside) clearCloseTimer()
      else if (!wrapperRef.current?.contains(e.target as Node)) scheduleClose()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    document.addEventListener('pointermove', move)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
      document.removeEventListener('pointermove', move)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pinned])

  useEffect(
    () => () => {
      holdEnd()
      clearOpenTimer()
      clearCloseTimer()
      if (spaceTimer.current !== null) window.clearTimeout(spaceTimer.current)
    },
    [],
  )

  const pin = () => {
    clearCloseTimer()
    clearOpenTimer()
    setOpen(true)
    onOpen?.()
    setPinned(true)
    intelReplaced(cardId, entry, 'pinned', triggerRef.current)
  }

  return (
    <div
      ref={(node) => {
        wrapperRef.current = node
        triggerRef.current = node
        return undefined
      }}
      className={className}
      role="button"
      data-intel-row
      tabIndex={0}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-describedby={open ? cardId : undefined}
      style={{ position: 'relative', display: 'inline-flex', minWidth: 0, maxWidth: '100%' }}
      onMouseEnter={(e) => {
        if (!hasHover) return
        leavePoint.current = null
        hoverOnIdentifier.current = pointerAtIdentifier(e.target)
        if (hoverOnIdentifier.current) scheduleOpen()
      }}
      onMouseMove={(e) => {
        if (!hasHover) return
        if (e.target instanceof Element && e.target.closest('[data-intel-overlay]')) return
        const atIdentifier = pointerAtIdentifier(e.target)
        if (atIdentifier !== hoverOnIdentifier.current) {
          hoverOnIdentifier.current = atIdentifier
          if (atIdentifier) scheduleOpen()
          else scheduleClose()
        }
        if (atIdentifier && open) leavePoint.current = null
      }}
      onMouseLeave={(e) => {
        if (!hasHover || pinned) return
        hoverOnIdentifier.current = false
        leavePoint.current = { x: e.clientX, y: e.clientY }
        scheduleClose()
      }}
      onFocus={(e) => {
        if (e.target !== e.currentTarget) return
        clearCloseTimer()
        doOpen()
      }}
      onBlur={(e) => {
        // Moving focus from the trigger to the peek button inside the same
        // card must not close it out from under the user. The open card is
        // portaled to document.body, so also allow focus moving into it.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        if (cardRef.current?.contains(e.relatedTarget as Node)) return
        if (pinned) return
        doClose()
      }}
      onTouchStart={holdStart}
      onTouchMove={holdEnd}
      onTouchEnd={holdEnd}
      onTouchCancel={holdEnd}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const root = e.currentTarget.closest('table, [role="listbox"], .client-grid-container, .inventory-card-grid, .rental-dashboard__panels')
          const peers = Array.from((root ?? document).querySelectorAll<HTMLElement>('[data-intel-row]'))
          const index = peers.indexOf(e.currentTarget)
          const next = peers[index + (e.key === 'ArrowDown' ? 1 : -1)]
          if (next) {
            e.preventDefault()
            next.focus()
          }
          return
        }
        // Space tap = pin (Linear semantics); Space hold = temporary preview
        // that closes on release. Enter opens the Glance immediately.
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          pin()
        } else if (e.key === ' ') {
          if (e.repeat) return
          e.preventDefault()
          e.stopPropagation()
          spaceHeld.current = true
          spaceHeldLong.current = false
          spaceTimer.current = window.setTimeout(() => { spaceHeldLong.current = true }, INTEL_LONG_PRESS_MS)
          doOpen()
        }
      }}
      onKeyUp={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === ' ' && spaceHeld.current) {
          e.stopPropagation()
          spaceHeld.current = false
          if (spaceTimer.current !== null) window.clearTimeout(spaceTimer.current)
          spaceTimer.current = null
          if (spaceHeldLong.current) doClose()
          else pin()
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
      {/* The Glance hover card is portaled to document.body: its triggers live
          inside table cells and scroll containers (DataTableShell,
          movement panels) whose overflow would otherwise clip it, and under
          sticky headers/transformed ancestors whose stacking would bury it.
          The zero-size fixed anchor preserves the existing up/down + left/right
          flip geometry — it resolves against this point instead of the cell. */}
      {open && anchor && createPortal(
        <div
          style={{ position: 'fixed', top: anchor.y, left: anchor.x, width: 0, height: 0, zIndex: 'var(--z-dropdown)' }}
        >
          <Glance
          id={cardId}
          glance={extraLines.length > 0 ? { ...glance, lines: [...(glance.lines ?? []), ...extraLines].slice(0, 5) } : glance}
          up={flip.up}
          alignRight={flip.alignRight}
          pinned={pinned}
          reducedMotion={reducedMotion}
          cardRef={cardRef}
          onEnter={() => {
            clearCloseTimer()
            leavePoint.current = null
          }}
          onLeave={(e) => {
            if (pinned) return
            leavePoint.current = { x: e.clientX, y: e.clientY }
            scheduleClose()
          }}
          onUnpin={doClose}
          onPeek={() => {
            setOpen(false)
            setPinned(false)
            setPeeking(true)
            intelReplaced(cardId, entry, viewport === 'desktop' && !coarsePointer ? 'side-peek' : 'bottom-sheet', triggerRef.current)
          }}
          />
        </div>,
        document.body,
      )}
      <Modal
        isOpen={peeking}
        onClose={() => { setPeeking(false); intelClosed(cardId) }}
        title={detailTitle}
        size="lg"
        sheet={viewport !== 'desktop' || coarsePointer}
        sidePeek={viewport === 'desktop' && !coarsePointer}
        swipeDismiss={viewport !== 'desktop' || coarsePointer}
        peekHeight
        {...(detailSubtitle !== undefined ? { subtitle: detailSubtitle } : {})}
      >
        <DetailGroups groups={detail} />
        {peeking && entityType && entityId && context && gateContext && (
          <IntelDetailExtras
            entityType={entityType}
            entityId={entityId}
            context={context}
            gateContext={gateContext}
            actionContext={actionContext ?? null}
          />
        )}
      </Modal>
    </div>
  )
}

function Glance({
  id,
  glance,
  up,
  alignRight,
  pinned,
  reducedMotion,
  cardRef,
  onEnter,
  onLeave,
  onUnpin,
  onPeek,
}: {
  id: string
  glance: IntelGlance
  up: boolean
  alignRight: boolean
  pinned: boolean
  reducedMotion: boolean
  cardRef: { current: HTMLDivElement | null }
  onEnter: () => void
  onLeave: (e: React.MouseEvent) => void
  onUnpin: () => void
  onPeek: () => void
}) {
  const avatarTone = glance.avatarTone ? STATUS[glance.avatarTone] : undefined
  return (
    <div
      id={id}
      ref={cardRef}
      role={pinned ? 'dialog' : 'tooltip'}
      aria-label={pinned ? glance.title : undefined}
      data-intel-overlay
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: 'absolute',
        ...(up ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
        ...(alignRight ? { right: 0 } : { left: 0 }),
        zIndex: 50,
        width: 'min(360px, calc(100vw - 48px))',
        maxHeight: 320,
        overflow: 'auto',
        padding: 'var(--sp-md)',
        borderRadius: 'var(--r-card)',
        background: 'var(--hover-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-modal)',
        textAlign: 'left',
        opacity: 1,
        transform: 'scale(1)',
        transition: reducedMotion ? 'none' : `opacity ${INTEL_CARD_IN_MS}ms ease, transform ${INTEL_CARD_IN_MS}ms ease`,
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
        {pinned ? (
          <span style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
            <button
              type="button"
              aria-label="Close preview"
              title="Close preview (Esc)"
              onClick={(e) => {
                e.stopPropagation()
                onUnpin()
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
                <Icon name="close" size={14} />
              </span>
            </button>
          </span>
        ) : (
          /* The visible button stays 26x26 so it doesn't dominate the Glance
            card, but its hit area is the project's 44x44 floor (Law 15) —
            an absolutely-positioned overlay centered on the same spot, so
            the reserved layout footprint (the outer span) doesn't change. */
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
        )}
      </div>

      {glance.badges && glance.badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'var(--sp-sm)' }}>
          {glance.badges.slice(0, 3).map((b) => {
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
          {glance.badges.length > 3 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 20,
                padding: '0 7px',
                borderRadius: 'var(--r-badge)',
                background: 'var(--card2)',
                color: 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              +{glance.badges.length - 3}
            </span>
          )}
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

      <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {glance.primaryAction && (
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
        )}
        <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPeek()
            }}
            style={{
              marginLeft: 'auto',
              minHeight: 44,
              padding: '0 11px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Peek (Space)
          </button>
      </div>
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
