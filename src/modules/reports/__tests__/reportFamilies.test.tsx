// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { REPORT_FAMILIES, ReportFamiliesNav } from '../../../components/ui/ReportFamiliesNav'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const state = vi.hoisted(() => ({
  canSeeMoney: true,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => state.canSeeMoney,
}))

describe('ReportFamiliesNav', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    state.canSeeMoney = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount()
      })
      container.remove()
    }
    container = null
    root = null
  })

  it('contains exactly 11 report families in the specification order', () => {
    expect(REPORT_FAMILIES).toHaveLength(11)
    const labels = REPORT_FAMILIES.map((f) => f.label)
    expect(labels).toEqual([
      'Dashboard',
      'Revenue',
      'Rentals',
      'Inventory',
      'Clients',
      'Operations',
      'Finance',
      'Maintenance',
      'Cases',
      'Staff',
      'Custom',
    ])
  })

  it('all 11 report families have valid routes (none are null)', () => {
    for (const family of REPORT_FAMILIES) {
      expect(family.to, `Family "${family.label}" must have a valid route`).not.toBeNull()
      expect(family.to).toMatch(/^\/reports\//)
    }
  })

  it('renders all 11 families as navigation links for privileged role', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ReportFamiliesNav current="Dashboard" />
        </MemoryRouter>,
      )
    })

    const links = Array.from(container?.querySelectorAll('a') ?? [])
    const linkTexts = links.map((l) => l.textContent?.trim())

    for (const family of REPORT_FAMILIES) {
      expect(linkTexts).toContain(family.label)
    }

    const dashboardLink = links.find((l) => l.textContent?.trim() === 'Dashboard')
    expect(dashboardLink?.getAttribute('aria-current')).toBe('page')
  })

  it('highlights the current active report family', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ReportFamiliesNav current="Revenue" />
        </MemoryRouter>,
      )
    })

    const links = Array.from(container?.querySelectorAll('a') ?? [])
    const revenueLink = links.find((l) => l.textContent?.trim() === 'Revenue')
    expect(revenueLink?.getAttribute('aria-current')).toBe('page')

    const dashboardLink = links.find((l) => l.textContent?.trim() === 'Dashboard')
    expect(dashboardLink?.getAttribute('aria-current')).toBeNull()
  })

  it('hides money-gated families (Revenue, Finance) for money-blind roles', async () => {
    state.canSeeMoney = false
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ReportFamiliesNav current="Dashboard" />
        </MemoryRouter>,
      )
    })

    const links = Array.from(container?.querySelectorAll('a') ?? [])
    const linkTexts = links.map((l) => l.textContent?.trim())

    expect(linkTexts).not.toContain('Revenue')
    expect(linkTexts).not.toContain('Finance')
    expect(linkTexts).toContain('Rentals')
    expect(linkTexts).toContain('Inventory')
    expect(linkTexts).toContain('Cases')
  })
})
