// @vitest-environment jsdom
/**
 * The one test that drives a screen rather than an engine.
 *
 * It exists because `AddClient.tsx` is `// @ts-nocheck`: `tsc --noEmit` will not
 * tell you that its `lib/phone` import path is wrong, that a helper it calls no
 * longer exists, or that the phone rule regressed. `lib/__tests__/phone.test.ts`
 * covers the rule itself; this covers the wiring — that the rule is actually
 * reached, reported beside the field, and applied to what gets saved.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node` and
 * documents this opt-in. Delete when `AddClient.tsx` loses its `@ts-nocheck`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import { PHONE_REJECTION, PHONE_STORED_RE } from '../../../lib/phone'

// The parameter is declared even though the fake ignores it: `vi.fn(async () => …)`
// infers a ZERO-argument mock, which makes both `createClientSpy(input)` below and
// `.mock.calls[0][0]` (the whole point of this spy — asserting the phone that was
// actually submitted) type errors. Typing the arg keeps the assertion intact.
const createClientSpy = vi.fn(async (_input: unknown) => ({
  clientId: '00000000-0000-0000-0000-0000000000c1',
  clientCode: 'CL-2026-0001',
  name: 'Himalayan Films Pvt. Ltd.',
  phone: '+9779801234567',
}))

vi.mock('../../../actions/clients/createClient', () => ({
  createClient: (input: unknown) => createClientSpy(input as never),
}))
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
/* `AddClient` now builds a real `ActionContext` from the session — the dispatcher
   substitutes no default identity (`actions/core.ts:136-141`), so a screen that
   dispatches has to know who is signed in. `useAuth` throws outside an
   `AuthProvider`, so it is mocked here the same way fifteen other screen tests in
   this repo already mock it. */
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'usr-owner', name: 'Owner', role: 'Owner', isSharedDevice: false } }),
}))

// jsdom ships no matchMedia; lib/device asks for it on mount.
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

/** Fills every other required field so the phone rule is the only thing under test. */
async function fillTheRest() {
  await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
  await type(byPlaceholder('Full name of main contact'), 'Anjali Rai')
  await type(byPlaceholder('Street, Building, Area'), 'Jhamsikhel, Lalitpur')
  await type(byPlaceholder('e.g. Kathmandu'), 'Kathmandu')
}

const text = () => container.textContent ?? ''
const savedPhone = () => (createClientSpy.mock.calls[0]![0] as unknown as { phone: string }).phone

beforeEach(async () => {
  createClientSpy.mockClear()
  await mount()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('AddClient — the phone rule reaches the screen', () => {
  it('states the rule in help text before anything is typed', () => {
    expect(text()).toContain('Nepali mobile — 10 digits starting')
    expect(text()).toContain('9801234567')
  })

  it.each(['9601234567', '9501234567', '9901234567', '9001234567'])(
    'rejects %s — a 10-digit 9-number the old regex let through',
    async (bad) => {
      await fillTheRest()
      await type(byPlaceholder('9801234567'), bad)
      await clickSave()
      expect(text()).toContain(PHONE_REJECTION)
      expect(createClientSpy).not.toHaveBeenCalled()
    },
  )

  it.each(['0981234567', '981234567', '98012345678', '014412345'])(
    'rejects %s rather than reshaping it',
    async (bad) => {
      await fillTheRest()
      await type(byPlaceholder('9801234567'), bad)
      await clickSave()
      expect(text()).toContain(PHONE_REJECTION)
      expect(createClientSpy).not.toHaveBeenCalled()
    },
  )

  it.each(['9801234567', '9741234567'])('accepts %s and saves it with the +977 prefix', async (good) => {
    await fillTheRest()
    await type(byPlaceholder('9801234567'), good)
    expect(text()).toContain(`Saved as +977${good}`)
    await clickSave()
    expect(text()).not.toContain(PHONE_REJECTION)
    expect(createClientSpy).toHaveBeenCalledTimes(1)
    expect(savedPhone()).toBe(`+977${good}`)
    expect(savedPhone()).toMatch(PHONE_STORED_RE)
  })

  it('strips pasted formatting and a duplicated country code without changing the digits', async () => {
    await fillTheRest()
    await type(byPlaceholder('9801234567'), '+977 980-123 4567')
    expect(text()).toContain('Saved as +9779801234567')
    await clickSave()
    expect(savedPhone()).toBe('+9779801234567')
  })

  it('holds the rule even when the address country is not Nepal', async () => {
    await fillTheRest()
    const country = Array.from(container.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === 'India'),
    )
    if (!country) throw new Error('no country select')
    await act(async () => {
      country.value = 'India'
      country.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await type(byPlaceholder('9801234567'), '9601234567')
    await clickSave()
    expect(text()).toContain(PHONE_REJECTION)
    expect(createClientSpy).not.toHaveBeenCalled()
  })
})
