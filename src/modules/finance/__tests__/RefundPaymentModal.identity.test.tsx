// @vitest-environment jsdom
/**
 * Who processed the reversal, and for how much.
 *
 * Two defects, both invisible on screen, both of which would have been *written*
 * the day `refundPayment` sets `implemented: true`:
 *
 *  1. **A fabricated actor.** The dispatch read
 *
 *         await refundPayment({ id: invoiceId }, { userId: 'USR-001', role: 'Manager' })
 *
 *     — an invented staff id, and `Manager` is a role the business-9 migration
 *     churned. Every reversal was attributed to somebody who does not exist.
 *     `RecordPaymentModal` had the identical line and was fixed for it; this one
 *     survived, which is what a test is for.
 *
 *  2. **An invented amount.** The field defaulted to `useState<number>(50000)`,
 *     so every operator opening this modal on every invoice was pre-filled with
 *     the same Rs 50,000. Law 4 makes a reversal the only correction there is,
 *     so this is the more consequential half of the same defect
 *     `RecordPaymentModal.tsx` ~41-65 records.
 *
 * Neither is visible in a screenshot: an id looks like an id and a figure looks
 * like a figure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { rupees } from '../../../lib/money'

const refundPaymentSpy = vi.fn(async (_input: unknown, _ctx: unknown) => ({ success: true }))

vi.mock('../../../actions/payments/refundPayment', () => ({
  refundPayment: (input: unknown, ctx: unknown) => refundPaymentSpy(input, ctx),
}))
vi.mock('../../../events/eventBus', () => ({
  DomainEvents: { emit: async () => {} },
  EVENT_TYPES: { PAYMENT_REFUNDED: 'payment.refunded' },
}))

/** The signed-in session, mutable between mounts — `null` is the signed-out case. */
const auth = vi.hoisted(() => ({
  user: { id: 'USR-REAL', name: 'Tester', role: 'Accounts', isSharedDevice: false } as
    | { id: string; name: string; role: string; isSharedDevice: boolean }
    | null,
}))

vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: auth.user }) }))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { RefundPaymentModal } = await import('../modals/RefundPaymentModal')

/** `invoices.paid_amount` for INV-492 — Rs 1,80,000 received against it. */
const PAID = rupees(180000)

async function mount(opts: { paid?: number | undefined } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <RefundPaymentModal
          isOpen
          onClose={() => {}}
          onSuccess={() => {}}
          invoiceId="INV-492"
          client="Vision Production"
          currentPaidPaisa={opts.paid === undefined ? undefined : (opts.paid as ReturnType<typeof rupees>)}
        />
      </StrictMode>,
    )
  })
  return container
}

function amountInput(c: HTMLElement) {
  return c.querySelector('input[type="number"]') as HTMLInputElement
}
function reasonInput(c: HTMLElement) {
  return c.querySelector('textarea') as HTMLTextAreaElement
}
function submitButton(c: HTMLElement) {
  const b = Array.from(c.querySelectorAll('button')).find((x) => /Confirm Reversal/.test(x.textContent ?? ''))
  if (!b) throw new Error('the footer submit button was never rendered')
  return b
}
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  refundPaymentSpy.mockClear()
  auth.user = { id: 'USR-REAL', name: 'Tester', role: 'Accounts', isSharedDevice: false }
})

describe('RefundPaymentModal — the amount', () => {
  it('opens EMPTY, not pre-filled with an invented Rs 50,000', async () => {
    const c = await mount({ paid: PAID })
    expect(amountInput(c).value).toBe('')
    expect(c.textContent).not.toContain('50,000')
    expect(c.textContent).toContain('Formatted: —')
  })

  it('states what was actually received, from the invoice’s own column', async () => {
    const c = await mount({ paid: PAID })
    expect(c.textContent).toContain('Received to date: Rs 1,80,000')
  })

  it('says so plainly when the caller could not supply that figure — never a zero standing in', async () => {
    const c = await mount({})
    expect(c.textContent).toContain('Received to date: not available to this screen')
    expect(c.textContent).not.toContain('Received to date: Rs 0')
  })

  it('refuses to dispatch while the field is empty, and says so inline', async () => {
    const c = await mount({ paid: PAID })
    await act(async () => { submitButton(c).click() })
    expect(refundPaymentSpy).not.toHaveBeenCalled()
    expect(c.textContent).toContain('must be greater than 0')
  })

  it('refuses a reversal larger than what was received, and names the figure', async () => {
    const c = await mount({ paid: PAID })
    await type(amountInput(c), '200000')
    await type(reasonInput(c), 'Client overpaid the final invoice')
    await act(async () => { submitButton(c).click() })
    expect(refundPaymentSpy).not.toHaveBeenCalled()
    expect(c.textContent).toContain('Only Rs 1,80,000 has been received against INV-492')
  })
})

describe('RefundPaymentModal — the actor', () => {
  it('dispatches with the SESSION’s identity, never USR-001 / Manager', async () => {
    const c = await mount({ paid: PAID })
    await type(amountInput(c), '60000')
    await type(reasonInput(c), 'Shoot cancelled, partial return agreed')
    await act(async () => { submitButton(c).click() })

    expect(refundPaymentSpy).toHaveBeenCalledTimes(1)
    const [input, ctx] = refundPaymentSpy.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(input.id).toBe('INV-492')
    expect(ctx).toEqual({ userId: 'USR-REAL', role: 'Accounts' })
    // The exact fabrication, spelled out so a revert cannot slip past.
    expect(ctx.userId).not.toBe('USR-001')
    expect(ctx.role).not.toBe('Manager')
  })

  it('refuses outright with no session — a reversal has an actor or it is not recorded', async () => {
    auth.user = null
    const c = await mount({ paid: PAID })
    await type(amountInput(c), '60000')
    await type(reasonInput(c), 'Shoot cancelled, partial return agreed')
    await act(async () => { submitButton(c).click() })

    expect(refundPaymentSpy).not.toHaveBeenCalled()
    expect(c.textContent).toContain('not signed in')
  })
})
