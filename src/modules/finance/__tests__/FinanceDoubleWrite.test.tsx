// @vitest-environment jsdom
/**
 * One click, one payment write.
 *
 * Provenance: written as `FinanceDoubleWrite.tmp.test.tsx`, a self-declared
 * throwaway harness, and deleted during the 12 Aug identifier rename. Restored
 * here unweakened — same assertions, same expected values.
 *
 * The defect it pins is a *duplicate* dispatch that used to live in
 * `handleRecordPaymentSuccess`: the modal called `recordPayment`, then the
 * page's success handler called it a second time with no `ActionContext` at
 * all. Payments are immutable (PLAN.md §0), so a double write is not a cosmetic
 * bug — it is a second irreversible row. Counting the calls is the only way to
 * see it; the screen looks identical either way.
 */
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

/*
 * ADDED 12 Aug 2026, when `Finance.tsx` stopped holding its invoices in a
 * module-scope array and started reading `invoices` through
 * `lib/queries/finance.ts`. **No assertion below changed** — the invoice the
 * page hands the modal is still `INV-492` / `B-715` / Rs 1,39,506, and the three
 * expectations are the same three.
 *
 * The stub is not a convenience: without it the page reaches the live project
 * over the network mid-test (a second per render, and a different answer on a
 * machine with no `.env.local`), and the operational tables are empty — so the
 * invoice `<select>` would be empty, `invoiceId` would be `''`, and the modal's
 * own "Please select an invoice" guard would stop the dispatch this file
 * exists to count. A test that cannot reach the click cannot see the defect.
 *
 * `lib/supabase` is replaced wholesale, the same boundary
 * `lib/queries/__tests__/finance.test.ts` and `bookings.test.ts` mock at.
 */
const db = vi.hoisted(() => {
  const tables = new Map<string, { rows: unknown[]; count: number | null }>()

  /** A recording stand-in for the postgrest builder. Thenable — the query modules `await query`. */
  function builderFor(table: string) {
    const pass = () => builder
    const builder = {
      select: pass,
      or: pass,
      in: pass,
      gte: pass,
      lte: pass,
      is: pass,
      not: pass,
      order: pass,
      range: pass,
      then(onFulfilled: (value: { data: unknown[]; error: null; count: number | null }) => unknown): void {
        const held = tables.get(table) ?? { rows: [], count: 0 }
        onFulfilled({ data: held.rows, error: null, count: held.count })
      },
    }
    return builder
  }

  return {
    tables,
    supabase: { from: (table: string) => builderFor(table) },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

/** One `invoices` row, shaped as PostgREST returns it — the same invoice the seed array used to hold. */
db.tables.set('invoices', {
  rows: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      invoice_no: 'INV-492',
      booking_id: '22222222-2222-4222-8222-222222222222',
      client_id: '33333333-3333-4333-8333-333333333333',
      status: 'Sent',
      issue_date: '2026-07-26',
      due_date: '2026-08-02',
      currency: 'NPR',
      subtotal: 123456.64,
      discount_amount: 0,
      discount_percent: 0,
      taxable_amount: 123456.64,
      vat_rate: 0.13,
      vat_amount: 16049.36,
      total_amount: 139506,
      paid_amount: 0,
      outstanding_amount: 139506,
      voided_at: null,
      void_reason: null,
      credit_note_no: null,
      notes: null,
      created_at: '2026-07-26T00:00:00.000Z',
      clients: { name: 'ABC Films Pvt. Ltd.' },
      bookings: { booking_no: 'B-715' },
    },
  ],
  count: 1,
})
db.tables.set('payments', { rows: [], count: 0 })

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
    const submit = buttons[buttons.length - 1]
    if (!submit) throw new Error('the modal footer submit button was never rendered')
    await act(async () => { submit.click() })

    expect(recordPaymentSpy).toHaveBeenCalledTimes(1)
    const [input0, ctx0] = recordPaymentSpy.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(input0.amountPaisa).toBe(150000)
    // The duplicate dispatch that used to live in handleRecordPaymentSuccess
    // passed NO context; if any call has an undefined ctx, it is back.
    //
    // `isOnline` joined the context on 12 Aug 2026, when `recordPayment` became
    // a real INSERT: `lib/rbac`'s money rules refuse a payment offline, and
    // `actions/core.ts` reads `ctx.isOnline ?? true`, so a modal that omitted
    // the flag would be treated as online while `dataAccess` queued the write.
    // Still `toEqual`, so an extra or missing key still fails.
    expect(ctx0).toEqual({ userId: 'USR-REAL', role: 'Owner', isOnline: true })
    for (const call of recordPaymentSpy.mock.calls) expect(call[1]).toBeDefined()
  })
})
