import { describe, expect, it } from 'vitest'
import { normaliseSavedViewQuery } from '../SavedViewsMenu'

describe('normaliseSavedViewQuery', () => {
  it('keeps list meaning while omitting navigation-only state', () => {
    expect(
      normaliseSavedViewQuery('?stage=Packed&page=4&per=50&quick=Overdue&action=new&tab=new'),
    ).toBe('quick=Overdue&stage=Packed')
  })

  it('sorts keys so the same view has one stable identity', () => {
    expect(normaliseSavedViewQuery('sub=on&pickup_at_to=2026-09-20&pickup_at_from=2026-09-15')).toBe(
      'pickup_at_from=2026-09-15&pickup_at_to=2026-09-20&sub=on',
    )
  })
})
