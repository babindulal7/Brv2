import { describe, it, expect } from 'vitest'
import {
  BOX_CATEGORIES,
  CREW_ROLES,
  VEHICLE_TYPES,
  iconForCategory,
} from '../addBundle'

describe('addBundle query layer', () => {
  it('exports box categories set', () => {
    expect(BOX_CATEGORIES.has('Case')).toBe(true)
    expect(BOX_CATEGORIES.has('Bag')).toBe(true)
    expect(BOX_CATEGORIES.has('Camera')).toBe(false)
  })

  it('exports crew roles and vehicle types', () => {
    expect(CREW_ROLES.length).toBeGreaterThan(0)
    expect(VEHICLE_TYPES.length).toBeGreaterThan(0)
  })

  it('maps category to valid icon', () => {
    expect(iconForCategory('Camera')).toBe('camera')
    expect(iconForCategory('Case')).toBe('package')
  })
})
