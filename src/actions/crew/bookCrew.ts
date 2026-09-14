import { createAction, type ActionContext, type ActionConfig } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase, newClientUuid } from '../../lib/supabase'
import { rentalDaysBetween } from '../../lib/rentalDays'
import { canAssignPricedCrew } from '../../lib/crewAssignment'

export type BookCrewInput = {
  bookingId?: string
  crewIds: string[]
  role?: string
  callTime?: string
  wrapTime?: string
  dailyRate?: number
  days?: number
  notes?: string
  clientUuid?: string
}
export type BookCrewResult = { success: boolean; count: number; assignmentIds: string[] }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validate(input: BookCrewInput) {
  if (!Array.isArray(input.crewIds) || !input.crewIds.length || input.crewIds.some((id) => typeof id !== 'string' || !id.trim())) throw new Error('At least one crew ID must be selected.')
  if (input.days !== undefined && (!Number.isInteger(input.days) || input.days < 1)) throw new Error('Days must be a positive integer greater than or equal to 1.')
  if (input.dailyRate !== undefined && (!Number.isFinite(input.dailyRate) || input.dailyRate < 0)) throw new Error('Daily rate must be a non-negative number.')
  if (!input.bookingId?.trim()) throw new Error('A target booking is required to assign crew.')
  if (new Set(input.crewIds.map((id) => id.trim())).size !== input.crewIds.length) throw new Error('Choose each crew member only once.')
  if (input.clientUuid !== undefined && !UUID.test(input.clientUuid)) throw new Error('A valid assignment request UUID is required.')
}

async function assignmentKey(root: string, crewId: string, single: boolean) {
  if (single) return root
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${root}:${crewId}`)))
  digest[6] = (digest[6]! & 15) | 80
  digest[8] = (digest[8]! & 63) | 128
  const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const bookCrewConfig: ActionConfig<BookCrewInput, BookCrewResult> = {
  name: 'BOOK_CREW', permissions: ['crew.assign'], implemented: true, validate,
  execute: async (input, ctx: ActionContext) => {
    validate(input)
    // UI is a subset of the existing staff RLS policy; priced assignments need
    // crew-pay access until a server-side rate-default action exists for the desk.
    if (!canAssignPricedCrew(ctx.role)) throw new Error('Priced crew assignments require an Owner, Admin, or Manager.')
    const rawBooking = input.bookingId!.trim()
    const { data: booking, error: bookingError } = await supabase.from('bookings')
      .select('id, booking_no, pickup_at, return_at, stage, cancelled_at, closed_at')
      .eq(UUID.test(rawBooking) ? 'id' : 'booking_no', rawBooking).maybeSingle()
    if (bookingError) throw new Error(`Could not load booking: ${bookingError.message}`)
    if (!booking) throw new Error(`Booking "${rawBooking}" not found.`)
    if (booking.cancelled_at || booking.closed_at || booking.stage === 'Closed') throw new Error('Crew cannot be assigned to a cancelled or closed booking.')
    const callTime = input.callTime || booking.pickup_at
    const wrapTime = input.wrapTime || booking.return_at
    if (!Number.isFinite(Date.parse(callTime)) || !Number.isFinite(Date.parse(wrapTime)) || Date.parse(wrapTime) <= Date.parse(callTime)) throw new Error('Wrap time must be after a valid call time.')
    const days = input.days ?? rentalDaysBetween(callTime, wrapTime)
    if (days === null) throw new Error('Enter a valid number of crew days.')
    const rootKey = input.clientUuid ?? newClientUuid()
    const prepared = []
    for (const raw of input.crewIds) {
      const crewId = raw.trim()
      const { data: member, error } = await supabase.from('crew_profiles_v2_v')
        .select('id, crew_code, primary_role, full_name, daily_rate, is_active')
        .eq(UUID.test(crewId) ? 'id' : 'crew_code', crewId).maybeSingle()
      if (error) throw new Error(`Could not load crew member: ${error.message}`)
      if (!member?.id || !member.is_active) throw new Error(`Crew member "${crewId}" is unavailable or inactive.`)
      const dailyRate = input.dailyRate ?? member.daily_rate
      if (dailyRate == null || !Number.isFinite(Number(dailyRate)) || Number(dailyRate) < 0) throw new Error('An available crew rate is required.')
      const lineTotal = Math.round(Number(dailyRate) * 100) * days / 100
      if (!Number.isFinite(lineTotal)) throw new Error('Crew total is outside the supported range.')
      const clientUuid = await assignmentKey(rootKey, member.id, input.crewIds.length === 1)
      prepared.push({ client_uuid: clientUuid, booking_id: booking.id, crew_id: member.id,
        role_on_shoot: input.role?.trim() || member.primary_role!, call_time: callTime, wrap_time: wrapTime,
        daily_rate: Math.round(Number(dailyRate) * 100) / 100, days, line_total: lineTotal, notes: input.notes?.trim() || null,
        created_by: ctx.userId, updated_by: ctx.userId })
    }
    // Preflight all people before writes. Each row is idempotent so a partial
    // network failure can be retried with the same request key. Never toast a queued write.
    const assignmentIds: string[] = []
    for (const row of prepared) {
      const { data, error } = await supabase.from('crew_assignments').insert(row).select('id').single()
      if (error) {
        if (error.code !== '23505') throw new Error(`Crew assignment was not saved: ${error.message}`)
        const { data: existing, error: readError } = await supabase.from('crew_assignments_v')
          .select('id, booking_id, crew_id, role_on_shoot, call_time, wrap_time, daily_rate, days, notes').eq('client_uuid', row.client_uuid).maybeSingle()
        if (readError || !existing?.id || existing.booking_id !== row.booking_id || existing.crew_id !== row.crew_id) throw new Error('Could not confirm the saved assignment. Retry with the same details.')
        if (existing.role_on_shoot !== row.role_on_shoot || Date.parse(existing.call_time ?? '') !== Date.parse(row.call_time) || Date.parse(existing.wrap_time ?? '') !== Date.parse(row.wrap_time) || Number(existing.daily_rate) !== row.daily_rate || existing.days !== row.days || existing.notes !== row.notes) throw new Error('This request already saved different assignment details. Reload the booking before adding another assignment.')
        assignmentIds.push(existing.id)
      } else {
        if (!data?.id) throw new Error('Could not confirm the saved assignment. Retry with the same details.')
        assignmentIds.push(data.id)
      }
    }
    return { result: { success: true, count: assignmentIds.length, assignmentIds }, events: [{
      type: EVENT_TYPES.CREW_ASSIGNED,
      payload: { bookingId: booking.id, bookingNo: booking.booking_no, crewIds: prepared.map((r) => r.crew_id), crewCount: prepared.length, role: input.role, days, timestamp: new Date().toISOString(), userId: ctx.userId },
    }] }
  },
}
export const bookCrew = createAction<BookCrewInput, BookCrewResult>(bookCrewConfig)
