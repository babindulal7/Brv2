import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionPermissionError } from '../../core'
import { convertDraftConfig, fetchRentalDraft, saveDraft, saveDraftConfig, type RentalDraftData } from '../saveDraft'
import { EVENT_TYPES } from '../../../events/eventBus'

const DRAFT_ID = '11111111-1111-4111-8111-111111111111'
const DRAFT_KEY = '22222222-2222-4222-8222-222222222222'
const BOOKING_KEY = '33333333-3333-4333-8333-333333333333'
const BRANCH_ID = '44444444-4444-4444-8444-444444444444'
const BOOKING_ID = '55555555-5555-4555-8555-555555555555'

const completeDraft = (overrides: Partial<RentalDraftData> = {}): RentalDraftData => ({
  version: 1,
  selectedClientId: 'C-42',
  clientDbId: '66666666-6666-4666-8666-666666666666',
  project: 'Mountain campaign',
  kind: 'Commercial',
  govId: '123456789',
  pickup: '2026-09-20', pickupTime: '09:15', returnDate: '2026-09-23', returnTime: '18:45',
  deliveryType: 'Babin Delivery',
  pickupLocation: 'Thamel', returnLocation: 'Lalitpur', specialInstructions: 'Call before arrival',
  lines: [{
    id: '77777777-7777-4777-8777-777777777777', lineType: 'Equipment', name: 'Sony FX6', serial: 'FX6-01',
    category: 'Camera', ratePaisa: 1250000, days: 3, daysOverridden: true, qty: 2, discountPct: 5,
    location: 'Main warehouse', committedTo: '', bundleCode: 'BND-9', bundleName: 'Cinema kit',
  }],
  crew: [{
    crewId: 'CR-1', name: 'Asha', role: 'DoP', phone: '9800000000', dayRatePaisa: 3000000,
    overtimePaisa: 200000, accommodationPaisa: 500000, mealsPaisa: 150000,
  }],
  deliveryChargePaisa: 250000, fuelChargePaisa: 100000, vehicle: 'Tata Ace',
  numberPlate: 'BA 2 KHA 1234', driverContact: '9800000001', discountPct: 10,
  vatOn: false, vatRatePercent: 13, advancePaisa: 5000000,
  ...overrides,
})

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = {
    rows: [] as Row[], bookingRows: [] as Row[], touchedTables: [] as string[],
    writeError: null as { message: string } | null, readError: null as { message: string } | null,
  }

  function from(table: string) {
    state.touchedTables.push(table)
    let operation: 'read' | 'upsert' | 'update' = 'read'
    let payload: Row = {}
    const filters: Array<[string, unknown]> = []
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return builder },
      update: (value: Row) => { operation = 'update'; payload = value; return builder },
      upsert: (value: Row) => { operation = 'upsert'; payload = value; return builder },
      maybeSingle: async () => finish(false),
      single: async () => finish(true),
    }
    const matches = (row: Row) => filters.every(([column, value]) => row[column] === value)
    function finish(requireRow: boolean) {
      if (table === 'users') return { data: { branch_id: BRANCH_ID }, error: state.readError }
      if (operation === 'read') {
        const source = table === 'bookings' ? state.bookingRows : state.rows
        const row = source.find(matches) ?? null
        return { data: row, error: state.readError ?? (requireRow && !row ? { message: 'no row' } : null) }
      }
      if (state.writeError) return { data: null, error: state.writeError }
      if (operation === 'upsert') {
        let row = state.rows.find((candidate) => candidate['client_uuid'] === payload['client_uuid'])
        if (row) Object.assign(row, payload)
        else {
          row = { id: DRAFT_ID, converted_booking_id: null, updated_at: payload['updated_at'], ...payload }
          state.rows.push(row)
        }
        return { data: row, error: null }
      }
      const row = state.rows.find(matches) ?? null
      if (row) Object.assign(row, payload)
      return { data: row, error: null }
    }
    return builder
  }
  const rpc = async (fn: string, _args: Record<string, unknown>) => {
    if (fn === 'next_document_number') {
      return { data: '1052', error: null }
    }
    return { data: null, error: null }
  }
  return { state, supabase: { from, rpc }, newClientUuid: () => '99999999-9999-4999-8999-999999999999' }
})

vi.mock('../../../lib/supabase', () => ({ supabase: db.supabase, newClientUuid: db.newClientUuid }))

const COORDINATOR = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'Coordinator' as const }

describe('durable New Rental drafts', () => {
  beforeEach(() => {
    db.state.rows = []
    db.state.bookingRows = []
    db.state.touchedTables = []
    db.state.writeError = null
    db.state.readError = null
  })

  it('creates a real active draft containing every booking field and emits only after the row returns', async () => {
    const data = completeDraft()
    const response = await saveDraftConfig.execute({ clientUuid: DRAFT_KEY, bookingClientUuid: BOOKING_KEY, data }, COORDINATOR)

    const expectedData = { ...data, bookingNo: '1052' }
    expect(response.result).toMatchObject({ id: DRAFT_ID, created: true, success: true, data: expectedData })
    expect(db.state.rows[0]).toMatchObject({
      client_uuid: DRAFT_KEY, booking_client_uuid: BOOKING_KEY, branch_id: BRANCH_ID, data: expectedData, status: 'Active',
    })
    expect(response.events).toEqual([
      expect.objectContaining({ type: EVENT_TYPES.DRAFT_SAVED, payload: expect.objectContaining({ id: DRAFT_ID }) }),
    ])
    expect(db.state.touchedTables).not.toContain('inventory_reservations')
  })

  it('reloads the complete snapshot without losing equipment, crew, money, transport, VAT, or advance', async () => {
    const data = completeDraft()
    await saveDraftConfig.execute({ clientUuid: DRAFT_KEY, bookingClientUuid: BOOKING_KEY, data }, COORDINATOR)
    const loaded = await fetchRentalDraft(DRAFT_ID)
    expect(loaded.data).toEqual({ ...data, bookingNo: '1052' })
    expect(loaded.bookingClientUuid).toBe(BOOKING_KEY)
  })

  it('edits the same draft row and preserves its booking idempotency key and bookingNo', async () => {
    await saveDraftConfig.execute({ clientUuid: DRAFT_KEY, bookingClientUuid: BOOKING_KEY, data: completeDraft() }, COORDINATOR)
    const edited = completeDraft({ project: 'Revised campaign', advancePaisa: 7500000 })
    const response = await saveDraftConfig.execute({ id: DRAFT_ID, data: edited }, COORDINATOR)
    expect(response.result).toMatchObject({ created: false, bookingClientUuid: BOOKING_KEY, data: { ...edited, bookingNo: '1052' } })
    expect(db.state.rows).toHaveLength(1)
  })

  it('does not emit an event or create a row when the database write fails', async () => {
    db.state.writeError = { message: 'network connection lost' }
    await expect(saveDraftConfig.execute(
      { clientUuid: DRAFT_KEY, bookingClientUuid: BOOKING_KEY, data: completeDraft() }, COORDINATOR,
    )).rejects.toThrow(/database rejected the draft.*network connection lost/i)
    expect(db.state.rows).toHaveLength(0)
  })

  it('denies roles outside the booking desk before touching the database', async () => {
    await expect(saveDraft(
      { clientUuid: DRAFT_KEY, bookingClientUuid: BOOKING_KEY, data: completeDraft() },
      { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'Client' },
    )).rejects.toBeInstanceOf(ActionPermissionError)
    expect(db.state.touchedTables).toHaveLength(0)
  })

  it('converts the same retained draft to its confirmed booking without creating reservations itself', async () => {
    await saveDraftConfig.execute({ clientUuid: DRAFT_KEY, bookingClientUuid: BOOKING_KEY, data: completeDraft() }, COORDINATOR)
    db.state.bookingRows.push({ id: BOOKING_ID, client_uuid: BOOKING_KEY, stage: 'Booked' })
    const response = await convertDraftConfig.execute({ id: DRAFT_ID, bookingId: BOOKING_ID }, COORDINATOR)
    expect(response.result).toMatchObject({
      id: DRAFT_ID, bookingClientUuid: BOOKING_KEY, status: 'Converted', convertedBookingId: BOOKING_ID,
    })
    expect(db.state.touchedTables).not.toContain('inventory_reservations')
  })

  it('refuses conversion to an unconfirmed or unrelated booking', async () => {
    await saveDraftConfig.execute({ clientUuid: DRAFT_KEY, bookingClientUuid: BOOKING_KEY, data: completeDraft() }, COORDINATOR)
    db.state.bookingRows.push({ id: BOOKING_ID, client_uuid: BOOKING_KEY, stage: 'Quote' })
    await expect(convertDraftConfig.execute({ id: DRAFT_ID, bookingId: BOOKING_ID }, COORDINATOR))
      .rejects.toThrow(/only be converted.*Booked/i)

    db.state.bookingRows[0] = { id: BOOKING_ID, client_uuid: '99999999-1111-4111-8111-111111111111', stage: 'Booked' }
    await expect(convertDraftConfig.execute({ id: DRAFT_ID, bookingId: BOOKING_ID }, COORDINATOR))
      .rejects.toThrow(/not created from this draft/i)
    expect(db.state.rows[0]?.['status']).toBe('Active')
  })
})
