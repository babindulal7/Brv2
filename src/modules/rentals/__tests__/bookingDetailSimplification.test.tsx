// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

let role = 'Owner'
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => role !== 'Warehouse' }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

const mockOpenOperations = vi.fn()
vi.mock('../../operations/OperationsWorkspaceContext', () => ({
  OperationsWorkspaceProvider: ({ children }: { children: unknown }) => children,
  useOperationsWorkspace: () => ({ openOperations: mockOpenOperations, closeOperations: vi.fn() }),
}))

let currentTrackingMode = 'Serialised'
let currentStage = 'Booked'
const BOOKING_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  bookingNo: 'B-715',
  clientId: 'c-1',
  clientName: 'Himalayan Films Pvt. Ltd.',
  project: 'Film Shoot',
  stage: 'Booked',
  pickupAtAd: '2026-07-16T00:15:00.000Z',
  returnAtAd: '2026-07-19T00:15:00.000Z',
  actualReturnAtAd: null,
  deliveryType: 'Client Pickup',
  pickupLocation: 'Kathmandu Main',
  returnLocation: 'Kathmandu Main',
  quoteExpiresAtAd: null,
  createdAtAd: '2026-07-09T00:00:00.000Z',
  itemCount: 1,
  depositRequired: 5_000_000,
  isCancelled: false,
  isClosed: false,
}

vi.mock('../../../lib/queries/bookings', () => ({
  listBookings: async () => ({
    rows: [{ ...BOOKING_ROW, stage: currentStage }],
    total: 1,
  }),
  fetchFloorBooking: async () => ({
    id: BOOKING_ROW.id,
    bookingNo: 'B-715',
    stage: currentStage,
    clientName: BOOKING_ROW.clientName,
    project: BOOKING_ROW.project,
    pickupAtAd: BOOKING_ROW.pickupAtAd,
    returnAtAd: BOOKING_ROW.returnAtAd,
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-1',
        qty: 1,
        lineType: 'Equipment',
        description: 'Sony FX3',
        trackingMode: currentTrackingMode,
        productId: 'p-1',
        parentLineId: null,
        units: [],
      },
    ],
  }),
  isSubRentalBooking: () => false,
  isSubRentedLine: () => false,
  releaseBookingLineUnit: vi.fn(),
}))

vi.mock('../../../lib/queries/clients', () => ({
  getClient: async () => ({
    id: 'c-1',
    name: 'Himalayan Films Pvt. Ltd.',
    phone: '9841234567',
  }),
}))

vi.mock('../../../lib/queries/notes', () => ({
  listBookingNotes: async () => ({ rows: [], total: 0 }),
}))

vi.mock('../../../lib/queries/crew', () => ({
  listBookingCrew: async () => ({ rows: [], total: 0 }),
}))

vi.mock('../../../lib/queries/finance', () => {
  const INVOICE = {
    id: 'inv-1',
    invoiceNo: 'INV-2026-001',
    bookingId: '11111111-1111-4111-8111-111111111111',
    bookingNo: 'B-715',
    clientName: 'Himalayan Films Pvt. Ltd.',
    subtotalAmount: 15_000_000,
    discountAmount: 0,
    taxableAmount: 15_000_000,
    vatAmount: 1_950_000,
    totalAmount: 16_950_000,
    paidAmount: 0,
    outstandingAmount: 16_950_000,
    status: 'Issued',
    isVoid: false,
    lines: [],
    createdAtAd: '2026-07-09T00:00:00.000Z',
  }
  return {
    listInvoices: async () => ({ rows: [INVOICE], total: null }),
    listPayments: async () => ({ rows: [], total: null }),
    invoicesForBooking: () => ({}),
    paymentsForBooking: () => ({}),
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

const { default: BookingDetail } = await import('../BookingDetail')

let container: HTMLDivElement
let root: Root

async function mount() {
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/rentals/B-715']}>
        <ToastProvider>
          <Routes>
            <Route path="/rentals/:bookingNo" element={<BookingDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  currentStage = 'Booked'
  role = 'Owner'
})

const text = () => container.textContent ?? ''
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

describe('BookingDetail Simplification (Task 4)', () => {
  it('renders canonical title format [Booking No] · [Client Name]', async () => {
    await mount()
    expect(text()).toContain('B-715 · Himalayan Films Pvt. Ltd.')
  })

  it('renders primary lifecycle action button for Booked stage', async () => {
    currentStage = 'Booked'
    await mount()
    const packBtn = button('Start Packing')
    expect(packBtn).toBeDefined()
    await act(async () => {
      packBtn?.click()
    })
    expect(mockOpenOperations).toHaveBeenCalledWith('B-715', 'Booked', 'Pack')
  })

  it('renders Print booking button in secondary actions', async () => {
    await mount()
    expect(button('Print booking')).toBeDefined()
  })

  it('links client name to client detail page and shows contact phone', async () => {
    await mount()
    const link = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/clients/c-1')
    expect(link).toBeDefined()
    expect(link?.textContent).toContain('Himalayan Films Pvt. Ltd.')
    expect(text()).toContain('9841234567')
  })

  it('does not demand serial assignments for quantity-tracked equipment', async () => {
    currentTrackingMode = 'Quantity'
    try {
      await mount()
      expect(text()).not.toContain('missing serial assignment')
      expect(text()).toContain('Security deposit required: Rs 50,000')
    } finally {
      currentTrackingMode = 'Serialised'
    }
  })

  it('shows Attention card with blockers (unassigned serials, deposit)', async () => {
    await mount()
    expect(text()).toContain('Attention')
    expect(text()).toContain('1 equipment item missing serial assignment')
    expect(text()).toContain('Security deposit required: Rs 50,000')
  })
})
