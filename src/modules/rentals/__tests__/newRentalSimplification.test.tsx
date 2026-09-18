// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../actions/rentals/saveDraft', () => ({
  saveDraft: vi.fn(),
  fetchRentalDraft: vi.fn(),
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
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast: vi.fn() }) }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => true }))
vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))
vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
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

import NewRental from '../NewRental'

describe('NewRental simplification (Part A - D)', () => {
  it('renders a consolidated Booking Summary card and removed legacy rail cards', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/new']}>
          <NewRental />
        </MemoryRouter>,
      )
    })
    await act(async () => { await Promise.resolve() })

    const bookingSummary = container.querySelector('#rail-booking-summary')
    expect(bookingSummary).not.toBeNull()
    expect(bookingSummary?.textContent).toContain('Booking Summary')

    const attentionStatus = container.querySelector('[data-testid=booking-attention-status]')
    expect(attentionStatus).not.toBeNull()
    expect(attentionStatus?.textContent).toContain('attention')

    const confirmBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Confirm Booking',
    )
    expect(confirmBtn).toBeDefined()

    expect(container.textContent).not.toContain('Quick Actions')
    expect(container.textContent).not.toContain('Activity Timeline')
    expect(container.textContent).not.toContain('Review · ')

    const crewSection = container.querySelector('#section-3')
    expect(crewSection).not.toBeNull()
    expect(crewSection?.textContent).toContain('Optional / None')

    const pricingSection = container.querySelector('#section-5')
    expect(pricingSection).not.toBeNull()
    expect(pricingSection?.textContent).toContain('Pricing & Terms')
    expect(pricingSection?.textContent).not.toContain('Payments — rental only')
    expect(pricingSection?.textContent).not.toContain('Payment History')

    await act(async () => root.unmount())
    container.remove()
  })
})
