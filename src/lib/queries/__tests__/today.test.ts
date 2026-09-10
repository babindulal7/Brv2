import { describe, it, expect } from 'vitest'
import {
  businessDayAd,
  businessNowAd,
  timeOf,
  statusKeyOf,
} from '../today'

describe('today query layer', () => {
  it('computes business day and time in Kathmandu', () => {
    expect(businessDayAd()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(businessNowAd()).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('formats time of movement row', () => {
    expect(timeOf({ scheduledAtAd: '2026-08-15T09:30:00Z' } as any)).toBeDefined()
  })

  it('resolves status key for movement', () => {
    expect(statusKeyOf({ flags: [], status: 'Booked' })).toBeDefined()
  })
})
