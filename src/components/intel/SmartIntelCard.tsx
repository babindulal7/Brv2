/**
 * Smart Intel Cards v1 — unified entry point (spec §1).
 *
 * ONE shared architecture: the shell is always `IntelCard`; this component
 * only binds the entity/context/mode contract to already-gated glance/detail
 * payloads built by `src/data/*Intel.ts`. It introduces no page-specific
 * card fork — context changes emphasis and the primary action, never the
 * component (spec §47).
 */

import type { ReactNode } from 'react'
import { IntelCard } from '../ui/IntelCard'
import type { IntelGlance, IntelGroup } from '../ui/IntelCard'
import type { IntelContext, IntelEntityType, IntelMode } from '../../lib/intel/context'

export interface SmartIntelCardProps {
  entityType: IntelEntityType
  context: IntelContext
  mode?: IntelMode
  glance: IntelGlance
  detail: IntelGroup[]
  detailTitle: string
  detailSubtitle?: string
  children: ReactNode
  className?: string
}

export function SmartIntelCard({
  entityType,
  context,
  mode,
  glance,
  detail,
  detailTitle,
  detailSubtitle,
  children,
  className,
}: SmartIntelCardProps) {
  void mode
  return (
    <IntelCard
      glance={glance}
      detail={mode === 'glance' ? [] : detail}
      detailTitle={detailTitle}
      {...(detailSubtitle !== undefined ? { detailSubtitle } : {})}
      {...(className !== undefined ? { className } : {})}
      context={context}
      entityType={entityType}
    >
      {children}
    </IntelCard>
  )
}
