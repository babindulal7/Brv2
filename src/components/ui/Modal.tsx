import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from './Icon'
import { useViewport } from '../../lib/device'

// Matches --dur in theme.css (the app's generic transition-duration token).
// Kept as a JS constant so the close-unmount timer stays in sync with the
// CSS fade below; update both together if that token ever changes.
const TRANSITION_MS = 150

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
}

const SIZE_MAX_WIDTH: Record<NonNullable<ModalProps['size']>, number> = {
  sm: 420,
  md: 520,
  lg: 720,
  xl: 960,
  full: 1100,
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

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
  const maxWidth = phone ? '100%' : tablet && sheet ? '60vw' : SIZE_MAX_WIDTH[size]
  const surfaceMaxHeight = phone ? '100dvh' : sheet ? '90vh' : '85vh'
  const surfaceRadius = phone ? 0 : sheet ? '16px 16px 0 0' : 16

  // After every hook: `useViewport` is one, so the early return cannot precede it.
  if (!shouldRender) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: phone || sheet ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: phone || sheet ? 0 : 'var(--sp-lg)',
        background: 'rgba(0, 0, 0, 0.6)',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity var(--dur) ease',
      }}
    >
      <div
        style={{ position: 'fixed', inset: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth,
          maxHeight: surfaceMaxHeight,
          ...(phone ? { height: '100dvh' } : {}),
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: surfaceRadius,
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'scale(1)' : 'scale(0.97)',
          transition: 'opacity var(--dur) ease, transform var(--dur) ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2
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
              minWidth: 44,
              minHeight: 44,
              padding: 6,
              borderRadius: 'var(--r-btn)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>{children}</div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 'var(--sp-md)',
              padding: '16px 20px',
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
