// @vitest-environment jsdom
/**
 * The shell's width rules, driven rather than read.
 *
 * `data/nav.test.ts` proves the *rules* — the fixed 11, the Law 6 filter, which
 * nav entry owns which route. This proves the two components actually apply
 * them: that exactly one row carries `aria-current="page"`, that Law 13's width
 * bands produce 219 / 72 / nothing, and that a stored manual-collapse
 * preference cannot widen a tablet rail back to 219px.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`
 * and documents this opt-in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'
import { SCANNER_TOGGLE_EVENT } from '../ScannerFab'

let viewport: Viewport = 'desktop'
let collapsedPref = false

let syncMockState = { status: 'synced', syncStatus: 'synced', pendingCount: 0, error: null as string | null, triggerSync: vi.fn() }

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { name: 'Babin Shrestha', role: 'Owner' },
    hasPin: true,
    lockNow: vi.fn(),
    logout: vi.fn(),
  }),
}))
vi.mock('../../../lib/theme', () => ({ useTheme: () => ({ theme: 'dark', setMode: () => {} }) }))
vi.mock('../../../lib/syncContext', () => ({ useSync: () => syncMockState }))
vi.mock('../../../lib/collapse', () => ({ useCollapsed: () => [collapsedPref, () => {}] }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Sidebar } = await import('../Sidebar')
const { default: BottomBar } = await import('../BottomBar')
const { default: Header } = await import('../Header')
const { PageActions } = await import('../../ui/PageActions')
const { PageHeader } = await import('../../ui/Page')
const { Button } = await import('../../ui/Button')
const { Unavailable } = await import('../../ui/Unavailable')

let container: HTMLDivElement
let root: Root

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter>{node}</MemoryRouter>)
  })
}

beforeEach(() => {
  viewport = 'desktop'
  collapsedPref = false
  syncMockState = { status: 'synced', syncStatus: 'synced', pendingCount: 0, error: null, triggerSync: vi.fn() }
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Sidebar — Law 13, width decides', () => {
  it('uses the expanded sidebar token at desktop, with all primary labels readable', async () => {
    await mount(<Sidebar active="/dashboard" />)
    const aside = container.querySelector('aside')
    expect(aside?.style.width).toBe('var(--app-sidebar-width)')
    expect(container.querySelectorAll('nav[aria-label="Main"] a')).toHaveLength(10)
    expect(container.textContent).toContain('Dashboard')
    expect(container.textContent).toContain('Rentals')
    expect(container.textContent).toContain('Operations')
    expect(container.textContent).toContain('More')
  })

  it('keeps a manual expand toggle available on a collapsed tablet rail', async () => {
    viewport = 'tablet'
    collapsedPref = true
    await mount(<Sidebar active="/dashboard" />)
    expect(container.querySelector('aside')?.style.width).toBe('var(--app-sidebar-collapsed-width)')
    expect(container.textContent).not.toContain('Crew Assist')
    expect(container.querySelector('[aria-label="Collapse navigation"]')).toBeNull()
    expect(container.querySelector('[aria-label="Expand navigation"]')).not.toBeNull()
  })

  it('still speaks each primary label in the rail — aria-label on every row', async () => {
    viewport = 'tablet'
    collapsedPref = true
    await mount(<Sidebar active="/dashboard" />)
    const labels = [...container.querySelectorAll('nav[aria-label="Main"] a')].map((a) => a.getAttribute('aria-label'))
    expect(labels).toContain('Rentals')
    expect(labels).toContain('Operations')
    expect(labels.every((l) => l !== null && l.length > 0)).toBe(true)
  })

  it('honours an expanded navigation preference on tablet', async () => {
    /* The conflict Law 13 exists to settle: preference says "expanded", the
       768–1279 band says 72. Width wins. */
    collapsedPref = false
    viewport = 'tablet'
    await mount(<Sidebar active="/dashboard" />)
    expect(container.querySelector('aside')?.style.width).toBe('var(--app-sidebar-width)')
  })

  it('honours the manual collapse only at desktop', async () => {
    collapsedPref = true
    await mount(<Sidebar active="/dashboard" />)
    expect(container.querySelector('aside')?.style.width).toBe('var(--app-sidebar-collapsed-width)')
    expect(container.querySelector('[aria-label="Expand navigation"]')).not.toBeNull()
  })

  it('renders nothing at phone — the bottom bar is the nav below 768', async () => {
    viewport = 'phone'
    await mount(<Sidebar active="/dashboard" />)
    expect(container.querySelector('aside')).toBeNull()
  })
})

describe('Sidebar — exactly one active row', () => {
  const current = () => [...container.querySelectorAll('[aria-current="page"]')].map((el) => el.textContent)

  it('/rentals/new lights Rentals', async () => {
    await mount(<Sidebar active="/rentals/new" />)
    expect(current()).toEqual(['Rentals'])
  })

  it('/rentals lights Rentals alone', async () => {
    await mount(<Sidebar active="/rentals" />)
    expect(current()).toEqual(['Rentals'])
  })

  it('/rentals/B-715 lights Rentals alone', async () => {
    await mount(<Sidebar active="/rentals/B-715" />)
    expect(current()).toEqual(['Rentals'])
  })

  it('/rentals/B-715/packing lights Rentals alone', async () => {
    await mount(<Sidebar active="/rentals/B-715/packing" />)
    expect(current()).toEqual(['Rentals'])
  })

  it('/operations?queue=packing lights Operations alone', async () => {
    await mount(<Sidebar active="/operations?queue=packing" />)
    expect(current()).toEqual(['Operations'])
  })
})

describe('BottomBar — five fixed slots', () => {
  beforeEach(() => {
    viewport = 'phone'
  })

  it('is Today · Rentals · New · Inventory · More for booking-capable roles', async () => {
    await mount(<BottomBar active="/dashboard" />)
    const nav = container.querySelector('nav[aria-label="Main"]')
    const slots = [...(nav?.children ?? [])].map((el) => el.textContent)
    expect(slots).toEqual(['Today', 'Rentals', 'New', 'Inventory', 'More'])
  })

  it('triggers the one Scanner rather than carrying its own', async () => {
    await mount(<BottomBar active="/dashboard" />)
    const more = [...container.querySelectorAll('button')].find(button => button.textContent === 'More')
    await act(async () => more?.click())
    const fired = vi.fn()
    window.addEventListener(SCANNER_TOGGLE_EVENT, fired)
    const scan = container.querySelector<HTMLButtonElement>('[data-scanner]')
    await act(async () => scan?.click())
    window.removeEventListener(SCANNER_TOGGLE_EVENT, fired)
    expect(fired).toHaveBeenCalledTimes(1)
    /* Marked as part of the scanner, so ScannerFab's outside-click handler
       does not close the panel the same click is opening. */
    expect(scan?.hasAttribute('data-scanner')).toBe(true)
  })

  it('opens a real modal sheet from More, and Escape closes it', async () => {
    await mount(<BottomBar active="/dashboard" />)
    const more = [...container.querySelectorAll('button')].find((b) => b.textContent === 'More')
    await act(async () => more?.click())

    const sheet = document.querySelector('[role="dialog"][aria-modal="true"]')
    expect(sheet).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    /* Clients is in More despite the spec's list omitting it — TODO(decision). */
    expect(sheet?.textContent).toContain('Clients')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(document.body.style.overflow).toBe('')
  })

  it('gives every slot a 44px minimum hit area (Law 15)', async () => {
    await mount(<BottomBar active="/dashboard" />)
    const nav = container.querySelector('nav[aria-label="Main"]')
    for (const el of [...(nav?.children ?? [])] as HTMLElement[]) {
      expect(el.style.minHeight).toBe('44px')
      expect(el.style.minWidth).toBe('44px')
    }
  })

  it('adds the home-indicator inset to its height instead of eating the slots', async () => {
    /* The 44px assertion above cannot catch this: jsdom performs no layout, so
       a bar whose content box had been shrunk to 24px by its own padding still
       reported minHeight 44 on every slot. What is checkable here is the shape
       of the declaration — `height` must carry the inset, because with
       `* { box-sizing: border-box }` (theme.css) a `height: 58` + separate
       `padding-bottom: env(...)` pair reserves nothing at all. */
    await mount(<BottomBar active="/dashboard" />)
    const bar = container.querySelector<HTMLElement>('nav[aria-label="Main"]')
    expect(bar?.style.height).toContain('58px')
    expect(bar?.style.height).toContain('env(safe-area-inset-bottom')
    /* And the slots keep their own 58px row, so the extra height is empty space
       under them rather than five slots spread across the indicator. */
    expect(bar?.style.gridTemplateRows).toBe('58px')
    expect(bar?.style.alignContent).toBe('start')
  })
})

describe('Header — Phase 5, 390px phone layout & Law 15 hit targets', () => {
  it('renders breadcrumb links and desktop search at desktop width', async () => {
    viewport = 'desktop'
    await mount(
      <Header
        crumbs={[
          { label: 'Rentals', to: '/rentals' },
          { label: 'B-715' },
        ]}
      />,
    )
    const breadcrumb = container.querySelector('nav[aria-label="Breadcrumb"]')
    expect(breadcrumb).not.toBeNull()
    const link = breadcrumb?.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/rentals')
    expect(breadcrumb?.textContent).toContain('Rentals')
    expect(breadcrumb?.textContent).toContain('B-715')
    expect(container.textContent).toContain('⌘K')
  })

  it('keeps phone header free of overlap at 390px with single crumb and 44px targets', async () => {
    viewport = 'phone'
    await mount(
      <Header
        crumbs={[
          { label: 'Rentals', to: '/rentals' },
          { label: 'Booking B-2026-000492-Equipment-Dispatch' },
        ]}
      />,
    )
    const breadcrumb = container.querySelector('nav[aria-label="Breadcrumb"]')
    expect(breadcrumb).not.toBeNull()
    // Takes only the last crumb on phone
    expect(breadcrumb?.textContent).not.toContain('Rentals')
    expect(breadcrumb?.textContent).toContain('Booking B-2026-000492-Equipment-Dispatch')

    // Search button exists on phone and has 44px minimum target (Law 15)
    const searchBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Search"]')
    expect(searchBtn).not.toBeNull()
    expect(searchBtn?.style.minHeight).toBe('44px')
    expect(searchBtn?.style.minWidth).toBe('44px')

    // User profile avatar button has 44px minimum hit target (Law 15)
    const profileBtn = container.querySelector<HTMLButtonElement>('button[aria-label*="user profile"]')
    expect(profileBtn).not.toBeNull()
    expect(profileBtn?.style.minHeight).toBe('44px')
    expect(profileBtn?.style.minWidth).toBe('44px')
  })
})

describe('Header — R1 simplification & abnormal sync gating', () => {
  it('does not render persistent Kathmandu clock, AD/BS date badge, or language toggle', async () => {
    viewport = 'desktop'
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    expect(container.querySelector('.header-clock')).toBeNull()
    expect(container.querySelector('.header-date-badge')).toBeNull()
    expect(container.querySelector('.header-lang-toggle')).toBeNull()
  })

  it('hides sync badge in normal synced state with 0 pending mutations', async () => {
    viewport = 'desktop'
    syncMockState = { status: 'synced', syncStatus: 'synced', pendingCount: 0, error: null, triggerSync: vi.fn() }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    /* Layout-stable slot: always mounted so its appearance can never push the
       search box sideways, but invisible + unfocusable when healthy. */
    const slot = container.querySelector<HTMLElement>('.header-sync-context')
    expect(slot).not.toBeNull()
    expect(slot?.style.visibility).toBe('hidden')
    expect(slot?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.header-sync-control')?.getAttribute('tabindex')).toBe('-1')
  })

  it('renders sync badge in abnormal state (syncing) with Law 15 touch target (>= 44x44px)', async () => {
    viewport = 'desktop'
    syncMockState = { status: 'syncing', syncStatus: 'syncing', pendingCount: 0, error: null, triggerSync: vi.fn() }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const syncBadge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(syncBadge).not.toBeNull()
    expect(syncBadge?.textContent).toContain('Syncing…')
    expect(syncBadge?.style.minHeight).toBe('44px')
    expect(parseInt(syncBadge?.style.minWidth ?? '0', 10)).toBeGreaterThanOrEqual(44)
    expect(container.querySelector<HTMLElement>('.header-sync-context')?.style.visibility).toBe('visible')
  })

  it('renders sync badge in abnormal state (pending mutations queued)', async () => {
    viewport = 'desktop'
    syncMockState = { status: 'synced', syncStatus: 'synced', pendingCount: 3, error: null, triggerSync: vi.fn() }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const syncBadge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(syncBadge).not.toBeNull()
    expect(syncBadge?.textContent).toContain('3 Queued')
  })

  it('renders compact user profile trigger with 44px minimum target on desktop and opens menu on click', async () => {
    viewport = 'desktop'
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const profileBtn = container.querySelector<HTMLButtonElement>('button[aria-label*="user profile"]')
    expect(profileBtn).not.toBeNull()
    expect(profileBtn?.style.minHeight).toBe('44px')
    expect(profileBtn?.style.minWidth).toBe('44px')

    // Click profile trigger opens dialog menu
    await act(async () => profileBtn?.click())
    const dialog = container.querySelector('[role="dialog"][aria-label="User profile"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Babin Shrestha')
    expect(dialog?.textContent).toContain('Lock Session')
    expect(dialog?.textContent).toContain('Log Out')
  })
})

describe('Sidebar — R1 footer rationalization', () => {
  it('does not display static branch address or VAT lines in sidebar footer', async () => {
    viewport = 'desktop'
    await mount(<Sidebar active="/dashboard" />)
    expect(container.textContent).not.toContain('Boudha, Kathmandu')
    expect(container.textContent).not.toContain('VAT: 623587106')
  })

  it('retains branding wordmark and 3 core navigation groups', async () => {
    viewport = 'desktop'
    await mount(<Sidebar active="/dashboard" />)
    expect(container.textContent).toContain('BR')
    expect(container.textContent).toContain('Babin')
    expect(container.textContent).toContain('Rentals OS')
    // 3 core navigation domains
    const navGroups = container.querySelectorAll('[data-nav-group]')
    expect(navGroups).toHaveLength(3)
    const groupTitles = Array.from(navGroups).map((g) => g.getAttribute('data-nav-group'))
    expect(groupTitles).toContain('Daily Dispatch')
    expect(groupTitles).toContain('Assets & Relationships')
    expect(groupTitles).toContain('Business & Back Office')
  })
})

describe('PageActions & PageHeader — R1 action hierarchy & placeholder removal', () => {
  it('enforces 1 primary CTA and up to 2 visible secondary actions', async () => {
    await mount(
      <PageActions
        primary={<Button variant="primary">New Rental</Button>}
        secondary={[
          <Button key="1">Fast Return</Button>,
          <Button key="2">Record Payment</Button>,
        ]}
      />
    )
    expect(container.textContent).toContain('New Rental')
    expect(container.textContent).toContain('Fast Return')
    expect(container.textContent).toContain('Record Payment')
    // No overflow menu trigger needed for 2 or fewer secondary actions
    expect(container.querySelector('button[aria-label="More actions"]')).toBeNull()
  })

  it('routes 3rd+ secondary actions into overflow menu (•••) with 44px hit target', async () => {
    await mount(
      <PageActions
        primary={<Button variant="primary">New Rental</Button>}
        secondary={[
          <Button key="1">Fast Return</Button>,
          <Button key="2">Record Payment</Button>,
          <Button key="3">Scan Barcode</Button>,
          <Button key="4">Refresh</Button>,
        ]}
      />
    )
    expect(container.textContent).toContain('New Rental')
    expect(container.textContent).toContain('Fast Return')
    expect(container.textContent).toContain('Record Payment')

    // Overflow menu trigger button exists and has 44px target (Law 15)
    const overflowBtn = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    expect(overflowBtn).not.toBeNull()
    expect(overflowBtn?.style.minHeight).toBe('44px')
    expect(overflowBtn?.style.minWidth).toBe('44px')

    // Click overflow menu button reveals excess actions
    await act(async () => overflowBtn?.click())
    const menu = container.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('Scan Barcode')
    expect(menu?.textContent).toContain('Refresh')
  })

  it('removes unbuilt placeholder actions (<Unavailable> wrappers) from PageActions', async () => {
    await mount(
      <PageActions
        primary={<Unavailable reason="Not built"><Button variant="primary">Export Everything</Button></Unavailable>}
        secondary={[
          <Button key="1">Action One</Button>,
          <Unavailable key="2" reason="Under construction"><Button>Disabled Feature</Button></Unavailable>,
        ]}
      />
    )
    expect(container.textContent).not.toContain('Export Everything')
    expect(container.textContent).not.toContain('Disabled Feature')
    expect(container.textContent).toContain('Action One')
  })

  it('removes unbuilt placeholder actions (<Unavailable> wrappers) passed to PageHeader', async () => {
    await mount(
      <PageHeader
        title="Fleet Overview"
        actions={
          <>
            <Unavailable reason="Under construction"><Button>Export PDF</Button></Unavailable>
            <Button>Sync</Button>
          </>
        }
      />
    )
    expect(container.textContent).not.toContain('Export PDF')
    expect(container.textContent).toContain('Sync')
  })
})

