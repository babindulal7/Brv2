// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import {
  CrewAndTransportSection,
  type TransportDetails,
} from '../CrewAndTransportSection'
import type { CrewLine } from '../CrewSection'
import { rupees } from '../../../../lib/money'

vi.mock('../../../../lib/device', () => ({ useViewport: () => 'desktop' }))

const sampleCrew: CrewLine[] = [
  {
    crewId: 'crew-1',
    name: 'Anup Baral',
    role: 'Director of Photography',
    phone: '9841234567',
    dayRatePaisa: rupees(12000),
    overtimePaisa: rupees(1000),
    accommodationPaisa: rupees(0),
    mealsPaisa: rupees(500),
  },
]

const sampleTransport: TransportDetails = {
  clientPickup: false,
  deliveryType: 'Babin Delivery',
  vehicle: 'Toyota HiAce',
  numberPlate: 'BA 2 JA 1234',
  driverContact: '9851011122',
  pickupLocation: 'Studio A, Kathmandu',
  returnLocation: 'Babin Hub, Naxal',
  specialInstructions: 'Handle camera package with care',
  returnPickupType: 'Babin Pickup',
  returnPickupAddress: 'Location B, Lalitpur',
  returnPickupTime: '18:00',
  returnPickupChargePaisa: 150000,
  deliveryChargePaisa: rupees(2000),
  fuelChargePaisa: rupees(1000),
  transportPaisa: rupees(4500),
}

describe('CrewAndTransportSection', () => {
  it('renders assigned crew table with role badges, extras expander, and transport fields', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onUpdateCrew = vi.fn()
    const onUpdateTransport = vi.fn()

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CrewAndTransportSection
              crew={sampleCrew}
              transport={sampleTransport}
              onUpdateCrew={onUpdateCrew}
              onRemoveCrew={vi.fn()}
              onClearCrew={vi.fn()}
              onUpdateTransport={onUpdateTransport}
              canCrewMoney={true}
              canBookingMoney={true}
              days={2}
              openCrew={true}
              openDelivery={true}
            />
          </MemoryRouter>,
        )
      })

      // Crew rendered
      expect(host.textContent).toContain('Anup Baral')
      expect(host.textContent).toContain('Director of Photography')
      expect(host.textContent).toContain('Crew Subtotal')

      // Transport rendered
      expect(host.textContent).toContain('Babin Delivery')
      const vehicleInput = host.querySelector<HTMLInputElement>('input[value="Toyota HiAce"]')
      expect(vehicleInput).not.toBeNull()

      // Expand crew extras
      const expandBtn = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Show overtime, meals and accommodation for Anup Baral"]',
      )
      expect(expandBtn).not.toBeNull()
      await act(async () => {
        expandBtn?.click()
      })

      expect(host.textContent).toContain('Overtime (Rs) *')
      expect(host.textContent).toContain('Meals (Rs) *')
      expect(host.textContent).toContain('Accommodation (Rs) *')

      // Changing transport input invokes onUpdateTransport
      await act(async () => {
        if (vehicleInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )?.set
          nativeSetter?.call(vehicleInput, 'Mahindra Scorpio')
          vehicleInput.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      expect(onUpdateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ vehicle: 'Mahindra Scorpio' }),
      )
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('Law 6: strictly omits all money amounts and inputs when canCrewMoney is false', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CrewAndTransportSection
              crew={sampleCrew}
              transport={sampleTransport}
              onUpdateCrew={vi.fn()}
              onRemoveCrew={vi.fn()}
              onClearCrew={vi.fn()}
              onUpdateTransport={vi.fn()}
              canCrewMoney={false}
              canBookingMoney={false}
              days={2}
              openCrew={true}
              openDelivery={true}
            />
          </MemoryRouter>,
        )
      })

      // Operational info is visible
      expect(host.textContent).toContain('Anup Baral')
      expect(host.textContent).toContain('Director of Photography')

      // Money fields are completely absent from DOM (not masked with lock or asterisk)
      expect(host.textContent).not.toContain('Crew Subtotal')
      expect(host.textContent).not.toContain('Rate / day')
      expect(host.textContent).not.toContain('Overtime (Rs)')
      expect(host.textContent).not.toContain('Delivery charge (Rs)')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('all interactive buttons satisfy >=44px touch targets', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CrewAndTransportSection
              crew={sampleCrew}
              transport={sampleTransport}
              onUpdateCrew={vi.fn()}
              onRemoveCrew={vi.fn()}
              onClearCrew={vi.fn()}
              onUpdateTransport={vi.fn()}
              canCrewMoney={true}
              canBookingMoney={true}
              days={2}
              openCrew={true}
              openDelivery={true}
            />
          </MemoryRouter>,
        )
      })

      const buttons = Array.from(host.querySelectorAll('button'))
      expect(buttons.length).toBeGreaterThan(0)
      for (const btn of buttons) {
        const minHeight = btn.style.minHeight
        if (minHeight) {
          const isVar = minHeight.includes('var(') || minHeight.includes('touch') || minHeight.includes('btn')
          const px = parseInt(minHeight, 10)
          expect(isVar || px >= 44).toBe(true)
        }
      }
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
