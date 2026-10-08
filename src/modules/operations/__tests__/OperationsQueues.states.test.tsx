// @vitest-environment jsdom
/**
 * # Operations Queues — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody for OperationsQueues.tsx:
 *   1. loading (LoadingSkeleton with skeleton="table" rendered)
 *   2. error (ErrorBanner with persistent inline alert & retry action)
 *   3. restricted (RestrictedState rendered for non-staff Client role)
 *   4. empty / unfiltered (EmptyState when queue has no jobs)
 *   5. empty / filtered (EmptyState with "Clear filter" when filters yield 0 results)
 *   6. hasRows / content (table with job rows, stage badges, and action buttons)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { OperationsQueuesProps } from '../OperationsQueues'

let userRole = 'Owner'
let floorRows: unknown[] = []
let isListLoading = false
let listError: string | null = null
let isListFiltered = false
const refetchSpy = vi.fn()

vi.mock('../../../lib/queries/useList', () => ({
  useList: () => ({
    rows: floorRows,
    loading: isListLoading,
    error: listError,
    isEmpty: floorRows.length === 0 && !isListLoading && !listError,
    isFiltered: isListFiltered,
    total: floorRows.length,
    refetch: refetchSpy,
  }),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-OP', name: 'Ops Staff', role: userRole, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop',
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

const OperationsQueues = (await import('../OperationsQueues')).default

function makeRow(bookingNo: string, stage: string, dueAtAd: string) {
  return {
    id: `id-${bookingNo}`,
    bookingNo,
    clientId: 'C-1',
    clientName: 'Aarav Karki',
    project: 'Documentary Film',
    stage,
    pickupAtAd: dueAtAd,
    returnAtAd: dueAtAd,
    itemCount: 4,
  }
}

let container: HTMLDivElement
let root: Root

async function mount(props: OperationsQueuesProps = {}, as = 'Owner', entry = '/operations') {
  userRole = as
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <OperationsQueues {...props} />
      </MemoryRouter>,
    )
  })
}

describe('OperationsQueues — 5-State PageBody Hardening', () => {
  beforeEach(() => {
    userRole = 'Owner'
    floorRows = [makeRow('B-715', 'Booked', '2026-07-31T03:15:00.000Z')]
    isListLoading = false
    listError = null
    isListFiltered = false
    refetchSpy.mockClear()
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  it('1. Loading state: renders table skeleton when loading=true via props', async () => {
    await mount({ loading: true })
    expect(container.textContent).toContain('Loading jobs…')
    expect(container.querySelectorAll('tbody tr').length).toBe(0)
  })

  it('2. Error state: renders ErrorBanner on initial load failure or refresh failure', async () => {
    const onRetry = vi.fn()
    // Initial failure with no rows
    floorRows = []
    await mount({ error: 'Database connection failed', onRetry })

    const banner = container.querySelector('[role="alert"]')
    expect(banner).toBeTruthy()
    expect(banner?.textContent).toContain('Could not load jobs')
    expect(banner?.textContent).toContain('Database connection failed')

    const retryBtn = banner?.querySelector('button')
    expect(retryBtn).toBeTruthy()
    expect(retryBtn?.textContent).toContain('Retry')

    await act(async () => {
      retryBtn?.click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('2b. Error state with rows: renders "Could not refresh jobs" banner above existing rows', async () => {
    floorRows = [makeRow('B-715', 'Booked', '2026-07-31T03:15:00.000Z')]
    await mount({ error: 'Sync failed' })

    const banner = container.querySelector('[role="alert"]')
    expect(banner).toBeTruthy()
    expect(banner?.textContent).toContain('Could not refresh jobs')
    expect(banner?.textContent).toContain('Sync failed')
    // Rows remain visible underneath the banner
    expect(container.textContent).toContain('B-715')
  })

  it('3. Restricted state: renders RestrictedState for non-staff Client role', async () => {
    await mount({}, 'Client')

    expect(container.textContent).toContain('Requires Staff')
    expect(container.textContent).toContain('Floor operations and queues are for Babin Rentals staff only')
    expect(container.querySelector('table')).toBeNull()
  })

  it('4. Empty / unfiltered state: shows zero-data message when all scopes are clear', async () => {
    floorRows = []
    isListFiltered = false
    await mount({}, 'Owner', '/operations?day=custom')

    expect(container.textContent).toContain('No jobs right now')
    expect(container.textContent).toContain('No booking is sitting at a stage that has floor work in this range.')
    expect(container.querySelectorAll('tbody tr').length).toBe(0)
  })

  it('5. Empty / filtered state: shows filter-specific empty message and clear filter button', async () => {
    floorRows = []
    isListFiltered = true
    await mount({}, 'Owner', '/operations?queue=packing')

    expect(container.textContent).toContain('Nothing in Packing for today')
    expect(container.textContent).toContain('This queue is clear for the selected days')

    const clearBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Clear filter'))
    expect(clearBtn).toBeTruthy()
  })

  it('6. Content state: renders job rows, stage badges, and action buttons', async () => {
    floorRows = [
      makeRow('B-715', 'Booked', '2026-07-31T03:15:00.000Z'),
      makeRow('B-716', 'Packed', '2026-07-31T05:00:00.000Z'),
    ]
    await mount()

    const headers = [...container.querySelectorAll('th')].map((h) => h.textContent)
    expect(headers).toContain('Time')
    expect(headers).toContain('Booking')
    expect(headers).toContain('Client')
    expect(headers).toContain('Items')
    expect(headers).toContain('Stage')

    expect(container.textContent).toContain('B-715')
    expect(container.textContent).toContain('B-716')
    expect(container.textContent).toContain('Aarav Karki')

    const packBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Pack')
    expect(packBtn).toBeTruthy()
  })
})
