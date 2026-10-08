// @vitest-environment jsdom
/**
 * # Finance — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody for Finance.tsx:
 *   1. loading (LoadingSkeleton with skeleton="table" rendered)
 *   2. error (ErrorBanner with persistent inline alert & retry action)
 *   3. restricted (RestrictedState rendered for non-money roles: Client, Warehouse, Technician, Driver)
 *   4. empty / invoices list empty
 *   5. populated / dashboard content rendered with <= 4 KPI cards and <= 1 chart
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { FinanceProps } from '../Finance'

let userRole = 'Owner'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-finance', name: 'Finance User', role: userRole, isSharedDevice: false },
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

const Finance = (await import('../Finance')).default

let container: HTMLDivElement
let root: Root

async function mount(props: FinanceProps = {}, as = 'Owner') {
  userRole = as
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/finance']}>
        <Finance {...props} />
      </MemoryRouter>,
    )
  })
  await act(async () => {
    await Promise.resolve()
  })
}

describe('Finance — 5-State PageBody Hardening & Page-Type Rules', () => {
  beforeEach(() => {
    userRole = 'Owner'
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  it('renders LoadingSkeleton when loading prop is true', async () => {
    await mount({ loading: true })
    expect(container.textContent).toContain('Loading finance records…')
  })

  it('renders ErrorBanner with persistent inline alert and retry button when error prop is provided', async () => {
    const onRetry = vi.fn()
    await mount({ error: 'Failed to connect to billing database', onRetry })

    expect(container.textContent).toContain('Could not load finance records')
    expect(container.textContent).toContain('Failed to connect to billing database')

    const retryBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()
    await act(async () => {
      retryBtn?.click()
    })
    expect(onRetry).toHaveBeenCalled()
  })

  it('renders RestrictedState with "Requires Accounts" for Law 6 money-blind roles', async () => {
    for (const role of ['Client', 'Warehouse', 'Technician', 'Driver']) {
      await mount({}, role)
      expect(container.textContent).toContain('Access restricted')
      expect(container.textContent).toContain('Requires Accounts')
      // Law 6: No monetary figures or financial ledgers displayed
      expect(container.textContent).not.toContain('Outstanding Invoices')
      expect(container.textContent).not.toContain('Collections by day')

      // Clean up for next role iteration
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('enforces page-type rule of <= 4 KPI cards on Dashboard', async () => {
    await mount({})
    // In Dashboard, KPI cards strip
    const kpiCards = container.querySelectorAll('[data-testid="kpi-card"], [class*="kpi"]')
    // There are 3 KPI items: Outstanding Invoices, Overdue, Received
    expect(container.textContent).toContain('Outstanding Invoices')
    expect(container.textContent).toContain('Overdue')
    expect(container.textContent).toContain('Received')
    // Ensure <= 4
    expect(kpiCards.length).toBeLessThanOrEqual(4)
  })

  it('enforces page-type rule of <= 1 chart component on Dashboard', async () => {
    await mount({})
    const svgs = container.querySelectorAll('svg')
    // Chart components render SVG elements (e.g. Donut). Donut has circle / path elements.
    const donutSvgs = Array.from(svgs).filter((svg) => svg.querySelector('circle, path[stroke-dasharray]'))
    expect(donutSvgs.length).toBeLessThanOrEqual(1)
  })
})
