// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/queries/useList', () => ({
  useList: () => ({
    rows: [],
    loading: false,
    error: null,
    isEmpty: true,
    isFiltered: false,
    total: 0,
    refetch: () => {},
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Today } = await import('../Today')
let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/dashboard']}><Today /></MemoryRouter>)
  })
}

const buttons = () => [...container.querySelectorAll('button')]
const buttonByLabel = (label: string) => buttons().find((button) => button.getAttribute('aria-label') === label)

beforeEach(() => window.sessionStorage.clear())
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('focused pickup and return dashboard', () => {
  it('renders only the two operational panels', async () => {
    await mount()
    expect(container.textContent).toContain('Pickups')
    expect(container.textContent).toContain('Returns')
    expect(container.textContent).not.toContain('Quick Actions')
    expect(container.textContent).not.toContain("Today's Timeline")
    expect(container.textContent).not.toContain('Cash due')
  })

  it('gives each panel its own accessible calendar control', async () => {
    await mount()
    expect(buttonByLabel('Choose pickup date filter')).toBeDefined()
    expect(buttonByLabel('Choose return date filter')).toBeDefined()
  })

  it('changes the pickup period without changing returns', async () => {
    await mount()
    const pickup = buttonByLabel('Choose pickup date filter')
    const returns = buttonByLabel('Choose return date filter')
    expect(pickup?.textContent).toContain('Today')
    expect(returns?.textContent).toContain('Today')

    await act(async () => pickup?.click())
    const tomorrow = buttons().find((button) => button.textContent === 'Tomorrow')
    await act(async () => tomorrow?.click())

    expect(buttonByLabel('Choose pickup date filter')?.textContent).toContain('Tomorrow')
    expect(buttonByLabel('Choose return date filter')?.textContent).toContain('Today')
  })

  it('opens a calendar dialog anchored to the selected panel', async () => {
    await mount()
    await act(async () => buttonByLabel('Choose return date filter')?.click())
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('return date filter')
    expect(buttonByLabel('Choose pickup date filter')?.getAttribute('aria-expanded')).toBe('false')
    expect(buttonByLabel('Choose return date filter')?.getAttribute('aria-expanded')).toBe('true')
  })
})
