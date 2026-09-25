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
  /**
   * The kind of empty state (System States & Patterns §2.2):
   * - `'nothing-yet'`: No records exist in the system yet (initial onboarding state).
   * - `'no-results'`: Records exist, but none match the current filter or search query.
   */
  kind?: 'nothing-yet' | 'no-results'
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  icon?: ReactNode
  className?: string
}

export function EmptyState({
  kind = 'no-results',
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className,
}: EmptyStateProps) {
  const defaultTitle = kind === 'nothing-yet' ? 'No records yet' : 'No items found'
  const defaultDescription =
    kind === 'nothing-yet'
      ? 'Get started by creating your first record.'
      : 'There are no records matching your current filter criteria.'
  const defaultIcon = kind === 'nothing-yet' ? <Icon name="plus" size={22} /> : <Icon name="search" size={22} />

  const finalTitle = title ?? defaultTitle
  const finalDescription = description ?? defaultDescription
  const finalIcon = icon ?? defaultIcon

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
          borderRadius: 'var(--r-badge)',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
          display: 'grid',
          placeItems: 'center',
          marginBottom: 14,
        }}
      >
        {finalIcon}
      </div>
      <h3 style={{ margin: '0 0 4px', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{finalTitle}</h3>
      <p style={{ margin: '0 0 16px', maxWidth: 340, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
        {finalDescription}
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
  const pulse = {
    background: 'linear-gradient(90deg, var(--card2) 0%, color-mix(in srgb, var(--surface) 65%, var(--card2)) 50%, var(--card2) 100%)',
    backgroundSize: '200% 100%',
    borderRadius: 'var(--r-xs)',
    animation: 'skeletonShimmer 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite',
  } as const
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
          <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', padding: 14 }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
            <div style={{ ...pulse, width: 32, height: 32, borderRadius: 'var(--r-sm)', flexShrink: 0 }} />
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
  /** A string for the common case; a richer node (e.g. a bulleted list of several reconciliation failures) is fine too. */
  message: ReactNode
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
        <div style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>{message}</div>
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
          borderRadius: 'var(--r-badge)',
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
            borderRadius: 'var(--r-badge)',
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
