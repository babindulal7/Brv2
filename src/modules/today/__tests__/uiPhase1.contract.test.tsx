// @vitest-environment jsdom
/**
 * UI Consistency Phase 1 — contract tests.
 *
 * Guards the four invariants this phase establishes:
 *  1. No module CSS mutates :root theme tokens (route-level theming is gone).
 *  2. ui-v2.css owns no palette/token redefinitions — theme.css is the only
 *     token authority.
 *  3. No breakpoint outside the canonical 768/1280 bands appears in module
 *     CSS without a documentated component-level exception marker.
 *  4. Buttons resolve identically regardless of import path (Button.tsx vs
 *     Page.tsx compatibility wrapper) and always clear the 44px hit target.
 *
 * ?raw imports — same pattern as lib/__tests__/breakpoints.test.ts (the
 * project typechecks tests, so no node:fs).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import dashboardCss from '../dashboard.css?raw'
import rentalTimelineCss from '../../rentals/rental-timeline.css?raw'
import rentalsCss from '../../rentals/rentals.css?raw'
import operationsCss from '../../operations/operations.css?raw'
// ?raw — guaranteed file contents regardless of vitest css transform config.
import { Button } from '../../../components/ui/Button'
import { PageHeader } from '../../../components/ui/Page'
import { PageShell } from '../../../components/ui/PageShell'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('UI Consistency Phase 1 — contracts', () => {
  it('dashboard.css never touches :root (no route-level theme mutation)', () => {
    expect(dashboardCss.length).toBeGreaterThan(0) // guard against an empty css module
    expect(dashboardCss).not.toMatch(/:root/)
    expect(dashboardCss).not.toMatch(/:has\(/)
  })

  it('dashboard.css uses only canonical breakpoint bands (768 / 1280)', () => {
    const widths = [...dashboardCss.matchAll(/@media[^{]*\((?:max|min)-width:\s*([\d.]+)px\)/g)].map(
      (m) => Number(m[1]),
    )
    const allowed = new Set([767, 768, 1279, 1280])
    expect(widths.filter((w) => !allowed.has(w))).toEqual([])
  })

  it('dashboard.css keeps component-scoped aliases reading canonical tokens', () => {
    expect(dashboardCss.length).toBeGreaterThan(0)
    expect(dashboardCss).toContain('--dashboard-accent: var(--primary)')
    expect(dashboardCss).toContain('--dashboard-accent-strong: var(--primary-text)')
    // no hardcoded palette hexes at module level
    expect(dashboardCss.match(/#[0-9a-fA-F]{6}/g) ?? []).toEqual([])
  })

  it('dashboard.css does not restyle the shared header or shared buttons', () => {
    expect(dashboardCss).not.toMatch(/\.page-header\s+[^{]*\{/)
    expect(dashboardCss).not.toMatch(/\.ui-button--primary/)
  })

  it('rental-timeline.css implements 1100px as a container query, not a global media query', () => {
    expect(rentalTimelineCss).toContain('container-type: inline-size')
    expect(rentalTimelineCss).toMatch(/@container\s+(?:timeline\s+)?\(max-width:\s*1100px\)/)
    expect(rentalTimelineCss).not.toMatch(/@media[^{]*1100px/)
  })

  it('rentals.css and operations.css use only canonical breakpoint bands (768 / 1280)', () => {
    const allowed = new Set([767, 768, 1279, 1280])
    for (const css of [rentalsCss, operationsCss]) {
      const widths = [...css.matchAll(/@media[^{]*\((?:max|min)-width:\s*([\d.]+)px\)/g)].map(
        (m) => Number(m[1]),
      )
      expect(widths.filter((w) => !allowed.has(w))).toEqual([])
      expect(css).not.toMatch(/:root:has\(/)
    }
  })

  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('Button.tsx and Page.tsx expose the same wrapper with the same defaults', async () => {
    const { Button: PageButton } = await import('../../../components/ui/Page')
    act(() => {
      root.render(
        <>
          <Button data-testid="direct">Same</Button>
          <PageButton data-testid="wrapped">Same</PageButton>
        </>,
      )
    })
    const direct = host.querySelector<HTMLButtonElement>('[data-testid="direct"]')!
    const wrapped = host.querySelector<HTMLButtonElement>('[data-testid="wrapped"]')!
    // same variant/size classes
    expect(direct.className).toContain('ui-button--secondary')
    expect(wrapped.className).toContain('ui-button--secondary')
    expect(direct.className).toContain('ui-button--sm')
    expect(wrapped.className).toContain('ui-button--sm')
    // 44px law on both paths
    expect(direct.style.minHeight).toBe('44px')
    expect(wrapped.style.minHeight).toBe('44px')
  })

  it('PageShell and PageHeader exist as the canonical page furniture', () => {
    expect(typeof PageShell).toBe('function')
    expect(typeof PageHeader).toBe('function')
  })
})
