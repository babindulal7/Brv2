// @vitest-environment jsdom
/**
 * R-39 D1/D3 — the Record Payment prefill contract.
 *
 * D1: an amount the caller can already know (the selected invoice's
 * outstanding balance) must open pre-filled; the field stops following the
 * invoice the moment the operator types into it. D3: for a Bank Transfer the
 * desk's primary account is preselected, again only until the operator
 * chooses otherwise (including choosing "No account recorded").
 *
 * Sibling of `RecordPaymentModal.test.tsx`, which pins the EMPTY-open case for
 * callers that cannot supply an outstanding figure. Both contracts hold.
 */
import { describe, it, expect, vi } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../../actions/finance/recordPayment', () => ({
  recordPayment: vi.fn(async () => ({ success: true, paymentId: 'PAY-0001' })),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-REAL', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

const PRIMARY_ID = 'aaaa0000-0000-4000-8000-000000000001'
const SECONDARY_ID = 'bbbb0000-0000-4000-8000-000000000002'
vi.mock('../../../lib/queries/bankAccounts', () => ({
  listBankAccounts: vi.fn(async () => [
    { id: SECONDARY_ID, bankName: 'Nabil', accountName: 'Operating', channelGroup: 'Bank', isPrimary: false },
    { id: PRIMARY_ID, bankName: 'NIC Asia', accountName: 'Main', channelGroup: 'Bank', isPrimary: true },
  ]),
}))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { RecordPaymentModal } = await import('../modals/RecordPaymentModal')

const INV_A = '11111111-1111-4111-8111-111111111111'
const INV_B = '22222222-2222-4222-8222-222222222222'
const INVOICES = [
  { id: INV_A, invoiceNo: 'INV-492', client: 'ABC Films', amount: 'Rs 1,39,506', status: 'Sent', outstandingRupees: 12_000 },
  { id: INV_B, invoiceNo: 'INV-511', client: 'Manaslu', amount: 'Rs 51,867', status: 'Sent', outstandingRupees: 5_500 },
]

async function mount(props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <RecordPaymentModal isOpen onClose={() => {}} onSuccess={() => {}} invoices={INVOICES} {...props} />
      </StrictMode>,
    )
  })
  return container
}
const amountInput = (c: HTMLElement) => c.querySelector('input[type="number"]') as HTMLInputElement
const invoiceSelect = (c: HTMLElement) => c.querySelector('select') as HTMLSelectElement
const accountSelect = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('select')).find((s) => s.getAttribute('aria-label') === 'Deposit to account') as HTMLSelectElement

async function changeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function typeAmount(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('RecordPaymentModal — outstanding prefill (R-39 D1)', () => {
  it('opens with the first invoice\'s outstanding already typed in', async () => {
    const c = await mount()
    expect(amountInput(c).value).toBe('12000')
    expect(c.textContent).toContain('Formatted: Rs 12,000')
  })

  it('opens with the `initialInvoiceId` invoice\'s outstanding, not the first row\'s', async () => {
    const c = await mount({ initialInvoiceId: INV_B })
    expect(amountInput(c).value).toBe('5500')
  })

  it('an untouched field follows the invoice switch; a typed one does not', async () => {
    const c = await mount()
    await changeSelect(invoiceSelect(c), INV_B)
    expect(amountInput(c).value).toBe('5500')
    await typeAmount(amountInput(c), '999')
    await changeSelect(invoiceSelect(c), INV_A)
    expect(amountInput(c).value).toBe('999')
  })

  it('a caller with no outstanding figure still opens empty (no change to that contract)', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const r = createRoot(root)
    await act(async () => {
      r.render(
        <StrictMode>
          <RecordPaymentModal
            isOpen
            onClose={() => {}}
            onSuccess={() => {}}
            invoices={INVOICES.map(({ outstandingRupees: _o, ...rest }) => rest)}
          />
        </StrictMode>,
      )
    })
    expect(amountInput(root).value).toBe('')
  })
})

describe('RecordPaymentModal — primary bank account default (R-39 D3)', () => {
  it('defaults to the primary account while the method is Bank Transfer', async () => {
    const c = await mount()
    await act(async () => {})
    expect(accountSelect(c).value).toBe(PRIMARY_ID)
  })

  it('a deliberate "No account recorded" is not overridden', async () => {
    const c = await mount()
    await act(async () => {})
    await changeSelect(accountSelect(c), '')
    expect(accountSelect(c).value).toBe('')
  })

  it('retracts the machine-applied default when the method moves off Bank Transfer, and re-applies on return', async () => {
    const c = await mount()
    await act(async () => {})
    // The method is a tap-card radio group (ChoiceCards), not a <select>.
    const methodCard = (v: string) => c.querySelector(`input[name="rpm-method"][value="${v}"]`) as HTMLInputElement
    await act(async () => { methodCard('Cash').click() })
    expect(accountSelect(c).value).toBe('')
    await act(async () => { methodCard('Bank Transfer').click() })
    expect(accountSelect(c).value).toBe(PRIMARY_ID)
  })
})

describe('RecordPaymentModal — invoice fetch failure honesty (sweep D6)', () => {
  it('states why the picker is empty and offers a retry', async () => {
    const retry = vi.fn()
    const c = await mount({ invoices: [], invoicesError: 'fetch failed', onRetryInvoices: retry })
    expect(c.textContent).toContain('fetch failed')
    const btn = Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Try again')!
    await act(async () => { btn.click() })
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
