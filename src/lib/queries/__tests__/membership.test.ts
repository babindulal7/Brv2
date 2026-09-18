import { describe, it, expect, vi } from 'vitest'
import { listMembers } from '../membership'

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
  it('returns empty array on error or empty table', async () => {
    const res = await listMembers()
    expect(res.rows).toEqual([])
    expect(res.total).toBe(0)
  })
})
