import { describe, it, expect } from 'vitest'
import {
  getToolsStatus,
  isMoneySurface,
  TOOLS,
  TOOL_GROUPS,
  cropFactor,
  depthOfField,
  storageGb,
  batteryRuntimeHours,
} from '../tools'

describe('tools queries and formulas', () => {
  it('returns valid tools status', async () => {
    const status = await getToolsStatus()
    expect(status).toBeDefined()
    expect(status.toolCount).toBeGreaterThan(0)
  })

  it('correctly maps isMoneySurface routes', () => {
    expect(isMoneySurface('/tools/depreciation')).toBe(true)
    expect(isMoneySurface('/tools/pricing')).toBe(true)
    expect(isMoneySurface('/tools/cinematography')).toBe(false)
  })

  it('computes optics and cinematography formulas correctly', () => {
    expect(cropFactor(36, 24)).toBeCloseTo(1.0, 1)
    const dof = depthOfField(50, 2.8, 0.02, 2)
    expect(dof.total).toBeGreaterThan(0)
    expect(storageGb(100, 60)).toBeGreaterThan(0)
    expect(batteryRuntimeHours(98, 45)).toBeGreaterThan(0)
    expect(TOOLS.length).toBeGreaterThan(0)
    expect(TOOL_GROUPS.length).toBeGreaterThan(0)
  })
})
