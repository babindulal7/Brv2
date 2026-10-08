// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Select } from '../Select'
import { DateField } from '../DateField'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// jsdom has no layout; the highlight-scroll effect only needs the call to exist.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

let container: HTMLDivElement
let root: Root

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  // Simulate a clipping scroll container (table shell): a portaled popup
  // must escape this, an inline one would be cut off by it.
  container.style.overflowX = 'auto'
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(node)
  })
}

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

describe('popup portal regression', () => {
  it('Select renders its open listbox in document.body, fixed', async () => {
    await mount(
      <Select defaultValue="a">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </Select>,
    )
    const trigger = container.querySelector('[role="combobox"]') as HTMLButtonElement
    expect(trigger).not.toBeNull()
    await act(async () => trigger.click())
    const listbox = document.querySelector('[role="listbox"]') as HTMLElement
    expect(listbox).not.toBeNull()
    expect(listbox.parentElement).toBe(document.body)
    expect(listbox.style.position).toBe('fixed')
    expect(container.contains(listbox)).toBe(false)
  })

  it('Select closes when its portaled option is picked', async () => {
    await mount(
      <Select defaultValue="a">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </Select>,
    )
    await act(async () => (container.querySelector('[role="combobox"]') as HTMLButtonElement).click())
    const beta = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'Beta') as HTMLElement
    expect(beta).toBeDefined()
    await act(async () => beta.click())
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('DateField renders its open calendar in document.body, fixed', async () => {
    await mount(<DateField value="" onChange={() => {}} ariaLabel="purchase date" />)
    const trigger = container.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement
    expect(trigger).not.toBeNull()
    await act(async () => trigger.click())
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    // The portaled zero-size anchor wrapper carries the fixed positioning.
    const anchor = dialog.parentElement as HTMLElement
    expect(anchor.style.position).toBe('fixed')
    expect(anchor.parentElement).toBe(document.body)
    expect(container.contains(dialog)).toBe(false)
  })

  it('Select stays within viewport edges and above its owning modal', async () => {
    await mount(<div role="dialog" aria-modal="true"><Select defaultValue="a"><option value="a">Alpha</option></Select></div>)
    const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]')!
    trigger.getBoundingClientRect = () => ({ top: 100, bottom: window.innerHeight - 190, left: window.innerWidth - 30, width: 180 } as DOMRect)
    await act(async () => trigger.click())
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!
    expect(Number.parseFloat(list.style.left) + Number.parseFloat(list.style.width)).toBeLessThanOrEqual(window.innerWidth - 8)
    expect(Number.parseFloat(list.style.top) + Number.parseFloat(list.style.maxHeight)).toBeLessThanOrEqual(window.innerHeight - 8)
    expect(list.style.zIndex).toBe('calc(var(--z-modal) + 1)')
  })

  it('DateField calendar stays above its owning modal', async () => {
    await mount(<div role="dialog" aria-modal="true"><DateField value="" onChange={() => {}} ariaLabel="purchase date" /></div>)
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!.click())
    const calendar = document.querySelector<HTMLElement>('[role="dialog"][aria-label]')!
    expect(calendar.parentElement?.style.zIndex).toBe('calc(var(--z-modal) + 1)')
  })
})
