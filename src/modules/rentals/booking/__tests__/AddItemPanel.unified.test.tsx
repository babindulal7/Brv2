// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AddItemPanel } from '../AddItemPanel'
import { NO_WINDOW } from '../itemCatalogue'
import { rupees } from '../../../../lib/money'
import type { CrewMember } from '../../../../lib/queries/crew'
import type { TransportOption } from '../itemCatalogue'

const viewport = vi.hoisted(() => ({ current: 'desktop' }))
vi.mock('../../../../lib/device', () => ({ useViewport: () => viewport.current }))

describe('AddItemPanel unified search and recenter', () => {
  beforeEach(() => {
    viewport.current = 'desktop'
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

  it('keeps phone filters out of the result area until requested and retains active values when closed', async () => {
    viewport.current = 'phone'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const panel = <AddItemPanel inline window={NO_WINDOW} days={1} existingLineIds={[]} onAdd={vi.fn()} />

    try {
      await act(async () => root.render(panel))
      await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!.click())
      const toggle = host.querySelector<HTMLButtonElement>('.new-rental-equipment-catalogue-filter-toggle')!
      const filters = document.getElementById(toggle.getAttribute('aria-controls')!)!
      expect(toggle.hidden).toBe(false)
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      expect(filters.hidden).toBe(true)
      expect(host.querySelector('[aria-label="Catalogue results"]')).toBeTruthy()

      await act(async () => toggle.click())
      expect(filters.hidden).toBe(false)
      const availability = filters.querySelector<HTMLSelectElement>('[aria-label="Filter by availability"]')!
      const sort = filters.querySelector<HTMLSelectElement>('[aria-label="Sort results"]')!
      await act(async () => {
        availability.value = 'available'
        availability.dispatchEvent(new Event('change', { bubbles: true }))
        sort.value = sort.options[1]!.value
        sort.dispatchEvent(new Event('change', { bubbles: true }))
      })
      const selectedSort = sort.selectedOptions[0]!.textContent!
      const filteredResults = host.querySelector('[aria-label="Catalogue results"]')!.textContent
      await act(async () => toggle.click())
      expect(filters.hidden).toBe(true)
      expect(availability.value).toBe('available')
      expect(host.querySelector('.new-rental-equipment-catalogue-filter-summary')!.textContent).toContain('Available only')
      expect(host.querySelector('.new-rental-equipment-catalogue-filter-summary')!.textContent).toContain(selectedSort)
      expect(host.querySelector('[aria-label="Catalogue results"]')!.textContent).toBe(filteredResults)

      // Growing to desktop restores the controls without resetting their values.
      viewport.current = 'desktop'
      await act(async () => root.render(<AddItemPanel inline window={NO_WINDOW} days={1} existingLineIds={[]} onAdd={vi.fn()} />))
      expect(toggle.hidden).toBe(true)
      expect(filters.hidden).toBe(false)
      expect(availability.value).toBe('available')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it.each([true, false])('returns to visible results from phone filters without resetting selections (inline=%s)', async (inline) => {
    viewport.current = 'phone'
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onAdd = vi.fn()

    try {
      await act(async () => root.render(<AddItemPanel inline={inline} window={NO_WINDOW} days={1} existingLineIds={[]} onAdd={onAdd} />))
      const trigger = inline
        ? host.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
        : host.querySelector<HTMLButtonElement>('button[aria-label="Add item — search bundles, equipment and services"]')!
      await act(async () => trigger.click())
      const catalogue = host.querySelector<HTMLElement>('[aria-label="Add item to booking"]')!
      const search = host.querySelector<HTMLInputElement>('input[role="combobox"]')!
      const toggle = host.querySelector<HTMLButtonElement>('.new-rental-equipment-catalogue-filter-toggle')!
      const availability = host.querySelector<HTMLSelectElement>('[aria-label="Filter by availability"]')!
      const sort = host.querySelector<HTMLSelectElement>('[aria-label="Sort results"]')!
      await act(async () => toggle.click())
      await act(async () => {
        availability.value = 'available'
        availability.dispatchEvent(new Event('change', { bubbles: true }))
        sort.value = sort.options[1]!.value
        sort.dispatchEvent(new Event('change', { bubbles: true }))
      })
      const selectedSort = sort.value
      expect(catalogue.classList.contains('is-filtering')).toBe(true)

      await act(async () => search.focus())
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      expect(catalogue.classList.contains('is-filtering')).toBe(false)
      expect(availability.value).toBe('available')
      expect(sort.value).toBe(selectedSort)
      expect(host.querySelector('[aria-label="Catalogue results"]')).toBeTruthy()

      // A query change also reveals results if the input retained focus while
      // a pointer toggled filters. Enter can then act only on visible results.
      await act(async () => toggle.click())
      expect(catalogue.classList.contains('is-filtering')).toBe(true)
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'Sony')
        search.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      expect(catalogue.classList.contains('is-filtering')).toBe(false)
      expect(availability.value).toBe('available')
      expect(sort.value).toBe(selectedSort)
      expect(onAdd).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
    }
  })

  it.each([true, false])('expands inside a clipped section and clears shell chrome (footer: %s)', async (withFooter) => {
    viewport.current = withFooter ? 'desktop' : 'phone'
    const scrollToMock = vi.fn()
    window.scrollTo = scrollToMock

    const host = document.createElement('div')
    host.id = 'main-content'
    host.scrollTo = vi.fn()
    host.getBoundingClientRect = () => new DOMRect(0, 60, 375, 708)
    document.body.appendChild(host)
    const root = createRoot(host)
    const panelRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('aria-label') === 'Main') return new DOMRect(0, 600, 375, 58)
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
          /></section>{withFooter ? <div aria-label="Record actions" /> : <nav aria-label="Main" style={{ position: 'fixed' }} />}</>,
        ),
      )

      const input = host.querySelector<HTMLInputElement>('input[role="combobox"]')!
      expect(input).toBeTruthy()
      host.querySelector('section')!.getBoundingClientRect = () => ({ top: 200 } as DOMRect)
      const footer = host.querySelector<HTMLElement>('[aria-label="Record actions"]')
      if (footer) footer.getBoundingClientRect = () => ({ top: 650 } as DOMRect)

      await act(async () => {
        input.focus()
      })

      expect(host.scrollTo).toHaveBeenCalledWith({ top: 128, behavior: 'smooth' })
      expect(scrollToMock).not.toHaveBeenCalled()
      const panel = host.querySelector<HTMLElement>('[aria-label="Add item to booking"]')!
      expect(panel.style.position).toBe('relative')
      expect(panel.style.maxHeight).toBe(withFooter ? '441px' : '391px')
      if (!withFooter) expect(panel.style.height).toBe('391px')
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
