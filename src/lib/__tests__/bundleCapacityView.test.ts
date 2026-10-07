import { describe, expect, it } from 'vitest'
import { bundleCapacityView, formatKitCapacity } from '../bundleCapacityView'

const lines = [
  { productId: 'cam', model: 'Sony FX3', quantity: 1 },
  { productId: 'card', model: 'CFexpress 512GB', quantity: 1 },
  { productId: 'bat', model: 'NP-FZ100', quantity: 2 },
]

describe('bundleCapacityView', () => {
  it('names the limiting component and its free count', () => {
    const free: Record<string, number> = { cam: 5, card: 2, bat: 9 }
    const v = bundleCapacityView(lines, (id) => free[id])
    expect(v).toEqual({ kits: 2, limitingNames: ['CFexpress 512GB'], limitingFree: 2 })
    expect(formatKitCapacity(v!)).toEqual({
      headline: '2 kits available for these dates',
      limitedBy: 'limited by CFexpress 512GB — 2 free',
    })
  })
  it('divides by the quantity one kit needs', () => {
    const free: Record<string, number> = { cam: 5, card: 5, bat: 5 }
    expect(bundleCapacityView(lines, (id) => free[id])?.kits).toBe(2) // 5 batteries / 2 per kit
  })
  it('says 0 kits when one component is fully out, and singular for 1', () => {
    expect(formatKitCapacity(bundleCapacityView(lines, (id) => (id === 'card' ? 0 : 9))!).headline).toBe('0 kits available for these dates')
    expect(formatKitCapacity(bundleCapacityView(lines, (id) => (id === 'cam' ? 1 : 9))!).headline).toBe('1 kit available for these dates')
  })
  it('shows nothing when any component has no availability answer', () => {
    expect(bundleCapacityView(lines, (id) => (id === 'bat' ? undefined : 9))).toBeNull()
  })
  it('shows nothing for a component with no product id or an empty bundle', () => {
    expect(bundleCapacityView([{ model: 'x', quantity: 1 }], () => 3)).toBeNull()
    expect(bundleCapacityView([], () => 3)).toBeNull()
  })
})
