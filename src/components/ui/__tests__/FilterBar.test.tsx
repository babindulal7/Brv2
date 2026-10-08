// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FilterBar, type FilterOption } from '../FilterBar'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

let container: HTMLDivElement
let root: Root

function mount(node: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(node))
}

beforeEach(() => setWidth(1280))

afterEach(() => {
  if (root) act(() => root.unmount())
  container?.remove()
})

const sampleOptions: readonly FilterOption[] = [
  { id: 'all', label: 'All', count: 42 },
  { id: 'active', label: 'Active', count: 18 },
  { id: 'completed', label: 'Completed', count: 24 },
]

describe('FilterBar Component', () => {
  it('renders a search landmark with accessible label', () => {
    mount(<FilterBar />)
    const searchRegion = container.querySelector('[role="search"]')
    expect(searchRegion).not.toBeNull()
    expect(searchRegion?.getAttribute('aria-label')).toBe('Table filters')
  })

  it('handles search input and typing callbacks', () => {
    const handleSearch = vi.fn()
    mount(
      <FilterBar
        search="generator"
        onSearchChange={handleSearch}
        searchPlaceholder="Search equipment…"
      />
    )

    const input = container.querySelector('input')
    expect(input).not.toBeNull()
    expect(input?.value).toBe('generator')
    expect(input?.placeholder).toBe('Search equipment…')

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeSetter?.call(input, 'cables')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(handleSearch).toHaveBeenCalledWith('cables')
  })

  it('renders a clear search button when search text is present and clears on click', () => {
    const handleSearch = vi.fn()
    mount(
      <FilterBar
        search="cameras"
        onSearchChange={handleSearch}
      />
    )

    const clearBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Clear search"], button[aria-label="Clear"]')
    expect(clearBtn).not.toBeNull()

    act(() => {
      clearBtn!.click()
    })

    expect(handleSearch).toHaveBeenCalledWith('')
  })

  it('clears search when pressing Escape in the input', () => {
    const handleSearch = vi.fn()
    mount(
      <FilterBar
        search="lighting"
        onSearchChange={handleSearch}
      />
    )

    const input = container.querySelector('input')
    expect(input).not.toBeNull()

    act(() => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(handleSearch).toHaveBeenCalledWith('')
  })

  it('renders quick filter options with correct labels, counts, and aria-pressed state', () => {
    const handleSelect = vi.fn()
    mount(
      <FilterBar
        options={sampleOptions}
        selectedOptionId="active"
        onSelectOption={handleSelect}
      />
    )

    const buttons = container.querySelectorAll<HTMLButtonElement>('[role="group"] button')
    expect(buttons.length).toBe(3)

    expect(buttons[0]!.textContent).toContain('All')
    expect(buttons[0]!.textContent).toContain('42')
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('false')

    expect(buttons[1]!.textContent).toContain('Active')
    expect(buttons[1]!.textContent).toContain('18')
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true')

    act(() => {
      buttons[2]!.click()
    })

    expect(handleSelect).toHaveBeenCalledWith('completed')
  })

  it('supports multi-select options using selectedOptionIds and onToggleOptionId', () => {
    const handleToggle = vi.fn()
    const selected = new Set(['all', 'completed'])

    mount(
      <FilterBar
        options={sampleOptions}
        selectedOptionIds={selected}
        onToggleOptionId={handleToggle}
      />
    )

    const buttons = container.querySelectorAll<HTMLButtonElement>('[role="group"] button')
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('false')
    expect(buttons[2]!.getAttribute('aria-pressed')).toBe('true')

    act(() => {
      buttons[1]!.click()
    })

    expect(handleToggle).toHaveBeenCalledWith('active')
  })

  it('renders filter drawer trigger button with aria-expanded and aria-controls', () => {
    const handleToggleDrawer = vi.fn()
    mount(
      <FilterBar
        onToggleDrawer={handleToggleDrawer}
        isDrawerOpen={true}
        drawerControlsId="rental-filter-drawer"
      />
    )

    const filterBtn = container.querySelector<HTMLButtonElement>('button[aria-controls="rental-filter-drawer"]')
    expect(filterBtn).not.toBeNull()
    expect(filterBtn?.getAttribute('aria-expanded')).toBe('true')

    act(() => {
      filterBtn!.click()
    })

    expect(handleToggleDrawer).toHaveBeenCalled()
  })

  it('renders active filter count badge and clear all button when activeCount > 0', () => {
    const handleClearAll = vi.fn()
    mount(
      <FilterBar
        activeCount={3}
        onClearAll={handleClearAll}
      />
    )

    expect(container.textContent).toContain('3')
    const clearAllBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Clear all applied filters"]')
    expect(clearAllBtn).not.toBeNull()
    expect(clearAllBtn?.textContent).toBe('Clear all')

    act(() => {
      clearAllBtn!.click()
    })

    expect(handleClearAll).toHaveBeenCalled()
  })

  it('renders right slot content and filter chips cleanly', () => {
    mount(
      <FilterBar
        rightSlot={<button id="export-btn">Export CSV</button>}
        filterChips={<div id="chips">Status: Pending</div>}
      />
    )

    expect(container.querySelector('#export-btn')).not.toBeNull()
    expect(container.querySelector('#chips')).not.toBeNull()
  })
})
