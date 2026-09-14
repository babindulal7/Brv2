import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bookCrewConfig } from '../bookCrew'
const state = vi.hoisted(() => ({
  booking: { id: '11111111-1111-4111-8111-111111111111', booking_no: 'B-1', pickup_at: '2026-09-13T04:15:00Z', return_at: '2026-09-15T04:15:00Z', stage: 'Booked', cancelled_at: null as string | null, closed_at: null },
  people: [{ id: '22222222-2222-4222-8222-222222222222', crew_code: 'CR-1', primary_role: 'Sound', full_name: 'Crew One', daily_rate: 6500, is_active: true }],
  inserted: [] as Record<string, unknown>[], missingBooking: false, bookingError: false, insertError: false, duplicate: false,
}))
vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  supabase: { from: (table: string) => {
    let field = '', value: unknown, row: Record<string, unknown>
    const query = {
      select: vi.fn(() => query),
      eq: (key: string, val: unknown) => { field = key; value = val; return query },
      insert: (data: Record<string, unknown>) => { row = data; return query },
      maybeSingle: async () => {
        if (table === 'bookings') return { data: state.missingBooking ? null : state.booking, error: state.bookingError ? { message: 'Connection failed' } : null }
        if (table === 'crew_profiles_v2_v') return { data: state.people.find((p) => p[field as 'id' | 'crew_code'] === value) ?? null, error: null }
        return { data: state.duplicate ? { ...state.inserted[state.inserted.length - 1], id: 'saved' } : null, error: null }
      },
      single: async () => {
        state.inserted.push(row)
        return { data: state.insertError || state.duplicate ? null : { id: `saved-${state.inserted.length}` }, error: state.insertError ? { code: '408', message: 'Network failed' } : state.duplicate ? { code: '23505', message: 'duplicate client_uuid' } : null }
      },
    }
    return query
  } },
}))
const ctx = { userId: 'operator', role: 'Owner' as const }
const input = () => ({ bookingId: state.booking.id, crewIds: [state.people[0]!.id], clientUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
beforeEach(() => { state.inserted = []; state.missingBooking = false; state.bookingError = false; state.insertError = false; state.duplicate = false; state.booking.cancelled_at = null; state.booking.stage = 'Booked'; state.people[0]!.is_active = true })
describe('bookCrew confirmed writes', () => {
  it('saves the chosen booking and person with real default dates and rate', async () => {
    const { result, events } = await bookCrewConfig.execute(input(), ctx)
    expect(result).toEqual({ success: true, count: 1, assignmentIds: ['saved-1'] })
    expect(state.inserted[0]).toMatchObject({ booking_id: state.booking.id, crew_id: state.people[0]!.id, days: 2, daily_rate: 6500, line_total: 13000, call_time: state.booking.pickup_at, client_uuid: input().clientUuid })
    expect(events).toHaveLength(1)
  })
  it('persists supplied role, times, rate, days and notes', async () => {
    await bookCrewConfig.execute({ ...input(), role: 'Audio lead', callTime: '2026-09-13T05:00:00Z', wrapTime: '2026-09-13T10:00:00Z', days: 1, dailyRate: 0, notes: '  Stage A  ' }, ctx)
    expect(state.inserted[0]).toMatchObject({ role_on_shoot: 'Audio lead', days: 1, daily_rate: 0, line_total: 0, notes: 'Stage A', wrap_time: '2026-09-13T10:00:00Z' })
  })
  it('never falls back to another booking when the target is missing', async () => {
    state.missingBooking = true
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('not found')
    expect(state.inserted).toHaveLength(0)
  })
  it('propagates booking read failure without writing', async () => {
    state.bookingError = true
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('Connection failed')
    expect(state.inserted).toHaveLength(0)
  })
  it.each(['Closed', 'cancelled'])('refuses terminal booking %s', async (stage) => {
    if (stage === 'Closed') state.booking.stage = stage
    else state.booking.cancelled_at = '2026-09-13T00:00:00Z'
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('cancelled or closed')
  })
  it('refuses inactive crew', async () => {
    state.people[0]!.is_active = false
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('inactive')
    expect(state.inserted).toHaveLength(0)
  })
  it('preflights every crew member before writing a batch', async () => {
    await expect(bookCrewConfig.execute({ ...input(), crewIds: [state.people[0]!.id, 'missing'] }, ctx)).rejects.toThrow('unavailable')
    expect(state.inserted).toHaveLength(0)
  })
  it('does not report a network failure as a saved or queued assignment', async () => {
    state.insertError = true
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('not saved')
  })
  it('confirms duplicate requests by reading the existing row', async () => {
    state.duplicate = true
    const { result } = await bookCrewConfig.execute(input(), ctx)
    expect(result.assignmentIds).toEqual(['saved'])
  })
  it('refuses a priced assignment for Coordinator', async () => {
    await expect(bookCrewConfig.execute(input(), { ...ctx, role: 'Coordinator' })).rejects.toThrow('Owner, Admin, or Manager')
    expect(state.inserted).toHaveLength(0)
  })
  it.each([{ days: 1.5 }, { days: NaN }, { dailyRate: Infinity }, { dailyRate: -1 }, { clientUuid: 'bad-key' }, { bookingId: '' }, { callTime: 'bad date' }, { wrapTime: '2026-09-12T00:00:00Z' }])('refuses invalid input %j', async (override) => {
    await expect(bookCrewConfig.execute({ ...input(), ...override }, ctx)).rejects.toThrow()
    expect(state.inserted).toHaveLength(0)
  })
})
