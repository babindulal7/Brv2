import { useState, useEffect, type CSSProperties } from 'react'
import Icon from './Icon'

export interface DataAgeBadgeProps {
  /** The timestamp when data was fetched/loaded */
  loadedAt?: Date | number | string | null
  /** Threshold in ms after which data is considered stale. Default is 15 minutes (900,000 ms). */
  staleThresholdMs?: number
  /** Optional callback to trigger a re-fetch of the data */
  onRefresh?: () => void | Promise<void>
  /** Whether a background refresh is actively running */
  loading?: boolean
  /** Whether to compact layout for tight toolbars */
  compact?: boolean
  className?: string
  style?: CSSProperties
}

/** Formats difference in milliseconds to human-readable relative time */
export function formatRelativeAge(diffMs: number): string {
  if (diffMs < 45_000) return 'Just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(diffMs / 86_400_000)
  return `${days}d ago`
}

/**
 * DataAgeBadge — Phase 9 (PLAN.md §4.27)
 *
 * Displays operational read freshness and warns when viewing stale/cached data.
 * Adheres to:
 * - Law 11: Never color alone — always pairs semantic icon with explicit text label.
 * - Law 15: Interactive refresh trigger provides a 44×44 accessible touch area.
 * - Design system tokens from theme.css.
 */
export function DataAgeBadge({
  loadedAt,
  staleThresholdMs = 15 * 60 * 1000,
  onRefresh,
  loading = false,
  compact = false,
  className,
  style,
}: DataAgeBadgeProps) {
  const [, setTick] = useState(0)

  // Periodically refresh relative time display every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1)
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  const now = Date.now()

  if (!loadedAt) {
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '2px 6px' : '3px 8px',
          borderRadius: 'var(--r-xs, 4px)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: 'var(--font-mono, monospace)',
          ...style,
        }}
        title="No data has been loaded yet"
      >
        <Icon name="timer" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <span>No cache</span>
      </div>
    )
  }

  const loadedDate = typeof loadedAt === 'string' || typeof loadedAt === 'number' ? new Date(loadedAt) : loadedAt
  const loadedMs = loadedDate.getTime()
  const diffMs = Math.max(0, now - loadedMs)
  const isStale = diffMs >= staleThresholdMs
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
  const ageStr = formatRelativeAge(diffMs)

  const exactStamp = loadedDate.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const titleText = `${isOffline ? 'Offline cache' : isStale ? 'Stale data' : 'Fresh data'} (loaded at ${exactStamp})`

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: compact ? '2px 6px' : '3px 8px',
          borderRadius: 'var(--r-xs, 4px)',
          background: isOffline
            ? 'var(--surface-2)'
            : isStale
            ? 'var(--warn-soft, rgba(232, 118, 45, 0.12))'
            : 'var(--surface-2)',
          border: `1px solid ${isStale && !isOffline ? 'var(--warn-border, var(--border))' : 'var(--border)'}`,
          color: isOffline
            ? 'var(--muted)'
            : isStale
            ? 'var(--warn-text, #e8762d)'
            : 'var(--text2)',
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: 'var(--font-mono, monospace)',
          fontVariantNumeric: 'tabular-nums',
        }}
        title={titleText}
      >
        <Icon
          name={isOffline || isStale ? 'alert_triangle' : 'timer'}
          size={13}
          style={{
            color: isOffline ? 'var(--muted)' : isStale ? 'var(--warn-text, #e8762d)' : 'var(--muted)',
            flexShrink: 0,
          }}
        />
        <span>
          {isOffline ? `Offline · ${ageStr}` : isStale ? `Stale · ${ageStr}` : `Updated ${ageStr}`}
        </span>
      </div>

      {onRefresh && (
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          aria-label="Refresh data"
          title="Refresh data from server"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 44,
            minHeight: 44,
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: 'var(--text2)',
            cursor: loading ? 'not-allowed' : 'pointer',
            borderRadius: 'var(--r-xs, 4px)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 'var(--r-xs, 4px)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
            }}
          >
            <Icon
              name="refresh"
              size={13}
              style={{
                color: loading ? 'var(--muted)' : 'currentColor',
                animation: loading ? 'spin 1s linear infinite' : undefined,
              }}
            />
          </span>
        </button>
      )}
    </div>
  )
}

export default DataAgeBadge
