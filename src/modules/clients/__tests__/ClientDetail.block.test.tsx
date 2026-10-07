// @vitest-environment jsdom
/**
 * Block / Unblock on Client Detail — CL-06.
 *
 * The control used to render disabled inside an `Unavailable` whose reason said
 * the capability `client.block` was unruled and therefore denied to every role.
 * Every clause of that had gone false: `blockClient.ts` is `implemented: true`,
 * `core.ts` resolves `client.block` through `rbac.canBlockClient`, and that rule
 * is Owner / Admin / Manager. `actions/clients/__tests__/blockClient.test.ts`
 * already pins the action and its role set; this pins the WIRING, which is a
 * property of the screen:
 *
 *  · the button is live for a role that holds the capability and inert for one
 *    that does not, so nobody presses a control the dispatcher would refuse;
 *  · the reason the action demands is collected BEFORE the dispatch rather than
 *    discovered afterwards as a thrown error;
 *  · the dispatch is awaited and reported from the resolved path only — the
 *    failure this file's history is full of is a green toast for a write that
 *    never left the browser;
 *  · a rejection is inline and persistent, and leaves the dialog holding the
 *    typed reason (Law 12).
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import { CLIENTS_DATA } from '../../../data/clients'

/**
 * The session and the record's block state, both swapped per test.
 *
 * Held in `vi.hoisted` boxes rather than re-mocking per test: the capability
 * gate and the direction of the verb are exactly what varies here, and
 * `vi.resetModules()` between them would re-evaluate the screen for no gain.
 */
const session = vi.hoisted(() => ({ role: 'Owner' as string, blocked: false }))

const blockSpy = vi.hoisted(() => ({
  fn: vi.fn(async (_input: unknown, _ctx: unknown): Promise<Record<string, unknown>> => ({
    clientId: 'uuid-1',
    clientCode: 'CL-2026-0001',
    clientName: 'Himalayan Films Pvt. Ltd.',
    blocked: true,
    flagId: 'flag-1',
  })),
}))

const EMPTY_LIST = {
  rows: [] as never[],
  loading: false,
  error: null,
  isEmpty: true,
  isFiltered: false,
  total: 0,
  refetch: () => {},
}

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: session.role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))
vi.mock('../../../lib/queries/useClients', async () => {
  const { CLIENTS_DATA: DATA } = await import('../../../data/clients')
  return {
    useClientProfile: () => ({
      ...EMPTY_LIST,
      rows: [{ id: 'uuid-fixture', record: { ...DATA[0]!, isBlocked: session.blocked }, deactivatedAtAd: null }],
      isEmpty: false,
      total: 1,
    }),
  }
})
vi.mock('../../../lib/queries/useList', () => ({ useList: () => EMPTY_LIST }))
vi.mock('../../../lib/supabase', () => ({ supabase: {}, newClientUuid: () => 'key-one-press' }))
vi.mock('../../../actions/clients/blockClient', () => ({
  blockClient: (input: unknown, ctx: unknown) => blockSpy.fn(input, ctx),
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

const { default: ClientDetail } = await import('../ClientDetail')

const CODE = CLIENTS_DATA[0]!.id

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/clients/${CODE}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/clients/:id" element={<ClientDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
  await click(container.querySelector('button[aria-label="More actions"]'))
}

// Overflow menus and dialogs portal to <body> (shell clearance, 7 Oct 2026).
const dialog = () => document.body.querySelector('[role="dialog"]')

/** Buttons matched by visible text — the handle an operator has. */
function buttons(label: string, scope: ParentNode = document.body): HTMLButtonElement[] {
  return [...scope.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label)
}

async function click(el: Element | undefined | null) {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

async function typeReason(value: string) {
  const el = dialog()?.querySelector('textarea')
  if (!el) throw new Error('no reason textarea in the dialog')
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value)
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const text = () => container.textContent ?? ''

beforeEach(() => {
  session.role = 'Owner'
  session.blocked = false
  blockSpy.fn.mockClear()
  blockSpy.fn.mockImplementation(async () => ({
    clientId: 'uuid-1',
    clientCode: 'CL-2026-0001',
    clientName: 'Himalayan Films Pvt. Ltd.',
    blocked: true,
    flagId: 'flag-1',
  }))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('ClientDetail — Block / Unblock is wired to the action', () => {
  it('offers a live Block Client button to a role that holds the capability', async () => {
    await mount()
    const btn = buttons('Block Client')[0]
    expect(btn).toBeDefined()
    expect(btn!.disabled).toBe(false)
    // The stale reason went with the disabled button that carried it.
    expect(text()).not.toContain('not yet reachable')
    expect(text()).not.toContain('is unruled')
  })

  it('a role without the capability is not offered the destructive action', async () => {
    session.role = 'Coordinator'
    await mount()
    const btn = buttons('Block Client')[0]
    expect(btn).toBeUndefined()
    await click(btn)
    expect(blockSpy.fn).not.toHaveBeenCalled()
  })

  it('collects the reason the action demands before it dispatches anything', async () => {
    await mount()
    await click(buttons('Block Client')[0])
    expect(dialog()).not.toBeNull()

    expect(buttons('Block Client', dialog()!)[0]!.disabled).toBe(true)
    await typeReason('too short')
    expect(buttons('Block Client', dialog()!)[0]!.disabled).toBe(true)
    await click(buttons('Block Client', dialog()!)[0])
    expect(blockSpy.fn).not.toHaveBeenCalled()
  })

  it('dispatches the client CODE, the direction, the reason and one idempotency key', async () => {
    await mount()
    await click(buttons('Block Client')[0])
    await typeReason('Repeated unreturned equipment')
    await click(buttons('Block Client', dialog()!)[0])

    expect(blockSpy.fn).toHaveBeenCalledTimes(1)
    const input = blockSpy.fn.mock.calls[0]![0] as Record<string, unknown>
    const ctx = blockSpy.fn.mock.calls[0]![1] as Record<string, unknown>
    // `ClientRecord.id` IS `client_code`, and `BlockClientInput.clientCode`
    // takes the code and resolves the uuid itself.
    expect(input['clientCode']).toBe(CODE)
    expect(input['blocked']).toBe(true)
    expect(input['reason']).toBe('Repeated unreturned equipment')
    expect(input['clientUuid']).toBe('key-one-press')
    expect(ctx['role']).toBe('Owner')
    expect(ctx['userId']).toBe('u-1')
  })

  it('a rejection is inline and persistent, and the dialog keeps the typed reason', async () => {
    blockSpy.fn.mockImplementation(async () => {
      throw new Error('This device is offline. A block is not queued for later')
    })
    await mount()
    await click(buttons('Block Client')[0])
    await typeReason('Repeated unreturned equipment')
    await click(buttons('Block Client', dialog()!)[0])

    expect(text()).toContain('A block is not queued for later')
    expect(dialog()).not.toBeNull()
    expect(dialog()!.querySelector('textarea')!.value).toBe('Repeated unreturned equipment')
  })

  it('a blocked client is offered Unblock, and an unblock needs no reason', async () => {
    session.blocked = true
    blockSpy.fn.mockImplementation(async () => ({
      clientId: 'uuid-1',
      clientCode: 'CL-2026-0001',
      clientName: 'Himalayan Films Pvt. Ltd.',
      blocked: false,
      flagId: 'flag-1',
    }))
    await mount()

    await click(buttons('Unblock Client')[0])
    const confirm = buttons('Unblock Client', dialog()!)[0]
    expect(confirm).toBeDefined()
    // No ten-character floor on the way out: `blockClientConfig.validate` only
    // requires a reason when `blocked` is true.
    expect(confirm!.disabled).toBe(false)
    await click(confirm)
    expect(blockSpy.fn).toHaveBeenCalledTimes(1)
    expect((blockSpy.fn.mock.calls[0]![0] as Record<string, unknown>)['blocked']).toBe(false)
  })
})
