/**
 * # The depreciation schedule, and the default that must not exist
 *
 * Two separate things are held down here.
 *
 * **The arithmetic.** `10_TOOLS.md` §10.2 draws a `year │ opening │ dep │ WDV`
 * table and a book-value curve. A schedule whose rows do not sum to the total it
 * prints, or whose last row does not land on the salvage value the user typed,
 * is a defect an accountant will find before we do — and `lib/money.ts` §2.8
 * already makes "every displayed total reconciles exactly" a structural
 * property rather than a hope. These tests extend that property to this table.
 *
 * **The absence.** §10.2 says *"Defaults come from Settings"*, and there is no
 * such setting: `11_SETTINGS.md` §11.2's eight sections carry none, and
 * `data/addEquipment.ts` refuses the same invention in writing. The last three
 * tests exist so that a later session cannot quietly add a "sensible" five-year
 * default without a failing test explaining why it is not ours to choose.
 * Rulings §8: *"never a plausible default, never zero."*
 */
import { describe, it, expect } from 'vitest'
import { rupees, toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import {
  straightLineSchedule,
  DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON,
  IRD_POOL_BLOCKED_REASON,
} from '../tools'
import * as tools from '../tools'

describe('straightLineSchedule — the arithmetic', () => {
  it('charges (cost − salvage) ÷ life, one row per year', () => {
    const rows = straightLineSchedule({ costPaisa: rupees(100_000), salvagePaisa: rupees(20_000), lifeYears: 4 })
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => toRupees(r.depreciationPaisa))).toEqual([20_000, 20_000, 20_000, 20_000])
    expect(toRupees(rows[0]!.openingPaisa)).toBe(100_000)
    expect(toRupees(rows[3]!.closingPaisa)).toBe(20_000)
  })

  it('opens each year where the previous one closed — no gap, no overlap', () => {
    const rows = straightLineSchedule({ costPaisa: rupees(1_350_000), salvagePaisa: rupees(150_000), lifeYears: 7 })
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.openingPaisa).toBe(rows[i - 1]!.closingPaisa)
    }
  })

  it('sums to exactly cost − salvage, and lands on salvage, even when the division does not divide', () => {
    /* 1,00,000 over 3 years is 33,333.33 a year — the case that drifts if the
       remainder is spread instead of absorbed by the final year. */
    const rows = straightLineSchedule({ costPaisa: rupees(100_000), salvagePaisa: rupees(1), lifeYears: 3 })
    const total = rows.reduce((n, r) => n + r.depreciationPaisa, 0)
    expect(total).toBe(rupees(100_000) - rupees(1))
    expect(rows[rows.length - 1]!.closingPaisa).toBe(rupees(1))
  })

  it('never writes an asset below its own salvage value', () => {
    const rows = straightLineSchedule({ costPaisa: rupees(9_999), salvagePaisa: rupees(500), lifeYears: 6 })
    for (const r of rows) expect(r.closingPaisa).toBeGreaterThanOrEqual(rupees(500))
  })

  it('keeps every figure a whole rupee — lib/money.ts §2.4', () => {
    const rows = straightLineSchedule({ costPaisa: rupees(77_777), salvagePaisa: rupees(3), lifeYears: 5 })
    for (const r of rows) {
      expect(r.openingPaisa % 100).toBe(0)
      expect(r.depreciationPaisa % 100).toBe(0)
      expect(r.closingPaisa % 100).toBe(0)
    }
  })

  it('returns nothing — never a table of zeros — for input the method cannot describe', () => {
    expect(straightLineSchedule({ costPaisa: rupees(100), salvagePaisa: rupees(0), lifeYears: 0 })).toEqual([])
    expect(straightLineSchedule({ costPaisa: rupees(100), salvagePaisa: rupees(0), lifeYears: -3 })).toEqual([])
    expect(straightLineSchedule({ costPaisa: rupees(0), salvagePaisa: rupees(0), lifeYears: 4 })).toEqual([])
    expect(straightLineSchedule({ costPaisa: rupees(100), salvagePaisa: rupees(500), lifeYears: 4 })).toEqual([])
    expect(straightLineSchedule({ costPaisa: rupees(100), salvagePaisa: rupees(-1), lifeYears: 4 })).toEqual([])
    expect(straightLineSchedule({ costPaisa: Number.NaN as Paisa, salvagePaisa: rupees(0), lifeYears: 4 })).toEqual([])
  })
})

describe('the depreciation default that may not be invented', () => {
  it('exports no default life, salvage or asset-class table', () => {
    const exported = Object.keys(tools)
    const suspicious = exported.filter((k) => /^(DEFAULT_|ASSET_LIVES|DEPRECIATION_GROUPS|SALVAGE)/i.test(k))
    expect(suspicious).toEqual([])
  })

  it('states why the Settings default is unavailable rather than supplying one', () => {
    expect(DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON).toContain('No defaults have been set')
    expect(DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON).toContain('accountant')
  })

  it('states why the IRD pool view is blocked rather than supplying a rate', () => {
    expect(IRD_POOL_BLOCKED_REASON).toContain('have not been supplied by your accountant')
    /* If a percentage ever appears in this sentence, somebody has answered the
       question the sentence exists to ask. */
    expect(IRD_POOL_BLOCKED_REASON).not.toMatch(/\d+(\.\d+)?\s*%/)
  })
})
