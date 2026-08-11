import type { ReactNode, CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './Icon'
import type { IconName } from './Icon'
import { useCollapsed } from '../../lib/collapse'
import { useViewport } from '../../lib/device'

/**
 * A page-side panel that remembers its own open/closed state per route
 * (localStorage, keyed by `id` or the current pathname). `Rail` (right) and
 * `SideRail` (left) in `Page.tsx` are the two callers — this is where the
 * collapse mechanics live once, so both sides behave identically everywhere
 * they appear.
 */
export function CollapsibleAside({
  children,
  id,
  side,
  width = 288,
  label = 'Panel',
}: {
  children: ReactNode
  id?: string
  side: 'left' | 'right'
  width?: number
  label?: string
}) {
  const location = useLocation()
  const viewport = useViewport()
  const key = `${side}:${id ?? location.pathname}`
  // Phone *and* tablet width have no room for a 210–300px rail sitting beside
  // `minmax(0,1fr)` content — it squeezes the content column to nothing. This
  // product's actual target device is the 768–1179px warehouse tablet (see
  // device.ts's docstring), so the collapse-by-default has to cover that band
  // too, not just phone. Default collapsed on both; `useCollapsed` still lets
  // an explicit user toggle override it.
  const [collapsed, toggle] = useCollapsed(key, viewport === 'phone' || viewport === 'tablet')
  const collapseIcon: IconName = side === 'right' ? 'chevron_right' : 'chevron_left'
  const expandIcon: IconName = side === 'right' ? 'chevron_left' : 'chevron_right'

  if (collapsed) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', width: 32 }}>
        <button
          type="button"
          onClick={toggle}
          aria-label={`Expand ${label}`}
          title={`Expand ${label}`}
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text2)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Icon name={expandIcon} size={14} />
        </button>
      </div>
    )
  }

  const handleStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--text2)',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    zIndex: 2,
    boxShadow: 'var(--shadow-card)',
    ...(side === 'right' ? { left: -12 } : { right: -12 }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0, width, position: 'relative' }}>
      <button type="button" onClick={toggle} aria-label={`Collapse ${label}`} title={`Collapse ${label}`} style={handleStyle}>
        <Icon name={collapseIcon} size={12} />
      </button>
      {children}
    </div>
  )
}
