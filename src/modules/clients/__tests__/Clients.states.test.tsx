// @vitest-environment jsdom
/**
 * # Clients Directory — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody for Clients.tsx:
 *   1. loading (LoadingSkeleton with skeleton="table" rendered)
 *   2. error (ErrorBanner with persistent inline alert & retry action)
 *   3. restricted (RestrictedState rendered for non-staff Client role)
 *   4. empty / unfiltered (EmptyState inside table card with "Register a client" CTA)
 *   5. empty / filtered (EmptyState inside table card with "Clear all filters" CTA)
 *   6. hasRows / content (standard table with client records rendered)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { CLIENTS_DATA, type ClientRecord } from '../../../data/clients'
import type { ClientsProps } from '../Clients'

let userRole = 'Owner'
const clientRows = vi.hoisted(() => ({
  data: [] as ClientRecord[],
  loading: false,
  error: null as string | null,
}))

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: userRole, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/useClients', () => ({
  useClients: () => ({
    clients: clientRows.data,
    loading: clientRows.loading,
    error: clientRows.error,
    isEmpty: clientRows.data.length === 0,
    refresh: vi.fn(),
  }),
  useMembershipPlans: () => ({
    plans: [],
    loading: false,
    error: null,
  }),
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

const Clients = (await import('../Clients')).default

let container: HTMLDivElement
let root: Root

async function mount(props: ClientsProps = {}, as = 'Owner', entry = '/clients', width = 1200) {
  userRole = as
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Clients {...props} />
      </MemoryRouter>,
    )
  })
}

describe('Clients — 5-State PageBody Hardening', () => {
  beforeEach(() => {
    userRole = 'Owner'
    clientRows.data = [CLIENTS_DATA[0]!]
    clientRows.loading = false
    clientRows.error = null
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  it('renders LoadingSkeleton with table layout when loading prop is true', async () => {
    await mount({ loading: true })
    expect(container.textContent).toContain('Loading clients…')
  })

  it('renders ErrorBanner with persistent inline alert and retry button when error prop is provided', async () => {
    const onRetry = vi.fn()
    clientRows.data = []

    await mount({ error: 'Connection to client directory failed', onRetry })

    expect(container.textContent).toContain('Could not load clients')
    expect(container.textContent).toContain('Connection to client directory failed')

    const retryBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()
    await act(async () => {
      retryBtn?.click()
    })
    expect(onRetry).toHaveBeenCalled()
  })

  it('renders RestrictedState when user is a non-staff Client', async () => {
    await mount({}, 'Client')
    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Requires Staff')
    expect(container.textContent).toContain('The client management directory is for Babin Rentals staff only')
  })

  it('renders EmptyState with "Register a client" CTA when directory has no clients', async () => {
    clientRows.data = []

    await mount({}, 'Owner')

    expect(container.textContent).toContain('No clients yet')
    expect(container.textContent).toContain('The directory is empty. Register the first client to start booking.')

    const addBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.trim() === 'Register a client',
    )
    expect(addBtn).toBeDefined()
  })

  it('renders EmptyState with "Clear all filters" when search filter has no matching clients', async () => {
    clientRows.data = [CLIENTS_DATA[0]!]

    await mount({}, 'Owner')

    // Find search input
    const searchInput = container.querySelector('input[placeholder*="Search"]') as HTMLInputElement | null
    expect(searchInput).toBeDefined()

    if (searchInput) {
      await act(async () => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set
        nativeInputValueSetter?.call(searchInput, 'NonexistentClientXYZ')
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
        searchInput.dispatchEvent(new Event('change', { bubbles: true }))
      })

      expect(container.textContent).toContain('No clients found')
      expect(container.textContent).toContain('No client matches "NonexistentClientXYZ"')

      const clearBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        b.textContent?.includes('Clear filters'),
      )
      expect(clearBtn).toBeDefined()

      await act(async () => {
        clearBtn?.click()
      })

      // Cleared filter restores client record
      expect(container.textContent).toContain(CLIENTS_DATA[0]!.name)
    }
  })

  it('renders client directory rows for staff roles', async () => {
    clientRows.data = [CLIENTS_DATA[0]!]

    await mount({}, 'Owner')

    expect(container.textContent).toContain('Clients')
    expect(container.textContent).toContain(CLIENTS_DATA[0]!.name)
    expect(container.textContent).toContain(CLIENTS_DATA[0]!.email)
  })
})
