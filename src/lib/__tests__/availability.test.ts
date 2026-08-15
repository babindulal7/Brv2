import { describe, it, expect } from 'vitest'
import {
  windowsOverlap,
  conflictingHolds,
  selectUnitsForLine,
  isRetired,
  explainShortfall,
  type RentalWindow,
  type UnitCandidate,
  type UnitHold,
} from '../availability'

/*
 * The reference window: 16–18 Aug 2026, Kathmandu (+05:45), expressed in the
 * offset form the app actually sends. Written with an offset rather than `Z`
 * deliberately — `bookings.pickup_at` is `timestamptz` and the client sends
 * local-with-offset, so any string comparison lurking in the engine would show
 * up here rather than in production.
 */
const WINDOW: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }

/** The same two instants written as UTC. Same moments, different text. */
const WINDOW_UTC: RentalWindow = { fromAd: '2026-08-16T03:15:00Z', toAd: '2026-08-18T12:15:00Z' }

const unit = (over: Partial<UnitCandidate> & { unitId: string }): UnitCandidate => ({
  assetTag: `TAG-${over.unitId}`,
  serialNo: `SN-${over.unitId}`,
  productId: 'p-camera',
  state: 'In Stock',
  retiredAt: null,
  ...over,
})

const hold = (unitId: string, window: RentalWindow, bookingNo = 'B-901'): UnitHold => ({
  unitId,
  bookingId: `id-${bookingNo}`,
  bookingNo,
  window,
})

/** §4.14 is unruled, so every test states its own set rather than importing one. */
const NO_STATES: ReadonlySet<string> = new Set<string>()

describe('windowsOverlap', () => {
  it('is offset-blind — the same moments in +05:45 and in Z are the same window', () => {
    /* If anything compared ISO strings, these two would sort apart: the UTC
       form starts '2026-08-16T03' and the Kathmandu form '2026-08-16T09'. */
    expect(windowsOverlap(WINDOW, WINDOW_UTC, 'half-open')).toBe(true)
    expect(windowsOverlap(WINDOW, WINDOW_UTC, 'closed')).toBe(true)
  })

  it('overlaps a window nested inside it', () => {
    const inner = { fromAd: '2026-08-17T00:00:00+05:45', toAd: '2026-08-17T12:00:00+05:45' }
    expect(windowsOverlap(WINDOW, inner, 'half-open')).toBe(true)
  })

  it('does not overlap a window that is entirely later', () => {
    const later = { fromAd: '2026-08-20T09:00:00+05:45', toAd: '2026-08-21T09:00:00+05:45' }
    expect(windowsOverlap(WINDOW, later, 'half-open')).toBe(false)
    expect(windowsOverlap(WINDOW, later, 'closed')).toBe(false)
  })

  it('is symmetric', () => {
    const other = { fromAd: '2026-08-17T00:00:00+05:45', toAd: '2026-08-20T00:00:00+05:45' }
    expect(windowsOverlap(WINDOW, other, 'half-open')).toBe(windowsOverlap(other, WINDOW, 'half-open'))
  })

  /*
   * THE case the two conventions disagree about, and the reason `bounds` is a
   * required parameter rather than a default. Gear back at 18:00 and out again
   * at 18:00: legal under `[)`, a conflict under `[]`.
   *
   * PLAN.md §4.30 is open on which this product wants. Both behaviours are
   * pinned so that ruling it is a one-line change with a test that already
   * states both answers — not a discovery.
   */
  describe('the touching-endpoint case — PLAN.md §4.30', () => {
    const backToBack: RentalWindow = { fromAd: '2026-08-18T18:00:00+05:45', toAd: '2026-08-20T18:00:00+05:45' }

    it('half-open lets the next booking start exactly when this one ends', () => {
      expect(windowsOverlap(WINDOW, backToBack, 'half-open')).toBe(false)
    })

    it('closed treats that same instant as a conflict', () => {
      expect(windowsOverlap(WINDOW, backToBack, 'closed')).toBe(true)
    })

    it('one second of genuine overlap conflicts under BOTH conventions', () => {
      const overlapping: RentalWindow = { fromAd: '2026-08-18T17:59:59+05:45', toAd: '2026-08-20T18:00:00+05:45' }
      expect(windowsOverlap(WINDOW, overlapping, 'half-open')).toBe(true)
      expect(windowsOverlap(WINDOW, overlapping, 'closed')).toBe(true)
    })
  })

  /*
   * An inverted window overlaps nothing, so a silent answer would report every
   * unit free — the failure direction that double-books. It throws instead.
   */
  it('refuses an inverted window rather than reporting everything free', () => {
    const inverted = { fromAd: '2026-08-18T18:00:00+05:45', toAd: '2026-08-16T09:00:00+05:45' }
    expect(() => windowsOverlap(inverted, WINDOW, 'half-open')).toThrow(/ends before it begins/)
  })

  /*
   * These two found a real defect on 16 Aug 2026. The engine originally guarded
   * with `Number.isNaN(Date.parse(...))` alone, which catches neither case:
   * `Date.parse('16 Aug')` returns a valid instant in 2001, and an offset-less
   * string parses as the DEVICE's local time. Both would have been answered
   * rather than refused — and the second silently shifts every boundary
   * comparison by the device's zone, which on an Auckland-set tablet is 5h45m.
   */
  it('refuses a window that is not a pair of instants (Law 7)', () => {
    expect(() => windowsOverlap({ fromAd: '16 Aug', toAd: '18 Aug' }, WINDOW, 'half-open')).toThrow(/Law 7/)
  })

  it('refuses an instant with no offset, which would be read as device-local time', () => {
    const noOffset = { fromAd: '2026-08-16T09:00:00', toAd: '2026-08-18T18:00:00' }
    expect(() => windowsOverlap(noOffset, WINDOW, 'half-open')).toThrow(/offset/)
  })

  it('accepts both offset spellings — Z and ±HH:MM', () => {
    expect(() => windowsOverlap(WINDOW, WINDOW_UTC, 'half-open')).not.toThrow()
  })
})

describe('conflictingHolds', () => {
  it('ignores holds on other units', () => {
    const holds = [hold('u-2', WINDOW)]
    expect(conflictingHolds('u-1', WINDOW, holds, 'half-open')).toEqual([])
  })

  it('returns every colliding hold on the unit, not just the first', () => {
    const holds = [
      hold('u-1', { fromAd: '2026-08-16T10:00:00+05:45', toAd: '2026-08-16T20:00:00+05:45' }, 'B-901'),
      hold('u-1', { fromAd: '2026-08-17T10:00:00+05:45', toAd: '2026-08-17T20:00:00+05:45' }, 'B-902'),
      hold('u-1', { fromAd: '2026-09-01T10:00:00+05:45', toAd: '2026-09-02T20:00:00+05:45' }, 'B-903'),
    ]
    const found = conflictingHolds('u-1', WINDOW, holds, 'half-open')
    expect(found.map((h) => h.bookingNo)).toEqual(['B-901', 'B-902'])
  })
})

describe('isRetired', () => {
  it('reads the column, not the state', () => {
    expect(isRetired(unit({ unitId: 'u-1', retiredAt: '2026-01-01T00:00:00Z' }))).toBe(true)
    expect(isRetired(unit({ unitId: 'u-2', retiredAt: null }))).toBe(false)
  })

  /* The column is the authority. A row whose state says Retired but whose
     retired_at is null is a data defect, and this engine does not paper over
     it — `disqualifyingStates` is where that state is handled, once ruled. */
  it('does not infer retirement from the state value alone', () => {
    expect(isRetired(unit({ unitId: 'u-3', state: 'Retired', retiredAt: null }))).toBe(false)
  })
})

describe('selectUnitsForLine', () => {
  const base = { window: WINDOW, holds: [], disqualifyingStates: NO_STATES, bounds: 'half-open' as const }

  it('assigns first-fit in the order offered, and stops at what was needed', () => {
    const candidates = [unit({ unitId: 'u-1' }), unit({ unitId: 'u-2' }), unit({ unitId: 'u-3' })]
    const out = selectUnitsForLine({ ...base, needed: 2, candidates })

    expect(out.assigned.map((u) => u.unitId)).toEqual(['u-1', 'u-2'])
    expect(out.shortfall).toBe(0)
    /* u-3 was never examined — it is surplus, not rejected. */
    expect(out.rejected).toEqual([])
  })

  /*
   * The invariant the whole module exists for: one free unit may not cover a
   * two-unit line. A naive filter-then-take would return ['u-1','u-1'].
   */
  it('never assigns the same unit twice to one line', () => {
    const candidates = [unit({ unitId: 'u-1' }), unit({ unitId: 'u-1' })]
    const out = selectUnitsForLine({ ...base, needed: 2, candidates })

    expect(out.assigned.map((u) => u.unitId)).toEqual(['u-1'])
    expect(out.shortfall).toBe(1)
  })

  it('reports a shortfall rather than a short list that looks complete', () => {
    const candidates = [unit({ unitId: 'u-1' })]
    const out = selectUnitsForLine({ ...base, needed: 4, candidates })

    expect(out.assigned).toHaveLength(1)
    expect(out.shortfall).toBe(3)
  })

  it('skips a unit held by an overlapping booking and names the booking', () => {
    const candidates = [unit({ unitId: 'u-1' }), unit({ unitId: 'u-2' })]
    const out = selectUnitsForLine({
      ...base,
      needed: 2,
      candidates,
      holds: [hold('u-1', WINDOW, 'B-901')],
    })

    expect(out.assigned.map((u) => u.unitId)).toEqual(['u-2'])
    expect(out.shortfall).toBe(1)
    expect(out.rejected).toHaveLength(1)
    expect(out.rejected[0]?.reason).toMatchObject({ kind: 'held', by: { bookingNo: 'B-901' } })
  })

  it('takes a unit whose hold does not overlap', () => {
    const candidates = [unit({ unitId: 'u-1' })]
    const out = selectUnitsForLine({
      ...base,
      needed: 1,
      candidates,
      holds: [hold('u-1', { fromAd: '2026-09-01T09:00:00+05:45', toAd: '2026-09-02T09:00:00+05:45' })],
    })

    expect(out.assigned.map((u) => u.unitId)).toEqual(['u-1'])
    expect(out.shortfall).toBe(0)
  })

  it('rejects a retired unit with no state ruling required', () => {
    const candidates = [unit({ unitId: 'u-1', retiredAt: '2026-01-01T00:00:00Z' }), unit({ unitId: 'u-2' })]
    const out = selectUnitsForLine({ ...base, needed: 2, candidates })

    expect(out.assigned.map((u) => u.unitId)).toEqual(['u-2'])
    expect(out.rejected[0]?.reason).toMatchObject({ kind: 'retired' })
  })

  /*
   * §4.14 is unruled, and this pins the consequence honestly: with an EMPTY
   * disqualifying set, a unit in Maintenance is assignable. That is not this
   * engine being wrong — it is the caller having supplied no rule. The test
   * exists so the behaviour is a stated consequence rather than a surprise,
   * and so ruling §4.14 has somewhere obvious to land.
   */
  it('assigns a Maintenance unit when the caller supplies no disqualifying states — §4.14 unruled', () => {
    const candidates = [unit({ unitId: 'u-1', state: 'Maintenance' })]
    const out = selectUnitsForLine({ ...base, needed: 1, candidates })
    expect(out.assigned.map((u) => u.unitId)).toEqual(['u-1'])
  })

  it('and refuses that same unit the moment the state is named', () => {
    const candidates = [unit({ unitId: 'u-1', state: 'Maintenance' }), unit({ unitId: 'u-2' })]
    const out = selectUnitsForLine({
      ...base,
      needed: 2,
      candidates,
      disqualifyingStates: new Set(['Maintenance']),
    })

    expect(out.assigned.map((u) => u.unitId)).toEqual(['u-2'])
    expect(out.rejected[0]?.reason).toMatchObject({ kind: 'state', state: 'Maintenance' })
    expect(out.shortfall).toBe(1)
  })

  it('checks retirement before state, so a retired unit reads as retired', () => {
    const candidates = [unit({ unitId: 'u-1', state: 'Maintenance', retiredAt: '2026-01-01T00:00:00Z' })]
    const out = selectUnitsForLine({ ...base, needed: 1, candidates, disqualifyingStates: new Set(['Maintenance']) })
    expect(out.rejected[0]?.reason.kind).toBe('retired')
  })

  it('refuses a zero or fractional qty (Law 9)', () => {
    expect(() => selectUnitsForLine({ ...base, needed: 0, candidates: [] })).toThrow(/at least one unit/)
    expect(() => selectUnitsForLine({ ...base, needed: 1.5, candidates: [] })).toThrow(/at least one unit/)
  })

  /* The bound convention reaches all the way through, not just `windowsOverlap`. */
  it('carries the bound convention into the assignment decision', () => {
    const backToBack: RentalWindow = { fromAd: '2026-08-14T09:00:00+05:45', toAd: '2026-08-16T09:00:00+05:45' }
    const candidates = [unit({ unitId: 'u-1' })]
    const holds = [hold('u-1', backToBack)]

    expect(selectUnitsForLine({ ...base, needed: 1, candidates, holds, bounds: 'half-open' }).shortfall).toBe(0)
    expect(selectUnitsForLine({ ...base, needed: 1, candidates, holds, bounds: 'closed' }).shortfall).toBe(1)
  })
})

describe('explainShortfall', () => {
  const base = { window: WINDOW, disqualifyingStates: NO_STATES, bounds: 'half-open' as const }

  it('says nothing when the line is fully covered', () => {
    const out = selectUnitsForLine({ ...base, needed: 1, candidates: [unit({ unitId: 'u-1' })], holds: [] })
    expect(explainShortfall(out, 'Sony FX6')).toBeNull()
  })

  /* Law 12: specific and actionable. Naming the booking is the fact that tells
     a coordinator what to do next. */
  it('names the blocking booking, the product and the gap', () => {
    const out = selectUnitsForLine({
      ...base,
      needed: 2,
      candidates: [unit({ unitId: 'u-1' })],
      holds: [hold('u-1', WINDOW, 'B-901')],
    })
    const message = explainShortfall(out, 'Sony FX6')

    expect(message).toContain('Sony FX6')
    expect(message).toContain('B-901')
    expect(message).toContain('TAG-u-1')
    expect(message).toContain('2 more units')
  })

  it('uses the singular for a shortfall of one', () => {
    const out = selectUnitsForLine({ ...base, needed: 1, candidates: [], holds: [] })
    expect(explainShortfall(out, 'Sony FX6')).toContain('1 more unit needed')
  })
})
