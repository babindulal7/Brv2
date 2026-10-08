import { describe, it, expect } from 'vitest'
import {
  getEvidenceSummary,
  PHOTOS,
  matchState,
  THRESHOLDS,
  CATEGORY_NAMES,
  UPLOAD_SOURCES,
  UPLOAD_ROADMAP,
  STEPS,
  BULK_ACTIONS,
  LIMITS,
} from '../evidence'

import { supabase } from '../../supabase'
import { vi, beforeEach } from 'vitest'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('evidence queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('re-exports canonical evidence configurations and limits', () => {
    expect(PHOTOS.length).toBeGreaterThan(0)
    expect(CATEGORY_NAMES.length).toBeGreaterThan(0)
    expect(UPLOAD_SOURCES.length).toBeGreaterThan(0)
    expect(UPLOAD_ROADMAP.length).toBeGreaterThan(0)
    expect(STEPS.length).toBeGreaterThan(0)
    expect(BULK_ACTIONS.length).toBeGreaterThan(0)
    expect(LIMITS.image).toBeDefined()
    expect(THRESHOLDS.matched).toBe(95)
  })

  it('correctly calculates matchState for sample photos', () => {
    const matchedPhoto = PHOTOS.find((p) => p.source === 'QR')
    if (matchedPhoto) {
      expect(matchState(matchedPhoto)).toBe('Matched')
    }
  })

  it('loads evidence summary with 0 counts when empty or error', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const summary = await getEvidenceSummary()
    expect(summary.total).toBe(0)
    expect(summary.photos).toEqual([])
    expect(summary.matched).toBe(0)
    expect(summary.review).toBe(0)
    expect(summary.unmatched).toBe(0)
  })

  it('loads evidence summary with valid counts when data present', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [
        { id: '1', match_state: 'Matched', match_source: 'QR', category: 'Camera', processing_step: 'Processed' },
        { id: '2', match_state: 'Review', match_source: 'AI', category: 'Lens', processing_step: 'Processed' },
      ],
      error: null,
    })
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const summary = await getEvidenceSummary()
    expect(summary.total).toBe(2)
    expect(summary.matched).toBe(1)
    expect(summary.review).toBe(1)
    expect(summary.unmatched).toBe(0)
    expect(summary.matched + summary.review + summary.unmatched).toBe(summary.total)
  })
})
