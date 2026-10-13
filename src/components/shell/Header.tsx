import { useRef, useState, useMemo, useEffect, isValidElement, cloneElement, type ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Icon, { type IconName } from '../ui/Icon'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { openCommandPalette } from './CommandPalette'
import HandoverSheet from '../../modules/auth/HandoverSheet'
import { useSync } from '../../lib/syncContext'
import { useOptionalWorkspace, type PageHeaderSearchConfig } from '../../lib/workspaceContext'
import { InfoTooltip } from '../ui/InfoTooltip'
import InternalNotesDrawer from '../../modules/notes/InternalNotesDrawer'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { OverflowMenu, type OverflowMenuItem } from '../ui/OverflowMenu'
import { extractValidActions } from '../ui/PageActions'
import {
  type PageActionItem,
  type PageActionContext,
  resolvePageActions,
  isActionEnabled,
} from '../ui/header/pageActionRegistry'
import { AddDropdownButton } from '../ui/header/PageHeader'
import { GlobalAddMenu } from '../ui/creation/GlobalAddMenu'
import { MobileHeaderSearch } from './MobileHeaderSearch'
import { UnsavedChangesIndicator } from '../ui/header/UnsavedChangesIndicator'
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
  'Team Notes': 'Operational scratchpad, shift handovers, gear defects & field alerts.',
  Tools: 'Calculators, pricing sandbox, and technical utilities.',
  Settings: 'System configuration, warehouse locations, and staff permissions.',
}

interface HeaderProps {
  /** Breadcrumb trail. The first entry renders in the theme accent. */
  crumbs: Crumb[]
  searchPlaceholder?: string
  /** Right-hand action cluster, rendered before the fixed chrome. */
  actions?: ReactNode
}

// Law 15 — 44×44 at every width, desktop included.
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
 * Universal Compact Single-Row Global Application Header.
 *
 * Implements the single-row standard:
 * Desktop layout: [Page Icon + Title / Status] — [Search] — [Add ▼] [Primary Action] [More ⋯] [Messages] [Avatar]
 *
 * Invariants:
 * - Exactly ONE horizontal row.
 * - Fixed height 64px (--header-h).
 * - Zero wrapping (flex-wrap: nowrap).
 * - No second toolbar row anywhere.
 * - Dropdowns float above content.
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
  const isTablet = vp === 'tablet'
  const isDispatch = crumbs.some((crumb) => crumb.label === 'Today' || crumb.label === 'Dashboard')
  const [profileOpen, setProfileOpen] = useState(false)
  const [showHandover, setShowHandover] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [activeConfirmAction, setActiveConfirmAction] = useState<PageActionItem | null>(null)
  const ws = useOptionalWorkspace()
  const profileBtnRef = useRef<HTMLButtonElement>(null)

  const hData = ws?.headerData

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        setNotesOpen((v) => !v)
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

  // RULING 2026-10-13: the page's registered title names the current crumb, and a
  // current crumb that only repeats its parent ("Clients › Clients") collapses into it.
  const displayCrumbs = useMemo((): Crumb[] => {
    const title = hData?.title && hData.title !== 'Babin Rentals OS' ? hData.title : null
    const named = crumbs.map((c, i) => (i === crumbs.length - 1 && title ? { ...c, label: title } : c))
    const current = named[named.length - 1]
    const parent = named[named.length - 2]
    if (current && parent && current.label === parent.label) return [...named.slice(0, -2), { label: parent.label }]
    return named
  }, [crumbs, hData?.title])

  // On a phone only the current crumb shows, so its nearest linked ancestor becomes a back button.
  const autoBack = useMemo(() => {
    if (!isPhone || hData?.backHref || hData?.onBack) return null
    for (let i = displayCrumbs.length - 2; i >= 0; i--) {
      const c = displayCrumbs[i]
      if (c?.to) return { to: c.to, label: c.label }
    }
    return null
  }, [isPhone, hData?.backHref, hData?.onBack, displayCrumbs])

  const effectiveInfo = useMemo(() => {
    if (ws?.pageInfo) return ws.pageInfo
    if (hData?.description) return hData.description
    for (let i = crumbs.length - 1; i >= 0; i--) {
      const label = crumbs[i]?.label
      if (label && DEFAULT_PAGE_INFO[label]) {
        return DEFAULT_PAGE_INFO[label]
      }
    }
    return null
  }, [ws?.pageInfo, hData?.description, crumbs])

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

  const initials = (user?.name || 'BR').slice(0, 2).toUpperCase()

  // Evaluate action registry from workspace header data if available
  const hasDirty = Boolean(hData?.unsavedChanges || hData?.isDirty)
  const actionContext: PageActionContext = useMemo(
    () => ({
      role: user?.role,
      workflowState: hData?.workflowState,
      isDirty: hasDirty,
    }),
    [user?.role, hData?.workflowState, hasDirty]
  )

  const resolved = hData?.actionsConfig
    ? resolvePageActions(hData.actionsConfig, actionContext)
    : null

  const handleActionClick = (action: PageActionItem, e?: React.MouseEvent) => {
    if (action.confirm) {
      setActiveConfirmAction(action)
      return
    }
    void action.onClick?.(e)
  }

  // Legacy actions fallback
  const combinedLegacyActions = [
    ...(actions ? extractValidActions(actions) : []),
    ...(hData?.actions ? extractValidActions(hData.actions) : []),
  ]

  // Search configuration from workspace header data
  const isSearchConfig = Boolean(
    hData?.search &&
    typeof hData.search === 'object' &&
    'value' in hData.search &&
    'onChange' in hData.search
  )
  const searchConfig = isSearchConfig ? (hData?.search as PageHeaderSearchConfig) : null

  // Overflow items: excess secondary actions + overflow registry actions
  const overflowItems: OverflowMenuItem[] = useMemo(() => {
    if (!resolved) return []
    const items: OverflowMenuItem[] = []

    // On tablet or phone, secondary actions collapse into overflow
    if (isTablet || isPhone) {
      resolved.secondary.forEach((sec) => {
        const status = isActionEnabled(sec, actionContext)
        items.push({
          label: sec.label,
          icon: sec.icon ?? ('circle' as IconName),
          onClick: () => handleActionClick(sec),
          ...(status.reason ? { unavailable: status.reason } : {}),
        })
      })
    }

    resolved.overflow.forEach((item) => {
      const status = isActionEnabled(item, actionContext)
      items.push({
        label: item.label,
        icon: item.icon ?? ('more_vert' as IconName),
        onClick: () => handleActionClick(item),
        ...(status.reason ? { unavailable: status.reason } : {}),
      })
    })

    return items
  }, [resolved, isTablet, isPhone, actionContext])

  return (
    <>
      <header
        className="app-global-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          minHeight: 'var(--header-h)',
          height: 'var(--header-h)',
          maxHeight: 'var(--header-h)',
          padding: isPhone ? '0 12px' : '0 20px',
          gap: 8,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--sidebar)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          transition: 'background-color var(--dur-theme) ease',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          boxSizing: 'border-box',
          overflow: 'visible',
        }}
      >
        {/* =========================================================================
            ZONE 1: LEFT ZONE [Back / Title / Breadcrumb / Status / Info]
            ========================================================================= */}
        <div
          className="app-global-header__breadcrumbs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            // RULING 2026-10-13: on a phone the title takes whatever the controls leave, and ends in "…".
            flex: isPhone ? '1 1 auto' : '0 1 auto',
            maxWidth: isPhone ? undefined : isTablet ? '260px' : '360px',
            overflow: 'hidden',
          }}
        >
          {/* Back navigation button if registered */}
          {hData?.backHref && (
            <Link
              to={hData.backHref}
              aria-label={hData.backLabel ?? 'Back'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 44,
                minHeight: 44,
                color: 'var(--text2)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              <Icon name="chevron_left" size={18} />
            </Link>
          )}
          {hData?.onBack && !hData?.backHref && (
            <button
              type="button"
              onClick={hData.onBack}
              aria-label={hData.backLabel ?? 'Back'}
              style={{
                ...iconBtn,
                color: 'var(--text2)',
              }}
            >
              <Icon name="chevron_left" size={18} />
            </button>
          )}
          {autoBack && (
            <Link
              to={autoBack.to}
              aria-label={`Back to ${autoBack.label}`}
              title={`Back to ${autoBack.label}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 44,
                minHeight: 44,
                color: 'var(--text2)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              <Icon name="chevron_left" size={18} />
            </Link>
          )}

          {/* Module or entity icon */}
          {hData?.icon && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: 'var(--nav-active-accent)',
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <Icon name={hData.icon} size={18} fill />
            </span>
          )}

          {/* Page controls via workspace portal slot */}
          <span className="workspace-page-actions" ref={ws?.setHeaderActionsElement} />

          {/* Breadcrumb / Title Navigation */}
          <nav aria-label="Breadcrumb" style={{ minWidth: 0, overflow: 'hidden' }}>
            <ol style={{ display: 'flex', alignItems: 'center', gap: 7, margin: 0, padding: 0, listStyle: 'none', minWidth: 0 }}>
              {(isPhone && displayCrumbs.length > 1 ? [displayCrumbs[displayCrumbs.length - 1]!] : displayCrumbs).map((c, i, arr) => {
                const last = i === arr.length - 1
                const labelText = c.label

                const labelEl = (
                  <span
                    aria-current={last ? 'page' : undefined}
                    style={{
                      fontSize: last ? 'clamp(1.05rem, 0.95rem + 0.4vw, 1.3rem)' : 'var(--t-ui)',
                      fontFamily: last ? 'var(--font-display, inherit)' : undefined,
                      letterSpacing: last ? '-0.02em' : undefined,
                      lineHeight: 1.2,
                      fontWeight: i === 0 ? 600 : last ? 600 : 500,
                      color: i === 0 ? 'var(--nav-active-accent)' : last ? 'var(--text)' : 'var(--text2)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'inline-block',
                      maxWidth: isPhone ? '100%' : isTablet ? '200px' : '300px',
                    }}
                  >
                    {labelText}
                  </span>
                )
                return (
                  <li key={`${i}-${c.label}`} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flexShrink: last ? 1 : 0 }}>
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

          {/* Contextual record status badge */}
          {hData?.status && (
            <span
              className="app-global-header__status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              {hData.status}
            </span>
          )}

          {/* Unsaved changes dirty state indicator */}
          {hasDirty && (
            <UnsavedChangesIndicator compact />
          )}

          {/* Page Info Tooltip */}
          <span
            style={{
              display: isPhone ? 'none' : 'inline-flex',
              flexShrink: 0,
              visibility: effectiveInfo ? 'visible' : 'hidden',
            }}
            aria-hidden={effectiveInfo ? undefined : true}
          >
            <InfoTooltip
              content={effectiveInfo ?? 'Page info'}
              size={16}
              label={activeCrumb ? `${activeCrumb} info` : 'Page info'}
              style={{ flexShrink: 0 }}
            />
          </span>
        </div>

        {/* =========================================================================
            ZONE 2: CENTER ZONE [Search & Sync Status]
            ========================================================================= */}
        {!isPhone && (
          <div
            className="app-global-header__center"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '1 1 auto',
              minWidth: 0,
              maxWidth: isTablet ? '320px' : '460px',
              gap: 8,
              margin: '0 auto',
            }}
          >
            {/* If the active page provided a search configuration, render the unified search input */}
            {searchConfig ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  minWidth: 0,
                  height: 44,
                  minHeight: 44, /* TouchInset compliant (Law 15) */
                  padding: '0 12px',
                  borderRadius: 'var(--r-input, 8px)',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  boxShadow: 'var(--specular-rim), 0 1px 3px rgba(0, 0, 0, 0.04)',
                  boxSizing: 'border-box',
                }}
              >
                <Icon name="search" size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <input
                  ref={searchConfig.inputRef}
                  type="search"
                  value={searchConfig.value}
                  onChange={(e) => searchConfig.onChange(e.target.value)}
                  onKeyDown={searchConfig.onKeyDown}
                  placeholder={searchConfig.placeholder ?? 'Search page…'}
                  aria-label={searchConfig.ariaLabel ?? `Search ${hData?.title ?? 'page'}`}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 'var(--t-ui)',
                    outline: 'none',
                    width: '100%',
                    minWidth: 0,
                    fontFamily: 'inherit',
                  }}
                />
                {Boolean(searchConfig.value) && (
                  <button
                    type="button"
                    onClick={() => {
                      searchConfig.onChange('')
                      searchConfig.onClear?.()
                    }}
                    aria-label="Clear search query"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'grid',
                      placeItems: 'center',
                      minWidth: 44,
                      minHeight: 44,
                    }}
                  >
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>
            ) : !isDispatch && !ws?.hasPageSearch ? (
              <button
                type="button"
                onClick={() => openCommandPalette()}
                aria-label="Search bookings, clients, equipment and pages"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-sm)',
                  width: '100%',
                  flexShrink: 1,
                  minWidth: 0,
                  height: 44,
                  minHeight: 44, /* TouchInset compliant (Law 15) */
                  padding: '0 14px',
                  borderRadius: 'var(--r-input)',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  boxShadow: 'var(--specular-rim), 0 1px 3px rgba(0, 0, 0, 0.04)',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--input-focus)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--input-border)'
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
                  Search bookings, clients, equipment…
                </span>
                {!isTablet && (
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
            ) : null}

            {/* Mount point for pages that render their own search in the application header */}
            <span
              ref={ws?.setHeaderSearchElement}
              className="workspace-header-search"
              style={{
                display: ws?.hasPageSearch ? 'flex' : 'none',
                width: '100%',
                minWidth: 0,
              }}
            />

            {/* Outbox Sync Heartbeat badge slot */}
            <div
              className="header-sync-context"
              aria-hidden={isAbnormalSync ? undefined : true}
              style={{
                // RULING 2026-10-13: tablets reclaim the healthy sync placeholder for the page title/search.
                display: isTablet && !isAbnormalSync ? 'none' : 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
                minWidth: 104,
                justifyContent: 'flex-start',
                visibility: isAbnormalSync ? 'visible' : 'hidden',
              }}
            >
              <button
                className="header-sync-control tap"
                type="button"
                tabIndex={isAbnormalSync ? 0 : -1}
                onClick={() => triggerSync()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 38,
                  minHeight: 44,
                  minWidth: 96,
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
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
          </div>
        )}

        {/* =========================================================================
            ZONE 3: RIGHT ZONE [Add ▼] [Contextual Actions] [More ⋯] [Save/Confirm] [Messages] [Avatar]
            ========================================================================= */}
        <div
          className="app-global-header__right"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isPhone ? 6 : 8,
            flexShrink: 0,
            marginLeft: 'auto',
            minWidth: 0,
            flexWrap: 'nowrap',
          }}
        >
          {/* 1. Bulk Selection Mode Bar in Header */}
          {isPhone && searchConfig && !ws?.hasPageSearch && (
            <MobileHeaderSearch key={hData?.title ?? activeCrumb} config={searchConfig} title={hData?.title ?? activeCrumb} />
          )}
          {hData?.bulkSelection && hData.bulkSelection.count > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--t-meta, 13px)', fontWeight: 600, color: 'var(--text)' }}>
                {hData.bulkSelection.count} selected
              </span>
              <button
                type="button"
                onClick={hData.bulkSelection.onClear}
                style={{
                  minHeight: 44,
                  padding: '0 8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--link, #2563eb)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--t-meta, 13px)',
                }}
              >
                Clear
              </button>
              {hData.bulkSelection.actions.map((act) => (
                <Button
                  key={act.id}
                  variant={act.variant ?? 'secondary'}
                  icon={act.icon}
                  onClick={() => handleActionClick(act)}
                  disabled={act.enabled === false}
                  style={{ height: 38, minHeight: 44, padding: '0 12px' }}
                >
                  {act.label}
                </Button>
              ))}
            </div>
          ) : (
            <>
              {/* 2. Universal Add Dropdown [Add ▼] */}
              {resolved?.add ? (
                <AddDropdownButton action={resolved.add} />
              ) : !ws?.hasPageRightActions && !resolved?.primary && combinedLegacyActions.length === 0 && hData?.showAddMenu !== false ? (
                <GlobalAddMenu
                  module={hData?.module}
                  contextData={hData?.creationContext}
                />
              ) : null}

              {/* 3. Contextual Secondary Actions (Desktop only; up to 2 actions) */}
              {!isPhone && !isTablet && resolved?.secondary && resolved.secondary.length > 0 && (
                <>
                  {resolved.secondary.map((sec) => {
                    const statusCheck = isActionEnabled(sec, actionContext)
                    return (
                      <Button
                        key={sec.id}
                        variant={sec.variant ?? 'secondary'}
                        icon={sec.icon}
                        onClick={(e) => handleActionClick(sec, e)}
                        disabled={!statusCheck.enabled}
                        style={{ height: 38, minHeight: 44, padding: '0 12px' }}
                        {...(statusCheck.reason ? { title: statusCheck.reason } : {})}
                      >
                        {sec.label}
                      </Button>
                    )
                  })}
                </>
              )}

              {/* 4. Single Prominent Primary Action [Save / Confirm / etc.] */}
              {resolved?.primary && (
                <Button
                  variant={resolved.primary.variant ?? 'primary'}
                  icon={resolved.primary.icon}
                  onClick={(e) => handleActionClick(resolved.primary!, e)}
                  disabled={resolved.primary.loading || resolved.primary.enabled === false}
                  style={{
                    height: 38,
                    minHeight: 44,
                    padding: '0 14px',
                    fontWeight: 600,
                  }}
                  {...(resolved.primary.disabledReason ? { title: resolved.primary.disabledReason } : {})}
                >
                  {resolved.primary.loading
                    ? resolved.primary.loadingLabel ?? `${resolved.primary.label}…`
                    : resolved.primary.label}
                </Button>
              )}

              {/* 5. More Actions Overflow [More ⋯] */}
              {overflowItems.length > 0 && (
                <OverflowMenu
                  ariaLabel="More actions"
                  items={overflowItems}
                />
              )}

              {/* Mount point for pages that render their own actions into the application header */}
              <span
                ref={ws?.setHeaderRightActionsElement}
                className="workspace-header-right-actions"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                }}
              />

              {/* 6. Legacy Actions (backwards compatibility for raw action props) */}
              {combinedLegacyActions.map((action, idx) =>
                isValidElement(action)
                  ? cloneElement(action, { key: action.key ?? `hdr-legacy-${idx}` })
                  : <span key={`hdr-legacy-${idx}`}>{action}</span>
              )}
            </>
          )}

          {/* 7. Team Internal Notes Button (Alt+N) */}
          {!isPhone && <button
            type="button"
            onClick={() => setNotesOpen(true)}
            aria-label="Team internal notes"
            title="Team internal notes (Alt+N)"
            style={iconBtn}
          >
            <Icon name="message" size={17} />
          </button>}

          {/* 8. Phone Search Toggle Icon */}
          {isPhone && !searchConfig && !isDispatch && !ws?.hasPageSearch && (
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

          {/* 9. User Profile Trigger (Law 15: >= 44x44px hit area) */}
          <div style={{ position: 'relative' }}>
            <button
              ref={profileBtnRef}
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
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
                    const active = document.activeElement as Element | null
                    if (!active || active === document.body) profileBtnRef.current?.focus()
                  }}
                  aria-hidden="true"
                />
                <div
                  role="dialog"
                  aria-label="User profile"
                  title="User profile"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setProfileOpen(false)
                      profileBtnRef.current?.focus()
                    }
                  }}
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
                  {isPhone && (
                    <Button variant="secondary" icon="message" onClick={() => {
                      setProfileOpen(false)
                      setNotesOpen(true)
                    }}>
                      Team internal notes
                    </Button>
                  )}
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

      {/* Confirmation Dialog for actions requiring confirmation */}
      {activeConfirmAction?.confirm && (
        <ConfirmDialog
          isOpen={true}
          title={activeConfirmAction.confirm.title}
          description={activeConfirmAction.confirm.description}
          confirmLabel={activeConfirmAction.confirm.confirmLabel}
          cancelLabel={activeConfirmAction.confirm.cancelLabel ?? 'Cancel'}
          variant={activeConfirmAction.confirm.variant === 'danger' ? 'danger' : 'default'}
          onClose={() => setActiveConfirmAction(null)}
          onConfirm={() => {
            const actionToRun = activeConfirmAction
            setActiveConfirmAction(null)
            void actionToRun.onClick?.()
          }}
        />
      )}

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
