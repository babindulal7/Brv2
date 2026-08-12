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

const INVOICES = [
  { id: 'INV-492', client: 'ABC Films Pvt. Ltd.', amount: 'Rs 1,39,506', status: 'Sent', booking: 'B-715' },
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
     * UPDATED 12 Aug 2026, when `recordPayment` became a real INSERT.
     *
     * This line was `expect(input.bookingId).toBe('B-715')`. It was correct for
     * the stub — the modal genuinely forwarded the selected row's booking
     * NUMBER — and it is wrong for the write, because `payments.booking_id` is
     * a `uuid NOT NULL` and `B-715` is not one. The action now resolves the
     * invoice by its number and reads `booking_id`, `client_id` and `branch_id`
     * off that row.
     *
     * Nothing is relaxed: the same fact (the modal forwards the SELECTED
     * record's identifier, not a placeholder) is asserted on the field that now
     * carries it, and the old field is pinned as absent so the booking number
     * cannot quietly reappear in a uuid slot.
     */
    expect(input.invoiceNo).toBe('INV-492')
    expect(input.bookingId).toBeUndefined()
    // Law 8 — the modal mints the key, the action does not.
    expect(typeof input.clientUuid).toBe('string')
    expect(input.clientUuid).not.toBe('')
    // `isOnline` is what `lib/rbac`'s money rules degrade on; jsdom reports online.
    expect(ctx).toEqual({ userId: 'USR-REAL', role: 'Owner', isOnline: true })
    expect((seen[0] as Record<string, unknown>).amountPaisa).toBe(150000)
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
})
