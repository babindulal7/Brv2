// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DriverHandoverModal } from '../DriverHandoverModal'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const mockEnqueueMutation = vi.fn().mockResolvedValue(true)
vi.mock('../../../lib/offlineQueue', () => ({
  enqueueMutation: (...args: unknown[]) => mockEnqueueMutation(...args),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-driver-1', name: 'Ramesh Thapa', role: 'Driver' },
    loading: false,
  }),
}))

describe('DriverHandoverModal (Pillar 2)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockEnqueueMutation.mockClear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
  })

  it('renders driver handover header, client name, and zero monetary figures (Law 6, Law 17)', () => {
    act(() => {
      root.render(
        <DriverHandoverModal
          isOpen={true}
          onClose={vi.fn()}
          bookingNo="B-902"
          bookingId="id-b-902"
          clientName="Suman Shakya"
          deliveryAddress="Boudha Stupa Gate 2"
          itemCount={5}
        />,
      )
    })

    const bodyText = document.body.textContent || ''
    // Header & details
    expect(bodyText).toContain('Driver Field Delivery Handover')
    expect(bodyText).toContain('Booking #B-902')
    expect(bodyText).toContain('5 items')
    expect(bodyText).toContain('Boudha Stupa Gate 2')

    // Law 17: Client, never customer
    expect(bodyText.toLowerCase()).toContain('client')
    expect(bodyText.toLowerCase()).not.toContain('customer')

    // Law 6: Zero money or currency figures on floor/driver views
    expect(bodyText).not.toMatch(/Rs\.?\s*\d+/i)
    expect(bodyText).not.toMatch(/NPR/i)
  })

  it('displays network status indicator and GPS stamp controls', () => {
    act(() => {
      root.render(
        <DriverHandoverModal
          isOpen={true}
          onClose={vi.fn()}
          bookingNo="B-902"
          bookingId="id-b-902"
          clientName="Suman Shakya"
          itemCount={2}
        />,
      )
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toMatch(/Online|Offline/i)
    expect(bodyText).toContain('GPS Delivery Stamp')
    expect(bodyText).toContain('Tag GPS Location')
  })

  it('shows validation error when confirming without signature', async () => {
    act(() => {
      root.render(
        <DriverHandoverModal
          isOpen={true}
          onClose={vi.fn()}
          bookingNo="B-902"
          bookingId="id-b-902"
          clientName="Suman Shakya"
          itemCount={2}
        />,
      )
    })

    const confirmButton = Array.from(document.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Confirm Delivery Handover'),
    )
    expect(confirmButton).toBeDefined()

    await act(async () => {
      confirmButton?.click()
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Client signature is required for delivery handover.')
  })
})
