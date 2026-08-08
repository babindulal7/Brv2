import { useEffect } from 'react'
import type { ReactNode } from 'react'
import Icon from './Icon'

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

  if (!isOpen) return null

  const maxWidth = SIZE_MAX_WIDTH[size]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: sheet ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: sheet ? 0 : 16,
        background: 'rgba(0, 0, 0, 0.6)',
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
          maxHeight: sheet ? '90vh' : '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: sheet ? '16px 16px 0 0' : 16,
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
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
              gap: 12,
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
