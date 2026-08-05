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
      <span className={`text-slate-200 text-sm font-medium ${className}`}>
        {bsFormatted || adFormatted} {timeFormatted && <span className="text-slate-400 text-xs ml-1">({timeFormatted})</span>}
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
        <span className="font-medium text-slate-200">{bsFormatted || adFormatted}</span>
        {bsFormatted && <span className="text-xs text-slate-500">({adFormatted})</span>}
        {timeFormatted && <span className="text-xs text-slate-400 font-mono">{timeFormatted}</span>}
      </span>
    )
  }

  // Default stacked layout
  return (
    <div className={`flex flex-col leading-tight ${className}`}>
      <span className="text-sm font-medium text-slate-100">{bsFormatted || adFormatted}</span>
      <span className="text-xs text-slate-400">
        {bsFormatted ? adFormatted : ''}
        {timeFormatted ? ` · ${timeFormatted}` : ''}
      </span>
    </div>
  )
}
