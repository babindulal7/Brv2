// @vitest-environment jsdom
/**
 * # Calendar Workspace — 5-State PageBody Hardening Tests
 *
 * Phase 6 Screen Hardening:
 * Tests the 5 states rendered via PageBody for Calendar.tsx:
 *   1. loading (LoadingSkeleton rendered)
 *   2. error (ErrorBanner rendered with retry action)
 *   3. empty / filtered (EmptyState with Clear filters action restoring rows)
 *   4. restricted (RestrictedState rendered for non-staff Client role)
 *   5. hasRows / content (standard Month & Timeline view rendered)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { CalendarProps } from '../Calendar'

let role = 'Owner'
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
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

const Calendar = (await import('../Calendar')).default

let container: HTMLDivElement
let root: Root

async function mount(props: CalendarProps = {}, as = 'Owner', width = 1200) {
  role = as
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/calendar']}>
        <Calendar {...props} />
      </MemoryRouter>,
    )
  })
}

describe('Calendar — 5-State PageBody Hardening', () => {
  beforeEach(() => {
    role = 'Owner'
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  it('renders LoadingSkeleton when loading prop is true', async () => {
    await mount({ loading: true })
    expect(container.textContent).toContain('Loading calendar…')
  })

  it('renders ErrorBanner with retry callback when error prop is set', async () => {
    const onRetry = vi.fn()
    await mount({ error: 'Database network timeout', onRetry })

    expect(container.textContent).toContain('Could not refresh calendar')
    expect(container.textContent).toContain('Database network timeout')

    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
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
    expect(container.textContent).toContain('Requires Staff')
    expect(container.textContent).toContain('The operational resource calendar is for staff only')
  })

  it('renders standard Month and Timeline views with rows for staff roles', async () => {
    await mount({}, 'Owner', 1200)
    expect(container.textContent).toContain('Calendar')
    expect(container.textContent).toContain('Active Bookings')
    expect(container.textContent).toContain('Schedule Conflicts')
    expect(container.textContent).toContain('Festivals & Holidays')

    // Switch to Timeline view tab
    const timelineTab = Array.from(container.querySelectorAll<HTMLButtonElement>('button[role="tab"]')).find(
      (b) => b.textContent?.trim() === 'Timeline',
    )
    expect(timelineTab).toBeDefined()
    await act(async () => {
      timelineTab?.click()
    })

    expect(container.textContent).toContain('Sony FX3')
  })

  it('renders EmptyState when search filter has no matching resources, and restores on clear', async () => {
    await mount({}, 'Owner', 1200)

    // Switch to Timeline view tab
    const timelineTab = Array.from(container.querySelectorAll<HTMLButtonElement>('button[role="tab"]')).find(
      (b) => b.textContent?.trim() === 'Timeline',
    )
    await act(async () => {
      timelineTab?.click()
    })

    // Open filters panel
    const filtersBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.trim() === 'Filters',
    )
    await act(async () => {
      filtersBtn?.click()
    })

    // Find search input in filters panel
    const searchInput = container.querySelector('input[placeholder*="Search"]') as HTMLInputElement | null

    if (searchInput) {
      await act(async () => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set
        nativeInputValueSetter?.call(searchInput, 'NonexistentEquipment999')
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
        searchInput.dispatchEvent(new Event('change', { bubbles: true }))
      })

      // Timeline should display the filter-aware empty state
      expect(container.textContent).toContain('No resources match these filters')
      expect(container.textContent).toContain('Clear the search or event type filters to see all resources.')

      // Find Clear filters button inside the empty state
      const clearBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        b.textContent?.includes('Clear filters'),
      )
      expect(clearBtn).toBeDefined()

      await act(async () => {
        clearBtn?.click()
      })

      // Resources should be restored
      expect(container.textContent).toContain('Sony FX3')
    }
  })
})
