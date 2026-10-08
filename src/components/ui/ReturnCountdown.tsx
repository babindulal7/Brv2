import type { CSSProperties } from 'react'
import Icon from './Icon'
import { returnCountdown, useMinuteClock } from '../../lib/returnCountdown'

export interface ReturnCountdownProps {
  /** `bookings.return_at`. Render this only for a booking that is still out — see `lib/returnCountdown.ts`. */
  returnAtAd: string
  /**
   * `true` → "in 3h 20m" / "3h 20m late", for a line that already says "Due …".
   * `false` (default) → "Due in 3h 20m" / "Overdue by 3h 20m", standing alone.
   */
  short?: boolean
  style?: CSSProperties
}

// RULING 2026-10-08: display span only. "Overdue" counts from return_at, not from the end of the late-fee grace (RULINGS-2026-10-08, May briefs #2).
/**
 * The live distance to a rental's return time. Owns its own minute clock so a
 * large page (Booking Detail) is not re-rendered every minute to move one line.
 *
 * Law 11 — never colour alone: on time is a timer icon + text; past due is an
 * alert icon + the word "Overdue"/"late" + `--danger-text`, the token
 * `check-contrast.cjs` gates in both themes.
 */
export function ReturnCountdown({ returnAtAd, short = false, style }: ReturnCountdownProps) {
  const now = useMinuteClock()
  const c = returnCountdown(returnAtAd, now)
  if (!c) return null

  const text = c.overdue
    ? short ? `${c.span} late` : `Overdue by ${c.span}`
    : short ? `in ${c.span}` : `Due in ${c.span}`

  return (
    <span
      data-testid="return-countdown"
      data-overdue={c.overdue ? 'true' : 'false'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 'var(--t-meta)',
        fontWeight: c.overdue ? 700 : 600,
        color: c.overdue ? 'var(--danger-text)' : 'var(--text2)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <Icon name={c.overdue ? 'alert_triangle' : 'timer'} size={12} style={{ color: 'currentColor', flexShrink: 0 }} />
      <span className="figure">{text}</span>
    </span>
  )
}
