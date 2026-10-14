import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ IS_MOCK: true, supabase: {} }))
vi.mock('../queries/clients', () => ({ getClientPreviewRecord: vi.fn(), getClientBlockStatus: vi.fn() }))
vi.mock('../queries/bookings', () => ({ listBookings: vi.fn(), fetchFloorBooking: vi.fn() }))
vi.mock('../../actions/rentals/saveDraft', () => ({ fetchRentalDraft: vi.fn() }))
vi.mock('../queries/inventory', () => ({ getAssetDetail: vi.fn() }))
vi.mock('../queries/equipmentRelations', () => ({ equipmentBookingRelations: vi.fn() }))
vi.mock('../queries/finance', () => ({
  listInvoices: vi.fn(), listPayments: vi.fn(), paymentsForClient: vi.fn(),
  paymentsForBooking: vi.fn(), paymentsForInvoice: vi.fn(),
}))

import { getClientPreviewRecord, getClientBlockStatus } from '../queries/clients'
import { listBookings, fetchFloorBooking } from '../queries/bookings'
import { fetchRentalDraft, type RentalDraftData } from '../../actions/rentals/saveDraft'
import { calculateDraftTotal } from '../rentalDraftPricing'
import { getAssetDetail } from '../queries/inventory'
import { equipmentBookingRelations } from '../queries/equipmentRelations'
import { listInvoices, listPayments } from '../queries/finance'
import { loadClientPreview, loadDocumentPreview, loadEquipmentPreview, loadInvoicePreview, loadRentalPreview } from '../smartHoverLoaders'

const UUID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => vi.clearAllMocks())

function draftData(): RentalDraftData {
  return {
    version: 1, selectedClientId: null, clientDbId: UUID, clientName: 'Draft client',
    project: '', kind: '', kindOther: '', govId: '', pickup: '2026-10-14', pickupTime: '10:00',
    returnDate: '2026-10-16', returnTime: '10:00', deliveryType: 'Client Pickup',
    pickupLocation: '', returnLocation: '', specialInstructions: 'Keep dry',
    lines: Array.from({ length: 12 }, (_, index) => ({ id: `line-${index}`, name: `Gear ${index + 1}`,
      serial: '', category: 'Camera', ratePaisa: 10000, days: 2, qty: 1, discountPct: 0, location: '', committedTo: '' })),
    crew: [{ crewId: 'crew-1', name: 'Operator', role: 'Operator', phone: '', days: 3,
      dayRatePaisa: 20000, overtimePaisa: 1000, accommodationPaisa: 0, mealsPaisa: 0 }],
    deliveryChargePaisa: 99900, fuelChargePaisa: 0, vehicle: '', numberPlate: '', driverContact: '',
    discountPct: 0, vatOn: false, vatRatePercent: 13, advancePaisa: 50000,
  }
}

describe('saved draft Intel', () => {
  it('returns all saved items and engine pricing without claiming readiness or payment clearance', async () => {
    vi.mocked(fetchFloorBooking).mockResolvedValue(null)
    vi.mocked(fetchRentalDraft).mockResolvedValue({ id: UUID, bookingNo: '3', clientUuid: UUID,
      bookingClientUuid: UUID, branchId: UUID, data: draftData(), status: 'Active', convertedBookingId: null,
      updatedAt: '2026-10-14T00:00:00Z' })
    const preview = await loadRentalPreview(UUID, { role: 'Owner' })
    expect(preview.equipment).toHaveLength(12)
    expect(preview.rentalNo).toBe('Draft #3')
    expect(preview.rentalTotalPaisa).toBe(301000)
    expect(preview.isDraft).toBe(true)
    expect(Object.values(preview.readiness).every(value => value === null)).toBe(true)
    expect(preview).not.toHaveProperty('payments')
    expect(preview.notes?.[0]?.text).toBe('Keep dry')
  })

  it.each(['Warehouse', 'Technician', 'Driver', 'Client'] as const)('never requests opaque draft terms for %s', async role => {
    vi.mocked(fetchFloorBooking).mockResolvedValue(null)
    await expect(loadRentalPreview(UUID, { role })).rejects.toThrow('Booking not found')
    expect(fetchRentalDraft).not.toHaveBeenCalled()
  })

  it('also refuses draft JSON for an Owner in a money-free floor context', async () => {
    vi.mocked(fetchFloorBooking).mockResolvedValue(null)
    await expect(loadRentalPreview(UUID, { role: 'Owner', surface: 'floor' })).rejects.toThrow('Booking not found')
    expect(fetchRentalDraft).not.toHaveBeenCalled()
  })

  it.each(['Converted', 'Cancelled'] as const)('refuses to present a %s draft as editable', async status => {
    vi.mocked(fetchFloorBooking).mockResolvedValue(null)
    vi.mocked(fetchRentalDraft).mockResolvedValue({ id: UUID, bookingNo: '3', clientUuid: UUID,
      bookingClientUuid: UUID, branchId: UUID, data: draftData(), status, convertedBookingId: null,
      updatedAt: '2026-10-14T00:00:00Z' })
    await expect(loadRentalPreview(UUID, { role: 'Owner' })).rejects.toThrow('no longer active')
  })

  it('does not double-charge included gear or subtract advance from rental total', () => {
    const data = draftData()
    data.lines[0]!.isIncluded = true
    expect(calculateDraftTotal(data)).toBe(281000)
    data.advancePaisa = 900000
    expect(calculateDraftTotal(data)).toBe(281000)
    data.vatOn = true
    expect(calculateDraftTotal(data)).toBe(317500)
  })
})

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
