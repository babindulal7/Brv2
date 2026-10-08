// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DashboardMovementPanel from '../DashboardMovementPanel'
import type { MovementRow } from '../../../lib/queries/today'

const { openOperations } = vi.hoisted(() => ({ openOperations: vi.fn() }))
vi.mock('../../operations/OperationsWorkspaceContext', () => ({
  useOperationsWorkspace: () => ({ openOperations }),
}))
vi.mock('../../../lib/queries/today', async (original) => ({
  ...await original<typeof import('../../../lib/queries/today')>(),
  businessDayAd: () => '2026-09-21',
}))
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const row: MovementRow = {
  id: 'rental-1', bookingNo: 'B-901', clientId: 'client-1', client: 'AV Production',
  monogram: 'AV', avatarTone: 'neutral', kind: 'Return', at: 600, atDayAd: '2026-09-22',
  status: 'On Rent', flags: [], project: 'Conference', itemCount: 8,
  due: 'Due 22 Sept 2026 · 10:00 AM', duration: '21 Sept → 22 Sept',
  pickupLocation: null, returnLocation: null, deliveryType: 'Client Pickup',
}
async function mount(overrides: Partial<MovementRow> = {}, side: 'incoming' | 'outgoing' = 'incoming', paging: { onLoadMore?: () => void; hasMore?: boolean; total?: number } = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<MemoryRouter><DashboardMovementPanel
    side={side} title="Movements" subtitle="Scheduled rentals" icon="truck" periodLabel="tomorrow"
    filterControl={null} onClearFilters={() => {}}
    {...(paging.onLoadMore ? { onLoadMore: paging.onLoadMore } : {})}
    {...(paging.hasMore !== undefined ? { hasMore: paging.hasMore } : {})}
    list={{ rows: [{ ...row, ...overrides }], total: paging.total ?? 1, loading: false, error: null, isEmpty: false, isFiltered: true, refetch: () => {}, lastFetchedAt: null }}
  /></MemoryRouter>))
}
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks() })

describe('movement board task clarity', () => {
  it('does not label a future return as due today or claim booked quantities are outstanding', async () => {
    await mount()
    expect(host.textContent).not.toContain('Return scheduled')
    expect(host.textContent).not.toContain('Due today')
    expect(host.textContent).toContain('Return & Inspect')
    expect(host.textContent).toContain('8 items booked')
    expect(host.textContent).not.toContain('outstanding')
  })
  it('shows the pickup date for multi-day filters and allows 1-click packing', async () => {
    await mount({ status: 'Booked' }, 'outgoing')
    expect(host.querySelector('.movement-card__time')?.textContent).toContain('22/9/2026')
    const action = host.querySelector<HTMLButtonElement>('.movement-card__cta-btn')!
    expect(action.textContent).toBe('Start Packing')
    expect(action.getAttribute('aria-label')).toContain('Start Packing')
    expect(host.textContent).not.toContain('unchecked')
    await act(async () => action.click())
    expect(openOperations).toHaveBeenCalledWith('B-901', 'Booked', 'Pack')
  })
  it('uses a native detail link separate from the operational action', async () => {
    await mount()
    expect(host.querySelector('article[role="link"]')).toBeNull()
    expect(host.querySelector('a')?.textContent).toContain('AV Production')
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/clients/client-1')
    expect(host.querySelector('a[href="/rentals/B-901"]')).not.toBeNull()
    await act(async () => host.querySelector<HTMLButtonElement>('.movement-card__cta-btn')!.click())
    expect(openOperations).toHaveBeenCalledWith('B-901', 'On Rent', 'Return')
  })
  it('keeps overdue status explicit and opens the gated handover workspace for packed rentals', async () => {
    await mount({ status: 'Packed', flags: ['Overdue'], statusNote: '1 day late' }, 'outgoing')
    await act(async () => host.querySelector<HTMLButtonElement>('.movement-card__cta-btn')!.click())
    expect(openOperations).toHaveBeenCalledWith('B-901', 'Packed', 'Handover')
  })
  it('exposes truthful page progress and a single load-more action when more rows exist', async () => {
    const onLoadMore = vi.fn()
    await mount({}, 'incoming', { onLoadMore, hasMore: true, total: 120 })
    expect(host.textContent).toContain('Showing 1 of 120')
    const loadMore = host.querySelector<HTMLButtonElement>('button[aria-label="Load more returns"]')
    expect(loadMore).not.toBeNull()
    await act(async () => loadMore!.click())
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})

describe('meaningful rows (ruled 8 Oct 2026)', () => {
  const tags = () => [...host.querySelectorAll('.movement-card__tag')].map((t) => t.textContent?.trim())
  const when = () => host.querySelector('.movement-card__when')?.textContent

  it('says whether a pickup is packed, and how it leaves', async () => {
    await mount({ status: 'Booked', deliveryType: 'Babin Delivery' }, 'outgoing')
    expect(tags()).toEqual(['Not packed yet', 'Delivery'])
    await act(async () => root.unmount()); host.remove()
    await mount({ status: 'Packed', deliveryType: 'Client Pickup' }, 'outgoing')
    expect(tags()).toEqual(['Packed', 'Client pickup'])
  })

  it('anchors the row on its time, with the day when it is not today', async () => {
    await mount({ at: 600, atDayAd: '2026-09-22' }, 'outgoing')
    expect(when()).toBe('10:00AM · Tue 22 Sep')
  })

  it('names the day a return is due and never calls tomorrow today', async () => {
    await mount({ atDayAd: '2026-09-22' })
    expect(tags()).toEqual(['Due back Tue 22 Sep'])
    expect(host.textContent).not.toContain('today')
    await act(async () => root.unmount()); host.remove()
    await mount({ atDayAd: '2026-09-21' })
    expect(tags()).toEqual(['Due back today'])
  })

  it('leads an overdue return with how late it is, and adds no due tag', async () => {
    await mount({ flags: ['Overdue'], statusNote: '79 days late' })
    expect(when()).toBe('79dlate')
    expect(host.querySelector('.movement-card__when--late')).not.toBeNull()
    expect(tags()).toEqual([])
    expect(host.textContent).toContain('Overdue · 79 days late')
  })
})

describe('return countdown (md brief 11)', () => {
  const countdown = () => host.querySelector<HTMLElement>('[data-testid="return-countdown"]')
  // Only Date is faked: the panel's own act/render path keeps real timers.
  afterEach(() => { vi.useRealTimers() })

  it('counts down to a return that is still out, under its Return time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-21T23:00:00.000Z'))
    // 22 Sep 10:00 in Kathmandu is 04:15Z — 5h 15m after the instant above.
    await mount({ returnDueAtAd: '2026-09-22T04:15:00.000Z' })
    expect(countdown()?.textContent).toBe('in 5h 15m')
    expect(countdown()?.closest('.movement-card__schedule--return')).not.toBeNull()
  })

  it('says nothing more on an overdue row — its time column and badge already say how late', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-23T04:15:00.000Z'))
    await mount({ flags: ['Overdue'], statusNote: '1 day late', returnDueAtAd: '2026-09-22T04:15:00.000Z' })
    expect(countdown()).toBeNull()
  })

  it('never counts down on an outgoing row or one already back', async () => {
    await mount({ status: 'Booked' }, 'outgoing')
    expect(countdown()).toBeNull()
    await act(async () => root.unmount()); host.remove()
    await mount({ status: 'Returned' })
    expect(countdown()).toBeNull()
  })
})
