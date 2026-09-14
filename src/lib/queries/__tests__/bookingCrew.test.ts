import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAssignableCrew, listBookingCrew } from '../bookingCrew'
const state = vi.hoisted(() => ({ error: null as { message: string } | null, calls: [] as Array<{ table: string; columns: string; filters: Record<string, unknown> }>, assignments: [{ id: 'a', crew_id: 'c', role_on_shoot: 'Audio', call_time: null, wrap_time: null, days: 2, daily_rate: null, line_total: null }] }))
vi.mock('../../supabase', () => ({ supabase: { from: (table: string) => {
  const call = { table, columns: '', filters: {} as Record<string, unknown> }; state.calls.push(call)
  const q = {
    select: (columns: string) => { call.columns = columns; return q },
    eq: (key: string, value: unknown) => { call.filters[key] = value; return q },
    in: (key: string, value: unknown) => { call.filters[key] = value; return q },
    order: () => q,
    then: (resolve: (value: unknown) => void) => resolve({ data: table === 'crew_assignments_v' ? state.assignments : [{ id: 'c', full_name: 'Mina Rai', primary_role: 'Audio', daily_rate: null }], error: state.error }),
  }; return q
} } }))
beforeEach(() => { state.error = null; state.calls = [] })
describe('booking crew query boundaries', () => {
  it('filters assignments to the booking and omits money projections when not allowed', async () => {
    const rows = await listBookingCrew('booking-id')
    expect(state.calls[0]!.filters).toEqual({ booking_id: 'booking-id' })
    expect(state.calls[0]!.columns).not.toContain('daily_rate')
    expect(state.calls[1]!.filters).toEqual({ id: ['c'] })
    expect(rows[0]).toMatchObject({ name: 'Mina Rai', dailyRate: null, lineTotal: null })
  })
  it('preserves null rates rather than inventing zero', async () => {
    const rows = await listBookingCrew('booking-id', true)
    expect(state.calls[0]!.columns).toContain('daily_rate')
    expect(rows[0]!.dailyRate).toBeNull()
  })
  it('loads only active profiles from the assignment roster', async () => {
    expect((await listAssignableCrew())[0]!.name).toBe('Mina Rai')
    expect(state.calls[0]!.table).toBe('crew_profiles_v2_v')
    expect(state.calls[0]!.filters).toEqual({ is_active: true })
  })
  it('propagates database failures rather than sample or empty rows', async () => {
    state.error = { message: 'Connection failed' }
    await expect(listBookingCrew('booking-id')).rejects.toThrow('Connection failed')
    await expect(listAssignableCrew()).rejects.toThrow('Connection failed')
  })
})
