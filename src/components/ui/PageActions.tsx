import type { CSSProperties, ReactNode } from 'react'
import { OverflowMenu, type OverflowMenuItem } from './OverflowMenu'

export interface PageActionsProps {
  /** Maximum one filled primary action in a visible action area */
  primary?: ReactNode
  /** Normal alternate actions (secondary buttons, export, import) */
  secondary?: ReactNode[] | ReactNode
  /** Overflow menu items or custom overflow menu node */
  overflow?: OverflowMenuItem[] | ReactNode
  /** Additional items (badges, share buttons, info pills) */
  extra?: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Standardized PageHeader action container enforcing the global consistency rule:
 * - At most ONE filled primary action in any visible action area.
 * - Secondary actions grouped cleanly beside it.
 * - Overflow menu for lower priority actions.
 */
export function PageActions({
  primary,
  secondary,
  overflow,
  extra,
  className = '',
  style,
}: PageActionsProps) {
  const isOverflowArray = Array.isArray(overflow)

  return (
    <div
      className={`page-actions ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-sm)',
        flexWrap: 'wrap',
        ...style,
      }}
    >
      {extra}
      {Array.isArray(secondary) ? (
        secondary.map((action, idx) => (
          <span key={idx} style={{ display: 'inline-flex' }}>
            {action}
          </span>
        ))
      ) : (
        secondary
      )}
      {overflow && (
        isOverflowArray ? (
          <OverflowMenu items={overflow as OverflowMenuItem[]} />
        ) : (
          overflow
        )
      )}
      {primary}
    </div>
  )
}

export default PageActions
