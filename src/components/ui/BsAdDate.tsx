import React from 'react'
import { toBs, formatBs } from '../../lib/bs'

export interface BsAdDateProps {
  date: Date | string | number | null | undefined
  layout?: 'stacked' | 'inline' | 'bs-only' | 'ad-only'
  showTime?: boolean
  className?: string
  /** Booking schedule dates share the theme's orange in every layout. */
  tone?: 'default' | 'booking'
}

export const BsAdDate: React.FC<BsAdDateProps> = ({
  date,
  layout = 'stacked',
  showTime = false,
  className = '',
  tone = 'default',
}) => {
  if (!date) {
    return <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--t-ui)' }}>—</span>
  }

  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  if (isNaN(d.getTime())) {
    return <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--t-ui)' }}>—</span>
  }

  const bs = toBs(d)
  const bsFormatted = bs ? `${formatBs(bs)} ${bs.year}` : null
  const adFormatted = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', year: 'numeric' })

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
    'Bikram Sambat is unavailable for this date. Showing AD.'
  const primary = bsFormatted ?? `${adFormatted} AD`
  const primaryTitle = bsFormatted ? undefined : UNAVAILABLE
  const primaryColor = tone === 'booking' ? 'var(--booking-date-text)' : 'var(--text)'
  const secondaryColor = tone === 'booking' ? 'var(--booking-date-text)' : 'var(--text2)'

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
      <span className={className || undefined} style={{ color: primaryColor, fontSize: 'var(--t-ui)', fontWeight: 500 }} title={primaryTitle}>
        {primary} {timeFormatted && <span style={{ color: secondaryColor, fontSize: 'var(--t-meta)', marginLeft: 4 }}>({timeFormatted})</span>}
      </span>
    )
  }

  if (layout === 'ad-only') {
    return (
      <span className={className || undefined} style={{ color: primaryColor, fontSize: 'var(--t-ui)', fontWeight: 500 }}>
        {adFormatted} {timeFormatted && <span style={{ color: secondaryColor, fontSize: 'var(--t-meta)', marginLeft: 4 }}>({timeFormatted})</span>}
      </span>
    )
  }

  if (layout === 'inline') {
    return (
      <span className={className || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-ui)' }}>
        <span style={{ fontWeight: 500, color: primaryColor }} title={primaryTitle}>
          {primary}
        </span>
        {/* No parenthetical when BS is unavailable — the primary IS the AD date,
            and repeating it would read as two different dates. */}
        {bsFormatted && <span style={{ fontSize: 'var(--t-meta)', color: tone === 'booking' ? secondaryColor : 'var(--muted)' }}>({adFormatted})</span>}
        {timeFormatted && <span style={{ fontSize: 'var(--t-meta)', color: secondaryColor, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{timeFormatted}</span>}
      </span>
    )
  }

  // Default stacked layout
  return (
    <div className={className || undefined} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
      <span style={{ fontSize: 'var(--t-ui)', fontWeight: 500, color: primaryColor }} title={primaryTitle}>
        {primary}
      </span>
      <span style={{ fontSize: 'var(--t-meta)', color: secondaryColor }}>
        {/* The second line carries the AD date only when the first carries BS.
            When BS is unavailable the first line already IS the AD date, so this
            line states WHY rather than repeating it. */}
        {bsFormatted ? adFormatted : 'BS unavailable'}
        {timeFormatted ? ` · ${timeFormatted}` : ''}
      </span>
    </div>
  )
}
