// @vitest-environment jsdom
/**
 * `Settings ▸ People ▸ Staff Directory`. Built 24 Aug 2026.
 *
 * Three assertions carry this file, and all three are about NOT doing something:
 *
 *   1. **A non-Owner sees `restricted`, never `empty`.** `staff_directory_v`
 *      carries `where auth_user_role() = 'Owner'` inline, so a Manager's query
 *      succeeds and returns zero rows. Rendering that as "no staff match" would
 *      tell a Manager this business has no staff — a true-looking sentence built
 *      from a permission denial. `queries/finance.ts`'s header names this exact
 *      trap.
 *
 *   2. **A row with no `auth.users` account cannot be sent a reset link.**
 *      `resetPasswordForEmail` resolves with no error for an address that has no
 *      account, so the button would appear to work and the link would never
 *      arrive. `hasAuthAccount` is the only signal that exists, and the action
 *      must be disabled by it — this is the state `babindulal7@gmail.com` was
 *      actually in on the local stack on 23 Aug 2026.
 *
 *   3. **The screen never claims an email was sent.** Same rule the
 *      `ForgotPassword` suite pins, for the same reason: Supabase cannot confirm
 *      delivery, so a screen that says "sent" is reporting an unverified
 *      outcome.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { StaffDirectoryRow, StaffDirectoryResult } from '../../../lib/queries/staff'

const requestPasswordReset = vi.fn(async (_email: string) => ({ error: null as string | null }))
const showSuccessToast = vi.fn()
const fetchStaffDirectory = vi.fn(async (): Promise<StaffDirectoryResult> => ({ kind: 'ok', rows: [] }))
const revokeStaffPinFor = vi.fn(async (_id: string) => ({ error: null as string | null }))
const recordPasswordResetRequest = vi.fn(async (_id: string) => ({ error: null as string | null }))

const authState = { role: 'Owner' as string }

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Dulal', role: authState.role, isSharedDevice: false },
    loading: false,
    requestPasswordReset,
    isLocked: false,
    setLocked: vi.fn(),
  }),
}))

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast }),
}))

vi.mock('../../../lib/queries/staff', () => ({
  fetchStaffDirectory: () => fetchStaffDirectory(),
  revokeStaffPinFor: (id: string) => revokeStaffPinFor(id),
  recordPasswordResetRequest: (id: string) => recordPasswordResetRequest(id),
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

const { StaffDirectoryCard } = await import('../sections/StaffDirectory')

const row = (over: Partial<StaffDirectoryRow> = {}): StaffDirectoryRow => ({
  id: 'u-9',
  fullName: 'Ramesh Thapa',
  employeeCode: 'EMP-003',
  email: 'warehouse@babinrentals.com',
  primaryRole: 'Warehouse',
  department: 'Operations',
  branchCode: 'BR-KTM-01',
  branchName: 'Kathmandu',
  isActive: true,
  hasPin: false,
  pinLockedUntil: null,
  hasAuthAccount: true,
  lastSignInAt: '2026-08-23T16:45:24Z',
  ...over,
})

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <StaffDirectoryCard />
      </StrictMode>,
    )
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

const text = () => container.textContent ?? ''

function buttons(label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter((b) =>
    (b.textContent ?? '').includes(label),
  ) as HTMLButtonElement[]
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

beforeEach(() => {
  requestPasswordReset.mockClear().mockResolvedValue({ error: null })
  showSuccessToast.mockClear()
  revokeStaffPinFor.mockClear().mockResolvedValue({ error: null })
  recordPasswordResetRequest.mockClear().mockResolvedValue({ error: null })
  fetchStaffDirectory.mockClear().mockResolvedValue({ kind: 'ok', rows: [] })
  authState.role = 'Owner'
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

describe('Staff Directory — who may see it', () => {
  it('shows a Manager restricted, NOT an empty list', async () => {
    authState.role = 'Manager'
    await mount()

    expect(text()).not.toContain('No staff match')
    expect(text()).toContain('Owner')
    // It must not even ask the database — the UI gate short-circuits first.
    expect(fetchStaffDirectory).not.toHaveBeenCalled()
  })

  it('reads the directory for an Owner', async () => {
    await mount()
    // Not `toHaveBeenCalledTimes(1)` — `StrictMode` deliberately double-invokes
    // mount effects, and asserting an exact count here would pin the test to
    // React's dev-mode behaviour rather than to ours.
    expect(fetchStaffDirectory).toHaveBeenCalled()
  })
})

describe('Staff Directory — the reset action', () => {
  it('offers a reset link for an active row with an account', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'ok', rows: [row()] })
    await mount()

    const send = buttons('Send reset link')
    expect(send.length).toBe(1)
    expect(send[0]?.disabled).toBe(false)
  })

  it('DISABLES the reset for a staff row with no sign-in account', async () => {
    // The silent-no-op case. GoTrue answers the same for an unknown address, so
    // this button would look like it worked forever.
    fetchStaffDirectory.mockResolvedValue({
      kind: 'ok',
      rows: [row({ hasAuthAccount: false })],
    })
    await mount()

    expect(buttons('Send reset link')[0]?.disabled).toBe(true)
    expect(text()).toContain('No sign-in account')
  })

  it('hides inactive rows by default, and disables the reset once they are shown', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'ok', rows: [row({ isActive: false })] })
    await mount()

    // The status filter defaults to Active, so an inactive row is not on screen
    // at all — which is why there is no button to find yet. Verifying that
    // first, because a test that went straight to the disabled assertion would
    // have passed for the wrong reason.
    expect(buttons('Send reset link').length).toBe(0)

    const status = Array.from(container.querySelectorAll('select')).find((s) =>
      s.getAttribute('aria-label') === 'Filter by status',
    )!
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(status, 'all')
      status.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(buttons('Send reset link')[0]?.disabled).toBe(true)
  })

  it('names the person AND the destination before sending', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'ok', rows: [row()] })
    await mount()
    await click(buttons('Send reset link')[0]!)

    // The operator must be able to see where the link goes before committing.
    expect(text()).toContain('warehouse@babinrentals.com')
    expect(text()).toContain('Ramesh Thapa')
    expect(text()).toContain('The link goes to them, not to you')
  })

  it('sends to the address on the row, and never claims it arrived', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'ok', rows: [row()] })
    await mount()
    await click(buttons('Send reset link')[0]!)
    await click(buttons('Send reset link').at(-1)!)

    expect(requestPasswordReset).toHaveBeenCalledWith('warehouse@babinrentals.com')
    // The action must leave a trace naming the subject. Without this an Owner
    // could trigger reset links for every colleague and the database would hold
    // no record that anything happened (0068).
    expect(recordPasswordResetRequest).toHaveBeenCalledWith('u-9')

    const [title, message] = showSuccessToast.mock.calls[0] ?? []
    // "requested", never "sent" — the wording is pinned, not just the behaviour.
    expect(title).toBe('Reset link requested')
    expect(String(message)).toContain('if that address still has an account')
    expect(String(title)).not.toMatch(/\bsent\b/i)
  })

  it('throttles a second send and says how long is left', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'ok', rows: [row()] })
    await mount()
    await click(buttons('Send reset link')[0]!)
    await click(buttons('Send reset link').at(-1)!)

    expect(buttons('Send reset link')[0]?.disabled).toBe(true)
    expect(requestPasswordReset).toHaveBeenCalledTimes(1)
  })
})

describe('Staff Directory — credential state', () => {
  it('marks a row that holds a PIN and offers to revoke it', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'ok', rows: [row({ hasPin: true })] })
    await mount()

    expect(text()).toContain('Password + PIN')
    expect(buttons('Revoke PIN').length).toBe(1)
  })

  it('offers no revoke for a row with no PIN', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'ok', rows: [row({ hasPin: false })] })
    await mount()

    expect(text()).toContain('Password')
    expect(buttons('Revoke PIN').length).toBe(0)
  })

  it('shows a live PIN lockout as temporary, not as a failure', async () => {
    fetchStaffDirectory.mockResolvedValue({
      kind: 'ok',
      rows: [row({ hasPin: true, pinLockedUntil: new Date(Date.now() + 900_000).toISOString() })],
    })
    await mount()
    expect(text()).toContain('PIN locked')
  })

  it('ignores a lockout that has already lapsed', async () => {
    fetchStaffDirectory.mockResolvedValue({
      kind: 'ok',
      rows: [row({ hasPin: true, pinLockedUntil: new Date(Date.now() - 60_000).toISOString() })],
    })
    await mount()
    expect(text()).not.toContain('PIN locked')
    expect(text()).toContain('Password + PIN')
  })

  it('states that no credential is readable here', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'ok', rows: [row()] })
    await mount()
    expect(text()).toContain('No credential is readable here')
  })
})

describe('Staff Directory — the unhappy paths', () => {
  it('surfaces a read failure with a retry, and keeps the filters usable', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'error', message: 'permission denied' })
    await mount()

    expect(text()).toContain('Could not load the staff directory')
    expect(text()).toContain('permission denied')
    expect(container.querySelector('input[type="search"]')).toBeTruthy()
  })

  it('refuses by name on the mock data source rather than showing an empty desk', async () => {
    fetchStaffDirectory.mockResolvedValue({
      kind: 'unavailable',
      message: 'The staff directory reads staff_directory_v, which the mock corpus does not serve.',
    })
    await mount()

    expect(text()).toContain('Directory unavailable here')
    expect(text()).not.toContain('No staff match')
  })

  it('says no MATCH, not no staff, when a filter empties the list', async () => {
    fetchStaffDirectory.mockResolvedValue({ kind: 'ok', rows: [row()] })
    await mount()

    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(search, 'zzzzzz')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(text()).toContain('No staff match this search')
  })
})
