import type { ReactNode } from 'react'
import type { IconName } from './Icon'
import { PageHeader } from './Page'

export interface ScreenHeaderProps {
  embedded?: boolean | undefined
  leading?: ReactNode | undefined
  icon?: IconName | undefined
  title: string
  description?: string | undefined
  actions?: ReactNode | undefined
}

/**
 * Universal embedded-page header contract.
 *
 * When `embedded` is true (e.g. inside tabbed interfaces like Clients, Inventory,
 * Finance, or Tools):
 * - Suppresses duplicate <h1> and outer page-title block
 * - Retains contextual description as a clean subtitle row
 * - Preserves primary and secondary actions without competing with the parent page header
 *
 * When `embedded` is false:
 * - Renders the standard full PageHeader.
 */
export function ScreenHeader({
  embedded = false,
  leading,
  icon,
  title,
  description,
  actions,
}: ScreenHeaderProps) {
  if (!embedded) {
    return (
      <PageHeader
        title={title}
        {...(leading ? { leading } : {})}
        {...(icon ? { icon } : {})}
        {...(description ? { description } : {})}
        {...(actions ? { actions } : {})}
      />
    )
  }

  // When embedded and having no subtitle or actions, suppress empty row
  if (!description && !actions && !leading) return null

  return (
    <div
      className="screen-header-embedded"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--sp-md)',
        flexWrap: 'wrap',
        marginBottom: 'var(--sp-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0, flex: '1 1 260px' }}>
        {leading}
        {description ? (
          <p style={{ margin: 0, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
            {description}
          </p>
        ) : (
          <span />
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap', marginLeft: 'auto', alignSelf: 'flex-start', flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  )
}

export default ScreenHeader
