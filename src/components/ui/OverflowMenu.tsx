import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { floatingLayer } from './floatingLayer'
import { useFloatingMenu } from './useFloatingMenu'
import Icon from './Icon'
import type { IconName } from './Icon'
import { Unavailable } from './Unavailable'

export interface OverflowMenuItem {
  label: string
  icon: IconName
  onClick: () => void
  /** Disabled entries stay visible and greyed with the reason on hover/focus/long-press. */
  unavailable?: string
  /** A nested group, opened in place rather than as a second floating layer. */
  submenu?: { label: string; onClick: () => void; unavailable?: string }[]
}

export interface OverflowMenuProps {
  items: OverflowMenuItem[]
  ariaLabel?: string
  style?: CSSProperties
}

export function OverflowMenu({ items, ariaLabel = 'More actions', style }: OverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const position = useFloatingMenu(open, triggerRef, menuRef, expanded)

  const closeMenu = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [open])

  useEffect(() => {
    if (expanded) menuRef.current?.querySelector<HTMLButtonElement>('[data-submenu-item]:not(:disabled)')?.focus()
  }, [expanded])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && ref.current && !ref.current.contains(e.target as Node)) closeMenu()
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

  useEffect(() => {
    if (!open) setExpanded(null)
  }, [open])

  if (!items || items.length === 0) return null

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const enabled = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
    if (enabled.length === 0) return
    event.preventDefault()
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? enabled.length - 1
        : event.key === 'ArrowDown' ? (current + 1) % enabled.length
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
        onClick={() => open ? closeMenu(true) : setOpen(true)}
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--r-btn)',
          border: '1px solid var(--btn-secondary-border)',
          background: open ? 'var(--hover-card)' : 'var(--btn-secondary-bg)',
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
            // User shell audit: escape clipping cards/tables and fit the viewport.
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
          {items.map((it) => {
            const hasSub = Boolean(it.submenu && it.submenu.length > 0)
            const isSubExpanded = expanded === it.label
            const disabled = Boolean(it.unavailable)

            const itemButton = (
              <button
                type="button"
                role="menuitem"
                className="overflow-menu__item"
                disabled={disabled}
                aria-disabled={disabled ? 'true' : undefined}
                title={it.unavailable}
                aria-haspopup={hasSub ? 'menu' : undefined}
                aria-expanded={hasSub ? isSubExpanded : undefined}
                onClick={() => {
                  if (disabled) return
                  if (hasSub) {
                    setExpanded((prev) => (prev === it.label ? null : it.label))
                  } else {
                    it.onClick()
                    closeMenu(true)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  minHeight: 44,
                  padding: '0 10px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: isSubExpanded ? 'var(--hover-card)' : 'transparent',
                  color: disabled ? 'var(--muted)' : 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name={it.icon} size={15} style={{ color: disabled ? 'var(--muted)' : 'var(--text2)' }} />
                  {it.label}
                </span>
                {hasSub && <Icon name={isSubExpanded ? 'chevron_up' : 'chevron_down'} size={14} style={{ color: 'var(--muted)' }} />}
              </button>
            )

            return (
              <div key={it.label} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                {it.unavailable ? (
                  <Unavailable reason={it.unavailable} style={{ width: '100%' }}>
                    {itemButton}
                  </Unavailable>
                ) : (
                  itemButton
                )}

                {hasSub && isSubExpanded && (
                  <div
                    style={{
                      margin: '2px 0 4px 18px',
                      paddingLeft: 8,
                      borderLeft: '2px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    {it.submenu!.map((sub) => {
                      const subDisabled = Boolean(sub.unavailable)
                      const subButton = (
                        <button
                          key={sub.label}
                          type="button"
                          role="menuitem"
                          data-submenu-item=""
                          className="overflow-menu__item"
                          disabled={subDisabled}
                          aria-disabled={subDisabled ? 'true' : undefined}
                          title={sub.unavailable}
                          onClick={() => {
                            if (subDisabled) return
                            sub.onClick()
                            closeMenu(true)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            minHeight: 44,
                            padding: '0 8px',
                            borderRadius: 'var(--r-sm)',
                            border: 'none',
                            background: 'transparent',
                            color: subDisabled ? 'var(--muted)' : 'var(--text2)',
                            fontSize: 'var(--t-meta)',
                            fontFamily: 'inherit',
                            cursor: subDisabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          {sub.label}
                        </button>
                      )

                      return sub.unavailable ? (
                        <Unavailable key={sub.label} reason={sub.unavailable} style={{ width: '100%' }}>
                          {subButton}
                        </Unavailable>
                      ) : (
                        <div key={sub.label}>{subButton}</div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>, document.body
      )}
    </span>
  )
}
export default OverflowMenu
