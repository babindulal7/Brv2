// @vitest-environment jsdom
/**
 * src/modules/rentals/actions/__tests__/RentalMoreActions.test.tsx — Babin Rentals OS
 *
 * Unit and interaction tests for RentalMoreActions dropdown component.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ToastProvider } from '../../../../components/ui/Toast'
import { RentalMoreActions } from '../RentalMoreActions'
import type { SelectedRentalBookingFacts } from '../../../../lib/rentalMoreActionsRegistry'

let role = 'Owner'
vi.mock('../../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => role !== 'Warehouse' && role !== 'Technician',
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role },
    loading: false,
  }),
}))

describe('RentalMoreActions', () => {
  let container: HTMLDivElement
  let root: Root

  const booking: SelectedRentalBookingFacts = {
    id: 'b-1028',
    bookingNo: 'BK-1028',
    clientName: 'Himalayan Visuals',
    clientId: 'c-1',
    stage: 'Confirmed',
    isCancelled: false,
    isClosed: false,
    itemCount: 4,
    pickupDate: '2026-10-15',
    returnDate: '2026-10-18',
  }

  const mount = async (selectedBooking: SelectedRentalBookingFacts | null = booking, selectedRole = 'Owner') => {
    role = selectedRole
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(
        <ToastProvider>
          <RentalMoreActions booking={selectedBooking} selectedCount={selectedBooking ? 1 : 0} />
        </ToastProvider>,
      )
    })
  }

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    document.body.innerHTML = ''
  })

  it('renders More trigger button', async () => {
    await mount(booking)
    const button = container.querySelector('button[aria-haspopup="menu"]')
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain('More')
  })

  it('opens menu with 5 action groups when clicked by Owner', async () => {
    await mount(booking, 'Owner')
    const trigger = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement

    await act(async () => {
      trigger.click()
    })

    const menu = document.querySelector('[role="menu"][aria-label="Secondary rental actions"]')
    expect(menu).not.toBeNull()
    const text = menu?.textContent || ''
    expect(text).toContain('Quote')
    expect(text).toContain('Invoice')
    expect(text).toContain('Duplicate Rental')
    expect(text).toContain('Audit History')
    expect(text).toContain('Cancel Rental')
  })

  it('strictly hides Invoice group for money-blind Warehouse staff (Law 6)', async () => {
    await mount(booking, 'Warehouse')
    const trigger = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement

    await act(async () => {
      trigger.click()
    })

    const menu = document.querySelector('[role="menu"][aria-label="Secondary rental actions"]')
    expect(menu).not.toBeNull()
    const text = menu?.textContent || ''
    expect(text).toContain('Quote')
    expect(text).not.toContain('Invoice')
    expect(text).toContain('Duplicate Rental')
    expect(text).toContain('Audit History')
    expect(text).toContain('Cancel Rental')
  })

  it('expands Quote submenu when Quote is clicked', async () => {
    await mount(booking, 'Owner')
    const trigger = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement

    await act(async () => {
      trigger.click()
    })

    const quoteBtn = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent?.trim() === 'Quote',
    ) as HTMLButtonElement
    expect(quoteBtn).toBeDefined()

    await act(async () => {
      quoteBtn.click()
    })

    const menu = document.querySelector('[role="menu"][aria-label="Secondary rental actions"]')
    const text = menu?.textContent || ''
    expect(text).toContain('Create Quote')
    expect(text).toContain('View Quote')
    expect(text).toContain('Download PDF')
    expect(text).toContain('Send Quote')
  })

  it('opens CancelRentalDialog when Cancel Rental is clicked', async () => {
    await mount(booking, 'Owner')
    const trigger = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement

    await act(async () => {
      trigger.click()
    })

    const cancelBtn = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent?.trim() === 'Cancel Rental',
    ) as HTMLButtonElement
    expect(cancelBtn).toBeDefined()

    await act(async () => {
      cancelBtn.click()
    })

    expect(document.body.textContent).toContain('Cancel Rental · #BK-1028')
    expect(document.body.textContent).toContain('Cancellation Reason')
  })

  it('opens DuplicateRentalDialog when Duplicate Rental is clicked', async () => {
    await mount(booking, 'Owner')
    const trigger = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement

    await act(async () => {
      trigger.click()
    })

    const dupBtn = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent?.trim() === 'Duplicate Rental',
    ) as HTMLButtonElement
    expect(dupBtn).toBeDefined()

    await act(async () => {
      dupBtn.click()
    })

    expect(document.body.textContent).toContain('Duplicate Rental · #BK-1028')
    expect(document.body.textContent).toContain('New Rental Schedule')
  })

  it('opens RentalAuditDrawer when Audit History is clicked', async () => {
    await mount(booking, 'Owner')
    const trigger = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement

    await act(async () => {
      trigger.click()
    })

    const auditBtn = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent?.trim() === 'Audit History',
    ) as HTMLButtonElement
    expect(auditBtn).toBeDefined()

    await act(async () => {
      auditBtn.click()
    })

    expect(document.body.textContent).toContain('Audit History')
  })
})
