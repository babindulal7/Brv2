import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { Modal } from './Modal'
import { Button } from './Page'
import {
  listSharedViews,
  migrateLocalViews,
  readDeviceViews,
  retireSharedView,
  saveSharedView,
  sharedViewsUnavailable,
  writeDeviceViews,
  type SharedListView,
} from '../../lib/savedViews'

export type SavedListView = Pick<SharedListView, 'id' | 'name' | 'query' | 'hiddenColumns'>

interface SavedViewsMenuProps {
  /** Which list these views belong to — `saved_views.list_key`. */
  listKey: string
  /** The pre-G2 localStorage key; its views are moved into the database once, as private views. */
  legacyStorageKey?: string
  /** Manager and above may publish a team view (the database enforces the same). */
  canPublish: boolean
  /** The signed-in user — decides which views may be removed. */
  userId: string | null
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

function comparable(view: { query: string; hiddenColumns: readonly string[] }): string {
  return `${normaliseSavedViewQuery(view.query)}::${[...view.hiddenColumns].sort().join('|')}`
}

export function SavedViewsMenu({
  listKey,
  legacyStorageKey,
  canPublish,
  userId,
  currentQuery,
  currentHiddenColumns,
  onApply,
  disabled = false,
}: SavedViewsMenuProps) {
  const [views, setViews] = useState<SharedListView[]>([])
  const [loadError, setLoadError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [shareWithTeam, setShareWithTeam] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  /* True while this database has no `saved_views` yet (0159 not applied): the menu keeps working on
     this device's own list, exactly as before G2, and says so. */
  const [deviceMode, setDeviceMode] = useState(false)
  const menuRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        if (legacyStorageKey) await migrateLocalViews(listKey, legacyStorageKey)
        const next = await listSharedViews(listKey)
        if (live) {
          setViews(next)
          setLoadError('')
        }
      } catch (e) {
        if (!live) return
        const message = e instanceof Error ? e.message : ''
        if (legacyStorageKey && sharedViewsUnavailable(message)) {
          setDeviceMode(true)
          setViews(readDeviceViews(legacyStorageKey, userId))
          setLoadError('')
          return
        }
        setLoadError('Saved views could not be loaded. Check the connection and reopen this menu.')
      }
    })()
    return () => {
      live = false
    }
  }, [listKey, legacyStorageKey, userId])

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
  const system = views.filter((v) => v.isSystem)
  const team = views.filter((v) => !v.isSystem && v.visibility === 'team')
  const mine = views.filter((v) => !v.isSystem && v.visibility === 'private')
  const mayRemove = (v: SharedListView) =>
    !v.isSystem && (v.ownerId === userId || (v.visibility === 'team' && canPublish))
  const updatingOwn = Boolean(active && !active.isSystem)

  async function reload() {
    if (deviceMode && legacyStorageKey) {
      setViews(readDeviceViews(legacyStorageKey, userId))
      return
    }
    setViews(await listSharedViews(listKey))
  }

  function openSave() {
    setName(active && !active.isSystem ? active.name : '')
    setShareWithTeam(active?.visibility === 'team' && !active.isSystem)
    setError('')
    setMenuOpen(false)
    setSaveOpen(true)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name for this view.')
      return
    }
    const visibility = canPublish && shareWithTeam ? 'team' : 'private'
    const duplicate = views.find(
      (view) =>
        !view.isSystem &&
        view.visibility === visibility &&
        view.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase() &&
        (visibility === 'team' || view.ownerId === userId),
    )
    if (deviceMode && legacyStorageKey) {
      const next: SharedListView = {
        id: duplicate?.id ?? `view-${Date.now().toString(36)}`,
        name: trimmed,
        query: normaliseSavedViewQuery(currentQuery),
        hiddenColumns: [...currentHiddenColumns],
        visibility: 'private',
        isSystem: false,
        ownerId: userId,
        createdAt: duplicate?.createdAt ?? new Date().toISOString(),
      }
      writeDeviceViews(legacyStorageKey, duplicate ? views.map((v) => (v.id === duplicate.id ? next : v)) : [...views, next])
      setViews(readDeviceViews(legacyStorageKey, userId))
      setSaveOpen(false)
      setName('')
      return
    }
    setBusy(true)
    try {
      await saveSharedView({
        id: duplicate?.id ?? null,
        listKey,
        name: trimmed,
        query: normaliseSavedViewQuery(currentQuery),
        hiddenColumns: currentHiddenColumns,
        visibility,
      })
      await reload()
      setSaveOpen(false)
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The view could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (deviceMode && legacyStorageKey) {
      writeDeviceViews(legacyStorageKey, views.filter((v) => v.id !== id))
      setViews(readDeviceViews(legacyStorageKey, userId))
      return
    }
    try {
      await retireSharedView(id)
      await reload()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'The view could not be removed.')
    }
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

  const groupLabel = (text: string) => (
    <div style={{ padding: '7px 10px 5px', color: 'var(--muted)', fontSize: 'var(--t-caption)', fontWeight: 700 }}>
      {text}
    </div>
  )

  const row = (view: SharedListView) => (
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
      {mayRemove(view) && (
        <button
          type="button"
          aria-label={`Remove saved view ${view.name}`}
          onClick={() => void remove(view.id)}
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
      )}
    </div>
  )

  const divider = <div style={{ height: 1, margin: '5px 4px', background: 'var(--border)' }} />

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
              maxHeight: 'min(70vh, 520px)',
              overflowY: 'auto',
              padding: 7,
              border: '1px solid var(--border2)',
              borderRadius: 'var(--r-card)',
              background: 'var(--card)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {groupLabel('RENTAL VIEWS')}
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

            {system.length > 0 && (
              <>
                {divider}
                {groupLabel('BUILT-IN')}
                {system.map(row)}
              </>
            )}
            {team.length > 0 && (
              <>
                {divider}
                {groupLabel('TEAM')}
                {team.map(row)}
              </>
            )}
            {mine.length > 0 && (
              <>
                {divider}
                {groupLabel('MINE')}
                {mine.map(row)}
              </>
            )}

            {divider}
            <button type="button" role="menuitem" onClick={openSave} style={{ ...menuButtonStyle, color: 'var(--primary)', fontWeight: 650 }}>
              <Icon name="plus" size={16} />
              Save current view
            </button>
            {deviceMode && (
              <div style={{ padding: '4px 10px 7px', color: 'var(--muted)', fontSize: 'var(--t-caption)', lineHeight: 1.45 }}>
                Saved on this device. Built-in and team views arrive with the next database update.
              </div>
            )}
            {loadError && (
              <div role="alert" style={{ padding: '4px 10px 7px', color: 'var(--danger)', fontSize: 'var(--t-caption)', lineHeight: 1.45 }}>
                {loadError}
              </div>
            )}
          </div>
        )}
      </span>

      <Modal
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={updatingOwn ? 'Update saved view' : 'Save current view'}
        subtitle="Keep this filter and column setup ready for one-click access."
        size="sm"
        footer={
          <>
            <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              {updatingOwn ? 'Update view' : 'Save view'}
            </Button>
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
              if (event.key === 'Enter') void save()
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
        {canPublish && !deviceMode && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <input type="checkbox" checked={shareWithTeam} onChange={(event) => setShareWithTeam(event.target.checked)} />
            Share with the whole team
          </label>
        )}
        <div style={{ marginTop: 16, padding: 13, borderRadius: 'var(--r-sm)', background: 'var(--nav-active-bg)', color: 'var(--text2)', fontSize: 'var(--t-caption)', lineHeight: 1.5 }}>
          This saves the active filters, search, sorting and visible columns. Page number and rows per page stay unchanged.
          {deviceMode
            ? ' Saved on this device only for now — shared views arrive with the next database update.'
            : canPublish && shareWithTeam
              ? ' Everyone on staff will see it, on every device.'
              : ' Only you will see it, on every device you sign in on.'}
        </div>
      </Modal>
    </>
  )
}
