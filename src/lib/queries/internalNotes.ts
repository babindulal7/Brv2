/**
 * Canonical Team Internal Notes & Dispatch Log — Babin Rentals OS
 *
 * Ported from standalone's notesDrawer (script_1.js:2269352, 2301646).
 * Provides a persistent scratchpad / shift log for staff to record
 * equipment warnings, booking remarks, and turnover notices.
 */

export type NoteCategory =
  | 'General'
  | 'Gear Alert'
  | 'Shift Handover'
  | 'Client Remark'
  | 'Logistics & Transport'

export type NotePriority = 'urgent' | 'high' | 'normal' | 'low'
export type NoteStatus = 'open' | 'resolved'

export interface InternalNote {
  id: string
  author: string
  authorRole: string
  at: string // Formatted time string
  timestamp: number
  category: NoteCategory
  priority?: NotePriority | undefined
  status?: NoteStatus | undefined
  resolvedAt?: number | undefined
  resolvedBy?: string | undefined
  referenceId?: string | undefined // Auto-detected ID like BR-2613, INV-2041, Q-1049
  referenceIds?: string[] | undefined
  text: string
  pinned?: boolean | undefined
}

const STORAGE_KEY = 'babin_internal_notes_v1'

export const INTERNAL_NOTES_SEED: InternalNote[] = [
  {
    id: 'note-1',
    author: 'Babin Dulal',
    authorRole: 'Operations Lead',
    at: '14 Jul 2026 · 08:12',
    timestamp: Date.now() - 3600000 * 3,
    category: 'Shift Handover',
    priority: 'high',
    status: 'open',
    referenceId: 'BR-2613',
    referenceIds: ['BR-2613'],
    text: 'BR-2613 packed 2 of 9 cases — Bikash finishing NiSi primes before 09:30 handover.',
    pinned: true,
  },
  {
    id: 'note-2',
    author: 'Rita Manandhar',
    authorRole: 'Technician',
    at: '14 Jul 2026 · 07:45',
    timestamp: Date.now() - 3600000 * 5,
    category: 'Gear Alert',
    priority: 'urgent',
    status: 'open',
    referenceId: 'EQ-SONY-FX6-02',
    referenceIds: ['EQ-SONY-FX6-02'],
    text: "Sony FX6 #2 sensor needs wet cleaning before tomorrow's Everest documentary shoot.",
    pinned: true,
  },
  {
    id: 'note-3',
    author: 'Bikash Sharma',
    authorRole: 'Driver / Logistics',
    at: '14 Jul 2026 · 07:15',
    timestamp: Date.now() - 3600000 * 6,
    category: 'Logistics & Transport',
    priority: 'high',
    status: 'open',
    referenceId: 'BR-2615',
    referenceIds: ['BR-2615'],
    text: 'Route alert: Road blockage near Ring Road Balkhu. Dispatch delivery BR-2615 via Kirtipur road.',
    pinned: false,
  },
  {
    id: 'note-4',
    author: 'Sunita Karki',
    authorRole: 'Finance Officer',
    at: '14 Jul 2026 · 06:40',
    timestamp: Date.now() - 3600000 * 8,
    category: 'General',
    priority: 'normal',
    status: 'resolved',
    resolvedAt: Date.now() - 3600000 * 4,
    resolvedBy: 'Sunita Karki',
    text: 'Kathmandu Ad Lab standing deposit confirmed on Fonepay. Unblocked credit limit for weekend.',
    pinned: false,
  },
  {
    id: 'note-5',
    author: 'Bikash Sharma',
    authorRole: 'Driver / Logistics',
    at: '13 Jul 2026 · 18:30',
    timestamp: Date.now() - 3600000 * 18,
    category: 'Client Remark',
    priority: 'normal',
    status: 'open',
    referenceId: 'Q-1049',
    referenceIds: ['Q-1049'],
    text: 'Q-1049 requested 6:00 AM delivery to Bhaktapur Durbar Square. Call location manager 30 mins ahead.',
    pinned: false,
  },
  {
    id: 'note-6',
    author: 'Hari KC',
    authorRole: 'Warehouse Tech',
    at: '13 Jul 2026 · 21:15',
    timestamp: Date.now() - 3600000 * 15,
    category: 'Shift Handover',
    priority: 'low',
    status: 'resolved',
    resolvedAt: Date.now() - 3600000 * 12,
    resolvedBy: 'Hari KC',
    text: 'Night shift closing: All 4 Arri SkyPanels tested, reset, and safely back on Shelf C-04.',
    pinned: false,
  },
]

export function listInternalNotes(): InternalNote[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(INTERNAL_NOTES_SEED))
      }
      return [...INTERNAL_NOTES_SEED]
    }
    const parsed = JSON.parse(raw) as InternalNote[]
    // Backfill status if missing in older schema
    return parsed.map(n => ({
      ...n,
      status: n.status || 'open',
      priority: n.priority || 'normal',
    }))
  } catch {
    return [...INTERNAL_NOTES_SEED]
  }
}

export function saveInternalNotes(notes: InternalNote[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('babin:notes-updated'))
    }
  } catch (err) {
    console.error('Failed to save internal notes', err)
  }
}

/** Parses booking / invoice / equipment / quote IDs from note text */
export function extractReferenceId(text: string): string | undefined {
  const match = text.match(/\b(?:BR-\d{4,5}|INV-\d{4,5}|Q-\d{4,5}|EQ-[A-Z0-9-]+|DM-\d{4}|CL-\d{3,5}|ASSET-\d+)\b/i)
  return match ? match[0].toUpperCase() : undefined
}

/** Parses all booking / invoice / equipment / quote IDs from note text */
export function extractReferenceIds(text: string): string[] {
  const matches = text.match(/\b(?:BR-\d{4,5}|INV-\d{4,5}|Q-\d{4,5}|EQ-[A-Z0-9-]+|DM-\d{4}|CL-\d{3,5}|ASSET-\d+)\b/gi)
  if (!matches) return []
  const unique = Array.from(new Set(matches.map(m => m.toUpperCase())))
  return unique
}

/** Resolves an internal reference ID to the destination route */
export function getReferenceUrl(ref: string): string {
  const upper = ref.toUpperCase()
  if (upper.startsWith('BR-')) {
    return `/rentals/${upper}`
  }
  if (upper.startsWith('INV-')) {
    return `/finance?tab=invoices&search=${upper}`
  }
  if (upper.startsWith('EQ-') || upper.startsWith('ASSET-')) {
    return `/inventory?search=${upper}`
  }
  if (upper.startsWith('CL-')) {
    return `/clients?search=${upper}`
  }
  if (upper.startsWith('Q-')) {
    return `/rentals?search=${upper}`
  }
  return `/rentals?search=${upper}`
}

export function addInternalNote(params: {
  author: string
  authorRole: string
  text: string
  category: NoteCategory
  priority?: NotePriority
  referenceId?: string
}): InternalNote {
  const notes = listInternalNotes()
  const ref = params.referenceId || extractReferenceId(params.text)
  const allRefs = extractReferenceIds(params.text)
  if (ref && !allRefs.includes(ref)) {
    allRefs.unshift(ref)
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toTimeString().slice(0, 5)
  const at = `${dateStr} · ${timeStr}`

  const newNote: InternalNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    author: params.author,
    authorRole: params.authorRole,
    at,
    timestamp: Date.now(),
    category: params.category,
    priority: params.priority || 'normal',
    status: 'open',
    referenceId: ref,
    referenceIds: allRefs.length > 0 ? allRefs : undefined,
    text: params.text.trim(),
    pinned: false,
  }

  const updated = [newNote, ...notes]
  saveInternalNotes(updated)
  return newNote
}

export function updateInternalNote(
  noteId: string,
  patch: Partial<Pick<InternalNote, 'text' | 'category' | 'priority' | 'referenceId'>>,
): InternalNote | null {
  const notes = listInternalNotes()
  const idx = notes.findIndex(n => n.id === noteId)
  if (idx === -1) return null

  const existing = notes[idx]
  if (!existing) return null

  const updatedText = patch.text !== undefined ? patch.text.trim() : existing.text
  const ref = patch.referenceId !== undefined ? patch.referenceId : extractReferenceId(updatedText)
  const allRefs = extractReferenceIds(updatedText)
  if (ref && !allRefs.includes(ref)) {
    allRefs.unshift(ref)
  }

  const updatedNote: InternalNote = {
    ...existing,
    text: updatedText,
    category: patch.category !== undefined ? patch.category : existing.category,
    priority: patch.priority !== undefined ? patch.priority : existing.priority,
    referenceId: ref,
    referenceIds: allRefs.length > 0 ? allRefs : undefined,
  }

  const updated = [...notes]
  updated[idx] = updatedNote
  saveInternalNotes(updated)
  return updatedNote
}

export function togglePinNote(noteId: string): boolean {
  const notes = listInternalNotes()
  const idx = notes.findIndex(n => n.id === noteId)
  if (idx === -1) return false
  const updated = [...notes]
  const target = updated[idx]
  if (target) {
    updated[idx] = { ...target, pinned: !target.pinned }
    saveInternalNotes(updated)
    return true
  }
  return false
}

export function toggleResolveNote(noteId: string, operatorName?: string): boolean {
  const notes = listInternalNotes()
  const idx = notes.findIndex(n => n.id === noteId)
  if (idx === -1) return false
  const updated = [...notes]
  const target = updated[idx]
  if (target) {
    const isNowResolved = target.status !== 'resolved'
    updated[idx] = {
      ...target,
      status: isNowResolved ? 'resolved' : 'open',
      resolvedAt: isNowResolved ? Date.now() : undefined,
      resolvedBy: isNowResolved ? (operatorName || 'Operations Staff') : undefined,
    }
    saveInternalNotes(updated)
    return true
  }
  return false
}

export function deleteInternalNote(noteId: string): boolean {
  const notes = listInternalNotes()
  const updated = notes.filter(n => n.id !== noteId)
  if (updated.length !== notes.length) {
    saveInternalNotes(updated)
    return true
  }
  return false
}

export function clearResolvedNotes(): number {
  const notes = listInternalNotes()
  const activeOnly = notes.filter(n => n.status !== 'resolved')
  const removed = notes.length - activeOnly.length
  if (removed > 0) {
    saveInternalNotes(activeOnly)
  }
  return removed
}

export interface InternalNotesStats {
  total: number
  open: number
  resolved: number
  gearAlerts: number
  urgentCount: number
  handoverCount: number
}

export function getInternalNotesStats(notes?: InternalNote[]): InternalNotesStats {
  const source = notes ?? listInternalNotes()
  let open = 0
  let resolved = 0
  let gearAlerts = 0
  let urgentCount = 0
  let handoverCount = 0

  for (const n of source) {
    if (n.status === 'resolved') {
      resolved++
    } else {
      open++
      if (n.category === 'Gear Alert') gearAlerts++
      if (n.priority === 'urgent') urgentCount++
      if (n.category === 'Shift Handover') handoverCount++
    }
  }

  return {
    total: source.length,
    open,
    resolved,
    gearAlerts,
    urgentCount,
    handoverCount,
  }
}

/** Formats active notes into a structured Shift Handover Brief ready to copy to WhatsApp/Telegram */
export function formatShiftHandoverMarkdown(notes?: InternalNote[]): string {
  const source = notes ?? listInternalNotes()
  const activeNotes = source.filter(n => n.status !== 'resolved')
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toTimeString().slice(0, 5)

  let md = `*BABIN RENTALS OS — SHIFT HANDOVER BRIEF*\n`
  md += `📅 Date: ${dateStr} · ${timeStr} NPT\n`
  md += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`

  const alerts = activeNotes.filter(n => n.category === 'Gear Alert')
  if (alerts.length > 0) {
    md += `🚨 *GEAR ALERTS (${alerts.length})*\n`
    alerts.forEach(n => {
      const ref = n.referenceId ? `[${n.referenceId}] ` : ''
      md += `• ${ref}${n.text} (${n.author})\n`
    })
    md += `\n`
  }

  const handovers = activeNotes.filter(n => n.category === 'Shift Handover')
  if (handovers.length > 0) {
    md += `🔄 *SHIFT HANDOVER ITEMS (${handovers.length})*\n`
    handovers.forEach(n => {
      const ref = n.referenceId ? `[${n.referenceId}] ` : ''
      md += `• ${ref}${n.text} (${n.author})\n`
    })
    md += `\n`
  }

  const logistics = activeNotes.filter(n => n.category === 'Logistics & Transport')
  if (logistics.length > 0) {
    md += `🚚 *DISPATCH & LOGISTICS (${logistics.length})*\n`
    logistics.forEach(n => {
      const ref = n.referenceId ? `[${n.referenceId}] ` : ''
      md += `• ${ref}${n.text} (${n.author})\n`
    })
    md += `\n`
  }

  const clientRemarks = activeNotes.filter(n => n.category === 'Client Remark')
  if (clientRemarks.length > 0) {
    md += `👤 *CLIENT REMARKS (${clientRemarks.length})*\n`
    clientRemarks.forEach(n => {
      const ref = n.referenceId ? `[${n.referenceId}] ` : ''
      md += `• ${ref}${n.text} (${n.author})\n`
    })
    md += `\n`
  }

  const general = activeNotes.filter(n => n.category === 'General')
  if (general.length > 0) {
    md += `📝 *GENERAL NOTES (${general.length})*\n`
    general.forEach(n => {
      md += `• ${n.text} (${n.author})\n`
    })
    md += `\n`
  }

  if (activeNotes.length === 0) {
    md += `✨ No active notes pending for shift turnover.\n`
  }

  md += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\nGenerated via Babin Rentals OS`
  return md
}

