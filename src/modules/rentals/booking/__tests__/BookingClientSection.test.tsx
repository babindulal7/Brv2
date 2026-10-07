// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BookingClientSection } from '../BookingClientSection'
import type { ClientRecord } from '../../../../lib/queries/clients'
import { rupees } from '../../../../lib/money'
import { gateContext } from '../../../../lib/fieldGating'

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

describe('BookingClientSection', () => {
  it('renders client section with selected client name and project fields', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const setProject = vi.fn()
    const onOpenHistory = vi.fn()

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingClientSection
              open={true}
              onToggle={vi.fn()}
              client={sampleClient}
              clientPool={[sampleClient]}
              selectedClientId={sampleClient.id}
              clientFieldTouched={false}
              setClientFieldTouched={vi.fn()}
              addClientOpen={false}
              selectClient={vi.fn()}
              openAddClient={vi.fn()}
              quickViewOpen={false}
              setQuickViewOpen={vi.fn()}
              health={null}
              days={2}
              dayWord="days"
              canClientBalance={true}
              canBookingMoney={true}
              gctx={gateContext('Owner')}
              user={{ id: 'usr-1', name: 'Babin', role: 'Owner', isSharedDevice: false }}
              onOpenHistory={onOpenHistory}
              suppressClientListOnFocus={{ current: false }}
              clientFieldRef={{ current: null }}
              navigate={vi.fn()}
              isPhone={false}
              project="Feature Film A"
              setProject={setProject}
              kind="Commercial"
              setKind={vi.fn()}
              kindOther=""
              setKindOther={vi.fn()}
              govId="123456789"
              setGovId={vi.fn()}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).toContain('Paramount Studios Nepal')
      expect(host.textContent).toContain('Project')
      expect(host.textContent).toContain('Project Type')
      expect(host.textContent).not.toContain('Government ID / PAN')
      expect(host.textContent).toContain('New client')
      const history = host.querySelector<HTMLButtonElement>('[aria-label="Client History"]')!
      expect(history.textContent?.trim()).toBe('')
      expect(history.parentElement?.parentElement?.querySelector('input[role="combobox"]')).not.toBeNull()
      await act(async () => history.click())
      expect(onOpenHistory).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('renders credit warning banner when client has an outstanding balance', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const owingClient: ClientRecord = {
      ...sampleClient,
      outstandingPaisa: rupees(15000),
    }

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingClientSection
              open={true}
              onToggle={vi.fn()}
              client={owingClient}
              clientPool={[owingClient]}
              selectedClientId={owingClient.id}
              clientFieldTouched={false}
              setClientFieldTouched={vi.fn()}
              addClientOpen={false}
              selectClient={vi.fn()}
              openAddClient={vi.fn()}
              quickViewOpen={false}
              setQuickViewOpen={vi.fn()}
              health={null}
              days={2}
              dayWord="days"
              canClientBalance={true}
              canBookingMoney={true}
              gctx={gateContext('Owner')}
              user={{ id: 'usr-1', name: 'Babin', role: 'Owner', isSharedDevice: false }}
              onOpenHistory={vi.fn()}
              suppressClientListOnFocus={{ current: false }}
              clientFieldRef={{ current: null }}
              navigate={vi.fn()}
              isPhone={false}
              project=""
              setProject={vi.fn()}
              kind=""
              setKind={vi.fn()}
              kindOther=""
              setKindOther={vi.fn()}
              govId=""
              setGovId={vi.fn()}
            />
          </MemoryRouter>,
        )
      })

      const warning = host.querySelector('[data-testid="client-credit-warning"]')
      expect(warning).not.toBeNull()
      expect(warning?.textContent).toContain('Client Credit Warning')
      expect(warning?.textContent).toContain('15,000')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
