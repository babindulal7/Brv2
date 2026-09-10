// @vitest-environment jsdom
/**
 * # Booking Detail — live identity, and the honest gaps
 *
 * This file used to pin the inline-edit mode. That mode edited a module
 * constant for the session and persisted nothing; with the 21 Aug live
 * conversion it was REMOVED rather than pointed at queried rows — a saved
 * value that silently reverts on reload is a fabricated write, the exact
 * class `SUCCESS_FABRICATION_REGISTER` exists for. What this suite pins now:
 *
 *  1. **Identity is the URL's.** A known number renders THAT booking's queried
 *     data; an unknown number gets the empty state and nobody else's figures —
 *     the defect the conversion removed was every URL rendering seeded B-715.
 *  2. **Money is the invoice's.** Total / Paid / Outstanding are the invoice
 *     columns, rendered — never a figure the screen computed (Law 1).
 *  3. **Method is honest.** A payment with no `bank_account_id` renders '—',
 *     never an inferred 'Cash' ('Cash' is a channel group of its own).
 *  4. **No fake affordances.** Edit is Unavailable-with-reason; crew,
 *     transport detail, documents, alerts and timeline state their missing
 *     reads instead of inventing rows (Law 16); payments remain immutable in
 *     words (Law 4).
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

/* The query seam — same shapes the real modules return, money in paisa. */
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
            ],
          }
        : null,
    isSubRentalBooking: (lines: readonly { lineType?: string; subRental?: boolean }[] = []) =>
      lines.some((l) => l.lineType === 'Sub-Rented' || l.lineType === 'Sub-rental' || Boolean(l.subRental)),
    isSubRentedLine: (line: { lineType?: string; subRental?: boolean }) =>
      line.lineType === 'Sub-Rented' || line.lineType === 'Sub-rental' || Boolean(line.subRental),
    paymentGlance: () => [],
    paymentDetailGroups: () => [],
  }
})

/* The page's third query seam (31 Aug, the Notes wave) — mocked like the two
   above so no mount reaches the real supabase client (vitest loads .env.local,
   whose VITE_DATA_SOURCE=live would otherwise send booking_notes reads over
   the wire mid-suite). */
vi.mock('../../../lib/queries/bookingNotes', () => ({
  notesForBooking: (bookingId: string) => ({
    chips: { booking_id: [bookingId] },
    sort: { column: 'created_at', ascending: false },
  }),
  listBookingNotes: async () => ({ rows: [] }),
}))

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

async function mount(no = 'B-715') {
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/rentals/${no}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/rentals/:bookingNo" element={<BookingDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
})

const text = () => container.textContent ?? ''
const buttons = (label: string) => [...container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label)

describe('identity — the page renders the booking the URL names, or nothing', () => {
  it('renders the queried booking under its own number', async () => {
    await mount('B-715')
    expect(text()).toContain('B-715')
    expect(text()).toContain('Himalayan Films Pvt. Ltd.')
    expect(text()).toContain('Sony FX3')
    // The seeded-record banner is gone with the seed itself.
    expect(text()).not.toContain('Showing the seeded record')
  })

  it('gives an unknown number the empty state — never another booking’s data', async () => {
    await mount('B-999')
    expect(text()).toContain('No booking numbered B-999')
    expect(text()).not.toContain('Himalayan Films')
    expect(text()).not.toContain('Sony FX3')
    expect(text()).not.toMatch(/Rs\s?[\d,]/)
  })

  it('links an assigned unit’s serial to its asset page', async () => {
    await mount('B-715')
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'SN102')
    expect(link?.getAttribute('href')).toBe('/inventory/SN102')
  })
})

describe('Law 1 — the money on screen is the invoice’s, not the screen’s', () => {
  it('renders Total / Paid / Outstanding from the invoice columns', async () => {
    await mount('B-715')
    expect(text()).toContain('1,39,506') // total_amount
    expect(text()).toContain('15,000') // paid_amount
    expect(text()).toContain('1,24,506') // outstanding_amount
    expect(text()).toContain('INV-901')
  })

  it('states the deposit through bookings_deposit_v, as a separate ledger (Law 5)', async () => {
    await mount('B-715')
    expect(text()).toContain('Deposit Required')
    expect(text()).toContain('50,000')
    // Received/pending have no sanctioned read yet — stated, not zeroed.
    expect(text()).toContain('security_deposits')
  })

  it('renders "—" for a payment with no bank account — never an inferred Cash', async () => {
    await mount('B-715')
    const methodCells = [...container.querySelectorAll('td')].filter((c) => c.textContent?.trim() === '—')
    expect(methodCells.length).toBeGreaterThan(0)
    // The row itself is the live payments read, not the seed's history.
    expect(text()).toContain('Advance Payment')
    expect(text()).toContain('10 Jul 2026')
  })

  it('keeps Law 4 in words where a correction would be attempted', async () => {
    await mount('B-715')
    expect(text()).toContain('Payments and deposit movements are immutable')
    expect(text()).toContain('reversal row or a credit note')
  })
})

describe('Law 16 — no fake affordances over missing reads', () => {
  it('offers Edit only as Unavailable-with-reason — inline edit went with the seed', async () => {
    await mount('B-715')
    const edit = buttons('Edit')[0]
    expect(edit).toBeDefined()
    expect(edit?.disabled).toBe(true)
    // No inline-edit field is mounted anywhere.
    expect(container.querySelector('[id^="edit-"]')).toBeNull()
  })

  it('states the crew and transport-detail gaps instead of inventing a roster', async () => {
    await mount('B-715')
    expect(text()).toContain('booking_crew_lines')
    expect(text()).toContain('booking_transport')
    // The seed's invented crew never render.
    expect(text()).not.toContain('Bikash Thapa')
  })

  it('states the documents gap instead of five tiles that belong to no booking', async () => {
    await mount('B-715')
    expect(text()).toContain('document_registry')
    expect(text()).not.toContain('Rental Agreement')
  })

  it('does not offer Confirm Booking outside stage Quote', async () => {
    await mount('B-715') // stage Booked
    expect(buttons('Confirm Booking')).toHaveLength(0)
  })
})
