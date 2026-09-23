import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import { Button } from '../ui/Button'
import { canCreateBundle, canCreateClient, canWriteBookingDesk, canWriteSharedTriage } from '../../lib/rbac'
import type { SystemRole } from '../../types/database'

export interface QuickCreateAction {
  id: string
  label: string
  detail: string
  to: string
  icon: IconName
}

/**
 * The header is a shortcut surface, never an authority source. Every item
 * opens an existing routed form and applies the same capability predicate that
 * its action dispatcher uses; the form/action keeps its own gate as backstop.
 */
export function quickCreateActions(role: SystemRole | undefined): QuickCreateAction[] {
  if (!role) return []
  return [
    ...(canWriteBookingDesk(role)
      ? [{ id: 'rental', label: 'New rental', detail: 'Start a booking', to: '/rentals/new', icon: 'plus' as const }]
      : []),
    ...(canCreateClient(role)
      ? [{ id: 'client', label: 'New client', detail: 'Add a client record', to: '/clients/new', icon: 'users' as const }]
      : []),
    ...(canCreateBundle(role)
      ? [{ id: 'equipment', label: 'Add equipment', detail: 'Add to the catalogue', to: '/inventory/new', icon: 'box' as const }]
      : []),
    ...(canWriteSharedTriage(role)
      ? [{ id: 'purchase-request', label: 'Purchase request', detail: 'Request an item or service', to: '/inventory/purchase-requests', icon: 'checklist' as const }]
      : []),
  ]
}

export function QuickCreateMenu({ role, compact = false }: { role: SystemRole | undefined; compact?: boolean }) {
  const actions = quickCreateActions(role)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  if (actions.length === 0) return null

  const choose = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <Button
        ref={triggerRef}
        type="button"
        variant="primary"
        icon={<Icon name="plus" size={16} />}
        aria-label="Create"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        style={compact ? { minWidth: 44, padding: 0 } : undefined}
      >
        {compact ? undefined : 'Create'}
      </Button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Create"
          onKeyDown={(event) => {
            const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
            const current = items.indexOf(document.activeElement as HTMLButtonElement)
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              items[(current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
            } else if (event.key === 'Tab') {
              /* Tab means "leaving" — close so the menu does not hang open,
                 invisibly, over whatever just received focus. */
              setOpen(false)
            }
          }}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            /* A dropdown on the declared token scale, not the literal 40 that
               pre-dated it (theme.css --z-dropdown). */
            zIndex: 'var(--z-dropdown)' as unknown as number,
            width: 272,
            padding: 6,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-modal)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={() => choose(action.to)}
              style={{
                width: '100%',
                minHeight: 52,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 10px',
                border: 'none',
                borderRadius: 'var(--r-btn)',
                background: 'transparent',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 'var(--r-sm)', background: 'var(--card2)', color: 'var(--text2)', flexShrink: 0 }}>
                <Icon name={action.icon} size={16} />
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 600 }}>{action.label}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{action.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
