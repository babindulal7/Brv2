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
 * ── Why the assertions below changed shape ────────────────────────────────
 *
 * The first version of this file asserted that the modal mints a *well-shaped*
 * number: prefix from the registry, no year, no padding. That was the right
 * assertion against the code as it then stood, and it is the wrong assertion
 * now, because `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` §B2 retired the
 * minting itself rather than correcting its format:
 *
 * > *"Mints `INV-2026-${…}` client-side. Two invoices can collide. The operator
 * > sends that number to a client for payment reference; nothing in the system
 * > will ever match it."*
 *
 * Numbering belongs to `next_document_number('invoice')`, which takes a row
 * lock — the only thing that makes two concurrent invoices safe — and whose
 * seeded counter (0 in `0012_seed_data.sql:24`) does not agree with the 492 on
 * the Settings ▸ Numbering render anyway. A client-side prediction here is not
 * merely risky, it is known wrong, so the modal now refuses inline and issues
 * nothing. `Finance.tsx` was updated in the same pass and says so at
 * `handleCreateInvoiceSuccess`: *"`CreateInvoiceModal` no longer calls
 * `onSuccess`."* This file was not, and asserted the retired behaviour until
 * now.
 *
 * **"No number is minted" is a strictly stronger guarantee than "the minted
 * number is well-shaped"**, so the protective intent is kept, not weakened: the
 * original defect — a fabricated identifier reaching an operator — is asserted
 * against directly, at the DOM and at the `onSuccess` seam. The registry-shape
 * assertions are kept too, against `data/numbering.ts`, because the ruling that
 * fixed the format still governs the number the database will eventually hand
 * back, and it deserves a guard whether or not this screen is the one issuing.
 */
import { describe, it, expect, vi } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { issue, prefixOf, sequence, formatHas } from '../../../data/numbering'

vi.mock('../../../events/eventBus', () => ({
  DomainEvents: { emit: async () => {} },
  EVENT_TYPES: { INVOICE_CREATED: 'invoice.created' },
}))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { CreateInvoiceModal } = await import('../modals/CreateInvoiceModal')

interface Created { id: string }

interface Attempt {
  /** Every invoice handed to `onSuccess`. The ruling says this stays empty. */
  created: Created[]
  /** How many times the modal asked to be closed. The ruling says zero. */
  closeCalls: number
  container: HTMLDivElement
  clientInput: HTMLInputElement
}

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Fills every required field and presses `Issue Invoice`, then reports what
 * crossed the modal's boundary. Deliberately makes no claim about success — the
 * point of each test below is what did *not* happen.
 *
 * ── Why this fills five fields where it used to fill one ───────────────────
 *
 * It filled only the client, and its comment said so: *"Client is the only
 * required field; the two seeded lines carry the total, so this is a submission
 * that would have succeeded under the old code."* Those two seeded lines were
 * `Camera Package Rental / 150000` and `Grip & Lighting Gear / 35000` — Rs
 * 1,85,000 of billing nobody entered, pre-typed onto the form, and this harness
 * was leaning on them to get past the total guard.
 *
 * They are gone (an invented figure on a money form, the same class as the Rs
 * 50,000 refund default), and `booking`/`dueDate` no longer open holding
 * `B-720` and `15 Aug 2026` either. So the caller now supplies the invoice
 * instead of inheriting it, which is what an operator does.
 *
 * **No assertion below is relaxed by this.** Every one of them is about what the
 * modal does with a submission it considers complete, so a harness that stopped
 * at an earlier validation error would be asserting nothing at all — it would
 * pass on "no number was issued" for the trivial reason that nothing was
 * submitted. Filling the form is what keeps these tests honest.
 */
async function attemptSubmit(): Promise<Attempt> {
  const created: Created[] = []
  let closeCalls = 0
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <CreateInvoiceModal
          isOpen
          onClose={() => { closeCalls += 1 }}
          onSuccess={((inv: Created) => created.push(inv)) as never}
        />
      </StrictMode>,
    )
  })

  const clientInput = container.querySelector(
    'input[placeholder^="e.g. Manaslu"]',
  ) as HTMLInputElement
  const bookingInput = container.querySelector(
    'input[placeholder="Booking number"]',
  ) as HTMLInputElement
  const dueInput = container.querySelector('input[placeholder="dd Mmm yyyy"]') as HTMLInputElement
  // The single blank line item the form now opens with — description and
  // amount. There is exactly one `type="number"` box on this form.
  const lineDesc = container.querySelector(
    'input[placeholder="Item #1 Description"]',
  ) as HTMLInputElement
  const lineAmount = container.querySelector('input[type="number"]') as HTMLInputElement
  for (const el of [clientInput, bookingInput, dueInput, lineDesc, lineAmount]) {
    expect(el).toBeTruthy()
  }
  await act(async () => {
    setValue(clientInput, 'Test Client')
    setValue(bookingInput, 'B-715')
    setValue(dueInput, '15 Aug 2026')
    setValue(lineDesc, 'Two-day camera hire')
    setValue(lineAmount, '1000')
  })

  const submit = Array.from(container.querySelectorAll('button')).find((b) =>
    /Issue Invoice/.test(b.textContent ?? ''),
  )
  expect(submit).toBeTruthy()
  await act(async () => { submit!.click() })

  return { created, closeCalls, container, clientInput }
}

/** Mounts the modal untouched, for the assertions about how it OPENS. */
async function renderFresh() {
  const created: Created[] = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <CreateInvoiceModal
          isOpen
          onClose={() => {}}
          onSuccess={((inv: Created) => created.push(inv)) as never}
        />
      </StrictMode>,
    )
  })
  const q = (sel: string) => container.querySelector(sel) as HTMLInputElement
  return {
    created,
    container,
    client: q('input[placeholder^="e.g. Manaslu"]'),
    booking: q('input[placeholder="Booking number"]'),
    due: q('input[placeholder="dd Mmm yyyy"]'),
    lineDesc: q('input[placeholder="Item #1 Description"]'),
    lineAmount: q('input[type="number"]'),
    submit: () =>
      Array.from(container.querySelectorAll('button')).find((b) =>
        /Issue Invoice/.test(b.textContent ?? ''),
      )!,
  }
}

/**
 * The invented line items — the second half of the same defect this file was
 * opened for.
 *
 * The modal stopped minting an invoice NUMBER but went on opening with
 * `Camera Package Rental / 150000` and `Grip & Lighting Gear / 35000` already
 * typed in, and the totals panel rendered the VAT-inclusive Rs 2,09,050 the
 * instant it opened. An operator who filled in the client and pressed
 * `Issue Invoice` was issuing Rs 1,85,000 of line items nobody entered — the
 * same class as the Rs 50,000 refund default and the Rs 5,000 payment.
 *
 * Like the empty amount field in `RecordPaymentModal.test.tsx`, the fix is
 * invisible: nothing on screen says "this used to be pre-filled", so only a
 * test can hold it down.
 */
describe('CreateInvoiceModal — it opens holding no figures of its own', () => {
  it('opens with every field empty — no descriptions, no amounts, no booking, no due date', async () => {
    const f = await renderFresh()
    expect(f.client.value).toBe('')
    expect(f.booking.value).toBe('')
    expect(f.due.value).toBe('')
    expect(f.lineDesc.value).toBe('')
    // `value={line.amount || ''}` — 0 renders as an empty box, not a typed "0".
    expect(f.lineAmount.value).toBe('')
  })

  it('shows none of the retired placeholder figures anywhere on screen', async () => {
    const { container } = await renderFresh()
    const text = container.textContent ?? ''
    expect(text).not.toContain('Camera Package Rental')
    expect(text).not.toContain('Grip & Lighting')
    expect(text).not.toContain('1,85,000') // the seeded subtotal
    expect(text).not.toContain('2,09,050') // and with VAT, as the panel rendered it
    expect(container.querySelector('input[placeholder="Booking number"]')).toBeTruthy()
    expect(text).not.toContain('B-720')
    expect(text).not.toContain('15 Aug 2026')
  })

  it('totals an empty form at zero, which is the honest figure for no line items', async () => {
    const { container } = await renderFresh()
    expect(container.textContent).toContain('Rs 0')
  })

  it('refuses to submit while a line item is incomplete, and names the line', async () => {
    const f = await renderFresh()
    await act(async () => {
      setValue(f.client, 'Test Client')
      setValue(f.booking, 'B-715')
      setValue(f.due, '15 Aug 2026')
    })
    await act(async () => { f.submit().click() })
    expect(f.created).toEqual([])
    expect(f.container.textContent).toContain('Line 1 is incomplete')
  })

  it('refuses a described line carrying no amount — a line the total would silently ignore', async () => {
    const f = await renderFresh()
    await act(async () => {
      setValue(f.client, 'Test Client')
      setValue(f.booking, 'B-715')
      setValue(f.due, '15 Aug 2026')
      setValue(f.lineDesc, 'Two-day camera hire')
    })
    await act(async () => { f.submit().click() })
    expect(f.created).toEqual([])
    expect(f.container.textContent).toContain('Line 1 is incomplete')
  })

  it('refuses an amount carrying no description — an unexplained charge on a client’s bill', async () => {
    const f = await renderFresh()
    await act(async () => {
      setValue(f.client, 'Test Client')
      setValue(f.booking, 'B-715')
      setValue(f.due, '15 Aug 2026')
      setValue(f.lineAmount, '1000')
    })
    await act(async () => { f.submit().click() })
    expect(f.created).toEqual([])
    expect(f.container.textContent).toContain('Line 1 is incomplete')
  })

  /*
   * Deliberately NOT tested here: the `NaN` coercion `handleLineChange` now
   * does. `Number('1.2.3')` is `NaN` and `NaN <= 0` is `false`, so a non-finite
   * amount used to render "Rs NaN" in the totals panel and slip past the
   * "total must be greater than 0" guard — a real defect, fixed in the modal.
   * But jsdom applies the HTML value-sanitization algorithm to
   * `input[type=number]`, so an invalid string assigned here becomes `''`
   * before React ever sees it, and the test would pass whether or not the
   * coercion existed. A test that cannot fail is worse than none, so the
   * guarantee is stated in `CreateInvoiceModal.tsx` and left unasserted rather
   * than asserted falsely.
   */
})

describe('CreateInvoiceModal — it issues no number, because it writes no invoice', () => {
  it('hands nothing back: onSuccess never fires for an invoice that was not written', async () => {
    const { created } = await attemptSubmit()
    expect(created).toEqual([])
  })

  it('keeps the modal open with the operator’s figures intact', async () => {
    // The register's complaint was that the modal closed on a write that never
    // happened. Staying open with the form populated is what lets the operator
    // copy out or correct what they typed.
    const { closeCalls, clientInput } = await attemptSubmit()
    expect(closeCalls).toBe(0)
    expect(clientInput.value).toBe('Test Client')
  })

  it('discloses inline that nothing was saved', async () => {
    const { container } = await attemptSubmit()
    const text = container.textContent ?? ''
    expect(text).toContain('nothing was saved')
    expect(text).toContain('No invoice number was issued')
  })

  it('puts no invoice identifier on screen — not even a well-shaped one', async () => {
    // The exact defect this file was opened for: a fabricated identifier that
    // looks like an identifier. Asserted against the rendered DOM, which is the
    // only surface an operator could copy a number off.
    const { container } = await attemptSubmit()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/INV-\d/)
    expect(text).not.toMatch(/INV-20\d{2}-/)
    expect(text).not.toContain('2026-')
    // What it says instead.
    expect(text).toContain('Assigned by the database on save')
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
