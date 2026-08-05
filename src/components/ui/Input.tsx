import React, { forwardRef } from 'react'
import { IconAlertCircle, IconX } from '@tabler/icons-react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
  helperText?: string
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  onClear?: () => void
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, iconRight, onClear, className = '', id, value, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wider text-slate-400">
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

          <input
            id={inputId}
            ref={ref}
            value={value}
            className={`w-full min-h-[44px] px-3.5 py-2 text-sm rounded-lg bg-slate-900 border text-slate-100 placeholder-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
              icon ? 'pl-10' : ''
            } ${iconRight || onClear ? 'pr-10' : ''} ${
              error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-slate-800 hover:border-slate-700'
            } ${className}`}
            {...props}
          />

          {onClear && value && (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-3 p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <IconX className="w-4 h-4" />
            </button>
          )}

          {!onClear && iconRight && (
            <div className="absolute right-3.5 flex items-center pointer-events-none text-slate-500">
              {iconRight}
            </div>
          )}
        </div>

        {/* Law 12: Errors inline and persistent */}
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

Input.displayName = 'Input'
