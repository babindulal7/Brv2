// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ContextDrawer } from '../ContextDrawer'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

function mount(open = true, onClose = () => {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(
    <ContextDrawer id="rental-context" open={open} onClose={onClose} title="BR-2083-0142" subtitle="Himalayan Films">
      <p>Rental details</p>
    </ContextDrawer>
  ))
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  document.body.style.overflow = ''
})

describe('ContextDrawer', () => {
  it('does not render when closed', () => {
    mount(false)
    expect(container?.innerHTML).toBe('')
  })

  it('exposes a labelled non-modal desktop inspector', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    mount()
    const drawer = container?.querySelector('[role="dialog"]')
    expect(drawer?.getAttribute('aria-labelledby')).toBe('rental-context-title')
    expect(drawer?.getAttribute('aria-modal')).toBeNull()
    expect(container?.textContent).toContain('Rental details')
  })

  it('closes on Escape', () => {
    let closes = 0
    mount(true, () => { closes += 1 })
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(closes).toBe(1)
  })
})
