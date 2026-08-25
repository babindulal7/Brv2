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
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

const SIZE_STYLES: Record<
  NonNullable<ButtonProps['size']>,
  { minHeight: number; padding: string; fontSize: string; gap: number | string; iconSize: number }
> = {
  // Law 15: minimum 44px touch target on every device — never relaxed, even for `sm`.
  sm: { minHeight: 44, padding: '0 12px', fontSize: 'var(--t-meta)', gap: 6, iconSize: 14 },
  md: { minHeight: 44, padding: '0 16px', fontSize: 'var(--t-ui)', gap: 'var(--sp-sm)', iconSize: 16 },
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
        background: 'var(--btn-danger-bg)',
        color: 'var(--btn-danger-fg)',
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
  className,
  ...props
}: ButtonProps) {
  const sizing = SIZE_STYLES[size]
  const isDisabled = disabled || loading

  return (
    <button
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={['press', className].filter(Boolean).join(' ')}
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
        // Containing block for the loading spinner overlay below.
        position: 'relative',
        // §5 — disabled is opacity 0.45, never a colour change. Was 0.5.
        opacity: isDisabled ? 0.45 : 1,
        minHeight: sizing.minHeight,
        padding: sizing.padding,
        fontSize: sizing.fontSize,
        gap: sizing.gap,
        ...variantStyle(variant),
        ...style,
      }}
      {...props}
    >
      {/*
        §5 — "loading keeps the button's width (label transparent, spinner
        overlays) so layout never jumps."

        This previously swapped the ICON SLOT for the spinner while leaving
        `children` rendered, so a text-only button — the common case — GAINED a
        spinner and grew wider the moment it started loading, shifting whatever
        sat beside it. Now the label keeps its box and turns transparent, and
        the spinner is absolutely positioned over it: the button occupies the
        exact same rectangle loading or not.

        `visibility` rather than `opacity` on the label so a screen reader does
        not announce a value that is mid-flight; `aria-busy` carries the state.
      */}
      {loading && (
        <Icon
          name="refresh"
          size={sizing.iconSize}
          style={{
            animation: 'spin 0.8s linear infinite',
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
      {!loading && icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
      {children && <span style={loading ? { visibility: 'hidden' } : undefined}>{children}</span>}
      {!loading && iconRight && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{iconRight}</span>}
    </button>
  )
}
