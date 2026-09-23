import type { ReactNode, CSSProperties } from 'react'
import Icon, { type IconName } from './Icon'

export interface SegmentOption<T extends string = string> {
  id: T
  label: ReactNode
  icon?: IconName
  badge?: ReactNode
  disabled?: boolean
  title?: string
}

export interface SegmentedControlProps<T extends string = string> {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  fullWidth?: boolean
  size?: 'sm' | 'md'
  className?: string
  style?: CSSProperties
}

/**
 * Canonical SegmentedControl / Tab Pill Switcher
 *
 * Provides a unified, accessible, touch-compliant tab control for switching views,
 * roles, or sections across all screens in Babin Rentals OS.
 *
 * Adheres to:
 * - Law 15: Minimum touch-target sizing
 * - Design System: Consistent double-bezel rim, var(--card) active surface, theme tokens
 */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel = 'Navigation options',
  fullWidth = false,
  size = 'md',
  className = '',
  style,
}: SegmentedControlProps<T>) {
  // Law 15 — 44 is the floor at both sizes; `sm` tightens padding and type, never the hit area.
  const minHeight = 44

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`segmented-control ${fullWidth ? 'segmented-control--full' : ''} ${className}`}
      style={{
        display: fullWidth ? 'grid' : 'inline-flex',
        gridTemplateColumns: fullWidth ? `repeat(${options.length}, minmax(0, 1fr))` : undefined,
        alignItems: 'center',
        gap: 3,
        padding: 3,
        background: 'var(--surface-2, rgba(255, 255, 255, 0.05))',
        border: '1px solid var(--border)',
        borderRadius: 'calc(var(--r-btn, 8px) + 2px)',
        overflowX: fullWidth ? undefined : 'auto',
        maxWidth: '100%',
        scrollbarWidth: 'none',
        ...style,
      }}
    >
      {options.map((opt) => {
        const isSelected = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={opt.disabled}
            title={opt.title}
            onClick={() => {
              if (!opt.disabled && opt.id !== value) {
                onChange(opt.id)
              }
            }}
            style={{
              minHeight,
              padding: size === 'sm' ? '0 10px' : '0 14px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              border: 'none',
              borderRadius: 'var(--r-btn, 6px)',
              background: isSelected ? 'var(--card)' : 'transparent',
              color: isSelected ? 'var(--text)' : 'var(--text2)',
              fontSize: size === 'sm' ? '12px' : 'var(--t-meta, 13px)',
              fontWeight: isSelected ? 600 : 500,
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              opacity: opt.disabled ? 0.45 : 1,
              whiteSpace: 'nowrap',
              boxShadow: isSelected ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.08)), var(--specular-rim)' : 'none',
              transition: 'background var(--dur-fast, 120ms) var(--ease), color var(--dur-fast, 120ms) var(--ease), box-shadow var(--dur-fast, 120ms) var(--ease)',
              fontFamily: 'inherit',
            }}
          >
            {opt.icon && (
              <Icon
                name={opt.icon}
                size={size === 'sm' ? 14 : 16}
                style={{
                  color: isSelected ? 'var(--primary, var(--brand))' : 'var(--muted)',
                  flexShrink: 0,
                }}
              />
            )}
            <span>{opt.label}</span>
            {opt.badge !== undefined && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 'var(--r-badge, 999px)',
                  background: isSelected ? 'var(--nav-active-bg)' : 'var(--surface-2, rgba(255,255,255,0.08))',
                  color: isSelected ? 'var(--nav-active-accent)' : 'var(--muted)',
                  lineHeight: 1.3,
                }}
              >
                {opt.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
