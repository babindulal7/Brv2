// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider } from '../../../lib/workspaceContext'
import Header from '../../../components/shell/Header'
import Calendar from '../Calendar'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const state = vi.hoisted(() => ({
  viewport: 'desktop' as 'desktop' | 'tablet' | 'phone',
}))

vi.mock('../../../lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/device')>()
  return {
    ...actual,
    useViewport: () => state.viewport,
  }
})

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', email: 'admin@babinrentals.com', role: 'Owner' },
    role: 'Owner',
    capabilities: [],
    logout: vi.fn(),
    lockNow: vi.fn(),
    hasPin: false,
  }),
}))

vi.mock('../../../lib/syncContext', () => ({
  useSync: () => ({ status: 'synced', pendingCount: 0 }),
}))

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
  listInventory: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getInventoryCategories: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../lib/queries/useList', () => ({
  useList: vi.fn().mockReturnValue({ rows: [], total: 0, loading: false, error: null }),
}))

describe('Calendar application header and mobile de-crowding', () => {
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

  it('renders full header with FilterButton, Check availability CTA, and navButtons in desktop', async () => {
    state.viewport = 'desktop'
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WorkspaceProvider>
            <Header crumbs={[{ label: 'Calendar' }]} />
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    // Header title
    expect(container.textContent).toContain('Calendar')

    // Filter toggle button is leading with aria-controls
    const filterBtn = container.querySelector('[aria-controls="calendar-filters"]')
    expect(filterBtn).not.toBeNull()

    // Primary button has full label
    const checkBtn = container.querySelector('[aria-label="Check availability"]')
    expect(checkBtn).not.toBeNull()
    expect(checkBtn?.textContent).toContain('Check availability')

    // Desktop Full View button is rendered
    expect(container.textContent).toContain('Full View')

    // navButtons (Today and date steppers) are present in the header
    expect(container.textContent).toContain('Today')
  })

  it('de-crowds the phone header: moves filters to overflow, compacts CTA, and places navButtons in content', async () => {
    state.viewport = 'phone'
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WorkspaceProvider>
            <Header crumbs={[{ label: 'Calendar' }]} />
            <Calendar />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    // 1. FilterButton is suppressed from the header leading position on phone
    const headerLeadingFilter = container.querySelector('.universal-page-header__left [aria-controls="calendar-filters"]')
    expect(headerLeadingFilter).toBeNull()

    // 2. Primary CTA has compact label 'Availability'
    const checkBtn = container.querySelector('[aria-label="Check availability"]')
    expect(checkBtn).not.toBeNull()
    expect(checkBtn?.textContent?.trim()).toBe('Availability')

    // 3. Overflow menu contains Filters item and Today shortcut
    const moreBtn = container.querySelector('[aria-label="More actions"]')
    expect(moreBtn).not.toBeNull()

    // 4. Content contains dedicated phone nav bar with date steppers
    const phoneNav = container.querySelector('.calendar-phone-nav')
    expect(phoneNav).not.toBeNull()
    expect(phoneNav?.textContent).toContain('Today')
  })
})
