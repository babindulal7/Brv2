// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CommandPalette, openCommandPalette } from './CommandPalette'

const navigate = vi.fn()
const user = { role: 'Admin' }
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user }) }))
vi.mock('../../lib/theme', () => ({ useTheme: () => ({ theme: 'light', toggle: vi.fn() }) }))
vi.mock('./ScannerFab', () => ({ toggleScanner: vi.fn() }))
vi.mock('../../data/nav', () => ({ permittedNav: () => [
  { label: 'Dashboard', to: '/dashboard', icon: 'home' },
  { label: 'Rentals', to: '/rentals', icon: 'home' },
], permittedAllNav: () => [
  { label: 'Dashboard', to: '/dashboard', icon: 'home' },
  { label: 'Rentals', to: '/rentals', icon: 'home' },
] }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement
let root: Root
let opener: HTMLButtonElement
beforeEach(() => {
  navigate.mockClear()
  host = document.createElement('div')
  opener = document.createElement('button')
  document.body.append(opener, host)
  root = createRoot(host)
  act(() => root.render(<CommandPalette />))
  opener.focus()
  act(() => openCommandPalette())
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  opener.remove()
})
function key(target: Element, value: string, shiftKey = false) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })) })
}

it('focuses search, cycles Tab within the dialog and restores the opener on Escape', () => {
  const input = host.querySelector('input')!
  const close = host.querySelector('button')!
  expect(document.activeElement).toBe(input)
  key(input, 'Tab', true)
  expect(document.activeElement).toBe(close)
  key(close, 'Tab')
  expect(document.activeElement).toBe(input)
  key(input, 'Escape')
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(opener)
})

it('announces the active result and activates the arrow-selected destination', () => {
  const input = host.querySelector('input')!
  expect(input.getAttribute('aria-controls')).toBe(host.querySelector('[role="listbox"]')!.id)
  key(input, 'ArrowDown')
  const selected = document.getElementById(input.getAttribute('aria-activedescendant')!)!
  expect(selected.getAttribute('aria-selected')).toBe('true')
  expect(selected.textContent).toContain('Rentals')
  key(input, 'Enter')
  expect(navigate).toHaveBeenCalledWith('/rentals')
  expect(document.activeElement).toBe(opener)
})

it('includes the same permitted creation destinations as the header menu', () => {
  const input = host.querySelector('input')!
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(host.textContent).toContain('New rental')
  expect(host.textContent).toContain('New client')
  expect(host.textContent).toContain('Add equipment')
  expect(host.textContent).toContain('Purchase request')
})
