import React, { useState, useEffect, useRef, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import * as nav from '../../data/nav'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'
import { toggleScanner } from './ScannerFab'
import { quickCreateActions } from './QuickCreateMenu'
import { searchRecords, type GlobalSearchResult } from '../../lib/queries/globalSearch'
import { useCurrentLanguage, toggleLanguage } from '../../lib/i18n'

/**
 * The global ⌘K / Ctrl-K palette.
 *
 * Rewritten 22 Aug 2026 (audit item 3.5d) — this was the one shell component
 * never migrated off Tailwind, so its `bg-slate-900 …` classes compiled to
 * nothing and the palette rendered unstyled, hard-coded to a dark slate that
 * ignored the theme system every other shell file uses. It now paints with
 * inline styles over `theme.css` tokens like the rest of the shell.
 *
 * Two structural fixes landed with the restyle:
 *
 *  1. **Navigation comes from `data/nav.ts:permittedNav(role)`, not a hand
 *     list.** The old list had drifted from the fixed 11 ('Dashboard' → `/`,
 *     no Today, no Calendar, stale subtitles) and skipped role gating
 *     entirely, so a money-blind role got Finance in the palette with only
 *     the Shell guard behind it — the drift `permittedNav`'s own doc warns
 *     about. One source, so the sidebar, the phone bar, the More sheet and
 *     this palette cannot disagree.
 *
 *  2. **The fabricated shortcut chrome is gone.** 'G D', 'G B', '⌘ N', '⌘ B'
 *     had no handlers anywhere — decorative keybindings are exactly the
 *     "static literals presented as live state" the audit calls out on
 *     Header.tsx. Only ⌘K survives, because only ⌘K works.
 *
 * The scanner action goes through `toggleScanner()` — the one way any surface
 * opens the single scanner — instead of the old `document.querySelector` reach
 * into the FAB's DOM.
 *
 * Signed-out sessions get nothing: the palette is navigation over a role's
 * permitted nav, and without a session there is no role to permit anything.
 */

interface PaletteAction {
  id: string
  title: string
  subtitle?: string | undefined
  category: 'Navigation' | 'Actions' | 'Records'
  icon: IconName
  shortcut?: string | undefined
  keywords?: string[] | undefined
  onSelect: () => void
}

export function openCommandPalette() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-command-palette'))
  }
}

const NAV_SHORTCUTS: Record<string, { shortcut: string; keywords: string[] }> = {
  '/dashboard': { shortcut: 'today', keywords: ['today', 'td', 'dash'] },
  '/today': { shortcut: 'today', keywords: ['today', 'td', 'dash'] },
  '/rentals/new': { shortcut: 'nr', keywords: ['nr', 'new', 'booking'] },
  '/rentals': { shortcut: 'rentals', keywords: ['rentals', 'bk', 'list'] },
  '/calendar': { shortcut: 'cal', keywords: ['cal', 'schedule', 'dates'] },
  '/inventory': { shortcut: 'inv', keywords: ['inv', 'gear', 'stock'] },
  '/clients': { shortcut: 'cl', keywords: ['cl', 'client', 'directory'] },
  '/finance': { shortcut: 'fin', keywords: ['fin', 'money', 'invoices', 'closing'] },
  '/tools': { shortcut: 'tools', keywords: ['tools', 'calc', 'pricing'] },
  '/settings': { shortcut: 'set', keywords: ['set', 'settings', 'config'] },
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recordResults, setRecordResults] = useState<GlobalSearchResult[]>([])
  const navigate = useNavigate()
  const { user } = useAuth()
  const hasUser = Boolean(user)
  const { theme, toggle } = useTheme()
  const currentLang = useCurrentLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const resultsId = useId()

  // Listen for ⌘K or Ctrl+K or custom open command
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    const handleCustomOpen = () => setIsOpen(true)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('open-command-palette', handleCustomOpen)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('open-command-palette', handleCustomOpen)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && hasUser) {
      const opener = document.activeElement as HTMLElement | null
      setSearch('')
      setSelectedIndex(0)
      inputRef.current?.focus()
      return () => {
        if (opener?.isConnected) opener.focus()
      }
    }
  }, [isOpen, hasUser])

  useEffect(() => {
    const userRole = user?.role
    if (!isOpen || !userRole || search.trim().length < 2) {
      setRecordResults([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void searchRecords({ role: userRole, term: search, limit: 4 })
        .then((rows) => { if (!cancelled) setRecordResults(rows) })
        .catch(() => { if (!cancelled) setRecordResults([]) })
    }, 180)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [isOpen, search, user?.role])

  useEffect(() => {
    if (isOpen) {
      document.getElementById(`${resultsId}-${selectedIndex}`)?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [isOpen, selectedIndex, resultsId])

  if (!user || !isOpen) return null

  /* The fixed 11 for this role — money surfaces dropped for money-blind
     roles, staff surfaces dropped for Client, by the same filter the sidebar
     and phone bar read. Rebuilt per open; permittedNav is a cheap filter. */
  const actions: PaletteAction[] = [
    ...(nav.permittedAllNav?.(user.role) ?? nav.permittedNav(user.role)).map(
      (s): PaletteAction => ({
        id: `nav-${s.to}`,
        title: s.label,
        subtitle: s.to,
        category: 'Navigation',
        icon: s.icon,
        shortcut: NAV_SHORTCUTS[s.to]?.shortcut,
        keywords: NAV_SHORTCUTS[s.to]?.keywords,
        onSelect: () => navigate(s.to),
      }),
    ),
    ...quickCreateActions(user.role).map(
      (action): PaletteAction => ({
        id: `create-${action.id}`,
        title: action.label,
        subtitle: action.detail,
        category: 'Actions',
        icon: action.icon,
        shortcut: action.id === 'rental' ? 'nr' : action.id === 'client' ? 'nc' : undefined,
        keywords: [action.id, action.label.toLowerCase()],
        onSelect: () => navigate(action.to),
      }),
    ),
    ...recordResults.map(
      (result): PaletteAction => ({
        id: `record-${result.kind}-${result.id}`,
        title: result.label,
        subtitle: `${result.kind} · ${result.detail}`,
        category: 'Records',
        icon: result.kind === 'client' ? 'users' : result.kind === 'equipment' ? 'box' : result.kind === 'invoice' ? 'card' : 'checklist',
        onSelect: () => navigate(result.to),
      }),
    ),
    {
      id: 'act-scan',
      title: 'Open Scanner',
      subtitle: 'Scan a barcode or QR label',
      category: 'Actions',
      icon: 'search',
      shortcut: 'sc',
      keywords: ['sc', 'scan', 'barcode', 'qr'],
      onSelect: toggleScanner,
    },
    {
      id: 'act-toggle-lang',
      title: currentLang === 'ne' ? 'Switch to English' : 'Switch Language to नेपाली (Nepali)',
      subtitle: 'Toggle system & catalogue language (EN / ने)',
      category: 'Actions',
      icon: 'flag',
      shortcut: 'lang',
      keywords: ['lang', 'language', 'ne', 'en', 'nepali', 'नेपाली'],
      onSelect: () => { void toggleLanguage() },
    },
    {
      id: 'act-toggle-theme',
      title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
      subtitle: 'Toggle theme preference',
      category: 'Actions',
      icon: theme === 'dark' ? 'sun' : 'moon',
      shortcut: 'theme',
      keywords: ['theme', 'dark', 'light', 'mode'],
      onSelect: toggle,
    },
  ]

  const term = search.trim().toLowerCase()
  const filtered = actions.filter((a) => {
    if (!term) return true
    if (a.shortcut && a.shortcut.toLowerCase() === term) return true
    if (a.keywords && a.keywords.some((k) => k.toLowerCase() === term || k.toLowerCase().startsWith(term))) return true
    return (
      a.title.toLowerCase().includes(term) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(term)) ||
      a.category.toLowerCase().includes(term)
    )
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, filtered.length - 1)))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      filtered[selectedIndex].onSelect()
      setIsOpen(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)' as unknown as number,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '80px 16px 16px',
        /* Same scrim as Modal.tsx — the app's one dialog overlay tint. */
        background: 'rgba(0, 0, 0, 0.6)',
      }}
    >
      <div style={{ position: 'fixed', inset: 0 }} onClick={() => setIsOpen(false)} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return
          e.preventDefault()
          if (document.activeElement === inputRef.current) closeRef.current?.focus()
          else inputRef.current?.focus()
        }}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 640,
          maxHeight: '70dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--modal)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-modal)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* Search header */}
        {/* focus-host — the input inside carries `outline: 'none'` so this box
            draws the boundary; without this class the palette's only control has
            no focus indicator at all. See theme.css. */}
        <div
          className="focus-host"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            padding: '6px 6px 6px var(--sp-lg)',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card2)',
          }}
        >
          <span style={{ color: 'var(--muted)', display: 'inline-flex', flexShrink: 0 }}>
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search commands and destinations"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={resultsId}
            aria-activedescendant={filtered[selectedIndex] ? `${resultsId}-${selectedIndex}` : undefined}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or destination…"
            style={{
              flex: 1,
              minWidth: 0,
              height: 44, // Law 14 — 44px target
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 'var(--t-ui)',
              fontWeight: 500,
              color: 'var(--text)',
              fontFamily: 'var(--font-body)',
            }}
          />
          <button
            ref={closeRef}
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close command palette"
            style={{
              width: 44, // Law 14 — 44px target
              height: 44,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              color: 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Results list */}
        <div id={resultsId} role="listbox" aria-label="Commands and destinations" style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-sm)' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 'var(--sp-2xl)',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: 'var(--t-ui)',
              }}
            >
              No results found for &ldquo;{search}&rdquo;
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={item.id}
                  id={`${resultsId}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => {
                    item.onSelect()
                    setIsOpen(false)
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: 48, // Law 14 — comfortably past the 44px floor
                    padding: '6px var(--sp-md)',
                    borderRadius: 'var(--r-sm)',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--nav-active-bg)' : 'transparent',
                    color: isSelected ? 'var(--nav-active-accent)' : 'var(--text)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-md)',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        borderRadius: 'var(--r-sm)',
                        background: isSelected ? 'var(--btn-primary-bg)' : 'var(--card2)',
                        color: isSelected ? 'var(--btn-primary-fg)' : 'var(--nav-icon)',
                      }}
                    >
                      <Icon name={item.icon} size={16} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--t-ui)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 'var(--t-meta)',
                            color: 'var(--muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'var(--sp-md)' }}>
                    {item.shortcut && (
                      <kbd
                        className="figure"
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: isSelected ? 'var(--nav-active-accent)' : 'var(--muted)',
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: isSelected ? 'var(--nav-active-bg)' : 'var(--card)',
                          border: '1px solid var(--border)',
                          fontFamily: 'var(--font-id)',
                        }}
                      >
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <span
                        style={{
                          display: 'inline-flex',
                          color: 'var(--nav-active-accent)',
                        }}
                      >
                        <Icon name="arrow_right" size={16} />
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer — keys and quick codes that work */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px var(--sp-lg)',
            background: 'var(--card2)',
            borderTop: '1px solid var(--border)',
            fontSize: 'var(--t-th)',
            color: 'var(--muted)',
            fontFamily: 'var(--font-id)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ color: 'var(--text2)' }}>Codes: <strong>nr</strong> · <strong>sc</strong> · <strong>today</strong> · <strong>lang</strong></span>
          </div>
          <span>Babin Rentals OS ⌘K</span>
        </div>
      </div>
    </div>
  )
}
