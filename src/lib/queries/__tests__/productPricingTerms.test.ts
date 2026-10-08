import { describe, expect, it, vi } from 'vitest'

vi.mock('../../supabase', () => ({ supabase: {} }))

import { rulesFromRow, structureFromRow } from '../productPricingTerms'
import { quoteUnitPrice } from '../../pricingStructures'

describe('productPricingTerms mappers', () => {
  it('maps rupee tiles to paisa and drops retired tiles', () => {
    const s = structureFromRow({
      id: 's', extra_day_amount: '20.00', retired_at: null,
      tiles: [
        { duration_days: 1, amount: '50.00', retired_at: null },
        { duration_days: 2, amount: '75', retired_at: null },
        { duration_days: 3, amount: '1', retired_at: '2026-01-01' },
      ],
    })
    expect(s).toEqual({ tiles: [{ days: 1, pricePaisa: 5000 }, { days: 2, pricePaisa: 7500 }], extraDayPaisa: 2000 })
  })
  it('a retired structure or one with no live tile prices nothing', () => {
    expect(structureFromRow({ id: 's', extra_day_amount: null, retired_at: '2026-01-01', tiles: [] })).toBeNull()
    expect(structureFromRow({ id: 's', extra_day_amount: null, retired_at: null, tiles: [] })).toBeNull()
  })
  it('orders rules, converts times, and feeds the engine end to end', () => {
    const rules = rulesFromRow({
      id: 'r', retired_at: null,
      rules: [
        { sort_order: 1, kind: 'price', name: 'Summer', charge_action: null, pickup_after: null, return_before: null, percent: '-20.00', weekdays: null, valid_from: null, valid_to: null, apply_when: 'spans', stack: true, retired_at: null },
        { sort_order: 0, kind: 'charge', name: 'Free pickup', charge_action: 'skip_pickup_day', pickup_after: '16:00:00', return_before: null, percent: null, weekdays: null, valid_from: null, valid_to: null, apply_when: 'overlaps', stack: false, retired_at: null },
      ],
    })
    expect(rules[0]).toEqual({ kind: 'charge', action: 'skip_pickup_day', pickupAfter: '16:00' })
    const q = quoteUnitPrice({ pickupDay: '2026-10-05', days: 3, pickupTime: '17:00', base: { method: 'flat', perDayPaisa: 1000 }, rules })
    expect(q.unitTotalPaisa).toBe(1600)
  })
})
