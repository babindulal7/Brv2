// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'
import type { SystemRole } from '../../../types/database'

let currentRole: SystemRole | undefined = 'Owner'
let viewport: Viewport = 'desktop'
let collapsedPref = false

let syncMockState = {
  status: 'synced' as 'synced' | 'syncing' | 'pending' | 'offline' | 'error',
  syncStatus: 'synced',
  pendingCount: 0,
  error: null as string | null,
  triggerSync: vi.fn(),
}

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: currentRole ? { name: 'Test Operator', role: currentRole } : null,
    hasPin: true,
    lockNow: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../../../lib/theme', () => ({
  useTheme: () => ({ theme: 'dark', setMode: vi.fn() }),
}))

vi.mock('../../../lib/collapse', () => ({
  useCollapsed: () => [collapsedPref, (v?: boolean) => { collapsedPref = v ?? !collapsedPref }],
}))

vi.mock('../../../lib/syncContext', () => ({
  useSync: () => syncMockState,
}))

vi.mock('../../../lib/workspaceContext', () => ({
  useOptionalWorkspace: () => null,
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Sidebar } = await import('../Sidebar')
const { default: Header } = await import('../Header')
const { PageActions, extractValidActions } = await import('../../ui/PageActions')
const { PageHeader } = await import('../../ui/Page')
void PageHeader
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
  currentRole = 'Owner'
  viewport = 'desktop'
  collapsedPref = false
  syncMockState = {
    status: 'synced',
    syncStatus: 'synced',
    pendingCount: 0,
    error: null,
    triggerSync: vi.fn(),
  }
})

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
  }
  container?.remove()
})

describe('Empirical Challenger — Sidebar R1 Verification', () => {
  describe('Requirement 1: Complete removal of branch address, VAT, and PAN text', () => {
    it('ensures no branch street address, Kathmandu location, VAT, or PAN text appears in expanded desktop sidebar', async () => {
      viewport = 'desktop'
      collapsedPref = false
      await mount(<Sidebar active="/dashboard" />)

      const text = container.textContent || ''
      expect(text).not.toMatch(/boudha/i)
      expect(text).not.toMatch(/kathmandu/i)
      expect(text).not.toMatch(/vat/i)
      expect(text).not.toMatch(/623587106/)
      expect(text).not.toMatch(/pan/i)
      expect(text).not.toMatch(/branch/i)
    })

    it('ensures no branch street address, Kathmandu location, VAT, or PAN text appears in collapsed tablet rail', async () => {
      viewport = 'tablet'
      collapsedPref = true
      await mount(<Sidebar active="/dashboard" />)

      const text = container.textContent || ''
      expect(text).not.toMatch(/boudha/i)
      expect(text).not.toMatch(/kathmandu/i)
      expect(text).not.toMatch(/vat/i)
      expect(text).not.toMatch(/623587106/)
      expect(text).not.toMatch(/pan/i)
      expect(text).not.toMatch(/branch/i)
    })

    it('ensures no branch street address, Kathmandu location, VAT, or PAN text appears in collapsed desktop rail', async () => {
      viewport = 'desktop'
      collapsedPref = true
      await mount(<Sidebar active="/dashboard" />)

      const text = container.textContent || ''
      expect(text).not.toMatch(/boudha/i)
      expect(text).not.toMatch(/kathmandu/i)
      expect(text).not.toMatch(/vat/i)
      expect(text).not.toMatch(/623587106/)
      expect(text).not.toMatch(/pan/i)
      expect(text).not.toMatch(/branch/i)
    })
  })

  describe('Requirement 2: All 3 navigation groups render cleanly', () => {
    it('renders all 3 navigation groups cleanly for full-access role (Owner)', async () => {
      currentRole = 'Owner'
      viewport = 'desktop'
      collapsedPref = false
      await mount(<Sidebar active="/dashboard" />)

      const groupEls = container.querySelectorAll<HTMLElement>('[data-nav-group]')
      expect(groupEls).toHaveLength(3)

      const groupTitles = Array.from(groupEls).map((el) => el.getAttribute('data-nav-group'))
      expect(groupTitles).toEqual([
        'Daily Dispatch',
        'Assets & Relationships',
        'Business & Back Office',
      ])

      const group0 = groupEls[0]
      const group1 = groupEls[1]
      const group2 = groupEls[2]
      expect(group0).toBeDefined()
      expect(group1).toBeDefined()
      expect(group2).toBeDefined()

      // Verify Group 1: Daily Dispatch sections
      const dispatchLinks = Array.from(group0?.querySelectorAll('a') ?? []).map((a) => a.textContent?.trim())
      expect(dispatchLinks).toContain('Dashboard')
      expect(dispatchLinks).toContain('Rentals')
      expect(dispatchLinks).toContain('Operations')
      expect(dispatchLinks).toContain('Calendar')

      // Verify Group 2: Assets & Relationships sections
      const assetsLinks = Array.from(group1?.querySelectorAll('a') ?? []).map((a) => a.textContent?.trim())
      expect(assetsLinks).toContain('Inventory')
      expect(assetsLinks).toContain('Clients')
      expect(assetsLinks).toContain('Crew Assist')

      // Verify Group 3: Business & Back Office sections
      const businessLinks = Array.from(group2?.querySelectorAll('a') ?? []).map((a) => a.textContent?.trim())
      expect(businessLinks).toContain('Finance')
      expect(businessLinks).toContain('Documents')
      expect(businessLinks).toContain('Analytics')
    })

    it('isolates money surfaces for Warehouse role (Law 6) while cleanly preserving non-money groups and items', async () => {
      currentRole = 'Warehouse'
      viewport = 'desktop'
      collapsedPref = false
      await mount(<Sidebar active="/dashboard" />)

      const groupEls = container.querySelectorAll<HTMLElement>('[data-nav-group]')
      expect(groupEls).toHaveLength(3)

      const group2 = groupEls[2]
      expect(group2).toBeDefined()

      // In Group 3 (Business & Back Office), Finance and Analytics must be omitted
      const businessLinks = Array.from(group2?.querySelectorAll('a') ?? []).map((a) => a.textContent?.trim())
      expect(businessLinks).not.toContain('Finance')
      expect(businessLinks).not.toContain('Analytics')
      expect(businessLinks).toContain('Documents')
    })

    it('handles external Client role cleanly by omitting staff-only and money-sensitive items', async () => {
      currentRole = 'Client'
      viewport = 'desktop'
      collapsedPref = false
      await mount(<Sidebar active="/dashboard" />)

      const allLinks = Array.from(container.querySelectorAll('nav[aria-label="Main"] a')).map((a) => a.textContent?.trim())
      // Crew Assist is staff-only
      expect(allLinks).not.toContain('Crew Assist')
      // Finance and Analytics are money surfaces
      expect(allLinks).not.toContain('Finance')
      expect(allLinks).not.toContain('Analytics')
      // Client can see dispatch, inventory, clients, documents
      expect(allLinks).toContain('Dashboard')
      expect(allLinks).toContain('Inventory')
      expect(allLinks).toContain('Documents')
    })

    it('enforces Law 15 (>= 44px hit targets) on all navigation rows across expanded and collapsed states', async () => {
      // Expanded state
      viewport = 'desktop'
      collapsedPref = false
      await mount(<Sidebar active="/dashboard" />)
      const expandedLinks = container.querySelectorAll<HTMLElement>('nav[aria-label="Main"] a')
      for (const link of expandedLinks) {
        expect(link.style.minHeight).toBe('44px')
      }

      // Collapsed state
      collapsedPref = true
      await mount(<Sidebar active="/dashboard" />)
      const collapsedLinks = container.querySelectorAll<HTMLElement>('nav[aria-label="Main"] a')
      for (const link of collapsedLinks) {
        expect(link.style.minHeight).toBe('44px')
        expect(link.style.minWidth).toBe('44px')
      }
    })

    it('enforces Law 17: the word "customer" never appears anywhere in the rendered sidebar', async () => {
      viewport = 'desktop'
      collapsedPref = false
      await mount(<Sidebar active="/dashboard" />)
      expect(container.innerHTML.toLowerCase()).not.toContain('customer')
    })

    it('handles unauthenticated or null user without crashing', async () => {
      currentRole = undefined
      viewport = 'desktop'
      collapsedPref = false
      await mount(<Sidebar active="/dashboard" />)
      expect(container.querySelector('aside')).not.toBeNull()
      const navGroups = container.querySelectorAll('[data-nav-group]')
      expect(navGroups).toHaveLength(0)
    })
  })
})

describe('Empirical Challenger — PageActions Clamping & Overflow Routing', () => {
  it('renders no primary button when primary is undefined or null', async () => {
    await mount(
      <PageActions
        secondary={[<Button key="1">Secondary</Button>]}
      />
    )
    expect(container.textContent).toContain('Secondary')
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('renders exactly 1 primary CTA when a single primary is passed', async () => {
    await mount(
      <PageActions
        primary={<Button variant="primary">New Booking</Button>}
        secondary={[<Button key="1">Print</Button>]}
      />
    )
    expect(container.textContent).toContain('New Booking')
    expect(container.textContent).toContain('Print')
  })

  it('strictly clamps to exactly 1 primary CTA when multiple primary actions are passed', async () => {
    await mount(
      <PageActions
        primary={[
          <Button key="p1" variant="primary">Primary 1</Button>,
          <Button key="p2" variant="primary">Primary 2</Button>,
          <Button key="p3" variant="primary">Primary 3</Button>,
        ]}
        secondary={[<Button key="s1">Secondary</Button>]}
      />
    )
    // Only the first primary action is retained
    expect(container.textContent).toContain('Primary 1')
    expect(container.textContent).not.toContain('Primary 2')
    expect(container.textContent).not.toContain('Primary 3')
    expect(container.textContent).toContain('Secondary')
  })

  it('drops unbuilt placeholder (<Unavailable>) primary actions and falls back or renders none', async () => {
    await mount(
      <PageActions
        primary={<Unavailable reason="Not ready"><Button variant="primary">Export All</Button></Unavailable>}
        secondary={[<Button key="s1">Secondary</Button>]}
      />
    )
    expect(container.textContent).not.toContain('Export All')
    expect(container.textContent).toContain('Secondary')
  })

  it('selects the first VALID primary action when preceded by an unbuilt placeholder', async () => {
    await mount(
      <PageActions
        primary={[
          <Unavailable key="u1" reason="Not built"><Button variant="primary">Unbuilt Primary</Button></Unavailable>,
          <Button key="p2" variant="primary">Valid Primary</Button>,
        ]}
      />
    )
    expect(container.textContent).not.toContain('Unbuilt Primary')
    expect(container.textContent).toContain('Valid Primary')
  })

  it('renders 0-2 secondary actions directly inline without an overflow menu trigger', async () => {
    // 0 secondary
    await mount(
      <PageActions primary={<Button variant="primary">Action</Button>} />
    )
    expect(container.querySelector('button[aria-label="More actions"]')).toBeNull()

    // 1 secondary
    await mount(
      <PageActions
        primary={<Button variant="primary">Action</Button>}
        secondary={<Button>Sec 1</Button>}
      />
    )
    expect(container.textContent).toContain('Sec 1')
    expect(container.querySelector('button[aria-label="More actions"]')).toBeNull()

    // 2 secondary
    await mount(
      <PageActions
        primary={<Button variant="primary">Action</Button>}
        secondary={[<Button key="1">Sec 1</Button>, <Button key="2">Sec 2</Button>]}
      />
    )
    expect(container.textContent).toContain('Sec 1')
    expect(container.textContent).toContain('Sec 2')
    expect(container.querySelector('button[aria-label="More actions"]')).toBeNull()
  })

  it('clamps 3 secondary actions to exactly 2 visible and routes 1 into overflow menu (•••)', async () => {
    await mount(
      <PageActions
        primary={<Button variant="primary">Primary</Button>}
        secondary={[
          <Button key="1">Sec 1</Button>,
          <Button key="2">Sec 2</Button>,
          <Button key="3">Sec 3</Button>,
        ]}
      />
    )
    // Inline buttons visible
    expect(container.textContent).toContain('Primary')
    expect(container.textContent).toContain('Sec 1')
    expect(container.textContent).toContain('Sec 2')

    // Overflow button exists and has Law 15 touch target
    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    expect(overflowTrigger).not.toBeNull()
    expect(overflowTrigger?.style.minHeight).toBe('44px')
    expect(overflowTrigger?.style.minWidth).toBe('44px')

    // Sec 3 is not visible before opening overflow
    expect(container.querySelector('[role="menu"]')).toBeNull()

    // Click trigger to open menu
    await act(async () => overflowTrigger?.click())
    const menu = container.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('Sec 3')
  })

  it('clamps 10 secondary actions to exactly 2 visible and routes remaining 8 into overflow', async () => {
    const items = Array.from({ length: 10 }, (_, i) => (
      <Button key={`sec-${i + 1}`}>Action {i + 1}</Button>
    ))
    await mount(
      <PageActions
        primary={<Button variant="primary">Submit</Button>}
        secondary={items}
      />
    )
    // First 2 visible directly in container text
    expect(container.textContent).toContain('Action 1')
    expect(container.textContent).toContain('Action 2')

    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    expect(overflowTrigger).not.toBeNull()

    await act(async () => overflowTrigger?.click())
    const menu = container.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()

    for (let i = 3; i <= 10; i++) {
      expect(menu?.textContent).toContain(`Action ${i}`)
    }
  })

  it('filters out <Unavailable> placeholders before clamping secondary actions', async () => {
    await mount(
      <PageActions
        secondary={[
          <Unavailable key="u1" reason="WIP"><Button>WIP Action</Button></Unavailable>,
          <Button key="s1">Sec 1</Button>,
          <Unavailable key="u2" reason="WIP 2"><Button>WIP Action 2</Button></Unavailable>,
          <Button key="s2">Sec 2</Button>,
          <Button key="s3">Sec 3</Button>,
        ]}
      />
    )
    expect(container.textContent).not.toContain('WIP Action')
    expect(container.textContent).not.toContain('WIP Action 2')

    // Valid secondary items: Sec 1, Sec 2, Sec 3
    // First 2 visible: Sec 1, Sec 2
    expect(container.textContent).toContain('Sec 1')
    expect(container.textContent).toContain('Sec 2')

    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    expect(overflowTrigger).not.toBeNull()

    await act(async () => overflowTrigger?.click())
    const menu = container.querySelector('[role="menu"]')
    expect(menu?.textContent).toContain('Sec 3')
  })

  it('triggers action onClick callback and closes overflow menu when an item is selected', async () => {
    const clickHandler = vi.fn()
    await mount(
      <PageActions
        secondary={[
          <Button key="1">Sec 1</Button>,
          <Button key="2">Sec 2</Button>,
          <Button key="3" onClick={clickHandler}>Sec 3 Action</Button>,
        ]}
      />
    )
    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    await act(async () => overflowTrigger?.click())

    const menu = container.querySelector('[role="menu"]')
    const sec3Btn = Array.from(menu?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Sec 3 Action'))
    expect(sec3Btn).toBeDefined()

    await act(async () => sec3Btn?.click())
    expect(clickHandler).toHaveBeenCalledTimes(1)
    // Menu closes after selection
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  it('closes overflow menu on Escape key press', async () => {
    await mount(
      <PageActions
        secondary={[
          <Button key="1">Sec 1</Button>,
          <Button key="2">Sec 2</Button>,
          <Button key="3">Sec 3</Button>,
        ]}
      />
    )
    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    await act(async () => overflowTrigger?.click())
    expect(container.querySelector('[role="menu"]')).not.toBeNull()

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  it('merges caller-provided overflow items with excess secondary actions in a unified menu', async () => {
    const overflowItemClick = vi.fn()
    await mount(
      <PageActions
        secondary={[
          <Button key="1">Sec 1</Button>,
          <Button key="2">Sec 2</Button>,
          <Button key="3">Sec 3</Button>,
        ]}
        overflow={[
          { label: 'Export Audit Log', icon: 'download', onClick: overflowItemClick },
        ]}
      />
    )
    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    await act(async () => overflowTrigger?.click())
    const menu = container.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()

    // Contains excess secondary action
    expect(menu?.textContent).toContain('Sec 3')
    // Contains caller overflow item
    expect(menu?.textContent).toContain('Export Audit Log')

    // Click caller overflow item
    const exportBtn = Array.from(menu?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Export Audit Log'))
    expect(exportBtn).toBeDefined()
    await act(async () => exportBtn?.click())
    expect(overflowItemClick).toHaveBeenCalledTimes(1)
  })

  it('verifies PageHeader strips unbuilt placeholder actions while rendering valid actions', async () => {
    await mount(
      <PageHeader
        title="Fleet Overview"
        actions={
          <>
            <Unavailable reason="Under construction"><Button>Export PDF</Button></Unavailable>
            <Button>Sync Now</Button>
          </>
        }
      />
    )
    expect(container.textContent).not.toContain('Export PDF')
    expect(container.textContent).toContain('Sync Now')
  })

  it('closes overflow menu on pointerdown outside the component', async () => {
    await mount(
      <PageActions
        secondary={[
          <Button key="1">Sec 1</Button>,
          <Button key="2">Sec 2</Button>,
          <Button key="3">Sec 3</Button>,
        ]}
      />
    )
    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    await act(async () => overflowTrigger?.click())
    expect(container.querySelector('[role="menu"]')).not.toBeNull()

    // Dispatch pointerdown on document body (outside menu)
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  it('navigates overflow menu items using keyboard (ArrowDown, ArrowUp, Home, End)', async () => {
    await mount(
      <PageActions
        secondary={[
          <Button key="1">Sec 1</Button>,
          <Button key="2">Sec 2</Button>,
          <Button key="3">Sec 3</Button>,
          <Button key="4">Sec 4</Button>,
          <Button key="5">Sec 5</Button>,
        ]}
      />
    )
    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    await act(async () => overflowTrigger?.click())
    const menu = container.querySelector<HTMLDivElement>('[role="menu"]')
    expect(menu).not.toBeNull()

    const items = menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    expect(items).toHaveLength(3) // Sec 3, Sec 4, Sec 5

    // ArrowDown navigates forward
    items[0]?.focus()
    expect(document.activeElement).toBe(items[0])

    await act(async () => {
      menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(document.activeElement).toBe(items[1])

    // End navigates to last item
    await act(async () => {
      menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    expect(document.activeElement).toBe(items[2])

    // Home navigates to first item
    await act(async () => {
      menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(document.activeElement).toBe(items[0])

    // ArrowUp wraps to last item
    await act(async () => {
      menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(document.activeElement).toBe(items[2])
  })

  it('renders custom overflow node alongside excess secondary actions', async () => {
    await mount(
      <PageActions
        secondary={[
          <Button key="1">Sec 1</Button>,
          <Button key="2">Sec 2</Button>,
          <Button key="3">Sec 3</Button>,
        ]}
        overflow={<div id="custom-overflow-pane">Advanced Settings</div>}
      />
    )
    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    await act(async () => overflowTrigger?.click())
    const menu = container.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('Sec 3')
    expect(menu?.querySelector('#custom-overflow-pane')?.textContent).toBe('Advanced Settings')
  })

  it('handles null, undefined, and boolean items interspersed in secondary actions', async () => {
    await mount(
      <PageActions
        secondary={[
          null,
          <Button key="1">Valid 1</Button>,
          false,
          <Button key="2">Valid 2</Button>,
          undefined,
          <Button key="3">Valid 3</Button>,
        ]}
      />
    )
    expect(container.textContent).toContain('Valid 1')
    expect(container.textContent).toContain('Valid 2')

    const overflowTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
    expect(overflowTrigger).not.toBeNull()

    await act(async () => overflowTrigger?.click())
    expect(container.querySelector('[role="menu"]')?.textContent).toContain('Valid 3')
  })

  it('extractValidActions handles nested arrays, fragments, booleans, and nulls recursively', () => {
    const input = [
      null,
      false,
      undefined,
      <Button key="1">Direct</Button>,
      [<Button key="2">Nested Array</Button>],
      <Unavailable key="u" reason="drop"><Button>Drop Me</Button></Unavailable>,
      <>
        <Button key="3">In Fragment 1</Button>
        <Button key="4">In Fragment 2</Button>
      </>,
    ]
    const valid = extractValidActions(input)
    expect(valid).toHaveLength(4)
  })
})

describe('Empirical Challenger — Header Sync Badge Visibility States', () => {
  it('state 1: hides sync badge when synced and pendingCount is 0', async () => {
    viewport = 'desktop'
    syncMockState = {
      status: 'synced',
      syncStatus: 'synced',
      pendingCount: 0,
      error: null,
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const slot = container.querySelector<HTMLElement>('.header-sync-context')
    expect(slot?.style.visibility).toBe('hidden')
    expect(slot?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.header-sync-control')?.getAttribute('tabindex')).toBe('-1')
  })

  it('state 2: surfaces sync badge when synced but mutations are queued (pendingCount > 0)', async () => {
    viewport = 'desktop'
    syncMockState = {
      status: 'synced',
      syncStatus: 'synced',
      pendingCount: 1,
      error: null,
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badge1 = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badge1).not.toBeNull()
    expect(badge1?.textContent).toContain('1 Queued')
    expect(badge1?.style.minHeight).toBe('44px')
    expect(parseInt(badge1?.style.minWidth ?? '0', 10)).toBeGreaterThanOrEqual(44)

    // Also test larger count
    syncMockState.pendingCount = 42
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badge42 = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badge42?.textContent).toContain('42 Queued')
  })

  it('state 3: surfaces sync badge when syncing with 0 pending mutations', async () => {
    viewport = 'desktop'
    syncMockState = {
      status: 'syncing',
      syncStatus: 'syncing',
      pendingCount: 0,
      error: null,
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('Syncing…')
  })

  it('state 4: surfaces sync badge when syncing with pending mutations queued', async () => {
    viewport = 'desktop'
    syncMockState = {
      status: 'syncing',
      syncStatus: 'syncing',
      pendingCount: 5,
      error: null,
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('Syncing…')
  })

  it('state 5: surfaces sync badge when offline and pendingCount is 0', async () => {
    viewport = 'desktop'
    syncMockState = {
      status: 'offline',
      syncStatus: 'offline',
      pendingCount: 0,
      error: null,
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('Offline')
  })

  it('state 6: surfaces sync badge when offline with pending mutations queued', async () => {
    viewport = 'desktop'
    syncMockState = {
      status: 'offline',
      syncStatus: 'offline',
      pendingCount: 8,
      error: null,
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('8 Queued')
  })

  it('state 7: surfaces sync badge when error occurs', async () => {
    viewport = 'desktop'
    syncMockState = {
      status: 'error',
      syncStatus: 'error',
      pendingCount: 0,
      error: 'Network timeout to Supabase',
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('Sync Error')
    expect(badge?.getAttribute('title')).toContain('Network timeout to Supabase')
  })

  it('invokes triggerSync when sync badge is clicked', async () => {
    viewport = 'desktop'
    const triggerSyncMock = vi.fn()
    syncMockState = {
      status: 'offline',
      syncStatus: 'offline',
      pendingCount: 3,
      error: null,
      triggerSync: triggerSyncMock,
    }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badge).not.toBeNull()

    await act(async () => badge?.click())
    expect(triggerSyncMock).toHaveBeenCalledTimes(1)
  })

  it('maintains Law 15 minimum touch targets (>= 44x44px) on sync badge and user avatar', async () => {
    viewport = 'desktop'
    syncMockState = {
      status: 'syncing',
      syncStatus: 'syncing',
      pendingCount: 0,
      error: null,
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Rentals' }]} />)
    const syncBadge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(syncBadge?.style.minHeight).toBe('44px')
    expect(parseInt(syncBadge?.style.minWidth ?? '0', 10)).toBeGreaterThanOrEqual(44)

    const userProfile = container.querySelector<HTMLButtonElement>('button[aria-label*="user profile"]')
    expect(userProfile?.style.minHeight).toBe('44px')
    expect(userProfile?.style.minWidth).toBe('44px')
  })

  it('verifies complete removal of legacy clutter (.header-clock, .header-date-badge, .header-lang-toggle)', async () => {
    viewport = 'desktop'
    await mount(<Header crumbs={[{ label: 'Today' }]} />)
    expect(container.querySelector('.header-clock')).toBeNull()
    expect(container.querySelector('.header-date-badge')).toBeNull()
    expect(container.querySelector('.header-lang-toggle')).toBeNull()
  })

  it('state 8: surfaces sync badge when status is pending', async () => {
    viewport = 'desktop'
    syncMockState = {
      status: 'pending',
      syncStatus: 'pending',
      pendingCount: 0,
      error: null,
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badge = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badge).not.toBeNull()

    // With pendingCount > 0
    syncMockState.pendingCount = 3
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const badgeWithCount = container.querySelector<HTMLButtonElement>('.header-sync-control')
    expect(badgeWithCount?.textContent).toContain('3 Queued')
  })

  it('closes profile dialog when clicking outside the dialog', async () => {
    viewport = 'desktop'
    await mount(<Header crumbs={[{ label: 'Dashboard' }]} />)
    const profileBtn = container.querySelector<HTMLButtonElement>('button[aria-label*="user profile"]')
    expect(profileBtn).not.toBeNull()

    // Open profile
    await act(async () => profileBtn?.click())
    expect(container.querySelector('[role="dialog"][aria-label="User profile"]')).not.toBeNull()

    // Click outside backdrop
    const backdrop = profileBtn?.nextElementSibling as HTMLElement | null
    expect(backdrop).not.toBeNull()
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true')
    await act(async () => (backdrop as HTMLElement)?.click())
    expect(container.querySelector('[role="dialog"][aria-label="User profile"]')).toBeNull()
  })

  it('on phone viewport (<768px), hides center search and sync badge while preserving mobile search & profile', async () => {
    viewport = 'phone'
    syncMockState = {
      status: 'offline',
      syncStatus: 'offline',
      pendingCount: 5,
      error: null,
      triggerSync: vi.fn(),
    }
    await mount(<Header crumbs={[{ label: 'Rentals' }, { label: 'B-715' }]} />)
    // On phone, center search & sync badge are not rendered
    expect(container.querySelector('.header-sync-control')).toBeNull()
    // Mobile search button is rendered with 44px hit target
    const mobileSearch = container.querySelector<HTMLButtonElement>('button[aria-label="Search"]')
    expect(mobileSearch).not.toBeNull()
    expect(mobileSearch?.style.minHeight).toBe('44px')
    expect(mobileSearch?.style.minWidth).toBe('44px')
  })
})
