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
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'

/**
 * Rewritten from Tailwind utility classNames to the app's real inline-style +
 * CSS-variable system — see `Input.tsx`/`Toast.tsx` for the full explanation
 * of why every Tailwind class in this file used to compile to nothing. Same
 * prop API and icon library as before; only the styling mechanism changed.
 *
 * `effectiveTone` is widened to accept `'warning'` for manual `tone=` callers,
 * but the tone-resolution below maps it onto the real `'progress'` key —
 * `lib/status.ts`'s `StatusKey` has no `warning` member (§4.2's five-colour
 * law gives Yellow "deliberate double duty" as both Packed/in-progress and
 * Due Soon/warning), so this alias keeps that one law, not a sixth colour.
 */

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
        effectiveIcon = effectiveIcon || <IconFileText size={14} />
        break
      case 'Booked':
        effectiveIcon = effectiveIcon || <IconCheck size={14} />
        break
      case 'Packed':
        effectiveIcon = effectiveIcon || <IconPackage size={14} />
        break
      case 'On Rent':
        effectiveIcon = effectiveIcon || <IconArrowUpRight size={14} />
        break
      case 'Returned':
        effectiveIcon = effectiveIcon || <IconArrowDownLeft size={14} />
        break
      case 'Closed':
        effectiveIcon = effectiveIcon || <IconLock size={14} />
        break
    }
  } else if (flag && FLAGS[flag]) {
    const meta = FLAGS[flag]
    effectiveLabel = flag
    effectiveTone = meta.token as any

    switch (flag) {
      case 'Due Soon':
        effectiveIcon = effectiveIcon || <IconClock size={14} />
        break
      case 'Overdue':
      case 'Missing':
      case 'Damaged':
      case 'Cancelled':
        effectiveIcon = effectiveIcon || <IconAlertOctagon size={14} />
        break
      case 'Deposit Pending':
      case 'Payment Due':
        effectiveIcon = effectiveIcon || <IconCoin size={14} />
        break
      case 'VIP':
        effectiveIcon = effectiveIcon || <IconStar size={14} />
        break
      case 'Blocked':
        effectiveIcon = effectiveIcon || <IconBan size={14} />
        break
      case 'Sub-Rented':
        effectiveIcon = effectiveIcon || <IconExternalLink size={14} />
        break
      default:
        effectiveIcon = effectiveIcon || <IconAlertTriangle size={14} />
    }
  }

  // Tone styling — reads the same STATUS token pair every other status chip
  // in the app uses, so a Badge and (e.g.) BookingDetail's header pill render
  // identically for the same status instead of drifting.
  const statusKey: StatusKey = effectiveTone === 'warning' ? 'progress' : (effectiveTone as StatusKey)
  const tokens = STATUS[statusKey] ?? STATUS.neutral
  const isExt = statusKey === 'ext'

  return (
    <span
      className={className || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        userSelect: 'none',
        fontWeight: effectiveTone === 'out' || effectiveTone === 'danger' ? 700 : 500,
        borderRadius: 'var(--r-badge)',
        border: isExt ? `1px dashed ${tokens.border}` : '1px solid transparent',
        background: effectiveTone === 'out' ? tokens.fg : tokens.bg,
        color: effectiveTone === 'out' ? 'var(--on-brand)' : tokens.fg,
        gap: size === 'sm' ? 'var(--sp-xs)' : 6,
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        fontSize: size === 'sm' ? 11 : 'var(--t-meta)',
      }}
    >
      {/* Law 11: Never colour alone — icon always visible */}
      {effectiveIcon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{effectiveIcon}</span>}
      <span>{effectiveLabel}</span>
    </span>
  )
}
