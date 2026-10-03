import React from 'react'
import type { Role } from '../../lib/rbac'
import { canViewMoney } from '../../lib/rbac'
import { toRupees, rupees, type Paisa } from '../../lib/money'

export interface MoneyFieldProps {
  label?: string
  value: Paisa
  onChange?: (paisa: Paisa) => void
  role: Role
  error?: string | null
  helperText?: string
  disabled?: boolean
  className?: string
}

export const MoneyField: React.FC<MoneyFieldProps> = ({
  label,
  value,
  onChange,
  role,
  error,
  helperText,
  disabled = false,
  className = '',
}) => {
  // Law 6: Warehouse sees no money
  if (!canViewMoney(role)) {
    return null
  }

  const rupeeValue = toRupees(value)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onChange) return
    const num = parseFloat(e.target.value) || 0
    onChange(rupees(num))
  }

  return (
    <div className={className || undefined} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label
          style={{
            fontSize: 'var(--t-th)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--muted)',
          }}
        >
          {label}
        </label>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span
          style={{
            position: 'absolute',
            left: 14,
            fontSize: 'var(--t-ui)',
            fontWeight: 600,
            color: 'var(--muted)',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          Rs
        </span>

        <input
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          value={rupeeValue === 0 ? '' : rupeeValue}
          placeholder="0"
          onChange={handleInputChange}
          disabled={disabled}
          style={{
            width: '100%',
            minHeight: 44,
            paddingLeft: 42,
            paddingRight: 14,
            paddingTop: 8,
            paddingBottom: 8,
            fontSize: 'var(--t-ui)',
            fontFamily: 'monospace',
            borderRadius: 'var(--r-sm)',
            background: 'var(--card2)',
            border: error ? '1px solid var(--danger-border)' : '1px solid var(--border)',
            color: 'var(--text)',
            outline: 'none',
            transition: 'border-color var(--dur) var(--ease)',
            cursor: disabled ? 'not-allowed' : 'text',
            opacity: disabled ? 0.6 : 1,
          }}
          onFocus={(e) => {
            if (!error) e.currentTarget.style.borderColor = 'var(--nav-active-accent)'
          }}
          onBlur={(e) => {
            if (!error) e.currentTarget.style.borderColor = 'var(--border)'
          }}
        />
      </div>

      {error ? (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>{error}</span>
      ) : helperText ? (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{helperText}</span>
      ) : null}
    </div>
  )
}
