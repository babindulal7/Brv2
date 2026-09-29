/**
 * Canonical Team Internal Notes & Dispatch Log — Babin Rentals OS
 *
 * Ported from standalone's notesDrawer (script_1.js:2269352, 2301646).
 * Provides a persistent scratchpad / shift log for staff to record
 * equipment warnings, booking remarks, and turnover notices.
 */

export type NoteCategory = 'General' | 'Gear Alert' | 'Shift Handover' | 'Client Remark'

export interface InternalNote {
  id: string
  author: string
  authorRole: string
  at: string // Formatted time string
  timestamp: number
  category: NoteCategory
  referenceId?: string | undefined // Auto-detected ID like BR-2613, INV-2041, Q-1049
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
    referenceId: 'BR-2613',
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
    referenceId: 'EQ-SONY-FX6-02',
    text: 'Sony FX6 #2 sensor needs wet cleaning before tomorrow\'s Everest documentary shoot.',
    pinned: true,
  },
  {
    id: 'note-3',
    author: 'Sunita Karki',
    authorRole: 'Finance Officer',
    at: '14 Jul 2026 · 07:40',
    timestamp: Date.now() - 3600000 * 8,
    category: 'General',
    text: 'Kathmandu Ad Lab standing deposit confirmed on Fonepay. Unblocked credit limit for weekend.',
    pinned: false,
  },
  {
    id: 'note-4',
    author: 'Bikash Sharma',
    authorRole: 'Driver / Logistics',
    at: '13 Jul 2026 · 18:30',
    timestamp: Date.now() - 3600000 * 18,
    category: 'Client Remark',
    referenceId: 'Q-1049',
    text: 'Q-1049 requested 6:00 AM delivery to Bhaktapur Durbar Square. Call location manager 30 mins ahead.',
    pinned: false,
  },
  {
    id: 'note-5',
    author: 'Hari KC',
    authorRole: 'Warehouse Tech',
    at: '13 Jul 2026 · 21:15',
    timestamp: Date.now() - 3600000 * 15,
    category: 'Shift Handover',
    text: 'Night shift closing: All 4 Arri SkyPanels tested, reset, and safely back on Shelf C-04.',
    pinned: false,
  },
]

export function listInternalNotes(): InternalNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INTERNAL_NOTES_SEED))
      return [...INTERNAL_NOTES_SEED]
    }
    return JSON.parse(raw) as InternalNote[]
  } catch {
    return [...INTERNAL_NOTES_SEED]
  }
}

export function saveInternalNotes(notes: InternalNote[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    window.dispatchEvent(new CustomEvent('babin:notes-updated'))
  } catch (err) {
    console.error('Failed to save internal notes', err)
  }
}

/** Parses booking / invoice / equipment / quote IDs from note text */
export function extractReferenceId(text: string): string | undefined {
  const match = text.match(/\b(?:BR-\d{4,5}|INV-\d{4,5}|Q-\d{4,5}|EQ-[A-Z0-9-]+|DM-\d{4})\b/i)
  return match ? match[0].toUpperCase() : undefined
}

export function addInternalNote(params: {
  author: string
  authorRole: string
  text: string
  category: NoteCategory
  referenceId?: string
}): InternalNote {
  const notes = listInternalNotes()
  const ref = params.referenceId || extractReferenceId(params.text)

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toTimeString().slice(0, 5)
  const at = `${dateStr} · ${timeStr}`

  const newNote: InternalNote = {
    id: `note-${Date.now()}`,
    author: params.author,
    authorRole: params.authorRole,
    at,
    timestamp: Date.now(),
    category: params.category,
    referenceId: ref,
    text: params.text.trim(),
    pinned: false,
  }

  const updated = [newNote, ...notes]
  saveInternalNotes(updated)
  return newNote
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

export function deleteInternalNote(noteId: string): boolean {
  const notes = listInternalNotes()
  const updated = notes.filter(n => n.id !== noteId)
  if (updated.length !== notes.length) {
    saveInternalNotes(updated)
    return true
  }
  return false
}
