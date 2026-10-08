// @vitest-environment jsdom
/**
 * # Rentals list — what §4.1 actually renders, at all three widths
 *
 * `rentalsList.test.ts` beside this file pins the two *mappings* (chip →
 * `ListFilters`, raw row → view model). This one pins the **screen**, because
 * the 12 Aug rebuild made claims that a unit test over `data/rentals.ts` cannot
 * see:
 *
 *  1. **Productions is removed** (`04_RENTALS.md` line 3) — the tab strip, the
 *     tab component and the two seed files are gone. A later session must not
 *     be able to reinstate the tab without this failing.
 *  2. **Sub-Rental is a chip, not a tab**, and it is `disabled` carrying its
 *     reason — rulings §9.1 is still open and the data model answers none of
 *     its three readings.
 *  3. **The action column stays visible while the table scrolls horizontally**
 *     (§4.1's last desktop line). That is a real requirement, not decoration.
 *  4. **Import is gone, Export stays honestly disabled.**
 *  5. The three layouts, from ONE width reading (Law 14).
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { BookingListRow } from '../../../lib/queries/bookings'
import type { SystemRole } from '../../../types/database'

/**
 * The sub-rented lines the mocked `booking_lines_v` returns.
 *
 * §11.1's chip and row marker both read `subRentalBookingIds()`, which is the
 * one query this screen makes outside `listBookings`. Driving it from here is
 * what lets a test say "this booking has a sub-rented line" and then assert the
 * gold outline — the whole point of a derived flag is that it follows the lines.
 */
const lines = vi.hoisted(() => ({
  rows: [] as { booking_id: string; line_type: string }[],
  shouldFail: false,
}))

/* `data/rentals.ts` reaches `queries/bookings.ts` for its named filter sets,
   and that module holds the supabase client. Replaced wholesale, exactly as the
   sibling suite does — nothing here touches a database.

   The builder is chainable and thenable because `subRentalBookingIds` calls
   `.select().in().is().order().range()` and awaits the result; a bare `{}` would
   throw inside a promise and surface as an unrelated failure three tests later.

   `order` and `range` joined the chain when that function was paged to
   exhaustion — an unpaged read stops at PostgREST's 1000-row cap and reports the
   bookings past it as carrying no external gear, which is a fabricated "no". The
   fixture is far short of one page, so the loop breaks after the first call and
   `range` can ignore its arguments here; a fixture that ever crosses 1000 rows
   would need this double to honour them. */
vi.mock('../../../lib/supabase', () => {
  const build = () => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'in', 'is', 'eq', 'order', 'range']) chain[method] = () => chain
    chain['then'] = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      if (lines.shouldFail) {
        if (reject) return reject(new Error('Subrental query failed'))
        return Promise.reject(new Error('Subrental query failed'))
      }
      return resolve({ data: lines.rows, error: null })
    }
    return chain
  }
  return {
    supabase: { from: () => build() },
    newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  }
})

const ROW: BookingListRow = {
  id: '8f1d1a56-0b6a-4f0e-9d3c-2f4b6c7a9e11',
  bookingNo: 'B-715',
  clientId: 'c0ffee00-1111-4222-8333-444455556666',
  clientName: 'Mountain Stories',
  project: 'FX3 Documentary',
  projectType: 'Documentary',
  projectTypeOther: null,
  stage: 'Booked',
  pickupAtAd: '2026-08-14T03:15:00.000Z',
  returnAtAd: '2026-08-18T10:30:00.000Z',
  actualReturnAtAd: null,
  deliveryType: 'Client Pickup',
  pickupLocation: 'Kathmandu',
  returnLocation: null,
  quoteExpiresAtAd: null,
  createdAtAd: '2026-07-12T09:41:00.000Z',
  itemCount: 7,
  depositRequired: null,
  isCancelled: false,
  isClosed: false,
}

/* The mocked count, so a test can have more rows than one page. `vi.hoisted`
   because a `vi.mock` factory is hoisted above ordinary consts and cannot close
   over one. Reset in `afterEach`. */
const stub = vi.hoisted(() => ({ total: 1, empty: false }))
vi.mock('../../../actions/rentals/saveDraft', () => ({ listActiveDrafts: async () => [] }))
vi.mock('../../../lib/queries/rentalViews', async (importOriginal) => { const real = await importOriginal<typeof import('../../../lib/queries/rentalViews')>(); return { ...real, listRentalViewCounts: async () => ({ rows: real.RENTAL_VIEWS.map(v => ({ id: v.id, count: 0 })) }) } })
const authStub = vi.hoisted(() => ({ role: 'Owner' as SystemRole }))

/* The real named filter sets are kept (the screen builds its four KPI queries
   from them); only the fetch is replaced, so rows actually arrive and the table
   renders. */
vi.mock('../../../lib/queries/bookings', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/queries/bookings')>()
  return { ...real, listBookings: async () => (stub.empty ? { rows: [], total: 0 } : { rows: [ROW], total: stub.total }) }
})

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: authStub.role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

/* RentalsList.RowOperations calls useOperationsWorkspace — mock the context so
   tests don't need a real provider (which would render OperationsShell). */
vi.mock('../../operations/OperationsWorkspaceContext', () => ({
  OperationsWorkspaceProvider: ({ children }: { children: unknown }) => children,
  useOperationsWorkspace: () => ({ openOperations: vi.fn(), closeOperations: vi.fn() }),
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

const { default: RentalsList } = await import('../RentalsList')

let container: HTMLDivElement
let root: Root

/** The live query string, so a test can assert what a refresh would restore. */
let search = ''
let pathname = ''
function LocationProbe() {
  const location = useLocation()
  search = location.search
  pathname = location.pathname
  return null
}

/** v4.1 §7.7's breakpoints — 768 and 1280. Width only (Law 14). */
async function mount(width: number, entry = '/rentals') {
  if (root) {
    await act(async () => root.unmount())
    container?.remove()
  }
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <RentalsList />
        <LocationProbe />
      </MemoryRouter>,
    )
  })
  // One more tick so `useList`'s async fetch has resolved into the tree.
  await act(async () => {
    await Promise.resolve()
  })
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  document.body.innerHTML = ''
  stub.total = 1
  stub.empty = false
  lines.rows = []
  lines.shouldFail = false
  authStub.role = 'Owner'
})

const text = () => document.body.textContent ?? ''
const allButtons = () => [...document.body.querySelectorAll('button')]
const button = (label: string) => allButtons().find((b) => (b.querySelector('[data-view-label]')?.textContent ?? b.textContent)?.trim() === label)

describe('§4.1 — one list, no tabs', () => {
  it('renders no tab strip and no trace of Productions', async () => {
    await mount(1280)
    // `04_RENTALS.md` line 3 removes it in prose, which is what makes this one
    // of the eight genuine deletions in rulings §1.
    expect(text()).not.toContain('Productions')
    expect(button('Bookings')).toBeUndefined()
  })

  it('draws the 5 operational view chips in order', async () => {
    await mount(1280)
    const chips = allButtons()
      .filter((b) => b.getAttribute('aria-pressed') !== null)
      .map((b) => (b.querySelector('[data-view-label]')?.textContent ?? b.textContent)?.trim())
    expect(chips.slice(0, 7)).toEqual(['All', 'Draft', 'Quote', 'Upcoming', 'Out', 'Returns', 'Closed'])
  })

  it('gives every operational view chip an icon beside its word (Law 11 — never colour alone)', async () => {
    await mount(1280)
    const upcoming = allButtons().find((b) => b.getAttribute('aria-label') === 'Upcoming')
    expect(upcoming?.querySelector('svg')).not.toBeNull()
  })

  it('keeps the list and pager as the primary V2 workspace', async () => {
    await mount(1280)
    expect(text()).not.toContain('Active Rentals')
    expect(text()).toContain('1 Rental found')
    expect(text()).not.toContain('Rows per page')
  })
})

describe('Sub-Rental — the chip that replaced the tab, live since rulings §11.1', () => {
  it('is a real, selectable chip once the derived set has arrived', async () => {
    await mount(1280)
    const sub = button('Sub-Rental')
    expect(sub).toBeDefined()
    // ⛔ It used to ship `disabled` with a TODO(decision). §11.1 closed that.
    expect(sub?.disabled).toBe(false)
    expect(sub?.getAttribute('aria-pressed')).toBe('false')
  })

  it('carries an icon beside its word, like every other chip (Law 11)', async () => {
    await mount(1280)
    expect(button('Sub-Rental')?.querySelector('svg')).not.toBeNull()
  })

  it('writes itself into the URL, so a refresh keeps the filter (§18)', async () => {
    await mount(1280)
    await act(async () => {
      button('Sub-Rental')?.click()
    })
    expect(search).toContain('sub=on')
  })

  it('marks a row whose booking has a sub-rented line — outline, icon AND label', async () => {
    lines.rows = [{ booking_id: ROW.id, line_type: 'Sub-rental' }]
    await mount(1280)
    // Law 11 — the gold outline is never the only carrier. The word is what a
    // screen reader and a monochrome print get.
    expect(text()).toContain('Sub-rented')
    const marked = [...container.querySelectorAll('[aria-label]')].find((el) =>
      el.getAttribute('aria-label')?.startsWith('Sub-rented'),
    )
    expect(marked).toBeDefined()
  })

  it('marks nothing when no line is sub-rented — never a fabricated “no”', async () => {
    await mount(1280)
    expect(text()).not.toContain('Sub-rented')
  })
})

describe('the header actions — 1 primary CTA, secondary actions, and no unbuilt Export', () => {
  it('no longer draws an unbuilt placeholder Export button', async () => {
    await mount(1280)
    expect(button('Export')).toBeUndefined()
  })

  it('no longer draws an Import button', async () => {
    await mount(1280)
    expect(button('Import')).toBeUndefined()
  })
})

describe('§4.1 — "action column stays visible; table scrolls horizontally"', () => {
  it('pins the Actions header and cell to the right edge of the scroller', async () => {
    await mount(1280)
    const scroller = container.querySelector('[data-table-scroll]') as HTMLElement | null
    expect(scroller).not.toBeNull()
    expect(scroller?.style.overflowX).toBe('auto')

    const headers = [...container.querySelectorAll('th')]
    const actions = headers[headers.length - 1]
    expect(actions?.textContent).toContain('Actions')
    expect(actions?.style.position).toBe('sticky')
    expect(actions?.style.right).toBe('0px')

    // A sticky cell floats over the columns sliding beneath it, so it needs its
    // own opaque background or they read straight through.
    expect(actions?.style.background).not.toBe('')

    const cells = [...container.querySelectorAll<HTMLTableCellElement>('tbody td')]
    const lastCell = cells[cells.length - 1]
    expect(lastCell?.style.position).toBe('sticky')
    expect(lastCell?.style.background).not.toBe('')
  })
})

/** The Filters button — `aria-controls` rather than its label, which is shared. */
const filterButton = () => container.querySelector<HTMLButtonElement>('button[aria-controls="rentals-filters"]')

describe('§18 — this screen’s filters are the query string', () => {
  it('restores a quick filter and a stage from the URL, before any query fires', async () => {
    // What a refresh, a bookmark and a shared link all depend on.
    await mount(1280, '/rentals?quick=Overdue&stage=Booked')
    const overdue = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Overdue')
    expect(overdue?.getAttribute('aria-pressed')).toBe('true')
    const row = container.querySelector('[aria-label="Active filters"]')
    expect(row?.textContent).toContain('Stage: Booked')
  })

  it('puts a picked operational view on the URL', async () => {
    await mount(1280)
    const out = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Out')!
    await act(async () => out.click())
    expect(search).toBe('?stage=On+Rent')
  })

  it('shows what is narrowing the list as removable chips', async () => {
    await mount(1280, '/rentals?quick=Overdue&stage=Booked')
    const row = container.querySelector('[aria-label="Active filters"]')
    expect(row?.textContent).toContain('Stage: Booked')
    expect(row?.textContent).toContain('Quick filter: Overdue')
    // §6 — two groups, so the badge reads 2 rather than counting values.
    expect(filterButton()?.textContent).toContain('2')
  })

  it('drops every filter in ONE write, so one Back undoes Clear all', async () => {
    await mount(1280, '/rentals?quick=Overdue&stage=Booked&stage=Packed')
    const clear = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Clear all')!
    await act(async () => clear.click())
    expect(search).toBe('')
  })

  it('keeps a page the URL named once the count says it exists', async () => {
    /*
     * `total` is null until the count lands, and `pageCount` collapses to 1
     * while it is — so a "clamp a stale page" effect that does not wait for the
     * count rewrites `?page=3` to page 1 on the very first render, before the
     * count has had a chance to disagree. §18's "a refresh puts you back where
     * you were" would then hold for every filter except the page number, and a
     * second wasted query would run behind it.
     *
     * 120 rows over 20 per page is six pages, so page 3 is real here. With the
     * default one-row stub it is not, and the clamp would be right to drop it —
     * which is why this test sets its own count rather than reading the URL
     * back under the default.
     */
    stub.total = 120
    await mount(1280, '/rentals?page=3')
    expect(search).toContain('page=3')
  })

  it('ignores a hand-edited URL naming things that do not exist', async () => {
    // A query string is user input: a bookmark someone edited, a link a chat
    // client truncated, a URL from before a stage was renamed. None of it may
    // reach `rentalsQuery` unchecked.
    await mount(1280, '/rentals?quick=DropTable&stage=Nonsense')
    const all = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'All')
    expect(all?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[aria-label="Active filters"]')).toBeNull()
  })
})

describe('the three layouts, from one width reading (Law 14)', () => {
  it('desktop ≥1280 — the filter drawer is absent when closed and opens beside the list', async () => {
    await mount(1280)
    expect(container.querySelector('table')).not.toBeNull()

    // Closed by default, so it consumes no workspace track.
    expect(filterButton()?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.filter-overlay')).toBeNull()
    expect(text()).not.toContain('Save as new filter')

    await act(async () => filterButton()!.click())
    const panel = container.querySelector<HTMLElement>('.filter-overlay [role="dialog"]')
    expect(panel).not.toBeNull()
    expect(panel?.parentElement?.style.position).toBe('fixed')
    expect(panel?.style.position).toBe('relative')
    expect(panel?.textContent).toContain('Smart Views & Presets')
  })

  it('tablet 768–1279 — fewer columns, and the filter panel is reachable at this width too', async () => {
    await mount(1000)
    const headers = [...container.querySelectorAll('th')].map((h) => h.textContent?.trim())
    // §4.1 tablet draws `BR# │ client │ dates │ badge │ [prim]⋮`.
    expect(headers).not.toContain('Items')
    expect(headers).not.toContain('Return')
    expect(headers).toContain('Pickup')

    /*
     * Rulings §7 — "rails collapse below 1280" means REFLOW, not hide — used to
     * be satisfied by rendering the same card inline under the list, and this
     * test asserted that by looking for its contents on the page.
     *
     * There is no rail to collapse now, so the ruling is met a better way: one
     * button at every width opens the same panel, and it holds the same facets.
     * The claim is unchanged — the filters must not become unreachable on a
     * tablet, which is this product's actual target device — so the assertion
     * moved from "the card is already on the page" to "the card is one press
     * away", which is what the screen now promises.
     */
    const open = filterButton()
    expect(open).not.toBeNull()
    await act(async () => {
      open!.click()
    })
    expect(open?.getAttribute('aria-expanded')).toBe('true')
    expect(text()).toContain('Save as new filter')
  })

  it('phone <768 — card rows, one primary action each, no table', async () => {
    await mount(420)
    expect(container.querySelector('table')).toBeNull()
    expect(text()).toContain('Open Booking')
    expect(text()).toContain('B-715')
  })
})

describe('§Step 6 — cross-page and filter selection state', () => {
  it('clears selection when a filter changes', async () => {
    await mount(1280)
    const rowCheckbox = container.querySelector('tbody input[type="checkbox"]') as HTMLInputElement
    expect(rowCheckbox).not.toBeNull()
    await act(async () => {
      rowCheckbox.click()
    })
    expect(text()).toContain('1 rental selected')

    // Changing filter drops selection immediately
    const out = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Out')!
    await act(async () => {
      out.click()
    })
    expect(text()).not.toContain('1 rental selected')
  })
})

describe('§Step 7 — CSV Export selection behavior', () => {
  it('triggers CSV download with selected rows and respects selection', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURLMock = vi.fn()
    window.URL.createObjectURL = createObjectURLMock
    window.URL.revokeObjectURL = revokeObjectURLMock

    await mount(1280)
    const rowCheckbox = container.querySelector('tbody input[type="checkbox"]') as HTMLInputElement
    await act(async () => {
      rowCheckbox.click()
    })

    const exportBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Export CSV'))
    expect(exportBtn).toBeDefined()

    await act(async () => {
      exportBtn?.click()
    })

    expect(createObjectURLMock).toHaveBeenCalled()
    expect(revokeObjectURLMock).toHaveBeenCalled()
  })
})

describe('§Step 8 & 9 — quick action permissions and mobile card parity', () => {
  it('keeps Fast Return and Record Payment with New Rental in the shell', async () => {
    authStub.role = 'Owner'
    await mount(1280)
    expect(button('New Rental')).toBeUndefined()
    expect(button('Fast Return')).toBeDefined()
    expect(button('Record Payment')).toBeDefined()
    // Scan Barcode and Refresh are in the overflow menu (•••)
    const moreBtn = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    expect(moreBtn).not.toBeNull()
    await act(async () => {
      moreBtn.click()
    })
    expect(button('Scan Barcode')).toBeDefined()
  })

  it('hides New Rental and Record Payment for Technician, keeps Fast Return', async () => {
    authStub.role = 'Technician'
    await mount(1280)
    expect(button('New Rental')).toBeUndefined()
    expect(button('Record Payment')).toBeUndefined()
    expect(button('Fast Return')).toBeDefined()
  })

  it('hides Fast Return for Accounts, keeps Record Payment', async () => {
    authStub.role = 'Accounts'
    await mount(1280)
    expect(button('Fast Return')).toBeUndefined()
    expect(button('Record Payment')).toBeDefined()
  })

  it('provides Cancel Booking in both Desktop and Mobile views for desk writers', async () => {
    // Desktop view
    authStub.role = 'Owner'
    await mount(1280)
    const deskOpsBtn = container.querySelector('button[aria-label="Operations for B-715"]') as HTMLButtonElement
    expect(deskOpsBtn).not.toBeNull()
    await act(async () => {
      deskOpsBtn.click()
    })
    expect(text()).toContain('Cancel Booking')

    // Mobile view (Step 9 parity)
    await mount(420)
    const mobOpsBtn = container.querySelector('button[aria-label="Operations for B-715"]') as HTMLButtonElement
    expect(mobOpsBtn).not.toBeNull()
    await act(async () => {
      mobOpsBtn.click()
    })
    expect(text()).toContain('Cancel Booking')
  })

  it('hides Cancel Booking for Technician in both views', async () => {
    authStub.role = 'Technician'
    await mount(1280)
    const deskOpsBtn = container.querySelector('button[aria-label="Operations for B-715"]') as HTMLButtonElement
    await act(async () => {
      deskOpsBtn.click()
    })
    expect(text()).not.toContain('Cancel Booking')
  })
})

describe('§Step 10 & 11 — Sub-Rental refresh and retry', () => {
  it('re-queries sub-rentals when Refresh is clicked', async () => {
    lines.rows = []
    await mount(1280)
    expect(text()).not.toContain('Sub-rented')

    // Data changes in database
    lines.rows = [{ booking_id: ROW.id, line_type: 'Sub-rental' }]

    // Click Refresh from overflow menu
    const moreBtn = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    if (moreBtn) {
      await act(async () => {
        moreBtn.click()
      })
    }
    const refreshBtn = button('Refresh')
    expect(refreshBtn).toBeDefined()
    await act(async () => {
      refreshBtn?.click()
    })

    expect(text()).toContain('Sub-rented')
  })

  it('renders retry button on sub-rental failure and heals upon retry', async () => {
    lines.shouldFail = true
    await mount(1280)

    // Sub-Rental is disabled / unavailable
    const subBtn = container.querySelector('button[aria-label^="Sub-Rental — unavailable"]') as HTMLButtonElement
    expect(subBtn).not.toBeNull()
    expect(subBtn.disabled).toBe(true)

    // Retry button is available
    const retryBtn = container.querySelector('button[aria-label="Retry loading sub-rentals"]') as HTMLButtonElement
    expect(retryBtn).not.toBeNull()

    // Network recovers
    lines.shouldFail = false

    await act(async () => {
      retryBtn.click()
    })

    // Sub-Rental is now live and enabled
    const liveSubBtn = button('Sub-Rental')
    expect(liveSubBtn).toBeDefined()
    expect(liveSubBtn?.disabled).toBe(false)
  })
})

/* From main's 32c4d29, ported 8 Oct 2026: the unfiltered empty list offers its
   one next step, to the roles `rental.create` allows. */
describe('empty list — the New Rental step', () => {
  it('offers New Rental to a role that can create, and it goes to /rentals/new', async () => {
    stub.empty = true
    await mount(1280)
    expect(text()).toContain('No rentals yet')
    const cta = button('New Rental')
    expect(cta).toBeDefined()
    await act(async () => cta?.click())
    expect(pathname).toBe('/rentals/new')
  })

  it('offers nothing to a role that cannot create', async () => {
    stub.empty = true
    authStub.role = 'Accounts'
    await mount(1280)
    expect(text()).toContain('No rentals yet')
    expect(button('New Rental')).toBeUndefined()
  })
})
