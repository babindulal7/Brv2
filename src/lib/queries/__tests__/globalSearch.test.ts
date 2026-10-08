import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bookings: vi.fn(),
  clients: vi.fn(),
  inventory: vi.fn(),
  invoices: vi.fn(),
}))

vi.mock('../bookings', () => ({ listBookings: mocks.bookings }))
vi.mock('../clients', () => ({ listClientRecords: mocks.clients }))
vi.mock('../inventory', () => ({ listInventory: mocks.inventory }))
vi.mock('../finance', () => ({ listInvoices: mocks.invoices }))

const { searchRecords } = await import('../globalSearch')

describe('global record search permissions and shaping', () => {
  it('does not query any record source for external clients or short terms', async () => {
    expect(await searchRecords({ role: 'Client', term: 'camera' })).toEqual([])
    expect(await searchRecords({ role: 'Manager', term: 'x' })).toEqual([])
    expect(mocks.bookings).not.toHaveBeenCalled()
    expect(mocks.clients).not.toHaveBeenCalled()
    expect(mocks.inventory).not.toHaveBeenCalled()
    expect(mocks.invoices).not.toHaveBeenCalled()
  })

  it('omits invoice reads for money-blind staff and returns navigable cards', async () => {
    mocks.bookings.mockResolvedValue({ rows: [{ id: 'b1', bookingNo: 'B-1', clientName: 'Film Co', project: null, stage: 'Booked' }] })
    mocks.clients.mockResolvedValue([{ id: 'c1', name: 'Film Co', phone: null }])
    mocks.inventory.mockResolvedValue({ rows: [{ id: 'e1', name: 'FX3', category: 'Camera', trackingMode: 'Serial' }] })
    mocks.invoices.mockResolvedValue({ rows: [] })

    const results = await searchRecords({ role: 'Warehouse', term: 'film', limit: 10 })
    expect(results.map((r) => r.to)).toEqual(['/rentals/b1', '/clients/c1', '/inventory/e1'])
    expect(mocks.invoices).not.toHaveBeenCalled()
  })

  it('includes invoices for money-visible staff and caps each source', async () => {
    mocks.bookings.mockResolvedValue({ rows: [] })
    mocks.clients.mockResolvedValue([])
    mocks.inventory.mockResolvedValue({ rows: [] })
    mocks.invoices.mockResolvedValue({ rows: [{ id: 'i1', invoiceNo: 'INV-1', status: 'Sent' }] })

    const results = await searchRecords({ role: 'Accounts', term: 'inv', limit: 50 })
    expect(results).toEqual([{ kind: 'invoice', id: 'i1', label: 'INV-1', detail: 'Sent', to: '/finance?invoice=i1' }])
    expect(mocks.invoices).toHaveBeenCalledWith({ search: 'inv', page: { index: 0, size: 10 } })
  })
})
