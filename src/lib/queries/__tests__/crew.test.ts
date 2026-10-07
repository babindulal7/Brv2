import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listCrewAssignments, listCrewMembers } from '../crew'

const db = vi.hoisted(() => ({ error: null as { message: string } | null }))
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: { from: () => ({ select: () => ({ order: async () => ({ data: [], error: db.error }), then: (resolve: (result: { data: never[]; error: typeof db.error }) => unknown) => Promise.resolve({ data: [], error: db.error }).then(resolve) }) }) },
}))

beforeEach(() => { db.error = null })
describe('live crew queries', () => {
  it('keeps an empty assignment registry empty', async () => {
    expect(await listCrewAssignments()).toEqual({ rows: [], total: 0 })
  })
  it('keeps an empty roster empty', async () => {
    expect(await listCrewMembers()).toEqual({ rows: [], total: 0 })
  })
  it('reports assignment read failure instead of showing demo assignments', async () => {
    db.error = { message: 'Session expired' }
    await expect(listCrewAssignments()).rejects.toThrow('Session expired')
  })
  it('reports roster read failure instead of showing demo people', async () => {
    db.error = { message: 'Session expired' }
    await expect(listCrewMembers()).rejects.toThrow('Session expired')
  })
})
