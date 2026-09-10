import { describe, it, expect } from 'vitest'
import {
  getPulseLiveSummary,
  PERIODS,
  DEFAULT_PERIOD,
  DEFINITIONS,
  figuresFor,
  rangeLabel,
} from '../pulse'

describe('pulse queries', () => {
  it('loads live pulse summary with non-negative metrics', async () => {
    const summary = await getPulseLiveSummary()
    expect(summary).toBeDefined()
    expect(summary.bookingCount).toBeGreaterThanOrEqual(0)
    expect(summary.activeBookings).toBeGreaterThanOrEqual(0)
    expect(Number(summary.invoicedTotal)).toBeGreaterThanOrEqual(0)
    expect(Number(summary.collectedTotal)).toBeGreaterThanOrEqual(0)
    expect(summary.inventoryUnitsCount).toBeGreaterThanOrEqual(0)
  })

  it('exposes defined periods and valid figures calculation', () => {
    expect(PERIODS.length).toBeGreaterThan(0)
    expect(DEFAULT_PERIOD).toBeDefined()
    expect(DEFINITIONS).toBeDefined()

    const period = PERIODS[0]
    expect(period).toBeDefined()
    if (period && period.range) {
      const label = rangeLabel(period.range.from, period.range.to)
      expect(label.ad).toBeDefined()

      const figures = figuresFor(period.range.from, period.range.to)
      expect(figures).toBeDefined()
    }
  })
})
