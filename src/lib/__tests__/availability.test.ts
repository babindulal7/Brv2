import { describe, it, expect } from 'vitest'
import {
  windowsOverlap,
  conflictingHolds,
  selectUnitsForLine,
  rankLeastUsed,
  isRetired,
  explainShortfall,
  unitStatesForRule,
  boundsForTurnaround,
  UNIT_AVAILABILITY_PRESETS,
  DISQUALIFYING_UNIT_STATES,
  RENTAL_WINDOW_BOUNDS,
  capacityFor,
  explainCapacityShortfall,
  windowContains,
  violatesTurnaroundBuffer,
  findTurnaroundBufferViolations,
  explainTurnaroundViolation,
  turnaroundBufferMsForCategory,
  type RentalWindow,
  type QuantityHold,
  type UnitCandidate,
  type UnitHold,
} from '../availability'
import { SETTING_SPECS } from '../settingsStore'

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

/**
 * An empty set, used so the `selectUnitsForLine` cases below isolate the
 * date-overlap and retirement logic from the state rule.
 *
 * §4.14 is now RULED (§4.30c) and the real set is `DISQUALIFYING_UNIT_STATES` —
 * but these tests deliberately do NOT import it. A suite that passes the
 * production set is testing two rules at once, and would start failing for the
 * wrong reason the day someone re-rules which states disqualify a unit. The
 * ruled set has its own tests at the bottom of this file.
 */
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
   * ✅ Ruled `half-open` (§4.30b) and then made a Settings key
   * (`rentalTurnaround`), so an owner can flip it without a release. BOTH
   * behaviours stay pinned here for exactly that reason: the setting means the
   * other branch is reachable in production, not hypothetical, so it has to be
   * tested rather than merely possible.
   */
  describe('the touching-endpoint case — PLAN.md §4.30(b)', () => {
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

  /* ── RS-02 · the reset bench takes a unit out of the pool ─────────────── */

  it('will not assign a unit whose reset is still outstanding', () => {
    const candidates = [
      unit({ unitId: 'u-1', openCleaning: { bookingNo: 'B-715', requiresClean: true } }),
      unit({ unitId: 'u-2' }),
    ]
    const out = selectUnitsForLine({ ...base, needed: 2, candidates })

    expect(out.assigned.map((u) => u.unitId)).toEqual(['u-2'])
    expect(out.rejected[0]?.reason).toMatchObject({ kind: 'cleaning', by: { bookingNo: 'B-715' } })
    expect(out.shortfall).toBe(1)
  })

  it('assigns a unit again once its reset has been completed', () => {
    /* `null` is what `readOpenCleaning` yields for a unit with no open entry —
       which is exactly what stamping `reset_completed_at` produces. */
    const out = selectUnitsForLine({ ...base, needed: 1, candidates: [unit({ unitId: 'u-1', openCleaning: null })] })
    expect(out.assigned.map((u) => u.unitId)).toEqual(['u-1'])
    expect(out.rejected).toEqual([])
  })

  it('says which booking the gear is still on the bench from', () => {
    const out = selectUnitsForLine({
      ...base,
      needed: 1,
      candidates: [unit({ unitId: 'u-1', openCleaning: { bookingNo: 'B-715', requiresClean: false } })],
    })
    const why = explainShortfall(out, 'Sony FX9')
    expect(why).toContain('on the reset bench after B-715')
    expect(why).toContain('has not been reset yet')
    expect(why).not.toContain('cleaned or')
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

/* ── The Settings-driven rules ───────────────────────────────────────────────
 *
 * Both rulings became Settings keys on 16 Aug 2026. The engine stays pure — it
 * takes the resolved values as required parameters — so what needs pinning here
 * is the MAPPING from a stored label to engine behaviour, and above all the
 * fallback: an unrecognised label must not mean "nothing disqualifies a unit".
 */
describe('settings-driven availability rules', () => {
  describe('unitStatesForRule', () => {
    it('resolves the ruled default to the ruled set', () => {
      expect(unitStatesForRule('Condition only')).toBe(DISQUALIFYING_UNIT_STATES)
      expect([...unitStatesForRule('Condition only')].sort()).toEqual(['Maintenance', 'Missing', 'Retired'])
    })

    it('adds the turnaround queues on the middle preset, and nothing else', () => {
      const states = unitStatesForRule('Condition and turnaround')
      expect(states.has('Inspection')).toBe(true)
      expect(states.has('Cleaning')).toBe(true)
      /* Still not the lifecycle four — that is the strict preset's job. */
      expect(states.has('On Rent')).toBe(false)
      expect(states.has('Reserved')).toBe(false)
    })

    it('disqualifies everything but In Stock on the strict preset', () => {
      const states = unitStatesForRule('Only In Stock')
      for (const state of ['Reserved', 'Packed', 'On Rent', 'Returning', 'Inspection', 'Cleaning', 'Maintenance', 'Missing', 'Retired']) {
        expect(states.has(state)).toBe(true)
      }
      expect(states.has('In Stock')).toBe(false)
    })

    /*
     * THE safety property. A renamed spec, a hand-edited localStorage or a value
     * written by an older build must not resolve to an empty set — that would
     * mean nothing disqualifies a unit, and gear in Maintenance would go out on
     * a shoot. Failing to the ruled answer is the safe direction.
     */
    it('falls back to the ruled set on an unknown label — NEVER to empty', () => {
      for (const junk of ['', 'Anything', 'condition only', 'Condition Only']) {
        const states = unitStatesForRule(junk)
        expect(states.size).toBeGreaterThan(0)
        expect(states).toBe(DISQUALIFYING_UNIT_STATES)
      }
    })

    it('never returns a preset that would let a Maintenance unit through', () => {
      for (const preset of Object.values(UNIT_AVAILABILITY_PRESETS)) {
        expect(preset.has('Maintenance')).toBe(true)
        expect(preset.has('Missing')).toBe(true)
      }
    })
  })

  describe('boundsForTurnaround', () => {
    it('maps the two labels to the two conventions', () => {
      expect(boundsForTurnaround('Same-instant handover allowed')).toBe('half-open')
      expect(boundsForTurnaround('Turnaround required')).toBe('closed')
    })

    it('falls back to the ruled convention on an unknown label', () => {
      expect(boundsForTurnaround('nonsense')).toBe(RENTAL_WINDOW_BOUNDS)
    })

    /* The ruled default and the setting's default must agree, or the app
       behaves one way and PLAN.md §4.30(b) says another. */
    it("agrees with the setting spec's own default", () => {
      expect(boundsForTurnaround(String(SETTING_SPECS.rentalTurnaround.default))).toBe(RENTAL_WINDOW_BOUNDS)
    })
  })

  /*
   * The registry and the engine are two files that must not drift. A preset
   * added to one and not the other is silently unreachable, or silently
   * unresolvable — and the second falls back, which hides it.
   */
  describe('the setting spec and the engine agree', () => {
    it('every unitAvailabilityRule option has a preset', () => {
      const options = SETTING_SPECS.unitAvailabilityRule.options ?? []
      expect(options.length).toBeGreaterThan(0)
      for (const option of options) {
        expect(Object.hasOwn(UNIT_AVAILABILITY_PRESETS, option)).toBe(true)
      }
    })

    it('every preset is offered as an option — no unreachable presets', () => {
      const options = SETTING_SPECS.unitAvailabilityRule.options ?? []
      for (const preset of Object.keys(UNIT_AVAILABILITY_PRESETS)) {
        expect(options).toContain(preset)
      }
    })

    it('every rentalTurnaround option maps to a distinct convention', () => {
      const options = SETTING_SPECS.rentalTurnaround.options ?? []
      const mapped = options.map((o) => boundsForTurnaround(o))
      expect(new Set(mapped).size).toBe(options.length)
    })

    it("the ruled defaults are the specs' defaults, so shipping these changed nothing", () => {
      expect(unitStatesForRule(String(SETTING_SPECS.unitAvailabilityRule.default))).toBe(DISQUALIFYING_UNIT_STATES)
      expect(SETTING_SPECS.packingPhotosRequired.default).toBe(1)
      /* 0 = keep forever. The retention ruling never stated a period, so any
         positive default would be inventing the one part nobody gave. */
      expect(SETTING_SPECS.evidenceRetentionDays.default).toBe(0)
    })
  })
})

describe('rankLeastUsed — the 27 Jul lock, ruled into force by D5 (30 Aug 2026)', () => {
  const A = unit({ unitId: 'u-a' })
  const B = unit({ unitId: 'u-b' })
  const C = unit({ unitId: 'u-c' })

  it('orders by prior assignments, fewest first', () => {
    const usage = new Map([
      ['u-a', 5],
      ['u-b', 1],
      ['u-c', 3],
    ])
    expect(rankLeastUsed([A, B, C], usage).map((u) => u.unitId)).toEqual(['u-b', 'u-c', 'u-a'])
  })

  it('a unit with no usage row counts as never used', () => {
    const usage = new Map([['u-a', 1]])
    expect(rankLeastUsed([A, B], usage).map((u) => u.unitId)).toEqual(['u-b', 'u-a'])
  })

  it('is STABLE — equal usage keeps the caller order, so ties resolve by asset tag deterministically', () => {
    const usage = new Map<string, number>()
    expect(rankLeastUsed([C, A, B], usage).map((u) => u.unitId)).toEqual(['u-c', 'u-a', 'u-b'])
  })

  it('does not mutate the input array', () => {
    const input = [A, B]
    rankLeastUsed(input, new Map([['u-a', 9]]))
    expect(input.map((u) => u.unitId)).toEqual(['u-a', 'u-b'])
  })
})

/**
 * # capacityFor — the quantity half (INV-02)
 *
 * These cases are the app-side twin of `enforce_inventory_reservation_capacity()`
 * (`0045_reservation_capacity_ceiling.sql`, applied to the live project). The
 * trigger is the arbiter; this function is the preview, and a preview that
 * disagrees with the arbiter at the edges is worse than none — it produces a
 * green screen followed by a database refusal nobody can explain. So the cases
 * below are written against the trigger's own arithmetic: peak concurrent qty at
 * the candidate instants, not a naive sum over the window.
 *
 * The bound convention is passed explicitly on every call, for the same reason
 * every entry point above requires it: §4.30(b) is RULED `half-open`, and both
 * answers are pinned here so re-ruling it is a one-constant change against a
 * suite that already says what will happen.
 */
describe('capacityFor', () => {
  const qHold = (qty: number, window: RentalWindow, bookingNo = 'B-901'): QuantityHold => ({
    bookingId: `id-${bookingNo}`,
    bookingNo,
    qty,
    window,
  })

  /** Inside WINDOW: 16 Aug 09:00 → 17 Aug 09:00, Kathmandu. */
  const FIRST_DAY: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-17T09:00:00+05:45' }
  /** Inside WINDOW, starting exactly where FIRST_DAY ends. */
  const SECOND_DAY: RentalWindow = { fromAd: '2026-08-17T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }
  /** Ends exactly where WINDOW begins. */
  const ENDS_AT_PICKUP: RentalWindow = { fromAd: '2026-08-14T09:00:00+05:45', toAd: '2026-08-16T09:00:00+05:45' }
  /** Begins exactly where WINDOW ends. */
  const STARTS_AT_RETURN: RentalWindow = { fromAd: '2026-08-18T18:00:00+05:45', toAd: '2026-08-20T18:00:00+05:45' }
  /** Swallows WINDOW whole — its lower bound is OUTSIDE the window. */
  const SURROUNDS: RentalWindow = { fromAd: '2026-08-10T09:00:00+05:45', toAd: '2026-08-25T09:00:00+05:45' }

  it('reports the whole stock free when nothing is held', () => {
    const out = capacityFor({ window: WINDOW, holds: [], totalQuantity: 5, qtyRequested: 2, bounds: 'half-open' })
    expect(out.peakHeld).toBe(0)
    expect(out.free).toBe(5)
    expect(out.shortfall).toBe(0)
    expect(out.problems).toEqual([])
  })

  /**
   * ⭐ The INV-02 verification case, stated as arithmetic: 2 wanted out of a
   * stock of 5, with 3 already held across an overlapping window. Two are free,
   * so the line is covered and Confirm may write the hold.
   */
  it('covers a line when the peak leaves enough behind — 2 of 5 with 3 held', () => {
    const out = capacityFor({
      window: WINDOW,
      holds: [qHold(3, SURROUNDS, 'B-880')],
      totalQuantity: 5,
      qtyRequested: 2,
      bounds: 'half-open',
    })
    expect(out.peakHeld).toBe(3)
    expect(out.free).toBe(2)
    expect(out.shortfall).toBe(0)
    expect(out.problems).toEqual([])
    expect(explainCapacityShortfall(out, 'BNC Cable 3m')).toBeNull()
  })

  /** The same booking with one more already held: one short, and it says whose. */
  it('refuses and names the booking holding the stock — 2 of 5 with 4 held', () => {
    const out = capacityFor({
      window: WINDOW,
      holds: [qHold(4, SURROUNDS, 'B-880')],
      totalQuantity: 5,
      qtyRequested: 2,
      bounds: 'half-open',
    })
    expect(out.peakHeld).toBe(4)
    expect(out.free).toBe(1)
    expect(out.shortfall).toBe(1)
    expect(out.problems).toEqual([{ kind: 'held', by: expect.objectContaining({ bookingNo: 'B-880', qty: 4 }) }])

    const sentence = explainCapacityShortfall(out, 'BNC Cable 3m')
    expect(sentence).toContain('BNC Cable 3m')
    expect(sentence).toContain('1 more needed')
    expect(sentence).toContain('B-880')
  })

  /**
   * PEAK, not total. Two holds of 3 that do not overlap each other draw on the
   * same five items at different times, so five is never short — summing them
   * would refuse a legal booking, which is 0045's stated reason for sweeping.
   */
  it('takes the peak concurrency, so back-to-back holds do not add up', () => {
    const out = capacityFor({
      window: WINDOW,
      holds: [qHold(3, FIRST_DAY, 'B-880'), qHold(3, SECOND_DAY, 'B-881')],
      totalQuantity: 5,
      qtyRequested: 2,
      bounds: 'half-open',
    })
    expect(out.peakHeld).toBe(3)
    expect(out.free).toBe(2)
    expect(out.shortfall).toBe(0)
  })

  it('adds holds that ARE live at the same instant', () => {
    const out = capacityFor({
      window: WINDOW,
      holds: [qHold(3, SURROUNDS, 'B-880'), qHold(2, SECOND_DAY, 'B-881')],
      totalQuantity: 5,
      qtyRequested: 2,
      bounds: 'half-open',
    })
    expect(out.peakHeld).toBe(5)
    expect(out.free).toBe(0)
    expect(out.shortfall).toBe(2)
    /* The peak is reached where the second hold starts, not at pickup. */
    expect(out.peakAtAd).toBe(SECOND_DAY.fromAd)
  })

  /**
   * A hold that CONTAINS the window has its lower bound outside it, so it never
   * contributes a candidate instant of its own — the window's own start is the
   * one that finds it. 0045 clamps its candidate set the same way, "so this row
   * stays answerable for the window it actually claims".
   */
  it('counts a hold that surrounds the window, from the window own start', () => {
    const out = capacityFor({
      window: WINDOW,
      holds: [qHold(4, SURROUNDS, 'B-880')],
      totalQuantity: 5,
      qtyRequested: 1,
      bounds: 'half-open',
    })
    expect(out.peakHeld).toBe(4)
    expect(out.peakAtAd).toBe(WINDOW.fromAd)
  })

  /* ── §4.30(b), from the quantity side ──────────────────────────────────── */

  it('half-open: a hold ending exactly at pickup frees its stock', () => {
    const out = capacityFor({
      window: WINDOW,
      holds: [qHold(5, ENDS_AT_PICKUP, 'B-880')],
      totalQuantity: 5,
      qtyRequested: 5,
      bounds: 'half-open',
    })
    expect(out.peakHeld).toBe(0)
    expect(out.shortfall).toBe(0)
  })

  it('half-open: a hold beginning exactly at return does not take any', () => {
    const out = capacityFor({
      window: WINDOW,
      holds: [qHold(5, STARTS_AT_RETURN, 'B-880')],
      totalQuantity: 5,
      qtyRequested: 5,
      bounds: 'half-open',
    })
    expect(out.peakHeld).toBe(0)
    expect(out.shortfall).toBe(0)
  })

  /**
   * The other convention, pinned so re-ruling §4.30(b) is a one-constant change.
   * `crew_bookings_no_double_booking` chose `'[]'` inside this same schema and
   * the disagreement with rentals is deliberate — see `RENTAL_WINDOW_BOUNDS`.
   */
  it('closed: the same touching hold DOES take it', () => {
    const out = capacityFor({
      window: WINDOW,
      holds: [qHold(5, ENDS_AT_PICKUP, 'B-880')],
      totalQuantity: 5,
      qtyRequested: 5,
      bounds: 'closed',
    })
    expect(out.peakHeld).toBe(5)
    expect(out.free).toBe(0)
    expect(out.shortfall).toBe(5)
  })

  /* ── The two structural refusals ───────────────────────────────────────── */

  it('says so when the product records no stock at all', () => {
    const out = capacityFor({ window: WINDOW, holds: [], totalQuantity: 0, qtyRequested: 1, bounds: 'half-open' })
    expect(out.free).toBe(0)
    expect(out.shortfall).toBe(1)
    expect(out.problems).toEqual([{ kind: 'no-stock' }])
    expect(explainCapacityShortfall(out, 'Gaffer Tape')).toContain('no stock on hand at all')
  })

  it('says so when more is asked for than the product owns, so no date frees it', () => {
    const out = capacityFor({ window: WINDOW, holds: [], totalQuantity: 4, qtyRequested: 6, bounds: 'half-open' })
    expect(out.free).toBe(4)
    expect(out.shortfall).toBe(2)
    expect(out.problems).toEqual([{ kind: 'exceeds-stock', totalQuantity: 4 }])
    expect(explainCapacityShortfall(out, 'Gaffer Tape')).toContain('no date frees it')
  })

  /* ── Refusals rather than answers ──────────────────────────────────────── */

  it('refuses a qty that is not a whole number above zero', () => {
    const call = (qtyRequested: number) =>
      capacityFor({ window: WINDOW, holds: [], totalQuantity: 5, qtyRequested, bounds: 'half-open' })
    expect(() => call(0)).toThrow(/at least one/)
    expect(() => call(-1)).toThrow(/at least one/)
    expect(() => call(1.5)).toThrow(/at least one/)
  })

  it('refuses a negative stock level rather than inventing capacity', () => {
    expect(() =>
      capacityFor({ window: WINDOW, holds: [], totalQuantity: -1, qtyRequested: 1, bounds: 'half-open' }),
    ).toThrow(/failed read/)
  })

  /**
   * A hold whose qty cannot be counted is stock that would silently look free —
   * the same unsafe direction `parseTstzRange` guards on the range side. It is
   * refused, not skipped.
   */
  it('refuses a hold it cannot count', () => {
    expect(() =>
      capacityFor({
        window: WINDOW,
        holds: [qHold(Number.NaN, SURROUNDS, 'B-880')],
        totalQuantity: 5,
        qtyRequested: 1,
        bounds: 'half-open',
      }),
    ).toThrow(/B-880/)
  })

  it('refuses an inverted window, which would overlap nothing and report everything free', () => {
    expect(() =>
      capacityFor({
        window: { fromAd: WINDOW.toAd, toAd: WINDOW.fromAd },
        holds: [],
        totalQuantity: 5,
        qtyRequested: 1,
        bounds: 'half-open',
      }),
    ).toThrow(/ends before it begins/)
  })

  /**
   * A zero-length window is EMPTY under half-open — Postgres's own range
   * semantics, and the same answer `windowsOverlap` gives. Nothing is held
   * across an instant of no duration, so the whole stock reads free. Left as-is
   * rather than special-cased, for the reason `windowsOverlap` states: a booking
   * of no duration is a data defect to surface elsewhere, not a conflict to
   * invent here.
   */
  it('half-open: a zero-length window holds nothing and is held by nothing', () => {
    const instant = { fromAd: WINDOW.fromAd, toAd: WINDOW.fromAd }
    const out = capacityFor({
      window: instant,
      holds: [qHold(5, SURROUNDS, 'B-880')],
      totalQuantity: 5,
      qtyRequested: 5,
      bounds: 'half-open',
    })
    expect(out.peakHeld).toBe(0)
    expect(out.peakAtAd).toBeNull()
    expect(out.shortfall).toBe(0)
  })

  it('closed: the same zero-length window is a real instant and IS held', () => {
    const instant = { fromAd: WINDOW.fromAd, toAd: WINDOW.fromAd }
    const out = capacityFor({
      window: instant,
      holds: [qHold(5, SURROUNDS, 'B-880')],
      totalQuantity: 5,
      qtyRequested: 5,
      bounds: 'closed',
    })
    expect(out.peakHeld).toBe(5)
    expect(out.shortfall).toBe(5)
  })

  /* Law 7: the same two instants written two ways are the same window. */
  it('compares instants, not text — an offset window and its UTC twin agree', () => {
    const asOffset = capacityFor({
      window: WINDOW,
      holds: [qHold(3, SURROUNDS)],
      totalQuantity: 5,
      qtyRequested: 2,
      bounds: 'half-open',
    })
    const asUtc = capacityFor({
      window: WINDOW_UTC,
      holds: [qHold(3, SURROUNDS)],
      totalQuantity: 5,
      qtyRequested: 2,
      bounds: 'half-open',
    })
    expect(asUtc.peakHeld).toBe(asOffset.peakHeld)
    expect(asUtc.free).toBe(asOffset.free)
  })
})

describe('windowContains — Postgres range @> timestamptz', () => {
  it('half-open includes the lower bound and excludes the upper', () => {
    expect(windowContains(WINDOW, WINDOW.fromAd, 'half-open')).toBe(true)
    expect(windowContains(WINDOW, WINDOW.toAd, 'half-open')).toBe(false)
  })

  it('closed includes both', () => {
    expect(windowContains(WINDOW, WINDOW.fromAd, 'closed')).toBe(true)
    expect(windowContains(WINDOW, WINDOW.toAd, 'closed')).toBe(true)
  })

  it('excludes an instant outside the window under either convention', () => {
    expect(windowContains(WINDOW, '2026-08-20T09:00:00+05:45', 'half-open')).toBe(false)
    expect(windowContains(WINDOW, '2026-08-20T09:00:00+05:45', 'closed')).toBe(false)
  })

  /* Law 7 — an instant with no offset would be read as the device's local time. */
  it('refuses an instant that carries no offset', () => {
    expect(() => windowContains(WINDOW, '2026-08-16T09:00:00', 'half-open')).toThrow(/Law 7/)
  })
})

describe('Turnaround buffers — Pillar 1', () => {
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

  it('resolves category defaults correctly', () => {
    expect(turnaroundBufferMsForCategory('Heavy AV')).toBe(TWELVE_HOURS_MS)
    expect(turnaroundBufferMsForCategory('LED Wall')).toBe(TWELVE_HOURS_MS)
    expect(turnaroundBufferMsForCategory('Camera')).toBe(SIX_HOURS_MS)
    expect(turnaroundBufferMsForCategory('Drone')).toBe(SIX_HOURS_MS)
    expect(turnaroundBufferMsForCategory('Unknown')).toBe(0)
    expect(turnaroundBufferMsForCategory(null)).toBe(0)
  })

  it('detects violation when gap between consecutive windows is less than buffer', () => {
    // Window A ends at 18:00 on 18 Aug
    const windowA: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }
    // Window B starts 2 hours later at 20:00 on 18 Aug
    const windowB: RentalWindow = { fromAd: '2026-08-18T20:00:00+05:45', toAd: '2026-08-19T20:00:00+05:45' }

    // Gap is 2 hours (less than 6 hours buffer) -> violates
    expect(violatesTurnaroundBuffer(windowA, windowB, SIX_HOURS_MS)).toBe(true)
    // Symmetric: windowB vs windowA
    expect(violatesTurnaroundBuffer(windowB, windowA, SIX_HOURS_MS)).toBe(true)

    // With a 1-hour buffer (less than 2 hours gap) -> does NOT violate
    const ONE_HOUR_MS = 1 * 60 * 60 * 1000
    expect(violatesTurnaroundBuffer(windowA, windowB, ONE_HOUR_MS)).toBe(false)
  })

  it('detects violation for touching endpoints (gap is 0 ms)', () => {
    const windowA: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }
    const windowB: RentalWindow = { fromAd: '2026-08-18T18:00:00+05:45', toAd: '2026-08-19T18:00:00+05:45' }

    expect(violatesTurnaroundBuffer(windowA, windowB, SIX_HOURS_MS)).toBe(true)
  })

  it('does not violate turnaround buffer when gap exceeds buffer', () => {
    const windowA: RentalWindow = { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' }
    // Window B starts 24 hours later
    const windowB: RentalWindow = { fromAd: '2026-08-19T18:00:00+05:45', toAd: '2026-08-20T18:00:00+05:45' }

    expect(violatesTurnaroundBuffer(windowA, windowB, TWELVE_HOURS_MS)).toBe(false)
  })

  it('finds unit turnaround violations across holds and formats informative warnings', () => {
    const existingHold: UnitHold = {
      unitId: 'unit-cam-1',
      bookingId: 'bk-100',
      bookingNo: 'B-100',
      window: { fromAd: '2026-08-16T09:00:00+05:45', toAd: '2026-08-18T18:00:00+05:45' },
    }
    const requestedWindow: RentalWindow = {
      fromAd: '2026-08-18T21:00:00+05:45', // 3 hours gap
      toAd: '2026-08-20T18:00:00+05:45',
    }

    const violations = findTurnaroundBufferViolations('unit-cam-1', requestedWindow, [existingHold], SIX_HOURS_MS)
    expect(violations.length).toBe(1)
    const firstViolation = violations[0]
    expect(firstViolation).toBeDefined()
    if (!firstViolation) return
    expect(firstViolation.bookingNo).toBe('B-100')
    expect(firstViolation.actualGapMs).toBe(3 * 3600 * 1000)

    const explanation = explainTurnaroundViolation(firstViolation, 'CAM-01')
    expect(explanation).toContain('CAM-01 has only 3h turnaround gap with booking B-100 (minimum recommended: 6h).')
  })
})

