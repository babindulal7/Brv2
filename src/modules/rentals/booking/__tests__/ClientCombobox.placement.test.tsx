// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientCombobox } from '../ClientCombobox'

vi.mock('../../../../lib/queries/clients', () => ({ CLIENTS_DATA: [] }))

const rect = (x: number, y: number, width: number, height: number) => new DOMRect(x, y, width, height)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ClientCombobox placement', () => {
  it.each([true, false])('tracks a smooth-scrolling field and clears phone chrome (footer: %s)', async (withFooter) => {
    vi.stubGlobal('innerWidth', 375)
    vi.stubGlobal('innerHeight', 844)
    const host = document.createElement('main')
    host.id = 'main-content'
    document.body.appendChild(host)
    const root = createRoot(host)
    let inputBounds = rect(34, 850, 201, 44)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === host) return rect(0, 60, 375, 784)
      if (this.getAttribute('aria-label') === 'Rental sections') return rect(16, 60, 343, 58)
      if (this.getAttribute('aria-label') === 'Record actions') return rect(16, 660, 343, 126)
      if (this.getAttribute('aria-label') === 'Main') return rect(0, 660, 375, 58)
      if (this.tagName === 'INPUT') return inputBounds
      return rect(0, 0, 0, 0)
    })
    try {
      await act(async () => root.render(<>
        <nav aria-label="Rental sections" />
        <ClientCombobox clients={[]} selectedClientId={null} onSelect={vi.fn()} onCreateNew={vi.fn()} />
        {withFooter ? <div aria-label="Record actions" /> : <nav aria-label="Main" style={{ position: 'fixed' }} />}
      </>))
      await act(async () => host.querySelector('input')?.focus())
      const popup = document.querySelector('[role="listbox"]')?.parentElement
      expect(popup).not.toBeNull()
      expect(popup?.style.visibility).toBe('hidden')

      inputBounds = rect(34, 224, 201, 44)
      await act(async () => host.dispatchEvent(new Event('scroll')))
      expect(popup?.style.visibility).toBe('visible')
      expect(popup?.style.top).toBe('272px')
      expect(Number.parseFloat(popup?.style.left ?? '')).toBeGreaterThanOrEqual(8)
      expect(Number.parseFloat(popup?.style.left ?? '') + Number.parseFloat(popup?.style.width ?? '')).toBeLessThanOrEqual(367)
      expect(Number.parseFloat(popup?.style.top ?? '') + Number.parseFloat(popup?.style.maxHeight ?? '')).toBeLessThanOrEqual(652)

      inputBounds = rect(34, 600, 201, 44)
      await act(async () => host.dispatchEvent(new Event('scroll')))
      expect(popup?.style.top).toBe('')
      expect(popup?.style.bottom).toBe('248px')
      expect(844 - 248 - Number.parseFloat(popup?.style.maxHeight ?? '')).toBeGreaterThanOrEqual(126)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
