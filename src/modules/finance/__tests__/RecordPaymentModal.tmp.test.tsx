// @vitest-environment jsdom
/** TEMPORARY verification harness — delete after running. */
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
  { id: 'INV-2026-0492', client: 'ABC Films Pvt. Ltd.', amount: 'Rs 1,39,506', status: 'Sent', booking: 'BK-2026-0715' },
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
    expect(input.bookingId).toBe('BK-2026-0715')
    expect(ctx).toEqual({ userId: 'USR-REAL', role: 'Owner' })
    expect((seen[0] as Record<string, unknown>).amountPaisa).toBe(150000)
  })
})
