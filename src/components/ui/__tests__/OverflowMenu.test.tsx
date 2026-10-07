// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverflowMenu } from '../OverflowMenu'
import { PageActions } from '../PageActions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  if (root) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('OverflowMenu keyboard interaction', () => {
  it('focuses actions, skips unavailable actions, and restores focus on Escape', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root?.render(<OverflowMenu items={[
      { label: 'Edit', icon: 'edit', onClick: vi.fn() },
      { label: 'Unavailable', icon: 'close', onClick: vi.fn(), unavailable: 'Not ready' },
      { label: 'Duplicate', icon: 'edit', onClick: vi.fn() },
    ]} />))

    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!
    act(() => trigger.click())
    const actions = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    expect(document.activeElement).toBe(actions[0])

    act(() => actions[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement).toBe(actions[2])

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('escapes a clipped card, flips at the bottom edge, and keeps portal clicks inside', () => {
    container = document.createElement('div')
    container.style.overflow = 'hidden'
    document.body.appendChild(container)
    root = createRoot(container)
    const onClick = vi.fn()
    act(() => root?.render(<OverflowMenu items={[{ label: 'Edit', icon: 'edit', onClick }]} />))
    const trigger = container.querySelector<HTMLButtonElement>('button')!
    trigger.getBoundingClientRect = () => ({ top: window.innerHeight - 44, bottom: window.innerHeight, right: 25 } as DOMRect)
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(300)
    try {
      act(() => trigger.click())
      const menu = document.querySelector<HTMLElement>('[role="menu"]')!
      expect(menu.parentElement).toBe(document.body)
      expect(menu.style.position).toBe('fixed')
      expect(Number.parseFloat(menu.style.left)).toBe(8)
      expect(Number.parseFloat(menu.style.top) + 300).toBeLessThan(window.innerHeight - 44)
      const action = menu.querySelector<HTMLButtonElement>('button')!
      act(() => action.dispatchEvent(new Event('pointerdown', { bubbles: true })))
      expect(document.querySelector('[role="menu"]')).not.toBeNull()
      act(() => action.click())
      expect(onClick).toHaveBeenCalledOnce()
      expect(document.querySelector('[role="menu"]')).toBeNull()
    } finally { height.mockRestore() }
  })

  it('excess page actions also escape their clipped toolbar and remain clickable', () => {
    container = document.createElement('div')
    container.style.overflow = 'hidden'
    document.body.appendChild(container)
    root = createRoot(container)
    const onClick = vi.fn()
    act(() => root?.render(<PageActions secondary={[<button key="1">First</button>, <button key="2">Second</button>, <button key="3" onClick={onClick}>Third</button>]} />))
    act(() => container?.querySelector<HTMLButtonElement>('[aria-label="More actions"]')!.click())
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!
    expect(menu.parentElement).toBe(document.body)
    const action = menu.querySelector<HTMLButtonElement>('[role="menuitem"]')!
    act(() => action.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    act(() => action.click())
    expect(onClick).toHaveBeenCalledOnce()
  })
})
