import { useEffect, useState } from 'react'
import Icon from './Icon'

export interface DataAgeBadgeProps {
  /** Timestamp when data was fetched or cached (Date, ISO string, or ms epoch). */
  timestamp?: Date | string | number | null
  /** Offline status indicator. If undefined, reads navigator.onLine. */
  isOffline?: boolean
  /** Whether the data is considered stale. If omitted, derived when age > staleThresholdSeconds. */
  isStale?: boolean
  /** Age in seconds before data is styled as stale. Defaults to 300 (5 minutes). */
  staleThresholdSeconds?: number
  /** Optional refresh callback. Renders a 44×44px touch target refresh button. */
  onRefresh?: (() => void) | undefined
  /** Optional additional class or style. */
  style?: React.CSSProperties
  className?: string
}

function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return 'Just now'
  const minutes = Math.floor(ageSeconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * DataAgeBadge — Plan §Phase 9 Operational Read Staleness Indicator
 *
 * Implements:
 * - Law 11: Never colour alone — every status is icon + label + colour.
 * - Law 15: 44×44 touch targets for interactive refresh control.
 * - Clear distinction between fresh live data, cached data, and offline stale reads.
 */
export function DataAgeBadge({
  timestamp,
  isOffline,
  isStale: isStaleProp,
  staleThresholdSeconds = 300,
  onRefresh,
  style,
  className,
}: DataAgeBadgeProps) {
  const [, setTick] = useState(0)

  // Re-render once per 30 seconds to update relative age display
  useEffect(() => {
    if (!timestamp) return
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [timestamp])

  if (!timestamp) return null

  const parsedTime = typeof timestamp === 'number'
    ? timestamp
    : typeof timestamp === 'string'
      ? new Date(timestamp).getTime()
      : timestamp.getTime()

  if (isNaN(parsedTime)) return null

  const now = Date.now()
  const ageSeconds = Math.max(0, Math.floor((now - parsedTime) / 1000))
  const offline = isOffline ?? (typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const isStale = isStaleProp ?? (offline || ageSeconds >= staleThresholdSeconds)

  let labelText: string
  let iconName: 'timer' | 'refresh' | 'alert_triangle' | 'check'
  let bgVar: string
  let fgVar: string
  let borderVar: string

  if (offline) {
    labelText = `Offline · ${formatAge(ageSeconds)}`
    iconName = 'alert_triangle'
    bgVar = 'var(--warning-bg, #3a2c00)'
    fgVar = 'var(--warning-text, #ffc833)'
    borderVar = 'var(--warning-text, #ffc833)'
  } else if (isStale) {
    labelText = `Cached · ${formatAge(ageSeconds)}`
    iconName = 'timer'
    bgVar = 'var(--st-progress-bg, rgba(234, 179, 8, 0.15))'
    fgVar = 'var(--st-progress-fg, #eab308)'
    borderVar = 'var(--st-progress-fg, #eab308)'
  } else {
    labelText = `Live · ${formatAge(ageSeconds)}`
    iconName = 'check'
    bgVar = 'var(--st-in-bg, rgba(34, 197, 94, 0.15))'
    fgVar = 'var(--st-in-fg, #22c55e)'
    borderVar = 'var(--st-in-fg, #22c55e)'
  }

  return (
    <div
      role="status"
      aria-label={`Data status: ${labelText}`}
      data-testid="data-age-badge"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 'var(--r-badge, 4px)',
        fontSize: 'var(--t-micro, 11px)',
        fontWeight: 600,
        fontFamily: 'inherit',
        backgroundColor: bgVar,
        color: fgVar,
        border: `1px solid ${borderVar}`,
        letterSpacing: '0.02em',
        userSelect: 'none',
        ...style,
      }}
    >
      <Icon name={iconName} size={12} style={{ flexShrink: 0 }} />
      <span>{labelText}</span>

      {onRefresh && !offline && (
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh operational data"
          aria-label="Refresh operational data"
          data-testid="data-age-refresh-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            margin: '-4px -4px -4px 2px',
            minWidth: 44, // Law 15 44x44 minimum touch target
            minHeight: 44,
          }}
        >
          <Icon name="refresh" size={12} />
        </button>
      )}
    </div>
  )
}
