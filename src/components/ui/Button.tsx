import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import Icon from './Icon'

/**
 * Rewritten from Tailwind utility classNames — `bg-blue-600 hover:bg-blue-700...` —
 * to the app's real inline-style + CSS-variable system. Tailwind's Vite plugin is
 * registered but no CSS file imports `tailwindcss`, so every one of those classes
 * compiled to nothing and this component rendered fully unstyled wherever it was
 * used. Same prop/API shape as before, so every existing call site is unaffected.
 */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

const SIZE_STYLES: Record<
  NonNullable<ButtonProps['size']>,
  { minHeight: number; padding: string; fontSize: string; gap: number; iconSize: number }
> = {
  // Law 15: minimum 44px touch target on every device — never relaxed, even for `sm`.
  sm: { minHeight: 44, padding: '0 12px', fontSize: 'var(--t-meta)', gap: 6, iconSize: 14 },
  md: { minHeight: 44, padding: '0 16px', fontSize: 'var(--t-ui)', gap: 8, iconSize: 16 },
  lg: { minHeight: 48, padding: '0 24px', fontSize: 'var(--t-body)', gap: 10, iconSize: 18 },
}

function variantStyle(variant: NonNullable<ButtonProps['variant']>): CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background: 'var(--btn-primary-bg)',
        color: 'var(--btn-primary-fg)',
        border: '1px solid transparent',
        boxShadow: 'var(--shadow-card)',
      }
    case 'secondary':
      return {
        background: 'var(--btn-secondary-bg)',
        color: 'var(--text)',
        border: '1px solid var(--btn-secondary-border)',
      }
    case 'outline':
      return {
        background: 'transparent',
        color: 'var(--text2)',
        border: '1px solid var(--border)',
      }
    case 'ghost':
      return {
        background: 'transparent',
        color: 'var(--text2)',
        border: '1px solid transparent',
      }
    case 'danger':
      return {
        background: 'var(--btn-danger-bg, #dc2626)',
        color: '#fff',
        border: '1px solid transparent',
        boxShadow: 'var(--shadow-card)',
      }
    case 'gold':
      // §4.2 "gold outline = external asset only" governs the status token, not
      // this generic reusable primitive — a solid filled gold background is fine.
      return {
        background: '#d8a93a',
        color: '#000000',
        border: '1px solid transparent',
        boxShadow: 'var(--shadow-card)',
      }
  }
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  iconRight,
  style,
  ...props
}: ButtonProps) {
  const sizing = SIZE_STYLES[size]
  const isDisabled = disabled || loading

  return (
    <button
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        borderRadius: 'var(--r-btn)',
        transition: 'background-color 150ms, opacity 150ms',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        minHeight: sizing.minHeight,
        padding: sizing.padding,
        fontSize: sizing.fontSize,
        gap: sizing.gap,
        ...variantStyle(variant),
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <Icon name="refresh" size={sizing.iconSize} style={{ animation: 'spin 0.8s linear infinite' }} />
      ) : (
        icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && iconRight && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{iconRight}</span>}
    </button>
  )
}
