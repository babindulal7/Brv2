import { describe, it, expect } from 'vitest'
import { inventoryCsv } from '../InventoryReports'
import { INVENTORY_STATES, summariseStatusCounts } from '../../../lib/queries/inventoryReports'

const summary = summariseStatusCounts(INVENTORY_STATES.map((status) => ({ status, count: status === 'In Stock' ? 3 : 1 })))
const flat = (rows: readonly (readonly unknown[])[]) => rows.map((r) => r.join('|')).join('\n')

describe('inventoryCsv', () => {
  it('exports real counts and says "not measured" for utilization and accuracy', () => {
    const t = flat(inventoryCsv(summary, false))
    expect(t).toContain('In stock|3')
    expect(t).toContain('Utilization|not measured')
    expect(t).toContain('Inventory accuracy|not measured')
  })

  it('carries no category-value section for a money-blind role', () => {
    expect(flat(inventoryCsv(summary, false))).not.toMatch(/categories/i)
    expect(flat(inventoryCsv(summary, true))).toContain('Top categories by value|not tracked yet')
  })

  it('never writes 0 when the read failed', () => {
    const t = flat(inventoryCsv(null, false))
    expect(t).toContain('In stock|not measured')
    expect(t).not.toMatch(/\|0(\||$)/m)
  })
})
