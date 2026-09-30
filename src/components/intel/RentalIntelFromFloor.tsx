import type { ReactNode } from 'react'
import { IntelCard, type IntelGlance, type IntelGroup } from '../ui/IntelCard'
import type { FloorBooking } from '../../lib/queries/bookings'
import type { IntelContext } from '../../lib/intel/context'
import type { SystemRole } from '../../types/database'
import { gateContext } from '../../lib/fieldGating'
import { formatAdDateTime } from '../../lib/bs'

/** Identifier adapter for floor workspaces. It carries only facts returned by
 * the floor read; the tabbed body fetches its own role-filtered data on Peek. */
export function RentalIntelFromFloor({ floor, context, role, children }: {
  floor: FloorBooking
  context: Extract<IntelContext, 'packing' | 'handover' | 'return' | 'inspection'>
  role: SystemRole
  children: ReactNode
}) {
  const glance: IntelGlance = {
    avatarLabel: 'BK',
    avatarIcon: 'calendar',
    title: floor.bookingNo,
    subtitle: `${floor.stage}${floor.clientName ? ` · ${floor.clientName}` : ''}`,
    lines: [
      floor.pickupAtAd ? `Pickup ${formatAdDateTime(floor.pickupAtAd)}` : 'Pickup not scheduled',
      floor.returnAtAd ? `Return ${formatAdDateTime(floor.returnAtAd)}` : 'Return not scheduled',
      `${floor.lines.length} line${floor.lines.length === 1 ? '' : 's'}${floor.linesPresence === 'absent' ? ' · line read unavailable' : ''}`,
    ],
    primaryAction: { label: 'Open booking', to: `/rentals/${encodeURIComponent(floor.bookingNo)}` },
  }
  const detail: IntelGroup[] = [{ title: 'Booking', fields: [
    { label: 'Booking', value: floor.bookingNo },
    { label: 'Client', value: floor.clientName ?? 'Not joined' },
    { label: 'Stage', value: floor.stage },
    { label: 'Pickup', value: floor.pickupAtAd ? formatAdDateTime(floor.pickupAtAd) : 'Not scheduled' },
    { label: 'Return', value: floor.returnAtAd ? formatAdDateTime(floor.returnAtAd) : 'Not scheduled' },
  ] }]
  return <IntelCard glance={glance} detail={detail} detailTitle={floor.bookingNo} {...(floor.clientName ? { detailSubtitle: floor.clientName } : {})} entityType="rental" entityId={floor.id} context={context} gateContext={gateContext(role, { surface: 'floor' })}>{children}</IntelCard>
}
