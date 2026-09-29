import { describe, expect, it } from 'vitest'
import { buildTimelineWindow } from '../RentalTimeline'
import type { RentalListRow } from '../../../lib/queries/bookings'

function row(pickup: string, ret: string): RentalListRow {
  return {
    id: pickup,
    bookingNo: 'B-1',
    clientId: 'client-1',
    client: 'Himalayan Films',
    monogram: 'HF',
    avatarTone: 'primary',
    project: 'Documentary',
    projectTypeDisplay: 'Documentary',
    projectTypeValue: 'Documentary',
    pickupLocation: null,
    returnLocation: null,
    itemCount: 1,
    createdOn: pickup,
    status: 'Booked',
    statusKey: 'primary',
    flags: [],
    isCancelled: false,
    isClosed: false,
    isOverdue: false,
    progress: 1,
    progressTone: 'primary',
    pickup: { date: pickup, time: '06:00 AM' },
    ret: { date: ret, time: '06:00 AM' },
    deliveryType: 'Client Pickup',
    quoteExpires: null,
    deposit: null,
    isExternal: false,
  }
}

describe('buildTimelineWindow', () => {
  it('fits the visible bookings into complete day columns', () => {
    const result = buildTimelineWindow([row('15 Sep 2026', '18 Sep 2026')])
    expect(result.dayCount).toBe(4)
    expect(result.clipped).toBe(false)
  })

  it('caps unusually wide result sets and reports that clipping', () => {
    const result = buildTimelineWindow([row('1 Jan 2026', '1 Apr 2026')])
    expect(result.dayCount).toBe(45)
    expect(result.clipped).toBe(true)
  })
})
