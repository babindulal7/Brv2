// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CommandPalette, openCommandPalette } from '../CommandPalette'
import type { GlobalSearchResult } from '../../../lib/queries/globalSearch'
import type { SystemRole } from '../../../types/database'

const mocks = vi.hoisted(() => ({ search: vi.fn(), navigate: vi.fn(), scan: vi.fn(), user: { role: 'Owner' as SystemRole } }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('../../../lib/theme', () => ({ useTheme: () => ({ theme: 'light', toggle: vi.fn() }) }))
vi.mock('../../../lib/queries/globalSearch', () => ({ searchRecords: mocks.search }))
vi.mock('../ScannerFab', () => ({ toggleScanner: mocks.scan }))
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const result: GlobalSearchResult = { kind: 'booking', id: 'b715', label: '#715 · Film studio', detail: 'Booked', to: '/rentals/b715' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.user.role = 'Owner'
  mocks.search.mockResolvedValue([])
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<CommandPalette />))
  act(() => openCommandPalette())
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})
function type(value: string) {
  const input = host.querySelector('input')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function debounce() {
  await act(async () => { await vi.advanceTimersByTimeAsync(180) })
}
function enter() {
  act(() => { host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
}

it('opens a booking matched by its legacy number even when that number is not in the displayed label', async () => {
  mocks.search.mockResolvedValue([result])
  type('B-715')
  expect(host.textContent).toContain('Searching records')
  expect(host.textContent).not.toContain('No results found')
  await debounce()
  expect(host.querySelector('[role="option"]')?.textContent).toContain('#715')
  enter()
  expect(mocks.navigate).toHaveBeenCalledWith('/rentals/b715')
})

it('removes old results immediately and ignores a late response for an earlier query', async () => {
  let finishOld!: (rows: GlobalSearchResult[]) => void
  mocks.search.mockImplementationOnce(() => new Promise<GlobalSearchResult[]>((resolve) => { finishOld = resolve }))
  type('older')
  await debounce()
  mocks.search.mockResolvedValueOnce([result])
  type('B-715')
  await debounce()
  await act(async () => finishOld([{ ...result, id: 'old', label: 'Older booking' }]))
  expect(host.textContent).not.toContain('Older booking')
  expect(host.textContent).toContain('#715')
  type('different')
  expect(host.textContent).not.toContain('#715')
  enter()
  expect(mocks.navigate).not.toHaveBeenCalled()
})

it('offers an inline retry without making the user retype the query', async () => {
  mocks.search.mockRejectedValueOnce(new Error('offline'))
  type('B-715')
  await debounce()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not search records')
  expect(host.textContent).not.toContain('No results found')
  mocks.search.mockResolvedValueOnce([result])
  const retry = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Retry search'))!
  act(() => retry.click())
  expect(document.activeElement).toBe(host.querySelector('input'))
  await debounce()
  expect(mocks.search).toHaveBeenLastCalledWith({ role: 'Owner', term: 'b-715', limit: 4 })
  expect(host.textContent).toContain('#715')
})

it('clears in one click, keeps focus in search and discards pending results', async () => {
  let finish!: (rows: GlobalSearchResult[]) => void
  mocks.search.mockImplementationOnce(() => new Promise<GlobalSearchResult[]>((resolve) => { finish = resolve }))
  type('B-715')
  await debounce()
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Clear search"]')!.click())
  await act(async () => finish([result]))
  expect(host.querySelector('input')!.value).toBe('')
  expect(document.activeElement).toBe(host.querySelector('input'))
  expect(host.textContent).not.toContain('#715')
  expect(host.textContent).toContain('New rental')
})

it('keeps the selected command stable when matching records arrive', async () => {
  mocks.search.mockResolvedValue([{ ...result, label: 'Scan project' }])
  type('scan')
  await debounce()
  enter()
  expect(mocks.scan).toHaveBeenCalledOnce()
  expect(mocks.navigate).not.toHaveBeenCalled()
})

it('includes clear and retry in the keyboard loop', async () => {
  mocks.search.mockRejectedValue(new Error('offline'))
  type('B-715')
  await debounce()
  const input = host.querySelector('input')!
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
  expect(document.activeElement).toBe(host.querySelector('[aria-label="Clear search"]'))
  act(() => input.focus())
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
  expect(document.activeElement?.textContent).toContain('Retry search')
})

it('does not issue record searches for external clients', async () => {
  mocks.user.role = 'Client'
  act(() => root.render(<CommandPalette />))
  type('camera')
  await debounce()
  expect(mocks.search).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('Searching records')
})
