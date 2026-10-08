// @vitest-environment jsdom
// @ts-expect-error test env flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FastReturnModal } from '../FastReturnModal'

const mockCompleteReturn = vi.fn()
const mockFetchFloorBooking = vi.fn()
let mockUser: { id: string; role: string } | null = { id: 'user-ops-1', role: 'Warehouse' }

vi.mock('../../../../actions/rentals/returnRental', () => ({
  completeReturn: (...args: unknown[]) => mockCompleteReturn(...args),
}))

vi.mock('../../../../lib/queries/bookings', () => ({
  fetchFloorBooking: (ref: string) => mockFetchFloorBooking(ref),
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'booking-on-rent-1',
                      booking_no: 'B-00100',
                      starts_at: '2026-09-01T00:00:00Z',
                      ends_at: '2026-09-10T00:00:00Z',
                      stage: 'On Rent',
                      clients: { name: 'Acme Studios' },
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }),
  },
  newClientUuid: () => '00000000-0000-4000-8000-000000000001',
}))

let container: HTMLDivElement
let root: Root

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mountModal(props: Parameters<typeof FastReturnModal>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<FastReturnModal {...props} />)
  })
  await flush()
}

describe('FastReturnModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = { id: 'user-ops-1', role: 'Warehouse' }
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

  it('Case A: On Rent booking with equipment loads lines and completes return with real lines', async () => {
    mockFetchFloorBooking.mockResolvedValueOnce({
      id: 'booking-on-rent-1',
      bookingNo: 'B-00100',
      stage: 'On Rent',
      clientName: 'Acme Studios',
      linesPresence: 'present',
      lines: [
        {
          id: 'line-1',
          qty: 1,
          lineType: 'Equipment',
          description: 'Sony FX6',
          productName: 'Sony FX6 Cinema Camera',
          unitsPresence: 'present',
          units: [
            {
              id: 'unit-item-1',
              assetId: 'asset-fx6-01',
              serial: 'SN-FX6-001',
              assetTag: 'TAG-001',
              unitState: 'On Rent',
              isRequired: true,
              packed: true,
              damaged: false,
              location: 'A1',
            },
          ],
        },
      ],
    })
    mockCompleteReturn.mockResolvedValueOnce({
      bookingId: 'booking-on-rent-1',
      sessionId: 'sess-1',
      lines: [],
      stage: 'Returned',
    })

    const onSuccess = vi.fn()
    const onClose = vi.fn()

    await mountModal({
      isOpen: true,
      onClose,
      onSuccess,
      initialBookingRef: 'B-00100',
    })

    // Confirm equipment was loaded and rendered
    expect(container.textContent).toContain('Sony FX6 Cinema Camera')
    expect(container.textContent).toContain('SN-FX6-001')

    // Click submit
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)

    await act(async () => {
      submitBtn.click()
    })
    await flush()

    expect(mockCompleteReturn).toHaveBeenCalledTimes(1)
    const callArgs = mockCompleteReturn.mock.calls[0]?.[0] as {
      rentalId: string
      lines: unknown[]
    }
    expect(callArgs.rentalId).toBe('booking-on-rent-1')
    expect(callArgs.lines).toEqual([
      {
        bookingLineId: 'line-1',
        outcome: 'done',
        unitIds: ['asset-fx6-01'],
        serials: ['SN-FX6-001'],
        qty: 1,
        condition: 'Good',
      },
    ])
    expect(onSuccess).toHaveBeenCalledWith('booking-on-rent-1')
    expect(onClose).toHaveBeenCalled()
  })

  it('Case B: Unchecked equipment item requires missing reason (>= 10 chars) and decision', async () => {
    mockFetchFloorBooking.mockResolvedValueOnce({
      id: 'booking-on-rent-1',
      bookingNo: 'B-00100',
      stage: 'On Rent',
      clientName: 'Acme Studios',
      linesPresence: 'present',
      lines: [
        {
          id: 'line-1',
          qty: 1,
          lineType: 'Equipment',
          description: 'Sony FX6',
          productName: 'Sony FX6 Cinema Camera',
          unitsPresence: 'present',
          units: [
            {
              id: 'unit-item-1',
              assetId: 'asset-fx6-01',
              serial: 'SN-FX6-001',
              assetTag: 'TAG-001',
              unitState: 'On Rent',
              isRequired: true,
              packed: true,
              damaged: false,
              location: 'A1',
            },
          ],
        },
      ],
    })

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      initialBookingRef: 'B-00100',
    })

    // Uncheck the item
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    await act(async () => {
      checkbox.click()
    })
    await flush()

    // Missing reason input should now be visible
    const reasonInput = container.querySelector('input[placeholder*="Reason missing"]') as HTMLInputElement
    expect(reasonInput).toBeTruthy()

    // Attempt submit with empty reason
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement
    await act(async () => {
      submitBtn.click()
    })
    await flush()

    expect(container.textContent).toContain('requires a reason of at least 10 characters')
    expect(mockCompleteReturn).not.toHaveBeenCalled()

    // Type a short reason (< 10 chars)
    setNativeValue(reasonInput, 'Short')
    await act(async () => {
      submitBtn.click()
    })
    await flush()
    expect(container.textContent).toContain('requires a reason of at least 10 characters')
    expect(mockCompleteReturn).not.toHaveBeenCalled()

    // Type a valid reason (>= 10 chars)
    setNativeValue(reasonInput, 'Client forgot cable on production site')
    mockCompleteReturn.mockResolvedValueOnce({
      bookingId: 'booking-on-rent-1',
      stage: 'On Rent',
    })
    await act(async () => {
      submitBtn.click()
    })
    await flush()

    expect(mockCompleteReturn).toHaveBeenCalledTimes(1)
    const callArgs = mockCompleteReturn.mock.calls[0]?.[0] as {
      rentalId: string
      lines: unknown[]
    }
    expect(callArgs.lines).toEqual([
      {
        bookingLineId: 'line-1',
        outcome: 'missing',
        reason: 'Client forgot cable on production site',
        notReturnedDecision: 'Still expected',
      },
    ])
  })

  it('Case C: Booked booking is rejected and cannot be returned', async () => {
    mockFetchFloorBooking.mockResolvedValueOnce({
      id: 'booking-booked-1',
      bookingNo: 'B-00200',
      stage: 'Booked',
      lines: [{ id: 'line-1', qty: 1 }],
    })

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      initialBookingRef: 'B-00200',
    })

    expect(container.textContent).toContain('Fast Return only accepts bookings that are currently On Rent')
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
    expect(mockCompleteReturn).not.toHaveBeenCalled()
  })

  it('Case D: Packed booking is rejected and cannot be returned', async () => {
    mockFetchFloorBooking.mockResolvedValueOnce({
      id: 'booking-packed-1',
      bookingNo: 'B-00300',
      stage: 'Packed',
      lines: [{ id: 'line-1', qty: 1 }],
    })

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      initialBookingRef: 'B-00300',
    })

    expect(container.textContent).toContain('Fast Return only accepts bookings that are currently On Rent')
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
    expect(mockCompleteReturn).not.toHaveBeenCalled()
  })

  it('Case E: User without operation permission cannot perform fast return', async () => {
    // Client role does not have operations.perform
    mockUser = { id: 'client-1', role: 'Client' }

    mockFetchFloorBooking.mockResolvedValueOnce({
      id: 'booking-on-rent-1',
      bookingNo: 'B-00100',
      stage: 'On Rent',
      clientName: 'Acme Studios',
      lines: [{ id: 'line-1', qty: 1, units: [] }],
    })

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      initialBookingRef: 'B-00100',
    })

    expect(container.textContent).toContain('You do not have permission to perform rental returns')
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    await act(async () => {
      submitBtn.click()
    })
    await flush()
    expect(mockCompleteReturn).not.toHaveBeenCalled()
  })
})
