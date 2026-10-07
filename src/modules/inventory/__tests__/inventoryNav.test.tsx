// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: [], count: 0, error: null }),
        }),
      }),
    }),
  },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  IS_MOCK: true,
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

const { default: Inventory } = await import('../Inventory')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Inventory />
      </MemoryRouter>,
    )
  })
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
  }
  if (container) {
    container.remove()
  }
  mockNavigate.mockReset()
})

describe('Inventory Navigation & Reachability', () => {
  it('renders Warehouses and Purchase Requests action buttons and navigates to routes', async () => {
    await mount()

    const buttons = Array.from(container.querySelectorAll('button'))
    const warehousesBtn = buttons.find((b) => b.textContent?.trim() === 'Warehouses')
    const prBtn = buttons.find((b) => b.textContent?.trim() === 'Purchase Requests')

    expect(warehousesBtn).toBeDefined()
    expect(prBtn).toBeDefined()

    await act(async () => {
      warehousesBtn?.click()
    })
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/warehouses')

    await act(async () => {
      prBtn?.click()
    })
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/purchase-requests')
  })
})
