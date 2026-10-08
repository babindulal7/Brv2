import { describe, it, expect, vi } from 'vitest'
import { listActivityEvents } from '../activity'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: new Error('Simulated database error'),
          }),
        })),
      })),
    })),
  },
}))

describe('activity query module', () => {
  it('returns empty rows and zero total on database error', async () => {
    const res = await listActivityEvents()
    expect(res.rows).toEqual([])
    expect(res.total).toBe(0)
  })
})
