// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppSidePanel } from '../AppSidePanel'

let viewport = 'desktop'
vi.mock('../../../lib/device', () => ({ useViewport: () => viewport }))
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  viewport = 'desktop'
  container = document.createElement('div')
  container.className = 'workspace-content'
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

function size(width: number, top = 100) {
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ width, top, bottom: 900, left: 0, right: width, height: 800, x: 0, y: top, toJSON: () => ({}) })
}

describe('AppSidePanel responsive shell', () => {
  it('docks into a wide workspace using the shared panel token', async () => {
    size(1200)
    await act(async () => root.render(<AppSidePanel side="left" title="Filters" isOpen onClose={() => {}}>Content</AppSidePanel>))
    const panel = container.querySelector<HTMLElement>('[role="complementary"]')
    expect(panel?.style.width).toBe('var(--app-panel-width, 320px)')
    expect(document.querySelector('.app-panel-overlay')).toBeNull()
  })

  it('overlays a narrow workspace and starts below banners and header', async () => {
    size(704, 134)
    viewport = 'tablet'
    await act(async () => root.render(<AppSidePanel side="left" title="Filters" isOpen onClose={() => {}}>Content</AppSidePanel>))
    const overlay = document.querySelector<HTMLElement>('.app-panel-overlay')
    expect(overlay?.style.inset).toBe('134px 0 0')
    expect(overlay?.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
    expect(container.inert).toBe(true)
  })

  it('traps keyboard focus, closes with Escape, and restores its trigger', async () => {
    size(390, 130)
    viewport = 'phone'
    function Example() {
      const [open, setOpen] = useState(false)
      return <><button onClick={() => setOpen(true)}>Open filters</button><AppSidePanel side="left" title="Filters" isOpen={open} onClose={() => setOpen(false)}><button>Apply</button></AppSidePanel></>
    }
    await act(async () => root.render(<Example />))
    const trigger = container.querySelector('button')!
    trigger.focus()
    await act(async () => trigger.click())
    const close = document.querySelector<HTMLButtonElement>('[aria-label="Close panel"]')!
    expect(document.activeElement).toBe(close)
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    expect(document.activeElement?.textContent).toBe('Apply')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(container.inert).not.toBe(true)
  })
})
