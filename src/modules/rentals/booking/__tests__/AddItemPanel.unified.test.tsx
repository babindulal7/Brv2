// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AddItemPanel } from '../AddItemPanel'
import { NO_WINDOW } from '../itemCatalogue'
import { rupees } from '../../../../lib/money'
import type { CrewMember } from '../../../../lib/queries/crew'
import type { TransportOption } from '../itemCatalogue'

vi.mock('../../../../lib/device', () => ({ useViewport: () => 'desktop' }))

describe('AddItemPanel unified search and recenter', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  const sampleCrew: CrewMember[] = [
    {
      id: 'crew-1',
      name: 'Babin Shrestha',
      role: 'Director of Photography',
      phone: '9841234567',
      state: 'Available',
      dayRatePaisa: rupees(15000),
    },
  ]

  const sampleTransport: TransportOption[] = [
    {
      id: 'pickup',
      name: 'Client Pickup',
      type: 'Client Pickup',
      ratePaisa: rupees(0),
    },
    {
      id: 'delivery',
      name: 'Babin Delivery',
      type: 'Babin Delivery',
      ratePaisa: rupees(5000),
    },
  ]

  it('triggers recenterSearch on search input click/focus', async () => {
    const scrollToMock = vi.fn()
    window.scrollTo = scrollToMock

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () =>
        root.render(
          <AddItemPanel
            inline
            window={NO_WINDOW}
            days={1}
            existingLineIds={[]}
            equipment={[]}
            bundles={[]}
            crew={sampleCrew}
            transport={sampleTransport}
            onAdd={vi.fn()}
          />,
        ),
      )

      const input = host.querySelector<HTMLInputElement>('input[role="combobox"]')!
      expect(input).toBeTruthy()

      await act(async () => {
        input.focus()
      })

      expect(scrollToMock).toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('renders crew and transport results and invokes respective callbacks', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onAddCrew = vi.fn()
    const onSelectTransport = vi.fn()

    try {
      await act(async () =>
        root.render(
          <AddItemPanel
            inline
            window={NO_WINDOW}
            days={1}
            existingLineIds={[]}
            equipment={[]}
            bundles={[]}
            crew={sampleCrew}
            transport={sampleTransport}
            existingCrewIds={[]}
            selectedTransportType="Client Pickup"
            onAdd={vi.fn()}
            onAddCrew={onAddCrew}
            onSelectTransport={onSelectTransport}
          />,
        ),
      )

      // Open catalogue via browse button
      const browseBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')
      expect(browseBtn).toBeTruthy()
      await act(async () => {
        browseBtn?.click()
      })

      // Dialogue is open now, let's type 'Babin' into search input
      const input = host.querySelector<HTMLInputElement>('input[role="combobox"]')!
      const change = (value: string) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }

      await act(async () => change('Babin'))

      expect(document.body.textContent).toContain('Babin Shrestha')
      expect(document.body.textContent).toContain('Director of Photography')

      const crewAddBtn = document.body.querySelector<HTMLElement>('li[role="option"] [role="presentation"]')
      expect(crewAddBtn).toBeTruthy()
      await act(async () => {
        crewAddBtn?.click()
      })
      expect(onAddCrew).toHaveBeenCalledWith('crew-1')

      // Search for transport mode
      await act(async () => change('Delivery'))
      expect(document.body.textContent).toContain('Babin Delivery')

      const deliveryOption = document.body.querySelector<HTMLElement>('li[role="option"]')
      expect(deliveryOption).toBeTruthy()

      await act(async () => {
        deliveryOption?.click()
      })
      expect(onSelectTransport).toHaveBeenCalledWith('Babin Delivery')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
