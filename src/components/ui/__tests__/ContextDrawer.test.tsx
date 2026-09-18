// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ContextDrawer } from '../ContextDrawer'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

function drawer(open = true, onClose = () => {}) {
  return (
    <ContextDrawer id="rental-context" open={open} onClose={onClose} title="BR-2083-0142" subtitle="Himalayan Films">
      <button type="button">First action</button>
      <button type="button">Last action</button>
    </ContextDrawer>
  )
}

function mount(open = true, onClose = () => {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(drawer(open, onClose)))
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
    expect(container?.textContent).toContain('First action')
  })

  it('closes on Escape', () => {
    let closes = 0
    mount(true, () => { closes += 1 })
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(closes).toBe(1)
  })

  it('traps Tab within the panel on phone', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    mount()
    const panel = container?.querySelector<HTMLElement>('[role="dialog"]')
    const buttons = panel?.querySelectorAll<HTMLButtonElement>('button')
    const first = buttons?.[0]
    const last = buttons?.[buttons.length - 1]
    last?.focus()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(first)
    expect(panel?.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('keeps the closing panel mounted for its exit animation', () => {
    mount()
    act(() => root?.render(drawer(false)))
    expect(container?.querySelector('.context-drawer--closing')).not.toBeNull()
    expect(container?.querySelector('[role="dialog"]')?.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
