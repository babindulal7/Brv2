import React, { forwardRef } from 'react'
import { IconAlertCircle, IconChevronDown } from '@tabler/icons-react'

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
  ({ label, error, helperText, options, icon, children, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {label}
            {props.required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-500">
              {icon}
            </div>
          )}

          <select
            id={selectId}
            ref={ref}
            className={`w-full min-h-[44px] appearance-none px-3.5 py-2 pr-10 text-sm rounded-lg bg-slate-900 border text-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
              icon ? 'pl-10' : ''
            } ${
              error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-slate-800 hover:border-slate-700'
            } ${className}`}
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

          <div className="absolute right-3.5 flex items-center pointer-events-none text-slate-500">
            <IconChevronDown className="w-4 h-4" />
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-1.5 text-xs text-red-400 mt-0.5">
            <IconAlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : helperText ? (
          <span className="text-xs text-slate-500 mt-0.5">{helperText}</span>
        ) : null}
      </div>
    )
  }
)

Select.displayName = 'Select'
