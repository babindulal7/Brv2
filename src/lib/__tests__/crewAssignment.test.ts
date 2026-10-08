import { describe, expect, it } from 'vitest'
import { crewTimeInput, crewTimeIso, canAssignPricedCrew } from '../crewAssignment'
describe('crew assignment time and role rules', () => {
  it('round trips Nepal civil time across the UTC date boundary', () => {
    expect(crewTimeInput('2026-09-12T20:15:00Z')).toBe('2026-09-13T02:00')
    expect(crewTimeIso('2026-09-13T02:00')).toBe('2026-09-12T20:15:00.000Z')
  })
  it.each(['', '2026-02-30T09:00', '2026-09-13T25:00'])('refuses invalid date %s', (value) => {
    expect(() => crewTimeIso(value)).toThrow()
  })
  it('limits priced assignments to management', () => {
    expect(canAssignPricedCrew('Owner')).toBe(true)
    expect(canAssignPricedCrew('Admin')).toBe(true)
    expect(canAssignPricedCrew('Manager')).toBe(true)
    expect(canAssignPricedCrew('Coordinator')).toBe(false)
    expect(canAssignPricedCrew('Warehouse')).toBe(false)
    expect(canAssignPricedCrew('Accounts')).toBe(false)
  })
})
