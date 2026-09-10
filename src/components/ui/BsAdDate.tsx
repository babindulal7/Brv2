import React from 'react'
import { toBs, formatBs, formatAd } from '../../lib/bs'

export interface BsAdDateProps {
  date: Date | string | number | null | undefined
  layout?: 'stacked' | 'inline' | 'bs-only' | 'ad-only'
  showTime?: boolean
  className?: string
}

export const BsAdDate: React.FC<BsAdDateProps> = ({
  date,
  layout = 'stacked',
  showTime = false,
  className = '',
}) => {
  if (!date) {
    return <span style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 'var(--t-ui)' }}>—</span>
  }

  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  if (isNaN(d.getTime())) {
    return <span style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 'var(--t-ui)' }}>—</span>
  }

  const bs = toBs(d)
  const bsFormatted = bs ? formatBs(bs) : null
  const adFormatted = formatAd(d)

  /*
   * ⛔ WHEN THERE IS NO BS DATE, SAY SO. Do not silently substitute the AD one.
   *
   * `toBs` returns null for any date outside the single month `lib/bs.ts` can
   * vouch for (Shrawan 2083 — 16 Jul to 16 Aug 2026). From 17 Aug 2026 that is
   * EVERY date; see PLAN.md §4.34.
   *
   * Every branch below used to read `bsFormatted || adFormatted`, which put the
   * Gregorian date into the BS slot with nothing marking it — including in
   * `bs-only`, where the caller has explicitly asked for Bikram Sambat and a
   * Nepali reader has every reason to read what appears there AS Bikram Sambat.
   * "17 Aug 2026" presented as the BS answer is not a degraded answer, it is a
   * wrong one, and it was the only place this codebase lied about a date rather
   * than refusing.
   *
   * `bs.ts:46-49` already chose the honest posture — *"an honest gap beats a
   * wrong date"* — and returns null precisely so callers can degrade truthfully.
   * This component was throwing that away. It now labels the fallback `AD`, so
   * the figure stays useful and cannot be mistaken for the other calendar.
   *
   * Marked by TEXT, never by colour alone (Law 11), and carrying a `title` so
   * the reason is one hover away rather than a mystery.
   */
  const UNAVAILABLE =
    'Bikram Sambat is unavailable for this date — the calendar table covers Shrawan 2083 only (PLAN.md §4.34). Showing AD.'
  const primary = bsFormatted ?? `${adFormatted} AD`
  const primaryTitle = bsFormatted ? undefined : UNAVAILABLE

  const timeFormatted = showTime
    ? d.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kathmandu',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null

  if (layout === 'bs-only') {
    return (
      <span className={className || undefined} style={{ color: 'var(--text)', fontSize: 'var(--t-ui)', fontWeight: 500 }} title={primaryTitle}>
        {primary} {timeFormatted && <span style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)', marginLeft: 4 }}>({timeFormatted})</span>}
      </span>
    )
  }

  if (layout === 'ad-only') {
    return (
      <span className={className || undefined} style={{ color: 'var(--text)', fontSize: 'var(--t-ui)', fontWeight: 500 }}>
        {adFormatted} {timeFormatted && <span style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)', marginLeft: 4 }}>({timeFormatted})</span>}
      </span>
    )
  }

  if (layout === 'inline') {
    return (
      <span className={className || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-ui)' }}>
        <span style={{ fontWeight: 500, color: 'var(--text)' }} title={primaryTitle}>
          {primary}
        </span>
        {/* No parenthetical when BS is unavailable — the primary IS the AD date,
            and repeating it would read as two different dates. */}
        {bsFormatted && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>({adFormatted})</span>}
        {timeFormatted && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontFamily: 'monospace' }}>{timeFormatted}</span>}
      </span>
    )
  }

  // Default stacked layout
  return (
    <div className={className || undefined} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
      <span style={{ fontSize: 'var(--t-ui)', fontWeight: 500, color: 'var(--text)' }} title={primaryTitle}>
        {primary}
      </span>
      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        {/* The second line carries the AD date only when the first carries BS.
            When BS is unavailable the first line already IS the AD date, so this
            line states WHY rather than repeating it. */}
        {bsFormatted ? adFormatted : 'BS unavailable'}
        {timeFormatted ? ` · ${timeFormatted}` : ''}
      </span>
    </div>
  )
}
