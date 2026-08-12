// @vitest-environment jsdom
/**
 * # The two calculators, and the four things they must not do
 *
 * `10_TOOLS.md` §10.2 and §10.3 are small screens carrying disproportionate
 * risk, because both invite exactly the shortcut the laws forbid:
 *
 *  1. **§10.3 must not hardcode VAT.** `PLAN.md` §5 Conventions lists a
 *     hardcoded VAT rate beside a `DELETE` and an `UPDATE` on payments as
 *     things that are simply never done, and `NewRental.tsx:72`'s `VAT_PCT = 13`
 *     is the violation this screen must not copy.
 *  2. **§10.3 must not bypass Law 10.** A sandbox that silently applies 40%
 *     teaches the number, and §5's own warning is that someone will quote from
 *     it. No role bypasses it, Owner included.
 *  3. **§10.3 must not fold the deposit into the total.** Law 5 — a deposit is
 *     a liability, never in Rental Total, never a payment.
 *  4. **§10.2 must not seed an asset life.** There is no Settings default to
 *     read, and inventing one would look like the accountant's answer rather
 *     than like a guess. Same for the IRD pool rates.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'
import { writeSettings, resetSettings } from '../../../lib/settingsStore'
import { DISCOUNT_CAP } from '../../../lib/money'
import { IRD_POOL_BLOCKED_REASON } from '../../../data/tools'

let viewport: Viewport = 'desktop'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: PricingCalculator } = await import('../PricingCalculator')
const { default: DepreciationCalculator } = await import('../DepreciationCalculator')

let container: HTMLDivElement
let root: Root

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter>{node}</MemoryRouter>)
  })
}

/** React tracks the last value it set; a bare `.value =` is ignored on rerender. */
async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(el, value)
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function byLabel(label: string): HTMLInputElement {
  const el = container.querySelector(`input[aria-label="${label}"]`)
  if (!el) throw new Error(`no input labelled "${label}"`)
  return el as HTMLInputElement
}

function fieldNamed(label: string): HTMLInputElement {
  const spans = [...container.querySelectorAll('label')]
  const match = spans.find((l) => (l.textContent ?? '').toLowerCase().startsWith(label.toLowerCase()))
  const input = match?.querySelector('input')
  if (!input) throw new Error(`no field named "${label}"`)
  return input as HTMLInputElement
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === text) as
    | HTMLButtonElement
    | undefined
}

beforeEach(() => {
  viewport = 'desktop'
  resetSettings()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  resetSettings()
})

describe('Pricing — the VAT rate comes from Settings, never from a literal', () => {
  it('labels the toggle and the ladder with the configured rate', async () => {
    writeSettings({ vatRatePercent: 15 })
    await mount(<PricingCalculator />)
    expect(container.textContent).toContain('VAT 15%')
    /* If 13 is ever written into this component, this fails while the rate is
       set to anything else. */
    expect(container.textContent).not.toContain('VAT 13%')
  })

  it('computes VAT at the configured rate through lib/money.ts price()', async () => {
    writeSettings({ vatRatePercent: 10 })
    await mount(<PricingCalculator />)
    await type(fieldNamed('Rate / day'), '1000')
    /* qty 1 × days 1 × Rs 1,000 → VAT 10% = Rs 100, total Rs 1,100. */
    expect(container.textContent).toContain('Rs 1,100')
  })
})

describe('Pricing — Law 10 has no sandbox exemption', () => {
  it('offers no chip above the 25% hard cap', async () => {
    await mount(<PricingCalculator />)
    const chips = [...container.querySelectorAll('button')]
      .map((b) => (b.textContent ?? '').trim())
      .filter((t) => /^\d+%$/.test(t))
      .map((t) => Number(t.replace('%', '')))
    expect(chips.length).toBeGreaterThan(0)
    expect(Math.max(...chips)).toBeLessThanOrEqual(DISCOUNT_CAP)
  })

  it('refuses to apply a discount above 10% until a reason and an approver exist', async () => {
    await mount(<PricingCalculator />)
    await type(fieldNamed('Rate / day'), '10000')
    await type(byLabel('Custom discount percent'), '20')

    /* The gate speaks inline and persistently — Law 12, never a toast. */
    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toMatch(/reason of at least 10 characters/i)

    /* And the ladder shows the undiscounted figures rather than a total the
       gate refused. */
    expect(container.textContent).toContain('− Rs 0')
  })

  it('applies it once both fields are supplied', async () => {
    await mount(<PricingCalculator />)
    await type(fieldNamed('Rate / day'), '10000')
    await type(byLabel('Custom discount percent'), '20')
    await type(fieldNamed('Reason'), 'Long-standing client, agreed with Babin')
    await type(fieldNamed('Approver'), 'Sushant Shrestha')

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toContain('Discount 20%')
    expect(container.textContent).toContain('− Rs 2,000')
  })

  it('refuses anything above the cap outright, however well justified', async () => {
    await mount(<PricingCalculator />)
    await type(fieldNamed('Rate / day'), '10000')
    await type(byLabel('Custom discount percent'), '40')
    await type(fieldNamed('Reason'), 'Long-standing client, agreed with Babin')
    await type(fieldNamed('Approver'), 'Sushant Shrestha')

    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/25% hard cap/i)
    expect(container.textContent).toContain('− Rs 0')
  })
})

describe('Pricing — Law 5 and the sandbox promise', () => {
  it('keeps the deposit out of the total and says so', async () => {
    writeSettings({ vatRatePercent: 0 })
    await mount(<PricingCalculator />)
    await type(fieldNamed('Rate / day'), '5000')
    await type(fieldNamed('Security deposit'), '20000')

    expect(container.textContent).toContain('Rs 5,000')
    expect(container.textContent).toMatch(/not part of the total/i)
    /* The deposit is never folded in: 5,000 + 20,000 must not appear. */
    expect(container.textContent).not.toContain('Rs 25,000')
  })

  it('shows an unentered advance as "Not entered", never as zero', async () => {
    await mount(<PricingCalculator />)
    expect(container.textContent).toContain('Not entered')
  })

  it('books nothing — "Use in a booking" is not a live control', async () => {
    await mount(<PricingCalculator />)
    expect(buttonWithText('Use in a booking')).toBeUndefined()
    const gated = [...container.querySelectorAll('[aria-disabled]')].map((n) => n.getAttribute('aria-label') ?? '')
    expect(gated.some((r) => r.toLowerCase().includes('books nothing'))).toBe(true)
  })
})

describe('Depreciation — no default life, and no invented IRD rate', () => {
  it('draws no schedule until life and salvage are supplied, and says which is missing', async () => {
    await mount(<DepreciationCalculator />)
    await type(fieldNamed('Purchase price'), '100000')

    expect(container.textContent).toContain('No schedule yet')
    expect(container.textContent).toMatch(/there is no default to fall back on/i)
    expect(container.textContent).toMatch(/Zero is a valid answer; it is not the assumed one/i)
  })

  it('states that the Settings default does not exist rather than offering one', async () => {
    await mount(<DepreciationCalculator />)
    const reasons = [...container.querySelectorAll('[aria-disabled]')].map((n) => n.getAttribute('aria-label') ?? '')
    expect(reasons.some((r) => r.includes('TODO(decision)'))).toBe(true)
    expect(container.textContent).toContain('No default from Settings')
    /* The life field starts empty. A prefilled 5 would read as the accountant's
       answer, not as a placeholder. */
    expect(byLabel('Useful life in years').value).toBe('')
  })

  it('computes the schedule once both are supplied, ending on the salvage value', async () => {
    await mount(<DepreciationCalculator />)
    await type(fieldNamed('Purchase price'), '100000')
    await type(byLabel('Useful life in years'), '4')
    await type(fieldNamed('Salvage value'), '20000')

    expect(container.textContent).not.toContain('No schedule yet')
    expect(container.textContent).toContain('Rs 20,000')
    expect(container.textContent).toContain('Year')
  })

  it('renders the IRD pool tab as blocked, with no rate anywhere in it', async () => {
    await mount(<DepreciationCalculator />)
    const tab = [...container.querySelectorAll('button[role="tab"]')].find((b) =>
      (b.textContent ?? '').includes('IRD'),
    )
    expect(tab).toBeDefined()
    await click(tab!)

    const text = container.textContent ?? ''
    expect(text).toContain('IRD pool view is blocked on a decision')
    expect(text).toContain(IRD_POOL_BLOCKED_REASON)
    /* No percentage may appear on this tab — one would be an invented tax
       position. The tab renders alone, so the assertion is safe. */
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%/)
  })
})
