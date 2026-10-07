// @vitest-environment jsdom
/**
 * # Report Reachability & Law 6 Money Gating Suite
 *
 * Verifies that previously orphaned/dead-link reports:
 * 1. CasesReports is reachable, renders case figures, and strictly gates money
 *    (Total Assessed KPI, Assessed & Outstanding table columns) from money-blind roles (Law 6).
 * 2. ProductReports is reachable and gates product revenue/profit metrics from money-blind roles.
 * 3. Pulse.tsx TAB_FAMILIES provides valid routes for Staff, Maintenance, Revenue, Operations, and Cases,
 *    correctly gating money families away from money-blind sessions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

const auth = vi.hoisted(() => ({ role: 'Owner' as string }))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: auth.role, isSharedDevice: false } }),
}))

const { default: CasesReports } = await import('../CasesReports')
const { default: ProductReports } = await import('../ProductReports')
const { default: Pulse } = await import('../Pulse')

let container: HTMLDivElement
let root: Root

async function mountComponent(component: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter>{component}</MemoryRouter>)
  })
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
  }
  if (container) {
    container.remove()
  }
  auth.role = 'Owner'
})

describe('CasesReports Reachability & Law 6 Gating', () => {
  it('renders all KPIs and financial columns for money-capable roles', async () => {
    auth.role = 'Owner'
    await mountComponent(<CasesReports />)

    expect(container.textContent).toContain('Cases Reports')
    expect(container.textContent).toContain('Total Cases')
    expect(container.textContent).toContain('Resolved / Closed')
    expect(container.textContent).toContain('Open')
    expect(container.textContent).toContain('Total Assessed')

    // Table headers include money columns
    const ths = Array.from(container.querySelectorAll('th')).map((th) => th.textContent?.trim())
    expect(ths).toContain('Assessed')
    expect(ths).toContain('Outstanding')
  })

  it('hides Total Assessed KPI and financial columns for money-blind Warehouse role (Law 6)', async () => {
    auth.role = 'Warehouse'
    await mountComponent(<CasesReports />)

    expect(container.textContent).toContain('Cases Reports')
    expect(container.textContent).toContain('Total Cases')
    expect(container.textContent).toContain('Resolved / Closed')
    expect(container.textContent).toContain('Open')

    // Law 6: Total Assessed KPI must NOT be visible
    expect(container.textContent).not.toContain('Total Assessed')

    // Table headers must NOT include money columns
    const ths = Array.from(container.querySelectorAll('th')).map((th) => th.textContent?.trim())
    expect(ths).not.toContain('Assessed')
    expect(ths).not.toContain('Outstanding')

    // Non-money columns remain intact
    expect(ths).toContain('Case ID')
    expect(ths).toContain('Type')
    expect(ths).toContain('Title')
    expect(ths).toContain('Status')
  })
})

describe('ProductReports Reachability & Law 6 Gating', () => {
  it('renders revenue and gross profit metrics for Owner', async () => {
    auth.role = 'Owner'
    await mountComponent(<ProductReports />)

    expect(container.textContent).toContain('Product Performance')
    expect(container.textContent).toContain('Product Sales Trend')
    expect(container.textContent).toContain('Gross Profit Trend')

    const ths = Array.from(container.querySelectorAll('th')).map((th) => th.textContent?.trim())
    expect(ths).toContain('Revenue (Rs)')
    expect(ths).toContain('Cost (Rs)')
    expect(ths).toContain('Profit (Rs)')
    expect(ths).toContain('Margin %')
  })

  it('omits sales trend, gross profit and money columns for Warehouse (Law 6)', async () => {
    auth.role = 'Warehouse'
    await mountComponent(<ProductReports />)

    expect(container.textContent).toContain('Product Performance')
    expect(container.textContent).not.toContain('Product Sales Trend')
    expect(container.textContent).not.toContain('Gross Profit Trend')

    const ths = Array.from(container.querySelectorAll('th')).map((th) => th.textContent?.trim())
    expect(ths).not.toContain('Revenue (Rs)')
    expect(ths).not.toContain('Cost (Rs)')
    expect(ths).not.toContain('Profit (Rs)')
    expect(ths).not.toContain('Margin %')

    // Product operational columns remain visible
    expect(ths).toContain('Product')
    expect(ths).toContain('SKU')
    expect(ths).toContain('Category')
    expect(ths).toContain('Stock')
  })
})

describe('Pulse Navigation Links Reachability', () => {
  it('provides real destination links for Staff, Maintenance, Cases, Revenue, and Operations', async () => {
    auth.role = 'Owner'
    await mountComponent(<Pulse />)

    const navLinks = Array.from(container.querySelectorAll('a[href^="/reports/"]'))
    const hrefs = navLinks.map((a) => a.getAttribute('href'))

    expect(hrefs).toContain('/reports/staff')
    expect(hrefs).toContain('/reports/equipment-performance')
    expect(hrefs).toContain('/reports/cases')
    expect(hrefs).toContain('/reports/expenses')
    expect(hrefs).toContain('/reports/working-capital')
    expect(hrefs).toContain('/reports/inventory')
    expect(hrefs).toContain('/reports/clients')
    expect(hrefs).toContain('/reports/cash-flow')
  })

  it('gates Revenue and Operations away from money-blind Warehouse role (Law 6)', async () => {
    auth.role = 'Warehouse'
    await mountComponent(<Pulse />)

    const navLinks = Array.from(container.querySelectorAll('a[href^="/reports/"]'))
    const hrefs = navLinks.map((a) => a.getAttribute('href'))

    // Money-blind sessions do not receive links to money surfaces
    expect(hrefs).not.toContain('/reports/expenses')
    expect(hrefs).not.toContain('/reports/working-capital')
    expect(hrefs).not.toContain('/reports/clients')
    expect(hrefs).not.toContain('/reports/cash-flow')

    // Operational non-money reports remain accessible
    expect(hrefs).toContain('/reports/staff')
    expect(hrefs).toContain('/reports/equipment-performance')
    expect(hrefs).toContain('/reports/cases')
    expect(hrefs).toContain('/reports/inventory')

    // Gated explanation notes
    expect(container.textContent).toMatch(/Not in your role[’']s view:/)
  })
})
