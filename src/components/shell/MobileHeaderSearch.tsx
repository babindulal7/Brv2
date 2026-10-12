import { useEffect, useId, useRef, useState } from 'react'
import type { PageHeaderSearchConfig } from '../../lib/workspaceContext'
import Icon from '../ui/Icon'

/** The page's existing search, available without crowding the phone header. */
export function MobileHeaderSearch({ config, title }: { config: PageHeaderSearchConfig; title: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      if (document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return
      if (event.key === '/') {
        event.preventDefault()
        setOpen(true)
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  return <span ref={root} className="header-page-search">
    <button ref={trigger} type="button" className="header-page-search__trigger"
      aria-label={`Search ${title}`} aria-expanded={open} aria-controls={open ? id : undefined}
      title={config.value ? `Search ${title}: ${config.value}` : `Search ${title}`}
      data-active={Boolean(config.value)} onClick={() => open ? close() : setOpen(true)}>
      <Icon name="search" size={18} />
      {config.value && <span className="header-page-search__dot" aria-hidden="true" />}
    </button>
    {open && <div id={id} className="header-page-search__panel" role="search" aria-label={`Search ${title}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}>
      <input ref={input} type="search" value={config.value}
        aria-label={config.ariaLabel ?? `Search ${title}`} placeholder={config.placeholder ?? 'Search page…'}
        onChange={(event) => config.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') config.onKeyDown?.(event)
          if (event.key === 'Enter') close()
        }} />
      {config.value && <button type="button" aria-label="Clear search query" onClick={() => {
        config.onChange('')
        config.onClear?.()
        input.current?.focus()
      }}><Icon name="close" size={16} /></button>}
      <button type="button" aria-label="Close search" onClick={close}><Icon name="check" size={18} /></button>
    </div>}
  </span>
}
