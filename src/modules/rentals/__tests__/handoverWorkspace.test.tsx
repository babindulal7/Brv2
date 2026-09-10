// @vitest-environment jsdom
/**
 * # Handover Workspace — the things this screen is not allowed to claim
 *
 * Every case below is a defect the screen shipped, and none of them looked
 * wrong on the floor:
 *
 *  - **HO-12a** — a control labelled `Bulk Scan` that scanned nothing, read no
 *    serial, and re-stamped rows that were already marked, so a mark made by a
 *    real scan lost its own timestamp to a hand press. Fixed the way PK-07
 *    fixed the identical control on Packing: named for what it does, and
 *    narrowed so it can only move rows that are still Ready.
 *  - **HO-12b** — `Cancel Handover` was a bare `navigate`. One tap discarded
 *    every mark, every missing-item reason and both signatures with no
 *    question. Nothing here is written before the dispatch, so this is a
 *    discard confirmation, not a Law 3 terminal action — the same split
 *    `NewRental` already makes between its two Cancel behaviours.
 *  - **HO-12c** — the override reason box sat under a permanently disabled
 *    `Apply Override` inside a block that said no override is recorded, while
 *    the value it held rode the dispatch as R-06's named money-override reason
 *    onto `booking_stage_transitions.reason`. It rendered ONLY while a gate was
 *    failing, and the dispatch requires every gate to pass — so it was always
 *    off screen at the moment it was sent.
 *  - **HO-14a** — a dispatch is a promise that outlives the render that started
 *    it. Leaving mid-dispatch for another booking let the first booking's
 *    failure render on the second booking's screen (BD-19's class), and let a
 *    success navigate the operator to a booking they had left.
 *  - **HO-14b** — the rental-day rule was a fourth private copy that answered
 *    `1` for dates it could not parse, printing a one-day hire for a booking
 *    whose dates the screen did not have. `lib/rentalDays` answers `null`.
 *
 * The environment pragma is per `vitest.config.ts` (the suite defaults to
 * `node`). Mocked at the query seam (Law 2 — the screen has no other way in)
 * plus `lib/auth` for the operator identity and the action module the dispatch
 * imports.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import HandoverWorkspace from '../HandoverWorkspace'

const B901 = '11111111-1111-4111-8111-111111111111'
const B902 = '22222222-2222-4222-8222-222222222222'

/* ── the knobs each test turns ───────────────────────────────────────────── */
let pickupAtAd: string | null = '2026-07-16T00:15:00.000Z'
let returnAtAd: string | null = '2026-07-19T00:15:00.000Z'
/** Resolves/rejects the pending `handoverRental`, so a dispatch can be held open. */
let settleDispatch: { resolve: (v: unknown) => void; reject: (e: unknown) => void } | null = null

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: ref === 'B-901' ? B901 : B902,
    bookingNo: ref,
    stage: 'Packed',
    clientName: 'Himalayan Films Pvt. Ltd.',
    project: 'Film Shoot',
    pickupAtAd,
    returnAtAd,
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-1',
        qty: 2,
        lineType: 'Equipment',
        description: 'Sony FX3',
        productId: 'p-1',
        productName: 'Sony FX3',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-1',
            assetId: 'a-1',
            serial: 'SN102',
            assetTag: 'EQ000001-U01',
            unitState: 'Ready',
            isRequired: true,
            packed: true,
            damaged: false,
            location: 'A2-01',
          },
          {
            id: 'u-2',
            assetId: 'a-2',
            serial: 'SN103',
            assetTag: 'EQ000001-U02',
            unitState: 'Ready',
            isRequired: true,
            packed: true,
            damaged: false,
            location: 'A2-02',
          },
        ],
      },
    ],
  }),
}))

vi.mock('../../../actions/rentals/index', () => ({
  handoverRental: () =>
    new Promise((resolve, reject) => {
      settleDispatch = { resolve, reject }
    }),
}))

/* `useViewport` and `Unavailable` subscribe to media queries on mount, and this
   jsdom ships no `matchMedia` — the same stub the auth and AddClient suites use.
   `useViewport` reads `innerWidth`, not the query, so the band is still real. */
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

/* ── harness ─────────────────────────────────────────────────────────────── */

let container: HTMLDivElement
let root: Root
/** The router's own `navigate`, so a test can walk away without a page control. */
let navigate: ((to: string) => void) | null = null

function Nav() {
  navigate = useNavigate()
  return null
}

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mount(path = '/rentals/B-901/handover', width = 1440) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Nav />
          <Routes>
            <Route path="/rentals/:bookingNo/handover" element={<HandoverWorkspace />} />
            <Route path="/rentals/:bookingNo" element={<div>THE BOOKING PAGE</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
  await flush()
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  document.body.innerHTML = ''
  pickupAtAd = '2026-07-16T00:15:00.000Z'
  returnAtAd = '2026-07-19T00:15:00.000Z'
  settleDispatch = null
  navigate = null
})

/** The dialog portals to `document.body`, so assertions read the document. */
const text = () => document.body.textContent ?? ''
const buttons = () => [...document.body.querySelectorAll('button')]
const button = (label: string) => buttons().find((b) => (b.textContent ?? '').trim() === label)
const enabled = (label: string) => buttons().filter((b) => (b.textContent ?? '').trim() === label && !b.disabled)

async function click(el: Element | null | undefined) {
  expect(el, 'the control this test drives must exist').toBeTruthy()
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/**
 * A checkbox is driven by the same CLICK, not by assigning `checked` and firing
 * `change`: React maps a checkbox's `onChange` onto the click event, so the
 * assignment route silently does nothing and every gate stays shut. Named apart
 * from `click` only so the call sites read as what the operator does.
 */
const tick = click

const checkbox = (ariaLabel: string) =>
  document.body.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${ariaLabel}"]`) ??
  [...document.body.querySelectorAll('label')]
    .find((l) => (l.textContent ?? '').includes(ariaLabel))
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]')

/** Every §11.1 gate cleared, so `Complete Handover` becomes pressable. */
async function passAllGates() {
  await tick(checkbox('Government ID Verified'))
  await tick(checkbox('Booking Authorization Verified'))
  await tick(checkbox('Mark Sony FX3 · unit 1 picked up'))
  await tick(checkbox('Mark Sony FX3 · unit 2 picked up'))
  for (const b of enabled('Mark Cleared →')) await click(b)
  for (const b of enabled('Mark Cleared →')) await click(b)
  for (const b of enabled('Capture')) await click(b)
  for (const b of enabled('Capture')) await click(b)
  await click(button('Take Photo'))
}

/* ── HO-12a ──────────────────────────────────────────────────────────────── */

describe('HO-12 — the bulk control says what it does, and moves only Ready rows', () => {
  it('is named for the act, and Bulk Scan is gone', async () => {
    await mount()
    expect(text()).not.toContain('Bulk Scan')
    expect(button('Mark Ready Picked Up')).toBeTruthy()
  })

  it('leaves a mark that already exists alone, and says how many it moved', async () => {
    await mount()
    await tick(checkbox('Mark Sony FX3 · unit 1 picked up'))
    expect(text()).toContain('marked Picked Up by hand')

    await click(button('Mark Ready Picked Up'))
    // One row was already marked, so exactly one row remained to move. The old
    // control would have re-stamped both.
    expect(text()).toContain('1 item marked Picked Up by hand — no scan')
    expect(text()).not.toContain('2 items marked Picked Up by hand')
  })

  it('says so rather than doing nothing quietly when nothing is Ready', async () => {
    await mount()
    await click(button('Mark Ready Picked Up'))
    await click(button('Mark Ready Picked Up'))
    expect(text()).toContain('No item is Ready — no rows changed')
  })
})

/* ── HO-12b ──────────────────────────────────────────────────────────────── */

describe('HO-12 — Cancel Handover asks before it discards', () => {
  it('leaves straight away when there is nothing to discard', async () => {
    await mount()
    await click(button('Cancel Handover'))
    expect(text()).toContain('THE BOOKING PAGE')
  })

  it('asks, names what is at stake, and stays put until confirmed', async () => {
    await mount()
    await tick(checkbox('Mark Sony FX3 · unit 1 picked up'))
    await click(button('Cancel Handover'))

    expect(text()).toContain('Discard this handover session?')
    expect(text()).toContain('1 item mark')
    // Still on the workspace — the question has not been answered yet.
    expect(text()).not.toContain('THE BOOKING PAGE')

    await click(button('Stay on this session'))
    // `Modal` keeps itself mounted for one transition after `isOpen` flips, so
    // the close is asserted after that beat rather than in the same tick.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250))
    })
    expect(text()).not.toContain('Discard this handover session?')
    expect(text()).not.toContain('THE BOOKING PAGE')

    await click(button('Cancel Handover'))
    await click(button('Discard and leave'))
    expect(text()).toContain('THE BOOKING PAGE')
  })

  it('names a captured signature among what would be lost', async () => {
    await mount()
    await click(enabled('Capture')[0])
    await click(button('Cancel Handover'))
    expect(text()).toContain('1 signature')
  })
})

/* ── HO-12c ──────────────────────────────────────────────────────────────── */

describe('HO-12 — the override reason names the write it reaches', () => {
  it('has its own block, visible whether or not a gate is failing', async () => {
    await mount()
    const field = () =>
      document.body.querySelector('textarea[aria-label="Reason for handing over with money outstanding"]')

    expect(field()).toBeTruthy()
    expect(text()).toContain('booking_stage_transitions.reason')

    // The §11.4 block disappears once its three gates pass; the R-06 field must not,
    // because that is precisely when the dispatch that sends it becomes possible.
    await passAllGates()
    expect(text()).not.toContain('Manager Override')
    expect(field()).toBeTruthy()
  })

  it('no longer offers a reason box under the refused §11.4 override', async () => {
    await mount()
    expect(text()).toContain('Manager Override')
    expect(document.body.querySelector('textarea[aria-label="Manager override reason"]')).toBeNull()
    expect(text()).not.toContain('Reason for override (min 10 characters)')
  })
})

/* ── HO-14a ──────────────────────────────────────────────────────────────── */

describe('HO-14 — one booking’s dispatch never speaks for another', () => {
  it('does not write a failed dispatch onto the next booking’s screen', async () => {
    await mount()
    await passAllGates()
    await click(button('Complete Handover'))
    expect(settleDispatch, 'the dispatch must be in flight').toBeTruthy()

    // The operator walks to the next booking's handover while B-901 is still in
    // flight. Same component instance, same `navigate`, different booking.
    await act(async () => {
      navigate?.('/rentals/B-902/handover')
    })
    await flush()
    expect(text()).toContain('B-902')

    await act(async () => {
      settleDispatch?.reject(new Error('Gate Check Failure: B-901 did not move'))
      await Promise.resolve()
    })
    await flush()

    expect(text()).not.toContain('This handover was not recorded')
    expect(text()).not.toContain('Gate Check Failure: B-901 did not move')
    // B-902's own session is untouched, and says so.
    expect(text()).toContain('Nothing has been scanned or marked in this session yet')
  })

  /* The control for the case above: rejecting the promise DOES surface, so the
     absence asserted there is the guard working and not a test that proves
     nothing. */
  it('does show the failure when the operator is still on the booking that failed', async () => {
    await mount()
    await passAllGates()
    await click(button('Complete Handover'))

    await act(async () => {
      settleDispatch?.reject(new Error('Gate Check Failure: B-901 did not move'))
      await Promise.resolve()
    })
    await flush()

    expect(text()).toContain('This handover was not recorded')
    expect(text()).toContain('Gate Check Failure: B-901 did not move')
  })
})

/* ── HO-14b ──────────────────────────────────────────────────────────────── */

describe('HO-14 — the rental-day rule is the engine’s, and it can answer “I cannot tell”', () => {
  const daysCell = () => {
    const label = [...document.body.querySelectorAll('div')].find((d) => d.textContent === 'Days')
    return label?.nextElementSibling?.textContent ?? ''
  }

  it('counts the span through lib/rentalDays', async () => {
    await mount()
    expect(daysCell()).toBe('3')
  })

  it('prints a dash, never a one-day hire, for dates it cannot read', async () => {
    returnAtAd = 'sometime next week'
    await mount()
    expect(daysCell()).toBe('—')
  })
})
