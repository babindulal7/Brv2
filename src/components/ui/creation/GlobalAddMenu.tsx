/**
 * src/components/ui/creation/GlobalAddMenu.tsx — Babin Rentals OS
 *
 * Universal Add (+) Dropdown Component.
 *
 * Replaces disjoint, scattered creation buttons across different pages with
 * one consistent creation menu integrated into the universal Page Header.
 *
 * Features:
 * - Split button: the page's default creation runs in one tap; ▾ lists the rest
 * - Module comes from the page, else from the current route
 * - Offers only creation flows that write through a real action (R-39, toasts for successes only)
 * - All creation actions panel with live search for complete catalog
 * - Law 6 Money Blindness: financial actions absent for money-blind roles
 * - Law 15 Accessibility: >= 44x44px touch targets
 * - Arrow key navigation, Enter activation, Escape & outside-click dismissal
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useInRouterContext, useLocation } from 'react-router-dom'
import Icon from '../Icon'
import { useAuth } from '../../../lib/auth'
import { useViewport } from '../../../lib/device'
import { floatingLayer } from '../floatingLayer'
import { useFloatingMenu } from '../useFloatingMenu'
import {
  getContextualActions,
  getReadyContextualActions,
  getReadyPermittedActions,
  type CreationActionDefinition,
} from './CreationActionRegistry'
import { CreationActionSearch } from './CreationActionSearch'
import { useOptionalCreationContext } from './CreationContextProvider'

export interface GlobalAddMenuProps {
  /** Optional module override (e.g. 'rentals', 'inventory', 'clients', 'payments') */
  module?: string | undefined
  /** Contextual prefilled data (e.g. { rentalId, bookingNo, clientId, equipmentId }) */
  contextData?: Record<string, unknown> | undefined
  /**
   * Custom action click handler override. A page that supplies one owns its
   * module's default creation, which is then offered even without a shared flow.
   */
  onSelectAction?: ((action: CreationActionDefinition) => void) | undefined
  className?: string | undefined
}

/** Reads the route only where a router exists; a bare page header has none. */
export function GlobalAddMenu(props: GlobalAddMenuProps) {
  return useInRouterContext() ? <RoutedGlobalAddMenu {...props} /> : <GlobalAddMenuView {...props} pathname="" />
}

function RoutedGlobalAddMenu(props: GlobalAddMenuProps) {
  const { pathname } = useLocation()
  return <GlobalAddMenuView {...props} pathname={pathname} />
}

function GlobalAddMenuView({
  module,
  contextData,
  onSelectAction,
  className = '',
  pathname,
}: GlobalAddMenuProps & { pathname: string }) {
  const { user } = useAuth()
  const isPhone = useViewport() === 'phone'
  const creationContext = useOptionalCreationContext()
  // RULING 2026-10-13: a page that names no module gets its route's creation defaults, not Today's.
  const effectiveModule = module || creationContext?.activeModule || pathname

  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const position = useFloatingMenu(open, triggerRef, menuRef)

  // Resolve contextual actions for current module and user role
  const ready = getReadyContextualActions(effectiveModule, user?.role)
  const pageOwned = onSelectAction ? getContextualActions(effectiveModule, user?.role).defaultAction : null
  const defaultAction = pageOwned ?? ready.defaultAction
  const otherActions = pageOwned
    ? [ready.defaultAction, ...ready.otherActions].filter(
        (a): a is CreationActionDefinition => a !== null && a.id !== pageOwned.id
      )
    : ready.otherActions

  // New Rental belongs to navigation (RULINGS-2026-10-07), so it never takes the one-tap segment;
  // such a page keeps one Add menu. Any other default creation is one tap away (R-39).
  const oneTap = defaultAction && defaultAction.id !== 'rental.new' ? defaultAction : null
  const menuItems = (oneTap || !defaultAction ? otherActions : [defaultAction, ...otherActions]).map((a) => ({ action: a }))

  const readyPermitted = getReadyPermittedActions(user?.role)
  // The searchable catalogue earns its place only when it holds more than the page already offers.
  const hasCatalogue = readyPermitted.length > 1 + otherActions.length
  // A phone keeps the one-tap creation and gives the ▾ width back to the title; the rest stay in navigation and search.
  const hasMenu = (menuItems.length > 0 || hasCatalogue) && !(isPhone && oneTap)

  const closeMenu = useCallback((returnFocus = false) => {
    setOpen(false)
    setFocusedIndex(-1)
    if (returnFocus) {
      triggerRef.current?.focus()
    }
  }, [])

  const pageOwnedId = pageOwned?.id
  const handleExecuteAction = useCallback((action: CreationActionDefinition) => {
    closeMenu(false)
    // The page's handler runs what it owns; every other choice opens its shared flow.
    if (onSelectAction && (!pageOwnedId || action.id === pageOwnedId)) {
      onSelectAction(action)
      return
    }

    // Resolve prefilled context from contextData or registry resolver
    const resolvedContext = action.resolveContext
      ? action.resolveContext({
          ...contextData,
          role: user?.role,
        })
      : (contextData ?? {})

    if (creationContext) {
      creationContext.openCreationAction(action.id, resolvedContext)
    }
  }, [closeMenu, contextData, creationContext, onSelectAction, pageOwnedId, user?.role])

  // Click outside and Escape listeners
  useEffect(() => {
    if (!open) return

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        closeMenu(false)
      }
    }

    // Positions: the page's other actions, then "All creation actions…" when offered.
    const itemCount = menuItems.length + (hasCatalogue ? 1 : 0)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu(true)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((idx) => (idx + 1) % itemCount)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((idx) => (idx <= 0 ? itemCount - 1 : idx - 1))
      } else if (e.key === 'Enter') {
        if (focusedIndex >= 0 && focusedIndex < menuItems.length) {
          e.preventDefault()
          const item = menuItems[focusedIndex]
          if (item) {
            handleExecuteAction(item.action)
          }
        } else if (hasCatalogue && focusedIndex === menuItems.length) {
          e.preventDefault()
          closeMenu(false)
          setSearchOpen(true)
        }
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, focusedIndex, menuItems, hasCatalogue, closeMenu, handleExecuteAction])

  // Nothing this role can create here through a working flow: render nothing, not a dead button.
  if (!defaultAction) {
    return null
  }

  const segment = {
    minHeight: 44,
    border: '1px solid transparent',
    background: 'var(--btn-primary-bg, var(--primary, #2456d6))',
    color: 'var(--btn-primary-fg, #ffffff)',
    fontWeight: 600,
    fontSize: 'var(--t-meta, 13px)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background var(--dur-fast, 120ms) ease, opacity var(--dur-fast, 120ms) ease',
  } as const

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} className={className}>
      {oneTap ? (
        /* Split trigger: the page's default creation in one tap (R-39); ▾ for the rest */
        <button
          type="button"
          className="global-add-menu__primary"
          onClick={() => handleExecuteAction(oneTap)}
          {...(isPhone ? { 'aria-label': oneTap.label, title: oneTap.label } : {})}
          style={{
            ...segment,
            minWidth: 44,
            padding: isPhone ? '0 10px' : '0 14px',
            borderRadius: hasMenu ? 'var(--r-btn, 8px) 0 0 var(--r-btn, 8px)' : 'var(--r-btn, 8px)',
          }}
        >
          <Icon name="plus" size={16} />
          {!isPhone && <span>{oneTap.label}</span>}
        </button>
      ) : (
        /* One Add menu where the default creation already has a navigation door */
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="Create new record"
          onClick={() => setOpen((prev) => !prev)}
          style={{ ...segment, minWidth: 44, padding: isPhone ? '0 10px' : '0 14px', borderRadius: 'var(--r-btn, 8px)' }}
        >
          <Icon name="plus" size={16} />
          {!isPhone && <span>Add</span>}
          <Icon name="chevron_down" size={14} />
        </button>
      )}
      {oneTap && hasMenu && (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="More create options"
          title="More create options"
          onClick={() => setOpen((prev) => !prev)}
          style={{
            ...segment,
            width: 44,
            padding: 0,
            borderLeft: '1px solid rgba(255, 255, 255, 0.35)',
            borderRadius: '0 var(--r-btn, 8px) var(--r-btn, 8px) 0',
          }}
        >
          <Icon name="chevron_down" size={14} />
        </button>
      )}

      {/* Floating Menu Portal */}
      {open &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            className="global-add-menu"
            aria-label="Creation actions"
            style={{
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: position?.width ? Math.max(position.width, 240) : 250,
              zIndex: floatingLayer(triggerRef.current),
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card, 8px)',
              boxShadow: 'var(--shadow-modal, 0 8px 24px rgba(0,0,0,0.18))',
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              animation: 'fadeIn 100ms ease-out',
            }}
          >
            {/* Contextual Actions Section */}
            {menuItems.map((item, idx) => {
              const isFocused = focusedIndex === idx

              return (
                <button
                  key={item.action.id}
                  type="button"
                  role="menuitem"
                  className="global-add-menu__item"
                  onClick={() => handleExecuteAction(item.action)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  style={{
                    minHeight: 44,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '0 12px',
                    borderRadius: 'var(--r-sm, 6px)',
                    border: isFocused ? '1px solid var(--border)' : '1px solid transparent',
                    background: isFocused ? 'var(--card2)' : 'transparent',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta, 13px)',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background var(--dur-fast, 120ms) ease',
                  }}
                >
                  <Icon name={item.action.icon} size={16} />
                  <span>{item.action.label}</span>
                </button>
              )
            })}

            {hasCatalogue && menuItems.length > 0 && (
              <div
                style={{
                  height: 1,
                  background: 'var(--border)',
                  margin: '4px 0',
                }}
              />
            )}

            {/* All Creation Actions Option */}
            {hasCatalogue && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu(false)
                  setSearchOpen(true)
                }}
                onMouseEnter={() => setFocusedIndex(menuItems.length)}
                style={{
                  minHeight: 44,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '0 12px',
                  borderRadius: 'var(--r-sm, 6px)',
                  border: focusedIndex === menuItems.length ? '1px solid var(--border)' : '1px solid transparent',
                  background: focusedIndex === menuItems.length ? 'var(--card2)' : 'transparent',
                  color: 'var(--text2)',
                  fontSize: 'var(--t-meta, 13px)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon name="search" size={15} />
                <span>All creation actions…</span>
              </button>
            )}
          </div>,
          document.body
        )}

      {/* Complete Searchable Creation Modal */}
      {searchOpen && (
        <CreationActionSearch
          isOpen={true}
          onClose={() => setSearchOpen(false)}
          onSelectAction={handleExecuteAction}
        />
      )}
    </div>
  )
}
