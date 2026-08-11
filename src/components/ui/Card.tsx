import React from 'react'
import type { CSSProperties } from 'react'

/**
 * Rewritten from Tailwind utility classNames (`bg-slate-900 border...`) to the
 * app's real inline-style + CSS-variable system. Tailwind's Vite plugin is
 * registered but no CSS file imports `tailwindcss`, so every one of those
 * classes compiled to nothing — this `Card` (used in CasesWorkspace.tsx,
 * CrewBooking.tsx, SubRental.tsx) rendered as an unstyled `<div>`. Same
 * prop/API shape as before, so every existing call site is unaffected.
 *
 * Shape mirrors `Card` in `Page.tsx` (same `cardStyle` token set), with the
 * addition of this component's own optional `subtitle`, `footer`, and
 * `padding` props that `Page.tsx`'s `Card` doesn't have.
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  footer?: React.ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const PADDING: Record<NonNullable<CardProps['padding']>, number | string> = {
  none: 0,
  sm: 'var(--sp-md)',
  md: 20,
  lg: 'var(--sp-xl)',
}

export function Card({
  title,
  subtitle,
  action,
  footer,
  padding = 'md',
  children,
  style,
  ...props
}: CardProps) {
  const rootStyle: CSSProperties = {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-card)',
    boxShadow: 'var(--shadow-card)',
    color: 'var(--text)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'background-color var(--dur-theme) ease, border-color var(--dur-theme) ease',
    ...style,
  }

  return (
    <div style={rootStyle} {...props}>
      {(title || subtitle || action) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            {title && (
              <h3 style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
            )}
            {subtitle && (
              <p style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{subtitle}</p>
            )}
          </div>
          {action && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>{action}</div>}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, padding: PADDING[padding] }}>{children}</div>

      {footer && (
        <div
          style={{
            padding: '14px 20px',
            background: 'var(--card2)',
            borderTop: '1px solid var(--border)',
            borderBottomLeftRadius: 'var(--r-card)',
            borderBottomRightRadius: 'var(--r-card)',
          }}
        >
          {footer}
        </div>
      )}
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

export function KpiCard({ label, value, subtext, trend, icon, onClick }: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        boxShadow: 'var(--shadow-card)',
        padding: 'var(--sp-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-sm)',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'background-color var(--dur-theme) ease, border-color var(--dur-theme) ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted)' }}>
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}
        </span>
        {icon && <span style={{ color: 'var(--muted)' }}>{icon}</span>}
      </div>

      <div style={{ fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
        {value}
      </div>

      {(subtext || trend) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
          {trend && (
            <span style={{ fontWeight: 700, color: trend.isPositive ? 'var(--st-in-fg)' : 'var(--st-progress-fg)' }}>
              {trend.value}
            </span>
          )}
          {subtext && <span style={{ color: 'var(--muted)' }}>{subtext}</span>}
        </div>
      )}
    </div>
  )
}
