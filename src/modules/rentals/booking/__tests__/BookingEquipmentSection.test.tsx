// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BookingEquipmentSection } from '../BookingEquipmentSection'
import type { Line } from '../RentalLineItemsTree'
import type { EquipmentAvailabilitySource, EquipmentConflictSummary, BookingWindow } from '../itemCatalogue'
import type { PricingPipelineResult } from '../../../../lib/pricingPipeline'
import { rupees } from '../../../../lib/money'
import { gateContext } from '../../../../lib/fieldGating'

const mockPricing: PricingPipelineResult = {
  equipmentSubtotalPaisa: rupees(40000),
  bundleSubtotalPaisa: rupees(0),
  subRentalSubtotalPaisa: rupees(0),
  servicesSubtotalPaisa: rupees(5000),
  crewSubtotalPaisa: rupees(10000),
  deliverySubtotalPaisa: rupees(2000),
  grossSubtotalPaisa: rupees(57000),
  discounts: {
    rawTotalPercent: 0,
    appliedPercent: 0,
    capped: false,
    discountPaisa: rupees(0),
    sources: [],
    validationErrors: [],
  },
  taxableSubtotalPaisa: rupees(57000),
  vatRatePercent: 13,
  vatPaisa: rupees(7410),
  rentalTotalPaisa: rupees(64410),
  securityDeposit: {
    recommendedPaisa: rupees(20000),
    overridden: false,
    requiredPaisa: rupees(20000),
    overrideReason: null,
    authorizedBy: null,
    validationErrors: [],
  },
  advanceRequiredPaisa: rupees(32205),
  grandTotalRequirementPaisa: rupees(96615),
}

const mockLines: Line[] = [
  {
    id: 'line-1',
    name: 'Sony FX3',
    serial: 'FX3-001',
    category: 'Camera',
    qty: 1,
    days: 2,
    ratePaisa: rupees(3500),
    discountPct: 0,
    location: 'Main Warehouse',
    committedTo: '—',
  },
]

const mockBookingWindow: BookingWindow = {
  pickupAd: new Date('2026-10-10T09:00:00Z'),
  returnAd: new Date('2026-10-12T18:00:00Z'),
}

const mockAvailabilitySource: EquipmentAvailabilitySource = {
  state: 'ready',
  byProduct: new Map(),
}

const mockConflictSummary: EquipmentConflictSummary = {
  state: 'ready',
  text: 'All items available',
  conflicts: [],
  verdictByLineId: new Map(),
  checked: 1,
  unchecked: 0,
}

describe('BookingEquipmentSection', () => {
  it('renders section title, badge, and summary with line and unit count', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingEquipmentSection
              open={true}
              onToggle={vi.fn()}
              title="Equipment, Bundles & Services"
              lines={mockLines}
              setLines={vi.fn()}
              totalUnits={1}
              bundleCount={0}
              days={2}
              liveEquipment={[]}
              availabilitySource={mockAvailabilitySource}
              liveBundleResults={[]}
              liveCrew={[]}
              existingCrewIds={[]}
              bookingWindow={mockBookingWindow}
              poolError={null}
              conflictSummary={mockConflictSummary}
              deliveryType="Client Pickup"
              onSelectTransport={vi.fn()}
              onAddCrew={vi.fn()}
              canBookingMoney={true}
              gateContext={gateContext('Owner')}
              user={{ id: 'usr-1', name: 'Owner', role: 'Owner', isSharedDevice: false }}
              navigate={vi.fn()}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).toContain('Equipment, Bundles & Services')
      expect(host.textContent).toContain('1 line · 1 unit')
      expect(host.textContent).toContain('All items available')
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('omits custom charges and services form when money is restricted per Law 6', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingEquipmentSection
              open={true}
              onToggle={vi.fn()}
              title="Equipment, Bundles & Services"
              lines={mockLines}
              setLines={vi.fn()}
              totalUnits={1}
              bundleCount={0}
              days={2}
              liveEquipment={[]}
              availabilitySource={mockAvailabilitySource}
              liveBundleResults={[]}
              liveCrew={[]}
              existingCrewIds={[]}
              bookingWindow={mockBookingWindow}
              poolError={null}
              conflictSummary={mockConflictSummary}
              deliveryType="Client Pickup"
              onSelectTransport={vi.fn()}
              onAddCrew={vi.fn()}
              canBookingMoney={false}
              gateContext={gateContext('Warehouse')}
              user={{ id: 'usr-2', name: 'Warehouse Staff', role: 'Warehouse', isSharedDevice: false }}
              navigate={vi.fn()}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).not.toContain('Services, sub-rentals & custom charges')
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('allows opening custom line form and submitting a manual charge', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const setLines = vi.fn()

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingEquipmentSection
              open={true}
              onToggle={vi.fn()}
              title="Equipment, Bundles & Services"
              lines={mockLines}
              setLines={setLines}
              totalUnits={1}
              bundleCount={0}
              days={2}
              liveEquipment={[]}
              availabilitySource={mockAvailabilitySource}
              liveBundleResults={[]}
              liveCrew={[]}
              existingCrewIds={[]}
              bookingWindow={mockBookingWindow}
              poolError={null}
              conflictSummary={mockConflictSummary}
              deliveryType="Client Pickup"
              onSelectTransport={vi.fn()}
              onAddCrew={vi.fn()}
              canBookingMoney={true}
              gateContext={gateContext('Owner')}
              user={{ id: 'usr-1', name: 'Owner', role: 'Owner', isSharedDevice: false }}
              navigate={vi.fn()}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      const addBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Add custom line'))
      expect(addBtn).toBeDefined()

      await act(async () => {
        addBtn?.click()
      })

      expect(host.textContent).toContain('Close line form')

      const inputs = Array.from(host.querySelectorAll('input'))
      const descInput = inputs.find((i) => i.placeholder?.includes('Operator overtime'))
      const rateInput = inputs.find((i) => i.placeholder === '0')

      expect(descInput).toBeDefined()
      expect(rateInput).toBeDefined()

      if (descInput) {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(descInput, 'Cleaning Fee')
        descInput.dispatchEvent(new Event('input', { bubbles: true }))
        descInput.dispatchEvent(new Event('change', { bubbles: true }))
      }

      if (rateInput) {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(rateInput, '500')
        rateInput.dispatchEvent(new Event('input', { bubbles: true }))
        rateInput.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const submitBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add line')
      expect(submitBtn).toBeDefined()

      await act(async () => {
        submitBtn?.click()
      })

      expect(setLines).toHaveBeenCalled()
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })
})
