import { describe, expect, it, vi } from 'vitest'
import { quoteToDraft, quoteUpdatePayload, type QuoteSnapshot } from '../quoteEditor'
import { prepareQuoteSave } from '../../../actions/rentals/updateRentalQuote'
import { rupees } from '../../money'

vi.mock('../../supabase', () => ({ supabase: {}, newClientUuid: () => crypto.randomUUID() }))

const snapshot: QuoteSnapshot = {
  id: 'booking-id', code: 'BK-2026-0010', revision: 'revision-1',
  values: {
    client_id: 'client-id', project: 'Location shoot', project_type: 'Other', project_type_other: 'Test',
    pickup_at: '2026-10-05T02:15:00Z', return_at: '2026-10-08T14:15:00Z',
    delivery_type: 'Client Pickup', deposit_required: 750, pickup_location: 'Store', return_location: 'Store',
  },
  lines: [{ id: 'line-id', client_uuid: 'line-key', line_type: 'Service', description: 'Setup', qty: 1, days: 1, rate: 450, discount_amount: 45, service_basis: 'Flat', line_note: 'Evening setup', is_included: false }],
  crew: [{ id: 'crew-line-id', crew_member_id: 'fe745ab6-8c30-4b60-941f-626424b81d03', name: 'Test crew', crew_role: 'Camera Assistant', phone: '', day_rate: 200, days: 3, overtime: 50, accommodation: 0, meals: 75 }],
  transport: { id: 'transport-id', delivery_charge: 350, fuel_charge: 25, vehicle: 'Van', number_plate: '', driver_contact: '', special_instructions: 'Collect after wrap' },
  discounts: [{ id: 'discount-id', percent: 5 }],
}

describe('quote editor round trips', () => {
  it('prefills Kathmandu wall time and preserves saved identities, charges and notes', () => {
    const draft = quoteToDraft(snapshot)
    expect([draft.pickup, draft.pickupTime, draft.returnDate, draft.returnTime]).toEqual(['2026-10-05', '08:00', '2026-10-08', '20:00'])
    expect(draft.returnPickupType).toBe('Babin Pickup')
    expect(draft.returnPickupChargePaisa).toBe(35000)
    const payload = quoteUpdatePayload(draft, snapshot, rupees(750))
    expect(payload.values.deposit_required).toBe(750)
    expect(payload.values.pickup_at).toBe('2026-10-05T02:15:00.000Z')
    expect(payload.lines[0]).toMatchObject({ id: 'line-id', client_uuid: 'line-key', rate: 450, discount_amount: 45, service_basis: 'Flat', line_note: 'Evening setup' })
    expect(payload.crew[0]).toMatchObject({ id: 'crew-line-id', crew_member_id: snapshot.crew[0]?.crew_member_id, days: 3, overtime: 50, meals: 75 })
    expect(payload.transport).toMatchObject({ delivery_charge: 350, fuel_charge: 25, special_instructions: 'Collect after wrap' })
  })

  it('saves changed service terms and links newly selected crew to the roster', () => {
    const draft = quoteToDraft(snapshot)
    draft.lines[0]!.lineNote = 'Updated setup'
    draft.lines[0]!.serviceBasis = 'Per day'
    draft.crew = [{ crewId: 'bc1d18b8-b9c7-4831-9595-934735248f31', name: 'New crew', role: 'Camera Assistant', phone: '', dayRatePaisa: 10000, overtimePaisa: 0, accommodationPaisa: 0, mealsPaisa: 0 }]
    const payload = quoteUpdatePayload(draft, snapshot, rupees(750))
    expect(payload.lines[0]).toMatchObject({ line_note: 'Updated setup', service_basis: 'Per day' })
    expect(payload.crew[0]).toMatchObject({ id: null, crew_member_id: draft.crew[0]!.crewId, days: 4 })
  })

  it('refuses missing canonical deposit values instead of treating them as zero', () => {
    expect(() => quoteToDraft({ ...snapshot, values: { ...snapshot.values, deposit_required: null } })).toThrow('saved deposit')
  })

  it('preserves an ad-hoc crew row without treating its row ID as a roster member', () => {
    const adHoc = { ...snapshot, crew: [{ ...snapshot.crew[0]!, id: 'dcfe53da-1ff2-4980-a46e-0c3014ce591f', crew_member_id: null }] }
    const payload = quoteUpdatePayload(quoteToDraft(adHoc), adHoc, rupees(750))
    expect(payload.crew[0]).toMatchObject({ id: adHoc.crew[0]!.id, crew_member_id: null, days: 3 })
  })

  it('prefills both transport legs and replaces the saved return-pickup instructions once', () => {
    const delivery = { ...snapshot, values: { ...snapshot.values, delivery_type: 'Babin Delivery' }, transport: { ...snapshot.transport, delivery_charge: 700, special_instructions: 'Call ahead | Return Pickup: Babin Pickup from "Studio" at 19:30 (Return Pickup Fee: Rs 300)' } }
    const draft = quoteToDraft(delivery)
    expect(draft).toMatchObject({ deliveryChargePaisa: 40000, returnPickupChargePaisa: 30000, returnPickupAddress: 'Studio', returnPickupTime: '19:30', specialInstructions: 'Call ahead' })
    expect(quoteUpdatePayload(draft, delivery, rupees(750)).transport).toMatchObject({ delivery_charge: 700, special_instructions: delivery.transport.special_instructions })
    draft.returnPickupTime = '20:00'
    draft.returnPickupChargePaisa = 35000
    expect(quoteUpdatePayload(draft, delivery, rupees(750)).transport).toMatchObject({ delivery_charge: 750, special_instructions: 'Call ahead | Return Pickup: Babin Pickup from "Studio" at 20:00 (Return Pickup Fee: Rs 350)' })
  })

  it('reuses the complete request on retry, and rotates keys for edits or a new revision', () => {
    const draft = quoteToDraft(snapshot)
    draft.lines.push({ ...draft.lines[0]!, id: 'new-line', bookingLineId: undefined, clientUuid: undefined })
    const input = { bookingId: snapshot.id, expectedRevision: snapshot.revision, snapshot, draft, depositPaisa: rupees(750) }
    const first = prepareQuoteSave(input, null)
    const retry = prepareQuoteSave(structuredClone(input), first)
    expect(retry).toBe(first)
    expect(retry.input.draft.lines[1]!.clientUuid).toBeTruthy()
    expect(draft.lines[1]!.clientUuid).toBeUndefined()
    const changed = prepareQuoteSave({ ...input, depositPaisa: rupees(800) }, first)
    expect(changed.input.clientUuid).not.toBe(first.input.clientUuid)
    const reloaded = prepareQuoteSave({ ...input, expectedRevision: 'revision-2' }, first)
    expect(reloaded.input.clientUuid).not.toBe(first.input.clientUuid)
  })
})
