/**
 * InternalNotesDrawer — Team Dispatch & Operations Scratchpad Drawer.
 *
 * Ported from standalone (script_1.js:2269352, 2301646).
 * Enables warehouse staff, technicians, and drivers to log quick notes,
 * gear alerts, shift handover items, and booking reminders with auto-detected ID tags.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/auth'
import { useOptionalToast } from '../../components/ui/Toast'
import {
  listInternalNotes,
  addInternalNote,
  togglePinNote,
  toggleResolveNote,
  deleteInternalNote,
  extractReferenceId,
  getReferenceUrl,
  type InternalNote,
  type NoteCategory,
  type NotePriority,
} from '../../lib/queries/internalNotes'

interface InternalNotesDrawerProps {
  isOpen: boolean
  onClose: () => void
  initialReference?: string
}

export default function InternalNotesDrawer({ isOpen, onClose, initialReference }: InternalNotesDrawerProps) {
  const { user } = useAuth()
  const toast = useOptionalToast()
  const navigate = useNavigate()
  const [notes, setNotes] = useState<InternalNote[]>(() => listInternalNotes())
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState<NoteCategory>('General')
  const [priority, setPriority] = useState<NotePriority>('normal')
  const [filterCategory, setFilterCategory] = useState<string>('All')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const reloadNotes = () => {
    setNotes(listInternalNotes())
  }

  useEffect(() => {
    const handleUpdate = () => reloadNotes()
    window.addEventListener('babin:notes-updated', handleUpdate)
    return () => window.removeEventListener('babin:notes-updated', handleUpdate)
  }, [])

  useEffect(() => {
    if (isOpen) {
      reloadNotes()
      if (initialReference && !draft.includes(initialReference)) {
        setDraft(prev => prev ? `${initialReference} — ${prev}` : `${initialReference} — `)
      }
      setTimeout(() => textareaRef.current?.focus(), 150)
    }
  }, [isOpen, initialReference, draft])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const detectedRef = useMemo(() => extractReferenceId(draft), [draft])

  const handlePost = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!draft.trim()) return

    const authorName = user?.name || 'Staff Member'
    const authorRole = user?.role || 'Operations'

    addInternalNote({
      author: authorName,
      authorRole,
      text: draft,
      category,
      priority,
    })

    setDraft('')
    reloadNotes()
    toast?.showSuccessToast('Note Posted', 'Internal log updated successfully.')
  }

  const handleTogglePin = (id: string) => {
    togglePinNote(id)
    reloadNotes()
  }

  const handleToggleResolve = (id: string) => {
    toggleResolveNote(id, user?.name || 'Operations Staff')
    reloadNotes()
  }

  const handleDelete = (id: string) => {
    deleteInternalNote(id)
    reloadNotes()
  }

  const filteredNotes = useMemo(() => {
    const list = filterCategory === 'All'
      ? notes
      : notes.filter(n => n.category.toLowerCase() === filterCategory.toLowerCase())

    // Sort: pinned first, then newest timestamp
    return [...list].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.timestamp - a.timestamp
    })
  }, [notes, filterCategory])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Team Internal Notes"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          height: '100%',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-12px 0 40px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-2)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="checklist" size={18} style={{ color: 'var(--accent)' }} />
              <h2 style={{ margin: 0, fontSize: 'var(--t-title)', fontWeight: 700 }}>
                Team Internal Notes
              </h2>
            </div>
            <div style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)', marginTop: 2 }}>
              Shift handover scratchpad & equipment advisories
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate('/notes')
              }}
              title="Open dedicated Team Notes page"
              style={{
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--accent)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '0 10px',
                height: 32,
                borderRadius: 'var(--r-btn)',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              <Icon name="external_link" size={13} />
              Full Page
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text2)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                width: 36,
                height: 36,
                borderRadius: 'var(--r-btn)',
              }}
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        {/* Note Composer */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
          <form onSubmit={handlePost} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea
              ref={textareaRef}
              rows={3}
              aria-label="Internal note draft"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handlePost()
                }
              }}
              placeholder="Post a shift note, equipment alert, client remark... (Ctrl+Enter to post)"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-body)',
                resize: 'none',
                fontFamily: 'inherit',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <select
                  value={category}
                  aria-label="Note category"
                  onChange={e => setCategory(e.target.value as NoteCategory)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  <option value="General">General</option>
                  <option value="Equipment Alert">Equipment Alert</option>
                  <option value="Shift Handover">Shift Handover</option>
                  <option value="Logistics & Transport">Logistics</option>
                  <option value="Client Remark">Client Remark</option>
                </select>

                <select
                  value={priority}
                  aria-label="Note priority"
                  onChange={e => setPriority(e.target.value as NotePriority)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">🚨 Urgent</option>
                </select>

                {detectedRef && (
                  <span
                    style={{
                      fontFamily: 'var(--font-id, sans-serif)',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: 'rgba(28, 92, 196, 0.1)',
                      color: 'var(--accent)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      border: '1px solid rgba(28, 92, 196, 0.2)',
                    }}
                  >
                    #{detectedRef}
                  </span>
                )}
              </div>

              <Button variant="primary" type="submit" disabled={!draft.trim()} style={{ minHeight: 44, padding: '0 14px' }}>
                <Icon name="plus" size={14} />
                Post
              </Button>
            </div>
          </form>
        </div>

        {/* Filter Categories */}
        <div
          style={{
            padding: '10px 20px',
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}
        >
          {(['All', 'Shift Handover', 'Equipment Alert', 'Logistics & Transport', 'Client Remark', 'General'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--border)',
                background: filterCategory === cat ? 'var(--accent)' : 'var(--card)',
                color: filterCategory === cat ? '#fff' : 'var(--text2)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat === 'Logistics & Transport' ? 'Logistics' : cat}
            </button>
          ))}
        </div>

        {/* Notes Feed */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredNotes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--muted)', fontSize: 'var(--t-caption)' }}>
              No notes in this category yet.
            </div>
          ) : (
            filteredNotes.map(n => {
              const isResolved = n.status === 'resolved'
              const isUrgent = n.priority === 'urgent'
              const tone: 'danger' | 'primary' | 'warning' | 'neutral' =
                n.category === 'Gear Alert' || n.category === 'Equipment Alert'
                  ? 'danger'
                  : n.category === 'Shift Handover'
                  ? 'primary'
                  : n.category === 'Logistics & Transport'
                  ? 'primary'
                  : n.category === 'Client Remark'
                  ? 'warning'
                  : 'neutral'

              const initials = n.author
                .split(' ')
                .map(w => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()

              return (
                <div
                  key={n.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--r-card)',
                    border: `1px solid ${n.pinned ? 'var(--accent)' : 'var(--border)'}`,
                    borderLeft: isUrgent && !isResolved ? '4px solid var(--danger)' : undefined,
                    background: isResolved
                      ? 'var(--surface-2)'
                      : n.pinned
                      ? 'rgba(28, 92, 196, 0.03)'
                      : 'var(--card)',
                    boxShadow: 'var(--shadow-card)',
                    position: 'relative',
                    opacity: isResolved ? 0.8 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: isResolved ? 'var(--card)' : 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: 'var(--text)',
                        }}
                      >
                        {initials}
                      </span>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.2 }}>{n.author}</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{n.authorRole} · {n.at}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isUrgent && !isResolved && <Badge label="URGENT" tone="danger" />}
                      <Badge label={n.category} tone={tone} />
                      {isResolved && <Badge label="DONE" tone="in" />}
                      <button
                        type="button"
                        onClick={() => handleTogglePin(n.id)}
                        title={n.pinned ? 'Unpin note' : 'Pin note to top'}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: n.pinned ? 'var(--accent)' : 'var(--muted)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="bell" size={13} fill={Boolean(n.pinned)} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(n.id)}
                        title="Delete note"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--muted)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 'var(--t-body)',
                      color: isResolved ? 'var(--muted)' : 'var(--text)',
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      textDecoration: isResolved ? 'line-through' : 'none',
                    }}
                  >
                    {n.text}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    {n.referenceId ? (
                      <Link
                        to={getReferenceUrl(n.referenceId)}
                        onClick={onClose}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 'var(--r-pill)',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          fontSize: '11px',
                          fontFamily: 'var(--font-id, sans-serif)',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 700,
                          color: 'var(--accent)',
                          textDecoration: 'none',
                        }}
                        title={`Open ${n.referenceId}`}
                      >
                        <Icon name="receipt" size={11} />
                        {n.referenceId}
                        <Icon name="external_link" size={10} style={{ opacity: 0.7 }} />
                      </Link>
                    ) : <span />}

                    <button
                      type="button"
                      onClick={() => handleToggleResolve(n.id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: isResolved ? 'var(--muted)' : 'var(--success-text)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 6px',
                      }}
                    >
                      <Icon name="check" size={12} />
                      {isResolved ? 'Reopen' : 'Done'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
