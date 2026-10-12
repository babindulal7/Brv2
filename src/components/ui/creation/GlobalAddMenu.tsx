/**
 * src/components/ui/creation/GlobalAddMenu.tsx — Babin Rentals OS
 *
 * Universal Add (+) Dropdown Component.
 *
 * Replaces disjoint, scattered creation buttons across different pages with
 * one consistent creation menu integrated into the universal Page Header.
 *
 * Features:
 * - Adapts to current module, user permissions, and active records
 * - Highlighted default contextual creation action first
 * - Contextual secondary options per module specification
 * - All creation actions panel with live search for complete catalog
 * - Law 6 Money Blindness: financial actions absent for money-blind roles
 * - Law 15 Accessibility: >= 44x44px touch targets
 * - Arrow key navigation, Enter activation, Escape & outside-click dismissal
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon'
import { useAuth } from '../../../lib/auth'
import { floatingLayer } from '../floatingLayer'
import { useFloatingMenu } from '../useFloatingMenu'
import {
  getContextualActions,
  getAllPermittedActions,
  type CreationActionDefinition,
} from './CreationActionRegistry'
import { CreationActionSearch } from './CreationActionSearch'
import { useOptionalCreationContext } from './CreationContextProvider'

export interface GlobalAddMenuProps {
  /** Optional module override (e.g. 'rentals', 'inventory', 'clients', 'payments') */
  module?: string | undefined
  /** Contextual prefilled data (e.g. { rentalId, bookingNo, clientId, equipmentId }) */
  contextData?: Record<string, unknown> | undefined
  /** Custom action click handler override */
  onSelectAction?: ((action: CreationActionDefinition) => void) | undefined
  className?: string | undefined
}

export function GlobalAddMenu({
  module,
  contextData,
  onSelectAction,
  className = '',
}: GlobalAddMenuProps) {
  const { user } = useAuth()
  const creationContext = useOptionalCreationContext()
  const effectiveModule = module ?? creationContext?.activeModule ?? 'today'

  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const position = useFloatingMenu(open, triggerRef, menuRef)

  // Resolve contextual actions for current module and user role
  const { defaultAction, otherActions } = getContextualActions(
    effectiveModule,
    user?.role
  )

  const allPermitted = getAllPermittedActions(user?.role)
  const hasAnyActions = allPermitted.length > 0

  const menuItems = useMemo(
    () => [
      ...(defaultAction ? [{ action: defaultAction, isDefault: true }] : []),
      ...otherActions.map((a) => ({ action: a, isDefault: false })),
    ],
    [defaultAction, otherActions]
  )

  const closeMenu = useCallback((returnFocus = false) => {
    setOpen(false)
    setFocusedIndex(-1)
    if (returnFocus) {
      triggerRef.current?.focus()
    }
  }, [])

  const handleExecuteAction = useCallback((action: CreationActionDefinition) => {
    closeMenu(false)
    if (onSelectAction) {
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
  }, [closeMenu, contextData, creationContext, onSelectAction, user?.role])

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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu(true)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((idx) => (idx + 1) % (menuItems.length + 1)) // +1 for "All creation actions"
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((idx) =>
          idx <= 0 ? menuItems.length : idx - 1
        )
      } else if (e.key === 'Enter') {
        if (focusedIndex >= 0 && focusedIndex < menuItems.length) {
          e.preventDefault()
          const item = menuItems[focusedIndex]
          if (item) {
            handleExecuteAction(item.action)
          }
        } else if (focusedIndex === menuItems.length) {
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
  }, [open, focusedIndex, menuItems, closeMenu, handleExecuteAction])

  // If no action is permitted for user, do not render or render inert
  if (!hasAnyActions) {
    return null
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} className={className}>
      {/* Universal Trigger Button (Add ▼) */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Create new record"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          minHeight: 44,
          padding: '0 14px',
          borderRadius: 'var(--r-btn, 8px)',
          border: '1px solid var(--accent, #e65100)',
          background: 'var(--accent, #e65100)',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: 'var(--t-meta, 13px)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background var(--dur-fast, 120ms) ease, opacity var(--dur-fast, 120ms) ease',
        }}
      >
        <Icon name="plus" size={16} />
        <span>Add</span>
        <Icon name="chevron_down" size={14} />
      </button>

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
                  className={`global-add-menu__item ${item.isDefault ? 'global-add-menu__item--default' : ''}`}
                  onClick={() => handleExecuteAction(item.action)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  style={{
                    minHeight: 44,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    borderRadius: 'var(--r-sm, 6px)',
                    border: item.isDefault
                      ? '1px solid var(--accent-subtle, rgba(230,81,0,0.3))'
                      : isFocused
                        ? '1px solid var(--border)'
                        : '1px solid transparent',
                    background: item.isDefault
                      ? 'var(--accent-subtle, rgba(230,81,0,0.08))'
                      : isFocused
                        ? 'var(--card2)'
                        : 'transparent',
                    color: item.isDefault ? 'var(--accent, #e65100)' : 'var(--text)',
                    fontSize: 'var(--t-meta, 13px)',
                    fontWeight: item.isDefault ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background var(--dur-fast, 120ms) ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Icon name={item.action.icon} size={16} />
                    <span>{item.action.label}</span>
                  </div>

                  {item.isDefault && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--accent, #e65100)',
                        color: '#fff',
                      }}
                    >
                      Default
                    </span>
                  )}
                </button>
              )
            })}

            {/* Divider */}
            <div
              style={{
                height: 1,
                background: 'var(--border)',
                margin: '4px 0',
              }}
            />

            {/* All Creation Actions Option */}
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
