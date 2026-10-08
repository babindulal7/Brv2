// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '../SegmentedControl'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('SegmentedControl', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const options = [
    { id: 'first', label: 'First Tab', badge: 3 },
    { id: 'second', label: 'Second Tab' },
    { id: 'third', label: 'Disabled Tab', disabled: true },
  ]

  it('renders all options with role=tab within role=tablist', () => {
    act(() => {
      root.render(<SegmentedControl options={options} value="first" onChange={() => {}} />)
    })
    const tablist = host.querySelector('[role="tablist"]')
    expect(tablist).not.toBeNull()
    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.length).toBe(3)
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false')
    expect(tabs[2]?.disabled).toBe(true)
    expect(tabs[0]?.textContent).toContain('3')
  })

  it('triggers onChange when an inactive tab is clicked', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<SegmentedControl options={options} value="first" onChange={onChange} />)
    })
    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    act(() => {
      tabs[1]?.click()
    })
    expect(onChange).toHaveBeenCalledWith('second')
  })

  it('does not trigger onChange when a disabled or currently active tab is clicked', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<SegmentedControl options={options} value="first" onChange={onChange} />)
    })
    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    act(() => {
      tabs[2]?.click()
    })
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      tabs[0]?.click()
    })
    expect(onChange).not.toHaveBeenCalled()
  })
})
