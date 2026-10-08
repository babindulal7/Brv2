// @vitest-environment jsdom
/**
 * # Today Operations — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody for Today.tsx:
 *   1. loading (LoadingSkeleton with skeleton="kpi" rendered)
 *   2. error (ErrorBanner with persistent inline alert & retry action)
 *   3. error with surviving rows (renders "Could not refresh today's operations" above data)
 *   4. restricted (RestrictedState rendered for non-staff Client role)
 *   5. role-based money gating (Law 6: Cash due omitted for Warehouse/Technician/Driver/Client)
 *   6. <= 4 KPI cards per screen enforced (no overflow beyond 4 cards)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { TodayProps } from '../Today'
import { canViewMoney } from '../../../lib/rbac'
import type { SystemRole } from '../../../types/database'

let userRole: SystemRole = 'Owner'
let mockPickups: unknown[] = []
let mockReturns: unknown[] = []
let mockAlerts: unknown[] = []
let mockActiveTotal = 5

let isPickupsLoading = false
let pickupsError: string | null = null

const refetchSpy = vi.fn()

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-TODAY', name: 'Today Staff', role: userRole, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => canViewMoney(userRole),
}))

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop',
}))

vi.mock('../../../lib/queries/useList', () => ({
  useList: (_fetcher: unknown, filters: unknown) => {
    // Discriminate based on filters or query characteristics
    const fStr = JSON.stringify(filters ?? '')
    if (fStr.includes('stage') && fStr.includes('Booked')) {
      return {
        rows: mockPickups,
        loading: isPickupsLoading,
        error: pickupsError,
        isEmpty: mockPickups.length === 0 && !isPickupsLoading && !pickupsError,
        isFiltered: false,
        total: mockPickups.length,
        refetch: refetchSpy,
      }
    }
    if (fStr.includes('stage') && (fStr.includes('On Rent') || fStr.includes('Returned'))) {
      return {
        rows: mockReturns,
        loading: false,
        error: null,
        isEmpty: mockReturns.length === 0,
        isFiltered: false,
        total: mockReturns.length,
        refetch: refetchSpy,
      }
    }
    if (fStr.includes('cancelled_at')) {
      return {
        rows: [],
        loading: false,
        error: null,
        isEmpty: false,
        isFiltered: false,
        total: mockActiveTotal,
        refetch: refetchSpy,
      }
    }
    return {
      rows: mockAlerts,
      loading: false,
      error: null,
      isEmpty: mockAlerts.length === 0,
      isFiltered: false,
      total: mockAlerts.length,
      refetch: refetchSpy,
    }
  },
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

const Today = (await import('../Today')).default

function makeMockMovement(bookingNo: string, stage: string) {
  return {
    id: `row-${bookingNo}`,
    bookingNo,
    clientId: 'CL-001',
    client: 'Pashupati Films',
    monogram: 'PF',
    avatarTone: 'primary' as const,
    kind: 'Pickup' as const,
    project: 'Feature Film',
    status: stage,
    time: '10:00 AM',
    dueAd: '2026-08-15',
    itemCount: 8,
    depositRequired: 50000,
    paidAmount: 50000,
    flags: [],
  }
}

let container: HTMLDivElement
let root: Root

async function mount(props: TodayProps = {}, as: SystemRole = 'Owner') {
  userRole = as
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/today']}>
        <Today {...props} />
      </MemoryRouter>,
    )
  })
}

describe('Today — 5-State PageBody Hardening & Page-Type Rules', () => {
  beforeEach(() => {
    userRole = 'Owner'
    mockPickups = [makeMockMovement('BK-2026-001', 'Booked')]
    mockReturns = [makeMockMovement('BK-2026-002', 'On Rent')]
    mockAlerts = []
    mockActiveTotal = 5
    isPickupsLoading = false
    pickupsError = null
    refetchSpy.mockClear()
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
    expect(container.textContent).toContain("Loading today's operations…")
  })

  it('renders ErrorBanner with inline retry button when error is present and no rows exist', async () => {
    mockPickups = []
    mockReturns = []
    mockAlerts = []
    const onRetry = vi.fn()
    await mount({ error: 'Backend unreachable', onRetry })

    const banner = container.querySelector('[role="alert"]')
    expect(banner).not.toBeNull()
    expect(container.textContent).toContain("Could not load today's operations")
    expect(container.textContent).toContain('Backend unreachable')

    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()
    await act(async () => {
      retryBtn?.click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders "Could not refresh today\'s operations" banner above surviving rows on refetch error', async () => {
    mockPickups = [makeMockMovement('BK-2026-001', 'Booked')]
    await mount({ error: 'PostgREST timeout' })

    const banner = container.querySelector('[role="alert"]')
    expect(banner).not.toBeNull()
    expect(container.textContent).toContain("Could not refresh today's operations")
    expect(container.textContent).toContain('PostgREST timeout')
    // Surviving content is preserved
    expect(container.textContent).toContain('Outgoing today')
  })

  it('renders RestrictedState with "Requires Staff" for Client role', async () => {
    await mount({}, 'Client')
    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Requires Staff')
    expect(container.textContent).toContain('Today\'s operations dashboard is for Babin Rentals staff only')
  })

  it('enforces <= 4 KPI cards per screen and Law 6 money blindness', async () => {
    // 1. Staff with money visibility (Owner)
    await mount({}, 'Owner')
    const kpiCardsOwner = container.querySelectorAll('.kpi-card, [data-kpi]')
    expect(kpiCardsOwner.length).toBeLessThanOrEqual(4)
    // If rendered as KpiStrip, count the KPI label blocks
    expect(container.textContent).toContain('Outgoing today')
    expect(container.textContent).toContain('Incoming today')
    expect(container.textContent).toContain('Overdue')
    expect(container.textContent).toContain('Cash due')
    // Active Rentals should not be in the 4-card strip when Cash due is shown
    expect(container.textContent).not.toContain('Active Rentals')

    // Clean up
    act(() => {
      root.unmount()
    })

    // 2. Staff without money visibility (Warehouse) — Law 6
    await mount({}, 'Warehouse')
    expect(container.textContent).toContain('Outgoing today')
    expect(container.textContent).toContain('Incoming today')
    expect(container.textContent).toContain('Overdue')
    // Cash due must be strictly OMITTED per Law 6
    expect(container.textContent).not.toContain('Cash due')
    // Active Rentals replaces Cash due to keep 4 cards
    expect(container.textContent).toContain('Active Rentals')
  })

  it('renders Today operational workspace for staff roles', async () => {
    await mount({}, 'Coordinator')
    expect(container.textContent).toContain('Today')
    expect(container.textContent).toContain('Today\'s jobs. Every other day lives in Operation.')
    expect(container.textContent).toContain('New Rental')
  })
})
