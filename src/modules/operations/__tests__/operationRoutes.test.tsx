// @vitest-environment jsdom
/**
 * **Spec 03 — the four rulings that are behaviour, driven rather than read.**
 *
 * `operationsQueues.test.ts` covers the queue *predicates*. This file covers
 * the things the 12 Aug rulings changed about the rendered pages, each of which
 * is invisible to a pure-module test:
 *
 *  1. **Rulings §3 — operations are ROUTES, not a modal.** `OperationsShell` is
 *     a launcher: its rows navigate to `/rentals/:br/{packing,handover,…}` and
 *     it mounts no workspace of its own.
 *  2. **Spec 03 Notes, last bullet — "Routes are parameterised — these must
 *     work for any BR#, not one seeded booking."** Every workspace is rendered
 *     at a SECOND booking number and has to render that number, not the seed's.
 *  3. **Spec 03 Notes, bullet 1 — exactly one primary button per workspace, and
 *     it is the completion gate.** `ResetWorkspace` shipped two.
 *  4. **Spec 03 Notes, bullet 2 + Law 12 — blockers render inline in the rail;
 *     a blocked gate never shows a toast.**
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'

let viewport: Viewport = 'desktop'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
}))

/*
 * The three floor workspaces now call `useAuth()` — the four floor verbs are
 * implemented, and `actions/core.ts` refuses an action called without a real
 * `ActionContext`, so each screen has to hold the signed-in identity rather
 * than the `{ userId: 'USR-001', role: 'Manager' }` it used to stamp on every
 * dispatch. `useAuth` throws outside an `AuthProvider`, and none of these
 * assertions is about sign-in, so the hook is stubbed at the same boundary
 * `shell.test.tsx` and `ClientDetail.edit.test.tsx` already stub it at.
 */
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-REAL', name: 'Tester', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/*
 * jsdom ships no `matchMedia`, and `useCapability()` — which `Unavailable`
 * calls to decide between hover and long-press — asks for four of them. A
 * fixed fine-pointer, hover-capable answer is the right stub here: these
 * assertions are about routing and gating, not about the reason-affordance,
 * and `useViewport` is mocked above so nothing else reads the media layer.
 */
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

/*
 * The Floor's list and its four chip counts all go through `useList`. Mocking
 * the hook — rather than the Supabase client under it — keeps these assertions
 * about §3.1's *arrangement* ("queue chips filter one time-ordered list") and
 * off the network. `operationsQueues.test.ts` already pins the predicates the
 * real hook would receive.
 */
let floorRows: unknown[] = []
const useListCalls: unknown[] = []
vi.mock('../../../lib/queries/useList', () => ({
  useList: (_fetch: unknown, filters: unknown) => {
    useListCalls.push(filters)
    return { rows: floorRows, loading: false, error: null, isEmpty: floorRows.length === 0, isFiltered: false, total: floorRows.length, refetch: () => {} }
  },
}))

/** One list row. Only the fields the Floor renders matter; the rest are never read. */
function row(bookingNo: string, stage: string, dueAtAd: string) {
  return {
    id: `id-${bookingNo}`,
    bookingNo,
    clientId: 'C-1',
    clientName: 'Aarav Karki',
    project: 'Documentary',
    stage,
    pickupAtAd: dueAtAd,
    returnAtAd: dueAtAd,
    itemCount: 4,
  } as unknown
}

const { default: OperationsQueues } = await import('../OperationsQueues')
const { default: OperationsShell } = await import('../OperationsShell')
const { default: PackingWorkspace } = await import('../../rentals/PackingWorkspace')
const { default: HandoverWorkspace } = await import('../../rentals/HandoverWorkspace')
const { default: ReturnWorkspace } = await import('../../rentals/ReturnWorkspace')
const { default: ResetWorkspace } = await import('../../rentals/ResetWorkspace')
const { default: EvidenceWorkspace } = await import('../../rentals/EvidenceWorkspace')

let container: HTMLDivElement
let root: Root

/** The location the router is currently on, written out so assertions can read it. */
let path = ''
function PathProbe() {
  path = useLocation().pathname
  return null
}

async function mount(ui: ReactNode, initial = '/') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initial]}>
        <PathProbe />
        {ui}
      </MemoryRouter>,
    )
  })
}

/** Mount a workspace behind its real parameterised route, so `useParams` is live. */
async function mountAt(path: string, element: ReactNode, pattern: string) {
  await mount(
    <Routes>
      <Route path={pattern} element={element} />
    </Routes>,
    path,
  )
}

const buttons = () => [...container.querySelectorAll('button')]
const text = () => container.textContent ?? ''

/**
 * The workspace primary is `--cat-1` filled (`BLUE_PRIMARY` in each file), and
 * every other control is an outline or a neutral surface. Counting filled
 * `--cat-1` backgrounds is therefore counting primaries.
 */
const filledPrimaries = () =>
  buttons().filter((b) => (b.getAttribute('style') ?? '').includes('background: var(--cat-1)'))

beforeEach(() => {
  viewport = 'desktop'
  path = ''
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Spec 03 §3.1 — queue chips filter ONE time-ordered list', () => {
  beforeEach(() => {
    floorRows = [row('B-715', 'Booked', '2026-07-31T03:15:00.000Z'), row('B-9001', 'Packed', '2026-07-31T04:00:00.000Z')]
  })

  it('draws the four verb chips over the shared list', async () => {
    await mount(<OperationsQueues />, '/operations')
    const labels = buttons().map((b) => b.textContent ?? '')
    for (const chip of ['Packing', 'Handover', 'Return & Inspection', 'Reset']) {
      expect(labels.some((l) => l.startsWith(chip))).toBe(true)
    }
    // §3.1's row: time │ BR# │ client │ items │ stage badge │ [verb] ⋮
    const headers = [...container.querySelectorAll('th')].map((h) => h.textContent)
    expect(headers).toContain('Time')
    expect(headers).toContain('Booking')
    expect(headers).toContain('Client')
    expect(headers).toContain('Items')
    expect(headers).toContain('Stage')
  })

  it('never lets a chip replace the list — pressing one keeps exactly one table', async () => {
    await mount(<OperationsQueues />, '/operations')
    expect(container.querySelectorAll('table')).toHaveLength(1)
    const packing = buttons().find((b) => (b.textContent ?? '').startsWith('Packing'))
    await act(async () => {
      packing?.click()
    })
    expect(container.querySelectorAll('table')).toHaveLength(1)
    expect(text()).toContain('B-715')
  })

  it('leaves Cases its own route rather than a chip that swaps the list out', async () => {
    await mount(<OperationsQueues />, '/operations')
    const cases = [...container.querySelectorAll('a')].find((a) => (a.textContent ?? '').includes('Cases'))
    expect(cases?.getAttribute('href')).toBe('/operations/cases')
  })

  it('carries the day scope the §3.1 header draws', async () => {
    await mount(<OperationsQueues />, '/operations')
    const labels = buttons().map((b) => b.textContent ?? '')
    expect(labels.some((l) => l.startsWith('Today'))).toBe(true)
    expect(labels.some((l) => l.startsWith('Tomorrow'))).toBe(true)
    expect(labels.some((l) => l.startsWith('Custom'))).toBe(true)
  })

  it('opens the row action on the parameterised workspace route', async () => {
    await mount(<OperationsQueues />, '/operations')
    const pack = buttons().find((b) => b.textContent === 'Pack')
    await act(async () => {
      pack?.click()
    })
    expect(path).toBe('/rentals/B-715/packing')
  })

  it('keeps the rail on screen at tablet rather than collapsing it', async () => {
    viewport = 'tablet'
    await mount(<OperationsQueues />, '/operations')
    expect(text()).toContain('no monetary values are shown')
    expect(buttons().some((b) => (b.getAttribute('aria-label') ?? '').startsWith('Expand'))).toBe(false)
  })
})

describe('Rulings §3 — OperationsShell is a launcher, not a modal host', () => {
  it('renders four navigable steps and mounts no workspace', async () => {
    await mount(<OperationsShell bookingNo="B-715" bookingStatus="Booked" isOpen onClose={() => {}} />)
    const labels = buttons().map((b) => b.textContent ?? '')
    expect(labels.some((l) => l.includes('Packing'))).toBe(true)
    expect(labels.some((l) => l.includes('Handover'))).toBe(true)
    expect(labels.some((l) => l.includes('Return & Inspection'))).toBe(true)
    expect(labels.some((l) => l.includes('Reset'))).toBe(true)
    // The workspaces each render their own <table>; a launcher renders none.
    expect(container.querySelectorAll('table')).toHaveLength(0)
    expect(text()).not.toContain('Packing Checklist')
  })

  it('navigates to the parameterised route instead of swapping a tab panel', async () => {
    await mount(<OperationsShell bookingNo="B-9001" bookingStatus="Booked" isOpen onClose={() => {}} />)
    const pack = buttons().find((b) => (b.textContent ?? '').includes('Packing'))
    await act(async () => {
      pack?.click()
    })
    expect(path).toBe('/rentals/B-9001/packing')
  })

  it('keeps a step that is not open yet visible and unclickable, with its reason', async () => {
    // Pack runs at Booked, so at Quote every step is still ahead of the booking.
    await mount(<OperationsShell bookingNo="B-715" bookingStatus="Quote" isOpen onClose={() => {}} />)
    const pack = buttons().find((b) => (b.textContent ?? '').includes('Packing'))
    expect(pack).toBeTruthy()
    expect(pack?.disabled).toBe(true)
    // Law 12 — the reason is on the page, not in a toast.
    expect(text()).toContain('opens once this booking reaches Booked')
  })

  it('offers Evidence as a viewer, never as a fifth step', async () => {
    await mount(<OperationsShell bookingNo="B-715" bookingStatus="Booked" isOpen onClose={() => {}} />)
    const evidence = buttons().find((b) => (b.textContent ?? '').includes('Evidence'))
    expect(evidence?.textContent).toContain('viewer, not a step')
    await act(async () => {
      evidence?.click()
    })
    expect(path).toBe('/rentals/B-715/evidence')
  })
})

describe('Spec 03 Notes — routes are parameterised, not one seeded booking', () => {
  const SECOND = 'B-9001'

  it('Packing renders the booking number from the route', async () => {
    await mountAt(`/rentals/${SECOND}/packing`, <PackingWorkspace />, '/rentals/:bookingNo/packing')
    expect(text()).toContain(SECOND)
    expect(
      [...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === `/rentals/${SECOND}`),
    ).toBe(true)
  })

  it('Handover renders the booking number from the route', async () => {
    await mountAt(`/rentals/${SECOND}/handover`, <HandoverWorkspace />, '/rentals/:bookingNo/handover')
    expect(text()).toContain(SECOND)
  })

  it('Return renders the booking number from the route', async () => {
    await mountAt(`/rentals/${SECOND}/return`, <ReturnWorkspace />, '/rentals/:bookingNo/return')
    expect(text()).toContain(SECOND)
  })

  it('Reset renders the booking number from the route', async () => {
    await mountAt(`/rentals/${SECOND}/reset`, <ResetWorkspace />, '/rentals/:bookingNo/reset')
    expect(text()).toContain(SECOND)
  })

  it('Evidence renders the booking number from the route and links back to it', async () => {
    await mountAt(`/rentals/${SECOND}/evidence`, <EvidenceWorkspace />, '/rentals/:bookingNo/evidence')
    expect(text()).toContain(SECOND)
    expect(
      [...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === `/rentals/${SECOND}/packing`),
    ).toBe(true)
  })
})

describe('Spec 03 Notes bullet 1 — exactly one primary, and it is the completion gate', () => {
  const cases: Array<[string, ReactNode, string, string]> = [
    ['Packing', <PackingWorkspace key="p" />, '/rentals/:bookingNo/packing', 'Complete Packing'],
    ['Handover', <HandoverWorkspace key="h" />, '/rentals/:bookingNo/handover', 'Complete'],
    ['Return', <ReturnWorkspace key="r" />, '/rentals/:bookingNo/return', 'Complete'],
    ['Reset', <ResetWorkspace key="x" />, '/rentals/:bookingNo/reset', 'Complete Reset'],
  ]

  for (const [name, element, pattern, gateLabel] of cases) {
    it(`${name} has one filled primary and it says ${gateLabel}`, async () => {
      await mountAt(pattern.replace(':bookingNo', 'B-715'), element, pattern)
      const primaries = filledPrimaries()
      // At most one — the gate is disabled (and therefore not filled) whenever
      // something blocks it, which is a legal zero, never two.
      expect(primaries.length).toBeLessThanOrEqual(1)
      for (const p of primaries) expect(p.textContent).toContain(gateLabel)
    })
  }
})

describe('Spec 03 Notes bullet 2 — blockers are inline in the rail', () => {
  it('Packing states the unmet condition on the page while the gate is shut', async () => {
    await mountAt('/rentals/B-715/packing', <PackingWorkspace />, '/rentals/:bookingNo/packing')
    expect(text()).toContain('Blockers')
    // Nothing is packed on first render, so the gate names the required items.
    expect(text()).toContain('not yet packed')
    const gate = buttons().find((b) => (b.textContent ?? '').includes('Complete Packing'))
    expect(gate?.disabled).toBe(true)
  })
})

describe('Rulings §7 — rails reflow below 1180 rather than collapsing', () => {
  it('keeps the Packing progress column on screen at tablet width', async () => {
    viewport = 'tablet'
    await mountAt('/rentals/B-715/packing', <PackingWorkspace />, '/rentals/:bookingNo/packing')
    // `CollapsibleAside`'s collapsed form is a lone "Expand …" button and no
    // content. Both the progress card and the gate must still be rendered.
    expect(text()).toContain('Blockers')
    expect(buttons().some((b) => (b.textContent ?? '').includes('Complete Packing'))).toBe(true)
    expect(buttons().some((b) => (b.getAttribute('aria-label') ?? '').startsWith('Expand'))).toBe(false)
  })

  it('keeps it on screen at phone width too', async () => {
    viewport = 'phone'
    await mountAt('/rentals/B-715/packing', <PackingWorkspace />, '/rentals/:bookingNo/packing')
    expect(text()).toContain('Blockers')
    expect(buttons().some((b) => (b.textContent ?? '').includes('Complete Packing'))).toBe(true)
  })
})

describe('Rulings §7 / spec §3.2 — the stage badge stays canonical', () => {
  it('badges a canonical status and shows job progress as a separate chip', async () => {
    await mountAt('/rentals/B-715/packing', <PackingWorkspace />, '/rentals/:bookingNo/packing')
    // "Preparing" is spec 03 §3.2's badge and is NOT one of the canonical six.
    expect(text()).not.toContain('Preparing')
    expect(text()).toContain('Pack job: Not Started')
  })
})
