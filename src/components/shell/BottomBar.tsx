import { Link } from 'react-router-dom'
import Icon from '../ui/Icon'
import { SETTINGS_NAV, permittedNav } from '../../data/nav'
import { useAuth } from '../../lib/auth'

export const BOTTOM_BAR_HEIGHT = 58

/**
 * **Phone bottom bar — `DEVICE/DEVICES.md` §7 build order item 2.**
 *
 * "The phone bottom bar is built from permissions... so a Driver's bar is not
 * a Coordinator's." Reads the same `permittedNav()` the Sidebar reads, so the
 * two surfaces can never disagree about what a role can reach — only ever
 * mounted below 768 (`Shell` in `App.tsx` swaps this in for the Sidebar).
 *
 * Deliberately carries no Scanner slot: `data/nav.ts` locks Scanner as "a FAB
 * at every width, never a nav item" (Foundation §5.5), and that FAB already
 * renders unchanged at every width — this bar only makes room for it (see the
 * `bottom` offset in `ScannerFab.tsx`), it does not duplicate or relocate it.
 *
 * Settings is always the fourth slot rather than a fifth item competing with
 * the first three: it sits outside the permission-filtered NAV array by
 * design (§5.1), and stays reachable now that the Sidebar that normally
 * carries it is hidden at this width.
 */
export default function BottomBar({ active }: { active: string }) {
  const { user } = useAuth()
  const items = [...permittedNav(user?.role).slice(0, 3), SETTINGS_NAV]
  const base = active.split('?')[0] ?? active

  return (
    <nav
      aria-label="Main"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: BOTTOM_BAR_HEIGHT,
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`,
        background: 'var(--sidebar)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 50,
      }}
    >
      {items.map((item) => {
        const on = item.to === base || (item.to !== '/settings' && base.startsWith(item.to + '/'))
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={on ? 'page' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              minHeight: 44,
              textDecoration: 'none',
              color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
            }}
          >
            <Icon name={item.icon} size={20} fill={on} />
            <span style={{ fontSize: 'var(--t-th)', fontWeight: on ? 700 : 500, whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
