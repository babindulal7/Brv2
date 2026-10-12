// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceProvider } from '../../../lib/workspaceContext'
import { WorkspaceHeaderRightActions, WorkspaceHeaderSearch } from '../WorkspacePortal'
import Header from '../Header'

const state = vi.hoisted(() => ({ viewport: 'desktop' }))
vi.mock('../../../lib/device', () => ({ useViewport: () => state.viewport }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { name: 'Babin', role: 'Owner' }, logout: vi.fn(), lockNow: vi.fn(), hasPin: false }) }))
vi.mock('../../../lib/syncContext', () => ({ useSync: () => ({ status: 'synced', pendingCount: 0 }) }))
vi.mock('../../ui/creation/GlobalAddMenu', () => ({ GlobalAddMenu: () => <button>Global Add</button> }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  state.viewport = 'desktop'
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function renderPage(page: 'rentals' | 'edit' | 'plain') {
  await act(async () => root.render(
    <StrictMode><MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Rentals' }]} />
      {page !== 'plain' && <WorkspaceHeaderRightActions key={page}>
        <button>{page === 'edit' ? 'Confirm booking' : 'New Rental'}</button>
        {page === 'rentals' && <button aria-label="Toggle rentals search">Search rentals</button>}
      </WorkspaceHeaderRightActions>}
      {page === 'rentals' && <WorkspaceHeaderSearch><input aria-label="Search rentals" /></WorkspaceHeaderSearch>}
    </WorkspaceProvider></MemoryRouter></StrictMode>,
  ))
}

describe('page ownership of the application header', () => {
  it('replaces fallback creation on list/edit navigation and restores it after release', async () => {
    await renderPage('plain')
    expect(container.textContent).toContain('Global Add')
    await renderPage('rentals')
    expect(container.textContent).toContain('New Rental')
    expect(container.textContent).not.toContain('Global Add')
    expect(container.querySelectorAll('header')).toHaveLength(1)
    await renderPage('edit')
    expect(container.textContent).toContain('Confirm booking')
    expect(container.textContent).not.toContain('New Rental')
    expect(container.textContent).not.toContain('Global Add')
    await renderPage('plain')
    expect(container.textContent).toContain('Global Add')
  })

  it('keeps only the page search on phone and releases ownership on navigation', async () => {
    state.viewport = 'phone'
    await renderPage('rentals')
    expect(container.querySelector('[aria-label="Search"]')).toBeNull()
    expect(container.querySelector('[aria-label="Toggle rentals search"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Team internal notes"]')).toBeNull()
    await renderPage('plain')
    expect(container.querySelector('[aria-label="Search"]')).not.toBeNull()
  })

  it('places notes in the phone profile and returns focus on Escape', async () => {
    state.viewport = 'phone'
    await renderPage('plain')
    const profile = container.querySelector<HTMLButtonElement>('[title="User profile"]')!
    await act(async () => profile.click())
    const dialog = container.querySelector('[role="dialog"][aria-label="User profile"]')!
    expect(dialog.textContent).toContain('Team internal notes')
    await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="dialog"][aria-label="User profile"]')).toBeNull()
    expect(document.activeElement).toBe(profile)
  })
})
