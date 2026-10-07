import Icon from '../ui/Icon'
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import HandoverSheet from '../../modules/auth/HandoverSheet'

export interface Crumb {
  label: string
  to?: string | undefined
}

interface HeaderProps {
  /** Breadcrumb trail. The first entry renders in the theme accent. */
  crumbs: Crumb[]
  searchPlaceholder?: string
  /** Right-hand action cluster, rendered before the fixed chrome. */
  actions?: React.ReactNode
}

// Law 15 — 44×44 at every width, desktop included. This is the shell, so a
// short target here fails on every page at every width; `Sidebar.tsx:19`,
// `BottomBar.tsx:39` and `ScannerFab.tsx:247` all pin 44 for the same reason.
const iconBtn = {
  minWidth: 44,
  minHeight: 44,
  borderRadius: 9,
  border: 'none',
  background: 'transparent',
  color: 'var(--text2)',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
} as const

/**
 * Generation C top strip — breadcrumb left, global search centred, chrome right.
 *
 * Transcribed from `12402A27` and `09168AC3`. The page title does NOT live here;
 * it sits in `PageHeader` below, so a page can put its own action cluster beside
 * its own title without fighting the global chrome for space.
 */
export default function Header({ crumbs, searchPlaceholder = 'Search…', actions }: HeaderProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const isTablet = viewport === 'tablet'
  const [showHandover, setShowHandover] = useState(false)

  const handleLogoutRequest = () => {
    if (!user) return
    const needsHandover = ['Warehouse', 'Technician', 'Driver'].includes(user.role)
    if (needsHandover) {
      setShowHandover(true)
    } else {
      logout()
      navigate('/login')
    }
  }

  // Fallback if useAuth has no user or user has no name
  const initials = user?.name ? user.name.slice(0, 2).toUpperCase() : 'BR'

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: isPhone ? 'var(--sp-sm)' : 'var(--sp-lg)',
        padding: isPhone ? '8px 12px' : '10px 20px',
        /* Reads the token rather than setting the height, so `--header-h` and
           this element cannot disagree. Everything that sticks BELOW the header
           — the page rails, the filter drawer — offsets by that token, and
           before it existed they each fell back to a guessed 64px against a
           real 59. Border-box is global, so this covers the padding and the
           border below. */
        minHeight: 'var(--header-h)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--sidebar)',
        transition: 'background-color var(--dur-theme) ease',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <nav aria-label="Breadcrumb" style={{ flexShrink: 0, minWidth: 0, maxWidth: isPhone ? '180px' : undefined, overflow: 'hidden' }}>
        <ol style={{ display: 'flex', alignItems: 'center', gap: isPhone ? 4 : 7, margin: 0, padding: 0, listStyle: 'none' }}>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            const isFirst = i === 0
            const color = isFirst ? 'var(--nav-active-accent)' : last ? 'var(--text)' : 'var(--text2)'
            const fontWeight = isFirst || last ? 600 : 500

            return (
              <li key={`${c.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: isPhone ? 4 : 7, minWidth: 0 }}>
                {i > 0 && <Icon name="chevron_right" size={isPhone ? 11 : 13} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                {!last && c.to ? (
                  <Link
                    to={c.to}
                    style={{
                      fontSize: 'var(--t-ui)',
                      fontWeight,
                      color,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? 'page' : undefined}
                    style={{
                      fontSize: 'var(--t-ui)',
                      fontWeight,
                      color,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.label}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {!isPhone && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0, gap: 'var(--sp-md)' }}>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              width: '100%',
              maxWidth: isTablet ? 300 : 440,
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-input)',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Icon name="search" size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 'var(--t-ui)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {searchPlaceholder} (⌘K)
            </span>
            <kbd
              className="figure"
              style={{
                fontSize: 'var(--t-meta)',
                color: 'var(--muted)',
                flexShrink: 0,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--card)',
                border: '1px solid var(--border)',
              }}
            >
              ⌘K
            </kbd>
          </button>

          {/* Branch & Fiscal Year Pills */}
          {!isTablet && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 'var(--r-xs)',
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--sp-xs)',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
                Kathmandu HQ
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 'var(--r-xs)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                }}
              >
                FY 2083/84
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? 'var(--sp-xs)' : 'var(--sp-sm)', flexShrink: 0 }}>
        {actions}

        {/* Phone search button triggering ⌘K command palette */}
        {isPhone && (
          <button
            type="button"
            aria-label="Search"
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
            }}
            style={iconBtn}
          >
            <Icon name="search" size={17} />
          </button>
        )}

        <button type="button" aria-label="Notifications, 12 unread" style={{ ...iconBtn, position: 'relative' }}>
          <Icon name="bell" size={17} />
          <span
            className="figure"
            style={{
              position: 'absolute',
              top: 1,
              right: 1,
              minWidth: 16,
              height: 16,
              borderRadius: 'var(--r-badge)',
              /*
               * The AA-verified status pair, not raw `--danger`. Dark theme's
               * `--danger` is #ef4444, and white on it measured 3.76:1 — under
               * AA for 9.5px text. The damage pair passes in both themes.
               */
              background: 'var(--st-danger-fg)',
              color: 'var(--st-danger-bg)',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              display: 'grid',
              placeItems: 'center',
              border: '2px solid var(--sidebar)',
            }}
          >
            12
          </span>
        </button>

        {!isPhone && (
          <button type="button" aria-label="Help" style={iconBtn}>
            <Icon name="info" size={17} />
          </button>
        )}

        {isPhone ? (
          <button
            type="button"
            onClick={handleLogoutRequest}
            aria-label={`User profile: ${user?.name || 'Guest'}. Log out`}
            style={{
              ...iconBtn,
              padding: 0,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-badge)',
                background: 'var(--card2)',
                border: '1px solid var(--border)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initials}
            </span>
          </button>
        ) : (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              height: 38,
              padding: '0 6px 0 3px',
              fontFamily: 'inherit',
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--r-badge)',
                background: 'var(--card2)',
                border: '1px solid var(--border)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initials}
            </span>
            <span style={{ textAlign: 'left', lineHeight: 1.25 }}>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                {user?.name || 'Guest'}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{user?.role || ''}</span>
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleLogoutRequest() }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 'var(--t-meta)', fontWeight: 600, marginLeft: 'var(--sp-sm)' }}
            >
              Log Out
            </button>
          </div>
        )}
      </div>

      {showHandover && (
        <HandoverSheet
          isOpen={showHandover}
          onClose={() => setShowHandover(false)}
          userName={user?.name}
          userRole={user?.role}
        />
      )}
    </header>
  )
}
