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
import { toBs, formatBs } from '../../lib/bs'
import {
  listInternalNotes,
  addInternalNote,
  updateInternalNote,
  togglePinNote,
  toggleResolveNote,
  deleteInternalNote,
  clearResolvedNotes,
  getInternalNotesStats,
  formatShiftHandoverMarkdown,
  getReferenceUrl,
  extractReferenceId,
  extractReferenceIds,
  type InternalNote,
  type NoteCategory,
  type NotePriority,
} from '../../lib/queries/internalNotes'
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
  },
  {
    label: '🔄 Shift Handover',
    category: 'Shift Handover' as NoteCategory,
    priority: 'high' as NotePriority,
    template: 'Shift Handover: BR-2613 packed 3 cases; NiSi primes pending final check.',
  },
  {
    label: '🚚 Dispatch Route',
    category: 'Logistics & Transport' as NoteCategory,
    priority: 'high' as NotePriority,
    template: 'Dispatch BR-2615: Balkhu road blockage, driver reroute via Kirtipur.',
  },
  {
    label: '👤 Client Remark',
    category: 'Client Remark' as NoteCategory,
    priority: 'normal' as NotePriority,
    template: 'Client Q-1049 requested 6:00 AM delivery to site; call location manager 30m prior.',
  },
]

export default function InternalNotesPage() {
  const { user } = useAuth()
  const toast = useOptionalToast()

  const [notes, setNotes] = useState<InternalNote[]>(() => listInternalNotes())
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState<NoteCategory>('General')
  const [priority, setPriority] = useState<NotePriority>('normal')

  // Filters & search
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('All')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved' | 'pinned'>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent'>('all')
  const [sortBy, setSortBy] = useState<'pinned-first' | 'newest' | 'oldest' | 'priority'>('pinned-first')

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editCategory, setEditCategory] = useState<NoteCategory>('General')
  const [editPriority, setEditPriority] = useState<NotePriority>('normal')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const reloadNotes = () => {
    setNotes(listInternalNotes())
  }

  useEffect(() => {
    const handleUpdate = () => reloadNotes()
    window.addEventListener('babin:notes-updated', handleUpdate)
    return () => window.removeEventListener('babin:notes-updated', handleUpdate)
  }, [])

  const detectedRef = useMemo(() => extractReferenceId(draft), [draft])

  // Current NPT & BS Date header
  const nepaliDateStr = useMemo(() => {
    try {
      const now = new Date()
      const bs = toBs(now)
      const bsStr = bs ? formatBs(bs) : ''
      const adStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      return bsStr ? `${bsStr} BS (${adStr} AD)` : `${adStr} AD`
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
    toast?.showSuccessToast('Note Posted', 'Shift log updated successfully.')
  }

  const handleApplyTemplate = (tmpl: typeof QUICK_TEMPLATES[number]) => {
    setCategory(tmpl.category)
    setPriority(tmpl.priority)
    setDraft(tmpl.template)
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

  const handleCopyHandover = () => {
    const brief = formatShiftHandoverMarkdown(notes)
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(brief).then(() => {
        toast?.showSuccessToast('Handover Copied', 'Shift summary copied to clipboard for WhatsApp/Telegram.')
      })
    }
  }

  const handleStartEdit = (note: InternalNote) => {
    setEditingId(note.id)
    setEditDraft(note.text)
    setEditCategory(note.category)
    setEditPriority(note.priority || 'normal')
  }

  const handleSaveEdit = (id: string) => {
    if (!editDraft.trim()) return
    updateInternalNote(id, {
      text: editDraft,
      category: editCategory,
      priority: editPriority,
    })
    setEditingId(null)
    reloadNotes()
    toast?.showSuccessToast('Note Updated', 'Changes saved successfully.')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
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
  }, [notes, searchTerm, filterCategory, statusFilter, priorityFilter, sortBy])

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
          <Button
            variant="secondary"
            onClick={handleCopyHandover}
            title="Copy formatted shift handover summary for WhatsApp or Telegram"
            style={{ minHeight: 44 }}
          >
            <Icon name="copy" size={16} />
            Copy Shift Brief
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

      {/* Metrics KPI Strip */}
      <div className="notes-metrics-grid">
        <div
          style={{
            background: 'var(--card)',
            border: `1px solid ${stats.gearAlerts > 0 ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
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
            <div style={{ fontSize: '20px', fontWeight: 700, color: stats.gearAlerts > 0 ? 'var(--danger)' : 'var(--text)' }}>
              {stats.gearAlerts}
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
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
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
              {stats.handoverCount}
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--card)',
            border: `1px solid ${stats.urgentCount > 0 ? 'var(--warn)' : 'var(--border)'}`,
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
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
            <div style={{ fontSize: '20px', fontWeight: 700, color: stats.urgentCount > 0 ? 'var(--warn-text)' : 'var(--text)' }}>
              {stats.urgentCount}
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
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
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
              {stats.resolved}
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="notes-layout-grid">
        {/* Left Column: Quick Composer & Templates */}
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
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handlePost()
                  }
                }}
                placeholder="Log equipment defect, turnover checklist, booking warning... Use IDs like BR-2613 or EQ-FX6-02 for instant links."
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

              {/* Category, Priority, and Detected Reference */}
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

              {detectedRef && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>Detected Ref:</span>
                  <span className="note-ref-chip">
                    <Icon name="receipt" size={12} />
                    {detectedRef}
                  </span>
                </div>
              )}

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
              Ops Protocol Tips
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Reference booking IDs (e.g. <code>BR-2613</code>) or asset tags (<code>EQ-SONY-FX6-02</code>) to auto-generate direct links.</li>
              <li>Mark items as <strong>Resolved</strong> once addressed to maintain clean shift turnover.</li>
              <li>Use <strong>Copy Shift Brief</strong> at handover to forward active items to incoming supervisors.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Search, Category Pills, and Feed */}
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
            {/* Top row: Search and Sort */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search notes by keyword, booking ID, author, asset tag..."
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
                      }}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  {searchTerm || filterCategory !== 'All' || statusFilter !== 'all'
                    ? 'No notes match your active filter criteria. Try clearing search or filters.'
                    : 'The team dispatch scratchpad is currently empty. Post a new shift note above.'}
                </div>
                {(searchTerm || filterCategory !== 'All' || statusFilter !== 'all') && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchTerm('')
                      setFilterCategory('All')
                      setStatusFilter('all')
                    }}
                  >
                    Reset Filters
                  </Button>
                )}
              </div>
            ) : (
              filteredNotes.map(n => {
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
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select
                            value={editCategory}
                            onChange={e => setEditCategory(e.target.value as NoteCategory)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 'var(--r-sm)',
                              border: '1px solid var(--border)',
                              background: 'var(--input-bg)',
                              color: 'var(--text)',
                              fontSize: '11px',
                            }}
                          >
                            {CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <select
                            value={editPriority}
                            onChange={e => setEditPriority(e.target.value as NotePriority)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 'var(--r-sm)',
                              border: '1px solid var(--border)',
                              background: 'var(--input-bg)',
                              color: 'var(--text)',
                              fontSize: '11px',
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

                        {/* Interactive Clickable Reference Links */}
                        {allRefs.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                            {allRefs.map(ref => (
                              <Link
                                key={ref}
                                to={getReferenceUrl(ref)}
                                className="note-ref-chip"
                                title={`Open ${ref}`}
                              >
                                <Icon name="receipt" size={12} />
                                {ref}
                                <Icon name="external_link" size={10} style={{ opacity: 0.7 }} />
                              </Link>
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
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
