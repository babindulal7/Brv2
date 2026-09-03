import Icon from '../ui/Icon'
import { Unavailable } from '../ui/Unavailable'
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
  const { status: syncStatus, pendingCount, error: syncError, triggerSync } = useSync()
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
    /*
      The fragment is load-bearing: HandoverSheet is a Modal, and Modal paints
      `position: fixed; inset: 0` in place (this codebase uses no portals — see
      Modal.tsx, Select.tsx, MoreSheet.tsx, CommandPalette.tsx). An ancestor
      carrying `backdrop-filter` is a containing block for fixed descendants in
      WebKit and per the containing-block rules, so leaving the sheet INSIDE the
      glass <header> risks collapsing a full-screen modal into the 59px header
      strip on Safari/iPad. Measured here on Chromium 148: `filter` and
      `transform` do trap a fixed child, `backdrop-filter` currently does not —
      so this is engine-dependent, which is exactly why the sheet is a sibling
      rather than a descendant. BottomBar.tsx:128 already renders MoreSheet this
      way, outside its own glass <nav>; this matches it.
    */
    <>
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
              /* A flex item defaults to `min-width: auto`, i.e. its longest
                 word — so in the 768–1279 band the button refused to shrink
                 and the placeholder folded onto four lines instead (A6).
                 With this it shrinks to icon + ellipsis + kbd. */
              minWidth: 0,
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
            <span
              style={{
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: 'var(--t-ui)',
                color: 'var(--muted)',
              }}
            >
              {searchPlaceholder} (⌘K)
            </span>
            {/* The chip is the one part that cannot shrink, so on a tablet it
                is the part that gets cut. The hint survives in the text. */}
            {vp !== 'tablet' && (
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
            )}
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
                    /* --success-text, not --st-in-fg. Every other branch here
                       already names a text-safe token; the settled branch was
                       the odd one out. --st-in-fg is --on-success = #ffffff in
                       BOTH themes — ink for a solid green fill — but this
                       chip's settled background is --surface-2, not green, so
                       the word "Synced" was white on a light surface and the
                       chip read as empty on the now-default light theme. */
                    : 'var(--success-text)',
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
                  /* Law 12 - the failure is stated here, persistently, rather than
                     in a toast that expires before it is read. `syncError` is what
                     syncAll() caught; the fallback covers a failure with no message. */
                  ? `Sync failed: ${syncError ?? 'no reason reported'}. Click to retry.`
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

            {/* Measured at 768px: this group is 220px of a 236px strip once the
                search has collapsed to its icon, so the least informative chip
                folds away on a tablet — the device shows the time; the sync and
                branch chips are the two that carry state (A6). */}
            {vp !== 'tablet' && (
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
            )}

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

        {/*
          BUG-002 — both of these were live-looking buttons with no `onClick` on
          all 56 routes, and the bell carried a **hardcoded unread count of 12**.

          The count was the serious half. `notifications` exists live (12 columns)
          and holds **zero rows**; nothing in `src/` writes one, and the only
          inbox UI is `src/archive/notifications/UnifiedInbox.tsx`, which has no
          route and no importer outside its own test. So the badge advertised
          twelve pieces of pending work that did not exist and could not be
          opened — a fabricated figure of exactly the kind the no-fabrication
          register exists to stop, and it read as urgent because it rendered in
          the danger pair.

          Building the notification centre is a FEATURE, not this fix: what
          generates a notification, what "unread" means per user, and where a
          click lands are all unruled. Until then these follow the house pattern
          for an unbuilt control — `Unavailable` + `disabled`, the same treatment
          as RentalsList's "Save View" — which states the reason on hover AND on
          a long-press, so the warehouse tablet gets the explanation too.

          Deliberately NOT the "absent, not disabled" rule: that one is Law 6,
          about hiding money from money-blind roles. These are unbuilt for
          everyone, which is a different fact and is worth saying out loud.
        */}
        <Unavailable reason="Notifications are not built yet — nothing writes one, so there is nothing to open.">
          <button type="button" aria-label="Notifications" style={iconBtn} disabled>
            <Icon name="bell" size={17} />
          </button>
        </Unavailable>

        <Unavailable reason="Help is not built yet — no destination is settled: in-app guide, docs site, or a support contact.">
          <button type="button" aria-label="Help" style={iconBtn} disabled>
            <Icon name="info" size={17} />
          </button>
        </Unavailable>

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
          {/*
            Name and role fold away on a tablet. Measured at 831px: the strip
            between breadcrumb and chrome had 324px for a search bar plus the
            sync/clock/branch group that needs 363, so the group slid under the
            bell. This block is the ~90px that decides it, and the avatar keeps
            the identity on its tooltip. Phone and desktop are unchanged (A6).
          */}
          {vp !== 'tablet' && (
            <span style={{ textAlign: 'left', lineHeight: 1.25 }}>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                {user?.name || 'Guest'}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{user?.role || ''}</span>
            </span>
          )}
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

    </header>

    {showHandover && (
      <HandoverSheet
        isOpen={showHandover}
        onClose={() => setShowHandover(false)}
        userName={user?.name}
        userRole={user?.role}
      />
    )}
    </>
  )
}
