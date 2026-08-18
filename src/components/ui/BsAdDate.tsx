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
    return <span className="text-slate-500 font-mono text-sm">—</span>
  }

  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  if (isNaN(d.getTime())) {
    return <span className="text-slate-500 font-mono text-sm">—</span>
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
      <span className={`text-slate-200 text-sm font-medium ${className}`} title={primaryTitle}>
        {primary} {timeFormatted && <span className="text-slate-400 text-xs ml-1">({timeFormatted})</span>}
      </span>
    )
  }

  if (layout === 'ad-only') {
    return (
      <span className={`text-slate-200 text-sm font-medium ${className}`}>
        {adFormatted} {timeFormatted && <span className="text-slate-400 text-xs ml-1">({timeFormatted})</span>}
      </span>
    )
  }

  if (layout === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm ${className}`}>
        <span className="font-medium text-slate-200" title={primaryTitle}>
          {primary}
        </span>
        {/* No parenthetical when BS is unavailable — the primary IS the AD date,
            and repeating it would read as two different dates. */}
        {bsFormatted && <span className="text-xs text-slate-500">({adFormatted})</span>}
        {timeFormatted && <span className="text-xs text-slate-400 font-mono">{timeFormatted}</span>}
      </span>
    )
  }

  // Default stacked layout
  return (
    <div className={`flex flex-col leading-tight ${className}`}>
      <span className="text-sm font-medium text-slate-100" title={primaryTitle}>
        {primary}
      </span>
      <span className="text-xs text-slate-400">
        {/* The second line carries the AD date only when the first carries BS.
            When BS is unavailable the first line already IS the AD date, so this
            line states WHY rather than repeating it. */}
        {bsFormatted ? adFormatted : 'BS unavailable'}
        {timeFormatted ? ` · ${timeFormatted}` : ''}
      </span>
    </div>
  )
}
