// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import AssetRoiReport from '../AssetRoiReport'
import { computeFleetSummary, type UnitRoiRow } from '../../../lib/queries/assetRoi'
import { rupees } from '../../../lib/money'

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

const state = vi.hoisted(() => ({
  canSeeMoney: true,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => state.canSeeMoney,
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [] }),
    }),
  },
}))

describe('computeFleetSummary (Pillar 4 calculations)', () => {
  it('correctly aggregates capital, revenue, maintenance, and ROI', () => {
    const testRows: UnitRoiRow[] = [
      {
        unitId: 'u-1',
        assetTag: 'TAG-1',
        serialNo: 'SN-1',
        productName: 'Cinema Camera',
        category: 'Cameras',
        purchasePricePaisa: rupees(100000),
        lifetimeRevenuePaisa: rupees(200000),
        maintenanceCostPaisa: rupees(10000),
        netProfitPaisa: rupees(90000),
        roiPercent: 90,
        maintenanceDragPercent: 5,
        utilizationPercent: 80,
        daysOwned: 200,
      },
      {
        unitId: 'u-2',
        assetTag: 'TAG-2',
        serialNo: 'SN-2',
        productName: 'Studio Light',
        category: 'Lighting',
        purchasePricePaisa: rupees(50000),
        lifetimeRevenuePaisa: rupees(40000),
        maintenanceCostPaisa: rupees(5000),
        netProfitPaisa: rupees(-15000),
        roiPercent: -30,
        maintenanceDragPercent: 12.5,
        utilizationPercent: 40,
        daysOwned: 150,
      },
    ]

    const summary = computeFleetSummary(testRows)

    expect(summary.totalCapitalInvestedPaisa).toBe(rupees(150000))
    expect(summary.totalInvoicedRevenuePaisa).toBe(rupees(240000))
    expect(summary.totalMaintenanceExpensePaisa).toBe(rupees(15000))
    expect(summary.netFleetReturnPaisa).toBe(rupees(75000))
    expect(summary.fleetRoiPercent).toBe(50.0)
    expect(summary.averageMaintenanceDragPercent).toBe(6.3)
  })
})

describe('AssetRoiReport UI Component', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    state.canSeeMoney = true
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders restricted state when user cannot view money (Law 6)', async () => {
    state.canSeeMoney = false

    await act(async () => {
      root.render(<AssetRoiReport />)
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Access restricted')
    expect(bodyText).toContain('financial currency')
    expect(bodyText).not.toContain('Total Capital Invested')
  })

  it('renders full ROI metrics and table when user has financial access', async () => {
    state.canSeeMoney = true

    await act(async () => {
      root.render(<AssetRoiReport />)
    })

    // Allow promise resolution
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Asset ROI & True Cost of Ownership')
    expect(bodyText).toContain('Total Capital Invested')
    expect(bodyText).toContain('Lifetime Rental Revenue')
    expect(bodyText).toContain('Fleet Net Margin')
    expect(bodyText).toContain('CAM-001')
    expect(bodyText).toContain('RED Komodo 6K')
  })
})
