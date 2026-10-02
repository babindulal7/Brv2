import { useEffect, useRef, type ReactNode } from 'react'
import { Button, Card } from './Page'
import './record-workspace.css'

/** Shared furniture for create and edit. Domain validation stays in actions. */
export function RecordWorkspace({ children, summary, actions }: { children: ReactNode; summary?: ReactNode; actions?: ReactNode }) {
  return <div className="record-workspace"><div className="record-workspace-grid"><div className="record-workspace-body">{children}</div>{summary && <aside aria-label="Record summary" className="record-workspace-summary">{summary}</aside>}</div>{actions}</div>
}

export function RecordSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section id={id} className="record-section"><Card title={title}>{children}</Card></section>
}

export function RecordActions({ busy, dirty = true, disabled = false, label, onSave, onCancel, extra }: { busy: boolean; dirty?: boolean; disabled?: boolean; label: string; onSave: () => void; onCancel: () => void; extra?: ReactNode }) {
  return <div className="record-actions" role="group" aria-label="Record actions"><Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button><span role="status">{busy ? 'Saving…' : dirty ? 'Unsaved changes' : 'No unsaved changes'}</span>{extra}<Button type="button" variant="primary" disabled={busy || !dirty || disabled} onClick={onSave}>{busy ? 'Saving…' : label}</Button></div>
}

/** Capture link navigation and browser close without adding prompts to clean forms. */
export function useUnsavedRecord(dirty: boolean) {
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = '' } }
    const click = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.download || anchor.origin !== location.origin || (anchor.pathname === location.pathname && anchor.search === location.search)) return
      if (!window.confirm('Discard unsaved changes?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true) }
  }, [])
}
