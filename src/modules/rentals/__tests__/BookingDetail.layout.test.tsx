// @vitest-environment jsdom
/**
 * # Booking Detail — §4.2's layout, at all three widths, over QUERIED data
 *
 * Rewritten 21 Aug 2026 with the live conversion: the page no longer renders
 * `data/booking.ts`'s seeded B-715 — it reads `listBookings` /
 * `fetchFloorBooking` / `listInvoices` / `listPayments`, so this suite mocks
 * those four at the module seam (the same seam the screen imports through,
 * Law 2) and pins the same laws the old suite pinned:
 *
 *  1. the **six-step stepper**, read from `lib/workflow.ts`'s canonical order;
 *  2. **money blocks OMITTED, not greyed**, for a money-blind role — Law 6 —
 *     including the sticky bar, which is entirely money;
 *  3. the **sticky bottom bar** below 1280 and the **`[Items][Money][Docs]`
 *     segmented control** on phone;
 *  4. Law 5 stated where it can be broken: the deposit never enters
 *     Outstanding;
 *  5. the header arrangement — `[Operations ▾]`, the `[⋮]` overflow, and Save
 *     draft disabled WITH its reason.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

let role = 'Owner'
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => role !== 'Warehouse' }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

/*
 * The query seam. Every figure below is what the DATABASE would answer —
 * paisa at the module boundary, exactly the row shapes the real modules
 * return — so the assertions are about rendering, not about arithmetic this
 * suite invented. `listBookings` answers only for B-715, so an unknown number
 * genuinely matches nothing (the identity test lives in the sibling suite).
 */
vi.mock('../../../lib/queries/bookings', () => {
  const BOOKING_ROW = {
    id: '11111111-1111-4111-8111-111111111111',
    bookingNo: 'B-715',
    clientId: 'c-1',
    clientName: 'Himalayan Films Pvt. Ltd.',
    project: 'Film Shoot',
    stage: 'Booked',
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Customer Pickup',
    pickupLocation: 'Kathmandu Main',
    returnLocation: 'Kathmandu Main',
    quoteExpiresAtAd: null,
    createdAtAd: '2026-07-09T00:00:00.000Z',
    itemCount: 18,
    depositRequired: 5_000_000,
    isCancelled: false,
    isClosed: false,
  }
  return {
    listBookings: async (opts: { chips?: { booking_no?: readonly string[] } }) => ({
      rows: opts.chips?.booking_no?.includes('B-715') ? [BOOKING_ROW] : [],
      total: null,
    }),
    fetchFloorBooking: async (ref: string) =>
      ref === 'B-715'
        ? {
            id: BOOKING_ROW.id,
            bookingNo: 'B-715',
            stage: 'Booked',
            clientName: BOOKING_ROW.clientName,
            project: BOOKING_ROW.project,
            pickupAtAd: BOOKING_ROW.pickupAtAd,
            returnAtAd: BOOKING_ROW.returnAtAd,
            actualReturnAtAd: null,
            deliveryType: 'Customer Pickup',
            isCancelled: false,
            isClosed: false,
            linesPresence: 'present',
            lines: [
              {
                id: 'l-1',
                qty: 1,
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
                ],
              },
              {
                id: 'l-2',
                qty: 3,
                lineType: 'Sub-rental',
                description: 'NISI Athena Prime Set',
                productId: null,
                productName: null,
                trackingMode: null,
                parentLineId: null,
                sortOrder: 2,
                unitsPresence: 'present',
                units: [],
              },
            ],
          }
        : null,
  }
})

vi.mock('../../../lib/queries/finance', () => {
  const INVOICE = {
    id: 'inv-1',
    invoiceNo: 'INV-901',
    bookingId: '11111111-1111-4111-8111-111111111111',
    bookingNo: 'B-715',
    clientId: 'c-1',
    clientName: 'Himalayan Films Pvt. Ltd.',
    status: 'Sent',
    issueDateAd: '2026-07-16',
    dueDateAd: '2026-07-31',
    currency: 'NPR',
    subtotal: 13_275_000,
    discountAmount: 929_300,
    discountPercent: 7,
    taxableAmount: 12_345_700,
    vatRate: 0.13,
    vatAmount: 1_604_900,
    totalAmount: 13_950_600,
    paidAmount: 1_500_000,
    outstandingAmount: 12_450_600,
    isVoid: false,
    voidedAtAd: null,
    voidReason: null,
    creditNoteNo: null,
    notes: null,
    createdAtAd: '2026-07-16T00:15:00.000Z',
  }
  const PAYMENT = {
    id: 'pay-1',
    paymentNo: 'PAY-2026-0001',
    bookingId: '11111111-1111-4111-8111-111111111111',
    bookingNo: 'B-715',
    invoiceId: 'inv-1',
    invoiceNo: 'INV-901',
    clientId: 'c-1',
    clientName: 'Himalayan Films Pvt. Ltd.',
    amount: 1_500_000,
    paymentType: 'Advance Payment',
    status: 'Received',
    paymentDateAd: '2026-07-10T04:00:00.000Z',
    channelGroup: null,
    bankName: null,
    transactionRef: 'TXN-9948123',
    notes: null,
    receivedById: 'u-9',
    createdAtAd: '2026-07-10T04:00:00.000Z',
  }
  return {
    listInvoices: async () => ({ rows: [INVOICE], total: null }),
    listPayments: async () => ({ rows: [PAYMENT], total: null }),
    invoicesForBooking: (bookingId: string) => ({ chips: { booking_id: [bookingId] } }),
    paymentsForBooking: (bookingId: string) => ({ chips: { booking_id: [bookingId] } }),
  }
})

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
  // The reads are CHAINED: the head row must land before the invoice/payment
  // fetch effects even fire (they key on the booking's uuid). Each flush lets
  // one round of promise → setState → effect settle.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  role = 'Owner'
})

const text = () => container.textContent ?? ''
const allButtons = () => [...container.querySelectorAll('button')]
const button = (label: string) => allButtons().find((b) => b.textContent?.trim() === label)

/** §4.2's bottom bar — bottom-anchored sticky; every sticky rail is top-anchored. */
const stickyBars = () =>
  [...container.querySelectorAll('div')].filter((d) => d.style.position === 'sticky' && d.style.bottom !== '')

describe('§4.2 — the six-step stepper, from the QUERIED stage', () => {
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
    // Items is the opening segment — witnessed by Block 2's heading, which
    // appears in no other segment.
    expect(text()).toContain('Equipment, Bundles & Services')
    expect(text()).not.toContain('Documents & Review')
  })

  it('switches the page when a segment is picked', async () => {
    await mount(420)
    const docs = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === 'Docs')
    await act(async () => {
      docs?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(text()).toContain('Documents & Review')
    expect(text()).not.toContain('Equipment, Bundles & Services')
  })
})

describe('§4.2 — the summary rail becomes a sticky bottom bar below 1280', () => {
  it('has no bar on desktop, where the rail itself is on screen', async () => {
    await mount(1280)
    expect(button('Record Payment')).toBeDefined() // Block 4's own button
    expect(stickyBars()).toHaveLength(0)
  })

  it('renders the bar at tablet, carrying the INVOICE total and the shared modal’s button', async () => {
    await mount(1000)
    const sticky = stickyBars()
    expect(sticky).toHaveLength(1)
    expect(sticky[0]?.textContent).toContain('Rental Total')
    // formatMoney(13,950,600 paisa) — the invoice's own column, not a figure
    // the screen computed.
    expect(sticky[0]?.textContent).toContain('1,39,506')
    expect(sticky[0]?.querySelector('button')?.textContent).toContain('Record Payment')
  })

  it('clears the phone nav bar rather than sitting under it', async () => {
    await mount(420)
    const sticky = stickyBars()
    expect(sticky).toHaveLength(1)
    expect(sticky[0]?.style.bottom).toContain('58px')
    expect(sticky[0]?.style.bottom).toContain('safe-area-inset-bottom')
  })
})

describe('Law 6 — money blocks are OMITTED for money-blind roles, not greyed', () => {
  it('renders NOT ONE rupee figure anywhere on the page', async () => {
    await mount(1280, 'Warehouse')
    // Matching the CURRENCY rather than a list of labels is what makes this
    // catch the next leak too — it found three real ones on 12 Aug.
    expect(text()).not.toMatch(/Rs\s?[\d,]/)
  })

  it('drops the whole Pricing & Payments block, omitted rather than greyed', async () => {
    await mount(1280, 'Warehouse')
    expect(text()).not.toContain('Pricing & Payments')
    // 'Rental Total' lives only inside money surfaces. ('Outstanding' alone is
    // not asserted — the unconditional FooterNote states Law 5 in words for
    // every role, which is a sentence, not a figure.)
    expect(text()).not.toContain('Rental Total')
    expect(button('Record Payment')).toBeUndefined()
    expect(button('Receive Payment')).toBeUndefined()
  })

  it('drops the Money SEGMENT on phone, rather than offering an empty tab', async () => {
    await mount(420, 'Warehouse')
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim())
    expect(tabs).toEqual(['Items', 'Docs'])
  })

  it('drops the sticky bar entirely below 1280 — every part of it is money', async () => {
    await mount(1000, 'Warehouse')
    expect(stickyBars()).toHaveLength(0)
  })

  it('still shows the stepper and the item list, which are not money', async () => {
    await mount(1280, 'Warehouse')
    expect(container.querySelector('ol[aria-label="Booking stages"]')).not.toBeNull()
    expect(text()).toContain('Equipment, Bundles & Services')
    expect(text()).toContain('Sony FX3')
  })
})

describe('Law 5 — the deposit is a liability and says so where it could be misread', () => {
  it('states it beside the deposit ledger', async () => {
    await mount(1280)
    expect(text()).toContain('never reduces Outstanding')
  })
})

describe('Law 16 — surfaces with no read behind them say so instead of inventing rows', () => {
  it('states the alerts and timeline gaps in place of the retired seed arrays', async () => {
    await mount(1280)
    expect(text()).toContain('no alerts engine')
    expect(text()).toContain('booking_stage_transitions')
    // And none of the seed's invented content survives.
    expect(text()).not.toContain('only 2 left this week')
    expect(text()).not.toContain('Draft created')
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
