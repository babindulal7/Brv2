import { forwardRef } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import Icon from './Icon'

/**
 * Rewritten from Tailwind utility classNames to the app's real inline-style +
 * CSS-variable system — see `Toast.tsx` for the full explanation of why every
 * Tailwind class in this file used to compile to nothing. Same prop API as
 * before, so every existing call site (`CasesWorkspace.tsx`, `CrewBooking.tsx`,
 * `SubRental.tsx`) is unaffected.
 */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
  helperText?: string
  icon?: ReactNode
  iconRight?: ReactNode
  onClear?: () => void
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, icon, iconRight, onClear, className, style, id, value, ...props },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)
  const showClear = Boolean(onClear && value)
  const showRightIcon = !onClear && Boolean(iconRight)

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: 'var(--t-th)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--muted)',
          }}
        >
          {label}
          {props.required && <span style={{ color: 'var(--danger-text)', marginLeft: 'var(--sp-xs)' }}>*</span>}
        </label>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && (
          <div
            style={{
              position: 'absolute',
              left: 12,
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: 'var(--muted)',
            }}
          >
            {icon}
          </div>
        )}

        <input
          id={inputId}
          ref={ref}
          value={value}
          className={className}
          style={{
            width: '100%',
            minHeight: 44,
            padding: '8px 14px',
            paddingLeft: icon ? 38 : 14,
            paddingRight: showClear || showRightIcon ? 38 : 14,
            fontSize: 'var(--t-body)',
            borderRadius: 'var(--r-input)',
            background: 'var(--input-bg)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--input-border)'}`,
            color: 'var(--text)',
            transition: 'border-color 0.15s ease',
            ...style,
          }}
          {...props}
        />

        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear"
            style={{
              position: 'absolute',
              right: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--sp-xs)',
              borderRadius: 'var(--r-xs)',
              border: 'none',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            <Icon name="close" size={16} />
          </button>
        ) : showRightIcon ? (
          <div
            style={{
              position: 'absolute',
              right: 12,
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: 'var(--muted)',
            }}
          >
            {iconRight}
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--t-meta)',
            color: 'var(--danger-text)',
          }}
        >
          <Icon name="error" size={14} />
          <span>{error}</span>
        </div>
      ) : helperText ? (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{helperText}</span>
      ) : null}
    </div>
  )
})

Input.displayName = 'Input'
