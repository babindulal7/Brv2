// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import PackingWorkspace from '../PackingWorkspace'

const B901_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: B901_ID,
    bookingNo: ref,
    stage: 'Booked',
    clientName: 'Himalayan Films Pvt. Ltd.',
    project: 'Film Shoot',
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-1',
        qty: 1,
        lineType: 'Equipment',
        description: 'Sony FX3 Cinema Line Camera',
        productId: 'p-1',
        productName: 'Sony FX3 Cinema Line Camera',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-1',
            assetId: 'a-1',
            serial: 'SN-FX3-001',
            assetTag: 'EQ000001-U01',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'A2-01',
          },
        ],
      },
    ],
  }),
}))

vi.mock('../../../actions/rentals/index', () => ({
  packRental: vi.fn().mockResolvedValue({
    stage: 'Packed',
    version: 2,
    at: '2026-07-16T00:15:00.000Z',
  }),
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

let container: HTMLDivElement
let root: Root

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount()
    })
  }
  container?.remove()
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('Pre-Dispatch Kit-Build Verification (Gemma-4 Recommendation)', () => {
  it('detects cinema camera gear and renders the Cinema Kit Checklist with dependency chips', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/B-901/pack']}>
          <ToastProvider>
            <Routes>
              <Route path="/rentals/:bookingNo/pack" element={<PackingWorkspace />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>,
      )
    })
    await flush()

    // 1. Should display Cinema Kit Checklist card in rail
    expect(document.body.textContent).toContain('Cinema Kit Checklist')
    expect(document.body.textContent).toContain('dependencies verified')

    // 2. Should render dependency chips for the cinema camera
    expect(document.body.textContent).toContain('Media Card & Reader')
    expect(document.body.textContent).toContain('Power Solution & V-Mount')
    expect(document.body.textContent).toContain('Mount Adapter / Body Cap')

    // 3. Blocker gate for cinema kit dependencies should be present
    expect(document.body.textContent).toContain('Cinema kit & dependencies verified')
  })

  it('verifies all kit dependencies when "Verify All" button is clicked', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/B-901/pack']}>
          <ToastProvider>
            <Routes>
              <Route path="/rentals/:bookingNo/pack" element={<PackingWorkspace />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>,
      )
    })
    await flush()

    const verifyAllBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Verify All',
    )
    expect(verifyAllBtn).toBeTruthy()

    await act(async () => {
      verifyAllBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    // Now all dependencies should be verified
    expect(document.body.textContent).toContain('All critical power, media, mount, and safety accessories are verified.')
  })
})
