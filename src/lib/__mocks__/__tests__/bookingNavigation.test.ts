import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Row } from '../engine'

vi.mock('../../supabase', async () => ({
  supabase: (await import('../client')).mockSupabase,
  IS_MOCK: true,
}))

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed))
  return {
    get length() { return data.size },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
    clear: () => { data.clear() },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('local rental list-to-workspace navigation', () => {
  it('resolves every seeded rental and preserves its lines through bare, displayed and legacy references', async () => {
    vi.stubEnv('VITE_MOCK_SEEDED', 'true')
    vi.stubGlobal('localStorage', memoryStorage())
    const { mockSupabase } = await import('../client')
    const { fetchFloorBooking } = await import('../../queries/bookings')
    const result = await mockSupabase.from('bookings').select('id, booking_no, stage')
    expect(result.error).toBeNull()
    const bookings = result.data as Row[]
    expect(bookings.length).toBeGreaterThan(0)
    const stages = new Set<string>()
    for (const booking of bookings) {
      const number = String(booking['booking_no'])
      expect(number).toMatch(/^\d+$/)
      const floor = await fetchFloorBooking(number)
      expect(floor?.id).toBe(booking['id'])
      expect(floor?.stage).toBe(booking['stage'])
      expect(floor?.lines.length).toBeGreaterThan(0)
      expect((await fetchFloorBooking(`#${number}`))?.id).toBe(booking['id'])
      expect((await fetchFloorBooking(`B-${number}`))?.id).toBe(booking['id'])
      stages.add(String(booking['stage']))
    }
    expect(stages).toEqual(new Set(['Quote', 'Booked', 'Packed', 'On Rent', 'Returned', 'Closed']))
  })

  it('keeps existing local records and allocates unique bare numbers across both sequence aliases and reload', async () => {
    vi.stubEnv('VITE_MOCK_SEEDED', 'false')
    const storage = memoryStorage({
      'babin.mock.overlay.v1': JSON.stringify({
        inserts: [{ table: 'bookings', row: { id: 'existing-rental', booking_no: 'B-864', project: 'Preserve this draft' } }],
        updates: [], deletes: [], seq: { booking: 2, BK: 5 },
      }),
    })
    vi.stubGlobal('localStorage', storage)
    let client = (await import('../client')).mockSupabase
    const booking = await client.from('bookings').select('*').eq('booking_no', '864').maybeSingle()
    expect(booking.data).toMatchObject({ id: 'existing-rental', booking_no: '864', project: 'Preserve this draft' })
    expect((await client.rpc('next_document_number', { p_sequence_key: 'booking' })).data).toBe('865')
    expect((await client.rpc('next_document_number', { p_sequence_key: 'BK' })).data).toBe('866')
    vi.resetModules()
    client = (await import('../client')).mockSupabase
    expect((await client.rpc('next_document_number', { p_sequence_key: 'booking' })).data).toBe('867')
    expect((await client.from('bookings').select('*').eq('booking_no', '864').maybeSingle()).data).toMatchObject({ id: 'existing-rental' })
  })
})
