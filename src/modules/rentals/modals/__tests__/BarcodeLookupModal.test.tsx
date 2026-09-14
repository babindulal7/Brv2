// @vitest-environment jsdom
// @ts-expect-error test env flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BarcodeLookupModal } from '../BarcodeLookupModal'

const mockNavigate = vi.fn()
let mockSupabaseResponses: Record<string, { data?: unknown; error?: unknown }> = {}
const queriedTables: string[] = []

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../../lib/monitoring', () => ({
  captureError: vi.fn(),
}))

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      queriedTables.push(table)
      return {
        select: () => ({
          or: () => ({
            limit: () => {
              const res = mockSupabaseResponses[table] || { data: [], error: null }
              return Promise.resolve(res)
            },
          }),
        }),
      }
    },
  },
}))

let container: HTMLDivElement
let root: Root

function setNativeValue(element: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mountModal(props: Parameters<typeof BarcodeLookupModal>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<BarcodeLookupModal {...props} />)
  })
  await flush()
}

describe('BarcodeLookupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queriedTables.length = 0
    mockSupabaseResponses = {}
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('queries product_units_v (not obsolete equipment_items) and navigates to correct Inventory URL', async () => {
    mockSupabaseResponses = {
      bookings: { data: [], error: null },
      product_units_v: {
        data: [
          {
            id: 'unit-uuid-123',
            barcode: 'BC-999888',
            serial_no: 'SN-FX6-99',
            asset_tag: 'TAG-CAM-01',
            status: 'In Stock',
            product: {
              id: 'prod-1',
              name: 'FX6 Camera',
              brand: 'Sony',
              model: 'ILME-FX6V',
              asset_code: 'EQ-FX6-001',
            },
          },
        ],
        error: null,
      },
      products_v: { data: [], error: null },
    }

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
    })

    const input = container.querySelector('input') as HTMLInputElement
    setNativeValue(input, 'BC-999888')

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()

    // Verify queried tables
    expect(queriedTables).toContain('product_units_v')
    expect(queriedTables).not.toContain('equipment_items')

    // Verify result rendering
    expect(container.textContent).toContain('Sony ILME-FX6V')
    expect(container.textContent).toContain('TAG-CAM-01')

    // Click result
    const resultButton = container.querySelector('button.tap') as HTMLButtonElement
    expect(resultButton).toBeTruthy()
    await act(async () => {
      resultButton.click()
    })

    // Destination should be /inventory/TAG-CAM-01 (canonical asset route)
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/TAG-CAM-01')
  })

  it('renders "Equipment search failed." and Retry button when query fails', async () => {
    mockSupabaseResponses = {
      bookings: { data: null, error: new Error('Database disconnected') },
    }

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
    })

    const input = container.querySelector('input') as HTMLInputElement
    setNativeValue(input, 'FAIL-CODE')

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()

    expect(container.textContent).toContain('Equipment search failed.')
    expect(container.textContent).toContain('Retry')

    // Resolve successfully on retry
    mockSupabaseResponses = {
      bookings: { data: [], error: null },
      product_units_v: { data: [], error: null },
      products_v: { data: [], error: null },
    }

    // Click retry
    const buttons = Array.from(container.querySelectorAll('button'))
    const retry = buttons.find((b) => b.textContent?.includes('Retry'))
    expect(retry).toBeTruthy()
    await act(async () => {
      retry?.click()
    })
    await flush()

    expect(container.textContent).toContain('No equipment matches this barcode or serial.')
  })

  it('renders "No equipment matches this barcode or serial." when empty', async () => {
    mockSupabaseResponses = {
      bookings: { data: [], error: null },
      product_units_v: { data: [], error: null },
      products_v: { data: [], error: null },
    }

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
    })

    const input = container.querySelector('input') as HTMLInputElement
    setNativeValue(input, 'NONEXISTENT')

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()

    expect(container.textContent).toContain('No equipment matches this barcode or serial.')
  })
})
