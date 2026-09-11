// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CancelRentalModal } from '../CancelRentalModal'

const mockCancelRental = vi.fn()
const mockShowSuccessToast = vi.fn()

vi.mock('../../../../actions/rentals/cancelRental', () => ({
  cancelRental: (...args: unknown[]) => mockCancelRental(...args),
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-coord-1', role: 'Coordinator' },
  }),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: (...args: unknown[]) => mockShowSuccessToast(...args),
    showErrorToast: vi.fn(),
  }),
}))

let container: HTMLDivElement
let root: Root

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setNativeChecked(element: HTMLInputElement, checked: boolean) {
  const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set
  checkedSetter?.call(element, checked)
  element.dispatchEvent(new Event('click', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mountModal(props: Parameters<typeof CancelRentalModal>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<CancelRentalModal {...props} />)
  })
  await flush()
}

describe('CancelRentalModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    bookingId: 'booking-uuid-123',
    bookingNo: 'BK-2026-0042',
    stage: 'Booked',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCancelRental.mockResolvedValue({
      success: true,
      bookingId: 'booking-uuid-123',
      bookingNo: 'BK-2026-0042',
      cancelledAt: '2026-09-11T12:00:00Z',
    })
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('renders modal details and Law 3 inventory warning', async () => {
    await mountModal(defaultProps)
    expect(container.textContent).toContain('Cancel Booking — BK-2026-0042')
    expect(container.textContent).toContain('Law 3 & Inventory Allocation')
    expect(container.textContent).toContain('0/10 characters minimum')
  })

  it('shows Manager Authority notice when stage is Packed', async () => {
    await mountModal({ ...defaultProps, stage: 'Packed' })
    expect(container.textContent).toContain('Manager Authority Required:')
  })

  it('disables Cancel Booking button until reason >= 10 chars and confirmation checkbox is ticked', async () => {
    await mountModal(defaultProps)
    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel Booking'),
    ) as HTMLButtonElement
    expect(button).toBeDefined()
    expect(button.disabled).toBe(true)

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeDefined()

    await act(async () => {
      setNativeValue(textarea, 'Too short')
    })
    await flush()
    expect(button.disabled).toBe(true)

    await act(async () => {
      setNativeValue(textarea, 'Client cancelled event due to heavy rain')
    })
    await flush()
    expect(button.disabled).toBe(true)

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox).toBeDefined()

    await act(async () => {
      setNativeChecked(checkbox, true)
    })
    await flush()
    expect(button.disabled).toBe(false)
  })

  it('dispatches cancelRental and triggers success callbacks on submit', async () => {
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    await mountModal({ ...defaultProps, onSuccess, onClose })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      setNativeValue(textarea, 'Production rescheduled to next month')
    })

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    await act(async () => {
      setNativeChecked(checkbox, true)
    })
    await flush()

    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel Booking'),
    ) as HTMLButtonElement

    await act(async () => {
      button.click()
    })
    await flush()

    expect(mockCancelRental).toHaveBeenCalledTimes(1)
    expect(mockCancelRental).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'booking-uuid-123',
        reason: 'Production rescheduled to next month',
        clientUuid: expect.any(String),
      }),
      { userId: 'user-coord-1', role: 'Coordinator' },
    )

    expect(mockShowSuccessToast).toHaveBeenCalledWith(
      'Booking Cancelled',
      expect.stringContaining('BK-2026-0042 has been cancelled'),
    )
    expect(onSuccess).toHaveBeenCalledWith('booking-uuid-123')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders gate exception inline if database refuses cancellation', async () => {
    mockCancelRental.mockRejectedValue(
      new Error('GATE:gate.cancel.stage_too_late|Cannot cancel once equipment is on rent'),
    )

    await mountModal(defaultProps)

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      setNativeValue(textarea, 'Attempting cancellation too late')
    })

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    await act(async () => {
      setNativeChecked(checkbox, true)
    })
    await flush()

    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel Booking'),
    ) as HTMLButtonElement

    await act(async () => {
      button.click()
    })
    await flush()

    expect(container.textContent).toContain('Cancellation Authorization Required')
  })
})
