import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { TouchTarget } from './TouchTarget'
import { useViewport } from '../../lib/device'

/*
 * ── Shared modal bookkeeping (module scope, one per bundle) ─────────────────
 *
 * Two defects lived here while each instance managed itself in isolation
 * (UI_UX_AUDIT_2026-08-28 §1, §6, §7):
 *
 *  · SCROLL LOCK — every instance's cleanup set `body.overflow = ''`
 *    unconditionally, so closing a ConfirmDialog stacked over another Modal
 *    (ClientsDirectory "Block Client", VoidInvoiceModal) unlocked the page
 *    while the outer modal was still up. `scrollLocks` counts open modals and
 *    only the LAST one out restores scrolling.
 *
 *  · ESCAPE — every open instance listened on `window`, so one Escape closed
 *    the whole stack, outer form included. `modalStack` records opening order;
 *    only the TOP modal answers Escape.
 */
const modalStack: symbol[] = []
let scrollLocks = 0

function lockScroll(id: symbol) {
  modalStack.push(id)
  scrollLocks += 1
  document.body.style.overflow = 'hidden'
}

function unlockScroll(id: symbol) {
  const i = modalStack.indexOf(id)
  if (i !== -1) modalStack.splice(i, 1)
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) document.body.style.overflow = ''
}

/* What can take focus inside the dialog, for the Tab trap and initial focus.
   Deliberately the boring selector — matches FilterDrawer's approach rather
   than inventing a cleverer one. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Matches --dur in theme.css (the app's generic transition-duration token).
// Kept as a JS constant so the close-unmount timer stays in sync with the
// CSS fade below; update both together if that token ever changes.
const TRANSITION_MS = 200

/**
 * Rewritten from Tailwind utility classNames — `fixed inset-0 z-50 flex...` —
 * to the app's real inline-style + CSS-variable system. Tailwind's Vite
 * plugin is registered but no CSS file imports `tailwindcss`, so every one of
 * those classes compiled to nothing: this modal rendered as an unstyled,
 * non-overlaying blob sitting in normal document flow, not a real dialog.
 * Same prop API as before, so every existing call site (AddClient,
 * ClientDetail, ClientsDirectory, DuplicateCenter, AddEquipment, ...) is
 * unaffected.
 */

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  sheet?: boolean
  portal?: boolean
}

const SIZE_MAX_WIDTH: Record<NonNullable<ModalProps['size']>, number> = {
  sm: 420,
  md: 520,
  lg: 720,
  xl: 960,
  full: 1400,
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  sheet = false,
  portal,
}: ModalProps) {
  // Keeps the modal mounted for a beat after isOpen flips to false so the
  // CSS fade/scale-out below can actually play instead of vanishing instantly.
  const [shouldRender, setShouldRender] = useState(isOpen)

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      return
    }
    const timeout = window.setTimeout(() => setShouldRender(false), TRANSITION_MS)
    return () => window.clearTimeout(timeout)
  }, [isOpen])

  const stackId = useRef<symbol | null>(null)
  if (stackId.current === null) stackId.current = Symbol('modal')
  const surfaceRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const id = stackId.current!
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only the top of the stack answers Escape — see module comment above.
      if (e.key === 'Escape' && isOpen && modalStack[modalStack.length - 1] === id) {
        onClose()
      }
    }
    if (isOpen) {
      lockScroll(id)
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      unlockScroll(id)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  /*
   * Focus contract (WCAG 2.4.3 / 2.1.2) — the piece FilterDrawer and MoreSheet
   * already had that this, the app's ONLY dialog, did not:
   *   open  → remember the opener, move focus to the first focusable control
   *           (or the surface itself, which carries tabIndex={-1} for exactly
   *           this fallback);
   *   close → put focus back on the opener, so a keyboard user is not dropped
   *           at <body> after every sheet.
   * rAF matches FilterDrawer.tsx:178 — the surface must be painted before it
   * can be focused.
   */
  useEffect(() => {
    if (isOpen) {
      openerRef.current = (document.activeElement as HTMLElement) ?? null
      const raf = window.requestAnimationFrame(() => {
        const surface = surfaceRef.current
        if (!surface) return
        const first = surface.querySelector<HTMLElement>(FOCUSABLE)
        ;(first ?? surface).focus()
      })
      return () => window.cancelAnimationFrame(raf)
    }
    openerRef.current?.focus()
    openerRef.current = null
    return undefined
  }, [isOpen])

  /* Tab trap — focus cycles inside the surface instead of walking out into
     the obscured page behind the scrim. */
  const handleTrapKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !surfaceRef.current) return
    const nodes = Array.from(surfaceRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (nodes.length === 0) {
      e.preventDefault()
      surfaceRef.current.focus()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (!first || !last) return
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === surfaceRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  /*
   * The three bands, taught here once rather than per caller.
   *
   * This is the app's single dialog: every sheet in the rebuild renders
   * through it, and it had no width awareness at all — `SIZE_MAX_WIDTH[size]`
   * at every width, and a 90vh sheet on a phone. Spec 9.4 states the bands for
   * the sheet form ("TABLET: sheet is 60% width. PHONE: full-screen"), and
   * `Expenses.tsx` already flags in a comment that this component does not
   * honour them. Teaching `Modal` fixes every caller at once.
   *
   *   · phone  — full-screen surface, no rounded corners, no inset, so the
   *                sticky footer sits on the bottom edge where a thumb is.
   *   · tablet — 60vw for a sheet, capped at its size token otherwise.
   *   · desktop— exactly as before.
   */
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const tablet = viewport === 'tablet'
  const maxWidth = phone ? (sheet ? '100%' : 'calc(100% - 24px)') : tablet && sheet ? '60vw' : SIZE_MAX_WIDTH[size]
  const surfaceMaxHeight = phone ? '85dvh' : sheet ? '85dvh' : size === 'full' ? '92dvh' : '85dvh'
  const surfaceRadius = phone ? (sheet ? '16px 16px 0 0' : 16) : sheet ? '16px 16px 0 0' : 16

  // After every hook: `useViewport` is one, so the early return cannot precede it.
  if (!shouldRender) return null

  const modalNode = (
    <div
      className="app-modal"
      onKeyDown={handleTrapKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        /* First adopter of the theme.css stacking scale (declared 24 Aug with
           zero consumers). 1400 puts every dialog above the page-level
           dropdowns that still sit at literal 1000 — at the old literal 60
           they painted OVER an open modal. Toasts sit at --z-system, above. */
        zIndex: 'var(--z-modal)' as unknown as number,
        display: 'flex',
        alignItems: sheet ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: sheet ? 0 : 'var(--sp-md)',
        background: 'var(--scrim)',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        style={{ position: 'fixed', inset: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={surfaceRef}
        className="app-modal__surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        style={{
          outline: 'none',
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth,
          maxHeight: surfaceMaxHeight,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          border: '1px solid var(--border2)',
          borderRadius: surfaceRadius,
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(8px)',
          transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: phone ? 'calc(16px + env(safe-area-inset-top, 0px)) 20px 16px' : '16px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2
                id={titleId}
                style={{
                  margin: 0,
                  fontSize: 'var(--t-h3)',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--muted)',
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 'var(--r-btn)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              /* TouchTarget below needs an anchor; the paint stays 32px so the
                 header keeps its density — Law 15 is the HIT AREA, not the
                 glyph (TouchTarget.tsx). */
              position: 'relative',
            }}
          >
            <TouchTarget />
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: 20 }}>{children}</div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: 'var(--sp-md)',
              padding: phone || sheet ? '16px 20px calc(16px + env(safe-area-inset-bottom, 0px))' : '16px 20px',
              borderTop: '1px solid var(--border)',
              background: 'var(--card2)',
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  // RULING 2026-09-23: never `process.env` in shipped modules — the program has no
  // node types; MODE is 'test' under vitest, so the portal skips there only.
  const usePortal = portal ?? (import.meta.env.MODE !== 'test')
  return usePortal && typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode
}
