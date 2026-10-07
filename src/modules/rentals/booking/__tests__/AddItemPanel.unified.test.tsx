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

  it('expands inside a clipped section and scrolls the workspace to its heading', async () => {
    const scrollToMock = vi.fn()
    window.scrollTo = scrollToMock

    const host = document.createElement('div')
    host.id = 'main-content'
    host.scrollTo = vi.fn()
    host.getBoundingClientRect = () => ({ top: 60 } as DOMRect)
    document.body.appendChild(host)
    const root = createRoot(host)
    const panelRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: this.getAttribute('aria-label') === 'Add item to booking' ? 325 : 0 } as DOMRect
    })

    try {
      await act(async () =>
        root.render(
          <><section style={{ overflow: 'hidden' }}><h2>Equipment</h2><AddItemPanel
            inline
            window={NO_WINDOW}
            days={1}
            existingLineIds={[]}
            equipment={[]}
            bundles={[]}
            crew={sampleCrew}
            transport={sampleTransport}
            onAdd={vi.fn()}
          /></section><div aria-label="Record actions" /></>,
        ),
      )

      const input = host.querySelector<HTMLInputElement>('input[role="combobox"]')!
      expect(input).toBeTruthy()
      host.querySelector('section')!.getBoundingClientRect = () => ({ top: 200 } as DOMRect)
      host.querySelector<HTMLElement>('[aria-label="Record actions"]')!.getBoundingClientRect = () => ({ top: 650 } as DOMRect)

      await act(async () => {
        input.focus()
      })

      expect(host.scrollTo).toHaveBeenCalledWith({ top: 128, behavior: 'smooth' })
      expect(scrollToMock).not.toHaveBeenCalled()
      const panel = host.querySelector<HTMLElement>('[aria-label="Add item to booking"]')!
      expect(panel.style.position).toBe('relative')
      expect(panel.style.maxHeight).toBe('441px')
      expect(host.querySelector('section')!.scrollTop).toBe(0)
    } finally {
      await act(async () => root.unmount())
      host.remove()
      panelRect.mockRestore()
    }
  })

  it('keeps crew and transport outside the equipment catalogue', async () => {
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

      expect(document.body.textContent).not.toContain('Babin Shrestha')
      expect(document.body.textContent).not.toContain('Director of Photography')

      const crewAddBtn = document.body.querySelector<HTMLElement>('li[role="option"] button, li[role="option"] [role="presentation"]')
      expect(crewAddBtn).toBeNull()
      await act(async () => {
        crewAddBtn?.click()
      })
      expect(onAddCrew).not.toHaveBeenCalled()

      // Search for transport mode
      await act(async () => change('Delivery'))
      expect(document.body.textContent).not.toContain('Babin Delivery')

      const deliveryOption = document.body.querySelector<HTMLElement>('li[role="option"]')
      expect(deliveryOption).toBeNull()

      await act(async () => {
        deliveryOption?.click()
      })
      expect(onSelectTransport).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
