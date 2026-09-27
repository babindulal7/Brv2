// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  const save = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save as draft')
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
