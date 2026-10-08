import { describe, it, expect } from 'vitest'
import { bundleCapacity, bundleShortfall, type BundleComponentStock } from '../bundleAvailability'

const c = (productId: string, requiredPerBundle: number, free: number, isMandatory = true): BundleComponentStock => ({ productId, requiredPerBundle, free, isMandatory })

describe('bundleCapacity — minimum of floor(free / required) over mandatory components', () => {
  it('is set by the limiting component, not the average or the smallest stock', () => {
    // body 5 free /1 = 5, lens 3 free /1 = 3, battery 7 free /2 = 3 (floor of 3.5)
    const r = bundleCapacity([c('body', 1, 5), c('lens', 1, 3), c('battery', 2, 7)])
    expect(r.bundles).toBe(3)
    expect([...r.limiting].sort()).toEqual(['battery', 'lens'])
  })

  it('floors: 7 free at 2 per bundle is 3, never 3.5 or 4', () => {
    expect(bundleCapacity([c('battery', 2, 7)]).bundles).toBe(3)
  })

  it('one mandatory component out of stock makes the whole bundle 0', () => {
    const r = bundleCapacity([c('body', 1, 9), c('lens', 1, 0)])
    expect(r.bundles).toBe(0)
    expect(r.limiting).toEqual(['lens'])
  })

  it('a component needing more than is free (1 free, 2 needed) is 0, not 1', () => {
    expect(bundleCapacity([c('tripod', 2, 1)]).bundles).toBe(0)
  })

  it('optional components never limit, but are reported when they cannot cover one bundle', () => {
    const r = bundleCapacity([c('body', 1, 4), c('bag', 1, 0, false)])
    expect(r.bundles).toBe(4)
    expect(r.limiting).toEqual(['body'])
    expect(r.optionalShort).toEqual(['bag'])
  })

  it('negative, fractional and NaN free stock are treated as zero or floored, never as headroom', () => {
    expect(bundleCapacity([c('a', 1, -3)]).bundles).toBe(0)
    expect(bundleCapacity([c('a', 1, 2.9)]).bundles).toBe(2)
    expect(bundleCapacity([c('a', 1, Number.NaN)]).bundles).toBe(0)
  })

  it('a broken requirement (0, negative, fractional) reports 0 and names the component, never a guess', () => {
    for (const bad of [0, -1, 1.5]) {
      const r = bundleCapacity([c('ok', 1, 9), c('bad', bad, 9)])
      expect(r.bundles).toBe(0)
      expect(r.invalid).toEqual(['bad'])
    }
  })

  it('no mandatory components means nothing can be promised', () => {
    expect(bundleCapacity([]).bundles).toBe(0)
    expect(bundleCapacity([c('bag', 1, 9, false)]).bundles).toBe(0)
  })
})

describe('bundleShortfall', () => {
  const parts = [c('body', 1, 5), c('lens', 1, 3)]
  it('is ok at exactly capacity and short by the difference beyond it', () => {
    expect(bundleShortfall(parts, 3)).toEqual({ ok: true, shortBy: 0, limiting: ['lens'] })
    expect(bundleShortfall(parts, 5)).toEqual({ ok: false, shortBy: 2, limiting: ['lens'] })
  })
  it('is not ok when the definition is invalid even for qty 0', () => {
    expect(bundleShortfall([c('bad', 0, 9)], 0).ok).toBe(false)
  })
})
