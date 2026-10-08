import React, { Children, isValidElement, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react'
import Icon from './Icon'
import { OverflowMenu, type OverflowMenuItem } from './OverflowMenu'
import { Unavailable } from './Unavailable'
import { createPortal } from 'react-dom'
import { floatingLayer } from './floatingLayer'
import { useFloatingMenu } from './useFloatingMenu'

export interface PageActionsProps {
  /** Maximum one filled primary action in a visible action area */
  primary?: ReactNode
  /** Normal alternate actions (secondary buttons, export, import) */
  secondary?: ReactNode[] | ReactNode
  /** Overflow menu items or custom overflow menu node */
  overflow?: OverflowMenuItem[] | ReactNode
  /** Additional items (badges, share buttons, info pills) */
  extra?: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Checks whether a ReactNode is an unbuilt placeholder (<Unavailable> wrapper).
 */
const PLACEHOLDER_PATTERNS = [
  'not built',
  'unbuilt',
  'coming soon',
  'under construction',
  'placeholder',
  'not ready',
  'wip',
  'work in progress',
  'not yet implemented',
  'not implemented',
  'drop',
]

interface ComponentWithMeta {
  displayName?: string
  name?: string
}

interface NodePropsWithReason {
  reason?: unknown
}

export function isUnavailableElement(node: ReactNode): boolean {
  if (!isValidElement(node)) return false
  const nodeType = node.type
  const isUnavailableType =
    nodeType === Unavailable ||
    (typeof nodeType === 'function' &&
      ((nodeType as ComponentWithMeta).displayName === 'Unavailable' || (nodeType as ComponentWithMeta).name === 'Unavailable'))
  if (!isUnavailableType) return false

  const props = node.props as NodePropsWithReason
  const reason = typeof props?.reason === 'string' ? props.reason.toLowerCase().trim() : ''
  if (!reason) return true

  return PLACEHOLDER_PATTERNS.some((pat) => reason.includes(pat))
}

/**
 * Recursively flattens fragments/arrays and strips unbuilt placeholder actions (<Unavailable> wrappers).
 */
export function extractValidActions(children: ReactNode): ReactNode[] {
  const result: ReactNode[] = []

  function walk(node: ReactNode) {
    if (node === null || node === undefined || typeof node === 'boolean') {
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (isValidElement(node)) {
      if (node.type === React.Fragment) {
        const fragmentProps = node.props as { children?: ReactNode }
        Children.forEach(fragmentProps.children, walk)
        return
      }
      if (isUnavailableElement(node)) {
        // Drop unbuilt placeholder action
        return
      }
      result.push(node)
      return
    }
    result.push(node)
  }

  walk(children)
  return result
}

interface ActionsOverflowMenuProps {
  actions: ReactNode[]
  overflowItems?: OverflowMenuItem[] | undefined
  customOverflowNode?: ReactNode | undefined
  ariaLabel?: string | undefined
  style?: CSSProperties | undefined
}

/**
 * Dedicated overflow menu (•••) that hosts excess secondary actions and overflow items.
 * Meets Law 15 (>= 44x44px touch targets) and WCAG menu accessibility standards.
 */
function ActionsOverflowMenu({
  actions,
  overflowItems,
  customOverflowNode,
  ariaLabel = 'More actions',
  style,
}: ActionsOverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const position = useFloatingMenu(open, triggerRef, menuRef)

  const closeMenu = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLButtonElement | HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && ref.current && !ref.current.contains(e.target as Node)) {
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

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const enabled = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement | HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []
    )
    if (enabled.length === 0) return
    event.preventDefault()
    const current = enabled.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
        ? enabled.length - 1
        : event.key === 'ArrowDown'
        ? (current + 1) % enabled.length
        : (current - 1 + enabled.length) % enabled.length
    enabled[next]?.focus()
  }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', ...style }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? closeMenu(true) : setOpen(true))}
        style={{
          width: 44,
          height: 44,
          minWidth: 44,
          minHeight: 44,
          borderRadius: 'var(--r-btn)',
          border: '1px solid var(--btn-secondary-border, var(--border))',
          background: open ? 'var(--hover-card)' : 'var(--btn-secondary-bg, transparent)',
          color: 'var(--text2)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
        }}
      >
        <Icon name="more_vert" size={16} />
      </button>

      {open && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={onMenuKeyDown}
          style={{
            position: 'fixed',
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            width: position?.width ?? 230,
            maxHeight: position?.maxHeight,
            visibility: position ? 'visible' : 'hidden',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            zIndex: floatingLayer(triggerRef.current),
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-card)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {actions.map((action, idx) => {
            if (isValidElement(action)) {
              type ActionElementProps = {
                onClick?: (e: React.MouseEvent<HTMLElement>) => void
                style?: React.CSSProperties
                [key: string]: unknown
              }
              const actionProps = action.props as ActionElementProps
              return React.cloneElement(action as React.ReactElement<ActionElementProps>, {
                key: action.key ?? `overflow-action-${idx}`,
                role: 'menuitem',
                tabIndex: 0,
                onClick: (e: React.MouseEvent<HTMLElement>) => {
                  closeMenu(false)
                  if (typeof actionProps.onClick === 'function') {
                    actionProps.onClick(e)
                  }
                },
                style: {
                  width: '100%',
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  padding: '0 10px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                  cursor: 'pointer',
                  ...(actionProps.style || {}),
                },
              })
            }
            return (
              <div
                key={idx}
                role="menuitem"
                tabIndex={0}
                onClick={() => closeMenu(false)}
                style={{
                  width: '100%',
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 'var(--t-meta)',
                  cursor: 'pointer',
                }}
              >
                {action}
              </div>
            )
          })}

          {overflowItems?.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="overflow-menu__item"
              disabled={Boolean(it.unavailable)}
              aria-disabled={it.unavailable ? 'true' : undefined}
              title={it.unavailable}
              onClick={() => {
                if (it.unavailable) return
                closeMenu(false)
                it.onClick()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-sm)',
                border: 'none',
                background: 'transparent',
                color: it.unavailable ? 'var(--muted)' : 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
                fontWeight: 500,
                cursor: it.unavailable ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <Icon name={it.icon} size={15} style={{ color: it.unavailable ? 'var(--muted)' : 'var(--text2)' }} />
              {it.label}
            </button>
          ))}

          {customOverflowNode && (
            <div role="none" onClick={() => closeMenu(false)}>
              {customOverflowNode}
            </div>
          )}
        </div>, document.body
      )}
    </span>
  )
}

/**
 * Standardized PageHeader action container enforcing the global consistency rules:
 * - At most ONE filled primary action in any visible action area.
 * - At most TWO visible secondary actions.
 * - Remaining secondary actions routed into an overflow menu (•••).
 * - Remove unbuilt placeholder actions (<Unavailable> wrappers).
 */
export function PageActions({
  primary,
  secondary,
  overflow,
  extra,
  className = '',
  style,
}: PageActionsProps) {
  // 1. Enforce 1 primary CTA and strip unbuilt placeholder actions
  const validPrimary = extractValidActions(primary)
  const primaryCta = validPrimary.length > 0 ? validPrimary[0] : null

  // 2. Enforce at most 2 visible secondary actions, routing excess into overflow
  const validSecondary = extractValidActions(secondary)
  const visibleSecondary = validSecondary.slice(0, 2)
  const excessSecondary = validSecondary.slice(2)

  // 3. Strip unbuilt placeholder actions from extra
  const validExtra = extractValidActions(extra)

  // 4. Resolve overflow: if excess secondary exists, use unified ActionsOverflowMenu;
  // otherwise render normal OverflowMenu or custom node.
  const isOverflowArray = Array.isArray(overflow)
  const hasExcessSecondary = excessSecondary.length > 0

  return (
    <div
      className={`page-actions ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-sm)',
        flexWrap: 'wrap',
        ...style,
      }}
    >
      {validExtra.map((item, idx) => (
        <span key={isValidElement(item) && item.key != null ? String(item.key) : `extra-${idx}`} style={{ display: 'inline-flex' }}>
          {item}
        </span>
      ))}

      {visibleSecondary.map((action, idx) => (
        <span key={isValidElement(action) && action.key != null ? String(action.key) : `sec-${idx}`} style={{ display: 'inline-flex' }}>
          {action}
        </span>
      ))}

      {hasExcessSecondary ? (
        <ActionsOverflowMenu
          actions={excessSecondary}
          overflowItems={isOverflowArray ? (overflow as OverflowMenuItem[]) : undefined}
          customOverflowNode={!isOverflowArray && overflow ? (overflow as ReactNode) : undefined}
        />
      ) : isOverflowArray ? (
        <OverflowMenu items={overflow as OverflowMenuItem[]} />
      ) : overflow ? (
        overflow
      ) : null}

      {primaryCta}
    </div>
  )
}

export default PageActions
