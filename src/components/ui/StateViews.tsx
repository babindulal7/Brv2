import type { ReactNode } from 'react'
import Icon from './Icon'
import { Button, cardStyle } from './Page'

/**
 * **The five page states — `System States & Patterns v2.0` §2, still Build
 * Locked even where the rest of that document's predecessor was overridden
 * by the renders (`Page Standard.md`'s own superseded-notice: "the five
 * page-state requirement... is content law, not layout law, and the renders
 * do not contradict them").** `DEVICE/DEVICES.md` §7 build order item 5 asks
 * every page type to carry all five; this file is the shared toolkit.
 *
 * These four were previously written in Tailwind utility classNames
 * (`bg-slate-900`, `text-slate-400`, …) — dead code, since Tailwind's Vite
 * plugin is registered but no CSS file ever imports `tailwindcss`, so every
 * class here compiled to nothing. `EmptyState` alone has 32 call sites across
 * the app that have been rendering **completely unstyled** as a result — this
 * rewrite uses the same inline-style-plus-CSS-variable system every other
 * component in the app uses, with the exact same prop shapes so no call site
 * changes. A fifth state, Offline, already has a real, working implementation
 * in `App.tsx` (`useNetwork()`-driven) — this file no longer duplicates it.
 */

/** §2.2 Empty — "illustration · title · one-sentence explanation · one primary action." */
export interface EmptyStateProps {
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  icon?: ReactNode
  className?: string
}

export function EmptyState({
  title = 'No items found',
  description = 'There are no records matching your current filter criteria.',
  actionLabel,
  onAction,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px 20px',
        borderRadius: 'var(--r-card)',
        border: '1px dashed var(--border)',
        background: 'var(--card2)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
          display: 'grid',
          placeItems: 'center',
          marginBottom: 14,
        }}
      >
        {icon ?? <Icon name="folder" size={22} />}
      </div>
      <h3 style={{ margin: '0 0 4px', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      <p style={{ margin: '0 0 16px', maxWidth: 340, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

/** §2.1 Loading — "skeleton with text… never a bare spinner, never a blank container." */
export function LoadingSkeleton({
  rows = 4,
  type = 'table',
  label,
}: {
  rows?: number
  type?: 'card' | 'table' | 'kpi'
  /** The "Loading rentals…" text §2.1 requires — omit only where the skeleton sits right under a heading that already says what's loading. */
  label?: string
}) {
  const pulse = { background: 'var(--card2)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' } as const
  const labelEl = label && (
    <p style={{ margin: '0 0 10px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{label}</p>
  )

  if (type === 'kpi') {
    return (
      <div>
        {labelEl}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ ...cardStyle, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ ...pulse, width: 80, height: 12 }} />
              <div style={{ ...pulse, width: 120, height: 22 }} />
              <div style={{ ...pulse, width: 64, height: 10 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'card') {
    return (
      <div>
        {labelEl}
        <div style={{ ...cardStyle, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...pulse, width: '33%', height: 18 }} />
          <div style={{ ...pulse, width: '100%', height: 90 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ ...pulse, width: 90, height: 30 }} />
            <div style={{ ...pulse, width: 90, height: 30 }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {labelEl}
    <div style={{ ...cardStyle, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ ...pulse, width: 110, height: 14 }} />
        <div style={{ ...pulse, width: 64, height: 14 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14 }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ ...pulse, width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ ...pulse, width: '50%', height: 13 }} />
              <div style={{ ...pulse, width: '25%', height: 10 }} />
            </div>
            <div style={{ ...pulse, width: 60, height: 18 }} />
          </div>
        ))}
      </div>
    </div>
    </div>
  )
}

/**
 * §2.4 Error — "every error: what happened · why · how to fix. Errors are
 * inline and persistent (toasts carry successes only)."
 */
export function ErrorBanner({
  title = 'Something needs attention',
  message,
  onRetry,
  className,
}: {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        padding: '13px 14px',
        borderRadius: 'var(--r-card)',
        background: 'var(--st-danger-bg)',
        border: '1px solid var(--st-danger-bg)',
        color: 'var(--st-danger-fg)',
      }}
    >
      <Icon name="alert_triangle" size={16} fill style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700 }}>{title}</div>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" icon="refresh" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

/** Permission — §2.5: "state it plainly and name who to ask. Never expose what the role cannot have." */
export function RestrictedState({
  reason = 'You do not have permission to view or modify this surface.',
  requiredRole,
  className,
}: {
  reason?: string
  requiredRole?: string
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px 20px',
        borderRadius: 'var(--r-card)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: 'var(--st-progress-bg)',
          color: 'var(--st-progress-fg)',
          display: 'grid',
          placeItems: 'center',
          marginBottom: 14,
        }}
      >
        <Icon name="lock" size={20} />
      </div>
      <h3 style={{ margin: '0 0 4px', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
        Access restricted
      </h3>
      <p style={{ margin: 0, maxWidth: 340, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
        {reason}
      </p>
      {requiredRole && (
        <span
          className="figure"
          style={{
            marginTop: 10,
            display: 'inline-flex',
            alignItems: 'center',
            height: 22,
            padding: '0 9px',
            borderRadius: 999,
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            color: 'var(--text2)',
            fontSize: 'var(--t-th)',
            fontWeight: 600,
          }}
        >
          Requires {requiredRole}
        </span>
      )}
    </div>
  )
}
