import { describe, expect, it } from 'vitest'
import { PROJECT_TYPES, displayProjectType, isProjectType, validateProjectType } from '../projectTypes'

describe('projectTypes — the single controlled list', () => {
  it('carries the ruled fifteen values, Other last', () => {
    expect(PROJECT_TYPES).toHaveLength(15)
    expect(PROJECT_TYPES[0]).toBe('Feature Film')
    expect(PROJECT_TYPES[PROJECT_TYPES.length - 1]).toBe('Other')
  })

  it('accepts every listed value and rejects free text', () => {
    for (const t of PROJECT_TYPES) expect(isProjectType(t)).toBe(true)
    expect(isProjectType('doc shoot')).toBe(false)
    expect(isProjectType(null)).toBe(false)
    expect(isProjectType(undefined)).toBe(false)
  })

  it('leaves Drafts (null) valid — Confirm refuses instead', () => {
    expect(validateProjectType(null, null)).toEqual({ valid: true, message: null })
    expect(validateProjectType('', null)).toEqual({ valid: true, message: null })
  })

  it('rejects values outside the list', () => {
    const r = validateProjectType('doc shoot', null)
    expect(r.valid).toBe(false)
    expect(r.message).toMatch(/from the list/)
  })

  it('requires the description for Other and forbids it elsewhere', () => {
    expect(validateProjectType('Other', null).valid).toBe(false)
    expect(validateProjectType('Other', '  ').valid).toBe(false)
    expect(validateProjectType('Other', 'Live Theatre').valid).toBe(true)
    const stray = validateProjectType('Wedding', 'Beach')
    expect(stray.valid).toBe(false)
    expect(stray.message).toMatch(/only used with Other/)
  })

  it('displays the Other text, the value, or a dash for legacy rows', () => {
    expect(displayProjectType('Other', 'Live Theatre')).toBe('Live Theatre')
    expect(displayProjectType('Other', null)).toBe('Other')
    expect(displayProjectType('Documentary', null)).toBe('Documentary')
    expect(displayProjectType(null, null)).toBe('—')
    expect(displayProjectType('doc shoot', null)).toBe('—')
  })
})
