/**
 * EntityIdSelectorModal — Interactive Entity ID Picker for Notes & Dispatch
 * Babin Rentals OS
 *
 * Allows operators to quickly search, browse, and pick Equipment Asset Tags,
 * Booking Numbers, Client IDs, Invoices, Transport units, or custom IDs.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { Modal } from '../../components/ui'
import Icon from '../../components/ui/Icon'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import {
  searchEntityLookup,
  getRecentEntitiesFromNotes,
  createCustomEntityItem,
  type EntityLookupItem,
  type EntityLookupKind,
} from '../../lib/queries/entityLookup'
import { getReferenceIconName, type InternalNote } from '../../lib/queries/internalNotes'

interface EntityIdSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectEntity: (item: EntityLookupItem, action: 'attach' | 'insert') => void
  currentAttachedId?: string | undefined
  recentNotes?: InternalNote[] | undefined
}

const TABS: Array<{ kind: EntityLookupKind; label: string; icon: import('../../components/ui/Icon').IconName }> = [
  { kind: 'all', label: 'All Entities', icon: 'queues' },
  { kind: 'equipment', label: 'Equipment (EQ)', icon: 'camera' },
  { kind: 'booking', label: 'Bookings (BR)', icon: 'calendar' },
  { kind: 'client', label: 'Clients (CL)', icon: 'user' },
  { kind: 'invoice', label: 'Invoices (INV)', icon: 'receipt' },
  { kind: 'transport', label: 'Transport (TR)', icon: 'truck' },
  { kind: 'custom', label: 'Custom ID', icon: 'edit' },
]

export default function EntityIdSelectorModal({
  isOpen,
  onClose,
  onSelectEntity,
  currentAttachedId,
  recentNotes = [],
}: EntityIdSelectorModalProps) {
  const [activeTab, setActiveTab] = useState<EntityLookupKind>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [customInput, setCustomInput] = useState('')
  const [results, setResults] = useState<EntityLookupItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('')
      setCustomInput('')
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Suggested / recent items from active notes
  const recentItems = useMemo(() => {
    return getRecentEntitiesFromNotes(recentNotes).slice(0, 6)
  }, [recentNotes])

  // Search effect
  useEffect(() => {
    let isMounted = true
    setIsSearching(true)

    const timer = setTimeout(() => {
      void searchEntityLookup(searchTerm, activeTab === 'custom' ? 'all' : activeTab, 20).then(res => {
        if (isMounted) {
          setResults(res)
          setIsSearching(false)
        }
      })
    }, 80)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [searchTerm, activeTab])

  const handleSelect = (item: EntityLookupItem, action: 'attach' | 'insert') => {
    onSelectEntity(item, action)
    onClose()
  }

  const handleCustomSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!customInput.trim()) return
    const customItem = createCustomEntityItem(customInput)
    handleSelect(customItem, 'attach')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Entity ID"
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Current Attached Alert */}
        {currentAttachedId && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 'var(--r-sm)',
              background: 'rgba(28, 92, 196, 0.08)',
              border: '1px solid var(--border)',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--muted)' }}>Currently linked:</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  fontWeight: 700,
                  color: 'var(--accent)',
                  fontSize: '13px',
                }}
              >
                {currentAttachedId}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
              Selecting another ID will update this note
            </span>
          </div>
        )}

        {/* Tab Pills */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 4,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.kind
            return (
              <button
                key={tab.kind}
                type="button"
                onClick={() => setActiveTab(tab.kind)}
                style={{
                  minHeight: 36,
                  padding: '0 12px',
                  borderRadius: 'var(--r-sm)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                  background: isActive ? 'var(--accent)' : 'var(--surface-2)',
                  color: isActive ? '#fff' : 'var(--text2)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  transition: 'all var(--dur-fast) var(--ease)',
                }}
              >
                <Icon name={tab.icon} size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Custom ID Form if on Custom tab */}
        {activeTab === 'custom' ? (
          <form
            onSubmit={handleCustomSubmit}
            style={{
              padding: 16,
              borderRadius: 'var(--r-card)',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              Enter Custom / Vehicle / Case Identifier:
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                placeholder="e.g. TR-VEHICLE-01, CASE-RED-04, DM-1044..."
                style={{
                  flex: 1,
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                }}
              />
              <Button
                variant="primary"
                type="submit"
                disabled={!customInput.trim()}
                style={{ minHeight: 44 }}
              >
                <Icon name="check" size={16} />
                Attach Custom ID
              </Button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              Use custom prefixes like <code>TR-</code> for transport vehicles or <code>CASE-</code> for flight cases.
            </div>
          </form>
        ) : (
          <>
            {/* Search Input Bar */}
            <div style={{ position: 'relative' }}>
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Search entities"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search equipment tag, booking #, client name, invoice..."
                style={{
                  width: '100%',
                  minHeight: 44,
                  padding: '0 36px 0 36px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: '13px',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                  pointerEvents: 'none',
                }}
              >
                <Icon name="search" size={16} />
              </span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
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

            {/* Recent Suggestions Row */}
            {recentItems.length > 0 && !searchTerm && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Recently Referenced in Shift Notes:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {recentItems.map(item => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => handleSelect(item, 'attach')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--r-pill)',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-2)',
                        color: 'var(--text)',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'all var(--dur-fast)',
                      }}
                    >
                      <Icon name={getReferenceIconName(item.code)} size={12} style={{ color: 'var(--accent)' }} />
                      <span>{item.code}</span>
                      <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'sans-serif' }}>
                        · {item.title.slice(0, 18)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results List */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 380,
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {isSearching ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  Searching fleet inventory and bookings...
                </div>
              ) : results.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--r-card)',
                    border: '1px dashed var(--border)',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    No matching entity found for "{searchTerm}"
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: 12 }}>
                    You can still attach this as a custom reference code.
                  </div>
                  {searchTerm && (
                    <Button
                      variant="primary"
                      onClick={() => handleSelect(createCustomEntityItem(searchTerm), 'attach')}
                      style={{ minHeight: 40, margin: '0 auto' }}
                    >
                      <Icon name="plus" size={14} />
                      Attach "{searchTerm.toUpperCase()}" as Custom ID
                    </Button>
                  )}
                </div>
              ) : (
                results.map(item => {
                  const iconName = getReferenceIconName(item.code)
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--r-sm)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        transition: 'border-color var(--dur-fast)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 'var(--r-sm)',
                            background: 'var(--surface-2)',
                            color: 'var(--accent)',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Icon name={iconName} size={16} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                                fontWeight: 700,
                                fontSize: '13px',
                                color: 'var(--text)',
                                background: 'var(--surface-2)',
                                padding: '2px 6px',
                                borderRadius: 'var(--r-sm)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {item.code}
                            </span>
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--text)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.title}
                            </span>
                            {item.badge && (
                              <Badge
                                label={item.badge}
                                tone={item.badgeTone || 'neutral'}
                              />
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--muted)',
                              marginTop: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.subtitle}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleSelect(item, 'insert')}
                          title={`Insert [${item.code}] into note draft text`}
                          style={{
                            minHeight: 36,
                            padding: '0 10px',
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border)',
                            background: 'var(--surface-2)',
                            color: 'var(--text2)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Icon name="plus" size={12} />
                          Insert in Text
                        </button>
                        <Button
                          variant="primary"
                          onClick={() => handleSelect(item, 'attach')}
                          style={{ minHeight: 36, padding: '0 12px', fontSize: '11px' }}
                        >
                          <Icon name="check" size={14} />
                          Attach ID
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
