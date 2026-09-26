import Icon from '../ui/Icon'
import { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { openCommandPalette } from './CommandPalette'
import HandoverSheet from '../../modules/auth/HandoverSheet'
import { useSync } from '../../lib/syncContext'
import { QuickCreateMenu } from './QuickCreateMenu'
import { getBusinessToday, formatAd, toBs, formatBs } from '../../lib/bs'
import './shell.css'

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
export default function Header({ crumbs, actions }: HeaderProps) {
  const { user, logout, lockNow, hasPin } = useAuth()
  const { status: syncStatus, pendingCount, error: syncError, triggerSync } = useSync()
  const navigate = useNavigate()
  const vp = useViewport()
  const isPhone = vp === 'phone'
  const [profileOpen, setProfileOpen] = useState(false)
  const [showHandover, setShowHandover] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000)
    return () => clearInterval(t)
  }, [])

  const businessToday = useMemo(() => getBusinessToday(now), [now])
  const adDateLabel = useMemo(() => formatAd(businessToday), [businessToday])
  const bsDate = useMemo(() => toBs(businessToday), [businessToday])
  const bsDateLabel = useMemo(() => (bsDate ? formatBs(bsDate, { suffix: true }) : null), [bsDate])
  const liveTimeLabel = useMemo(() => {
    return now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kathmandu',
    })
  }, [now])

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

  // Fallback if useAuth has no user or user.name is undefined
  const initials = (user?.name || 'BR').slice(0, 2).toUpperCase()

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
      className="app-global-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isPhone ? 'var(--sp-xs)' : 'var(--sp-md)',
        padding: isPhone ? '6px 12px' : '6px 20px',
        /* Reads the token rather than setting the height, so `--header-h` and
           this element cannot disagree. Everything that sticks BELOW the header
           — the page rails, the filter drawer — offsets by that token, and
           before it existed they each fell back to a guessed 64px against a
           real 59. Border-box is global, so this covers the padding and the
           border below. */
        minHeight: 'var(--header-h)',
        height: 'var(--header-h)',
        flexShrink: 0,
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
      <nav aria-label="Breadcrumb" style={{ flex: isPhone ? '1 1 auto' : '0 1 auto', minWidth: 0, maxWidth: isPhone ? undefined : '30%', overflow: 'hidden' }}>
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
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'inline-block',
                  maxWidth: isPhone ? '180px' : 'none',
                }}
              >
                {c.label}
              </span>
            )
            return (
              <li key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                {i > 0 && <Icon name="chevron_right" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                {c.to && !last ? (
                  <Link to={c.to} style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', minWidth: 0 }}>
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

      {/* On desktop and tablet, center search input + clock + sync status */}
      {!isPhone && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0, gap: 'var(--sp-md)' }}>
          <button
            type="button"
            onClick={() => openCommandPalette()}
            aria-label="Search commands and pages"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              width: '100%',
              maxWidth: 440,
              minWidth: 0,
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 'var(--r-input)',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              boxShadow: 'var(--specular-rim), 0 1px 3px rgba(0, 0, 0, 0.04)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'transform var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-focus)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-border)'
              e.currentTarget.style.transform = 'translateY(0)'
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
              Search commands and pages…
            </span>
            {vp !== 'tablet' && (
              <kbd
                className="figure"
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  flexShrink: 0,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                }}
              >
                Ctrl+K / ⌘K
              </kbd>
            )}
          </button>

          {/* Operational Date & Bikram Sambat Context + Live Clock */}
          <div
            className="header-operational-context"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {/* Live Clock with Kathmandu Pulse */}
            <div
              className="header-clock"
              title="Kathmandu Local Time"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 'var(--r-xs, 6px)',
                background: 'var(--card2)',
                border: '1px solid var(--w10, var(--border))',
                boxShadow: 'var(--shadow-sm)',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'var(--st-ready-fg, #22c55e)',
                  boxShadow: '0 0 6px var(--st-ready-fg, #22c55e)',
                  display: 'inline-block',
                }}
              />
              <span>{liveTimeLabel}</span>
            </div>

            {/* Operational Date & BS Calendar Pill */}
            <div
              className="header-date-badge"
              title={`Operational Day: ${adDateLabel}${bsDateLabel ? ` · ${bsDateLabel}` : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '4px 10px',
                borderRadius: 'var(--r-xs, 6px)',
                background: 'var(--card2)',
                border: '1px solid var(--w10, var(--border))',
                boxShadow: 'var(--shadow-sm)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="header-date-ad">{adDateLabel}</span>
              {bsDateLabel && (
                <span
                  className="header-date-bs"
                  style={{
                    background: 'rgba(245, 166, 35, 0.12)',
                    color: 'var(--gold, var(--st-warn-fg))',
                    border: '1px solid var(--st-warn-border, rgba(245, 166, 35, 0.28))',
                    padding: '1px 7px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.01em',
                  }}
                >
                  {bsDateLabel}
                </span>
              )}
            </div>
          </div>

          {/* Sync Status Badge — shown only during sync operations, pending changes, or issues (§4) */}
          {(syncStatus !== 'synced' || pendingCount > 0) && (
            <div className="header-sync-context" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                className="header-sync-control"
                type="button"
                onClick={() => triggerSync()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 11px',
                  borderRadius: 999,
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
                  boxShadow: 'var(--specular-rim)',
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
                      : 'var(--success-text)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all var(--dur-fast) var(--ease)',
                }}
                title={
                  syncStatus === 'syncing'
                    ? 'Syncing with Supabase Cloud...'
                    : syncStatus === 'pending'
                    ? `${pendingCount} offline mutations pending. Click to sync now.`
                    : syncStatus === 'offline'
                    ? 'Offline Mode active (Dexie cache). Click to sync when reconnected.'
                    : syncStatus === 'error'
                    ? `Sync failed: ${syncError ?? 'no reason reported'}. Click to retry.`
                    : 'Cloud Database & Local Cache Synced. Click to force sync.'
                }
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    display: 'inline-block',
                    background:
                      syncStatus === 'syncing'
                        ? 'var(--primary-text)'
                        : syncStatus === 'pending'
                        ? 'var(--warn-text)'
                        : syncStatus === 'error'
                        ? 'var(--danger-text)'
                        : syncStatus === 'offline'
                        ? 'var(--muted)'
                        : 'var(--success-text)',
                    boxShadow:
                      syncStatus === 'syncing'
                        ? '0 0 6px var(--primary-text)'
                        : syncStatus === 'error'
                        ? '0 0 6px var(--danger-text)'
                        : undefined,
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
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? 6 : 'var(--sp-sm)', flexShrink: 0, marginLeft: isPhone ? 'auto' : 0 }}>
        {actions}

        <QuickCreateMenu role={user?.role} compact={vp !== 'desktop'} />

        {isPhone && (
          <button
            type="button"
            onClick={() => openCommandPalette()}
            aria-label="Search"
            title="Search"
            style={iconBtn}
          >
            <Icon name="search" size={17} />
          </button>
        )}


        {isPhone ? (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              aria-label="User profile"
title="User profile"
              aria-expanded={profileOpen}
              style={{
                ...iconBtn,
                padding: 0,
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--r-badge)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                }}
              >
                {initials}
              </span>
            </button>

            {profileOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                  onClick={() => setProfileOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="dialog"
                  aria-label="User profile"
title="User profile"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    zIndex: 91,
                    width: 230,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-card)',
                    boxShadow: 'var(--shadow-modal)',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                      {user?.name || 'Guest'}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                      {user?.role || ''} · Kathmandu HQ
                    </div>
                  </div>
                  {hasPin && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false)
                        lockNow()
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minHeight: 44,
                        padding: '0 10px',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-ui)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Icon name="lock" size={16} />
                      Lock Session
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false)
                      handleLogoutRequest()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid transparent',
                      background: 'var(--btn-danger-bg)',
                      color: 'var(--btn-danger-fg)',
                      fontSize: 'var(--t-ui)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Log Out
                  </button>
                </div>
              </>
            )}
          </div>
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
            {vp === 'desktop' && (
              <span style={{ textAlign: 'left', lineHeight: 1.25 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                  {user?.name || 'Guest'}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{user?.role || ''}</span>
              </span>
            )}
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
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 'var(--t-meta)', fontWeight: 600, marginLeft: 'var(--sp-sm)', minHeight: 44 }}
            >
              Log Out
            </button>
          </div>
        )}
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
