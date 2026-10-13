import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ IS_MOCK: true, supabase: {} }))
vi.mock('../queries/clients', () => ({ getClientPreviewRecord: vi.fn(), getClientBlockStatus: vi.fn() }))
vi.mock('../queries/bookings', () => ({ listBookings: vi.fn(), fetchFloorBooking: vi.fn() }))
vi.mock('../queries/inventory', () => ({ getAssetDetail: vi.fn() }))
vi.mock('../queries/equipmentRelations', () => ({ equipmentBookingRelations: vi.fn() }))
vi.mock('../queries/finance', () => ({
  listInvoices: vi.fn(), listPayments: vi.fn(), paymentsForClient: vi.fn(),
  paymentsForBooking: vi.fn(), paymentsForInvoice: vi.fn(),
}))

import { getClientPreviewRecord, getClientBlockStatus } from '../queries/clients'
import { listBookings, fetchFloorBooking } from '../queries/bookings'
import { getAssetDetail } from '../queries/inventory'
import { equipmentBookingRelations } from '../queries/equipmentRelations'
import { listInvoices, listPayments } from '../queries/finance'
import { loadClientPreview, loadDocumentPreview, loadEquipmentPreview, loadInvoicePreview, loadRentalPreview } from '../smartHoverLoaders'

const UUID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => vi.clearAllMocks())

describe('Smart Hover role-filtered payloads', () => {
  it('omits client contact and all financial blocks for Warehouse', async () => {
    vi.mocked(getClientPreviewRecord).mockResolvedValue({
      id: UUID, code: 'C-1', name: 'Client One', membership: 'Silver',
      blocked: false, sinceAd: null,
    } as never)
    vi.mocked(listBookings).mockResolvedValue({ rows: [], total: 0 })
    const preview = await loadClientPreview(UUID, { role: 'Warehouse' })
    expect(preview).not.toHaveProperty('contact')
    expect(preview).not.toHaveProperty('payments')
    expect(preview).not.toHaveProperty('rentalTotalPaisa')
    expect(preview).not.toHaveProperty('finance')
    expect(JSON.stringify(preview)).not.toContain('123400')
    expect(JSON.stringify(preview)).not.toContain('private@example.com')
    expect(getClientPreviewRecord).toHaveBeenCalledWith(UUID, { role: 'Warehouse' })
    expect(listPayments).not.toHaveBeenCalled()
  })

  it('does not request booking money or emit a balance for Warehouse', async () => {
    vi.mocked(fetchFloorBooking).mockResolvedValue({
      id: UUID, bookingNo: 'B-1', stage: 'Booked', clientName: 'Client One',
      pickupAtAd: null, returnAtAd: null, linesPresence: 'present', lines: [],
    } as never)
    vi.mocked(listBookings).mockResolvedValue({ rows: [{
      id: UUID, clientId: 'client-1', bookingNo: 'B-1', totalAmount: 777700,
      depositRequired: 100000,
    }], total: 1 } as never)
    const preview = await loadRentalPreview(UUID, { role: 'Warehouse', surface: 'floor' })
    expect(vi.mocked(listBookings).mock.calls[0]?.[0]).not.toHaveProperty('withTotalAmount')
    expect(vi.mocked(listBookings).mock.calls[0]?.[0]).not.toHaveProperty('withDeposit')
    expect(preview).not.toHaveProperty('payments')
    expect(preview.rentalDays).toBeNull()
    expect(preview.readiness.equipmentReady).toBeNull()
    expect(JSON.stringify(preview)).not.toContain('777700')
  })

  it('omits asset money before querying equipment for a floor role', async () => {
    vi.mocked(getAssetDetail).mockResolvedValue({
      product: { id: UUID, name: 'Camera', assetCode: 'EQ000001', category: 'Camera', brand: null, model: null, trackingMode: 'Serialised', unitsByState: { 'In Stock': 1 }, dailyRate: 123400, replacementValue: 999900 },
      units: [], matchedUnitId: null,
    } as never)
    vi.mocked(equipmentBookingRelations).mockResolvedValue([])
    const preview = await loadEquipmentPreview(UUID, { role: 'Warehouse', surface: 'floor' })
    expect(getAssetDetail).toHaveBeenCalledWith(UUID, { withMoney: false })
    expect(preview).not.toHaveProperty('finance')
    expect(JSON.stringify(preview)).not.toContain('999900')
  })

  it('does not request the money-only invoice row for a floor role', async () => {
    await expect(loadInvoicePreview('INV-1', { role: 'Warehouse', surface: 'floor' })).rejects.toThrow('restricted')
    expect(listInvoices).not.toHaveBeenCalled()
    expect(listPayments).not.toHaveBeenCalled()
  })

  it('uses a registry document preview without exposing finance documents to Warehouse', async () => {
    const agreement = await loadDocumentPreview('RA-2026-0716', { role: 'Warehouse' })
    expect(agreement.type).toBe('Rental Agreement')
    expect(agreement.bookingRef).toBe('B-716')
    expect(agreement).not.toHaveProperty('totalPaisa')
    await expect(loadDocumentPreview('INV-161', { role: 'Warehouse' })).rejects.toThrow('unavailable')
    const finance = await loadDocumentPreview('INV-161', { role: 'Owner' })
    expect(finance.type).toBe('Tax Invoice')
    expect(finance).not.toHaveProperty('totalPaisa')
  })
})

describe('complete rental Intel data', () => {
  it('reads the entire ledger and retains unknown unit packing and a confirmed client block', async () => {
    vi.mocked(fetchFloorBooking).mockResolvedValue({ id: UUID, bookingNo: 'B-1', stage: 'Booked', clientName: 'Client One',
      pickupAtAd: null, returnAtAd: null, linesPresence: 'present', lines: Array.from({ length: 12 }, (_, index) => ({
        id: `line-${index}`, productName: `Gear ${index + 1}`, qty: 1, unitsPresence: 'present', units: [], trackingMode: 'Serialised',
      })),
    } as never)
    vi.mocked(listBookings).mockResolvedValue({ rows: [{ id: UUID, clientId: 'client-1', totalAmount: 1234500, depositRequired: 0 }], total: 1 } as never)
    vi.mocked(getClientBlockStatus).mockResolvedValue(true)
    const payments = Array.from({ length: 102 }, (_, index) => ({ id: `pay-${index}`, clientId: 'client-1', bookingId: UUID,
      paymentType: 'Rental', channelGroup: 'Cash', status: 'Received', amount: 100,
      createdAtAd: '2026-10-13T00:00:00Z',
    }))
    vi.mocked(listPayments).mockImplementation(async opts => {
      const start = (opts?.page?.index ?? 0) * (opts?.page?.size ?? 100)
      return { rows: payments.slice(start, start + 100), total: 102 } as never
    })
    const preview = await loadRentalPreview(UUID, { role: 'Owner' })
    expect(preview.equipment).toHaveLength(12)
    expect(preview.equipment[0]).not.toHaveProperty('packed')
    expect(preview.rentalTotalPaisa).toBe(1234500)
    expect(preview.payments?.history).toHaveLength(102)
    expect(preview.payments?.summary.paidPaisa).toBe(10200)
    expect(preview.readiness.clientAllowed).toBe(false)
    expect(listPayments).toHaveBeenCalledTimes(2)
  })
})
