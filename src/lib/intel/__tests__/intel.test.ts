// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  breakEvenPercent,
  conflictsFor,
  dollarUtilization,
  idleDaysSince,
  maintenanceCostRatio,
  oftenRentedWith,
  profitPerRentalDay,
  readinessLines,
  timeUtilization,
} from '../selectors'
import { inTravelTriangle, pointInTriangle } from '../safeTriangle'
import { intelClosed, intelNavigateBack, intelOpened, intelReplaced, intelSessionSnapshot } from '../store'

describe('intel selectors (deterministic, no ML)', () => {
  it('computes time utilization', () => {
    expect(timeUtilization(78, 100)).toBe(78)
    expect(timeUtilization(0, 100)).toBe(0)
    expect(timeUtilization(10, 0)).toBeNull()
    expect(timeUtilization(-1, 100)).toBeNull()
  })

  it('computes dollar utilization and break-even', () => {
    expect(dollarUtilization(3_010_000_00, 4_200_000_00)).toBe(72)
    expect(breakEvenPercent(4_200_000_00, 4_200_000_00)).toBe(100)
    expect(dollarUtilization(10, 0)).toBeNull()
  })

  it('computes profit per rental day half-up', () => {
    expect(profitPerRentalDay(9_200_00, 100)).toBe(9_200)
    expect(profitPerRentalDay(100, 0)).toBeNull()
  })

  it('computes maintenance ratio and idle days', () => {
    expect(maintenanceCostRatio(50_000, 1_000_000)).toBe(5)
    expect(maintenanceCostRatio(10, 0)).toBeNull()
    expect(idleDaysSince(0, 3 * 86_400_000)).toBe(3)
    expect(idleDaysSince(null, Date.now())).toBeNull()
  })

  it('counts often-rented-with from completed rentals only', () => {
    const rows = oftenRentedWith({
      productId: 'fx3',
      completedRentals: [
        ['fx3', 'gm2470'],
        ['fx3', 'gm2470'],
        ['fx3', 'rs4'],
        ['a7s', 'gm2470'],
      ],
      minSample: 1,
    })
    expect(rows[0]?.productId).toBe('gm2470')
    expect(rows[0]?.percent).toBe(67)
    expect(oftenRentedWith({ productId: 'fx3', completedRentals: [['fx3']], minSample: 2 })).toEqual([])
  })

  it('detects half-open booking overlaps', () => {
    const range = { id: 'new', startMs: 100, endMs: 200 }
    expect(conflictsFor(range, [{ id: 'a', startMs: 150, endMs: 250 }]).map((r: { id: string }) => r.id)).toEqual(['a'])
    // Touching end does not overlap in half-open intervals.
    expect(conflictsFor(range, [{ id: 'b', startMs: 200, endMs: 300 }])).toEqual([])
  })

  it('builds the readiness strip', () => {
    const lines = readinessLines({
      equipmentReserved: true,
      serialsAssigned: true,
      packed: 12,
      packedTotal: 14,
      contractSigned: true,
      depositPending: true,
    })
    expect(lines).toHaveLength(5)
    expect(lines[2]?.done).toBe(false)
    expect(lines[4]?.done).toBe(false)
  })
})

describe('safe triangle', () => {
  it('keeps the travel path inside', () => {
    expect(pointInTriangle({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })).toBe(true)
    expect(pointInTriangle({ x: 10, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })).toBe(false)
  })

  it('returns false without geometry, true along the travel path', () => {
    const card = { left: 100, top: 100, right: 300, bottom: 300 }
    expect(inTravelTriangle({ x: 50, y: 20 }, { x: 0, y: 0 }, card)).toBe(true)
    expect(inTravelTriangle({ x: -500, y: -500 }, { x: 0, y: 0 }, card)).toBe(false)
  })
})

describe('shared Intel navigation', () => {
  it('replaces the active entity and returns to the originating workflow', () => {
    const origin = { entityType: 'rental' as const, entityId: 'r1', context: 'rental-list' as const }
    const linked = { entityType: 'client' as const, entityId: 'c1', context: 'rental-list' as const }
    intelOpened('test-card', origin, 'side-peek')
    intelReplaced('test-card', linked, 'side-peek')
    expect(intelSessionSnapshot()).toMatchObject({ openId: 'test-card', entityType: 'client', entityId: 'c1' })
    expect(intelSessionSnapshot().history).toEqual([origin])
    intelNavigateBack('test-card')
    expect(intelSessionSnapshot()).toMatchObject({ entityType: 'rental', entityId: 'r1', context: 'rental-list', history: [] })
    intelClosed('test-card')
  })
})
