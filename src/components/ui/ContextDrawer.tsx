import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export interface ContextDrawerProps {
  id: string
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  actions?: ReactNode
  children: ReactNode
  width?: number
}

/**
 * A record inspector for list pages. Desktop stays non-modal so operators can
 * compare rows; phone switches to a modal sheet and locks the page beneath it.
 * Record-specific data, permissions and mutations stay with the caller.
 */
export function ContextDrawer({
  id,
  open,
  onClose,
  title,
  subtitle,
  status,
  actions,
  children,
  width = 420,
}: ContextDrawerProps) {
  const panelRef = useRef<HTMLElement | null>(null)
  const priorFocus = useRef<HTMLElement | null>(null)
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const update = () => setPhone(window.innerWidth < 768)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!open) return
    priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    if (phone) document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      if (phone) document.body.style.overflow = ''
      window.cancelAnimationFrame(frame)
      priorFocus.current?.focus()
    }
  }, [open, onClose, phone])

  if (!open) return null
  const titleId = `${id}-title`

  return (
    <div className={`context-drawer${phone ? ' context-drawer--phone' : ''}`}>
      {phone && <button className="context-drawer__scrim" type="button" onClick={onClose} aria-label="Close record details" />}
      <aside
        ref={panelRef}
        id={id}
        className="context-drawer__panel"
        role="dialog"
        aria-labelledby={titleId}
        {...(phone ? { 'aria-modal': true } : {})}
        tabIndex={-1}
        style={{ '--context-drawer-width': `${width}px` } as CSSProperties}
      >
        <header className="context-drawer__header">
          <div className="context-drawer__identity">
            <div className="context-drawer__title-row">
              <h2 id={titleId}>{title}</h2>
              {status}
            </div>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="context-drawer__close" onClick={onClose} aria-label="Close record details">×</button>
        </header>
        <div className="context-drawer__body">{children}</div>
        {actions && <footer className="context-drawer__actions">{actions}</footer>}
      </aside>
    </div>
  )
}
