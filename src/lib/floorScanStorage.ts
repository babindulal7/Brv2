/**
 * Floor Scan Storage Adapter
 *
 * Persists active warehouse floor scanning sessions (Packing & Return/Inspection)
 * in localStorage so technicians never lose scanned serials or inspection notes
 * if the browser tab suspends, refreshes, or loses connectivity.
 */

export type FloorVerb = 'pack' | 'return'

export interface FloorScanRecord<T> {
  bookingId: string
  verb: FloorVerb
  savedAt: string
  payload: T
}

const STORAGE_PREFIX = 'babin-rentals:floor-scan'

// In-memory fallback if localStorage is restricted (e.g. private browsing or sandbox)
const memoryStore = new Map<string, string>()

function storageKey(verb: FloorVerb, bookingId: string): string {
  return `${STORAGE_PREFIX}:${verb}:${bookingId}`
}

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key)
    }
  } catch {
    // Local storage access blocked or unavailable
  }
  return memoryStore.get(key) ?? null
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value)
      return
    }
  } catch {
    // Quota exceeded or storage unavailable
  }
  memoryStore.set(key, value)
}

function removeStorageItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key)
      return
    }
  } catch {
    // Storage unavailable
  }
  memoryStore.delete(key)
}

/**
 * Saves the in-progress floor scanning payload for a booking.
 */
export function saveFloorScan<T>(verb: FloorVerb, bookingId: string, payload: T): void {
  if (!bookingId) return
  const record: FloorScanRecord<T> = {
    bookingId,
    verb,
    savedAt: new Date().toISOString(),
    payload,
  }
  try {
    setStorageItem(storageKey(verb, bookingId), JSON.stringify(record))
  } catch {
    // Ignore serialization issues
  }
}

/**
 * Loads any persisted in-progress floor scan for a booking.
 * Returns null if no valid record exists.
 */
export function loadFloorScan<T>(verb: FloorVerb, bookingId: string): FloorScanRecord<T> | null {
  if (!bookingId) return null
  const raw = getStorageItem(storageKey(verb, bookingId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as FloorScanRecord<T>
    if (parsed && parsed.bookingId === bookingId && parsed.verb === verb && parsed.payload !== undefined) {
      return parsed
    }
  } catch {
    // Corrupted record
  }
  return null
}

/**
 * Clears the persisted scanning session when completed or explicitly discarded.
 */
export function clearFloorScan(verb: FloorVerb, bookingId: string): void {
  if (!bookingId) return
  removeStorageItem(storageKey(verb, bookingId))
}
