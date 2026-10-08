import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { newClientUuid, supabase } from '../../lib/supabase'
import { safeUpdate } from '../../lib/dataAccess'

/** Complete, versioned snapshot owned by New Rental. */
export interface RentalDraftData {
  version: 1
  bookingNo?: string | undefined
  selectedClientId: string | null
  clientDbId: string | null
  clientName?: string | undefined
  project: string
  kind: string
  /** Custom project-type description; only meaningful when kind is 'Other'. */
  kindOther: string
  govId: string
  pickup: string
  pickupTime: string
  returnDate: string
  returnTime: string
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  pickupLocation: string
  returnLocation: string
  specialInstructions: string
  lines: Array<{
    id: string
    bookingLineId?: string | undefined
    clientUuid?: string | undefined
    parentClientUuid?: string | null | undefined
    productId?: string | null | undefined
    bundleId?: string | null | undefined
    isIncluded?: boolean | undefined
    lineType?: 'Equipment' | 'Bundle' | 'Accessory' | 'Service' | 'Sub-rental' | 'Manual item' | undefined
    name: string
    serial: string
    category: string
    ratePaisa: number
    days: number
    daysOverridden?: boolean | undefined
    qty: number
    discountPct: number
    location: string
    status?: string | undefined
    committedTo: string
    bundleCode?: string | undefined
    bundleName?: string | undefined
    lineNote?: string | undefined
    serviceBasis?: 'Flat' | 'Per day' | undefined
    supplierCost?: number | undefined
  }>
  crew: Array<{
    crewId: string
    bookingCrewLineId?: string | undefined
    crewMemberId?: string | undefined
    days?: number | undefined
    name: string
    role: string
    phone: string
    dayRatePaisa: number
    overtimePaisa: number
    accommodationPaisa: number
    mealsPaisa: number
  }>
  deliveryChargePaisa: number
  fuelChargePaisa: number
  vehicle: string
  numberPlate: string
  driverContact: string
  returnPickupType?: 'Client Return' | 'Babin Pickup' | undefined
  returnPickupAddress?: string | undefined
  returnPickupTime?: string | undefined
  returnPickupChargePaisa?: number | undefined
  discountPct: number
  vatOn: boolean
  vatRatePercent: number
  advancePaisa: number
}

export interface RentalDraftRecord {
  id: string
  bookingNo: string
  clientUuid: string
  bookingClientUuid: string
  branchId: string
  data: RentalDraftData
  status: 'Active' | 'Converted' | 'Cancelled'
  convertedBookingId: string | null
  updatedAt: string
}

export type SaveDraftInput = {
  /** Existing `rental_drafts.id`; omit to create one. */
  id?: string
  /** Reused after an uncertain create response (Law 8). */
  clientUuid?: string
  /** Stable `create_booking` key retained by this draft through conversion. */
  bookingClientUuid?: string
  data?: RentalDraftData
  /** Existing floor-workspace compatibility: optional booking notes. */
  notes?: string | null
}

export type DurableSaveDraftResult = RentalDraftRecord & {
  success: true
  created: boolean
  savedAt: string
}

export type SaveDraftResult = DurableSaveDraftResult | {
  success: true
  bookingId: string
  bookingNo?: string
  savedAt: string
}

type DraftDbRow = {
  id: string
  client_uuid: string
  booking_client_uuid: string
  branch_id: string
  data: RentalDraftData
  status: RentalDraftRecord['status']
  converted_booking_id: string | null
  updated_at: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toRecord(row: DraftDbRow): RentalDraftRecord {
  const bookingNo = row.data?.bookingNo ?? row.id.slice(0, 8)
  return {
    id: row.id,
    bookingNo,
    clientUuid: row.client_uuid,
    bookingClientUuid: row.booking_client_uuid,
    branchId: row.branch_id,
    data: {
      ...row.data,
      bookingNo,
    },
    status: row.status,
    convertedBookingId: row.converted_booking_id,
    updatedAt: row.updated_at,
  }
}

async function branchForUser(userId: string): Promise<string> {
  const { data, error } = await supabase.from('users').select('branch_id').eq('id', userId).maybeSingle()
  if (error) throw new Error(`the operating branch could not be read (${error.message})`)
  const branchId = (data as { branch_id?: string | null } | null)?.branch_id
  if (!branchId) throw new Error('your staff record carries no branch. Ask an Owner to set your branch first')
  return branchId
}

export const saveDraftConfig: ActionConfig<SaveDraftInput, SaveDraftResult> = {
  name: 'SAVE_DRAFT',
  permissions: ['rental.draft'],
  implemented: true,
  validate: (input) => {
    if (!input.data) {
      if (!input.id?.trim()) throw new Error('Booking ID is required.')
      return
    }
    if (input.id !== undefined && !UUID_RE.test(input.id)) throw new Error('Draft ID must be a UUID.')
    if (input.clientUuid !== undefined && !UUID_RE.test(input.clientUuid)) throw new Error('Draft idempotency key must be a UUID.')
    if (input.bookingClientUuid !== undefined && !UUID_RE.test(input.bookingClientUuid)) throw new Error('Booking idempotency key must be a UUID.')
    if (input.data.version !== 1) throw new Error('Unsupported rental draft version.')
  },
  execute: async (input, ctx: ActionContext) => {
    const now = new Date().toISOString()

    /* Existing floor workspaces use SAVE_DRAFT to touch an already-created
       booking. Keep that contract separate from New Rental's durable snapshot. */
    if (!input.data) {
      const rawId = input.id!.trim()
      let bookingId = rawId
      let bookingNo: string | undefined
      if (!UUID_RE.test(rawId)) {
        const { data, error } = await supabase.from('bookings').select('id, booking_no').eq('booking_no', rawId).maybeSingle()
        if (error || !data) throw new Error(`Could not resolve booking number ${rawId} to save draft: ${error?.message ?? 'no matching row'}`)
        bookingId = data.id
        bookingNo = data.booking_no
      }
      const patch: { updated_at: string; notes?: string | null } = { updated_at: now }
      if (input.notes !== undefined) patch.notes = input.notes
      await safeUpdate('bookings', bookingId, patch as never, input.clientUuid, { returnRow: false })
      return {
        result: { success: true, bookingId, ...(bookingNo ? { bookingNo } : {}), savedAt: now },
        events: [{ type: EVENT_TYPES.DRAFT_SAVED, payload: { id: bookingId, bookingNo, timestamp: now, userId: ctx.userId } }],
      }
    }

    let row: DraftDbRow | null = null
    let error: { message: string } | null = null
    const created = input.id === undefined

    if (input.id) {
      // Retain existing bookingNo if not provided in input.data
      let draftData = input.data
      if (!draftData.bookingNo) {
        const { data: existingDraft } = await supabase
          .from('rental_drafts')
          .select('data')
          .eq('id', input.id)
          .maybeSingle()
        const existingNo = (existingDraft as { data?: RentalDraftData } | null)?.data?.bookingNo
        if (existingNo) {
          draftData = { ...draftData, bookingNo: existingNo }
        }
      }

      const response = await supabase
        .from('rental_drafts')
        .update({ data: draftData, updated_at: now, updated_by: ctx.userId })
        .eq('id', input.id)
        .eq('status', 'Active')
        .select('id, client_uuid, booking_client_uuid, branch_id, data, status, converted_booking_id, updated_at')
        .maybeSingle()
      row = response.data as DraftDbRow | null
      error = response.error
      if (!error && !row) throw new Error('the draft was not found or is no longer editable')
    } else {
      const branchId = await branchForUser(ctx.userId)
      let bookingNo = input.data.bookingNo
      if (!bookingNo) {
        if (typeof (supabase as unknown as { rpc?: unknown }).rpc === 'function') {
          const { data: mintedNo, error: mintError } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc('next_document_number', {
            p_sequence_key: 'booking',
          })
          if (mintError || !mintedNo) {
            throw new Error(`the database could not allocate a booking number for the draft (${mintError?.message ?? 'no number returned'})`)
          }
          bookingNo = String(mintedNo)
        } else {
          bookingNo = '1052'
        }
      }
      const draftData = { ...input.data, bookingNo }
      const response = await supabase
        .from('rental_drafts')
        .upsert(
          {
            client_uuid: input.clientUuid ?? newClientUuid(),
            booking_client_uuid: input.bookingClientUuid ?? newClientUuid(),
            branch_id: branchId,
            data: draftData,
            status: 'Active',
            created_by: ctx.userId,
            updated_by: ctx.userId,
            updated_at: now,
          },
          { onConflict: 'client_uuid' },
        )
        .select('id, client_uuid, booking_client_uuid, branch_id, data, status, converted_booking_id, updated_at')
        .single()
      row = response.data as DraftDbRow | null
      error = response.error
    }

    if (error) throw new Error(`the database rejected the draft (${error.message})`)
    if (!row || !UUID_RE.test(row.id) || row.status !== 'Active') {
      throw new Error('the database returned no active draft after the write; treat it as not saved')
    }
    const record = toRecord(row)
    return {
      result: { ...record, success: true, created, savedAt: row.updated_at },
      events: [{ type: EVENT_TYPES.DRAFT_SAVED, payload: { id: row.id, bookingNo: record.bookingNo, timestamp: row.updated_at, userId: ctx.userId } }],
    }
  },
}

export const saveDraft = createAction<SaveDraftInput, SaveDraftResult>(saveDraftConfig)

/** Read path used when `?draft=<uuid>` or booking number is opened or refreshed. RLS is authoritative. */
export async function fetchRentalDraft(id: string): Promise<RentalDraftRecord> {
  const rawId = id.trim()
  let query = supabase
    .from('rental_drafts')
    .select('id, client_uuid, booking_client_uuid, branch_id, data, status, converted_booking_id, updated_at')
  if (UUID_RE.test(rawId)) {
    query = query.eq('id', rawId)
  } else {
    query = query.eq('data->>bookingNo', rawId)
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`the draft could not be loaded (${error.message})`)
  if (!data) throw new Error('the draft was not found or your role cannot read it')
  return toRecord(data as unknown as DraftDbRow)
}

/** Lists active drafts for display in RentalsList. */
export async function listActiveDrafts(branchId?: string): Promise<RentalDraftRecord[]> {
  let query = supabase
    .from('rental_drafts')
    .select('id, client_uuid, booking_client_uuid, branch_id, data, status, converted_booking_id, updated_at')
    .eq('status', 'Active')
    .order('updated_at', { ascending: false })
  if (branchId) {
    query = query.eq('branch_id', branchId)
  }
  const { data, error } = await query
  if (error) throw new Error(`could not list rental drafts: ${error.message}`)
  return (data as unknown as DraftDbRow[] ?? []).map(toRecord)
}

export type ConvertDraftInput = { id: string; bookingId: string }

export const convertDraftConfig: ActionConfig<ConvertDraftInput, RentalDraftRecord> = {
  name: 'CONVERT_RENTAL_DRAFT',
  permissions: ['rental.create'],
  implemented: true,
  validate: (input) => {
    if (!UUID_RE.test(input.id)) throw new Error('Draft ID must be a UUID.')
    if (!UUID_RE.test(input.bookingId)) throw new Error('Booking ID must be a UUID.')
  },
  execute: async (input, ctx) => {
    const draft = await fetchRentalDraft(input.id)
    if (draft.status === 'Converted' && draft.convertedBookingId === input.bookingId) {
      return { result: draft, events: [] }
    }
    if (draft.status !== 'Active') throw new Error('the draft is no longer active')

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, client_uuid, stage')
      .eq('id', input.bookingId)
      .maybeSingle()
    if (bookingError) throw new Error(`the confirmed booking could not be checked (${bookingError.message})`)
    if (!booking || booking.stage !== 'Booked') {
      throw new Error('the draft can only be converted after its booking reaches Booked')
    }
    if (booking.client_uuid !== draft.bookingClientUuid) {
      throw new Error('the booking was not created from this draft; the draft was left active')
    }

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('rental_drafts')
      .update({ status: 'Converted', converted_booking_id: input.bookingId, updated_at: now, updated_by: ctx.userId })
      .eq('id', input.id)
      .eq('status', 'Active')
      .select('id, client_uuid, booking_client_uuid, branch_id, data, status, converted_booking_id, updated_at')
      .maybeSingle()
    if (error) throw new Error(`the draft-to-booking link failed (${error.message})`)
    if (!data) throw new Error('the draft was not active, so it was not linked to this booking')
    return { result: toRecord(data as unknown as DraftDbRow), events: [] }
  },
}

export const convertDraft = createAction<ConvertDraftInput, RentalDraftRecord>(convertDraftConfig)

export const cancelDraftConfig: ActionConfig<{ id: string; reason: string }, { success: true }> = {
  name: 'CANCEL_RENTAL_DRAFT',
  permissions: ['rental.cancel'],
  implemented: true,
  validate: ({ id, reason }) => {
    if (!UUID_RE.test(id)) throw new Error('Draft ID must be a UUID.')
    if (!reason.trim()) throw new Error('A cancellation reason is required.')
  },
  execute: async ({ id, reason }, ctx) => {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('rental_drafts')
      .update({ status: 'Cancelled', cancelled_at: now, cancelled_by: ctx.userId, cancellation_reason: reason.trim(), updated_at: now, updated_by: ctx.userId })
      .eq('id', id)
      .eq('status', 'Active')
      .select('id')
      .maybeSingle()
    if (error) throw new Error(`the draft could not be cancelled (${error.message})`)
    if (!data) throw new Error('the draft was not found or is no longer active')
    return { result: { success: true }, events: [] }
  },
}

export const cancelDraft = createAction(cancelDraftConfig)
