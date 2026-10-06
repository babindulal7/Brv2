// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'

const state = vi.hoisted(() => ({ failSave: true, search: '' }))
const showSuccessToast = vi.hoisted(() => vi.fn())
const persistRentalDraft = vi.hoisted(() => vi.fn(async (input: Record<string, unknown>) => {
  if (state.failSave) throw new Error('database unavailable')
  return {
    success: true,
    created: true,
    id: '11111111-1111-4111-8111-111111111111',
    clientUuid: input['clientUuid'],
    bookingClientUuid: input['bookingClientUuid'],
    branchId: '22222222-2222-4222-8222-222222222222',
    data: input['data'],
    status: 'Active',
    convertedBookingId: null,
    updatedAt: '2026-09-16T00:00:00.000Z',
    savedAt: '2026-09-16T00:00:00.000Z',
  }
}))

const fetchRentalDraft = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/rentals/saveDraft', () => ({
  saveDraft: persistRentalDraft,
  fetchRentalDraft,
  convertDraft: vi.fn(),
  cancelDraft: vi.fn(),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Coordinator', role: 'Coordinator', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast }) }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => true }))
vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))
vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => crypto.randomUUID(),
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
}))
vi.mock('../../../lib/queries/clients', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/queries/clients')>()
  return { ...real, listClientRecords: async () => [] }
})
vi.mock('../../../lib/queries/inventory', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/queries/inventory')>()
  return { ...real, listInventory: async () => ({ rows: [], total: 0 }) }
})

window.matchMedia = ((query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: NewRental } = await import('../NewRental')

let root: Root
let container: HTMLDivElement

function LocationProbe() {
  state.search = useLocation().search
  return null
}

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/rentals/new']}><NewRental /><LocationProbe /></MemoryRouter>)
  })
  await act(async () => { await Promise.resolve() })
}

async function clickSave() {
  const save = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save draft')
  expect(save).toBeDefined()
  await act(async () => {
    save!.click()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

const SAMPLE_DRAFT_RECORD = {
  id: '11111111-1111-4111-8111-111111111111',
  clientUuid: '33333333-3333-4333-8333-333333333333',
  bookingClientUuid: '44444444-4444-4444-8444-444444444444',
  branchId: '22222222-2222-4222-8222-222222222222',
  data: {
    selectedClientId: 'client-1',
    clientDbId: '11111111-2222-3333-4444-555555555555',
    project: 'Test Documentary',
    kind: 'Film / Cinema',
    bookingNo: '1052',
    govId: '123456789',
    pickup: '2026-09-20',
    pickupTime: '09:00',
    returnDate: '2026-09-25',
    returnTime: '18:00',
    deliveryType: 'Client Pickup',
    pickupLocation: 'Kathmandu',
    returnLocation: 'Kathmandu',
    specialInstructions: 'Handle with care',
    lines: [],
    crew: [],
    deliveryChargePaisa: 0,
    fuelChargePaisa: 0,
    vehicle: '',
    numberPlate: '',
    driverContact: '',
    discountPct: 5,
    vatOn: true,
    vatRatePercent: 13,
    advancePaisa: 0,
  },
  status: 'Active',
  convertedBookingId: null,
  updatedAt: '2026-09-16T10:00:00.000Z',
  savedAt: '2026-09-16T09:00:00.000Z',
}

async function mountWithUrl(url: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[url]}><NewRental /><LocationProbe /></MemoryRouter>)
  })
  await act(async () => { await Promise.resolve() })
}

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  state.failSave = true
  state.search = ''
  showSuccessToast.mockClear()
  persistRentalDraft.mockClear()
  fetchRentalDraft.mockReset()
})

describe('New Rental Save Draft reporting', () => {
  it('shows no success on failure, then reports success only after a durable row is returned', async () => {
    await mount()

    await clickSave()
    expect(container.textContent).toContain('Not saved')
    expect(container.textContent).toContain('database unavailable')
    expect(showSuccessToast).not.toHaveBeenCalled()

    state.failSave = false
    await clickSave()
    expect(showSuccessToast).toHaveBeenCalledWith(
      'Draft saved',
      'This booking is saved as a draft. Nothing has been confirmed.',
    )
    expect(state.search).toBe('?draft=11111111-1111-4111-8111-111111111111')
  })

  it('loads an existing draft from URL, sets Draft #<bookingNo> title, and restores fields', async () => {
    fetchRentalDraft.mockResolvedValueOnce(SAMPLE_DRAFT_RECORD)
    await mountWithUrl('/rentals/new?draft=11111111-1111-4111-8111-111111111111')

    expect(fetchRentalDraft).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(container.textContent).toContain('Draft #1052')

    const projectInput = container.querySelector('input[placeholder*="Project"], input[value="Test Documentary"]') as HTMLInputElement | null
    expect(projectInput?.value).toBe('Test Documentary')

    state.failSave = false
    await clickSave()
    expect(persistRentalDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '11111111-1111-4111-8111-111111111111',
        data: expect.objectContaining({
          bookingNo: '1052',
          project: 'Test Documentary',
        }),
      }),
      expect.anything(),
    )
  })

  it('renders load error view when draft fetching fails', async () => {
    fetchRentalDraft.mockRejectedValueOnce(new Error('Network error or draft not found'))
    await mountWithUrl('/rentals/new?draft=bad-draft-id')

    expect(container.textContent).toContain("Couldn't load this draft")
    expect(container.textContent).toContain('Network error or draft not found')
    expect(container.textContent).toContain('Retry')
  })
})

/* ── C4 — an unsaved New Rental kept on this device ─────────────────────── */

describe('New Rental keeps an unsaved booking on this device', () => {
  const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const KEY = `br.newRentalLocalDraft.v1.${USER_ID}`
  const kept = () => ({ ...SAMPLE_DRAFT_RECORD.data, version: 1, project: 'Kept on this device', bookingNo: undefined })

  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
  const click = async (label: string) => {
    const target = button(label)
    expect(target, `a "${label}" button`).toBeDefined()
    await act(async () => {
      target!.click()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  beforeEach(() => window.localStorage.clear())

  it('offers nothing when no copy was kept', async () => {
    await mount()
    expect(container.textContent).not.toContain('was kept on this device')
  })

  it('offers the kept copy, and Restore puts every field back and clears the copy', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ data: kept(), savedAt: new Date().toISOString() }))
    await mount()

    expect(container.textContent).toContain('An unsaved booking from')
    expect(container.textContent).toContain('was kept on this device')

    await click('Restore it')
    const project = container.querySelector('input[value="Kept on this device"]') as HTMLInputElement | null
    expect(project?.value).toBe('Kept on this device')
    expect(container.textContent).not.toContain('was kept on this device')
    expect(window.localStorage.getItem(KEY)).toBeNull()
    // Restoring is local only: no server draft is created until Save draft is pressed.
    expect(persistRentalDraft).not.toHaveBeenCalled()
  })

  it('Discard drops the copy without touching the form', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ data: kept(), savedAt: new Date().toISOString() }))
    await mount()
    await click('Discard')

    expect(container.textContent).not.toContain('was kept on this device')
    expect(window.localStorage.getItem(KEY)).toBeNull()
    expect(container.querySelector('input[value="Kept on this device"]')).toBeNull()
  })

  it('keeps a copy a second after the first edit of a new rental, and not before one', async () => {
    await mount()
    expect(window.localStorage.getItem(KEY)).toBeNull()

    const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Project')
    const input = (label?.control ?? label?.parentElement?.querySelector('input') ?? null) as HTMLInputElement | null
    expect(input, 'the project input').not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'Typed before any save')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(window.localStorage.getItem(KEY)).toBeNull()

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1200)) })
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as { data: { project: string } } | null
    expect(stored?.data.project).toBe('Typed before any save')
    expect(persistRentalDraft).not.toHaveBeenCalled()
  })

  it('does not offer a copy when opening a saved draft', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ data: kept(), savedAt: new Date().toISOString() }))
    fetchRentalDraft.mockResolvedValueOnce(SAMPLE_DRAFT_RECORD)
    await mountWithUrl('/rentals/new?draft=11111111-1111-4111-8111-111111111111')

    expect(container.textContent).not.toContain('was kept on this device')
    expect(window.localStorage.getItem(KEY)).not.toBeNull()
  })
})
