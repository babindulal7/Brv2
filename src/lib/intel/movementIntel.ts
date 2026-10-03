import type { MovementRow } from '../queries/today'
import type { IntelGlance, IntelGroup } from '../../components/ui/IntelCard'
import { statusKeyOf, timeOf } from '../queries/today'

/** Dashboard Intel uses only facts already present in the movement query. */
export function movementGlance(row: MovementRow, side: 'outgoing' | 'incoming'): IntelGlance {
  const overdue = row.flags.includes('Overdue')
  const statusTone = overdue ? 'danger' : statusKeyOf(row)
  return {
    avatarLabel: row.monogram,
    avatarTone: row.avatarTone,
    title: row.bookingNo,
    statusDot: statusTone,
    subtitle: row.client,
    badges: [{ label: overdue ? `Overdue · ${row.status}` : row.status, tone: statusTone }],
    lines: [
      overdue ? row.statusNote ?? 'Return overdue' : `${side === 'outgoing' ? 'Pickup' : 'Return'} ${row.atDayAd} · ${timeOf(row)}`,
      `${row.itemCount} item${row.itemCount === 1 ? '' : 's'}`,
    ],
    primaryAction: { label: 'Open rental', to: `/rentals/${row.bookingNo}` },
  }
}

export function movementDetail(row: MovementRow): IntelGroup[] {
  return [
    { title: 'Schedule', fields: [
      { label: 'Client', value: row.client, trigger: { label: 'Open', to: `/clients/${row.clientId}` } },
      { label: 'Pickup', value: row.duration.split(' → ')[0] ?? '—' },
      { label: 'Return', value: row.due.replace(/^Due\s+/i, '') },
      { label: 'Items', value: String(row.itemCount) },
    ] },
  ]
}
