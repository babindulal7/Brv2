// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ result: null as unknown, fail: null as string | null }))

vi.mock('../../../lib/queries/shortages', () => ({
  readShortageInputs: async () => {
    if (state.fail) throw new Error(state.fail)
    return state.result
  },
}))
vi.mock('../../../lib/queries/availability', () => ({ availabilityRules: () => ({ bounds: 'half-open' }) }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
const { default: ShortageSection } = await import('../ShortageSection')

let root: Root
let container: HTMLDivElement

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter><ShortageSection /></MemoryRouter>)
  })
  await act(async () => { await Promise.resolve() })
}

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  state.result = null
  state.fail = null
})

const now = Date.now()
const hold = (no: string, qty: number) => ({
  bookingId: `id-${no}`,
  bookingNo: no,
  qty,
  window: { fromAd: new Date(now + 2 * 864e5).toISOString(), toAd: new Date(now + 5 * 864e5).toISOString() },
})

describe('Shortages section (C7)', () => {
  it('says no product is over-committed when nothing is', async () => {
    state.result = { products: [], holdsByProduct: new Map() }
    await mount()
    expect(container.textContent).toContain('No product is over-committed in this period.')
  })

  it('lists an over-committed product with its figures and linked bookings', async () => {
    state.result = {
      products: [{ id: 'p1', name: 'Sony FX3', assetCode: 'EQ000001', totalQuantity: 1 }],
      holdsByProduct: new Map([['p1', [hold('1001', 1), hold('1002', 1)]]]),
    }
    await mount()
    expect(container.textContent).toContain('Sony FX3')
    expect(container.textContent).toContain('EQ000001')
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toContain('/inventory/p1')
    expect(links.some(link => link?.startsWith('/calendar?d='))).toBe(true)
    expect(links).toContain('/rentals/1001')
    expect(links).toContain('/rentals/1002')
    const cells = [...container.querySelectorAll('tbody td')].map((td) => td.textContent?.trim())
    expect(cells.slice(1, 4)).toEqual(['1', '2', '1']) // in stock, needed at peak, short by
  })

  it('shows the failure inline instead of an empty list when the read fails', async () => {
    state.fail = 'Could not read the live reservations, so no shortage list was built: boom'
    await mount()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('no shortage list was built')
    expect(container.textContent).not.toContain('No product is over-committed')
  })

  it('states what it cannot see', async () => {
    state.result = { products: [], holdsByProduct: new Map() }
    await mount()
    expect(container.textContent).toContain('Units out in Maintenance')
  })
})
