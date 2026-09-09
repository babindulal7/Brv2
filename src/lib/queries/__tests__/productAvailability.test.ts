import { describe, it, expect } from 'vitest'
import { productAvailabilityFor, productCapacityFor } from '../productAvailability'
import { DISQUALIFYING_UNIT_STATES, RENTAL_WINDOW_BOUNDS } from '../../availability'
import type { QuantityHold, UnitCandidate, UnitHold } from '../../availability'

/**
 * # NR-09 — availability is answered for a WINDOW, not for "now"
 *
 * `productAvailabilityFor` is the rule half of `queries/productAvailability.ts`
 * and takes its rows as arguments, so every case below runs against the real
 * engine with no database, no clock and no stubbing — the same split
 * `lib/availability.ts` documents for itself.
 *
 * The headline case is `available for a future window while busy today`. That
 * is the whole of NR-09: the catalogue used to answer "is a unit free at this
 * instant" and the booking screen raised a Critical from the answer, so a
 * booking three weeks out was refused because a camera was out on a shoot
 * today.
 */

const RULES = { disqualifyingStates: DISQUALIFYING_UNIT_STATES, bounds: RENTAL_WINDOW_BOUNDS }

const PRODUCT = 'p-fx3'

function unit(tag: string, over: Partial<UnitCandidate> = {}): UnitCandidate {
  return {
    unitId: `u-${tag}`,
    assetTag: tag,
    serialNo: `SN-${tag}`,
    productId: PRODUCT,
    state: 'In Stock',
    retiredAt: null,
    openCleaning: null,
    ...over,
  }
}

function hold(tag: string, fromAd: string, toAd: string, bookingNo = 'B-701'): UnitHold {
  return {
    unitId: `u-${tag}`,
    bookingId: `id-${bookingNo}`,
    bookingNo,
    window: { fromAd, toAd },
  }
}

/* Two windows that do not touch: one starting now-ish, one three weeks later. */
const TODAY = { fromAd: '2026-09-05T04:00:00+00:00', toAd: '2026-09-07T04:00:00+00:00' }
const IN_THREE_WEEKS = { fromAd: '2026-09-26T04:00:00+00:00', toAd: '2026-09-28T04:00:00+00:00' }

describe('productAvailabilityFor', () => {
  /**
   * ⭐ The bug NR-09 names, stated as a test.
   *
   * One camera, out with another client for the whole of today's window and
   * nothing else. Asked about today it is unavailable; asked about a window
   * three weeks out it is free — and the old `unitsByState` count could only
   * ever have given the first answer, to both questions.
   */
  it('reports a unit busy TODAY as free for a FUTURE window', () => {
    const pool = [unit('EQ-1')]
    const holds = [hold('EQ-1', TODAY.fromAd, TODAY.toAd, 'B-710')]

    const now = productAvailabilityFor(PRODUCT, pool, holds, TODAY, RULES)
    expect(now.unitsOwned).toBe(1)
    expect(now.unitsFree).toBe(0)
    expect(now.unitsHeld).toBe(1)
    expect(now.heldBy).toEqual(['B-710'])

    const later = productAvailabilityFor(PRODUCT, pool, holds, IN_THREE_WEEKS, RULES)
    expect(later.unitsOwned).toBe(1)
    expect(later.unitsFree).toBe(1)
    expect(later.unitsHeld).toBe(0)
    expect(later.heldBy).toEqual([])
  })

  it('counts only the units actually held in the window, and names their bookings', () => {
    const pool = [unit('EQ-1'), unit('EQ-2'), unit('EQ-3'), unit('EQ-4')]
    const holds = [
      hold('EQ-1', TODAY.fromAd, TODAY.toAd, 'B-710'),
      hold('EQ-2', IN_THREE_WEEKS.fromAd, IN_THREE_WEEKS.toAd, 'B-720'),
      hold('EQ-3', IN_THREE_WEEKS.fromAd, IN_THREE_WEEKS.toAd, 'B-720'),
    ]

    const answer = productAvailabilityFor(PRODUCT, pool, holds, IN_THREE_WEEKS, RULES)
    expect(answer.unitsOwned).toBe(4)
    expect(answer.unitsFree).toBe(2)
    expect(answer.unitsHeld).toBe(2)
    /* De-duplicated: two units of one booking name that booking once. */
    expect(answer.heldBy).toEqual(['B-720'])
  })

  /**
   * §4.30(b) — `half-open`. A booking ending exactly when ours begins frees its
   * unit. Pinned here as well as in `lib/__tests__/availability.test.ts`,
   * because this module is the one the catalogue reads and a disagreement
   * between the two would show up as a back-to-back booking mysteriously
   * refused on one screen and offered on another.
   */
  it('follows the ruled half-open bound at a touching boundary', () => {
    const pool = [unit('EQ-1')]
    const touching = [hold('EQ-1', '2026-09-24T04:00:00+00:00', IN_THREE_WEEKS.fromAd, 'B-730')]

    expect(productAvailabilityFor(PRODUCT, pool, touching, IN_THREE_WEEKS, RULES).unitsFree).toBe(1)
    /* And the other convention is a one-argument change, not a rewrite. */
    expect(
      productAvailabilityFor(PRODUCT, pool, touching, IN_THREE_WEEKS, {
        ...RULES,
        bounds: 'closed',
      }).unitsFree,
    ).toBe(0)
  })

  it('leaves a retired unit out of "owned" entirely — it is not stock', () => {
    const pool = [unit('EQ-1'), unit('EQ-2', { retiredAt: '2026-05-01T00:00:00+00:00' })]
    const answer = productAvailabilityFor(PRODUCT, pool, [], IN_THREE_WEEKS, RULES)
    expect(answer.unitsOwned).toBe(1)
    expect(answer.unitsFree).toBe(1)
  })

  /**
   * A condition state disqualifies regardless of dates — §4.30(c). It counts as
   * owned (the business still has it) and not free, and it is NOT reported as
   * held by anyone, because nobody holds it.
   */
  it('holds back a unit in Maintenance without attributing it to a booking', () => {
    const pool = [unit('EQ-1', { state: 'Maintenance' }), unit('EQ-2')]
    const answer = productAvailabilityFor(PRODUCT, pool, [], IN_THREE_WEEKS, RULES)
    expect(answer.unitsOwned).toBe(2)
    expect(answer.unitsFree).toBe(1)
    expect(answer.unitsHeld).toBe(0)
    expect(answer.heldBy).toEqual([])
  })

  /**
   * A unit On Rent *today* is deliberately NOT in `DISQUALIFYING_UNIT_STATES`
   * (§4.30(c) spells out why), so the date check is the only thing that can
   * take it out of a future window — and with no hold on it, nothing does.
   */
  it('does not treat the On Rent state as a permanent disqualification', () => {
    const pool = [unit('EQ-1', { state: 'On Rent' })]
    expect(productAvailabilityFor(PRODUCT, pool, [], IN_THREE_WEEKS, RULES).unitsFree).toBe(1)
  })

  /**
   * Bulk stock. No unit rows means nothing for the overlap check to overlap, so
   * this returns zeroes rather than an answer — and `selectUnitsForLine`, which
   * refuses `needed < 1`, is never called. The caller renders the honest "not
   * unit-tracked" sentence off `unitsOwned === 0`.
   */
  it('answers a product with no unit rows as owning nothing, not as unavailable', () => {
    const answer = productAvailabilityFor(PRODUCT, [], [], IN_THREE_WEEKS, RULES)
    expect(answer.unitsOwned).toBe(0)
    expect(answer.unitsFree).toBe(0)
    expect(answer.heldBy).toEqual([])
  })

  it('ignores holds belonging to other products', () => {
    const pool = [unit('EQ-1')]
    const elsewhere: UnitHold[] = [
      { unitId: 'u-OTHER', bookingId: 'x', bookingNo: 'B-799', window: IN_THREE_WEEKS },
    ]
    expect(productAvailabilityFor(PRODUCT, pool, elsewhere, IN_THREE_WEEKS, RULES).unitsFree).toBe(1)
  })
})

/**
 * # The quantity half — bulk stock, added 9 Sep 2026
 *
 * These matter more than the serial cases above, and the reason is not
 * theoretical: **live has 204 quantity-tracked products and zero
 * `product_units` rows**, so on production every catalogue row goes down this
 * path and none goes down the other one. Until this branch existed the module
 * answered `unitsOwned: 0` for all of them, and the screens above it filled the
 * silence by reporting the raw stock as free.
 */
describe('productCapacityFor — bulk stock', () => {
  const BULK = 'p-cstand'

  function qHold(qty: number, fromAd: string, toAd: string, bookingNo = 'B-701'): QuantityHold {
    return { bookingId: `id-${bookingNo}`, bookingNo, qty, window: { fromAd, toAd } }
  }

  it('reports the whole stock free when nothing is held', () => {
    const answer = productCapacityFor(BULK, 4, [], IN_THREE_WEEKS, RULES)
    expect(answer).toMatchObject({ mode: 'quantity', unitsOwned: 4, unitsFree: 4, unitsHeld: 0 })
    expect(answer.heldBy).toEqual([])
  })

  it('subtracts a hold that overlaps the window, and names the booking', () => {
    const answer = productCapacityFor(BULK, 4, [qHold(4, IN_THREE_WEEKS.fromAd, IN_THREE_WEEKS.toAd)], IN_THREE_WEEKS, RULES)
    expect(answer.unitsFree).toBe(0)
    expect(answer.unitsHeld).toBe(4)
    expect(answer.heldBy).toEqual(['B-701'])
  })

  /* NR-09 for bulk stock: the same product, the same holds, two windows. A
     count of what is out TODAY cannot answer for three weeks away, and this is
     the case that proves the window is actually consulted. */
  it('is free for a window the hold does not touch', () => {
    const holds = [qHold(4, TODAY.fromAd, TODAY.toAd)]
    expect(productCapacityFor(BULK, 4, holds, TODAY, RULES).unitsFree).toBe(0)
    expect(productCapacityFor(BULK, 4, holds, IN_THREE_WEEKS, RULES).unitsFree).toBe(4)
  })

  /* Two holds of 2 that do not overlap EACH OTHER claim 2 at once, never 4 —
     `capacityFor`'s peak, which is the figure the database's own capacity
     trigger compares against. Summing them would refuse bookings Postgres
     would allow. */
  it('counts the peak of overlapping holds, not their sum', () => {
    const holds = [
      qHold(2, '2026-09-26T04:00:00+00:00', '2026-09-27T04:00:00+00:00', 'B-701'),
      qHold(2, '2026-09-27T04:00:00+00:00', '2026-09-28T04:00:00+00:00', 'B-702'),
    ]
    const answer = productCapacityFor(BULK, 4, holds, IN_THREE_WEEKS, RULES)
    expect(answer.unitsHeld).toBe(2)
    expect(answer.unitsFree).toBe(2)
    expect(answer.heldBy).toEqual(['B-701', 'B-702'])
  })

  it('names only the bookings whose hold actually touches the window', () => {
    const holds = [
      qHold(1, TODAY.fromAd, TODAY.toAd, 'B-OLD'),
      qHold(1, IN_THREE_WEEKS.fromAd, IN_THREE_WEEKS.toAd, 'B-NOW'),
    ]
    expect(productCapacityFor(BULK, 4, holds, IN_THREE_WEEKS, RULES).heldBy).toEqual(['B-NOW'])
  })

  /* `total_quantity` is `integer not null` with a CHECK at or above 0, so a
     negative or fractional figure is a failed read. Answering it would invent
     capacity, and `capacityFor` refuses rather than guessing. */
  it('refuses a stock figure the database could not have produced', () => {
    expect(() => productCapacityFor(BULK, -1, [], IN_THREE_WEEKS, RULES)).toThrow(/whole number/i)
  })

  /* `readQuantityHolds` passes a null `qty` through as NaN deliberately, because
     defaulting it to 1 would UNDER-count stock that is already promised. The
     refusal has to survive this far. */
  it('refuses a hold whose quantity could not be read', () => {
    const holds = [qHold(Number.NaN, IN_THREE_WEEKS.fromAd, IN_THREE_WEEKS.toAd)]
    expect(() => productCapacityFor(BULK, 4, holds, IN_THREE_WEEKS, RULES)).toThrow()
  })
})
