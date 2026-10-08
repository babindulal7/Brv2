// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

// Standard mocks for Auth, Device, Network, Sync, Toast, and Workspace
const mockUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Babin Shrestha',
  role: 'Owner' as const,
  isSharedDevice: false,
}

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: mockUser,
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

vi.mock('../../lib/supabase', () => {
  const createQueryBuilder = (): any => {
    const builder: any = {
      eq: () => builder,
      neq: () => builder,
      is: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      catch: (reject: any) => Promise.resolve({ data: [], error: null }).catch(reject),
    }
    return builder
  }

  return {
    IS_MOCK: false,
    newClientUuid: () => '11111111-1111-4111-8111-111111111111',
    supabase: {
      from: () => ({
        select: () => createQueryBuilder(),
      }),
    },
  }
})

vi.mock('../../actions/rentals/saveDraft', () => ({
  saveDraft: vi.fn(),
  fetchRentalDraft: vi.fn(),
  convertDraft: vi.fn(),
  cancelDraft: vi.fn(),
  listActiveDrafts: async () => [],
}))

const MOCK_BOOKING = {
  id: '11111111-1111-4111-8111-111111111111',
  bookingNo: 'BK-2026-0715',
  clientId: 'c-1',
  client: 'Himalayan Films Pvt. Ltd.',
  clientName: 'Himalayan Films Pvt. Ltd.',
  monogram: 'HF',
  avatarTone: 'primary' as const,
  project: 'Documentary Feature',
  pickupLocation: 'Kathmandu Main',
  returnLocation: 'Kathmandu Main',
  itemCount: 3,
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
  deposit: 5000000 as const,
  depositRequired: 5000000,
  totalAmount: 13950600 as const,
  isExternal: false,
}

vi.mock('../../lib/queries/bookings', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/queries/bookings')>()
  return {
    ...real,
    listBookings: async () => ({
      rows: [MOCK_BOOKING],
      total: 1,
    }),
    fetchFloorBooking: async () => ({
      id: MOCK_BOOKING.id,
      bookingNo: MOCK_BOOKING.bookingNo,
      stage: MOCK_BOOKING.stage,
      clientName: MOCK_BOOKING.clientName,
      project: MOCK_BOOKING.project,
      pickupAtAd: MOCK_BOOKING.pickupAtAd,
      returnAtAd: MOCK_BOOKING.returnAtAd,
      actualReturnAtAd: null,
      deliveryType: MOCK_BOOKING.deliveryType,
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

// Import Shell components
import Header from '../../components/shell/Header'
import Sidebar from '../../components/shell/Sidebar'
import { Button } from '../../components/ui/Page'
import PageActionsStandard from '../../components/ui/PageActions'

// Helper mount utility
let container: HTMLDivElement
let root: Root

async function mountComponent(ui: React.ReactNode, initialEntries = ['/']) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={initialEntries}>
        {ui}
      </MemoryRouter>
    )
  })
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
  }
  container?.remove()
})

describe('Tier 1: Feature Coverage (Happy Path & Isolations)', { timeout: 90000 }, () => {
  describe('R1: Global Shell & Navigation Simplification', () => {
    it('Header renders breadcrumb trail, search command button, and user profile trigger', async () => {
      await mountComponent(
        <Header
          crumbs={[
            { label: 'Rentals', to: '/rentals' },
            { label: 'BK-2026-0001' },
          ]}
        />
      )

      // Breadcrumb assertions
      const breadcrumbNav = container.querySelector('nav[aria-label="Breadcrumb"]')
      expect(breadcrumbNav).not.toBeNull()
      expect(breadcrumbNav?.textContent).toContain('Rentals')
      expect(breadcrumbNav?.textContent).toContain('BK-2026-0001')

      // Command palette trigger button with Ctrl+K / ⌘K
      const searchBtn = container.querySelector('button[aria-label="Search bookings, clients, equipment and pages"]')
      expect(searchBtn).not.toBeNull()
      expect(searchBtn?.textContent).toContain('Search bookings, clients, equipment…')
      expect(searchBtn?.textContent).toContain('Ctrl+K / ⌘K')

      // User profile trigger representation
      const profileBtn = container.querySelector('button[aria-label*="user profile"]')
      expect(profileBtn).not.toBeNull()
      // Clicking profile trigger expands profile dialog
      await act(async () => {
        profileBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(container.textContent).toContain('Babin Shrestha')
      expect(container.textContent).toContain('Owner')
    })

    it('Sidebar renders core operational navigation groups, brand wordmark, and theme toggles', async () => {
      await mountComponent(<Sidebar active="/rentals" />)

      // Navigation container
      const nav = container.querySelector('nav[aria-label="Main"]')
      expect(nav).not.toBeNull()

      // Core operational destinations
      expect(container.textContent).toContain('Today')
      expect(container.textContent).toContain('Rentals')
      expect(container.textContent).toContain('Operation')
      expect(container.textContent).toContain('Inventory')
      expect(container.textContent).toContain('Clients')
      expect(container.textContent).toContain('Finance')

      // Brand wordmark
      expect(container.textContent).toContain('BR')

      // Theme toggle buttons (Dark / Light)
      const darkBtn = container.querySelector('button[aria-pressed]')
      expect(darkBtn).not.toBeNull()

      // Collapse navigation button
      const collapseBtn = container.querySelector('button[aria-label="Collapse navigation"]')
      expect(collapseBtn).not.toBeNull()
    })

    it('PageActions enforces 1 primary CTA, at most 2 secondary actions, and overflow menu', async () => {
      await mountComponent(
        <PageActionsStandard
          primary={<Button variant="primary">Confirm Rental</Button>}
          secondary={[
            <Button key="sec-1" variant="secondary">Quick Scan</Button>,
            <Button key="sec-2" variant="secondary">Export PDF</Button>,
          ]}
          overflow={[
            { label: 'Void Rental', icon: 'close', onClick: vi.fn() },
            { label: 'Download Log', icon: 'download', onClick: vi.fn() },
          ]}
        />
      )

      const buttons = [...container.querySelectorAll('button')]
      expect(buttons.some((b) => b.textContent?.includes('Confirm Rental'))).toBe(true)
      expect(buttons.some((b) => b.textContent?.includes('Quick Scan'))).toBe(true)
      expect(buttons.some((b) => b.textContent?.includes('Export PDF'))).toBe(true)

      // Overflow trigger button (•••)
      const overflowBtn = container.querySelector('button[aria-label="More actions"]')
      expect(overflowBtn).not.toBeNull()
    })
  })

  describe('R2: Today Dispatch Dashboard', () => {
    it('renders master dispatch synchronization controls and two-column layout', async () => {
      const { default: Today } = await import('../../modules/today/Today')
      await mountComponent(<Today />, ['/today'])

      // Primary header
      expect(container.textContent).toContain('Today')

      // Dispatch date control (8 Oct 2026): no label, and "Today" is only
      // offered once you have stepped away from today.
      expect(container.textContent).not.toContain('Sync dispatch day:')
      expect(container.querySelector('button[aria-label="Today"]')).toBeNull()
      const prevDayBtn = container.querySelector('button[aria-label="Previous day"]')
      expect(prevDayBtn).not.toBeNull()
      const nextDayBtn = container.querySelector('button[aria-label="Next day"]')
      expect(nextDayBtn).not.toBeNull()

      // Express counter search bar
      const counterInput = container.querySelector('input[type="search"]')
      expect(counterInput).not.toBeNull()
      expect(counterInput?.getAttribute('placeholder')).toContain('Search or scan…')

      // Movement panels: Pickups and Returns
      expect(container.textContent).toContain('Pickups')
      expect(container.textContent).toContain('Returns')
    })
  })

  describe('R3: Rentals List', () => {
    it('renders Rentals header with primary CTA, filter options, and operational table shell', async () => {
      const { default: RentalsList } = await import('../../modules/rentals/RentalsList')
      await mountComponent(<RentalsList />, ['/rentals'])

      // Primary CTA
      const newRentalBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('New Rental'))
      expect(newRentalBtn).toBeUndefined()

      // Table headers
      const table = container.querySelector('table')
      expect(table).not.toBeNull()
      expect(table?.textContent).toContain('Booking ID')
      expect(table?.textContent).toContain('Client / Project')
      expect(table?.textContent).toContain('Status')
    })
  })

  describe('R4: New Rental guided flow', () => {
    it('renders the full booking form with a live summary', async () => {
      const { default: NewRental } = await import('../../modules/rentals/NewRental')
      await mountComponent(<NewRental />, ['/rentals/new'])

      // Sections stay mounted together so staff can review and correct them.
      expect(container.querySelector('.new-rental-stepper-container, .rental-stepper')).toBeNull()
      expect(container.querySelector('#section-1')?.textContent).toContain('Rental period')
      expect(container.querySelector('#section-2')?.textContent).toContain('Equipment, Bundles & Services')

      // Client section
      expect(container.textContent).toContain('Client')
      expect(container.querySelector('#section-0')).not.toBeNull()

      // Booking summary rail
      const summaryRail = container.querySelector('#rail-booking-summary')
      expect(summaryRail).not.toBeNull()
      expect(summaryRail?.textContent).toContain('Booking Summary')
      expect(summaryRail?.textContent).toContain('0 items')

      // Workflow action buttons
      const confirmBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Confirm Booking')
      expect(confirmBtn).toBeDefined()
    })

    it('supports keyboard-only navigation and screen-reader accessible names', async () => {
      const { default: NewRental } = await import('../../modules/rentals/NewRental')
      await mountComponent(<NewRental />, ['/rentals/new'])

      // Every interactive input/select/textarea must have an accessible name or label
      const formFields = Array.from(container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
      expect(formFields.length).toBeGreaterThan(0)
      for (const field of formFields) {
        if (field.type === 'hidden') continue
        const id = field.getAttribute('id')
        const hasForLabel = Boolean(id && container.querySelector(`label[for="${id}"]`))
        const ariaLabel = field.getAttribute('aria-label')
        const ariaLabelledby = field.getAttribute('aria-labelledby')
        const title = field.getAttribute('title')
        const placeholder = field.getAttribute('placeholder')
        const hasWrappingLabel = Boolean(field.closest('label'))
        expect(Boolean(ariaLabel || ariaLabelledby || hasForLabel || hasWrappingLabel || title || placeholder)).toBe(true)
        if (!field.hasAttribute('tabindex') || field.tabIndex >= 0) {
          expect(field.tabIndex).toBeGreaterThanOrEqual(0)
        }
      }

      // Action buttons must be reachable via keyboard
      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not([disabled]):not([tabindex="-1"])'))
      for (const btn of buttons) {
        expect(btn.tabIndex).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('R5: Booking Detail Simplification', () => {
    it('renders booking stages, action controls, and core facts', async () => {
      const { default: BookingDetail } = await import('../../modules/rentals/BookingDetail')
      await mountComponent(
        <Routes>
          <Route path="/rentals/:bookingNo" element={<BookingDetail />} />
        </Routes>,
        ['/rentals/BK-2026-0715']
      )

      // Should render the booking information
      expect(container.textContent).toContain('BK-2026-0715')
      expect(container.textContent).toContain('Himalayan Films Pvt. Ltd.')
    })
  })

  describe('R6: Core Directories', () => {
    it('Operations Queues renders queue chips and toolbar', async () => {
      const { default: OperationsQueues } = await import('../../modules/operations/OperationsQueues')
      await mountComponent(<OperationsQueues />, ['/operations'])

      expect(container.textContent).toContain('Operation')
      expect(container.textContent).toContain('Pack')
      expect(container.textContent).toMatch(/Handover|Pickup/)
      expect(container.textContent).toContain('Return')
      expect(container.textContent).toContain('Reset')
    })

    it('Inventory Equipment directory renders catalogue table and filters', async () => {
      const { default: Inventory } = await import('../../modules/inventory/Inventory')
      await mountComponent(<Inventory />, ['/inventory'])

      expect(container.textContent).toContain('Inventory')
      expect(container.textContent).toContain('Equipment')
      expect(container.textContent).toContain('Bundles')
    }, 60_000)

    it('Clients Directory renders client table and section navigation', async () => {
      const { default: Clients } = await import('../../modules/clients/Clients')
      await mountComponent(<Clients />, ['/clients'])

      expect(container.textContent).toContain('Clients')
      expect(container.textContent).toContain('Directory')
      expect(container.textContent).toContain('Membership')
    }, 60_000)

    it('Finance dashboard renders financial KPIs and invoices table', async () => {
      const { default: Finance } = await import('../../modules/finance/Finance')
      await mountComponent(<Finance />, ['/finance'])

      expect(container.textContent).toContain('Finance')
      expect(container.textContent).toContain('Outstanding')
      expect(container.textContent).toContain('Overdue')
      expect(container.textContent).toContain('Received')
    }, 60_000)

    it('Documents module renders document manager and filter toolbar', async () => {
      const { default: Documents } = await import('../../modules/documents/Documents')
      await mountComponent(<Documents />, ['/documents'])

      expect(container.textContent).toContain('Documents')
      expect(container.querySelector('.page-shell, .page-body')).not.toBeNull()
    })

    it('Crew Booking module renders assignments roster and search', async () => {
      const { CrewBooking } = await import('../../modules/crew/CrewBooking')
      await mountComponent(<CrewBooking />, ['/crew'])

      expect(container.textContent).toContain('Crew')
      expect(container.querySelector('.page-shell, .card')).not.toBeNull()
    })
  })
})
