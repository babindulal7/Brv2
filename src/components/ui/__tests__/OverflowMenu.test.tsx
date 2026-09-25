// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverflowMenu } from '../OverflowMenu'

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
    const actions = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    expect(document.activeElement).toBe(actions[0])

    act(() => actions[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement).toBe(actions[2])

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})
