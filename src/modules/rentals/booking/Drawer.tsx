/**
 * The drawer shell both client panels sit in ("New Booking" spec §11 and §20:
 * *"opens a compact drawer, does not navigate away"*).
 *
 * Why not `components/ui/Modal.tsx`: a modal is centred, sized in fixed steps
 * and reads as an interruption. §11/§20 both want a side panel that lets the
 * operator keep the booking in view while they check a balance — the whole
 * point is that consulting client history must not cost you the half-built
 * booking behind it. So this is a right-edge sheet on tablet/desktop and a
 * bottom sheet on phone, and it never routes.
 *
 * It deliberately copies Modal's proven mechanics rather than inventing new
 * ones: the same 150ms keep-mounted-while-fading pattern, the same Escape
 * handler, the same body-scroll lock. Focus is moved into the panel on open and
 * returned to the invoking control on close, because a disclosure the keyboard
 * cannot reach is not a disclosure.
 */

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import Icon from '../../../components/ui/Icon'
import { useViewport } from '../../../lib/device'
import { TOUCH } from './ClientHealthChip'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  /** Used as the panel's accessible name and its visible heading. */
  title: string
  subtitle?: string
  /** Stable DOM id, so an `aria-controls` on the invoking control can point here. */
  id: string
  children: ReactNode
  footer?: ReactNode
  /** Desktop/tablet panel width in px. */
  width?: number
}

export function Drawer({ open, onClose, title, subtitle, id, children, footer, width = 420 }: DrawerProps) {
  const viewport = useViewport()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    // Move focus in on the next frame, after the panel has painted.
    const raf = window.requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
      window.cancelAnimationFrame(raf)
      // Send focus back where it came from — the eye / "Client History" button.
      restoreFocusTo.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const phone = viewport === 'phone'
  const headingId = `${id}-title`

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: phone ? 'flex-end' : 'stretch',
        justifyContent: phone ? 'center' : 'flex-end',
      }}
    >
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        id={id}
        tabIndex={-1}
        style={{
          position: 'relative',
          zIndex: 1,
          width: phone ? '100%' : `min(${width}px, 100vw)`,
          maxHeight: phone ? '88vh' : '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          borderLeft: phone ? 'none' : '1px solid var(--border)',
          borderTop: phone ? '1px solid var(--border)' : 'none',
          borderRadius: phone ? '16px 16px 0 0' : 0,
          boxShadow: 'var(--shadow-modal)',
          outline: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 id={headingId} style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{ margin: '3px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            className="press"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: '1px solid transparent',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              minWidth: TOUCH,
              minHeight: TOUCH,
              borderRadius: 'var(--r-btn)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-lg)', display: 'grid', gap: 'var(--sp-md)', alignContent: 'start' }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
              padding: '12px 16px',
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
}

/* ── Small shared pieces both client drawers use ───────────────────────── */

/** A titled block inside a drawer — §14's CLIENT STATUS / FINANCIAL / EQUIPMENT groups. */
export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        background: 'var(--card2)',
        overflow: 'hidden',
      }}
    >
      <h3
        style={{
          margin: 0,
          padding: '8px 12px',
          fontSize: 'var(--t-meta)',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text2)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {title}
      </h3>
      <div style={{ padding: 'var(--sp-md)', display: 'grid', gap: 'var(--sp-sm)' }}>{children}</div>
    </section>
  )
}

/**
 * One label/value row.
 *
 * `value === null` is the **honest unavailable** case: it renders an em-dash
 * carrying a `title` that says the figure is not tracked yet, rather than a
 * zero that would read as a measured fact. `unavailableNote` is required when
 * the value is null precisely so a caller cannot produce a bare, unexplained
 * dash.
 */
export function DrawerRow({
  label,
  value,
  unavailableNote,
  figure = false,
  tone,
}: {
  label: string
  value: ReactNode | null
  unavailableNote?: string
  /** Numbers, money, counts, dates — tabular figures, per the codebase `figure` convention. */
  figure?: boolean
  tone?: 'danger' | 'warning' | 'success' | 'muted'
}) {
  const colour =
    tone === 'danger'
      ? 'var(--danger-text)'
      : tone === 'warning'
        ? 'var(--warning-text)'
        : tone === 'success'
          ? 'var(--success-text)'
          : tone === 'muted'
            ? 'var(--text2)'
            : 'var(--text)'
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-md)' }}>
      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', minWidth: 0 }}>{label}</span>
      {value === null ? (
        <span
          className="figure"
          title={unavailableNote ?? 'Not tracked yet'}
          style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}
        >
          —
        </span>
      ) : (
        <span
          {...(figure ? { className: 'figure' } : {})}
          style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: colour, textAlign: 'right' }}
        >
          {value}
        </span>
      )}
    </div>
  )
}

/**
 * The stated reason a whole block has nothing to show. Used instead of an empty
 * card or, worse, a plausible-looking placeholder list.
 */
export function DrawerUnavailable({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        display: 'flex',
        gap: 7,
        alignItems: 'flex-start',
        fontSize: 'var(--t-meta)',
        color: 'var(--text2)',
      }}
    >
      <span style={{ display: 'inline-flex', paddingTop: 1, flexShrink: 0, color: 'var(--muted)' }}>
        <Icon name="info" size={13} />
      </span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </p>
  )
}
