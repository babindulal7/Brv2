import { describe, it, expect, vi } from 'vitest'
import { listMembers, MEMBERS } from '../membership'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        data: null,
        error: new Error('Simulated database error'),
      }),
    })),
  },
}))

describe('membership query module', () => {
  it('falls back to MEMBERS on error or empty table', async () => {
    const res = await listMembers()
    expect(res.rows).toEqual(MEMBERS)
    expect(res.total).toBe(MEMBERS.length)
  })
})
