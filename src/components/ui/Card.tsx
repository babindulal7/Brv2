import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  footer?: React.ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  action,
  footer,
  padding = 'md',
  children,
  className = '',
  ...props
}) => {
  const paddingClass = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  }[padding]

  return (
    <div
      className={`bg-slate-900 border border-slate-800/80 rounded-xl shadow-sm text-slate-100 flex flex-col ${className}`}
      {...props}
    >
      {(title || subtitle || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            {title && <h3 className="font-semibold text-base text-slate-100">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}

      <div className={`flex-1 ${paddingClass}`}>{children}</div>

      {footer && <div className="px-5 py-3.5 bg-slate-950/40 border-t border-slate-800 rounded-b-xl">{footer}</div>}
    </div>
  )
}

export interface KpiCardProps {
  label: string
  value: string | number
  subtext?: string
  trend?: {
    value: string
    isPositive: boolean
  }
  icon?: React.ReactNode
  onClick?: () => void
}

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, subtext, trend, icon, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col gap-2 transition-all ${
        onClick ? 'cursor-pointer hover:border-slate-700 hover:bg-slate-800/60' : ''
      }`}
    >
      <div className="flex items-center justify-between text-slate-400">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>

      <div className="text-2xl font-bold text-slate-50 tracking-tight">{value}</div>

      {(subtext || trend) && (
        <div className="flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={`font-semibold ${trend.isPositive ? 'text-emerald-400' : 'text-amber-400'}`}
            >
              {trend.value}
            </span>
          )}
          {subtext && <span className="text-slate-400">{subtext}</span>}
        </div>
      )}
    </div>
  )
}
