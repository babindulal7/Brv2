import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

const DRAWER_MS = 200
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
  const onCloseRef = useRef(onClose)
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  onCloseRef.current = onClose

  useEffect(() => {
    const update = () => setPhone(window.innerWidth < 768)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const timer = window.setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, reducedMotion ? 0 : DRAWER_MS)
    return () => window.clearTimeout(timer)
  }, [mounted, open, reducedMotion])

  useEffect(() => {
    if (!open) return
    if (priorFocus.current === null && document.activeElement instanceof HTMLElement && !panelRef.current?.contains(document.activeElement)) {
      priorFocus.current = document.activeElement
    }
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !phone || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    if (phone) document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      window.removeEventListener('keydown', handleKeyboard)
      if (phone) document.body.style.overflow = ''
      window.cancelAnimationFrame(frame)
    }
  }, [open, phone])

  useEffect(() => {
    if (open || priorFocus.current === null) return
    priorFocus.current.focus()
    priorFocus.current = null
  }, [open])

  useEffect(() => () => priorFocus.current?.focus(), [])

  if (!mounted) return null
  const titleId = `${id}-title`

  return (
    <div className={`context-drawer${phone ? ' context-drawer--phone' : ''}${closing ? ' context-drawer--closing' : ''}`} aria-hidden={closing || undefined}>
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
