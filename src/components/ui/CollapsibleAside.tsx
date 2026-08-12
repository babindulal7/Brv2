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
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          width: 32,
          // Sticky for the same reason the expanded panel is (see below): the
          // handle that reopens the rail has to still be on screen when someone
          // has scrolled down far enough to want it back.
          position: 'sticky',
          top: 'calc(var(--header-h) + var(--sp-md))',
          alignSelf: 'flex-start',
        }}
      >
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

  /**
   * Sticky, with its own contained scroll.
   *
   * This was `position: relative`, so both rails scrolled away with the page —
   * on a long booking the Quick Actions card and its Receive Payment button
   * ended up above the viewport exactly when someone scrolled down to the
   * payment history to use them.
   *
   * `overscroll-behavior: contain` is the half that makes it behave: reaching
   * the end of this panel does NOT start scrolling the page behind it. Hover
   * the panel, the panel scrolls; hover the list, the list scrolls.
   *
   * ## Why the scroll is on an INNER box
   *
   * The collapse handle sits at `right: -12` — deliberately outside this
   * element's box, straddling the border. `overflow-y: auto` on the same
   * element would compute `overflow-x` to `auto` as well (CSS overflow §3: a
   * `visible` axis becomes `auto` when the other is not visible), and the handle
   * would be clipped at the edge it hangs over. So the sticky box keeps
   * `overflow: visible` and holds the handle, and a child owns the scroll.
   */
  return (
    <div
      style={{
        position: 'sticky',
        top: 'calc(var(--header-h) + var(--sp-md))',
        alignSelf: 'flex-start',
        minWidth: 0,
        width,
      }}
    >
      <button type="button" onClick={toggle} aria-label={`Collapse ${label}`} title={`Collapse ${label}`} style={handleStyle}>
        <Icon name={collapseIcon} size={12} />
      </button>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-md)',
          minWidth: 0,
          maxHeight: 'calc(100vh - var(--header-h) - var(--sp-md) * 2)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {children}
      </div>
    </div>
  )
}
