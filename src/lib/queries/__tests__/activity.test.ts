import { describe, it, expect, vi } from 'vitest'
import { listActivityEvents, ACTIVITY_TIMELINE } from '../activity'

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
  it('falls back to ACTIVITY_TIMELINE on error or empty table', async () => {
    const res = await listActivityEvents()
    expect(res.rows).toEqual(ACTIVITY_TIMELINE)
    expect(res.total).toBe(ACTIVITY_TIMELINE.length)
  })
})
