// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import PackingWorkspace from '../PackingWorkspace'
import ReturnWorkspace from '../ReturnWorkspace'
import { loadFloorScan, saveFloorScan } from '../../../lib/floorScanStorage'

const B901_ID = '11111111-1111-4111-8111-111111111111'

let mockBookingStage = 'Booked'

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
    stage: mockBookingStage,
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
        qty: 2,
        lineType: 'Equipment',
        description: 'Sony FX3',
        productId: 'p-1',
        productName: 'Sony FX3',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'u-1',
            assetId: 'a-1',
            serial: 'SN102',
            assetTag: 'EQ000001-U01',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'A2-01',
          },
          {
            id: 'u-2',
            assetId: 'a-2',
            serial: 'SN103',
            assetTag: 'EQ000001-U02',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'A2-02',
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
  completeReturn: vi.fn().mockResolvedValue({
    stage: 'Returned',
    version: 3,
    at: '2026-07-19T00:15:00.000Z',
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

describe('Floor Workspaces State Persistence (AUD-018)', () => {
  describe('PackingWorkspace', () => {
    it('restores persisted packing scan state on mount and displays restored banner', async () => {
      mockBookingStage = 'Booked'

      // Pre-save active packing scan in local storage
      saveFloorScan('pack', B901_ID, {
        marks: {
          'l-1:u-1': { state: 'Packed', serial: 'SN102', timestamp: '2026-07-16T00:00:00.000Z' },
        },
        scanLog: ['SN102 scanned'],
        sessionNotes: 'Batteries pre-charged',
        photoCount: 1,
      })

      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)

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

      expect(document.body.textContent).toContain('Restored in-progress packing session from this device.')

      // Clicking Start Fresh clears the state and removes banner
      const startFreshBtn = [...document.body.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Start Fresh',
      )
      expect(startFreshBtn).toBeTruthy()

      await act(async () => {
        startFreshBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await flush()

      expect(document.body.textContent).not.toContain('Restored in-progress packing session from this device.')
      expect(loadFloorScan('pack', B901_ID)).toBeNull()
    })
  })

  describe('ReturnWorkspace', () => {
    it('restores persisted return triage state on mount and displays restored banner', async () => {
      mockBookingStage = 'On Rent'

      // Pre-save active return scan in local storage
      saveFloorScan('return', B901_ID, {
        marks: {
          'l-1:u-1': {
            state: 'Received',
            condition: 'Good',
            timestamp: '2026-07-19T00:00:00.000Z',
          },
        },
        scanLog: ['SN102 received'],
        sessionNotes: 'Checked in by lead tech',
        returningName: 'Suman Shrestha',
        sigReturning: {
          dataUrl: 'data:image/svg+xml;base64,fake',
          signerName: 'Suman Shrestha',
          timestamp: '2026-07-19T00:00:00.000Z',
        },
        sigWarehouse: null,
      })

      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/rentals/B-901/return']}>
            <ToastProvider>
              <Routes>
                <Route path="/rentals/:bookingNo/return" element={<ReturnWorkspace />} />
              </Routes>
            </ToastProvider>
          </MemoryRouter>,
        )
      })
      await flush()

      expect(document.body.textContent).toContain('Restored in-progress return session from this device.')
      expect(document.body.querySelector('th[scope="rowgroup"]')?.textContent).toContain('Sony FX3')

      // Check that returning person name was restored
      const nameInput = document.body.querySelector('input[placeholder*="person returning" i]') as HTMLInputElement | null
      if (nameInput) {
        expect(nameInput.value).toBe('Suman Shrestha')
      }

      // Clicking Start Fresh clears the state and removes banner
      const startFreshBtn = [...document.body.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Start Fresh',
      )
      expect(startFreshBtn).toBeTruthy()

      await act(async () => {
        startFreshBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await flush()

      expect(document.body.textContent).not.toContain('Restored in-progress return session from this device.')
      expect(loadFloorScan('return', B901_ID)).toBeNull()
    })
  })
})
