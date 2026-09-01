// @vitest-environment jsdom
/**
 * **30 Aug Booqable-shape rework — the behaviours only a rendered page shows.**
 *
 * `todayQuery.test.ts` pins the query builders and `todayRow.test.ts` the row
 * mapping; neither renders the page, so the rework's riskiest promises had no
 * test at all. Each one here was either driven in a browser first or found by
 * the adversarial review of the 31 Aug apply:
 *
 *  1. **Per-list filters are PER LIST.** Outgoing and Incoming each own a
 *     `MoreFilters`; narrowing one must not narrow — or badge — the other.
 *  2. **The quick panel exists at desktop and not at phone**, and Record
 *     Payment is OMITTED (not disabled, not blanked) for a money-blind
 *     session — Law 6's §2.1 treatment.
 *  3. **On the phone the filter row follows the active segment and REMOUNTS.**
 *     The 31 Aug review found the unkeyed ternary kept one MoreFilters
 *     instance alive across a segment switch, so a panel opened on Out stayed
 *     open silently rebound to In. The `key={list}` on the row is what this
 *     pins: switch segments and the arriving panel is closed and unbadged.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'

let viewport: Viewport = 'desktop'
vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
}))

let money = true
vi.mock('../../../lib/moneyVisibility', async (orig) => ({
  ...(await orig<typeof import('../../../lib/moneyVisibility')>()),
  useCanViewMoney: () => money,
}))

/* `MovementList` reads the signed-in identity; none of these assertions is
   about sign-in, so it is stubbed at the same boundary `shell.test.tsx` and
   `operationRoutes.test.tsx` stub it at. */
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-REAL', name: 'Tester', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

/*
 * Every figure on the page goes through `useList`. Mocked at the hook — the
 * same seam `operationRoutes.test.tsx` uses — because these assertions are
 * about the ARRANGEMENT (which list owns which filter row), not the
 * predicates, which `todayQuery.test.ts` already pins.
 */
vi.mock('../../../lib/queries/useList', () => ({
  useList: () => ({
    rows: [],
    loading: false,
    error: null,
    isEmpty: true,
    isFiltered: false,
    total: 0,
    refetch: () => {},
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/* jsdom ships no `matchMedia`; `useViewport` is mocked above, so a fixed
   hover-capable answer is only there for whatever else asks. */
window.matchMedia = ((query: string) =>
  ({
    matches: query.includes('hover: hover'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList) as typeof window.matchMedia

const { default: Today } = await import('../Today')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Today />
      </MemoryRouter>,
    )
  })
}

const buttons = () => [...container.querySelectorAll('button')]
const byAria = (label: string) => buttons().find((b) => b.getAttribute('aria-label') === label)
const text = () => container.textContent ?? ''

/* 'Booked' is a live stage chip (`FILTER_SUPPORT` resolves it to a stage);
   it appears in two panel groups, and both toggle the same option string,
   so the first match is enough. */
const clickBooked = async () => {
  const chip = buttons().find((b) => b.textContent === 'Booked' && !b.disabled)
  expect(chip).toBeDefined()
  await act(async () => {
    chip?.click()
  })
}

beforeEach(() => {
  viewport = 'desktop'
  money = true
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('per-list filters — each list owns its chips', () => {
  it('renders one MoreFilters per list, named for its list', async () => {
    await mount()
    expect(byAria('More filters for the outgoing list')).toBeDefined()
    expect(byAria('More filters for the incoming list')).toBeDefined()
  })

  it('narrowing Outgoing badges Outgoing and leaves Incoming untouched', async () => {
    await mount()
    const outTrigger = byAria('More filters for the outgoing list')
    await act(async () => {
      outTrigger?.click()
    })
    expect(outTrigger?.getAttribute('aria-expanded')).toBe('true')
    await clickBooked()

    /* Outgoing now carries the count — trigger badge and its own clear. */
    expect(byAria('More filters for the outgoing list')?.textContent).toContain('1')
    expect(byAria('Clear outgoing list filters (1)')).toBeDefined()
    /* Incoming carries neither. */
    expect(byAria('More filters for the incoming list')?.textContent).not.toContain('1')
    expect(buttons().some((b) => (b.getAttribute('aria-label') ?? '').startsWith('Clear incoming'))).toBe(false)
  })
})

describe('quick panel — desktop only, money-gated the §2.1 way', () => {
  it('draws Quick Actions and Quick Info beside the lists at desktop', async () => {
    await mount()
    expect(text()).toContain('Quick Actions')
    expect(text()).toContain('Quick Info')
    expect(buttons().some((b) => b.textContent === 'Record Payment')).toBe(true)
  })

  it('OMITS Record Payment for a money-blind session — never disables it', async () => {
    money = false
    await mount()
    expect(text()).toContain('Quick Actions')
    expect(buttons().some((b) => (b.textContent ?? '').includes('Record Payment'))).toBe(false)
  })

  it('renders no quick panel at phone — the bottom bar carries those verbs', async () => {
    viewport = 'phone'
    await mount()
    expect(text()).not.toContain('Quick Actions')
  })
})

describe("phone — the filter row follows the segment and arrives CLOSED", () => {
  it('remounts MoreFilters on segment switch instead of rebinding an open panel', async () => {
    viewport = 'phone'
    await mount()

    /* Open Out's panel and pick a chip. */
    const outTrigger = byAria('More filters for the outgoing list')
    expect(outTrigger).toBeDefined()
    await act(async () => {
      outTrigger?.click()
    })
    expect(outTrigger?.getAttribute('aria-expanded')).toBe('true')
    await clickBooked()

    /* Switch to In. */
    const inSegment = buttons().find((b) => (b.textContent ?? '').replace(/\s+/g, '') === 'In0')
    expect(inSegment).toBeDefined()
    await act(async () => {
      inSegment?.click()
    })

    /* The row on screen is now Incoming's — and it arrived closed and
       unbadged. Out's chip did not leak across. */
    expect(byAria('More filters for the outgoing list')).toBeUndefined()
    const inTrigger = byAria('More filters for the incoming list')
    expect(inTrigger).toBeDefined()
    expect(inTrigger?.getAttribute('aria-expanded')).toBe('false')
    expect(inTrigger?.textContent).not.toContain('1')
    expect(buttons().some((b) => (b.getAttribute('aria-label') ?? '').startsWith('Clear incoming'))).toBe(false)

    /* And Outgoing still remembers ITS chip when the operator returns. */
    const outSegment = buttons().find((b) => (b.textContent ?? '').replace(/\s+/g, '') === 'Out0')
    await act(async () => {
      outSegment?.click()
    })
    expect(byAria('Clear outgoing list filters (1)')).toBeDefined()
  })
})
