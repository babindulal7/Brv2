// @vitest-environment jsdom
/**
 * # Clients Directory — filter rail
 *
 * The rail's facet logic, driven through the rendered checkboxes:
 *   - ticks within a family OR (Organisation or Individual)
 *   - families AND with each other (Individual that is On Rent)
 *   - the Blocked overlay narrows whatever is ticked (Rulings §11.2.4)
 *   - Clear all restores the full directory; a saved view re-ticks its facets
 *   - Payment Due is omitted, not blanked, for a money-blind session (§8.3)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { CLIENTS_DATA, type ClientRecord } from '../../../data/clients'

const money = vi.hoisted(() => ({ visible: true }))
const clientRows = vi.hoisted(() => ({ data: [] as ClientRecord[] }))

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => money.visible }))

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }),
  ToastProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/useClients', () => ({
  useClients: () => ({
    clients: clientRows.data,
    loading: false,
    error: null,
    isEmpty: clientRows.data.length === 0,
    refresh: vi.fn(),
  }),
  useMembershipPlans: () => ({ plans: [], loading: false, error: null }),
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

const base = CLIENTS_DATA[0]!
const row = (id: string, name: string, over: Partial<ClientRecord>): ClientRecord => ({
  ...base,
  id,
  name,
  email: `${id}@example.test`,
  currentRentalsCount: 0,
  isVip: false,
  isBlocked: false,
  ...over,
})

/** Four clients, one per cell the facets need to tell apart. */
const ROWS: ClientRecord[] = [
  row('c-org-rent', 'Org On Rent', { clientType: 'Organisation', currentRentalsCount: 2 }),
  row('c-org-idle', 'Org Idle', { clientType: 'Organisation' }),
  row('c-ind-rent', 'Ind On Rent', { clientType: 'Individual', currentRentalsCount: 1, isBlocked: true }),
  row('c-ind-vip', 'Ind Vip', { clientType: 'Individual', isVip: true }),
]

let container: HTMLDivElement
let root: Root

async function mount() {
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/clients']}>
        <Clients />
      </MemoryRouter>,
    )
  })
}

const rail = () => container.querySelector<HTMLElement>('section[aria-label="Filters"]')!
const railRow = (label: string) =>
  [...rail().querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))
async function tick(label: string) {
  const input = railRow(label)?.querySelector('input')
  expect(input, `rail row "${label}"`).toBeTruthy()
  await act(async () => {
    input!.click()
  })
}
async function press(text: string) {
  const btn = [...rail().querySelectorAll('button')].find((b) => b.textContent?.startsWith(text))
  expect(btn, `rail button "${text}"`).toBeTruthy()
  await act(async () => {
    btn!.click()
  })
}
const visible = () => ROWS.filter((r) => container.textContent?.includes(r.name)).map((r) => r.name)

describe('Clients directory — filter rail', () => {
  beforeEach(() => {
    money.visible = true
    clientRows.data = ROWS
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('shows every family with whole-directory counts', async () => {
    await mount()
    expect(railRow('Organisation')?.textContent).toContain('(2)')
    expect(railRow('Individual')?.textContent).toContain('(2)')
    expect(railRow('On Rent')?.textContent).toContain('(2)')
    expect(railRow('VIP')?.textContent).toContain('(1)')
    expect(railRow('Blocked')?.textContent).toContain('(1)')
  })

  it('ORs ticks within a family and ANDs across families', async () => {
    await mount()
    await tick('Individual')
    expect(visible()).toEqual(['Ind On Rent', 'Ind Vip'])

    await tick('On Rent')
    expect(visible()).toEqual(['Ind On Rent'])

    await tick('Organisation')
    expect(visible()).toEqual(['Org On Rent', 'Ind On Rent'])

    await tick('VIP')
    expect(visible()).toEqual(['Org On Rent', 'Ind On Rent', 'Ind Vip'])
  })

  it('narrows any selection with the Blocked overlay, and Clear all restores everything', async () => {
    await mount()
    await tick('On Rent')
    await tick('Blocked')
    expect(visible()).toEqual(['Ind On Rent'])
    expect(rail().querySelector('h2')?.textContent).toContain('2')

    await press('Clear all')
    expect(visible()).toEqual(ROWS.map((r) => r.name))
    expect(rail().querySelectorAll('input:checked')).toHaveLength(0)
  })

  it('re-ticks a saved view’s facets', async () => {
    await mount()
    await press('VIP Clients')
    expect(visible()).toEqual(['Ind Vip'])
    expect((railRow('VIP')?.querySelector('input') as HTMLInputElement).checked).toBe(true)
  })

  it('omits Payment Due for a money-blind session rather than blanking it', async () => {
    money.visible = false
    await mount()
    expect(railRow('Payment Due')).toBeUndefined()
    expect(railRow('On Rent')).toBeDefined()
  })
})
