// @vitest-environment jsdom
/**
 * The required set on Add Client, driven through the screen.
 *
 * Ruling, 12 Aug 2026: **name and phone**. Contact person, address and city
 * used to gate Save and no longer do — the point of the change is that a
 * correction stops having to be a re-creation, and the only way to know the
 * gate is actually gone is to press Save without them.
 *
 * `AddClient.phone.test.tsx` covers the rule that stayed. This covers the three
 * that went, and pins the two that remain so "optional" does not quietly become
 * "everything optional".
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
/* See the note in `AddClient.phone.test.tsx`: the screen builds a real
   `ActionContext` now, and `useAuth` throws outside an `AuthProvider`. */
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

const text = () => container.textContent ?? ''

beforeEach(async () => {
  createClientSpy.mockClear()
  await mount()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('AddClient — the required set is name and phone', () => {
  it('saves with no contact person, no address and no city', async () => {
    await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
    await type(byPlaceholder('9801234567'), '9801234567')
    await clickSave()

    expect(createClientSpy).toHaveBeenCalledTimes(1)
    expect(text()).not.toContain('Address is required')
    expect(text()).not.toContain('City is required')
    expect(text()).not.toContain('Contact Person is required')
  })

  it('still refuses a missing phone, and says why it is the one that stayed', async () => {
    await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
    await clickSave()

    expect(createClientSpy).not.toHaveBeenCalled()
    expect(text()).toContain('duplicate detection and the merge tool match on it')
  })

  it('still refuses a missing name', async () => {
    await type(byPlaceholder('9801234567'), '9801234567')
    await clickSave()

    expect(createClientSpy).not.toHaveBeenCalled()
    expect(text()).toMatch(/Name is required/)
  })

  it('optional does not mean unvalidated — a present-but-malformed phone is still refused', async () => {
    await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
    await type(byPlaceholder('9801234567'), '981234567')
    await clickSave()

    expect(createClientSpy).not.toHaveBeenCalled()
  })

  it('drops the required asterisk from every field that stopped blocking', () => {
    /* The label carries the promise. A field that no longer gates Save but still
       shows `*` is the same lie in the other direction. */
    const labels = [...container.querySelectorAll('label, span')]
      .map((el) => el.textContent ?? '')
      .filter((t) => /^(Contact Person|Address|City|Country)\s*\*?$/.test(t.trim()))
    expect(labels.length).toBeGreaterThan(0)
    for (const l of labels) expect(l).not.toContain('*')
  })

  /* Ruled 12 Aug 2026, closing PLAN.md §4.25. The whole address block is
     fill-in-later; the earlier incoherence — a client saveable with a country
     but no city — is gone because the last gate went with it. */
  it('saves with no country either — the whole address block is fill-in-later', async () => {
    await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
    await type(byPlaceholder('9801234567'), '9801234567')
    const countryInput = container.querySelector<HTMLInputElement>('input[value="Nepal"]')
    if (countryInput) await type(countryInput, '')
    await clickSave()

    expect(createClientSpy).toHaveBeenCalledTimes(1)
    expect(text()).not.toContain('Country is required')
  })
})
