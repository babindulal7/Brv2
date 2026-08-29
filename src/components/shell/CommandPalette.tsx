import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import { permittedNav } from '../../data/nav'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'
import { toggleScanner } from './ScannerFab'

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
  subtitle?: string
  category: 'Navigation' | 'Actions'
  icon: IconName
  onSelect: () => void
}

export function openCommandPalette() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-command-palette'))
  }
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)

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
    if (isOpen) {
      setSearch('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!user || !isOpen) return null

  /* The fixed 11 for this role — money surfaces dropped for money-blind
     roles, staff surfaces dropped for Client, by the same filter the sidebar
     and phone bar read. Rebuilt per open; permittedNav is a cheap filter. */
  const actions: PaletteAction[] = [
    ...permittedNav(user.role).map(
      (s): PaletteAction => ({
        id: `nav-${s.to}`,
        title: s.label,
        subtitle: s.to,
        category: 'Navigation',
        icon: s.icon,
        onSelect: () => navigate(s.to),
      }),
    ),
    {
      id: 'act-scan',
      title: 'Open Scanner',
      subtitle: 'Scan a barcode or QR label',
      category: 'Actions',
      /* 'search' is the Scan glyph everywhere — BottomBar's centre slot and
         the FAB both draw it — so the palette matches rather than invents. */
      icon: 'search',
      onSelect: toggleScanner,
    },
    {
      id: 'act-toggle-theme',
      title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
      subtitle: 'Toggle theme preference',
      category: 'Actions',
      icon: theme === 'dark' ? 'sun' : 'moon',
      onSelect: toggle,
    },
  ]

  const term = search.toLowerCase()
  const filtered = actions.filter(
    (a) =>
      a.title.toLowerCase().includes(term) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(term)) ||
      a.category.toLowerCase().includes(term),
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1))
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
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 640,
          maxHeight: '70vh',
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-sm)' }}>
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
                  role="button"
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

                  {isSelected && (
                    <span
                      style={{
                        display: 'inline-flex',
                        flexShrink: 0,
                        marginLeft: 'var(--sp-md)',
                        color: 'var(--nav-active-accent)',
                      }}
                    >
                      <Icon name="arrow_right" size={16} />
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer — only keys that actually work are named here. */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Babin Rentals OS ⌘K</span>
        </div>
      </div>
    </div>
  )
}
