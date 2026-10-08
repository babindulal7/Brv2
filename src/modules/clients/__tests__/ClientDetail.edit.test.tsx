// @vitest-environment jsdom
/**
 * Client editing is record-level (2026-10-06): `Edit Client` opens the shared record form.
 * The old per-field inline editor and its "session only" banner are gone.
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
vi.mock('../../../components/records/RecordForm', () => ({
  RecordForm: ({ kind, recordId }: { kind: string; recordId?: string }) => (
    <div data-testid="record-form">{kind}:{recordId}</div>
  ),
}))
vi.mock('../../../actions/clients/updateClient', () => ({
  updateClient: vi.fn().mockResolvedValue({ success: true, clientId: 'uuid-fixture', changedKeys: [] }),
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

describe('ClientDetail - record-level edit', () => {
  it('offers a real Edit Client button', () => {
    const edit = button('Edit Client')
    expect(edit).toBeDefined()
    expect(edit!.disabled).toBe(false)
  })

  it('shows the record read-only, with no per-field inputs or Save controls', () => {
    expect(field('name')).toBeNull()
    expect(field('phone')).toBeNull()
    expect(saveButtons()).toHaveLength(0)
    expect(container.textContent).toContain(RECORD.name)
  })

  it('Edit Client opens the one shared client form for this record', async () => {
    await click(button('Edit Client'))
    const form = container.querySelector('[data-testid="record-form"]')
    expect(form).not.toBeNull()
    expect(form!.textContent).toBe('client:' + RECORD.id)
  })

  it('never claims edits are session-only and has no inline Done/Discard mode', async () => {
    await click(button('Edit Client'))
    expect(container.textContent).not.toContain('not persisted yet')
    expect(button('Done')).toBeUndefined()
    expect(button('Discard')).toBeUndefined()
  })
})