import Icon from '../ui/Icon'
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { openCommandPalette } from './CommandPalette'
import HandoverSheet from '../../modules/auth/HandoverSheet'
import { useSync } from '../../lib/syncContext'

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
 * Enhanced with Miraz POS Live Clock, Sync Heartbeat & Tactile Search.
 */
export default function Header({ crumbs, searchPlaceholder = 'Search…', actions }: HeaderProps) {
  const { user, logout, lockNow, hasPin } = useAuth()
  const { status: syncStatus, pendingCount, triggerSync } = useSync()
  const navigate = useNavigate()
  const vp = useViewport()
  const isPhone = vp === 'phone'
  const [showHandover, setShowHandover] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

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
        gap: isPhone ? 'var(--sp-xs)' : 'var(--sp-lg)',
        padding: isPhone ? '6px 12px' : '10px 20px',
        /* Reads the token rather than setting the height, so `--header-h` and
           this element cannot disagree. Everything that sticks BELOW the header
           — the page rails, the filter drawer — offsets by that token, and
           before it existed they each fell back to a guessed 64px against a
           real 59. Border-box is global, so this covers the padding and the
           border below. */
        minHeight: 'var(--header-h)',
        borderBottom: '1px solid var(--border)',
        /* v4.2 §4 — chrome is glass at 20–24px. --sidebar is a 0.88 tint, and a
           sticky bar that content scrolls UNDER must blur what passes behind it
           or the tint just smears the page through itself. */
        background: 'var(--sidebar)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        transition: 'background-color var(--dur-theme) ease',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <nav aria-label="Breadcrumb" style={{ flexShrink: 0, overflow: 'hidden' }}>
        <ol style={{ display: 'flex', alignItems: 'center', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
          {(isPhone && crumbs.length > 1 ? [crumbs[crumbs.length - 1]!] : crumbs).map((c, i, arr) => {
            const last = i === arr.length - 1
            const labelEl = (
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
            )
            return (
              <li key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {i > 0 && <Icon name="chevron_right" size={13} style={{ color: 'var(--muted)' }} />}
                {c.to && !last ? (
                  <Link to={c.to} style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex' }}>
                    {labelEl}
                  </Link>
                ) : (
                  labelEl
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0, gap: 'var(--sp-md)' }}>
        {isPhone ? (
          <button
            type="button"
            onClick={() => openCommandPalette()}
            aria-label="Search"
            style={iconBtn}
          >
            <Icon name="search" size={17} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openCommandPalette()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              width: '100%',
              maxWidth: 440,
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
        )}

        {/* Live Clock & Sync Status Badge */}
        {!isPhone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => triggerSync()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 'var(--r-xs)',
                background:
                  syncStatus === 'syncing'
                    ? 'var(--nav-active-bg)'
                    : syncStatus === 'pending'
                    ? 'rgba(232, 118, 45, 0.12)'
                    : syncStatus === 'offline'
                    ? 'var(--surface-2)'
                    : syncStatus === 'error'
                    ? 'var(--danger-soft)'
                    : 'var(--surface-2)',
                border: '1px solid var(--border)',
                fontSize: '11px',
                fontWeight: 600,
                color:
                  syncStatus === 'syncing'
                    ? 'var(--primary-text)'
                    : syncStatus === 'pending'
                    ? 'var(--warn-text)'
                    : syncStatus === 'offline'
                    ? 'var(--muted)'
                    : syncStatus === 'error'
                    ? 'var(--danger-text)'
                    : 'var(--st-in-fg)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              title={
                syncStatus === 'syncing'
                  ? 'Syncing with Supabase Cloud...'
                  : syncStatus === 'pending'
                  ? `${pendingCount} offline mutations pending. Click to sync now.`
                  : syncStatus === 'offline'
                  ? 'Offline Mode active (Dexie cache). Click to sync when reconnected.'
                  : syncStatus === 'error'
                  ? 'Sync warning. Click to retry.'
                  : 'Cloud Database & Local Cache Synced. Click to force sync.'
              }
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'currentColor',
                  display: 'inline-block',
                }}
              />
              <span>
                {syncStatus === 'syncing'
                  ? 'Syncing…'
                  : syncStatus === 'pending'
                  ? `Pending (${pendingCount})`
                  : syncStatus === 'offline'
                  ? 'Offline'
                  : syncStatus === 'error'
                  ? 'Sync Error'
                  : 'Synced'}
              </span>
            </button>

            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text)',
                fontFamily: 'var(--font-mono, monospace)',
                fontVariantNumeric: 'tabular-nums',
                padding: '3px 8px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--r-xs)',
                border: '1px solid var(--border)',
              }}
            >
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 'var(--r-xs)',
                background: 'var(--surface-2)',
                color: 'var(--text2)',
                border: '1px solid var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--sp-xs)',
              }}
            >
              Kathmandu HQ
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexShrink: 0 }}>
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
              borderRadius: 'var(--r-badge)',
              /*
               * The status pair, read the right way round.
               *
               * These two were SWAPPED — background took `-fg` and colour took
               * `-bg` — so the alert badge rendered as a white pill with red
               * digits. Pre-v4.1 the danger pair was a soft wash and the swap
               * was survivable; v4.1 §4 makes every pair a solid block, and
               * white-on-red inverted to red-on-white.
               *
               * The old comment argued from `--danger` = #ef4444; v4.1's value
               * is #C73A3A, measured at 5.13:1 against white (spec §10), so the
               * pair is AA either way — it just has to be used in order.
               */
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
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

        {/*
          Not a <button>: this wrapper carries no click handler of its own —
          it is a static grouping of the avatar/name display plus the real
          "Log Out" button below. It used to be a <button>, which put a
          <button> inside a <button> (invalid DOM nesting) and gave the page
          a focusable control that did nothing when activated. A plain <div>
          fixes both: no nesting violation, and no phantom tab stop.
        */}
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
          {/*
            Lock — shown only when this session actually holds a PIN.

            Offering it without one would draw a curtain whose only exit is the
            sign-out the operator was avoiding by locking. `hasPin` comes from
            `AuthProvider`, which resolves it once per identity precisely so this
            decision is synchronous.

            Deliberately NOT styled as danger: locking is the safe, routine
            action on a shared tablet — it is the one we want reached for on the
            way to the tea room, and colouring it like Log Out invites the
            heavier action by mistake.
          */}
          {hasPin && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); lockNow() }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, marginLeft: 'var(--sp-sm)', minHeight: 44 }}
            >
              Lock
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleLogoutRequest() }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 'var(--t-meta)', fontWeight: 600, marginLeft: 'var(--sp-sm)' }}
          >
            Log Out
          </button>
        </div>
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
