// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Calendar from '../Calendar'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop' as const,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', email: 'admin@babinrentals.com', role: 'admin' },
    role: 'admin',
    capabilities: [],
  }),
}))

// Mock queries
vi.mock('../../../lib/queries/calendar', () => ({
  CALENDAR_BAR_KINDS: ['Reserved', 'On Rent'],
  calendarWindow: vi.fn().mockReturnValue({ dateRange: { column: 'pickup_at', fromAd: '2026-07-01', toAd: '2026-07-31' } }),
  fetchCalendarBars: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  VIEWS: ['Month', 'Week', 'Timeline', 'Availability'],
  VIEWS_BY_WIDTH: {
    desktop: ['Month', 'Week', 'Timeline', 'Availability'],
    tablet: ['Month', 'Week'],
    phone: ['Month'],
  },
  DEFAULT_VIEW: 'Month',
  ROW_TYPES: ['All', 'Equipment', 'Crew', 'Vehicles'],
  ROWS: [],
  BAR_STYLE: {
    'Reserved': { bg: 'rgba(49,130,206,0.1)', fg: '#2b6cb0', line: '#3182ce', dash: false },
    'On Rent': { bg: 'rgba(72,187,120,0.1)', fg: '#22543d', line: '#38a169', dash: false },
  },
  BAR_KINDS: ['Reserved', 'On Rent'],
  SAVED_VIEWS: [],
  SAVED_VIEWS_NOT_AVAILABLE: 'Saved views not available',
  HOLIDAYS_NOT_TRACKED: 'Holidays not tracked',
  TODAY_SUMMARY: [],
  UPCOMING: [],
  UPCOMING_PERIOD: 'Next 7 days',
  railBookingCounts: vi.fn().mockResolvedValue({}),
  railInvoiceCounts: vi.fn().mockResolvedValue({}),
  QUICK_ACTIONS: [],
  EVENT_MARKERS: [],
  SHORTCUTS: [],
  EVENT_DETAIL: {},
  EVENT_ACTIONS: [],
  ZOOM_STEPS: [7, 14, 30],
  DEFAULT_ZOOM: 7,
  LAYERS: [],
  layerOf: vi.fn().mockReturnValue(null),
  adDay: (n: number) => new Date(Date.UTC(2026, 6, 22 + n)),
  dayDiff: () => 0,
  businessDayAd: () => '2026-07-22',
}))

vi.mock('../../../lib/queries/inventory', () => ({
  listInventory: vi.fn().mockResolvedValue({
    rows: [
      { id: 'p-fx3', name: 'Sony FX3 Cinema Camera', totalQuantity: 4, dailyRate: 350000 },
      { id: 'p-600d', name: 'Aputure 600d Pro', totalQuantity: 2, dailyRate: 200000 },
    ],
    total: 2,
  }),
}))

describe('Calendar Check Availability Integration', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
  })

  it('renders Check availability button in Calendar header and opens modal', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/calendar']}>
          <Calendar />
        </MemoryRouter>
      )
    })

    const checkAvailBtn = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Check availability'
    )
    expect(checkAvailBtn).toBeDefined()

    // Modal is initially not in DOM
    expect(document.body.querySelector('#check-avail-product-select')).toBeNull()

    // Click Check availability button
    await act(async () => {
      checkAvailBtn!.click()
    })

    // Modal is now open with product selector
    expect(document.body.textContent).toContain('Select product')
    const select = document.body.querySelector('#check-avail-product-select') as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(select.textContent).toContain('Sony FX3 Cinema Camera')
  })

  it('renders actionable Check availability button in Availability tab', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/calendar?view=availability']}>
          <Calendar />
        </MemoryRouter>
      )
    })

    expect(host!.textContent).toContain('Check product availability')
    const availBtns = Array.from(host!.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Check availability'
    )
    expect(availBtns.length).toBeGreaterThanOrEqual(1)

    await act(async () => {
      availBtns[0]!.click()
    })

    expect(document.body.textContent).toContain('Select product')
  })
})
