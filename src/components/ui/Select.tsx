import React, { forwardRef } from 'react'
import Icon from './Icon'

/**
 * Rewritten from Tailwind utility classNames to the app's real inline-style +
 * CSS-variable system — see `Toast.tsx` for the full explanation of why every
 * Tailwind class in this file used to compile to nothing. Same prop API as
 * before (`Input.tsx` is the reference pattern this follows); this component
 * has zero live JSX call sites today, so the signature is kept stable purely
 * for whichever screen adopts it next.
 */

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string | null
  helperText?: string
  options?: SelectOption[]
  icon?: React.ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, icon, children, className, style, id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {label && (
          <label
            htmlFor={selectId}
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

          <select
            id={selectId}
            ref={ref}
            className={className}
            style={{
              width: '100%',
              minHeight: 44,
              appearance: 'none',
              padding: '8px 14px',
              paddingLeft: icon ? 38 : 14,
              paddingRight: 38,
              fontSize: 'var(--t-body)',
              borderRadius: 'var(--r-input)',
              background: 'var(--input-bg)',
              border: `1px solid ${error ? 'var(--danger)' : 'var(--input-border)'}`,
              color: 'var(--text)',
              transition: 'border-color 0.15s ease',
              cursor: props.disabled ? 'not-allowed' : 'pointer',
              opacity: props.disabled ? 0.5 : 1,
              ...style,
            }}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

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
            <Icon name="chevron_down" size={16} />
          </div>
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
  }
)

Select.displayName = 'Select'
