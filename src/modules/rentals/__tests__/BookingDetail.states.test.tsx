// @vitest-environment jsdom
/**
 * # Booking Detail — 5-State PageBody Hardening Tests
 *
 * Law 2 Single Query Rule adoption:
 * Tests the 5 states rendered via PageBody:
 *   1. loading (displays skeleton)
 *   2. empty / not found (displays empty title, message, and action)
 *   3. error with retry (displays error banner with onRetry trigger)
 *   4. live canonical booking resolution (displays booking details)
 *   5. role-gated money blindness (Law 6)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import type { CanonicalBooking } from '../../../lib/bookingQuery'
import { rupees } from '../../../lib/money'

let role = 'Owner'
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => role !== 'Warehouse' }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

let mockBookingResult: {
  booking: CanonicalBooking | null
  loading: boolean
  error: string | null
  isNotFound: boolean
  refetch: () => void
} = {
  booking: null,
  loading: false,
  error: null,
  isNotFound: false,
  refetch: vi.fn(),
}

vi.mock('../../../lib/queries/useBooking', () => ({
  useBooking: () => mockBookingResult,
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

const { default: BookingDetail } = await import('../BookingDetail')

let container: HTMLDivElement
let root: Root

async function mount(initialRoute = '/rentals/B-999', as = 'Owner') {
  role = as
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <ToastProvider>
          <Routes>
            <Route path="/rentals/:bookingNo" element={<BookingDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
}

describe('BookingDetail — 5-State PageBody Hardening', () => {
  beforeEach(() => {
    mockBookingResult = {
      booking: null,
      loading: false,
      error: null,
      isNotFound: false,
      refetch: vi.fn(),
    }
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  it('renders LoadingSkeleton when booking is loading', async () => {
    mockBookingResult = {
      booking: null,
      loading: true,
      error: null,
      isNotFound: false,
      refetch: vi.fn(),
    }

    await mount('/rentals/B-999')
    expect(container.textContent).toContain('Loading booking…')
  })

  it('renders EmptyState when booking is not found', async () => {
    mockBookingResult = {
      booking: null,
      loading: false,
      error: null,
      isNotFound: true,
      refetch: vi.fn(),
    }

    await mount('/rentals/B-999')
    expect(container.textContent).toContain('Booking not found')
    expect(container.textContent).toContain('No booking found with reference "B-999"')
    const actionBtn = container.querySelector('button')
    expect(actionBtn?.textContent).toContain('View all rentals')
  })

  it('renders ErrorBanner with retry trigger when error occurs', async () => {
    const retryFn = vi.fn()
    mockBookingResult = {
      booking: null,
      loading: false,
      error: 'Network request failed',
      isNotFound: false,
      refetch: retryFn,
    }

    await mount('/rentals/B-999')
    expect(container.textContent).toContain('Could not load booking')
    expect(container.textContent).toContain('Network request failed')

    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()
    await act(async () => {
      retryBtn?.click()
    })
    expect(retryFn).toHaveBeenCalled()
  })

  it('renders CanonicalBooking data when loaded', async () => {
    const mockCanonical = {
      id: 'b-uuid-123',
      bookingNo: 'B-999',
      stage: 'Booked',
      stageNumber: 2,
      project: 'Documentary Special',
      pickupAtAd: '2026-08-01T06:00:00Z',
      returnAtAd: '2026-08-04T06:00:00Z',
      actualReturnAtAd: null,
      deliveryType: 'Customer Pickup',
      pickupLocation: 'Kathmandu Studios',
      returnLocation: null,
      isCancelled: false,
      depositRequired: rupees(20000),
      createdAtAd: '2026-07-28T10:00:00Z',
      client: {
        id: 'c-uuid-1',
        clientCode: 'CL-2026-0001',
        name: 'Apex Cinema Production',
        phone: '9841000000',
        email: 'apex@example.com',
        panVat: '123456789',
        typeParent: 'Organisation',
        status: 'Active',
      },
      linesPresence: 'present',
      lines: [
        {
          id: 'bl-1',
          lineType: 'Equipment',
          inventoryItemId: 'inv-1',
          description: 'ARRI Alexa Mini LF',
          qty: 1,
          days: 3,
          rate: rupees(25000),
          discountAmount: rupees(0),
          netTotal: rupees(75000),
          netTotalRefusal: null,
          isBundleChild: false,
          bundleParentLineId: null,
          isIncluded: false,
          serviceBasis: null,
          sortOrder: 1,
          unitsPresence: 'present',
          units: {
            requiredQty: 1,
            committedQty: 1,
            packedQty: 1,
            requiredUnpackedQty: 0,
            damagedQty: 0,
            returnedEarlyQty: 0,
            byState: {
              Ready: 1,
              'Picked Up': 0,
              Returned: 0,
              Missing: 0,
              Damaged: 0,
            },
          },
        },
      ],
      discounts: [],
      discountIntegrity: null,
      bundleIntegrity: null,
      unitsPresence: 'present',
      units: {
        requiredQty: 1,
        committedQty: 1,
        packedQty: 1,
        requiredUnpackedQty: 0,
        damagedQty: 0,
        byState: {
          Ready: 1,
          'Picked Up': 0,
          Returned: 0,
          Missing: 0,
          Damaged: 0,
        },
      },
      engineInput: {
        equipment: rupees(75000),
        subRental: null,
        services: null,
        linesSubtotal: rupees(75000),
        discountPercent: null,
        crew: null,
        transport: null,
        vatPercent: null,
        payments: null,
      },
    } as unknown as CanonicalBooking

    mockBookingResult = {
      booking: mockCanonical,
      loading: false,
      error: null,
      isNotFound: false,
      refetch: vi.fn(),
    }

    await mount('/rentals/B-999')
    expect(container.textContent).toContain('B-999')
    expect(container.textContent).toContain('Apex Cinema Production')
    expect(container.textContent).toContain('Documentary Special')
    expect(container.textContent).toContain('ARRI Alexa Mini LF')
  })

  it('respects Law 6 money blindness for Warehouse role', async () => {
    const mockCanonical = {
      id: 'b-uuid-123',
      bookingNo: 'B-999',
      stage: 'Booked',
      stageNumber: 2,
      project: 'Documentary Special',
      pickupAtAd: '2026-08-01T06:00:00Z',
      returnAtAd: '2026-08-04T06:00:00Z',
      actualReturnAtAd: null,
      deliveryType: 'Customer Pickup',
      pickupLocation: 'Kathmandu Studios',
      returnLocation: null,
      isCancelled: false,
      depositRequired: rupees(20000),
      createdAtAd: '2026-07-28T10:00:00Z',
      client: {
        id: 'c-uuid-1',
        clientCode: 'CL-2026-0001',
        name: 'Apex Cinema Production',
        phone: '9841000000',
        email: null,
        panVat: null,
        typeParent: 'Organisation',
        status: 'Active',
      },
      linesPresence: 'present',
      lines: [],
      discounts: [],
      discountIntegrity: null,
      bundleIntegrity: null,
      unitsPresence: 'present',
      units: {
        requiredQty: 0,
        committedQty: 0,
        packedQty: 0,
        requiredUnpackedQty: 0,
        damagedQty: 0,
        byState: {
          Ready: 0,
          'Picked Up': 0,
          Returned: 0,
          Missing: 0,
          Damaged: 0,
        },
      },
      engineInput: {
        equipment: rupees(75000),
        subRental: null,
        services: null,
        linesSubtotal: rupees(75000),
        discountPercent: null,
        crew: null,
        transport: null,
        vatPercent: null,
        payments: null,
      },
    } as unknown as CanonicalBooking

    mockBookingResult = {
      booking: mockCanonical,
      loading: false,
      error: null,
      isNotFound: false,
      refetch: vi.fn(),
    }

    await mount('/rentals/B-999', 'Warehouse')
    // Law 6: Block 4 (Charges & Totals) and deposit details must not be present
    expect(container.textContent).not.toContain('Rental Charges')
    expect(container.textContent).not.toContain('Deposit Required')
  })
})
