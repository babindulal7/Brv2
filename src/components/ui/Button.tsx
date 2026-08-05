import React from 'react'
import { IconLoader2 } from '@tabler/icons-react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  iconRight,
  className = '',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2'

  // Law 15: Minimum 44px touch target on every device
  const sizeClasses = {
    sm: 'min-h-[44px] px-3 py-2 text-xs gap-1.5',
    md: 'min-h-[44px] px-4 py-2.5 text-sm gap-2',
    lg: 'min-h-[48px] px-6 py-3 text-base gap-2.5',
  }[size]

  const variantClasses = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500 shadow-sm border border-transparent',
    secondary:
      'bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-600 focus:ring-slate-500 border border-slate-700',
    outline:
      'bg-transparent text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white focus:ring-slate-500',
    ghost:
      'bg-transparent text-slate-300 hover:bg-slate-800/60 hover:text-white focus:ring-slate-500 border border-transparent',
    danger:
      'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:ring-red-500 shadow-sm border border-transparent',
    gold:
      'bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 active:bg-amber-600 focus:ring-amber-400 shadow-sm border border-transparent',
  }[variant]

  return (
    <button
      disabled={disabled || loading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <IconLoader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        icon && <span className="inline-flex shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && iconRight && <span className="inline-flex shrink-0">{iconRight}</span>}
    </button>
  )
}
