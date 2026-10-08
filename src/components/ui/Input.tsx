import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import Icon from './Icon'
import { InfoTooltip } from './InfoTooltip'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
  helperText?: string
  info?: ReactNode
  icon?: ReactNode
  iconRight?: ReactNode
  onClear?: () => void
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, info, icon, iconRight, onClear, className, style, id, value, 'aria-describedby': describedBy, ...props },
  ref
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const messageId = `${inputId}-message`
  const descriptionIds = [describedBy, error || helperText ? messageId : undefined].filter(Boolean).join(' ') || undefined
  const showClear = Boolean(onClear && value)
  const showRightIcon = !onClear && Boolean(iconRight)

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label
            htmlFor={inputId}
            style={{
              fontSize: 'var(--t-ui)',
              fontWeight: 600,
              color: 'var(--text2)',
            }}
          >
            {label}
            {props.required && <span style={{ color: 'var(--danger-text)', marginLeft: 'var(--sp-xs)' }}>*</span>}
          </label>
          {info && <InfoTooltip content={info} />}
        </div>
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
          className={['ui-input', className].filter(Boolean).join(' ')}
          style={{
            width: '100%',
            minHeight: 44,
            padding: '8px 14px',
            paddingLeft: icon ? 38 : 14,
            paddingRight: showClear ? 52 : showRightIcon ? 38 : 14,
            fontSize: 'var(--t-body)',
            borderRadius: 'var(--r-input)',
            background: 'var(--input-bg)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--input-border)'}`,
            color: 'var(--text)',
            transition: 'border-color 0.15s ease',
            ...style,
            ...(icon ? { paddingLeft: 38 } : {}),
            ...(showClear ? { paddingRight: 52 } : showRightIcon ? { paddingRight: 38 } : {}),
          }}
          {...props}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && onClear && value) {
              e.preventDefault()
              onClear()
            }
            props.onKeyDown?.(e)
          }}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={descriptionIds}
        />

        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={label ? `Clear ${label}` : 'Clear'}
            disabled={props.disabled || props.readOnly}
            style={{
              position: 'absolute',
              right: 4,
              minWidth: 44,
              minHeight: 44,
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
          id={messageId}
          role="alert"
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
        <span id={messageId} style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{helperText}</span>
      ) : null}
    </div>
  )
})

Input.displayName = 'Input'
