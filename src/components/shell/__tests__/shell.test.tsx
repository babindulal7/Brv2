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

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
}))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { role: 'Owner' } }) }))
vi.mock('../../../lib/theme', () => ({ useTheme: () => ({ theme: 'dark', setMode: () => {} }) }))
vi.mock('../../../lib/collapse', () => ({ useCollapsed: () => [collapsedPref, () => {}] }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Sidebar } = await import('../Sidebar')
const { default: BottomBar } = await import('../BottomBar')
const { default: Header } = await import('../Header')

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
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Sidebar — Law 13, width decides', () => {
  it('is 219px at desktop, with all eleven labels readable', async () => {
    await mount(<Sidebar active="/dashboard" />)
    const aside = container.querySelector('aside')
    expect(aside?.style.width).toBe('219px')
    expect(container.querySelectorAll('nav[aria-label="Main"] a')).toHaveLength(11)
    expect(container.textContent).toContain('Crew Assist')
  })

  it('is a 72px icon rail at tablet, with no labels and no collapse toggle', async () => {
    viewport = 'tablet'
    await mount(<Sidebar active="/dashboard" />)
    expect(container.querySelector('aside')?.style.width).toBe('72px')
    expect(container.textContent).not.toContain('Crew Assist')
    expect(container.querySelector('[aria-label="Collapse navigation"]')).toBeNull()
    expect(container.querySelector('[aria-label="Expand navigation"]')).toBeNull()
  })

  it('still speaks each label in the rail — title on every row', async () => {
    viewport = 'tablet'
    await mount(<Sidebar active="/dashboard" />)
    const titles = [...container.querySelectorAll('nav[aria-label="Main"] a')].map((a) => a.getAttribute('title'))
    expect(titles).toContain('Crew Assist')
    expect(titles.every((t) => t !== null && t.length > 0)).toBe(true)
  })

  it('does not let a stored desktop collapse widen — or narrow — against the width band', async () => {
    /* The conflict Law 13 exists to settle: preference says "expanded", the
       768–1279 band says 72. Width wins. */
    collapsedPref = false
    viewport = 'tablet'
    await mount(<Sidebar active="/dashboard" />)
    expect(container.querySelector('aside')?.style.width).toBe('72px')
  })

  it('honours the manual collapse only at desktop', async () => {
    collapsedPref = true
    await mount(<Sidebar active="/dashboard" />)
    expect(container.querySelector('aside')?.style.width).toBe('72px')
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

  it('/rentals/new lights New Rental alone', async () => {
    await mount(<Sidebar active="/rentals/new" />)
    expect(current()).toEqual(['New Rental'])
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

  it('/operations?queue=packing lights Operation alone', async () => {
    await mount(<Sidebar active="/operations?queue=packing" />)
    expect(current()).toEqual(['Operation'])
  })
})

describe('BottomBar — five fixed slots', () => {
  beforeEach(() => {
    viewport = 'phone'
  })

  it('is Today · Rentals · Scan · Inventory · More, in that order', async () => {
    await mount(<BottomBar active="/dashboard" />)
    const nav = container.querySelector('nav[aria-label="Main"]')
    const slots = [...(nav?.children ?? [])].map((el) => el.textContent)
    expect(slots).toEqual(['Dashboard', 'Rentals', 'Scan', 'Inventory', 'More'])
  })

  it('triggers the one Scanner rather than carrying its own', async () => {
    await mount(<BottomBar active="/dashboard" />)
    const fired = vi.fn()
    window.addEventListener(SCANNER_TOGGLE_EVENT, fired)
    const scan = container.querySelector<HTMLButtonElement>('[aria-label="Scan"]')
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
    const profileBtn = container.querySelector<HTMLButtonElement>('button[aria-label="User profile"]')
    expect(profileBtn).not.toBeNull()
    expect(profileBtn?.style.minHeight).toBe('44px')
    expect(profileBtn?.style.minWidth).toBe('44px')
  })
})
