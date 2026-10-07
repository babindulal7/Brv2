// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useBooking, type UseBookingResult } from '../useBooking'
import * as bookingQueryModule from '../../bookingQuery'
import type { CanonicalBooking } from '../../bookingQuery'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root
let latest: UseBookingResult | null = null

function Probe({ id, withDeposit }: { id: string | undefined; withDeposit?: boolean }) {
  latest = useBooking(id, { withDeposit })
  return null
}

async function mount(props: { id: string | undefined; withDeposit?: boolean }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Probe {...props} />)
  })
}

describe('useBooking hook — Single Query Rule detail hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    latest = null
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  const mockBooking = {
    id: '00000000-0000-0000-0000-000000000001',
    bookingNo: 'BK-2026-0715',
    stage: 'Booked',
    stageNumber: 2,
    project: 'Music Video',
    pickupAtAd: '2026-07-16T04:00:00Z',
    returnAtAd: '2026-07-19T12:00:00Z',
    actualReturnAtAd: null,
    deliveryType: 'Customer Pickup',
    pickupLocation: 'Kathmandu HQ',
    returnLocation: 'Kathmandu HQ',
    quoteExpiresAtAd: null,
    version: 1,
    createdAtAd: '2026-07-10T10:00:00Z',
    isCancelled: false,
    cancellationReason: null,
    isClosed: false,
    depositRequired: 5000000,
    client: {
      id: 'c-1',
      clientCode: 'CL-2026-0001',
      name: 'Kathmandu Films',
      phone: '9841234567',
      email: 'info@ktmfilms.com',
      panVat: '123456789',
      typeParent: 'Production House',
      status: 'Active',
    },
    linesPresence: 'present',
    lines: [],
    discounts: [],
    discountIntegrity: null,
  } as unknown as CanonicalBooking

  it('handles empty/undefined bookingNo gracefully with isNotFound', async () => {
    await mount({ id: undefined })
    expect(latest?.loading).toBe(false)
    expect(latest?.booking).toBeNull()
    expect(latest?.isNotFound).toBe(true)
    expect(latest?.error).toBeNull()
  })

  it('loads canonical booking on successful query', async () => {
    vi.spyOn(bookingQueryModule, 'fetchCanonicalBooking').mockResolvedValue(mockBooking)

    await mount({ id: 'BK-2026-0715' })

    expect(latest?.loading).toBe(false)
    expect(latest?.booking).toEqual(mockBooking)
    expect(latest?.isNotFound).toBe(false)
    expect(latest?.error).toBeNull()
  })

  it('sets isNotFound=true when fetchCanonicalBooking returns null', async () => {
    vi.spyOn(bookingQueryModule, 'fetchCanonicalBooking').mockResolvedValue(null)

    await mount({ id: 'BK-NONEXISTENT' })

    expect(latest?.loading).toBe(false)
    expect(latest?.booking).toBeNull()
    expect(latest?.isNotFound).toBe(true)
    expect(latest?.error).toBeNull()
  })

  it('captures database/network errors cleanly', async () => {
    vi.spyOn(bookingQueryModule, 'fetchCanonicalBooking').mockRejectedValue(
      new Error('fetchCanonicalBooking failed: 42501 permission denied'),
    )

    await mount({ id: 'BK-2026-0715' })

    expect(latest?.loading).toBe(false)
    expect(latest?.booking).toBeNull()
    expect(latest?.isNotFound).toBe(false)
    expect(latest?.error).toBe('fetchCanonicalBooking failed: 42501 permission denied')
  })

  it('refetches when refetch() is triggered', async () => {
    const spy = vi.spyOn(bookingQueryModule, 'fetchCanonicalBooking').mockResolvedValue(mockBooking)

    await mount({ id: 'BK-2026-0715' })
    expect(spy).toHaveBeenCalledTimes(1)

    await act(async () => {
      latest?.refetch()
    })

    expect(spy).toHaveBeenCalledTimes(2)
  })
})
