// @vitest-environment jsdom
/**
 * PAN/VAT on Add Client — CL-10 and the Add Client half of CL-09.
 *
 * **CL-10.** `validate()` checked name, phone and email. The write then refused
 * a PAN that is not exactly nine digits — `clients_pan_vat_nine_digits`,
 * mirrored in `createClient.validate` — so a malformed one arrived as a
 * post-submit banner with nothing marking the field that caused it, after the
 * operator had filled the whole form. It is checked at the field now, with the
 * database's own rule and not a looser copy of it. The banner stays: these
 * assertions pin the inline check, and `createClient.test.ts` pins the backstop.
 *
 * **CL-09.** The "Ready to Book?" card claimed a missing PAN was "required
 * before a booking can be confirmed" while `ClientDetail` said a client without
 * one can still rent. Nothing in the code refuses a booking for a missing PAN,
 * so the claim is gone. The last test pins its absence, because a sentence like
 * that is re-added by anyone reading 0005's column comment on its own.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

const createClientSpy = vi.fn(async (_input: unknown) => ({
  clientId: '00000000-0000-0000-0000-0000000000c9',
  clientCode: 'CL-2026-0099',
  name: 'Himalayan Films Pvt. Ltd.',
  phone: '+9779801234567',
}))

vi.mock('../../../actions/clients/createClient', () => ({
  createClient: (input: unknown) => createClientSpy(input as never),
}))
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'usr-owner', name: 'Owner', role: 'Owner', isSharedDevice: false } }),
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: AddClient } = await import('../AddClient')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <MemoryRouter>
          <ToastProvider>
            <AddClient />
          </ToastProvider>
        </MemoryRouter>
      </StrictMode>,
    )
  })
}

function byPlaceholder(p: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[placeholder="${p}"]`)
  if (!el) throw new Error(`no input with placeholder ${p}`)
  return el
}

async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function clickSave() {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => /Save Client/i.test(b.textContent ?? ''))
  if (!btn) throw new Error('no Save Client button')
  await act(async () => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30))
  })
}

/** The minimum a save needs: name and phone (ruled 12 Aug 2026). */
async function fillRequired() {
  await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
  await type(byPlaceholder('9801234567'), '9801234567')
}

const pan = () => byPlaceholder('e.g. 600123456')
const text = () => container.textContent ?? ''

beforeEach(async () => {
  createClientSpy.mockClear()
  await mount()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('AddClient — the PAN rule is the database rule, at the field', () => {
  it('refuses a PAN that is not exactly nine digits, before anything is dispatched', async () => {
    await fillRequired()
    await type(pan(), '12345')
    await clickSave()

    expect(createClientSpy).not.toHaveBeenCalled()
    /* The full sentence, not the phrase: the field's standing `help` also says
       "exactly nine digits", so matching on that alone would pass with no
       error rendered at all. */
    expect(text()).toContain('PAN/VAT must be exactly nine digits.')
  })

  it('marks the field that caused it, not just the page', async () => {
    await fillRequired()
    await type(pan(), '60012345X')
    await clickSave()

    expect(createClientSpy).not.toHaveBeenCalled()
    // `inputStyle(true)` paints the danger border — the error is ON the field.
    expect(pan().getAttribute('style') ?? '').toContain('danger')
  })

  it('clears the error as soon as the field is corrected', async () => {
    await fillRequired()
    await type(pan(), '12345')
    await clickSave()
    expect(text()).toContain('PAN/VAT must be exactly nine digits.')

    await type(pan(), '600123456')
    expect(text()).not.toContain('PAN/VAT must be exactly nine digits.')
    // The standing rule comes back in the error's place, as `Field` intends.
    expect(text()).toContain('Optional. If given, exactly nine digits')
  })

  it('a blank PAN still saves — the CHECK is `pan_vat is null or …`', async () => {
    await fillRequired()
    await clickSave()

    expect(createClientSpy).toHaveBeenCalledTimes(1)
    expect((createClientSpy.mock.calls[0]![0] as Record<string, unknown>)['panVat']).toBe('')
  })

  it('a nine-digit PAN saves and reaches the action', async () => {
    await fillRequired()
    await type(pan(), '600123456')
    await clickSave()

    expect(createClientSpy).toHaveBeenCalledTimes(1)
    expect((createClientSpy.mock.calls[0]![0] as Record<string, unknown>)['panVat']).toBe('600123456')
  })

  /* CL-09. Nothing in `confirmRental.ts`, `createRental.ts` or any migration
     refuses a booking for a missing PAN, so the screen may not say one does. */
  it('no longer claims a PAN is required before a booking can be confirmed', () => {
    expect(text()).toContain('VAT / PAN')
    expect(text()).not.toContain('required before a booking can be confirmed')
  })
})
