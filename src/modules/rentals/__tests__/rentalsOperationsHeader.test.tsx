// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RentalsOperationsHeader, type SelectedRentalInfo } from '../header/RentalsOperationsHeader'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('RentalsOperationsHeader component', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  const dummySearch = {
    value: '',
    onChange: vi.fn(),
    placeholder: 'Search rentals…',
  }

  it('renders Mode 1 (0 rentals selected) correctly', async () => {
    const handleAdd = vi.fn()
    await act(async () => {
      root.render(
        <RentalsOperationsHeader
          totalCount={42}
          selectedCount={0}
          search={dummySearch}
          onOpenOperations={vi.fn()}
          onAddRental={handleAdd}
          canWriteDesk={true}
        />,
      )
    })

    expect(host.textContent).toContain('Rentals')
    expect(host.textContent).toContain('42 bookings')
    expect(host.textContent).toContain('Add Rental')

    // Operations button is rendered but disabled
    const opsBtn = host.querySelector('button[aria-label*="Operations"]') as HTMLButtonElement
    expect(opsBtn).not.toBeNull()
    expect(opsBtn.disabled).toBe(true)

    // No unrelated Confirm button
    expect(host.textContent).not.toContain('Confirm Booking')
    expect(host.textContent).not.toContain('Start Packing')
  })

  it('renders Mode 2 (1 Confirmed rental selected): shows Start Packing and Operations menu', async () => {
    const handleOpenOps = vi.fn()
    const rental: SelectedRentalInfo = {
      id: 'r-1',
      bookingNo: 'BK-1028',
      status: 'Confirmed',
      client: 'Himalayan Pictures',
    }

    await act(async () => {
      root.render(
        <RentalsOperationsHeader
          totalCount={42}
          selectedCount={1}
          selectedRental={rental}
          search={dummySearch}
          onOpenOperations={handleOpenOps}
          canOperate={true}
        />,
      )
    })

    expect(host.textContent).toContain('BK-1028')
    expect(host.textContent).toContain('Confirmed')
    expect(host.textContent).toContain('Ready to pack')
    expect(host.textContent).toContain('Start Packing')

    // Click primary button
    const startPackBtn = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Start Packing'),
    )
    expect(startPackBtn).toBeDefined()

    await act(async () => {
      startPackBtn?.click()
    })

    expect(handleOpenOps).toHaveBeenCalledWith('BK-1028', 'Confirmed', 'Pack')
  })

  it('renders Mode 2 (1 Packed rental selected): shows Confirm Handover', async () => {
    const handleOpenOps = vi.fn()
    const rental: SelectedRentalInfo = {
      id: 'r-2',
      bookingNo: 'BK-2045',
      status: 'Packed',
      client: 'Kathmandu Cine',
    }

    await act(async () => {
      root.render(
        <RentalsOperationsHeader
          totalCount={42}
          selectedCount={1}
          selectedRental={rental}
          search={dummySearch}
          onOpenOperations={handleOpenOps}
          canOperate={true}
        />,
      )
    })

    expect(host.textContent).toContain('BK-2045')
    expect(host.textContent).toContain('Ready for handover')
    expect(host.textContent).toContain('Confirm Handover')

    const handoverBtn = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Confirm Handover'),
    )
    expect(handoverBtn).toBeDefined()

    await act(async () => {
      handoverBtn?.click()
    })

    expect(handleOpenOps).toHaveBeenCalledWith('BK-2045', 'Packed', 'Handover')
  })

  it('renders Mode 2 (1 On Rent rental selected): shows Return & Inspect', async () => {
    const handleOpenOps = vi.fn()
    const rental: SelectedRentalInfo = {
      id: 'r-3',
      bookingNo: 'BK-3001',
      status: 'On Rent',
      client: 'Pokhara Docs',
    }

    await act(async () => {
      root.render(
        <RentalsOperationsHeader
          totalCount={42}
          selectedCount={1}
          selectedRental={rental}
          search={dummySearch}
          onOpenOperations={handleOpenOps}
          canOperate={true}
        />,
      )
    })

    expect(host.textContent).toContain('BK-3001')
    expect(host.textContent).toContain('With client · On rent')
    expect(host.textContent).toContain('Return & Inspect')

    const returnBtn = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Return & Inspect'),
    )
    expect(returnBtn).toBeDefined()

    await act(async () => {
      returnBtn?.click()
    })

    expect(handleOpenOps).toHaveBeenCalledWith('BK-3001', 'On Rent', 'Return')
  })

  it('renders Mode 2 (1 Reset Completed rental selected): shows View Summary', async () => {
    const handleViewSummary = vi.fn()
    const rental: SelectedRentalInfo = {
      id: 'r-4',
      bookingNo: 'BK-4099',
      status: 'Returned',
      client: 'Chitwan Wildlife',
    }

    await act(async () => {
      root.render(
        <RentalsOperationsHeader
          totalCount={42}
          selectedCount={1}
          selectedRental={rental}
          search={dummySearch}
          onOpenOperations={vi.fn()}
          onViewSummary={handleViewSummary}
          canOperate={true}
          canCloseRental={false}
        />,
      )
    })

    // Returned default is Cleaning & Reset unless reset complete
    expect(host.textContent).toContain('Cleaning & Reset')
  })

  it('renders Mode 3 (multiple rentals selected): shows batch selection bar', async () => {
    const handleClear = vi.fn()
    const handleExport = vi.fn()

    await act(async () => {
      root.render(
        <RentalsOperationsHeader
          totalCount={42}
          selectedCount={3}
          onClearSelection={handleClear}
          search={dummySearch}
          onOpenOperations={vi.fn()}
          onExportCsv={handleExport}
        />,
      )
    })

    expect(host.textContent).toContain('3 rentals selected')
    expect(host.textContent).toContain('Clear selection')
    expect(host.textContent).toContain('Export CSV')

    const clearBtn = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Clear selection'),
    )
    clearBtn?.click()
    expect(handleClear).toHaveBeenCalled()
  })
})
