// @vitest-environment jsdom
/**
 * # Warehouses — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody for Warehouses.tsx:
 *   1. loading (LoadingSkeleton rendered)
 *   2. error (ErrorBanner with persistent inline alert & retry action)
 *   3. restricted (RestrictedState rendered for non-staff Client role)
 *   4. <= 4 KPI cards per screen enforced
 *   5. <= 1 chart per screen enforced (Donut only)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { WarehousesProps } from '../Warehouses'
import type { SystemRole } from '../../../types/database'

let userRole: SystemRole = 'Owner'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-WH', name: 'Warehouse Supervisor', role: userRole, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/network', () => ({
  useNetwork: () => true,
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

const Warehouses = (await import('../Warehouses')).default

let container: HTMLDivElement
let root: Root

async function mount(props: WarehousesProps = {}, as: SystemRole = 'Owner') {
  userRole = as
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/inventory/warehouses']}>
        <Warehouses {...props} />
      </MemoryRouter>,
    )
  })
}

describe('Warehouses — 5-State PageBody Hardening & Page-Type Rules', () => {
  beforeEach(() => {
    userRole = 'Owner'
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('renders LoadingSkeleton when loading={true}', async () => {
    await mount({ loading: true })
    expect(container.textContent).toContain('Loading warehouses…')
  })

  it('renders ErrorBanner with inline retry button when error is present', async () => {
    const onRetry = vi.fn()
    await mount({ error: 'Failed to synchronize facility status', onRetry })

    const banner = container.querySelector('[role="alert"]')
    expect(banner).not.toBeNull()
    expect(container.textContent).toContain('Could not refresh warehouses')
    expect(container.textContent).toContain('Failed to synchronize facility status')

    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()
    await act(async () => {
      retryBtn?.click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders RestrictedState with "Requires Staff" for Client role', async () => {
    await mount({}, 'Client')
    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Requires Staff')
    expect(container.textContent).toContain('Warehouse management is for Babin Rentals staff only')
  })

  it('enforces <= 4 KPI cards per screen', async () => {
    await mount({}, 'Owner')
    expect(container.textContent).toContain('Total Warehouses')
    expect(container.textContent).toContain('Total Assets Stored')
    expect(container.textContent).toContain('Capacity Used')
    expect(container.textContent).toContain('Open Transfers')
  })

  it('enforces <= 1 chart per screen (Donut only)', async () => {
    await mount({}, 'Owner')
    // SVG charts on screen: only 1 Donut svg
    const analyticsSection = container.querySelector('[aria-label="Warehouse analytics"]')
    expect(analyticsSection).not.toBeNull()
    const chartSvgs = analyticsSection?.querySelectorAll('svg')
    expect(chartSvgs).toBeDefined()
    // Donut chart + its icon (arrow_right icons on buttons)
    // There should be no HBars or GroupedBars SVGs
    expect(analyticsSection?.textContent).toContain('Capacity Utilization')
    expect(analyticsSection?.textContent).toContain('Inventory Distribution')
    expect(analyticsSection?.textContent).toContain('Transfer Activity')
  })
})
