// @vitest-environment jsdom
/** TEMPORARY verification harness — delete after running. */
import { describe, it, expect, vi } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

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

const { default: Finance } = await import('../Finance')

function byText(c: HTMLElement, re: RegExp) {
  return Array.from(c.querySelectorAll('button')).find((b) => re.test(b.textContent ?? ''))
}

describe('Finance — one click, one payment write', () => {
  it('dispatches recordPayment exactly once per recorded payment', async () => {
    recordPaymentSpy.mockClear()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <StrictMode>
          <MemoryRouter>
            <Finance />
          </MemoryRouter>
        </StrictMode>,
      )
    })

    // Open the modal from the page header's "Record Payment" button.
    await act(async () => { byText(container, /^Record Payment$/)!.click() })

    const input = container.querySelector('input[type="number"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('')

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, '1500')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // The modal's footer submit (the last matching button in the DOM).
    const buttons = Array.from(container.querySelectorAll('button')).filter((b) => /Record Payment/.test(b.textContent ?? ''))
    await act(async () => { buttons[buttons.length - 1].click() })

    expect(recordPaymentSpy).toHaveBeenCalledTimes(1)
    const [input0, ctx0] = recordPaymentSpy.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(input0.amountPaisa).toBe(150000)
    // The duplicate dispatch that used to live in handleRecordPaymentSuccess
    // passed NO context; if any call has an undefined ctx, it is back.
    expect(ctx0).toEqual({ userId: 'USR-REAL', role: 'Owner' })
    for (const call of recordPaymentSpy.mock.calls) expect(call[1]).toBeDefined()
  })
})
