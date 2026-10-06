import type { RentalDraftData } from '../../../actions/rentals/saveDraft'
import { readLocal, removeLocal, writeLocal } from '../../../lib/safeStorage'

/**
 * # A device-local copy of an UNSAVED New Rental (C4)
 *
 * Once the first **Save draft** lands, New Rental already autosaves to the
 * server every 2.5 s (`NewRental.tsx`, the `draftHasUnsavedChanges` effect).
 * What nothing protected was the stretch BEFORE that first save: a coordinator
 * who has built a ten-line quote and then has the tab reloaded, the tablet
 * sleep or the battery die loses all of it.
 *
 * This is that stretch, and only that. It writes the same `RentalDraftData`
 * snapshot the server draft uses, to this device, and offers it back.
 *
 * ## Why not autosave the new booking to the server too
 *
 * A server write creates a draft row and, with it, a booking number and a
 * `client_uuid` (Law 8). Doing that on every keystroke of a form nobody has
 * chosen to save would leave stray drafts behind. Restoring is therefore a
 * **choice** (a banner with Restore and Discard), never automatic.
 *
 * ## What it will not do
 *
 * - **Shared devices.** Not written when `isSharedDevice` is true: a client's
 *   name and project on a counter tablet is the next person's to read.
 * - **Per user.** The key carries the user id, so one login never restores
 *   another's work.
 * - **Money.** Nothing here computes or interprets a figure; it stores what the
 *   form already holds, and the pricing pipeline recalculates on restore.
 * - **Stale copies.** A copy older than `MAX_AGE_MS` is dropped on read.
 */

const KEY_PREFIX = 'br.newRentalLocalDraft.v1.'

/** A week: long enough to cover a weekend, short enough not to resurrect last month's quote. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface LocalDraft {
  data: RentalDraftData
  /** AD, UTC (law 7). */
  savedAt: string
}

const keyFor = (userId: string): string => `${KEY_PREFIX}${userId}`

/** A form with nothing entered is not worth a copy and must not offer a restore. */
export function isMeaningful(data: RentalDraftData): boolean {
  return (
    data.lines.length > 0 ||
    data.crew.length > 0 ||
    data.project.trim() !== '' ||
    (data.selectedClientId !== null && data.selectedClientId !== '') ||
    data.specialInstructions.trim() !== ''
  )
}

export function writeLocalDraft(userId: string, data: RentalDraftData, now: Date = new Date()): boolean {
  if (!userId || !isMeaningful(data)) return false
  const payload: LocalDraft = { data, savedAt: now.toISOString() }
  return writeLocal(keyFor(userId), JSON.stringify(payload))
}

export function readLocalDraft(userId: string, now: Date = new Date()): LocalDraft | null {
  if (!userId) return null
  const raw = readLocal(keyFor(userId))
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LocalDraft> | null
    const data = parsed?.data
    const savedAt = parsed?.savedAt
    if (!data || data.version !== 1 || !Array.isArray(data.lines) || !Array.isArray(data.crew)) throw new Error('shape')
    if (typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) throw new Error('shape')
    if (now.getTime() - Date.parse(savedAt) > MAX_AGE_MS) throw new Error('stale')
    if (!isMeaningful(data)) throw new Error('empty')
    return { data, savedAt }
  } catch {
    /* Unreadable, stale or empty: it can never be restored, so stop carrying it. */
    removeLocal(keyFor(userId))
    return null
  }
}

export function clearLocalDraft(userId: string): void {
  if (userId) removeLocal(keyFor(userId))
}
