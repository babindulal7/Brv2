import { describe, expect, it } from 'vitest'
import { validateDiscount } from '../discount'

/**
 * Law 10 as amended — THE GATE IS GONE. D3 ruled 30 Aug 2026; Babin's final
 * word 31 Aug: "don't put any gate on discount." This suite pins the ungated
 * law: nothing requires a reason, an approver, or approval of any kind, and
 * the only refusals left are arithmetic validity. If a future session
 * re-introduces a ceremony without a new ruling, these tests fail first.
 */

describe('validateDiscount — ungated (31 Aug 2026)', () => {
  it('allows any percentage from 0 to 100 with no reason and no approver', () => {
    for (const pct of [0, 5, 10, 11, 15, 25, 26, 40, 75, 100]) {
      const out = validateDiscount(pct)
      expect(out.valid).toBe(true)
      expect(out.requiresApproval).toBe(false)
      expect(out.error).toBeNull()
    }
  })

  it('the old ceremony inputs are accepted and ignored — never required', () => {
    expect(validateDiscount(40, null, null).valid).toBe(true)
    expect(validateDiscount(40, 'a reason nobody asked for', 'usr-owner').valid).toBe(true)
  })

  it('still refuses a negative percent — a price rise is not a discount (R3-1 stays closed)', () => {
    const out = validateDiscount(-5)
    expect(out.valid).toBe(false)
    expect(out.requiresApproval).toBe(false)
    expect(out.error).toMatch(/negative/)
  })

  it('still refuses above 100% — that is a negative price, not a discount', () => {
    const out = validateDiscount(101)
    expect(out.valid).toBe(false)
    expect(out.error).toMatch(/negative price/)
  })
})
