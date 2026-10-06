// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { RentalLineItemsTree, type Line } from '../RentalLineItemsTree'
import type { PricingPipelineResult } from '../../../../lib/pricingPipeline'
import { rupees } from '../../../../lib/money'

vi.mock('../../../../lib/device', () => ({ useViewport: () => 'desktop' }))

const mockPricing: PricingPipelineResult = {
  equipmentSubtotalPaisa: rupees(10000),
  bundleSubtotalPaisa: rupees(5000),
  subRentalSubtotalPaisa: rupees(0),
  servicesSubtotalPaisa: rupees(2000),
  crewSubtotalPaisa: rupees(0),
  deliverySubtotalPaisa: rupees(0),
  grossSubtotalPaisa: rupees(17000),
  discounts: {
    rawTotalPercent: 0,
    appliedPercent: 0,
    discountPaisa: rupees(0),
    capped: false,
    sources: [],
    validationErrors: [],
  },
  taxableSubtotalPaisa: rupees(17000),
  vatPaisa: rupees(2210),
  vatRatePercent: 13,
  rentalTotalPaisa: rupees(19210),
  securityDeposit: {
    recommendedPaisa: rupees(5000),
    requiredPaisa: rupees(5000),
    overridden: false,
    overrideReason: null,
    authorizedBy: null,
    validationErrors: [],
  },
  advanceRequiredPaisa: rupees(9605),
  grandTotalRequirementPaisa: rupees(24210),
}

const sampleLines: Line[] = [
  {
    id: 'line-1',
    name: 'Sony FX3',
    serial: 'FX3-001',
    category: 'Cameras',
    ratePaisa: rupees(5000),
    days: 2,
    qty: 1,
    discountPct: 0,
    location: 'Kathmandu HQ',
    committedTo: '—',
  },
  {
    id: 'line-2',
    bundleCode: 'INDIE-KIT',
    bundleName: 'Indie Cinema Kit',
    name: 'Sony 24-70mm GM',
    serial: 'LENS-002',
    category: 'Lenses',
    ratePaisa: rupees(2500),
    days: 2,
    qty: 1,
    discountPct: 0,
    location: 'Kathmandu HQ',
    committedTo: '—',
  },
]

describe('RentalLineItemsTree', () => {
  it('renders empty state when lines array is empty', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <RentalLineItemsTree
              lines={[]}
              setLines={vi.fn()}
              collapsedBundles={{}}
              setCollapsedBundles={vi.fn()}
              canBookingMoney={true}
              conflictSummary={{ conflicts: [], state: 'ready', text: 'All available', verdictByLineId: new Map() }}
              gateContext={{ role: 'Owner', surface: 'default' }}
              user={null}
              navigate={vi.fn()}
              totalUnits={0}
              bundleCount={0}
              days={2}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).toContain('Search above to add equipment or a bundle.')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('renders table, bundles, and item hierarchy with proper labels', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const setCollapsedBundles = vi.fn()

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <RentalLineItemsTree
              lines={sampleLines}
              setLines={vi.fn()}
              collapsedBundles={{}}
              setCollapsedBundles={setCollapsedBundles}
              canBookingMoney={true}
              conflictSummary={{ conflicts: [], state: 'ready', text: 'All available', verdictByLineId: new Map() }}
              gateContext={{ role: 'Owner', surface: 'default' }}
              user={null}
              navigate={vi.fn()}
              totalUnits={2}
              bundleCount={1}
              days={2}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).toContain('Sony FX3')
      expect(host.textContent).toContain('Indie Cinema Kit')
      expect(host.textContent).toContain('Sony 24-70mm GM')

      const bundleToggle = host.querySelector<HTMLButtonElement>('.new-rental-bundle-toggle')
      expect(bundleToggle).not.toBeNull()
      expect(bundleToggle?.getAttribute('aria-expanded')).toBe('true')

      await act(async () => {
        bundleToggle?.click()
      })
      expect(setCollapsedBundles).toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('enforces strict money-blindness when canBookingMoney is false (Law 6)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <RentalLineItemsTree
              lines={sampleLines}
              setLines={vi.fn()}
              collapsedBundles={{}}
              setCollapsedBundles={vi.fn()}
              canBookingMoney={false}
              conflictSummary={{ conflicts: [], state: 'ready', text: 'All available', verdictByLineId: new Map() }}
              gateContext={{ role: 'Warehouse', surface: 'default' }}
              user={null}
              navigate={vi.fn()}
              totalUnits={2}
              bundleCount={1}
              days={2}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).not.toContain('Rate / day')
      expect(host.textContent).not.toContain('Disc.')
      expect(host.textContent).not.toContain('Amount')
      expect(host.textContent).not.toContain('Line Subtotal')
      expect(host.textContent).toContain('Sony FX3')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('triggers item removal via line remove button', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const setLines = vi.fn()

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <RentalLineItemsTree
              lines={sampleLines}
              setLines={setLines}
              collapsedBundles={{}}
              setCollapsedBundles={vi.fn()}
              canBookingMoney={true}
              conflictSummary={{ conflicts: [], state: 'ready', text: 'All available', verdictByLineId: new Map() }}
              gateContext={{ role: 'Owner', surface: 'default' }}
              user={null}
              navigate={vi.fn()}
              totalUnits={2}
              bundleCount={1}
              days={2}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      // Child item in bundle renders the direct compact remove button
      const childRemoveBtn = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove Sony 24-70mm GM from this booking"]',
      )
      expect(childRemoveBtn).not.toBeNull()

      await act(async () => {
        childRemoveBtn?.click()
      })
      expect(setLines).toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
