// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { StaffDirectoryRow, StaffDirectoryResult } from '../../../../lib/queries/staff'

const requestPasswordReset = vi.fn(async (_email: string) => ({ error: null as string | null }))
const showSuccessToast = vi.fn()
const fetchStaffDirectory = vi.fn(async (): Promise<StaffDirectoryResult> => ({ kind: 'ok', rows: [] }))
const revokeStaffPinFor = vi.fn(async (_id: string) => ({ error: null as string | null }))
const recordPasswordResetRequest = vi.fn(async (_id: string) => ({ error: null as string | null }))
const setStaffRole = vi.fn(async (_id: string, _role: string) => ({ error: null as string | null }))
const setStaffActive = vi.fn(async (_id: string, _active: boolean) => ({ error: null as string | null }))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Dulal', role: 'Owner', isSharedDevice: false },
    loading: false,
    requestPasswordReset,
    isLocked: false,
    setLocked: vi.fn(),
  }),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast }),
}))

vi.mock('../../../../lib/queries/staff', () => ({
  fetchStaffDirectory: () => fetchStaffDirectory(),
  revokeStaffPinFor: (id: string) => revokeStaffPinFor(id),
  recordPasswordResetRequest: (id: string) => recordPasswordResetRequest(id),
  setStaffRole: (id: string, role: string) => setStaffRole(id, role),
  setStaffActive: (id: string, active: boolean) => setStaffActive(id, active),
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

const { StaffDirectoryCard } = await import('../StaffDirectory')

const sampleRow = (over: Partial<StaffDirectoryRow> = {}): StaffDirectoryRow => ({
  id: 'u-9',
  fullName: 'Ramesh Thapa',
  employeeCode: 'EMP-003',
  email: 'warehouse@babinrentals.com',
  primaryRole: 'Warehouse',
  department: 'Operations',
  branchCode: 'BR-KTM-01',
  branchName: 'Kathmandu',
  isActive: true,
  hasPin: true,
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
    root.render(<StaffDirectoryCard />)
  })
}

async function unmount() {
  if (root) {
    await act(async () => {
      root.unmount()
    })
  }
  container?.remove()
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

async function choose(select: Element, value: string) {
  const el = select as HTMLSelectElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const buttons = (label?: string): HTMLButtonElement[] => {
  const all = Array.from(container.querySelectorAll('button'))
  return label ? all.filter((b) => (b.textContent ?? '').trim() === label) : all
}

describe('StaffDirectory — Gate error formatting and inline persistence (Law 12)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchStaffDirectory.mockResolvedValue({
      kind: 'ok',
      rows: [
        sampleRow({ id: 'u-1', primaryRole: 'Owner', fullName: 'Babin Dulal' }),
        sampleRow({ id: 'u-9', primaryRole: 'Warehouse', fullName: 'Ramesh Thapa' }),
      ],
    })
  })

  afterEach(async () => {
    await unmount()
  })

  it('renders parsed gate error inline and keeps staff table visible when role change fails', async () => {
    setStaffRole.mockResolvedValue({
      error: 'GATE:gate.users.role_ceiling|Only the Owner may assign Owner or Admin roles',
    })
    await mount()

    const roleSelect = container.querySelector('select[aria-label="Role for Ramesh Thapa"]')
    expect(roleSelect).toBeTruthy()

    // Trigger role assignment to Admin
    await choose(roleSelect!, 'Admin')

    // Confirm dialog should appear
    const confirmBtn = buttons('Assign role')[0]
    expect(confirmBtn).toBeTruthy()
    await click(confirmBtn!)

    // Check that setStaffRole was called
    expect(setStaffRole).toHaveBeenCalledWith('u-9', 'Admin')

    // An inline error alert should now render with the parsed gate title and resolution
    const alert = container.querySelector('[role="alert"]')
    expect(alert).toBeTruthy()
    expect(alert?.textContent).toContain('Role Assignment Ceiling Exceeded')
    expect(alert?.textContent).toContain('Resolution')
    expect(alert?.textContent).toContain('Request the system Owner to grant elevated administrator privileges')

    // CRITICAL: Staff table must still be mounted and visible (not destroyed into a bare ErrorBanner)
    const table = container.querySelector('table')
    expect(table).toBeTruthy()
    expect(container.textContent).toContain('Ramesh Thapa')
  })

  it('renders parsed gate error inline when PIN revocation is refused by gate', async () => {
    revokeStaffPinFor.mockResolvedValue({
      error: 'GATE:gate.users.immutable|Staff records cannot be modified without proper privileges',
    })
    await mount()

    const revokeBtn = buttons('Revoke PIN')[0]
    expect(revokeBtn).toBeTruthy()
    await click(revokeBtn!)

    expect(revokeStaffPinFor).toHaveBeenCalledWith('u-1')

    const alert = container.querySelector('[role="alert"]')
    expect(alert).toBeTruthy()
    expect(alert?.textContent).toContain('User Deletion Forbidden')

    // Table stays visible
    expect(container.querySelector('table')).toBeTruthy()
  })
})
