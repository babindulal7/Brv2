// @vitest-environment jsdom
/**
 * Item 2.6c — the Law 8 idempotency key is keyed on the CLIENT, not the mount.
 *
 * The failure this pins (audit: docs/pages/05 §7 / AddClient.tsx:405,
 * dataAccess.ts:112-120): the old `saveKey` was minted once per page load and
 * never again. After a FAILED save, an operator who corrected the form into a
 * genuinely different client (another name, another phone) replayed the first
 * client's key — `idempotentInsert` reads the 23505 on `client_uuid` as
 * "already saved" and silently hands back the FIRST client. The second client
 * is never created and nobody is told.
 *
 * Ruled behaviour, asserted here through the real screen:
 *   - a pure retry of the SAME client replays the SAME key (Law 8);
 *   - an edit to an identity field (name/phone/email) mints a FRESH key;
 *   - an edit to a non-identity field (city, notes) keeps the key — a typo
 *     in the address is still the same client.
 *
 * Harness copied from `AddClient.phone.test.tsx`, the in-repo precedent for
 * driving this screen. `createClient` is mocked to REJECT, because every
 * observation here is about what a retry after failure sends.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

const createClientSpy = vi.fn(async (_input: unknown): Promise<never> => {
  throw new Error('network wobble — nothing was saved')
})

vi.mock('../../../actions/clients/createClient', () => ({
  createClient: (input: unknown) => createClientSpy(input as never),
}))
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'usr-owner', name: 'Owner', role: 'Owner', isSharedDevice: false } }),
}))
/* The debounced duplicate check must not reach a real query layer from a test
   that deliberately waits between saves. */
vi.mock('../../../lib/queries/clients', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/clients')>()
  return {
    ...actual,
    findClientsByPhoneTail: vi.fn(async () => []),
  }
})

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

const sentKey = (call: number): string =>
  (createClientSpy.mock.calls[call]![0] as unknown as { clientUuid: string }).clientUuid

beforeEach(async () => {
  createClientSpy.mockClear()
  await mount()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('AddClient — the Law 8 key follows the client identity', () => {
  it('a pure retry after a failed save replays the SAME key', async () => {
    await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
    await type(byPlaceholder('9801234567'), '9801234567')
    await clickSave()
    await clickSave()
    expect(createClientSpy).toHaveBeenCalledTimes(2)
    expect(sentKey(0)).toMatch(/^[0-9a-f-]{36}$/)
    expect(sentKey(1)).toBe(sentKey(0))
  })

  it('editing the form into a DIFFERENT client after a failure mints a FRESH key', async () => {
    await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
    await type(byPlaceholder('9801234567'), '9801234567')
    await clickSave()

    // The operator realises they typed the wrong client entirely.
    await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Everest Media House')
    await type(byPlaceholder('9801234567'), '9741112223')
    await clickSave()

    expect(createClientSpy).toHaveBeenCalledTimes(2)
    expect(sentKey(1)).not.toBe(sentKey(0))
  })

  it('a phone correction ALONE is a different client — phone is the unique identifier', async () => {
    await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
    await type(byPlaceholder('9801234567'), '9801234567')
    await clickSave()

    await type(byPlaceholder('9801234567'), '9809999999')
    await clickSave()

    expect(sentKey(1)).not.toBe(sentKey(0))
  })

  it('a NON-identity edit (city) keeps the key — same client, corrected detail', async () => {
    await type(byPlaceholder('e.g. Himalayan Films Pvt. Ltd.'), 'Himalayan Films Pvt. Ltd.')
    await type(byPlaceholder('9801234567'), '9801234567')
    await clickSave()

    await type(byPlaceholder('e.g. Kathmandu'), 'Lalitpur')
    await clickSave()

    expect(createClientSpy).toHaveBeenCalledTimes(2)
    expect(sentKey(1)).toBe(sentKey(0))
  })
})
