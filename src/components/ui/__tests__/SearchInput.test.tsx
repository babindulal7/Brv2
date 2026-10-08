// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SearchInput } from '../SearchInput'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

function mount(node: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(node))
}

afterEach(() => {
  if (root) act(() => root.unmount())
  container?.remove()
})

describe('SearchInput Component', () => {
  it('focuses with slash but leaves modified shortcuts and editable notes alone', () => {
    mount(<><SearchInput value="" onChange={() => {}} autoFocusShortcut /><div contentEditable><span>Note</span></div></>)
    const input = container.querySelector('input')!
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })))
    expect(document.activeElement).toBe(input)
    input.blur()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true })))
    expect(document.activeElement).not.toBe(input)
    act(() => container.querySelector('[contenteditable] span')!.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })))
    expect(document.activeElement).not.toBe(input)
  })

  it('does not steal focus from a modal workflow', () => {
    mount(<><SearchInput value="" onChange={() => {}} autoFocusShortcut /><div role="dialog" aria-modal="true"><button>Continue</button></div></>)
    const button = container.querySelector('button')!
    button.focus()
    act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })))
    expect(document.activeElement).toBe(button)
  })

  it('renders a searchbox with 44px minimum touch target (Law 15)', () => {
    mount(<SearchInput value="" onChange={() => {}} placeholder="Search rentals…" />)
    const input = container.querySelector('input')
    expect(input).not.toBeNull()
    expect(input?.getAttribute('type')).toBe('search')
    expect(input?.getAttribute('role')).toBe('searchbox')
    expect(input?.placeholder).toBe('Search rentals…')
    expect(input?.style.minHeight).toBe('44px')
  })

  it('renders a search icon with clearance so text never collides', () => {
    mount(<SearchInput value="" onChange={() => {}} />)
    const input = container.querySelector('input')
    expect(input?.style.paddingLeft).toBe('38px')
    const icon = container.querySelector('svg')
    expect(icon).not.toBeNull()
  })

  it('calls onChange when user types', () => {
    const handleChange = vi.fn()
    mount(<SearchInput value="" onChange={handleChange} />)
    const input = container.querySelector('input')!

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeSetter?.call(input, 'Alexa Mini')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(handleChange).toHaveBeenCalledWith('Alexa Mini')
  })

  it('renders an accessible clear button when query is present', () => {
    const handleClear = vi.fn()
    mount(<SearchInput value="Sony FX3" onChange={() => {}} onClear={handleClear} />)
    const clearBtn = container.querySelector('button[aria-label="Clear search"]')
    expect(clearBtn).not.toBeNull()

    act(() => {
      clearBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(handleClear).toHaveBeenCalledTimes(1)
  })

  it('clears query and stops propagation when Escape is pressed', () => {
    const handleChange = vi.fn()
    const handleClear = vi.fn()
    mount(<SearchInput value="Arri" onChange={handleChange} onClear={handleClear} />)
    const input = container.querySelector('input')!

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(handleClear).toHaveBeenCalledTimes(1)
  })

  it('triggers onSearchSubmit on Enter key', () => {
    const handleSubmit = vi.fn()
    mount(<SearchInput value="RED V-Raptor" onChange={() => {}} onSearchSubmit={handleSubmit} />)
    const input = container.querySelector('input')!

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(handleSubmit).toHaveBeenCalledWith('RED V-Raptor')
  })

  it('renders a shortcut hint badge when empty and hint is provided', () => {
    mount(<SearchInput value="" onChange={() => {}} shortcutHint="/" />)
    const kbd = container.querySelector('kbd')
    expect(kbd).not.toBeNull()
    expect(kbd?.textContent).toBe('/')
  })
})
