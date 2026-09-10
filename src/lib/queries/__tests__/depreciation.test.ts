import { describe, it, expect } from 'vitest'
import {
  getDepreciableAssets,
  straightLineSchedule,
  PRICED_ASSETS,
} from '../depreciation'
import { rupees } from '../../money'

describe('depreciation queries', () => {
  it('returns valid depreciable assets list', async () => {
    const assets = await getDepreciableAssets()
    expect(assets).toBeDefined()
    expect(assets.length).toBeGreaterThan(0)
    expect(assets[0]?.name).toBeDefined()
  })

  it('computes straight line schedule correctly', () => {
    const schedule = straightLineSchedule({
      costPaisa: rupees(100000),
      salvagePaisa: rupees(10000),
      lifeYears: 5,
    })
    expect(schedule.length).toBe(5)
    expect(schedule[0]?.year).toBe(1)
  })

  it('exposes PRICED_ASSETS with valid prices', () => {
    expect(PRICED_ASSETS.length).toBeGreaterThan(0)
    expect(PRICED_ASSETS[0]?.purchasePricePaisa).toBeDefined()
  })
})
