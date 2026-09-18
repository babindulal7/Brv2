import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { Modal } from './Modal'
import { Button } from './Page'
import { readLocal, writeLocal } from '../../lib/safeStorage'

export interface SavedListView {
  id: string
  name: string
  query: string
  hiddenColumns: string[]
  createdAt: string
}

interface SavedViewsMenuProps {
  storageKey: string
  currentQuery: string
  currentHiddenColumns: readonly string[]
  onApply: (view: SavedListView | null) => void
  disabled?: boolean
}

const OMITTED_QUERY_KEYS = new Set(['page', 'per', 'action', 'tab'])

export function normaliseSavedViewQuery(query: string): string {
  const source = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
  const saved = new URLSearchParams()
  for (const [key, value] of source) {
    if (!OMITTED_QUERY_KEYS.has(key)) saved.append(key, value)
  }
  saved.sort()
  return saved.toString()
}

function parseViews(value: string | null): SavedListView[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is SavedListView => {
      if (!entry || typeof entry !== 'object') return false
      const view = entry as Partial<SavedListView>
      return (
        typeof view.id === 'string' &&
        typeof view.name === 'string' &&
        typeof view.query === 'string' &&
        Array.isArray(view.hiddenColumns) &&
        view.hiddenColumns.every((column) => typeof column === 'string') &&
        typeof view.createdAt === 'string'
      )
    })
  } catch {
    return []
  }
}

function comparable(view: { query: string; hiddenColumns: readonly string[] }): string {
  return `${normaliseSavedViewQuery(view.query)}::${[...view.hiddenColumns].sort().join('|')}`
}

export function SavedViewsMenu({
  storageKey,
  currentQuery,
  currentHiddenColumns,
  onApply,
  disabled = false,
}: SavedViewsMenuProps) {
  const [views, setViews] = useState<SavedListView[]>(() => parseViews(readLocal(storageKey)))
  const [menuOpen, setMenuOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    setViews(parseViews(readLocal(storageKey)))
  }, [storageKey])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [menuOpen])

  const currentComparable = useMemo(
    () => comparable({ query: currentQuery, hiddenColumns: currentHiddenColumns }),
    [currentHiddenColumns, currentQuery],
  )
  const active = views.find((view) => comparable(view) === currentComparable)

  function persist(next: SavedListView[]) {
    setViews(next)
    writeLocal(storageKey, JSON.stringify(next))
  }

  function openSave() {
    setName(active?.name ?? '')
    setError('')
    setMenuOpen(false)
    setSaveOpen(true)
  }

  function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name for this view.')
      return
    }
    const duplicate = views.find((view) => view.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())
    const nextView: SavedListView = {
      id: duplicate?.id ?? `view-${Date.now().toString(36)}`,
      name: trimmed,
      query: normaliseSavedViewQuery(currentQuery),
      hiddenColumns: [...currentHiddenColumns],
      createdAt: duplicate?.createdAt ?? new Date().toISOString(),
    }
    persist(duplicate ? views.map((view) => (view.id === duplicate.id ? nextView : view)) : [...views, nextView])
    setSaveOpen(false)
    setName('')
  }

  function remove(id: string) {
    persist(views.filter((view) => view.id !== id))
  }

  const menuButtonStyle = {
    width: '100%',
    minHeight: 40,
    padding: '8px 10px',
    border: 0,
    borderRadius: 'var(--r-sm)',
    background: 'transparent',
    color: 'var(--text)',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    textAlign: 'left' as const,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 'var(--t-meta)',
  }

  return (
    <>
      <span ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <Button
          icon="flag"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {active?.name ?? 'Saved views'}
          {views.length > 0 && (
            <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{views.length}</span>
          )}
        </Button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Saved rental views"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 'var(--z-dropdown)' as unknown as number,
              width: 280,
              maxWidth: 'calc(100vw - 32px)',
              padding: 7,
              border: '1px solid var(--border2)',
              borderRadius: 'var(--r-card)',
              background: 'var(--card)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ padding: '7px 10px 5px', color: 'var(--muted)', fontSize: 'var(--t-caption)', fontWeight: 700 }}>
              RENTAL VIEWS
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onApply(null)
                setMenuOpen(false)
              }}
              style={menuButtonStyle}
            >
              <Icon name="checklist" size={16} />
              <span style={{ flex: 1 }}>All rentals</span>
              {!normaliseSavedViewQuery(currentQuery) && currentHiddenColumns.length === 0 && (
                <Icon name="check" size={15} style={{ color: 'var(--primary)' }} />
              )}
            </button>

            {views.length > 0 && <div style={{ height: 1, margin: '5px 4px', background: 'var(--border)' }} />}
            {views.map((view) => (
              <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onApply(view)
                    setMenuOpen(false)
                  }}
                  style={{ ...menuButtonStyle, flex: 1, minWidth: 0 }}
                >
                  <Icon name="flag" size={16} style={{ color: 'var(--primary)' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view.name}</span>
                  {view.id === active?.id && <Icon name="check" size={15} style={{ marginLeft: 'auto', color: 'var(--primary)' }} />}
                </button>
                <button
                  type="button"
                  aria-label={`Delete saved view ${view.name}`}
                  onClick={() => remove(view.id)}
                  style={{
                    width: 38,
                    height: 38,
                    border: 0,
                    borderRadius: 'var(--r-sm)',
                    background: 'transparent',
                    color: 'var(--muted)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))}

            <div style={{ height: 1, margin: '5px 4px', background: 'var(--border)' }} />
            <button type="button" role="menuitem" onClick={openSave} style={{ ...menuButtonStyle, color: 'var(--primary)', fontWeight: 650 }}>
              <Icon name="plus" size={16} />
              Save current view
            </button>
            <div style={{ padding: '4px 10px 7px', color: 'var(--muted)', fontSize: 'var(--t-caption)', lineHeight: 1.45 }}>
              Saved on this browser for your account.
            </div>
          </div>
        )}
      </span>

      <Modal
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={active ? 'Update saved view' : 'Save current view'}
        subtitle="Keep this filter and column setup ready for one-click access."
        size="sm"
        footer={
          <>
            <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>{active ? 'Update view' : 'Save view'}</Button>
          </>
        }
      >
        <label htmlFor="saved-view-name" style={{ display: 'grid', gap: 7, color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600 }}>
          View name
          <input
            id="saved-view-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
            }}
            placeholder="For example: This week's pickups"
            maxLength={60}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'saved-view-error' : undefined}
            style={{
              height: 44,
              padding: '0 12px',
              border: `1px solid ${error ? 'var(--danger)' : 'var(--border2)'}`,
              borderRadius: 'var(--r-input)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              font: 'inherit',
              outline: 'none',
            }}
          />
        </label>
        {error && <p id="saved-view-error" role="alert" style={{ margin: '7px 0 0', color: 'var(--danger)', fontSize: 'var(--t-caption)' }}>{error}</p>}
        <div style={{ marginTop: 16, padding: 13, borderRadius: 'var(--r-sm)', background: 'var(--nav-active-bg)', color: 'var(--text2)', fontSize: 'var(--t-caption)', lineHeight: 1.5 }}>
          This saves the active filters, search, sorting and visible columns. Page number and rows per page stay unchanged.
        </div>
      </Modal>
    </>
  )
}
