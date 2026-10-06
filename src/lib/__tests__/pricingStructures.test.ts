import { describe, expect, it } from 'vitest'
import { quoteUnitPrice, structureTotal, type PricingRule, type PricingStructure } from '../pricingStructures'

/* Booqable's documented example (help article 3701999), used as the fixture — not a measured trial:
   7 days at 10 a day = 70; a 10% season rule over all 7 days and a 20% weekend rule over 2 days.
   Without stacking 81.00, with stacking 81.40. We keep whole rupees (19 Aug ruling), so the unit price is
   rounded once: both read Rs 81 at 10/day — hence the same example is also run at 100/day, where the two
   documented totals stay distinguishable (810 and 814). Monday 5 Oct 2026 → Sunday 11 Oct: Sat + Sun are the 2 weekend days. */
const season = (stack: boolean): PricingRule => ({
  kind: 'price', name: 'Summer season', percent: 10, from: '2026-06-01', to: '2026-12-31', applyWhen: 'overlaps', stack,
})
const weekend = (stack: boolean): PricingRule => ({
  kind: 'price', name: 'Weekend', percent: 20, weekdays: [6, 0], applyWhen: 'overlaps', stack,
})
const week = { pickupDay: '2026-10-05', days: 7 }

describe('rulesets — the documented 7-day example', () => {
  it('without stacking: 70 + 7 + 4 = 81', () => {
    const q = quoteUnitPrice({ ...week, base: { method: 'flat', perDayPaisa: 1000 }, rules: [season(true), weekend(false)] })
    expect(q.baseTotalPaisa).toBe(7000)
    expect(q.adjustments.map((a) => Math.round(a.deltaPaisa))).toEqual([700, 400])
    expect(q.unitTotalPaisa).toBe(8100)
  })
  it('with stacking: 70 + 7 + 4.40 = 81.40, rounded once to Rs 81', () => {
    const q = quoteUnitPrice({ ...week, base: { method: 'flat', perDayPaisa: 1000 }, rules: [season(true), weekend(true)] })
    expect(q.adjustments.map((a) => Math.round(a.deltaPaisa))).toEqual([700, 440])
    expect(q.unitTotalPaisa).toBe(8100)
  })
  it('at 100 a day the two documented totals stay distinguishable: 810 vs 814', () => {
    const base = { method: 'flat', perDayPaisa: 10000 } as const
    expect(quoteUnitPrice({ ...week, base, rules: [season(true), weekend(false)] }).unitTotalPaisa).toBe(81000)
    expect(quoteUnitPrice({ ...week, base, rules: [season(true), weekend(true)] }).unitTotalPaisa).toBe(81400)
  })
})

describe('charge-period rules run before price rules', () => {
  it('free pickup day takes a 3-day 30 order to 20, then a 20% discount to 16', () => {
    const q = quoteUnitPrice({
      pickupDay: '2026-10-05', days: 3, base: { method: 'flat', perDayPaisa: 1000 },
      rules: [
        { kind: 'charge', action: 'skip_pickup_day' },
        { kind: 'price', name: 'Weekend discount', percent: -20, applyWhen: 'spans', stack: true },
      ],
    })
    expect(q.chargedDays).toBe(2)
    expect(q.unitTotalPaisa).toBe(1600)
  })
  it('a time condition with no time given is not applied, and says so', () => {
    const q = quoteUnitPrice({
      pickupDay: '2026-10-05', days: 3, base: { method: 'flat', perDayPaisa: 1000 },
      rules: [{ kind: 'charge', action: 'skip_pickup_day', pickupAfter: '16:00' }],
    })
    expect(q.chargedDays).toBe(3)
    expect(q.notes.join(' ')).toMatch(/no pickup time/)
  })
  it('pickup after the cut-off is free; before it is charged', () => {
    const rule: PricingRule = { kind: 'charge', action: 'skip_pickup_day', pickupAfter: '16:00' }
    const base = { method: 'flat', perDayPaisa: 1000 } as const
    expect(quoteUnitPrice({ pickupDay: '2026-10-05', days: 3, base, rules: [rule], pickupTime: '17:00' }).chargedDays).toBe(2)
    expect(quoteUnitPrice({ pickupDay: '2026-10-05', days: 3, base, rules: [rule], pickupTime: '09:00' }).chargedDays).toBe(3)
  })
  it('free return day when returned before 10:00, never below one charged day', () => {
    const rule: PricingRule = { kind: 'charge', action: 'skip_return_day', returnBefore: '10:00' }
    const base = { method: 'flat', perDayPaisa: 1000 } as const
    expect(quoteUnitPrice({ pickupDay: '2026-10-05', days: 2, base, rules: [rule], returnTime: '09:00' }).chargedDays).toBe(1)
    expect(quoteUnitPrice({ pickupDay: '2026-10-05', days: 1, base, rules: [rule], returnTime: '09:00' }).chargedDays).toBe(1)
  })
})

describe('apply-when modes', () => {
  const rule = (applyWhen: 'overlaps' | 'fits_within' | 'spans'): PricingRule => ({
    kind: 'price', name: 'Weekend', percent: 50, weekdays: [6, 0], applyWhen, stack: false,
  })
  const base = { method: 'flat', perDayPaisa: 10000 } as const
  it('overlaps prices only the matching days', () => {
    expect(quoteUnitPrice({ ...week, base, rules: [rule('overlaps')] }).unitTotalPaisa).toBe(70000 + 10000)
  })
  it('spans prices the whole rental once any day matches', () => {
    expect(quoteUnitPrice({ ...week, base, rules: [rule('spans')] }).unitTotalPaisa).toBe(105000)
  })
  it('fits_within prices nothing unless every day matches', () => {
    expect(quoteUnitPrice({ ...week, base, rules: [rule('fits_within')] }).unitTotalPaisa).toBe(70000)
    expect(quoteUnitPrice({ pickupDay: '2026-10-10', days: 2, base, rules: [rule('fits_within')] }).unitTotalPaisa).toBe(30000)
  })
})

describe('pricing structures', () => {
  const s: PricingStructure = {
    tiles: [{ days: 1, pricePaisa: 5000 }, { days: 2, pricePaisa: 7500 }],
    extraDayPaisa: 2000,
  }
  it('takes the tile that covers the rental, then charges extra days past the last one', () => {
    expect([1, 2, 3, 5].map((n) => structureTotal(s, n))).toEqual([5000, 7500, 9500, 13500])
  })
  it('a longer rental uses the NEXT tile (prices round up)', () => {
    const t: PricingStructure = { tiles: [{ days: 1, pricePaisa: 5000 }, { days: 3, pricePaisa: 9000 }], extraDayPaisa: null }
    expect(structureTotal(t, 2)).toBe(9000)
  })
  it('past every tile with no extra-day fee, the last tile is charged — nothing is invented', () => {
    expect(structureTotal({ tiles: s.tiles, extraDayPaisa: null }, 9)).toBe(7500)
  })
  it('a structure product takes rules on its charged days\' equal share', () => {
    const q = quoteUnitPrice({
      pickupDay: '2026-10-05', days: 2, base: { method: 'structure', structure: s },
      rules: [{ kind: 'price', name: 'Season', percent: 10, applyWhen: 'overlaps', stack: false }],
    })
    expect(q.baseTotalPaisa).toBe(7500)
    expect(q.unitTotalPaisa).toBe(8300) // 8250 rounds half-up to the rupee
  })
  it('a fixed price does not vary with duration', () => {
    const one = quoteUnitPrice({ pickupDay: '2026-10-05', days: 1, base: { method: 'fixed', pricePaisa: 12300 } })
    const nine = quoteUnitPrice({ pickupDay: '2026-10-05', days: 9, base: { method: 'fixed', pricePaisa: 12300 } })
    expect(one.unitTotalPaisa).toBe(nine.unitTotalPaisa)
  })
})
