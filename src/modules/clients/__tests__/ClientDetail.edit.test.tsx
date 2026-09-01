// @vitest-environment jsdom
/**
 * Inline edit, driven through the screen rather than through the hook.
 *
 * `lib/edit/__tests__/useEditMode.test.tsx` already pins the state machine. This
 * pins the wiring — that the page actually unlocks, that the Save/Cancel pair
 * appears on the field you typed in and *only* there, that an immutable field
 * refuses the pencil and says why, and that leaving with unsaved work is
 * refused by name. Those are the four claims the design rests on, and every one
 * of them is a property of this file rather than of the hook.
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
 * The record under test.
 *
 * `ClientDetail` reads `client_directory_v` now, so the seed row is a FIXTURE
 * standing in for a database row rather than the screen's data source — the
 * page never imports `CLIENTS_DATA` any more. Assertions read from the fixture
 * (`RECORD.name`) instead of repeating its literals, so a fixture rename in
 * `data/clients.ts` cannot make an edit-mode test fail for an unrelated reason.
 */
const RECORD = CLIENTS_DATA[0]!

/** Every `useList` result field, so the three list surfaces on the page render empty rather than undefined. */
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
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))
// The profile arrives already resolved: this suite is about the edit state
// machine, and the four page states are `PageBody`'s own tested behaviour.
vi.mock('../../../lib/queries/useClients', () => ({
  useClientProfile: () => ({
    ...EMPTY_LIST,
    rows: [{ id: 'uuid-fixture', record: RECORD, deactivatedAtAd: null }],
    isEmpty: false,
    total: 1,
  }),
}))
// The rentals and invoices tabs each call `useList` directly. Stubbed so no
// query runs — a component test must not depend on a network.
vi.mock('../../../lib/queries/useList', () => ({ useList: () => EMPTY_LIST }))
// `queries/finance` and `queries/bookings` are still imported for
// `financeRestriction` and the fetchers, and both pull in the Supabase client at
// module load. Stubbed so the suite needs no environment.
vi.mock('../../../lib/supabase', () => ({ supabase: {}, newClientUuid: () => 'uuid-test' }))

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

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/clients/${RECORD.id}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/clients/:id" element={<ClientDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
}

/** Buttons are matched by their visible text — the same handle an operator has. */
function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
}

function field(key: string): HTMLInputElement | HTMLTextAreaElement | null {
  return container.querySelector(`#edit-${key}`)
}

async function click(el: Element | undefined | null) {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** React tracks its own value on the node, so a plain `.value =` is not seen. */
async function type(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!el) throw new Error('field not rendered')
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Every Save button currently on screen — the count IS the "only where you typed" claim. */
function saveButtons() {
  return [...container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Save')
}

beforeEach(async () => {
  await mount()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('ClientDetail — inline edit', () => {
  it('offers a real Edit button, not the old disabled one', () => {
    const edit = button('Edit Client')
    expect(edit).toBeDefined()
    expect(edit!.disabled).toBe(false)
  })

  it('one button unlocks the page — every keyed field becomes an input at once', async () => {
    expect(field('name')).toBeNull()
    await click(button('Edit Client'))
    expect(field('name')).not.toBeNull()
    expect(field('phone')).not.toBeNull()
    expect(field('pan')).not.toBeNull()
    expect((field('name') as HTMLInputElement).value).toBe(RECORD.name)
  })

  it('unlocking sprouts no Save buttons — chrome appears only where you typed', async () => {
    await click(button('Edit Client'))
    expect(saveButtons()).toHaveLength(0)

    await type(field('name'), `${RECORD.name} Pvt`)
    expect(saveButtons()).toHaveLength(1)
  })

  it('typing a value back to the saved one clears the pair again', async () => {
    await click(button('Edit Client'))
    await type(field('name'), 'Something else')
    expect(saveButtons()).toHaveLength(1)
    await type(field('name'), RECORD.name)
    expect(saveButtons()).toHaveLength(0)
  })

  it('saving a field commits it to the record and drops the pair', async () => {
    await click(button('Edit Client'))
    await type(field('phone'), '+977 980-9999999')
    await click(saveButtons()[0])
    expect(saveButtons()).toHaveLength(0)
    expect((field('phone') as HTMLInputElement).value).toBe('+977 980-9999999')
  })

  it('refuses to save an empty phone — the key merge and dedupe match on', async () => {
    await click(button('Edit Client'))
    await type(field('phone'), '')
    await click(saveButtons()[0])
    expect(container.textContent).toContain('Phone is required')
    // The draft survives the refusal; the field is still dirty and still empty.
    expect((field('phone') as HTMLInputElement).value).toBe('')
  })

  it('an immutable field renders read-only with its reason, even in edit mode', async () => {
    await click(button('Edit Client'))
    expect(field('id')).toBeNull()
    expect(container.textContent).toContain('issued by Settings ▸ Numbering')
    expect(field('creditLimitPaisa')).toBeNull()
    expect(container.textContent).toContain('credit.override')
  })

  it('refuses to leave edit mode with unsaved work, and names the field', async () => {
    await click(button('Edit Client'))
    await type(field('pan'), '999888777')
    await click(button('Done'))
    expect(container.textContent).toContain('Unsaved: pan')
    // Still in edit mode — the input is still there.
    expect(field('pan')).not.toBeNull()
  })

  it('leaves cleanly once the field is saved', async () => {
    await click(button('Edit Client'))
    await type(field('pan'), '999888777')
    await click(saveButtons()[0])
    await click(button('Done'))
    expect(field('pan')).toBeNull()
    expect(button('Edit Client')).toBeDefined()
  })

  it('Discard drops every pending change and exits', async () => {
    await click(button('Edit Client'))
    await type(field('name'), 'Wrong Name')
    await click(button('Discard'))
    expect(field('name')).toBeNull()
    expect(container.textContent).toContain(RECORD.name)
    expect(container.textContent).not.toContain('Wrong Name')
  })

  it('the discount group saves as one write — the percentage never lands alone', async () => {
    await click(button('Edit Client'))
    await type(field('standingDiscountPercent'), '9')
    await type(field('discountSource'), 'Membership')
    // Two dirty fields, one group: each renders its own pair, and either saves both.
    await click(saveButtons()[0])
    expect(saveButtons()).toHaveLength(0)
    expect((field('standingDiscountPercent') as HTMLInputElement).value).toBe('9')
    expect((field('discountSource') as HTMLInputElement).value).toBe('Membership')
  })

  it('a failing member blocks the whole group', async () => {
    // 40% was the failing case while the discount gate stood; ungated
    // (D3, 31 Aug 2026) it saves freely, so the group-blocking behaviour is
    // pinned with a value that is still invalid — a >100% "discount" is a
    // negative price, which no ruling made legal.
    await click(button('Edit Client'))
    await type(field('discountSource'), 'Membership')
    await type(field('standingDiscountPercent'), '140')
    await click(saveButtons()[0])
    // Nothing saved: both are still dirty, and the reason is on the screen.
    expect(container.textContent).toContain('negative price')
    expect(saveButtons().length).toBeGreaterThan(0)
  })

  it('a standing discount above the old 10% threshold saves without ceremony — the gate is gone', async () => {
    await click(button('Edit Client'))
    await type(field('discountSource'), 'Membership')
    await type(field('standingDiscountPercent'), '20')
    await click(saveButtons()[0])
    expect(saveButtons()).toHaveLength(0)
    expect((field('standingDiscountPercent') as HTMLInputElement).value).toBe('20')
  })

  it('says plainly that nothing is persisted yet', async () => {
    await click(button('Edit Client'))
    expect(container.textContent).toContain('not persisted yet')
  })
})
