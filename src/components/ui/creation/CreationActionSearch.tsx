/**
 * src/components/ui/creation/CreationActionSearch.tsx — Babin Rentals OS
 *
 * Searchable All Creation Actions panel.
 *
 * Implements:
 * - Live filter across all 22 creation actions and 7 canonical groups
 * - Role permission filtering (omits actions/groups user cannot access)
 * - Full keyboard navigation (Arrow Up/Down, Enter, Escape)
 * - Law 15: >= 44x44px touch targets
 * - Direct action triggering via callback
 */

import { useEffect, useRef, useState } from 'react'
import { Modal } from '../Modal'
import Icon from '../Icon'
import { useAuth } from '../../../lib/auth'
import {
  CREATION_ACTIONS,
  CANONICAL_CREATION_GROUPS,
  type CreationActionDefinition,
  type CreationGroupKey,
} from './CreationActionRegistry'

export interface CreationActionSearchProps {
  isOpen: boolean
  onClose: () => void
  onSelectAction: (action: CreationActionDefinition) => void
}

export function CreationActionSearch({
  isOpen,
  onClose,
  onSelectAction,
}: CreationActionSearchProps) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter actions based on role and query
  const permittedActions = CREATION_ACTIONS.filter(
    (act) => !user || act.isPermitted(user.role)
  )

  const filteredActions = permittedActions.filter((act) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    const groupDef = CANONICAL_CREATION_GROUPS[act.group]
    return (
      act.label.toLowerCase().includes(q) ||
      (act.description && act.description.toLowerCase().includes(q)) ||
      (groupDef && groupDef.label.toLowerCase().includes(q)) ||
      act.module.toLowerCase().includes(q)
    )
  })

  // Group filtered actions
  const groupedActions = new Map<CreationGroupKey, CreationActionDefinition[]>()
  for (const act of filteredActions) {
    const list = groupedActions.get(act.group) ?? []
    list.push(act)
    groupedActions.set(act.group, list)
  }

  // Flattened list for keyboard index mapping
  const flatMatches = filteredActions

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, flatMatches.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((idx) =>
        idx <= 0 ? Math.max(0, flatMatches.length - 1) : idx - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = flatMatches[selectedIndex]
      if (selected) {
        onSelectAction(selected)
        onClose()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  let cumulativeIndex = 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="All Creation Actions"
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Search Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 12px',
            borderRadius: 'var(--r-btn, 8px)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
          }}
        >
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search creation workflows, documents, records… (press /)"
            aria-label="Search all creation actions"
            style={{
              flex: 1,
              minHeight: 44,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 'var(--t-body, 14px)',
              outline: 'none',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search query"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Grouped Actions List */}
        <div
          ref={listRef}
          role="listbox"
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingRight: 4,
          }}
        >
          {flatMatches.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
              No creation workflows match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            Array.from(groupedActions.entries()).map(([gKey, acts]) => {
              const groupDef = CANONICAL_CREATION_GROUPS[gKey]
              return (
                <div key={gKey} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text2)',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name={groupDef.icon} size={13} />
                    <span>{groupDef.label}</span>
                  </div>

                  {acts.map((act) => {
                    const thisIndex = cumulativeIndex++
                    const isFocused = thisIndex === selectedIndex

                    return (
                      <button
                        key={act.id}
                        type="button"
                        role="option"
                        className="action-search-match"
                        aria-selected={isFocused}
                        onClick={() => {
                          onSelectAction(act)
                          onClose()
                        }}
                        onMouseEnter={() => setSelectedIndex(thisIndex)}
                        style={{
                          minHeight: 44,
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: 'var(--r-btn, 8px)',
                          border: isFocused ? '1px solid var(--accent, #e65100)' : '1px solid transparent',
                          background: isFocused
                            ? 'var(--accent-subtle, rgba(230,81,0,0.08))'
                            : 'var(--card)',
                          color: isFocused ? 'var(--accent, #e65100)' : 'var(--text)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background var(--dur-fast, 120ms) ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 'var(--r-sm, 6px)',
                              background: isFocused ? 'var(--accent, #e65100)' : 'var(--card2)',
                              color: isFocused ? '#fff' : 'var(--text2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Icon name={act.icon} size={15} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
                              {act.label}
                            </div>
                            {act.description && (
                              <div
                                style={{
                                  fontSize: 'var(--t-caption, 11px)',
                                  color: 'var(--muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {act.description}
                              </div>
                            )}
                          </div>
                        </div>

                        <span
                          className="eyebrow-pill"
                          style={{
                            textTransform: 'capitalize',
                            fontSize: '10px',
                            fontWeight: 600,
                            flexShrink: 0,
                            marginLeft: 8,
                          }}
                        >
                          {act.openingMode}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}
