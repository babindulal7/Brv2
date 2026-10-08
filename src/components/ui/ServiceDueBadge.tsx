import React from 'react'
import { IconTool } from '@tabler/icons-react'
import { Badge } from './Badge'
import { serviceStatus, type ServiceRow } from '../../lib/serviceDue'

export interface ServiceDueBadgeProps {
  /** One row of `product_units_service_v`, or nothing known about this unit. */
  row: ServiceRow | undefined
  size?: 'sm' | 'md'
}

/**
 * `Service due` — RULING 2026-09-08 (R-28).
 *
 * ## It renders NOTHING when nothing is due
 *
 * Not an "OK" badge, not a grey dash. Most models have no preventive plan at
 * all, so most rows have nothing to say, and a column of green ticks is how the
 * eye learns to skip the one amber row. `serviceStatus` returns `null` for that
 * case and this returns `null` with it.
 *
 * ## Warns only
 *
 * This is a badge and never a gate. R-28: the unit **stays bookable**, nothing
 * moves it to Maintenance, nothing opens a work order. A caller that disables an
 * action because this rendered has misread the ruling — the Packing Queue shows
 * it *beside* an enabled Pack button on purpose.
 *
 * ## Never colour alone
 *
 * Wrench icon + words + tone, in that order of reliability. The words change
 * (`Service due` → `Overdue by 12 days`) before the colour does, so the state is
 * legible in greyscale, at a glance, and to a screen reader — CLAUDE.md's
 * "never colour alone", which is an accessibility rule first.
 *
 * The tooltip carries the reason and the counters (`— usage (42 of 40 rental
 * days)`), built by `lib/serviceDue.ts`; it is on `title` rather than a custom
 * popover so it survives on touch-less and on keyboard focus without this
 * component owning any interaction.
 */
export const ServiceDueBadge: React.FC<ServiceDueBadgeProps> = ({ row, size = 'sm' }) => {
  if (row === undefined) return null

  const status = serviceStatus(row)
  if (status === null) return null

  return (
    <span title={status.detail} style={{ display: 'inline-flex' }}>
      <Badge label={status.label} tone={status.tone} icon={<IconTool size={14} />} size={size} />
    </span>
  )
}
