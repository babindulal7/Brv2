// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BookingModals } from '../BookingModals'
import type { ClientRecord } from '../../../../lib/queries/clients'
import { rupees } from '../../../../lib/money'

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }),
}))

const sampleClient: ClientRecord = {
  id: 'client-1',
  name: 'Paramount Studios Nepal',
  email: 'paramount@ktm.np',
  phone: '9851000000',
  pan: '123456789',
  address: 'Kathmandu',
  clientType: 'Organisation',
  membership: 'Creator',
  isBlocked: false,
  outstandingPaisa: rupees(0),
  depositHeldPaisa: rupees(0),
  creditLimitPaisa: rupees(50000),
  creditUsedPaisa: rupees(0),
  currentRentalsCount: 0,
  activeBookings: [],
  lastRentalAd: '18 Jul 2026',
  lastRentalBs: '2083/04/03',
  contactPerson: {
    name: 'Anil',
    designation: 'Manager',
    phone: '9851000000',
  },
  kycStatus: 'Verified',
  kycDocsCount: 1,
  totalRentalsCount: 10,
  totalSpentPaisa: rupees(100000),
}

describe('BookingModals', () => {
  it('renders confirmation modal when booking is confirmed', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const navigate = vi.fn()

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingModals
              client={sampleClient}
              quickViewOpen={false}
              setQuickViewOpen={vi.fn()}
              historyOpen={false}
              setHistoryOpen={vi.fn()}
              canClientBalance={true}
              navigate={navigate}
              addClientOpen={false}
              closeAddClient={vi.fn()}
              onClientCreated={vi.fn()}
              clientPool={[sampleClient]}
              onUseExistingClient={vi.fn()}
              emailDraftDoc={null}
              setEmailDraftDoc={vi.fn()}
              cancelIntent={null}
              setCancelIntent={vi.fn()}
              discardDraft={vi.fn()}
              cancelDraftBooking={vi.fn()}
              exitPrompt={null}
              setExitPrompt={vi.fn()}
              doExit={vi.fn()}
              reloadPrompt={false}
              setReloadPrompt={vi.fn()}
              onReloadQuote={vi.fn()}
              confirmedSuccess={{ bookingId: 'bk-1', bookingNo: 'BK-2026-0099' }}
              setConfirmedSuccess={vi.fn()}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).toContain('Booking Confirmed!')
      expect(host.textContent).toContain('Rental BK-2026-0099 Confirmed')
      expect(host.textContent).toContain('Open Rental Detail')
      expect(host.textContent).toContain('Start Packing')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('renders discard confirm dialog when cancelIntent is discard', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingModals
              client={sampleClient}
              quickViewOpen={false}
              setQuickViewOpen={vi.fn()}
              historyOpen={false}
              setHistoryOpen={vi.fn()}
              canClientBalance={true}
              navigate={vi.fn()}
              addClientOpen={false}
              closeAddClient={vi.fn()}
              onClientCreated={vi.fn()}
              clientPool={[sampleClient]}
              onUseExistingClient={vi.fn()}
              emailDraftDoc={null}
              setEmailDraftDoc={vi.fn()}
              cancelIntent="discard"
              setCancelIntent={vi.fn()}
              discardDraft={vi.fn()}
              cancelDraftBooking={vi.fn()}
              exitPrompt={null}
              setExitPrompt={vi.fn()}
              doExit={vi.fn()}
              reloadPrompt={false}
              setReloadPrompt={vi.fn()}
              onReloadQuote={vi.fn()}
              confirmedSuccess={null}
              setConfirmedSuccess={vi.fn()}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).toContain('Discard this booking?')
      expect(host.textContent).toContain('Discard and leave')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
