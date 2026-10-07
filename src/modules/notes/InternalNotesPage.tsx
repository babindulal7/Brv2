/**
 * InternalNotesPage — Team Dispatch & Operations Scratchpad Page
 * Babin Rentals OS
 *
 * Dedicated team operational hub for shift handovers, gear alerts,
 * vehicle dispatch remarks, and booking notices with clickable cross-links.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useAuth } from '../../lib/auth'
import { useOptionalToast } from '../../components/ui/Toast'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import {
  listInternalNotes,
  addInternalNote,
  updateInternalNote,
  togglePinNote,
  toggleResolveNote,
  deleteInternalNote,
  clearResolvedNotes,
  getInternalNotesStats,
  getReferenceUrl,
  extractReferenceId,
  extractReferenceIds,
  getReferenceIconName,
  type InternalNote,
  type NoteCategory,
  type NotePriority,
} from '../../lib/queries/internalNotes'
import EntityIdSelectorModal from './EntityIdSelectorModal'
import ShiftBriefModal from './ShiftBriefModal'
import { getRecentEntitiesFromNotes, type EntityLookupItem } from '../../lib/queries/entityLookup'
import './notes.css'

const CATEGORIES: NoteCategory[] = [
  'Shift Handover',
  'Equipment Alert',
  'Logistics & Transport',
  'Client Remark',
  'General',
]

const QUICK_TEMPLATES = [
  {
    label: '🚨 Equipment Defect',
    category: 'Equipment Alert' as NoteCategory,
    priority: 'urgent' as NotePriority,
    template: 'EQ-SONY-FX6-01 sensor needs wet cleaning before tomorrow shoot.',
    refId: 'EQ-SONY-FX6-01',
  },
  {
    label: '🔄 Shift Handover',
    category: 'Shift Handover' as NoteCategory,
    priority: 'high' as NotePriority,
    template: 'Shift Handover: BR-2613 packed 3 cases; NiSi primes pending final check.',
    refId: 'BR-2613',
  },
  {
    label: '🚚 Dispatch Route',
    category: 'Logistics & Transport' as NoteCategory,
    priority: 'high' as NotePriority,
    template: 'Dispatch BR-2615: Balkhu road blockage, driver reroute via Kirtipur.',
    refId: 'BR-2615',
  },
  {
    label: '👤 Client Remark',
    category: 'Client Remark' as NoteCategory,
    priority: 'normal' as NotePriority,
    template: 'Client Q-1049 requested 6:00 AM delivery to site; call location manager 30m prior.',
    refId: 'Q-1049',
  },
]

export default function InternalNotesPage() {
  const { user } = useAuth()
  const toast = useOptionalToast()

  const [notes, setNotes] = useState<InternalNote[]>(() => listInternalNotes())
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState<NoteCategory>('General')
  const [priority, setPriority] = useState<NotePriority>('normal')
  const [attachedRefId, setAttachedRefId] = useState<string | null>(null)

  // Filters & search
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('All')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved' | 'pinned'>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent'>('all')
  const [selectedEntityFilter, setSelectedEntityFilter] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'pinned-first' | 'newest' | 'oldest' | 'priority'>('pinned-first')
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('cards')

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editCategory, setEditCategory] = useState<NoteCategory>('General')
  const [editPriority, setEditPriority] = useState<NotePriority>('normal')
  const [editRefId, setEditRefId] = useState<string | null>(null)

  // Modals state
  const [isEntitySelectorOpen, setIsEntitySelectorOpen] = useState(false)
  const [isEditingEntitySelectorOpen, setIsEditingEntitySelectorOpen] = useState(false)
  const [isShiftBriefOpen, setIsShiftBriefOpen] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const reloadNotes = () => {
    setNotes(listInternalNotes())
  }

  useEffect(() => {
    const handleUpdate = () => reloadNotes()
    window.addEventListener('babin:notes-updated', handleUpdate)
    return () => window.removeEventListener('babin:notes-updated', handleUpdate)
  }, [])

  // Keyboard shortcut listener (/ to search, Esc to clear)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && document.activeElement !== textareaRef.current) {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === 'Escape') {
        if (editingId) {
          setEditingId(null)
        } else if (selectedEntityFilter) {
          setSelectedEntityFilter(null)
        } else if (searchTerm) {
          setSearchTerm('')
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingId, selectedEntityFilter, searchTerm])

  const detectedRef = useMemo(() => extractReferenceId(draft), [draft])

  // Current NPT & BS Date header
  const nepaliDateStr = useMemo(() => {
    try {
      const now = new Date()
      const bs = toBs(now)
      const bsStr = bs ? formatBs(bs) : ''
      const adStr = formatAd(now)
      return bsStr ? `${adStr} · ${bsStr}` : adStr
    } catch {
      return 'Kathmandu HQ'
    }
  }, [])

  const stats = useMemo(() => getInternalNotesStats(notes), [notes])

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: notes.length }
    for (const cat of CATEGORIES) {
      counts[cat] = notes.filter(n => n.category === cat).length
    }
    return counts
  }, [notes])

  // Top suggestions from notes for 1-click select
  const suggestedEntities = useMemo(() => {
    return getRecentEntitiesFromNotes(notes).slice(0, 5)
  }, [notes])

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
      ...(attachedRefId ? { referenceId: attachedRefId } : {}),
    })

    setDraft('')
    setAttachedRefId(null)
    reloadNotes()
    toast?.showSuccessToast('Note Posted', 'Shift log updated successfully.')
  }

  const handleApplyTemplate = (tmpl: typeof QUICK_TEMPLATES[number]) => {
    setCategory(tmpl.category)
    setPriority(tmpl.priority)
    setDraft(tmpl.template)
    if (tmpl.refId) {
      setAttachedRefId(tmpl.refId)
    }
    textareaRef.current?.focus()
  }

  const handleTogglePin = (id: string) => {
    togglePinNote(id)
    reloadNotes()
  }

  const handleToggleResolve = (id: string) => {
    const current = notes.find(n => n.id === id)
    const operator = user?.name || 'Operations Staff'
    toggleResolveNote(id, operator)
    reloadNotes()
    if (current?.status !== 'resolved') {
      toast?.showSuccessToast('Task Resolved', 'Marked as completed for this shift.')
    } else {
      toast?.showSuccessToast('Task Reopened', 'Restored to open queue.')
    }
  }

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void
  } | null>(null)

  const handleDelete = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete this internal note?',
      description: 'Are you sure you want to permanently delete this internal note from the dispatch log?',
      confirmLabel: 'Delete Note',
      onConfirm: () => {
        setConfirmDialog(null)
        deleteInternalNote(id)
        reloadNotes()
        toast?.showSuccessToast('Note Deleted', 'Removed from internal dispatch log.')
      },
    })
  }

  const handleClearResolved = () => {
    if (stats.resolved === 0) return
    setConfirmDialog({
      isOpen: true,
      title: `Clear all ${stats.resolved} resolved notes?`,
      description: `This will archive all ${stats.resolved} resolved tasks and clear them from the current view.`,
      confirmLabel: 'Clear Resolved',
      onConfirm: () => {
        setConfirmDialog(null)
        const count = clearResolvedNotes()
        reloadNotes()
        toast?.showSuccessToast('Cleaned Log', `Archived ${count} resolved notes.`)
      },
    })
  }

  const handleStartEdit = (note: InternalNote) => {
    setEditingId(note.id)
    setEditDraft(note.text)
    setEditCategory(note.category)
    setEditPriority(note.priority || 'normal')
    setEditRefId(note.referenceId || null)
  }

  const handleSaveEdit = (id: string) => {
    if (!editDraft.trim()) return
    updateInternalNote(id, {
      text: editDraft,
      category: editCategory,
      priority: editPriority,
      referenceId: editRefId || undefined,
    })
    setEditingId(null)
    reloadNotes()
    toast?.showSuccessToast('Note Updated', 'Changes saved successfully.')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
    setEditRefId(null)
  }

  // Handle entity selected from Modal
  const handleEntitySelected = (item: EntityLookupItem, action: 'attach' | 'insert') => {
    if (action === 'attach') {
      setAttachedRefId(item.code)
      toast?.showSuccessToast('ID Attached', `Linked ${item.code} to note.`)
    } else {
      // Insert in text at cursor or append
      const codeTag = `[${item.code}] `
      setDraft(prev => prev ? `${prev} ${codeTag}` : codeTag)
      setAttachedRefId(item.code)
      toast?.showSuccessToast('ID Inserted', `Added ${item.code} to draft text.`)
    }
  }

  const handleEditingEntitySelected = (item: EntityLookupItem, action: 'attach' | 'insert') => {
    if (action === 'attach') {
      setEditRefId(item.code)
    } else {
      setEditDraft(prev => prev ? `${prev} [${item.code}] ` : `[${item.code}] `)
      setEditRefId(item.code)
    }
  }

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    let result = [...notes]

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter(n => {
        const textMatch = n.text.toLowerCase().includes(q)
        const authorMatch = n.author.toLowerCase().includes(q)
        const roleMatch = n.authorRole.toLowerCase().includes(q)
        const refMatch = n.referenceId?.toLowerCase().includes(q) || n.referenceIds?.some(r => r.toLowerCase().includes(q))
        return textMatch || authorMatch || roleMatch || refMatch
      })
    }

    // Specific entity filter
    if (selectedEntityFilter) {
      const target = selectedEntityFilter.toUpperCase()
      result = result.filter(n => {
        return (
          n.referenceId?.toUpperCase() === target ||
          n.referenceIds?.some(r => r.toUpperCase() === target) ||
          n.text.toUpperCase().includes(target)
        )
      })
    }

    // Category filter
    if (filterCategory !== 'All') {
      result = result.filter(n => n.category.toLowerCase() === filterCategory.toLowerCase())
    }

    // Status filter
    if (statusFilter === 'open') {
      result = result.filter(n => n.status !== 'resolved')
    } else if (statusFilter === 'resolved') {
      result = result.filter(n => n.status === 'resolved')
    } else if (statusFilter === 'pinned') {
      result = result.filter(n => Boolean(n.pinned))
    }

    // Priority filter
    if (priorityFilter === 'urgent') {
      result = result.filter(n => n.priority === 'urgent')
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'pinned-first') {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return b.timestamp - a.timestamp
      }
      if (sortBy === 'newest') {
        return b.timestamp - a.timestamp
      }
      if (sortBy === 'oldest') {
        return a.timestamp - b.timestamp
      }
      if (sortBy === 'priority') {
        const rank: Record<string, number> = { urgent: 3, high: 2, normal: 1, low: 0 }
        const rA = rank[a.priority || 'normal'] ?? 1
        const rB = rank[b.priority || 'normal'] ?? 1
        if (rA !== rB) return rB - rA
        return b.timestamp - a.timestamp
      }
      return 0
    })

    return result
  }, [notes, searchTerm, selectedEntityFilter, filterCategory, statusFilter, priorityFilter, sortBy])

  return (
    <div className="notes-page-container">
      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          variant="danger"
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
        />
      )}

      {/* Entity ID Selector Modals */}
      <EntityIdSelectorModal
        isOpen={isEntitySelectorOpen}
        onClose={() => setIsEntitySelectorOpen(false)}
        onSelectEntity={handleEntitySelected}
        currentAttachedId={attachedRefId || undefined}
        recentNotes={notes}
      />

      <EntityIdSelectorModal
        isOpen={isEditingEntitySelectorOpen}
        onClose={() => setIsEditingEntitySelectorOpen(false)}
        onSelectEntity={handleEditingEntitySelected}
        currentAttachedId={editRefId || undefined}
        recentNotes={notes}
      />

      {/* Shift Handover Brief Modal */}
      <ShiftBriefModal
        isOpen={isShiftBriefOpen}
        onClose={() => setIsShiftBriefOpen(false)}
        notes={notes}
      />

      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--r-sm)',
                background: 'rgba(28, 92, 196, 0.1)',
                color: 'var(--accent)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="message" size={20} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 'var(--t-title)', fontWeight: 700, color: 'var(--text)' }}>
                Team Dispatch & Shift Notes
              </h1>
              <div style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)', marginTop: 2 }}>
                Live shift handovers, equipment alerts & field notices · {nepaliDateStr}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* View Mode Toggle */}
          <div style={{ display: 'flex', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <button
              type="button"
              className={`notes-view-btn ${viewMode === 'cards' ? 'is-active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Cards feed view"
            >
              <Icon name="queues" size={14} />
              Cards
            </button>
            <button
              type="button"
              className={`notes-view-btn ${viewMode === 'compact' ? 'is-active' : ''}`}
              onClick={() => setViewMode('compact')}
              title="Compact operations table view"
            >
              <Icon name="checklist" size={14} />
              Compact
            </button>
          </div>

          <Button
            variant="secondary"
            onClick={() => setIsShiftBriefOpen(true)}
            title="Open structured shift handover brief modal (WhatsApp/Telegram export)"
            style={{ minHeight: 44 }}
          >
            <Icon name="copy" size={16} />
            Shift Brief
          </Button>

          {stats.resolved > 0 && (
            <Button
              variant="secondary"
              onClick={handleClearResolved}
              title={`Archive ${stats.resolved} resolved notes`}
              style={{ minHeight: 44, color: 'var(--muted)' }}
            >
              <Icon name="archive" size={16} />
              Clear Resolved ({stats.resolved})
            </Button>
          )}

          <Button
            variant="secondary"
            onClick={() => window.dispatchEvent(new CustomEvent('babin:open-notes'))}
            title="Open quick drawer overlay (Alt+N)"
            style={{ minHeight: 44 }}
          >
            <Icon name="external_link" size={16} />
            Open in Drawer
          </Button>
        </div>
      </div>

      {/* Metrics KPI Strip — Interactive Clickable Filters */}
      <div className="notes-metrics-grid">
        <button
          type="button"
          onClick={() => {
            setFilterCategory('Equipment Alert')
            setStatusFilter('open')
          }}
          style={{
            background: 'var(--card)',
            border: `1px solid ${stats.gearAlerts > 0 ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'transform var(--dur-fast)',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--r-sm)',
              background: stats.gearAlerts > 0 ? 'rgba(217, 72, 69, 0.12)' : 'var(--surface-2)',
              color: stats.gearAlerts > 0 ? 'var(--danger)' : 'var(--muted)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="alert_triangle" size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Equipment Alerts
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: stats.gearAlerts > 0 ? 'var(--danger)' : 'var(--text)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
              {stats.gearAlerts}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterCategory('Shift Handover')
            setStatusFilter('open')
          }}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--r-sm)',
              background: 'rgba(28, 92, 196, 0.1)',
              color: 'var(--accent)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="refresh" size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Shift Handovers
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
              {stats.handoverCount}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setPriorityFilter('urgent')
            setStatusFilter('open')
          }}
          style={{
            background: 'var(--card)',
            border: `1px solid ${stats.urgentCount > 0 ? 'var(--warn)' : 'var(--border)'}`,
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--r-sm)',
              background: stats.urgentCount > 0 ? 'rgba(240, 140, 0, 0.12)' : 'var(--surface-2)',
              color: stats.urgentCount > 0 ? 'var(--warn-text)' : 'var(--muted)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="bell" size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Urgent Items
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: stats.urgentCount > 0 ? 'var(--warn-text)' : 'var(--text)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
              {stats.urgentCount}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('open')
          }}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--r-sm)',
              background: 'rgba(28, 92, 196, 0.08)',
              color: 'var(--accent)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="checklist" size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Open Tasks
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
              {stats.open}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('resolved')
          }}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--r-sm)',
              background: 'rgba(47, 158, 68, 0.1)',
              color: 'var(--success-text)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="check" size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Resolved Today
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
              {stats.resolved}
            </div>
          </div>
        </button>
      </div>

      {/* Main Layout: Feed on Left, Composer on Right Rail */}
      <div className="notes-layout-grid">
        {/* Left Column: Search, Active Filters & Notes Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Controls Bar: Search & Status / Priority */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              padding: '12px 16px',
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* Top row: Search, Status tabs, Priority toggle, Sort */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                <input
                  ref={searchInputRef}
                  type="text"
                  aria-label="Search notes"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search notes by keyword, booking ID, author, asset tag... (Press / to focus)"
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '0 36px 0 34px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: '13px',
                  }}
                />
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}>
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

              {/* Status tabs */}
              <div style={{ display: 'flex', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {(['all', 'open', 'resolved', 'pinned'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    style={{
                      minHeight: 44,
                      padding: '0 12px',
                      border: 'none',
                      background: statusFilter === tab ? 'var(--accent)' : 'var(--card)',
                      color: statusFilter === tab ? '#fff' : 'var(--text2)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      transition: 'background var(--dur-fast)',
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Priority filter toggle */}
              <button
                type="button"
                onClick={() => setPriorityFilter(prev => prev === 'all' ? 'urgent' : 'all')}
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-sm)',
                  border: `1px solid ${priorityFilter === 'urgent' ? 'var(--danger)' : 'var(--border)'}`,
                  background: priorityFilter === 'urgent' ? 'rgba(217, 72, 69, 0.12)' : 'var(--card)',
                  color: priorityFilter === 'urgent' ? 'var(--danger)' : 'var(--text2)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon name="bell" size={14} />
                {priorityFilter === 'urgent' ? 'Urgent Only' : 'All Urgency'}
              </button>

              {/* Sort Selector */}
              <select
                aria-label="Sort notes by"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                style={{
                  minHeight: 44,
                  padding: '0 10px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <option value="pinned-first">📌 Pinned First</option>
                <option value="newest">⏱ Newest First</option>
                <option value="oldest">⏳ Oldest First</option>
                <option value="priority">🚨 Priority First</option>
              </select>
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {(['All', ...CATEGORIES] as const).map(cat => {
                const count = categoryCounts[cat] ?? 0
                const isActive = filterCategory === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCategory(cat)}
                    style={{
                      minHeight: 32,
                      padding: '4px 12px',
                      borderRadius: 'var(--r-pill)',
                      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      background: isActive ? 'var(--accent)' : 'var(--surface-2)',
                      color: isActive ? '#fff' : 'var(--text2)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{cat}</span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'var(--card)',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono, monospace)',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Active Entity Tag Filter Banner */}
            {selectedEntityFilter && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  borderRadius: 'var(--r-sm)',
                  background: 'rgba(28, 92, 196, 0.08)',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name={getReferenceIconName(selectedEntityFilter)} size={14} style={{ color: 'var(--accent)' }} />
                  <span>Filtered to entity:</span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--accent)' }}>
                    {selectedEntityFilter}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEntityFilter(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  Clear Entity Filter ×
                </button>
              </div>
            )}
          </div>

          {/* Notes Feed: Cards View vs Compact Table View */}
          {filteredNotes.length === 0 ? (
            <div
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-card)',
                padding: '48px 20px',
                textAlign: 'center',
                color: 'var(--muted)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'var(--surface-2)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 12px',
                }}
              >
                <Icon name="checklist" size={24} style={{ color: 'var(--muted)' }} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                No internal notes found
              </div>
              <div style={{ fontSize: '13px', maxWidth: 400, margin: '0 auto 16px' }}>
                {searchTerm || filterCategory !== 'All' || statusFilter !== 'all' || selectedEntityFilter
                  ? 'No notes match your active filter criteria. Try clearing search or filters.'
                  : 'The team dispatch scratchpad is currently empty. Post a new shift note on the right.'}
              </div>
              {(searchTerm || filterCategory !== 'All' || statusFilter !== 'all' || selectedEntityFilter) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchTerm('')
                    setFilterCategory('All')
                    setStatusFilter('all')
                    setSelectedEntityFilter(null)
                  }}
                >
                  Reset All Filters
                </Button>
              )}
            </div>
          ) : viewMode === 'compact' ? (
            /* Compact Operations Table */
            <div style={{ overflowX: 'auto' }}>
              <table className="notes-compact-table">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Author / Time</th>
                    <th style={{ width: 130 }}>Ref / Entity</th>
                    <th style={{ width: 130 }}>Category</th>
                    <th>Message & Dispatch Remark</th>
                    <th style={{ width: 130, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotes.map(n => {
                    const isResolved = n.status === 'resolved'
                    const isUrgent = n.priority === 'urgent'
                    const allRefs = n.referenceIds && n.referenceIds.length > 0
                      ? n.referenceIds
                      : extractReferenceIds(n.text)

                    return (
                      <tr
                        key={n.id}
                        className={`${isResolved ? 'is-resolved' : ''} ${isUrgent && !isResolved ? 'is-urgent' : ''}`}
                      >
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{n.author}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{n.at}</div>
                        </td>
                        <td>
                          {allRefs.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {allRefs.map(ref => (
                                <button
                                  key={ref}
                                  type="button"
                                  onClick={() => setSelectedEntityFilter(ref)}
                                  className="note-ref-chip"
                                  title={`Filter by ${ref}`}
                                >
                                  <Icon name={getReferenceIconName(ref)} size={11} />
                                  {ref}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '11px' }}>—</span>
                          )}
                        </td>
                        <td>
                          <Badge
                            label={n.category}
                            tone={
                              n.category === 'Gear Alert' || n.category === 'Equipment Alert'
                                ? 'danger'
                                : n.category === 'Shift Handover'
                                ? 'primary'
                                : 'neutral'
                            }
                          />
                        </td>
                        <td>
                          <div
                            style={{
                              textDecoration: isResolved ? 'line-through' : 'none',
                              color: isResolved ? 'var(--muted)' : 'var(--text)',
                              lineHeight: 1.4,
                            }}
                          >
                            {n.text}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleToggleResolve(n.id)}
                              title={isResolved ? 'Reopen task' : 'Mark as done'}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 'var(--r-sm)',
                                border: '1px solid var(--border)',
                                background: isResolved ? 'var(--surface-2)' : 'rgba(47, 158, 68, 0.08)',
                                color: isResolved ? 'var(--muted)' : 'var(--success-text)',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              {isResolved ? 'Reopen' : 'Done'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTogglePin(n.id)}
                              title={n.pinned ? 'Unpin' : 'Pin'}
                              style={{
                                padding: '4px 6px',
                                border: 'none',
                                background: 'transparent',
                                color: n.pinned ? 'var(--accent)' : 'var(--muted)',
                                cursor: 'pointer',
                              }}
                            >
                              <Icon name="bell" size={14} fill={Boolean(n.pinned)} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Cards View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredNotes.map(n => {
                const isEditing = editingId === n.id
                const isResolved = n.status === 'resolved'
                const isPinned = Boolean(n.pinned)
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

                // Extract all references in text
                const allRefs = n.referenceIds && n.referenceIds.length > 0
                  ? n.referenceIds
                  : extractReferenceIds(n.text)

                return (
                  <div
                    key={n.id}
                    className={`note-card ${isPinned ? 'is-pinned' : ''} ${isResolved ? 'is-resolved' : ''} ${isUrgent && !isResolved ? 'is-urgent' : ''}`}
                  >
                    {/* Top Row: Author & Badges & Quick Action Controls */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: isResolved ? 'var(--surface-2)' : 'var(--nav-active-bg)',
                            border: '1px solid var(--border)',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: isResolved ? 'var(--muted)' : 'var(--accent)',
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </span>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.2, color: 'var(--text)' }}>
                            {n.author}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 2 }}>
                            {n.authorRole} · {n.at}
                          </div>
                        </div>
                      </div>

                      {/* Badges Cluster */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {isPinned && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              padding: '2px 7px',
                              borderRadius: 'var(--r-pill)',
                              background: 'rgba(28, 92, 196, 0.1)',
                              color: 'var(--accent)',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                          >
                            <Icon name="bell" size={11} fill />
                            PINNED
                          </span>
                        )}

                        {isUrgent && !isResolved && (
                          <Badge label="URGENT" tone="danger" />
                        )}

                        <Badge label={n.category} tone={tone} />

                        {isResolved ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              padding: '2px 8px',
                              borderRadius: 'var(--r-pill)',
                              background: 'rgba(47, 158, 68, 0.12)',
                              color: 'var(--success-text)',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                          >
                            <Icon name="check" size={11} />
                            RESOLVED
                          </span>
                        ) : null}

                        {/* Pin and Delete Buttons */}
                        <button
                          type="button"
                          onClick={() => handleTogglePin(n.id)}
                          title={isPinned ? 'Unpin note' : 'Pin note to top'}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: isPinned ? 'var(--accent)' : 'var(--muted)',
                            cursor: 'pointer',
                            padding: 6,
                            borderRadius: 'var(--r-sm)',
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <Icon name="bell" size={15} fill={isPinned} />
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
                            padding: 6,
                            borderRadius: 'var(--r-sm)',
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <Icon name="close" size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Note Body or Inline Edit Mode */}
                    {isEditing ? (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <textarea
                          rows={3}
                          aria-label="Edit note content"
                          value={editDraft}
                          onChange={e => setEditDraft(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--accent)',
                            background: 'var(--input-bg)',
                            color: 'var(--text)',
                            fontSize: 'var(--t-body)',
                            fontFamily: 'inherit',
                          }}
                        />

                        {/* Edit attached ID */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Linked Entity:</span>
                          {editRefId ? (
                            <span className="attached-ref-chip">
                              <Icon name={getReferenceIconName(editRefId)} size={12} />
                              {editRefId}
                              <button
                                type="button"
                                onClick={() => setEditRefId(null)}
                                title="Remove linked entity"
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsEditingEntitySelectorOpen(true)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 'var(--r-sm)',
                                border: '1px solid var(--border)',
                                background: 'var(--surface-2)',
                                color: 'var(--text2)',
                                fontSize: '11px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Icon name="barcode" size={12} />
                              + Select ID
                            </button>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={editCategory}
                            aria-label="Edit note category"
                            onChange={e => setEditCategory(e.target.value as NoteCategory)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 'var(--r-sm)',
                              border: '1px solid var(--border)',
                              background: 'var(--input-bg)',
                              color: 'var(--text)',
                              fontSize: '11px',
                              minHeight: 36,
                            }}
                          >
                            {CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <select
                            value={editPriority}
                            aria-label="Edit note priority"
                            onChange={e => setEditPriority(e.target.value as NotePriority)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 'var(--r-sm)',
                              border: '1px solid var(--border)',
                              background: 'var(--input-bg)',
                              color: 'var(--text)',
                              fontSize: '11px',
                              minHeight: 36,
                            }}
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                          <div style={{ flex: 1 }} />
                          <Button variant="secondary" onClick={handleCancelEdit} style={{ minHeight: 44, padding: '0 16px' }}>
                            Cancel
                          </Button>
                          <Button variant="primary" onClick={() => handleSaveEdit(n.id)} style={{ minHeight: 44, padding: '0 16px' }}>
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            fontSize: 'var(--t-body)',
                            color: isResolved ? 'var(--muted)' : 'var(--text)',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            textDecoration: isResolved ? 'line-through' : 'none',
                          }}
                        >
                          {n.text}
                        </div>

                        {/* Interactive Clickable Reference Links with entity icons */}
                        {allRefs.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                            {allRefs.map(ref => (
                              <div key={ref} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Link
                                  to={getReferenceUrl(ref)}
                                  className="note-ref-chip"
                                  title={`Open ${ref} details page`}
                                >
                                  <Icon name={getReferenceIconName(ref)} size={12} />
                                  {ref}
                                  <Icon name="external_link" size={10} style={{ opacity: 0.7 }} />
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntityFilter(ref)}
                                  title={`Filter all notes by ${ref}`}
                                  style={{
                                    border: 'none',
                                    background: 'var(--surface-2)',
                                    color: 'var(--muted)',
                                    cursor: 'pointer',
                                    padding: '2px 5px',
                                    borderRadius: 'var(--r-sm)',
                                    fontSize: '10px',
                                  }}
                                >
                                  Filter
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Resolution Attribution */}
                        {isResolved && n.resolvedBy && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: '6px 10px',
                              borderRadius: 'var(--r-sm)',
                              background: 'rgba(47, 158, 68, 0.08)',
                              color: 'var(--success-text)',
                              fontSize: '11px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Icon name="check" size={12} />
                            Completed by {n.resolvedBy}
                          </div>
                        )}

                        {/* Card Bottom Actions */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: 12,
                            paddingTop: 8,
                            borderTop: '1px solid var(--border)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleResolve(n.id)}
                            style={{
                              minHeight: 36,
                              padding: '0 10px',
                              borderRadius: 'var(--r-sm)',
                              border: `1px solid ${isResolved ? 'var(--border)' : 'var(--success-border, rgba(47, 158, 68, 0.4))'}`,
                              background: isResolved ? 'var(--surface-2)' : 'rgba(47, 158, 68, 0.08)',
                              color: isResolved ? 'var(--muted)' : 'var(--success-text)',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all var(--dur-fast)',
                            }}
                          >
                            <Icon name="check" size={14} />
                            {isResolved ? 'Reopen Task' : 'Mark as Done'}
                          </button>

                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(n)}
                              title="Edit note"
                              style={{
                                minHeight: 36,
                                padding: '0 8px',
                                borderRadius: 'var(--r-sm)',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                fontSize: '11px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Icon name="edit" size={13} />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (navigator.clipboard) {
                                  void navigator.clipboard.writeText(n.text).then(() => {
                                    toast?.showSuccessToast('Copied', 'Note text copied.')
                                  })
                                }
                              }}
                              title="Copy text"
                              style={{
                                minHeight: 36,
                                padding: '0 8px',
                                borderRadius: 'var(--r-sm)',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                fontSize: '11px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Icon name="copy" size={13} />
                              Copy
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Column: Note Composer & Entity Picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Note Composer Card */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              padding: 18,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                Post Internal Dispatch Note
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Ctrl+Enter to post
              </span>
            </div>

            {/* Quick Templates */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                Quick Prompts:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {QUICK_TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    type="button"
                    className="note-template-pill"
                    onClick={() => handleApplyTemplate(t)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handlePost} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <textarea
                ref={textareaRef}
                rows={4}
                aria-label="Internal note draft"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handlePost()
                  }
                }}
                placeholder="Log equipment defect, turnover checklist, booking warning... Use IDs like BR-2613 or EQ-SONY-FX6-02."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-body)',
                  resize: 'vertical',
                  minHeight: 90,
                  fontFamily: 'inherit',
                  lineHeight: 1.45,
                }}
              />

              {/* Entity ID Attachment Section */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="barcode" size={13} style={{ color: 'var(--accent)' }} />
                    Entity ID Tag:
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEntitySelectorOpen(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {attachedRefId ? 'Change ID ↗' : '+ Select / Search ID ↗'}
                  </button>
                </div>

                {attachedRefId ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="attached-ref-chip">
                      <Icon name={getReferenceIconName(attachedRefId)} size={13} />
                      {attachedRefId}
                      <button
                        type="button"
                        onClick={() => setAttachedRefId(null)}
                        title="Remove attached ID"
                      >
                        ×
                      </button>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Linked to note
                    </span>
                  </div>
                ) : detectedRef ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px' }}>
                    <span style={{ color: 'var(--muted)' }}>Detected in text:</span>
                    <span className="note-ref-chip">
                      <Icon name={getReferenceIconName(detectedRef)} size={11} />
                      {detectedRef}
                    </span>
                  </div>
                ) : (
                  /* Quick Suggested Entity Chips */
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {suggestedEntities.map(item => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => setAttachedRefId(item.code)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--r-pill)',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title={`Attach ${item.code} (${item.title})`}
                      >
                        +{item.code}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category and Urgency */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as NoteCategory)}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                    Urgency
                  </label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as NotePriority)}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    <option value="low">Low Priority</option>
                    <option value="normal">Normal</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">🚨 Urgent Attention</option>
                  </select>
                </div>
              </div>

              <Button
                variant="primary"
                type="submit"
                disabled={!draft.trim()}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Icon name="plus" size={16} />
                Post to Dispatch Log
              </Button>
            </form>
          </div>

          {/* Guidelines Box */}
          <div
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              padding: '14px 16px',
              fontSize: '12px',
              color: 'var(--text2)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="info" size={15} style={{ color: 'var(--accent)' }} />
              Ops Protocol & Shortcuts
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>
                Click <strong>Select / Search ID</strong> to link equipment tags (<code>EQ-SONY-FX6-02</code>), bookings (<code>BR-2613</code>), or client codes.
              </li>
              <li>Press <kbd style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--card)', border: '1px solid var(--border)', fontSize: '11px' }}>Ctrl+Enter</kbd> to quickly submit your note.</li>
              <li>Press <kbd style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--card)', border: '1px solid var(--border)', fontSize: '11px' }}>/</kbd> to instantly focus search.</li>
              <li>Use <strong>Shift Brief</strong> button to export formatted summaries for WhatsApp or Telegram turnover.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
