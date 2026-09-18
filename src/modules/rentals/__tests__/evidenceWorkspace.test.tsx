// @vitest-environment jsdom
/**
 * **Evidence Workspace — HO-09 and HO-10, driven.**
 *
 * Both items are invisible to a module test, because both are about what the
 * rendered page CLAIMS:
 *
 *  · **HO-09** — the booking head was a set of literals (`v: 'Booked'`,
 *    `new Date('2026-07-16')`, `16 Jul 2026`, `data/booking`'s seeded client),
 *    so one booking's schedule and stage appeared above every booking number.
 *    It is `fetchFloorBooking` now, and these assertions mock that seam with a
 *    booking that agrees with NONE of the old literals — a different stage, a
 *    different client, different dates — so a re-introduced literal fails
 *    rather than coincidentally matching.
 *  · **HO-10** — seven bulk buttons rendered enabled from an array with no
 *    handler; `Remove` wrote local state under copy promising retention and an
 *    Archived filter; `Clear all filters` left the category filter set.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { formatAd } from '../../../lib/bs'
import type { FloorBooking } from '../../../lib/queries/bookings'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop' as const,
}))

/* `useAuth` throws outside an `AuthProvider`, and none of these assertions is
   about sign-in — stubbed at the boundary the other workspace suites stub. */
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-REAL', name: 'Tester', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

/**
 * Deliberately NOT the seed's booking. `data/booking`'s `BOOKING` is B-715,
 * `Booked`, Himalayan Films Pvt. Ltd., 16–19 Jul 2026 — every one of which
 * this screen used to print regardless of the route. This answer disagrees
 * with all four, so any surviving literal shows up as a failure.
 */
const PICKUP_ISO = '2026-08-03T00:15:00.000Z'
const RETURN_ISO = '2026-08-06T00:15:00.000Z'

const FLOOR: FloorBooking = {
  id: '22222222-2222-4222-8222-222222222222',
  bookingNo: 'B-812',
  stage: 'Packed',
  clientName: 'Sagarmatha Media',
  project: 'Everest Series',
  pickupAtAd: PICKUP_ISO,
  returnAtAd: RETURN_ISO,
  actualReturnAtAd: null,
  deliveryType: 'Delivery',
  isCancelled: false,
  isClosed: false,
  linesPresence: 'present',
  lines: [],
}

let answer: FloorBooking | null = FLOOR

vi.mock('../../../lib/queries/bookings', async (orig) => ({
  ...(await orig<typeof import('../../../lib/queries/bookings')>()),
  fetchFloorBooking: async () => answer,
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/* jsdom ships no `matchMedia`; `useCapability()` — which `Unavailable` calls to
   choose between hover and long-press — asks for four of them. */
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

const { default: EvidenceWorkspace } = await import('../EvidenceWorkspace')

/*
 * The default 5s is not enough for the FIRST mount in this file on a cold
 * module graph — `lib/queries/bookings` pulls the supabase client, the
 * settings store and the operational-day engine behind it, and transforming
 * that tree took ~50s on the machine this was written on. The assertions
 * themselves are synchronous once the read has landed.
 */
vi.setConfig({ testTimeout: 120_000 })

let container: HTMLDivElement
let root: Root

async function mountAt(bookingNo: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/rentals/${bookingNo}/evidence`]}>
        <Routes>
          <Route path="/rentals/:bookingNo/evidence" element={<EvidenceWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )
  })
  /*
   * The read resolves in an effect. Flush until `PageBody`'s loading state has
   * cleared rather than for a fixed number of microtasks: a fixed count let
   * the first test in the file assert against the skeleton while every later
   * one passed, which is a harness artefact reading as a screen defect — and
   * a green suite that only sometimes rendered the thing under test is worse
   * than a red one.
   */
  for (let i = 0; i < 200 && text().includes('Loading'); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  expect(text()).not.toContain('Loading')
}

const text = () => container.textContent ?? ''
const buttons = () => [...container.querySelectorAll('button')]
const byText = (label: string) => buttons().filter((b) => (b.textContent ?? '').trim() === label)
const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click()
  })
}

beforeEach(() => {
  answer = FLOOR
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('HO-09 — the booking head is read, never printed', () => {
  it('shows the query stage, not the literal "Booked"', async () => {
    await mountAt('B-812')
    expect(text()).toContain('Packed')
    // The literal this screen carried on every booking.
    expect(text()).not.toContain('Booked')
  })

  it('shows the query client and booking number, not data/booking seed', async () => {
    await mountAt('B-812')
    expect(text()).toContain('Sagarmatha Media')
    expect(text()).toContain('B-812')
    expect(text()).not.toContain('Himalayan Films')
    expect(text()).not.toContain('B-715')
  })

  it('shows the query dates, and the hardcoded 16 Jul / 19 Jul 2026 pair is gone', async () => {
    await mountAt('B-812')
    expect(text()).toContain(formatAd(new Date(PICKUP_ISO)))
    expect(text()).toContain(formatAd(new Date(RETURN_ISO)))
    expect(text()).not.toContain('16 Jul 2026')
    expect(text()).not.toContain('19 Jul 2026')
  })

  it('counts the rental days through lib/rentalDays, not a fourth copy of the rule', async () => {
    await mountAt('B-812')
    // 3 Aug 06:00 → 6 Aug 06:00 Kathmandu is exactly three elapsed days.
    expect(text()).toContain('3 Days')
  })

  it('renders an absence rather than a seed value when the read has none', async () => {
    answer = { ...FLOOR, clientName: null, pickupAtAd: null, returnAtAd: null, deliveryType: null }
    await mountAt('B-812')
    expect(text()).toContain('—')
    expect(text()).not.toContain('Himalayan Films')
    expect(text()).not.toContain('16 Jul 2026')
    // No day count can be derived from two missing instants, and none is shown.
    expect(text()).not.toContain('3 Days')
  })

  it('says the photographs are not this booking’s', async () => {
    await mountAt('B-812')
    expect(text()).toContain('The photographs below are not')
    expect(text()).toContain('No evidence has been uploaded for this booking or any other')
    // The claim is attached to THIS booking number, not to a generic screen.
    expect(text()).toContain('B-812')
  })

  it('an unresolved booking reaches none of the sample gallery', async () => {
    answer = null
    await mountAt('B-9001')
    expect(text()).toContain('No booking matches B-9001')
    expect(text()).not.toContain('IMG_0001.JPG')
    expect(text()).not.toContain('Sony FX3')
  })
})

describe('HO-10 — the controls state what they do', () => {
  /** Tick the first gallery card so §9's bulk bar appears. */
  async function selectOnePhoto() {
    const box = container.querySelector('input[type="checkbox"]')
    expect(box).not.toBeNull()
    await click(box as HTMLInputElement)
  }

  it('every bulk action renders disabled and carries a reason', async () => {
    await mountAt('B-812')
    await selectOnePhoto()
    expect(text()).toContain('1 selected')

    for (const label of ['Assign Product', 'Assign Category', 'Download', 'Export ZIP', 'Generate PDF', 'Rotate', 'Remove']) {
      const found = byText(label)
      expect(found.length, `${label} should render`).toBeGreaterThan(0)
      for (const b of found) expect(b.disabled, `${label} must be disabled`).toBe(true)
    }

    // `Unavailable` puts the reason on the wrapper as its accessible name, so
    // a disabled control can never ship without one.
    const reasons = [...container.querySelectorAll('[aria-disabled]')].map((el) => el.getAttribute('aria-label') ?? '')
    expect(reasons.some((r) => r.includes('no zip library'))).toBe(true)
    expect(reasons.some((r) => r.includes('no PDF library'))).toBe(true)
  })

  it('the removal control is named for what it does, and nothing is labelled an enabled Remove', async () => {
    await mountAt('B-812')
    expect(byText('Hide on This Screen').length).toBe(1)
    expect(byText('Hide on This Screen')[0]?.disabled).toBe(false)
    // The only "Remove" left is the disabled bulk action, which appears with a selection.
    expect(buttons().filter((b) => (b.textContent ?? '').trim() === 'Remove' && !b.disabled).length).toBe(0)
  })

  it('the retention promise survives, marked as not built', async () => {
    await mountAt('B-812')
    await click(byText('Hide on This Screen')[0] as HTMLButtonElement)
    expect(text()).toContain('This hides the card in your browser. Nothing is recorded.')
    // Law 3's behaviour is stated, and stated as unbuilt — not deleted, not faked.
    expect(text()).toContain('Archived filter')
    expect(text()).toContain('None of that is built yet')

    await click(byText('Hide it')[0] as HTMLButtonElement)
    expect(text()).toContain('Hidden on this screen (1)')
    expect(text()).toContain('Nothing here was recorded')
    expect(text()).not.toContain('Retained and audited.')
  })

  /*
   * ⛔ The case above asserts the RAIL and never asserted the gallery, which is
   * exactly how the empty-note defect shipped green: "Hide it" with the note
   * left blank stored `''`, the predicate was `!hidden[p.id]`, and `!'' === true`
   * — so the rail announced the file hidden while the card stayed in the grid
   * and in every count. The note had just been made optional, which is what
   * reopened a hole the old mandatory-reason code could not reach.
   *
   * The blank note is the case that matters, so it is the one pinned.
   */
  it('actually removes the card from the gallery — including when the note is left blank', async () => {
    await mountAt('B-812')
    const before = container.querySelectorAll('input[type="checkbox"]').length
    expect(before).toBeGreaterThan(0)

    await click(byText('Hide on This Screen')[0] as HTMLButtonElement)
    // Deliberately type nothing: the note is optional, and blank is the regression.
    await click(byText('Hide it')[0] as HTMLButtonElement)

    expect(text()).toContain('Hidden on this screen (1)')
    const after = container.querySelectorAll('input[type="checkbox"]').length
    expect(after).toBe(before - 1)
  })

  it('the empty state clears the filter it names and says which one stays', async () => {
    await mountAt('B-812')
    // Damage holds none of the ten samples, so the gallery empties.
    const damage = buttons().find((b) => (b.textContent ?? '').startsWith('Damage'))
    await click(damage as HTMLButtonElement)
    await click(byText('Unmatched')[0] as HTMLButtonElement)

    expect(text()).toContain('No Unmatched sample files under Damage')
    expect(text()).toContain('stays on Damage')
    const action = byText('Show all match states')
    expect(action.length).toBe(1)

    await click(action[0] as HTMLButtonElement)
    // It cleared exactly what it said: the match filter, and not the category.
    expect(text()).toContain('No sample files are filed under Damage')
    expect(byText('Show all match states').length).toBe(0)
  })
})
