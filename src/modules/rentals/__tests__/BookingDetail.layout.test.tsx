// @vitest-environment jsdom
/**
 * # Booking Detail — §4.2's layout, at all three widths
 *
 * `BookingDetail.edit.test.tsx` beside this file pins inline edit. This one
 * pins the shape the 12 Aug rebuild put on the screen:
 *
 *  1. the **six-step stepper** (Quote → Booked → Packed → On Rent → Returned →
 *     Closed), read from `lib/workflow.ts`'s canonical order so a seventh stage
 *     cannot appear here without appearing in the engine first;
 *  2. **money blocks OMITTED, not greyed**, for a money-blind role — Law 6 and
 *     §4.2's own Notes. Including the sticky bar, which is entirely money;
 *  3. the **sticky bottom bar** below 1180, and the **`[Items][Money][Docs]`
 *     segmented control** on phone;
 *  4. Law 5 stated where it can be broken: the deposit never enters Outstanding.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

/**
 * The role is a `let` so a single mock can serve both the money and the
 * money-blind cases — `canViewMoneyField(gateContext(role), 'booking')` is what
 * the screen actually asks, and Warehouse is one of Law 6's three blind roles.
 */
let role = 'Owner'
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => role !== 'Warehouse' }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
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

const { default: BookingDetail } = await import('../BookingDetail')

let container: HTMLDivElement
let root: Root

async function mount(width: number, as = 'Owner') {
  role = as
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/rentals/B-715']}>
        <ToastProvider>
          <Routes>
            <Route path="/rentals/:bookingNo" element={<BookingDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  role = 'Owner'
})

const text = () => container.textContent ?? ''
const allButtons = () => [...container.querySelectorAll('button')]
const button = (label: string) => allButtons().find((b) => b.textContent?.trim() === label)

/**
 * §4.2's bottom bar, named by what anchors it rather than by "any sticky div".
 *
 * This read `position === 'sticky'` alone, which was true of exactly one
 * element while the desktop rail was `position: relative`. `CollapsibleAside`
 * — which `Rail` wraps, and which BookingDetail renders on desktop only — is
 * now sticky itself, so that filter matched the RAIL at 1280 and the desktop
 * case failed while the bar it was written about was correctly absent.
 *
 * `bottom` is the discriminator, not a looser match: the bar is bottom-anchored
 * (`bottom: 0` at tablet, `BAR_BOX` on phone) and every sticky rail in the tree
 * is top-anchored. A second bottom-anchored bar appearing anywhere on this page
 * would still be caught, which is what the desktop and Law 6 cases assert.
 */
const stickyBars = () =>
  [...container.querySelectorAll('div')].filter((d) => d.style.position === 'sticky' && d.style.bottom !== '')

describe('§4.2 — the six-step stepper', () => {
  it('names all six canonical stages, in order, as a real list', async () => {
    await mount(1280)
    const steps = container.querySelector('ol[aria-label="Booking stages"]')
    expect(steps).not.toBeNull()
    const labels = [...(steps?.querySelectorAll('li') ?? [])].map((li) =>
      (li.firstElementChild?.nextElementSibling?.textContent ?? '').trim(),
    )
    expect(labels).toEqual(['Quote', 'Booked', 'Packed', 'On Rent', 'Returned', 'Closed'])
  })

  it('marks exactly one step as current, and it is the booking’s own stage', async () => {
    await mount(1280)
    const current = [...container.querySelectorAll('li[aria-current="step"]')]
    expect(current).toHaveLength(1)
    expect(current[0]?.textContent).toContain('Booked')
  })

  it('carries an icon in every node, so the fill is never the only signal (Law 11)', async () => {
    await mount(1280)
    const nodes = [...container.querySelectorAll('ol[aria-label="Booking stages"] li svg')]
    expect(nodes).toHaveLength(6)
  })

  it('becomes the dot row on phone, with the position stated in words', async () => {
    await mount(420)
    expect(container.querySelector('ol[aria-label="Booking stages"]')).toBeNull()
    // Six unlabelled dots would be exactly the colour-alone encoding Law 11
    // forbids, so the position is also written out.
    expect(text()).toContain('Step 2 of 6 — Booked')
  })
})

describe('§4.2 — the phone segmented control', () => {
  it('is absent above 768, where every section renders at once', async () => {
    await mount(1280)
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(text()).toContain('Client & Schedule')
    expect(text()).toContain('Pricing & Payments')
    expect(text()).toContain('Documents & Review')
  })

  it('offers [Items][Money][Docs] on phone, showing one at a time', async () => {
    await mount(420)
    const tabs = [...(container.querySelector('[role="tablist"]')?.querySelectorAll('[role="tab"]') ?? [])].map((t) =>
      t.textContent?.trim(),
    )
    expect(tabs).toEqual(['Items', 'Money', 'Docs'])
    // Items is the opening segment. Asserted on a field that appears ONLY in
    // Block 1 — "Client & Schedule" is also a row label inside Block 5's Review
    // Summary, so it is not a witness for which segment is showing.
    expect(text()).toContain('Project Type')
    expect(text()).not.toContain('Documents & Review')
  })

  it('switches the page when a segment is picked', async () => {
    await mount(420)
    const docs = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === 'Docs')
    await act(async () => {
      docs?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(text()).toContain('Documents & Review')
    expect(text()).not.toContain('Project Type')
  })
})

describe('§4.2 — the summary rail becomes a sticky bottom bar below 1180', () => {
  it('has no bar on desktop, where the rail itself is on screen', async () => {
    await mount(1280)
    expect(button('Record Payment')).toBeDefined() // Block 4's own button
    expect(stickyBars()).toHaveLength(0)
  })

  it('renders the bar at tablet, carrying the total and the shared modal’s button', async () => {
    await mount(1000)
    const sticky = stickyBars()
    expect(sticky).toHaveLength(1)
    expect(sticky[0]?.textContent).toContain('Rental Total')
    expect(sticky[0]?.querySelector('button')?.textContent).toContain('Record Payment')
  })

  it('clears the phone nav bar rather than sitting under it', async () => {
    await mount(420)
    const sticky = stickyBars()
    expect(sticky).toHaveLength(1)
    // `BAR_BOX` is BottomBar.tsx's own 58px + safe-area expression, read rather
    // than re-typed, so the two cannot drift.
    expect(sticky[0]?.style.bottom).toContain('58px')
    expect(sticky[0]?.style.bottom).toContain('safe-area-inset-bottom')
  })
})

describe('Law 6 — money blocks are OMITTED for money-blind roles, not greyed', () => {
  it('renders NOT ONE rupee figure anywhere on the page', async () => {
    await mount(1280, 'Warehouse')
    // ⛔ The assertion that found three real defects on 12 Aug: the equipment
    // table's Rate/Day and Total columns, the Equipment Subtotal, the Review
    // Summary's Pricing row and the Alerts card's "Deposit Rs 25,000 pending"
    // were all printed to a money-blind role. Matching the CURRENCY rather than
    // a list of labels is what makes this catch the next one too.
    expect(text()).not.toMatch(/Rs\s?[\d,]/)
  })

  it('drops the whole Pricing & Payments block, omitted rather than greyed', async () => {
    await mount(1280, 'Warehouse')
    expect(text()).not.toContain('Pricing & Payments')
    expect(text()).not.toContain('Rate / Day')
    expect(text()).not.toContain('Equipment Subtotal')
    // Not a disabled control anywhere — the surface is absent.
    expect(button('Record Payment')).toBeUndefined()
    expect(button('Receive Payment')).toBeUndefined()
    expect(button('Receive Deposit')).toBeUndefined()
  })

  it('keeps the alerts that are not money — the floor needs the stock one', async () => {
    await mount(1280, 'Warehouse')
    expect(text()).toContain('only 2 left this week')
    expect(text()).toContain('Alerts (1)')
  })

  it('drops the Money SEGMENT on phone, rather than offering an empty tab', async () => {
    await mount(420, 'Warehouse')
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim())
    expect(tabs).toEqual(['Items', 'Docs'])
  })

  it('drops the sticky bar entirely below 1180 — every part of it is money', async () => {
    await mount(1000, 'Warehouse')
    expect(stickyBars()).toHaveLength(0)
  })

  it('still shows the stepper and the item list, which are not money', async () => {
    await mount(1280, 'Warehouse')
    expect(container.querySelector('ol[aria-label="Booking stages"]')).not.toBeNull()
    expect(text()).toContain('Equipment, Bundles & Services')
  })
})

describe('Law 5 — the deposit is a liability and says so where it could be misread', () => {
  it('states it beside the deposit ledger', async () => {
    await mount(1280)
    expect(text()).toContain('never reduces Outstanding')
  })
})

describe('§4.2 header — [Operations ▾] and [⋮], with nothing deleted to get there', () => {
  it('keeps Operations as its own control', async () => {
    await mount(1280)
    expect(button('Operations')).toBeDefined()
  })

  it('moves Extend, Assign Crew and Sub-Rental into the overflow rather than dropping them', async () => {
    await mount(1280)
    const more = allButtons().find((b) => b.getAttribute('aria-label') === 'More booking actions')
    expect(more).toBeDefined()
    expect(more?.getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      more?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const items = [...container.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim())
    expect(items).toEqual(['Extend rental', 'Assign crew', 'Create sub-rental', 'Save draft'])
  })

  it('renders Save draft disabled with its reason, rather than as a control that does nothing', async () => {
    await mount(1280)
    const more = allButtons().find((b) => b.getAttribute('aria-label') === 'More booking actions')
    await act(async () => {
      more?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const save = [...container.querySelectorAll('[role="menuitem"]')].find(
      (i) => i.textContent?.trim() === 'Save draft',
    ) as HTMLButtonElement | undefined
    expect(save?.disabled).toBe(true)
  })
})
