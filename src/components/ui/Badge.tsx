import React from 'react'
import {
  IconFileText,
  IconCheck,
  IconPackage,
  IconArrowUpRight,
  IconArrowDownLeft,
  IconLock,
  IconAlertTriangle,
  IconAlertOctagon,
  IconClock,
  IconStar,
  IconBan,
  IconExternalLink,
  IconCoin,
} from '@tabler/icons-react'
import type { BookingStatus, Flag } from '../../lib/workflow'
import { BOOKING_STATUS, FLAGS } from '../../lib/workflow'

export interface BadgeProps {
  status?: BookingStatus
  flag?: Flag
  label?: string
  tone?: 'neutral' | 'primary' | 'progress' | 'out' | 'in' | 'danger' | 'ext' | 'warning'
  icon?: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export const Badge: React.FC<BadgeProps> = ({
  status,
  flag,
  label,
  tone,
  icon,
  size = 'md',
  className = '',
}) => {
  // Resolve tone, label, icon from status / flag if provided
  let effectiveLabel = label || ''
  let effectiveTone = tone || 'neutral'
  let effectiveIcon = icon

  if (status && BOOKING_STATUS[status]) {
    const meta = BOOKING_STATUS[status]
    effectiveLabel = status
    effectiveTone = meta.token as any

    switch (status) {
      case 'Quote':
        effectiveIcon = effectiveIcon || <IconFileText className="w-3.5 h-3.5" />
        break
      case 'Booked':
        effectiveIcon = effectiveIcon || <IconCheck className="w-3.5 h-3.5" />
        break
      case 'Packed':
        effectiveIcon = effectiveIcon || <IconPackage className="w-3.5 h-3.5" />
        break
      case 'On Rent':
        effectiveIcon = effectiveIcon || <IconArrowUpRight className="w-3.5 h-3.5" />
        break
      case 'Returned':
        effectiveIcon = effectiveIcon || <IconArrowDownLeft className="w-3.5 h-3.5" />
        break
      case 'Closed':
        effectiveIcon = effectiveIcon || <IconLock className="w-3.5 h-3.5" />
        break
    }
  } else if (flag && FLAGS[flag]) {
    const meta = FLAGS[flag]
    effectiveLabel = flag
    effectiveTone = meta.token as any

    switch (flag) {
      case 'Due Soon':
        effectiveIcon = effectiveIcon || <IconClock className="w-3.5 h-3.5" />
        break
      case 'Overdue':
      case 'Missing':
      case 'Damaged':
      case 'Cancelled':
        effectiveIcon = effectiveIcon || <IconAlertOctagon className="w-3.5 h-3.5" />
        break
      case 'Deposit Pending':
      case 'Payment Due':
        effectiveIcon = effectiveIcon || <IconCoin className="w-3.5 h-3.5" />
        break
      case 'VIP':
        effectiveIcon = effectiveIcon || <IconStar className="w-3.5 h-3.5" />
        break
      case 'Blocked':
        effectiveIcon = effectiveIcon || <IconBan className="w-3.5 h-3.5" />
        break
      case 'Sub-Rented':
        effectiveIcon = effectiveIcon || <IconExternalLink className="w-3.5 h-3.5" />
        break
      default:
        effectiveIcon = effectiveIcon || <IconAlertTriangle className="w-3.5 h-3.5" />
    }
  }

  // Tone styling
  const toneClasses = {
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
    primary: 'bg-blue-950/80 text-blue-300 border-blue-800',
    progress: 'bg-amber-950/70 text-amber-300 border-amber-800',
    out: 'bg-emerald-600 text-white border-emerald-500 font-semibold', // Solid emerald
    in: 'bg-emerald-950/80 text-emerald-300 border-emerald-800', // Soft emerald
    danger: 'bg-red-950/80 text-red-300 border-red-800 font-semibold',
    warning: 'bg-amber-950/80 text-amber-300 border-amber-800',
    ext: 'bg-transparent text-amber-400 border-amber-500 border-dashed', // Gold outline
  }[effectiveTone] || 'bg-slate-800 text-slate-300 border-slate-700'

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px] gap-1' : 'px-2.5 py-1 text-xs gap-1.5'

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border shrink-0 select-none ${toneClasses} ${sizeClasses} ${className}`}
    >
      {/* Law 11: Never colour alone — icon always visible */}
      {effectiveIcon && <span className="inline-flex shrink-0">{effectiveIcon}</span>}
      <span>{effectiveLabel}</span>
    </span>
  )
}
