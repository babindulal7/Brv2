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
  IconRefresh,
} from '@tabler/icons-react'
import type { BookingStatus, Flag } from '../../lib/workflow'
import { BOOKING_STATUS, FLAGS } from '../../lib/workflow'
import { STATUS, STATUS_BLOCK, EXT_MARK } from '../../lib/status'
import type { StatusKey } from '../../lib/status'

/**
 * The ONE place a status is painted — DESIGN_DIRECTION_SPEC_v4.1 §8 step 2:
 * "one component rendering the §4 map from lib/status; every screen inherits.
 * No screen colours a status itself."
 *
 * ## What v4.1 changed here
 *
 * **Every status is a SOLID block.** The pre-v4.1 build painted a 999-radius
 * pill at weight 500 and carried a special case — `background: tone === 'out'
 * ? tokens.fg : tokens.bg` — that inverted fg/bg for On Rent, because "solid
 * green" was faked by using the foreground token as a fill while every other
 * status used a soft wash. v4.1 makes the token pairs themselves solid, so
 * that inversion became actively wrong: it painted On Rent with `--on-warn`,
 * a near-black, as the background. Both the special case and the pill are
 * gone; the block now reads its pair straight and takes its geometry from
 * `STATUS_BLOCK`, so the anatomy lives in one place rather than in this file.
 *
 * `--r-badge` (999) is NOT used here. v4.1 §3.3 reserves it for numeric count
 * badges; status blocks are `--r-chip` (6).
 *
 * ## The gold mark is deliberately not a block
 *
 * Sub-Rented renders from `EXT_MARK`: weight 600, not uppercase, 1px solid
 * gold outline. §2 keeps it outline-only precisely so it can never be read as
 * a yellow status at a glance — which is also why the old `1px dashed` is now
 * solid, matching the spec's one outline on screen.
 *
 * ## `tone="warning"`
 *
 * Still accepted for manual callers and still resolves to `progress` (yellow).
 * v4.1 renamed the hue's *meaning* to "being worked in-house / waiting", which
 * is what a warning badge wants; the key itself stays `progress` per §7.5
 * ("recolours them, it does not rename them").
 */

/** `tone` without the optional `undefined` — what the resolver actually holds. */
type Tone = NonNullable<BadgeProps['tone']>

export interface BadgeProps {
  status?: BookingStatus
  flag?: Flag
  label?: string
  tone?: 'neutral' | 'primary' | 'progress' | 'out' | 'in' | 'danger' | 'dim' | 'ext' | 'warning'
  icon?: React.ReactNode
  size?: 'sm' | 'md'
  variant?: 'pill' | 'square' | 'flag'
  className?: string
}

export const Badge: React.FC<BadgeProps> = ({
  status,
  flag,
  label,
  tone,
  icon,
  size = 'md',
  variant = 'pill',
  className = '',
}) => {
  // Resolve tone, label, icon from status / flag if provided
  let effectiveLabel = label || ''
  let effectiveTone: Tone = tone || 'neutral'
  let effectiveIcon = icon

  if (status && BOOKING_STATUS[status]) {
    const meta = BOOKING_STATUS[status]
    effectiveLabel = status
    effectiveTone = meta.token as Tone

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
  } else if ((status as string) === 'Draft') {
    effectiveLabel = 'Draft'
    effectiveTone = 'neutral'
    effectiveIcon = effectiveIcon || <IconFileText size={14} />
  } else if ((status as string) === 'Reset' || label === 'Reset') {
    effectiveLabel = label || 'Reset'
    effectiveTone = 'progress'
    effectiveIcon = effectiveIcon || <IconRefresh size={14} />
  } else if ((status as string) === 'QC' || label === 'QC') {
    effectiveLabel = label || 'QC'
    effectiveTone = 'progress'
    effectiveIcon = effectiveIcon || <IconCheck size={14} />
  } else if (flag && FLAGS[flag]) {
    const meta = FLAGS[flag]
    effectiveLabel = flag
    effectiveTone = meta.token as Tone

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

  const statusKey: StatusKey = effectiveTone === 'warning' ? 'progress' : (effectiveTone as StatusKey)
  const tokens = STATUS[statusKey] ?? STATUS.neutral
  const isExt = statusKey === 'ext'

  /*
   * §4 block anatomy, straight from lib/status so a second component cannot
   * drift from it. `size="sm"` scales the block down for dense table cells
   * without changing what it IS — the weight, the casing and the tracking are
   * the identity of a status block and do not scale away.
   */
  const shape = isExt ? EXT_MARK : STATUS_BLOCK
  const compact = size === 'sm'
  const isLiveActive = status === 'On Rent' || flag === 'Overdue' || flag === 'Due Soon'

  // Variant-specific geometry
  const variantRadius = variant === 'pill' ? 'var(--r-badge)' : variant === 'square' ? 'var(--r-sm)' : 'var(--r-xs)'
  const variantPadding = variant === 'flag' ? '4px 8px' : compact ? '4px 8px' : shape.padding
  const variantGap = variant === 'flag' ? 'var(--sp-xs)' : compact ? 'var(--sp-xs)' : 6
  const variantFontWeight = variant === 'flag' ? 600 : shape.fontWeight
  const variantTextTransform = variant === 'flag' ? 'none' : (isExt ? 'none' : STATUS_BLOCK.textTransform)
  const variantLetterSpacing = variant === 'flag' ? '0.02em' : shape.letterSpacing
  const variantFontSize = compact ? '10.5px' : shape.fontSize

  return (
    <span
      className={className || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        userSelect: 'none',
        background: tokens.bg,
        color: tokens.fg,
        border: isExt ? `1px solid ${tokens.border}` : '1px solid transparent',
        borderRadius: isExt ? shape.borderRadius : variantRadius,
        fontWeight: variantFontWeight,
        letterSpacing: variantLetterSpacing,
        ...(isExt ? {} : { textTransform: variantTextTransform }),
        fontSize: variantFontSize,
        padding: variantPadding,
        gap: variantGap,
        lineHeight: 1.1,
      }}
    >
      {/* Perpetual live micro-indicator for active operations */}
      {isLiveActive && (
        <span
          className="status-live-dot"
          aria-hidden="true"
          style={{ width: compact ? 5 : 6, height: compact ? 5 : 6 }}
        />
      )}
      {/* §7.4 — never colour alone: the icon and the word both always render. */}
      {effectiveIcon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{effectiveIcon}</span>}
      <span>{effectiveLabel}</span>
    </span>
  )
}
