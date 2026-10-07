// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
const device = vi.hoisted(() => ({ viewport: 'desktop' }))

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
  useViewport: () => device.viewport,
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
  it('keeps one save and confirm action on a tablet', async () => {
    device.viewport = 'tablet'
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<MemoryRouter><NewRental /></MemoryRouter>))
      expect([...container.querySelectorAll('button')].filter((button) => /^save (as )?draft$/i.test(button.textContent?.trim() ?? ''))).toHaveLength(1)
      expect([...container.querySelectorAll('button')].filter((button) => /^confirm booking$/i.test(button.textContent?.trim() ?? ''))).toHaveLength(1)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      device.viewport = 'desktop'
    }
  })

  it('keeps the full booking available on a phone without remounting fields', async () => {
    device.viewport = 'phone'
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<MemoryRouter><NewRental /></MemoryRouter>))
      const clientSection = container.querySelector('#section-0')!
      const clientInput = clientSection.querySelector('input')!
      expect(clientInput).not.toBeNull()
      const summary = container.querySelector('#rail-booking-summary')!
      expect(summary.parentElement?.hidden).toBe(false)
      expect(container.querySelector('#section-1')?.textContent).toContain('Rental period')
      expect(container.querySelector('#section-2')?.textContent).toContain('Equipment, Bundles & Services')
      expect(container.querySelector('.rental-stepper')).toBeNull()
      const actions = container.querySelector('[role="group"][aria-label="Record actions"]')!
      expect(actions.textContent).toContain('Save draft')
      expect(actions.textContent).toContain('Confirm Booking')
      expect([...container.querySelectorAll('button')].filter((button) => /^save (as )?draft$/i.test(button.textContent?.trim() ?? ''))).toHaveLength(1)
      expect([...container.querySelectorAll('button')].filter((button) => /^confirm booking$/i.test(button.textContent?.trim() ?? ''))).toHaveLength(1)
      await act(async () => (clientSection.querySelector('[aria-label="Collapse Client"]') as HTMLButtonElement).click())
      await act(async () => (clientSection.querySelector('[aria-label="Expand Client"]') as HTMLButtonElement).click())
      expect(container.querySelector('#section-0 input')).toBe(clientInput)
      const scroll = vi.fn()
      const oldScroll = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = scroll
      await act(async () => (actions.querySelector('[aria-label="Review rental summary"]') as HTMLButtonElement).click())
      expect(scroll).toHaveBeenCalled()
      Element.prototype.scrollIntoView = oldScroll
    } finally {
      await act(async () => root.unmount())
      container.remove()
      device.viewport = 'desktop'
    }
  })

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
    expect(bookingSummary?.textContent).toContain('Pickup')
    expect(bookingSummary?.textContent).toContain('Return')
    expect(bookingSummary?.textContent).toContain('0 items')

    const attentionStatus = container.querySelector('[data-testid=booking-attention-status]')
    expect(attentionStatus).not.toBeNull()
    expect(attentionStatus?.textContent).toContain('Ready')

    const confirmBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Confirm Booking',
    )
    expect(confirmBtn).toBeDefined()
    expect([...container.querySelectorAll('button')].filter((button) => /^save (as )?draft$/i.test(button.textContent?.trim() ?? ''))).toHaveLength(1)
    expect([...container.querySelectorAll('button')].filter((button) => /^confirm booking$/i.test(button.textContent?.trim() ?? ''))).toHaveLength(1)

    expect(container.textContent).not.toContain('Quick Actions')
    expect(container.textContent).not.toContain('Activity Timeline')
    expect(container.textContent).not.toContain('Review · ')
    expect(container.querySelector('[aria-label="Booking steps"]')).toBeNull()
    expect(container.textContent).not.toContain('Continue to Equipment')
    expect(container.textContent).not.toContain('Continue to Pricing')

    const crewSection = container.querySelector('#section-3')
    expect(crewSection).not.toBeNull()
    expect(crewSection?.textContent).toContain('Optional / None')

    const pricingSection = container.querySelector('#section-5')
    expect(pricingSection).not.toBeNull()
    expect(pricingSection?.textContent).toContain('Pricing & Terms')
    expect(pricingSection?.textContent).not.toContain('Payments — rental only')
    expect(pricingSection?.textContent).not.toContain('Payment History')

    const openEquipment = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Open Equipment')!
    const scroll = vi.fn()
    const oldScroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scroll
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0))
      return 1
    })
    await act(async () => openEquipment.click())
    expect(container.querySelector('.rental-stepper')).toBeNull()
    expect(container.querySelector('#section-2')?.closest('.new-rental-canvas')).not.toBeNull()
    expect(scroll).toHaveBeenCalled()
    Element.prototype.scrollIntoView = oldScroll
    vi.unstubAllGlobals()

    await act(async () => root.unmount())
    container.remove()
  })
})
