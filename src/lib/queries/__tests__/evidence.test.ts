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

describe('evidence queries', () => {
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

  it('loads evidence summary with valid counts', async () => {
    const summary = await getEvidenceSummary()
    expect(summary.total).toBeGreaterThan(0)
    expect(summary.matched).toBeGreaterThanOrEqual(0)
    expect(summary.review).toBeGreaterThanOrEqual(0)
    expect(summary.unmatched).toBeGreaterThanOrEqual(0)
    expect(summary.matched + summary.review + summary.unmatched).toBe(summary.total)
  })
})
