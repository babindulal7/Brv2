import Icon from '../ui/Icon'
import { useRef, useState, useMemo, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { openCommandPalette } from './CommandPalette'
import HandoverSheet from '../../modules/auth/HandoverSheet'
import { useSync } from '../../lib/syncContext'
import { QuickCreateMenu } from './QuickCreateMenu'
import { useOptionalWorkspace } from '../../lib/workspaceContext'
import { InfoTooltip } from '../ui/InfoTooltip'
import InternalNotesDrawer from '../../modules/notes/InternalNotesDrawer'
import './shell.css'

export interface Crumb {
  label: string
  to?: string
}

const DEFAULT_PAGE_INFO: Record<string, string> = {
  Today: 'Prepare pickups, receive returns, and keep equipment moving.',
  Dashboard: 'Prepare pickups, receive returns, and keep equipment moving.',
  Rentals: 'Manage bookings, pickups, returns, and turnaround states.',
  'New Rental': 'Create a new rental booking, select dates, and assign inventory.',
  Calendar: 'Master operational schedule of deliveries, returns, and bookings.',
  Operations: 'Daily turnaround workflows: packing, inspection, dispatch, and check-in.',
  Inventory: 'Equipment catalog, serial tracking, availability, and condition.',
  Clients: 'Client directory, contacts, rental history, and credit terms.',
  Finance: 'Invoices, payments, daily closing, and financial ledgers.',
  Documents: 'Rental agreements, delivery notes, and verified handovers.',
  Analytics: 'Fleet utilization, revenue metrics, and operational performance.',
  Reports: 'Fleet utilization, revenue metrics, and operational performance.',
  'Crew Assist': 'Technician rosters, driver dispatch, and field assignments.',
  Tools: 'Calculators, pricing sandbox, and technical utilities.',
  Settings: 'System configuration, warehouse locations, and staff permissions.',
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
  const sync = useSync()
  const syncStatus = sync?.status ?? (sync as { syncStatus?: string } | undefined)?.syncStatus ?? 'synced'
  const pendingCount = sync?.pendingCount ?? 0
  const syncError = sync?.error
  const triggerSync = sync?.triggerSync ?? (async () => {})
  const isAbnormalSync = syncStatus !== 'synced' || pendingCount > 0
  const navigate = useNavigate()
  const vp = useViewport()
  const isPhone = vp === 'phone'
  const [profileOpen, setProfileOpen] = useState(false)
  const [showHandover, setShowHandover] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const ws = useOptionalWorkspace()
  const profileBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        setNotesOpen(v => !v)
      }
    }
    const handleOpenNotes = () => setNotesOpen(true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('babin:open-notes', handleOpenNotes)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('babin:open-notes', handleOpenNotes)
    }
  }, [])

  const activeCrumb = crumbs[crumbs.length - 1]?.label || crumbs[0]?.label || ''

  const effectiveInfo = useMemo(() => {
    if (ws?.pageInfo) return ws.pageInfo
    for (let i = crumbs.length - 1; i >= 0; i--) {
      const label = crumbs[i]?.label
      if (label && DEFAULT_PAGE_INFO[label]) {
        return DEFAULT_PAGE_INFO[label]
      }
    }
    return null
  }, [ws?.pageInfo, crumbs])

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
      <div
        className="app-global-header__breadcrumbs"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          flex: isPhone ? '1 1 auto' : '0 1 auto',
          maxWidth: isPhone ? undefined : '32%',
        }}
      >
        <nav aria-label="Breadcrumb" style={{ minWidth: 0, overflow: 'hidden' }}>
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
        {effectiveInfo && (
          <InfoTooltip
            content={effectiveInfo}
            size={14}
            label={activeCrumb ? `${activeCrumb} info` : 'Page info'}
            style={{ flexShrink: 0 }}
          />
        )}
      </div>

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

          {/* Outbox Sync Status Badge — shown ONLY in abnormal states (syncing, offline, error, or queued mutations) */}
          {isAbnormalSync && (
            <div className="header-sync-context" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                className="header-sync-control tap"
                type="button"
                onClick={() => triggerSync()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  minWidth: 44,
                  padding: '4px 11px',
                  borderRadius: 999,
                  background:
                    syncStatus === 'syncing'
                      ? 'var(--nav-active-bg)'
                      : pendingCount > 0 || syncStatus === 'pending'
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
                      : pendingCount > 0 || syncStatus === 'pending'
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
                    : pendingCount > 0
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
                        : pendingCount > 0 || syncStatus === 'pending'
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
                    : pendingCount > 0
                    ? `${pendingCount} Queued`
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

        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          aria-label="Team internal notes"
          title="Team internal notes (Alt+N)"
          style={iconBtn}
        >
          <Icon name="message" size={17} />
        </button>

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

        {/* Compact User Profile Trigger (Law 15: >= 44x44px hit area across all viewports) */}
        <div style={{ position: 'relative' }}>
          <button
            ref={profileBtnRef}
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            /*
             * WCAG 2.5.3 "Label in Name" — the visible initials ("BA") are
             * part of what a sighted user reads, so the accessible name has to
             * CONTAIN them. `aria-hidden` on the avatar was tried first and is
             * not enough: axe still counts aria-hidden text as visible for this
             * rule, because from a sighted user's side it very much is. Leading
             * with the initials and following with the role is the form the
             * rule wants, and it reads better too — a screen-reader user hears
             * who they are signed in as before they hear what the control does.
             */
            aria-label={`${initials} — user profile`}
            title="User profile"
            aria-expanded={profileOpen}
            style={{
              ...iconBtn,
              padding: 0,
            }}
          >
            <span
              aria-hidden="true"
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
                onClick={() => {
                  setProfileOpen(false)
                  // Scrim clicks land focus on body — hand it back instead of
                  // stranding it, but never steal a focus that already moved
                  // somewhere meaningful.
                  const active = document.activeElement as Element | null
                  if (!active || active === document.body) profileBtnRef.current?.focus()
                }}
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

    {notesOpen && (
      <InternalNotesDrawer
        isOpen={notesOpen}
        onClose={() => setNotesOpen(false)}
      />
    )}
    </>
  )
}
