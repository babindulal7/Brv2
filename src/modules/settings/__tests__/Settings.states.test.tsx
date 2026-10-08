// @vitest-environment jsdom
/**
 * # Settings Module — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody across Settings module:
 *   1. loading (LoadingSkeleton rendered with "Loading settings…")
 *   2. error (ErrorBanner rendered with retry action)
 *   3. restricted (RestrictedState rendered for Client non-staff role)
 *   4. money gating (Law 6: Warehouse/Technician does not see Financial tab/pane)
 *   5. populated (Owner sees full settings with sections and edit controls)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SettingsProps } from '../Settings'

let userRole = 'Owner'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-settings', name: 'Settings User', role: userRole, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => ['Owner', 'Admin', 'Accounts'].includes(userRole),
}))

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
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const Settings = (await import('../Settings')).default

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  userRole = 'Owner'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  vi.clearAllMocks()
})

async function mount(props: SettingsProps = {}, search = '') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/settings${search}`]}>
        <Settings {...props} />
      </MemoryRouter>,
    )
  })
}

describe('Settings Screen 5-State Handling', () => {
  it('renders loading skeleton when loading prop is true', async () => {
    await mount({ loading: true })
    expect(container.textContent).toContain('Loading settings')
  })

  it('renders persistent error banner with retry trigger when error prop is passed', async () => {
    const onRetry = vi.fn()
    await mount({ error: 'Database settings unavailable', onRetry })
    const banner = container.querySelector('[role="alert"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('Database settings unavailable')

    const retryBtn = Array.from(banner?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()
    await act(async () => {
      retryBtn?.click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders restricted state for Client (non-staff role)', async () => {
    userRole = 'Client'
    await mount()
    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Requires Staff')
  })

  it('enforces Law 6 zero money visibility for money-blind role (Warehouse)', async () => {
    userRole = 'Warehouse'
    await mount()
    // Warehouse is staff, so they see settings
    expect(container.textContent).toContain('Settings')
    // But Financial tab is removed from the visible tabs
    expect(container.textContent).not.toContain('Financial')
    // No money figures or financial card headers visible
    expect(container.textContent).not.toContain('VAT & Taxes')
  })

  it('renders populated settings view for Owner with Edit settings control', async () => {
    userRole = 'Owner'
    await mount()
    expect(container.textContent).toContain('Settings')
    expect(container.textContent).toContain('Edit settings')
    expect(container.textContent).toContain('View audit log')
  })
})
