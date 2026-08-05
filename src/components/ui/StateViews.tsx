import React from 'react'
import {
  IconFolderOff,
  IconAlertTriangle,
  IconLock,
  IconWifiOff,
  IconRefresh,
} from '@tabler/icons-react'
import { Button } from './Button'

/**
 * 1. Empty State
 * Displays when a filter or collection returns 0 results.
 */
export interface EmptyStateProps {
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  icon?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No items found',
  description = 'There are no records matching your current filter criteria.',
  actionLabel,
  onAction,
  icon,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 my-4 ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 mb-3.5">
        {icon || <IconFolderOff className="w-6 h-6 stroke-[1.5]" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1">{title}</h3>
      <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

/**
 * 2. Loading Skeleton
 * Structured skeleton blocks for panels, tables, and KPI cards.
 */
export const LoadingSkeleton: React.FC<{ rows?: number; type?: 'card' | 'table' | 'kpi' }> = ({
  rows = 4,
  type = 'table',
}) => {
  if (type === 'kpi') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 animate-pulse flex flex-col gap-2.5"
          >
            <div className="w-20 h-3 bg-slate-800 rounded" />
            <div className="w-32 h-6 bg-slate-700 rounded" />
            <div className="w-16 h-2.5 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (type === 'card') {
    return (
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 animate-pulse flex flex-col gap-4 my-3">
        <div className="w-1/3 h-5 bg-slate-800 rounded" />
        <div className="w-full h-24 bg-slate-800/60 rounded" />
        <div className="flex gap-2">
          <div className="w-24 h-8 bg-slate-800 rounded" />
          <div className="w-24 h-8 bg-slate-800 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden my-3">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center animate-pulse">
        <div className="w-28 h-4 bg-slate-800 rounded" />
        <div className="w-16 h-4 bg-slate-800 rounded" />
      </div>
      <div className="p-4 flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex items-center gap-4 animate-pulse">
            <div className="w-8 h-8 bg-slate-800 rounded-md shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="w-1/2 h-3.5 bg-slate-700 rounded" />
              <div className="w-1/4 h-2.5 bg-slate-800 rounded" />
            </div>
            <div className="w-16 h-5 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 3. Error Banner (Law 12: Errors are inline and persistent; toasts carry successes only).
 */
export interface ErrorBannerProps {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  title = 'Operation Error',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3.5 p-4 rounded-xl border border-rose-800/80 bg-rose-950/40 text-rose-200 my-3 ${className}`}
    >
      <IconAlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-300 mb-0.5">
          {title}
        </h4>
        <p className="text-xs text-rose-200/90 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 text-xs font-medium transition-colors cursor-pointer shrink-0"
        >
          <IconRefresh className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * 4. Restricted State (Law 6 & RBAC capability gate).
 */
export interface RestrictedStateProps {
  reason?: string
  requiredRole?: string
  className?: string
}

export const RestrictedState: React.FC<RestrictedStateProps> = ({
  reason = 'You do not have administrative capability to view or modify this surface.',
  requiredRole,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-slate-800 bg-slate-950/60 my-4 ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 mb-3">
        <IconLock className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Access Restricted</h3>
      <p className="text-xs text-slate-400 max-w-sm mb-2 leading-relaxed">{reason}</p>
      {requiredRole && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300">
          Required role: {requiredRole}
        </span>
      )}
    </div>
  )
}

/**
 * 5. Offline Banner (Law 8 & Phase 9).
 */
export const OfflineBanner: React.FC<{ pendingCount?: number; lastSynced?: string }> = ({
  pendingCount = 0,
  lastSynced,
}) => {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-lg bg-amber-950/70 border border-amber-800/60 text-amber-200 text-xs mb-3">
      <div className="flex items-center gap-2">
        <IconWifiOff className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong>Offline Mode</strong> — working with local cached data.
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-amber-300/80">
        {pendingCount > 0 && <span>{pendingCount} pending writes queued</span>}
        {lastSynced && <span>Last sync: {lastSynced}</span>}
      </div>
    </div>
  )
}
