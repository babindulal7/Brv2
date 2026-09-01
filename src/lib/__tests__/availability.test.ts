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
  type RentalWindow,
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
