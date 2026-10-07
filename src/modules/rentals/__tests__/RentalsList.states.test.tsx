// @vitest-environment jsdom
/**
 * # Rentals List — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody for RentalsList.tsx:
 *   1. loading (LoadingSkeleton with skeleton="table" rendered)
 *   2. error (ErrorBanner with persistent inline alert & retry action)
 *   3. empty / unfiltered (EmptyState with "New Rental" CTA)
 *   4. empty / filtered (EmptyState with "Clear filters" action)
 *   5. restricted (RestrictedState rendered for non-staff Client role)
 *   6. hasRows / content (standard table with booking rows rendered)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { BookingListRow } from '../../../lib/queries/bookings'
import type { RentalsListProps } from '../RentalsList'

let userRole = 'Owner'
const lines = vi.hoisted(() => ({ rows: [] as { booking_id: string; line_type: string }[] }))
const queryStub = vi.hoisted(() => ({ rows: [] as BookingListRow[], total: 1 as number | null }))

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: userRole, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/supabase', () => {
  const build = () => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'in', 'is', 'eq', 'order', 'range']) chain[method] = () => chain
    chain['then'] = (resolve: (value: unknown) => unknown) => resolve({ data: lines.rows, error: null })
    return chain
  }
  return {
    supabase: { from: () => build() },
    newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  }
})

const ROW: BookingListRow = {
  id: '8f1d1a56-0b6a-4f0e-9d3c-2f4b6c7a9e11',
  bookingNo: 'B-715',
  clientId: 'c0ffee00-1111-4222-8333-444455556666',
  clientName: 'Mountain Stories',
  project: 'FX3 Documentary',
  stage: 'Booked',
  pickupAtAd: '2026-08-14T03:15:00.000Z',
  returnAtAd: '2026-08-18T10:30:00.000Z',
  actualReturnAtAd: null,
  deliveryType: 'Customer Pickup',
  pickupLocation: 'Kathmandu',
  returnLocation: null,
  quoteExpiresAtAd: null,
  createdAtAd: '2026-07-12T09:41:00.000Z',
  itemCount: 7,
  depositRequired: null,
  isCancelled: false,
  isClosed: false,
}

vi.mock('../../../lib/queries/bookings', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/queries/bookings')>()
  return {
    ...real,
    listBookings: async () => ({ rows: queryStub.rows, total: queryStub.total }),
  }
})

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

const RentalsList = (await import('../RentalsList')).default

let container: HTMLDivElement
let root: Root
let currentSearch = ''

function LocationSpy() {
  currentSearch = useLocation().search
  return null
}

async function mount(props: RentalsListProps = {}, as = 'Owner', entry = '/rentals', width = 1200) {
  userRole = as
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <RentalsList {...props} />
        <LocationSpy />
      </MemoryRouter>,
    )
  })
  // Give async useList query a tick to settle
  await act(async () => {
    await Promise.resolve()
  })
}

describe('RentalsList — 5-State PageBody Hardening', () => {
  beforeEach(() => {
    userRole = 'Owner'
    queryStub.rows = [ROW]
    queryStub.total = 1
    lines.rows = []
    currentSearch = ''
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  it('renders LoadingSkeleton with table skeleton when loading prop is true', async () => {
    await mount({ loading: true })
    expect(container.textContent).toContain('Loading rentals…')
  })

  it('renders ErrorBanner with persistent inline alert and retry button when error prop is provided', async () => {
    const onRetry = vi.fn()
    queryStub.rows = []
    queryStub.total = 0

    await mount({ error: 'Connection to bookings cluster lost', onRetry })

    expect(container.textContent).toContain('Could not load rentals')
    expect(container.textContent).toContain('Connection to bookings cluster lost')

    const retryBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()
    await act(async () => {
      retryBtn?.click()
    })
    expect(onRetry).toHaveBeenCalled()
  })

  it('renders RestrictedState when user is a non-staff Client', async () => {
    await mount({}, 'Client')
    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Requires Staff')
    expect(container.textContent).toContain('The operational rentals directory is for Babin Rentals staff only')
  })

  it('renders EmptyState with "New Rental" action when list has no records and is unfiltered', async () => {
    queryStub.rows = []
    queryStub.total = 0

    await mount({}, 'Owner', '/rentals')

    expect(container.textContent).toContain('No rentals yet')
    expect(container.textContent).toContain('No booking has been created yet.')

    const newRentalBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.trim() === 'New Rental',
    )
    expect(newRentalBtn).toBeDefined()
  })

  it('renders EmptyState with "Clear filters" action when query filters yield zero results', async () => {
    queryStub.rows = []
    queryStub.total = 0

    await mount({}, 'Owner', '/rentals?quick=Overdue')

    expect(container.textContent).toContain('No rentals match these filters')
    expect(container.textContent).toContain('Nothing matches right now')

    const clearFiltersBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Clear filters'),
    )
    expect(clearFiltersBtn).toBeDefined()

    await act(async () => {
      clearFiltersBtn?.click()
    })

    // Confirm query string was cleared
    expect(currentSearch).not.toContain('quick=Overdue')
  })

  it('renders table content and active bookings when rows are present for staff', async () => {
    queryStub.rows = [ROW]
    queryStub.total = 1

    await mount({}, 'Owner', '/rentals')

    expect(container.textContent).toContain('Rentals')
    expect(container.textContent).toContain('Active Rentals')
    expect(container.textContent).toContain('Mountain Stories')
    expect(container.textContent).toContain('FX3 Documentary')
    expect(container.textContent).toContain('B-715')
  })
})
