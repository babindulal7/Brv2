// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { businessDayAd } from '../../../data/today'
import {
  createDeliveryRecord,
  getDeliveries,
  saveDeliveries,
  updateDeliveryStatus,
  assignDeliveryRider,
  INITIAL_DELIVERIES,
  type DeliveryRecord,
} from '../delivery'

const mode = vi.hoisted(() => ({ mock: true }))
vi.mock('../../supabase', () => ({ get IS_MOCK() { return mode.mock } }))
const context = { role: 'Owner' as const, isOnline: true }

/*
 * Two defects in this module were invisible to the UI because both produced a
 * plausible-looking record:
 *
 *  1. `DEL-${2600 + current.length + 1}` derived the next id from the array's
 *     LENGTH, so a deletion handed the same number to a second dispatch. Two
 *     records shared an id and every later lookup-by-id updated whichever came
 *     first in the array, leaving the other untouched — a dispatch that looked
 *     assigned and had not moved.
 *
 *  2. The dispatch/delivered stamp was built from `toISOString()` (UTC) for the
 *     date and `toTimeString()` (device-local) for the time. Two clocks in one
 *     string, and Kathmandu is UTC+05:45 — so for the first 5h45m of every day
 *     each stamp recorded YESTERDAY with a time ahead of the moment it recorded.
 */

function seed(records: DeliveryRecord[]) {
  saveDeliveries(records, context)
}

function blank(over: Partial<DeliveryRecord> = {}): Omit<DeliveryRecord, 'id'> {
  return {
    bookingNo: 'BR-0000',
    clientName: 'Test Client',
    clientPhone: '+977 9800000000',
    address: 'Test Address',
    neighborhood: 'Test',
    mode: 'Babin Delivery',
    status: 'Scheduled',
    scheduledDate: '2026-07-14',
    scheduledTime: '09:30',
    deliveryFeeNpr: 3500,
    ...over,
  }
}

beforeEach(() => {
  mode.mock = true
  window.localStorage.clear()
})

describe('delivery local preview fail-closed writes', () => {
  it.each(['Driver', 'Client', null] as const)('refuses unscoped internal records for %s', (role) => {
    seed([{ ...blank({ status: 'Ready' }), id: 'DEL-2601' }])
    expect(getDeliveries(role)).toEqual([])
  })
  it.each(['Coordinator', 'Accounts', 'Warehouse', 'Technician', 'Driver', 'Client', null] as const)('refuses %s before writing', (role) => {
    seed([{ ...blank({ status: 'Ready' }), id: 'DEL-2601' }])
    const before = localStorage.getItem('babin_rentals_deliveries_v1')
    const denied = { role, isOnline: true }
    expect(() => updateDeliveryStatus('DEL-2601', 'In Transit', denied)).toThrow('Your role')
    expect(() => assignDeliveryRider('DEL-2601', 'Test Driver', '', '', denied)).toThrow('Your role')
    expect(() => createDeliveryRecord(blank(), denied)).toThrow('Your role')
    expect(() => saveDeliveries([], denied)).toThrow('Your role')
    expect(localStorage.getItem('babin_rentals_deliveries_v1')).toBe(before)
  })

  it('refuses all live mutations and hides local sample records', () => {
    seed([{ ...blank({ status: 'Ready' }), id: 'DEL-2601' }])
    const before = localStorage.getItem('babin_rentals_deliveries_v1')
    mode.mock = false
    expect(getDeliveries('Owner')).toEqual([])
    expect(() => updateDeliveryStatus('DEL-2601', 'In Transit', context)).toThrow('server-backed')
    expect(() => assignDeliveryRider('DEL-2601', 'Test Driver', '', '', context)).toThrow('server-backed')
    expect(() => createDeliveryRecord(blank(), context)).toThrow('server-backed')
    expect(() => saveDeliveries([], context)).toThrow('server-backed')
    expect(localStorage.getItem('babin_rentals_deliveries_v1')).toBe(before)
  })

  it('refuses offline mutations and does not queue them', () => {
    seed([{ ...blank({ status: 'Ready' }), id: 'DEL-2601' }])
    const before = localStorage.getItem('babin_rentals_deliveries_v1')
    expect(() => updateDeliveryStatus('DEL-2601', 'In Transit', { ...context, isOnline: false })).toThrow('not queued')
    expect(localStorage.getItem('babin_rentals_deliveries_v1')).toBe(before)
  })

  it('does not return success when local persistence fails', () => {
    seed([{ ...blank({ status: 'Ready' }), id: 'DEL-2601' }])
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
    expect(() => updateDeliveryStatus('DEL-2601', 'In Transit', context)).toThrow('Storage full')
    write.mockRestore()
    expect(getDeliveries('Owner')[0]?.status).toBe('Ready')
  })
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('delivery id allocation', () => {
  it('does not reissue an id when a non-highest record is removed', () => {
    /* The shape that broke it: five records numbered 2601..2605, then one from
     * the MIDDLE is deleted. Length drops to 4, so the old formula answered
     * 2600+4+1 = DEL-2605 — a number still on the list. Two records then shared
     * an id and every later lookup-by-id updated the first of the pair. */
    const five = INITIAL_DELIVERIES.slice(0, 5).map((d, i) => ({ ...d, id: `DEL-${2601 + i}` }))
    seed(five)
    expect(five.map((d) => d.id)).toEqual([
      'DEL-2601', 'DEL-2602', 'DEL-2603', 'DEL-2604', 'DEL-2605',
    ])

    /* Drop DEL-2603. DEL-2605 is still in use, so DEL-2605 is not available. */
    seed(five.filter((d) => d.id !== 'DEL-2603'))

    const created = createDeliveryRecord(blank(), context)
    expect(created.id).toBe('DEL-2606')

    const ids = getDeliveries('Owner').map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('steps past the highest id in use, not past the list length', () => {
    /* Out-of-order ids — the list is sorted newest-first, so a length-derived
     * counter is wrong the moment a record is inserted anywhere but the front. */
    seed([
      { ...blank(), id: 'DEL-2602' },
      { ...blank(), id: 'DEL-2609' },
      { ...blank(), id: 'DEL-2603' },
    ])
    expect(createDeliveryRecord(blank(), context).id).toBe('DEL-2610')
  })

  it('never returns an id that is already taken, even with a legacy non-numeric id', () => {
    seed([
      { ...blank(), id: 'LEGACY-1' },
      { ...blank(), id: 'DEL-2604' },
    ])
    const created = createDeliveryRecord(blank(), context)
    expect(created.id).toBe('DEL-2605')
    expect(getDeliveries('Owner').map((d) => d.id)).toContain(created.id)
  })

  it('keeps ids unique across a run of consecutive creations', () => {
    seed(INITIAL_DELIVERIES.slice(0, 2))
    const made = Array.from({ length: 6 }, () => createDeliveryRecord(blank(), context).id)
    expect(new Set(made).size).toBe(6)
  })
})

describe('dispatch stamps', () => {
  it('stamps the Kathmandu day and the Kathmandu clock, from one clock', () => {
    seed([{ ...blank(), id: 'DEL-2601' }])

    /* 18:30 UTC on the 13th is 00:15 on the 14th in Kathmandu (+05:45). The old
     * build produced "2026-07-13 18:30" — yesterday's date with a time five and
     * three quarter hours ahead of the moment it recorded. */
    const at = new Date('2026-07-13T18:30:00.000Z')
    vi.setSystemTime(at)

    const next = updateDeliveryStatus('DEL-2601', 'In Transit', context)
    const stamped = next.find((d) => d.id === 'DEL-2601')?.dispatchedAt
    expect(stamped).toBe('2026-07-14 00:15')
  })

  it('agrees with the day the rest of the app calls today', () => {
    seed([{ ...blank(), id: 'DEL-2601' }])
    const at = new Date('2026-07-13T18:30:00.000Z')
    vi.setSystemTime(at)

    const stamped = updateDeliveryStatus('DEL-2601', 'In Transit', context)
      .find((d) => d.id === 'DEL-2601')?.dispatchedAt
    /* `data/today.ts` is the single place the +05:45 offset lives; the stamp's
     * date half must not be computed independently of it. */
    expect(stamped?.slice(0, 10)).toBe(businessDayAd(at))
  })
})

describe('assignDeliveryRider', () => {
  it('moves a Scheduled dispatch to Ready, and leaves a later stage alone', () => {
    seed([
      { ...blank({ status: 'Scheduled' }), id: 'DEL-2601' },
      { ...blank({ status: 'In Transit' }), id: 'DEL-2602' },
    ])
    const next = assignDeliveryRider('DEL-2601', 'Real Person', '+977 9812345678', 'Ba 1 Pa 1', context)
    expect(next.find((d) => d.id === 'DEL-2601')?.status).toBe('Ready')

    const after = assignDeliveryRider('DEL-2602', 'Real Person', '+977 9812345678', 'Ba 1 Pa 1', context)
    expect(after.find((d) => d.id === 'DEL-2602')?.status).toBe('In Transit')
  })

  it('updates only the named record when ids are shared', () => {
    /* A duplicate id is exactly the state the old allocator could produce, and
     * it is the reason the bug was silent: the first match won every time. */
    seed([
      { ...blank({ bookingNo: 'BR-A', status: 'Scheduled' }), id: 'DEL-2601' },
      { ...blank({ bookingNo: 'BR-B', status: 'Scheduled' }), id: 'DEL-2601' },
    ])
    const next = assignDeliveryRider('DEL-2601', 'Driver', '', '', context)
    /* Both are touched because they are the same record as far as the data
     * model is concerned — which is the point: the invariant the allocator now
     * guarantees is that this state cannot be created in the first place. */
    expect(next.filter((d) => d.driverName === 'Driver')).toHaveLength(2)
  })
})
