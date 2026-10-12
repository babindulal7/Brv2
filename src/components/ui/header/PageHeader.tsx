/**
 * src/components/ui/header/PageHeader.tsx — Babin Rentals OS
 *
 * Universal Page Header Standard component.
 * Implements the unified 3-zone layout:
 * [Back / Title / Status] [Search] [Add ▼] [Contextual Actions] [More ⋯] [Save / Confirm]
 *
 * Sticky beneath global navigation, responsive, accessible (Law 15: >= 44px floor),
 * money-blind (Law 6), single prominent primary CTA, and typed action registry driven.
 */

import React, { cloneElement, isValidElement, useEffect, useLayoutEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import Icon, { type IconName } from '../Icon'
import { InfoTooltip } from '../InfoTooltip'
import { Button } from '../Button'
import { ConfirmDialog } from '../ConfirmDialog'
import { OverflowMenu, type OverflowMenuItem } from '../OverflowMenu'
import { extractValidActions } from '../PageActions'
import { useAuth } from '../../../lib/auth'
import { useOptionalWorkspace } from '../../../lib/workspaceContext'
import type {
  PageHeaderSearchConfig,
  PageHeaderBulkSelection,
  WorkspaceHeaderData,
} from '../../../lib/workspaceContext'
import { floatingLayer } from '../floatingLayer'
import { useFloatingMenu } from '../useFloatingMenu'
import {
  type PageActionItem,
  type PageActionContext,
  resolvePageActions,
  isActionEnabled,
} from './pageActionRegistry'
import { GlobalAddMenu } from '../creation/GlobalAddMenu'
import './pageHeader.css'

export type {
  PageHeaderSearchConfig,
  PageHeaderBulkSelection,
  WorkspaceHeaderData,
}

export interface PageHeaderProps {
  /** Page title (renders in display font with clamp sizing) */
  title: string

  /** Optional leading element (e.g. Filter toggle button) */
  leading?: ReactNode | undefined

  /** Module or entity icon */
  icon?: IconName | undefined

  /** Status badge, pill, or indicator */
  status?: ReactNode | undefined

  /** Small pill or text above the title */
  eyebrow?: ReactNode | undefined

  /** Contextual explanation (syncs to workspace context or InfoTooltip) */
  description?: ReactNode | undefined

  /** Legacy breadcrumb node or custom back component */
  breadcrumb?: ReactNode | undefined

  /** Link path for standard back arrow */
  backHref?: string | undefined

  /** Accessible label for back button (e.g. "Back to rentals") */
  backLabel?: string | undefined

  /** Back button click handler */
  onBack?: (() => void) | undefined

  /** Indicates dirty form state with amber indicator */
  unsavedChanges?: boolean | undefined
  isDirty?: boolean | undefined

  /** Center zone search input config or custom search node */
  search?: PageHeaderSearchConfig | ReactNode | undefined

  /** Typed action registry configuration */
  actionsConfig?: PageActionItem[] | undefined

  /** Current workflow stage (e.g. 'Quote', 'Booked', 'Packed', etc.) */
  workflowState?: string | undefined

  /** Bulk selection bar configuration when rows are selected */
  bulkSelection?: PageHeaderBulkSelection | undefined

  /** Legacy actions slot (children/PageActions). Fully supported for backwards compatibility */
  actions?: ReactNode | undefined

  /** Module key for GlobalAddMenu contextual defaults (e.g. 'rentals', 'inventory', 'clients', 'payments') */
  module?: string | undefined

  /** Contextual prefilled data for GlobalAddMenu (e.g. { rentalId, bookingNo, clientId }) */
  creationContext?: Record<string, unknown> | undefined

  /** Whether to render the Universal GlobalAddMenu dropdown in Zone 3 (defaults to true) */
  showAddMenu?: boolean | undefined

  className?: string | undefined
  style?: CSSProperties | undefined
}

/**
 * Dropdown button component for multi-type creation actions (Add ▼).
 */
export function AddDropdownButton({ action }: { action: PageActionItem }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const position = useFloatingMenu(open, triggerRef, menuRef)

  const items = action.dropdownItems ?? []

  const closeMenu = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        closeMenu(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu(true)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) {
    return (
      <Button
        variant="primary"
        icon={action.icon ?? 'plus'}
        onClick={action.onClick}
        disabled={action.enabled === false}
        {...(action.disabledReason ? { title: action.disabledReason } : {})}
      >
        {action.label}
      </Button>
    )
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        style={{
          minHeight: 44,
          padding: '0 14px',
          borderRadius: 'var(--r-btn, 8px)',
          border: '1px solid transparent',
          background: 'var(--btn-primary-bg, var(--primary, #2456d6))',
          color: 'var(--btn-primary-fg, #fff)',
          fontWeight: 600,
          fontSize: 'var(--t-meta, 13px)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'opacity var(--dur-fast, 120ms) var(--ease)',
        }}
      >
        <Icon name={action.icon ?? 'plus'} size={15} />
        <span>{action.label}</span>
        <Icon name="chevron_down" size={14} />
      </button>

      {open &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: position?.width ? Math.max(position.width, 180) : 200,
              zIndex: floatingLayer(triggerRef.current),
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card, 8px)',
              boxShadow: 'var(--shadow-card, 0 4px 12px rgba(0,0,0,0.15))',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                {...(item.disabledReason ? { title: item.disabledReason } : {})}
                onClick={() => {
                  closeMenu(false)
                  void item.onClick()
                }}
                style={{
                  minHeight: 44,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 12px',
                  borderRadius: 'var(--r-sm, 6px)',
                  border: 'none',
                  background: 'transparent',
                  color: item.disabled ? 'var(--muted)' : 'var(--text)',
                  fontSize: 'var(--t-meta, 13px)',
                  fontWeight: 500,
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                }}
              >
                {item.icon && <Icon name={item.icon} size={15} />}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}

export function PageHeader({
  title,
  leading,
  icon,
  status,
  eyebrow,
  description,
  breadcrumb,
  backHref,
  backLabel = 'Back',
  onBack,
  unsavedChanges = false,
  isDirty = false,
  search,
  actionsConfig,
  workflowState,
  bulkSelection,
  actions,
  module,
  creationContext,
  showAddMenu,
  className = '',
  style,
}: PageHeaderProps) {
  const ws = useOptionalWorkspace()
  const setPageInfo = ws?.setPageInfo
  const setHeaderData = ws?.setHeaderData
  const { user } = useAuth()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [activeConfirmAction, setActiveConfirmAction] = useState<PageActionItem | null>(null)

  // Sync page description into workspace if present
  useLayoutEffect(() => {
    setPageInfo?.(description ?? null)
  }, [setPageInfo, description])

  // Sync header data into workspace shell when available
  // RULING 2026-10-12: register through stable setters; context updates must not reset the header.
  useLayoutEffect(() => {
    if (!setHeaderData) return
    setHeaderData({
      title,
      leading,
      icon,
      status,
      eyebrow,
      description,
      breadcrumb,
      backHref,
      backLabel,
      onBack,
      unsavedChanges,
      isDirty,
      search,
      actionsConfig,
      workflowState,
      bulkSelection,
      actions,
      module,
      creationContext,
      showAddMenu,
    })
  }, [
    setHeaderData,
    title,
    leading,
    icon,
    status,
    eyebrow,
    description,
    breadcrumb,
    backHref,
    backLabel,
    onBack,
    unsavedChanges,
    isDirty,
    search,
    actionsConfig,
    workflowState,
    bulkSelection,
    actions,
    module,
    creationContext,
    showAddMenu,
  ])

  useLayoutEffect(() => () => {
    setHeaderData?.(null)
    setPageInfo?.(null)
  }, [setHeaderData, setPageInfo])

  // Global hotkey '/' to focus search input if not inside form controls
  useEffect(() => {
    if (ws) return // Global header handles search shortcut in shell
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/') {
        const target = e.target instanceof Element ? e.target : null
        if (
          target &&
          (target.matches('input, textarea, select') ||
            (target as HTMLElement).isContentEditable ||
            target.closest?.('[role="dialog"]'))
        ) {
          return
        }
        if (searchInputRef.current) {
          e.preventDefault()
          searchInputRef.current.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [ws])

  // If inside the application workspace shell, the global single-row header renders all controls.
  // Suppress rendering a second duplicate toolbar in the page body to enforce single-row header standard.
  if (ws) {
    return (
      <div
        className={`page-header universal-page-header page-header--in-shell ${className}`}
        style={{ display: 'none', height: 0, padding: 0, margin: 0, border: 0, overflow: 'hidden' }}
        aria-hidden="true"
      >
        {leading}
      </div>
    )
  }

  const hasDirty = unsavedChanges || isDirty

  // Evaluate action registry
  const actionContext: PageActionContext = {
    role: user?.role,
    workflowState,
    isDirty: hasDirty,
  }

  const resolved = actionsConfig ? resolvePageActions(actionsConfig, actionContext) : null

  // Handler execution with confirmation dialog gate
  const handleActionClick = (action: PageActionItem, e?: React.MouseEvent) => {
    if (action.confirm) {
      setActiveConfirmAction(action)
      return
    }
    void action.onClick?.(e)
  }

  // Check if center search is configured as an object
  const isSearchConfig = Boolean(search && typeof search === 'object' && 'value' in search && 'onChange' in search)
  const searchConfig = isSearchConfig ? (search as PageHeaderSearchConfig) : null

  // Extract valid legacy actions if provided
  const validLegacyActions = actions ? extractValidActions(actions) : []
  const hasLegacyActions = validLegacyActions.length > 0

  return (
    <>
      <header
        className={`page-header universal-page-header animate-entrance ${className}`}
        style={style}
        role="banner"
        aria-label={`${title} page header`}
      >
        {/* Bulk Selection Bar Mode Overlay */}
        {bulkSelection && bulkSelection.count > 0 ? (
          <div className="universal-page-header__bulk-bar" style={{ width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="check" size={16} />
              <span>{bulkSelection.count} selected</span>
              <button
                type="button"
                onClick={bulkSelection.onClear}
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
                Clear selection
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {bulkSelection.actions.map((act: PageActionItem) => (
                <Button
                  key={act.id}
                  variant={act.variant ?? 'secondary'}
                  icon={act.icon}
                  onClick={() => handleActionClick(act)}
                  disabled={act.enabled === false}
                  {...(act.disabledReason ? { title: act.disabledReason } : {})}
                >
                  {act.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Zone 1: Left Zone [Back / Title / Status] */}
            <div className="universal-page-header__left">
              {/* Back navigation */}
              {backHref && (
                <Link to={backHref} className="universal-page-header__back-btn" aria-label={backLabel}>
                  <Icon name="chevron_left" size={16} />
                  <span>{backLabel}</span>
                </Link>
              )}
              {onBack && !backHref && (
                <button
                  type="button"
                  className="universal-page-header__back-btn"
                  onClick={onBack}
                  aria-label={backLabel}
                >
                  <Icon name="chevron_left" size={16} />
                  <span>{backLabel}</span>
                </button>
              )}

              {breadcrumb}
              {leading}

              {icon && (
                <span className="universal-page-header__icon" aria-hidden="true">
                  <Icon name={icon} size={18} fill />
                </span>
              )}

              <div className="universal-page-header__title-group">
                {eyebrow && <span className="eyebrow-pill">{eyebrow}</span>}
                <h1 className="universal-page-header__title">{title}</h1>
                {!ws && description && <InfoTooltip content={description} size={16} />}
                {status}
                {hasDirty && (
                  <span className="universal-page-header__dirty-indicator" title="Unsaved modifications">
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: '#d97706',
                      }}
                    />
                    Unsaved changes
                  </span>
                )}
              </div>
            </div>

            {/* Zone 2: Center Zone [Search] */}
            {search && (
              <div className="universal-page-header__center">
                {searchConfig ? (
                  <div className="universal-page-header__search-wrap">
                    <Icon name="search" size={15} className="universal-page-header__search-icon" />
                    <input
                      ref={searchConfig.inputRef ?? searchInputRef}
                      type="search"
                      className="universal-page-header__search-input"
                      placeholder={searchConfig.placeholder ?? 'Search or press / to jump…'}
                      value={searchConfig.value}
                      onChange={(e) => searchConfig.onChange(e.target.value)}
                      onKeyDown={searchConfig.onKeyDown}
                      aria-label={searchConfig.ariaLabel ?? `Search ${title}`}
                    />
                    {searchConfig.value && (
                      <button
                        type="button"
                        className="universal-page-header__search-clear"
                        onClick={() => {
                          searchConfig.onChange('')
                          searchConfig.onClear?.()
                          searchInputRef.current?.focus()
                        }}
                        aria-label="Clear search query"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  (search as ReactNode)
                )}
              </div>
            )}

            {/* Zone 3: Right Zone [Add ▼] [Contextual Actions] [More ⋯] [Save / Confirm] */}
            <div className="universal-page-header__right">
              {resolved ? (
                <>
                  {/* Add action with dropdown support or Universal GlobalAddMenu */}
                  {resolved.add ? (
                    <AddDropdownButton action={resolved.add} />
                  ) : showAddMenu !== false ? (
                    <GlobalAddMenu module={module} contextData={creationContext} />
                  ) : null}

                  {/* Contextual secondary actions (up to 2) */}
                  {resolved.secondary.map((sec) => {
                    const statusCheck = isActionEnabled(sec, actionContext)
                    return (
                      <Button
                        key={sec.id}
                        variant={sec.variant ?? 'secondary'}
                        icon={sec.icon}
                        onClick={(e) => handleActionClick(sec, e)}
                        disabled={!statusCheck.enabled}
                        {...(statusCheck.reason ? { title: statusCheck.reason } : {})}
                      >
                        {sec.label}
                      </Button>
                    )
                  })}

                  {/* Overflow menu for excess & secondary actions */}
                  {resolved.overflow.length > 0 && (
                    <OverflowMenu
                      ariaLabel="More actions"
                      items={resolved.overflow.map(
                        (item): OverflowMenuItem => ({
                          label: item.label,
                          icon: item.icon ?? ('more_vert' as IconName),
                          onClick: () => handleActionClick(item),
                          ...(item.disabledReason ? { unavailable: item.disabledReason } : {}),
                        })
                      )}
                    />
                  )}

                  {/* Prominent primary CTA (Confirm / Save / etc.) */}
                  {resolved.primary && (
                    <Button
                      variant={resolved.primary.variant ?? 'primary'}
                      icon={resolved.primary.icon}
                      onClick={(e) => handleActionClick(resolved.primary!, e)}
                      disabled={resolved.primary.loading || resolved.primary.enabled === false}
                      {...(resolved.primary.disabledReason ? { title: resolved.primary.disabledReason } : {})}
                    >
                      {resolved.primary.loading
                        ? resolved.primary.loadingLabel ?? `${resolved.primary.label}…`
                        : resolved.primary.label}
                    </Button>
                  )}
                </>
              ) : hasLegacyActions ? (
                <>
                  {showAddMenu && <GlobalAddMenu module={module} contextData={creationContext} />}
                  {validLegacyActions.map((action, idx) =>
                    isValidElement(action)
                      ? cloneElement(action, { key: action.key ?? `hdr-act-${idx}` })
                      : <span key={`hdr-act-${idx}`}>{action}</span>
                  )}
                </>
              ) : showAddMenu !== false ? (
                <GlobalAddMenu module={module} contextData={creationContext} />
              ) : null}
            </div>
          </>
        )}
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
    </>
  )
}

export default PageHeader
