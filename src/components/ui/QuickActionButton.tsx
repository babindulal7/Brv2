import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'

export type QuickActionVariant = 'primary' | 'secondary' | 'accent' | 'warning' | 'danger' | 'ghost'

export interface SplitActionItem {
  id: string
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  description?: string
}

export interface QuickActionButtonProps {
  label: string
  icon?: ReactNode
  onClick: () => void
  variant?: QuickActionVariant
  disabled?: boolean
  loading?: boolean
  title?: string
  shortcut?: string
  /** If provided, renders a Booqable-style split button with dropdown choices */
  splitActions?: SplitActionItem[]
  className?: string
}

/**
 * QuickActionButton — Speed verb button with optional split menu and loading states.
 * Fully compliant with Law 15 (minimum 44px touch target) and Law 11 (Never Colour Alone).
 */
export function QuickActionButton({
  label,
  icon,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
  title,
  shortcut,
  splitActions,
  className = '',
}: QuickActionButtonProps) {
  const [splitOpen, setSplitOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSplitOpen(false)
      }
    }
    if (splitOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [splitOpen])

  // Variant styling map
  const variantStyles: Record<QuickActionVariant, { bg: string; color: string; border: string }> = {
    primary: { bg: '#2563EB', color: '#FFFFFF', border: '1px solid #1D4ED8' }, // Blue
    accent: { bg: '#F97316', color: '#FFFFFF', border: '1px solid #EA580C' },  // Orange Handover
    warning: { bg: '#D97706', color: '#FFFFFF', border: '1px solid #B45309' }, // Amber Inspect
    danger: { bg: '#DC2626', color: '#FFFFFF', border: '1px solid #B91C1C' },  // Red
    secondary: { bg: '#FFFFFF', color: '#1E293B', border: '1px solid #CBD5E1' }, // Ghost White
    ghost: { bg: 'transparent', color: '#475569', border: '1px solid transparent' },
  }

  const currentStyle = variantStyles[variant]

  return (
    <div
      ref={menuRef}
      className={`quick-action-button-group ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        position: 'relative',
        borderRadius: '6px',
        boxShadow: variant === 'secondary' || variant === 'ghost' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <button
        type="button"
        disabled={disabled || loading}
        onClick={onClick}
        title={title ?? label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: '44px', // Law 15 minimum touch target
          padding: '0 16px',
          background: disabled ? '#94A3B8' : currentStyle.bg,
          color: disabled ? '#F1F5F9' : currentStyle.color,
          border: disabled ? '1px solid #94A3B8' : currentStyle.border,
          borderTopLeftRadius: '6px',
          borderBottomLeftRadius: '6px',
          borderTopRightRadius: splitActions && splitActions.length > 0 ? 0 : '6px',
          borderBottomRightRadius: splitActions && splitActions.length > 0 ? 0 : '6px',
          fontSize: 'var(--t-ui, 0.875rem)',
          fontWeight: 600,
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          transition: 'background 120ms ease, opacity 120ms ease',
        }}
      >
        {loading ? (
          <span
            style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#FFFFFF',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        ) : (
          icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
        )}

        <span>{loading ? 'Processing...' : label}</span>

        {shortcut && (
          <kbd
            style={{
              fontSize: '11px',
              padding: '1px 5px',
              borderRadius: '4px',
              background: 'rgba(0,0,0,0.15)',
              border: '1px solid rgba(255,255,255,0.2)',
              marginLeft: '4px',
            }}
          >
            {shortcut}
          </kbd>
        )}
      </button>

      {splitActions && splitActions.length > 0 && (
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => setSplitOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={splitOpen}
          aria-label="More operational choices"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: '36px',
            minHeight: '44px',
            background: disabled ? '#94A3B8' : currentStyle.bg,
            color: disabled ? '#F1F5F9' : currentStyle.color,
            border: disabled ? '1px solid #94A3B8' : currentStyle.border,
            borderLeft: '1px solid rgba(255,255,255,0.25)',
            borderTopRightRadius: '6px',
            borderBottomRightRadius: '6px',
            cursor: disabled || loading ? 'not-allowed' : 'pointer',
            padding: 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: splitOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {splitOpen && splitActions && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: '220px',
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
            padding: '4px',
            zIndex: 50,
          }}
        >
          {splitActions.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setSplitOpen(false)
                item.onClick()
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                borderRadius: '4px',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                opacity: item.disabled ? 0.5 : 1,
                fontSize: '13px',
                color: '#1E293B',
              }}
              onMouseEnter={(e) => {
                if (!item.disabled) e.currentTarget.style.background = '#F1F5F9'
              }}
              onMouseLeave={(e) => {
                if (!item.disabled) e.currentTarget.style.background = 'transparent'
              }}
            >
              {item.icon && <span style={{ marginTop: '2px', color: '#64748B' }}>{item.icon}</span>}
              <div>
                <div style={{ fontWeight: 600 }}>{item.label}</div>
                {item.description && (
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                    {item.description}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
export default QuickActionButton
