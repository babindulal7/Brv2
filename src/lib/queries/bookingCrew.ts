import { supabase } from '../supabase'

export interface AssignableCrew {
  id: string
  name: string
  role: string
  dailyRate: number | null
}
export interface BookingCrewRow {
  id: string
  crewId: string
  name: string | null
  role: string
  callTime: string | null
  wrapTime: string | null
  days: number
  dailyRate: number | null
  lineTotal: number | null
}

/** Reads only the roster used by bookCrew; never substitutes demo people. */
export async function listAssignableCrew(): Promise<AssignableCrew[]> {
  const { data, error } = await supabase.from('crew_profiles_v2_v')
    .select('id, full_name, primary_role, daily_rate').eq('is_active', true).order('full_name')
  if (error) throw new Error(`Could not load crew roster: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id!, name: r.full_name!, role: r.primary_role!,
    dailyRate: r.daily_rate === null ? null : Number(r.daily_rate),
  }))
}

/** Money fields are not even requested by sessions without crew-pay visibility. */
export async function listBookingCrew(bookingId: string, includeMoney = false): Promise<BookingCrewRow[]> {
  if (!bookingId) throw new Error('A booking is required to load crew.')
  const columns = 'id, crew_id, role_on_shoot, call_time, wrap_time, days'
  const { data, error } = await supabase.from('crew_assignments_v')
    .select(includeMoney ? `${columns}, daily_rate, line_total` : columns)
    .eq('booking_id', bookingId).order('call_time')
  if (error) throw new Error(`Could not load booking crew: ${error.message}`)
  type Row = { id: string; crew_id: string; role_on_shoot: string; call_time: string | null; wrap_time: string | null; days: number; daily_rate?: number | null; line_total?: number | null }
  const rows = (data ?? []) as unknown as Row[]
  if (!rows.length) return []
  const { data: people, error: peopleError } = await supabase.from('crew_profiles_v2_v')
    .select('id, full_name').in('id', [...new Set(rows.map((r) => r.crew_id))])
  if (peopleError) throw new Error(`Could not load crew names: ${peopleError.message}`)
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]))
  return rows.map((r) => ({
    id: r.id, crewId: r.crew_id, name: names.get(r.crew_id) ?? null,
    role: r.role_on_shoot, callTime: r.call_time, wrapTime: r.wrap_time, days: r.days,
    dailyRate: includeMoney && r.daily_rate != null ? Number(r.daily_rate) : null,
    lineTotal: includeMoney && r.line_total != null ? Number(r.line_total) : null,
  }))
}
