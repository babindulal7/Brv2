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

vi.mock('../../../modules/operations/OperationsWorkspaceContext', () => ({
  useOperationsWorkspace: () => ({
    openOperations: vi.fn(),
    closeOperations: vi.fn(),
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

  it('does not contain a duplicate New Rental button in the page header', async () => {
    await mount()
    const header = container.querySelector('.page-header')
    expect(header?.textContent).not.toContain('New Rental')
  })

  it('clarifies that Returns Today includes overdue items', async () => {
    await mount()
    expect(container.textContent).toContain('Today · Overdue included')
  })

  it('restores focus after choosing a filter and after Escape', async () => {
    await mount()
    const pickup = buttonByLabel('Choose pickup date filter')!
    await act(async () => pickup.click())
    expect(document.activeElement?.getAttribute('role')).toBe('dialog')
    await act(async () => buttons().find((button) => button.textContent === 'Tomorrow')!.click())
    expect(document.activeElement).toBe(pickup)
    await act(async () => pickup.click())
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(pickup)
  })

  it.each([
    { from: '2026-99-99', to: '2026-99-99' },
    { from: '2026-02-30', to: '2026-03-02' },
    { from: '2026-09-22', to: '2026-09-21' },
  ])('recovers from invalid stored date ranges: %j', async (range) => {
    window.sessionStorage.setItem('dashboard.pickupDateFilter', JSON.stringify({ kind: 'custom', ...range }))
    await mount()
    expect(buttonByLabel('Choose pickup date filter')?.textContent).toContain('Today')
  })
})
