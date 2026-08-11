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
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        <span className="absolute left-3.5 text-sm font-semibold text-slate-400 select-none pointer-events-none">
          Rs
        </span>

        <input
          type="number"
          step="1"
          min="0"
          value={rupeeValue === 0 ? '' : rupeeValue}
          placeholder="0"
          onChange={handleInputChange}
          disabled={disabled}
          className={`w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm font-mono rounded-lg bg-slate-900 border text-slate-100 placeholder-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? 'border-red-500 focus:ring-red-500' : 'border-slate-800 hover:border-slate-700'
          }`}
        />
      </div>

      {error ? (
        <span className="text-xs text-red-400">{error}</span>
      ) : helperText ? (
        <span className="text-xs text-slate-500">{helperText}</span>
      ) : null}
    </div>
  )
}
