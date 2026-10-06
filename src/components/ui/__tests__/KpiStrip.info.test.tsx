// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { KpiStrip } from '../Page'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  if (root) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function render(items: Parameters<typeof KpiStrip>[0]['items']): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(<KpiStrip items={items} />))
  return container
}

describe('KpiStrip extra information lives in one (i) tooltip', () => {
  it('keeps note and definition off the card face and reveals them on hover', () => {
    const c = render([
      { label: 'Revenue', value: 'Rs 10', icon: 'dollar', accent: 'success', note: 'From orders in the period', definition: 'Excl. taxes' },
    ])
    expect(c.textContent).not.toContain('From orders in the period')
    const buttons = c.querySelectorAll('button[aria-label="About Revenue"]')
    expect(buttons).toHaveLength(1)
    act(() => {
      buttons[0]?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      buttons[0]?.dispatchEvent(new FocusEvent('focus'))
    })
    const tip = document.querySelector('[role="tooltip"]')
    expect(tip?.textContent).toContain('Excl. taxes')
    expect(tip?.textContent).toContain('From orders in the period')
  })

  it('shows no tooltip trigger when there is nothing to explain, and keeps `detail` visible', () => {
    const c = render([{ label: 'Open', value: '3', icon: 'box', accent: 'primary', detail: 'Rs 5 receivable' }])
    expect(c.querySelector('button')).toBeNull()
    expect(c.textContent).toContain('Rs 5 receivable')
  })
})
