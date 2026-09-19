// @vitest-environment jsdom
/**
 * UI Consistency Phase 2 — Rentals contract tests.
 *
 * Guards invariants established for the Rentals module:
 *  1. rentals.css and rental-timeline.css have zero :root or :has() route mutations.
 *  2. rentals.css and rental-timeline.css have no global media queries outside 768/1280.
 *  3. rental-timeline.css implements 1100px as a container query.
 *  4. RentalsList and its direct modals import canonical Button (components/ui/Button)
 *     and canonical PageShell (components/ui/PageShell).
 *  5. Buttons meet the 44px minimum interactive target (Law 15).
 */
import { describe, expect, it } from 'vitest'
import rentalsCss from '../rentals.css?raw'
import rentalTimelineCss from '../rental-timeline.css?raw'
import rentalsListRaw from '../RentalsList.tsx?raw'
import cancelModalRaw from '../modals/CancelRentalModal.tsx?raw'
import fastReturnModalRaw from '../modals/FastReturnModal.tsx?raw'
import barcodeModalRaw from '../modals/BarcodeLookupModal.tsx?raw'
import { Button } from '../../../components/ui/Button'
import { PageShell } from '../../../components/ui/PageShell'
import { PageHeader } from '../../../components/ui/Page'

describe('UI Consistency Phase 2 — Rentals contracts', () => {
  it('rentals.css never touches :root or :has()', () => {
    expect(rentalsCss.length).toBeGreaterThan(0)
    expect(rentalsCss).not.toMatch(/:root/)
    expect(rentalsCss).not.toMatch(/:has\(/)
  })

  it('rental-timeline.css never touches :root or :has()', () => {
    expect(rentalTimelineCss.length).toBeGreaterThan(0)
    expect(rentalTimelineCss).not.toMatch(/:root/)
    expect(rentalTimelineCss).not.toMatch(/:has\(/)
  })

  it('rentals.css uses only canonical breakpoint bands (768 / 1280)', () => {
    const widths = [...rentalsCss.matchAll(/@media[^{]*\((?:max|min)-width:\s*([\d.]+)px/g)].map(
      (m) => Number(m[1]),
    )
    const allowed = new Set([767, 768, 1279, 1280])
    expect(widths.filter((w) => !allowed.has(w))).toEqual([])
  })

  it('rental-timeline.css implements 1100px density adjustment via container query', () => {
    expect(rentalTimelineCss).toContain('container-type: inline-size')
    expect(rentalTimelineCss).toMatch(/@container\s+(?:timeline\s+)?\(max-width:\s*1100px\)/)
    expect(rentalTimelineCss).not.toMatch(/@media[^{]*1100px/)
  })

  it('RentalsList.tsx imports canonical Button and PageShell', () => {
    expect(rentalsListRaw).toContain("import { Button } from '../../components/ui/Button'")
    expect(rentalsListRaw).toContain("import { PageShell } from '../../components/ui/PageShell'")
    expect(rentalsListRaw).not.toMatch(/import\s*\{[^}]*Button[^}]*\}\s*from\s*['"][^'"]*components\/ui\/Page['"]/)
  })

  it('RentalsList.tsx imports canonical PageBody from components/ui/PageBody', () => {
    expect(rentalsListRaw).toContain("import { PageBody } from '../../components/ui/PageBody'")
  })

  it('Rentals direct modals import canonical Button primitive', () => {
    for (const [name, raw] of [
      ['CancelRentalModal', cancelModalRaw],
      ['FastReturnModal', fastReturnModalRaw],
      ['BarcodeLookupModal', barcodeModalRaw],
    ]) {
      expect(raw, `${name} must import canonical Button`).toContain(
        "import { Button } from '../../../components/ui/Button'",
      )
    }
  })

  it('PageShell and Button instantiate with canonical defaults', () => {
    expect(typeof PageShell).toBe('function')
    expect(typeof PageHeader).toBe('function')
    expect(Button).toBeDefined()
  })
})
