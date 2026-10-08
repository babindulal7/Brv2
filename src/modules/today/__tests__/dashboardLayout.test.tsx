// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui/Toast'

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
    root.render(<MemoryRouter initialEntries={['/dashboard']}><ToastProvider><Today /></ToastProvider></MemoryRouter>)
  })
}

const buttons = () => [...container.querySelectorAll('button')]
/*
 * Substring, not equality. The filter triggers used to be found by their exact
 * aria-label ("choose dispatch date filter"), but WCAG 2.5.3 "Label in Name"
 * requires the accessible name to CONTAIN the visible period, so the label is
 * now "Today — choose dispatch date filter" and moves as the period changes.
 * These tests care about WHICH control, not its exact wording; the label's
 * composition is asserted on its own below.
 */
const buttonByLabel = (label: string) =>
  buttons().find((button) => (button.getAttribute('aria-label') ?? '').includes(label))

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

  it('keeps the dispatch date control small: one picker door, day name over BS · AD (8 Oct 2026)', async () => {
    await mount()
    const control = container.querySelector('.dashboard-master-date-control')!
    expect(control.textContent).not.toContain('Sync dispatch day')
    expect(control.querySelector('button[aria-label="Dispatch calendar"]')).toBeNull()
    expect(control.querySelectorAll('[aria-haspopup="dialog"]')).toHaveLength(1)
    expect(control.querySelector('.dashboard-master-date-control__primary')?.textContent).toBe('Today')
    expect(control.querySelector('.dashboard-master-date-control__secondary')?.textContent).toMatch(/^\d+ \S+ · \d+ [A-Z][a-z]{2}$/)
  })

  it('carries no count tiles above the lists (ruled 8 Oct 2026)', async () => {
    await mount()
    expect(container.querySelector('.kpi-tile')).toBeNull()
    expect(container.textContent).not.toContain('On rent now')
    expect(container.textContent).not.toContain('Packing due tomorrow')
  })

  it('gives both panels one accessible calendar control', async () => {
    await mount()
    expect(buttons().filter((b) => b.getAttribute('aria-label')?.includes('choose dispatch date filter'))).toHaveLength(1)
    expect(buttonByLabel('Choose pickup date filter')).toBeUndefined()
    expect(buttonByLabel('Choose return date filter')).toBeUndefined()
  })

  /*
   * WCAG 2.5.3 "Label in Name". Axe failed this live on /dashboard: the trigger
   * painted "Today" / "Tomorrow" / "Sep 27" but announced only "Choose pickup
   * date filter", so a screen-reader user was told a control changed a filter
   * without ever being told which period was currently in effect. The rule is
   * that the accessible name CONTAINS the visible text — so this asserts the
   * name carries the period, not just that the period is on screen.
   */
  it.each([
    ['choose dispatch date filter', 'pickup'],
    ['choose dispatch date filter', 'return'],
  ])('names the %s control after the period it shows', async (label) => {
    await mount()
    const button = buttonByLabel(label)
    const visible = button?.textContent?.trim() ?? ''
    expect(visible).not.toBe('')
    expect(button?.getAttribute('aria-label') ?? '').toContain(visible)
  })

  it('changes the pickup period and returns together', async () => {
    await mount()
    const pickup = buttonByLabel('choose dispatch date filter')
    const returns = buttonByLabel('choose dispatch date filter')
    expect(pickup).toBe(returns)

    await act(async () => pickup?.click())
    // The open calendar is portaled to document.body, outside the mount
    // container — query it in the document, not the container.
    const tomorrow = [...document.querySelectorAll<HTMLButtonElement>('#dispatch-date-dialog button')].find((button) => button.textContent === 'Tomorrow')
    await act(async () => tomorrow?.click())

    expect(window.sessionStorage.getItem('dashboard.pickupDateFilter')).toContain('Tomorrow')
    expect(window.sessionStorage.getItem('dashboard.returnDateFilter')).toContain('Tomorrow')
  })

  it('selects a date range with the shared calendar and synchronizes both panels', async () => {
    await mount()
    await act(async () => buttonByLabel('choose dispatch date filter')?.click())
    const dialog = document.querySelector('#dispatch-date-dialog')!
    expect(dialog.textContent).toContain('Single day')
    expect(dialog.textContent).toContain('Date range')
    expect(dialog.textContent).toContain('BS')

    const rangeButton = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Date range')!
    await act(async () => rangeButton.click())
    await act(async () => dialog.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')[0]?.click())
    expect(dialog.textContent).toContain('Choose an end date')
    await act(async () => dialog.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')[1]?.click())

    expect(document.querySelector('#dispatch-date-dialog')).toBeNull()
    expect(window.sessionStorage.getItem('dashboard.pickupDateFilter')).toBe(window.sessionStorage.getItem('dashboard.returnDateFilter'))
    expect(window.sessionStorage.getItem('dashboard.dispatchDateFilter')).toContain('custom')
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
    const pickup = buttonByLabel('choose dispatch date filter')!
    await act(async () => pickup.click())
    expect(document.activeElement?.getAttribute('role')).toBe('dialog')
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('#dispatch-date-dialog button')].find((button) => button.textContent === 'Tomorrow')!.click())
    expect(document.activeElement).toBe(pickup)
    await act(async () => pickup.click())
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('#dispatch-date-dialog')).toBeNull()
    expect(document.activeElement).toBe(pickup)
  })

  it.each([
    { from: '2026-99-99', to: '2026-99-99' },
    { from: '2026-02-30', to: '2026-03-02' },
    { from: '2026-09-22', to: '2026-09-21' },
  ])('recovers from invalid stored date ranges: %j', async (range) => {
    window.sessionStorage.setItem('dashboard.pickupDateFilter', JSON.stringify({ kind: 'custom', ...range }))
    await mount()
    expect(buttonByLabel('choose dispatch date filter')).toBeDefined()
    expect(window.sessionStorage.getItem('dashboard.pickupDateFilter')).toContain('Today')
  })
})
