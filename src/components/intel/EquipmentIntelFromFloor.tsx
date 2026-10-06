import type { ReactNode } from 'react'
import { IntelCard, type IntelGlance, type IntelGroup } from '../ui/IntelCard'
import type { IntelContext } from '../../lib/intel/context'
import type { SystemRole } from '../../types/database'
import { gateContext } from '../../lib/fieldGating'

/** Only identifiers from the floor booking read reach this adapter. The
 * tabbed equipment body fetches its role-filtered detail when opened. */
export function EquipmentIntelFromFloor({ serial, name, location, context, role, children }: {
  serial: string
  name: string
  location: string | null
  context: Extract<IntelContext, 'packing' | 'handover' | 'return' | 'inspection'>
  role: SystemRole
  children: ReactNode
}) {
  const glance: IntelGlance = {
    avatarLabel: 'EQ',
    avatarIcon: 'package',
    title: name,
    subtitle: serial,
    ...(location ? { lines: [`Location ${location}`] } : {}),
    primaryAction: { label: 'Open equipment', to: `/inventory/${encodeURIComponent(serial)}` },
  }
  const detail: IntelGroup[] = [{ title: 'Identity', fields: [
    { label: 'Equipment', value: name },
    { label: 'Serial / tag', value: serial },
    ...(location ? [{ label: 'Location', value: location }] : []),
  ] }]

  return (
    <IntelCard
      glance={glance}
      detail={detail}
      detailTitle={name}
      detailSubtitle={serial}
      entityType="equipment"
      entityId={serial}
      context={context}
      gateContext={gateContext(role, { surface: 'floor' })}
    >
      <span data-intel-identifier>{children}</span>
    </IntelCard>
  )
}
