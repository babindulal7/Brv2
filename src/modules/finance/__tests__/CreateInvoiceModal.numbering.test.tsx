// @vitest-environment jsdom
/**
 * The invoice number this modal used to mint came from nowhere legitimate.
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §2.2: *"The prefixes are configuration, not
 * constants. No module may hardcode a prefix"* — the same rule `PLAN.md` §5
 * applies to the VAT rate. §2 additionally fixes the shape: no year segment, no
 * zero padding.
 *
 * This file exists because that rule was broken here and survived a rename pass
 * plus a report: the generator read
 *
 *     const generatedId = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`
 *
 * one screenful below a line the same pass edited. It minted `INV-2026-4821`
 * into a table whose seeded rows read `INV-492`, and out through the CSV export.
 * A hardcoded prefix is invisible on screen — the ID looks like an ID — so a
 * test is the only thing that can see it.
 *
 * ── Why the assertions below changed shape, twice ──────────────────────────
 *
 * **First rewrite.** The original version asserted that the modal mints a
 * *well-shaped* number. `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` §B2 retired
 * the minting itself rather than correcting its format, so the assertions moved
 * to "no number is minted" — a strictly stronger guarantee than "the minted
 * number is well-shaped".
 *
 * **Second rewrite — this one (MONEY-01).** The modal that stood here was a
 * free-form line editor that refused to submit, because `createInvoice` derives
 * its lines from the BOOKING and dispatching from a hand-typed form would have
 * discarded every row the operator entered. `PLAN.md` §4.46 recorded the
 * question. It is answered by rulings that were already binding — R-03 (*"Append
 * as lines to the **Draft** invoice. One invoice per rental"*), SPEC-P0-1 §3.1
 * (*"one `invoice_lines` row per `booking_lines` row … Lines are a snapshot, not
 * a join"*) and R-02 (Draft until issued at return) — so the modal is now a
 * read-only PREVIEW of the booking's own lines and Confirm dispatches the
 * action.
 *
 * **Nothing protective is dropped by that.** The three guarantees this file has
 * always held are asserted against the new screen, and two are now stronger:
 *
 *   1. no invoice identifier reaches the DOM — and there is no longer any code
 *      path that could produce one, because R-15 mints `invoice_no` at issue;
 *   2. the modal opens holding no figures of its own — there are no line fields
 *      left to pre-fill, so the assertion is that no money is rendered at all
 *      until a booking has been read;
 *   3. `onSuccess` fires only for an invoice that was actually written — now
 *      testable in both directions, where before only the negative existed.
 *
 * The `data/numbering.ts` shape assertions at the bottom are untouched: they
 * guard the ruling, not the screen, and the number the database eventually hands
 * back is still rendered through that format.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { issue, prefixOf, sequence, formatHas } from '../../../data/numbering'
import { ToastProvider } from '../../../components/ui/Toast'
import type { InvoicePreview } from '../../../lib/queries/invoicePreview'
import type { CreateInvoiceResult } from '../../../actions/finance/createInvoice'
import type { Paisa } from '../../../lib/money'

/* ── The seams ────────────────────────────────────────────────────────────
 *
 * Two, and only two: the READ that builds the preview and the WRITE that
 * raises the invoice. Everything between them is the component under test.
 */
const previewSpy = vi.fn<(bookingNo: string) => Promise<InvoicePreview>>()
const createInvoiceSpy = vi.fn<(input: unknown, ctx: unknown) => Promise<CreateInvoiceResult>>()

vi.mock('../../../lib/queries/invoicePreview', () => ({
  previewInvoiceForBooking: (bookingNo: string) => previewSpy(bookingNo),
}))
vi.mock('../../../actions/finance/createInvoice', () => ({
  createInvoice: (input: unknown, ctx: unknown) => createInvoiceSpy(input, ctx),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-REAL', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))
/*
 * The VAT rate is configuration (money.ts:94 — "from Settings ▸ Finance, never
 * hardcoded"), so it is pinned here rather than read out of a localStorage the
 * suite does not control. 13 is the spec default; the point of the assertion
 * below is that the modal uses THIS value and not one of its own.
 */
vi.mock('../../../lib/settingsStore', () => ({
  getSetting: (key: string) => (key === 'vatRatePercent' ? 13 : 0),
}))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { CreateInvoiceModal } = await import('../modals/CreateInvoiceModal')

const rs = (n: number) => (n * 100) as Paisa

/**
 * A booking whose bill exercises every bucket `price()` takes — equipment with a
 * line discount, crew and transport — so a total that silently dropped one of
 * them would be visible in the assertion rather than hidden inside a round
 * number.
 *
 *   equipment  2 x 3 x 5,000               = 30,000
 *            + 1 x 3 x 2,000 less 500      =  5,500
 *   crew       1 x 3 x 4,000               = 12,000
 *   transport                              =  3,500
 *   subtotal                                 51,000
 *   less 10% booking discount                 5,100  →  taxable 45,900
 *   plus 13% VAT                              5,967  →  total   51,867
 */
const PREVIEW: InvoicePreview = {
  kind: 'preview',
  bookingNo: 'B-715',
  bookingId: '22222222-2222-4222-8222-222222222222',
  clientName: 'ABC Films Pvt. Ltd.',
  dueDateAd: '2026-09-22',
  paymentTerms: '15 days',
  discountPercent: 10,
  lines: [
    {
      key: 'aaaaaaaa-0000-4000-8000-000000000001',
      kind: 'Equipment Rental',
      description: 'Sony FX9 body',
      qty: 2,
      days: 3,
      ratePaisa: rs(5000),
      discountPaisa: rs(0),
      netPaisa: rs(30000),
      sortOrder: 0,
    },
    {
      key: 'aaaaaaaa-0000-4000-8000-000000000002',
      kind: 'Equipment Rental',
      description: 'Tripod',
      qty: 1,
      days: 3,
      ratePaisa: rs(2000),
      discountPaisa: rs(500),
      netPaisa: rs(5500),
      sortOrder: 1,
    },
    {
      key: 'bbbbbbbb-0000-4000-8000-000000000001',
      kind: 'Crew Charges',
      description: 'Ramesh - Gaffer',
      qty: 1,
      days: 3,
      ratePaisa: rs(4000),
      discountPaisa: rs(0),
      netPaisa: rs(12000),
      sortOrder: 1000,
    },
    {
      key: 'cccccccc-0000-4000-8000-000000000001',
      kind: 'Transport',
      description: 'Transport - Mini Truck',
      qty: 1,
      days: 1,
      ratePaisa: rs(3500),
      discountPaisa: rs(0),
      netPaisa: rs(3500),
      sortOrder: 2000,
    },
  ],
  buckets: {
    equipment: rs(35500),
    subRental: rs(0),
    services: rs(0),
    crew: rs(12000),
    transport: rs(3500),
  },
  transportKnown: true,
}

const WRITTEN: CreateInvoiceResult = {
  invoiceId: '99999999-9999-4999-8999-999999999999',
  bookingId: PREVIEW.kind === 'preview' ? PREVIEW.bookingId : '',
  bookingNo: 'B-715',
  clientId: '33333333-3333-4333-8333-333333333333',
  status: 'Draft',
  dueDateAd: '2026-09-22',
  linesWritten: 4,
  subtotalPaisa: rs(51000),
  discountPaisa: rs(5100),
  taxablePaisa: rs(45900),
  vatPaisa: rs(5967),
  totalPaisa: rs(51867),
}

interface Mounted {
  container: HTMLDivElement
  created: CreateInvoiceResult[]
  closeCalls: () => number
  confirm: () => HTMLButtonElement
}

/**
 * Every root this file mounts, torn down in `afterEach`.
 *
 * `Modal.tsx` arms a `window.setTimeout` for its close transition, and a root
 * that is never unmounted never runs that effect's cleanup — the timer then
 * fires after vitest has torn the jsdom environment down and React reports
 * `ReferenceError: window is not defined` against whichever file is unlucky.
 * `Finance.restricted.test.tsx` records the same trap.
 */
const roots: Array<{ root: Root; container: HTMLElement }> = []

/**
 * `null`, not `undefined`, is how a caller says "no booking".
 *
 * A default parameter fires on an explicit `undefined` too, so
 * `mount(undefined)` would silently mount the B-715 case and the assertion
 * "reads nothing until a booking is named" would pass against a screen that had
 * read one. It did, before this signature changed.
 */
async function mount(bookingNo: string | null = 'B-715'): Promise<Mounted> {
  const created: CreateInvoiceResult[] = []
  let closeCalls = 0
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ root, container })
  await act(async () => {
    root.render(
      <StrictMode>
        <ToastProvider>
          <CreateInvoiceModal
            isOpen
            onClose={() => {
              closeCalls += 1
            }}
            {...(bookingNo === null ? {} : { bookingNo })}
            onSuccess={(inv) => created.push(inv)}
          />
        </ToastProvider>
      </StrictMode>,
    )
  })
  return {
    container,
    created,
    closeCalls: () => closeCalls,
    confirm: () =>
      Array.from(container.querySelectorAll('button')).find((b) =>
        /Create Draft Invoice/.test(b.textContent ?? ''),
      ) as HTMLButtonElement,
  }
}

beforeEach(() => {
  previewSpy.mockReset()
  createInvoiceSpy.mockReset()
  previewSpy.mockResolvedValue(PREVIEW)
  createInvoiceSpy.mockResolvedValue(WRITTEN)
})

afterEach(async () => {
  await act(async () => {
    for (const { root, container } of roots.splice(0)) {
      root.unmount()
      container.remove()
    }
  })
})

describe('CreateInvoiceModal — it issues no number, because the database does', () => {
  it('puts no invoice identifier on screen — not even a well-shaped one', async () => {
    // The exact defect this file was opened for: a fabricated identifier that
    // looks like an identifier. Asserted against the rendered DOM, which is the
    // only surface an operator could copy a number off.
    const { container } = await mount()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/INV-\d/)
    expect(text).not.toMatch(/INV-20\d{2}-/)
    expect(text).not.toContain('2026-')
    // What it says instead — R-15: minted at issue, inside the same transaction.
    expect(text).toContain('Minted when the invoice is issued')
  })

  it('sends no number to the action either — the action names the booking, nothing else', async () => {
    const m = await mount()
    await act(async () => {
      m.confirm().click()
    })
    const [input] = createInvoiceSpy.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(input['bookingNo']).toBe('B-715')
    expect(input).not.toHaveProperty('invoiceNo')
    expect(input).not.toHaveProperty('invoiceId')
    expect(input).not.toHaveProperty('status')
  })
})

describe('CreateInvoiceModal — it holds no figures of its own', () => {
  /*
   * The old form opened with `Camera Package Rental / 150000` and
   * `Grip & Lighting Gear / 35000` pre-typed, and rendered Rs 2,09,050 the
   * instant it opened. There are no line fields left to pre-fill, so the
   * guarantee is now the stronger one: with no booking read, no money is
   * rendered at all.
   */
  it('renders no money before a booking has been read', async () => {
    previewSpy.mockImplementation(() => new Promise(() => {}))
    const { container } = await mount()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/Rs\s/)
    expect(text).not.toContain('Camera Package Rental')
    expect(text).not.toContain('Grip & Lighting')
    expect(text).not.toContain('1,85,000')
    expect(text).not.toContain('2,09,050')
  })

  it('renders the BOOKING’s own lines, at the booking’s own rates', async () => {
    const { container } = await mount()
    const text = container.textContent ?? ''
    expect(text).toContain('Sony FX9 body')
    expect(text).toContain('Ramesh - Gaffer')
    expect(text).toContain('Transport - Mini Truck')
    // Crew and transport are the two `createInvoice` used to drop entirely, so
    // their presence in the PREVIEW is what proves the two agree.
    expect(text).toContain('Crew Charges')
    expect(text).toContain('4 lines from B-715')
  })

  it('totals through the engine, at the rate Settings holds — not one of its own', async () => {
    const { container } = await mount()
    const text = container.textContent ?? ''
    expect(text).toContain('Rs 51,000') // subtotal
    expect(text).toContain('Rs 5,100') // 10% booking discount
    expect(text).toContain('Rs 45,900') // taxable
    expect(text).toContain('Rs 5,967') // 13% VAT, half-up at the step
    expect(text).toContain('Rs 51,867') // total
    expect(text).toContain('IRD VAT (13%)')
  })

  it('offers nothing to edit — the bill is the booking’s, not this screen’s', async () => {
    const { container } = await mount()
    // One optional notes box, and no money input anywhere.
    expect(container.querySelectorAll('input[type="number"]').length).toBe(0)
    expect(container.querySelectorAll('textarea').length).toBe(1)
  })
})

describe('CreateInvoiceModal — Confirm writes once, and only a confirmed write is reported', () => {
  it('dispatches createInvoice with the settings VAT rate and a Law 8 key', async () => {
    const m = await mount()
    await act(async () => {
      m.confirm().click()
    })
    expect(createInvoiceSpy).toHaveBeenCalledTimes(1)
    const [input, ctx] = createInvoiceSpy.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(input['vatPercent']).toBe(13)
    expect(typeof input['clientUuid']).toBe('string')
    expect(input['clientUuid']).not.toBe('')
    expect(ctx).toEqual({ userId: 'USR-REAL', role: 'Owner', isOnline: true })
  })

  it('hands back the ACTION’s result and closes, once the write resolved', async () => {
    const m = await mount()
    await act(async () => {
      m.confirm().click()
    })
    expect(m.created).toEqual([WRITTEN])
    expect(m.closeCalls()).toBe(1)
  })

  it('sends the same Law 8 key on a retry, so a replayed Confirm cannot bill twice', async () => {
    // A dropped response: the modal must stay open and keep its key, or the
    // retry raises a SECOND invoice for a booking R-03 allows one.
    createInvoiceSpy.mockRejectedValueOnce(new Error('Failed to fetch'))
    const m = await mount()
    await act(async () => {
      m.confirm().click()
    })
    await act(async () => {
      m.confirm().click()
    })
    expect(createInvoiceSpy).toHaveBeenCalledTimes(2)
    const first = createInvoiceSpy.mock.calls[0]![0] as Record<string, unknown>
    const second = createInvoiceSpy.mock.calls[1]![0] as Record<string, unknown>
    expect(second['clientUuid']).toBe(first['clientUuid'])
  })

  it('mints a NEW key after a confirmed success, so a second booking is not posted under the first key', async () => {
    const m = await mount()
    await act(async () => {
      m.confirm().click()
    })
    const firstKey = (createInvoiceSpy.mock.calls[0]![0] as Record<string, unknown>)['clientUuid']
    // The modal stays mounted here (the caller closes it); a second Confirm must
    // not reuse the key that already wrote an invoice.
    await act(async () => {
      m.confirm().click()
    })
    const secondKey = (createInvoiceSpy.mock.calls[1]![0] as Record<string, unknown>)['clientUuid']
    expect(secondKey).not.toBe(firstKey)
  })

  it('keeps the modal open and states the refusal inline when the write fails', async () => {
    createInvoiceSpy.mockRejectedValueOnce(
      new Error('B-715 already has an invoice (a Draft, Draft). One invoice per rental.'),
    )
    const m = await mount()
    await act(async () => {
      m.confirm().click()
    })
    expect(m.created).toEqual([])
    expect(m.closeCalls()).toBe(0)
    // Law 12 — the database's own sentence, on screen, not a toast.
    expect(m.container.textContent).toContain('already has an invoice')
  })
})

describe('CreateInvoiceModal — a booking that already has one is shown, never offered a second', () => {
  /*
   * R-03: one invoice per rental. `createInvoice`'s precondition refuses on ANY
   * existing invoice, so the modal must refuse on the same set — offering a
   * control the dispatcher will turn down is the shape MONEY-01 removes.
   */
  const ALREADY: InvoicePreview = {
    kind: 'already-invoiced',
    bookingNo: 'B-715',
    clientName: 'ABC Films Pvt. Ltd.',
    existing: {
      id: '99999999-9999-4999-8999-999999999999',
      invoiceNo: null,
      status: 'Draft',
      isVoid: false,
      totalPaisa: rs(51867),
      paidPaisa: rs(25000),
      outstandingPaisa: rs(26867),
      dueDateAd: '2026-09-22',
    },
  }

  it('names an unnumbered Draft rather than rendering a blank label', async () => {
    previewSpy.mockResolvedValue(ALREADY)
    const { container } = await mount()
    // R-15 — a Draft genuinely has no number, and an empty label would read as
    // a rendering fault rather than as a state.
    expect(container.textContent).toContain('Draft (no number)')
    expect(container.textContent).toContain('Rs 26,867')
  })

  it('does not dispatch, and says why the control is unavailable', async () => {
    previewSpy.mockResolvedValue(ALREADY)
    const m = await mount()
    expect(m.confirm().disabled).toBe(true)
    await act(async () => {
      m.confirm().click()
    })
    expect(createInvoiceSpy).not.toHaveBeenCalled()
    expect(m.container.textContent).toContain('One invoice per rental')
  })
})

describe('CreateInvoiceModal — a partial preview is never presented as a total', () => {
  /*
   * `booking_transport_v` excludes Manager and Accounts while R-05 lets both
   * raise an invoice, and `create_invoice` (SECURITY DEFINER) bills the
   * transport regardless. So the invoice is right and the PREVIEW is short — and
   * a figure labelled "Invoice total" that is short by a delivery charge is the
   * confidently-wrong number this screen exists to stop.
   */
  it('renames the total and states the omission when transport could not be read', async () => {
    previewSpy.mockResolvedValue({ ...PREVIEW, transportKnown: false } as InvoicePreview)
    const m = await mount()
    const text = m.container.textContent ?? ''
    expect(text).toContain('NOT the invoice total')
    expect(text).not.toContain('Invoice total')
    expect(text).toContain('Transport charges are not readable by your role')
  })

  it('still offers Confirm, because the invoice the action writes IS complete', async () => {
    previewSpy.mockResolvedValue({ ...PREVIEW, transportKnown: false } as InvoicePreview)
    const m = await mount()
    expect(m.confirm().disabled).toBe(false)
    await act(async () => {
      m.confirm().click()
    })
    expect(createInvoiceSpy).toHaveBeenCalledTimes(1)
  })
})

describe('CreateInvoiceModal — a refusal is stated, never a silent dead end', () => {
  it('renders the reason the preview gave and disables Confirm', async () => {
    previewSpy.mockResolvedValue({
      kind: 'refused',
      bookingNo: 'B-715',
      reason: 'B-715 has no billable lines, so an invoice would bill nothing.',
    })
    const m = await mount()
    expect(m.container.textContent).toContain('has no billable lines')
    expect(m.confirm().disabled).toBe(true)
    expect(createInvoiceSpy).not.toHaveBeenCalled()
  })

  it('states a failed read as a read failure, not as "this booking has no lines"', async () => {
    previewSpy.mockRejectedValue(new Error('column booking_lines_v.rate does not exist'))
    const m = await mount()
    expect(m.container.textContent).toContain('could not be read')
    expect(m.container.textContent).toContain('column booking_lines_v.rate does not exist')
    expect(m.confirm().disabled).toBe(true)
  })

  it('asks for a booking when the caller has none, and reads nothing until one is named', async () => {
    const m = await mount(null)
    expect(previewSpy).not.toHaveBeenCalled()
    expect(m.confirm().disabled).toBe(true)
    expect(m.container.querySelector('#create-invoice-booking')).toBeTruthy()
  })
})

describe('the INV sequence itself still carries the ruled §2 shape', () => {
  it('registers no year segment', () => {
    // Guards the ruling, not the screen: whatever eventually issues an invoice
    // number renders it through this format.
    expect(formatHas(sequence('INV')?.format as string, 'YEAR')).toBe(false)
  })

  it('renders prefix, separator, bare counter — nothing else', () => {
    const seeded = Number(sequence('INV')?.counter)
    expect(Number.isFinite(seeded)).toBe(true)
    const rendered = issue('INV', seeded + 1)
    expect(rendered).toBe(`${prefixOf('INV')}-${seeded + 1}`)
    expect(rendered).toMatch(/^INV-[1-9]\d*$/)
    // The literal string the old generator could produce.
    expect(rendered).not.toMatch(/^INV-20\d{2}-/)
  })
})
