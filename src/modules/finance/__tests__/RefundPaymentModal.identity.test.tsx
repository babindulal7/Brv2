// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { rupees } from '../../../lib/money'

const refundPaymentSpy = vi.fn(async (..._args: unknown[]) => ({ success: true }))
vi.mock('../../../actions/payments/refundPayment', () => ({ refundPayment: (input: unknown, ctx: unknown) => refundPaymentSpy(input, ctx) }))
vi.mock('../../../lib/dataAccess', () => ({ generateClientUuid: () => 'modal-client-uuid' }))

const auth = vi.hoisted(() => ({
  user: { id: 'USR-REAL', name: 'Tester', role: 'Manager', isSharedDevice: false } as { id: string; name: string; role: string; isSharedDevice: boolean } | null,
}))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: auth.user }) }))

window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const { RefundPaymentModal } = await import('../modals/RefundPaymentModal')
const PAYMENT_AMOUNT = rupees(180000)

async function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<StrictMode><RefundPaymentModal isOpen onClose={() => {}} onSuccess={() => {}} paymentId="11111111-1111-4111-8111-111111111111" paymentNo="PAY-2026-0001" paymentAmountPaisa={PAYMENT_AMOUNT} client="Vision Production" /></StrictMode>)
  })
  return container
}

function amountInput(c: HTMLElement) { return c.querySelector('input[type="number"]') as HTMLInputElement }
function reasonInput(c: HTMLElement) { return c.querySelector('textarea') as HTMLTextAreaElement }
function submitButton(c: HTMLElement) {
  const button = Array.from(c.querySelectorAll('button')).find((x) => /Confirm reversal/i.test(x.textContent ?? ''))
  if (!button) throw new Error('the footer submit button was never rendered')
  return button
}
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
}

beforeEach(() => {
  refundPaymentSpy.mockClear()
  auth.user = { id: 'USR-REAL', name: 'Tester', role: 'Manager', isSharedDevice: false }
})

describe('RefundPaymentModal', () => {
  it('opens empty and names the selected receipt amount', async () => {
    const c = await mount()
    expect(amountInput(c).value).toBe('')
    expect(c.textContent).toContain('Receipt amount: Rs 1,80,000')
  })

  it('refuses a single reversal larger than the original receipt', async () => {
    const c = await mount()
    await type(amountInput(c), '200000')
    await type(reasonInput(c), 'Client overpaid the final invoice')
    await act(async () => { submitButton(c).click() })
    expect(refundPaymentSpy).not.toHaveBeenCalled()
    expect(c.textContent).toContain('cannot be larger than the original payment')
  })

  it('dispatches the exact payment, typed amount and session actor', async () => {
    const c = await mount()
    await type(amountInput(c), '60000')
    await type(reasonInput(c), 'Shoot cancelled, partial return agreed')
    await act(async () => { submitButton(c).click() })

    expect(refundPaymentSpy).toHaveBeenCalledTimes(1)
    const [input, ctx] = (refundPaymentSpy.mock.calls[0] ?? []) as unknown as [Record<string, unknown>, Record<string, unknown>]
    expect(input).toMatchObject({
      paymentId: '11111111-1111-4111-8111-111111111111',
      amount: 60000,
      reason: 'Shoot cancelled, partial return agreed',
      clientUuid: 'modal-client-uuid',
    })
    expect(ctx).toEqual({ userId: 'USR-REAL', role: 'Manager' })
  })

  it('refuses outright with no session', async () => {
    auth.user = null
    const c = await mount()
    await type(amountInput(c), '60000')
    await type(reasonInput(c), 'Shoot cancelled, partial return agreed')
    await act(async () => { submitButton(c).click() })
    expect(refundPaymentSpy).not.toHaveBeenCalled()
    expect(c.textContent).toContain('not signed in')
  })
})
