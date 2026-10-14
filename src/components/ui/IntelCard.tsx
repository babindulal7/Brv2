import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import type { IconName } from './Icon'
import { Modal } from './Modal'
import type { StatusKey } from '../../lib/status'
import { useCapability } from '../../lib/device'
import { INTEL_ADJACENT_DELAY_MS, INTEL_CARD_IN_MS, INTEL_CLOSE_DELAY_MS, INTEL_LONG_PRESS_MS, INTEL_OPEN_DELAY_MS } from '../../lib/intel/timing'
import { inTravelTriangle } from '../../lib/intel/safeTriangle'
import { intelClosed, intelNavigateBack, intelOpened, intelReplaced, isIntelSessionActive, useIntelSession } from '../../lib/intel/store'
import type { IntelNavigationEntry } from '../../lib/intel/store'
import type { IntelContext, IntelEntityType } from '../../lib/intel/context'
import type { GateContext } from '../../lib/fieldGating'
import type { ActionContext } from '../../actions/core'
import { IntelDetailExtras } from '../intel/IntelDetailExtras'
import { isLinkedIntelPath, loadLinkedIntel, type LinkedIntelDetail } from '../../data/linkedIntel'
import { IntelTabbedDetail } from '../intel/IntelTabbedDetail'

/**
 * The full tabbed card is clamped to the viewport at the identifier anchor.
 */
const editableIntelType = (type: IntelEntityType | undefined): type is 'client' | 'equipment' | 'rental' => type === 'client' || type === 'equipment' || type === 'rental'

/**
 * Hover Intel System — shared identifier preview shell.
 *
 * Desktop hover and focus show the full tabbed card directly; touch long press
 * shows the same body in a bottom sheet. Entity builders in
 * `src/data/*Intel.ts` supply already-gated glance/detail — a group or field
 * a role cannot see must never be constructed by the caller (gated blocks are
 * omitted from the payload, not CSS-hidden).
 *
 * Interaction contract:
 * - Desktop: 300ms hover-intent open, 300ms close intent, safe-triangle
 *   travel from trigger into card, 300ms adjacent switching while a session
 *   is active. Never auto-closes on a timer (WCAG 1.4.13).
 * - Pin: Space tap or interacting with the card pins it until
 *   ESC, close button, or click-away. Space-hold is a temporary preview.
 * - Keyboard: Space/Enter opens immediately on focus; ESC closes and returns
 *   focus to the trigger; the card is hoverable and persistent.
 * - Touch: 500ms long-press opens a bottom sheet; short tap keeps the row's own action.
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
  tone?: 'booking-date'
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
  gateContext?: GateContext | undefined
  actionContext?: ActionContext | null
  onOpen?: () => void
}

export function IntelCard({ children, glance, detailTitle, detailSubtitle, detail, className, context, entityType, entityId, gateContext, actionContext, onOpen }: IntelCardProps) {
  const { hasHover, reducedMotion } = useCapability()
  const session = useIntelSession()
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [linkedStack, setLinkedStack] = useState<LinkedIntelDetail[]>([])
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const linkRequest = useRef(0)
  /* Fixed viewport position for the portaled card. */
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const press = useRef<number | null>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const suppress = useRef(false)
  const restoringFocus = useRef(false)
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
    setSheetOpen(false)
    setLinkedStack([])
    linkRequest.current += 1
    intelClosed(cardId)
  }

  const linkedTop = linkedStack[linkedStack.length - 1]
  const goBack = () => {
    setLinkedStack((current) => current.slice(0, -1))
    setLinkError(null)
    linkRequest.current += 1
    setLinkLoading(false)
    intelNavigateBack(cardId)
  }
  const followLink = (path: string) => {
    if (!gateContext || !context || !isLinkedIntelPath(path)) return
    const request = ++linkRequest.current
    setLinkLoading(true)
    setLinkError(null)
    void loadLinkedIntel(path, gateContext).then((next) => {
      if (linkRequest.current !== request) return
      setLinkedStack((current) => [...current, next])
      intelReplaced(cardId, { entityType: next.entityType, entityId: next.entityId, context }, sheetOpen ? 'bottom-sheet' : 'pinned', triggerRef.current)
    }).catch((reason: unknown) => {
      if (linkRequest.current !== request) return
      setLinkError(reason instanceof Error ? reason.message : 'Linked record unavailable')
    }).finally(() => {
      if (linkRequest.current === request) setLinkLoading(false)
    })
  }

  const scheduleOpen = () => {
    clearCloseTimer()
    if (open || pinned || sheetOpen) return
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
    const width = Math.min(480, window.innerWidth - 24)
    const height = cardRef.current?.getBoundingClientRect().height ?? Math.min(560, window.innerHeight - 24)
    const below = window.innerHeight - r.bottom
    const above = r.top
    const y = below >= height + 6 || below >= above ? r.bottom + 6 : r.top - height - 6
    setAnchor({
      x: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(y, window.innerHeight - height - 12)),
    })
  }

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null)
      return
    }
    measureAnchor()
  }, [open])

  const anchorReady = anchor !== null
  /* Track the measured frame as tabs and asynchronously loaded content change. */
  useEffect(() => {
    if (!open || !anchorReady) return
    measureAnchor()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureAnchor)
    if (cardRef.current) observer?.observe(cardRef.current)
    window.addEventListener('scroll', measureAnchor, true)
    window.addEventListener('resize', measureAnchor)
    return () => {
      window.removeEventListener('scroll', measureAnchor, true)
      window.removeEventListener('resize', measureAnchor)
      observer?.disconnect()
    }
  }, [open, anchorReady])

  const holdStart = () => {
    if (hasHover) return
    suppress.current = false
    if (press.current !== null) window.clearTimeout(press.current)
    press.current = window.setTimeout(() => {
      suppress.current = true
      clearOpenTimer()
      clearCloseTimer()
      setOpen(false)
      setSheetOpen(true)
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
    setSheetOpen(false)
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
        if (linkedStack.length > 0) {
          goBack()
          return
        }
        const wasPinned = pinned
        doClose()
        if (wasPinned || document.activeElement?.closest?.('[data-intel-overlay]')) {
          restoringFocus.current = true
          triggerRef.current?.focus()
          restoringFocus.current = false
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
  }, [open, pinned, linkedStack.length])

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
      aria-expanded={open || sheetOpen}
      aria-describedby={open ? cardId : undefined}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44, maxWidth: '100%' }}
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
        if (restoringFocus.current) return
        if (sheetOpen) return
        clearCloseTimer()
        doOpen()
      }}
      onBlur={(e) => {
        // The touch sheet is portaled outside the trigger wrapper.
        if (sheetOpen) return
        // The card is portaled to document.body, so allow focus moving into it.
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
        // Space tap pins; Space hold shows a temporary card. Enter opens it.
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
        // React portals still bubble through the originating row. Card and
        // sheet controls must not activate that row's separate workflow.
        if (e.target instanceof Element && (e.target.closest('[data-intel-overlay]') || (sheetOpen && e.target.closest('[role="dialog"]')))) {
          e.stopPropagation()
          return
        }
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
      {/* Portaling keeps the card visible above table cells, scroll containers,
          and sticky headers. Its fixed position is clamped to the viewport. */}
      {open && anchor && createPortal(
        <div
          style={{ position: 'fixed', top: anchor.y, left: anchor.x, zIndex: 'var(--z-dropdown)' }}
        >
          <DirectIntelCard
          id={cardId}
          glance={linkedTop ? {
            ...glance,
            title: linkedTop.title,
            subtitle: linkedTop.subtitle,
            primaryAction: {
              label: linkedTop.entityType === 'client' ? 'Open client' : linkedTop.entityType === 'equipment' ? 'Open equipment' : 'Open booking',
              to: `/${linkedTop.entityType === 'client' ? 'clients' : linkedTop.entityType === 'equipment' ? 'inventory' : 'rentals'}/${encodeURIComponent(linkedTop.entityId)}`,
            },
          } : glance}
          reducedMotion={reducedMotion}
          cardRef={cardRef}
          onFocus={() => setPinned(true)}
          onEnter={() => {
            clearCloseTimer()
            leavePoint.current = null
          }}
          onLeave={(e) => {
            if (pinned) return
            leavePoint.current = { x: e.clientX, y: e.clientY }
            scheduleClose()
          }}
          onClose={() => {
            doClose()
            restoringFocus.current = true
            triggerRef.current?.focus()
            restoringFocus.current = false
          }}
          content={
            <>
              {linkedStack.length > 0 ? <button type="button" onClick={goBack} style={{ minHeight: 44, border: 'none', background: 'transparent', color: 'var(--link)', cursor: 'pointer' }}>← Back</button> : null}
              {linkLoading ? <p role="status">Loading linked record…</p> : null}
              {linkError ? <p role="alert">{linkError}</p> : null}
              <IntelTabbedDetail
                key={`${linkedTop?.entityType ?? entityType ?? 'none'}:${linkedTop?.entityId ?? entityId ?? 'none'}`}
                entityType={linkedTop?.entityType ?? entityType}
                entityId={linkedTop?.entityId ?? entityId}
                context={context}
                gateContext={gateContext}
                actionContext={actionContext ?? null}
                onFollow={followLink}
                fallback={<DetailGroups groups={linkedTop?.groups ?? detail} onFollow={followLink} />}
              />
              {editableIntelType(linkedTop?.entityType ?? entityType) && (linkedTop?.entityId ?? entityId) && context && gateContext && (
                <details style={{ marginTop: 12, borderTop: '1px solid var(--border)' }}>
                  <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', color: 'var(--link)', cursor: 'pointer', fontWeight: 600 }}>Custom fields</summary>
                  <IntelDetailExtras
                    entityType={(linkedTop?.entityType ?? entityType) as 'client' | 'equipment' | 'rental'}
                    entityId={(linkedTop?.entityId ?? entityId)!}
                    context={context}
                    gateContext={gateContext}
                    actionContext={actionContext ?? null}
                    section="fields"
                  />
                </details>
              )}
            </>
          }
          />
        </div>,
        document.body,
      )}
      <Modal
        isOpen={sheetOpen}
        onClose={doClose}
        onEscape={() => {
          if (linkedStack.length > 0) goBack()
          else doClose()
        }}
        title={linkedTop?.title ?? detailTitle}
        size="lg"
        sheet
        swipeDismiss
        {...((linkedTop?.subtitle ?? detailSubtitle) !== undefined ? { subtitle: linkedTop?.subtitle ?? detailSubtitle } : {})}
      >
        {linkedStack.length > 0 ? <button type="button" onClick={goBack} style={{ minHeight: 44, border: 'none', background: 'transparent', color: 'var(--link)', cursor: 'pointer' }}>← Back</button> : null}
        {linkLoading ? <p role="status">Loading linked record…</p> : null}
        {linkError ? <p role="alert">{linkError}</p> : null}
        <IntelTabbedDetail
          key={`${linkedTop?.entityType ?? entityType ?? 'none'}:${linkedTop?.entityId ?? entityId ?? 'none'}`}
          entityType={linkedTop?.entityType ?? entityType}
          entityId={linkedTop?.entityId ?? entityId}
          context={context}
          gateContext={gateContext}
          actionContext={actionContext ?? null}
          onFollow={followLink}
          fallback={<DetailGroups groups={linkedTop?.groups ?? detail} onFollow={followLink} />}
        />
        {sheetOpen && editableIntelType(linkedTop?.entityType ?? entityType) && (linkedTop?.entityId ?? entityId) && context && gateContext && (
          <IntelDetailExtras
            entityType={(linkedTop?.entityType ?? entityType) as 'client' | 'equipment' | 'rental'}
            entityId={(linkedTop?.entityId ?? entityId)!}
            context={context}
            gateContext={gateContext}
            actionContext={actionContext ?? null}
            section="fields"
          />
        )}
      </Modal>
    </div>
  )
}

function DirectIntelCard({ id, glance, content, reducedMotion, cardRef, onFocus, onEnter, onLeave, onClose }: {
  id: string
  glance: IntelGlance
  content: ReactNode
  reducedMotion: boolean
  cardRef: { current: HTMLDivElement | null }
  onFocus: () => void
  onEnter: () => void
  onLeave: (e: React.MouseEvent) => void
  onClose: () => void
}) {
  return (
    <div
      id={id}
      ref={cardRef}
      role="dialog"
      aria-label={`${glance.title} Intel`}
      data-intel-overlay
      onFocusCapture={onFocus}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        width: 'min(480px, calc(100vw - 24px))',
        maxHeight: 'min(560px, calc(100dvh - 24px))',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflowWrap: 'anywhere',
        whiteSpace: 'normal',
        borderRadius: 'var(--r-card)',
        background: 'var(--hover-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-modal)',
        color: 'var(--text)',
        textAlign: 'left',
        transition: reducedMotion ? 'none' : `opacity ${INTEL_CARD_IN_MS}ms ease`,
      }}
    >
      <div style={{ display: 'flex', flex: '0 0 auto', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <strong style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--t-ui)' }}>{glance.title}</strong>
        <button type="button" aria-label="Close Intel" onClick={onClose} style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 'var(--r-btn)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer' }}><Icon name="close" size={18} /></button>
      </div>
      <div style={{ padding: '0 12px 12px', minHeight: 0, minWidth: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>{content}</div>
      {glance.primaryAction ? <div style={{ flex: '0 0 auto', borderTop: '1px solid var(--border)', padding: '8px 12px' }}><Link to={glance.primaryAction.to} onClick={(e) => e.stopPropagation()} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: 'var(--r-btn)', color: 'var(--btn-primary-fg)', background: 'var(--btn-primary-bg)', textDecoration: 'none', fontWeight: 600 }}>{glance.primaryAction.label}</Link></div> : null}
    </div>
  )
}
function DetailGroups({ groups, onFollow }: { groups: IntelGroup[]; onFollow?: (path: string) => void }) {
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: '10px 16px', overflowWrap: 'anywhere' }}>
            {g.fields.map((f) => (
              <div key={f.label} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{f.label}</div>
                <div style={{ fontSize: 'var(--t-ui)', color: f.tone === 'booking-date' ? 'var(--booking-date-text)' : 'var(--text)', marginTop: 2, lineHeight: 1.4 }}>
                  {f.trigger ? (
                    <Link to={f.trigger.to} onClick={(event) => {
                      if (onFollow && isLinkedIntelPath(f.trigger!.to)) {
                        event.preventDefault()
                        onFollow(f.trigger!.to)
                      }
                    }} style={{ color: 'var(--link)', textDecoration: 'none', fontWeight: 600 }}>
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
