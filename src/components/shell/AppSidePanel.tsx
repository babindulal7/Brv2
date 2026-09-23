import { ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../ui/Icon'
import { useViewport } from '../../lib/device'
import './shell.css'

interface AppSidePanelProps {
  id?: string
  side: 'left' | 'right'
  title: ReactNode
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const inertLocks = new Map<HTMLElement, { count: number; previous: boolean }>()

/** Dock when a useful working area remains; otherwise become an accessible sheet. */
export function AppSidePanel({ id, side, title, isOpen, onClose, children, footer }: AppSidePanelProps) {
  const viewport = useViewport()
  const titleId = useId()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [geometry, setGeometry] = useState({ overlay: viewport === 'phone', top: 0 })

  useLayoutEffect(() => {
    if (!isOpen) return
    const workspace = anchorRef.current?.closest<HTMLElement>('.workspace-content')
    const measure = () => {
      const rect = workspace?.getBoundingClientRect()
      const widthToken = getComputedStyle(document.documentElement).getPropertyValue('--app-panel-width')
      const panelWidth = Number.parseFloat(widthToken) || (viewport === 'tablet' ? 300 : 320)
      const count = workspace?.querySelectorAll('[data-panel-anchor]').length || 1
      const next = {
        overlay: viewport === 'phone' || (rect ? rect.width - count * panelWidth < 600 : viewport === 'tablet'),
        top: Math.max(0, rect?.top ?? document.querySelector('.app-global-header')?.getBoundingClientRect().bottom ?? 0),
      }
      setGeometry(previous => previous.overlay === next.overlay && previous.top === next.top ? previous : next)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (workspace) observer?.observe(workspace)
    const mutations = new MutationObserver(measure)
    if (workspace) mutations.observe(workspace, { childList: true, subtree: true })
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); mutations.disconnect(); window.removeEventListener('resize', measure) }
  }, [isOpen, viewport])

  useEffect(() => {
    if (!isOpen) return
    const opener = document.activeElement
    const modal = geometry.overlay
    const hiddenSiblings = modal ? Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && !element.classList.contains('app-panel-overlay') && !element.contains(overlayRef.current)) : []
    hiddenSiblings.forEach(element => {
      const lock = inertLocks.get(element)
      inertLocks.set(element, { count: (lock?.count ?? 0) + 1, previous: lock?.previous ?? element.inert })
      element.inert = true
    })
    if (modal) panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (modal && Array.from(document.querySelectorAll('.app-panel-overlay')).at(-1) !== overlayRef.current) return
      if (event.key === 'Escape' && (modal || panelRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        closeRef.current()
      }
      if (!modal || event.key !== 'Tab') return
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(element => !element.closest('[hidden], [inert]'))
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) { event.preventDefault(); panelRef.current?.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      hiddenSiblings.forEach(element => {
        const lock = inertLocks.get(element)
        if (!lock) return
        if (lock.count > 1) lock.count -= 1
        else { element.inert = lock.previous; inertLocks.delete(element) }
      })
      if (modal && opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [isOpen, geometry.overlay])

  if (!isOpen) return null
  const isSheet = viewport === 'phone' || viewport === 'tablet'

  const content = (
    <aside
      id={id}
      ref={panelRef}
      className={`app-side-panel ${side} ${isSheet ? 'app-bottom-sheet' : ''}`}
      role={geometry.overlay ? 'dialog' : 'complementary'}
      aria-modal={geometry.overlay || undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        width: isSheet ? '100%' : 'var(--app-panel-width, 320px)',
        maxWidth: '100%',
        flexShrink: 0,
        height: isSheet ? 'auto' : '100%',
        maxHeight: isSheet ? '85vh' : '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderLeft: !isSheet && side === 'right' ? '1px solid var(--border)' : undefined,
        borderRight: !isSheet && side === 'left' ? '1px solid var(--border)' : undefined,
        borderTop: isSheet ? '1px solid var(--border)' : undefined,
        borderTopLeftRadius: isSheet ? 'var(--r-card, 16px)' : undefined,
        borderTopRightRadius: isSheet ? 'var(--r-card, 16px)' : undefined,
        boxShadow: isSheet ? '0 -8px 24px rgba(0, 0, 0, 0.16)' : undefined,
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {isSheet && (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 2 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
      )}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 16px', minHeight: 52, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h2 id={titleId} style={{ margin: 0, fontWeight: 600, fontSize: 'var(--t-ui)' }}>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close panel" style={{ minWidth: 44, minHeight: 44, border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 'var(--r-sm)' }}>
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="app-side-panel-body" role="region" aria-labelledby={titleId} style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      {footer && <footer className="app-side-panel-footer" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}>{footer}</footer>}
    </aside>
  )

  return (
    <>
      <span ref={anchorRef} data-panel-anchor style={{ display: 'none' }} />
      {geometry.overlay ? (
        createPortal(
          <div
            ref={overlayRef}
            className="app-panel-overlay"
            style={{
              position: 'fixed',
              inset: `${geometry.top}px 0 0`,
              zIndex: 'var(--z-modal, 100)',
              display: 'flex',
              justifyContent: isSheet ? 'center' : side === 'left' ? 'flex-start' : 'flex-end',
              alignItems: isSheet ? 'flex-end' : 'stretch',
            }}
          >
            <div aria-hidden="true" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.4)' }} />
            {content}
          </div>,
          document.body,
        )
      ) : (
        content
      )}
    </>
  )
}
