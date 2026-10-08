// @vitest-environment jsdom
/**
 * The amount default on Record Payment, and the direction of the rupees→paisa
 * conversion.
 *
 * Provenance: these assertions were written as `RecordPaymentModal.tmp.test.tsx`,
 * a self-declared throwaway harness, and deleted during the 12 Aug identifier
 * rename. They are restored here **unweakened** — same three cases, same
 * expected values — with only the record numbers moved to the ruled scheme
 * (`INV-2026-0492` → `INV-492`, `BK-2026-0715` → `B-715`). A guard that
 * disappears in a rename is how a renamed defect comes back.
 *
 * What they hold down is stated at length in `RecordPaymentModal.tsx` ~41-60:
 * the field used to default to an invented Rs 50,000 that reached
 * `recordPayment` and would have been *written* against any bill. The empty
 * default is the fix, and it is invisible — nothing on screen says "this used
 * to be 50,000", so only a test can keep it.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const recordPaymentSpy = vi.fn(async (_input: unknown, _ctx: unknown) => ({ success: true, paymentId: 'PAY-0001' }))

vi.mock('../../../actions/finance/recordPayment', () => ({
  recordPayment: (input: unknown, ctx: unknown) => recordPaymentSpy(input, ctx),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-REAL', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { RecordPaymentModal } = await import('../modals/RecordPaymentModal')

/*
 * ⚠ `id` is the invoice's UUID, `invoiceNo` its number (MONEY-05). The row used
 * to be `{ id: 'INV-492' }` — the number in the id slot — and the modal resolved
 * the payment by it. That could never settle a Draft: R-15 gives a Draft no
 * `invoice_no` at all and R-02 keeps an invoice in Draft for the whole rental,
 * so every invoice this application creates was unpayable. The second row below
 * is exactly that case and is the reason it exists.
 */
const INVOICE_UUID = '11111111-1111-4111-8111-111111111111'
const DRAFT_UUID = '44444444-4444-4444-8444-444444444444'
const INVOICES = [
  {
    id: INVOICE_UUID,
    invoiceNo: 'INV-492',
    client: 'ABC Films Pvt. Ltd.',
    amount: 'Rs 1,39,506',
    status: 'Sent',
    booking: 'B-715',
  },
  {
    id: DRAFT_UUID,
    invoiceNo: null,
    client: 'Manaslu Motion Pictures Pvt. Ltd.',
    amount: 'Rs 51,867',
    status: 'Draft',
    booking: 'B-716',
  },
]

async function mount(onSuccess: (p: unknown) => void) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <RecordPaymentModal isOpen onClose={() => {}} onSuccess={onSuccess as never} invoices={INVOICES} />
      </StrictMode>,
    )
  })
  return container
}

function amountInput(c: HTMLElement) {
  return c.querySelector('input[type="number"]') as HTMLInputElement
}
function submitButton(c: HTMLElement) {
  return Array.from(c.querySelectorAll('button')).find((b) => /Record Payment/.test(b.textContent ?? ''))!
}
async function typeAmount(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('RecordPaymentModal — the amount default', () => {
  it('opens with an EMPTY amount field, not a pre-filled figure', async () => {
    const c = await mount(() => {})
    expect(amountInput(c).value).toBe('')
    expect(c.textContent).not.toContain('50,000')
    expect(c.textContent).toContain('Formatted: —')
  })

  it('refuses to dispatch while the field is empty, and says so inline', async () => {
    recordPaymentSpy.mockClear()
    const c = await mount(() => {})
    await act(async () => { submitButton(c).click() })
    expect(recordPaymentSpy).not.toHaveBeenCalled()
    expect(c.textContent).toContain('must be greater than 0')
  })

  it('sends rupees→paisa in the right direction, exactly once', async () => {
    recordPaymentSpy.mockClear()
    const seen: unknown[] = []
    const c = await mount((p) => seen.push(p))
    await typeAmount(amountInput(c), '1500')
    expect(c.textContent).toContain('Formatted: Rs 1,500')
    await act(async () => { submitButton(c).click() })
    expect(recordPaymentSpy).toHaveBeenCalledTimes(1)
    const [input, ctx] = recordPaymentSpy.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(input.amountPaisa).toBe(150000)
    /*
     * UPDATED twice, and each time onto the field that now carries the fact.
     *
     * 12 Aug 2026 — was `expect(input.bookingId).toBe('B-715')`, correct for the
     * stub and wrong for the write: `payments.booking_id` is `uuid NOT NULL` and
     * `B-715` is not one.
     *
     * MONEY-05 — was `expect(input.invoiceNo).toBe('INV-492')`. Also correct at
     * the time, and also wrong now: R-15 gives a **Draft no number at all**, so
     * resolving by number could not settle any invoice this application creates.
     * The modal sends `invoices.id`.
     *
     * Nothing is relaxed. The same fact — the modal forwards the SELECTED
     * record's identifier, never a placeholder — is asserted on `invoiceId`, and
     * BOTH retired fields are pinned as absent so neither a booking number nor an
     * invoice number can quietly reappear in a uuid slot.
     */
    expect(input.invoiceId).toBe(INVOICE_UUID)
    expect(input.invoiceNo).toBeUndefined()
    expect(input.bookingId).toBeUndefined()
    // Law 8 — the modal mints the key, the action does not.
    expect(typeof input.clientUuid).toBe('string')
    expect(input.clientUuid).not.toBe('')
    // `isOnline` is what `lib/rbac`'s money rules degrade on; jsdom reports online.
    expect(ctx).toEqual({ userId: 'USR-REAL', role: 'Owner', isOnline: true })
    expect((seen[0] as Record<string, unknown>).amountPaisa).toBe(150000)
  })

  /*
   * SPEC-P0-1 §5's acceptance case begins *"Record a 50% advance"* against a
   * Draft, and R-14 leaves that invoice in Draft when the payment lands. Both of
   * these were impossible before MONEY-05: the picker resolved by number and a
   * Draft has none.
   */
  it('names an unnumbered Draft in the picker rather than rendering a blank label', async () => {
    const c = await mount(() => {})
    const options = Array.from(c.querySelectorAll('option')).map((o) => o.textContent ?? '')
    expect(options.some((t) => t.includes('INV-492'))).toBe(true)
    expect(options.some((t) => t.includes('Draft (no number)'))).toBe(true)
    expect(options.some((t) => t.trim().startsWith('—'))).toBe(false)
  })

  it('settles a Draft by its uuid — the case the number path could never reach', async () => {
    recordPaymentSpy.mockClear()
    const c = await mount(() => {})
    const picker = c.querySelector('select') as HTMLSelectElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(picker, DRAFT_UUID)
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await typeAmount(amountInput(c), '25000')
    await act(async () => { submitButton(c).click() })
    expect(recordPaymentSpy).toHaveBeenCalledTimes(1)
    const [input] = recordPaymentSpy.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(input.invoiceId).toBe(DRAFT_UUID)
    expect(input.amountPaisa).toBe(2500000)
  })

  it('sends the same Law 8 key on a retry, so a replayed submit cannot charge twice', async () => {
    recordPaymentSpy.mockClear()
    // The first attempt fails the way a dropped response does: the modal must
    // stay open and keep its key, or the retry writes a second immutable row.
    recordPaymentSpy.mockRejectedValueOnce(new Error('Failed to fetch'))
    const c = await mount(() => {})
    await typeAmount(amountInput(c), '1500')
    await act(async () => { submitButton(c).click() })
    await act(async () => { submitButton(c).click() })

    expect(recordPaymentSpy).toHaveBeenCalledTimes(2)
    const first = recordPaymentSpy.mock.calls[0]![0] as Record<string, unknown>
    const second = recordPaymentSpy.mock.calls[1]![0] as Record<string, unknown>
    expect(second.clientUuid).toBe(first.clientUuid)
  })

  it('satisfies keyboard accessibility and accessible name bindings for screen readers', async () => {
    recordPaymentSpy.mockClear()
    const c = await mount(() => {})
    const controls = Array.from(c.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
    expect(controls.length).toBeGreaterThanOrEqual(5)
    for (const ctrl of controls) {
      const id = ctrl.getAttribute('id')
      const ariaLabel = ctrl.getAttribute('aria-label')
      const ariaLabelledby = ctrl.getAttribute('aria-labelledby')
      const hasForLabel = id ? Boolean(c.querySelector(`label[for="${id}"]`)) : false
      expect(Boolean(ariaLabel || ariaLabelledby || hasForLabel)).toBe(true)
      expect(ctrl.tabIndex).toBeGreaterThanOrEqual(0)
    }

    const amt = amountInput(c)
    amt.focus()
    expect(document.activeElement).toBe(amt)
    await typeAmount(amt, '1000')
    const subBtn = submitButton(c)
    subBtn.focus()
    expect(document.activeElement).toBe(subBtn)
    await act(async () => {
      subBtn.click()
    })
    expect(recordPaymentSpy).toHaveBeenCalled()
  })

  /*
   * Fonepay is the merchant QR most Kathmandu clients pay by, and the method
   * list did not offer it — a Fonepay receipt had to be logged as eSewa or
   * "Bank Transfer", both false. The label is what reaches `payments.notes`
   * as `Method: Fonepay` (see recordPayment.ts METHOD); no account is implied.
   */
  it('offers Fonepay and sends it as the method label, with no account attached', async () => {
    recordPaymentSpy.mockClear()
    const c = await mount(() => {})
    const fonepay = c.querySelector('input[name="rpm-method"][value="Fonepay"]') as HTMLInputElement
    expect(fonepay).not.toBeNull()
    await act(async () => { fonepay.click() })
    expect(fonepay.checked).toBe(true)
    await typeAmount(amountInput(c), '2000')
    await act(async () => { submitButton(c).click() })
    expect(recordPaymentSpy).toHaveBeenCalledTimes(1)
    const [input] = recordPaymentSpy.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(input.paymentMethod).toBe('Fonepay')
    expect(input.bankAccountId).toBeUndefined()
  })

  /*
   * The method picker is tap cards, not a dropdown: all seven methods are on
   * screen at once as one radio group, the default is still Bank Transfer, and
   * the labels are exactly the values `recordPayment` writes to the notes.
   */
  it('shows every method as a tap card, Bank Transfer chosen by default', async () => {
    const c = await mount(() => {})
    expect(c.querySelector('select#rpm-method')).toBeNull()
    const radios = Array.from(c.querySelectorAll<HTMLInputElement>('input[type="radio"][name="rpm-method"]'))
    expect(radios.map((r) => r.value)).toEqual(['Bank Transfer', 'Cash', 'Fonepay', 'eSewa', 'Khalti', 'Card', 'Cheque'])
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['Bank Transfer'])
    expect(c.querySelector('fieldset legend')?.textContent).toContain('Payment Method')
  })
})
