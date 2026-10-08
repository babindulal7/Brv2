// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearFloorScan, loadFloorScan, saveFloorScan } from '../floorScanStorage'

describe('floorScanStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('saves and restores a floor scan payload correctly', () => {
    const bookingId = 'booking-123'
    const payload = {
      marks: { 'unit-1': { state: 'Packed', via: 'scan' } },
      notes: 'Pack fragile camera in Peli case',
    }

    saveFloorScan('pack', bookingId, payload)
    const restored = loadFloorScan<typeof payload>('pack', bookingId)

    expect(restored).not.toBeNull()
    expect(restored?.bookingId).toBe(bookingId)
    expect(restored?.verb).toBe('pack')
    expect(restored?.payload.marks['unit-1'].state).toBe('Packed')
    expect(restored?.payload.notes).toBe('Pack fragile camera in Peli case')
  })

  it('differentiates between pack and return verbs for the same booking', () => {
    const bookingId = 'booking-456'
    saveFloorScan('pack', bookingId, { status: 'packed' })
    saveFloorScan('return', bookingId, { status: 'returned' })

    const packRecord = loadFloorScan<{ status: string }>('pack', bookingId)
    const returnRecord = loadFloorScan<{ status: string }>('return', bookingId)

    expect(packRecord?.payload.status).toBe('packed')
    expect(returnRecord?.payload.status).toBe('returned')
  })

  it('clears persisted session when clearFloorScan is called', () => {
    const bookingId = 'booking-789'
    saveFloorScan('pack', bookingId, { key: 'value' })
    expect(loadFloorScan('pack', bookingId)).not.toBeNull()

    clearFloorScan('pack', bookingId)
    expect(loadFloorScan('pack', bookingId)).toBeNull()
  })

  it('gracefully handles corrupted storage entries', () => {
    const bookingId = 'booking-corrupt'
    window.localStorage.setItem(`babin-rentals:floor-scan:pack:${bookingId}`, 'invalid-json{{{')

    const result = loadFloorScan('pack', bookingId)
    expect(result).toBeNull()
  })
})
