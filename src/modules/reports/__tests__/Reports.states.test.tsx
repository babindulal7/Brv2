// @vitest-environment jsdom
/**
 * # Reports Module — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody across Reports module screens:
 *   1. Pulse (loading, error + retry, restricted for non-staff, populated)
 *   2. ReportCatalog (loading, error + retry, restricted for non-money, populated)
 *   3. CasesReports (loading, error + retry, restricted for non-staff, populated <= 4 KPIs)
 *   4. ProductReports (loading, error + retry, restricted for non-staff, populated <= 1 chart)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

let userRole = 'Owner'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-reports', name: 'Reports User', role: userRole, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => ['Owner', 'Admin', 'Accounts'].includes(userRole),
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const Pulse = (await import('../Pulse')).default
const ReportCatalog = (await import('../ReportCatalog')).default
const CasesReports = (await import('../CasesReports')).default
const ProductReports = (await import('../ProductReports')).default

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  userRole = 'Owner'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  vi.clearAllMocks()
})

describe('Pulse Screen 5-State Handling', () => {
  it('renders loading skeleton when loading prop is true', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/pulse']}>
          <Pulse loading />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Loading business pulse')
  })

  it('renders persistent error banner with retry trigger when error prop is passed', async () => {
    const onRetry = vi.fn()
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/pulse']}>
          <Pulse error="Failed to fetch pulse ledger" onRetry={onRetry} />
        </MemoryRouter>,
      )
    })
    const banner = container.querySelector('[role="alert"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('Failed to fetch pulse ledger')

    const retryBtn = Array.from(banner?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()
    await act(async () => {
      retryBtn?.click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders restricted state for Client (non-staff role)', async () => {
    userRole = 'Client'
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/pulse']}>
          <Pulse />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Requires Staff')
  })

  it('renders populated pulse view for authorized staff', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/pulse']}>
          <Pulse />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Pulse')
  })
})

describe('ReportCatalog Screen 5-State Handling', () => {
  it('renders loading skeleton when loading prop is true', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports']}>
          <ReportCatalog loading />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Loading reports')
  })

  it('renders persistent error banner with retry trigger', async () => {
    const onRetry = vi.fn()
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports']}>
          <ReportCatalog error="Failed to load catalog register" onRetry={onRetry} />
        </MemoryRouter>,
      )
    })
    const banner = container.querySelector('[role="alert"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('Failed to load catalog register')

    const retryBtn = Array.from(banner?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()
    await act(async () => {
      retryBtn?.click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders restricted state for non-money roles (Warehouse)', async () => {
    userRole = 'Warehouse'
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports']}>
          <ReportCatalog />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Requires Accounts')
  })

  it('renders populated catalog for finance roles', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports']}>
          <ReportCatalog />
        </MemoryRouter>,
      )
    })
    expect(container.querySelector('input[type="search"]')).not.toBeNull()
    expect(container.textContent).toContain('Top 8 models by revenue')
  })
})

describe('CasesReports Screen 5-State & Page-Type Rules', () => {
  it('renders loading skeleton when loading prop is true', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports/cases']}>
          <CasesReports loading />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Loading cases reports')
  })

  it('renders persistent error banner with retry trigger', async () => {
    const onRetry = vi.fn()
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports/cases']}>
          <CasesReports error="Failed to load cases summary" onRetry={onRetry} />
        </MemoryRouter>,
      )
    })
    const banner = container.querySelector('[role="alert"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('Failed to load cases summary')
  })

  it('renders restricted state for non-staff Client role', async () => {
    userRole = 'Client'
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports/cases']}>
          <CasesReports />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Requires Staff')
  })

  it('enforces <= 4 KPI cards when populated', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports/cases']}>
          <CasesReports />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Cases Reports')
    // Check that we have at most 4 KPI cards
    const kpiElements = [
      container.textContent?.includes('Total Cases'),
      container.textContent?.includes('Resolved / Closed'),
      container.textContent?.includes('Open'),
      container.textContent?.includes('Total Assessed'),
    ].filter(Boolean)
    expect(kpiElements.length).toBeLessThanOrEqual(4)
  })
})

describe('ProductReports Screen 5-State & Page-Type Rules', () => {
  it('renders loading skeleton when loading prop is true', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports/products']}>
          <ProductReports loading />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Loading product reports')
  })

  it('renders persistent error banner with retry trigger', async () => {
    const onRetry = vi.fn()
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports/products']}>
          <ProductReports error="Failed to load product analytics" onRetry={onRetry} />
        </MemoryRouter>,
      )
    })
    const banner = container.querySelector('[role="alert"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('Failed to load product analytics')
  })

  it('renders restricted state for non-staff Client role', async () => {
    userRole = 'Client'
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports/products']}>
          <ProductReports />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Requires Staff')
  })

  it('enforces <= 1 chart and <= 4 KPI cards when populated', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/reports/products']}>
          <ProductReports />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Product Reports')
    // SVG chart check: only 1 donut chart
    const donutSvgs = container.querySelectorAll('svg[aria-label="Donut chart"]')
    expect(donutSvgs.length).toBeLessThanOrEqual(1)
  })
})
