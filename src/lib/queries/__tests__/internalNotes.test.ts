// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  listInternalNotes,
  saveInternalNotes,
  addInternalNote,
  updateInternalNote,
  togglePinNote,
  toggleResolveNote,
  deleteInternalNote,
  clearResolvedNotes,
  extractReferenceId,
  extractReferenceIds,
  getReferenceUrl,
  getInternalNotesStats,
  formatShiftHandoverMarkdown,
  INTERNAL_NOTES_SEED,
  type InternalNote,
} from '../internalNotes'

describe('internalNotes query engine', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists seed notes when storage is empty', () => {
    const notes = listInternalNotes()
    expect(notes.length).toBe(INTERNAL_NOTES_SEED.length)
    expect(notes[0]?.id).toBe('note-1')
  })

  it('adds a new internal note with auto-detected reference ID', () => {
    const note = addInternalNote({
      author: 'Test User',
      authorRole: 'Technician',
      text: 'Check ARRI SkyPanel cable on BR-2699 before pickup',
      category: 'Gear Alert',
      priority: 'urgent',
    })

    expect(note.id).toMatch(/^note-/)
    expect(note.referenceId).toBe('BR-2699')
    expect(note.referenceIds).toEqual(['BR-2699'])
    expect(note.category).toBe('Gear Alert')
    expect(note.priority).toBe('urgent')
    expect(note.status).toBe('open')

    const list = listInternalNotes()
    expect(list[0]?.id).toBe(note.id)
  })

  it('updates an existing internal note', () => {
    const note = addInternalNote({
      author: 'Tester',
      authorRole: 'Operations',
      text: 'Initial message for EQ-FX6-01',
      category: 'General',
    })

    const updated = updateInternalNote(note.id, {
      text: 'Updated message with BR-5500',
      category: 'Shift Handover',
      priority: 'high',
    })

    expect(updated).not.toBeNull()
    expect(updated?.text).toBe('Updated message with BR-5500')
    expect(updated?.category).toBe('Shift Handover')
    expect(updated?.priority).toBe('high')
    expect(updated?.referenceId).toBe('BR-5500')
  })

  it('toggles pin status', () => {
    const note = addInternalNote({
      author: 'Babin',
      authorRole: 'Lead',
      text: 'Pin test',
      category: 'General',
    })
    expect(note.pinned).toBeFalsy()

    const pinned = togglePinNote(note.id)
    expect(pinned).toBe(true)
    const afterPin = listInternalNotes().find(n => n.id === note.id)
    expect(afterPin?.pinned).toBe(true)

    const unpinned = togglePinNote(note.id)
    expect(unpinned).toBe(true)
    const afterUnpin = listInternalNotes().find(n => n.id === note.id)
    expect(afterUnpin?.pinned).toBe(false)
  })

  it('toggles resolve status with operator attribution', () => {
    const note = addInternalNote({
      author: 'Bikash',
      authorRole: 'Driver',
      text: 'Delivery pending',
      category: 'Logistics & Transport',
    })
    expect(note.status).toBe('open')

    const resolved = toggleResolveNote(note.id, 'Rita M')
    expect(resolved).toBe(true)
    const afterResolve = listInternalNotes().find(n => n.id === note.id)
    expect(afterResolve?.status).toBe('resolved')
    expect(afterResolve?.resolvedBy).toBe('Rita M')
    expect(afterResolve?.resolvedAt).toBeDefined()

    const reopened = toggleResolveNote(note.id)
    expect(reopened).toBe(true)
    const afterReopen = listInternalNotes().find(n => n.id === note.id)
    expect(afterReopen?.status).toBe('open')
    expect(afterReopen?.resolvedBy).toBeUndefined()
  })

  it('deletes an internal note', () => {
    const note = addInternalNote({
      author: 'Test',
      authorRole: 'Tech',
      text: 'To be deleted',
      category: 'General',
    })
    const deleted = deleteInternalNote(note.id)
    expect(deleted).toBe(true)
    expect(listInternalNotes().some(n => n.id === note.id)).toBe(false)
  })

  it('clears resolved notes', () => {
    const customNotes: InternalNote[] = [
      {
        id: 'n1',
        author: 'A',
        authorRole: 'R',
        at: 'now',
        timestamp: 100,
        category: 'General',
        text: 'Open note',
        status: 'open',
      },
      {
        id: 'n2',
        author: 'B',
        authorRole: 'R',
        at: 'now',
        timestamp: 200,
        category: 'General',
        text: 'Resolved note',
        status: 'resolved',
      },
    ]
    saveInternalNotes(customNotes)
    const removed = clearResolvedNotes()
    expect(removed).toBe(1)
    const remaining = listInternalNotes()
    expect(remaining.length).toBe(1)
    expect(remaining[0]?.id).toBe('n1')
  })

  describe('reference ID extraction and routing', () => {
    it('extracts various entity reference IDs', () => {
      expect(extractReferenceId('Check BR-2613 on shelf')).toBe('BR-2613')
      expect(extractReferenceId('Payment received for INV-2041 via Fonepay')).toBe('INV-2041')
      expect(extractReferenceId('Inspect EQ-SONY-FX6-02 lens mount')).toBe('EQ-SONY-FX6-02')
      expect(extractReferenceId('Quote Q-1049 discount approved')).toBe('Q-1049')
      expect(extractReferenceId('Client CL-102 VIP handling')).toBe('CL-102')
      expect(extractReferenceId('Damage record DM-1002 reported')).toBe('DM-1002')
      expect(extractReferenceId('No entities mentioned')).toBeUndefined()
    })

    it('extracts multiple reference IDs from a single text', () => {
      const text = 'Compare BR-2613 and BR-2614 with EQ-SONY-FX6-01'
      const refs = extractReferenceIds(text)
      expect(refs).toEqual(['BR-2613', 'BR-2614', 'EQ-SONY-FX6-01'])
    })

    it('maps reference IDs to correct destination routes', () => {
      expect(getReferenceUrl('BR-2613')).toBe('/rentals/BR-2613')
      expect(getReferenceUrl('INV-2041')).toBe('/finance?tab=invoices&search=INV-2041')
      expect(getReferenceUrl('EQ-SONY-FX6-02')).toBe('/inventory?search=EQ-SONY-FX6-02')
      expect(getReferenceUrl('CL-102')).toBe('/clients?search=CL-102')
      expect(getReferenceUrl('Q-1049')).toBe('/rentals?search=Q-1049')
    })
  })

  describe('statistics and markdown export', () => {
    it('calculates operational statistics accurately', () => {
      const sampleNotes: InternalNote[] = [
        {
          id: '1',
          author: 'A',
          authorRole: 'Role',
          at: 'now',
          timestamp: 1,
          category: 'Gear Alert',
          priority: 'urgent',
          status: 'open',
          text: 'Alert 1',
        },
        {
          id: '2',
          author: 'B',
          authorRole: 'Role',
          at: 'now',
          timestamp: 2,
          category: 'Shift Handover',
          priority: 'high',
          status: 'open',
          text: 'Handover 1',
        },
        {
          id: '3',
          author: 'C',
          authorRole: 'Role',
          at: 'now',
          timestamp: 3,
          category: 'General',
          status: 'resolved',
          text: 'Done 1',
        },
      ]
      const stats = getInternalNotesStats(sampleNotes)
      expect(stats.total).toBe(3)
      expect(stats.open).toBe(2)
      expect(stats.resolved).toBe(1)
      expect(stats.gearAlerts).toBe(1)
      expect(stats.urgentCount).toBe(1)
      expect(stats.handoverCount).toBe(1)
    })

    it('generates formatted shift handover markdown', () => {
      const sampleNotes: InternalNote[] = [
        {
          id: '1',
          author: 'Rita',
          authorRole: 'Technician',
          at: 'now',
          timestamp: 1,
          category: 'Gear Alert',
          referenceId: 'EQ-SONY-01',
          status: 'open',
          text: 'Sensor dirty',
        },
        {
          id: '2',
          author: 'Babin',
          authorRole: 'Lead',
          at: 'now',
          timestamp: 2,
          category: 'Shift Handover',
          referenceId: 'BR-2613',
          status: 'open',
          text: 'Pack 4 cases',
        },
      ]
      const md = formatShiftHandoverMarkdown(sampleNotes)
      expect(md).toContain('BABIN RENTALS OS — SHIFT HANDOVER BRIEF')
      expect(md).toContain('GEAR ALERTS (1)')
      expect(md).toContain('[EQ-SONY-01] Sensor dirty (Rita)')
      expect(md).toContain('SHIFT HANDOVER ITEMS (1)')
      expect(md).toContain('[BR-2613] Pack 4 cases (Babin)')
    })
  })
})
