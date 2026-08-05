import Icon from '../ui/Icon'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import HandoverSheet from '../../modules/auth/HandoverSheet'

export interface Crumb {
  label: string
  to?: string
}

interface HeaderProps {
  /** Breadcrumb trail. The first entry renders in the theme accent. */
  crumbs: Crumb[]
  searchPlaceholder?: string
  /** Right-hand action cluster, rendered before the fixed chrome. */
  actions?: React.ReactNode
}

const iconBtn = {
  width: 34,
  height: 34,
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

  // Fallback if useAuth has no user
  const initials = user ? user.name.slice(0, 2).toUpperCase() : 'BR'

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--sidebar)',
        transition: 'background-color var(--dur-theme) ease',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <nav aria-label="Breadcrumb" style={{ flexShrink: 0 }}>
        <ol style={{ display: 'flex', alignItems: 'center', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            return (
              <li key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {i > 0 && <Icon name="chevron_right" size={13} style={{ color: 'var(--muted)' }} />}
                <span
                  aria-current={last ? 'page' : undefined}
                  style={{
                    fontSize: 'var(--t-ui)',
                    fontWeight: i === 0 ? 600 : last ? 600 : 500,
                    color: i === 0 ? 'var(--nav-active-accent)' : last ? 'var(--text)' : 'var(--text2)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.label}
                </span>
              </li>
            )
          })}
        </ol>
      </nav>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0, gap: 12 }}>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            maxWidth: 440,
            height: 38,
            padding: '0 12px',
            borderRadius: 'var(--r-input)',
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <Icon name="search" size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 'var(--t-ui)', color: 'var(--muted)' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
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
              borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.25)',
            }}
          >
            FY 2083/84
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {actions}

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
              borderRadius: 999,
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

        <button type="button" aria-label="Help" style={iconBtn}>
          <Icon name="info" size={17} />
        </button>

        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            height: 38,
            padding: '0 6px 0 3px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: 'linear-gradient(140deg,#334155,#475569)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
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
            onClick={(e) => { e.stopPropagation(); handleLogoutRequest() }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 'var(--t-meta)', fontWeight: 600, marginLeft: 8 }}
          >
            Log Out
          </button>
        </button>
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
