// @vitest-environment jsdom
/**
 * # Inventory — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody for Inventory.tsx:
 *   1. loading (LoadingSkeleton with skeleton="table" rendered)
 *   2. error (ErrorBanner with persistent inline alert & retry action)
 *   3. empty / unfiltered (EmptyState with "Add Equipment" CTA)
 *   4. empty / filtered (EmptyState with "Clear filters" action)
 *   5. restricted (RestrictedState rendered for non-staff Client role)
 *   6. hasRows / content (standard table with equipment rows rendered for staff)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { rupees } from '../../../lib/money'
import type { InventoryListRow } from '../../../lib/queries/inventory'
import type { InventoryProps } from '../Inventory'

let userRole = 'Owner'
const queryStub = vi.hoisted(() => ({
  rows: [] as InventoryListRow[],
  total: 1 as number | null,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: userRole, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/device', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/device')>()
  return {
    ...real,
    useTabularLayout: () => true,
    useViewport: () => 'desktop',
    useCapability: () => ({ hasHover: true, canFinePointer: true }),
  }
})

const MOCK_ROW: InventoryListRow = {
  id: 'prod-001',
  assetCode: 'EQ000001',
  name: 'Sony FX3 Cinema Camera',
  shortName: 'FX3',
  brand: 'Sony',
  model: 'FX3',
  categoryId: 'cat-001',
  category: 'Camera',
  categoryCode: 'camera',
  trackingMode: 'Serialised',
  recordState: 'Active',
  isActive: true,
  totalQuantity: 4,
  quantityUnit: 'piece',
  createdAtAd: '2026-08-01T00:00:00.000Z',
  unitCount: 4,
  unitCountExcludingRetired: 4,
  unitsByState: {
    'In Stock': 2,
    Reserved: 0,
    Packed: 0,
    'On Rent': 2,
    Returning: 0,
    Inspection: 0,
    Cleaning: 0,
    Maintenance: 0,
    Missing: 0,
    Retired: 0,
  },
  unitConditions: ['Good'],
  dailyRate: rupees(4500),
  replacementValue: rupees(450000),
}

vi.mock('../../../lib/queries/inventory', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/queries/inventory')>()
  return {
    ...real,
    listInventory: async (filters?: { page?: { index: number; size: number } }) => {
      // If it's a KPI count fetcher query (size === 1)
      if (filters?.page?.size === 1) {
        return { rows: queryStub.rows.slice(0, 1), total: queryStub.total }
      }
      return { rows: queryStub.rows, total: queryStub.total }
    },
  }
})

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

const Inventory = (await import('../Inventory')).default

let container: HTMLDivElement
let root: Root

async function mount(props: InventoryProps = {}, as = 'Owner', entry = '/inventory') {
  userRole = as
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Inventory {...props} />
      </MemoryRouter>,
    )
  })
  // Let async useList queries settle
  await act(async () => {
    await Promise.resolve()
  })
}

describe('Inventory — 5-State PageBody Hardening', () => {
  beforeEach(() => {
    userRole = 'Owner'
    queryStub.rows = [MOCK_ROW]
    queryStub.total = 1
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
    expect(container.textContent).toContain('Loading equipment…')
  })

  it('renders ErrorBanner with persistent inline alert and retry button when error prop is provided', async () => {
    const onRetry = vi.fn()
    queryStub.rows = []
    queryStub.total = 0

    await mount({ error: 'Database connection failed', onRetry })

    expect(container.textContent).toContain('Could not load equipment')
    expect(container.textContent).toContain('Database connection failed')

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
    expect(container.textContent).toContain('Equipment catalogue and warehouse inventory are for Babin Rentals staff only')
  })

  it('renders EmptyState with "Add Equipment" action when catalogue is empty and unfiltered', async () => {
    queryStub.rows = []
    queryStub.total = 0

    await mount({}, 'Owner', '/inventory')

    expect(container.textContent).toContain('No equipment yet')
    expect(container.textContent).toContain('No equipment has been added to the catalogue yet.')

    const addEquipmentBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Add Equipment'),
    )
    expect(addEquipmentBtn).toBeDefined()
  })

  it('renders EmptyState with "Clear filters" action when query filters yield zero results', async () => {
    queryStub.rows = []
    queryStub.total = 0

    // Mount and click a status chip (e.g., Missing) to activate filters
    await mount({}, 'Owner', '/inventory')

    const missingChipBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Missing'),
    )
    if (missingChipBtn) {
      await act(async () => {
        missingChipBtn.click()
      })
    }

    expect(container.textContent).toContain('No equipment matches these filters')

    const clearFiltersBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Clear filters') || b.textContent?.includes('Clear Filters'),
    )
    expect(clearFiltersBtn).toBeDefined()
  })

  it('renders table content and equipment models when rows are present for staff', async () => {
    queryStub.rows = [MOCK_ROW]
    queryStub.total = 1

    await mount({}, 'Owner', '/inventory')

    expect(container.textContent).toContain('Inventory')
    expect(container.textContent).toContain('Equipment models')
    expect(container.textContent).toContain('Sony FX3 Cinema Camera')
    expect(container.textContent).toContain('Camera')
  })
})
