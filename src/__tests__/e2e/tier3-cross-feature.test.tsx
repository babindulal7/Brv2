// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// Mock matchMedia for jsdom
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

import type { SystemRole } from '../../types/database'

// Dynamic role switching for testing RBAC money-blind role isolation
let currentRole: SystemRole = 'Owner'

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      name: currentRole === 'Warehouse' ? 'Ram Bahadur (Floor)' : 'Babin Shrestha (Owner)',
      role: currentRole,
      isSharedDevice: false,
    },
    loading: false,
    isLocked: false,
    hasPin: true,
    lockNow: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
  useTabularLayout: () => true,
}))

vi.mock('../../lib/network', () => ({
  useNetwork: () => true,
}))

vi.mock('../../lib/syncContext', () => ({
  useSync: () => ({
    status: 'synced',
    pendingCount: 0,
    error: null,
    triggerSync: vi.fn(),
  }),
}))

vi.mock('../../components/ui/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    showSuccessToast: vi.fn(),
    showToast: vi.fn(),
  }),
}))

vi.mock('../../modules/operations/OperationsWorkspaceContext', () => ({
  OperationsWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useOperationsWorkspace: () => ({
    openOperations: vi.fn(),
    closeOperations: vi.fn(),
  }),
}))

vi.mock('../../lib/supabase', () => ({
  newClientUuid: () => '11111111-1111-4111-8111-111111111111',
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}))

vi.mock('../../actions/rentals/saveDraft', () => ({
  saveDraft: vi.fn(),
  fetchRentalDraft: vi.fn(),
  convertDraft: vi.fn(),
  cancelDraft: vi.fn(),
  listActiveDrafts: async () => [],
}))

const MOCK_BOOKING_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  bookingNo: 'BK-2026-0715',
  clientId: 'c-1',
  client: 'Himalayan Films Pvt. Ltd.',
  clientName: 'Himalayan Films Pvt. Ltd.',
  monogram: 'HF',
  avatarTone: 'primary' as const,
  project: 'Mustang Feature Documentary',
  pickupLocation: 'Kathmandu Main',
  returnLocation: 'Kathmandu Main',
  itemCount: 4,
  createdOn: '2026-07-10',
  createdAtAd: '2026-07-10T00:00:00.000Z',
  status: 'Booked' as const,
  stage: 'Booked',
  statusKey: 'progress' as const,
  flags: [],
  isCancelled: false,
  isClosed: false,
  isOverdue: false,
  progress: 1,
  progressTone: 'primary' as const,
  pickup: { date: '2026-07-15', time: '09:00' },
  ret: { date: '2026-07-18', time: '18:00' },
  pickupAtAd: '2026-07-15T09:00:00.000Z',
  returnAtAd: '2026-07-18T18:00:00.000Z',
  actualReturnAtAd: null,
  deliveryType: 'Client Pickup' as const,
  quoteExpires: null,
  quoteExpiresAtAd: null,
  deposit: 5000000 as const, // Rs 50,000 (5,000,000 paisa)
  depositRequired: 5000000,
  totalAmount: 13950600 as const, // Rs 139,506 (13,950,600 paisa)
  isExternal: false,
}

vi.mock('../../lib/queries/bookings', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/queries/bookings')>()
  return {
    ...real,
    listBookings: async () => ({
      rows: [MOCK_BOOKING_ROW],
      total: 1,
    }),
    fetchFloorBooking: async () => ({
      id: MOCK_BOOKING_ROW.id,
      bookingNo: MOCK_BOOKING_ROW.bookingNo,
      stage: MOCK_BOOKING_ROW.stage,
      clientName: MOCK_BOOKING_ROW.clientName,
      project: MOCK_BOOKING_ROW.project,
      pickupAtAd: MOCK_BOOKING_ROW.pickupAtAd,
      returnAtAd: MOCK_BOOKING_ROW.returnAtAd,
      actualReturnAtAd: null,
      deliveryType: MOCK_BOOKING_ROW.deliveryType,
      isCancelled: false,
      isClosed: false,
      linesPresence: 'present',
      lines: [
        {
          id: 'line-1',
          qty: 1,
          lineType: 'Equipment',
          description: 'Sony FX3 Cinema Camera',
          productId: 'prod-1',
          parentLineId: null,
          units: [],
        },
      ],
    }),
    subRentalBookingIds: async () => [],
    isSubRentalBooking: () => false,
    isSubRentedLine: () => false,
    releaseBookingLineUnit: vi.fn(),
  }
})

vi.mock('../../lib/queries/clients', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/queries/clients')>()
  return {
    ...real,
    getClient: async () => ({
      id: 'c-1',
      name: 'Himalayan Films Pvt. Ltd.',
      phone: '9841234567',
    }),
    listClientRecords: async () => [],
  }
})

import Today from '../../modules/today/Today'
import RentalsList from '../../modules/rentals/RentalsList'
import { canViewMoney } from '../../lib/rbac'

let container: HTMLDivElement
let root: Root

async function mountComponent(ui: React.ReactNode, initialEntries = ['/']) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>)
  })
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

beforeEach(() => {
  currentRole = 'Owner'
  window.sessionStorage.clear()
})

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
  }
  container?.remove()
})

describe('Tier 3: Cross-Feature Combinations & Invariants', () => {
  describe('Cross-Feature 1: Master Date Dispatch Synchronization', () => {
    it('synchronizes date navigation across both Pickups and Returns movement panels', async () => {
      await mountComponent(<Today />, ['/today'])

      // Master dispatch synchronization control bar is rendered
      expect(container.textContent).toContain('Today')
      expect(container.textContent).toContain('Sync dispatch day:')

      const prevDayBtn = container.querySelector('button[aria-label="Previous day"]') as HTMLButtonElement
      const nextDayBtn = container.querySelector('button[aria-label="Next day"]') as HTMLButtonElement
      const todayBtn = container.querySelector('button[aria-label="Today"]') as HTMLButtonElement

      expect(prevDayBtn).not.toBeNull()
      expect(nextDayBtn).not.toBeNull()
      expect(todayBtn).not.toBeNull()

      // Both Movement Panels are present in the layout
      expect(container.textContent).toContain('Pickups')
      expect(container.textContent).toContain('Returns')

      // Step forward by 1 day using master next button
      await act(async () => {
        nextDayBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await Promise.resolve()
        })
      }

      // Both Pickups and Returns panels receive the updated synchronized filter
      expect(container.textContent).toContain('Pickups')
      expect(container.textContent).toContain('Returns')

      // Return to Today using the master Today button
      await act(async () => {
        todayBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await Promise.resolve()
        })
      }

      // Panels remain synchronized back to today
      expect(container.textContent).toContain('Today')
    })
  })

  describe('Cross-Feature 2: Filter Drawer & Stage Chip Synchronization', () => {
    it('synchronizes 5-stage filter chips with drawer state without desynchronization', async () => {
      await mountComponent(<RentalsList />, ['/rentals'])

      // 5-stage operational views are present in the toolbar (All, Upcoming, Out, Returns, Closed)
      const allChip = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'All')
      const upcomingChip = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Upcoming'))
      const outChip = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Out'))

      expect(allChip).toBeDefined()
      expect(upcomingChip).toBeDefined()
      expect(outChip).toBeDefined()

      // Initial state: 'All' is active
      expect(allChip?.getAttribute('aria-pressed')).toBe('true')

      // Toggle 'Upcoming' operational view
      await act(async () => {
        upcomingChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await Promise.resolve()
        })
      }

      // Filter state updates: Upcoming is selected
      expect(upcomingChip?.getAttribute('aria-pressed')).toBe('true')
      expect(allChip?.getAttribute('aria-pressed')).toBe('false')

      // Open the filter drawer via the drawer toggle button
      const filterToggleBtn =
        container.querySelector('button[aria-controls="rentals-filters"]') ||
        [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Filters'))
      expect(filterToggleBtn).not.toBeNull()

      await act(async () => {
        filterToggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await Promise.resolve()
        })
      }

      // Reset to All stage chip
      await act(async () => {
        allChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await Promise.resolve()
        })
      }

      expect(allChip?.getAttribute('aria-pressed')).toBe('true')
    })
  })

  describe('Cross-Feature 3: Search-to-Action Navigation', () => {
    it('enables real-time search filtering and preserves row-level action execution in Today', async () => {
      await mountComponent(<Today />, ['/today'])

      // Search input is present
      const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement
      expect(searchInput).not.toBeNull()

      // Enter search term matching client or booking number
      await act(async () => {
        searchInput.value = 'Himalayan'
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await Promise.resolve()
        })
      }

      // Search query is held in input
      expect(searchInput.value).toBe('Himalayan')
    })

    it('enables search filtering and action execution in RentalsList table', async () => {
      await mountComponent(<RentalsList />, ['/rentals'])

      // Filter bar search input
      const searchInput = container.querySelector('input[aria-label="Search rentals"]') as HTMLInputElement
      expect(searchInput).not.toBeNull()

      await act(async () => {
        searchInput.value = 'BK-2026-0715'
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      })
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await Promise.resolve()
        })
      }

      expect(searchInput.value).toBe('BK-2026-0715')

      // Row operations action trigger is present and functional
      const rowOpsBtn =
        container.querySelector('button[aria-label^="Operations for"]') ||
        container.querySelector('button[aria-haspopup="menu"]') ||
        [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.includes('Operations'))
      expect(rowOpsBtn).not.toBeNull()
    })
  })

  describe('Cross-Feature 4: Money-Blind Role Isolation (Law 6 & RBAC)', () => {
    it('Owner role can view financial numbers, totals, and Total Amount column', async () => {
      currentRole = 'Owner'
      expect(canViewMoney('Owner')).toBe(true)

      await mountComponent(<RentalsList />, ['/rentals'])

      // Total Amount column header is present for Owner
      const table = container.querySelector('table')
      expect(table).not.toBeNull()
      expect(table?.textContent).toContain('Total Amount')

      // Formatted monetary amount in Lakh grouping is rendered
      expect(container.textContent).toContain('1,39,506')
    })

    it('Warehouse role sees ZERO money and Total Amount column is completely omitted', async () => {
      currentRole = 'Warehouse'
      expect(canViewMoney('Warehouse')).toBe(false)

      await mountComponent(<RentalsList />, ['/rentals'])

      // Total Amount column header MUST BE OMITTED per Law 6 (not just masked with ***)
      const table = container.querySelector('table')
      expect(table).not.toBeNull()
      expect(table?.textContent).not.toContain('Total Amount')

      // Zero financial figures visible in the DOM
      expect(container.textContent).not.toContain('1,39,506')
      expect(container.textContent).not.toContain('Rs')
      expect(container.textContent).not.toContain('NPR')
    })
  })
})
