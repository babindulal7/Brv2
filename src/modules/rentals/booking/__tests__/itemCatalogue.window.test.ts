import { describe, it, expect } from 'vitest'
import {
  equipmentConflicts,
  equipmentResultsFrom,
  groupEquipmentResults,
} from '../itemCatalogue'
import type {
  EquipmentAvailabilitySource,
  EquipmentResult,
  LiveEquipmentRow,
} from '../itemCatalogue'
import type { ProductWindowAvailability } from '../../../../lib/queries/productAvailability'

/**
 * # The catalogue's half of NR-09 and NR-21
 *
 * `lib/queries/__tests__/productAvailability.test.ts` pins the ENGINE answer —
 * including the case that names the defect, a unit busy today being free for a
 * future window. This file pins what the catalogue does with that answer: the
 * verdict it renders, the Critical it now raises (and the ones it no longer
 * raises), and the identity it groups rows on.
 */

const FX3 = 'aaaaaaaa-0000-4000-8000-000000000001'
const FX3_TWIN = 'aaaaaaaa-0000-4000-8000-000000000002'
const CABLE = 'aaaaaaaa-0000-4000-8000-000000000003'

function row(id: string, name: string, over: Partial<LiveEquipmentRow> = {}): LiveEquipmentRow {
  return { id, name, category: 'Camera', dailyRate: 500000, ...over }
}

function answer(
  productId: string,
  unitsOwned: number,
  unitsFree: number,
  heldBy: readonly string[] = [],
): ProductWindowAvailability {
  /* `mode: 'unit'` because these fixtures are serial pools. The quantity half
     (`productCapacityFor`) answers the same shape for bulk stock, and the
     catalogue renders both — see productAvailability.ts. */
  return { productId, mode: 'unit', unitsOwned, unitsFree, unitsHeld: unitsOwned - unitsFree, heldBy }
}

function ready(...answers: ProductWindowAvailability[]): EquipmentAvailabilitySource {
  return { state: 'ready', byProduct: new Map(answers.map((a) => [a.productId, a])) }
}

/* ── The verdict a live row renders ────────────────────────────────────── */

describe('equipmentResultsFrom', () => {
  /**
   * ⭐ The sentence that gave the defect away. Every verdict used to end in
   * "right now" under a panel header promising the booking's dates.
   */
  it('phrases availability for the booking dates, never for "right now"', () => {
    const [result] = equipmentResultsFrom([row(FX3, 'Sony FX3')], ready(answer(FX3, 4, 2, ['B-710'])))
    expect(result?.availability.level).toBe('partial')
    expect(result?.availability.detail).toContain('for these dates')
    expect(result?.availability.detail).not.toContain('right now')
    expect(result?.availability.detail).toContain('B-710')
  })

  it('calls a product with every unit free available, and one with none unavailable', () => {
    const source = ready(answer(FX3, 3, 3), answer(FX3_TWIN, 3, 0, ['B-711', 'B-712']))
    const results = equipmentResultsFrom([row(FX3, 'A'), row(FX3_TWIN, 'B')], source)
    expect(results[0]?.availability.level).toBe('available')
    expect(results[1]?.availability.level).toBe('unavailable')
    expect(results[1]?.availability.detail).toContain('None of 3 free for these dates')
  })

  /**
   * ⭐ NR-09 requirement 3, and the BD-02 / NR-13 lesson: a read in flight, or
   * a failed one, must not render as a settled fact in EITHER direction.
   */
  it('renders an in-flight or failed read as unknown, never as available', () => {
    const rows = [row(FX3, 'Sony FX3')]

    const checking = equipmentResultsFrom(rows, { state: 'checking' })[0]
    expect(checking?.availability.level).toBe('unknown')
    expect(checking?.availability.label).toBe('Checking')

    const failed = equipmentResultsFrom(rows, { state: 'failed', reason: 'network down' })[0]
    expect(failed?.availability.level).toBe('unknown')
    expect(failed?.availability.detail).toContain('network down')

    const noWindow = equipmentResultsFrom(rows, { state: 'no-window' })[0]
    expect(noWindow?.availability.level).toBe('unknown')

    /* And a product the read simply did not cover is unknown too, not free. */
    const missing = equipmentResultsFrom(rows, ready())[0]
    expect(missing?.availability.level).toBe('unknown')
  })

  /**
   * Requirement 4 — a product the engine genuinely cannot answer for says so.
   *
   * `unitsOwned === 0` is bulk stock: there are no unit rows for the window to
   * overlap, so the quantity is a real fact but NOT an answer about these dates.
   *
   * ⛔ The first version of this test asserted the detail string while letting
   * the level stay `'available'` — a green **Available** chip under a header
   * reading "Availability shown for this booking's dates", from a count nothing
   * had compared with them. That is the NR-09 defect the whole file was
   * rewritten to remove, surviving for exactly the rows it most matters on: the
   * live project has 204 active products and 0 `product_units` (queried 6 Sep
   * 2026), so every catalogue row takes this branch. It also disagreed with
   * `equipmentConflicts`, which already called these rows unchecked, and with
   * `confirmRental`'s `planAssignment`, which refuses a line resolving no units.
   */
  it('reports bulk stock as NOT CHECKED, because no unit row means nothing was checked', () => {
    const bulk = equipmentResultsFrom(
      [row(CABLE, 'XLR cable', { totalQuantity: 12 })],
      ready(answer(CABLE, 0, 0)),
    )[0]
    expect(bulk?.availability.level).toBe('unknown')
    expect(bulk?.availability.label).toBe('Not checked')
    // The count still ships — it is true, it is just not an answer about the dates.
    expect(bulk?.availability.detail).toContain('12 in stock')
    expect(bulk?.availability.detail).toContain('nothing to check against these dates')

    const nothing = equipmentResultsFrom(
      [row(CABLE, 'XLR cable', { totalQuantity: 0 })],
      ready(answer(CABLE, 0, 0)),
    )[0]
    expect(nothing?.availability.level).toBe('unavailable')
    expect(nothing?.availability.detail).toBe('No units recorded')
  })

  /** A product has no `inventory_state`, so a live row carries no status. */
  it('stamps no unit status on a live product row', () => {
    const [result] = equipmentResultsFrom([row(FX3, 'Sony FX3')], ready(answer(FX3, 2, 0)))
    expect(result?.status).toBeUndefined()
    expect(result?.id).toBe(FX3)
  })
})

/* ── NR-21 — grouping on identity, not on display name ─────────────────── */

describe('groupEquipmentResults', () => {
  /**
   * ⭐ Two DIFFERENT products that happen to share a name. Grouping on `name`
   * collapsed them into one row, so the operator saw a single "Sony FX3" whose
   * chips and rate came from whichever had sorted first, and `autoPick` added
   * that one rather than the row they were looking at.
   */
  it('keeps two live products with the same name apart', () => {
    const results = equipmentResultsFrom(
      [
        row(FX3, 'Sony FX3', { assetCode: 'EQ000001' }),
        row(FX3_TWIN, 'Sony FX3', { assetCode: 'EQ000002', dailyRate: 900000 }),
      ],
      ready(answer(FX3, 1, 1), answer(FX3_TWIN, 1, 1)),
    )

    const groups = groupEquipmentResults(results)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.key)).toEqual([FX3, FX3_TWIN])
    /* Each group's auto-pick is its OWN product, which is the actual harm. */
    expect(groups[0]?.autoPick?.id).toBe(FX3)
    expect(groups[1]?.autoPick?.id).toBe(FX3_TWIN)
    expect(groups[1]?.ratePaisa).toBe(900000)
    /* And the keys are distinct, which is what React is handed. */
    expect(new Set(groups.map((g) => g.key)).size).toBe(2)
  })

  /**
   * The seed path must not regress: many serialised units of ONE model still
   * collapse into one row with a chip per unit. Built here from the seed shape
   * (`productKey` = the model name) rather than from `PARENTS`, so the case is
   * legible and does not move when the seed data does.
   */
  it('still collapses many units of one model into a single row', () => {
    const seedUnit = (serial: string, level: 'available' | 'unavailable'): EquipmentResult => ({
      kind: 'equipment',
      id: serial,
      productKey: 'Sony FX3',
      name: 'Sony FX3',
      serial,
      category: 'Camera',
      location: 'Rack A',
      status: level === 'available' ? 'In Stock' : 'On Rent',
      committedTo: '—',
      ratePaisa: 500000 as EquipmentResult['ratePaisa'],
      inBundles: [],
      availability: {
        level,
        label: level === 'available' ? 'Available' : 'Unavailable',
        detail: 'seed',
        tone: level === 'available' ? 'in' : 'danger',
        icon: level === 'available' ? 'check' : 'error',
        shortLines: [],
        freedLines: [],
      },
      haystack: [],
    })

    const groups = groupEquipmentResults([
      seedUnit('FX3-002', 'unavailable'),
      seedUnit('FX3-001', 'available'),
      seedUnit('FX3-003', 'available'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.units).toHaveLength(3)
    /* Auto-pick is the first FREE unit in serial order, not the first row. */
    expect(groups[0]?.autoPick?.serial).toBe('FX3-001')
    /* The group shows the BEST availability across its units. */
    expect(groups[0]?.availability.level).toBe('available')
  })
})

/* ── The Critical, and the ones that are no longer raised ──────────────── */

describe('equipmentConflicts', () => {
  /**
   * ⭐ The block NR-09 removes. A camera with units free for the window is not
   * a conflict, however busy it is today — and the old rule, which read a
   * fabricated `status`, could only say "On Rent".
   */
  it('raises no conflict when the window has enough free units', () => {
    const summary = equipmentConflicts(
      [{ id: FX3, name: 'Sony FX3', qty: 1 }],
      ready(answer(FX3, 4, 2, ['B-710'])),
    )
    expect(summary.conflicts).toEqual([])
    expect(summary.checked).toBe(1)
    expect(summary.text).toContain('free for these dates')
  })

  it('raises a conflict when the booking wants more than the window can give', () => {
    const summary = equipmentConflicts(
      [{ id: FX3, name: 'Sony FX3', qty: 3 }],
      ready(answer(FX3, 4, 2, ['B-710', 'B-711', 'B-712'])),
    )
    expect(summary.conflicts).toHaveLength(1)
    expect(summary.conflicts[0]?.needed).toBe(3)
    expect(summary.conflicts[0]?.free).toBe(2)
    expect(summary.conflicts[0]?.text).toContain('3 units wanted, 2 free for these dates')
    expect(summary.conflicts[0]?.text).toContain('B-710')
    /* Two named, then a count — a popular camera must not print a paragraph. */
    expect(summary.conflicts[0]?.text).toContain('and 1 more')
  })

  it('raises a conflict when nothing is free for the window', () => {
    const summary = equipmentConflicts(
      [{ id: FX3, name: 'Sony FX3', qty: 1 }],
      ready(answer(FX3, 2, 0, ['B-710'])),
    )
    expect(summary.conflicts).toHaveLength(1)
    expect(summary.verdictByLineId.get(FX3)?.level).toBe('unavailable')
  })

  /**
   * ⭐ Requirement 3 again, on the blocking side: while the read is in flight
   * or has failed, nothing is a conflict — refusing a booking because a query
   * has not come back would be its own defect — and the summary does not claim
   * the booking is clear either.
   */
  it('reports no conflicts and no clean bill while there is no answer', () => {
    for (const source of [
      { state: 'checking' } as const,
      { state: 'no-window' } as const,
      { state: 'failed', reason: 'boom' } as const,
    ]) {
      const summary = equipmentConflicts([{ id: FX3, name: 'Sony FX3', qty: 1 }], source)
      expect(summary.conflicts).toEqual([])
      expect(summary.checked).toBe(0)
      expect(summary.unchecked).toBe(1)
      expect(summary.verdictByLineId.get(FX3)?.level).toBe('unknown')
      expect(summary.text).not.toContain('have units free')
    }
  })

  /** Bulk stock and seed rows are counted as unchecked, never as cleared. */
  it('counts a line it cannot answer for rather than passing it', () => {
    const summary = equipmentConflicts(
      [
        { id: FX3, name: 'Sony FX3', qty: 1 },
        { id: CABLE, name: 'XLR cable', qty: 4 },
        { id: 'BND-23::Sony FX3', name: 'Sony FX3', qty: 1 },
      ],
      ready(answer(FX3, 2, 2), answer(CABLE, 0, 0)),
    )
    expect(summary.conflicts).toEqual([])
    expect(summary.checked).toBe(1)
    expect(summary.unchecked).toBe(2)
    expect(summary.text).toContain('2 lines could not be checked')
    expect(summary.verdictByLineId.get(CABLE)?.level).toBe('unknown')
    expect(summary.verdictByLineId.get('BND-23::Sony FX3')?.level).toBe('unknown')
  })

  /** Every line gets a verdict, so no availability cell has to invent one. */
  it('answers for every line it was given', () => {
    const lines = [
      { id: FX3, name: 'A', qty: 1 },
      { id: CABLE, name: 'B', qty: 1 },
    ]
    const summary = equipmentConflicts(lines, ready(answer(FX3, 1, 1), answer(CABLE, 1, 0)))
    expect([...summary.verdictByLineId.keys()].sort()).toEqual([FX3, CABLE].sort())
  })
})
