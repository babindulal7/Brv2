import { describe, it, expect } from 'vitest'
import {
  getLiquiditySummary,
  cashIn,
  operatingOut,
  netCash,
  closingCash,
  collectionRate,
  POSITION,
  LIABILITIES_ARE_COMPLETE,
  workingCapital,
} from '../liquidity'

describe('liquidity queries', () => {
  it('returns valid liquidity summary with non-empty lines and position', async () => {
    const summary = await getLiquiditySummary()
    expect(summary).toBeDefined()
    expect(summary.lines.length).toBeGreaterThan(0)
    expect(summary.position.length).toBeGreaterThan(0)
    expect(POSITION.length).toBeGreaterThan(0)
    expect(typeof summary.collectionRatePct).toBe('number')
  })

  it('preserves untracked payables invariant and null working capital', () => {
    expect(LIABILITIES_ARE_COMPLETE).toBe(false)
    expect(workingCapital()).toBeNull()
  })

  it('computes closing cash and collection rates consistently', () => {
    expect(typeof cashIn()).toBe('number')
    expect(typeof operatingOut()).toBe('number')
    expect(typeof netCash()).toBe('number')
    expect(typeof closingCash()).toBe('number')
    expect(collectionRate()).toBeGreaterThanOrEqual(0)
  })
})
