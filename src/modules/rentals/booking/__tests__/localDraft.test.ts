// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { RentalDraftData } from '../../../../actions/rentals/saveDraft'
import { MAX_AGE_MS, clearLocalDraft, isMeaningful, readLocalDraft, writeLocalDraft } from '../localDraft'

const EMPTY = {
  version: 1,
  selectedClientId: null,
  clientDbId: null,
  project: '',
  specialInstructions: '',
  lines: [],
  crew: [],
} as unknown as RentalDraftData

const WITH_PROJECT = { ...EMPTY, project: 'Dashain wedding shoot' } as RentalDraftData
const NOW = new Date('2026-10-06T08:00:00.000Z')

beforeEach(() => window.localStorage.clear())

describe('C4 — a device-local copy of an unsaved New Rental', () => {
  it('stores nothing for a form that has nothing entered', () => {
    expect(isMeaningful(EMPTY)).toBe(false)
    expect(writeLocalDraft('u1', EMPTY, NOW)).toBe(false)
    expect(readLocalDraft('u1', NOW)).toBeNull()
  })

  it('round-trips what was entered, with when it was kept', () => {
    expect(writeLocalDraft('u1', WITH_PROJECT, NOW)).toBe(true)
    const back = readLocalDraft('u1', new Date(NOW.getTime() + 60_000))
    expect(back?.data.project).toBe('Dashain wedding shoot')
    expect(back?.savedAt).toBe(NOW.toISOString())
  })

  it('treats a chosen client, a line or a crew member as meaningful too', () => {
    expect(isMeaningful({ ...EMPTY, selectedClientId: 'c1' } as RentalDraftData)).toBe(true)
    expect(isMeaningful({ ...EMPTY, lines: [{}] } as unknown as RentalDraftData)).toBe(true)
    expect(isMeaningful({ ...EMPTY, crew: [{}] } as unknown as RentalDraftData)).toBe(true)
  })

  it('is per user: one login never restores another login’s booking', () => {
    writeLocalDraft('u1', WITH_PROJECT, NOW)
    expect(readLocalDraft('u2', NOW)).toBeNull()
    expect(readLocalDraft('u1', NOW)).not.toBeNull()
  })

  it('writes nothing without a user id (a shared device passes none)', () => {
    expect(writeLocalDraft('', WITH_PROJECT, NOW)).toBe(false)
    expect(readLocalDraft('', NOW)).toBeNull()
  })

  it('drops a copy older than a week, and stops carrying it', () => {
    writeLocalDraft('u1', WITH_PROJECT, NOW)
    const later = new Date(NOW.getTime() + MAX_AGE_MS + 1)
    expect(readLocalDraft('u1', later)).toBeNull()
    expect(window.localStorage.length).toBe(0)
  })

  it('drops a corrupt or foreign-shaped value rather than offering it', () => {
    window.localStorage.setItem('br.newRentalLocalDraft.v1.u1', '{not json')
    expect(readLocalDraft('u1', NOW)).toBeNull()
    window.localStorage.setItem('br.newRentalLocalDraft.v1.u1', JSON.stringify({ data: { version: 2 }, savedAt: NOW.toISOString() }))
    expect(readLocalDraft('u1', NOW)).toBeNull()
    expect(window.localStorage.length).toBe(0)
  })

  it('clear removes the copy', () => {
    writeLocalDraft('u1', WITH_PROJECT, NOW)
    clearLocalDraft('u1')
    expect(readLocalDraft('u1', NOW)).toBeNull()
  })
})
