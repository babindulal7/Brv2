import { describe, it, expect, vi } from 'vitest'
import { listCrewAssignments, listCrewMembers, CREW_DATA, CREW_ROSTER } from '../crew'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('Simulated database error'),
        }),
      })),
    })),
  },
}))

describe('crew query module', () => {
  it('falls back to CREW_DATA on error or empty table', async () => {
    const res = await listCrewAssignments()
    expect(res.rows).toEqual(CREW_DATA)
    expect(res.total).toBe(CREW_DATA.length)
  })

  it('falls back to CREW_ROSTER on error or empty table', async () => {
    const res = await listCrewMembers()
    expect(res.rows).toEqual(CREW_ROSTER)
    expect(res.total).toBe(CREW_ROSTER.length)
  })
})
