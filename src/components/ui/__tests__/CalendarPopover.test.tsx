// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarPopover } from '../DateField'
import { CheckAvailabilityModal } from '../CheckAvailabilityModal'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('CalendarPopover & Date Selection UI (Booqable Availability & Range Spec)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
  })

  it('renders title, close button, and Monday-first weekdays (MO TU WE TH FR SA SU)', () => {
    act(() => {
      root!.render(
        <CalendarPopover
          value="2026-07-22"
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
          title="Check availability"
        />
      )
    })

    expect(host!.textContent).toContain('Check availability')
    expect(host!.querySelector('button[aria-label="Close calendar"]')).not.toBeNull()

    const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
    for (const d of weekdays) {
      expect(host!.textContent).toContain(d)
    }
  })

  it('renders Quantity stepper when showQuantity is enabled and updates quantity', () => {
    const onQtyChange = vi.fn()
    act(() => {
      root!.render(
        <CalendarPopover
          value="2026-07-22"
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
          showQuantity={true}
          quantity={2}
          onQuantityChange={onQtyChange}
        />
      )
    })

    expect(host!.textContent).toContain('Quantity')
    const qtyDisplay = host!.querySelector('#calendar-popover-qty')
    expect(qtyDisplay?.textContent).toBe('2')

    const incBtn = host!.querySelector('button[aria-label="Increase quantity"]') as HTMLButtonElement
    const decBtn = host!.querySelector('button[aria-label="Decrease quantity"]') as HTMLButtonElement

    act(() => {
      incBtn.click()
    })
    expect(onQtyChange).toHaveBeenCalledWith(3)

    act(() => {
      decBtn.click()
    })
    expect(onQtyChange).toHaveBeenCalledWith(1)
  })

  it('renders color-coded availability badges (green, amber, red) on day cells', () => {
    const availabilityMap: Record<string, number> = {
      '2026-07-22': 9, // Green
      '2026-07-25': 1, // Amber when qty=2
      '2026-07-26': 0, // Red
    }

    act(() => {
      root!.render(
        <CalendarPopover
          value="2026-07-22"
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
          quantity={2}
          availability={availabilityMap}
        />
      )
    })

    const cell22 = host!.querySelector('button[aria-label*="22/7/2026"]') as HTMLButtonElement
    const cell25 = host!.querySelector('button[aria-label*="25/7/2026"]') as HTMLButtonElement
    const cell26 = host!.querySelector('button[aria-label*="26/7/2026"]') as HTMLButtonElement

    expect(cell22).not.toBeNull()
    expect(cell22.style.background).toBe('rgb(72, 187, 120)') // #48BB78 Green
    expect(cell22.textContent).toContain('9')

    expect(cell25).not.toBeNull()
    expect(cell25.style.background).toBe('rgb(246, 173, 85)') // #F6AD55 Amber
    expect(cell25.textContent).toContain('1')

    expect(cell26).not.toBeNull()
    expect(cell26.style.background).toBe('rgb(245, 101, 101)') // #F56565 Red
    expect(cell26.textContent).toContain('0')
  })

  it('renders range selection capsule outline across selected date bounds', () => {
    act(() => {
      root!.render(
        <CalendarPopover
          range={{ from: '2026-07-22', to: '2026-07-24' }}
          onSelectRange={vi.fn()}
          onDismiss={vi.fn()}
        />
      )
    })

    const startWrapper = host!.querySelector('button[aria-label*="22/7/2026"]')?.parentElement as HTMLDivElement
    const midWrapper = host!.querySelector('button[aria-label*="23/7/2026"]')?.parentElement as HTMLDivElement
    const endWrapper = host!.querySelector('button[aria-label*="24/7/2026"]')?.parentElement as HTMLDivElement

    expect(startWrapper).not.toBeNull()
    expect(midWrapper).not.toBeNull()
    expect(endWrapper).not.toBeNull()

    // Start cell has left rounded border
    expect(startWrapper.style.borderTopLeftRadius).toBe('9999px')
    expect(startWrapper.style.borderBottomLeftRadius).toBe('9999px')

    // End cell has right rounded border
    expect(endWrapper.style.borderTopRightRadius).toBe('9999px')
    expect(endWrapper.style.borderBottomRightRadius).toBe('9999px')
  })

  it('navigates months with previous and next chevron buttons', () => {
    act(() => {
      root!.render(
        <CalendarPopover
          value="2026-07-15"
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
        />
      )
    })

    expect(host!.textContent).toContain('July 2026')

    const nextBtn = host!.querySelector('button[aria-label="Next month"]') as HTMLButtonElement
    act(() => {
      nextBtn.click()
    })

    expect(host!.textContent).toContain('August 2026')

    const prevBtn = host!.querySelector('button[aria-label="Previous month"]') as HTMLButtonElement
    act(() => {
      prevBtn.click()
    })

    expect(host!.textContent).toContain('July 2026')
  })

  it('renders CheckAvailabilityModal with product details and calendar', () => {
    const onApply = vi.fn()
    act(() => {
      root!.render(
        <CheckAvailabilityModal
          open={true}
          onClose={vi.fn()}
          productTitle="Wooden ceremonial platform"
          productRate="$120.00 / 2 days"
          productDescription="Crafted from premium, sustainably-sourced timber."
          stockOnHand={9}
          initialRange={{ from: '2026-07-22', to: '2026-07-24' }}
          onApplyRange={onApply}
        />
      )
    })

    expect(document.body.textContent).toContain('Wooden ceremonial platform')
    expect(document.body.textContent).toContain('$120.00 / 2 days')
    expect(document.body.textContent).toContain('9 available')
    expect(document.body.textContent).toContain('Check availability')

    const applyBtn = document.body.querySelector('button.press:last-child') as HTMLButtonElement
    expect(applyBtn).not.toBeNull()
    expect(document.body.textContent).toContain('Apply Range')
  })

  it('renders CheckAvailabilityModal with product selector when products list is passed', () => {
    const products = [
      { id: 'p1', name: 'Sony FX3 Cinema Camera', totalQuantity: 4, dailyRate: 3500 },
      { id: 'p2', name: 'Aputure 600d Pro', totalQuantity: 2, dailyRate: 2000 },
    ]
    const onProductChange = vi.fn()

    act(() => {
      root!.render(
        <CheckAvailabilityModal
          open={true}
          onClose={vi.fn()}
          products={products}
          onProductChange={onProductChange}
        />
      )
    })

    expect(document.body.textContent).toContain('Sony FX3 Cinema Camera')
    const selectEl = document.body.querySelector('#check-avail-product-select') as HTMLSelectElement
    expect(selectEl).not.toBeNull()
    expect(selectEl.options.length).toBe(2)

    act(() => {
      selectEl.value = 'p2'
      selectEl.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onProductChange).toHaveBeenCalledWith('p2')
  })
})

