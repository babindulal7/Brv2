/**
 * Smart Intel Cards v1 — shared trigger wrapper (spec §§3, 42).
 *
 * Intel attaches only to identifiers (name, SKU, serial, QR, client, rental,
 * document numbers) — never to statistics. This wrapper marks the identifier
 * affordance (underline on hover/focus) without owning any card behaviour;
 * the card shell (`IntelCard`) owns timing, session, and dismissal.
 */

import type { ReactNode } from 'react'
import type { IntelContext, IntelEntityType } from '../../lib/intel/context'

export interface IntelTriggerProps {
  entityType: IntelEntityType
  entityId: string
  context: IntelContext
  children: ReactNode
  className?: string
}

export function IntelTrigger({ entityId, children, className }: IntelTriggerProps) {
  return (
    <span
      className={className}
      data-intel-trigger={entityId}
      style={{ textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
    >
      {children}
    </span>
  )
}
