// @vitest-environment jsdom
/**
 * # Booking Detail — the things the screen is not allowed to claim
 *
 * A companion to `BookingDetail.layout.test.tsx`, which pins the arrangement.
 * This one pins the STATEMENTS, and every case here is a defect the page
 * shipped:
 *
 *  - **BD-02** — an invoice read still in flight rendered as "No invoice
 *    raised yet", a settled negative fact about a client's money (Law 12).
 *  - **BD-03** — a cancelled booking carried no mark and every verb stayed
 *    live, although `confirmRental` / `floorVerb` / `closeRental` each refuse
 *    a `cancelled_at` booking before they write (Law 3, Law 1).
 *  - **BD-04** — "Open Operations" in the rail was live on a Quote while the
 *    header launcher beside it was disabled: two answers to one question.
 *  - **BD-05** — every line row ended in a bare `more_vert` glyph with no
 *    button and no menu behind it.
 *  - **BD-08** — a failed `getClient` was swallowed to `null`, so a network or
 *    RLS failure told the operator the client had no phone.
 *  - **BD-16** — the payment-status chip was `STATUS.in` (green, "settled")
 *    whatever `payments.status` said, and the delivery-type pill wore the same
 *    green for a field that has no state at all.
 *  - **BD-19** — `clientPhone` was not cleared when the booking changed, so a
 *    detail → detail navigation composed the new booking's messages against
 *    the previous client's number.
 *
 * Mocked at the same query seam the sibling suite uses (Law 2 — the screen has
 * no other way in), plus `queries/clients`, which the page reads for the
 * WhatsApp recipient and which the sibling suite leaves live.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

/* ── the knobs each test turns ───────────────────────────────────────────── */

const BOOKING_UUID = '11111111-1111-4111-8111-111111111111'
const OTHER_UUID = '22222222-2222-4222-8222-222222222222'

let role = 'Owner'
let stage = 'Booked'
let cancelled = false
let invoiceRows: Record<string, unknown>[] = []
let paymentRows: Record<string, unknown>[] = []
/** Held open to keep the invoice read in flight; `null` resolves immediately. */
let invoiceGate: Promise<void> | null = null
let invoiceFails = false
/** Per client id: the phone to answer with, or `'hang'` to never answer. */
let clientAnswers: Record<string, string | 'hang' | null> = {}
let clientFails = false
let noteRows: Record<string, unknown>[] = []

const INTERNAL_NOTE = {
  id: 'n-1',
  noteType: 'Internal',
  body: 'Client asked to hold the gimbal.',
  createdAtAd: '2026-07-17T04:00:00.000Z',
  createdBy: 'u-1',
  bookingLineId: null,
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => role !== 'Warehouse' }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => {
  const row = (bookingNo: string) => ({
    id: bookingNo === 'B-715' ? BOOKING_UUID : OTHER_UUID,
    bookingNo,
    clientId: bookingNo === 'B-715' ? 'c-1' : 'c-2',
    clientName: bookingNo === 'B-715' ? 'Himalayan Films Pvt. Ltd.' : 'Sagarmatha Pictures Pvt. Ltd.',
    project: 'Film Shoot',
    stage,
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
    isCancelled: cancelled,
    isClosed: false,
  })
  return {
    listBookings: async (opts: { chips?: { booking_no?: readonly string[] } }) => {
      const asked = opts.chips?.booking_no?.[0]
      return { rows: asked === 'B-715' || asked === 'B-716' ? [row(asked)] : [], total: null }
    },
    fetchFloorBooking: async (ref: string) => ({
      id: ref === 'B-715' ? BOOKING_UUID : OTHER_UUID,
      bookingNo: ref,
      stage,
      clientName: 'Himalayan Films Pvt. Ltd.',
      project: 'Film Shoot',
      pickupAtAd: '2026-07-16T00:15:00.000Z',
      returnAtAd: '2026-07-19T00:15:00.000Z',
      actualReturnAtAd: null,
      deliveryType: 'Customer Pickup',
      isCancelled: cancelled,
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
    }),
    isSubRentalBooking: (lines: readonly { lineType?: string; subRental?: boolean }[] = []) =>
      lines.some((l) => l.lineType === 'Sub-Rented' || l.lineType === 'Sub-rental' || Boolean(l.subRental)),
    isSubRentedLine: (line: { lineType?: string; subRental?: boolean }) =>
      line.lineType === 'Sub-Rented' || line.lineType === 'Sub-rental' || Boolean(line.subRental),
    paymentGlance: () => [],
    paymentDetailGroups: () => [],
  }
})

vi.mock('../../../lib/queries/bookingNotes', () => ({
  notesForBooking: (bookingId: string) => ({ chips: { booking_id: [bookingId] } }),
  listBookingNotes: async () => ({ rows: noteRows }),
}))

vi.mock('../../../lib/queries/clients', () => ({
  getClient: async (id: string) => {
    if (clientFails) throw new Error('getClient failed: permission denied for table clients')
    const answer = clientAnswers[id]
    if (answer === 'hang') await new Promise<void>(() => {})
    return { id, phone: answer ?? null }
  },
}))

vi.mock('../../../lib/queries/finance', () => ({
  listInvoices: async () => {
    if (invoiceGate) await invoiceGate
    if (invoiceFails) throw new Error('listInvoices failed: JWT expired')
    return { rows: invoiceRows, total: null }
  },
  listPayments: async () => ({ rows: paymentRows, total: null }),
  invoicesForBooking: (bookingId: string) => ({ chips: { booking_id: [bookingId] } }),
  paymentsForBooking: (bookingId: string) => ({ chips: { booking_id: [bookingId] } }),
}))

const INVOICE = {
  id: 'inv-1',
  invoiceNo: 'INV-901',
  bookingId: BOOKING_UUID,
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

const payment = (id: string, status: string) => ({
  id,
  paymentNo: `PAY-2026-000${id}`,
  bookingId: BOOKING_UUID,
  bookingNo: 'B-715',
  invoiceId: 'inv-1',
  invoiceNo: 'INV-901',
  clientId: 'c-1',
  clientName: 'Himalayan Films Pvt. Ltd.',
  amount: 1_500_000,
  paymentType: 'Advance Payment',
  status,
  paymentDateAd: '2026-07-10T04:00:00.000Z',
  channelGroup: null,
  bankName: null,
  transactionRef: 'TXN-9948123',
  notes: null,
  /* The uuid BD-19 says must not reach the operator. */
  receivedById: '99999999-9999-4999-8999-999999999999',
  createdAtAd: '2026-07-10T04:00:00.000Z',
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

async function mount(path = '/rentals/B-715', width = 1440) {
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
            <Route path="/rentals/:bookingNo" element={<BookingDetail />} />
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
  role = 'Owner'
  stage = 'Booked'
  cancelled = false
  invoiceRows = []
  paymentRows = []
  invoiceGate = null
  invoiceFails = false
  clientAnswers = {}
  clientFails = false
  noteRows = []
  navigate = null
})

const text = () => container.textContent ?? ''
const allButtons = () => [...container.querySelectorAll('button')]
const button = (label: string) => allButtons().find((b) => b.textContent?.trim() === label)
/** `Unavailable` puts its reason on the wrapper as `aria-label`, always in the DOM. */
const reasons = () =>
  [...container.querySelectorAll('span[aria-disabled]')].map((s) => s.getAttribute('aria-label') ?? '')
const hasReason = (fragment: string) => reasons().some((r) => r.includes(fragment))

/** Idempotent — the trigger TOGGLES, so a second blind click would close it again. */
async function openOverflow() {
  if (container.querySelector('[role="menu"]')) return
  const trigger = container.querySelector('button[aria-label="More booking actions"]')
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
const menuItem = (label: string) =>
  [...container.querySelectorAll('[role="menuitem"]')].find((el) => (el.textContent ?? '').trim().startsWith(label))

/** The WhatsApp entries live in a nested group that renders only once expanded. */
async function expandMessageClient() {
  await openOverflow()
  const row = menuItem('Message client')
  await act(async () => {
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/* ── BD-02 ───────────────────────────────────────────────────────────────── */

describe('BD-02 — an unanswered invoice read is not an answer about money', () => {
  it('says the invoices are still being read, never that none was raised', async () => {
    const gate = deferred()
    invoiceGate = gate.promise
    invoiceRows = [INVOICE]
    await mount()

    expect(text()).toContain('Reading this booking’s invoices…')
    expect(text()).not.toContain('No invoice raised yet')
    expect(text()).not.toContain('there is no Rental Total to state yet')

    await act(async () => gate.release())
    await flush()

    expect(text()).toContain('From this booking’s invoices')
    expect(text()).not.toContain('Reading this booking’s invoices…')
  })

  it('refuses Record Payment for the RIGHT reason while the read is in flight', async () => {
    const gate = deferred()
    invoiceGate = gate.promise
    invoiceRows = [INVOICE]
    await mount()

    expect(hasReason('still being read')).toBe(true)
    // The settled sentence — "raise one from Finance" — is a claim, and must not
    // be made about a booking whose invoices have not been read.
    expect(hasReason('raise one from Finance')).toBe(false)

    await act(async () => gate.release())
    await flush()
  })

  it('states absence once absence is actually established', async () => {
    invoiceRows = []
    await mount()
    expect(text()).toContain('No invoice raised yet')
    expect(text()).not.toContain('Reading this booking’s invoices…')
  })

  it('says the read FAILED rather than that no invoice exists', async () => {
    invoiceFails = true
    await mount()
    expect(text()).toContain('Invoices could not be read')
    expect(text()).not.toContain('No invoice raised yet')
  })
})

/* ── BD-03 ───────────────────────────────────────────────────────────────── */

describe('BD-03 — a cancelled booking is marked, and its verbs are refused', () => {
  it('shows the Cancelled mark beside the stage block (Law 3)', async () => {
    cancelled = true
    stage = 'Quote'
    await mount()
    expect(text()).toContain('Cancelled')
  })

  it('refuses Confirm Booking on a cancelled Quote — confirmRental would too', async () => {
    cancelled = true
    stage = 'Quote'
    await mount()
    expect(button('Confirm Booking')?.disabled).toBe(true)
    expect(hasReason('a cancelled booking is not confirmed')).toBe(true)
  })

  it('offers Confirm Booking on a live Quote, so the refusal is the cancellation and not the stage', async () => {
    cancelled = false
    stage = 'Quote'
    await mount()
    expect(button('Confirm Booking')?.disabled).toBe(false)
  })

  it('refuses Extend, Assign crew and Create sub-rental, visibly and with the list’s own reason', async () => {
    cancelled = true
    stage = 'On Rent'
    await mount()
    await openOverflow()

    for (const label of ['Extend rental', 'Assign crew', 'Create sub-rental']) {
      const item = menuItem(label)
      // Law 3 — still ON SCREEN. Hiding the verb would hide the cancellation.
      expect(item, `${label} should still be listed`).toBeTruthy()
      expect((item as HTMLButtonElement).disabled, `${label} should be refused`).toBe(true)
    }
    expect(hasReason('is cancelled — no operation runs on it')).toBe(true)
  })

  it('refuses both operations launchers on a cancelled booking', async () => {
    cancelled = true
    stage = 'On Rent'
    await mount()
    expect(button('Operations')?.disabled).toBe(true)
    expect(button('Open Operations')?.disabled).toBe(true)
  })
})

/* ── BD-04 ───────────────────────────────────────────────────────────────── */

describe('BD-04 — one predicate, so the two launchers cannot disagree', () => {
  it('disables BOTH at Quote', async () => {
    stage = 'Quote'
    await mount()
    expect(button('Operations')?.disabled).toBe(true)
    expect(button('Open Operations')?.disabled).toBe(true)
    expect(hasReason('Operations open once this booking is Booked')).toBe(true)
  })

  it('enables BOTH at Booked', async () => {
    stage = 'Booked'
    await mount()
    expect(button('Operations')?.disabled).toBe(false)
    expect(button('Open Operations')?.disabled).toBe(false)
  })
})

/* ── BD-05 ───────────────────────────────────────────────────────────────── */

describe('BD-05 — the line table has no fake row menu', () => {
  it('carries five columns, and every row fills all five', async () => {
    await mount()
    const lines = [...container.querySelectorAll('table')].find(
      (t) => t.querySelector('th')?.textContent?.trim() === 'Item',
    )
    expect(lines).toBeTruthy()
    expect(lines?.querySelectorAll('thead th').length).toBe(5)
    for (const row of [...(lines?.querySelectorAll('tbody tr') ?? [])]) {
      expect(row.querySelectorAll('td').length).toBe(5)
    }
  })
})

/* ── BD-08 · BD-19 ───────────────────────────────────────────────────────── */

describe('BD-08 — a client record that could not be read is not a client with no phone', () => {
  it('states the failure inline, in the block it is about', async () => {
    clientFails = true
    await mount()
    expect(text()).toContain('This client’s record could not be read')
    expect(container.querySelector('[role="alert"]')).toBeTruthy()
  })

  it('never tells the operator to add a number that may already be on file', async () => {
    clientFails = true
    await mount()
    await openOverflow()
    expect(hasReason('No valid phone on this client')).toBe(false)
    expect(hasReason('could not be read')).toBe(true)
  })

  it('keeps the real no-phone reason for a client who genuinely has none', async () => {
    stage = 'On Rent'
    clientAnswers = { 'c-1': null }
    await mount()
    await expandMessageClient()
    // Read, answered, and the answer was "no number on file" — the ONE case
    // NO_PHONE_REASON is entitled to be shown.
    expect(hasReason('No valid phone on this client')).toBe(true)
  })
})

describe('BD-19 — the previous client’s number does not survive a detail → detail move', () => {
  it('drops back to "not known yet" the moment the booking’s client changes', async () => {
    stage = 'On Rent'
    clientAnswers = { 'c-1': '+9779812345678', 'c-2': 'hang' }
    await mount('/rentals/B-715')
    await openOverflow()
    expect(menuItem('Message client')).toBeTruthy()
    expect((menuItem('Message client') as HTMLButtonElement).disabled).toBe(false)

    await act(async () => navigate?.('/rentals/B-716'))
    await flush(6)
    await openOverflow()

    // c-2's read never answers. The old code left c-1's number in state, so the
    // menu stayed live and composed B-716's messages against the wrong client.
    expect(hasReason('Still reading this client’s record')).toBe(true)
    expect((menuItem('Message client') as HTMLButtonElement).disabled).toBe(true)
  })
})

/* ── BD-16 ───────────────────────────────────────────────────────────────── */

describe('BD-16 — a status hue means one thing, and only a status wears one', () => {
  it('does not paint a Failed payment in the green that means settled', async () => {
    invoiceRows = [INVOICE]
    paymentRows = [payment('1', 'Received'), payment('2', 'Failed')]
    await mount()

    const chip = (label: string) =>
      [...container.querySelectorAll('span')].find((s) => s.textContent?.trim() === label)

    const failed = chip('Failed')
    const received = chip('Received')
    expect(failed).toBeTruthy()
    expect(received).toBeTruthy()
    expect(failed?.getAttribute('style')).toContain('--st-danger-bg')
    expect(failed?.getAttribute('style')).not.toContain('--st-in-bg')
    expect(received?.getAttribute('style')).toContain('--st-in-bg')
  })

  it('gives the delivery type a neutral marker, not the green of a settled status', async () => {
    await mount()
    const pill = [...container.querySelectorAll('span')].find((s) => s.textContent?.trim() === 'Client Pickup')
    expect(pill).toBeTruthy()
    expect(pill?.getAttribute('style')).not.toContain('--st-in-bg')
    expect(pill?.getAttribute('style')).toContain('--card2')
  })

  it('paints no note-type TOGGLE in a status hue, selected or not', async () => {
    await mount()
    const chips = [...container.querySelectorAll('button')].filter((b) =>
      ['Booking', 'Internal'].includes((b.textContent ?? '').trim()),
    )
    expect(chips.length).toBe(2)
    // One of the two is `aria-pressed`, and it was the pressed one that wore
    // `--st-primary-bg` — a control state painted in the stage vocabulary.
    expect(chips.some((c) => c.getAttribute('aria-pressed') === 'true')).toBe(true)
    for (const c of chips) {
      const style = c.getAttribute('style') ?? ''
      expect(style).not.toContain('--st-primary-bg')
      expect(style).not.toContain('--st-progress-bg')
    }
  })

  it('paints no note-type CHIP on a recorded note in a status hue either', async () => {
    noteRows = [INTERNAL_NOTE]
    await mount()
    const chip = [...container.querySelectorAll('span')].find((s) => s.textContent?.trim() === 'Internal')
    expect(chip).toBeTruthy()
    const style = chip?.getAttribute('style') ?? ''
    expect(style).not.toContain('--st-progress-bg')
    expect(style).not.toContain('--st-primary-bg')
    // Law 11 — the word is not left carrying the distinction alone.
    expect(chip?.querySelector('svg')).toBeTruthy()
  })
})

/* ── BD-19, second half ──────────────────────────────────────────────────── */

describe('BD-19 — a staff uuid is not shown to an operator', () => {
  it('puts no `users.id` anywhere in the rendered page', async () => {
    invoiceRows = [INVOICE]
    paymentRows = [payment('1', 'Received')]
    await mount()
    expect(text()).not.toContain('99999999-9999-4999-8999-999999999999')
  })
})
