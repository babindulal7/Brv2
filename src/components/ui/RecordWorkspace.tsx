import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from './Page'
import { ConfirmDialog } from './ConfirmDialog'
import './record-workspace.css'

/**
 * Shared furniture for Add, Edit and Booking screens (R-39 tap budget, one pattern).
 *
 * Presentation only: validation, pricing and permissions stay in `src/lib` and
 * `src/actions` (Law 1). The pieces compose in this order:
 *
 *   RecordWorkspace
 *     RecordErrorSummary      clickable list, opens + focuses the affected field
 *     RecordSection xN        card per section, optional ones may collapse
 *     summary rail            right rail >= 1280px, flows below the sections otherwise
 *   RecordActions             one persistent bar: Cancel / Create | Save changes
 */

export function RecordWorkspace({ children, summary, actions }: { children: ReactNode; summary?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="record-workspace">
      <div className="record-workspace-grid">
        <div className="record-workspace-body">{children}</div>
        {summary && (
          <aside aria-label="Record summary" className="record-workspace-summary">
            {summary}
          </aside>
        )}
      </div>
      {actions}
    </div>
  )
}

export interface RecordSectionProps {
  title: string
  children: ReactNode
  id?: string
  /** Optional sections may collapse; essential ones stay open. */
  collapsible?: boolean
  /** Initial state for a collapsible section. Ignored when `collapsible` is false. */
  defaultOpen?: boolean
  /** Short hint shown while collapsed, e.g. "Empty" or "3 items". */
  collapsedHint?: string
}

export function RecordSection({ title, children, id, collapsible = false, defaultOpen = true, collapsedHint }: RecordSectionProps) {
  const [open, setOpen] = useState(collapsible ? defaultOpen : true)
  const bodyId = useId()
  const expanded = !collapsible || open
  const toggle = collapsible ? (
    <button
      type="button"
      className="record-section-toggle"
      data-record-toggle
      aria-expanded={expanded}
      aria-controls={bodyId}
      onClick={() => setOpen((v) => !v)}
    >
      {expanded ? 'Collapse' : collapsedHint ? `Expand · ${collapsedHint}` : 'Expand'}
    </button>
  ) : undefined
  return (
    <section id={id} className="record-section" data-record-section data-open={expanded ? 'true' : 'false'}>
      <Card title={title} {...(toggle ? { action: toggle } : {})}>
        {/* Kept mounted while collapsed so entered values and field ids survive. */}
        <div id={bodyId} hidden={!expanded}>
          {children}
        </div>
      </Card>
    </section>
  )
}

/** Open the collapsed section that holds a field, then move focus to it. */
export function focusRecordField(fieldId: string): boolean {
  const target = document.getElementById(fieldId)
  if (!target) return false
  const section = target.closest<HTMLElement>('[data-record-section]')
  if (section?.dataset.open === 'false') section.querySelector<HTMLButtonElement>('[data-record-toggle]')?.click()
  const move = () => {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    target.focus({ preventScroll: true })
  }
  // Wait one frame so a just-expanded section is visible before focus lands.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(move)
  else move()
  return true
}

export interface RecordFieldError {
  /** DOM id of the control to focus. */
  id: string
  message: string
}

export function RecordErrorSummary({ errors, title = 'Check these fields' }: { errors: RecordFieldError[]; title?: string }) {
  if (!errors.length) return null
  return (
    <div className="record-error-summary" role="alert" aria-label={title}>
      <strong>
        {title} ({errors.length})
      </strong>
      <ul>
        {errors.map((e) => (
          <li key={e.id}>
            <button type="button" className="record-error-link" onClick={() => focusRecordField(e.id)}>
              {e.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RecordActions({
  busy,
  dirty = true,
  disabled = false,
  statusText,
  label,
  onSave,
  onCancel,
  extra,
}: {
  busy: boolean
  dirty?: boolean
  disabled?: boolean
  statusText?: string | undefined
  label: string
  onSave: () => void
  onCancel: () => void
  extra?: ReactNode
}) {
  return (
    <div className="record-actions" role="group" aria-label="Record actions">
      <UnsavedLeaveDialog />
      <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
      <span role="status">{busy ? 'Saving…' : statusText ?? (dirty ? 'Unsaved changes' : 'No unsaved changes')}</span>
      {extra}
      <Button type="button" variant="primary" disabled={busy || !dirty || disabled} onClick={onSave}>
        {busy ? 'Saving…' : label}
      </Button>
    </div>
  )
}

export const UNSAVED_LEAVE_EVENT = 'babin:unsaved-leave'

/**
 * Capture link navigation and browser close without adding prompts to clean
 * forms. The link click is held and announced as `babin:unsaved-leave`;
 * `UnsavedLeaveDialog` (mounted by `RecordActions`) asks, then continues.
 */
export function useUnsavedRecord(dirty: boolean) {
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const click = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.download || anchor.origin !== location.origin || (anchor.pathname === location.pathname && anchor.search === location.search)) return
      event.preventDefault()
      event.stopPropagation()
      window.dispatchEvent(new CustomEvent(UNSAVED_LEAVE_EVENT, { detail: { href: anchor.href } }))
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', click, true)
    }
  }, [])
}

/** Confirms a held navigation. Rendered once per screen, inside `RecordActions`. */
export function UnsavedLeaveDialog() {
  const navigate = useNavigate()
  const [target, setTarget] = useState<string | null>(null)
  useEffect(() => {
    const onLeave = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href
      if (href) setTarget(href)
    }
    window.addEventListener(UNSAVED_LEAVE_EVENT, onLeave)
    return () => window.removeEventListener(UNSAVED_LEAVE_EVENT, onLeave)
  }, [])
  const leave = useCallback(() => {
    if (!target) return
    const url = new URL(target)
    setTarget(null)
    navigate(`${url.pathname}${url.search}${url.hash}`)
  }, [navigate, target])
  return (
    <ConfirmDialog
      isOpen={target !== null}
      title="Leave without saving?"
      description="You have unsaved changes. If you leave now they will be lost."
      confirmLabel="Leave page"
      cancelLabel="Keep editing"
      variant="danger"
      onClose={() => setTarget(null)}
      onConfirm={leave}
    />
  )
}
