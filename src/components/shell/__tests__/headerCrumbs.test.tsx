// @vitest-environment jsdom
/**
 * RULING 2026-10-13 — the application header names the current page once and,
 * on a phone, always offers a way back to the page above it.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceProvider } from '../../../lib/workspaceContext'
import { PageHeader } from '../../ui/header/PageHeader'
import Header, { type Crumb } from '../Header'

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

async function renderHeader(crumbs: Crumb[], page?: { title: string; backHref?: string }) {
  await act(async () => root.render(
    <MemoryRouter><WorkspaceProvider>
      <Header crumbs={crumbs} />
      {page && <PageHeader title={page.title} {...(page.backHref ? { backHref: page.backHref } : {})} />}
    </WorkspaceProvider></MemoryRouter>,
  ))
}

const crumbText = () =>
  Array.from(container.querySelectorAll('nav[aria-label="Breadcrumb"] li')).map((li) => li.textContent?.trim())

describe('application header crumbs', () => {
  it('collapses a page title that repeats its parent crumb', async () => {
    await renderHeader([{ label: 'Clients' }, { label: 'Directory & Membership' }], { title: 'Clients' })
    expect(crumbText()).toEqual(['Clients'])
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('Clients')
  })

  it('names the current crumb with the registered title', async () => {
    await renderHeader([{ label: 'Rentals', to: '/rentals' }, { label: 'BK-2026-0120' }], { title: 'BK-2026-0120 · Sita Films' })
    expect(crumbText()).toEqual(['Rentals', 'BK-2026-0120 · Sita Films'])
  })

  it('shows no automatic back button on desktop, where the parent crumb is a link', async () => {
    await renderHeader([{ label: 'Rentals', to: '/rentals' }, { label: 'BK-2026-0120' }])
    expect(container.querySelector('[aria-label="Back to Rentals"]')).toBeNull()
    expect(container.querySelector('nav a[href="/rentals"]')).not.toBeNull()
  })

  it('gives a phone a back button to the nearest linked ancestor', async () => {
    state.viewport = 'phone'
    await renderHeader([
      { label: 'Inventory', to: '/inventory' },
      { label: 'Bundles', to: '/inventory?tab=bundles' },
      { label: 'Bundle' },
    ])
    const back = container.querySelector<HTMLAnchorElement>('a[aria-label="Back to Bundles"]')
    expect(back).not.toBeNull()
    expect(back!.getAttribute('href')).toBe('/inventory?tab=bundles')
    expect(back!.style.minWidth).toBe('44px')
    expect(back!.style.minHeight).toBe('44px')
    expect(crumbText()).toEqual(['Bundle'])
  })

  it('lets a page-registered back target win over the automatic one', async () => {
    state.viewport = 'phone'
    await renderHeader([{ label: 'Rentals', to: '/rentals' }, { label: 'BK-2026-0120' }], { title: 'BK-2026-0120', backHref: '/today' })
    expect(container.querySelector('[aria-label="Back to Rentals"]')).toBeNull()
    expect(container.querySelector('a[href="/today"]')).not.toBeNull()
  })

  it('offers no back button on a top-level page', async () => {
    state.viewport = 'phone'
    await renderHeader([{ label: 'Today' }])
    expect(container.querySelector('a[aria-label^="Back to"]')).toBeNull()
  })
})
